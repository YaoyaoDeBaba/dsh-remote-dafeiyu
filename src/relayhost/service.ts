/**
 * relayhost/service —— 在本机把**官方 DSH 远控中继**拉下来、起成子进程、等它回 ok、写配置。
 *
 * ## 这件事的形状（2026-11-24 实测，别凭印象改）
 *
 * - 官方产物：`https://github.com/dsh-remote/relay/releases/download/v0.5.4/main.js`
 *   1,064,723 字节、**ESM** ⇒ 落盘必须改名成 `.mjs`（或旁边放一份 `type:module` 的 package.json）。
 * - 起法：`node relay-0.5.4.mjs`；环境变量 `DRC_HOST_TOKEN`（必填）、`DRC_PORT`（默认 8787）、
 *   `DRC_BIND`（**默认 127.0.0.1**，本机部署要 `0.0.0.0` 才有意义）、`DRC_LOG_LEVEL`。
 * - 判活：`GET http://127.0.0.1:<port>/healthz` → `{ok:true, version, hosts, clients, protocolSelf:1, …}`。
 * - 不配 `DRC_MP_APPID`/`DRC_MP_SECRET` 时它自己的 `GET /code` 回 501（出不了小程序码），
 *   插件那条路会退回旧 `dshr:` 码 —— 这是**已知且可接受**的，别在这里"修"。
 *
 * ## 四道闸，每一道都对应一次真实的失败
 *
 * 1. **sha256 先验后落盘**：坏产物比"没装"危险——它会以"已安装"的形态长期留在盘上，
 *    每次启动都失败，而用户只看到"起不来"。所以校验不过**一个字节都不写**。
 * 2. **15 秒健康窗口**：端口被占 / 依赖缺失 / 产物不完整，症状都是"进程起了但不服务"。
 *    超时就把**自己起的那个进程**收掉再报错，绝不留一个半死的孤儿占着端口。
 * 3. **status 只读**：不下载、不起进程。它可以跑在设置页每两秒一次轮询里，
 *    任何"顺手修一下"的动作都会把轮询变成网络与进程风暴。
 * 4. **stop 只杀自己的 pid**：用户可能同时跑着别处部署的中继（或别人在另一台机器上连过来）。
 *    我们手里只有自己 spawn 出来的那个句柄，杀它以外的东西就是越权。
 *
 * ## 为什么 token 要"三级回落"而不是每次都生成
 *
 * `options.token` → 插件配置里的 `hostToken` → 现生成 32 位 hex。
 * 每次都新生一个的后果是：手机上已经配好的那台主机，重启插件之后就再也连不回来
 * （中继按 token 区分主机，换了就等于换了一台）。所以**已配过的沿用**，只在真没有时才造一个。
 *
 * ## 安装标记（`relay-0.5.4.mjs.sha256`）
 *
 * 落盘成功之后在旁边写一份 `{sha256, size}`。判断"已安装"时：标记可信（哈希与尺寸都对得上）
 * 就直接认；**标记缺失或对不上**就现算一遍文件哈希（1 MB，几毫秒）。
 * 这不是为了省那几毫秒，而是为了让"哈希对 ⇒ 跳过下载"这条判据能在**不联网**的判据里真的被验一遍
 * ——否则判据只能拿真产物来试，而判据不许联网。
 */

import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { RelayHostDeps, RelayHostLog, RelayHostService, RelayHostStatus } from './types.js'

/** 官方中继版本。产物文件名与 status.version 都读它。 */
export const RELAY_BUNDLE_VERSION = '0.5.4'

/** 官方 release 产物地址（v0.5.4 的 main.js）。 */
export const RELAY_BUNDLE_URL = 'https://github.com/dsh-remote/relay/releases/download/v0.5.4/main.js'

