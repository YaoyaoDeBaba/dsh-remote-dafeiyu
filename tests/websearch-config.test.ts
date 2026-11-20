/**
 * websearch-config.test —— 设置页「搜索」栏那一套（2026-11-20）。
 *
 * 钉四件事：
 *
 * 1. **回答里绝不出现明文**：两个 token 是用户自己的 GitHub / OpenAlex 凭据，
 *    而这两条路由是浏览器可达的——掩码只能是「已配置（…abcd）」，短 token 连尾号都不露。
 * 2. **空串 = 清除这一项**，没点名的项保持盘上的值（另一格还是空的 ≠ "请删掉它"）。
 * 3. **写配置是读-改-写**：先保存 githubToken、再保存 serverUrl，token 不许丢
 *    （同一份 user-config.json 有两个写入方，拿内存快照合并就是数据丢失）。
 * 4. **优先级**：配置文件 > 环境变量（工具侧与设置页那一行必须同一口径）。
 *
 * 全程不联网：上游一律用可注入的假 fetch，路由用假 IncomingMessage/ServerResponse。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  normalizeUserOverrides,
  readUserConfig,
  saveUserOverrides,
  writeUserConfig,
} from '../src/shell/user-config.js'
import {
  buildConfigView,
  maskSecret,
  MAX_WEBSEARCH_BODY_BYTES,
  WEBSEARCH_CONFIG_ROUTE,
  WEBSEARCH_TEST_ROUTE,
  websearchHandlers,
  type WebsearchRouteDeps,
} from '../src/websearch/routes.js'
import { buildWebsearchTools } from '../src/websearch/tools.js'
import type { FetchLike } from '../src/websearch/http.js'
import { firstLine, runProbe, WEBSEARCH_PROBE_KINDS } from '../src/websearch/probe.js'

/** 一枚长得像真 PAT 的假凭据（40 位）；**它一旦出现在回答里就是缺陷**。 */
const GITHUB_SECRET = 'ghp_fakefakefakefakefakefakefakefake1234'
const OPENALEX_SECRET = 'oa_fake_key_0123456789abcdefWXYZ'

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'drc-ws-config-'))
}

/* ── ① 归一：空串清除、trim、坏输入当场拒（中文原因） ───────────────── */

test('归一：websearch 里空串 = 删掉这一项，另一项不受影响，坏输入带中文原因', () => {
  // 空串 → 以 undefined 的形式留在返回值里（"用户要求删掉"这个意图必须能传下去）
  assert.deepEqual(normalizeUserOverrides({ websearch: { githubToken: '' } }), {
    ok: true,
    value: { websearch: { githubToken: undefined } },
  })
  // 没点名的键**不出现**在返回值里（调用方靠 in 判"动没动过"）
  assert.deepEqual(normalizeUserOverrides({ websearch: { openAlexKey: '  oa-1234  ' } }), {
    ok: true,
    value: { websearch: { openAlexKey: 'oa-1234' } },
  })
  // 数组也是 typeof 'object'：不许被当成"一个什么都没提交的 websearch"
  for (const bad of [[], null, 'ghp_x', 42]) {
    const result = normalizeUserOverrides({ websearch: bad })
    assert.equal(result.ok, false, JSON.stringify(bad) + ' 不该被接受')
    assert.equal(result.ok === false && result.field, 'websearch')
    assert.match(result.ok === false ? result.error : '', /对象/, '错误原因要说人话')
  }
  const notString = normalizeUserOverrides({ websearch: { githubToken: 42 } })
  assert.equal(notString.ok === false && notString.field, 'websearch.githubToken')
  // 整段粘贴（带换行）要拦住：这类输入拿去发请求只会 401
  const multiline = normalizeUserOverrides({ websearch: { githubToken: 'ghp_a\nghp_b' } })
  assert.equal(multiline.ok, false, '中间带换行的 token 必须拒')
  const tooLong = normalizeUserOverrides({ websearch: { openAlexKey: 'x'.repeat(513) } })
  assert.equal(tooLong.ok, false, '超过 512 字符要拒（防整段粘贴）')
})

