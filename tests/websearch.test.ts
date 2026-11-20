/**
 * websearch.test —— 联网搜索四个工具（2026-11-20）。
 *
 * 这里**不联网**：解析逻辑全部用内联 fixture（HTML/XML/JSON 片段），
 * 网络那一层用可注入的假 fetch。钉的四件事：
 * ① 上游页面结构变了要被测试立刻发现（解析器是纯函数）；
 * ② Bing 的 ck/a 跳转必须还原成真实 URL；
 * ③ 失败要抛中文原因，不能静默返回空；
 * ④ 工具定义是六键形状（name/description/parameters/output/timeoutMs/execute）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTtlCache, decodeBase64Url, decodeEntities, fetchText, htmlToText, truncateText } from '../src/websearch/http.js'
import {
  arxivIdOf,
  buildWebsearchTools,
  looksBlocked,
  parseArxivAtom,
  parseBing,
  parseDblp,
  parseGitHubRepos,
  parseOpenAlex,
  parseSogou,
  resolveBingLink,
} from '../src/websearch/tools.js'
import { buildExtraTools } from '../src/websearch/extra.js'
import type { FetchLike } from '../src/websearch/http.js'

interface StubResponse {
  status?: number
  body: string
  headers?: Record<string, string>
  url?: string
}

/** 假 fetch：按 URL 决定回什么，顺便记下调用次数（缓存/重试用得到）。 */
function stubFetch(handler: (url: string) => StubResponse): { impl: FetchLike; calls: string[] } {
  const calls: string[] = []
  const impl: FetchLike = async (url: string) => {
    calls.push(url)
    const response = handler(url)
    const status = response.status ?? 200
    const headers = response.headers ?? {}
    return {
      ok: status >= 200 && status < 300,
      status,
      url: response.url ?? url,
      headers: {
        forEach: (callback: (value: string, key: string) => void): void => {
          for (const key of Object.keys(headers)) callback(headers[key] as string, key)
        },
      },
      text: async () => response.body,
    }
  }
  return { impl, calls }
}

function toolOf(tools: Array<Record<string, unknown>>, name: string): Record<string, any> {
  const hit = tools.find((tool) => tool.name === name)
  assert.ok(hit !== undefined, '工具表里缺少 ' + name)
  return hit as Record<string, any>
}

function makeTools(fetchImpl: FetchLike, guide = '# 联网搜索（测试指南）'): Array<Record<string, any>> {
  return buildWebsearchTools({
    guideBody: () => guide,
    log: () => {},
    fetchImpl,
    // 每个用例一份新缓存，免得互相命中
    cache: createTtlCache<string>(5 * 60 * 1000),
  }) as Array<Record<string, any>>
}

const REAL_URL = 'https://example.com/a?x=1&y=2'
const CK_U = 'a1' + Buffer.from(REAL_URL).toString('base64url')

/** Bing 结果页 fixture：一条 ck/a 跳转 + 一条直链，摘要里带实体。 */
const BING_HTML = '<html><body><ol id="b_results">' +
  '<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=' + CK_U + '&amp;ntb=1">标题一 &amp; 后缀</a></h2>' +
  '<div class="b_caption"><p class="b_lineclamp2">摘要一 &mdash; 更多</p></div></li>' +
  '<li class="b_algo"><h2><a href="https://direct.example.org/x">标题二</a></h2><p>摘要二</p></li>' +
  '</ol></body></html>'

const SOGOU_HTML = '<html><body><div class="results">' +
  '<div class="vrwrap"><h3 class="vr-title"><a href="/link?url=abc">搜狗结果一</a></h3><p class="str_info">摘要甲</p></div>' +
  '<div class="vrwrap"><h3 class="vr-title"><a href="/link?url=def">搜狗结果二</a></h3><p>摘要乙</p></div>' +
  '</div></body></html>'

