/**
 * websearch/tools —— 联网搜索的四个工具（web_search / paper_search / paper_read / repo_search）
 * 外加一个 websearch_guide 兜底。
 *
 * 设计取舍（为什么这么切）：
 * 1. **解析器全部是纯函数、单独导出**：上游 HTML 是最不稳的一环，测试必须能用内联
 *    fixture 钉住「块怎么切、跳转怎么还原」。真去联网的只剩 execute 里那几行。
 * 2. **输出是纯文本不是 JSON**：这些结果最终是给模型读的，JSON 会把 token 花在引号和键名上，
 *    而且模型得自己再拼一遍。两行一条（标题行 + URL 行）是模型引用时最省事的形态。
 * 3. **失败不编数据**：0 条结果、被验证页拦下、解析不出块，一律抛中文原因，
 *    绝不拿「抱歉没找到」冒充搜索结果——那会让模型看起来像搜过。
 * 4. **Bing 的 ck/a 跳转必须解开**：不解就是每一条都塞给模型一个 200 字符的长链，
 *    既没法显示也没法再抓；解出来才是真实 URL（本机实测 u=a1<base64url>）。
 */
import {
  absoluteUrl,
  createTtlCache,
  decodeBase64Url,
  decodeEntities,
  describeFailure,
  fetchText,
  htmlToText,
  inlineText,
  truncateText,
  type FetchLike,
  type HttpResult,
  type TtlCache,
} from './http.js'

/** 上游地址集中放，测试读得到、以后换镜像只改这里。 */
export const BING_SEARCH = 'https://cn.bing.com/search'
export const BING_BASE = 'https://cn.bing.com'
export const SOGOU_SEARCH = 'https://www.sogou.com/web'
export const SOGOU_BASE = 'https://www.sogou.com'
export const AR5IV_HTML = 'https://ar5iv.labs.arxiv.org/html/'
export const OPENALEX_API = 'https://api.openalex.org/works'
export const ARXIV_API = 'http://export.arxiv.org/api/query'
export const DBLP_API = 'https://dblp.org/search/publ/api'
export const GITHUB_API = 'https://api.github.com'

/**
 * web_search 的引擎档位。auto = 先 Bing、不行退 Sogou。
 *
 * `doubao` = **拿本机已登录的网页版豆包当搜索引擎用**（白嫖，不花 key，2026-11-23 用户拍的）：
 * 做法与识图插件里「白嫖网页豆包」同一套（复用同一份登录 profile、无头浏览器 + CDP），
 * 返回的是它整合后的一段回答 + 它自己给的来源链接，而不是 bing/sogou 那种一条条的搜索页。
 * 因此它**不进 auto**：慢（几十秒）、依赖登录态，只在你明确要"一个答案"时才显式指定。
 */
export type SearchEngine = 'auto' | 'bing' | 'sogou' | 'doubao'
export const SEARCH_ENGINES: SearchEngine[] = ['auto', 'bing', 'sogou', 'doubao']

/**
 * 「网页豆包当搜索引擎」的形状：**真源在 `webai/types.ts`**，这里只引用不重定义——
 * 工具层与 service 层共用一份，sprite 那次「schema 支持、service 没转」的缺陷就没有落脚点。
 */
export type { WebAiCitation, WebAiSearchResult } from './webai/types.js'
import type { WebAiSearchResult } from './webai/types.js'
/** 工具层只要这一个方法（判据注入假实现时也只实现它）。 */
export interface WebAiEngine {
  search(query: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<WebAiSearchResult>
}
/** paper_search 的数据源。 */
export type PaperSource = 'openalex' | 'arxiv' | 'dblp'
/** 显式指定时可用的源（不含 auto）。 */
export const PAPER_SOURCES: PaperSource[] = ['openalex', 'arxiv', 'dblp']
/**
 * 检索优先级（2026-11-20 用户裁决：**arxiv 是主力，openalex / dblp 进替补席**）。
 *
 * 依据是本机实测：arXiv 一直通；OpenAlex 不带 key 是整机共享 0.10 美元/天、很容易 429；
 * DBLP 现在回 Anubis 人机验证挑战页。所以 auto 先打 arXiv，失败再按这个顺序兜。
 */
export const PAPER_SOURCE_ORDER: PaperSource[] = ['arxiv', 'openalex', 'dblp']
/** repo_search 的排序档位。 */
export type RepoSort = 'stars' | 'updated' | 'forks'
export const REPO_SORTS: RepoSort[] = ['stars', 'updated', 'forks']

export interface SearchHit {
  title: string
  url: string
  snippet: string
}

export interface PaperHit {
  title: string
  year: string
  venue: string
  cited?: number
  url: string
  /** arXiv 的摘要前 200 字（其它源不给） */
  extra?: string
}

export interface RepoHit {
  fullName: string
  stars: number
  forks: number
  language: string
  updatedAt: string
  description: string
  url: string
}

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
  ],
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return undefined
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(asString(value))
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function pickEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const raw = asString(value).toLowerCase()
  return (allowed as string[]).includes(raw) ? (raw as T) : fallback
}