/**
 * 上面那个产物的 sha256（2026-11-24 实下实算，1,064,723 字节）。
 *
 * 写死它是刻意的：这条链接指向的 GitHub release **不可变**，而"我们下到的到底是不是官方那一份"
 * 是这台机器上唯一能用代码回答的问题。变了就说明中间有人换了东西（或官方重发了版本号），
 * 两种情况都该停下来让人看一眼，而不是继续把那坨字节起成进程。
 */
export const RELAY_BUNDLE_SHA256 = '84111d39e7fdcc55dd77f3c4cc92c583897b2f1a260002cd91cd8e389a8addd1'

/** 官方 v0.5.4 产物的字节数（仅用于日志与判据里说人话，不参与校验）。 */
export const RELAY_BUNDLE_BYTES = 1_064_723

/** 安装标记后缀（跟产物同目录，不在产物名里塞额外点号）。 */
export const RELAY_MARKER_SUFFIX = '.sha256'

/** 中继默认端口（它自己的默认值）。 */
export const DEFAULT_RELAY_PORT = 8787

/** 本机部署要监听 `0.0.0.0`：只听回环的话，同一局域网里的手机连不上，等于没部署。 */
export const DEFAULT_RELAY_BIND = '0.0.0.0'

/** 起进程之后最多等这么久（判据钉的就是这个数）。 */
export const RELAY_START_TIMEOUT_MS = 15_000

/** 探活间隔。 */
export const RELAY_HEALTH_POLL_MS = 500

/** `status()` 里那一次**可选**的 healthz 探测超时（超过就当"没拿到"，不许拖住轮询）。 */
export const RELAY_HEALTH_TIMEOUT_MS = 1_000

/** 中继 /healthz 里我们认得的几个字段（其余一概不转给界面）。 */
export interface RelayHealth {
  ok: boolean
  version?: string
  hosts?: number
  clients?: number
  protocolSelf?: number
}

/** spawn 出来的句柄（只用到这两个成员）。 */
interface ChildHandle {
  pid?: number
  kill(): void
}

type FetchAnswer = { ok: boolean; status: number; bytes: Uint8Array | Buffer; message?: string }

function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 把任意异常折成一句人话（**不把整段堆栈怼给用户**）。 */
function reasonText(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const text = raw.trim()
  return text === '' ? '未知原因' : text.slice(0, 200)
}

function sleep(ms: number): Promise<void> {
  // ⚠️ **不许 unref**（2026-11-24 实测踩过）：一键部署那段时间里，这个定时器是
  // "这一趟活还在飞"的唯一凭据。unref 掉之后，在一个没有别的事件源的进程里
  // （脚本、或刚起来的宿主），等健康的那几百毫秒会让事件循环直接排空 ——
  // 表现是"进程无声退出 / top-level await 永远悬着"，而不是报错。
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * 解析一次 /healthz 的回答。**解析不出来就是 undefined**（不是 `{ok:false}`）：
 * 前者是"没拿到"，后者是"中继说它不健康"，界面要显示的东西不一样。
 */
function readHealth(statusCode: number | undefined, text: string): RelayHealth | undefined {
  if (statusCode !== 200) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const record = parsed as Record<string, unknown>
  if (typeof record.ok !== 'boolean') return undefined
  return {
    ok: record.ok,
    version: stringOrUndefined(record.version),
    hosts: numberOrUndefined(record.hosts),
    clients: numberOrUndefined(record.clients),
    protocolSelf: numberOrUndefined(record.protocolSelf),
  }
}

/**
 * 只探一次 `http://127.0.0.1:<port>/healthz`。**永不抛**：超时 / 拒绝 / 坏 JSON 都是 undefined。
 *
 * 为什么固定打回环而不是 `bind`：`0.0.0.0` 只是"听哪个网卡"，本机判断活没活最短的那条路
 * 永远是回环——走局域网地址会多踩一层防火墙/多网卡选路的坑。
 */
function probeHealth(port: number, timeoutMs: number): Promise<RelayHealth | undefined> {
  return new Promise((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | undefined
    const finish = (value: RelayHealth | undefined): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(value)
    }
    const request = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path: '/healthz',
        method: 'GET',
        headers: { accept: 'application/json' },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = []
        let size = 0
        response.on('data', (chunk: Buffer) => {
          size += chunk.byteLength
          // /healthz 只有几百字节；超过 64 KB 说明对面不是中继，别把内存交给它。
          if (size <= 64 * 1024) chunks.push(chunk)
        })
        response.on('end', () => finish(readHealth(response.statusCode, Buffer.concat(chunks).toString('utf8'))))
        response.on('error', () => finish(undefined))
      },
    )
    // http.request 的 timeout 选项只负责"发 timeout 事件"，不负责销毁连接。
    // 这个定时器**不许 unref**（与 sleep 同一个理由）：在事件循环里，它是"这次探测还在飞"的凭据。
    timer = setTimeout(() => {
      try {
        request.destroy()
      } catch {
        /* 已经关了就算了 */
      }
      finish(undefined)
    }, timeoutMs)
    request.on('timeout', () => {
      try {
        request.destroy()
      } catch {
        /* 同上 */
      }
      finish(undefined)
    })
    request.on('error', () => finish(undefined))
    request.end()
  })
}

