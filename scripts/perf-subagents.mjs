/**
 * perf-subagents —— 只读压测：「派活助手 / 子代理监视器」这条链路到底吃了宿主多少 CPU。
 *
 * 为什么要单开一个脚本：面板卡顿时怀疑对象一直是 subagents 这条链路，但光读代码分不清
 * 到底是"列表路由本身慢"还是"SSE 推得太勤"。所以拆成两半分别量，最后乘起来给一个能
 * 直接拿去对账的数：
 *
 *     estimated host cost = 推送帧数/秒 × 单次列表耗时 = X ms/s
 *
 * 意思：如果客户端每条推送都跟着读一次列表，宿主每秒要在这条链路上花掉多少毫秒。
 *
 *   node scripts/perf-subagents.mjs
 *   node scripts/perf-subagents.mjs --base http://127.0.0.1:56273 --session <sessionId> --n 50 --seconds 60
 *   node scripts/perf-subagents.mjs --help
 *
 * 测的两条路由（都是 GET 只读）：
 *   - GET /api/dsh-remote-dafeiyu/subagents?includeArchived=1&sessionId=<id>  → JSON {ok, items, config}
 *   - GET /api/dsh-remote-dafeiyu/subagents/stream                            → SSE（帧体 `data: <payload>`）
 *
 * 本脚本只读，不改宿主状态：
 *   - 只发 GET，绝不碰 /subagents/archive、/subagents/config 这些写路由；
 *   - 不带 x-drc-pair 头，不做任何归档/配置写入；
 *   - 不落盘、不装依赖，SSE 订阅窗口结束就主动断开（宿主那边会随 close 回收）。
 *
 * 退出码 0 = PASS（两段都拿到数据）；1 = FAIL（有失败，原因已打印）。
 */
import http from 'node:http'
import https from 'node:https'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'

/** 每个请求的超时（含 SSE 的首字节），超了明确报错，不挂死。 */
const TIMEOUT_MS = 10_000
const LIST_PATH = '/api/dsh-remote-dafeiyu/subagents'
const STREAM_PATH = '/api/dsh-remote-dafeiyu/subagents/stream'

const HELP = `用法：node scripts/perf-subagents.mjs [选项]

只读压测「派活助手」的列表路由与 SSE 推送通道，打印耗时分位与宿主开销估算。
脚本只发 GET，不改宿主状态。

选项：
  --base <url>       宿主地址，默认 http://127.0.0.1:56273
  --session <id>     sessionId（面板里正在看的那个会话 id）。
                     不给时先用空串试一次：宿主会回 400「缺少 sessionId」，
                     此时跳过列表测试、只做 SSE 测试。
  --n <次数>         列表路由连续调用次数，默认 50（用来算 min/mean/p50/p95/max）
  --seconds <秒>     SSE 监听窗口，默认 60（统计消息帧数与帧频）
  --help, -h         打印这段说明

输出：分三段（列表耗时 / SSE 帧统计 / 组合结论），最后一行是 PASS 或 FAIL。`

/** 极简参数解析：支持 `--k v` 与 `--k=v` 两种写法，都缺省时落到 DEFAULTS。 */
function parseArgs(argv) {
  const raw = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') return { help: true }
    if (!token.startsWith('--')) throw new Error(`多余的参数：${token}（用 --help 看用法）`)
    const eq = token.indexOf('=')
    if (eq !== -1) {
      raw.set(token.slice(2, eq), token.slice(eq + 1))
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} 缺少值（用 --help 看用法）`)
    raw.set(token.slice(2), value)
    index += 1
  }
  for (const key of raw.keys()) {
    if (!['base', 'session', 'n', 'seconds'].includes(key)) throw new Error(`未知选项：--${key}（用 --help 看用法）`)
  }
  const n = Number(raw.get('n') ?? 50)
  const seconds = Number(raw.get('seconds') ?? 60)
  if (!Number.isInteger(n) || n < 1) throw new Error(`--n 要是 >=1 的整数，收到：${raw.get('n')}`)
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`--seconds 要是 >0 的数，收到：${raw.get('seconds')}`)
  const base = String(raw.get('base') ?? 'http://127.0.0.1:56273').replace(/\/+$/, '')
  if (!/^https?:\/\//.test(base)) throw new Error(`--base 要以 http:// 或 https:// 开头，收到：${base}`)
  return { help: false, base, session: String(raw.get('session') ?? '').trim(), n, seconds }
}

