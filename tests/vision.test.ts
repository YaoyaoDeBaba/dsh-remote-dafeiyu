/**
 * 识图（`src/vision/*`）的判据。
 *
 * 分两层：
 * 1. **纯函数层**（配置规整 / 协议模板 / 取文本）—— 不碰网络，判据钉住"哪家 API 怎么发、怎么取回"；
 * 2. **服务层**（配置落盘往返 / 未开启与无 key 的报错 / 模型列表）—— 网络用桩替换，跑得快。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  DEFAULT_VISION_CONFIG,
  detectProtocol,
  normalizeVisionConfig,
  redactKey,
  resolveProtocol,
  toView,
} from '../src/vision/config.js'
import { buildRequest, splitPath, textFrom, VisionError } from '../src/vision/protocols.js'
import { createVisionService, readVisionConfig, recognize, writeVisionConfig } from '../src/vision/service.js'
import { VISION_CONFIG_ROUTE } from '../src/vision/routes.js'
import { startVision } from '../src/vision/start.js'

test('配置：脏值各自回落默认，越界超时被夹住', () => {
  const raw = normalizeVisionConfig({
    enabled: 'yes', // 非 boolean ⇒ 保持默认
    apiBase: '  https://x.test/v1  ',
    apiKey: '  sk-1234567890  ',
    model: '',
    protocol: 'nope',
    timeoutMs: 999_999,
  })
  assert.equal(raw.enabled, DEFAULT_VISION_CONFIG.enabled)
  assert.equal(raw.apiBase, 'https://x.test/v1')
  assert.equal(raw.apiKey, 'sk-1234567890')
  assert.equal(raw.model, DEFAULT_VISION_CONFIG.model)
  assert.equal(raw.protocol, 'auto')
  assert.equal(raw.timeoutMs, 300_000)

  const tiny = normalizeVisionConfig({ timeoutMs: 1 })
  assert.equal(tiny.timeoutMs, 5_000)
})

test('配置：key 打码不回显，view 只说有没有', () => {
  assert.equal(redactKey(''), '')
  assert.equal(redactKey('short'), '********')
  assert.equal(redactKey('sk-abcdefghijklmn'), 'sk-…klmn')
  const view = toView({ ...DEFAULT_VISION_CONFIG, apiKey: 'sk-abcdefghijklmn' })
  assert.equal(view.apiKeySet, true)
  assert.equal(view.apiKeyHint, 'sk-…klmn')
  assert.equal((view as unknown as Record<string, unknown>).apiKey, undefined)
})

test('协议：按 apiBase 猜', () => {
  assert.equal(detectProtocol('https://api.openai.com/v1'), 'openai-chat')
  assert.equal(detectProtocol('https://api.anthropic.com'), 'anthropic')
  assert.equal(detectProtocol('https://generativelanguage.googleapis.com/v1beta'), 'gemini')
  assert.equal(detectProtocol('https://ark.example.com/v1/responses'), 'openai-responses')
  const base = { ...DEFAULT_VISION_CONFIG, apiBase: 'https://api.anthropic.com' }
  assert.equal(resolveProtocol(base), 'anthropic')
  assert.equal(resolveProtocol({ ...base, protocol: 'openai-chat' }), 'openai-chat')
})

test('协议：openai-chat 请求体内嵌 dataURL，空内容报错', () => {
  const config = { ...DEFAULT_VISION_CONFIG, apiBase: 'https://api.openai.com/v1', model: 'm' }
  const prepared = buildRequest(config, { base64: 'AAAA', mime: 'image/png' })
  assert.equal(prepared.url, 'https://api.openai.com/v1/chat/completions')
  const body = JSON.parse(prepared.body) as { messages: Array<{ content: Array<Record<string, unknown>> }> }
  const parts = body.messages[0]!.content
  assert.equal(parts[1]!.type, 'image_url')
  assert.deepEqual(parts[1]!.image_url, { url: 'data:image/png;base64,AAAA' })
  assert.equal(prepared.extract({ choices: [{ message: { content: ' 你好 ' } }] }), '你好')
  assert.throws(() => prepared.extract({ choices: [{ message: { content: '' } }] }), VisionError)
})

test('协议：responses / anthropic / gemini 的取文本', () => {
  const base = { ...DEFAULT_VISION_CONFIG, apiBase: 'https://api.x.test/v1', model: 'm' }

  const responses = buildRequest({ ...base, protocol: 'openai-responses', apiBase: 'https://api.x.test/v1' }, { base64: 'AA', mime: 'image/png' })
  assert.equal(responses.url, 'https://api.x.test/v1/responses')
  assert.equal(
    responses.extract({ output: [{ content: [{ text: '截图描述' }] }] }),
    '截图描述',
  )

  const claude = buildRequest({ ...base, apiKey: 'sk-test', protocol: 'anthropic', apiBase: 'https://api.anthropic.com' }, { base64: 'AA', mime: 'image/jpeg' })
  assert.equal(claude.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(claude.headers['x-api-key'], 'sk-test')
  assert.equal(claude.extract({ content: [{ type: 'text', text: '猫' }] }), '猫')

  const gemini = buildRequest({ ...base, protocol: 'gemini', apiBase: 'https://g.test/v1beta' }, { base64: 'AA', mime: 'image/png' })
  assert.equal(gemini.url, 'https://g.test/v1beta/models/m:generateContent')
  assert.equal(gemini.extract({ candidates: [{ content: { parts: [{ text: '狗' }] } }] }), '狗')
})

test('协议：自定义模板与响应路径', () => {
  const config = {
    ...DEFAULT_VISION_CONFIG,
    protocol: 'custom' as const,
    apiBase: 'https://custom.test/understand',
    requestTemplate: '{"m":{{model}},"p":{{prompt}},"img":{{image}}}',
    responsePath: 'data.0.text',
  }
  const prepared = buildRequest(config, { base64: 'QUJD', mime: 'image/png', prompt: '描述' })
  assert.equal(prepared.url, 'https://custom.test/understand')
  const body = JSON.parse(prepared.body) as Record<string, unknown>
  assert.equal(body.m, DEFAULT_VISION_CONFIG.model)
  assert.equal(body.p, '描述')
  assert.equal(body.img, 'QUJD')
  assert.equal(prepared.extract({ data: [{ text: '自定义' }] }), '自定义')
  assert.deepEqual(splitPath('data.0.text'), ['data', '0', 'text'])
  assert.equal(textFrom([{ text: 'a' }, 'b']), 'a\nb')

  assert.throws(() => buildRequest({ ...config, requestTemplate: '' }, { base64: 'AA', mime: 'image/png' }), VisionError)
  assert.throws(() => buildRequest({ ...config, responsePath: '' }, { base64: 'AA', mime: 'image/png' }), VisionError)
})

test('服务：配置落盘往返，坏文件回落默认', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dafeiyu-vision-'))
  try {
    const file = path.join(dir, 'vision.json')
    writeVisionConfig(file, { ...DEFAULT_VISION_CONFIG, enabled: true, model: 'x' })
    const read = readVisionConfig(file)
    assert.equal(read.enabled, true)
    assert.equal(read.model, 'x')
    assert.equal(readVisionConfig(path.join(dir, 'missing.json')).enabled, DEFAULT_VISION_CONFIG.enabled)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('服务：关着 / 没 key 时识图报清楚原因', async () => {
  const config = { ...DEFAULT_VISION_CONFIG, enabled: false, apiKey: 'k' }
  await assert.rejects(() => recognize(config, { base64: 'AA', mime: 'image/png' }), /识图未开启/)
  await assert.rejects(
    () => recognize({ ...config, enabled: true, apiKey: '' }, { base64: 'AA', mime: 'image/png' }),
    /API Key/,
  )
  await assert.rejects(
    () => recognize({ ...config, enabled: true, apiKey: 'k' }, { base64: '', mime: 'image/png' }),
    /图片内容为空/,
  )
})

test('服务：识图成功走桩 fetch，模型列表解析', async () => {
  const original = globalThis.fetch
  const calls: string[] = []
  try {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push(String(input))
      if (String(input).endsWith('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'other' }] }), { status: 200 })
      }
      assert.equal(init?.method, 'POST')
      return new Response(JSON.stringify({ choices: [{ message: { content: '一张报错截图' } }] }), { status: 200 })
    }) as unknown as typeof fetch

    const config = { ...DEFAULT_VISION_CONFIG, enabled: true, apiKey: 'k', apiBase: 'https://api.x.test/v1' }
    assert.equal(await recognize(config, { base64: 'AA', mime: 'image/png' }), '一张报错截图')
    assert.match(calls[0]!, /\/chat\/completions$/)

    const service = createVisionService(mkdtempSync(path.join(tmpdir(), 'dafeiyu-vision-svc-')))
    service.save({ ...config, enabled: true })
    assert.deepEqual(await service.listModels(), ['gpt-4o-mini', 'other'])
    assert.equal(service.enabled(), true)
    assert.equal(service.describe().configured, true)
  } finally {
    globalThis.fetch = original
  }
})


// ── 路由层（fake req/res + 桩 fetch）────────────────────────────────────────

interface FakeResponse {
  status: number
  body: Record<string, unknown>
  ended: boolean
}

function fakeResponse(): { response: never; get: () => FakeResponse } {
  const state = { status: 0, body: {} as Record<string, unknown>, ended: false }
  const response = {
    ...state,
    writeHead(status: number, _headers?: Record<string, string>) {
      state.status = status
    },
    setHeader() {
      /* CORS 头不需要断言 */
    },
    end(payload?: string) {
      state.ended = true
      if (payload) state.body = JSON.parse(payload) as Record<string, unknown>
    },
  }
  return { response: response as never, get: () => state }
}

