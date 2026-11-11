/**
 * sprite.test — 序列帧精灵图工具的**接线判据**（不跑浏览器）。
 *
 * 这里钉三件事：
 * 1. 工具页路由的守卫（Host 必须环回、只读、缺文件要明确报错）；
 * 2. `startSprite` 在缺工具页时**不注册任何工具**（免得模型调到一半发现没有实现）；
 * 3. 工具页在时注册 5 个工具，且每个工具都是"参数 → JSON 字符串"的形状。
 *
 * 真跑一遍抽帧/抠图需要无头 Edge，那属于真机验收（见交接文档）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SPRITE_PAGE_ROUTE, spritePageHandler } from '../src/sprite/routes.js'
import { SPRITE_GUIDANCE, startSprite } from '../src/sprite/start.js'
import { findBrowser } from '../src/sprite/browser.js'

interface Reply {
  status: number
  body: string
  headers: Record<string, unknown>
}

function response(): { res: ServerResponse; reply: () => Reply } {
  const captured: Reply = { status: 0, body: '', headers: {} }
  const res = {
    writeHead(status: number, headers?: Record<string, unknown>) {
      captured.status = status
      captured.headers = { ...(headers ?? {}) }
      return res
    },
    end(chunk?: unknown) {
      captured.body = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : ''
      return res
    },
  } as unknown as ServerResponse
  return { res, reply: () => captured }
}

const request = (method: string, headers: Record<string, string> = {}): IncomingMessage =>
  ({ method, url: SPRITE_PAGE_ROUTE, headers }) as unknown as IncomingMessage

const LOOPBACK = { host: '127.0.0.1:19387' }

test('工具页路由：环回可读、非环回 403、非 GET 405、缺文件 500 且说明原因', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-'))
  try {
    const file = path.join(dir, 'sprite-tool.html')
    writeFileSync(file, '<html><body>工具</body></html>', 'utf8')
    const handler = spritePageHandler({ toolHtmlPath: file, log: () => {} })

    const ok = response()
    handler(request('GET', LOOPBACK), ok.res)
    assert.equal(ok.reply().status, 200)
    assert.match(ok.reply().body, /工具/)
    assert.match(String(ok.reply().headers['Content-Type']), /text\/html/)

    const hostile = response()
    handler(request('GET', { host: 'evil.example.com' }), hostile.res)
    assert.equal(hostile.reply().status, 403)

    const wrongMethod = response()
    handler(request('POST', LOOPBACK), wrongMethod.res)
    assert.equal(wrongMethod.reply().status, 405)

    const missing = response()
    spritePageHandler({ toolHtmlPath: path.join(dir, 'nope.html'), log: () => {} })(request('GET', LOOPBACK), missing.res)
    assert.equal(missing.reply().status, 500)
    assert.match(missing.reply().body, /工具页读不出来/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function fakeContext(registered: Array<Record<string, unknown>>) {
  return {
    get: ((name: string) => {
      if (name === 'tools') return { register: (definition: Record<string, unknown>) => registered.push(definition) }
      if (name === 'systemPrompt') return { section: () => undefined }
      return undefined
    }) as never,
  }
}

test('缺工具页：不注册工具，probe 里写清缺的是哪个文件', () => {
  const registered: Array<Record<string, unknown>> = []
  const handle = startSprite(fakeContext(registered), {
    dshHome: mkdtempSync(path.join(tmpdir(), 'drc-sprite-home-')),
    log: () => {},
    toolHtmlPath: path.join(tmpdir(), 'definitely-missing-sprite-tool.html'),
  })
  try {
    assert.equal(registered.length, 0, '没有工具页就不该注册工具')
    assert.match(String(handle.probe.service), /missing-tool-html/)
    assert.equal(handle.probe.tools, 'skipped')
  } finally {
    handle.stop()
  }
})

test('工具页在：注册 5 个工具，名字与形状固定（参数对象 + 返回字符串）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-sprite-'))
  try {
    const file = path.join(dir, 'sprite-tool.html')
    writeFileSync(file, '<html></html>', 'utf8')
    const registered: Array<Record<string, unknown>> = []
    const handle = startSprite(fakeContext(registered), {
      dshHome: dir,
      log: () => {},
      toolHtmlPath: file,
    })
    try {
      const names = registered.map((definition) => String(definition.name)).sort()
      assert.deepEqual(names, [
        'sprite_cleanup',
        'sprite_export',
        'sprite_key_apply',
        'sprite_key_preview',
        'sprite_prepare',
      ])
      for (const definition of registered) {
        assert.equal((definition.parameters as { type?: string }).type, 'object')
        assert.equal(typeof definition.execute, 'function')
        assert.equal(typeof definition.timeoutMs, 'number')
      }
      const prepare = registered.find((definition) => definition.name === 'sprite_prepare')!
      const required = (prepare.parameters as { required?: string[] }).required ?? []
      assert.deepEqual(required, ['videoPath'], '预览/应用可以不带参数，但导入必须点名视频')
      assert.equal(handle.probe.tools, 'registered')
    } finally {
      handle.stop()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('引导语点名了整条流程与调参规则（模型看不到就会乱试）', () => {
  for (const token of ['sprite_prepare', 'sprite_key_preview', 'sprite_key_apply', 'sprite_cleanup', 'sprite_export']) {
    assert.ok(SPRITE_GUIDANCE.includes(token), `引导语缺少 ${token}`)
  }
  assert.match(SPRITE_GUIDANCE, /bgResidual/)
  assert.match(SPRITE_GUIDANCE, /autoPlate/)
  assert.match(SPRITE_GUIDANCE, /6 轮/)
})

test('浏览器探测：显式路径不存在时明确返回 undefined（不允许瞎猜一个可执行文件）', () => {
  assert.equal(findBrowser('C:\\definitely\\not\\here\\msedge.exe'), undefined)
})
