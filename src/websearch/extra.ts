/**
 * websearch/extra —— 三个「定向检索」工具：代码片段、图形学论文、Hacker News。
 *
 * 为什么单独一个文件、还自带 HTTP：核心检索工具（start.ts / tools.ts / http.ts）由另一个
 * agent 在同一个目录里并行施工，这里只出三个直连公开 API 的小工具，不 import 别人还没
 * 写完的文件——少一个共享依赖就少一处互相等，也免得两边对同一个 helper 各改一版。
 *
 * 本机实测（2026-11-20）：
 * - grep.app 的 /api/search 经常 429（Vercel 安全校验），所以「1.5s 后重试一次」，仍失败
 *   就回中文错误让模型改口去用别的工具，而不是把一坨 HTML 当结果返回；
 * - kesen.realtimerendering.com 有版，反倒 www.realtimerendering.com 被 Cloudflare 挡成
 *   403；索引页里的年份链接全都指向 www 那个域名，所以抓年份页前必须先把链接改写到
 *   kesen 主机的同名文件，失败再回退原链接；
 * - 同一台服务器的 Mod_Security 会把过短的 UA 406 掉（实测 'Mozilla/5.0' 直接 Not
 *   Acceptable），所以请求头固定带一个完整的浏览器 UA；
 * - hn.algolia.com 免费无 key，直接出 JSON，是这三个里最稳的。
 */

const KESEN_INDEX_URL = 'https://kesen.realtimerendering.com/'
/** 年份页真正可用的主机（见上面注释：www 那个域名被 Cloudflare 挡了）。 */
const KESEN_HOST = 'https://kesen.realtimerendering.com'
const GREP_APP_API = 'https://grep.app/api/search'
const HN_SEARCH_API = 'https://hn.algolia.com/api/v1/search'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
/** 单次 HTTP 的超时：这三个站点都是小页面，超过 12s 就是被挡了，早点失败早点回中文话。 */
const REQUEST_TIMEOUT_MS = 12_000
/** 429 退避时长（用户实测约定值）。 */
const RATE_LIMIT_BACKOFF_MS = 1_500
/** 代码行裁切长度。 */
const CODE_LINE_MAX = 120
/** 论文最多给 15 条（再多模型也不看）。 */
const PAPER_LIMIT = 15
/** 一年可能有 SIGGRAPH + EG 两三个页面，最多抓这么多页，别让一次调用打满一整年。 */
const KESEN_MAX_PAGES = 3
/** 整次 graphics_papers 的软截止：超过就不再发新请求，余下的按「抓不到」处理。 */
const KESEN_DEADLINE_MS = 35_000

// ── 最小 HTTP 层 ────────────────────────────────────────────────────────────

export interface HttpResponse {
  status: number
  ok: boolean
  text(): Promise<string>
}

/**
 * 只声明用得到的三个成员，不挂 DOM 的 fetch 类型：
 * 这个包编译时 lib 是 ES2022，全局 fetch 来自 @types/node，各版本签名有出入，
 * 窄接口既稳定又方便测试注入假实现。
 */
export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<HttpResponse>

export interface ExtraToolOverrides {
  /** 测试注入用：不打真网。 */
  fetchImpl?: FetchLike
  /** 测试注入用：把 1.5s 退避换成即时。 */
  sleep?: (ms: number) => Promise<void>
  /** 测试注入用：days → numericFilters 要算「现在」，不能写死。 */
  now?: () => number
}

interface Deps {
  fetchImpl: FetchLike
  sleep: (ms: number) => Promise<void>
  now: () => number
}

async function globalFetch(
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
): Promise<HttpResponse> {
  const impl = (globalThis as unknown as { fetch?: FetchLike }).fetch
  if (impl === undefined) throw new Error('当前 Node 没有全局 fetch（需要 Node 20 以上）')
  return impl(input, init)
}

