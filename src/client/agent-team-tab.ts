/**
 * agent-team-tab — 设置页「Agent 团队」分栏（2026-11-16 新增）。
 *
 * 一栏三件事（顺序照已批准的结构）：
 *
 * | # | 块 | 来源 |
 * |---|---|---|
 * | ① | 派活助手设置（规范提示 / 派活风格 / 闲置阈值 / 提示词预览） | 复用 `./subagents-settings.ts` |
 * | ② | 一键转生 / 一键分身**入口按钮** | 打开**原来那个悬浮 modal**（`./handoff-panel.ts`） |
 * | ③ | 给 Agent 的调用入口（一张表：能力 / 工具或说法 / 当前状态） | 静态事实表，见下 |
 *
 * ## ② 为什么不把转生/分身重写成内嵌页
 *
 * 那个 modal 已经跑了几十版（`handoff-panel.ts`：自检 → 收输入 → 发起作业 → 盯状态），
 * 宿主侧还有三条路由与一个 180 秒的等待流程。这一栏只需要**一个入口**：把 `open(kind)`
 * 透出来，点了打开同一个面板。重写一遍内嵌页＝两份 UI 两条状态机，改一处漏一处。
 * ⇒ 依赖里只多一个 `openHandoff(kind)` 回调（`main.ts` 把它接到 `handoffPanel.open`）。
 *
 * ## ③ 那张表为什么是「静态事实表」
 *
 * 这一列要回答的是"为什么我让 Agent 转生它说不会"。能回答它的只有两样东西：
 *   · **宿主注册了哪些工具** —— 浏览器半边**查不到**：宿主没有"列工具"的回调/路由
 *     （子代理域那几条路由是 config/archive/stream，`src/subagents/routes.ts`），
 *     `ctx.get('tools')` 是**宿主侧**的服务，浏览器半边拿不到。
 *   · **本插件注册了哪些工具** —— 同样查不到，但它是**代码里写死的事实**。
 * ⇒ 所以这一列写的是"这一版实际注册了什么"的静态事实，并在卡里**明说**它不是运行时探测。
 * 谁要在将来接成真探测，得宿主侧先加一条只读路由（本轮不动宿主）。
 *
 * 事实依据（改这里之前先去核对）：
 *   · `subagent` / `subagent_fork` / `list_agents` —— 宿主（DSH 内核）自带的工具；
 *   · `subagent_archive` —— **本插件**注册（`src/subagents/tools.ts`，软探测 `tools` 面）；
 *   · 转生 / 分身 —— 只有面板入口与三条宿主路由，**没有任何 Agent 可调的工具**。
 */
import { buildSubagentsPanel } from './subagents-settings.js'
import {
  button,
  card,
  codeStyle,
  hintStyle,
  item,
  itemSub,
  itemTitle,
  notesStyle,
  columnStyle,
  tag,
  tdStyle,
  thStyle,
  tableStyle,
  type CreateElement,
  type TagTone,
} from './panel-kit.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

/** 转生 / 分身：与 `handoff-panel.ts` 的 `HandoffKind` 同形（那个类型不跨文件导出，这里照抄）。 */
export type AgentTeamHandoffKind = 'rebirth' | 'branch'

export interface AgentTeamTabDeps {
  createElement: CreateElement
  hooks: Hooks
  /** 打开转生/分身那个悬浮面板；拿不到（面板没起来）时按钮禁用并说清原因。 */
  openHandoff?: (kind: AgentTeamHandoffKind) => void
}

/** 表里一行的「当前」档：`ok` = 现在就能用；`none` = 只能从面板点（Agent 调不到）。 */
export type AgentToolState = 'ok' | 'none'

export interface AgentToolRow {
  ability: string
  /** 工具名或"对 Agent 说的话"（`code` 列）。 */
  tools: string
  state: AgentToolState
  /** `state === 'none'` 那句为什么，印在状态标签下面。 */
  why?: string
}

/**
 * 「给 Agent 的调用入口」那张表的**唯一数据源**。
 *
 * ⚠️ 这是**静态事实表**（理由见文件头）。改它之前先核对工具名是否还真的注册着：
 * 名字写错的表现是"用户在表里看到 `subagent_archived`，让 Agent 调却说不存在"。
 */
export const AGENT_TOOL_ROWS: AgentToolRow[] = [
  {
    ability: '派子代理',
    tools: 'subagent · subagent_fork',
    state: 'ok',
    why: '宿主自带工具',
  },
  {
    ability: '列出 / 归档子代理',
    tools: 'list_agents · subagent_archive',
    state: 'ok',
    why: 'list_agents 宿主自带；subagent_archive 由本插件注册',
  },
  {
    ability: '转生',
    tools: '对 Agent 说：把当前会话转生给新会话',
    state: 'none',
    why: '只有面板入口：宿主没有暴露对应工具，Agent 调不到（说了也只会回"没有这个工具"）',
  },
  {
    ability: '分身',
    tools: '对 Agent 说：把当前会话分身到 <工作区>',
    state: 'none',
    why: '同上：只有面板入口（宿主侧只有三条 handoff 路由，没有工具）',
  },
]

const STATE_TEXT: Record<AgentToolState, { text: string; tone: TagTone }> = {
  ok: { text: '可用', tone: 'ok' },
  none: { text: '暂无工具（面板可用）', tone: 'off' },
}

