/**
 * handoff/routes —— 「一键转生 / 一键分身」的只读回环路由 + 两条写路由。
 *
 * 守卫与其它写路由同一条：Host 必须回环、Origin 只认宿主自己、写操作要带 `x-drc-pair`
 * （桌面宿主转发时会删掉 Origin，所以那条判据在真机上不成立）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { HandoffKind } from './prompt.js'
import type { HandoffJob, SelfCheck } from './service.js'

export const HANDOFF_SELF_ROUTE = '/api/dsh-remote-dafeiyu/handoff/self'
export const HANDOFF_START_ROUTE = '/api/dsh-remote-dafeiyu/handoff/start'
export const HANDOFF_STATUS_ROUTE = '/api/dsh-remote-dafeiyu/handoff/status'

export interface HandoffRouteDeps {
  start: (
    kind: HandoffKind,
    sessionId: string,
    note?: string,
    boundary?: string,
  ) => Promise<{ ok: boolean; jobId?: string; message?: string }>
  status: (jobId: string) => HandoffJob | undefined
  list: () => HandoffJob[]
  selfCheck: (sessionId: string, cwd?: string) => SelfCheck
  /** 当前会话的工作目录（自检里显示给用户看）。 */
  sessionCwd: (sessionId: string) => Promise<string | undefined>
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
      if (size > 16 * 1024) {
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

/** `GET /handoff/self?sessionId=` —— 面板打开时的自检数据。 */
export function handoffSelfHandler(deps: HandoffRouteDeps) {
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
    try {
      const cwd = await deps.sessionCwd(sessionId)
      json(response, 200, deps.selfCheck(sessionId, cwd))
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/**
 * `POST /handoff/start` —— 注入写作指令，立刻回 jobId（不等交接写完）。
 *
 * 为什么不等：写交接文档要模型跑完整一轮，几十秒到几分钟；HTTP 卡在那儿
 * 面板就只能显示一个转圈，连"卡在哪一步"都说不出来。
 */
export function handoffStartHandler(deps: HandoffRouteDeps) {
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
    let body: { kind?: unknown; sessionId?: unknown; note?: unknown; boundary?: unknown }
    try {
      body = JSON.parse(await readBody(request)) as typeof body
    } catch {
      json(response, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const kind: HandoffKind = body.kind === 'branch' ? 'branch' : 'rebirth'
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
    if (sessionId === '') {
      json(response, 400, { ok: false, error: '缺少 sessionId' })
      return
    }
    try {
      const answer = await deps.start(
        kind,
        sessionId,
        typeof body.note === 'string' ? body.note : undefined,
        typeof body.boundary === 'string' ? body.boundary : undefined,
      )
      json(response, answer.ok ? 200 : 400, answer)
    } catch (error) {
      deps.log('转生/分身启动失败', { message: String((error as Error)?.message ?? error).slice(0, 200) })
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** `GET /handoff/status?jobId=` —— 面板每 1.5 秒问一次。 */
export function handoffStatusHandler(deps: HandoffRouteDeps) {
  return (request: IncomingMessage, response: ServerResponse): void => {
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
    const jobId = (url.searchParams.get('jobId') ?? '').trim()
    if (jobId === '') {
      // 没给 jobId 时回最近几条：面板刷新/重开还能看到上一次的结果。
      json(response, 200, { ok: true, jobs: deps.list() })
      return
    }
    const job = deps.status(jobId)
    if (!job) {
      json(response, 404, { ok: false, error: '没有这个作业（可能重启过）' })
      return
    }
    json(response, 200, { ok: true, job })
  }
}
