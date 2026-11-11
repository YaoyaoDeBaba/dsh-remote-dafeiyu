/**
 * vision/routes — 识图配置/识别/模型列表三条同域路由（**仅回环**）。
 *
 * 与远控那七条路由同一条守卫思路：只认 `localhost/127.0.0.1/::1` 的 Host，
 * 带 Origin 时只回声给「宿主自己」的 origin（`dsh-app:` 与环回 http(s)）。
 * 页面是 `dsh-app://` 上的跨源请求，所以 CORS 走 `applyCors` 同一份白名单。
 *
 * 请求体上限 25MB（base64 后的图片上限 20MB，剩余给 JSON 外壳）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'
import type { VisionService } from './service.js'
import { VisionError } from './protocols.js'

export const VISION_CONFIG_ROUTE = '/api/dsh-remote-dafeiyu/vision/config'
export const VISION_RECOGNIZE_ROUTE = '/api/dsh-remote-dafeiyu/vision/recognize'
export const VISION_MODELS_ROUTE = '/api/dsh-remote-dafeiyu/vision/models'

const MAX_BODY_BYTES = 25 * 1024 * 1024

export interface VisionRouteDeps {
  service: VisionService
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
      if (size > MAX_BODY_BYTES) {
        finish({ ok: false, status: 413, error: '请求太大（图片上限约 20MB）' })
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => finish({ ok: true, text: Buffer.concat(chunks).toString('utf8') }))
    request.on('error', (error) => finish({ ok: false, status: 400, error: `读取请求失败：${String((error as Error)?.message ?? error)}` }))
  })
}

export function visionConfigHandler(deps: VisionRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      json(response, 200, { ok: true, config: deps.service.view(), storageFile: deps.service.configFile })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: '只支持 GET（读）/ POST（写）' })
      return
    }
    const body = await readBody(request)
    if (!body.ok) {
      json(response, body.status, { ok: false, error: body.error })
      return
    }
    let parsed: unknown
    try {
      parsed = body.text === '' ? {} : JSON.parse(body.text)
    } catch {
      json(response, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const payload = (parsed && typeof parsed === 'object' ? parsed : {}) as { config?: unknown }
    const result = deps.service.save(payload.config !== undefined ? payload.config : parsed)
    if (!result.ok) {
      json(response, 500, { ok: false, error: result.error ?? '保存失败' })
      return
    }
    deps.log('识图配置已保存', { enabled: result.config?.enabled, model: result.config?.model })
    json(response, 200, { ok: true, config: result.config })
  }
}

export function visionRecognizeHandler(deps: VisionRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, error: '只支持 POST' })
      return
    }
    const body = await readBody(request)
    if (!body.ok) {
      json(response, body.status, { ok: false, error: body.error })
      return
    }
    let parsed: { imageBase64?: unknown; mime?: unknown; prompt?: unknown }
    try {
      parsed = (body.text === '' ? {} : JSON.parse(body.text)) as typeof parsed
    } catch {
      json(response, 400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const imageBase64 = typeof parsed.imageBase64 === 'string' ? parsed.imageBase64 : ''
    if (imageBase64 === '') {
      json(response, 400, { ok: false, error: '缺少 imageBase64' })
      return
    }
    try {
      const text = await deps.service.recognize({
        base64: imageBase64,
        mime: typeof parsed.mime === 'string' && parsed.mime.trim() !== '' ? parsed.mime.trim() : 'image/png',
        prompt: typeof parsed.prompt === 'string' ? parsed.prompt : undefined,
      })
      deps.log('识图完成', { chars: text.length })
      json(response, 200, { ok: true, text })
    } catch (error) {
      const status = error instanceof VisionError && error.status >= 400 ? 502 : 400
      const message = String((error as Error)?.message ?? error)
      deps.log('识图失败', { message: message.slice(0, 200) })
      json(response, status, { ok: false, error: message })
    }
  }
}

export function visionModelsHandler(deps: VisionRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const denied = rejected(request)
    if (denied) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    if (request.method !== 'POST' && request.method !== 'GET') {
      json(response, 405, { ok: false, error: '只支持 GET / POST' })
      return
    }
    try {
      const models = await deps.service.listModels()
      json(response, 200, { ok: true, models })
    } catch (error) {
      const status = error instanceof VisionError && error.status >= 400 ? 502 : 400
      json(response, status, { ok: false, error: String((error as Error)?.message ?? error) })
    }
  }
}

/** 注册三条路由并返回注销函数（与 `registerPillRoutes` 同款：一起挂、一起回滚）。 */
export function registerVisionRoutes(
  webServer: { register(route: { kind: 'exact'; path: string; handler: (request: IncomingMessage, response: ServerResponse) => unknown }): () => void },
  deps: VisionRouteDeps,
): () => void {
  const definitions = [
    { kind: 'exact' as const, path: VISION_CONFIG_ROUTE, handler: visionConfigHandler(deps) },
    { kind: 'exact' as const, path: VISION_RECOGNIZE_ROUTE, handler: visionRecognizeHandler(deps) },
    { kind: 'exact' as const, path: VISION_MODELS_ROUTE, handler: visionModelsHandler(deps) },
  ]
  const off: Array<() => void> = []
  const wrapped = definitions.map((definition) => ({
    ...definition,
    handler: (request: IncomingMessage, response: ServerResponse) => {
      applyCors(request, response)
      if (preflight(request, response)) return
      if (request?.method === 'OPTIONS') {
        response.writeHead(204)
        response.end()
        return
      }
      return definition.handler(request, response)
    },
  }))
  try {
    for (const definition of wrapped) off.push(webServer.register(definition))
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
