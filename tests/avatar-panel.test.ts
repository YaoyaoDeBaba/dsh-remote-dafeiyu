/**
 * avatar-panel.test — 设置页「形象」面板在**形象插件没装**时的降级路径。
 *
 * ## 为什么要有这条判据（2026-11-16）
 *
 * 三条只读路由（`/api/dsh-remote-dafeiyu/avatar/{manifest,sheet,state}`）随形象功能拆去独立包
 * `dsh-avatar-dafeiyu`，面板本身留在大肥鱼当"查看器"。于是**没装那个包的人**会走到一条
 * 以前不存在的路：路由整条不存在，请求拿到 404（宿主回的是非 JSON）、或者连接直接被拒。
 *
 * 这条路上以前的表现是：`callJson` 把非 JSON 转成 `{ok:false,error:…}` → 面板照旧渲染
 * 一个空画布 + 「读取失败：…」。再差一点（fetch 直接抛）状态里就出现一坨异常文本。
 *
 * 现在的判据钉三件事：
 *
 * 1. 任何失败（404 / `ok:false` / 空 `states` / 网络错）都归一成同一句
 *    `AVATAR_MISSING_HINT`（含「形象插件未安装（dsh-avatar-dafeiyu）」），**不抛**；
 * 2. 挂载后**只请求一次**——插件装没装不会因为多试几次变，重试等于刷屏；
 * 3. 读不到素材**不起定时器**（播片那条 effect 必须直接 return），也不往控制台写东西。
 *
 * ## 怎么测
 *
 * `src/client/**` 是浏览器半（tsconfig.json 没有 DOM lib），host 侧 tsconfig 编不进去，
 * 所以这里用 esbuild 把**真源码**打成一份自包含脚本丢进 `node:vm`（与 `avatar-widget.test.ts`
 * 同一套路，那份测试已随小窗一起删掉）。要求"注入式 fetch 桩"——`loadAvatarManifest`
 * 的 `fetchJson` 本来就是参数，桩直接在沙箱里换掉 `fetch` 实现。
 *
 * ⚠️ 沙箱对象必须是**同一个**：`vm.createContext()` 之后再加属性是看不见的（第一次写这份
 * 测试就栽在这里：`document` 在 vm 里 undefined，播片 effect 抛错、渲染树停在第一帧）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PANEL_SOURCE = fileURLToPath(new URL('../../src/client/avatar-panel.ts', import.meta.url))

const STATE_IDLE = {
  id: 'idle',
  label: '发呆',
  cols: 8,
  rows: 6,
  frames: 48,
  cellWidth: 250,
  cellHeight: 373,
  file: 'idle.webp',
  anchorX: 0.5,
  anchorY: 0.992,
}

type RenderNode = { type: unknown; props: Record<string, unknown> }

type PanelModule = {
  AVATAR_MISSING_HINT: string
  readAvatarManifestResult: (result: unknown) => { kind: string; message?: string; states?: unknown[]; version?: number }
  loadAvatarManifest: (fetchJson: (path: string) => Promise<unknown>) => Promise<{ kind: string; message?: string }>
  buildAvatarPanel: (deps: {
    createElement: (type: unknown, props: Record<string, unknown>) => RenderNode
    hooks: Record<string, unknown>
  }) => (() => RenderNode) | undefined
}

/** 沙箱 + 观测点：fetch 调用记录、定时器、控制台输出。 */
interface Harness {
  sandbox: Record<string, unknown>
  /** 每次 `fetch()` 的 URL。 */
  calls: string[]
  /** 被 `setInterval` 起来的回调（播片那一条）。 */
  timers: unknown[]
  /** 面板往控制台写的每一行（判据要求"未安装时不许刷"）。 */
  consoleLines: string[]
}

function makeHarness(): Harness {
  const calls: string[] = []
  const timers: unknown[] = []
  const consoleLines: string[] = []
  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => consoleLines.push(['log', ...args].map(String).join(' ')),
      warn: (...args: unknown[]) => consoleLines.push(['warn', ...args].map(String).join(' ')),
      error: (...args: unknown[]) => consoleLines.push(['error', ...args].map(String).join(' ')),
    },
    // 画布元素：播片时只用到 `style`；返回一个假元素就够，不用真 DOM。
    document: { getElementById: () => ({ style: {} }) },
    setInterval: (callback: () => void): number => {
      timers.push(callback)
      return timers.length
    },
    clearInterval: (): void => {},
  }
  return { sandbox, calls, timers, consoleLines }
}

