/**
 * extensions/routes — 「扩展列表」的两条回环路由（给设置页用）。
 *
 * - `GET  /api/dsh-remote-control/extensions`          → 整张表
 * - `POST /api/dsh-remote-control/extensions/action`   → 装/启用/禁用/卸载，回最新的整张表
 *
 * 守卫与 `src/pill/routes.ts` / `src/subagents/routes.ts` 同一套：
 * ① `hostIsLoopback`（Host 必须是环回）；② Origin 只认宿主自己（`dsh-app:` 或环回 http(s)）；
 * ③ 写路由额外要带 `x-drc-pair` 头（桌面宿主转发时会删 origin，光靠 Origin 判据在真机上不成立）；
 * ④ 只读路由只吃 GET/HEAD、写路由只吃 POST；⑤ `applyCors` + `preflight`（跨源预检 204）。
 *
 * 失败一律给**中文原因**并落一行日志：装不上时用户唯一能看见的就是这句话。
 * ⚠️ 路径前缀是 `dsh-remote-control`（与日志命名一致），不是本包其余路由用的
 * `dsh-remote-dafeiyu`——这个面板的契约就是这么定的，改路径要连前端一起改。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { ApplyResult, ExtensionStatus, Log } from './service.js'

export const EXTENSIONS_ROUTE = '/api/dsh-remote-control/extensions'
export const EXTENSIONS_ACTION_ROUTE = '/api/dsh-remote-control/extensions/action'

export interface ExtensionsRouteDeps {
  list: () => ExtensionStatus[]
  act: (id: string, action: unknown) => Promise<ApplyResult>
  log: Log
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  response.end(payload)
}

/** 被哪一道守门拦下的。返回 undefined = 放行。 */
function rejected(request: IncomingMessage): string | undefined {
  if (!hostIsLoopback(request.headers.host)) return 'host-not-loopback'
  if (!originIsLoopbackOrAbsent(request.headers.origin)) return 'origin-not-trusted'
  return undefined
}

const GUARD_MESSAGE: Record<string, string> = {
  'host-not-loopback': '只接受本机回环请求',
  'origin-not-trusted': '请求来源不可信（只认宿主自己）',
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > 8 * 1024) {
        reject(new Error('请求体太大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/** `GET /extensions`：整张表。读不到 profile 也照样回 200（每行都是"未安装"）。 */
export function extensionsListHandler(deps: ExtensionsRouteDeps) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied !== undefined) {
      deps.log('扩展列表请求被守卫拒', { guard: denied })
      json(response, 403, { ok: false, error: denied, message: GUARD_MESSAGE[denied] ?? '请求不可信' })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, message: '这边只支持 GET' })
      return
    }
    try {
      json(response, 200, { ok: true, extensions: deps.list() })
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 200)
      deps.log('扩展列表读不出来', { message })
      json(response, 500, { ok: false, message: `读不出来：${message}`, extensions: [] })
    }
  }
}

/**
 * `POST /extensions/action`：`{ id, action }` → 执行，然后**回最新整张表**（前端不用再请求）。
 *
 * 业务失败（不在白名单 / pnpm 失败 / profile 坏了）回 200 + `ok:false` + 中文 `message`：
 * 那些是"点了但没成"的正常结局，不是 HTTP 错误——面板要把原因显示在那一行里。
 */
export function extensionsActionHandler(deps: ExtensionsRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied !== undefined) {
      deps.log('扩展动作请求被守卫拒', { guard: denied })
      json(response, 403, { ok: false, error: denied, message: GUARD_MESSAGE[denied] ?? '请求不可信' })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, message: '这边只支持 POST' })
      return
    }
    if (String(request.headers['x-drc-pair'] ?? '') === '') {
      json(response, 403, { ok: false, error: 'missing x-drc-pair', message: '缺少 x-drc-pair 头（只有本机页面能改扩展）' })
      return
    }
    let body: Record<string, unknown>
    try {
      const text = await readBody(request)
      const parsed: unknown = JSON.parse(text === '' ? '{}' : text)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求体不是 JSON 对象')
      body = parsed as Record<string, unknown>
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 160)
      deps.log('扩展动作的请求体读不出来', { message })
      json(response, 400, { ok: false, message: `请求体不对：${message}` })
      return
    }
    const id = typeof body.id === 'string' ? body.id : ''
    let result: ApplyResult
    try {
      result = await deps.act(id, body.action)
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 200)
      deps.log('扩展动作抛错', { id, action: String(body.action ?? ''), message })
      result = { ok: false, changed: false, needsRestart: false, message: `动作没做成：${message}` }
    }
    let extensions: ExtensionStatus[] = []
    try {
      extensions = deps.list()
    } catch (error) {
      deps.log('扩展动作后列表刷新失败', { message: String((error as Error)?.message ?? error).slice(0, 160) })
    }
    json(response, 200, {
      ok: result.ok === true,
      changed: result.changed === true,
      needsRestart: result.needsRestart === true,
      message: result.message,
      version: result.version,
      extensions,
    })
  }
}