/**
 * 全局 `fetch` 的最小形状。
 *
 * 为什么不直接写 `await fetch(url)`：本仓 tsconfig 的 `lib` 只有 ES2022（没有 DOM），
 * 而 `Response` 这个名字在全局命名空间里会被别的声明抢走——直接写会得到
 * "Property 'arrayBuffer' does not exist on type 'Response'"。这里自己声明一个够用的形状，
 * 只取我们真正用到的三个成员，与运行时那个 Response 兼容。
 */
interface FetchLike {
  (url: string, init: { redirect: 'follow' }): Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
}

/** 默认下载器：真 `fetch`（Node ≥ 20 自带）。失败抛出去，由调用方折成中文。 */
async function defaultFetch(url: string): Promise<FetchAnswer> {
  // 两道断言：这道是为了让 `Response`（被别的 lib 抢了名字）不参与比较，只认我们自己那一份形状。
  const fetcher = (globalThis as unknown as { fetch?: FetchLike }).fetch
  if (typeof fetcher !== 'function') {
    throw new Error('这个 Node 运行时没有全局 fetch（要求 ≥ 20），可以手动把产物放进产物目录再点一次')
  }
  const response = await fetcher(url, { redirect: 'follow' })
  const bytes = Buffer.from(new Uint8Array(await response.arrayBuffer()))
  return { ok: response.ok, status: response.status, bytes }
}

/** 默认 spawn：`node <产物>`，stdio 全丢（中继自己的日志对用户没意义，漏进宿主 stdout 只会污染）。 */
function defaultSpawn(args: { command: string; argv: string[]; env: Record<string, string>; cwd: string }): ChildHandle {
  const child = spawn(args.command, args.argv, {
    cwd: args.cwd,
    env: args.env,
    stdio: 'ignore',
    windowsHide: true,
  })
  // spawn 失败**不会抛**，而是走 'error' 事件；没人接住它就会变成宿主级未捕获异常，
  // 把整个插件（连带远控主链路）一起带走。真正的失败由下面那个 15 秒窗口报出来（带端口）。
  child.on('error', () => {})
  try {
    // 别让宿主因为等这个子进程而退不出去。
    child.unref()
  } catch {
    /* 老 node 没有就算了 */
  }
  return {
    pid: child.pid,
    kill() {
      try {
        child.kill()
      } catch {
        /* 已经死了 / 不是我们的进程：忽略 */
      }
    },
  }
}

/** 私网 IPv4 的粗判：只用来在多个网卡里挑"最像局域网"的那个。 */
function looksPrivateIPv4(address: string): boolean {
  if (/^10\./.test(address)) return true
  if (/^192\.168\./.test(address)) return true
  const match = /^172\.(\d+)\./.exec(address)
  if (match !== null) {
    const second = Number(match[1])
    return second >= 16 && second <= 31
  }
  return false
}