test('HTML 实体与正文清洗：实体解码、script 剥离、块级换行', () => {
  // &nbsp; 解成一个空格：前面本来就有一个空格，所以是两个
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &#20320;&#x597d; &nbsp;end'), 'a & b <c> 你好  end')
  assert.equal(decodeEntities('&unknown; &amp'), '&unknown; &amp', '认不出的实体原样留着')
  const html = '<html><head><style>p{color:red}</style></head><body>' +
    '<script>var a = "<b>不是正文</b>"</script>' +
    '<h1>标题</h1><p>第一段 &amp; 实体</p><p>第二段<br>换行</p></body></html>'
  const text = htmlToText(html)
  assert.ok(!text.includes('不是正文'), 'script 里的内容不许混进正文')
  assert.ok(!text.includes('color:red'), 'style 里的内容不许混进正文')
  assert.ok(text.includes('标题'))
  assert.ok(text.includes('第一段 & 实体'))
  assert.ok(text.includes('第二段\n换行'), 'br 要变成换行')
  assert.ok(!/\n{3,}/.test(text), '连续空行要压掉')
})

test('base64url 解码：只认解出 http(s) 的结果', () => {
  assert.equal(decodeBase64Url(CK_U.slice(2)), REAL_URL)
  assert.equal(decodeBase64Url('不是base64'), null)
  assert.equal(decodeBase64Url(Buffer.from('hello world').toString('base64url')), null, '解出来不是链接要拒')
})

test('Bing 解析：ck/a 跳转还原真实 URL，摘要解实体，重复链接去重', () => {
  const hits = parseBing(BING_HTML)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.title, '标题一 & 后缀')
  assert.equal(hits[0]!.url, REAL_URL, 'ck/a 的 u=a1<base64url> 必须解开，否则模型拿到的是长跳转链')
  assert.ok(!hits[0]!.url.includes('bing.com/ck/a'))
  assert.equal(hits[0]!.snippet, '摘要一 — 更多')
  assert.equal(hits[1]!.url, 'https://direct.example.org/x', '直链原样保留')
  assert.deepEqual(parseBing(''), [])
  assert.equal(parseBing('<html><body>没有结果</body></html>').length, 0)
})

test('Bing 跳转还原：解不出来就保留原链（宁可长链也别给假 URL）', () => {
  assert.equal(resolveBingLink('https://example.com/ok'), 'https://example.com/ok')
  assert.equal(resolveBingLink('/search?q=x'), 'https://cn.bing.com/search?q=x')
  const broken = 'https://www.bing.com/ck/a?u=a1!!!'
  assert.equal(resolveBingLink(broken), broken)
})

test('Sogou 解析：结果链接只能给绝对化的加密跳转链', () => {
  const hits = parseSogou(SOGOU_HTML)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.title, '搜狗结果一')
  assert.equal(hits[0]!.url, 'https://www.sogou.com/link?url=abc')
  assert.equal(hits[0]!.snippet, '摘要甲')
  assert.equal(parseSogou('<html><body>空</body></html>').length, 0)
})

test('被拦判定：验证页只有关键词没结果块才算被拦', () => {
  const blocked = '<html><body><div>请完成安全验证：请输入验证码后继续访问</div></body></html>'
  assert.equal(looksBlocked(blocked), true)
  assert.equal(parseBing(blocked).length, 0, '验证页解析不出结果块')
  assert.equal(looksBlocked(BING_HTML), false, '正常结果页不许误判')
})
/** OpenAlex：oa_url 优先当链接，年份/venue/被引都要拿到。 */
const OPENALEX_JSON = JSON.stringify({
  results: [
    {
      id: 'https://openalex.org/W1',
      title: 'Attention Is All You Need',
      publication_year: 2017,
      cited_by_count: 12345,
      doi: 'https://doi.org/10.1000/x',
      open_access: { oa_url: 'https://arxiv.org/abs/1706.03762' },
      primary_location: { landing_page_url: 'https://publisher/x', source: { display_name: 'NeurIPS' } },
    },
    {
      id: 'https://openalex.org/W2',
      title: 'A Second Paper',
      publication_year: 2020,
      cited_by_count: 0,
      open_access: { oa_url: '' },
      primary_location: { landing_page_url: '', source: { display_name: '' } },
    },
  ],
})