const elapsedMs = (startedAt) => Number(process.hrtime.bigint() - startedAt) / 1e6
const fix1 = (value) => (Number.isFinite(value) ? value.toFixed(1) : '-')
const oneLine = (text, limit) => String(text).replace(/\s+/g, ' ').slice(0, limit)

function targetOf(base, path) {
  const url = new URL(base + path)
  return {
    client: url.protocol === 'https:' ? https : http,
    options: {
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port === '' ? undefined : Number(url.port),
      path: url.pathname + url.search,
      method: 'GET',
    },
    href: url.href,
  }
}

/**
 * GET 一次，把整段响应读完再回（耗时要含序列化 + 传输，不只是首字节）。
 * 非 2xx 不抛错，交给调用方打印状态码和响应体前缀；网络错/超时才 reject。
 */
function fetchText(base, path, headers = {}) {
  const { client, options, href } = targetOf(base, path)
  return new Promise((resolve, reject) => {
    const startedAt = process.hrtime.bigint()
    let settled = false
    const settle = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }
    const request = client.request({ ...options, headers: { accept: 'application/json', ...headers } }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        settle(resolve, {
          status: response.statusCode ?? 0,
          text: Buffer.concat(chunks).toString('utf8'),
          ms: elapsedMs(startedAt),
          href,
        })
      })
      response.on('error', (error) => settle(reject, new Error(`读取响应失败（${href}）：${error.message}`)))
    })
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy()
      settle(reject, new Error(`请求超时（${TIMEOUT_MS}ms）：${href}`))
    })
    request.on('error', (error) => {
      const hint = error.code === 'ECONNREFUSED' ? '宿主没开或端口不对' : error.code === 'ECONNRESET' ? '连接被重置' : error.message
      settle(reject, new Error(`连不上（${href}）：${hint}`))
    })
    request.end()
  })
}

function percentile(sorted, p) {
  if (sorted.length === 0) return Number.NaN
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

/**
 * 连上 SSE 听 `seconds` 秒，把帧按 payload 收好。
 * 只把 `data:` 块算消息帧；`: hb` 心跳注释和 `retry:` 单独计数，不算帧——不然帧频会被心跳灌水。
 */
function collectStream(base, seconds) {
  const { client, options, href } = targetOf(base, STREAM_PATH)
  return new Promise((resolve) => {
    const payloads = []
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    let heartbeats = 0
    let retryBlocks = 0
    let bytes = 0
    let firstFrameMs = Number.NaN
    let status = 0
    let failure = ''
    const startedAt = process.hrtime.bigint()
    let settled = false

    const handleBlock = (block) => {
      const dataLines = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith(':')) {
          if (/\bhb\b/.test(line)) heartbeats += 1
          continue
        }
        if (line.trim() === '') continue
        if (line.startsWith('retry:')) {
          retryBlocks += 1
          continue
        }
        if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }
      if (dataLines.length === 0) return
      if (!Number.isFinite(firstFrameMs)) firstFrameMs = elapsedMs(startedAt)
      payloads.push(dataLines.join('\n'))
    }

    const drain = () => {
      for (;;) {
        const match = /\r?\n\r?\n/.exec(buffer)
        if (match === null) return
        const block = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        handleBlock(block)
      }
    }

    const finish = (reason) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      request.destroy()
      resolve({
        payloads,
        heartbeats,
        retryBlocks,
        bytes,
        status,
        href,
        failure: failure === '' ? reason : failure,
        windowMs: elapsedMs(startedAt),
        firstFrameMs,
      })
    }

    const request = client.request({ ...options, headers: { accept: 'text/event-stream' } }, (response) => {
      status = response.statusCode ?? 0
      if (status !== 200) {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          failure = `SSE 路由回了 HTTP ${status}，响应体前 200 字符：${oneLine(Buffer.concat(chunks).toString('utf8'), 200)}`
          finish('')
        })
        response.on('error', () => {
          failure = `SSE 非 200 且读不到响应体（HTTP ${status}）`
          finish('')
        })
        return
      }
      // 流式通道：首字节到了就把 socket 空闲超时撤掉，否则 hb 间隔（25s）会被误判成超时。
      request.setTimeout(0)
      response.on('data', (chunk) => {
        bytes += chunk.byteLength
        buffer += decoder.write(chunk)
        drain()
      })
      response.on('end', () => finish('SSE 连接被宿主提前关闭'))
      response.on('error', (error) => {
        failure = `SSE 响应出错：${error.message}`
        finish('')
      })
    })

    const timer = setTimeout(() => finish(''), Math.round(seconds * 1000))
    request.setTimeout(TIMEOUT_MS, () => {
      failure = `SSE 首字节超时（${TIMEOUT_MS}ms 没响应）：${href}`
      finish('')
    })
    request.on('error', (error) => {
      const hint =
        error.code === 'ECONNREFUSED' ? '宿主没开或端口不对' : error.code === 'ECONNRESET' ? '连接被重置' : error.message
      failure = `SSE 连不上（${href}）：${hint}`
      finish('')
    })
    request.end()
  })
}

