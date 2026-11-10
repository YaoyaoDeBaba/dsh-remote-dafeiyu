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
export const XYQ_DESCRIBE_ROUTE = '/api/dsh-remote-dafeiyu/xyq/describe'
export const XYQ_GENERATE_ROUTE = '/api/dsh-remote-dafeiyu/xyq/generate'
export const XYQ_RESULT_ROUTE = '/api/dsh-remote-dafeiyu/xyq/result'
export const XYQ_FILE_ROUTE = '/api/dsh-remote-dafeiyu/xyq/file'

export interface XyqRouteDeps {
  service: XyqService
  /** 生成的产物目录（file 路由只允许读这下面）。 */
  outDir: string
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

/** `GET /xyq/describe?name=&type=`：模型的比例/分辨率/时长等选项。 */
export function xyqDescribeHandler(deps: XyqRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, error: '只支持 GET' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    const name = (url.searchParams.get('name') ?? '').trim()
    const type = url.searchParams.get('type') === 'video' ? 'video' : 'image'
    if (name === '') return json(response, 400, { ok: false, error: '缺少 name' })
    try {
      json(response, 200, await deps.service.describe(name, type))
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** `POST /xyq/generate`：提交生图/生视频任务（不等待完成）。 */
export function xyqGenerateHandler(deps: XyqRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (request.method !== 'POST') return json(response, 405, { ok: false, error: '只支持 POST' })
    if (String(request.headers['x-drc-pair'] ?? '') === '') return json(response, 403, { ok: false, error: 'missing x-drc-pair' })
    try {
      const body = JSON.parse(await readBody(request)) as Record<string, unknown>
      const type = body.type === 'video' ? 'video' : 'image'
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      const model = typeof body.model === 'string' ? body.model.trim() : ''
      if (prompt === '' || model === '') return json(response, 400, { ok: false, error: 'prompt 与 model 必填' })
      try {
        const { mkdirSync } = await import('node:fs')
        mkdirSync(deps.outDir, { recursive: true })
      } catch {
        /* 目录删了就删了，下载时会报错 */
      }
      const sessionKey = typeof body.sessionKey === 'string' && body.sessionKey !== '' ? body.sessionKey : 'xyq-panel'
      const result =
        type === 'video'
          ? await deps.service.startVideo({
              prompt,
              model,
              sessionKey,
              ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
              ...(typeof body.ratio === 'string' ? { ratio: body.ratio } : {}),
              ...(typeof body.resolution === 'string' ? { resolution: body.resolution } : {}),
            })
          : await deps.service.startImage({
              prompt,
              model,
              sessionKey,
              ...(typeof body.ratio === 'string' ? { ratio: body.ratio } : {}),
              ...(typeof body.resolution === 'string' ? { resolution: body.resolution } : {}),
              ...(typeof body.count === 'number' ? { count: body.count } : {}),
            })
      json(response, result.ok ? 200 : 502, result)
    } catch (error) {
      json(response, 400, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** `GET /xyq/result?threadId=&runId=`：查一次任务状态。 */
export function xyqResultHandler(deps: XyqRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, error: '只支持 GET' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    const threadId = (url.searchParams.get('threadId') ?? '').trim()
    const runId = (url.searchParams.get('runId') ?? '').trim()
    if (threadId === '' || runId === '') return json(response, 400, { ok: false, error: '缺少 threadId / runId' })
    try {
      json(response, 200, await deps.service.queryOnce(threadId, runId, deps.outDir))
    } catch (error) {
      json(response, 500, { ok: false, error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

/** `GET /xyq/file?path=`：把生成的文件读给面板预览（只允许 outDir 下的文件）。 */
export function xyqFileHandler(deps: XyqRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { ok: false, error: '只支持 GET' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    const target = (url.searchParams.get('path') ?? '').trim()
    if (target === '') return json(response, 400, { ok: false, error: '缺少 path' })
    const path = await import('node:path')
    const fs = await import('node:fs')
    const resolved = path.resolve(target)
    const root = path.resolve(deps.outDir)
    if (!resolved.startsWith(root + path.sep)) return json(response, 403, { ok: false, error: 'path-escape' })
    try {
      const data = fs.readFileSync(resolved)
      const ext = path.extname(resolved).toLowerCase()
      const mime = ext === '.mp4' ? 'video/mp4' : ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream'
      response.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.byteLength })
      if (request.method === 'HEAD') response.end()
      else response.end(data)
    } catch {
      json(response, 404, { ok: false, error: '文件不存在' })
    }
  }
}
