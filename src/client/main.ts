/**
 * client — 浏览器那一半（会被打成 `dist/bundle/client.cjs`，由 `window.__ModuleLoader__` 装载）。
 *
 * 2026-10-03 这一半原来做两件事：每 2 秒轮宿主那条只读路由、把当前配对码推进右栏
 * （`sidebarRight.openResource`），外加状态栏那颗 pill。右栏自动弹码那套整个删了——
 * 配对入口只剩 pill，而 pill 要图的时候自己发请求（`./pill.ts`）。所以这个文件剩下的
 * 全部职责就是一句话：**把 pill 挂上去，挂不上也不许影响任何东西**。
 *
 * 三条纪律：
 *
 * 1. **apply 不许把异常抛出去**。这一半抛出会让整页 web boot 失败
 *    （`web boot: N entry/entries did not activate`）——真机上验证过：连一个写错的属性名
 *    都能让应用起不来。
 * 2. **`slots` 按宿主模板声明进 `inject`，`mountPill` 里再留软探测与晚到回调两条退路**。
 *    只靠软探测（`inject: []`）的表现是"屏幕上永远没有这颗 pill"：apply 跑在槽位服务之前，
 *    2026-10-03 删掉右栏那半之后在真机上被打中（当时 262 项单测全绿）。写进闸门换来正确的
 *    激活时机；退路留着，是为了在"这一代宿主没把 slots 当服务给"时还能挂上并留下一行 warn。
 *    配对入口在这类宿主上不存在（`/drc pair` 与文本码同日删了）：宿主侧那六条路由挂没挂，
 *    `status.json` 的 `pill` 探针查得到；浏览器这一半只能靠 DevTools 里那行 warn。
 * 3. **拿不到 `react` 就什么都不做**。装载器给不出 react 时 `mountPill` 返回 false，
 *    这里只留一行 warn——它不许变成抛错。
 */

import { findCreateElement, mountPill } from './pill.js'
import { resolveHostUrl } from './host-url.js'
import { mountSettingsSection } from './settings.js'
import { mountDafeiyuSettings } from './dafeiyu-page.js'
// 识图那一半（0.9.0）：聊天页鲸鱼按钮 + 当前会话注入。
import { mountVisionFab } from './vision-panel.js'
import { mountSubagentMonitor } from './subagent-panel.js'
import { mountAvatarWidget } from './avatar-widget.js'
import { mountXyqQuick } from './xyq-quick.js'
import { mountHandoffPanel } from './handoff-panel.js'
// 人设那一半的界面（0.8.0 起合包）。它是**生成物**：人设仓库里那份 client.js 已裹好
// loader 外壳，`scripts/unwrap-persona-client.mjs` 把外壳剥成这个工厂函数。
import personaClientFactory from '../persona/client-factory.js'

