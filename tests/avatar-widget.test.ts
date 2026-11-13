/**
 * avatar-widget.test — 形象小窗**真实源码**在"主线程被抢/接口抖动"下的播片行为。
 *
 * ## 为什么不是纯单测
 *
 * `avatar-playback.test.ts` 钉的是节奏本身的数学。但用户报的是"画面上看到的东西"，
 * 所以这里把 `src/client/avatar-widget.ts` 用 esbuild 打成一份自包含脚本（不碰 dist/bundle，
 * 那是发版产物），丢进 `node:vm` 的假 DOM 里跑——**测的是会被装进 client.cjs 的那份源码**。
 *
 * ## 三条判据（对应三条现象）
 *
 * 1. 正常 24fps：一支片必须画满 48 帧、按行优先把 8×6 的格子走完，才换下一片；
 * 2. 掉拍到 250ms 一拍（主线程被别的模块占住/窗口被 throttle）：**仍然画满 48 帧**，
 *    只是慢——旧实现这里墙钟早到点，每片只播 17 帧就重来（"一抽一抽 + 总是前几帧"）；
 * 3. 状态轮询被高频触发 + 一半请求失败：**索引不回 0**，播片段长不变；
 *    顺带钉住"没有新增同步 IO"（模块图里不许出现 node: 内建）与"定时器不随事件增长"。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const WIDGET_SOURCE = fileURLToPath(new URL('../../src/client/avatar-widget.ts', import.meta.url))
const FPS = 24
const PAINT_MS = Math.round(1000 / FPS)

type Sample = { clip: string; x: number; y: number }

interface Scenario {
  /** 探针节拍（模拟 24fps 的 setInterval）。 */
  paintMs?: number
  /** 状态轮询的实际节拍——比真实的 2500ms 密得多，用来模拟"事件砸过来"。 */
  pollMs?: number
  /** 会话状态。 */
  status?: 'idle' | 'running'
  /** 每隔几次 /avatar/state 请求失败一次（0 = 不失败）。 */
  failEvery?: number
  /** 虚拟时长。 */
  durationMs: number
}

const MANIFEST_STATES = ['idle', 'nap', 'eat', 'talk', 'dance', 'tsundere', 'think', 'sneak'].map((id) => ({
  id,
  label: id,
  cols: 8,
  rows: 6,
  frames: 48,
  cellWidth: 250,
  cellHeight: 373,
  file: `${id}.webp`,
  anchorX: 0.5,
  anchorY: 0.992,
}))

