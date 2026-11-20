/**
 * dafeiyu-page — 设置页里的「大肥鱼」合页：**一个入口、多分栏**。
 *
 * 合包前是两张互不相干的卡（「远程控制」与「人设」分属两个包）。合包后把设置页那一格
 * 合成一张卡。2026-11-16 起分栏按已批准的样板重排（`docs/mockup/panel-tabs-mockup-20261116.html`）：
 *
 *   [远程控制] [人设] [Agent 团队] [群] [搜索] [住客房间…]
 *
 * - 「远程控制」= 远控原有那整页 DOM（`buildSettingsSection` 灌进去的）+ 扩展列表；
 * - 「人设」= 人设客户端那整块（`PersonaSettingsSection`，生成物，原样嵌）+ 长期记忆；
 * - 「Agent 团队」= 派活助手设置 + 转生/分身入口 + 给 Agent 的调用入口表；
 * - 后面的房间由**别的包**通过 `rooms.ts` 领，没装就没有那几栏：
 *   形象（`dsh-avatar-dafeiyu`，order10）、肥鱼识图（`dsh-vision-dafeiyu`，order40）、
 *   小云雀（同一个包的 `xyq` 房间，order50）、序列帧（`dsh-dev-kit-dafeiyu`，order60）。
 *
 * 2026-11-20：本体自带的分栏多了一栏「搜索」（`DAFEIYU_TAB_SEARCH`，联网搜索的两个 token），
 * 排在「群」之后——它属于本包自己的能力，不是住客。
 *
 * ⚠️ 2026-11-16 之前「肥鱼识图」「小云雀」是本表里写死的两栏；它们**连同服务端那一半**
 * 整块搬去 `dsh-vision-dafeiyu`，所以从 `TAB_LABELS` 与下面的 body 分支里一起删掉了。
 * 本体自带的分栏从此刻起是**远程控制 / 人设 / Agent 团队**三栏（2026-11-19 加「群」、
 * 2026-11-20 加「搜索」，都在本体里——它们用的工具与路由都在本包）。
 *
 * 纪律（与远控其余部分同款）：
 * 1. **挂不上就返回 false**，由调用方决定降级成「老样子两张卡」——合页失败不许把设置页
 *    弄没。
 * 2. 槽位的早/晚两路都走（apply 时探 `slots`，探不到挂 `inject(['slots'])` 等它晚到）——
 *    直接复用 `mountSettingsSection` 的注册骨架，只把组件换掉。
 * 3. React 不静态 require：`createElement` / `useState` 都由调用方（装载器给的 require）
 *    传进来；这里只按参数干活。
 * 4. **每栏都要能降级**：某块面板起不来（宿主没给 hooks / 模块没导出来）时画一行中文说明，
 *    不许留空白格、不许抛错。
 *
 * ## 「人设」栏为什么只有外壳统一、不能真的重排顺序
 *
 * 人设栏里「人设库 / 生效范围 / 工作区生效规则 / 体积守门」这四块**不是我们画的**：
 * 它们由 `src/persona/client-factory.js`（人设包的生成物，90KB）里那个
 * `PersonaSettingsSection(props)` 一次画完，它**只接一个 `t`（翻译函数）**，
 * 没有 `collapsed` / `order` / `compact` 之类 props。生成物的内部顺序是
 * 当前生效 → 生效范围 → 时间差段 → 体积守门 → 工作区生效规则 → 人设列表 → 导入。
 * ⇒ 我们能做的只有：把整块放进自己的一张卡、把长期记忆放到它**下面**、并**标注一句**
 * 体积守门在哪里（不重复渲染）。真折叠/真换序需要 persona 侧配合，清单一并交付。
 */
import { buildSettingsSection, mountSettingsSection, type SettingsHost } from './settings.js'
import { type CreateElement } from './pill.js'
import { resolveHostUrl } from './host-url.js'
import { buildMemoryPanel } from './memory-panel.js'
import { buildExtensionsPanel } from './extensions-panel.js'
import { buildAgentTeamTab, type AgentTeamHandoffKind } from './agent-team-tab.js'
import { buildGroupsTab } from './groups-tab.js'
import { buildWebsearchTab } from './websearch-tab.js'
import { card, columnStyle, hintStyle } from './panel-kit.js'
import { listRooms, onRoomsChange, type DafeiyuRoom } from './rooms.js'

