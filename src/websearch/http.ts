/**
 * websearch/http —— 联网搜索四个工具共用的唯一出口。
 *
 * 为什么只有一条出口：Bing/Sogou/OpenAlex/arXiv/DBLP/GitHub 六个上游的差别只在
 * 「URL、Accept、重试状态码」，其余（UA、超时、429/5xx 退避、中文报错、
 * HTML 实体解码、HTML→文本）一旦各写一份，就会出现「这个工具能解实体、那个不能」
 * 的漂移。所以解析器可以在别处，**网络与文本清洗只能在这里**。
 *
 * 两条纪律：
 * 1. 失败一定带**中文原因**（工具 execute 会把它原样抛给模型，模型再转述给用户）；
 *    HTTP 状态码要露出来，否则「搜不出来」永远分不清是 DNS 还是 403。
 * 2. 永远不 throw 出本模块：调用方拿 HttpResult，由它决定是退避、换引擎还是报错。
 */

/** 统一 UA：几个上游都会按 UA 判「是不是浏览器」。用桌面 Chrome 的形态最稳。 */
export const SEARCH_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** 上游返回（\`fetch\` 的可注入替身），测试里塞假实现，免得测试联网。 */
export interface FetchLikeResponse {
  ok: boolean
  status: number
  url?: string
  headers: {
    forEach?: (callback: (value: string, key: string) => void) => void
    get?: (key: string) => string | null
  }
  text: () => Promise<string>
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; redirect?: 'follow' },
) => Promise<FetchLikeResponse>

export interface HttpResult {
  ok: boolean
  /** HTTP 状态码；0 = 请求根本没发出去（超时/网络/DNS） */
  status: number
  /** 跟随重定向之后的最终 URL（拿不到就回原 URL） */
  url: string
  body: string
  /** 头名一律小写，方便直接读 x-ratelimit-remaining 这类字段 */
  headers: Record<string, string>
  /** 只在 status === 0 时有值：中文原因（超时 / 网络失败） */
  error?: string
}

export interface FetchTextOptions {
  /** 单次请求的超时（毫秒）。默认 8 秒——Bing 本机实测 350ms，8 秒够宽。 */
  timeoutMs?: number
  /** 额外请求头（会与默认 UA / Accept 合并，同名覆盖）。 */
  headers?: Record<string, string>
  accept?: string
  /** 失败后**再试几次**。默认 1（= 最多两轮），对应「429/5xx 退避重试一次」。 */
  retries?: number
  /** 需要退避重试的状态码。默认 429 + 5xx。 */
  retryableStatuses?: number[]
  /**
   * 这些状态码**算失败**（即使 2xx）。
   * DBLP 排队时回 202（= ok），不这么写就会被当成「搜到 0 条」。
   */
  failureStatuses?: number[]
  /** 重试前等多久。默认 600ms；测试里给 1ms，不然一个用例要等半秒。 */
  retryDelayMs?: number
  fetchImpl?: FetchLike
}

/**
 * 重试前的等待。
 * ⚠️ **不许 unref**：实测（2026-11-20）单文件 CLI 里 429 退回重试时，unref 掉的定时器
 * 让事件循环当场排空，Node 带着「unsettled top-level await」直接退出——看起来像工具卡死。
 * 600ms 的引用不会拖住任何东西，别为了「优雅退出」把正确性搭进去。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function flattenHeaders(headers: FetchLikeResponse['headers']): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    if (typeof headers.forEach === 'function') {
      headers.forEach((value, key) => {
        out[String(key).toLowerCase()] = String(value)
      })
    } else if (typeof headers.get === 'function') {
      // 替身头只认几个我们真会读的字段
      for (const key of ['content-type', 'x-ratelimit-remaining', 'x-ratelimit-limit']) {
        const value = headers.get(key)
        if (value !== null) out[key] = value
      }
    }
  } catch {
    /* 头读不出来不该让整次请求失败 */
  }
  return out
}

function describeError(error: unknown, timeoutMs: number, aborted: boolean): string {
  if (aborted) return '请求超时（超过 ' + Math.round(timeoutMs / 1000) + ' 秒没有回应）'
  const message = String((error as Error)?.message ?? error)
  if (/abort/i.test(message)) return '请求被中断（超时或调用方取消）'
  return '网络请求失败：' + message.slice(0, 160)
}

/**
 * 一次 GET，取文本。带 UA / Accept / 超时 / 退避重试，**不抛**。
 * 返回值里 ok=false 的三种含义：status=0 是没发出去、status=403 是被拦、
 * status=5xx 是上游挂了——调用方靠 status 区分，别只看 ok。
 */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<HttpResult> {
  // 全局 fetch 的 Response 与 FetchLikeResponse 结构相同但类型不兼容，走 unknown 转一次
  const impl = options.fetchImpl ?? (globalThis as unknown as { fetch?: FetchLike }).fetch
  if (typeof impl !== 'function') {
    return {
      ok: false,
      status: 0,
      url,
      body: '',
      headers: {},
      error: '这台机器没有可用的 fetch（Node 18 以下），联网搜索用不了',
    }
  }

  const timeoutMs = options.timeoutMs ?? 8_000
  const retries = Math.max(0, options.retries ?? 1)
  const retryable = options.retryableStatuses ?? [429, 500, 502, 503, 504]
  const failures = options.failureStatuses ?? []
  const headers: Record<string, string> = {
    'user-agent': SEARCH_UA,
    accept: options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
    ...options.headers,
  }

  let last: HttpResult = {
    ok: false,
    status: 0,
    url,
    body: '',
    headers: {},
    error: '请求没有执行',
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(options.retryDelayMs ?? 600)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await impl(url, { headers, signal: controller.signal, redirect: 'follow' })
      let body = ''
      try {
        body = await response.text()
      } catch {
        body = ''
      }
      const status = Number(response.status) || 0
      const finalUrl = typeof response.url === 'string' && response.url !== '' ? response.url : url
      last = {
        // 空 body 也算失败：200 但 0 字节说明对面在耍人（常见于软拦）
        ok: response.ok && body !== '' && !failures.includes(status),
        status,
        url: finalUrl,
        body,
        headers: flattenHeaders(response.headers),
      }
    } catch (error) {
      last = {
        ok: false,
        status: 0,
        url,
        body: '',
        headers: {},
        error: describeError(error, timeoutMs, controller.signal.aborted),
      }
    } finally {
      clearTimeout(timer)
    }

    if (last.ok) return last
    // 状态码 0（网络/超时）也值得再试一次：本机能直连时这类抖动很常见
    const worthRetry = last.status === 0 || retryable.includes(last.status) || failures.includes(last.status)
    if (!worthRetry) return last
  }
  return last
}

/** 把一次失败翻成一句中文（模型会原样转述，别只说「失败」）。 */
export function describeFailure(result: HttpResult): string {
  if (result.status === 0) return result.error ?? '请求没发出去'
  if (result.status === 429) return 'HTTP 429（被限流，歇一会儿再试）'
  if (result.status === 403) return 'HTTP 403（被拦）'
  if (result.status >= 500) return 'HTTP ' + result.status + '（上游自己挂了）'
  return 'HTTP ' + result.status
}

/** 常用命名实体。够覆盖搜索结果里的 &amp; / &nbsp; / 破折号引号这些。 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  middot: '·',
  bull: '•',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  times: '×',
  divide: '÷',
  deg: '°',
  plusmn: '±',
  frac12: '½',
  eacute: 'é',
  egrave: 'è',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  szlig: 'ß',
  agrave: 'à',
  ccedil: 'ç',
}

/** 解 HTML 实体（命名 + 十进制 + 十六进制）。认不出的原样留着——宁可难看也别丢信息。 */
export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input
  return input.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole
      try {
        return String.fromCodePoint(code)
      } catch {
        return whole
      }
    }
    const hit = NAMED_ENTITIES[body.toLowerCase()]
    return hit === undefined ? whole : hit
  })
}

/**
 * HTML → 纯文本。
 *
 * 顺序是有讲究的：先删 script/style（不然它们的正文会混进结果），
 * 再把「块级结束标签」换成换行（否则整页挤成一行、模型分不清标题和正文），
 * 最后才剥标签 + 解实体（反过来的话 &lt;div&gt; 会被当成标签删掉）。
 */
export function htmlToText(html: string): string {
  if (html === '') return ''
  let text = html.replace(/<!--[\s\S]*?-->/g, ' ')
  // 整段删掉这些容器（不写反向引用，免得正则和转义层互相打架）
  text = text.replace(
    /<(script|style|noscript|template|svg|iframe|head|object)\b[^>]*>[\s\S]*?<\/[a-zA-Z][a-zA-Z0-9]*\s*>/gi,
    ' ',
  )
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote|pre|table|ul|ol)\s*>/gi, '\n')
  text = text.replace(/<[^>]*>/g, ' ')
  text = decodeEntities(text)
  text = text.replace(/[ \t\f\v\u00a0]+/g, ' ')
  text = text.replace(/ *\n */g, '\n')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/** 一行以内的字段清洗：剥标签 → 解实体 → 压空白。 */
export function inlineText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * base64url 解码（Bing 的 \`ck/a?u=a1<base64url>\` 靠它还原真实链接）。
 * 只接受解出 http(s) 的结果：解出乱码时返回 null，让调用方保留原链。
 */
export function decodeBase64Url(value: string): string | null {
  const cleaned = value.trim().replace(/-/g, '+').replace(/_/g, '/')
  if (cleaned === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null
  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4)
  let decoded = ''
  try {
    decoded = Buffer.from(padded, 'base64').toString('utf8')
  } catch {
    return null
  }
  // 解出来的东西必须是链接：否则说明这不是我们要的那种 payload
  return /^https?:\/\/\S+$/i.test(decoded) ? decoded : null
}

/** 相对链接 → 绝对链接（解析不了就原样返回）。 */
export function absoluteUrl(href: string, base: string): string {
  const raw = href.trim()
  if (raw === '') return ''
  try {
    return new URL(raw, base).toString()
  } catch {
    return raw
  }
}

/** 超长截断。返回原文总字数，让工具能照实说「已截断，原文 N 字」。 */
export function truncateText(text: string, maxChars: number): { text: string; total: number; truncated: boolean } {
  const total = text.length
  if (total <= maxChars) return { text, total, truncated: false }
  return { text: text.slice(0, maxChars), total, truncated: true }
}

/**
 * 带 TTL 的小缓存（web_search_fy 的「同一 query 5 分钟」用）。
 * 有上限：搜索词是模型生成的，不设界就是一个吃内存的洞。
 */
export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  readonly size: number
  clear(): void
}

export function createTtlCache<T>(ttlMs: number, maxEntries = 64, now: () => number = Date.now): TtlCache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>()
  return {
    get(key: string): T | undefined {
      const hit = store.get(key)
      if (hit === undefined) return undefined
      if (hit.expiresAt <= now()) {
        store.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key: string, value: T): void {
      // Map 保序：先删再插 = 刷新 LRU 位置
      store.delete(key)
      store.set(key, { value, expiresAt: now() + ttlMs })
      while (store.size > maxEntries) {
        const oldest = store.keys().next()
        if (oldest.done === true) break
        store.delete(oldest.value)
      }
    },
    get size(): number {
      return store.size
    },
    clear(): void {
      store.clear()
    },
  }
}