interface ClientContext {
  slots?: unknown
  get?<T>(name: string, optional?: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
  effect?(execute: () => (() => unknown) | void): unknown
}

/** 必须与包的完整名一致：装载器按 loader entry 名（= 包名）来认这一半。 */
export const name = 'dsh-remote-dafeiyu'

/**
 * **服务声明：`slots`**（2026-10-20 复核后恢复）。
 *
 * 时间线把两次判断都记在这里，免得下一个人再走一遍：
 *
 * 1. 0.2.1 的 boot 会对**任何 pending 条目**抛
 *    `web boot: N entry/entries did not activate` ⇒ 我先把这条声明撤掉，想彻底
 *    避免"等服务"。
 * 2. **实测不成立**：撤掉之后 pill 与设置页**都不出现**（用户在 desktop 上验的）。
 *    原因：`inject: []` 时这一半的 `apply()` 跑在槽位服务之前，`ctx.slots` 读不到
 *    （cordis 的 Proxy 对未声明的属性是**抛**），而 `ctx.inject(['slots'], cb)` 这条
 *    晚到回调在 0.2.1 上并没有把 pill 挂上来。
 * 3. 0.2.1 官方客户端插件**照样声明** `inject: ["slots"]` 并用 `ctx.slots.inject(...)`
 *    注册（`dsh-client-ui-conversation` 的 `conversation-queue-dock` 就是
 *    `inject: ["slots", "conversation", ...]`）⇒ `slots` 是这一代的稳定服务名，
 *    声明它是**与官方同款**的写法，而不是赌。
 *
 * ⚠️ 真正会让条目 pending 的是**包图边**（清单里的 `dsh.client.inject` 包名列表：
 * 那条边指向的客户端包若不在 boot 图里，本条目就永远等不到）—— 那一格已删。
 * 服务名这条留着。
 */
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): (() => void) | void {
  const createElement = findCreateElement()

  // ① 会话里那颗 pill（`conversation.composer.dock`，需要会话才渲染）。
  //
  // 到这一步只能是 mountPill 自己没兜住的意外；它不许变成"整页起不来"。
  let pillMounted = false
  try {
    pillMounted = mountPill(ctx, createElement)
  } catch (error) {
    swallow('pill 挂载抛错（已吞掉）', error)
  }

  /**
   * ② 设置页那一格：0.8.0 起是「大肥鱼」合页——一个入口、三个分栏（远程控制 / 人设 / 形象）。
   *
   * 这一条是配对的**正门**：pill 挂的槽位只在有会话时渲染（宿主那条条件是
   * `sessionId !== void 0`），所以"打开浏览器、还没有任何会话"的人找不到出码入口
   * （2026-08-09 用户报的就是这个）。设置页是 root 作用域，两端都渲染。
   *
   * 流程：先把人设那一半**装起来**（合页要它的 `PersonaSettingsSection` 组件），
   * 装得上就走合页；装不上就退回老样子——远程控制一卡 + 人设一卡。
   * 两条路都有兜底，任何一条失败都不许把另一条带走。
   */
  let personaClient:
    | { apply?: (c: unknown, options?: { skipSettings?: boolean }) => void; PersonaSettingsSection?: unknown }
    | undefined
  let reactHooks:
    | {
        useState?: <S>(initial: S) => [S, (next: S) => void]
        useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
      }
    | undefined
  let personaLoadNote: string | undefined
  try {
    const loaderRequire = resolveLoaderRequire()
    if (loaderRequire === undefined) {
      personaLoadNote = '装载器没给 require'
    } else {
      personaClient = personaClientFactory(loaderRequire)
      if (typeof personaClient?.apply !== 'function') {
        personaLoadNote = '人设客户端没给出 apply'
      } else {
        reactHooks = (loaderRequire('react') as { useState?: <S>(initial: S) => [S, (next: S) => void] }) ?? undefined
      }
    }
  } catch (error) {
    personaLoadNote = String((error as Error)?.message ?? error)
  }
  if (personaLoadNote) {
    warnPersona(`人设客户端未就绪（${personaLoadNote}：退回两张卡，或只剩远控一卡）`)
  }

  // 识图那颗鲸鱼按钮（0.9.0）：先探当前会话注入通道，探不到也挂——只是退化成"复制结果"。
  let visionCleanup: (() => void) | undefined
  let openVision: (() => void) | undefined
  let openSubagents: (() => void) | undefined
  let xyqQuick: ReturnType<typeof mountXyqQuick> | undefined
  try {
    visionCleanup = mountVisionFab({
    injectText: resolveSessionInject(ctx),
    hideFab: true,
    expose: (api) => {
      openVision = api.open
    },
  })
  } catch (error) {
    swallow('识图按钮挂载抛错（已吞掉）', error)
  }

  // ②b 子代理监视器（2026-11-09）：当前对话有子代理时，右侧出现一颗小图标。
  let subagentsCleanup: (() => void) | undefined
  let handoffPanel: ReturnType<typeof mountHandoffPanel> | undefined
  let avatarCleanup: (() => void) | undefined
  try {
    xyqQuick = mountXyqQuick()
  } catch (error) {
    swallow('小云雀快捷面板挂载抛错（已吞掉）', error)
  }
  try {
    subagentsCleanup = mountSubagentMonitor({
      getCurrentSession: resolveCurrentSession(ctx),
      showFab: false,
      expose: (api) => {
        openSubagents = api.open
      },
    })

  // 转生 / 分身（0.53）：形象菜单两项，面板走宿主那三条回环路由。
  try {
    handoffPanel = mountHandoffPanel({ getCurrentSession: resolveCurrentSession(ctx) })
  } catch (error) {
    swallow('转生/分身面板挂载抛错（已吞掉）', error)
  }

  // avatar widget (0.14): chat page bottom-left, auto-switches by agent status.
  try {
    avatarCleanup = mountAvatarWidget({
      getCurrentSession: resolveCurrentSession(ctx),
      onMenuAction: (id) => {
        if (id === 'subagents') openSubagents?.()
        else if (id === 'vision') openVision?.()
        else if (id === 'rebirth') handoffPanel?.open('rebirth')
        else if (id === 'branch') handoffPanel?.open('branch')
        else xyqQuick?.open()
      },
    })
  } catch (error) {
    swallow('avatar widget mount failed (swallowed)', error)
  }
  } catch (error) {
    swallow('子代理监视器挂载抛错（已吞掉）', error)
  }

  let settingsMounted = false
  let dafeiyuMerged = false
  let personaMounted = false
  // ③a 优先走合页：一个入口、三个分栏。
  try {
    if (personaClient && typeof createElement === 'function' && reactHooks && typeof reactHooks.useState === 'function') {
      dafeiyuMerged = mountDafeiyuSettings({
        ctx: ctx as never,
        createElement: createElement as never,
        reactHooks,
        personaSettings: personaClient.PersonaSettingsSection,
        personaT: resolvePersonaT(ctx, (personaClient as { zh?: Record<string, string> }).zh),
      })
    }
  } catch (error) {
    dafeiyuMerged = false
    swallow('大肥鱼合页挂载抛错（退回两张卡）', error)
  }
  if (dafeiyuMerged) {
    // 合页已把「人设」页嵌进自己的分栏：人设那半只挂其余三个席位，不再单独出一张卡。
    // 诊断里 settingsMounted 要算真：合页就是设置页那一格，只是换了个长相。
    settingsMounted = true
    try {
      personaClient?.apply?.(ctx, { skipSettings: true })
      personaMounted = true
    } catch (error) {
      warnPersona('人设界面挂载抛错（已吞掉，合页与远控不受影响）', error)
    }
  } else {
    // ③b 老样子：远程控制一卡 + 人设一卡，两张卡各自独立。
    try {
      settingsMounted = mountSettingsSection(ctx, createElement) !== 'failed'
    } catch (error) {
      swallow('设置分区挂载抛错（已吞掉）', error)
    }
    if (personaClient) {
      try {
        personaClient?.apply?.(ctx)
        personaMounted = true
      } catch (error) {
        warnPersona('人设界面挂载抛错（已吞掉，远控设置页不受影响）', error)
      }
    }
  }

  // 诊断自报：宿主侧没有别的观测量能回答"客户端半到底跑到哪一步"。
  reportClient({
    createElement: createElement !== undefined,
    pillMounted,
    settingsMounted,
    dafeiyuMerged,
    personaMounted,
    hasSlotsCtx: (() => {
      try {
        return (ctx as { slots?: unknown }).slots !== undefined
      } catch {
        return false
      }
    })(),
    transport: (globalThis as { __DSH_TRANSPORT__?: unknown }).__DSH_TRANSPORT__ !== undefined,
  })

  return () => {
    try {
      subagentsCleanup?.()
    } catch {
      /* 卸载动作不许拖住卸载 */
    }
    try {
      avatarCleanup?.()
    } catch {
      /* avatar cleanup must not throw */
    }
    try {
      xyqQuick?.dispose()
    } catch {
      /* xyq quick dispose must not throw */
    }
    try {
      visionCleanup?.()
    } catch {
      /* 卸载动作不许拖住卸载 */
    }
    try {
      handoffPanel?.destroy()
    } catch {
      /* 卸载动作不许拖住卸载 */
    }
  }
}