/** 各分栏的 id（顺序即 tab 顺序；房间排在最后，见 `TAB_LABELS` 的说明）。 */
export const DAFEIYU_TAB_REMOTE = 'remote'
export const DAFEIYU_TAB_PERSONA = 'persona'
/**
 * 「Agent 团队」。
 *
 * 2026-11-16 之前这一栏叫「派活助手」，id 是 `subagents`；重排时按样板改成
 * 「Agent 团队」（内容除了派活助手设置，还多了转生/分身入口与调用入口表，叫"派活助手"
 * 已经名不副实）。id 一起改成 `team`——它是内部值（没有持久化、没有跨包约定），
 * 跟着标签走比留一个旧名字更好读。
 */
export const DAFEIYU_TAB_TEAM = 'team'
/** 「群」那一栏（2026-11-19）：建群、加人、打开悬浮群面板。 */
export const DAFEIYU_TAB_GROUPS = 'groups'
/**
 * 「搜索」那一栏（2026-11-20）：联网搜索的两个第三方 token（GitHub / OpenAlex）+ 测一下。
 *
 * 为什么是本体自带的一栏、而不是像形象/识图那样的住客房间：那几栏是**别的包**的能力，
 * 本包没有它们的实现；联网搜索的四个工具就在本包里，token 也是本包工具在用的。
 */
export const DAFEIYU_TAB_SEARCH = 'search'

const TAB_LABELS: Record<string, string> = {
  [DAFEIYU_TAB_REMOTE]: '远程控制',
  [DAFEIYU_TAB_PERSONA]: '人设',
  [DAFEIYU_TAB_TEAM]: 'Agent 团队',
  [DAFEIYU_TAB_GROUPS]: '群',
  [DAFEIYU_TAB_SEARCH]: '搜索',
  // ⚠️ 2026-11-16 起这个表里**只剩本体自带的三栏**，其余全是住客：
  //   · 「形象」→ `dsh-avatar-dafeiyu`（order10）
  //   · 「肥鱼识图」→ `dsh-vision-dafeiyu` 的 `vision` 房间（order40）
  //   · 「小云雀」→ `dsh-vision-dafeiyu` 的 `xyq` 房间（order50）
  //   · 「序列帧」→ `dsh-dev-kit-dafeiyu` 的 `sprite` 房间（order60）
  // 它们通过 `rooms.ts` 的 `registerRoom({ id, label, order })` 领房，**没装就没有那个 tab**。
  // 这正是"房间协议"要的效果，不是回归；判据钉的是"顺序按 order 排、住客不许插到本体中间"。
}

export interface DafeiyuPageDeps {
  ctx: SettingsHost
  /** 装载器给的 createElement（`findCreateElement` 的结果）。 */
  createElement: CreateElement
  /** 同一个 react 模块里的 hooks（不能静态 `require('react')`，由调用方传入）。 */
  reactHooks: {
    useState?: <S>(initial: S) => [S, (next: S) => void]
    useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
  }
  /** 人设客户端的 `PersonaSettingsSection` 组件（从 `personaClientFactory` 的导出里拿）。 */
  personaSettings: unknown
  /** 人设那套字典的翻译函数；给不出就用 key 兜底。 */
  personaT: (key: string) => string
  /**
   * 打开「一键转生 / 一键分身」那个悬浮面板（2026-11-16）。
   *
   * 面板本身在 `handoff-panel.ts`（`main.ts` 里 mount 的那一个），这一页只把它的 `open(kind)`
   * 透出来当入口按钮——**故意不把 modal 重写成内嵌页**（理由见 `agent-team-tab.ts` 文件头）。
   * 拿不到这个回调时那两颗按钮禁用并说清为什么，页面照常。
   */
  openHandoff?: (kind: AgentTeamHandoffKind) => void
}

/** 降级那行：一块面板起不来时画它，不留空白格。 */
function fallbackLine(createElement: CreateElement, text: string): unknown {
  return createElement('p', {
    style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
    children: text,
  })
}

