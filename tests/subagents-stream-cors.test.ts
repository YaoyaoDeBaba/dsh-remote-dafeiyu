/**
 * subagents-stream-cors.test —— SSE 路由的跨源头（2026-11-17）。
 *
 * 真机现象：控制台一串 "blocked by CORS policy ... subagents/stream"，派活助手的实时刷新
 * 静默退回 30 秒慢轮询。根因是这条路由漏了 applyCors——桌面页在 dsh-app:// 上，每个请求都跨源。
 *
 * 判据：带 Origin 的 GET 必须回 Access-Control-Allow-Origin；OPTIONS 预检也必须是 204/200 而不是 405。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { subagentsHandler, subagentsStreamHandler } from '../src/subagents/routes.js'

interface FakeResponse {
  status: number
  headers: Record<string, string>
  chunks: string[]
  setHeader(name: string, value: string): void
  writeHead(status: number, headers?: Record<string, string>): void
  write(chunk: string): boolean
  end(): void
}

function makeResponse(): FakeResponse {
  return {
    status: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value)
    },
    writeHead(status, headers) {
      this.status = status
      for (const [key, value] of Object.entries(headers ?? {})) this.headers[key.toLowerCase()] = String(value)
    },
    write(chunk) {
      this.chunks.push(String(chunk))
      return true
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') this.chunks.push(chunk)
    },
  }
}

interface FakeRequest {
  request: IncomingMessage
  /** 触发 close：**必须调**，否则 SSE 的心跳定时器会让整个测试进程退不出去。 */
  close(): void
}

function makeRequest(method: string, origin?: string): FakeRequest {
  const handlers: Record<string, Array<() => void>> = {}
  const request = {
    method,
    url: '/api/dsh-remote-dafeiyu/subagents/stream',
    headers: { host: '127.0.0.1:19387', ...(origin === undefined ? {} : { origin }) },
    on(type: string, handler: () => void) {
      const list = handlers[type] ?? []
      list.push(handler)
      handlers[type] = list
    },
    destroy() {},
  }
  return {
    request: request as unknown as IncomingMessage,
    close() {
      for (const handler of handlers.close ?? []) handler()
    },
  }
}

test('SSE：带 dsh-app:// 的 Origin 必须回声 ACAO（否则 EventSource 被浏览器挡掉）', () => {
  const response = makeResponse()
  const call = makeRequest('GET', 'dsh-app://app')
  subagentsStreamHandler()(call.request, response as unknown as ServerResponse)
  call.close()
  assert.equal(response.status, 200)
  assert.equal(response.headers['access-control-allow-origin'], 'dsh-app://app', '缺这个头，桌面页收不到推送')
  assert.equal(response.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.ok(response.chunks.some((chunk) => chunk.includes('retry:')), 'SSE 要给重连间隔')
})

test('SSE：OPTIONS 预检不许回 405（浏览器先发预检时不能把连接打死）', () => {
  const response = makeResponse()
  const call = makeRequest('OPTIONS', 'dsh-app://app')
  subagentsStreamHandler()(call.request, response as unknown as ServerResponse)
  call.close()
  assert.ok(response.status === 204 || response.status === 200, '预检要给 2xx，实际 ' + response.status)
  assert.equal(response.headers['access-control-allow-origin'], 'dsh-app://app')
})

test('SSE：外来 Origin 仍然不许跨源（这条 CORS 不是给任意网页开的）', () => {
  const response = makeResponse()
  const call = makeRequest('GET', 'https://evil.example.com')
  subagentsStreamHandler()(call.request, response as unknown as ServerResponse)
  call.close()
  assert.equal(response.headers['access-control-allow-origin'], undefined, '外来 Origin 不许回声')
})

test('GET /subagents 带出取证：面板只看到空表时也知道是哪条路读不出来', async () => {
  const response = makeResponse()
  const handler = subagentsHandler({
    list: async () => [],
    config: {
      read: () => ({ version: 1, enabled: true, guidance: true, idleWarnMs: 1, mode: 'foreman', autoArchive: false }),
      write: () => ({ version: 1, enabled: true, guidance: true, idleWarnMs: 1, mode: 'foreman', autoArchive: false }),
    },
    debug: () => ({ source: 'none', trusted: false, count: 0, error: 'listChildren 返回的形状不认识' }),
    log: () => {},
  })
  const request = {
    method: 'GET',
    url: '/api/dsh-remote-dafeiyu/subagents?sessionId=session-1',
    headers: { host: '127.0.0.1:19387' },
    on() {},
  } as unknown as IncomingMessage
  await handler(request, response as unknown as ServerResponse)
  const body = JSON.parse(response.chunks.join('')) as { ok: boolean; items: unknown[]; debug?: { source?: string } }
  assert.equal(body.ok, true)
  assert.deepEqual(body.items, [])
  assert.equal(body.debug?.source, 'none', '空表时必须带出走的哪条路')
})
