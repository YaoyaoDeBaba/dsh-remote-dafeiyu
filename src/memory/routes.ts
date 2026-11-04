/**
 * memory/routes — 记忆库的读写路由（仅回环）：`/api/dsh-remote-dafeiyu/memory`。
 *
 * 设置页「人设」分栏里的记忆面板走这两条：
 * - `GET  ?persona=<id>`                      → 该人设的记忆条目
 * - `POST {persona, action, ...}`             → add / remove / update / clear
 *
 * 守卫与识图路由同一套（Host 回环 + Origin 白名单 + CORS 回声）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { MemoryService } from './service.js'

export const MEMORY_ROUTE = '/api/dsh-remote-dafeiyu/memory'

export interface MemoryRouteDeps {
  service: MemoryService
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

function readBody(request: IncomingMessage): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let settled = false
    const finish = (value: { ok: true; text: string } | { ok: false; status: number; error: string }): void => {
      if (settled) return
      settled = true
      resolve(value)
    }
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > 1024 * 1024) {
        finish({ ok: false, status: 413, error: '请求太大' })
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    request.on('error', (error) => finish({ ok: false, status: 400, error: String((error as Error)?.message ?? error) }))
  })
}

function personaOf(request: IncomingMessage): string {
  try {
    const url = new URL(String(request.url ?? '/'), 'http://127.0.0.1')
    const value = url.searchParams.get('persona') ?? ''
    return value.trim()
  } catch {
    return ''
  }
}

export function memoryHandler(deps: MemoryRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const persona = personaOf(request)
      if (persona === '') {
        json(response, 400, { ok: false, error: '缺少 persona 参数' })
        return
      }
      json(response, 200, { ok: true, persona, entries: deps.service.list(persona) })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: '只支持 GET / POST' })
      return
    }
    const body = await readBody(request)
    if (!body.ok) {
      json(response, body.status, { ok: false, error: body.error })
      return
    }
    let parsed: Record<string, unknown>
    try {
      parsed = (body.text === '' ? {} : JSON.parse(body.text)) as Record<string, unknown>
    } catch {
      json(response, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const persona = typeof parsed.persona === 'string' ? parsed.persona.trim() : ''
    if (persona === '') {
      json(response, 400, { ok: false, error: '缺少 persona' })
      return
    }
    const action = typeof parsed.action === 'string' ? parsed.action : 'add'
    if (action === 'add') {
      const text = typeof parsed.text === 'string' ? parsed.text : ''
      const result = deps.service.add(persona, text, { importance: parsed.importance, source: 'manual' })
      if (!result.ok) {
        json(response, 400, { ok: false, error: result.error })
        return
      }
      json(response, 200, { ok: true, entries: deps.service.list(persona) })
      return
    }
    if (action === 'remove') {
      const id = typeof parsed.id === 'string' ? parsed.id : ''
      if (id === '' || !deps.service.remove(persona, id)) {
        json(response, 400, { ok: false, error: '没有这条记忆' })
        return
      }
      json(response, 200, { ok: true, entries: deps.service.list(persona) })
      return
    }
    if (action === 'update') {
      const id = typeof parsed.id === 'string' ? parsed.id : ''
      if (id === '' || !deps.service.update(persona, id, { text: parsed.text, importance: parsed.importance })) {
        json(response, 400, { ok: false, error: '没有这条记忆' })
        return
      }
      json(response, 200, { ok: true, entries: deps.service.list(persona) })
      return
    }
    if (action === 'clear') {
      if (!deps.service.clear(persona)) {
        json(response, 500, { ok: false, error: '清空失败' })
        return
      }
      json(response, 200, { ok: true, entries: [] })
      return
    }
    json(response, 400, { ok: false, error: `未知动作：${action}` })
  }
}

export function registerMemoryRoutes(
  webServer: { register(route: { kind: 'exact'; path: string; handler: (request: IncomingMessage, response: ServerResponse) => unknown }): () => void },
  deps: MemoryRouteDeps,
): () => void {
  const off: Array<() => void> = []
  try {
    off.push(
      webServer.register({
        kind: 'exact',
        path: MEMORY_ROUTE,
        handler: (request, response) => {
          applyCors(request, response)
          if (request?.method === 'OPTIONS') {
            response.writeHead(204)
            response.end()
            return
          }
          return memoryHandler(deps)(request, response)
        },
      }),
    )
  } catch (error) {
    for (const unregister of off.splice(0)) {
      try {
        unregister()
      } catch {
        /* 回滚途中再抛就没别的办法了 */
      }
    }
    throw error
  }
  return () => {
    for (const unregister of off) {
      try {
        unregister()
      } catch {
        /* 宿主可能已经先一步拆了 webServer */
      }
    }
  }
}
