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
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SPRITE_PAGE_ROUTE, spritePageHandler } from '../src/sprite/routes.js'
import { startSprite } from '../src/sprite/start.js'
import { SPRITE_GUIDANCE, SPRITE_GUIDE } from '../src/sprite/guide.js'
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

test('工具页在：注册 20 个工具，名字与形状固定（参数对象 + 返回字符串）', () => {
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
        'sprite_auto',
        'sprite_autotune',
        'sprite_baseline',
        'sprite_batch',
        'sprite_cleanup',
        'sprite_export',
        'sprite_feature_fit',
        'sprite_get_anchor',
        'sprite_guide',
        'sprite_key_apply',
        'sprite_key_preview',
        'sprite_loop_scan',
        'sprite_match',
        'sprite_measure',
        'sprite_prepare',
        'sprite_probe_color',
        'sprite_scale_to',
        'sprite_set_anchor',
        'sprite_silhouette_fit',
        'sprite_verify',
      ])
      for (const definition of registered) {
        assert.equal((definition.parameters as { type?: string }).type, 'object')
        assert.equal(typeof definition.execute, 'function')
        assert.equal(typeof definition.timeoutMs, 'number')
      }
      const prepare = registered.find((definition) => definition.name === 'sprite_prepare')!
      const required = (prepare.parameters as { required?: string[] }).required ?? []
      assert.deepEqual(required, ['videoPath'], '预览/应用可以不带参数，但导入必须点名视频')
      assert.equal(handle.probe.tools, 'registered(20)')
    } finally {
      handle.stop()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('引导语点名了关键纪律（模型看不到就会乱试）', () => {
  // 2026-11-13：六步原语搬进 skill 了，常驻这边只留"先加载 skill + 三条硬规则"。
  // 所以这里不再要求它列全工具名，只要求它把最容易出事的纪律说清楚。
  assert.match(SPRITE_GUIDANCE, /实测/)
  assert.match(SPRITE_GUIDANCE, /先 apply 再 export/)
  assert.match(SPRITE_GUIDANCE, /ignored/)
  assert.ok(SPRITE_GUIDANCE.includes('dafeiyu-sprite'), '必须告诉模型先加载哪个 skill')
})

/**
 * 指南的**真源**是 skill 的那套文件（`assets/skills/dafeiyu-sprite/`）。
 * 2026-11-13 起 `SPRITE_GUIDE` 只是"读不到文件时的兜底"，不再是唯一载体——
 * 所以覆盖性断言要盯真源，而不是盯兜底文案。
 */
function skillCorpus(): string {
  const root = fileURLToPath(new URL('../../assets/skills/dafeiyu-sprite', import.meta.url))
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? walk(full) : [readFileSync(full, 'utf8')]
    })
  return walk(root).join('\n')
}

test('指南（skill 真源）覆盖参数语义表与症状速查表', () => {
  const corpus = skillCorpus()
  for (const token of ['classic', 'advanced', 'greenToAlpha', 'autoPlate', 'first-frame', 'y-from-bottom', 'anchorConvention']) {
    assert.ok(corpus.includes(token), `指南缺少 ${token}`)
  }
  assert.match(corpus, /症状/)
})

test('指南必须覆盖第二轮新增能力（否则 agent 又得自己摸源码）', () => {
  // 2026-11-12：这几个都是给 agent 用的"语义入口"。写进指南 = 不用读 6000 行源码；
  // 漏一个，下一位使用者就得自己反推——上一批锚点搞错就是这么发生的。
  const corpus = skillCorpus()
  for (const token of [
    'scan-horizontal', // measure 的列扫原语
    'boundary', // A→B 色段交界
    'minRun', // 防呆参数（不给会被呆毛骗走）
    'maskMode', // 水印探测档位
    'selected', // rects 里要认 selected 而不是 rects[0]
    'anchorYTopDown', // meta 的顶口径锚点
    'cellWidth', // meta 的格子尺寸
    'fps', // meta 的帧率
    'whiteness', // 判白色（低饱和+高亮度，排除肤色）
    '已空闲回收', // P1-3 的错误语义
  ]) {
    assert.ok(corpus.includes(token), `指南缺少 ${token}（新能力没写给 agent，等于逼他自己摸代码）`)
  }
})

test('系统提示短引导只负责"指路"：点名 skill，不复制正文', () => {
  // 常驻上下文的东西必须短。它现在只该做三件事：说有能力、让人先加载 skill、给三条硬规则。
  assert.ok(SPRITE_GUIDANCE.includes('dafeiyu-sprite'), '引导语必须点名 skill')
  assert.match(SPRITE_GUIDANCE, /先加载/)
  assert.ok(SPRITE_GUIDANCE.length < 1200, `常驻引导太长了（${SPRITE_GUIDANCE.length} 字符），正文应该在 skill 里`)
})

test('兜底正文够用：六步 + 两条最容易踩的坑都在', () => {
  // 只有读不到 SKILL.md 时才会看到它，所以不要求全，但要求"能干活"。
  for (const token of ['sprite_prepare', 'sprite_key_apply', 'sprite_export', 'whiteness', 'minRun', 'anchorYTopDown']) {
    assert.ok(SPRITE_GUIDE.includes(token), `兜底缺 ${token}`)
  }
})

test('浏览器探测：显式路径不存在时明确返回 undefined（不允许瞎猜一个可执行文件）', () => {
  assert.equal(findBrowser('C:\\definitely\\not\\here\\msedge.exe'), undefined)
})