/** 跑一段场景，返回"可见格上出现过的每一帧"的序列。 */
async function run(scenario: Scenario): Promise<{ samples: Sample[]; liveTimers: number; createdTimers: number; bundle: string }> {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [WIDGET_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'AvatarWidgetUnderTest',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(bundle.length > 1000, 'esbuild 没产出形象脚本（entry 或依赖解析出问题了）')

  // ── 虚拟时钟 + 定时器队列 ─────────────────────────────────────
  let now = 1_700_000_000_000
  let seq = 0
  const timers: Array<{ id: number; cb: () => void; period: number; next: number; kind: 'interval' | 'timeout' }> = []
  let createdTimers = 0
  const rafQueue: Array<() => void> = []
  const realSetTimeout = setTimeout

  const sandbox: Record<string, unknown> = {}

  class El {
    tag: string
    children: El[] = []
    parent: El | undefined
    style: Record<string, string> = {}
    className = ''
    id = ''
    hidden = false
    textContent = ''
    type = ''
    listeners = new Map<string, Array<(event: unknown) => void>>()
    classList = { add: () => {}, remove: () => {}, toggle: () => {} }
    constructor(tag: string) {
      this.tag = tag
    }
    appendChild(child: El): El {
      child.parent = this
      this.children.push(child)
      return child
    }
    append(...children: El[]): void {
      for (const child of children) this.appendChild(child)
    }
    remove(): void {
      if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this)
      this.parent = undefined
    }
    addEventListener(type: string, handler: (event: unknown) => void): void {
      const list = this.listeners.get(type) ?? []
      list.push(handler)
      this.listeners.set(type, list)
    }
    removeEventListener(): void {}
    setPointerCapture(): void {}
    contains(other: unknown): boolean {
      let node = other as El | undefined
      while (node) {
        if (node === this) return true
        node = node.parent
      }
      return false
    }
    querySelectorAll(): El[] {
      return []
    }
  }

  const document = {
    documentElement: { clientWidth: 1280, clientHeight: 800 },
    body: new El('body'),
    head: new El('head'),
    baseURI: 'http://127.0.0.1:9999/',
    createElement: (tag: string) => new El(tag),
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  let stateHits = 0
  const requests: string[] = []
  sandbox.document = document
  sandbox.window = sandbox
  sandbox.console = { log: () => {}, warn: () => {}, error: () => {} }
  sandbox.localStorage = { getItem: () => null, setItem: () => {} }
  sandbox.AbortSignal = { timeout: () => undefined }
  sandbox.requestAnimationFrame = (cb: () => void) => {
    rafQueue.push(cb)
    return rafQueue.length
  }
  sandbox.setInterval = (cb: () => void, ms: number): number => {
    const id = ++seq
    createdTimers += 1
    const period = scenario.paintMs !== undefined && ms <= 50 ? scenario.paintMs : scenario.pollMs !== undefined && ms >= 1000 ? scenario.pollMs : Math.max(1, ms)
    timers.push({ id, cb, period, next: now + period, kind: 'interval' })
    return id
  }
  sandbox.clearInterval = (id: number): void => {
    const at = timers.findIndex((timer) => timer.id === id)
    if (at >= 0) timers.splice(at, 1)
  }
  sandbox.setTimeout = sandbox.setInterval
  sandbox.clearTimeout = sandbox.clearInterval
  sandbox.Date = Object.assign(Object.create(Date), { now: () => now })
  sandbox.Image = class {
    onload: (() => void) | undefined
    onerror: (() => void) | undefined
    decode(): Promise<void> {
      return Promise.resolve()
    }
    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }
  sandbox.fetch = async (url: string) => {
    requests.push(url)
    if (url.includes('/avatar/manifest')) {
      return { ok: true, json: async () => ({ ok: true, manifest: { version: 38, states: MANIFEST_STATES } }) }
    }
    if (url.includes('/avatar/state')) {
      stateHits += 1
      if (scenario.failEvery !== undefined && scenario.failEvery > 0 && stateHits % scenario.failEvery === 0) {
        throw new Error('state 那条断了（模拟宿主忙/超时）')
      }
      return { ok: true, json: async () => ({ ok: true, status: scenario.status ?? 'idle' }) }
    }
    return { ok: false, json: async () => ({}) }
  }

  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox, { filename: 'avatar-widget.iife.js' })
  const api = sandbox.AvatarWidgetUnderTest as { mountAvatarWidget?: (deps: { getCurrentSession: () => string }) => () => void }
  assert.equal(typeof api?.mountAvatarWidget, 'function', '打包出来的模块没导出 mountAvatarWidget')

  const samples: Sample[] = []
  let lastKey = ''
  /** 读"可见层"（zIndex === '2' 的那层）的格子，把 backgroundPosition 还原成 (x, y) 序号。 */
  const sample = (): void => {
    const wrap = document.body.children.find((node) => node.id === 'dafeiyu-avatar-widget')
    if (!wrap) return
    const stage = wrap.children.find((node) => node.className === 'stage')
    if (!stage) return
    const layers = stage.children.filter((node) => node.className === 'layer')
    const visible = layers.find((node) => node.style.zIndex === '2')
    if (!visible) return
    const cell = visible.children[0]
    if (!cell) return
    const clip = /id=([^&)]+)/.exec(cell.style.backgroundImage ?? '')?.[1] ?? ''
    const position = cell.style.backgroundPosition ?? ''
    const match = /^(-?[\d.]+)px (-?[\d.]+)px$/.exec(position)
    if (clip === '' || !match) return
    const key = `${clip}|${position}`
    if (key === lastKey) return
    lastKey = key
    samples.push({ clip, x: Math.abs(Number(match[1])), y: Math.abs(Number(match[2])) })
  }

  const mountFn = api.mountAvatarWidget
  assert.equal(typeof mountFn, 'function', '打包出来的模块没导出 mountAvatarWidget')
  const mount = mountFn!({ getCurrentSession: () => 'sess-1' })
  // 让 manifest / 素材 / 首帧落地（真微任务 + 真 setTimeout，虚拟时钟还没走）
  for (let round = 0; round < 24; round += 1) await new Promise((resolve) => realSetTimeout(resolve, 0))

  const startedAt = now
  while (now - startedAt < scenario.durationMs) {
    const due = timers.filter((timer) => timer.next <= now + 1).sort((a, b) => a.next - b.next)[0]
    if (due === undefined) {
      // 没定时器到期：跳到"下一个到期时刻"或场景结束
      const next = timers.length > 0 ? Math.min(...timers.map((timer) => timer.next)) : now + 50
      now = Math.min(next, startedAt + scenario.durationMs)
      if (timers.length === 0) break
      continue
    }
    now = due.next
    if (due.kind === 'interval') due.next = now + due.period
    else timers.splice(timers.indexOf(due), 1)
    due.cb()
    while (rafQueue.length > 0) rafQueue.shift()!()
    for (let flush = 0; flush < 2; flush += 1) await Promise.resolve()
    sample()
  }

  const liveTimers = timers.length
  mount()
  return { samples, liveTimers, createdTimers, bundle }
}