/* ── ② 落盘：读-改-写，两个写入方互不覆盖 ─────────────────────────── */

test('落盘与读回：websearch 嵌套项写得进、读得回，手写空串读回来等于没有', () => {
  const dir = tempDir()
  try {
    const file = path.join(dir, 'user-config.json')
    assert.equal(writeUserConfig(file, { websearch: { githubToken: GITHUB_SECRET } }, 1), true)
    assert.deepEqual(readUserConfig(file), { websearch: { githubToken: GITHUB_SECRET } })
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { websearch?: Record<string, unknown> }
    assert.equal(raw.websearch?.githubToken, GITHUB_SECRET, '嵌套对象要真的落进 JSON（不是被序列化成 undefined）')

    // 手改成空串（或带空白）⇒ 读回来当"没有配置"，不许以"把配置抹成空串"的形式传下去
    writeUserConfig(file, { websearch: { githubToken: '   ', openAlexKey: OPENALEX_SECRET } }, 2)
    assert.deepEqual(readUserConfig(file), { websearch: { openAlexKey: OPENALEX_SECRET } })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('读-改-写：先存 githubToken，再存 serverUrl / 另一枚 token —— 谁都不许丢', () => {
  const dir = tempDir()
  try {
    const file = path.join(dir, 'user-config.json')
    writeUserConfig(file, { serverUrl: 'wss://self.example.com', websearch: { githubToken: GITHUB_SECRET } }, 1)

    /*
     * 「进阶」栏保存（只提交 serverUrl）：**不许**把刚填的 GitHub token 盖回旧值。
     * 这一条钉的就是"拿启动时内存快照合并"那个缺陷——它会让 token 静默消失。
     */
    const first = saveUserOverrides(file, { serverUrl: 'wss://new.example.com' }, 2)
    assert.equal(first.ok, true)
    const afterFirst = readUserConfig(file)
    assert.equal(afterFirst.serverUrl, 'wss://new.example.com', '地址要换掉')
    assert.equal(afterFirst.websearch?.githubToken, GITHUB_SECRET, '另一条路由刚写的 token 不许被盖掉')

    // 「搜索」栏保存（只提交 openAlexKey）：地址与 GitHub token 都还在
    const second = saveUserOverrides(file, { websearch: { openAlexKey: OPENALEX_SECRET } }, 3)
    assert.equal(second.ok, true)
    assert.deepEqual(readUserConfig(file), {
      serverUrl: 'wss://new.example.com',
      websearch: { githubToken: GITHUB_SECRET, openAlexKey: OPENALEX_SECRET },
    })

    /*
     * 清空其中一枚（归一后的形态：{ githubToken: undefined }）：
     * 只删它自己，另一枚与地址照旧。
     */
    const normalized = normalizeUserOverrides({ websearch: { githubToken: '' } })
    assert.equal(normalized.ok, true)
    const patch = normalized.ok ? (normalized.value.websearch ?? {}) : {}
    const third = saveUserOverrides(file, { websearch: patch }, 4)
    assert.equal(third.ok, true)
    assert.deepEqual(readUserConfig(file), {
      serverUrl: 'wss://new.example.com',
      websearch: { openAlexKey: OPENALEX_SECRET },
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ③ 掩码与来源：绝不明文 ───────────────────────────────────────── */

test('掩码：只露尾 4 位，短 token 连尾号都不露，没配是空串', () => {
  assert.equal(maskSecret(''), '')
  assert.equal(maskSecret(undefined), '')
  assert.equal(maskSecret('   '), '')
  assert.equal(maskSecret(GITHUB_SECRET), '已配置（…1234）')
  assert.ok(!maskSecret(GITHUB_SECRET).includes('ghp_'), '掩码里不许出现前缀（那也是凭据的一部分）')
  // 短 token 露尾 4 位等于露掉一半：一律"已隐藏"
  assert.equal(maskSecret('abc123'), '已配置（已隐藏）')
  assert.equal(maskSecret('12345678901'), '已配置（已隐藏）')
})

test('配置视图：配置文件压过环境变量，来源说清楚，JSON 里没有明文', () => {
  const fromConfig = buildConfigView(
    { githubToken: GITHUB_SECRET, openAlexKey: '' },
    { githubToken: 'ghp_from_env_should_lose_0000', openAlexKey: OPENALEX_SECRET },
  )
  assert.equal(fromConfig.githubTokenSet, true)
  assert.equal(fromConfig.githubTokenSource, 'config', '配置文件 > 环境变量（与工具侧同一口径）')
  assert.equal(fromConfig.openAlexKeySource, 'env', '配置文件那一格空着才回退环境变量')
  assert.equal(fromConfig.openAlexKeySet, true)
  const serialized = JSON.stringify(fromConfig)
  assert.ok(!serialized.includes(GITHUB_SECRET), '视图里不许出现 GitHub token 明文')
  assert.ok(!serialized.includes(OPENALEX_SECRET), '视图里不许出现 OpenAlex key 明文')
  assert.ok(!serialized.includes('ghp_from_env'), '环境变量那一枚同样不许回明文')

  const bare = buildConfigView({}, {})
  assert.equal(bare.githubToken, '')
  assert.equal(bare.githubTokenSet, false)
  assert.equal(bare.githubTokenSource, 'none')
})

/* ── ④ 工具侧优先级：注入 > 配置文件 > 环境变量 ───────────────────── */

interface Stub {
  impl: FetchLike
  urls: string[]
  headers: Array<Record<string, string>>
}

function stubFetch(body: string, status = 200): Stub {
  const urls: string[] = []
  const headers: Array<Record<string, string>> = []
  const impl: FetchLike = async (url: string, init: { headers: Record<string, string> }) => {
    urls.push(url)
    headers.push({ ...init.headers })
    return {
      ok: status >= 200 && status < 300,
      status,
      url,
      headers: {
        forEach: (callback: (value: string, key: string) => void) => callback('0', 'x-ratelimit-remaining'),
      },
      text: async () => body,
    }
  }
  return { impl, urls, headers }
}

const GITHUB_JSON = JSON.stringify({
  items: [
    {
      full_name: 'deepseek-ai/DeepSeek-V3',
      stargazers_count: 1000,
      forks_count: 10,
      language: 'Python',
      pushed_at: '2026-01-01T00:00:00Z',
      description: 'x',
      html_url: 'https://github.com/deepseek-ai/DeepSeek-V3',
    },
  ],
})

type AnyTool = Record<string, any>

function toolsWith(
  fetchImpl: FetchLike,
  readConfig: () => { githubToken?: string; openAlexKey?: string },
  explicit?: string,
): AnyTool[] {
  return buildWebsearchTools({
    guideBody: () => '# guide',
    log: () => {},
    fetchImpl,
    readConfig,
    ...(explicit === undefined ? {} : { githubToken: explicit }),
  }) as AnyTool[]
}

function findTool(tools: AnyTool[], name: string): AnyTool {
  const hit = tools.find((one) => one.name === name)
  assert.ok(hit !== undefined, '工具表里缺少 ' + name)
  return hit
}

async function withEnv<T>(values: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {}
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key]
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key] as string
  }
  try {
    return await run()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key] as string
    }
  }
}

test('工具侧优先级：配置文件 > 环境变量；显式注入仍排第一（判据用）', async () => {
  await withEnv({ GITHUB_TOKEN: 'ghp_env_loses_0000', DSH_GITHUB_TOKEN: undefined }, async () => {
    // ① 配置里有一枚 ⇒ 用它，环境变量那一枚不出现
    const configured = stubFetch(GITHUB_JSON)
    await findTool(toolsWith(configured.impl, () => ({ githubToken: GITHUB_SECRET })), 'repo_search').execute({
      query: 'deepseek',
      limit: 1,
    })
    assert.equal(configured.headers[0]?.authorization, 'Bearer ' + GITHUB_SECRET, '配置文件压过环境变量')

    // ② 配置里没有 ⇒ 回退环境变量
    const fromEnv = stubFetch(GITHUB_JSON)
    await findTool(toolsWith(fromEnv.impl, () => ({})), 'repo_search').execute({ query: 'deepseek', limit: 1 })
    assert.equal(fromEnv.headers[0]?.authorization, 'Bearer ghp_env_loses_0000', '配置空着才用环境变量')

    // ③ 显式注入（判据用）优先级最高
    const explicit = stubFetch(GITHUB_JSON)
    await findTool(toolsWith(explicit.impl, () => ({ githubToken: GITHUB_SECRET }), 'ghp_explicit_0000'), 'repo_search').execute({
      query: 'x',
      limit: 1,
    })
    assert.equal(explicit.headers[0]?.authorization, 'Bearer ghp_explicit_0000')
  })

  // OpenAlex key 同理：配置文件那一枚要出现在 URL 的 api_key 里
  const openalex = stubFetch('{"results":[]}')
  await withEnv({ OPENALEX_API_KEY: 'oa_env_loses_0000', DSH_OPENALEX_API_KEY: undefined }, async () => {
    const papers = findTool(toolsWith(openalex.impl, () => ({ openAlexKey: OPENALEX_SECRET })), 'paper_search')
    // 结果空会抛"没搜到"——这里只关心发出去的 URL
    await papers.execute({ query: 'deepseek', source: 'openalex', limit: 1 }).catch(() => undefined)
    const url = openalex.urls[0] ?? ''
    assert.match(url, /api_key=/, '配了 key 就要带上')
    assert.ok(url.includes(encodeURIComponent(OPENALEX_SECRET)), '用的是配置文件那一枚')
    assert.ok(!url.includes('oa_env_loses_0000'), '不许用环境变量那一枚')
  })
})

test('工具侧：readConfig 抛错不许把工具带下去（回退环境变量继续跑）', async () => {
  const stub = stubFetch(GITHUB_JSON)
  await withEnv({ GITHUB_TOKEN: 'ghp_env_fallback_0000', DSH_GITHUB_TOKEN: undefined }, async () => {
    const tools = toolsWith(stub.impl, () => {
      throw new Error('配置文件坏了')
    })
    const text = await findTool(tools, 'repo_search').execute({ query: 'deepseek', limit: 1 })
    assert.match(String(text), /仓库/, '配置读坏也要能搜')
    assert.equal(stub.headers[0]?.authorization, 'Bearer ghp_env_fallback_0000')
  })
})

/* ── ⑤ 路由：守卫、掩码、空串清除、测试按钮的中文错误 ─────────────── */

const LOOPBACK = { host: '127.0.0.1:19387' }

function request(method: string, headers: Record<string, string> = LOOPBACK, body?: string): IncomingMessage {
  const listeners = new Map<string, Array<(chunk?: unknown) => void>>()
  const req = {
    method,
    url: '/',
    headers,
    on: (event: string, handler: (chunk?: unknown) => void) => {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return req
    },
  } as unknown as IncomingMessage
  if (body !== undefined) {
    queueMicrotask(() => {
      for (const handler of listeners.get('data') ?? []) handler(Buffer.from(body))
      for (const handler of listeners.get('end') ?? []) handler()
    })
  }
  return req
}

function response(): { res: ServerResponse; reply: () => { status: number; body: string } } {
  let status = 0
  let body = ''
  const res = {
    writeHead: (code: number) => {
      status = code
    },
    end: (chunk?: unknown) => {
      body = typeof chunk === 'string' ? chunk : ''
    },
  } as unknown as ServerResponse
  return { res, reply: () => ({ status, body }) }
}

interface FakeDeps extends WebsearchRouteDeps {
  saved: Array<{ githubToken?: string; openAlexKey?: string }>
  probes: string[]
}

function deps(over: Partial<WebsearchRouteDeps> = {}): FakeDeps {
  const saved: Array<{ githubToken?: string; openAlexKey?: string }> = []
  const probes: string[] = []
  return {
    view: () => buildConfigView({ githubToken: GITHUB_SECRET }, { openAlexKey: OPENALEX_SECRET }),
    save: (input) => {
      saved.push(input)
      return { ok: true }
    },
    probe: async (kind) => {
      probes.push(kind)
      return { ok: true, summary: '仓库「deepseek」：1 条' }
    },
    log: () => {},
    saved,
    probes,
    ...over,
  }
}

const CONFIG_HANDLER = 0
const TEST_HANDLER = 1

type Handler = (request: IncomingMessage, response: ServerResponse) => unknown

function handlerAt(index: number, row = deps()): Handler {
  const found = websearchHandlers(row)[index]
  assert.ok(found !== undefined, '缺少第 ' + index + ' 条路由')
  return found.handler as Handler
}

test('路由路径与「搜索」栏契约一致（浏览器半请求的就是这两条）', () => {
  assert.equal(WEBSEARCH_CONFIG_ROUTE, '/api/dsh-remote-dafeiyu/websearch/config')
  assert.equal(WEBSEARCH_TEST_ROUTE, '/api/dsh-remote-dafeiyu/websearch/test')
  const paths = websearchHandlers(deps()).map((row) => row.path).sort()
  assert.deepEqual(paths, [WEBSEARCH_CONFIG_ROUTE, WEBSEARCH_TEST_ROUTE].sort())
})

test('GET：回掩码与来源，**任何字段都不许是明文**', async () => {
  const { res, reply } = response()
  await handlerAt(CONFIG_HANDLER)(request('GET'), res)
  const got = reply()
  assert.equal(got.status, 200)
  const answer = JSON.parse(got.body) as Record<string, unknown>
  assert.equal(answer.ok, true)
  assert.equal(answer.githubToken, '已配置（…1234）')
  assert.equal(answer.githubTokenSet, true)
  assert.equal(answer.githubTokenSource, 'config')
  assert.equal(answer.openAlexKeySource, 'env')
  assert.ok(!got.body.includes(GITHUB_SECRET), 'GET 回答里出现了 GitHub token 明文')
  assert.ok(!got.body.includes(OPENALEX_SECRET), 'GET 回答里出现了 OpenAlex key 明文')
})

test('POST：没带 x-drc-pair 一律 403（写路由那一档守卫）', async () => {
  for (const index of [CONFIG_HANDLER, TEST_HANDLER]) {
    const { res, reply } = response()
    await handlerAt(index)(request('POST', LOOPBACK, '{}'), res)
    assert.equal(reply().status, 403, '缺 x-drc-pair 必须拒')
  }
})

test('POST config：只提交填了的那一格；空串原样交给 save（清除非空即删）', async () => {
  const d = deps()
  const { res, reply } = response()
  await handlerAt(CONFIG_HANDLER, d)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ githubToken: GITHUB_SECRET })),
    res,
  )
  assert.equal(reply().status, 200)
  assert.deepEqual(d.saved[0], { githubToken: GITHUB_SECRET }, '只提交了 GitHub 这一格，就不许带上 openAlexKey')

  const clearing = deps()
  const { res: res2, reply: reply2 } = response()
  await handlerAt(CONFIG_HANDLER, clearing)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ githubToken: '' })),
    res2,
  )
  assert.equal(reply2().status, 200)
  assert.deepEqual(clearing.saved[0], { githubToken: '' }, '空串是"清除"这个意图，必须原样交给 save')

  // 什么都不提交 = 400（否则一颗"保存"按钮在空表单上会静默成功）
  const { res: res3, reply: reply3 } = response()
  await handlerAt(CONFIG_HANDLER)(request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({})), res3)
  assert.equal(reply3().status, 400)
  assert.match(reply3().body, /两个都没提交/)

  // 非字符串当场拒
  const { res: res4, reply: reply4 } = response()
  await handlerAt(CONFIG_HANDLER)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ githubToken: 42 })),
    res4,
  )
  assert.equal(reply4().status, 400)
  assert.match(reply4().body, /必须是字符串/)

  // 坏 JSON 与超大 body 都是 400，不许 500
  const { res: res5, reply: reply5 } = response()
  await handlerAt(CONFIG_HANDLER)(request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, '{oops'), res5)
  assert.equal(reply5().status, 400)
  const huge = 'x'.repeat(MAX_WEBSEARCH_BODY_BYTES + 10)
  const { res: res6, reply: reply6 } = response()
  await handlerAt(CONFIG_HANDLER)(request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, huge), res6)
  assert.equal(reply6().status, 400)
})