/**
 * 注册「大肥鱼」合页。成功 true；任何一步失败返回 false，调用方负责降级。
 *
 * 组件状态：分栏用 `useState` 存当前 tab。切到「远程控制」时渲染一个带 `ref` 的空 div，
 * 宿主把容器元素交给 `attach`，`buildSettingsSection` 灌整页 DOM；切走时 ref 收到 null，
 * cleanup 把那一页拆掉（与远控老页面完全同一条卸载路径）。
 */
export function mountDafeiyuSettings(deps: DafeiyuPageDeps): boolean {
  const { ctx, createElement, reactHooks, personaSettings, personaT } = deps
  const useState = reactHooks?.useState
  if (typeof createElement !== 'function' || typeof useState !== 'function') {
    return false
  }
  // 人设栏里、人设组件下面那块（0.9.x）：长期记忆。
  const memoryPanel = buildMemoryPanel({ createElement, hooks: reactHooks })
  // 「Agent 团队」整栏（派活助手设置 + 转生/分身入口 + 调用入口表）。
  const agentTeamTab = buildAgentTeamTab({ createElement, hooks: reactHooks, openHandoff: deps.openHandoff })
  // 「群」那一栏（2026-11-19）：建群/加人；聊天面在悬浮窗（`__dafeiyuGroupsOpen`）。
  const groupsTab = buildGroupsTab({ createElement, hooks: reactHooks })
  // 「搜索」那一栏（2026-11-20）：GitHub / OpenAlex 两个 token + 测一下（`websearch-tab.ts`）。
  const websearchTab = buildWebsearchTab({ createElement, hooks: reactHooks })
  // 扩展列表（2026-11-16）：「远程控制」分栏里、配对码那块**下面**。
  const extensionsPanel = buildExtensionsPanel({ createElement, hooks: reactHooks })

  let cleanupRemote: (() => void) | undefined
  const attach = (node: unknown): void => {
    const element = node as Element | null
    if (element && typeof element.appendChild === 'function' && element.ownerDocument) {
      if (cleanupRemote) return
      cleanupRemote = buildSettingsSection(element, {
        fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init as RequestInit | undefined),
        warn: (message) => {
          try {
            console.warn(`[dsh-remote-control settings] ${String(message)}`)
          } catch {
            /* 控制台也可能不可用 */
          }
        },
      })
    } else if (cleanupRemote) {
      cleanupRemote()
      cleanupRemote = undefined
    }
  }

  /*
   * 房间的挂载点（2026-11-16）。住客来自**别的包**，只认 `./rooms.ts` 的契约：
   * 给它一个容器，它自己装修，返回清理函数。这里负责三件事——
   *   ① 切走时先拆上一间（顺序不能反：先挂新的会出现两份叠着）；
   *   ② 住客 `mount` 抛错只影响它自己那一栏，页面其余照常；
   *   ③ 整个设置页卸载时也拆掉（`ref` 收到 null 就是这条路）。
   */
  let currentRoom: { id: string; node?: HTMLElement; dispose?: () => void } | undefined
  const disposeRoom = (): void => {
    const room = currentRoom
    currentRoom = undefined
    if (!room) return
    try {
      room.dispose?.()
    } catch (error) {
      try {
        console.warn(`[dsh-remote-control settings] 房间 ${room.id} 清理抛错`, error)
      } catch {
        /* 日志不许抛 */
      }
    }
  }
  const attachRoom = (room: DafeiyuRoom) => (node: unknown): void => {
    const element = node as HTMLElement | null
    /*
     * ⚠️ 三个"空白"教训（2026-11-16 真机报：房间 tab 点开有内容，几秒后变空白，再点又有）：
     *
     * 宿主设置页会**周期性重渲染**，我们的 `createElement('div', {ref})` 每轮都是一个新容器元素。
     * 而下面这段原来写的是「同一个 room.id 就直接 return」——于是新容器里**谁也没放东西**，
     * 用户看到的就是"过几秒变成空白页"。
     *
     * 但**也不能重挂**：重挂会 `dispose()` 掉上一次的 mount，序列帧那个 iframe 会整页重载、
     * 动画类房间会从头开始播——用户看到的是"闪一下"。
     *
     * 正确做法：同一房间换了容器 → 把子节点**搬过去**，mount 一次都不重来。
     */
    if (!element || typeof element.appendChild !== 'function') {
      // null = 撤回旧 ref。**不在这里拆**：重渲染会先 null 再给新节点，
      // 提前拆等于每轮都重挂。真正的拆除点是「切 tab」「房间被注销」「页面卸载」。
      return
    }
    if (currentRoom?.id === room.id) {
      if (currentRoom.node === element) return
      const from = currentRoom.node
      if (from && from !== element) {
        while (element.firstChild) element.removeChild(element.firstChild)
        while (from.firstChild) element.appendChild(from.firstChild)
      }
      currentRoom.node = element
      return
    }
    disposeRoom()
    currentRoom = { id: room.id, node: element }
    try {
      const cleanup = room.mount(element)
      if (currentRoom) currentRoom.dispose = typeof cleanup === 'function' ? cleanup : undefined
      room.onShow?.()
    } catch (error) {
      // 住客起不来：它那一栏说人话，别把整页带崩（这是验收里"装坏"那一态）。
      const message = String((error as Error)?.message ?? error).slice(0, 160)
      element.textContent = `这个模块起不来：${room.label}（${message}）`
      try {
        console.warn(`[dsh-remote-control settings] 房间 ${room.id} 挂载失败`, error)
      } catch {
        /* 日志不许抛 */
      }
    }
  }

  const TabPage = (): unknown => {
    const [tab, setTab] = useState<string>(DAFEIYU_TAB_REMOTE)
    /*
     * 房间表的版本号：住客可能在设置页**打开之后**才注册（插件晚挂载/热重载），
     * 所以订阅一次变化，变化就重渲染。`useState` 的 setter 只收值不收函数（宿主给的就是两参式），
     * 所以这里用一个闭包计数，不写 `setRooms(n => n + 1)`。
     */
    const [roomsVersion, setRoomsVersion] = useState<number>(0)
    let bump = roomsVersion
    const useEffect = reactHooks?.useEffect
    if (typeof useEffect === 'function') {
      useEffect(() => onRoomsChange(() => setRoomsVersion(++bump)), [])
    }
    /*
     * 兼容性过滤（2026-11-17）：宿主版本低于某个住客包的下限时不建 tab。
     * 数据由 client/main.ts 在启动时拉一次 `/api/dsh-remote-dafeiyu/compat` 挂在 globalThis 上，
     * 拉回来会派发 dafeiyu:compat —— 这里订阅一次重渲染（与房间表同一套写法）。
     */
    const [compatVersion, setCompatVersion] = useState<number>(0)
    let compatBump = compatVersion
    if (typeof useEffect === 'function') {
      useEffect(() => {
        const scope = globalThis as {
          addEventListener?: (type: string, fn: () => void) => void
          removeEventListener?: (type: string, fn: () => void) => void
          dispatchEvent?: (event: unknown) => boolean
          CustomEvent?: new (type: string, init?: { detail?: unknown }) => unknown
          __dafeiyuCompat?: unknown
        }
        const onCompat = (): void => setCompatVersion(++compatBump)
        try {
          scope.addEventListener?.('dafeiyu:compat', onCompat)
        } catch {
          /* 没有 window 就算了 */
        }
        /*
         * 报告**在这一页打开时才拉**（2026-11-17）：放到 apply 里会让"pill 挂载期间只走
         * /plugins 前缀"那几条判据误报，而且没人打开设置页时这一发请求是白花的。
         * 拉失败就保持原样（不过滤），下次打开再试。
         */
        if (scope.__dafeiyuCompat === undefined) {
          void (async () => {
            try {
              const response = await fetch(resolveHostUrl('/api/dsh-remote-dafeiyu/compat'), {
                signal:
                  typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(3000) : undefined,
              })
              const answer = (await response.json()) as {
                ok?: boolean
                host?: unknown
                blockedRooms?: unknown
                warnRooms?: unknown
              }
              if (answer.ok !== true) return
              const asStrings = (value: unknown): string[] =>
                Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
              const compat = {
                host: typeof answer.host === 'string' ? answer.host : undefined,
                blocked: asStrings(answer.blockedRooms),
                warn: asStrings(answer.warnRooms),
              }
              scope.__dafeiyuCompat = compat
              try {
                if (typeof scope.dispatchEvent === 'function' && typeof scope.CustomEvent === 'function') {
                  scope.dispatchEvent(new scope.CustomEvent('dafeiyu:compat', { detail: compat }))
                }
              } catch {
                setCompatVersion(++compatBump)
              }
            } catch {
              /* 拉不到就不过滤：能用总比空白强 */
            }
          })()
        }
        return () => {
          try {
            scope.removeEventListener?.('dafeiyu:compat', onCompat)
          } catch {
            /* ignore */
          }
        }
      }, [])
    }
    const compat = (globalThis as { __dafeiyuCompat?: { blocked?: string[]; warn?: string[]; host?: string } }).__dafeiyuCompat
    const blockedRooms = new Set(Array.isArray(compat?.blocked) ? compat!.blocked! : [])
    const allRooms = listRooms()
    const rooms = allRooms.filter((room) => !blockedRooms.has(room.id))
    const compatNotes: string[] = []
    for (const room of allRooms) {
      if (blockedRooms.has(room.id)) {
        compatNotes.push(room.label + '：与当前宿主版本不兼容，已停用（升级宿主或换回验证过的版本）。')
      }
    }
    const warnIds = new Set(Array.isArray(compat?.warn) ? compat!.warn! : [])
    for (const room of allRooms) {
      if (!blockedRooms.has(room.id) && warnIds.has(room.id)) {
        compatNotes.push(room.label + '：当前宿主比验证过的版本新，能用但没验过。')
      }
    }
    const tabs: Array<[string, string]> = [...Object.entries(TAB_LABELS), ...rooms.map((room) => [room.id, room.label] as [string, string])]
    // 当前 tab 的住客被注销了（插件卸载）→ 回到远程控制，别停在一间不存在的房上
    if (!tabs.some(([id]) => id === tab)) {
      disposeRoom()
    }
    const activeTab = tabs.some(([id]) => id === tab) ? tab : DAFEIYU_TAB_REMOTE
    // ⚠️ 本仓的 CreateElement 是 (type, props) 两参式（React 的 children 走 props.children）——
    // 与 jsxRuntime 同款，别写成 (type, props, ...children)。
    const tabBar = createElement('div', {
      style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
      children: tabs.map(([id, label]) =>
        createElement('button', {
          type: 'button',
          key: id,
          style: activeTab === id ? activeTabStyle : tabStyle,
          onClick: () => {
            // 先拆上一间再切：反过来会出现两份叠着（验收里专门有一条）
            disposeRoom()
            setTab(id)
          },
          children: label,
        }),
      ),
    })
    let body: unknown = null
    if (activeTab === DAFEIYU_TAB_REMOTE) {
      /*
       * 远控那一整页（含配对码）由 `buildSettingsSection` 灌进第一个容器；扩展列表挂在它
       * **下面**——配对码在上、扩展在下，顺序在这里就定死了，别在别处再挪。
       * 宿主没给 hooks 时（`extensionsPanel` 为 undefined）就只渲染老那一页，页面上不多出空白块。
       */
      const remoteChildren: unknown[] = [createElement('div', { ref: attach })]
      if (extensionsPanel) remoteChildren.push(createElement(extensionsPanel, {}))
      body = createElement('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '12px' },
        children: remoteChildren,
      })
    } else if (activeTab === DAFEIYU_TAB_PERSONA) {
      /*
       * 人设栏（2026-11-16 重排：**只有外壳统一**）。
       *
       * 顺序：人设组件（整块，含人设库/生效范围/体积守门…）在上，长期记忆在下。
       * 那四块不是我们画的（见文件头），这里只做两件事：
       *   ① 把人设整块放进我们自己的一张卡（样板里"整页是一个卡片列"）；
       *   ② 在卡尾**标注一句**体积守门在哪 —— 不重复渲染它（重复 = 两份互相打架的开关）。
       * 曾经的识图配置块 2026-11-16 起随 `dsh-vision-dafeiyu` 走了（那个包自己的「肥鱼识图」房间），
       * 人设栏里不再有它——本仓也不再有任何识图 UI。
       */
      const personaCard = card(createElement, '人设组件（外来）', [
        /*
         * 人设组件（生成物）**只包外壳**：顺序 / 折叠 / 内部间距都不归我们管。
         * 这里能统一的三件事全是"容器级"的：
         *   ① 字号与字色（内部没有显式字号的地方跟着它走，不再各自默认成 16px 正文）；
         *   ② 竖向节奏（它自己画的几块之间靠这个 gap 撑开）；
         *   ③ 内边距（卡已经有 16px，这里不再叠加，只保证最小宽度不被挤扁）。
         */
        createElement('div', {
          'data-persona-host': '',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: 0,
            fontSize: '13px',
            lineHeight: '1.6',
            color: 'var(--dsw-alias-label-primary, inherit)',
          },
          children: createElement(personaSettings, { t: personaT }),
        }),
        createElement('p', {
          style: hintStyle,
          children:
            '体积守门（长度 / 截断）在一块里由人设组件自己渲染，位置在「生效范围」下面，本外壳不重复画它。' +
            '它默认展开、顺序也由人设组件固定——要让它默认收起需要人设侧支持（见交付报告）。',
        }),
      ])
      const personaChildren: unknown[] = [personaCard]
      if (memoryPanel) personaChildren.push(createElement(memoryPanel, {}))
      body = createElement('div', {
        'data-panel': DAFEIYU_TAB_PERSONA,
        style: columnStyle,
        children: personaChildren,
      })
    } else if (activeTab === DAFEIYU_TAB_GROUPS) {
      body = groupsTab
        ? createElement(groupsTab, {})
        : fallbackLine(createElement, '群面板起不来（宿主没给 react hooks）。')
    } else if (activeTab === DAFEIYU_TAB_SEARCH) {
      // 起不来时也画一行中文：空白格会让人以为"这一栏是空的"，而不是"它坏了"。
      body = websearchTab
        ? createElement(websearchTab, {})
        : fallbackLine(createElement, '搜索面板起不来（宿主没给 react hooks）。')
    } else if (activeTab === DAFEIYU_TAB_TEAM) {
      body = agentTeamTab
        ? createElement(agentTeamTab, {})
        : fallbackLine(createElement, 'Agent 团队面板起不来（宿主没给 react hooks）。')
    } else if (rooms.some((room) => room.id === activeTab)) {
      // 住客的房间：只给容器，装修它自己来（`attachRoom` 管挂载/清理/崩了说人话）
      const room = rooms.find((candidate) => candidate.id === activeTab) as DafeiyuRoom
      body = createElement('div', { ref: attachRoom(room), 'data-room': room.id })
    } else {
      body = fallbackLine(createElement, '未实现的分栏。')
    }
    const compatBanner =
      compatNotes.length === 0
        ? null
        : createElement('div', {
            style: {
              padding: '8px 12px',
              marginBottom: '10px',
              borderRadius: '8px',
              border: '1px solid #f0c36d',
              background: '#fff8e6',
              color: '#8a5a00',
              fontSize: '12.5px',
              lineHeight: '1.6',
            },
            children: ['兼容性提示：', ...compatNotes],
          })
    return createElement('div', {
      style: columnStyle,
      children: compatBanner === null ? [tabBar, body] : [compatBanner, tabBar, body],
    })
  }

  const result = mountSettingsSection(ctx, createElement, {
    id: 'dafeiyu',
    order: 18,
    label: '大肥鱼',
    buildComponent: () => () => createElement(TabPage, {}),
  })
  // 晚到（'pending'）也算接管了：这一格已经登记，宿主补 slots 时会自己出现。
  return result !== 'failed'
}

const tabStyle: Record<string, string> = {
  padding: '4px 14px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: '13px',
  cursor: 'pointer',
}
const activeTabStyle: Record<string, string> = {
  ...tabStyle,
  borderColor: 'var(--dsw-alias-state-business-primary, #4b7bec)',
  color: 'var(--dsw-alias-state-business-primary, #4b7bec)',
}