/** 把样本切成"一支片一段"，并断言每段都是完整的 48 帧（8×6 行优先全覆盖）。 */
function segments(samples: Sample[]): Sample[][] {
  const out: Sample[][] = []
  for (const item of samples) {
    const tail = out[out.length - 1]
    if (tail !== undefined && tail[0]!.clip === item.clip) tail.push(item)
    else out.push([item])
  }
  return out
}

function assertFullClip(segment: Sample[], label: string): void {
  const xs = new Set(segment.map((item) => item.x))
  const ys = new Set(segment.map((item) => item.y))
  const pairs = new Set(segment.map((item) => `${item.x}|${item.y}`))
  assert.equal(xs.size, 8, `${label}：${segment[0]!.clip} 只走了 ${xs.size} 列（应为 8）`)
  assert.equal(ys.size, 6, `${label}：${segment[0]!.clip} 只走了 ${ys.size} 行（应为 6）`)
  assert.equal(pairs.size, 48, `${label}：${segment[0]!.clip} 只走了 ${pairs.size} 个格子（应为 48 = 8×6）`)
  const sx = [...xs].sort((a, b) => a - b)
  const sy = [...ys].sort((a, b) => a - b)
  const once: string[] = []
  for (const y of sy) for (const x of sx) once.push(`${x}|${y}`)
  // 池子里的 loops 可能 > 1（待机是连播两遍）：整段必须是"行优先一遍"的整数倍
  assert.equal(segment.length % once.length, 0, `${label}：${segment[0]!.clip} 段长 ${segment.length} 不是 48 的整数倍`)
  const expected: string[] = []
  for (let loop = 0; loop < segment.length / once.length; loop += 1) expected.push(...once)
  assert.deepEqual(
    segment.map((item) => `${item.x}|${item.y}`),
    expected,
    `${label}：${segment[0]!.clip} 的播放顺序不是"行优先、每格一次"`,
  )
}

test('正常 24fps：每支片画满 48 帧（8×6 每格一次、行优先）才换片', async () => {
  const { samples, liveTimers, createdTimers } = await run({ status: 'running', durationMs: 12_000 })
  const parts = segments(samples)
  assert.ok(parts.length >= 3, `12s 里应当播完至少 3 支片，实际 ${parts.length} 段`)
  for (const part of parts.slice(0, -1)) assertFullClip(part, '24fps')
  // 长跑的拍子必须稳定在 42ms 左右：48 帧一片 ≈ 2s
  assert.equal(liveTimers, 2, `只该有两个常驻节拍（画面 + 状态轮询），实际 ${liveTimers}`)
  assert.equal(createdTimers, 2, `节拍不许随事件重建，实际创建了 ${createdTimers} 个`)
})

test('掉拍到 250ms 一拍（主线程被占/窗口被 throttle）：仍然画满 48 帧，只是慢', async () => {
  const { samples } = await run({ status: 'running', durationMs: 60_000, paintMs: 250 })
  const parts = segments(samples)
  assert.ok(parts.length >= 2, `60s / 每片 48×250ms 至少该播完 2 支片，实际 ${parts.length} 段`)
  // 关键判据：**每一段（除最后被截断的）都必须是完整的 48 帧**。
  // 旧实现（墙钟判到期）在这里每段只有 9~17 帧，而且永远从第 0 帧重来。
  for (const part of parts.slice(0, -1)) assertFullClip(part, '250ms 掉拍')
})

test('高频状态轮询 + 一半请求失败：索引不回 0，段长不变', async () => {
  const { samples, liveTimers, createdTimers } = await run({
    status: 'idle',
    durationMs: 20_000,
    pollMs: 60,
    failEvery: 2,
  })
  const parts = segments(samples)
  assert.ok(parts.length >= 2, `20s 至少该播完 2 支片，实际 ${parts.length} 段`)
  for (const part of parts.slice(0, -1)) assertFullClip(part, '高频轮询')
  // 每片 96 帧（idle 池是 loops:2）→ 20s/4s = 5 支左右；被打断的话会明显变多。
  assert.ok(parts.length <= 8, `轮询不该把播片切碎：20s 切了 ${parts.length} 段`)
  assert.equal(liveTimers, 2, `轮询失败/高频不许新建常驻节拍，实际 ${liveTimers}`)
  assert.equal(createdTimers, 2, `节拍只该在挂载时创建一次，实际创建了 ${createdTimers} 个`)
})

test('模块图里没有同步 IO：形象脚本不许 require node: 内建', async () => {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [WIDGET_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'X',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(!/require\(\s*['"]node:/.test(bundle), '形象脚本里出现了 node: 内建（浏览器面不该有同步 IO）')
  assert.ok(!/from\s*['"]node:/.test(bundle), '形象脚本里出现了 node: 内建（浏览器面不该有同步 IO）')
  assert.ok(!/readFileSync|fs\./.test(bundle), '形象脚本里出现了文件读取')
})
