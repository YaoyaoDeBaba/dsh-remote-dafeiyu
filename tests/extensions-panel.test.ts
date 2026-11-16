/**
 * extensions-panel.test —— 设置页扩展列表的**按钮状态机**与两条兜底。
 *
 * ## 为什么这条判据非有不可（2026-11-16）
 *
 * 这个面板是用户第一次能"点一下就装插件"的地方，而它的分支全藏在状态里：
 * 未装 / 装了并启用 / 装了但禁用 / 正在操作 / 刚改完要重启 / 失败。**任何一态画错都会
 * 让人按到错的按钮**（比如禁用里还给"禁用"、装了一半还能再点一次），而"扩展功能不可用
 * （宿主版本过旧）"那句兜底一旦丢了，升级前的老宿主上整块就是空白。
 *
 * ## 怎么测
 *
 * `src/client/**` 是浏览器半（tsconfig.json 没有 DOM lib），host 侧编不进去 —— 与
 * `avatar-panel.test.ts` 同一套路：esbuild 把**真源码**打成自包含 IIFE，丢进 `node:vm`。
 * 两条注入路由各测一半：
 * - `buildExtensionsPanel({ fetchImpl })` —— 按钮状态机全走它（判据读**渲染树**里的按钮
 *   文案与 `disabled`，不是内部状态变量）；
 * - 沙箱里的 `fetch` —— 默认那条 `defaultExtensionsFetch`（旧宿主 404 / 连接被拒）。
 *
 * ⚠️ vm 里的数组是**另一个 realm** 的：`assert.deepEqual` 拿它跟本地数组比会因原型不同而红，
 * 所以下面一律先 `Array.from(...)` 搬回本 realm 再比。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PANEL_SOURCE = fileURLToPath(new URL('../../src/client/extensions-panel.ts', import.meta.url))

type RenderNode = { type: unknown; props: Record<string, unknown> }
type HostFetch = (path: string, body?: unknown) => Promise<Record<string, unknown>>

type PanelModule = {
  EXTENSIONS_BASE: string
  EXTENSIONS_ACTION: string
  EXTENSIONS_UNAVAILABLE: string
  readExtensionsResult: (result: unknown) => { kind: string; rows?: unknown[]; message?: string }
  rowStateOf: (row: unknown) => string
  buttonsOf: (row: unknown) => Array<{ action: string; label: string; busyLabel: string }>
  badgeOf: (row: unknown) => string
  buildExtensionsPanel: (deps: {
    createElement: (type: unknown, props: Record<string, unknown>) => RenderNode
    hooks: Record<string, unknown>
    fetchImpl?: HostFetch
  }) => (() => RenderNode) | undefined
}

const ROW_AVATAR = { id: 'avatar', label: '形象', description: '大肥鱼的形象包', installed: false, enabled: false }
const ROW_AVATAR_ON = { ...ROW_AVATAR, installed: true, enabled: true, version: '0.1.2' }
const ROW_AVATAR_OFF = { ...ROW_AVATAR, installed: true, enabled: false, version: '0.1.2' }

/** 把真源码打成 IIFE 在沙箱里求值；沙箱 `fetch` 故意做成真 Response 的形状（有 `.text()`）。 */
async function loadPanel(): Promise<{
  mod: PanelModule
  /** 默认 fetch 那条路的请求记录（URL + init）。 */
  calls: Array<{ url: string; init: unknown }>
  setReply: (reply: () => Promise<{ status?: number; body: string }> | { status?: number; body: string }) => void
}> {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [PANEL_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'ExtensionsPanelUnderTest',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(bundle.length > 500, 'esbuild 没产出面板脚本（entry 或依赖解析出问题了）')

  const calls: Array<{ url: string; init: unknown }> = []
  let reply: () => { status?: number; body: string } = () => ({ status: 200, body: '{"ok":true,"extensions":[]}' })
  const sandbox: Record<string, unknown> = {
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    fetch: async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init })
      const answer = reply()
      return { status: answer.status ?? 200, text: async () => answer.body }
    },
  }
  vm.createContext(sandbox)
  vm.runInContext(bundle, sandbox)
  const mod = sandbox.ExtensionsPanelUnderTest as PanelModule | undefined
  assert.ok(mod, '面板脚本没挂到 globalName 上')
  return {
    mod,
    calls,
    setReply: (next) => {
      reply = () => {
        const value = next()
        return value as { status?: number; body: string }
      }
    },
  }
}

