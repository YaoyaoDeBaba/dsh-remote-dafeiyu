/**
 * websearch/webai/site —— 「把网页版豆包当搜索引擎」的站点适配器。
 *
 * 三条原则（与识图插件的 `vision/web/sites.ts` 同源，改版时少挨打）：
 *
 * 1. **选择器只在这一个文件里**：输入框、回答候选、忙标记、引用候选、登录探针全在上面的表里。
 *    前端一改版，只改这张表 + 补一条判据，流程代码一个字不动。
 * 2. **抽取走「候选列表 + 兜底」**：第一顺位失效不会直接空手而归；引用同理——
 *    先按选择器捞，再退回"从回答 HTML 里正则捞外链"，两条都没捞到就返回空数组（**绝不编链接**）。
 * 3. **完成判据不看"有文本"**：必须「文本连续 N 次采样不变」+「没有停止生成按钮」+「有超时上限」。
 *    豆包的答案是一段段吐出来的，只看有文本会在第一段就收工。
 *
 * 这里所有**判定**都是纯函数（可以在无浏览器、无网的环境里钉死），
 * 只有 `probeLogin` / `pressEnter` / `clickElement` 这几个直接跟 CDP 说话的函数例外。
 */
import type { CdpClient } from './driver.js'
import type { WebAiCitation } from './types.js'

/* ────────────────────────── 站点表（改版只改这里） ────────────────────────── */

export type WebAiSiteId = 'doubao'

export interface WebAiSiteSpec {
  id: WebAiSiteId
  label: string
  /** 每个请求从这里进（= 新对话）。 */
  homeUrl: string
  /** 登录页（探登录态时进这里）。 */
  loginUrl: string
  /** 输入框（豆包是 tiptap / ProseMirror）。 */
  editorSelector: string
  /** 「发送」按钮选择器；没有就退回回车（豆包实测回车就发）。 */
  sendSelector?: string
  /** 回答候选选择器（按顺位，第一顺位优先）。 */
  answerSelectors: string[]
  /** 生成中提示（出现即说明还没答完）。 */
  busySelectors: string[]
  /** 引用/来源面板的候选选择器（里面再捞 a[href]，捞不到退回回答 HTML）。 */
  citationSelectors: string[]
  /** 站内域名：引用里出现这些域一律剔掉（豆包自己的会话链接不是"来源"）。 */
  internalHosts: string[]
  /** 登录判据（首选）：这些 cookie 里有非空值才算拿到了服务端凭据。 */
  authCookies: { url: string; names: string[] }
  /** 登录判据（确认）：cookie 有了还要页面认一次；未登录时豆包会把地址踢到 `?from_logout=1`。 */
  loginProbe: string
}

export const DOUBAO_WEB_AI: WebAiSiteSpec = {
  id: 'doubao',
  label: '豆包',
  homeUrl: 'https://www.doubao.com/chat/',
  loginUrl: 'https://www.doubao.com/chat/',
  editorSelector: '.ProseMirror',
  answerSelectors: [
    '[data-testid="message_text_content"]',
    '[data-testid="receive_message"] [data-testid*="text"]',
    '.flow-markdown-body',
    '[data-testid="receive_message"]',
  ],
  busySelectors: ['[data-testid="stop_generation_button"]', '[aria-label*="停止生成"]'],
  citationSelectors: [
    '[data-testid="search_result"]',
    '[data-testid="reference_list"]',
    '[data-testid="message_reference"]',
    '.search-result-card',
  ],
  internalHosts: ['doubao.com', 'doubao.cn'],
  /*
   * cookie 是**服务端认的证据**，没法"还没出现"——识图插件 2026-11-19 踩过：
   * 首屏输入框先渲染、顶栏后渲染，只看 DOM 会把未登录判成已登录。
   */
  authCookies: { url: 'https://www.doubao.com', names: ['sessionid', 'sessionid_ss'] },
  loginProbe: `(() => {
    if (document.querySelector('[data-testid="to_login_button"]')) return false;
    if (location.search.includes('from_logout')) return false;
    return true;
  })()`,
}

