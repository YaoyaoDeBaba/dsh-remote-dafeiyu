/**
 * websearch/routes —— 设置页「搜索」栏的两条回环路由（2026-11-20）。
 *
 * `GET|POST /api/dsh-remote-dafeiyu/websearch/config`：读/写两个第三方 token。
 * `POST /api/dsh-remote-dafeiyu/websearch/test`：真跑一次上游，回答一句话。
 *
 * ## 守卫与其它面板路由同一套
 *
 * Host 必须回环、Origin 只认宿主自己；**写路由**再多要一道 `x-drc-pair`（桌面宿主转发时会把
 * `origin` 删掉，Origin 判据在真机上不成立，所以那道自定义头不能省）。判据见
 * `src/groups/routes.ts` 的 `readRoute` / `writeRoute` —— 这里只是照着写一遍。
 *
 * ## 一条硬纪律：**回答里绝不出现明文**
 *
 * 这两个 token 是用户自己的 GitHub / OpenAlex 凭据。页面能读到什么，就要假设"任何能打开
 * 这个页面的人都能读到"——所以只回**掩码**（`已配置（…abcd）`）与"来自哪一层"。
 * 掩码也只在 token 够长时才露尾 4 位：短 token 露尾 4 位等于露掉一半。
 *
 * ## 为什么 POST 的语义是"key 在 = 用户动过它"
 *
 * 与 `normalizeUserOverrides` 同一条：表单只提交用户真的填了的那一格，另一格保持不动；
 * 空串 = 清除这一项。设置页「保存」按钮因此不会把"另一个框还是空的"读成"请删掉它"。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent, preflight } from '../pill/routes.js'
import type { WebsearchOverrides } from '../shell/user-config.js'
import type { WebsearchProbeKind } from './probe.js'

export const WEBSEARCH_CONFIG_ROUTE = '/api/dsh-remote-dafeiyu/websearch/config'
export const WEBSEARCH_TEST_ROUTE = '/api/dsh-remote-dafeiyu/websearch/test'

/** 这两个 token 此刻**由哪一层**决定（设置页那一行会写出来，否则用户以为保存没生效）。 */
export type WebsearchTokenSource = 'config' | 'env' | 'none'

/** 下发给页面的形状：**只有掩码与布尔**，没有任何明文。 */
export interface WebsearchConfigView {
  /** 掩码形态；没配是空串。 */
  githubToken: string
  openAlexKey: string
  githubTokenSet: boolean
  openAlexKeySet: boolean
  githubTokenSource: WebsearchTokenSource
  openAlexKeySource: WebsearchTokenSource
}

/** POST body 上限：两个 512 字符的 token 加一层 JSON 壳，4KB 已经够宽。 */
export const MAX_WEBSEARCH_BODY_BYTES = 4 * 1024

/**
 * 掩码：`已配置（…abcd）`。
 *
 * ⚠️ 短 token 不露尾：`abc123` 露尾 3 位就等于把一半交出去。12 是经验线——
 * GitHub 的 PAT 40+ 位、细粒度 `github_pat_…` 约 90 位、OpenAlex key 30 位左右。
 */
export function maskSecret(secret: unknown): string {
  const value = typeof secret === 'string' ? secret.trim() : ''
  if (value === '') return ''
  if (value.length < 12) return '已配置（已隐藏）'
  return '已配置（…' + value.slice(-4) + '）'
}

/**
 * 合成下发给页面的视图。**优先级与工具侧一致**：配置文件 > 环境变量。
 *
 * 为什么两端要"一致"而不是各写一套：设置页写着"来自环境变量"、工具却用了配置文件里那枚，
 * 这种不一致会让用户按错地方去改（改完还是不行，且没人知道是哪一枚在生效）。
 */
export function buildConfigView(config: WebsearchOverrides, env: WebsearchOverrides): WebsearchConfigView {
  const pick = (fromConfig: unknown, fromEnv: unknown): { value: string; source: WebsearchTokenSource } => {
    const configured = typeof fromConfig === 'string' ? fromConfig.trim() : ''
    if (configured !== '') return { value: configured, source: 'config' }
    const fromEnvironment = typeof fromEnv === 'string' ? fromEnv.trim() : ''
    if (fromEnvironment !== '') return { value: fromEnvironment, source: 'env' }
    return { value: '', source: 'none' }
  }
  const github = pick(config.githubToken, env.githubToken)
  const openalex = pick(config.openAlexKey, env.openAlexKey)
  return {
    githubToken: maskSecret(github.value),
    openAlexKey: maskSecret(openalex.value),
    githubTokenSet: github.value !== '',
    openAlexKeySet: openalex.value !== '',
    githubTokenSource: github.source,
    openAlexKeySource: openalex.source,
  }
}

export interface WebsearchRouteDeps {
  /** 现读此刻的视图（掩码；**每次请求现算**，不在 apply 里缓存）。 */
  view(): WebsearchConfigView
  /**
   * 落盘。入参与表单原样同形（`undefined` 表示"没提交这一项"，空串表示"清除"），
   * 校验/合并/落盘都在实现里；失败回 `{ ok: false, message }`，路由回 400 并把这句话带出去。
   */
  save(input: WebsearchOverrides): { ok: true } | { ok: false; message: string }
  /** 真跑一次上游；**不抛**（失败也回中文 summary）。 */
  probe(kind: WebsearchProbeKind): Promise<{ ok: boolean; summary: string }>
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  response.end(payload)
}