/** arXiv Atom fixture：标题跨行、摘要超 200 字要截断。 */
const ARXIV_XML = '<feed xmlns="http://www.w3.org/2005/Atom"><title>ArXiv Query</title><entry>' +
  '<id>http://arxiv.org/abs/2401.00001v1</id>' +
  '<published>2024-01-01T00:00:00Z</published>' +
  '<title>Deep   Learning\n  for  Everything</title>' +
  '<summary>' + 'A'.repeat(240) + '</summary>' +
  '</entry><entry>' +
  '<id>http://arxiv.org/abs/2401.00002v2</id>' +
  '<published>2023-12-31T23:00:00Z</published>' +
  '<title>第二篇</title>' +
  '<summary>短的摘要</summary>' +
  '</entry></feed>'

/** DBLP：hit 是数组；h=1 时退化成对象（两个形态都得认）。 */
const DBLP_JSON = JSON.stringify({
  result: {
    hits: {
      hit: [
        {
          info: {
            title: 'Database Systems. ',
            venue: 'SIGMOD',
            year: '2019',
            ee: 'https://doi.org/10.1/db',
            url: 'https://dblp.org/rec/conf/sigmod/x',
          },
        },
      ],
    },
  },
})

const DBLP_SINGLE = JSON.stringify({
  result: { hits: { hit: { info: { title: 'Only One', venue: '', year: '2001', ee: '', url: 'https://dblp.org/rec/y' } } } },
})

test('OpenAlex 解析：标题/年份/venue/被引/链接逐级退', () => {
  const hits = parseOpenAlex(JSON.parse(OPENALEX_JSON), 6)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.title, 'Attention Is All You Need')
  assert.equal(hits[0]!.year, '2017')
  assert.equal(hits[0]!.venue, 'NeurIPS')
  assert.equal(hits[0]!.cited, 12345)
  assert.equal(hits[0]!.url, 'https://arxiv.org/abs/1706.03762', '免费全文优先')
  assert.equal(hits[1]!.cited, 0, '0 次被引也要显示（不能当成没有）')
  // oa_url / 落地页 / doi 全空时退到 OpenAlex 自己的条目页（最后一个可点链接）
  assert.equal(hits[1]!.url, 'https://openalex.org/W2')
  assert.equal(parseOpenAlex({ results: [] }, 6).length, 0)
  assert.equal(parseOpenAlex(null, 6).length, 0, '畸形 payload 不许抛')
})

test('arXiv Atom 解析：标题压空白、年份取前四位、摘要截到 200 字', () => {
  const hits = parseArxivAtom(ARXIV_XML, 6)
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.title, 'Deep Learning for Everything')
  assert.equal(hits[0]!.year, '2024')
  assert.equal(hits[0]!.venue, 'arXiv')
  assert.equal(hits[0]!.url, 'https://arxiv.org/abs/2401.00001v1', 'http 要升级成 https')
  assert.ok(hits[0]!.extra!.startsWith('摘要：'))
  assert.ok(hits[0]!.extra!.length < 220, '摘要要截断到 200 字左右')
  assert.equal(hits[1]!.extra, '摘要：短的摘要')
  assert.equal(parseArxivAtom('<feed></feed>', 6).length, 0)
})

test('DBLP 解析：数组与单对象两种形态、标题去尾点、ee 优先', () => {
  const hits = parseDblp(JSON.parse(DBLP_JSON), 6)
  assert.equal(hits.length, 1)
  assert.equal(hits[0]!.title, 'Database Systems')
  assert.equal(hits[0]!.year, '2019')
  assert.equal(hits[0]!.venue, 'SIGMOD')
  assert.equal(hits[0]!.url, 'https://doi.org/10.1/db')
  assert.equal(hits[0]!.cited, undefined, 'dblp 不给被引数，不许编一个')
  const single = parseDblp(JSON.parse(DBLP_SINGLE), 6)
  assert.equal(single.length, 1, 'h=1 时 hit 退化成对象也要认')
  assert.equal(single[0]!.url, 'https://dblp.org/rec/y')
})

