/**
 * websearch/webai/types —— 「把网页版豆包当搜索引擎」的对外形状（工具层只认这一份）。
 *
 * 为什么单独一份 types：工具层（`src/websearch/tools.ts`）与 service 层必须**共用同一份形状**。
 * sprite 域出过"schema 支持某个参数、service 却没转给页面"的缺陷——把形状钉在一处，
 * 那条缺陷就没有落脚点。
 *
 * 零依赖：这里只有类型与一个中文错误类，不认 node:fs、不认浏览器。
 */

/** 日志口子（与插件其它域同一个形状）。 */
export type WebAiLog = (message: string, fields?: Record<string, string | number | boolean | undefined>) => void

/**
 * 网页版豆包这一路的中文错误。
 *
 * `status` 只是给调用方分类用（401 = 没登录、429 = 忙），不是 HTTP 状态码——
 * 这一路根本不发 HTTP 请求，走的是本机浏览器。
 */
export class WebAiError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'WebAiError'
    this.status = status
  }
}

/** `ask` 的入参。`timeoutMs` 是等回答的总预算，`maxChars` 是返回正文的字数上限。 */
export interface WebAiAskInput {
  prompt: string
  timeoutMs?: number
  maxChars?: number
}

/** `ask` 的结果：纯文本（不带引用）。 */
export interface WebAiAskResult {
  text: string
  site: string
  elapsedMs: number
  /** 被 `maxChars` 截断过。 */
  truncated: boolean
  /** 等超时了、可能没答完（正文是已经拿到的部分）。 */
  partial: boolean
}

/** 回答里的一条来源。 */
export interface WebAiCitation {
  title: string
  url: string
}

/**
 * `search` 的结果：当搜索引擎用时，除了正文还要带来源列表。
 *
 * 两个标记分开：
 * - `truncated` 只表示"被 maxChars 截了"；
 * - `partial` 只表示"超时了、可能没答完"。
 * 工具层按这两个标记分别写提示，别合成一个（合成之后就分不清"答案太长"和"答案没写完"）。
 */
export interface WebAiSearchResult {
  answer: string
  citations: WebAiCitation[]
  site: string
  elapsedMs: number
  truncated: boolean
  partial: boolean
}

/**
 * 网页版搜索服务。接线方只用这四个方法。
 *
 * 为什么 `ask` / `search` 两个都留：`ask` 是"问一句话拿一段文本"的简写，
 * `search` 是"当搜索引擎"的形态（多了 citations）。两者走**同一个**浏览器流程，
 * 差别只在返回形状——不存在"两套实现漂移"的问题。
 */
export interface WebAiService {
  ask(input: WebAiAskInput): Promise<WebAiAskResult>
  search(query: string, options?: { timeoutMs?: number; maxChars?: number }): Promise<WebAiSearchResult>
  /** 登录态探测：只读，起一次无头浏览器判完就关。 */
  status(): Promise<{ loggedIn: boolean; profileDir: string; reason?: string }>
  stop(): void
}

/** 兼容名：当引擎用的形态就是服务本身（`search` 已经在 `WebAiService` 上）。 */
export type WebAiSearchService = WebAiService

/** 建服务时的注入项。`profileRoot` 只给判据/自部署用，生产不传。 */
export interface WebAiServiceDeps {
  log?: WebAiLog
  /** profile 根：默认 `<DSH_HOME>/storages/dsh-remote-dafeiyu/webvision`（与识图插件共用一个）。 */
  profileRoot?: string
}