function rejected(request: IncomingMessage): string | undefined {
  if (!hostIsLoopback(request.headers.host)) return 'host-not-loopback'
  if (!originIsLoopbackOrAbsent(request.headers.origin)) return 'origin-not-trusted'
  return undefined
}

/**
 * 读 body 并 JSON.parse。**永不抛**：超限 / 坏 JSON 都是 `undefined`，由调用方回 400。
 * 超限不销毁连接：这条是本机页面在打，制造"连接被重置"只会让用户以为是网络问题。
 */
function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (value: unknown): void => {
      if (done) return
      done = true
      resolve(value)
    }
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_WEBSEARCH_BODY_BYTES) {
        finish(undefined)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        finish(text === '' ? {} : JSON.parse(text))
      } catch {
        finish(undefined)
      }
    })
    request.on('error', () => finish(undefined))
  })
}

/** 写路由那一档守卫：POST + `x-drc-pair`。返回 `undefined` 表示放行。 */
function writeGuard(request: IncomingMessage, response: ServerResponse): boolean {
  if (String(request.headers['x-drc-pair'] ?? '') !== '') return false
  json(response, 403, { ok: false, error: 'missing x-drc-pair' })
  return true
}

/**
 * `GET|POST /api/dsh-remote-dafeiyu/websearch/config`
 *
 * GET 走只读那一档（Origin 缺席合法）；POST 走写那一档（多要 `x-drc-pair`）。
 */
export function websearchConfigHandler(deps: WebsearchRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied !== undefined) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method === 'POST') {
      if (writeGuard(request, response)) return
      const body = await readJsonBody(request)
      if (body === undefined || typeof body !== 'object' || body === null || Array.isArray(body)) {
        json(response, 400, { ok: false, message: '请求体必须是 JSON 对象（{ githubToken?, openAlexKey? }）' })
        return
      }
      const record = body as { githubToken?: unknown; openAlexKey?: unknown }
      const patch: WebsearchOverrides = {}
      for (const field of ['githubToken', 'openAlexKey'] as const) {
        if (!(field in record)) continue
        const value = record[field]
        if (typeof value !== 'string') {
          json(response, 400, { ok: false, field: 'websearch.' + field, message: '必须是字符串' })
          return
        }
        patch[field] = value
      }
      if (!('githubToken' in patch) && !('openAlexKey' in patch)) {
        json(response, 400, { ok: false, message: '两个都没提交：要保存就填一格，要清除就显式传空串' })
        return
      }
      try {
        const saved = deps.save(patch)
        if (!saved.ok) {
          json(response, 400, { ok: false, message: saved.message })
          return
        }
        json(response, 200, { ok: true, ...deps.view() })
      } catch (error) {
        const message = String((error as Error)?.message ?? error).slice(0, 200)
        deps.log('联网搜索配置写入失败', { message })
        json(response, 500, { ok: false, message: '保存失败：' + message })
      }
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, message: '这边只支持 GET 和 POST' })
      return
    }
    try {
      json(response, 200, { ok: true, ...deps.view() })
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 200)
      deps.log('联网搜索配置读取失败', { message })
      json(response, 500, { ok: false, message: '读取配置失败：' + message })
    }
  }
}

/**
 * `POST /api/dsh-remote-dafeiyu/websearch/test`
 *
 * body `{ kind: 'github' | 'arxiv' | 'web' }`。**失败也是 HTTP 200 + `ok:false`**：
 * "上游没成"不是这条路由坏了，页面要显示的是那句中文原因，不是"请求失败"。
 */
export function websearchTestHandler(deps: WebsearchRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied !== undefined) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, message: '这边只支持 POST' })
      return
    }
    if (writeGuard(request, response)) return
    const body = await readJsonBody(request)
    if (body === undefined || typeof body !== 'object' || body === null || Array.isArray(body)) {
      json(response, 400, { ok: false, message: '请求体必须是 JSON 对象（{ kind }）' })
      return
    }
    const kind = String((body as { kind?: unknown }).kind ?? '')
    if (kind !== 'github' && kind !== 'arxiv' && kind !== 'web') {
      json(response, 400, { ok: false, message: 'kind 只能是 github / arxiv / web' })
      return
    }
    try {
      const result = await deps.probe(kind)
      // ⚠️ 展开顺序：`result.ok` 必须压过这里的 true，否则失败会被读成成功。
      json(response, 200, { ...result, ok: result.ok === true, summary: String(result.summary ?? '') })
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 200)
      deps.log('联网搜索测试抛错', { message })
      json(response, 500, { ok: false, message: '测试时出错：' + message })
    }
  }
}

export function websearchHandlers(deps: WebsearchRouteDeps): Array<{
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => unknown
}> {
  return [
    { path: WEBSEARCH_CONFIG_ROUTE, handler: websearchConfigHandler(deps) },
    { path: WEBSEARCH_TEST_ROUTE, handler: websearchTestHandler(deps) },
  ]
}
