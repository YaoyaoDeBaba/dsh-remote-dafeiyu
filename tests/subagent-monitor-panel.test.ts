/**
 * subagent-monitor-panel.test — 派活助手（桌面悬浮面板）两条真机事故的判据（2026-11-25）。
 *
 * ## 事故原话
 *
 * ① 面板「读取不出当前真实存在的子代理」：显示的是残留缓存（已归档 / 已结束的还在，
 *    真正在跑的反而不在）；
 * ② 每次点开派活助手**开两层**：上面一层新建的空面板（"这个对话还没有子代理"），
 *    下面一层旧缓存（22 小时前就闲置的「雷云 V2」）。
 *
 * ## 根因（修在 src/client/subagent-panel.ts，注释里也有一份）
 *
 * - ② 是**没有全页单例**：本体 client 被装载多份，每份各建一颗 FAB + 一个
 *   #dafeiyu-subagent-panel、各有一份 items 与自己的实时流。点开时 N 份一起 open，
 *   新的那份拉到实时数据、旧的那份还是它装载那一刻的列表 ⇒ 两层叠在一起。
 * - ① 有两半：旧实例那份冻结的列表（同上），以及"live 读不到时界面不标注"——
 *   卡片照旧画、只把底栏换一句「读取失败」，看起来和实时一模一样。
 *
 * ## 怎么测
 *
 * src/client/** 是浏览器半（tsconfig.json 没有 DOM lib），node 判据 import 不到，所以照
 * avatar-panel.test.ts 那一套：esbuild 把**真源码**打成自包含脚本丢进 node:vm，配一份
 * 进程内假 DOM + 假 fetch（零网络）。**两份包 = 同一个沙箱里跑两次 bundle**——这才复现得出
 * 现场（模块作用域各一份，只有 globalThis 是共用的；这正是单例必须挂 globalThis 的原因）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PANEL_SOURCE = fileURLToPath(new URL('../../src/client/subagent-panel.ts', import.meta.url))

/* ────────────────────────── 假 DOM（只做面板真正用到的那一小撮） ────────────────────────── */

interface FakeEvent {
  stopPropagation: () => void
  target?: unknown
  key?: string
}

class El {
  tagName: string
  id = ''
  className = ''
  type = ''
  title = ''
  hidden = false
  disabled = false
  checked = false
  style: Record<string, string> = {}
  childNodes: El[] = []
  parentNode: El | undefined = undefined
  attributes: Record<string, string> = {}
  listeners: Record<string, Array<(event: FakeEvent) => void>> = {}
  classList: { toggle: (name: string, on?: boolean) => void; add: (name: string) => void; contains: (name: string) => boolean }
  private own = ''

  constructor(tagName: string) {
    this.tagName = tagName
    const read = (): string[] => this.className.split(/\s+/).filter((one) => one !== '')
    const write = (list: string[]): void => {
      this.className = list.join(' ')
    }
    this.classList = {
      toggle: (name: string, on?: boolean): void => {
        const list = read()
        const has = list.includes(name)
        const want = on === undefined ? !has : on
        if (want && !has) {
          list.push(name)
          write(list)
        } else if (!want && has) {
          write(list.filter((one) => one !== name))
        }
      },
      add: (name: string): void => {
        const list = read()
        if (!list.includes(name)) write([...list, name])
      },
      contains: (name: string): boolean => read().includes(name),
    }
  }

  get textContent(): string {
    return this.own + this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value: string) {
    this.own = String(value)
    for (const child of this.childNodes) child.parentNode = undefined
    this.childNodes = []
  }

  appendChild(node: El): El {
    node.remove()
    node.parentNode = this
    this.childNodes.push(node)
    return node
  }

  append(...nodes: El[]): void {
    for (const node of nodes) this.appendChild(node)
  }

  remove(): void {
    const parent = this.parentNode
    if (parent === undefined) return
    parent.childNodes = parent.childNodes.filter((one) => one !== this)
    this.parentNode = undefined
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = String(value)
  }

  getAttribute(name: string): string | undefined {
    return this.attributes[name]
  }

