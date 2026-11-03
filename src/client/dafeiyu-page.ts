/**
 * dafeiyu-page — 0.8.0 的「大肥鱼」合页：设置页里**一个入口、三个分栏**。
 *
 * 合包前是两张互不相干的卡（「远程控制」与「人设」分属两个包）。合包后把设置页那一格
 * 合成一张卡：
 *
 *   [远程控制] [人设] [形象]
 *
 * - 「远程控制」页 = 远控原有那整页 DOM（`buildSettingsSection` 灌进去的，一行没动）；
 * - 「人设」页 = 人设客户端原有的 `PersonaSettingsSection`（React 组件，原样嵌进来）；
 * - 「形象」页 = 占位（素材管道已通，等素材落地再填）。
 *
 * 纪律（与远控其余部分同款）：
 * 1. **挂不上就返回 false**，由调用方决定降级成「老样子两张卡」——合页失败不许把设置页
 *    弄没。
 * 2. 槽位的早/晚两路都走（apply 时探 `slots`，探不到挂 `inject(['slots'])` 等它晚到）——
 *    直接复用 `mountSettingsSection` 的注册骨架，只把组件换掉。
 * 3. React 不静态 require：`createElement` / `useState` 都由调用方（装载器给的 require）
 *    传进来；这里只按参数干活。
 */
import { buildSettingsSection, mountSettingsSection, type SettingsHost } from './settings.js'
import { type CreateElement } from './pill.js'
import { resolveHostUrl } from './host-url.js'

/** 三个分栏的 id。 */
export const DAFEIYU_TAB_REMOTE = 'remote'
export const DAFEIYU_TAB_PERSONA = 'persona'
export const DAFEIYU_TAB_AVATAR = 'avatar'

const TAB_LABELS: Record<string, string> = {
  [DAFEIYU_TAB_REMOTE]: '远程控制',
  [DAFEIYU_TAB_PERSONA]: '人设',
  [DAFEIYU_TAB_AVATAR]: '形象',
}

export interface DafeiyuPageDeps {
  ctx: SettingsHost
  /** 装载器给的 createElement（`findCreateElement` 的结果）。 */
  createElement: CreateElement
  /** 同一个 react 模块里的 hooks（不能静态 `require('react')`，由调用方传入）。 */
  reactHooks: { useState?: <S>(initial: S) => [S, (next: S) => void] }
  /** 人设客户端的 `PersonaSettingsSection` 组件（从 `personaClientFactory` 的导出里拿）。 */
  personaSettings: unknown
  /** 人设那套字典的翻译函数；给不出就用 key 兜底。 */
  personaT: (key: string) => string
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

  const TabPage = (): unknown => {
    const [tab, setTab] = useState<string>(DAFEIYU_TAB_REMOTE)
    // ⚠️ 本仓的 CreateElement 是 (type, props) 两参式（React 的 children 走 props.children）——
    // 与 jsxRuntime 同款，别写成 (type, props, ...children)。
    const tabBar = createElement('div', {
      style: { display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
      children: Object.entries(TAB_LABELS).map(([id, label]) =>
        createElement('button', {
          type: 'button',
          key: id,
          style: tab === id ? activeTabStyle : tabStyle,
          onClick: () => setTab(id),
          children: label,
        }),
      ),
    })
    let body: unknown = null
    if (tab === DAFEIYU_TAB_REMOTE) {
      body = createElement('div', { ref: attach })
    } else if (tab === DAFEIYU_TAB_PERSONA) {
      body = createElement(personaSettings, { t: personaT })
    } else {
      body = createElement('p', {
        style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
        children: '形象页待素材落地（管道已通，纯时间活）。',
      })
    }
    return createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      children: [tabBar, body],
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
