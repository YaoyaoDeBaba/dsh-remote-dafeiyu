/**
 * client/rooms —— 「房间」注册表：大肥鱼设置页的**扩展点**（2026-11-16）。
 *
 * ## 为什么需要它
 *
 * 拆包之后（形象 → `dsh-avatar-dafeiyu`，后面还有 selfloop 等），设置页不再是"五个写死的
 * tab"，而是"本体三块 + 若干住客"。住客在**另一个包**里，不能 import 本体的代码，
 * 于是这里定一个最小的跨包契约：**一个全局注册表 + 一个就绪事件**。
 *
 * 本体在 client `apply` 的最前面调 `installRoomHost()`（同步），住客去
 * `window.__dafeiyuRooms.register({...})` 领一间房。住客先起来也没关系——
 * 它监听 `dafeiyu:rooms-ready` 再注册（两端都留超时，见 README）。
 *
 * ## 契约（住客只需要认这几样）
 *
 * ```ts
 * host.register({
 *   id: 'avatar',              // [a-z0-9][a-z0-9-]{1,31}，全页唯一
 *   label: '形象',             // tab 上显示的字（住客自己定）
 *   order: 10,                 // 越小越靠前；缺省按注册顺序
 *   mount(container) {         // 房间怎么装修，本体不管
 *     container.appendChild(myPanel)
 *     return () => myPanel.remove()   // 切走 / 卸载时本体调它
 *   },
 *   onShow?() {}, onHide?() {},      // 可选：切进/切出通知（停 rAF 用）
 * })
 * ```
 *
 * ## 本体这边的四条规矩
 *
 * 1. **只为已注册的房间建 tab**：没住客就没有空 tab（不是"点进去空白"）；
 * 2. **切 tab 先调上一个房间的清理函数**；
 * 3. **某个房间 `mount` 抛错只影响它自己**——页面其余部分照常（错误在页面上说人话）；
 * 4. **房间根容器只给定位，不给排版**（样式隔离：住客的 CSS 自己带，类名用自己的 id 打前缀）。
 */

/**
 * 容器的最小形状（**刻意不写 `HTMLElement`**）。
 *
 * 原因：这个文件既被浏览器面（tsconfig.client.json，有 DOM lib）编译，
 * 也被 node 面（tsconfig.json，无 DOM lib）编译——测试要 import 它。
 * 写 `HTMLElement` 会让 node 面直接编不过。用结构类型，真传进来的是 HTMLElement 照样兼容。
 */
export interface RoomContainer {
  appendChild(node: unknown): unknown
}

/** 一间房：住客提供全部内容，本体只提供容器与生命周期。 */
export interface DafeiyuRoom {
  /** `[a-z0-9][a-z0-9-]{1,31}`，全页唯一。 */
  id: string
  /** tab 上显示的字。 */
  label: string
  /** 越小越靠前；缺省按注册顺序排在已登记的房间之后。 */
  order?: number
  /** 把 UI 挂进容器；返回清理函数（切走 / 卸载时调用）。 */
  mount: (container: RoomContainer) => void | (() => void)
  /** 可选：切进这间房。 */
  onShow?: () => void
  /** 可选：切出这间房（切 tab 或关闭设置页）。 */
  onHide?: () => void
}

/** 注册表对外的形状（挂到 `window.__dafeiyuRooms`）。 */
export interface RoomHost {
  version: 1
  register: (room: DafeiyuRoom) => () => void
  /**
   * 这间房现在在不在（2026-11-16 加）。
   *
   * 用途：**判断"有没有装某个住客"**，从而决定要不要显示独立入口。
   * 第一个用户是形象——有悬浮形象时，小蜜蜂/小云雀/识图这些独立按钮都该收起来，
   * 统一从形象的右键菜单进；**没装形象**时才各自露出。
   *
   * 为什么由这里回答而不是各自探测 DOM：房间注册是**住客自己宣布"我在"**的唯一权威事实，
   * 探 DOM 的 id/class 一改就静默失效。
   */
  has: (id: string) => boolean
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/

interface Entry {
  room: DafeiyuRoom
  /** 注册序号：`order` 相同时按它排（先注册的在前）。 */
  seq: number
}

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
let seq = 0

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      /* 订阅者自己的错误不许拖住别的订阅者 */
    }
  }
}