function fakeRequest(method: string, headers: Record<string, string>, body?: string): never {
  const listeners: Record<string, Array<(chunk?: unknown) => void>> = {}
  const request = {
    method,
    headers,
    on(event: string, listener: (chunk?: unknown) => void) {
      ;(listeners[event] ??= []).push(listener)
      return request
    },
    destroy() {
      /* no-op */
    },
  }
  queueMicrotask(() => {
    if (body !== undefined) for (const listener of listeners.data ?? []) listener(Buffer.from(body, 'utf8'))
    for (const listener of listeners.end ?? []) listener()
  })
  return request as never
}

const LOOPBACK_HEADERS = { host: '127.0.0.1:50337' }

test('路由：只回环可读，配置 GET 不回显 key', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dafeiyu-vision-route-'))
  try {
    const service = createVisionService(dir)
    const { visionConfigHandler } = await import('../src/vision/routes.js')
    const handler = visionConfigHandler({ service, log: () => undefined })

    const denied = fakeResponse()
    await handler(fakeRequest('GET', { host: 'evil.example.com' }), denied.response)
    assert.equal(denied.get().status, 403)

    const ok = fakeResponse()
    await handler(fakeRequest('GET', LOOPBACK_HEADERS), ok.response)
    assert.equal(ok.get().status, 200)
    assert.equal(ok.get().body.ok, true)
    const config = ok.get().body.config as Record<string, unknown>
    assert.equal(config.apiKey, undefined)
    assert.equal(config.apiKeySet, false)

    const save = fakeResponse()
    const body = JSON.stringify({ config: { enabled: true, apiKey: 'sk-secret-1234', model: 'm2' } })
    await handler(fakeRequest('POST', { ...LOOPBACK_HEADERS, origin: 'dsh-app://desktop' }, body), save.response)
    assert.equal(save.get().status, 200)
    assert.equal((save.get().body.config as Record<string, unknown>).apiKeySet, true)
    assert.equal(service.enabled(), true)
    assert.equal(service.current().model, 'm2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('路由：识图 POST 走桩 fetch；缺图 400；上游 502', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dafeiyu-vision-route2-'))
  const original = globalThis.fetch
  try {
    const service = createVisionService(dir)
    service.save({ enabled: true, apiKey: 'k', apiBase: 'https://api.x.test/v1' })
    const { visionRecognizeHandler } = await import('../src/vision/routes.js')
    const handler = visionRecognizeHandler({ service, log: () => undefined })

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '一张图' } }] }), { status: 200 })) as unknown as typeof fetch
    const ok = fakeResponse()
    await handler(fakeRequest('POST', LOOPBACK_HEADERS, JSON.stringify({ imageBase64: 'AA', mime: 'image/png' })), ok.response)
    assert.equal(ok.get().status, 200)
    assert.equal(ok.get().body.text, '一张图')

    const missing = fakeResponse()
    await handler(fakeRequest('POST', LOOPBACK_HEADERS, JSON.stringify({})), missing.response)
    assert.equal(missing.get().status, 400)

    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const failed = fakeResponse()
    await handler(fakeRequest('POST', LOOPBACK_HEADERS, JSON.stringify({ imageBase64: 'AA' })), failed.response)
    assert.equal(failed.get().status, 502)
    assert.match(String(failed.get().body.error), /HTTP 500/)
  } finally {
    globalThis.fetch = original
    rmSync(dir, { recursive: true, force: true })
  }
})