/** 默认的局域网探测：没有公网/私网偏好时取第一个非内部 IPv4。 */
function detectLanAddress(): string | undefined {
  try {
    const interfaces = os.networkInterfaces()
    const candidates: string[] = []
    for (const list of Object.values(interfaces)) {
      for (const info of list ?? []) {
        if (info.internal) continue
        if (info.family !== 'IPv4') continue
        if (info.address.trim() === '') continue
        candidates.push(info.address)
      }
    }
    return candidates.find((address) => looksPrivateIPv4(address)) ?? candidates[0]
  } catch {
    return undefined
  }
}

/** 从一条 `ws://host:port` 里读端口（读不出来就是 undefined，别猜）。 */
function portFromServerUrl(serverUrl: unknown): number | undefined {
  if (typeof serverUrl !== 'string' || serverUrl.trim() === '') return undefined
  try {
    const parsed = new URL(serverUrl.trim())
    const port = Number.parseInt(parsed.port, 10)
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined
  } catch {
    return undefined
  }
}

/**
 * 造一个中继宿主。**所有副作用都从 `deps` 进出**：判据里连一张网卡都不扫、一个进程都不起。
 */
export function createRelayHost(deps: RelayHostDeps): RelayHostService {
  const log: RelayHostLog = (message, fields) => {
    try {
      deps.log?.(message, fields)
    } catch {
      // 日志口抛错不许把业务带走（这条与仓里其它域同一条纪律）。
    }
  }

  const version = (deps.bundle?.version ?? '').trim() || RELAY_BUNDLE_VERSION
  const bundleUrl = (deps.bundle?.url ?? '').trim() || RELAY_BUNDLE_URL
  const expectedSha = ((deps.bundle?.sha256 ?? '').trim() || RELAY_BUNDLE_SHA256).toLowerCase()
  const bundleFile = path.join(deps.dir, `relay-${version}.mjs`)
  const markerFile = bundleFile + RELAY_MARKER_SUFFIX

  /** 自己起的那个进程。**只有它**可以被 stop。 */
  let child: ChildHandle | undefined
  /** 正在部署（status 要能显示"正在起"）。 */
  let starting = false
  /** 本次进程用的端口；没部署过就是 undefined（那时端口从配置里读）。 */
  let activePort: number | undefined
  /** 最近一次失败的中文原因；成功那一路会清掉。 */
  let lastProblem: string | undefined
  /** 最近一次部署用的 token（判断 configured 用；重启后未知，退回配置里那一枚）。 */
  let appliedToken: string | undefined
  /** 局域网地址只探一次（用户拍过板：探一次并缓存）。 */
  let lanProbed = false
  let lanValue: string | undefined

  function readConfigOrNothing(): { serverUrl?: string; hostToken?: string } {
    try {
      const value = deps.readConfig?.()
      if (value === null || typeof value !== 'object') return {}
      return {
        serverUrl: typeof value.serverUrl === 'string' ? value.serverUrl : undefined,
        hostToken: typeof value.hostToken === 'string' ? value.hostToken : undefined,
      }
    } catch {
      // 配置读坏了也只是一句"没配过"，不许在这里抛出（设置页每两秒问一次）。
      return {}
    }
  }

  function lanAddress(): string | undefined {
    if (!lanProbed) {
      lanProbed = true
      const provider = deps.lanAddress ?? detectLanAddress
      try {
        const value = provider()
        const trimmed = typeof value === 'string' ? value.trim() : ''
        lanValue = trimmed === '' ? undefined : trimmed
      } catch {
        lanValue = undefined
      }
    }
    return lanValue
  }

  function serverUrlFor(port: number): string {
    return `ws://${lanAddress() ?? '127.0.0.1'}:${port}`
  }

  function currentPort(config: { serverUrl?: string }): number {
    return activePort ?? portFromServerUrl(config.serverUrl) ?? DEFAULT_RELAY_PORT
  }

  /** 安装标记：`{sha256, size}`。读不出来等于没有。 */
  function readMarker(): { sha256: string; size: number } | undefined {
    try {
      const parsed = JSON.parse(readFileSync(markerFile, 'utf8')) as Record<string, unknown>
      const sha = typeof parsed.sha256 === 'string' ? parsed.sha256.trim().toLowerCase() : ''
      const size = numberOrUndefined(parsed.size)
      if (sha === '' || size === undefined) return undefined
      return { sha256: sha, size }
    } catch {
      return undefined
    }
  }

  /**
   * 产物在不在、是不是**我们要的那一份**。
   *
   * 可信标记（哈希与尺寸都对得上）直接认；否则**现算**一遍文件哈希。
   * 后者才是真判据：盘上那 1 MB 可能是上次下了一半的（尺寸不对时标记也不会对，同样落到这一支）。
   */
  function bundleInstalled(): boolean {
    try {
      if (!existsSync(bundleFile)) return false
      const size = statSync(bundleFile).size
      if (size === 0) return false
      const marker = readMarker()
      if (marker !== undefined && marker.sha256 === expectedSha && marker.size === size) return true
      return sha256Hex(readFileSync(bundleFile)) === expectedSha
    } catch {
      return false
    }
  }

  function writeMarker(size: number): void {
    try {
      writeFileSync(markerFile, `${JSON.stringify({ sha256: expectedSha, size }, null, 2)}\n`, { mode: 0o600 })
    } catch (error) {
      // 标记只是加速：写不进去就下次多算一遍哈希，不许因此判"安装失败"。
      log('中继安装标记写不进去（下次会重算哈希）', { message: reasonText(error) })
    }
  }

  /** 下载 + 校验 + 落盘。**校验不过一个字节都不写**。 */
  async function ensureBundle(): Promise<{ downloaded: boolean }> {
    if (bundleInstalled()) return { downloaded: false }
    try {
      mkdirSync(deps.dir, { recursive: true })
    } catch (error) {
      throw new Error('建中继目录失败：' + reasonText(error))
    }
    const fetchFn = deps.fetchImpl ?? defaultFetch
    let answer: FetchAnswer
    try {
      answer = await fetchFn(bundleUrl)
    } catch (error) {
      throw new Error('下载官方中继失败：' + reasonText(error))
    }
    if (answer === null || typeof answer !== 'object') {
      throw new Error('下载官方中继失败：下载器没有回任何结果')
    }
    if (answer.ok !== true) {
      const extra = typeof answer.message === 'string' && answer.message.trim() !== '' ? `（${answer.message.trim()}）` : ''
      throw new Error(`下载官方中继失败：HTTP ${answer.status}${extra}（${bundleUrl}）`)
    }
    const bytes = Buffer.from(answer.bytes ?? new Uint8Array(0))
    if (bytes.length === 0) throw new Error('下载官方中继失败：拿到的产物是 0 字节')
    const actual = sha256Hex(bytes)
    if (actual !== expectedSha) {
      // ⚠️ 这里**不落盘**：坏产物留在盘上会被下一次 status 认成"已安装"，然后每次启动都失败。
      throw new Error(
        `官方中继产物校验失败：sha256 应为 ${expectedSha}，实际 ${actual}（${bytes.length} 字节），已丢弃、未落盘`,
      )
    }
    const tempFile = bundleFile + '.download'
    try {
      writeFileSync(tempFile, bytes)
      renameSync(tempFile, bundleFile)
    } catch (error) {
      try {
        rmSync(tempFile, { force: true })
      } catch {
        /* 临时文件都删不掉就没别的办法了，下面把原始原因抛回去 */
      }
      throw new Error('中继产物落盘失败：' + reasonText(error))
    }
    writeMarker(bytes.length)
    log('官方中继产物已下载并校验通过', { version, bytes: bytes.length, file: bundleFile })
    return { downloaded: true }
  }

  function resolvePort(input: number | undefined): number {
    if (input === undefined) return currentPort(readConfigOrNothing())
    if (!Number.isInteger(input) || input < 1 || input > 65535) {
      throw new Error(`端口不合法：${String(input)}（要是 1~65535 的整数）`)
    }
    return input
  }

  function resolveToken(input: string | undefined): string {
    const given = typeof input === 'string' ? input.trim() : ''
    if (given.length > 256) throw new Error('口令太长：最多 256 个字符（那是认领凭据，不是一整段文本）')
    if (given !== '') return given
    // 已配过的沿用：换了 token 等于换了"一台主机"，手机上那条配对就再也连不回来了。
    const existing = (readConfigOrNothing().hostToken ?? '').trim()
    if (existing !== '') return existing
    return randomBytes(16).toString('hex')
  }

  function buildEnv(port: number, token: string): Record<string, string> {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value
    }
    env.DRC_HOST_TOKEN = token
    env.DRC_PORT = String(port)
    // ⚠️ 中继自己默认只听 127.0.0.1：不改这一格，手机连过来连的是**手机自己的**回环。
    env.DRC_BIND = DEFAULT_RELAY_BIND
    if (env.DRC_LOG_LEVEL === undefined) env.DRC_LOG_LEVEL = 'warn'
    return env
  }

  /** 收掉**自己起的**那个进程。返回它的 pid（没有就是 undefined）。 */
  function killOwned(reason: string): number | undefined {
    const current = child
    if (current === undefined) return undefined
    child = undefined
    try {
      current.kill()
    } catch (error) {
      log('结束中继进程时抛错（已当作结束）', { message: reasonText(error) })
    }
    log('本机中继进程已结束', { pid: current.pid, reason })
    return current.pid
  }

  /** 等 /healthz 说 ok，最多 `budgetMs`。第一枪立刻打（中继常常 200ms 内就活了）。 */
  async function waitHealthy(port: number, budgetMs: number): Promise<RelayHealth | undefined> {
    const start = Date.now()
    for (;;) {
      const left = budgetMs - (Date.now() - start)
      if (left <= 0) return undefined
      const timeout = Math.max(200, Math.min(RELAY_HEALTH_TIMEOUT_MS, left))
      const health = await probeHealth(port, timeout)
      if (health?.ok === true) return health
      const rest = budgetMs - (Date.now() - start)
      if (rest <= 0) return undefined
      await sleep(Math.min(RELAY_HEALTH_POLL_MS, rest))
    }
  }

  async function statusOf(): Promise<RelayHostStatus> {
    const installed = bundleInstalled()
    const config = readConfigOrNothing()
    const port = currentPort(config)
    const serverUrl = serverUrlFor(port)
    const configuredToken = appliedToken ?? (config.hostToken ?? '').trim()
    const configured =
      configuredToken !== '' &&
      (config.serverUrl ?? '') === serverUrl &&
      (appliedToken === undefined || (config.hostToken ?? '') === appliedToken)
    const base = {
      bundlePath: installed ? bundleFile : undefined,
      version: installed ? version : undefined,
      port,
      bind: DEFAULT_RELAY_BIND,
      serverUrl,
      configured,
    }

    if (starting) return { state: 'starting', ...base, problem: lastProblem }

    if (child !== undefined) {
      // 运行中才探一次，超时 1 秒：这条要能被设置页每两秒轮询一次而**不拖慢**它。
      const health = await probeHealth(port, RELAY_HEALTH_TIMEOUT_MS)
      const pid = child.pid
      if (health?.ok === true) return { state: 'running', ...base, health, pid }
      return {
        state: 'failed',
        ...base,
        health,
        pid,
        problem: lastProblem ?? `中继进程在跑，但 http://127.0.0.1:${port}/healthz 没回 ok（端口被占或进程刚崩）`,
      }
    }

    // 没有自己的进程：只看盘 + 上一次的失败原因。**不许下载、不许起进程**。
    if (lastProblem !== undefined) {
      // 产物都没有、但原因在：显示 failed 比显示 not-installed 有用得多
      // （"为什么没装上"是用户唯一想知道的那句话）。
      return { state: 'failed', ...base, problem: lastProblem }
    }
    if (!installed) return { state: 'not-installed', ...base }
    return { state: 'stopped', ...base }
  }

  async function deploy(options: { port?: number; token?: string } = {}): Promise<RelayHostStatus> {
    if (starting) throw new Error('一键部署正在跑，等这一轮结束再点')
    // 入参先验：这两条与磁盘/网络无关，错了就不该开始动。
    const targetPort = resolvePort(options.port)
    const token = resolveToken(options.token)

    starting = true
    try {
      const bundle = await ensureBundle()
      // 重新部署 = 换一个新的（旧的那个先收掉，否则端口一定打架）。
      killOwned('重新部署')
      activePort = targetPort
      const spawnFn = deps.spawnImpl ?? defaultSpawn
      let spawned: ChildHandle
      try {
        spawned = spawnFn({ command: process.execPath, argv: [bundleFile], env: buildEnv(targetPort, token), cwd: deps.dir })
      } catch (error) {
        throw new Error('起中继进程失败：' + reasonText(error))
      }
      child = spawned
      log('本机中继进程已起，等 /healthz', { port: targetPort, pid: spawned.pid, downloaded: bundle.downloaded })

      const health = await waitHealthy(targetPort, RELAY_START_TIMEOUT_MS)
      if (health === undefined || health.ok !== true) {
        killOwned('健康检查没通过')
        lastProblem = `中继启动超时：${RELAY_START_TIMEOUT_MS / 1000} 秒内 http://127.0.0.1:${targetPort}/healthz 没有回 ok，已结束该进程（端口 ${targetPort} 可能被占用）`
        throw new Error(lastProblem)
      }

      appliedToken = token
      lastProblem = undefined
      const serverUrl = serverUrlFor(targetPort)
      if (deps.writeConfig !== undefined) {
        try {
          deps.writeConfig({ serverUrl, hostToken: token })
        } catch (error) {
          lastProblem = '中继已经起来了，但写配置失败：' + reasonText(error)
          throw new Error(lastProblem)
        }
      }
      log('本机中继已部署', { port: targetPort, serverUrl, pid: spawned.pid, configured: deps.writeConfig !== undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : reasonText(error)
      // 最近一次失败的中文原因：status 靠它把"为什么没成"说出来。
      lastProblem = message
      starting = false
      // 失败也要留一行日志：宿主的 stdout 是这条路线上唯一的现场（用户只会贴那一句红字）。
      // ⚠️ 只带端口与原因，**不带 token**（它是认领凭据）。
      log('本机中继部署失败', { port: targetPort, message })
      throw error instanceof Error ? error : new Error(message)
    }
    starting = false
    return statusOf()
  }

  async function stop(): Promise<RelayHostStatus> {
    // 只杀自己起的那个 pid：别人的中继（或别人电脑上的）不归这里管。
    const killed = killOwned('用户点了停止')
    lastProblem = undefined
    if (killed === undefined) log('本机中继没有在跑（或不是本插件起的），停止请求按已停止处理')
    return statusOf()
  }

  function dispose(): void {
    // 插件停机时调：**只放掉句柄，不 kill**。
    // 理由：这个进程可能是用户手动起的、或上一次插件实例留下的；宿主退出时把整台机器上别处
    // 还在用的中继一起杀掉，是把"插件卸载"变成"远控断线"的那种事故。
    child = undefined
  }

  return { status: statusOf, deploy, stop, dispose }
}