/**
 * 校验并登记一间房。
 *
 * ⚠️ 重复 id **覆盖**并留一行 warn：静默忽略会让"我明明注册了却没有 tab"变成玄学。
 * 校验失败直接抛——住客的错应该在它自己的开发期暴露，不该被宿主吞掉。
 */
export function registerRoom(room: DafeiyuRoom): () => void {
  if (!room || typeof room !== 'object') throw new Error('房间注册失败：需要 { id, label, mount }')
  if (typeof room.id !== 'string' || !ID_PATTERN.test(room.id)) {
    throw new Error(`房间 id 不合法（要 [a-z0-9][a-z0-9-]{1,31}）：${String(room.id)}`)
  }
  if (typeof room.label !== 'string' || room.label.trim() === '') {
    throw new Error(`房间 ${room.id} 缺 label（tab 上要有字）`)
  }
  if (typeof room.mount !== 'function') throw new Error(`房间 ${room.id} 缺 mount 函数`)

  if (entries.has(room.id)) {
    warn(`房间 ${room.id} 被重复注册，后者覆盖前者`)
  }
  entries.set(room.id, { room, seq: seq++ })
  notify()

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    // 只有"还是这一间"时才移除：后来的覆盖者不应被前一个的 dispose 带走
    const current = entries.get(room.id)
    if (current && current.room === room) {
      entries.delete(room.id)
      notify()
    }
  }
}

/** 已登记的房间（按 `order` 升序，同序按注册顺序）。 */
export function listRooms(): DafeiyuRoom[] {
  return [...entries.values()]
    .sort((a, b) => {
      const ao = typeof a.room.order === 'number' ? a.room.order : Number.POSITIVE_INFINITY
      const bo = typeof b.room.order === 'number' ? b.room.order : Number.POSITIVE_INFINITY
      if (ao !== bo) return ao - bo
      return a.seq - b.seq
    })
    .map((entry) => entry.room)
}

/** 订阅房间表变化（注册 / 注销）。返回取消订阅。 */
export function onRoomsChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 把注册表挂到 `window.__dafeiyuRooms` 并派发就绪事件。
 *
 * 幂等：重复调用只保留第一份（client HMR 重载时不会叠出两套）。
 * 没有 `window`（测试里的极简 DOM / 宿主侧）时**静默跳过**——这是增强项，
 * 不能因为它缺失就留一行 error（那会让"降级"被误判成"故障"）。
 */
export function installRoomHost(scope?: { window?: unknown }): boolean {
  // 刻意不直接写 window：node 面（测试）没有这个全局。globalThis 两边都有。
  const fallback = (globalThis as { window?: unknown }).window
  const target = (scope?.window ?? fallback) as
    | (Record<string, unknown> & {
        dispatchEvent?: (event: unknown) => boolean
        CustomEvent?: new (type: string, init?: { detail?: unknown }) => unknown
      })
    | undefined
  if (!target) return false
  if (target.__dafeiyuRooms) return true
  const host: RoomHost = { version: 1, register: registerRoom, has: (id: string) => entries.has(id) }
  target.__dafeiyuRooms = host
  try {
    if (typeof target.dispatchEvent === 'function' && typeof target.CustomEvent === 'function') {
      target.dispatchEvent(new target.CustomEvent('dafeiyu:rooms-ready', { detail: { version: 1 } }))
    }
  } catch {
    /* 事件是通知，派不出去不影响注册表本身 */
  }
  return true
}

