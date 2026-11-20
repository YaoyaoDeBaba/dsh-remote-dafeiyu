/**
 * websearch/extra 的判据：三个解析器 + 三条工具分支，全部用内联 fixture，不打真网。
 *
 * 为什么 fixture 内联而不是录响应文件：夹具贴着断言放，改解析器时一眼能对上；也不会因为
 * 站点改版让测试集体变红（改版本身由 graphics_papers 的「页面结构变了」分支兜底）。
 * 为什么工具执行也注入假 fetch：429 退避、页面回退这些分支只有控住网络才测得到。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildExtraTools,
  buildHnUrl,
  decodeEntities,
  kesenPageCandidates,
  parseGrepAppHits,
  parseGrepSnippet,
  parseHnHits,
  parseKesenIndex,
  parseKesenPapers,
  pickKesenPages,
  textOf,
} from '../src/websearch/extra.js'
import type { ExtraToolOverrides, FetchLike, HttpResponse } from '../src/websearch/extra.js'

// ── 夹具 ───────────────────────────────────────────────────────────────────

const GREP_FIXTURE = {
  facets: {},
  hits: {
    total: 1320,
    hits: [
      {
        repo: { raw: 'acme/engine' },
        path: { raw: 'src/render/loop.ts' },
        branch: { raw: 'main' },
        content: {
          snippet:
            '<table><tbody>' +
            '<tr><td class="px-2">40</td><td class="px-2">function tick() {</td></tr>' +
            '<tr><td class="px-2">41</td><td class="px-2">  <mark>requestAnimationFrame</mark>(tick)</td></tr>' +
            '</tbody></table>',
        },
      },
      {
        repo: { raw: 'acme/web' },
        path: { raw: 'public/index.html' },
        content: { snippet: '<span>plain <b>requestAnimationFrame</b> here</span>' },
      },
    ],
  },
}

const KESEN_INDEX_FIXTURE = [
  '<html><body>',
  '<a href="http://www.realtimerendering.com/">Real-Time Rendering Resources</a>',
  '<a href="https://www.realtimerendering.com/kesen/ke-senhuang%27shomepagechangelog.html">My Web Changelog</a>',
  '<a href="https://www.realtimerendering.com/kesen/sig2026.html">SIGGRAPH 2026</a>',
  '<a href="https://www.realtimerendering.com/kesen/sig2025.html">SIGGRAPH 2025</a>',
  '<a href="https://www.realtimerendering.com/kesen/sig2024.html">SIGGRAPH 2024</a>',
  '<a href="https://www.realtimerendering.com/kesen/eg2024Papers.htm">EG 2024</a>',
  '<a href="https://www.realtimerendering.com/kesen/conference2013.html">2013</a>',
  '</body></html>',
].join('\n')

const KESEN_YEAR_FIXTURE = [
  '<html><head><title>SIGGRAPH 2024 Papers</title></head><body>',
  '<dl>',
  '<dt><B>Neural Radiance Caching &amp; Friends</B>',
  '  <a href="https://example.org/paper-page"><img alt="Paper Abstract" src="Abstract.png" border="0"></a>',
  '  <a href="https://example.org/paper-page"><img alt="Author Preprint" src="Preprint.png" border="0"></a>',
  '</dt>',
  '<dd><a href="https://example.org/author">A. Author</a></dd>',
  '<dt><B>Direct PDF Paper</B>',
  '  <a href="https://example.org/direct.pdf"><img alt="Author Preprint" src="Preprint.png"></a>',
  '</dt>',
  '<dd>B. Author</dd>',
  '<dt><B>Relative Link Paper</B>',
  '  <a href="files/rel.pdf">PDF</a>',
  '</dt>',
  '</dl>',
  '</body></html>',
].join('\n')

const KESEN_EMPTY_FIXTURE = '<html><body><p>The 2026 papers are not up yet.</p></body></html>'

const HN_FIXTURE = {
  hits: [
    {
      objectID: '1',
      title: 'Vulkan is Here',
      points: 120,
      num_comments: 45,
      created_at: '2025-01-02T03:04:05Z',
      url: 'https://example.org/vulkan',
    },
    {
      objectID: '2',
      title: 'Ask HN: anything about Vulkan?',
      points: null,
      num_comments: null,
      created_at: '2025-02-03T00:00:00Z',
    },
    { objectID: '3', comment_text: 'no title here', points: null, num_comments: null },
  ],
}

const NOW_MS = Date.UTC(2026, 10, 20, 0, 0, 0)

interface FakeRoute {
  match: string | RegExp
  status?: number
  body: string
}

function makeFetch(routes: FakeRoute[]): { impl: FetchLike; calls: string[] } {
  const calls: string[] = []
  const impl = async (url: string): Promise<HttpResponse> => {
    calls.push(url)
    const route = routes.find((item) =>
      typeof item.match === 'string' ? url.includes(item.match) : item.match.test(url),
    )
    if (route === undefined) return { status: 404, ok: false, text: async () => '' }
    const status = route.status === undefined ? 200 : route.status
    return { status, ok: status >= 200 && status < 300, text: async () => route.body }
  }
  return { impl: impl as unknown as FetchLike, calls }
}

function makeDeps(routes: FakeRoute[]): { deps: ExtraToolOverrides; calls: string[]; sleeps: number[] } {
  const fake = makeFetch(routes)
  const sleeps: number[] = []
  const deps: ExtraToolOverrides = {
    fetchImpl: fake.impl,
    sleep: async (ms: number) => {
      sleeps.push(ms)
    },
    now: () => NOW_MS,
  }
  return { deps, calls: fake.calls, sleeps }
}

function toolByName(tools: Array<Record<string, unknown>>, name: string): Record<string, unknown> {
  const found = tools.find((tool) => tool.name === name)
  assert.ok(found !== undefined, '缺少工具：' + name)
  return found as Record<string, unknown>
}

function runTool(tool: Record<string, unknown>, args: unknown): Promise<string> {
  const execute = tool.execute as (input: unknown) => Promise<string>
  return execute(args)
}

// ── 1) grep.app 解析 ───────────────────────────────────────────────────────

test('parseGrepSnippet 取带 mark 的那一行和行号', () => {
  const snippet = (GREP_FIXTURE.hits.hits[0] as { content: { snippet: string } }).content.snippet
  const parsed = parseGrepSnippet(snippet)
  assert.equal(parsed.line, 41)
  assert.equal(parsed.code, 'requestAnimationFrame(tick)')
})

test('parseGrepSnippet 对没有 tr 的裸片段也能出代码（行号给 null）', () => {
  const parsed = parseGrepSnippet('<span>plain <b>requestAnimationFrame</b> here</span>')
  assert.equal(parsed.line, null)
  assert.equal(parsed.code, 'plain requestAnimationFrame here')
})

test('parseGrepSnippet 把超长命中行裁到 120 字并留省略号', () => {
  const parsed = parseGrepSnippet('<table><tr><td>7</td><td><mark>' + 'x'.repeat(200) + '</mark></td></tr></table>')
  assert.equal(parsed.line, 7)
  assert.equal(parsed.code.length, 120)
  assert.ok(parsed.code.endsWith('…'))
})

test('parseGrepAppHits 出 repo/path/行号，并遵守 limit 与总条数', () => {
  const parsed = parseGrepAppHits(GREP_FIXTURE, 6)
  assert.equal(parsed.total, 1320)
  assert.equal(parsed.hits.length, 2)
  assert.deepEqual(parsed.hits[0], {
    repo: 'acme/engine',
    path: 'src/render/loop.ts',
    line: 41,
    code: 'requestAnimationFrame(tick)',
  })
  assert.equal(parseGrepAppHits(GREP_FIXTURE, 1).hits.length, 1)
})

// ── 2) kesen 解析 ──────────────────────────────────────────────────────────

test('parseKesenIndex 只收带年份的年份页，导航链接被滤掉', () => {
  const links = parseKesenIndex(KESEN_INDEX_FIXTURE, 'https://kesen.realtimerendering.com/')
  assert.equal(links.length, 5)
  const labels = links.map((link) => link.conf + ' ' + String(link.year))
  assert.ok(labels.includes('SIGGRAPH 2024'))
  assert.ok(labels.includes('EG 2024'))
  // 链接文字只有「2013」的时候退回文件名前缀（conference2013.html → CONFERENCE）
  assert.ok(labels.includes('CONFERENCE 2013'))
  assert.ok(!links.some((link) => link.conf.includes('CHANGELOG')))
  assert.ok(!links.some((link) => link.conf.includes('RESOURCES')))
})

test('pickKesenPages 按年份取页、SIGA 命中 SIGGRAPH、EG 精确过滤、SIGGRAPH 排头', () => {
  const links = parseKesenIndex(KESEN_INDEX_FIXTURE, 'https://kesen.realtimerendering.com/')
  assert.deepEqual(
    pickKesenPages(links, 2024).map((link) => link.conf),
    ['SIGGRAPH', 'EG'],
  )
  assert.deepEqual(
    pickKesenPages(links, 2024, 'SIGA').map((link) => link.conf),
    ['SIGGRAPH'],
  )
  assert.deepEqual(
    pickKesenPages(links, 2024, 'EG').map((link) => link.conf),
    ['EG'],
  )
  assert.deepEqual(pickKesenPages(links, 1999), [])
})

test('pickKesenPages 有真正的 SIGA 页面时不会被 SIGGRAPH 抢走（实测 kesen 里 SIGA 是独立页）', () => {
  const links = [
    { conf: 'SIGGRAPH', year: 2024, url: 'https://kesen.realtimerendering.com/sig2024.html' },
    { conf: 'SIGA', year: 2024, url: 'https://kesen.realtimerendering.com/siga2024Papers.htm' },
  ]
  assert.deepEqual(
    pickKesenPages(links, 2024, 'SIGA').map((link) => link.conf),
    ['SIGA'],
  )
  // 反过来：写 SIGGRAPH 也不要顺手把「SIGGRAPH Asia」拉进来（链接文字全等这一档赢过前缀档）。
  assert.deepEqual(
    pickKesenPages(links, 2024, 'SIGGRAPH').map((link) => link.conf),
    ['SIGGRAPH'],
  )
  // 没有 SIGA 页的年份里，缩写退化成弱匹配，仍然能指到 SIGGRAPH。
  const onlySiggraph = [{ conf: 'SIGGRAPH', year: 2025, url: 'https://kesen.realtimerendering.com/sig2025.html' }]
  assert.deepEqual(
    pickKesenPages(onlySiggraph, 2025, 'SIGA').map((link) => link.conf),
    ['SIGGRAPH'],
  )
})

test('kesenPageCandidates 把 www 的年份页改写到 kesen 主机先试（www 被 Cloudflare 挡 403）', () => {
  const candidates = kesenPageCandidates('https://www.realtimerendering.com/kesen/sig2024.html')
  assert.equal(candidates[0], 'https://kesen.realtimerendering.com/sig2024.html')
  assert.equal(candidates[1], 'https://www.realtimerendering.com/kesen/sig2024.html')
})

test('parseKesenPapers 出标题与链接：PDF 直链优先、preprint 兜底、相对链接补全', () => {
  const papers = parseKesenPapers(KESEN_YEAR_FIXTURE, 'https://kesen.realtimerendering.com/sig2024.html')
  assert.equal(papers.length, 3)
  assert.equal(papers[0]?.title, 'Neural Radiance Caching & Friends')
  assert.equal(papers[0]?.url, 'https://example.org/paper-page')
  assert.equal(papers[1]?.url, 'https://example.org/direct.pdf')
  assert.equal(papers[2]?.url, 'https://kesen.realtimerendering.com/files/rel.pdf')
  assert.deepEqual(parseKesenPapers(KESEN_EMPTY_FIXTURE), [])
})

// ── 3) HN 解析 ─────────────────────────────────────────────────────────────

test('parseHnHits 丢掉没有标题的评论条，无外链时用 HN item 链接兜底', () => {
  const hits = parseHnHits(HN_FIXTURE, 8)
  assert.equal(hits.length, 2)
  assert.deepEqual(hits[0], {
    title: 'Vulkan is Here',
    points: 120,
    comments: 45,
    date: '2025-01-02',
    url: 'https://example.org/vulkan',
  })
  assert.equal(hits[1]?.url, 'https://news.ycombinator.com/item?id=2')
  assert.equal(hits[1]?.points, 0)
  assert.equal(hits[1]?.comments, 0)
})

test('buildHnUrl 把 days 换算成 created_at_i 的 numericFilters', () => {
  const url = new URL(buildHnUrl('vulkan', 8, 30, NOW_MS))
  assert.equal(url.searchParams.get('query'), 'vulkan')
  assert.equal(url.searchParams.get('hitsPerPage'), '8')
  assert.equal(url.searchParams.get('tags'), 'story')
  const since = Math.floor(NOW_MS / 1000) - 30 * 86400
  assert.equal(url.searchParams.get('numericFilters'), 'created_at_i>' + String(since))
  assert.equal(new URL(buildHnUrl('vulkan', 8, undefined, NOW_MS)).searchParams.get('numericFilters'), null)
})

// ── 文本工具 ───────────────────────────────────────────────────────────────

test('textOf/decodeEntities 解实体、并空白', () => {
  assert.equal(textOf('  <b>Neural</b>   Caching &amp; &lt;Friends&gt; '), 'Neural Caching & <Friends>')
  assert.equal(decodeEntities('&#65;&#x42;'), 'AB')
  assert.equal(decodeEntities('&unknown;'), '&unknown;')
})

// ── 工具形状 ───────────────────────────────────────────────────────────────

test('三个工具都是六键形状：name/description/parameters/output/timeoutMs/execute', () => {
  const tools = buildExtraTools()
  assert.equal(tools.length, 3)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['code_search', 'graphics_papers', 'hn_search'],
  )
  for (const tool of tools) {
    assert.equal(typeof tool.name, 'string')
    assert.ok((tool.description as string).length > 40, 'description 要自解释：' + String(tool.name))
    const parameters = tool.parameters as Record<string, unknown>
    assert.equal(parameters.type, 'object')
    assert.equal(typeof parameters.properties, 'object')
    assert.ok(Array.isArray(parameters.required))
    const output = tool.output as { schema: { type: string }; render: (args: unknown, value: unknown) => unknown[] }
    assert.equal(output.schema.type, 'string')
    assert.deepEqual(output.render({}, '# hi'), [{ type: 'text', text: '# hi' }])
    assert.equal(typeof tool.timeoutMs, 'number')
    assert.ok((tool.timeoutMs as number) >= 15_000)
    assert.equal(typeof tool.execute, 'function')
  }
})

// ── code_search ───────────────────────────────────────────────────────────

test('code_search 正常路径：URL 带 q/f.lang，输出 仓库/路径:行号 + 命中行', async () => {
  const { deps, calls } = makeDeps([{ match: 'grep.app/api/search', body: JSON.stringify(GREP_FIXTURE) }])
  const output = await runTool(toolByName(buildExtraTools(deps), 'code_search'), {
    query: 'requestAnimationFrame',
    language: 'TypeScript',
    limit: 6,
  })
  assert.equal(calls.length, 1)
  const called = new URL(calls[0] as string)
  assert.equal(called.searchParams.get('q'), 'requestAnimationFrame')
  assert.equal(called.searchParams.get('f.lang'), 'TypeScript')
  assert.ok(output.startsWith('grep.app 代码搜索「requestAnimationFrame」· 2 / 1320 条'))
  assert.ok(output.includes('1. acme/engine/src/render/loop.ts:41'))
  assert.ok(output.includes('   requestAnimationFrame(tick)'))
  assert.ok(output.includes('2. acme/web/public/index.html:?'))
})

test('code_search 429 后重试一次即成功，退避时长 1.5s', async () => {
  const calls: string[] = []
  let attempt = 0
  const impl = (async (url: string): Promise<HttpResponse> => {
    calls.push(url)
    attempt += 1
    if (attempt === 1) return { status: 429, ok: false, text: async () => 'slow down' }
    return { status: 200, ok: true, text: async () => JSON.stringify(GREP_FIXTURE) }
  }) as unknown as FetchLike
  const sleeps: number[] = []
  const tools = buildExtraTools({
    fetchImpl: impl,
    sleep: async (ms: number) => {
      sleeps.push(ms)
    },
    now: () => NOW_MS,
  })
  const output = await runTool(toolByName(tools, 'code_search'), { query: 'x', limit: 1 })
  assert.equal(calls.length, 2)
  assert.deepEqual(sleeps, [1500])
  assert.ok(output.includes('1 / 1320'))
})

test('code_search 两次 429：报中文限流并提示改用 repo_search', async () => {
  const { deps, calls, sleeps } = makeDeps([{ match: 'grep.app/api/search', status: 429, body: 'slow down' }])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'code_search'), { query: 'requestAnimationFrame' }),
    /代码搜索暂时被限流，稍后再试或改用 repo_search/,
  )
  assert.equal(calls.length, 2)
  assert.deepEqual(sleeps, [1500])
})

test('code_search 收到 HTML 校验页：说清「不是 JSON」，而不是「没命中」', async () => {
  const { deps } = makeDeps([
    { match: 'grep.app/api/search', body: '<!DOCTYPE html><title>Vercel Security Checkpoint</title>' },
  ])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'code_search'), { query: 'x' }),
    /grep.app 返回的不是 JSON/,
  )
})

test('code_search 空 query：中文报错（不发请求）', async () => {
  const { deps, calls } = makeDeps([])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'code_search'), { query: '   ' }),
    /query 不能为空/,
  )
  assert.equal(calls.length, 0)
})

test('code_search 未识别参数显形，不静默吞掉', async () => {
  const { deps } = makeDeps([{ match: 'grep.app/api/search', body: JSON.stringify(GREP_FIXTURE) }])
  const output = await runTool(toolByName(buildExtraTools(deps), 'code_search'), { query: 'x', limit: 1, foo: 1 })
  assert.ok(output.endsWith('（未识别参数：foo）'))
})

// ── graphics_papers ───────────────────────────────────────────────────────

test('graphics_papers 按 conf 只抓命中的页面，标题/会议/链接都在', async () => {
  const { deps, calls } = makeDeps([
    { match: /realtimerendering\.com\/$/, body: KESEN_INDEX_FIXTURE },
    { match: 'sig2024.html', body: KESEN_YEAR_FIXTURE },
    { match: 'eg2024Papers', body: KESEN_YEAR_FIXTURE },
  ])
  const output = await runTool(toolByName(buildExtraTools(deps), 'graphics_papers'), { year: 2024, conf: 'SIGA' })
  assert.ok(!calls.some((url) => url.includes('eg2024Papers')), 'SIGA 不该去抓 EG 页面')
  assert.ok(output.includes('2024 年'))
  assert.ok(output.includes('1. Neural Radiance Caching & Friends — SIGGRAPH 2024'))
  assert.ok(output.includes('   https://example.org/direct.pdf'))
  assert.ok(output.includes('来源：https://kesen.realtimerendering.com/sig2024.html'))
})

test('graphics_papers 缺省年份：最新年还是空壳时回退到前一年并写明用了哪年', async () => {
  const { deps, calls } = makeDeps([
    { match: /realtimerendering\.com\/$/, body: KESEN_INDEX_FIXTURE },
    { match: 'sig2026.html', body: KESEN_EMPTY_FIXTURE },
    { match: 'sig2025.html', body: KESEN_YEAR_FIXTURE },
  ])
  const output = await runTool(toolByName(buildExtraTools(deps), 'graphics_papers'), {})
  assert.ok(
    calls.some((url) => url.includes('sig2026.html')),
    '先试最新年',
  )
  assert.ok(output.includes('2025 年'))
  assert.ok(output.includes('SIGGRAPH 2025'))
})

test('graphics_papers 页面能开但解析不到论文：报「页面结构变了」，不静默返回空', async () => {
  const { deps } = makeDeps([
    { match: /realtimerendering\.com\/$/, body: KESEN_INDEX_FIXTURE },
    { match: 'sig2024.html', body: KESEN_EMPTY_FIXTURE },
  ])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'graphics_papers'), { year: 2024 }),
    /页面结构变了/,
  )
})

test('graphics_papers 年份/会议都对不上：中文报错并给出可用年份', async () => {
  const { deps } = makeDeps([{ match: /realtimerendering\.com\/$/, body: KESEN_INDEX_FIXTURE }])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'graphics_papers'), { year: 2031, conf: 'EG' }),
    /没有对应的年份页（可用的年份：/,
  )
})

// ── hn_search ─────────────────────────────────────────────────────────────

test('hn_search 输出一行一条：标题 · points · 评论 · 时间 · 链接，days 进 numericFilters', async () => {
  const { deps, calls } = makeDeps([{ match: 'hn.algolia.com', body: JSON.stringify(HN_FIXTURE) }])
  const output = await runTool(toolByName(buildExtraTools(deps), 'hn_search'), { query: 'vulkan', days: 30, limit: 8 })
  const called = new URL(calls[0] as string)
  const since = Math.floor(NOW_MS / 1000) - 30 * 86400
  assert.equal(called.searchParams.get('numericFilters'), 'created_at_i>' + String(since))
  assert.ok(output.startsWith('Hacker News 搜索「vulkan」· 2 条（最近 30 天）'))
  assert.ok(output.includes('1. Vulkan is Here · 120 points · 45 评论 · 2025-01-02 · https://example.org/vulkan'))
  assert.ok(output.includes('https://news.ycombinator.com/item?id=2'))
})

test('hn_search 接口 5xx：中文报错，不把错误当结果', async () => {
  const { deps } = makeDeps([{ match: 'hn.algolia.com', status: 503, body: 'upstream down' }])
  await assert.rejects(
    () => runTool(toolByName(buildExtraTools(deps), 'hn_search'), { query: 'vulkan' }),
    /HN 搜索接口返回 HTTP 503/,
  )
})