test('POST config：save 拒（校验没过）时回 400 并把它那句中文带出去', async () => {
  const d = deps({ save: () => ({ ok: false, message: '中间不能有空白或控制字符' }) })
  const { res, reply } = response()
  await handlerAt(CONFIG_HANDLER, d)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ githubToken: 'a b' })),
    res,
  )
  assert.equal(reply().status, 400)
  assert.match(reply().body, /中间不能有空白/)
})

test('POST test：kind 只认三个值，失败也是 200 + 中文 summary', async () => {
  const bad = deps()
  for (const kind of [undefined, '', 'openalex', 'GITHUB']) {
    const { res, reply } = response()
    await handlerAt(TEST_HANDLER, bad)(
      request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ kind })),
      res,
    )
    assert.equal(reply().status, 400, 'kind=' + String(kind) + ' 应当 400')
    assert.match(reply().body, /kind 只能是 github \/ arxiv \/ web/)
  }
  assert.deepEqual(bad.probes, [], '非法 kind 不许真发请求出去')

  const ok = deps()
  const { res, reply } = response()
  await handlerAt(TEST_HANDLER, ok)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ kind: 'github' })),
    res,
  )
  assert.equal(reply().status, 200)
  const answer = JSON.parse(reply().body) as { ok: boolean; summary: string }
  assert.equal(answer.ok, true)
  assert.match(answer.summary, /仓库/)
  assert.deepEqual(ok.probes, ['github'])

  // 上游没成：HTTP 200，但 ok=false + 中文原因（"请求失败"会让人以为路由坏了）
  const failing = deps({
    probe: async () => ({ ok: false, summary: 'GitHub 没查成：HTTP 403（未认证每小时只有 60 次…）' }),
  })
  const { res: res3, reply: reply3 } = response()
  await handlerAt(TEST_HANDLER, failing)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ kind: 'github' })),
    res3,
  )
  assert.equal(reply3().status, 200)
  const failed = JSON.parse(reply3().body) as { ok: boolean; summary: string }
  assert.equal(failed.ok, false, '失败必须由 ok:false 表达（页面靠它换文案）')
  assert.match(failed.summary, /没查成/)

  // probe 自己抛 = 500 + 中文
  const throwing = deps({
    probe: async () => {
      throw new Error('上游超时')
    },
  })
  const { res: res4, reply: reply4 } = response()
  await handlerAt(TEST_HANDLER, throwing)(
    request('POST', { ...LOOPBACK, 'x-drc-pair': '1' }, JSON.stringify({ kind: 'web' })),
    res4,
  )
  assert.equal(reply4().status, 500)
  assert.match(reply4().body, /测试时出错/)
})

