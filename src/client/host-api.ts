/**
 * host-api — 浏览器半侧调宿主回环路由的最小封装（0.9.x）。
 *
 * 只用 GET / POST；所有请求带超时（宿主卡住时不挂页面）；响应统一解析成
 * `{ ok, ... }`，非 JSON 响应也转成一个带 HTTP 状态的可读错误。
 */
import { resolveHostUrl } from './host-url.js'

export const VISION_BASE = '/api/dsh-remote-dafeiyu/vision'
export const MEMORY_BASE = '/api/dsh-remote-dafeiyu/memory'
export const PERSONA_STATUS = '/api/dsh-persona-dafeiyu/status'

export async function callJson(path: string, body: unknown | undefined, timeoutMs = 20_000): Promise<Record<string, unknown>> {
  const init: RequestInit =
    body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) init.signal = AbortSignal.timeout(timeoutMs)
  const response = await fetch(resolveHostUrl(path), init)
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, error: `宿主返回了非 JSON（HTTP ${response.status}）` }
  }
}