test('接线：startVision 挂路由；关着时不塞提示词段，打开后才注册段与工具', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dafeiyu-vision-start-'))
  try {
    const makeCtx = () => {
      const routes: Array<{ path: string }> = []
      const tools: Array<{ name?: string }> = []
      const sections: Array<{ name: string; order?: number }> = []
      const ctx = {
        get(name: string, optional: true) {
          if (name === 'webServer' && optional) {
            return { register(route: { path: string }) { routes.push(route); return () => {} } }
          }
          if (name === 'systemPrompt' && optional) {
            return { section(definition: { name: string; order?: number }) { sections.push(definition); return () => {} } }
          }
          if (name === 'tools' && optional) {
            return { register(definition: { name?: string }) { tools.push(definition) } }
          }
          return undefined
        },
        inject() { return () => undefined },
        provide() {},
      }
      return { ctx, routes, tools, sections }
    }

    const off = makeCtx()
    const disabled = startVision(off.ctx as never, { dshHome: home, log: () => {} })
    assert.ok(off.routes.some((route) => route.path === VISION_CONFIG_ROUTE), '识图路由要挂上')
    assert.equal(disabled.probe.section, 'disabled')
    assert.equal(off.tools.length, 0, '没开启就别注册工具')
    disabled.stop()

    const service = createVisionService(home)
    assert.equal(writeVisionConfig(service.configFile, { ...DEFAULT_VISION_CONFIG, enabled: true, apiKey: 'sk-test' }), true)

    const on = makeCtx()
    const enabled = startVision(on.ctx as never, { dshHome: home, log: () => {} })
    assert.equal(enabled.probe.section, 'registered')
    assert.ok(on.sections.some((section) => section.name === 'dafeiyu:vision' && section.order === 10_100))
    assert.ok(on.tools.some((tool) => tool.name === 'recognize_image'))
    enabled.stop()
    // 二次 stop 幂等
    enabled.stop()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