/** 第一条 http(s) 链接（OpenAlex 的 oa_url 经常是空串，得逐级退）。 */
function firstHttpUrl(candidates: string[]): string {
  for (const candidate of candidates) {
    if (/^https?:\/\//i.test(candidate.trim())) return candidate.trim()
  }
  return candidates.find((candidate) => candidate.trim() !== '')?.trim() ?? ''
}

/**
 * 按「结果块开头」切块：给一个匹配块开头的正则和块的结束标签。
 * 不用 DOM 解析器（不引依赖），这是这一层唯一的取舍代价：块内嵌套结构会被截断，
 * 但搜索结果块（li.b_algo）里标题/摘要都在最外层，够用。
 */
function sliceBlocks(html: string, opener: RegExp, closeTag: string): string[] {
  const starts: number[] = []
  opener.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = opener.exec(html)) !== null) {
    starts.push(match.index + match[0].length)
    if (match[0].length === 0) opener.lastIndex += 1
  }
  const blocks: string[] = []
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] as number
    const nextStart = index + 1 < starts.length ? (starts[index + 1] as number) : html.length
    const closing = html.indexOf(closeTag, start)
    const end = closing >= 0 && closing < nextStart ? closing : nextStart
    blocks.push(html.slice(start, end))
  }
  return blocks
}

interface Anchor {
  href: string
  text: string
}

/** 取片段里第一个 <a href>。兼容单双引号——搜索页两种都会出现。 */
function firstAnchor(fragment: string): Anchor | null {
  const match = /<a\b[^>]*href\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/i.exec(fragment)
  if (match === null) return null
  const href = decodeEntities(match[2] ?? match[3] ?? '').trim()
  return { href, text: inlineText(match[4] ?? '') }
}

/** 标题锚点优先取 <h2>/<h3> 里的那个（Bing/Sogou 的结果标题都在标题级元素里）。 */
function headingAnchor(block: string): Anchor | null {
  const heading = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/i.exec(block)
  const scope = heading === null ? block : (heading[1] ?? '')
  return firstAnchor(scope)
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}
/**
 * Bing 的跳转链还原。
 * 形如 https://www.bing.com/ck/a?...&u=a1<base64url>：a1 是版本前缀，后面才是
 * base64url(真实 URL)。解不出来就保留原链（宁可给长链也别给出 404 的假 URL）。
 */
export function resolveBingLink(href: string): string {
  const raw = decodeEntities(href).trim()
  if (raw === '') return ''
  if (raw.startsWith('/')) return absoluteUrl(raw, BING_BASE)
  if (!/\/ck\/a\?/i.test(raw)) return raw
  let param = ''
  try {
    param = new URL(raw, BING_BASE).searchParams.get('u') ?? ''
  } catch {
    param = ''
  }
  if (param === '') return raw
  // 少数版本会直接塞 URL（不 base64），先认这个
  if (/^https?:\/\//i.test(param)) return param
  const body = param.startsWith('a1') ? param.slice(2) : param
  return decodeBase64Url(body) ?? raw
}

/** Sogou 的结果链接是它自己的加密跳转（/link?url=…），还原不了，只能给绝对链。 */
export function resolveSogouLink(href: string): string {
  const raw = decodeEntities(href).trim()
  if (raw === '') return ''
  return absoluteUrl(raw, SOGOU_BASE)
}

/** 从一块结果里取摘要（Bing 现在是 <p class="b_lineclamp…">，老版在 .b_caption 里）。 */
function bingSnippet(block: string): string {
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block)
  if (paragraph !== null) return clip(inlineText(paragraph[1] ?? ''), 280)
  const caption = /<div\b[^>]*class\s*=\s*"[^"]*b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)
  if (caption !== null) return clip(inlineText(caption[1] ?? ''), 280)
  return ''
}

/** 解析 Bing 结果页（li.b_algo 块）。解析不出就回空数组，由调用方判断「被拦/改版」。 */
export function parseBing(html: string): SearchHit[] {
  if (html === '') return []
  const blocks = sliceBlocks(html, /<li\b[^>]*class\s*=\s*"[^"]*\bb_algo\b[^"]*"[^>]*>/gi, '</li>')
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    const anchor = headingAnchor(block)
    if (anchor === null || anchor.text === '') continue
    const url = resolveBingLink(anchor.href)
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    hits.push({ title: clip(anchor.text, 160), url, snippet: bingSnippet(block) })
  }
  return hits
}

/** 解析 Sogou 结果页。当前版式标题在 h3.vr-title 里，老版式在 div.rb 里。 */
export function parseSogou(html: string): SearchHit[] {
  if (html === '') return []
  let blocks = sliceBlocks(html, /<h3\b[^>]*class\s*=\s*"[^"]*vr-?title[^"]*"[^>]*>/gi, '</div>')
  if (blocks.length === 0) {
    blocks = sliceBlocks(html, /<div\b[^>]*class\s*=\s*"[^"]*\brb\b[^"]*"[^>]*>/gi, '</div>')
  }
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    const anchor = headingAnchor(block) ?? firstAnchor(block)
    if (anchor === null || anchor.text === '') continue
    const url = resolveSogouLink(anchor.href)
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    const snippetMatch = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(block)
    const snippet = snippetMatch === null ? '' : clip(inlineText(snippetMatch[1] ?? ''), 280)
    hits.push({ title: clip(anchor.text, 160), url, snippet })
  }
  return hits
}

/**
 * 是不是撞上了人机验证/安全拦截页。
 * 只在「页面里一条结果都没解析出来」时才拿来定性——正常结果页里出现「验证」两个字
 * 完全可能（比如搜索结果本身就是讲验证码的），不能单凭关键词判断。
 */
export function looksBlocked(html: string): boolean {
  if (html === '') return false
  const text = htmlToText(html).slice(0, 5_000)
  return /(安全验证|人机验证|请输入验证码|滑动验证|访问异常|captcha|unusual traffic|are you a robot|请完成下列验证)/i.test(text)
}

interface SearchAttempt {
  ok: boolean
  hits: SearchHit[]
  reason: string
}

