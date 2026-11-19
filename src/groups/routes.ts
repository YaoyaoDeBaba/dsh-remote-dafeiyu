/**
 * groups/routes —— 群面板用的回环路由（2026-11-19）。
 *
 * 守卫与其它面板路由同一套：Host 必须回环、Origin 只认宿主自己、写路由要 `x-drc-pair`、
 * `applyCors` + `preflight`（桌面页在 dsh-app:// 上，不回声 CORS 就会被浏览器挡掉）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent, preflight } from '../pill/routes.js'
import type { Groups } from './service.js'

export const GROUPS_LIST_ROUTE = '/api/dsh-remote-dafeiyu/groups'
export const GROUPS_CREATE_ROUTE = '/api/dsh-remote-dafeiyu/groups/create'
export const GROUPS_INVITE_ROUTE = '/api/dsh-remote-dafeiyu/groups/invite'
export const GROUPS_POST_ROUTE = '/api/dsh-remote-dafeiyu/groups/post'
export const GROUPS_MESSAGES_ROUTE = '/api/dsh-remote-dafeiyu/groups/messages'
export const GROUPS_LEAVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/leave'
export const GROUPS_SESSIONS_ROUTE = '/api/dsh-remote-dafeiyu/groups/sessions'

export interface GroupsRouteDeps {
  groups: Groups
  /** 候选会话（面板拉人时的选择框）。拿不到就回空数组。 */
  listSessions?: () => Promise<Array<{ id: string; title?: string; updatedAt?: string }>>
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

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > 64 * 1024) {
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

/** 读路由：只吃 GET/HEAD。 */
function readRoute(handler: (url: URL) => unknown) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied !== undefined) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, message: '这边只支持 GET' })
      return
    }
    try {
      json(response, 200, { ok: true, ...(handler(new URL(request.url ?? '/', 'http://localhost')) as object) })
    } catch (error) {
      json(response, 500, { ok: false, message: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** 写路由：只吃 POST + x-drc-pair。 */
function writeRoute(handler: (body: Record<string, unknown>) => Promise<unknown> | unknown) {
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
    if (String(request.headers['x-drc-pair'] ?? '') === '') {
      json(response, 403, { ok: false, error: 'missing x-drc-pair' })
      return
    }
    let body: Record<string, unknown>
    try {
      const text = await readBody(request)
      const parsed: unknown = JSON.parse(text === '' ? '{}' : text)
      body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch (error) {
      json(response, 400, { ok: false, message: '请求体不是合法 JSON：' + String((error as Error)?.message ?? error).slice(0, 120) })
      return
    }
    try {
      json(response, 200, { ok: true, ...(await handler(body) as object) })
    } catch (error) {
      depsLogFallback('群路由处理失败', error)
      json(response, 500, { ok: false, message: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

let logHook: GroupsRouteDeps['log'] = () => undefined
function depsLogFallback(message: string, error: unknown): void {
  try {
    logHook(message, { message: String((error as Error)?.message ?? error).slice(0, 160) })
  } catch {
    /* 日志不许抛 */
  }
}

export function groupsHandlers(deps: GroupsRouteDeps): Array<{ path: string; handler: (request: IncomingMessage, response: ServerResponse) => unknown }> {
  logHook = deps.log
  return [
    {
      path: GROUPS_LIST_ROUTE,
      handler: readRoute(() => ({
        groups: deps.groups.list().map((group) => ({
          id: group.id,
          name: group.name,
          members: group.members,
          updatedAt: group.updatedAt,
        })),
      })),
    },
    {
      path: GROUPS_MESSAGES_ROUTE,
      handler: readRoute((url) =>
        deps.groups.read({
          id: url.searchParams.get('groupId') ?? '',
          limit: Number(url.searchParams.get('limit') ?? '') || undefined,
        }),
      ),
    },
    {
      path: GROUPS_SESSIONS_ROUTE,
      handler: async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        applyCors(request, response)
        if (preflight(request, response)) return
        const denied = rejected(request)
        if (denied !== undefined) {
          json(response, 403, { ok: false, error: denied })
          return
        }
        const sessions = await (deps.listSessions?.() ?? Promise.resolve([])).catch(() => [])
        json(response, 200, { ok: true, sessions })
      },
    },
    {
      path: GROUPS_CREATE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.create({
          name: String(body.name ?? ''),
          members: Array.isArray(body.sessionIds) ? body.sessionIds.map((id) => String(id)) : [],
          ...(typeof body.me === 'string' && body.me.trim() !== '' ? { me: body.me.trim() } : {}),
        }),
      ),
    },
    {
      path: GROUPS_INVITE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.invite({
          id: String(body.groupId ?? ''),
          members: Array.isArray(body.sessionIds) ? body.sessionIds.map((id) => String(id)) : [],
        }),
      ),
    },
    {
      path: GROUPS_POST_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.post({
          id: String(body.groupId ?? ''),
          from: 'user',
          kind: 'user',
          text: String(body.text ?? ''),
          targets: Array.isArray(body.targets) ? body.targets.map((id) => String(id)) : [],
        }),
      ),
    },
    {
      path: GROUPS_LEAVE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.leave({ id: String(body.groupId ?? ''), sessionId: String(body.sessionId ?? '') }),
      ),
    },
  ]
}