// ── 渲染树工具 ───────────────────────────────────────────────────────

function walk(node: unknown, visit: (node: RenderNode) => void): void {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (typeof node !== 'object') return
  const renderNode = node as RenderNode
  visit(renderNode)
  walk(renderNode.props?.children, visit)
}

function collectText(node: unknown): string[] {
  const out: string[] = []
  walk(node, (renderNode) => {
    if (typeof renderNode.props?.children === 'string') out.push(renderNode.props.children)
  })
  return out
}

function findRow(tree: unknown, id: string): RenderNode | undefined {
  let hit: RenderNode | undefined
  walk(tree, (node) => {
    if (node.props?.['data-extension'] === id) hit = node
  })
  return hit
}

type Button = { action: string; label: string; disabled: boolean; onClick: unknown }

function buttonsIn(row: RenderNode | undefined): Button[] {
  const out: Button[] = []
  walk(row, (node) => {
    const action = node.props?.['data-action']
    if (typeof action === 'string') {
      out.push({
        action,
        label: String(node.props.children ?? ''),
        disabled: node.props.disabled === true,
        onClick: node.props.onClick,
      })
    }
  })
  return out
}

const actionsOf = (row: RenderNode | undefined): string[] => Array.from(buttonsIn(row), (button) => button.action)

/** 请求体来自 vm 另一个 realm，`deepEqual` 会因原型不同而红 —— 折成字符串比。 */
function bodyAction(body: unknown): string {
  const payload = (body ?? {}) as { id?: unknown; action?: unknown }
  return `${String(payload.id ?? '')}:${String(payload.action ?? '')}`
}

