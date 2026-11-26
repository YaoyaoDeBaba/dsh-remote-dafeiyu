/**
 * groups-panel-announcement.test —— 群面板「群公告横幅 + 就地编辑区」（2026-11-26 用户口径）。
 *
 * 用户要的形态（对标 QQ 会话）：标题下方一条通栏横幅（浅底、左侧 📢、单行截断、右侧「编辑」），
 * **空态也占位**（「点击设置群公告」），点它就地展开编辑区（textarea ≤500 + 字数 + 保存/取消），
 * 回车不提交、Ctrl+Enter 或点保存提交；保存失败把后端原话显示出来（不静默）。
 *
 * 怎么测：src/client/** 是浏览器半，node 侧 import 不到，所以照 subagent-monitor-panel.test.ts
 * 那一套——esbuild 把**真源码**打成自包含脚本丢进 node:vm，配一份进程内假 DOM + 假 fetch（零网络）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const PANEL_SOURCE = fileURLToPath(new URL('../../src/client/groups-panel.ts', import.meta.url))

/* ────────────────────────── 假 DOM（只做群面板真正用到的那一小撮） ────────────────────────── */

interface FakeEvent {
  stopPropagation: () => void
  preventDefault: () => void
  target?: unknown
  key?: string
  ctrlKey?: boolean
  metaKey?: boolean
}

class El {
  tagName: string
  id = ''
  title = ''
  type = ''
  value = ''
  maxLength = 0
  placeholder = ''
  disabled = false
  style: Record<string, string> = {}
  childNodes: El[] = []
  parentNode: El | undefined = undefined
  attributes: Record<string, string> = {}
  listeners: Record<string, Array<(event: FakeEvent) => void>> = {}
  scrollTop = 0
  scrollHeight = 0
  offsetWidth = 0
  offsetHeight = 0
  private own = ''

  constructor(tagName: string) {
    this.tagName = tagName
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

  replaceChildren(...nodes: El[]): void {
    for (const child of [...this.childNodes]) child.remove()
    this.append(...nodes)
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
    this.listeners[type] = [...(this.listeners[type] ?? []), handler]
  }

  removeEventListener(type: string, handler: (event: FakeEvent) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((one) => one !== handler)
  }

  focus(): void {
    /* 假 DOM：焦点没有可观测效果 */
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 900, height: 640 }
  }

  /** 模拟一次点击（判据里点横幅 / 编辑 / 保存 / 取消）。 */
  click(): void {
    const event: FakeEvent = { stopPropagation: () => undefined, preventDefault: () => undefined, target: this }
    for (const handler of this.listeners['click'] ?? []) handler(event)
  }

  /** 模拟键盘（判据里验「回车不提交、Ctrl+Enter 提交」）。 */
  keydown(key: string, ctrlKey = false): void {
    const event: FakeEvent = { stopPropagation: () => undefined, preventDefault: () => undefined, target: this, key, ctrlKey }
    for (const handler of this.listeners['keydown'] ?? []) handler(event)
  }
}

const created: El[] = []

function createDocument() {
  // 每条判据一份全新的节点表（否则 byRole 会摸到上一个用例留下的面板节点）
  created.length = 0
  const body = new El('body')
  const docListeners: Record<string, Array<(event: FakeEvent) => void>> = {}
  const documentElement = new El('html')
  documentElement.append(body)
  return {
    body,
    documentElement,
    head: new El('head'),
    baseURI: 'http://127.0.0.1:49962/',
    hidden: false,
    createElement: (tag: string): El => {
      const node = new El(tag)
      created.push(node)
      return node
    },
    createTextNode: (text: string): El => {
      const node = new El('#text')
      node.textContent = text
      return node
    },
    addEventListener: (type: string, handler: (event: FakeEvent) => void): void => {
      docListeners[type] = [...(docListeners[type] ?? []), handler]
    },
    removeEventListener: (type: string, handler: (event: FakeEvent) => void): void => {
      docListeners[type] = (docListeners[type] ?? []).filter((one) => one !== handler)
    },
    querySelectorAll: (selector: string): El[] => {
      const id = selector.startsWith('#') ? selector.slice(1) : ''
      if (id === '') return []
      return created.filter((node) => node.id === id)
    },
  }
}

type FakeDocument = ReturnType<typeof createDocument>

/* ────────────────────────── 假宿主（fetch 桩 + 零定时器） ────────────────────────── */

const LIST_ROUTE = '/api/dsh-remote-dafeiyu/groups'
const ANNOUNCEMENT_ROUTE = '/api/dsh-remote-dafeiyu/groups/announcement'

interface GroupRow {
  id: string
  name: string
  ownerName?: string
  announcement?: string
  members: Array<{ sessionId: string; name?: string }>
}