/** 目前只支持豆包；以后加站点 = 在表里加一行 + 补判据，不动流程。 */
export const WEB_AI_SITES: Record<WebAiSiteId, WebAiSiteSpec> = { doubao: DOUBAO_WEB_AI }

/* ────────────────────────── 页面表达式（选择器 → JS） ────────────────────────── */

/** 输入框在不在（等它算"页面渲染完"）。 */
export function editorReadyExpression(spec: WebAiSiteSpec): string {
  return `!!document.querySelector(${JSON.stringify(spec.editorSelector)})`
}

/**
 * 一次把**所有候选选择器**的文本与 HTML 捞回来，谁可用交给 `chooseAnswer` 判。
 *
 * 为什么不在页面里判"取第一个非空"：判据要能在单测里钉住（第一顺位失效落第二顺位），
 * 而页面表达式没法单测。所以页面只负责"取数"，决定权在纯函数里。
 */
export function answerProbeExpression(spec: WebAiSiteSpec): string {
  return `(() => {
    const selectors = ${JSON.stringify(spec.answerSelectors)};
    return selectors.map((sel) => {
      const nodes = Array.from(document.querySelectorAll(sel));
      return {
        selector: sel,
        texts: nodes.map((n) => ((n.innerText || n.textContent || '') + '').trim()),
        htmls: nodes.map((n) => n.innerHTML || ''),
      };
    });
  })()`
}

/** 还有没有「生成中/停止生成」的忙标记。 */
export function busyExpression(spec: WebAiSiteSpec): string {
  return `(() => ${JSON.stringify(spec.busySelectors)}.some((sel) => !!document.querySelector(sel)))()`
}

/** 引用候选：每个选择器下捞 a[href]（节点自己就是 a 时也算）。 */
export function anchorGroupsExpression(spec: WebAiSiteSpec): string {
  return `(() => {
    const selectors = ${JSON.stringify(spec.citationSelectors)};
    return selectors.map((sel) => {
      const anchors = [];
      for (const node of Array.from(document.querySelectorAll(sel))) {
        const found = [];
        if (node.tagName === 'A' && node.getAttribute('href')) found.push(node);
        for (const inner of Array.from(node.querySelectorAll('a[href]'))) found.push(inner);
        for (const a of found) {
          anchors.push({
            title: ((a.innerText || a.textContent || '') + '').trim(),
            url: a.href || a.getAttribute('href') || '',
          });
        }
      }
      return { selector: sel, anchors };
    });
  })()`
}