/**
 * 当前会话注入通道（0.9.0）。与 `dsh-vision` 同款：`sessions.list.getSnapshot().current` +
 * `sessions.binding(id).session.prompt([{type:'text',text}], 'queue')`。
 *
 * 软探测：这一代宿主可能没把 `sessions` 当服务给（客户端 apply 跑在会话服务之前），
 * 探不到就返回 undefined，鲸鱼按钮退化成「显示识别结果 + 复制」。
 */
function resolveSessionInject(ctx: ClientContext): ((text: string) => Promise<boolean>) | undefined {
  let sessions: unknown
  try {
    sessions = (ctx as { sessions?: unknown }).sessions
  } catch {
    sessions = undefined
  }
  if (!sessions) {
    try {
      sessions = ctx.get?.('sessions', true)
    } catch {
      sessions = undefined
    }
  }
  const value = sessions as
    | {
        list?: { getSnapshot?: () => { current?: unknown } }
        binding?: (id: unknown) => { session?: { prompt?: (parts: unknown[], mode?: string) => unknown } } | undefined
      }
    | undefined
  if (!value || typeof value.list?.getSnapshot !== 'function' || typeof value.binding !== 'function') {
    return undefined
  }
  return async (text: string): Promise<boolean> => {
    try {
      const current = value.list?.getSnapshot?.()?.current
      if (current === undefined || current === null) return false
      const binding = value.binding?.(current)
      const prompt = binding?.session?.prompt
      if (typeof prompt !== 'function') return false
      await prompt.call(binding?.session, [{ type: 'text', text }], 'queue')
      return true
    } catch {
      return false
    }
  }
}