/** 三个判定连一起：请求成不成 → 有没有结果块 → 没结果块是不是验证页。 */
function judgeSearchPage(
  label: string,
  result: HttpResult,
  parse: (html: string) => SearchHit[],
): SearchAttempt {
  if (!result.ok) return { ok: false, hits: [], reason: label + ' ' + describeFailure(result) }
  const hits = parse(result.body)
  if (hits.length === 0) {
    return {
      ok: false,
      hits: [],
      reason: looksBlocked(result.body)
        ? label + ' 回了验证/拦截页（要人机验证）'
        : label + ' 没解析出结果块（页面结构可能变了）',
    }
  }
  return { ok: true, hits, reason: '' }
}

async function searchBing(fetchImpl: FetchLike | undefined, query: string, count: number): Promise<SearchAttempt> {
  const url = BING_SEARCH + '?q=' + encodeURIComponent(query) + '&setlang=zh-CN&count=' + count
  const result = await fetchText(url, { timeoutMs: 8_000, fetchImpl, accept: 'text/html' })
  return judgeSearchPage('Bing', result, parseBing)
}

async function searchSogou(fetchImpl: FetchLike | undefined, query: string, count: number): Promise<SearchAttempt> {
  const url = SOGOU_SEARCH + '?query=' + encodeURIComponent(query)
  const result = await fetchText(url, { timeoutMs: 8_000, fetchImpl, accept: 'text/html' })
  const attempt = judgeSearchPage('Sogou', result, parseSogou)
  return { ...attempt, hits: attempt.hits.slice(0, count) }
}

export function formatSearch(query: string, engine: string, hits: SearchHit[]): string {
  const lines: string[] = ['搜索「' + query + '」：' + hits.length + ' 条（' + engine + '）']
  hits.forEach((hit, index) => {
    lines.push((index + 1) + '. ' + hit.title + (hit.snippet === '' ? '' : ' — ' + hit.snippet))
    lines.push('   ' + hit.url)
  })
  return lines.join('\n')
}

/**
 * `engine=doubao` 的输出：一段回答 + 它给的来源列表。
 *
 * 为什么不套 formatSearch 那个「标题 / URL」两行制：豆包返回的是**整合后的答案**，
 * 硬拆成条目会把它自己的判断丢掉；而来源必须单独列，否则模型会把自己的话当成可引用的事实。
 * 两种没答完的状态要明说（`partial` / `truncated`），不然模型会把半截回答当结论用。
 */
export function formatWebAi(query: string, result: WebAiSearchResult, count: number): string {
  const site = result.site === '' ? '网页豆包' : result.site
  const seconds = (Math.max(0, result.elapsedMs) / 1000).toFixed(1)
  const lines: string[] = ['搜索「' + query + '」：' + site + ' 的回答（' + seconds + 's）', '']
  lines.push(result.answer.trim() === '' ? '（豆包这次一个字都没给，可能是页面改版或被限流）' : result.answer.trim())
  /*
   * 去重放在**格式化这一层**，不只指望 service（站点抽取与格式化是两段代码，
   * 任一段退化都会把同一 url 印两遍；用户看到的第一个数就是「来源（N）」，重复很显眼）。
   */
  const seen = new Set<string>()
  const cites = (result.citations ?? [])
    .filter((one) => {
      const url = String(one?.url ?? '').trim()
      if (url === '' || seen.has(url)) return false
      seen.add(url)
      return true
    })
    .slice(0, count)
  if (cites.length > 0) {
    lines.push('', '来源（' + cites.length + '）：')
    cites.forEach((one, index) => {
      lines.push((index + 1) + '. ' + inlineText(one.title) + ' — ' + one.url)
    })
  } else {
    lines.push('', '来源：豆包这次没给链接（别把上面的回答当成有出处的检索结果来引用）')
  }
  if (result.partial) lines.push('', '（注意：没等到"答完"就超时返回了，上面只是已拿到的部分）')
  if (result.truncated) lines.push('', '（回答太长，已截断）')
  return lines.join('\n')
}
/** ---------------- 论文 ---------------- */

export function parseOpenAlex(payload: unknown, limit: number): PaperHit[] {
  const results = asRecord(payload).results
  const rows = Array.isArray(results) ? results : []
  const hits: PaperHit[] = []
  for (const row of rows) {
    if (hits.length >= limit) break
    const work = asRecord(row)
    const title = inlineText(asString(work.title))
    if (title === '') continue
    const primary = asRecord(work.primary_location)
    const source = asRecord(primary.source)
    const openAccess = asRecord(work.open_access)
    // oa_url 是最值得给的（免费全文），其次是落地页、DOI，最后才退回 OpenAlex 自己的条目页
    const url = firstHttpUrl([
      asString(openAccess.oa_url),
      asString(primary.landing_page_url),
      asString(work.doi),
      asString(work.id),
    ])
    const cited = asNumber(work.cited_by_count)
    hits.push({
      title: clip(title, 200),
      year: asString(work.publication_year),
      venue: clip(inlineText(asString(source.display_name)), 60),
      ...(cited === undefined ? {} : { cited }),
      url,
    })
  }
  return hits
}

/** 取一段 XML 里某个标签的第一次出现（arxiv 的 Atom 每条 entry 单独会喂进来）。 */
function firstTag(block: string, tag: string): string {
  const pattern = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i')
  const match = pattern.exec(block)
  return match === null ? '' : (match[1] ?? '')
}

