/**
 * sprite/routes —— 把工具页托管在宿主自己的回环路由上（给人用）。
 *
 * agent 那条路不走这里（它用 sprite/service 里那个"只服务工具页"的临时 http 服务，
 * 免得依赖宿主自己的 origin）。这条路由的价值是：用户在浏览器里打开一个链接就能用原工具，
 * 不用去翻插件目录。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { applyCors, preflight, hostIsLoopback, originIsLoopbackOrAbsent } from '../pill/routes.js'

export const SPRITE_PAGE_ROUTE = '/plugins/dafeiyu-sprite/'

export interface SpriteRouteDeps {
  toolHtmlPath: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export function spritePageHandler(deps: SpriteRouteDeps) {
  let cached: { html: Buffer; etag: string } | undefined
  const load = (): { html: Buffer; etag: string } => {
    if (cached) return cached
    const html = readFileSync(deps.toolHtmlPath)
    cached = { html, etag: `"${html.byteLength}"` }
    return cached
  }
  return (request: IncomingMessage, response: ServerResponse): void => {
    applyCors(request, response)
    if (preflight(request, response)) return
    if (!hostIsLoopback(request.headers.host)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('host-not-loopback')
      return
    }
    if (!originIsLoopbackOrAbsent(request.headers.origin)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('origin-not-trusted')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('只支持 GET')
      return
    }
    let page: { html: Buffer; etag: string }
    try {
      page = load()
    } catch (error) {
      deps.log('序列帧工具页读不出来', { message: String((error as Error)?.message ?? error).slice(0, 160) })
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(`工具页读不出来：${String((error as Error)?.message ?? error).slice(0, 200)}`)
      return
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': page.html.byteLength,
      'Cache-Control': 'no-store',
      ETag: page.etag,
    })
    if (request.method === 'HEAD') response.end()
    else response.end(page.html)
  }
}