interface Harness {
  sandbox: Record<string, unknown>
  doc: FakeDocument
  /** 每次 POST 到 /groups/announcement 的请求体（判据看"存了什么"）。 */
  announcementPosts: Array<Record<string, unknown>>
  /** GET 列表时回什么（判据里现改，模拟"宿主那边的群变了"）。 */
  groups: GroupRow[]
  /** POST 公告时回什么（默认成功；失败那条判据覆盖它）。 */
  announcementReply: Record<string, unknown>
}

function makeHarness(): Harness {
  const doc = createDocument()
  const storage = new Map<string, string>()
  const harness: Harness = {
    sandbox: {},
    doc,
    announcementPosts: [],
    groups: [],
    announcementReply: { ok: true, announcement: '' },
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
      const path = href.replace(/^https?:\/\/[^/]+/, '')
      let body: Record<string, unknown> = {}
      try {
        body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
      } catch {
        body = {}
      }
      const reply = (value: unknown): unknown => ({ status: 200, json: async () => value })
      if (path.startsWith(ANNOUNCEMENT_ROUTE)) {
        harness.announcementPosts.push(body)
        // 成功时把公告记到群记录上（模拟服务端落盘），面板刷新后才看得到
        if (harness.announcementReply.ok === true) {
          const text = String(body.text ?? '')
          const group = harness.groups.find((row) => row.id === body.groupId)
          if (group !== undefined) {
            if (text === '') delete group.announcement
            else group.announcement = text
          }
        }
        return reply(harness.announcementReply)
      }
      if (path.startsWith(LIST_ROUTE + '/messages')) return reply({ ok: true, messages: [] })
      if (path.startsWith(LIST_ROUTE)) return reply({ ok: true, groups: harness.groups })
      return reply({ ok: false, error: '不该请求这个地址：' + path })
    },
    // 零定时器：轮询 / 去重定时器在判据里不许真的挂表
    setTimeout: (): number => 0,
    clearTimeout: (): void => undefined,
    setInterval: (): number => 0,
    clearInterval: (): void => undefined,
  }
  vm.createContext(harness.sandbox)
  return harness
}

interface PanelModule {
  mountGroupsPanel: (deps: { getCurrentSession: () => string | undefined }) => {
    open: () => void
    close: () => void
    destroy: () => void
  }
}

async function loadPanelModule(harness: Harness): Promise<PanelModule> {
  const esbuild = (await import('esbuild')) as {
    build: (options: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>
  }
  const built = await esbuild.build({
    entryPoints: [PANEL_SOURCE],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'GroupsPanel',
    platform: 'neutral',
    target: 'es2022',
    logLevel: 'silent',
  })
  const bundle = built.outputFiles?.[0]?.text ?? ''
  assert.ok(bundle.length > 500, 'esbuild 没产出面板脚本（entry 或依赖解析出问题了）')
  vm.runInContext(bundle, harness.sandbox)
  const exported = (harness.sandbox as Record<string, unknown>).GroupsPanel as PanelModule | undefined
  assert.ok(exported && typeof exported.mountGroupsPanel === 'function', 'bundle 没有导出 mountGroupsPanel')
  return exported
}

/** 让 promise 链跑完（面板全是 async 的 fetch → render）。 */
async function flush(rounds = 12): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
}

function byRole(role: string): El | undefined {
  return created.find((node) => node.getAttribute('data-role') === role && node.parentNode !== undefined)
}

function descendants(node: El): El[] {
  const out: El[] = []
  for (const child of node.childNodes) {
    out.push(child, ...descendants(child))
  }
  return out
}

function buttonIn(scope: El, label: string): El | undefined {
  return descendants(scope).find((node) => node.tagName === 'button' && node.textContent === label)
}

const GROUP: GroupRow = {
  id: 'g-1',
  name: '联调',
  ownerName: '主程',
  members: [
    { sessionId: 'session-me', name: '我' },
    { sessionId: 'session-peer', name: '对端' },
  ],
}

async function mountOpen(harness: Harness): Promise<PanelModule['mountGroupsPanel'] extends never ? never : ReturnType<PanelModule['mountGroupsPanel']>> {
  const module = await loadPanelModule(harness)
  const panel = module.mountGroupsPanel({ getCurrentSession: () => 'session-me' })
  panel.open()
  await flush()
  return panel
}

/* ────────────────────────── 判据 ────────────────────────── */