test('两条路由都拒绝非回环 Host 与外来 Origin', async () => {
  for (const index of [CONFIG_HANDLER, TEST_HANDLER]) {
    const { res, reply } = response()
    await handlerAt(index)(request('GET', { host: 'evil.example.com' }), res)
    assert.equal(reply().status, 403)
    const { res: res2, reply: reply2 } = response()
    await handlerAt(index)(request('GET', { ...LOOPBACK, origin: 'https://evil.example.com' }), res2)
    assert.equal(reply2().status, 403)
  }
})

/* ── ⑥ 「测一下」的内容：真跑一次、只回一行 ───────────────────────── */

test('测一下：合格的工具输出取第一行并截断，失败给中文原因，kind 非法给中文', async () => {
  assert.deepEqual([...WEBSEARCH_PROBE_KINDS], ['github', 'arxiv', 'web'])
  assert.equal(firstLine('\n\n仓库「x」：1 条\n2. 明细'), '仓库「x」：1 条', '跳过空行取第一行')
  assert.equal(firstLine('x'.repeat(200)).length, 121, '超长要截断并带省略号')

  // 真工具 + 假 fetch：成功那条要回"仓库「…」：N 条"
  const stub = stubFetch(GITHUB_JSON)
  const tools = toolsWith(stub.impl, () => ({}))
  const ok = await runProbe(tools, 'github')
  assert.equal(ok.ok, true)
  assert.match(ok.summary, /^仓库「deepseek」：1 条/, '实际：' + ok.summary)
  assert.ok(ok.summary.length <= 120, 'summary 不许超过 120 字')

  // GitHub 回 403：中文原因直出（工具自己就会说中文，别再套一层"测 … 没成"）
  const denied = stubFetch('{"message":"API rate limit exceeded"}', 403)
  const failed = await runProbe(toolsWith(denied.impl, () => ({})), 'github')
  assert.equal(failed.ok, false)
  assert.match(failed.summary, /GitHub 没查成/)
  assert.match(failed.summary, /60 次/, '要提示"未认证 60 次/小时"，指向设置页那一栏')

  // 非法 kind 与"工具没注册上"都回中文，不抛
  const bad = await runProbe(tools, 'openalex')
  assert.equal(bad.ok, false)
  assert.match(bad.summary, /github \/ arxiv \/ web/)
  const missing = await runProbe([], 'arxiv')
  assert.equal(missing.ok, false)
  assert.match(missing.summary, /没注册上/)

  // 意料之外的英文异常要补中文前缀（不能把 fetch failed 原样丢给用户）
  const english = await runProbe(
    [
      {
        name: 'repo_search',
        execute: async (): Promise<string> => {
          throw new Error('fetch failed')
        },
      },
    ],
    'github',
  )
  assert.equal(english.ok, false)
  assert.match(english.summary, /^测GitHub没成：fetch failed/)
})