/** 极简 hooks 运行时：真跑组件，`setState` 用微任务合并成一次重渲染。 */
function mountPanel(
  mod: PanelModule,
  fetchImpl?: HostFetch,
): {
  text: () => string[]
  row: (id: string) => RenderNode | undefined
  click: (id: string, action: string) => void
} {
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
        effects[slot] = { deps, cleanup: run() }
      },
    }
    const createElement = (type: unknown, props: Record<string, unknown>): RenderNode => ({ type, props: props ?? {} })
    const component = mod.buildExtensionsPanel({ createElement, hooks, fetchImpl })
    assert.ok(component, '面板工厂没返回组件（宿主没给 useState）')
    tree = component()
  }
  render()
  return {
    text: () => collectText(tree),
    row: (id) => findRow(tree, id),
    click: (id, action) => {
      const button = buttonsIn(findRow(tree, id)).find((candidate) => candidate.action === action)
      assert.ok(button, `${id} 这一行没有 ${action} 按钮`)
      ;(button.onClick as () => void)()
    },
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

// ── 纯函数：状态机 ───────────────────────────────────────────────────

test('状态机：三种状态的按钮组合、徽标、忙碌文案', async () => {
  const { mod } = await loadPanel()
  assert.equal(mod.rowStateOf(ROW_AVATAR as never), 'not-installed')
  assert.equal(mod.rowStateOf(ROW_AVATAR_ON as never), 'enabled')
  assert.equal(mod.rowStateOf(ROW_AVATAR_OFF as never), 'disabled')

  assert.deepEqual(Array.from(mod.buttonsOf(ROW_AVATAR as never), (b) => b.action), ['install'], '未装只给"安装"')
  assert.deepEqual(Array.from(mod.buttonsOf(ROW_AVATAR_ON as never), (b) => b.action), ['disable', 'uninstall'])
  assert.deepEqual(Array.from(mod.buttonsOf(ROW_AVATAR_OFF as never), (b) => b.action), ['enable', 'uninstall'])
  assert.deepEqual(Array.from(mod.buttonsOf(ROW_AVATAR as never), (b) => b.busyLabel), ['安装中…'])

  assert.equal(mod.badgeOf(ROW_AVATAR as never), '未安装')
  assert.equal(mod.badgeOf(ROW_AVATAR_ON as never), '已启用 v0.1.2')
  assert.equal(mod.badgeOf(ROW_AVATAR_OFF as never), '已禁用 v0.1.2')

  // 归一：ok:false / 非数组 / 网络错兜成的 {ok:false} 都算"不可用"，空数组算"没有扩展"
  for (const result of [
    { ok: false, error: '宿主返回了非 JSON（HTTP 404）' },
    { ok: true },
    { ok: true, extensions: 'nope' },
    null,
    undefined,
  ]) {
    const read = mod.readExtensionsResult(result)
    assert.equal(read.kind, 'unavailable', `${JSON.stringify(result)} 应该判成不可用`)
    assert.equal(read.message, mod.EXTENSIONS_UNAVAILABLE)
  }
  const empty = mod.readExtensionsResult({ ok: true, extensions: [] })
  assert.equal(empty.kind, 'ready')
  assert.equal(empty.rows?.length, 0)
})

// ── 兜底：旧宿主（走默认 fetch）─────────────────────────────────────

test('旧宿主（404 非 JSON / fetch 抛）→ 一行「扩展功能不可用（宿主版本过旧）」，不空白不抛错', async () => {
  // 404：宿主回的是一段 HTML（非 JSON）
  const html = await loadPanel()
  html.setReply(() => ({ status: 404, body: '<!doctype html><title>404</title>' }))
  const htmlPanel = mountPanel(html.mod)
  await settle()
  assert.match(htmlPanel.text().join(' | '), /扩展功能不可用（宿主版本过旧）/)
  assert.equal(html.calls.length, 1, '只请求一次（重试等于刷屏）')
  assert.match(String(html.calls[0]?.url), /\/api\/dsh-remote-control\/extensions$/, '路径就是那一份契约')

  // 连接被拒：fetch 直接抛
  const offline = await loadPanel()
  ;(offline.setReply as (value: () => never) => void)(() => {
    throw new Error('ECONNREFUSED 127.0.0.1:50485')
  })
  const offlinePanel = mountPanel(offline.mod)
  await settle()
  const text = offlinePanel.text().join(' | ')
  assert.match(text, /扩展功能不可用（宿主版本过旧）/)
  assert.equal(/ECONNREFUSED/.test(text), false, '异常文本不许漏到界面上')
  assert.equal(offline.calls.length, 1)
})

// ── 主路径：装 → 需要重启 → 禁用 → 启用 ─────────────────────────────

test('点「安装」：操作中按钮禁用并显示「安装中…」，成功后整行换成"已启用"+「需要重启生效」', async () => {
  const { mod } = await loadPanel()
  const pending = deferred<Record<string, unknown>>()
  const calls: Array<{ path: string; body?: unknown }> = []
  const fetchImpl: HostFetch = async (path, body) => {
    calls.push({ path, body })
    if (path === mod.EXTENSIONS_BASE) return { ok: true, extensions: [ROW_AVATAR] }
    return pending.promise
  }
  const panel = mountPanel(mod, fetchImpl)
  await settle()
  assert.deepEqual(actionsOf(panel.row('avatar')), ['install'])
  assert.match(panel.text().join(' | '), /未安装/)

  panel.click('avatar', 'install')
  await settle()
  // 操作中的那一态：按钮禁用、被点的那个文案换成「安装中…」
  const during = buttonsIn(panel.row('avatar'))
  assert.equal(during.length, 1)
  assert.equal(during[0]?.label, '安装中…')
  assert.equal(during[0]?.disabled, true)
  assert.equal(calls[1]?.path, mod.EXTENSIONS_ACTION)
  assert.equal(bodyAction(calls[1]?.body), 'avatar:install')

  pending.resolve({ ok: true, changed: true, needsRestart: true, extensions: [ROW_AVATAR_ON] })
  await settle()
  assert.deepEqual(actionsOf(panel.row('avatar')), ['disable', 'uninstall'])
  const text = panel.text().join(' | ')
  assert.match(text, /已启用 v0\.1\.2/)
  assert.match(text, /需要重启生效/, '改完必须说重启')
  assert.equal(buttonsIn(panel.row('avatar')).some((button) => button.disabled), false, '完成后按钮解禁')
})

test('点「禁用」/「启用」：各自发对应的 action，行内状态跟着翻', async () => {
  const { mod } = await loadPanel()
  let current: Record<string, unknown> = ROW_AVATAR_ON
  const calls: Array<{ path: string; body?: unknown }> = []
  const fetchImpl: HostFetch = async (path, body) => {
    calls.push({ path, body })
    if (path === mod.EXTENSIONS_BASE) return { ok: true, extensions: [current] }
    const action = (body as { action?: string }).action
    current = action === 'disable' ? ROW_AVATAR_OFF : action === 'enable' ? ROW_AVATAR_ON : current
    return { ok: true, changed: true, needsRestart: true, extensions: [current] }
  }
  const panel = mountPanel(mod, fetchImpl)
  await settle()
  assert.deepEqual(actionsOf(panel.row('avatar')), ['disable', 'uninstall'])

  panel.click('avatar', 'disable')
  await settle()
  assert.equal(bodyAction(calls[1]?.body), 'avatar:disable')
  assert.match(panel.text().join(' | '), /已禁用 v0\.1\.2/)
  assert.deepEqual(actionsOf(panel.row('avatar')), ['enable', 'uninstall'])

  panel.click('avatar', 'enable')
  await settle()
  assert.equal(bodyAction(calls[2]?.body), 'avatar:enable')
  assert.match(panel.text().join(' | '), /已启用 v0\.1\.2/)
})

// ── 失败必须显形 ─────────────────────────────────────────────────────

test('服务端失败（pnpm 失败 / 不在白名单）原话落到那一行里，不是弹一句"失败"', async () => {
  const { mod } = await loadPanel()
  let reply: Record<string, unknown> = {
    ok: false,
    message: 'pnpm 失败（退出码 1）：ERR_PNPM_GIT_UNKNOWN_ERROR fatal: could not read from remote',
    extensions: [ROW_AVATAR],
  }
  const fetchImpl: HostFetch = async (path) => (path === mod.EXTENSIONS_BASE ? { ok: true, extensions: [ROW_AVATAR] } : reply)
  const panel = mountPanel(mod, fetchImpl)
  await settle()

  panel.click('avatar', 'install')
  await settle()
  let text = panel.text().join(' | ')
  assert.match(text, /没成功：/)
  assert.match(text, /ERR_PNPM_GIT_UNKNOWN_ERROR/, 'pnpm 的尾巴要出现在界面上')
  assert.match(text, /could not read from remote/)
  assert.deepEqual(actionsOf(panel.row('avatar')), ['install'], '失败了还是"安装"')

  // 换一条失败（白名单外）：原因同样原样显示
  reply = { ok: false, message: '不在白名单里：https://evil.example/x.git', extensions: [ROW_AVATAR] }
  panel.click('avatar', 'install')
  await settle()
  text = panel.text().join(' | ')
  assert.match(text, /不在白名单里/)
})

test('幂等回执（changed:false，"已经是这个状态"）也说出来，且不挂"需要重启"', async () => {
  const { mod } = await loadPanel()
  const fetchImpl: HostFetch = async (path) =>
    path === mod.EXTENSIONS_BASE
      ? { ok: true, extensions: [ROW_AVATAR_ON] }
      : { ok: true, changed: false, needsRestart: false, message: '已经是这个状态', extensions: [ROW_AVATAR_ON] }
  const panel = mountPanel(mod, fetchImpl)
  await settle()
  panel.click('avatar', 'disable')
  await settle()
  const text = panel.text().join(' | ')
  assert.match(text, /已经是这个状态/)
  assert.equal(text.includes('需要重启生效'), false)
})

test('服务端带了 needsRestart 的行（上次改过、还没重启）一进来就标上', async () => {
  const { mod } = await loadPanel()
  const fetchImpl: HostFetch = async () => ({ ok: true, extensions: [{ ...ROW_AVATAR_OFF, needsRestart: true }] })
  const panel = mountPanel(mod, fetchImpl)
  await settle()
  assert.match(panel.text().join(' | '), /需要重启生效/)
  assert.match(panel.text().join(' | '), /已禁用 v0\.1\.2/)
})