/** 装 fetch 桩：`reply` 每次调用现算，返回值就是 `callJson` 看到的那份响应。 */
function stubFetch(harness: Harness, reply: () => Promise<unknown>): void {
  harness.sandbox.fetch = async (url: unknown): Promise<unknown> => {
    harness.calls.push(String(url))
    return reply()
  }
}

/** 把真源码打成 IIFE，在**同一个**沙箱对象里求值，拿回它的导出。 */
async function loadPanelModule(harness: Harness): Promise<PanelModule> {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [PANEL_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'AvatarPanelUnderTest',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(bundle.length > 500, 'esbuild 没产出面板脚本（entry 或依赖解析出问题了）')
  vm.createContext(harness.sandbox)
  vm.runInContext(bundle, harness.sandbox)
  const exported = harness.sandbox.AvatarPanelUnderTest as PanelModule | undefined
  assert.ok(exported, '面板脚本没挂到 globalName 上')
  return exported
}

/** 假响应：`callJson` 只用到 `text()`；404 的 HTML 就是"非 JSON"那条路。 */
function httpResponse(status: number, body: string): { status: number; text: () => Promise<string> } {
  return { status, text: async () => body }
}

/** 把渲染树里的字符串 children 全部摊平（断言"那一行提示在不在"）。 */
function collectText(node: unknown): string[] {
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  if (Array.isArray(node)) return node.flatMap((child) => collectText(child))
  if (typeof node === 'object') {
    const props = (node as RenderNode).props ?? {}
    return collectText(props.children)
  }
  return []
}

/** 按 id 在渲染树里找宿主元素（`#dafeiyu-avatar-sprite` 那张画布）。 */
function findById(node: unknown, id: string): RenderNode | undefined {
  if (node === null || typeof node !== 'object') return undefined
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findById(child, id)
      if (hit) return hit
    }
    return undefined
  }
  const renderNode = node as RenderNode
  if (renderNode.props?.id === id) return renderNode
  return findById(renderNode.props?.children, id)
}

/**
 * 极简 hooks 运行时：真跑面板组件，`setState` 用微任务合并成一次重渲染。
 *
 * 只实现面板用得到的那两个 hook 语义（首渲染 + deps 变了才跑 effect），不冒充 React。
 */
function mountPanel(
  mod: PanelModule,
  harness: Harness,
): { text: () => string[]; sprite: () => RenderNode | undefined } {
  const values: unknown[] = []
  const effects: Array<{ deps?: unknown[]; cleanup?: void | (() => void) }> = []
  let tree: RenderNode | null = null
  let queued = false

  const sameDeps = (a?: unknown[], b?: unknown[]): boolean =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))

  const render = (): void => {
    let valueIndex = 0
    let effectIndex = 0
    const hooks = {
      useState(initial: unknown): [unknown, (next: unknown) => void] {
        const index = valueIndex++
        if (!(index in values)) values[index] = initial
        const set = (next: unknown): void => {
          if (Object.is(values[index], next)) return
          values[index] = next
          if (queued) return
          queued = true
          queueMicrotask(() => {
            queued = false
            render()
          })
        }
        return [values[index], set]
      },
      useEffect(run: () => void | (() => void), deps?: unknown[]): void {
        const slot = effectIndex++
        const previous = effects[slot]
        if (previous && sameDeps(previous.deps, deps)) return
        previous?.cleanup?.()
        const cleanup = run()
        effects[slot] = { deps, cleanup }
      },
    }
    const createElement = (type: unknown, props: Record<string, unknown>): RenderNode => ({
      type,
      props: props ?? {},
    })
    const component = mod.buildAvatarPanel({ createElement, hooks })
    assert.ok(component, '面板工厂没返回组件（宿主没给 useState）')
    tree = component()
  }

  render()

  return {
    text: () => collectText(tree),
    sprite: () => findById(tree, 'dafeiyu-avatar-sprite'),
  }
}

