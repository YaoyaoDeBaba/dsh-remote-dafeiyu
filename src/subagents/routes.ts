/**
 * subagents/routes — 子代理监视器的只读路由（**仅回环**，给桌面端页面用）。
 *
 * 与识图那几条同一条守卫：Host 必须是回环、Origin 只认宿主自己（`dsh-app:` 或环回 http(s)）。
 * 这里**没有写操作**：清理走手机/桌面已有的归档命令，不在这个路由上开第二条路。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { KernelSubagent } from '../ports/index.js'
import type { SubagentsConfig } from './config.js'
import { SUBAGENT_GUIDANCE } from './guidance.js'
import type { GuidancePushResult } from './pusher.js'

export const SUBAGENTS_ROUTE = '/api/dsh-remote-dafeiyu/subagents'
export const SUBAGENTS_ARCHIVE_ROUTE = '/api/dsh-remote-dafeiyu/subagents/archive'
export const SUBAGENTS_CONFIG_ROUTE = '/api/dsh-remote-dafeiyu/subagents/config'
export const GUIDANCE_PUSH_ROUTE = '/api/dsh-remote-dafeiyu/guidance/push'
export const SUBAGENTS_STREAM_ROUTE = '/api/dsh-remote-dafeiyu/subagents/stream'

export interface SubagentRouteDeps {
  list: (sessionId: string, options?: { descendants?: boolean; includeArchived?: boolean }) => Promise<KernelSubagent[]>
  /** 归档 / 取消归档（清理闲置子代理）：写路由，要带 `x-drc-pair` 头。 */
  archive?: (sessionId: string, archived: boolean) => Promise<{ ok: boolean; message?: string }>
  /** 派活助手配置的读/写（闲置阈值、提示段开关）。 */
  config: { read(): SubagentsConfig; write(patch: unknown): SubagentsConfig }
  /** 当前风格的提示词（设置页预览用，随 mode 变化）。 */
  guidanceText?: () => string
  /** 把提示段推送到所有在线会话（一次性上下文；用户按钮触发）。 */
  pushGuidance?: (which: 'subagent' | 'xyq' | 'both', sessionId?: string, mode?: string) => Promise<GuidancePushResult>
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
    if (preflight(request, response)) return
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
    // 归档的默认不下发（与内核端口同一口径）；监视器要显示"已归档 N 个"时显式要。
    const includeArchived = url.searchParams.get('includeArchived') === '1'
    try {
      const items = await deps.list(sessionId, { descendants, includeArchived })
      json(response, 200, { ok: true, items, config: deps.config.read() })
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
    if (preflight(request, response)) return
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
      const failedRows = results.filter((row) => !row.ok)
      const failed = failedRows.length
      // 2026-11-13：失败时以前只回 207 + results，**顶层没有 message、一行日志也不写**。
      // 客户端只读 `answer.message`（见 client/subagent-panel.ts），于是精确原因
      // （例如「cannot archive session 'agent-1': … hold no such session」）从来没被看见过，
      // 宿主日志里也查不到——用户侧看到的就是"点了归档没反应"。
      // 现在：顶层带第一条失败原因，并且逐条写日志（最多记 10 条，别让一次批量刷满日志）。
      for (const row of failedRows.slice(0, 10)) {
        deps.log('子代理归档失败', { sessionId: row.sessionId, message: row.message ?? '内核没给原因', archived })
      }
      json(response, failed === 0 ? 200 : 207, {
        ok: failed === 0,
        ...(failed === 0
          ? {}
          : {
              message: `${failed}/${results.length} 个${archived ? '归档' : '取消归档'}失败：${
                failedRows[0]?.message ?? '内核没给原因'
              }`,
            }),
        results,
      })
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}


/** `GET/POST /subagents/config`：派活助手的配置（写要 `x-drc-pair`，与其它写路由同一条）。 */
export function subagentsConfigHandler(deps: SubagentRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      json(response, 200, { ok: true, config: deps.config.read(), guidanceText: deps.guidanceText ? deps.guidanceText() : SUBAGENT_GUIDANCE })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: '只支持 GET / POST' })
      return
    }
    if (String(request.headers['x-drc-pair'] ?? '') === '') {
      json(response, 403, { ok: false, error: 'missing x-drc-pair' })
      return
    }
    try {
      const body = JSON.parse(await readBody(request)) as unknown
      json(response, 200, { ok: true, config: deps.config.write(body) })
    } catch (error) {
      json(response, 400, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}


/** `POST /guidance/push`：把提示段注入所有在线会话（不唤醒；下一轮可见）。 */
export function guidancePushHandler(deps: SubagentRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
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
    if (deps.pushGuidance === undefined) {
      json(response, 503, { ok: false, error: '当前宿主没有 agents 服务，推送不可用' })
      return
    }
    try {
      const body = JSON.parse(await readBody(request)) as { which?: unknown; sessionId?: unknown; mode?: unknown }
      const which = body.which === 'xyq' ? 'xyq' : body.which === 'both' ? 'both' : 'subagent'
      const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim() !== '' ? body.sessionId.trim() : undefined
      const mode = body.mode === 'hands-on' || body.mode === 'foreman' ? body.mode : undefined
      json(response, 200, { ok: true, which, mode: mode ?? null, result: await deps.pushGuidance(which, sessionId, mode) })
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** `GET /subagents/stream`：SSE，子代理有变化就推一条（客户端不再定时轮询）。 */
export function subagentsStreamHandler() {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'GET') {
      json(response, 405, { ok: false, error: '只支持 GET' })
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.write('retry: 3000\n\n')
    const heartbeat = setInterval(() => {
      try {
        response.write(': hb\n\n')
      } catch {
        /* 关掉时忽略 */
      }
    }, 25_000)
    request.on('close', () => {
      clearInterval(heartbeat)
      streamClients.delete(response)
    })
    streamClients.add(response)
  }
}

/** SSE 订阅者集合（start 里统一广播）。 */
export const streamClients = new Set<ServerResponse>()