test('GitHub 仓库解析：full_name/星数/语言/更新时间/描述', () => {
  const hits = parseGitHubRepos(
    {
      items: [
        {
          full_name: 'owner/name',
          stargazers_count: 42,
          forks_count: 7,
          language: 'Rust',
          pushed_at: '2026-11-01T10:00:00Z',
          description: '一句话描述 <b>带标签</b>',
          html_url: 'https://github.com/owner/name',
        },
        { full_name: 'plain/repo', stargazers_count: 1, language: null, html_url: '' },
      ],
    },
    8,
  )
  assert.equal(hits.length, 2)
  assert.equal(hits[0]!.fullName, 'owner/name')
  assert.equal(hits[0]!.stars, 42)
  assert.equal(hits[0]!.language, 'Rust')
  assert.equal(hits[0]!.updatedAt, '2026-11-01T10:00:00Z')
  assert.equal(hits[0]!.description, '一句话描述 带标签')
  assert.equal(hits[1]!.language, '未知语言')
  assert.equal(hits[1]!.url, 'https://github.com/plain/repo', '没有 html_url 时按 full_name 拼')
  assert.equal(parseGitHubRepos({ items: [] }, 8).length, 0)
})

test('工具定义：六键齐全、output 是字符串渲染', () => {
  const fetchStub = stubFetch(() => ({ body: '{}' }))
  const tools = makeTools(fetchStub.impl)
  assert.equal(tools.length, 5)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['web_search', 'paper_search', 'paper_read', 'repo_search', 'websearch_guide'],
  )
  for (const tool of tools) {
    for (const key of ['name', 'description', 'parameters', 'output', 'timeoutMs', 'execute']) {
      assert.ok(tool[key] !== undefined, tool.name + ' 缺 ' + key)
    }
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 20, tool.name + ' 的 description 要自解释')
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.output.schema.type, 'string')
    const rendered = tool.output.render({}, '正文') as Array<{ type: string; text: string }>
    assert.deepEqual(rendered, [{ type: 'text', text: '正文' }])
    assert.equal(typeof tool.timeoutMs, 'number')
    assert.ok(tool.timeoutMs > 0)
    assert.equal(typeof tool.execute, 'function')
  }
  // 枚举必须从 types 导出，别在 schema 里手写一份
  const engine = toolOf(tools, 'web_search').parameters.properties.engine
  assert.deepEqual(engine.enum, ['auto', 'bing', 'sogou'])
  const source = toolOf(tools, 'paper_search').parameters.properties.source
  assert.deepEqual(source.enum, ['openalex', 'arxiv', 'dblp'])
})
test('web_search：Bing 被验证页拦下时退 Sogou，并说明为什么换', async () => {
  const fetchStub = stubFetch((url) =>
    url.includes('cn.bing.com')
      ? { body: '<html><body>请完成安全验证：请输入验证码</body></html>' }
      : { body: SOGOU_HTML },
  )
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'web_search').execute({ query: '小鲸鱼', count: 2 })
  assert.ok(text.includes('搜狗结果一'), '回退后要拿到 Sogou 的结果')
  assert.ok(text.includes('Sogou（回退）'), '标题里要标出用了回退引擎')
  assert.ok(text.includes('Bing 回了验证/拦截页'), '要说清换引擎的原因')
  assert.ok(text.includes('https://www.sogou.com/link?url=abc'))
  assert.equal(fetchStub.calls.length, 2, '先 Bing 再 Sogou，各一次')
})