function printTopPrefixes(payloads) {
  const counts = new Map()
  for (const payload of payloads) {
    const key = oneLine(payload, 120)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  for (const [key, count] of top) console.log(`       ${String(count).padStart(4)}× | ${key}`)
}

async function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`FAIL 参数错误：${error.message}`)
    process.exitCode = 1
    return
  }
  if (args.help) {
    console.log(HELP)
    return
  }

  const failures = []
  console.log('== perf-subagents 只读压测 ==')
  console.log(`  宿主：${args.base}`)
  console.log(`  sessionId：${args.session === '' ? '（未提供）' : args.session}`)
  console.log(`  单请求超时：${TIMEOUT_MS}ms`)
  console.log('')

  // —— 1. 列表耗时 ——
  let listStats = null
  let itemsCount = Number.NaN
  let listAborted = false
  const listPath = (sessionId) => `${LIST_PATH}?includeArchived=1&sessionId=${encodeURIComponent(sessionId)}`

  console.log(`[1/3] 列表路由 GET ${LIST_PATH}?includeArchived=1`)
  const samples = []
  if (args.session === '') {
    // 没给 sessionId：先按空串试一次。宿主对这种请求是明确的 400「缺少 sessionId」，
    // 正好当作"能不能测列表"的判据；拿不到就只做 SSE，别假装成功。
    let probe = null
    let skipDetail = ''
    try {
      probe = await fetchText(args.base, listPath(''))
    } catch (error) {
      skipDetail = `空串试探也失败：${error.message}`
    }
    if (probe !== null && probe.status >= 200 && probe.status < 300) {
      samples.push(probe.ms)
      try {
        const parsed = JSON.parse(probe.text)
        if (Array.isArray(parsed.items)) itemsCount = parsed.items.length
      } catch {
        /* 非 JSON 就别硬解，下面循环还会再取一次 */
      }
    } else {
      if (probe !== null && skipDetail === '') {
        skipDetail = `空串试探回了 HTTP ${probe.status}：${oneLine(probe.text, 120)}`
      }
      console.log(`  跳过：没有 sessionId（${skipDetail}；用 --session <id> 才能测列表）`)
    }
  }

  if (args.session !== '' || samples.length > 0) {
    while (samples.length < args.n) {
      const attempt = samples.length + 1
      try {
        const answer = await fetchText(args.base, listPath(args.session))
        if (answer.status < 200 || answer.status >= 300) {
          console.log(
            `  FAIL 第 ${attempt} 次调用返回 HTTP ${answer.status}，响应体前 200 字符：${oneLine(answer.text, 200)}`,
          )
          failures.push(`列表路由不可用（HTTP ${answer.status}）`)
          listAborted = true
          break
        }
        let parsed = null
        try {
          parsed = JSON.parse(answer.text)
        } catch {
          console.log(`  FAIL 第 ${attempt} 次调用不是合法 JSON，响应体前 200 字符：${oneLine(answer.text, 200)}`)
          failures.push('列表路由返回的不是 JSON')
          listAborted = true
          break
        }
        if (parsed.ok !== true || !Array.isArray(parsed.items)) {
          console.log(`  FAIL 第 ${attempt} 次调用结构不对（ok=${String(parsed.ok)}），响应体前 200 字符：${oneLine(answer.text, 200)}`)
          failures.push('列表路由返回结构不符合 {ok:true, items:[]}')
          listAborted = true
          break
        }
        samples.push(answer.ms)
        itemsCount = parsed.items.length
      } catch (error) {
        console.log(`  FAIL 第 ${attempt} 次调用出错：${error.message}`)
        failures.push(`列表路由请求失败：${error.message}`)
        listAborted = true
        break
      }
    }
  }

  if (!listAborted && samples.length > 0) {
    const sorted = [...samples].sort((a, b) => a - b)
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
    listStats = {
      calls: samples.length,
      min: sorted[0],
      mean,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
    }
    console.log(`  调用次数：${listStats.calls}`)
    console.log(`  items：${itemsCount} 条（最近一次响应）`)
    console.log(
      `  耗时：min ${fix1(listStats.min)} / mean ${fix1(listStats.mean)} / p50 ${fix1(listStats.p50)} / p95 ${fix1(
        listStats.p95,
      )} / max ${fix1(listStats.max)} ms`,
    )
  }
  console.log('')

  // —— 2. SSE 帧统计 ——
  console.log(`[2/3] SSE 推送通道 GET ${STREAM_PATH}`)
  console.log(`  监听窗口：${args.seconds}s`)
  let stream = null
  if (!listAborted) {
    stream = await collectStream(args.base, args.seconds)
    if (stream.failure !== '') {
      console.log(`  FAIL ${stream.failure}`)
      failures.push(`SSE 通道不可用：${stream.failure}`)
    } else {
      const distinct = new Set(stream.payloads).size
      const framesPerSecond = stream.payloads.length / (stream.windowMs / 1000)
      console.log(`  消息帧：${stream.payloads.length} 条（${framesPerSecond.toFixed(2)} 帧/秒）`)
      console.log(`  不同 payload：${distinct} 种`)
      console.log(`  心跳注释（: hb）：${stream.heartbeats} 条；retry 块：${stream.retryBlocks} 个`)
      console.log(`  首帧到达：${Number.isFinite(stream.firstFrameMs) ? `${fix1(stream.firstFrameMs)} ms` : '窗口内没有消息帧'}`)
      console.log(`  收到字节：${stream.bytes} B`)
      if (stream.payloads.length > 0) {
        console.log('  帧体前 120 字符 Top 5：')
        printTopPrefixes(stream.payloads)
      }
    }
  } else {
    console.log('  未执行（列表测试已 FAIL，先修列表再量推送）')
  }
  console.log('')

  // —— 3. 组合结论 ——
  console.log('[3/3] 组合结论')
  if (listStats === null) {
    console.log('  estimated host cost = 不可计算（没有列表耗时）')
    console.log('  原因：没有 sessionId 或列表路由失败；--session <id> 后可量出这条数')
  } else if (stream === null || stream.failure !== '') {
    console.log('  estimated host cost = 不可计算（没有 SSE 帧数据）')
  } else {
    const framesPerSecond = stream.payloads.length / (stream.windowMs / 1000)
    const costPerSecond = framesPerSecond * listStats.mean
    console.log(`  推送频率：${framesPerSecond.toFixed(2)} 帧/秒`)
    console.log(`  平均列表耗时：${fix1(listStats.mean)} ms`)
    console.log(`  估算口径：每条推送都触发一次列表读取，则宿主每秒花在这条链路上 帧数/秒 × 平均耗时`)
    console.log(`estimated host cost = ${fix1(costPerSecond)} ms/s`)
    if (costPerSecond >= 1000) console.log('  注意：已超过单核 1000ms/s，等于常驻吃满一个核')
    else if (costPerSecond >= 100) console.log('  注意：已占单核 10% 以上')
  }

  console.log('')
  console.log('== 结论 ==')
  if (failures.length === 0) {
    if (listStats === null) console.log('  SSE 正常；列表测试被跳过（没有 sessionId），宿主开销算不出来 → 不算通过')
    else console.log('  两段测试都拿到了数据')
  } else {
    for (const failure of failures) console.log(`  FAIL ${failure}`)
  }
  const passed = failures.length === 0 && listStats !== null && stream !== null && stream.failure === ''
  console.log(passed ? 'PASS' : 'FAIL')
  process.exitCode = passed ? 0 : 1
}

await main()
