/**
 * xyq/routes — 设置页用的只读/配置路由（仅回环，写要 `x-drc-pair`）。
 *
 * 只暴露“设置页需要的”：配置（密钥脱敏）、登录状态、余额、模型列表。
 * 生成本身走工具调用，不在这里开第二条收费入口。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { XyqService } from './service.js'

export const XYQ_CONFIG_ROUTE = '/api/dsh-remote-dafeiyu/xyq/config'
export const XYQ_STATUS_ROUTE = '/api/dsh-remote-dafeiyu/xyq/status'
export const XYQ_BALANCE_ROUTE = '/api/dsh-remote-dafeiyu/xyq/balance'
export const XYQ_MODELS_ROUTE = '/api/dsh-remote-dafeiyu/xyq/models'

export interface XyqRouteDeps {
  service: XyqService
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

export function xyqConfigHandler(deps: XyqRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      json(response, 200, { ok: true, config: deps.service.view() })
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
      json(response, 200, { ok: true, config: deps.service.update(body) })
    } catch (error) {
      json(response, 400, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** status / balance / models 三条只读路由。 */
export function xyqQueryHandler(kind: 'status' | 'balance' | 'models', deps: XyqRouteDeps) {
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
    try {
      if (kind === 'status') {
        json(response, 200, await deps.service.status())
        return
      }
      if (kind === 'balance') {
        json(response, 200, await deps.service.balance())
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      const type = url.searchParams.get('type') === 'image' ? 'image' : 'video'
      json(response, 200, await deps.service.models(type))
    } catch (error) {
      deps.log('小云雀查询路由失败', { kind, message: String((error as Error)?.message ?? error).slice(0, 160) })
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}