export function parseArxivAtom(xml: string, limit: number): PaperHit[] {
  if (xml === '') return []
  const hits: PaperHit[] = []
  const entries = xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)
  for (const entry of entries) {
    if (hits.length >= limit) break
    const block = entry[1] ?? ''
    const title = clip(inlineText(firstTag(block, 'title')), 200)
    if (title === '') continue
    const id = inlineText(firstTag(block, 'id'))
    const published = inlineText(firstTag(block, 'published'))
    const summary = inlineText(firstTag(block, 'summary'))
    // Atom 的时间是 2024-05-01T17:59:59Z：年份就在前四位
    const year = /^\d{4}/.test(published) ? published.slice(0, 4) : ''
    const abstract = summary.length > 200 ? summary.slice(0, 200) + '…' : summary
    hits.push({
      title,
      year,
      venue: 'arXiv',
      url: id.replace(/^http:/i, 'https:'),
      ...(abstract === '' ? {} : { extra: '摘要：' + abstract }),
    })
  }
  return hits
}

export function parseDblp(payload: unknown, limit: number): PaperHit[] {
  const result = asRecord(asRecord(payload).result)
  const rawHits = asRecord(result.hits).hit
  // h=1 时 dblp 会把 hit 从数组退化成对象，不兼容的话「只搜一条」就永远 0 结果
  const rows = Array.isArray(rawHits) ? rawHits : rawHits === undefined ? [] : [rawHits]
  const hits: PaperHit[] = []
  for (const row of rows) {
    if (hits.length >= limit) break
    const info = asRecord(asRecord(row).info)
    const title = clip(inlineText(asString(info.title)).replace(/\.$/, ''), 200)
    if (title === '') continue
    const url = firstHttpUrl([asString(info.ee), asString(info.url)])
    hits.push({ title, year: asString(info.year), venue: clip(inlineText(asString(info.venue)), 60), url })
  }
  return hits
}

export function formatPapers(label: string, source: string, hits: PaperHit[]): string {
  const lines: string[] = [label + '：' + hits.length + ' 条（' + source + '）']
  hits.forEach((hit, index) => {
    const parts: string[] = [hit.title]
    if (hit.year !== '') parts.push(hit.year)
    if (hit.venue !== '') parts.push(hit.venue)
    if (hit.cited !== undefined) parts.push('被引 ' + hit.cited)
    if (hit.url !== '') parts.push(hit.url)
    lines.push((index + 1) + '. ' + parts.join(' · '))
    if (hit.extra !== undefined) lines.push('   ' + hit.extra)
  })
  return lines.join('\n')
}

/**
 * arxiv 链接（abs/pdf 都算）→ arXiv id；其它链接回 null。
 * paper_read 靠它决定要不要换 ar5iv：ar5iv 把 PDF 渲染成 HTML 全文，
 * 比抓 abs 页（只有摘要）和抓 pdf（二进制）都靠谱。
 */
export function arxivIdOf(url: string): string | null {
  const match = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\/([^?#]+)/i.exec(url.trim())
  if (match === null) return null
  let id = (match[1] ?? '').trim()
  if (id.toLowerCase().endsWith('.pdf')) id = id.slice(0, -4)
  // 老式 id（hep-th/9901001）里带斜杠，ar5iv 也认，别把斜杠切掉
  return id === '' ? null : id
}
/** ---------------- GitHub ---------------- */

export function parseGitHubRepos(payload: unknown, limit: number): RepoHit[] {
  const record = asRecord(payload)
  const items = Array.isArray(record.items)
    ? (record.items as unknown[])
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []
  const hits: RepoHit[] = []
  for (const item of items) {
    if (hits.length >= limit) break
    const repo = asRecord(item)
    const fullName = asString(repo.full_name)
    if (fullName === '') continue
    const language = asString(repo.language)
    hits.push({
      fullName,
      stars: asNumber(repo.stargazers_count) ?? 0,
      forks: asNumber(repo.forks_count) ?? 0,
      language: language === '' ? '未知语言' : language,
      updatedAt: asString(repo.pushed_at) || asString(repo.updated_at),
      description: clip(inlineText(asString(repo.description)), 120),
      url: asString(repo.html_url) === '' ? 'https://github.com/' + fullName : asString(repo.html_url),
    })
  }
  return hits
}

export function formatRepos(label: string, hits: RepoHit[]): string {
  const lines: string[] = [label + '：' + hits.length + ' 条']
  hits.forEach((hit, index) => {
    const day = hit.updatedAt.slice(0, 10)
    const parts = [hit.fullName, '★' + hit.stars, hit.language, day === '' ? '' : '更新 ' + day, hit.description]
    lines.push((index + 1) + '. ' + parts.filter((part) => part !== '').join(' · '))
    lines.push('   ' + hit.url)
  })
  return lines.join('\n')
}

function sortRepos(hits: RepoHit[], sort: RepoSort): RepoHit[] {
  const copy = [...hits]
  copy.sort((left, right) => {
    if (sort === 'updated') return right.updatedAt.localeCompare(left.updatedAt)
    if (sort === 'forks') return right.forks - left.forks
    return right.stars - left.stars
  })
  return copy
}

function parseJson(body: string, label: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    // 被拦/软墙时上游回的是 HTML 而不是 JSON——这种情况要说人话，不能让 JSON.parse 的英文异常冒出去
    throw new Error(label + ' 回的不是 JSON（大概率被拦或改了接口）')
  }
}

function githubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'dsh-remote-dafeiyu-websearch',
  }
  if (token !== '') headers.authorization = 'Bearer ' + token
  return headers
}

/** 设置页「搜索」栏写下的两个 token（`start.ts` 从 user-config.json 读进来注入）。 */
export interface WebsearchTokens {
  githubToken?: string
  openAlexKey?: string
}