/**
 * 「Agent 团队」整栏。宿主没给 `useState` 时返回 `undefined`（调用方画一行降级说明）。
 */
export function buildAgentTeamTab(deps: AgentTeamTabDeps): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  if (typeof useState !== 'function') return undefined
  const subagentsPanel = buildSubagentsPanel({ createElement: h, hooks })

  /**
   * ② 转生 / 分身入口。
   *
   * 按钮文案与 modal 里那两个标题一致（「一键转生」「一键分身」），点了**打开同一个面板**；
   * 面板起来就由它自己接管（自检当前会话、收重点、发起作业）。
   */
  function HandoffEntryCard(): unknown {
    const openHandoff = deps.openHandoff
    const available = typeof openHandoff === 'function'
    const run = (kind: AgentTeamHandoffKind): void => {
      if (!available) return
      try {
        openHandoff(kind)
      } catch (error) {
        // 面板自己会降级（读不到会话就禁用「开始」），这里只保证不把设置页带崩。
        try {
          console.warn('[dsh-remote-control settings] 打开转生/分身面板失败', error)
        } catch {
          /* 控制台也可能不可用 */
        }
      }
    }
    return card(h, '一键转生 / 一键分身', [
      /* 两个动作各占一行（样板里是两张卡、各一个动作；我们两个动作共用一个面板，
         所以并成一张卡里的两行：左文说清它是什么、右端一颗按钮）。 */
      item(
        h,
        [
          itemTitle(h, '一键转生'),
          itemSub(h, '当前会话写一份交接文档，然后在**新会话**里接着干（上下文快满时用）'),
        ],
        [button(h, '一键转生', () => run('rebirth'), { kind: 'primary', disabled: !available })],
      ),
      item(
        h,
        [
          itemTitle(h, '一键分身'),
          itemSub(h, '把当前上下文复制成新会话，两边并行干活'),
        ],
        [button(h, '一键分身', () => run('branch'), { disabled: !available })],
      ),
      available
        ? h('p', { style: hintStyle, children: '点了会打开转生/分身面板，流程在面板里走完；宿主侧等交接文档最多 180 秒，旧会话不会自动归档，确认后手动归档。' })
        : h('p', {
            style: notesStyle,
            children: '这个入口没接上（转生/分身面板没起来）：装了悬浮形象时可以从它的菜单打开，两个动作仍然可用。',
          }),
    ])
  }

  /** ③ 给 Agent 的调用入口（一张表）。 */
  function AgentToolTableCard(): unknown {
    const header = h('tr', {
      children: [
        h('th', { style: thStyle, children: '能力' }),
        h('th', { style: thStyle, children: '工具 / 说法' }),
        h('th', { style: thStyle, children: '当前' }),
      ],
    })
    const rows = AGENT_TOOL_ROWS.map((row) => {
      const state = STATE_TEXT[row.state]
      return h('tr', {
        key: row.ability,
        'data-state': row.state,
        children: [
          h('td', { style: { ...tdStyle, whiteSpace: 'nowrap' }, children: row.ability }),
          h('td', { style: tdStyle, children: [h('code', { style: codeStyle, children: row.tools })] }),
          h('td', { style: tdStyle, children: [tag(h, state.text, state.tone)] }),
        ],
      })
    })
    const reasons = AGENT_TOOL_ROWS.filter((row) => row.why !== undefined).map((row) =>
      h('li', { key: row.ability, children: `${row.ability}：${row.why ?? ''}` }),
    )
    return card(
      h,
      '给 Agent 的调用入口',
      [
        h('p', {
          style: notesStyle,
          children: '没装悬浮形象时，怎么让 Agent 用这些能力就看这张表。',
        }),
        /* 窄卡里表格会挤出右边（「工具 / 说法」那列是长串）；给一层横向滚动，
           而不是让整张卡片跟着变宽。 */
        h('div', { style: { overflowX: 'auto', minWidth: 0 }, children: [
          h('table', { style: tableStyle, children: [h('thead', { children: header }), h('tbody', { children: rows })] }),
        ] }),
        h('ul', { style: { ...hintStyle, margin: 0, paddingLeft: '18px' }, children: reasons }),
        h('p', {
          style: hintStyle,
          children:
            '这一列是**静态事实**（这一版实际注册了哪些工具），不是运行时探测：宿主没有「某个工具在不在」的查询接口，' +
            '浏览器半边也读不到宿主侧的 tools 服务。所以「暂无工具」意味着**只能从面板点**，让 Agent 说也没用。',
        }),
      ],
      { count: '没有悬浮形象时就走这里' },
    )
  }

  return function AgentTeamTab(): unknown {
    const children: unknown[] = [
      card(h, '这一栏管什么', [
        h('p', {
          style: notesStyle,
          children:
            '派活、转生、分身。装了悬浮形象时，这三个动作也会出现在形象右键菜单里；没装也能在这儿用，或者让 Agent 自己调（见最下面「给 Agent 的调用入口」）。',
        }),
      ]),
    ]
    if (subagentsPanel) children.push(h(subagentsPanel, {}))
    children.push(h(HandoffEntryCard, {}), h(AgentToolTableCard, {}))
    return h('div', { 'data-panel': 'team', style: columnStyle, children })
  }
}