/**
 * 当前选中的会话 id（子代理监视器用）。与 `resolveSessionInject` 同一条软探测：
 * 服务晚到时返回 undefined，监视器就保持隐藏——不会因为拿不到会话把页面搞坏。
 */
function resolveCurrentSession(ctx: ClientContext): () => string | undefined {
  /**
   * 取一个客户端服务：先按属性读（cordis 声明过才有，未声明会抛），再走 `ctx.get(name, true)`。
   * **每次调用都重新取**——apply 跑在服务就绪之前，一次性捕获会把 undefined 永久缓存下来。
   */
  const service = (name: string): unknown => {
    try {
      const direct = (ctx as Record<string, unknown>)[name]
      if (direct) return direct
    } catch {
      /* 未声明的服务：属性访问会抛，走 ctx.get */
    }
    try {
      return ctx.get?.(name, true)
    } catch {
      return undefined
    }
  }
  return () => {
    // ① 会话界面服务（`dsh-client-ui-session` 的 UiSession）：`current` 是 binding source，
    //    getSnapshot() 返回 `{ key: sessionId, … }`。这是官方那套「当前选中会话」的权威来源。
    const ui = service('uiSession') as { current?: { getSnapshot?: () => unknown; value?: unknown } } | undefined
    try {
      const binding = ui?.current
      const snap = binding?.getSnapshot ? binding.getSnapshot() : binding?.value
      const key = typeof snap === 'object' && snap !== null ? (snap as { key?: unknown; sessionId?: unknown }).key ?? (snap as { sessionId?: unknown }).sessionId : undefined
      if (typeof key === 'string' && key !== '') return key
    } catch {
      /* 界面服务还没起来：继续试下一条 */
    }
    // ② 会话控制器（`sessions.list`）——这一代的快照里没有 current（只有 ids/byId/phase），
    //    留着是给将来可能补字段的版本用，拿不到就返回 undefined。
    const sessions = service('sessions') as { list?: { getSnapshot?: () => { current?: unknown } } } | undefined
    try {
      const current = sessions?.list?.getSnapshot?.()?.current
      if (typeof current === 'string' && current !== '') return current
    } catch {
      /* 同上 */
    }
    return undefined
  }
}