/** 输入框是不是空的（发送成功的最强信号）。 */
export function editorEmptyExpression(editorSelector: string): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(editorSelector)});
    return el ? (el.innerText || '').trim() === '' : false;
  })()`
}

/* ────────────────────────── 回答抽取（纯函数） ────────────────────────── */

export interface AnswerProbe {
  selector: string
  texts: string[]
  htmls: string[]
}

export interface AnswerPick {
  text: string
  html: string
  selector: string
  index: number
}

/**
 * 候选选择器依次试，取**第一个可用的最后一个节点**。
 *
 * `exclude` 排掉我们自己那条提问：豆包的对话区里用户消息与助手消息共用一部分 class，
 * 抽错时最典型的表现是"回答 == 我发的那句话"（识图插件 2026-11-17 实测踩过）。
 */
export function chooseAnswer(probes: AnswerProbe[], exclude = ''): AnswerPick {
  const skip = String(exclude ?? '').trim()
  for (const probe of probes) {
    if (!probe || !Array.isArray(probe.texts)) continue
    for (let i = probe.texts.length - 1; i >= 0; i -= 1) {
      const text = String(probe.texts[i] ?? '').trim()
      if (text === '' || (skip !== '' && text === skip)) continue
      return { text, html: String(probe.htmls[i] ?? ''), selector: probe.selector, index: i }
    }
  }
  return { text: '', html: '', selector: '', index: -1 }
}

/* ────────────────────────── 完成判据（纯函数状态机） ────────────────────────── */

export interface CompletionState {
  text: string
  /** 这段文本从什么时候开始没变过。 */
  stableSince: number
  /** 连续多少次采样文本没变（含首次）。 */
  stableSamples: number
}

export interface CompletionSample {
  text: string
  /** 页面还有「停止生成」这类忙标记。 */
  busy: boolean
}

export interface CompletionRules {
  /** 文本要稳定多久才算答完。 */
  minStableMs?: number
  /** 至少要连续几次采样不变。 */
  minStableSamples?: number
}

export interface CompletionStep {
  state: CompletionState
  done: boolean
  busy: boolean
}

export const DEFAULT_MIN_STABLE_MS = 1_200
export const DEFAULT_MIN_STABLE_SAMPLES = 3

export function initialCompletion(now: number): CompletionState {
  return { text: '', stableSince: now, stableSamples: 0 }
}

/**
 * 推进一次采样。**完成 = 有文本 + 不忙 + 连续 N 次不变 + 稳定够久**。
 *
 * 为什么"不忙"要单独一条：豆包在两段之间会有短暂停顿（文本没变、也没新字），
 * 只看"文本没变"会在段落间隙提前收工；「停止生成」按钮在的这一秒里，答案一定还没完。
 */
export function stepCompletion(
  previous: CompletionState,
  sample: CompletionSample,
  now: number,
  rules: CompletionRules = {},
): CompletionStep {
  const minStableMs = typeof rules.minStableMs === 'number' && rules.minStableMs >= 0 ? rules.minStableMs : DEFAULT_MIN_STABLE_MS
  const minStableSamples =
    typeof rules.minStableSamples === 'number' && rules.minStableSamples >= 1
      ? Math.floor(rules.minStableSamples)
      : DEFAULT_MIN_STABLE_SAMPLES
  const text = String(sample.text ?? '').trim()
  let state: CompletionState
  if (text === '') {
    state = { text: '', stableSince: now, stableSamples: 0 }
  } else if (text !== previous.text) {
    state = { text, stableSince: now, stableSamples: 1 }
  } else {
    state = { text, stableSince: previous.stableSince, stableSamples: previous.stableSamples + 1 }
  }
  const busy = sample.busy === true
  const done = text !== '' && !busy && state.stableSamples >= minStableSamples && now - state.stableSince >= minStableMs
  return { state, done, busy }
}

/* ────────────────────────── 引用抽取（纯函数） ────────────────────────── */

export interface WebAiAnchorGroup {
  selector: string
  anchors: Array<{ title?: string; url?: string }>
}

export interface WebAiCitationInput {
  /** 按选择器捞到的 a[href]（先试它）。 */
  groups?: WebAiAnchorGroup[]
  /** 兜底：回答节点的 innerHTML，从里面正则捞外链。 */
  answerHtml?: string
}

const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi

/** 只解最常见的几种实体（这里不是浏览器，够用就行）。 */
export function decodeHtmlText(text: string): string {
  return String(text ?? '').replace(ENTITY_RE, (entity) => {
    const lower = entity.toLowerCase()
    if (lower === '&amp;') return '&'
    if (lower === '&lt;') return '<'
    if (lower === '&gt;') return '>'
    if (lower === '&quot;') return '"'
    if (lower === '&apos;') return "'"
    if (lower === '&nbsp;') return ' '
    const numeric = /^&#(x[0-9a-f]+|\d+);$/i.exec(entity)
    if (!numeric) return entity
    const raw = numeric[1] ?? ''
    const code = raw.toLowerCase().startsWith('x') ? Number.parseInt(raw.slice(1), 16) : Number.parseInt(raw, 10)
    if (!Number.isFinite(code) || code <= 0) return ''
    try {
      return String.fromCodePoint(code)
    } catch {
      return ''
    }
  })
}

export function stripTags(html: string): string {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
}

function cleanTitle(raw: string): string {
  return decodeHtmlText(stripTags(raw)).replace(/\s+/g, ' ').trim()
}

/** 只认 http(s)；相对链接（`/chat/xxx`）与 javascript:/data: 一律丢掉。 */
export function normalizeCitationUrl(raw: string): string | undefined {
  const value = decodeHtmlText(String(raw ?? '')).trim()
  if (value === '') return undefined
  if (/^(?:javascript|data|mailto|tel|about|blob):/i.test(value)) return undefined
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  url.hash = ''
  const text = url.toString()
  return text.endsWith('/') ? text.slice(0, -1) : text
}

/** 站内域：`doubao.com` 与它的所有子域（`www.doubao.com`、`chat.doubao.com`）都算。 */
export function isInternalHost(host: string, internalHosts: string[]): boolean {
  const target = String(host ?? '').toLowerCase()
  if (target === '') return true
  return internalHosts.some((raw) => {
    const domain = String(raw ?? '').toLowerCase().replace(/^\.+/, '').trim()
    if (domain === '') return false
    return target === domain || target.endsWith('.' + domain)
  })
}

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

/** 从一段 HTML 里捞 a[href]（标题取标签之间的文本）。 */
export function anchorsFromHtml(html: string): Array<{ title: string; url: string }> {
  const source = String(html ?? '')
  if (source === '') return []
  const out: Array<{ title: string; url: string }> = []
  const pattern = new RegExp(ANCHOR_RE.source, 'gi')
  let match: RegExpExecArray | null = pattern.exec(source)
  while (match !== null) {
    const attrs = match[1] ?? ''
    const href = HREF_RE.exec(attrs)
    const url = href ? href[1] ?? href[2] ?? href[3] ?? '' : ''
    out.push({ title: cleanTitle(match[2] ?? ''), url })
    match = pattern.exec(source)
  }
  return out
}

/**
 * 汇总引用：先按选择器捞到的，再退回回答 HTML；**去重 + 剔站内链接**；抽不到就空数组。
 *
 * 「别编链接」是硬约束：这里每一个 url 都来自页面里真实存在的 a[href]，
 * 不拼凑、不猜、不用标题反查。抽不到就是空——工具层据此不写「来源」那一节。
 */
export function collectCitations(input: WebAiCitationInput, spec: WebAiSiteSpec = DOUBAO_WEB_AI): WebAiCitation[] {
  const raw: Array<{ title?: string; url?: string }> = []
  for (const group of input.groups ?? []) {
    if (!group || !Array.isArray(group.anchors)) continue
    for (const anchor of group.anchors) raw.push(anchor)
  }
  for (const anchor of anchorsFromHtml(input.answerHtml ?? '')) raw.push(anchor)

  const seen = new Set<string>()
  const out: WebAiCitation[] = []
  for (const row of raw) {
    const url = normalizeCitationUrl(row?.url ?? '')
    if (url === undefined) continue
    let host = ''
    try {
      host = new URL(url).host
    } catch {
      continue
    }
    if (isInternalHost(host, spec.internalHosts)) continue
    if (seen.has(url)) continue
    seen.add(url)
    const title = cleanTitle(row?.title ?? '')
    out.push({ title: title !== '' ? title : host, url })
  }
  return out
}

/* ────────────────────────── 截断与文案 ────────────────────────── */

export const DEFAULT_MAX_CHARS = 12_000

/** 按字数上限裁，`truncated` 明确告诉调用方"裁过"。 */
export function clipText(text: string, maxChars?: number): { text: string; truncated: boolean } {
  const limit =
    typeof maxChars === 'number' && Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : DEFAULT_MAX_CHARS
  const value = String(text ?? '')
  if (value.length <= limit) return { text: value, truncated: false }
  return { text: value.slice(0, limit), truncated: true }
}

/** 等回答的总预算：配得太小（比如 10 秒）也要给到 20 秒，否则永远来不及。 */
export function answerBudgetMs(timeoutMs?: number): number {
  const value = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) ? timeoutMs : 0
  return Math.max(value, 20_000)
}

/** 超时返回时随正文一起标注的那句话（工具层/日志都用这一份，别各处自己编）。 */
export const PARTIAL_NOTE = '可能没答完'

/**
 * 未登录的中文提示：**能直接照做**——去哪儿点、点哪个函数、登完再试。
 * 复用识图插件那份 profile，所以"登过一次就行"，不需要再登一次。
 */
export function notLoggedInHint(label: string = DOUBAO_WEB_AI.label): string {
  return `网页版${label}没登录：先在识图插件里点「登录」（vision_web_login(doubao)），或用设置页的登录按钮，登完再试。`
}

/* ────────────────────────── 与浏览器说话的那几个（薄壳） ────────────────────────── */

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** 轮询直到表达式为真；超时返回 false（不抛，调用方决定怎么说）。 */
export async function pollTrue(client: CdpClient, expression: string, timeoutMs: number, stepMs = 300): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ok = await client.evaluate<boolean>(expression).catch(() => false)
    if (ok === true) return true
    await wait(stepMs)
  }
  return false
}

/**
 * 这个窗口**到底登录没登录**：cookie 是必要条件，DOM 是确认。
 *
 * 只信 cookie：服务端可能已经把会话作废（2026-11-19 实测），页面顶部是「登录」。
 * 只信 DOM：首屏按钮还没渲染时会被误判成已登录。
 */
export async function isLoggedIn(client: CdpClient, spec: WebAiSiteSpec): Promise<boolean> {
  let cookieVerdict: boolean | undefined
  try {
    const result = await client.call<{ cookies?: Array<{ name?: string; value?: string }> }>(
      'Network.getCookies',
      { urls: [spec.authCookies.url] },
      10_000,
    )
    if (Array.isArray(result?.cookies)) {
      cookieVerdict = spec.authCookies.names.some((name) =>
        (result.cookies ?? []).some((cookie) => cookie?.name === name && (cookie?.value ?? '') !== ''),
      )
    }
  } catch {
    /* 拿不到 cookie 就只信 DOM */
  }
  if (cookieVerdict === false) return false

  const settled = await pollTrue(client, editorReadyExpression(spec), 8_000)
  if (!settled) return cookieVerdict === true
  const first = await client.evaluate<boolean>(spec.loginProbe).catch(() => cookieVerdict === true)
  if (first === true) return true
  await wait(1_500)
  return client.evaluate<boolean>(spec.loginProbe).catch(() => false)
}

/** 打字：走 execCommand('insertText')，会派发 beforeinput/input，ProseMirror 认。 */
export async function typeInto(client: CdpClient, selector: string, text: string): Promise<boolean> {
  return client
    .evaluate<boolean>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      const ok = document.execCommand('insertText', false, ${JSON.stringify(text)});
      return ok !== false;
    })()`)
    .catch(() => false)
}