test('web_search：两个引擎都失败要抛中文原因，不许返回空', async () => {
  const fetchStub = stubFetch(() => ({ status: 503, body: 'busy' }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(
    () => toolOf(tools, 'web_search').execute({ query: 'x' }),
    (error: Error) => {
      assert.ok(error.message.includes('联网搜索没成'), '要说明整体失败：' + error.message)
      assert.ok(/Bing|Sogou/.test(error.message), '要说清是哪个引擎失败')
      assert.ok(error.message.includes('503'), 'HTTP 状态码要露出来')
      return true
    },
  )
})

test('web_search：空 query 抛中文，且不碰网络', async () => {
  const fetchStub = stubFetch(() => ({ body: BING_HTML }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(() => toolOf(tools, 'web_search').execute({ query: '   ' }), /搜索词不能为空/)
  assert.equal(fetchStub.calls.length, 0)
})

test('web_search：同一 query 5 分钟内走缓存，只打一次上游', async () => {
  const fetchStub = stubFetch(() => ({ body: BING_HTML }))
  const tools = makeTools(fetchStub.impl)
  const tool = toolOf(tools, 'web_search')
  const first = await tool.execute({ query: '缓存测试' })
  const second = await tool.execute({ query: '缓存测试' })
  assert.equal(first, second)
  assert.equal(fetchStub.calls.length, 1, '第二次必须命中缓存')
  await tool.execute({ query: '缓存测试', count: 3 })
  assert.equal(fetchStub.calls.length, 2, 'count 不同就是另一份结果')
})

test('paper_search：OpenAlex 输出紧凑行（标题 · 年份 · venue · 被引 · URL）', async () => {
  const fetchStub = stubFetch(() => ({ body: OPENALEX_JSON }))
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'paper_search').execute({ query: 'attention', source: 'openalex', limit: 2 })
  assert.ok(text.includes('Attention Is All You Need · 2017 · NeurIPS · 被引 12345 · https://arxiv.org/abs/1706.03762'))
  assert.ok(text.includes('OpenAlex'))
  assert.ok(fetchStub.calls[0]!.includes('per-page=2'))
})

test('paper_search：arXiv 返回 Atom，摘要只给前 200 字；year_from 本地过滤', async () => {
  const fetchStub = stubFetch(() => ({ body: ARXIV_XML }))
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'paper_search').execute({ query: 'deep learning', source: 'arxiv', year_from: 2024 })
  assert.ok(text.includes('Deep Learning for Everything · 2024 · arXiv'))
  assert.ok(text.includes('摘要：'), 'arXiv 要带摘要前 200 字')
  assert.ok(!text.includes('第二篇'), '2023 的那篇要被 year_from 过滤掉')
  assert.ok(fetchStub.calls[0]!.includes('export.arxiv.org/api/query'))
})

test('paper_search：DBLP 回 202（排队）时退避重试一次再拿结果', async () => {
  let hits = 0
  const fetchStub = stubFetch(() => {
    hits += 1
    return hits === 1 ? { status: 202, body: 'queued' } : { body: DBLP_JSON }
  })
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'paper_search').execute({ query: 'database', source: 'dblp' })
  assert.equal(hits, 2, '202 要重试一次')
  assert.ok(text.includes('Database Systems · 2019 · SIGMOD'))
  assert.ok(text.includes('DBLP'))
})

test('paper_search：解析不出结果要报中文，别把 0 条当成功', async () => {
  const fetchStub = stubFetch(() => ({ body: JSON.stringify({ results: [] }) }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(() => toolOf(tools, 'paper_search').execute({ query: 'nope' }), /没搜到/)
})
const GITHUB_SEARCH_JSON = JSON.stringify({
  items: [
    {
      full_name: 'owner/name',
      stargazers_count: 42,
      forks_count: 7,
      language: 'Rust',
      pushed_at: '2026-11-01T10:00:00Z',
      description: '一句话描述',
      html_url: 'https://github.com/owner/name',
    },
  ],
})

test('repo_search：搜索输出两行一条，星数与更新日期都要在', async () => {
  const fetchStub = stubFetch(() => ({ body: GITHUB_SEARCH_JSON }))
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'repo_search').execute({ query: 'vector db', language: 'rust', min_stars: 10 })
  assert.ok(text.includes('owner/name · ★42 · Rust · 更新 2026-11-01 · 一句话描述'))
  assert.ok(text.includes('https://github.com/owner/name'))
  const called = decodeURIComponent(fetchStub.calls[0]!)
  assert.ok(called.includes('language:rust'), '语言要变成搜索限定词')
  assert.ok(called.includes('stars:>=10'), '星数要变成搜索限定词')
  assert.ok(called.includes('sort=stars'), '默认按 stars 排')
})

test('repo_search：author 走用户仓库列表再本地过滤', async () => {
  const fetchStub = stubFetch(() => ({ body: GITHUB_SEARCH_JSON.replace('owner/name', 'someone/one-repo') }))
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'repo_search').execute({ author: 'someone', language: 'rust' })
  assert.ok(fetchStub.calls[0]!.includes('/users/someone/repos'), '给了 author 要走 /users/<author>/repos')
  assert.ok(text.includes('someone/one-repo'))
})

test('repo_search：author 下过滤空了要报中文（不是返回 0 条）', async () => {
  const fetchStub = stubFetch(() => ({ body: GITHUB_SEARCH_JSON }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(
    () => toolOf(tools, 'repo_search').execute({ author: 'someone', language: 'go' }),
    /没有符合条件的仓库/,
  )
})

test('repo_search：额度 ≤3 时末尾提示，403 时给中文与 token 建议', async () => {
  const okStub = stubFetch(() => ({ body: GITHUB_SEARCH_JSON, headers: { 'X-RateLimit-Remaining': '2' } }))
  const okTools = makeTools(okStub.impl)
  const text = await toolOf(okTools, 'repo_search').execute({ query: 'x' })
  assert.ok(text.includes('GitHub 额度快用完了'), '剩余 ≤3 要主动提示')

  const denyStub = stubFetch(() => ({ status: 403, body: JSON.stringify({ message: 'API rate limit exceeded' }) }))
  const denyTools = makeTools(denyStub.impl)
  await assert.rejects(
    () => toolOf(denyTools, 'repo_search').execute({ query: 'x' }),
    (error: Error) => {
      assert.ok(error.message.includes('GitHub 没查成'))
      assert.ok(error.message.includes('GITHUB_TOKEN'), '要告诉用户怎么提额度')
      return true
    },
  )
})

test('repo_search：什么都不给要报中文，别去打一个空搜索', async () => {
  const fetchStub = stubFetch(() => ({ body: '{}' }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(() => toolOf(tools, 'repo_search').execute({}), /至少给/)
  assert.equal(fetchStub.calls.length, 0)
})

test('paper_read：arXiv 链接换 ar5iv，超长截断并写明原文多少字', async () => {
  assert.equal(arxivIdOf('https://arxiv.org/abs/2401.00001v2'), '2401.00001v2')
  assert.equal(arxivIdOf('https://arxiv.org/pdf/2401.00001.pdf'), '2401.00001')
  assert.equal(arxivIdOf('https://example.com/x'), null)

  const longText = '正文开头。' + '甲'.repeat(1_500)
  const fetchStub = stubFetch(() => ({
    body: '<html><body><script>var x = 1</script><p>' + longText + '</p></body></html>',
  }))
  const tools = makeTools(fetchStub.impl)
  const text = await toolOf(tools, 'paper_read').execute({ url: 'https://arxiv.org/abs/2401.00001', max_chars: 600 })
  assert.ok(fetchStub.calls[0]!.includes('ar5iv.labs.arxiv.org/html/2401.00001'), 'arXiv 必须换 ar5iv 全文页')
  assert.ok(text.includes('来源：https://ar5iv.labs.arxiv.org'), '要写明最终抓的是 ar5iv 页')
  assert.ok(text.includes('已截断，原文 '), '截断要说明')
  assert.ok(text.includes('正文开头。'))
  assert.ok(!text.includes('var x = 1'), 'script 不许混进正文')

  assert.equal(arxivIdOf(''), null)
})

test('paper_read：PDF 抓不出正文要直接说，别返回乱码', async () => {
  const fetchStub = stubFetch(() => ({ body: '%PDF-1.7 二进制', headers: { 'content-type': 'application/pdf' } }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(() => toolOf(tools, 'paper_read').execute({ url: 'https://example.com/x.pdf' }), /PDF/)
  await assert.rejects(() => toolOf(tools, 'paper_read').execute({ url: 'ftp://example.com' }), /URL 要写全/)
})

test('fetchText：429 退避重试一次，404 不重试', async () => {
  let calls = 0
  const retryStub = stubFetch(() => {
    calls += 1
    return calls === 1 ? { status: 429, body: 'slow down' } : { body: 'ok' }
  })
  const retried = await fetchText('https://example.com/', { fetchImpl: retryStub.impl, retryDelayMs: 1 })
  assert.equal(retried.ok, true)
  assert.equal(retried.body, 'ok')
  assert.equal(calls, 2, '429 必须重试一次')

  let notFoundCalls = 0
  const missingStub = stubFetch(() => {
    notFoundCalls += 1
    return { status: 404, body: 'nope' }
  })
  const missing = await fetchText('https://example.com/', { fetchImpl: missingStub.impl, retryDelayMs: 1 })
  assert.equal(missing.ok, false)
  assert.equal(missing.status, 404)
  assert.equal(notFoundCalls, 1, '404 不是可重试错误')
})

test('fetchText：超时/网络失败回 status 0 与中文原因，不抛', async () => {
  const throwing: FetchLike = async () => {
    throw new Error('getaddrinfo ENOTFOUND')
  }
  const result = await fetchText('https://example.com/', { fetchImpl: throwing, retries: 0 })
  assert.equal(result.ok, false)
  assert.equal(result.status, 0)
  assert.ok(result.error!.includes('网络请求失败'))
  assert.ok(result.error!.includes('ENOTFOUND'))
})

test('websearch_guide：正文来自 skill（单一真源）', async () => {
  const fetchStub = stubFetch(() => ({ body: '{}' }))
  const tools = makeTools(fetchStub.impl, '# 假 skill 正文')
  const text = await toolOf(tools, 'websearch_guide').execute({})
  assert.equal(text, '# 假 skill 正文')
})

test('paper_search：DBLP 的 202 若是人机验证页，要说人机验证而不是「在排队」', async () => {
  // 2026-11-20 本机实测：DBLP 现在会回 202 + 一个「正在确认你是不是机器人」的 HTML
  const fetchStub = stubFetch(() => ({ status: 202, body: '<html><title>正在确认你是不是机器人！</title></html>' }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(
    () => toolOf(tools, 'paper_search').execute({ query: 'x', source: 'dblp' }),
    (error: Error) => {
      assert.ok(error.message.includes('人机验证'), '要认出挑战页：' + error.message)
      assert.ok(error.message.includes('openalex'), '要给替代源')
      return true
    },
  )
})

test('paper_search：OpenAlex 429 要说清共享额度并指路 api_key', async () => {
  const fetchStub = stubFetch(() => ({ status: 429, body: '{"error":"budget"}' }))
  const tools = makeTools(fetchStub.impl)
  await assert.rejects(
    () => toolOf(tools, 'paper_search').execute({ query: 'x' }),
    (error: Error) => {
      assert.ok(error.message.includes('OPENALEX_API_KEY'), '要告诉用户怎么解：' + error.message)
      assert.ok(error.message.includes('429'))
      return true
    },
  )
})

test('paper_search：配了 OPENALEX_API_KEY 就自动带上 api_key', async () => {
  process.env.OPENALEX_API_KEY = 'test-key'
  try {
    const fetchStub = stubFetch(() => ({ body: OPENALEX_JSON }))
    const tools = makeTools(fetchStub.impl)
    await toolOf(tools, 'paper_search').execute({ query: 'x' })
    assert.ok(fetchStub.calls[0]!.includes('api_key=test-key'), 'key 要拼进 URL：' + fetchStub.calls[0])
  } finally {
    delete process.env.OPENALEX_API_KEY
  }
})



test('八个工具一起注册：核心五个 + 定向三个，名字不许撞（2026-11-20 合并）', () => {
  const core = buildWebsearchTools({ guideBody: () => 'x', log: () => {} })
  const extra = buildExtraTools()
  const names = [...core, ...extra].map((tool) => String((tool as { name?: unknown }).name))
  assert.deepEqual(
    names.sort(),
    [
      'code_search',
      'graphics_papers',
      'hn_search',
      'paper_read',
      'paper_search',
      'repo_search',
      'web_search',
      'websearch_guide',
    ].sort(),
    '少一个或多一个都会让模型看不到那个工具，且没有任何报错',
  )
  assert.equal(new Set(names).size, names.length, '工具名撞了：后注册的会顶掉前一个')
})