/** 等微任务/已排队的重渲染跑完（面板只有"读一次 manifest → 一次重渲染"这么深）。 */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

test('素材读取归一：404 非 JSON / ok:false / 空 states 都算"未安装"，不当异常', async () => {
  const mod = await loadPanelModule(makeHarness())
  assert.match(mod.AVATAR_MISSING_HINT, /形象插件未安装（dsh-avatar-dafeiyu）/, '提示里必须点名是哪个包没装')
  assert.match(mod.AVATAR_MISSING_HINT, /刷新/, '提示里必须告诉人下一步（装好后刷新）')

  for (const result of [
    { ok: false, error: '宿主返回了非 JSON（HTTP 404）' },
    { ok: false, message: '素材未安装' },
    { ok: true, manifest: null },
    { ok: true, manifest: { version: 3, states: [] } },
    null,
    undefined,
  ]) {
    const read = mod.readAvatarManifestResult(result)
    assert.equal(read.kind, 'missing', `${JSON.stringify(result)} 应该判成"素材不在"`)
    assert.equal(read.message, mod.AVATAR_MISSING_HINT)
  }

  const ready = mod.readAvatarManifestResult({ ok: true, manifest: { version: 7, states: [STATE_IDLE] } })
  assert.equal(ready.kind, 'ready')
  assert.equal(ready.version, 7)
  assert.equal(ready.states?.length, 1)
})

test('fetch 直接抛（连接被拒）也收敛成"未安装"，不把异常文本抛给面板', async () => {
  const mod = await loadPanelModule(makeHarness())
  let calls = 0
  const read = await mod.loadAvatarManifest(async () => {
    calls += 1
    throw new Error('ECONNREFUSED 127.0.0.1')
  })
  assert.equal(read.kind, 'missing')
  assert.equal(read.message, mod.AVATAR_MISSING_HINT)
  assert.equal(calls, 1, '只请求一次：失败不重试')
  assert.ok(!String(read.message).includes('ECONNREFUSED'), '异常详情不许出现在面板上')
})

test('路由不可达（404 非 JSON）：面板显示"形象插件未安装"，只请求一次、不起定时器、不刷控制台', async () => {
  const harness = makeHarness()
  stubFetch(harness, async () => httpResponse(404, '<!doctype html><h1>Not Found</h1>'))
  const mod = await loadPanelModule(harness)
  const view = mountPanel(mod, harness)
  await settle()

  const text = view.text().join(' ').trim()
  assert.equal(text, mod.AVATAR_MISSING_HINT, '读不到素材时必须显示那一行提示，不能空白')
  assert.equal(view.sprite(), undefined, '没素材就不该有画布')
  assert.equal(harness.calls.length, 1, '未安装时只许试一次（重试只会刷屏）')
  assert.equal(harness.timers.length, 0, '未安装时不许起播片定时器')
  assert.deepEqual(harness.consoleLines, [], '未安装是正常状态，不许往控制台刷错误')
})

test('素材已装：照旧渲染画布并按 24fps 起一个定时器（拆包没有改坏原路径）', async () => {
  const harness = makeHarness()
  stubFetch(harness, async () =>
    httpResponse(200, JSON.stringify({ ok: true, manifest: { version: 4, states: [STATE_IDLE] } })),
  )
  const mod = await loadPanelModule(harness)
  const view = mountPanel(mod, harness)
  await settle()

  const sprite = view.sprite()
  assert.ok(sprite, '素材在时必须渲染画布')
  const style = (sprite.props.style ?? {}) as Record<string, unknown>
  const backgroundImage = String(style.backgroundImage)
  assert.match(backgroundImage, /\/api\/dsh-remote-dafeiyu\/avatar\/sheet\?id=idle/, '画布必须指向素材路由')
  assert.match(backgroundImage, /v=4/, '素材版本要带进 URL（换素材后不吃旧图）')
  assert.equal(harness.calls.length, 1)
  assert.equal(harness.timers.length, 1, '播放中只该有一个定时器')
  assert.deepEqual(harness.consoleLines, [])
  assert.ok(
    view.text().some((line) => line.includes('共 1 个动作')),
    '素材读了几个动作要写在提示里',
  )
})