test('⑧ 横幅空态：没有公告也占位显示「点击设置群公告」，点它就展开编辑区（≤500 字）', async () => {
  const harness = makeHarness()
  harness.groups = [{ ...GROUP }]
  await mountOpen(harness)

  const banner = byRole('group-announcement-banner')
  assert.ok(banner !== undefined, '中栏标题下方必须有群公告横幅')
  assert.equal(banner!.style.display, 'flex', '有群就必须显示横幅（空态也要占位，否则用户找不到入口）')
  const text = byRole('group-announcement-text')
  assert.ok(text !== undefined)
  assert.equal(text!.textContent, '点击设置群公告', '空态文案')
  assert.equal(banner!.title, '点击设置群公告', '整条横幅可点（title 给个提示）')
  assert.ok(buttonIn(banner!, '编辑') !== undefined, '横幅右侧要有「编辑」小按钮')
  assert.ok(banner!.textContent.includes('📢'), '横幅左侧要有 📢')

  const editor = byRole('group-announcement-editor')
  assert.ok(editor !== undefined)
  // 假 DOM 不解析 cssText：初始收起读 cssText，展开后读 style.display
  assert.match(editor!.style.cssText ?? '', /display:none/, '编辑区默认收起')

  banner!.click()
  assert.equal(editor!.style.display, 'block', '点横幅 = 进编辑态')
  const input = byRole('group-announcement-input')
  assert.ok(input !== undefined)
  assert.equal(input!.tagName, 'textarea')
  assert.equal(input!.maxLength, 500, '编辑框 ≤500 字')
  assert.match(input!.placeholder ?? '', /500/)
})

test('⑨ 有公告：横幅显示它（换行压成单行），刷新后跟着变', async () => {
  const harness = makeHarness()
  harness.groups = [{ ...GROUP, announcement: '只说结论\n不许替别人转生' }]
  const panel = await mountOpen(harness)
  const text = byRole('group-announcement-text')
  assert.equal(text!.textContent, '只说结论 不许替别人转生', '单行显示：换行压成空格')
  assert.equal(text!.style.color, '#365a96', '有公告时用正常字色（不是灰色占位）')

  harness.groups = [{ ...GROUP }]
  panel.close()
  panel.open()
  await flush()
  assert.equal(byRole('group-announcement-text')!.textContent, '点击设置群公告', '公告被清掉后退回占位')
})

test('⑩ 保存：点「保存」POST /groups/announcement（带 groupId + 正文），成功就收起并刷新；回车不提交', async () => {
  const harness = makeHarness()
  harness.groups = [{ ...GROUP }]
  await mountOpen(harness)

  const banner = byRole('group-announcement-banner')!
  const editor = byRole('group-announcement-editor')!
  const input = byRole('group-announcement-input')!
  banner.click()
  input.value = '  只说结论，别写客套  '
  input.keydown('Enter') // 单独回车 = 换行，不提交
  await flush(3)
  assert.equal(harness.announcementPosts.length, 0, '单独回车不许提交')
  assert.equal(editor.style.display, 'block', '回车后编辑区还开着')

  input.keydown('Enter', true) // Ctrl+Enter 提交
  await flush()
  assert.equal(harness.announcementPosts.length, 1, 'Ctrl+Enter 要提交')
  assert.equal(harness.announcementPosts[0]!.groupId, 'g-1')
  assert.equal(harness.announcementPosts[0]!.text, '只说结论，别写客套', '首尾空白去掉再提交')
  assert.equal(editor.style.display, 'none', '保存成功后收起编辑区')
  assert.equal(byRole('group-announcement-text')!.textContent, '只说结论，别写客套', '横幅要跟着刷新')

  // 点「保存」按钮同一条路（面板开着时点横幅 → 改内容 → 点保存）
  banner.click()
  input.value = '换一条规矩'
  buttonIn(editor, '保存')!.click()
  await flush()
  assert.equal(harness.announcementPosts.length, 2)
  assert.equal(harness.announcementPosts[1]!.text, '换一条规矩')

  // 空串 = 清除
  banner.click()
  input.value = ''
  buttonIn(editor, '保存')!.click()
  await flush()
  assert.equal(harness.announcementPosts[2]!.text, '')
  assert.equal(byRole('group-announcement-text')!.textContent, '点击设置群公告', '清除后退回占位')
})

test('⑪ 保存失败：把后端原话显示在编辑区（不静默），编辑区不收起', async () => {
  const harness = makeHarness()
  harness.groups = [{ ...GROUP }]
  await mountOpen(harness)
  harness.announcementReply = { ok: false, message: '只有群主能改群公告（群主是 主程）' }

  const banner = byRole('group-announcement-banner')!
  const editor = byRole('group-announcement-editor')!
  const input = byRole('group-announcement-input')!
  banner.click()
  input.value = '改不成的一条'
  buttonIn(editor, '保存')!.click()
  await flush()

  assert.equal(harness.announcementPosts.length, 1, '点了保存就要真发出去')
  assert.equal(editor.style.display, 'block', '失败时编辑区留着，用户能改完再试')
  const shown = descendants(editor).map((node) => node.textContent).join(' | ')
  assert.ok(shown.includes('只有群主能改群公告'), '后端原话要显示出来：' + shown)
})