/* ── ⑦ 设置页那一栏的文案契约（不渲染浏览器，只钉"用户看得到的那几个字"） ── */

test('「搜索」栏的文案契约：两个占位符、三颗按钮、额度说明都在，且 tab 已注册', async () => {
  const { readFileSync } = await import('node:fs')
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
  const srcDir = path.join(here, '..', '..', 'src', 'client')
  const tab = readFileSync(path.join(srcDir, 'websearch-tab.ts'), 'utf8')
  const page = readFileSync(path.join(srcDir, 'dafeiyu-page.ts'), 'utf8')

  // 两个输入框的占位符：用户靠它知道该填什么形状
  assert.ok(tab.includes('ghp_… 或 github_pat_…'), 'GitHub 那格要有占位符')
  assert.ok(tab.includes('openalex.org/settings/api 申请'), 'OpenAlex 那格要写出申请入口')
  // 三颗按钮
  for (const label of ['保存', '清除', '测一下']) {
    assert.ok(tab.includes("'" + label + "'"), '缺「' + label + '」那颗按钮')
  }
  // 额度说明（60/5000 与 0.10 美元/天）：填不填这两枚，用户靠这句话判断
  assert.match(tab, /60 次/, '要写清未配 GitHub token 时每小时 60 次')
  assert.match(tab, /5000/, '要写清配了之后是 5000 次')
  assert.match(tab, /0\.10 美元/, '要写清 OpenAlex 无 key 是共享 0.10 美元/天')
  // 已配置时**输入框留空**、掩码显示在旁边：value 只能来自 state，不许来自服务端掩码
  assert.ok(tab.includes('view.githubTokenSet === true'), '已配置与否要读服务端那两个布尔')
  assert.ok(!/value:\s*String\(view\./.test(tab), '输入框的 value 不许拿服务端掩码去填：真 token 不该有第二份副本')

  // 分栏本身要注册进「大肥鱼」合页（否则这一栏根本不存在）
  assert.ok(page.includes('DAFEIYU_TAB_SEARCH'), '合页要注册「搜索」这一栏')
  assert.ok(page.includes("DAFEIYU_TAB_SEARCH]: '搜索'"), '标签得是「搜索」')
  // 起不来时要有一行中文（不许空白格）
  assert.ok(page.includes('搜索面板起不来'), '面板起不来时要画一行中文说明')
})