/** 清空输入框（上一轮没发出去的文字不许留到这一轮）。 */
export async function clearEditor(client: CdpClient, selector: string): Promise<boolean> {
  return client
    .evaluate<boolean>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete');
      return true;
    })()`)
    .catch(() => false)
}

/** 回车发送（ProseMirror 认原生 keydown）。 */
export async function pressEnter(client: CdpClient): Promise<void> {
  for (const type of ['rawKeyDown', 'keyUp']) {
    await client.call('Input.dispatchKeyEvent', {
      type,
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    })
  }
}

/** 用真鼠标事件点一颗按钮（合成 click 对 Material 那套按钮可能没反应）。 */
export async function clickElement(client: CdpClient, selector: string): Promise<boolean> {
  const box = await client
    .evaluate<{ x: number; y: number } | null>(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`)
    .catch(() => null)
  if (!box) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await client.call('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
  }
  return true
}

/** 只探登录态（不提问）：进登录页 → 等渲染 → cookie + DOM 双判。 */
export async function probeLogin(client: CdpClient, spec: WebAiSiteSpec): Promise<{ loggedIn: boolean; url: string }> {
  await client.goto(spec.loginUrl)
  const ready = await pollTrue(client, editorReadyExpression(spec), 25_000)
  if (!ready) return { loggedIn: false, url: spec.loginUrl }
  const loggedIn = await isLoggedIn(client, spec)
  const url = await client.evaluate<string>('location.href').catch(() => spec.loginUrl)
  return { loggedIn: loggedIn === true, url: typeof url === 'string' ? url : spec.loginUrl }
}
