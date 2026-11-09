/**
 * subagents/routes — 子代理监视器的只读路由（**仅回环**，给桌面端页面用）。
 *
 * 与识图那几条同一条守卫：Host 必须是回环、Origin 只认宿主自己（`dsh-app:` 或环回 http(s)）。
 * 这里**没有写操作**：清理走手机/桌面已有的归档命令，不在这个路由上开第二条路。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { KernelSubagent } from '../ports/index.js'

export const SUBAGENTS_ROUTE = '/api/dsh-remote-dafeiyu/subagents'
export const SUBAGENTS_ARCHIVE_ROUTE = '/api/dsh-remote-dafeiyu/subagents/archive'

export interface SubagentRouteDeps {
  list: (sessionId: string, options?: { descendants?: boolean }) => Promise<KernelSubagent[]>
  /** 归档 / 取消归档（清理闲置子代理）：写路由，要带 `x-drc-pair` 头。 */
  archive?: (sessionId: string, archived: boolean) => Promise<{ ok: boolean; message?: string }>
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

export function subagentsHandler(deps: SubagentRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, error: '只支持 GET' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
    if (sessionId === '') {
      json(response, 400, { ok: false, error: '缺少 sessionId' })
      return
    }
    const descendants = url.searchParams.get('descendants') === '1'
    try {
      const items = await deps.list(sessionId, { descendants })
      json(response, 200, { ok: true, items })
    } catch (error) {
      const message = String((error as Error)?.message ?? error).slice(0, 200)
      deps.log('子代理列表读取失败', { message })
      json(response, 500, { ok: false, error: message })
    }
  }
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

/**
 * `POST /subagents/archive` —— 清理闲置子代理用的归档写路由。
 *
 * 与配对码的写路由同一条跨站判据：必须带 `x-drc-pair` 头（那是"页面自己发的请求"，
 * 不是装饰——桌面宿主转发时会把 `origin` 删掉，Origin 判据在真机上不成立）。
 */
export function subagentsArchiveHandler(deps: SubagentRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: '只支持 POST' })
      return
    }
    if (String(request.headers['x-drc-pair'] ?? '') === '') {
      json(response, 403, { ok: false, error: 'missing x-drc-pair' })
      return
    }
    if (!deps.archive) {
      json(response, 501, { ok: false, error: '主机这一代不支持归档' })
      return
    }
    let body: { sessionId?: unknown; ids?: unknown; archived?: unknown }
    try {
      body = JSON.parse(await readBody(request)) as { sessionId?: unknown; ids?: unknown; archived?: unknown }
    } catch {
      json(response, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    // 单条（sessionId）与批量（ids）都收：批量是「一键归档闲置」用的，逐条走同一个归档端口。
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim())
      : typeof body.sessionId === 'string' && body.sessionId.trim() !== ''
        ? [body.sessionId.trim()]
        : []
    if (ids.length === 0) {
      json(response, 400, { ok: false, error: '缺少 sessionId 或 ids' })
      return
    }
    if (ids.length > 50) {
      json(response, 400, { ok: false, error: '一次最多归档 50 个' })
      return
    }
    const archived = body.archived !== false
    try {
      const results: Array<{ sessionId: string; ok: boolean; message?: string }> = []
      for (const id of ids) {
        try {
          const result = await deps.archive(id, archived)
          results.push({ sessionId: id, ...result })
        } catch (error) {
          results.push({ sessionId: id, ok: false, message: String((error as Error)?.message ?? error).slice(0, 160) })
        }
      }
      const failed = results.filter((row) => !row.ok).length
      json(response, failed === 0 ? 200 : 207, { ok: failed === 0, results })
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}