function pickSecret(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 读注入进来的插件配置。**读不到 / 抛错一律当"没配"**：
 * 配置文件被手改坏不该让四个工具当场不可用——回退环境变量或匿名额度，功能还在。
 */
function configTokens(deps: WebsearchToolDeps): WebsearchTokens {
  try {
    const value = deps.readConfig?.()
    return value !== null && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/**
 * GitHub token 的三级优先级：**显式注入 > 插件配置 > 环境变量**。
 *
 * - 显式注入（`deps.githubToken`）只给判据用，生产不传；
 * - **配置压过环境变量**——与中继那两项相反（理由见 `shell/user-config.ts` 的
 *   `WebsearchOverrides` 注释）：用户在设置页填了，就说明他想用这一枚；
 * - 环境变量留着，是"脚本里 export 一个就走"的老用法，也是配置栏空着时的兜底。
 */
function readGitHubToken(deps: WebsearchToolDeps): string {
  const explicit = pickSecret(deps.githubToken)
  if (explicit !== '') return explicit
  const fromConfig = pickSecret(configTokens(deps).githubToken)
  if (fromConfig !== '') return fromConfig
  const env = process.env
  return pickSecret(env.GITHUB_TOKEN ?? env.DSH_GITHUB_TOKEN ?? '')
}

/**
 * OpenAlex 的免费额度（2026-11 现状）：不带 key 时是**整台机器/IP 共享的 0.10 美元/天**，
 * 同一出口 IP 上别的程序跑几次搜索就会把这份预算吃掉、开始回 429。
 * 配一个免费 key（openalex.org/settings/api）后是每天 1 美元，这里自动带上。
 *
 * 同样"设置页配置 > 环境变量"（见 `readGitHubToken`）。
 */
function readOpenAlexKey(deps: WebsearchToolDeps): string {
  const fromConfig = pickSecret(configTokens(deps).openAlexKey)
  if (fromConfig !== '') return fromConfig
  const env = process.env
  return pickSecret(env.OPENALEX_API_KEY ?? env.DSH_OPENALEX_API_KEY ?? '')
}
/** ---------------- 工具 ---------------- */

export interface WebsearchToolDeps {
  /** skill 正文（单一真源，别在这里复制文案）。 */
  guideBody: () => string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 测试注入；生产走全局 fetch。 */
  fetchImpl?: FetchLike
  /** web_search 的 5 分钟缓存（测试可注入固定 now）。 */
  cache?: TtlCache<string>
  /** 判据用的显式 token（生产不传，优先级最高）。 */
  githubToken?: string
  /**
   * 插件配置里的两个 token（设置页「搜索」栏）。
   *
   * 用**注入**而不是在这里读盘：本文件是纯函数域（只认 fetch 与依赖），
   * 读 user-config.json 归 `start.ts`；这里连 `node:fs` 都不该出现。
   * 不注入 = 只有环境变量，与加这个口子之前一模一样。
   */
  readConfig?: () => WebsearchTokens
  /**
   * 网页豆包引擎（`web_search(engine='doubao')` 的落点）。
   *
   * 由 `start.ts` 注入——它要起浏览器、读 profile，属于 node 侧；本文件是纯函数域。
   * 不注入 = 只剩 bing/sogou，选 doubao 时抛中文原因（不静默换成别的引擎）。
   */
  webAi?: WebAiEngine
}

const CACHE_TTL_MS = 5 * 60 * 1000

export function buildWebsearchTools(deps: WebsearchToolDeps): Array<Record<string, unknown>> {
  const cache = deps.cache ?? createTtlCache<string>(CACHE_TTL_MS, 64)

  async function runSearch(query: string, count: number, engine: SearchEngine): Promise<string> {
    const key = engine + '|' + count + '|' + query
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    if (engine === 'doubao') {
      const brain = deps.webAi
      if (!brain) {
        throw new Error(
          '这台主机的「网页豆包」引擎没挂上（probe.webai 会写原因）：先确认本机 Edge/Chrome 在、' +
          '并且用识图那边的登录按钮登过一次网页版豆包；或者改用 engine=auto（Bing/Sogou）。',
        )
      }
      const result = await brain.search(query, { timeoutMs: 90_000 })
      const text = formatWebAi(query, result, count)
      cache.set(key, text)
      deps.log('联网搜索（豆包网页版）', {
        elapsedMs: result.elapsedMs,
        citations: result.citations.length,
        partial: result.partial,
      })
      return text
    }
    const order: Array<'bing' | 'sogou'> = engine === 'auto' ? ['bing', 'sogou'] : [engine]
    const failures: string[] = []
    for (const name of order) {
      const attempt = name === 'bing'
        ? await searchBing(deps.fetchImpl, query, count)
        : await searchSogou(deps.fetchImpl, query, count)
      if (attempt.ok) {
        const label = name === 'bing' ? 'Bing' : 'Sogou'
        const fallbackNote = failures.length > 0 ? '\n（' + failures.join('；') + '，已改用 Sogou）' : ''
        const text = formatSearch(query, fallbackNote === '' ? label : label + '（回退）', attempt.hits.slice(0, count)) + fallbackNote
        cache.set(key, text)
        deps.log('联网搜索', { engine: name, hits: attempt.hits.length })
        return text
      }
      failures.push(attempt.reason)
    }
    throw new Error(
      '联网搜索没成：' + failures.join('；') +
      '。稍后重试，或改用 paper_search（论文）/ repo_search（GitHub 仓库）走各自的官方 API。',
    )
  }

  async function runPaperSearch(
    query: string,
    source: PaperSource | 'auto',
    limit: number,
    yearFrom: number | undefined,
  ): Promise<string> {
    /*
     * auto：按 PAPER_SOURCE_ORDER（arxiv → openalex → dblp）依次试，谁先成谁上。
     * 失败的那些原因**要带出去**——只说"没搜到"会让模型以为关键词写错了。
     */
    if (source === 'auto') {
      const failures: string[] = []
      for (const candidate of PAPER_SOURCE_ORDER) {
        try {
          return await runPaperSearch(query, candidate, limit, yearFrom)
        } catch (error) {
          failures.push(candidate + '：' + String((error as Error)?.message ?? error).slice(0, 120))
        }
      }
      throw new Error('论文检索三个源都没成（按 arxiv → openalex → dblp 依次试过）：' + failures.join('；'))
    }
    if (source === 'openalex') {
      let url = OPENALEX_API + '?search=' + encodeURIComponent(query) + '&per-page=' + limit
      if (yearFrom !== undefined) url += '&filter=from_publication_date:' + yearFrom + '-01-01'
      const apiKey = readOpenAlexKey(deps)
      if (apiKey !== '') url += '&api_key=' + encodeURIComponent(apiKey)
      const result = await fetchText(url, { timeoutMs: 12_000, fetchImpl: deps.fetchImpl, accept: 'application/json' })
      if (!result.ok) {
        // 429 在 OpenAlex 上是「共享预算被吃光」的典型症状，说清楚才有人知道该配 key
        if (result.status === 429) {
          throw new Error(
            'OpenAlex 限流了（HTTP 429）：不带 key 时是整台机器共享的 0.10 美元/天额度，' +
            '同一出口 IP 上别的程序会把它吃掉。配 OPENALEX_API_KEY（免费；也可以到设置页「搜索」栏填）后是每天 1 美元，工具会自动带上；' +
            '这一轮先用 paper_search 的 source="arxiv" 顶上。',
          )
        }
        throw new Error('OpenAlex 没查成：' + describeFailure(result))
      }
      const hits = parseOpenAlex(parseJson(result.body, 'OpenAlex'), limit)
      if (hits.length === 0) throw new Error('OpenAlex 没搜到「' + query + '」的论文：换个关键词，或去掉年份下限试试')
      deps.log('论文检索', { source, hits: hits.length })
      return formatPapers('论文「' + query + '」', 'OpenAlex', hits)
    }
    if (source === 'arxiv') {
      const url = ARXIV_API + '?search_query=all:' + encodeURIComponent(query) + '&max_results=' + limit
      const result = await fetchText(url, { timeoutMs: 12_000, fetchImpl: deps.fetchImpl, accept: 'application/atom+xml' })
      if (!result.ok) throw new Error('arXiv 没查成：' + describeFailure(result))
      let hits = parseArxivAtom(result.body, limit)
      if (yearFrom !== undefined) hits = hits.filter((hit) => hit.year === '' || Number(hit.year) >= yearFrom)
      if (hits.length === 0) throw new Error('arXiv 没搜到「' + query + '」的论文：换个关键词，或去掉年份下限试试')
      deps.log('论文检索', { source, hits: hits.length })
      return formatPapers('论文「' + query + '」', 'arXiv', hits)
    }
    const url = DBLP_API + '?q=' + encodeURIComponent(query) + '&format=json&h=' + limit
    const result = await fetchText(url, {
      timeoutMs: 12_000,
      fetchImpl: deps.fetchImpl,
      accept: 'application/json',
      // DBLP 忙的时候回 202（排队中）——202 是 ok，不点名就会被当成「搜到 0 条」
      failureStatuses: [202],
      retryableStatuses: [202, 429, 500, 502, 503, 504],
    })
    if (!result.ok) {
      if (result.status === 202) {
        // 202 有两种现实：真在排队（等久了会好），或者撞上了人机验证挑战页
        // （2026-11-20 本机实测：DBLP 现在很可能回一个「正在确认你是不是机器人」的 HTML）
        const challenge = /(机器人|人机|robot|challenge|anubis|验证码)/i.test(result.body.slice(0, 4_000))
        throw new Error(challenge
          ? 'DBLP 给这台机器回了人机验证页（HTTP 202 + 挑战页），这一轮查不了：改用 source="openalex" 或 "arxiv"。'
          : 'DBLP 在排队（HTTP 202，重试一次还没好），等一下再试')
      }
      throw new Error('DBLP 没查成：' + describeFailure(result))
    }
    const hits = parseDblp(parseJson(result.body, 'DBLP'), limit)
    if (hits.length === 0) {
      throw new Error('DBLP 没搜到「' + query + '」的论文：dblp 只收计算机方向的出版物，换个关键词或换 source 试试')
    }
    deps.log('论文检索', { source, hits: hits.length })
    return formatPapers('论文「' + query + '」', 'DBLP', hits)
  }
  async function runPaperRead(rawUrl: string, maxChars: number): Promise<string> {
    const id = arxivIdOf(rawUrl)
    const lines: string[] = []
    let body = ''
    let finalUrl = rawUrl
    let contentType = ''
    if (id !== null) {
      // ar5iv 把 arXiv 论文渲染成 HTML：本机实测 200/122KB/0.8s，比抓 PDF 二进制靠谱得多
      const full = await fetchText(AR5IV_HTML + id, { timeoutMs: 15_000, fetchImpl: deps.fetchImpl, accept: 'text/html' })
      if (full.ok) {
        body = full.body
        finalUrl = full.url
        contentType = full.headers['content-type'] ?? ''
      } else {
        lines.push('（ar5iv 全文页没抓下来：' + describeFailure(full) + '，已退回原链接）')
      }
    }
    if (body === '') {
      const result = await fetchText(rawUrl, { timeoutMs: 15_000, fetchImpl: deps.fetchImpl, accept: 'text/html' })
      if (!result.ok) throw new Error('抓取失败：' + describeFailure(result) + '（' + rawUrl + '）')
      body = result.body
      finalUrl = result.url
      contentType = result.headers['content-type'] ?? ''
    }
    if (/pdf/i.test(contentType) || /^%PDF-/.test(body.slice(0, 8))) {
      throw new Error('这个链接是 PDF，抓不出正文；arXiv 的链接会自动走 ar5iv，其它 PDF 请找 HTML 版')
    }
    const text = htmlToText(body)
    if (text === '') throw new Error('页面抓下来没有正文（可能要登录，或内容全在脚本里）')
    const cut = truncateText(text, maxChars)
    lines.push('来源：' + finalUrl)
    lines.push('')
    lines.push(cut.text)
    if (cut.truncated) lines.push('', '（已截断，原文 ' + cut.total + ' 字）')
    return lines.join('\n')
  }

  async function runRepoSearch(params: {
    query: string
    author: string
    language: string
    minStars: number | undefined
    sort: RepoSort
    limit: number
  }): Promise<string> {
    const token = readGitHubToken(deps)
    const headers = githubHeaders(token)
    const noFilter = params.query === '' && params.language === '' && params.minStars === undefined
    if (params.author === '' && noFilter) {
      throw new Error('至少给 query、author、language、min_stars 里的一样，不然不知道搜什么')
    }

    if (params.author !== '') {
      // 用户名下的仓库走 REST 列表接口：搜索接口按相关性排、且不支持「只看某人」
      const url = GITHUB_API + '/users/' + encodeURIComponent(params.author) + '/repos?sort=updated&per_page=100'
      const result = await fetchText(url, {
        timeoutMs: 12_000,
        fetchImpl: deps.fetchImpl,
        headers,
        accept: 'application/vnd.github+json',
      })
      if (!result.ok) throw gitHubFailure(result)
      let hits = parseGitHubRepos(parseJson(result.body, 'GitHub'), 100)
      if (params.language !== '') {
        const language = params.language.toLowerCase()
        hits = hits.filter((hit) => hit.language.toLowerCase() === language)
      }
      const minStars = params.minStars
      if (minStars !== undefined) hits = hits.filter((hit) => hit.stars >= minStars)
      if (params.query !== '') {
        const needle = params.query.toLowerCase()
        hits = hits.filter((hit) =>
          hit.fullName.toLowerCase().includes(needle) || hit.description.toLowerCase().includes(needle),
        )
      }
      const trimmed = sortRepos(hits, params.sort).slice(0, params.limit)
      if (trimmed.length === 0) {
        throw new Error('「' + params.author + '」名下没有符合条件的仓库（语言/星数/关键词是不是太严了？）')
      }
      deps.log('仓库检索', { mode: 'author', hits: trimmed.length })
      return formatRepos('仓库「' + params.author + '」', trimmed) + rateLimitNote(result)
    }

    const qualifiers: string[] = []
    if (params.query !== '') qualifiers.push(params.query)
    if (params.language !== '') qualifiers.push('language:' + params.language)
    if (params.minStars !== undefined) qualifiers.push('stars:>=' + params.minStars)
    const q = qualifiers.join(' ')
    const url = GITHUB_API + '/search/repositories?q=' + encodeURIComponent(q) +
      '&sort=' + params.sort + '&order=desc&per_page=' + params.limit
    const result = await fetchText(url, {
      timeoutMs: 12_000,
      fetchImpl: deps.fetchImpl,
      headers,
      accept: 'application/vnd.github+json',
    })
    if (!result.ok) throw gitHubFailure(result)
    const hits = parseGitHubRepos(parseJson(result.body, 'GitHub'), params.limit)
    if (hits.length === 0) {
      throw new Error('GitHub 上没有匹配「' + q + '」的仓库：换个关键词，或去掉 min_stars/language 限制')
    }
    deps.log('仓库检索', { mode: 'search', hits: hits.length })
    return formatRepos('仓库「' + q + '」', hits) + rateLimitNote(result)
  }
  function gitHubFailure(result: HttpResult): Error {
    const hint = result.status === 403 || result.status === 429
      ? '（未认证每小时只有 60 次；配 GITHUB_TOKEN 或到设置页「搜索」栏填一枚，能提到 5000）'
      : ''
    return new Error('GitHub 没查成：' + describeFailure(result) + hint)
  }

  /** 额度快见底时主动说一句：不然下一次请求突然 403，看起来像「网断了」。 */
  function rateLimitNote(result: HttpResult): string {
    const raw = result.headers['x-ratelimit-remaining']
    if (raw === undefined) return ''
    const remaining = Number(raw)
    if (!Number.isFinite(remaining) || remaining > 3) return ''
    return '\n（GitHub 额度快用完了（可配 token 提升）：本次还剩 ' + remaining + ' 次/小时）'
  }

  return [
    {
      name: 'web_search',
      description:
        '联网搜网页。默认走搜索引擎（Bing 主，失败退 Sogou），每条结果两行：标题 — 摘要 / URL。\n' +
        'engine=auto（默认）/ bing / sogou；engine=doubao = 拿本机已登录的网页版豆包当搜索引擎：' +
        '它会自己上网找，给你一段整合后的回答 + 它给的来源链接（白嫖、不花 key）。\n' +
        'doubao 档要登录态、慢（几十秒）而且不进 auto：想要「一个答案 / 对比 / 总结」时才用它；' +
        '想要「一堆可点开的链接」仍用 auto。豆包没给链接时输出会明说，别把它的回答当有出处的事实引用。\n' +
        'count 默认 8（1~20，doubao 档用它限制来源条数）；同一 query 5 分钟内走缓存。' +
        '要论文用 paper_search，要代码仓库用 repo_search，不要拿它硬凑。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜什么，一句有内容的话（空字符串会被拒）。' },
          count: { type: 'integer', minimum: 1, maximum: 20, description: '要几条，默认 8。' },
          engine: {
            type: 'string',
            enum: SEARCH_ENGINES,
            description:
              'auto（默认，先 Bing 再 Sogou）/ bing / sogou / doubao（网页版豆包当搜索引擎，' +
              '需已登录、慢、给的是整合答案加来源）。',
          },
        },
        required: ['query'],
      },
      output: OUT,
      timeoutMs: 45_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args)
        const query = asString(input.query)
        if (query === '') throw new Error('搜索词不能为空：query 要写一句有内容的话')
        const count = clampInt(input.count, 1, 20, 8)
        const engine = pickEnum(input.engine, SEARCH_ENGINES, 'auto')
        return runSearch(query, count, engine)
      },
    },
    {
      name: 'paper_search',
      description:
        '搜论文。**默认 auto：先 arXiv（主力，稳定），失败再退 OpenAlex / DBLP（替补）**。\n' +
        '三个源的实际状态（2026-11-20 实测）：arxiv 稳定，带摘要前 200 字；' +
        'openalex 不带 key 是整机共享 0.10 美元/天、容易 429（配 OPENALEX_API_KEY，或在设置页「搜索」栏填一枚）；' +
        'dblp 现在多半回人机验证页。所以除非你明确要 venue/被引数，别指定它们。\n' +
        '每条一行：标题 · 年份 · venue · 被引 N · URL。limit 默认 6；year_from 是最早年份（含）。\n' +
        '要读全文用 paper_read。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词，英文效果最好。' },
          source: {
            type: 'string',
            enum: ['auto', ...PAPER_SOURCES],
            description:
              'auto（默认，arxiv→openalex→dblp 自动兜底）/ arxiv（主力）/ openalex（替补，易 429）/ dblp（替补，常被验证页挡）。',
          },
          year_from: { type: 'integer', minimum: 1900, maximum: 2100, description: '只要这年（含）之后的。' },
          limit: { type: 'integer', minimum: 1, maximum: 20, description: '要几条，默认 6。' },
        },
        required: ['query'],
      },
      output: OUT,
      timeoutMs: 45_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args)
        const query = asString(input.query)
        if (query === '') throw new Error('论文关键词不能为空：query 要写点什么')
        // 默认 auto：arxiv 主力，openalex / dblp 只做兜底（2026-11-20 用户裁决）
        const source = pickEnum(input.source, ['auto', ...PAPER_SOURCES] as const, 'auto')
        const limit = clampInt(input.limit, 1, 20, 6)
        const yearRaw = asString(input.year_from)
        const yearParsed = yearRaw === '' ? 0 : clampInt(yearRaw, 1900, 2100, 0)
        return runPaperSearch(query, source, limit, yearParsed === 0 ? undefined : yearParsed)
      },
    },
    {
      name: 'paper_read',
      description:
        '抓一篇论文/网页的正文，转成纯文本。arXiv 链接（abs 或 pdf 都算）会自动换成 ar5iv 的 HTML 全文再抓；\n' +
        '其它链接走通用 HTML→文本。max_chars 默认 8000，超长会截断并明确说「已截断，原文 N 字」。\n' +
        'PDF 直接链接抓不出正文，别拿它当 PDF 解析器。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '要读的链接（必须 http:// 或 https:// 开头）。' },
          max_chars: { type: 'integer', minimum: 500, maximum: 50_000, description: '最多返回多少字，默认 8000。' },
        },
        required: ['url'],
      },
      output: OUT,
      timeoutMs: 45_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args)
        const url = asString(input.url)
        if (!/^https?:\/\//i.test(url)) throw new Error('URL 要写全（以 http:// 或 https:// 开头）')
        const maxChars = clampInt(input.max_chars, 500, 50_000, 8_000)
        return runPaperRead(url, maxChars)
      },
    },
    {
      name: 'repo_search',
      description:
        '搜 GitHub 仓库（REST，无需 key）。每条两行：owner/name · ★星数 · 语言 · 最近更新 · 一句话描述 / URL。\n' +
        'sort 默认 stars（还支持 updated / forks），limit 默认 8；给了 author 就走该用户名下的仓库再本地过滤。\n' +
        '未认证限速 60 次/小时：剩余额度 ≤3 时结果末尾会提示；配 GITHUB_TOKEN（或在设置页「搜索」栏填）可提到 5000。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '关键词（仓库名/描述里出现），可空。' },
          author: { type: 'string', description: 'GitHub 用户名；给了就只在这个用户名下找。' },
          language: { type: 'string', description: '语言过滤，例如 python / rust。' },
          min_stars: { type: 'integer', minimum: 0, description: '最少星数。' },
          sort: { type: 'string', enum: REPO_SORTS, description: 'stars（默认）/ updated / forks。' },
          limit: { type: 'integer', minimum: 1, maximum: 30, description: '要几条，默认 8。' },
        },
        required: [],
      },
      output: OUT,
      timeoutMs: 45_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args)
        const minStarsRaw = asString(input.min_stars)
        return runRepoSearch({
          query: asString(input.query),
          author: asString(input.author),
          language: asString(input.language),
          minStars: minStarsRaw === '' ? undefined : clampInt(minStarsRaw, 0, 1_000_000, 0),
          sort: pickEnum(input.sort, REPO_SORTS, 'stars'),
          limit: clampInt(input.limit, 1, 30, 8),
        })
      },
    },
    {
      name: 'websearch_guide',
      description:
        '返回「联网搜索」的完整用法（与 skill dafeiyu-websearch 同一份正文）：什么时候用哪个工具、\n' +
        '各上游的限额与已知不可用项。上下文里没有那个 skill、或本机 fetch 不可用时用它兜底。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 15_000,
      async execute(): Promise<string> {
        return deps.guideBody()
      },
    },
  ]
}