/**
 * 有住客「形象」时，把不该出现的独立入口从**样式层**收起来（2026-11-16）。
 *
 * 为什么必须走到 CSS：
 * 真机反馈是「刚重启时独立入口收起来了，跑一会又冒出来」——JS 设的 `hidden`
 * 会被某些重建/重挂的时机翻回去。属性选择器 + `!important` 是最后一道闸：
 * 元素被重建也命中，谁的 JS 都翻不回来。
 *
 * 覆盖三个已知的独立入口（按 id，都是各自包对外承诺的稳定契约）：
 *   - `#dafeiyu-subagent-fab` 本体：派活助手
 *   - `#dafeiyu-vision-fab`   vision 包：肥鱼识图
 *   - `#dafeiyu-xyq-fab`      vision 包：小云雀
 *
 * 属性的来源是**房间注册表**（`has('avatar')`）——住客自己宣布"我在"，是唯一权威事实。
 */
const FLOATING_ENTRY_IDS = ['dafeiyu-subagent-fab', 'dafeiyu-vision-fab', 'dafeiyu-xyq-fab']
const AVATAR_ATTR = 'data-dafeiyu-avatar'
const AVATAR_STYLE_ID = 'dafeiyu-avatar-entry-gate'

let entryGateOff: (() => void) | undefined

/** 按"形象在不在"同步 html 属性（CSS 靠它生效）。 */
export function syncAvatarEntryGate(scope?: { document?: unknown }): void {
  const doc = (scope?.document ?? (globalThis as { document?: unknown }).document) as
    | {
        documentElement?: { setAttribute?: (k: string, v: string) => void; removeAttribute?: (k: string) => void }
        getElementById?: (id: string) => unknown
        createElement?: (tag: string) => { id?: string; textContent?: string }
        head?: { appendChild?: (node: unknown) => unknown }
      }
    | undefined
  if (!doc?.documentElement) return
  const present = entries.has('avatar')
  try {
    if (present) doc.documentElement.setAttribute?.(AVATAR_ATTR, '1')
    else doc.documentElement.removeAttribute?.(AVATAR_ATTR)
  } catch {
    /* 属性设不上只影响"自动收起" */
  }
  // 样式表只插一次
  try {
    if (doc.getElementById?.(AVATAR_STYLE_ID)) return
    const style = doc.createElement?.('style')
    if (!style) return
    style.id = AVATAR_STYLE_ID
    style.textContent =
      '/* 有悬浮形象时收起独立入口（宿主写的最后一道闸） */\n' +
      `html[${AVATAR_ATTR}="1"] ${FLOATING_ENTRY_IDS.map((id) => `#${id}`).join(',\n' + `html[${AVATAR_ATTR}="1"] `)} {\n  display: none !important;\n}\n`
    doc.head?.appendChild?.(style)
  } catch {
    /* 插不进去就算了，JS 那层还在 */
  }
}

/**
 * 开始跟着房间表变化维护上面那个属性。
 *
 * **只订阅，不轮询**（2026-11-16 改）：起初加了个 1 秒定时器想兜底，结果
 * 它的节拍被"pill 没起来就不该留节拍"这类判据抓到（3 !== 2），属于污染测试环境。
 * 而且根本不需要：属性一旦设上，样式表那条 `!important` 就一直在——JS 把 `hidden`
 * 翻回去也没用，元素被重建也一样命中。
 */
export function startAvatarEntryGate(scope?: { document?: unknown }): () => void {
  syncAvatarEntryGate(scope)
  const off = onRoomsChange(() => syncAvatarEntryGate(scope))
  entryGateOff = off
  return () => {
    try {
      off()
    } catch {
      /* 清理不许抛 */
    }
    entryGateOff = undefined
  }
}

/** 仅供测试：清空注册表（模拟"插件卸载后重来"）。 */
export function resetRooms(): void {
  entries.clear()
  listeners.clear()
  seq = 0
}

function warn(message: string): void {
  try {
    // eslint-disable-next-line no-console
    console.warn(`[dafeiyu] ${message}`)
  } catch {
    /* 日志不许抛 */
  }
}