/** 把这一半的观测结果 POST 回宿主（`/plugins/dsh-remote-control/client-report`）。绝不抛。 */
function reportClient(fields: Record<string, unknown>): void {
  try {
    void fetch(resolveHostUrl('/plugins/dsh-remote-control/client-report'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
      // 与其余请求同一条纪律：宿主卡住时它自己收场，不挂住页面。
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(3000) : undefined,
      body: JSON.stringify({
        ...fields,
        href: typeof location !== 'undefined' ? String(location.href).slice(0, 120) : '',
      }),
    }).catch(() => {})
  } catch {
    /* 诊断通道本身不许成为故障源 */
  }
}

/**
 * 人设那套字典的翻译函数（`personaDafeiyu` 命名空间）。
 *
 * 顺序：**先查随包带的中文词典**（`zh`，人设客户端导出），查不到再问宿主 locale，
 * 都拿不到就用 key 兜底。宿主语言是 en 时，光靠 `ctx.locale.bind` 会整页英文——
 * 「大肥鱼」是给中文用户用的面板，所以中文优先。
 *
 * `bind` 也改成**第一次调用时才解析**：合页是先挂组件、后 `persona.apply()` 注册词典，
 * 提前 bind 有拿到空命名空间的风险（渲染发生在挂载之后，所以这里一定来得及）。
 */
function resolvePersonaT(ctx: ClientContext, zh?: Record<string, string>): (key: string) => string {
  let bound: ((key: string) => string) | undefined
  let resolved = false
  const fromZh = (key: string): string | undefined =>
    zh && Object.prototype.hasOwnProperty.call(zh, key) ? zh[key] : undefined
  return (key: string): string => {
    const own = fromZh(key)
    if (own !== undefined) return own
    if (!resolved) {
      resolved = true
      try {
        const bind = (ctx as { locale?: { bind?: (ns: string) => (key: string) => string } }).locale?.bind
        if (typeof bind === 'function') {
          const candidate = bind('personaDafeiyu')
          if (typeof candidate === 'function') bound = candidate
        }
      } catch {
        /* 这一代宿主没把 locale 当服务给，key 兜底照样能渲染 */
      }
    }
    const external = bound?.(key)
    return typeof external === 'string' && external !== '' ? external : key
  }
}

/**
 * 取装载器注入的 `require`。
 *
 * 模块名走**变量**（与 `pill.ts` 的 `findCreateElement` 同一套做法）：写成字面量
 * `require('react')` 会被打包器在构建期解析掉，产物里就变成了 Factory 顶层的静态 require。
 * 这里要的是"运行时问装载器要"，所以只把 `require` 当值传出去，不在本文件里 require 任何东西。
 */
declare const require: ((id: string) => unknown) | undefined

function resolveLoaderRequire(): ((id: string) => unknown) | undefined {
  try {
    if (typeof require !== 'function') return undefined
    return require
  } catch {
    return undefined
  }
}

/**
 * 人设那半的降级留痕（0.8.0 合包后新增）。
 *
 * **走 warn 不走 error**：人设界面没挂上是"少一块界面"，不是故障——宿主没有 react、
 * 没给 `slots`、装载器没给 `require`，这三种都是正常的代际差异。
 * 拿 error 报它会把"降级"和"崩了"混成同一个信号（远控那半的判据里，
 * `console.error` 的条数就是"有没有故障"的指标）。
 */
function warnPersona(message: string, error?: unknown): void {
  try {
    const detail = error instanceof Error ? error.message : error === undefined ? '' : String(error)
    console.warn(`[dsh-remote-control persona] ${message} ${detail}`)
  } catch {
    /* 控制台也可能不可用 */
  }
}

/** 降级留痕：任何一条路抛错都只留一行日志，绝不把异常递回宿主。 */
function swallow(what: string, error?: unknown): void {
  try {
    console.error(`[dsh-remote-control] ${what}：`, error)
  } catch {
    /* 控制台也可能不可用 */
  }
}
