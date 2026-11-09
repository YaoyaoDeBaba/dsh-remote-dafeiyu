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
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'

export const AVATAR_BASE = '/api/dsh-remote-dafeiyu/avatar'
export const AVATAR_MANIFEST_ROUTE = `${AVATAR_BASE}/manifest`
export const AVATAR_SHEET_ROUTE = `${AVATAR_BASE}/sheet`
export const AVATAR_STATE_ROUTE = `${AVATAR_BASE}/state`

export interface AvatarState {
  id: string
  label: string
  cols: number
  rows: number
  frames: number
  cellWidth: number
  cellHeight: number
  file: string
}

export interface AvatarManifest {
  version: number
  states: AvatarState[]
}

export function avatarDir(dshHome: string): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'avatar')
}

function sanitizeState(row: unknown): AvatarState | undefined {
  if (!row || typeof row !== 'object') return undefined
  const value = row as Record<string, unknown>
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0)
  const cols = num(value.cols)
  const rows = num(value.rows)
  const frames = num(value.frames)
  const file = typeof value.file === 'string' ? value.file : ''
  if (typeof value.id !== 'string' || cols <= 0 || rows <= 0 || frames <= 0 || file === '') return undefined
  if (path.basename(file) !== file) return undefined
  return {
    id: value.id,
    label: typeof value.label === 'string' && value.label !== '' ? value.label : value.id,
    cols,
    rows,
    frames,
    cellWidth: num(value.cellWidth) || 1,
    cellHeight: num(value.cellHeight) || 1,
    file,
  }
}

/** 读 manifest；文件缺失/坏了返回 undefined（端上显示“素材未安装”）。 */
export function loadAvatarManifest(dir: string): AvatarManifest | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { version?: unknown; states?: unknown }
    const states = Array.isArray(parsed.states) ? parsed.states.map(sanitizeState).filter((s): s is AvatarState => s !== undefined) : []
    if (states.length === 0) return undefined
    return { version: typeof parsed.version === 'number' ? parsed.version : 1, states }
  } catch {
    return undefined
  }
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

function readonly(request: IncomingMessage): boolean {
  return request.method === 'GET' || request.method === 'HEAD'
}

export function avatarManifestHandler(dir: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    const denied = rejected(request)
    if (denied) return json(response, 403, { ok: false, error: denied })
    if (!readonly(request)) return json(response, 405, { ok: false, error: '只支持 GET' })
    const manifest = loadAvatarManifest(dir)
    if (manifest === undefined) return json(response, 200, { ok: true, manifest: null, message: '虚拟形象素材未安装' })
    json(response, 200, { ok: true, manifest })
  }
}

export function avatarSheetHandler(dir: string) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
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