async function httpGet(
  url: string,
  deps: Deps,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<{ status: number; body: string; url: string }> {
  // AbortController 手搓超时：fetch 自己不会超时，卡住的请求会把工具的原生超时一起拖死，
  // 那时模型只看到「工具超时」，看不到是哪个站点没回。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await deps.fetchImpl(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    })
    const body = await response.text()
    return { status: response.status, body, url }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/abort/i.test(message)) {
      throw new Error('请求超时（' + Math.round(timeoutMs / 1000) + ' 秒没响应）：' + url)
    }
    throw new Error('请求失败（' + message + '）：' + url)
  } finally {
    clearTimeout(timer)
  }
}

// ── 剥标签 / 实体 ──────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole: string, name: string) => {
    const key = name.toLowerCase()
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[key] ?? whole
  })
}

/** 文本取用：标签换成空格、合并空白（标题、行号这类「读字」场景）。 */
export function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** 代码取用：标签直接删掉、不补空格（代码里的缩进不能被标签拆开）。 */
function rawTextOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''))
    .replace(/\r/g, '')
    .replace(/[ \t]+$/g, '')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 有些字段是字符串、有些是 { raw } 包一层（grep.app 的 repo/path 就是这样）。 */
function rawOf(value: unknown): string {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  return record === undefined ? '' : asText(record.raw)
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

/** 契约要求：参数传了但没被认出来的键必须显形，不许静默吞掉。 */
function unknownKeys(input: Record<string, unknown>, allowed: string[]): string[] {
  return Object.keys(input).filter((key) => !allowed.includes(key))
}

function ignoredNote(keys: string[]): string {
  return keys.length === 0 ? '' : '（未识别参数：' + keys.join('、') + '）'
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  const rounded = Math.trunc(value)
  return Math.min(max, Math.max(min, rounded))
}

function truncateCode(code: string): string {
  return code.length > CODE_LINE_MAX ? code.slice(0, CODE_LINE_MAX - 1) + '…' : code
}

// ── 1) grep.app：代码搜索 ───────────────────────────────────────────────────

export interface GrepHit {
  repo: string
  path: string
  line: number | null
  code: string
}

/**
 * 从 grep.app 的 snippet HTML 里抠出「命中那一行」。
 * snippet 是 <table> 一行一段的结构（行号在第一个 td、代码在后面），但也见过没有
 * <tr> 的裸片段，所以两条路都留：先按行找带 mark 的，找不到就整段当一行。
 */
export function parseGrepSnippet(snippet: string): { line: number | null; code: string } {
  const rows = [...snippet.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1] ?? '')
  if (rows.length === 0) {
    const code = rawTextOf(snippet.replace(/<\/?(?:mark|em)\b[^>]*>/gi, '')).trim()
    return { line: null, code: truncateCode(code) }
  }
  interface Row {
    line: number | null
    code: string
    matched: boolean
  }
  const parsed: Row[] = rows.map((row) => {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1] ?? '')
    let line: number | null = null
    let codeCell = row
    if (cells.length >= 2) {
      const first = (cells[0] ?? '').trim()
      if (/^\d+$/.test(first)) {
        line = Number.parseInt(first, 10)
        codeCell = cells.slice(1).join('')
      }
    }
    const code = rawTextOf(codeCell.replace(/<\/?(?:mark|em)\b[^>]*>/gi, '')).trim()
    return { line, code, matched: /<mark\b/i.test(row) }
  })
  const chosen = parsed.find((row) => row.matched && row.code !== '') ?? parsed.find((row) => row.code !== '')
  if (chosen === undefined) return { line: null, code: '' }
  return { line: chosen.line, code: truncateCode(chosen.code) }
}

export function parseGrepAppHits(json: unknown, limit: number): { hits: GrepHit[]; total: number } {
  const root = asRecord(json)
  const hitsBlock = asRecord(root === undefined ? undefined : root.hits)
  const rawHits = hitsBlock !== undefined && Array.isArray(hitsBlock.hits) ? hitsBlock.hits : []
  const total = asNumber(hitsBlock === undefined ? undefined : hitsBlock.total) ?? rawHits.length
  const hits: GrepHit[] = []
  for (const item of rawHits) {
    const record = asRecord(item)
    if (record === undefined) continue
    const repo = rawOf(record.repo)
    const path = rawOf(record.path)
    if (repo === '' && path === '') continue
    const content = asRecord(record.content)
    const snippet = asText(content === undefined ? undefined : content.snippet)
    const parsed = parseGrepSnippet(snippet)
    hits.push({ repo, path, line: parsed.line, code: parsed.code })
    if (hits.length >= limit) break
  }
  return { hits, total }
}