  addEventListener(type: string, handler: (event: FakeEvent) => void): void {
    const list = this.listeners[type] ?? []
    list.push(handler)
    this.listeners[type] = list
  }

  removeEventListener(type: string, handler: (event: FakeEvent) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((one) => one !== handler)
  }

  /** 模拟一次点击（判据里点「刷新」「归档」用）。 */
  click(): void {
    const event: FakeEvent = { stopPropagation: () => undefined, target: this }
    for (const handler of this.listeners['click'] ?? []) handler(event)
  }
}

/** 极简选择器：只认**单个**复合选择器（#id / .cls / tag / [attr="v"]），逗号分隔多选。 */
function compileSelector(selector: string): Array<(node: El) => boolean> {
  const tests: Array<(node: El) => boolean> = []
  for (const raw of selector.split(',')) {
    const part = raw.trim()
    if (part === '') continue
    const tokens = part.match(/(#[\w-]+|\.[\w-]+|\[[^\]]+\]|[a-zA-Z][\w-]*)/g) ?? []
    tests.push((node: El): boolean => {
      for (const token of tokens) {
        if (token.startsWith('#')) {
          if (node.id !== token.slice(1)) return false
        } else if (token.startsWith('.')) {
          if (!node.classList.contains(token.slice(1))) return false
        } else if (token.startsWith('[')) {
          const inner = token.slice(1, -1)
          const eq = inner.indexOf('=')
          const name = eq === -1 ? inner : inner.slice(0, eq)
          const have = node.getAttribute(name)
          if (have === undefined) return false
          if (eq !== -1) {
            const want = inner.slice(eq + 1).replace(/^["']/, '').replace(/["']$/, '')
            if (have !== want) return false
          }
        } else if (node.tagName !== token) {
          return false
        }
      }
      return true
    })
  }
  return tests
}

function walk(node: El, visit: (child: El) => void): void {
  for (const child of node.childNodes) {
    visit(child)
    walk(child, visit)
  }
}

interface FakeDocument {
  body: El
  head: El
  documentElement: El
  baseURI: string
  hidden: boolean
  createElement(tag: string): El
  createTextNode(text: string): El
  addEventListener(type: string, handler: (event: FakeEvent) => void): void
  removeEventListener(type: string, handler: (event: FakeEvent) => void): void
  querySelectorAll(selector: string): El[]
  getElementById(id: string): El | undefined
}

function createDocument(): FakeDocument {
  const head = new El('head')
  const body = new El('body')
  const documentElement = new El('html')
  documentElement.append(head, body)
  const listeners: Record<string, Array<(event: FakeEvent) => void>> = {}
  return {
    body,
    head,
    documentElement,
    baseURI: 'http://127.0.0.1:49962/',
    hidden: false,
    createElement: (tag: string): El => new El(tag),
    createTextNode: (text: string): El => {
      const node = new El('#text')
      node.textContent = text
      return node
    },
    addEventListener: (type: string, handler: (event: FakeEvent) => void): void => {
      listeners[type] = [...(listeners[type] ?? []), handler]
    },
    removeEventListener: (type: string, handler: (event: FakeEvent) => void): void => {
      listeners[type] = (listeners[type] ?? []).filter((one) => one !== handler)
    },
    querySelectorAll: (selector: string): El[] => {
      const tests = compileSelector(selector)
      const out: El[] = []
      walk(documentElement, (node) => {
        if (tests.some((test) => test(node))) out.push(node)
      })
      return out
    },
    getElementById: (id: string): El | undefined => {
      let found: El | undefined
      walk(documentElement, (node) => {
        if (found === undefined && node.id === id) found = node
      })
      return found
    },
  }
}

/* ────────────────────────── 假宿主（fetch 桩 + 零定时器） ────────────────────────── */

const CONFIG = { autoArchive: false, idleWarnMs: 7_200_000 }
const BASE = '/api/dsh-remote-dafeiyu/subagents'

type Responder = () => unknown

interface Harness {
  sandbox: Record<string, unknown>
  doc: FakeDocument
  calls: string[]
  /** 每次 GET 列表时用（判据里现改，模拟"宿主那边的列表变了"）。 */
  liveReply: Responder
  /** 归档 POST 的应答（读到请求体，好把 sessionId 原样回）。 */
  archiveReply: (body: Record<string, unknown>) => unknown
  open?: () => void
}

function makeHarness(): Harness {
  const doc = createDocument()
  const calls: string[] = []
  const storage = new Map<string, string>()
  const harness: Harness = {
    sandbox: {},
    doc,
    calls,
    liveReply: () => ({ ok: true, items: [] }),
    archiveReply: (body) => ({
      ok: true,
      results: [{ sessionId: String(body.sessionId ?? ''), ok: true }],
    }),
  }
  const reply = (href: string, body: Record<string, unknown>): unknown => {
    if (href.includes(BASE + '/config')) return { ok: true, config: CONFIG }
    if (href.includes(BASE + '/archive')) return harness.archiveReply(body)
    if (href.includes(BASE)) return harness.liveReply()
    return { ok: false, error: '不该请求这个地址：' + href }
  }
  harness.sandbox = {
    console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    document: doc,
    window: {
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    localStorage: {
      getItem: (key: string): string | null => storage.get(String(key)) ?? null,
      setItem: (key: string, value: string): void => {
        storage.set(String(key), String(value))
      },
      removeItem: (key: string): void => {
        storage.delete(String(key))
      },
    },
    fetch: async (url: unknown, init?: { body?: unknown }): Promise<unknown> => {
      const href = String(url)
      calls.push(href)
      let body: Record<string, unknown> = {}
      try {
        body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
      } catch {
        body = {}
      }
      return { status: 200, json: async () => reply(href, body) }
    },
    // 零定时器：SSE 退化的 30s 慢轮询 / 自动归档那两条在判据里不许真的挂表。
    setTimeout: (): number => 0,
    clearTimeout: (): void => undefined,
    setInterval: (): number => 0,
    clearInterval: (): void => undefined,
  }
  // 只建一次 context：之后再往沙箱对象上加属性在 vm 里是看不见的（avatar-panel.test.ts 踩过）。
  vm.createContext(harness.sandbox)
  return harness
}

interface PanelModule {
  mountSubagentMonitor: (deps: {
    getCurrentSession: () => string | undefined
    expose?: (api: { open: () => void; close: () => void }) => void
    showFab?: boolean
    shouldShowFab?: () => boolean
  }) => () => void
}

/** 把真源码打成 IIFE 丢进**同一个**沙箱，模拟"本体 client 被装载的又一份"。 */
async function loadPanelModule(harness: Harness, globalName: string): Promise<PanelModule> {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [PANEL_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName,
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(bundle.length > 500, 'esbuild 没产出面板脚本（entry 或依赖解析出问题了）')
  vm.runInContext(bundle, harness.sandbox)
  const exported = (harness.sandbox as Record<string, unknown>)[globalName] as PanelModule | undefined
  assert.ok(exported && typeof exported.mountSubagentMonitor === 'function', 'bundle 没有导出 mountSubagentMonitor')
  return exported
}

/** 让 promise 链跑完（面板全是 async 的 fetch → apply → render）。 */
async function flush(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

/* ────────────────────────── 观测点 ────────────────────────── */

function descendants(node: El): El[] {
  const out: El[] = []
  walk(node, (child) => out.push(child))
  return out
}

function panelNodes(harness: Harness): El[] {
  return harness.doc.querySelectorAll('#dafeiyu-subagent-panel')
}

function firstPanel(harness: Harness): El | undefined {
  return panelNodes(harness)[0]
}

function cardsOf(harness: Harness): El[] {
  const panel = firstPanel(harness)
  if (panel === undefined) return []
  return descendants(panel).filter((node) => node.classList.contains('card'))
}

function firstByRole(harness: Harness, role: string): El | undefined {
  const panel = firstPanel(harness)
  if (panel === undefined) return undefined
  return descendants(panel).find((node) => node.getAttribute('data-role') === role)
}

function panelText(harness: Harness): string {
  const panel = firstPanel(harness)
  return panel === undefined ? '' : panel.textContent
}

function findButton(scope: El, label: string): El | undefined {
  return descendants(scope).find((node) => node.tagName === 'button' && node.textContent === label)
}

function row(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, parentId: 's1', status: 'running', naming: 'ok', name: id, summary: '一句话简述', ...over }
}

/* ────────────────────────── 判据 ────────────────────────── */

test('① 两份 client 实例各开一次派活助手：全页只有一个面板节点、只亮一层', async () => {
  const harness = makeHarness()
  const first = await loadPanelModule(harness, 'MonitorA')
  const second = await loadPanelModule(harness, 'MonitorB')
  const opens: Array<() => void> = []
  const expose = (api: { open: () => void }): void => {
    opens.push(api.open)
  }
  const cleanupA = first.mountSubagentMonitor({ getCurrentSession: () => 's1', expose })
  const cleanupB = second.mountSubagentMonitor({ getCurrentSession: () => 's1', expose })
  await flush()
  assert.equal(opens.length, 2, '第二份实例也要拿到 open（复用的是同一块面板，不是各建一块）')

  opens[0]?.()
  opens[1]?.()
  await flush()

  assert.equal(panelNodes(harness).length, 1, '重复 open 不许再叠一层：全页只能有一个面板节点')
  assert.equal(
    harness.doc.querySelectorAll('#dafeiyu-subagent-panel.open').length,
    1,
    '可见层也只能有一层（两层叠在一起就是用户截图里那两块）',
  )
  assert.equal(harness.doc.querySelectorAll('#dafeiyu-subagent-fab').length, 1, 'FAB 同理，一颗')

  // 卸载走引用计数：一份走掉，面板必须留着；最后一个走才拆。
  cleanupA()
  await flush()
  assert.equal(panelNodes(harness).length, 1, '还有一份挂载者活着，面板不许被它带走')
  cleanupB()
  await flush()
  assert.equal(panelNodes(harness).length, 0, '最后一个挂载者卸载后才拆 DOM')
})

test('② live 回 2 个在跑的子代理 → 只画 2 行，旧列表整表替换', async () => {
  const harness = makeHarness()
  const panel = await loadPanelModule(harness, 'MonitorLive')
  // 第一次：一份旧列表（22 小时前闲置的那条）
  harness.liveReply = () => ({
    ok: true,
    items: [row('old-22h', { status: 'idle', name: '雷云 V2', idleMs: 22 * 3600_000, idleBasis: 'activity' })],
  })
  panel.mountSubagentMonitor({ getCurrentSession: () => 's1', expose: (api) => { harness.open = api.open } })
  await flush()
  assert.equal(cardsOf(harness).length, 1, '先要有一条旧行，否则"整表替换"这条判据是空转')

  // 宿主那边的实时列表换人了：两个在跑
  harness.liveReply = () => ({ ok: true, items: [row('agent-a'), row('agent-b')] })
  harness.open?.()
  await flush()

  const cards = cardsOf(harness)
  assert.equal(cards.length, 2, 'live 两行就是两行（旧行不许残留）')
  assert.deepEqual(cards.map((card) => card.getAttribute('data-agent-id')), ['agent-a', 'agent-b'])
  assert.equal(cards.every((card) => card.getAttribute('data-status') === 'running'), true, '两条都得算在跑')
  assert.equal(panelText(harness).includes('雷云 V2'), false, '本地旧列表必须被 live 整表替换掉')
  assert.match(panelText(harness), /在跑 · 2/, '在跑那组要报个数')
})

test('③ live 抛错 → 界面挂「离线快照 + 时间」，列表不静默冒充实时', async () => {
  const harness = makeHarness()
  const panel = await loadPanelModule(harness, 'MonitorOffline')
  harness.liveReply = () => ({ ok: true, items: [row('agent-a')] })
  panel.mountSubagentMonitor({ getCurrentSession: () => 's1', expose: (api) => { harness.open = api.open } })
  await flush()
  assert.equal(firstByRole(harness, 'snapshot'), undefined, 'live 正常时不许出现快照标注')

  harness.liveReply = () => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:49962')
  }
  const panelEl = firstPanel(harness)
  assert.ok(panelEl, '面板节点应该在')
  const refresh = findButton(panelEl, '刷新')
  assert.ok(refresh, '顶栏要有「刷新」按钮')
  refresh.click()
  await flush()

  const banner = firstByRole(harness, 'snapshot')
  assert.ok(banner, 'live 失败必须挂「离线快照」标注，不许只换个底栏就完事')
  assert.match(banner.textContent, /离线快照/)
  assert.match(banner.textContent, /最后更新 \d\d:\d\d:\d\d/, '快照要报时刻，不然没人知道它有多旧')
  assert.match(banner.textContent, /不是实时/)
  assert.match(panelText(harness), /读取失败/, '失败原因也要写出来（ECONNREFUSED …）')
  assert.equal(cardsOf(harness).length, 1, '快照期间旧行照旧画（别让人以为全没了），但已经标成离线')
})

test('④ 归档一个子代理后刷新：列表里不再把它算作「在跑」', async () => {
  const harness = makeHarness()
  const panel = await loadPanelModule(harness, 'MonitorArchive')
  const idleB = row('agent-b', { status: 'idle', idleMs: 3 * 3600_000, idleBasis: 'activity' })
  harness.liveReply = () => ({ ok: true, items: [row('agent-a'), idleB] })
  panel.mountSubagentMonitor({ getCurrentSession: () => 's1', expose: (api) => { harness.open = api.open } })
  await flush()

  const cardB = cardsOf(harness).find((card) => card.getAttribute('data-agent-id') === 'agent-b')
  assert.ok(cardB, '空闲那条要有卡片')
  const archive = findButton(cardB, '归档')
  assert.ok(archive, '空闲卡片上要有「归档」')
  archive.click()

  // 归档写成功后宿主那边的下一次列表：agent-b 带 archived: true 回来
  harness.liveReply = () => ({ ok: true, items: [row('agent-a'), row('agent-b', { status: 'idle', archived: true })] })
  await flush()

  const running = cardsOf(harness).filter((card) => card.getAttribute('data-status') === 'running')
  assert.equal(running.length, 1, '只剩一个还在跑')
  assert.equal(
    cardsOf(harness).some((card) => card.getAttribute('data-agent-id') === 'agent-b'),
    false,
    '已归档的不许再混在列表里（更不许算在跑）',
  )
  assert.match(panelText(harness), /已归档 1 个/, '归档要去「已归档」那一档报数，不能凭空消失')
})

test('⑤ 刷新必须按 live 全量：URL 要 descendants=1，孙辈在跑也要出现在列表里', async () => {
  const harness = makeHarness()
  const panel = await loadPanelModule(harness, 'MonitorDescendants')
  // 直接子级都闲着，真正在干活的是孙辈（depth 2）—— 2026-11-25「在跑的反而不在」的那一幕
  harness.liveReply = () => ({
    ok: true,
    items: [
      row('agent-child', { status: 'idle', idleMs: 4 * 3600_000, idleBasis: 'activity', depth: 1 }),
      row('agent-grandchild', { status: 'running', name: 'vfx-runner', depth: 2 }),
    ],
  })
  panel.mountSubagentMonitor({ getCurrentSession: () => 's1', expose: (api) => { harness.open = api.open } })
  harness.open?.()
  await flush()

  const listCalls = harness.calls.filter((href) => href.includes('/subagents?') || href.includes('/subagents&'))
  assert.ok(listCalls.length > 0, '打开时要向宿主拉一次列表')
  assert.match(listCalls[0] ?? '', /descendants=1/, '要问 listDescendants（只问直接子级就看不到在跑的孙辈）')

  const cards = cardsOf(harness)
  assert.equal(cards.length, 2, '孙辈也是子代理，要出现在列表里')
  const running = cards.filter((card) => card.getAttribute('data-status') === 'running')
  assert.deepEqual(running.map((card) => card.getAttribute('data-agent-id')), ['agent-grandchild'])
  assert.match(panelText(harness), /第2层/, '孙辈要标出层级，不然看不出它是谁派的')
})

