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
export const GROUPS_REMOVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/remove'
export const GROUPS_OWNER_ROUTE = '/api/dsh-remote-dafeiyu/groups/owner'
export const GROUPS_ROLE_ROUTE = '/api/dsh-remote-dafeiyu/groups/role'
export const GROUPS_DISSOLVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/dissolve'
export const GROUPS_SESSIONS_ROUTE = '/api/dsh-remote-dafeiyu/groups/sessions'
/**
 * agent 兜底入口（2026-11-20）：工具没注册上的会话（老会话、工具晚到）也能发/读群消息。
 *
 * 存在理由：真机上「会话开着时才注册群工具」意味着**已经在跑的会话拿不到工具**，
 * 它们能收到群消息却回不了话。给一条本机回环的 HTTP 口子，agent 用 curl 就能补上。
 * 守卫与面板写路由同一套（Host 回环 + x-drc-pair），不额外开权限。
 */
export const GROUPS_AGENT_POST_ROUTE = '/api/dsh-remote-dafeiyu/groups/agent-post'
export const GROUPS_AGENT_READ_ROUTE = '/api/dsh-remote-dafeiyu/groups/agent-read'

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
      handler: async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
        applyCors(request, response)
        if (preflight(request, response)) return
        const denied = rejected(request)
        if (denied !== undefined) {
          json(response, 403, { ok: false, error: denied })
          return
        }
        const rows = (await (deps.listSessions?.() ?? Promise.resolve([])).catch(() => [])) as Array<{ id: string; title?: string }>
        const titles = new Map(rows.map((row) => [row.id, row.title]))
        const short = (id: string): string => String(id).replace(/^session-/, '').slice(0, 8)
        json(response, 200, {
          ok: true,
          groups: deps.groups.list().map((group) => ({
            id: group.id,
            name: group.name,
            dissolved: group.dissolvedAt !== undefined,
            owner: group.ownerSessionId,
            ownerName:
              group.ownerSessionId === undefined
                ? undefined
                : group.members.find((member) => member.sessionId === group.ownerSessionId)?.label?.trim() ||
                  titles.get(group.ownerSessionId)?.trim() ||
                  short(group.ownerSessionId),
            updatedAt: group.updatedAt,
            members: group.members.map((member) => ({
              sessionId: member.sessionId,
              role: member.role,
              // 名字优先级：成员自带的 label → 会话标题 → 短号（对用户显示的是名字，不是 id）
              name: member.label?.trim() || titles.get(member.sessionId)?.trim() || short(member.sessionId),
            })),
          })),
        })
      },
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
      handler: writeRoute(async (body) => {
        const created = deps.groups.create({
          name: String(body.name ?? ''),
          members: Array.isArray(body.sessionIds) ? body.sessionIds.map((id) => String(id)) : [],
          ...(typeof body.me === 'string' && body.me.trim() !== '' ? { me: body.me.trim() } : {}),
          // 面板传「第一个被勾选的会话」当群主
          ...(typeof body.owner === 'string' && body.owner.trim() !== '' ? { owner: body.owner.trim() } : {}),
        })
        // 建群后立刻推入群通知（唤醒成员）；发起方（me）不推
        if (created.ok && created.group !== undefined) {
          const except = typeof body.me === 'string' ? body.me.trim() : ''
          const announced = await deps.groups.announce({ id: created.group.id, ...(except === '' ? {} : { except }) })
          return { ...created, announced }
        }
        return created
      }),
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
      path: GROUPS_REMOVE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.remove({ id: String(body.groupId ?? ''), sessionId: String(body.sessionId ?? '') }),
      ),
    },
    {
      path: GROUPS_OWNER_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.setOwner({ id: String(body.groupId ?? ''), sessionId: String(body.sessionId ?? '') }),
      ),
    },
    {
      path: GROUPS_AGENT_POST_ROUTE,
      handler: writeRoute(async (body) => {
        const groupId = String(body.groupId ?? '')
        const sessionId = String(body.sessionId ?? '')
        if (groupId === '' || sessionId === '') {
          return { ok: false, message: '需要 groupId 和 sessionId（你自己的会话 id）。' }
        }
        const group = deps.groups.get(groupId)
        if (group === undefined) return { ok: false, message: '没有这个群。' }
        if (group.members.every((member) => member.sessionId !== sessionId)) {
          return { ok: false, message: '你不在这个群里：先用 group_invite 或让群主把你拉进来。' }
        }
        const targets = Array.isArray(body.to) ? body.to.map((id) => String(id)) : []
        return deps.groups.post({
          id: groupId,
          from: sessionId,
          text: String(body.text ?? ''),
          targets,
          kind: 'agent',
        })
      }),
    },
    {
      path: GROUPS_AGENT_READ_ROUTE,
      handler: readRoute((url) => {
        const groupId = url.searchParams.get('groupId') ?? ''
        const sessionId = url.searchParams.get('sessionId') ?? ''
        const group = deps.groups.get(groupId)
        if (group === undefined) return { ok: false, message: '没有这个群。' }
        if (sessionId !== '' && group.members.every((member) => member.sessionId !== sessionId)) {
          return { ok: false, message: '你不在这个群里。' }
        }
        return deps.groups.read({ id: groupId, limit: Number(url.searchParams.get('limit') ?? '') || undefined })
      }),
    },
    {
      path: GROUPS_ROLE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.setMemberRole({
          id: String(body.groupId ?? ''),
          sessionId: String(body.sessionId ?? ''),
          role: String(body.role ?? ''),
        }),
      ),
    },
    {
      path: GROUPS_DISSOLVE_ROUTE,
      handler: writeRoute((body) => deps.groups.dissolve({ id: String(body.groupId ?? '') })),
    },
    {
      path: GROUPS_LEAVE_ROUTE,
      handler: writeRoute((body) =>
        deps.groups.leave({ id: String(body.groupId ?? ''), sessionId: String(body.sessionId ?? '') }),
      ),
    },
  ]
}
