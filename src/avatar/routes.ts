/**
 * avatar/routes — 虚拟形象素材的只读路由（仅回环）。
 *
 * 素材来源：`<DSH_HOME>/storages/dsh-remote-dafeiyu/avatar/`
 *   - `manifest.json`：8 个动作的元数据（网格、帧数、格子尺寸、文件）；
 *   - `<id>.webp`：8×6 的 sprite sheet（已从原始 40MB PNG 缩成 ~2MB webp）。
 *
 * 端点（都支持 GET/HEAD）：
 *   GET /api/dsh-remote-dafeiyu/avatar/manifest        → { ok, manifest }
 *   GET /api/dsh-remote-dafeiyu/avatar/sheet?id=idle  → image/webp
 *
 * 安全：id 必须出现在 manifest 的 states 里，且解析后的路径必须仍在该目录下。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'

export const AVATAR_BASE = '/api/dsh-remote-dafeiyu/avatar'
export const AVATAR_MANIFEST_ROUTE = `${AVATAR_BASE}/manifest`
export const AVATAR_SHEET_ROUTE = `${AVATAR_BASE}/sheet`
export const AVATAR_STATE_ROUTE = `${AVATAR_BASE}/state`

// 素材契约与读盘都在 `platform/avatar-manifest.ts`（本体协议层也要用，形象拆包后它留下）。
// 这里**引入并转出**，避免同一份 schema 在 `avatar/` 里再存一遍。
import { loadAvatarManifest, type AvatarManifest, type AvatarState } from '../platform/avatar-manifest.js'
export { avatarDir, loadAvatarManifest, type AvatarManifest, type AvatarState } from '../platform/avatar-manifest.js'

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

function readonly(request: IncomingMessage): boolean {
  return request.method === 'GET' || request.method === 'HEAD'
}

export function avatarManifestHandler(dir: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (!readonly(request)) return json(response, 405, { ok: false, error: '只支持 GET' })
    const manifest = loadAvatarManifest(dir)
    response.setHeader('Cache-Control', 'no-store')
    if (manifest === undefined) return json(response, 200, { ok: true, manifest: null, message: '虚拟形象素材未安装' })
    json(response, 200, { ok: true, manifest })
  }
}

export function avatarSheetHandler(dir: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (!readonly(request)) return json(response, 405, { ok: false, error: '只支持 GET' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    const id = (url.searchParams.get('id') ?? '').trim()
    if (id === '') return json(response, 400, { ok: false, error: '缺少 id' })
    const manifest = loadAvatarManifest(dir)
    const state = manifest?.states.find((row) => row.id === id)
    if (state === undefined) return json(response, 404, { ok: false, error: '没有这个动作' })
    const file = path.resolve(dir, state.file)
    if (!file.startsWith(path.resolve(dir) + path.sep)) return json(response, 403, { ok: false, error: 'path-escape' })
    let data: Buffer
    try {
      data = fs.readFileSync(file)
    } catch {
      return json(response, 404, { ok: false, error: '素材文件不存在' })
    }
    response.writeHead(200, {
      'Content-Type': 'image/webp',
      'Content-Length': data.byteLength,
      'Cache-Control': 'public, max-age=86400, immutable',
    })
    if (request.method === 'HEAD') response.end()
    else response.end(data)
  }
}


/** `GET /avatar/state?sessionId=`：当前会话的 agent 状态（running/idle），给聊天页形象自动切动作。 */
export function avatarStateHandler(getStatus: (sessionId: string) => string | undefined) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (!readonly(request)) return json(response, 405, { ok: false, error: '只支持 GET' })
    const url = new URL(request.url ?? '/', 'http://localhost')
    const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
    if (sessionId === '') return json(response, 400, { ok: false, error: '缺少 sessionId' })
    let status: string | undefined
    try {
      status = getStatus(sessionId)
    } catch {
      status = undefined
    }
    json(response, 200, { ok: true, status: status === 'running' ? 'running' : 'idle' })
  }
}