// ── 2) kesen：图形学论文索引 ────────────────────────────────────────────────

export interface KesenPageLink {
  /** 会议短名（SIGGRAPH / EG / ICCP…），索引页文字里取，取不到退回文件名前缀。 */
  conf: string
  year: number
  url: string
}

export interface KesenPaper {
  title: string
  url: string
}

export interface KesenHit extends KesenPaper {
  conf: string
  year: number
}

function fileStem(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const last =
      pathname
        .split('/')
        .filter((part) => part !== '')
        .pop() ?? ''
    return last.replace(/\.html?$/i, '')
  } catch {
    return url.replace(/^.*\//, '').replace(/\.html?$/i, '')
  }
}

/**
 * 索引页解析：只认「链接文字或链接文件名里带四位年份、且是 .html/.htm」的锚点。
 * 索引页上还有一堆导航链接（Real-Time Rendering、作者主页、changelog），
 * 靠「有没有年份」这一条就能把它们全滤掉，不用维护黑名单。
 */
export function parseKesenIndex(html: string, baseUrl: string = KESEN_INDEX_URL): KesenPageLink[] {
  const links: KesenPageLink[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,240}?)<\/a>/gi)) {
    const href = decodeEntities((match[1] ?? '').trim())
    if (!/\.html?($|[?#])/i.test(href)) continue
    const text = textOf(match[2] ?? '')
    const yearInText = /((?:19|20)\d{2})/.exec(text)
    const yearInHref = /((?:19|20)\d{2})\.html?($|[?#])/i.exec(href)
    const yearText = yearInText === null ? (yearInHref === null ? undefined : yearInHref[1]) : yearInText[1]
    if (yearText === undefined || yearText === null) continue
    const year = Number.parseInt(yearText, 10)
    let conf = text
      .replace(/(?:19|20)\d{2}/g, ' ')
      .replace(/[^A-Za-z]+/g, ' ')
      .trim()
      .toUpperCase()
    if (conf === '') {
      // 老页面链接文字只有「2013」这种，退一步用文件名前缀（conference2013 → CONFERENCE）。
      conf = fileStem(href)
        .replace(/[^A-Za-z]+/g, ' ')
        .replace(/\b(?:19|20)\d{2}\b/g, '')
        .trim()
        .toUpperCase()
    }
    if (conf === '') continue
    const url = resolveUrl(href, baseUrl)
    const key = conf + '|' + String(year) + '|' + url
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ conf, year, url })
  }
  return links
}

/**
 * 把页面 URL 排成「先试哪个」的顺序。
 * 索引页里的年份链接指向 www.realtimerendering.com（Cloudflare 403），同路径在
 * kesen.realtimerendering.com 上是 200 —— 所以 realtimerendering 家族的链接先改写主机；
 * 外站（trowley.org 之类）先原样试，再退回 kesen 镜像。
 */
export function kesenPageCandidates(url: string): string[] {
  const ordered: string[] = []
  const push = (candidate: string): void => {
    if (candidate !== '' && !ordered.includes(candidate)) ordered.push(candidate)
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return [url]
  }
  const stem =
    parsed.pathname
      .split('/')
      .filter((part) => part !== '')
      .pop() ?? ''
  const mirror = stem === '' ? '' : KESEN_HOST + '/' + stem
  const isRealTimeHouse = /(^|\.)realtimerendering\.com$/i.test(parsed.hostname)
  if (mirror === '' || mirror === url) {
    push(url)
  } else if (isRealTimeHouse) {
    push(mirror)
    push(url)
  } else {
    push(url)
    push(mirror)
  }
  return ordered
}

function normalizeConf(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, '').toUpperCase()
}

/**
 * 从年份页文件名里榨出「会议主键」：siga2024Papers.htm → SIGA、sig2024.html → SIG、
 * egsr2024Papers.htm → EGSR。文件名比链接文字更稳定（文字会写成「SIGGRAPH Asia 2024」
 * 这种全称），所以拿它当第一档匹配依据。
 */
function stemKey(url: string): string {
  return normalizeConf(
    fileStem(url)
      .replace(/papers?$/i, '')
      .replace(/(?:19|20)\d{2}/g, ''),
  )
}

function isSubsequence(short: string, long: string): boolean {
  // 单个字母太容易误命中（S 能命中一切），两字母以上才做顺序匹配。
  if (short.length < 2) return false
  let cursor = 0
  for (const char of long) {
    if (char === short[cursor]) cursor += 1
    if (cursor === short.length) return true
  }
  return false
}

/**
 * 会议过滤的匹配档位，越小越硬（取当轮最小档，其余档整批丢掉）：
 *   1 文件名主键全等 —— SIGA 只命中 sgia2024Papers.htm 这种 SIGGRAPH Asia 页；
 *   2 链接文字全等 —— SIGGRAPH 只命中主会，不会把「SIGGRAPH Asia」也算进来；
 *   3 一方是另一方的前缀 —— SIG / SIGGRA 这类手打半截也能用；
 *   4 一方完整包含另一方 —— ASIA / EUROGRAPHICS 这种写全称的；
 *   5 缩写按顺序出现 —— SIGA ⊂ SIGGRAPH（该年没有 SIGGRAPH Asia 页时才走这档）。
 * 分档是为了不误伤：只做「包含/顺序」匹配的话，写 SIGA 会同时拿到主会和 Asia 两批论文。
 */
function confTier(label: string, stem: string, conf: string): number {
  const wanted = normalizeConf(conf)
  if (wanted === '') return 0
  const normalizedLabel = normalizeConf(label)
  if (stem === wanted) return 1
  if (normalizedLabel === wanted) return 2
  if (normalizedLabel.startsWith(wanted) || wanted.startsWith(normalizedLabel)) return 3
  if (stem.startsWith(wanted) || wanted.startsWith(stem)) return 3
  if (normalizedLabel.includes(wanted) || wanted.includes(normalizedLabel)) return 4
  if (stem.includes(wanted) || wanted.includes(stem)) return 4
  if (isSubsequence(wanted, normalizedLabel) || isSubsequence(wanted, stem)) return 5
  return 0
}

/** 同一年里有多个页面时，SIGGRAPH 优先（用户默认想看的就是它），其余按名字排。 */
function pageRank(link: KesenPageLink): number {
  if (link.conf.startsWith('SIGGRAPH')) return 0
  if (link.conf === 'EG' || link.conf.startsWith('EUROGRAPHICS')) return 1
  return 2
}

export function pickKesenPages(links: KesenPageLink[], year: number, conf?: string): KesenPageLink[] {
  const sameYear = links.filter((link) => link.year === year)
  const wanted = conf === undefined ? '' : conf.trim()
  let filtered = sameYear
  if (wanted !== '') {
    const scored = sameYear.map((link) => ({ link, tier: confTier(link.conf, stemKey(link.url), wanted) }))
    const matched = scored.filter((item) => item.tier > 0)
    if (matched.length === 0) {
      filtered = []
    } else {
      // 只留最硬的那一档：SIGA 有 Asia 页时不要再把主会论文混进来。
      const best = Math.min(...matched.map((item) => item.tier))
      filtered = matched.filter((item) => item.tier === best).map((item) => item.link)
    }
  }
  return filtered.slice().sort((left, right) => {
    const rank = pageRank(left) - pageRank(right)
    return rank !== 0 ? rank : left.conf.localeCompare(right.conf)
  })
}

/**
 * 年份页解析：正文是 <dl><dt><B>标题</B> + 若干「Abstract / Preprint / Video」图标链接</dt>
 * <dd>作者</dd>。所以标题取第一个 <B>，链接按「.pdf 直链 → Author Preprint → Paper
 * Abstract → 第一个外链」的顺序挑——kesen 多数条目给的是 preprint 页面而不是 PDF 直链，
 * 只认 .pdf 会把大半条目丢掉。
 */
export function parseKesenPapers(html: string, baseUrl: string = KESEN_INDEX_URL): KesenPaper[] {
  const papers: KesenPaper[] = []
  const seen = new Set<string>()
  for (const block of html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi)) {
    const body = block[1] ?? ''
    const bold = /<b[^>]*>([\s\S]*?)<\/b>/i.exec(body)
    let title = bold === null ? '' : textOf(bold[1] ?? '')
    if (title === '') title = textOf(body.split(/<a\s/i)[0] ?? '')
    if (title === '') continue
    const anchors = [...body.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => ({ href: decodeEntities((match[1] ?? '').trim()), inner: match[2] ?? '' }))
      .filter((anchor) => anchor.href !== '' && !/^mailto:/i.test(anchor.href))
    const pdf = anchors.find((anchor) => /\.pdf($|[?#])/i.test(anchor.href))
    const preprint = anchors.find((anchor) => /alt\s*=\s*["']author preprint["']/i.test(anchor.inner))
    const abstract = anchors.find((anchor) => /alt\s*=\s*["']paper abstract["']/i.test(anchor.inner))
    const chosen = pdf ?? preprint ?? abstract ?? anchors[0]
    const url = chosen === undefined ? '' : resolveUrl(chosen.href, baseUrl)
    const key = title + '|' + url
    if (seen.has(key)) continue
    seen.add(key)
    papers.push({ title, url })
  }
  return papers
}

// ── 3) hn.algolia：Hacker News ─────────────────────────────────────────────

export interface HnHit {
  title: string
  points: number
  comments: number
  date: string
  url: string
}

export function parseHnHits(json: unknown, limit: number): HnHit[] {
  const root = asRecord(json)
  const rawHits = root !== undefined && Array.isArray(root.hits) ? root.hits : []
  const hits: HnHit[] = []
  for (const item of rawHits) {
    const record = asRecord(item)
    if (record === undefined) continue
    const title = asText(record.title).trim()
    // Algolia 的 search 会把评论也搜出来，评论条没有 title —— 丢掉，否则一屏全是「无标题」。
    if (title === '') continue
    const objectId = asText(record.objectID)
    const external = asText(record.url).trim()
    const createdAt = asText(record.created_at)
    const fallback = objectId === '' ? '' : 'https://news.ycombinator.com/item?id=' + objectId
    hits.push({
      title,
      points: asNumber(record.points) ?? 0,
      comments: asNumber(record.num_comments) ?? 0,
      date: createdAt === '' ? '' : createdAt.slice(0, 10),
      url: external !== '' ? external : fallback,
    })
    if (hits.length >= limit) break
  }
  return hits
}

export function buildHnUrl(query: string, limit: number, days: number | undefined, nowMs: number): string {
  const params = new URLSearchParams({ query, hitsPerPage: String(limit) })
  // 只要 story：search 端点默认连评论一起搜，评论条没有标题也没有分数，对用户没意义。
  params.set('tags', 'story')
  if (days !== undefined) {
    const since = Math.floor(nowMs / 1000) - days * 86_400
    // Algolia 的 numericFilters 语法：字段 + 比较符 + 值；多个条件用逗号（AND）。
    params.set('numericFilters', 'created_at_i>' + String(since))
  }
  return HN_SEARCH_API + '?' + params.toString()
}

// ── 工具定义 ───────────────────────────────────────────────────────────────

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
  ],
}

export function buildExtraTools(overrides: ExtraToolOverrides = {}): Array<Record<string, unknown>> {
  const deps: Deps = {
    fetchImpl: overrides.fetchImpl ?? globalFetch,
    sleep: overrides.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))),
    now: overrides.now ?? (() => Date.now()),
  }

  return [
    {
      name: 'code_search',
      description:
        '在 GitHub 公开仓库里搜代码片段（grep.app，免费无 key）。\n' +
        '何时用：想找某个 API/函数/配置项在真实项目里怎么写（例：requestAnimationFrame 的循环写法、某个构建配置字段）。\n' +
        '返回：仓库/路径:行号 + 命中那一行代码（裁到 120 字）。limit 默认 6，上限 20。\n' +
        'language 可选（TypeScript / Python / Rust…），只做服务端过滤，大小写写错会过滤成空。\n' +
        '注意：grep.app 常被限流，429 时会自动等 1.5 秒重试一次；仍失败会直接报「暂时被限流」，这时别硬重试，改用 repo_search 或 web_search。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要搜的代码关键词（函数名、API、配置字段），别整句自然语言。' },
          language: { type: 'string', description: '可选：按语言过滤，例如 TypeScript、Python、Rust。' },
          limit: { type: 'number', description: '返回条数，默认 6，上限 20。' },
        },
        required: ['query'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args) ?? {}
        const ignored = unknownKeys(input, ['query', 'language', 'limit'])
        const query = asText(input.query).trim()
        if (query === '') throw new Error('query 不能为空：要搜的代码关键词（函数名、API、配置字段）得给一个。')
        const language = asText(input.language).trim()
        const limit = clampInt(asNumber(input.limit), 6, 1, 20)

        const params = new URLSearchParams({ q: query })
        if (language !== '') params.set('f.lang', language)
        const url = GREP_APP_API + '?' + params.toString()

        let response = await httpGet(url, deps)
        if (response.status === 429) {
          // 429 是常态（Vercel 安全校验），一次退避通常能过；重试只做一次，避免把工具超时耗干。
          await deps.sleep(RATE_LIMIT_BACKOFF_MS)
          response = await httpGet(url, deps)
        }
        if (response.status === 429) {
          throw new Error('代码搜索暂时被限流，稍后再试或改用 repo_search')
        }
        if (response.status === 403 || response.status === 503) {
          throw new Error(
            'grep.app 拒绝了这次请求（HTTP ' +
              String(response.status) +
              '，多半是安全校验），稍后再试或改用 repo_search',
          )
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            'grep.app 返回 HTTP ' + String(response.status) + '，代码搜索暂时不可用，稍后再试或改用 repo_search',
          )
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(response.body)
        } catch {
          // 被拦的时候它回的是 HTML 校验页而不是 JSON —— 说清楚是「被拦」，别当成「没结果」。
          throw new Error('grep.app 返回的不是 JSON（可能被安全校验拦截），稍后再试或改用 repo_search')
        }
        const { hits, total } = parseGrepAppHits(parsed, limit)
        const ignoredLine = ignoredNote(ignored)
        if (hits.length === 0) {
          return ['grep.app 代码搜索「' + query + '」没有命中（共 0 条）', ignoredLine]
            .filter((line) => line !== '')
            .join('\n')
        }
        const lines = ['grep.app 代码搜索「' + query + '」· ' + String(hits.length) + ' / ' + String(total) + ' 条']
        for (let index = 0; index < hits.length; index += 1) {
          const hit = hits[index]
          if (hit === undefined) continue
          const lineNo = hit.line === null ? '?' : String(hit.line)
          lines.push(String(index + 1) + '. ' + hit.repo + '/' + hit.path + ':' + lineNo)
          if (hit.code !== '') lines.push('   ' + hit.code)
        }
        if (ignoredLine !== '') lines.push(ignoredLine)
        return lines.join('\n')
      },
    },
    {
      name: 'graphics_papers',
      description:
        '抓 Ke-Sen Huang 的图形学论文索引（kesen.realtimerendering.com），列出某一年/某个会议的论文标题 + 链接，最多 15 条。\n' +
        '何时用：想找 SIGGRAPH / Eurographics(EG) 某年的论文清单、某篇图形学论文的 preprint 链接。\n' +
        'year 缺省取索引页里最新的一年（那年还没放出论文时自动回退前两年，输出会写明实际用了哪年）。\n' +
        'conf 可选：SIGGRAPH、EG、ICCP 等；SIGA 这种缩写也能命中 SIGGRAPH。\n' +
        '注意：这个站点有防护，抓不到或解析不到时会明确说「页面结构变了」，不会静默返回空列表。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'number', description: '可选：四位年份，如 2024。缺省取索引页里最新的一年。' },
          conf: { type: 'string', description: '可选：会议过滤，如 SIGGRAPH、EG、SIGA（SIGA 命中 SIGGRAPH）。' },
        },
        required: [],
      },
      output: OUT,
      timeoutMs: 45_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args) ?? {}
        const ignored = unknownKeys(input, ['year', 'conf'])
        const confRaw = asText(input.conf).trim()
        const conf = confRaw === '' ? undefined : confRaw
        const yearInput = asNumber(input.year)
        if (yearInput !== undefined && (!Number.isInteger(yearInput) || yearInput < 1990 || yearInput > 2100)) {
          throw new Error('year 不像个年份：' + String(yearInput) + '（要四位整数，例如 2024）')
        }

        const index = await httpGet(KESEN_INDEX_URL, deps)
        if (index.status < 200 || index.status >= 300) {
          throw new Error(
            'kesen 索引页打不开（HTTP ' + String(index.status) + '），图形学论文暂时查不了：' + KESEN_INDEX_URL,
          )
        }
        const links = parseKesenIndex(index.body, KESEN_INDEX_URL)
        if (links.length === 0) {
          throw new Error('kesen 索引页解析不到任何年份链接，页面结构变了（页面：' + KESEN_INDEX_URL + '）')
        }
        const years = [...new Set(links.map((link) => link.year))].sort((left, right) => right - left)
        const latest = years[0] ?? new Date(deps.now()).getUTCFullYear()
        // 最新那年常常只挂了个空壳（会议还没开），给两年回退，省得用户每次都手填 year。
        const attempts = yearInput === undefined ? [latest, latest - 1, latest - 2] : [yearInput]

        const deadline = deps.now() + KESEN_DEADLINE_MS
        const collected: KesenHit[] = []
        const usedPages: string[] = []
        let usedYear: number | null = null
        let lastProblem = ''
        /** 「页面结构变了」比「镜像 404」更能说明问题，跨页面记一次，最后优先报它。 */
        let structureProblem = ''

        for (const year of attempts) {
          const pages = pickKesenPages(links, year, conf)
          if (pages.length === 0) {
            lastProblem =
              yearInput === undefined
                ? String(year) + ' 年在索引页上没有对应的年份页'
                : String(year) +
                  ' 年' +
                  (conf === undefined ? '' : '、' + conf) +
                  '在索引页上没有对应的年份页（可用的年份：' +
                  years.slice(0, 8).join('、') +
                  '）'
            continue
          }
          const papers: KesenHit[] = []
          for (const page of pages.slice(0, KESEN_MAX_PAGES)) {
            if (deps.now() > deadline) {
              lastProblem = '抓取超过 ' + String(Math.round(KESEN_DEADLINE_MS / 1000)) + ' 秒预算，已放弃剩余页面'
              break
            }
            const pagePapers: KesenHit[] = []
            const failures: string[] = []
            for (const candidate of kesenPageCandidates(page.url).slice(0, 2)) {
              try {
                const response = await httpGet(candidate, deps)
                if (response.status < 200 || response.status >= 300) {
                  failures.push('HTTP ' + String(response.status) + '（' + candidate + '）')
                  continue
                }
                const parsedPapers = parseKesenPapers(response.body, candidate)
                if (parsedPapers.length === 0) {
                  // 页面能打开却没有 <dt> 论文块 —— 几乎只有一种解释：站点改版了。
                  failures.push('页面里解析不到论文，页面结构变了（' + candidate + '）')
                  continue
                }
                usedPages.push(candidate)
                for (const paper of parsedPapers) pagePapers.push({ ...paper, conf: page.conf, year: page.year })
                break
              } catch (error) {
                failures.push(error instanceof Error ? error.message : String(error))
              }
            }
            if (pagePapers.length > 0) {
              for (const paper of pagePapers) papers.push(paper)
            } else {
              // 两个候选都没成：优先报「页面结构变了」，它比「镜像 404」更能说明问题。
              const structure = failures.find((item) => item.includes('页面结构变了'))
              if (structure !== undefined && structureProblem === '') structureProblem = structure
              lastProblem = structure !== undefined ? structure : (failures[0] ?? lastProblem)
            }
          }
          if (papers.length > 0) {
            for (const paper of papers) {
              if (collected.some((existing) => existing.title === paper.title && existing.url === paper.url)) continue
              if (collected.length >= PAPER_LIMIT) break
              collected.push(paper)
            }
            usedYear = year
            break
          }
        }

        if (collected.length === 0) {
          throw new Error(
            '图形学论文解析不到内容：' +
              (structureProblem !== '' ? structureProblem : lastProblem === '' ? '页面结构变了' : lastProblem) +
              '（索引页：' +
              KESEN_INDEX_URL +
              '）' +
              ignoredNote(ignored),
          )
        }

        const lines = [
          'kesen 图形学论文 · ' + String(usedYear ?? '未知') + ' 年 · ' + String(collected.length) + ' 条',
          '（来源：' + (usedPages.join('、') === '' ? KESEN_INDEX_URL : usedPages.join('、')) + '）',
        ]
        for (let index = 0; index < collected.length; index += 1) {
          const paper = collected[index]
          if (paper === undefined) continue
          lines.push(String(index + 1) + '. ' + paper.title + ' — ' + paper.conf + ' ' + String(paper.year))
          if (paper.url !== '') lines.push('   ' + paper.url)
        }
        const ignoredLine = ignoredNote(ignored)
        if (ignoredLine !== '') lines.push(ignoredLine)
        return lines.join('\n')
      },
    },
    {
      name: 'hn_search',
      description:
        '搜 Hacker News（hn.algolia.com，免费 JSON）：按关键词找讨论，返回标题 · 分数 · 评论数 · 时间 · 链接。\n' +
        '何时用：想知道某个技术/项目/新闻在 HN 上有没有讨论、热度和社区观点（例：Vulkan、bun runtime）。\n' +
        'days 可选：只取最近 N 天（内部换算成 created_at_i > 现在-N*86400 秒）。limit 默认 8，上限 20。\n' +
        '输出每条一行；没有外链的（Ask HN / Show HN 自帖）用 HN item 链接兜底。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词，例如 Vulkan、bun runtime。' },
          days: { type: 'number', description: '可选：只取最近 N 天内的帖子（正整数）。' },
          limit: { type: 'number', description: '返回条数，默认 8，上限 20。' },
        },
        required: ['query'],
      },
      output: OUT,
      timeoutMs: 20_000,
      async execute(args: unknown): Promise<string> {
        const input = asRecord(args) ?? {}
        const ignored = unknownKeys(input, ['query', 'days', 'limit'])
        const query = asText(input.query).trim()
        if (query === '') throw new Error('query 不能为空：要搜的 HN 关键词得给一个。')
        const limit = clampInt(asNumber(input.limit), 8, 1, 20)
        const daysInput = asNumber(input.days)
        if (daysInput !== undefined && daysInput <= 0) throw new Error('days 要给正整数（最近多少天），例如 30。')
        const days = daysInput === undefined ? undefined : Math.trunc(daysInput)

        const url = buildHnUrl(query, limit, days, deps.now())
        const response = await httpGet(url, deps)
        if (response.status < 200 || response.status >= 300) {
          throw new Error('HN 搜索接口返回 HTTP ' + String(response.status) + '，暂时查不了，稍后再试')
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(response.body)
        } catch {
          throw new Error('HN 搜索接口返回的不是 JSON（可能被中间层改写），稍后再试')
        }
        const hits = parseHnHits(parsed, limit)
        const scope = days === undefined ? '全部时间' : '最近 ' + String(days) + ' 天'
        const ignoredLine = ignoredNote(ignored)
        if (hits.length === 0) {
          return ['Hacker News 搜索「' + query + '」没找到（' + scope + '）', ignoredLine]
            .filter((line) => line !== '')
            .join('\n')
        }
        const lines = ['Hacker News 搜索「' + query + '」· ' + String(hits.length) + ' 条（' + scope + '）']
        for (let index = 0; index < hits.length; index += 1) {
          const hit = hits[index]
          if (hit === undefined) continue
          const date = hit.date === '' ? '未知时间' : hit.date
          lines.push(
            String(index + 1) +
              '. ' +
              hit.title +
              ' · ' +
              String(hit.points) +
              ' points · ' +
              String(hit.comments) +
              ' 评论 · ' +
              date +
              ' · ' +
              hit.url,
          )
        }
        if (ignoredLine !== '') lines.push(ignoredLine)
        return lines.join('\n')
      },
    },
  ]
}
