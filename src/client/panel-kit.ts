/**
 * panel-kit — 设置页各分栏（React 侧）共用的那一套：卡片、标题、状态标签、按钮、键值行、表格。
 *
 * ## 为什么要有这个文件
 *
 * 2026-11-16 把设置页拆成「远程控制 / 人设 / Agent 团队 / 肥鱼识图 / 小云雀」之后，
 * 三个新分栏要长得一样（照样板：**整页是一个卡片列**，卡与卡之间 12px）。
 * 而在此之前每块面板各自抄了一份 `cardStyle`/`buttonStyle`（`vision-panel.ts`、
 * `memory-panel.ts`、`subagents-settings.ts` 各一份）——再抄三份就是五份要一起改。
 *
 * ## 两条纪律
 *
 * 1. **模板里不许出现反引号**（`pill.ts`/`settings.ts` 那张表的同一条纪律在这里也适用：
 *    这些东西会被内联进 client 产物）。这里没有模板字符串，只有普通对象。
 * 2. **颜色一律走宿主变量**（`--dsw-alias-*`），不写裸色号：设置页在浅色/深色两套主题下
 *    都要能看。唯一例外是 `tagTone` 里的回退值——那是宿主变量没定义时的兜底，与
 *    `settings.ts` 那张表的做法一致。
 *
 * 这些是**纯工厂函数**：不碰 react、不碰 DOM，`h` 由调用方传进来（照本仓纪律：
 * 浏览器半边不能静态 require react）。
 */

export type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

/** 一列卡片（每个分栏的外层容器）。 */
export const columnStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
}

/** 一张卡：白底/透明底 + 一圈细边 + 圆角，与样板 `.card` 同档。 */
export const cardStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px 16px',
  borderRadius: '12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  minWidth: 0,
}

export const headStyle: Record<string, string | number> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  margin: 0,
  fontSize: '14px',
  fontWeight: '600',
  lineHeight: '20px',
  color: 'var(--dsw-alias-label-primary)',
}

/** 标题行右端那句计数（「3 个目录」这种）。 */
export const countStyle: Record<string, string | number> = {
  fontSize: '12px',
  fontWeight: '400',
  color: 'var(--dsw-alias-label-tertiary)',
}

/** 一段说明（可读的正文，不是提示）。 */
export const notesStyle: Record<string, string | number> = {
  margin: 0,
  fontSize: '12.5px',
  lineHeight: '1.6',
  color: 'var(--dsw-alias-label-secondary)',
  wordBreak: 'break-word',
}

/** 一句小字提示（比 `notesStyle` 更弱：只在需要时看一眼）。 */
export const hintStyle: Record<string, string | number> = {
  margin: 0,
  fontSize: '11.5px',
  lineHeight: '1.5',
  color: 'var(--dsw-alias-label-tertiary)',
  wordBreak: 'break-word',
}

export const rowStyle: Record<string, string | number> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

/** 「键：值」那一栏（样板 `.kv`）。标签列按内容宽度，值列吃掉剩下的。 */
export const kvStyle: Record<string, string | number> = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '6px 14px',
  fontSize: '13px',
  lineHeight: '20px',
  alignItems: 'baseline',
}

export const kvKeyStyle: Record<string, string | number> = {
  color: 'var(--dsw-alias-label-tertiary)',
  whiteSpace: 'nowrap',
}

export const kvValueStyle: Record<string, string | number> = {
  minWidth: 0,
  wordBreak: 'break-word',
  color: 'var(--dsw-alias-label-primary)',
}

export const btnStyle: Record<string, string | number> = {
  padding: '5px 12px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  lineHeight: '18px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const btnPrimaryStyle: Record<string, string | number> = {
  ...btnStyle,
  border: '1px solid var(--dsw-alias-state-business-primary, #4b7bec)',
  background: 'var(--dsw-alias-state-business-primary, #4b7bec)',
  color: '#ffffff',
  fontWeight: '600',
}

export const fieldStyle: Record<string, string | number> = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: '8px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  fontFamily: 'inherit',
}

export const labelStyle: Record<string, string | number> = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-secondary)',
  marginBottom: '4px',
}

/** 识别结果 / 提示词预览那种「一块引文」（样板 `.quote`）。 */
export const quoteStyle: Record<string, string | number> = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: '0 8px 8px 0',
  borderLeft: '2px solid var(--dsw-alias-state-business-primary, #4b7bec)',
  background: 'var(--dsw-alias-bg-secondary, rgba(127,127,127,0.06))',
  fontSize: '12.5px',
  lineHeight: '1.6',
  color: 'var(--dsw-alias-label-secondary)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: '240px',
  overflow: 'auto',
}

export const tableStyle: Record<string, string | number> = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '12.5px',
  lineHeight: '18px',
}

export const thStyle: Record<string, string | number> = {
  textAlign: 'left',
  padding: '6px 8px',
  fontWeight: '500',
  color: 'var(--dsw-alias-label-tertiary)',
  borderBottom: '1px solid var(--dsw-alias-border-l2)',
  whiteSpace: 'nowrap',
}

export const tdStyle: Record<string, string | number> = {
  padding: '8px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.18))',
}

/** 表格里的工具名（`subagent` 这种）。 */
export const codeStyle: Record<string, string | number> = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '12px',
  padding: '1px 5px',
  borderRadius: '5px',
  background: 'var(--dsw-alias-bg-secondary, rgba(127,127,127,0.12))',
  color: 'var(--dsw-alias-label-primary)',
}

/** 标签的三种语气：好的（可用/已就绪）、注意（半配置/暂无）、中性。 */
export type TagTone = 'ok' | 'warn' | 'off'

const TAG_COLORS: Record<TagTone, { color: string; background: string; border: string }> = {
  ok: {
    color: 'var(--dsw-alias-state-success-primary, #18794e)',
    background: 'var(--dsw-alias-state-success-bg, rgba(24,121,78,0.12))',
    border: 'var(--dsw-alias-state-success-primary, #18794e)',
  },
  warn: {
    color: 'var(--dsw-alias-state-warning-primary, #b7791f)',
    background: 'var(--dsw-alias-state-warning-bg, rgba(183,121,31,0.12))',
    border: 'var(--dsw-alias-state-warning-primary, #b7791f)',
  },
  off: {
    color: 'var(--dsw-alias-label-tertiary)',
    background: 'transparent',
    border: 'var(--dsw-alias-border-l2)',
  },
}

/** 状态标签（样板 `.tag`）。 */
export function tag(h: CreateElement, text: string, tone: TagTone): unknown {
  const colors = TAG_COLORS[tone]
  return h('span', {
    'data-tone': tone,
    style: {
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: '999px',
      border: `1px solid ${colors.border}`,
      background: colors.background,
      color: colors.color,
      fontSize: '11.5px',
      lineHeight: '17px',
      fontWeight: '600',
      whiteSpace: 'nowrap',
    },
    children: text,
  })
}

/** 一张卡片的壳：标题 + 可选计数 + 可选尾部标签 + 内容。 */
export function card(
  h: CreateElement,
  title: string,
  children: unknown[],
  options?: { count?: string; tag?: { text: string; tone: TagTone } | null },
): unknown {
  const head: unknown[] = [title]
  if (options?.count !== undefined && options.count !== '') head.push(h('span', { style: countStyle, children: options.count }))
  if (options?.tag) head.push(tag(h, options.tag.text, options.tag.tone))
  return h('section', {
    style: cardStyle,
    children: [h('h3', { style: headStyle, children: head }), ...children],
  })
}

/** 一颗按钮。`kind: 'primary'` 是填色的主动作。 */
export function button(
  h: CreateElement,
  label: string,
  onClick: () => void,
  options?: { kind?: 'primary' | 'plain'; disabled?: boolean },
): unknown {
  return h('button', {
    type: 'button',
    style: options?.kind === 'primary' ? btnPrimaryStyle : btnStyle,
    disabled: options?.disabled === true,
    onClick,
    children: label,
  })
}

/**
 * 一行「键：值」——**返回两个节点**（键一格、值一格），配合 `kvGrid` 的
 * `grid-template-columns: auto 1fr` 两两成行。
 *
 * 之所以不返回一个包了一对东西的 div：那样每行都要多一层盒子，而网格的两列就没法跨行
 * 对齐（除非用 `display: contents`，那个在部分宿主壳的 WebView 上表现不一致）。
 */
export function kv(h: CreateElement, key: string, value: unknown): unknown[] {
  const children = Array.isArray(value) ? value : [value]
  return [h('span', { style: kvKeyStyle, children: key }), h('span', { style: kvValueStyle, children })]
}

/** 把若干 `kv()` 成组塞进那个两列网格。 */
export function kvGrid(h: CreateElement, rows: unknown[]): unknown {
  return h('div', { style: kvStyle, children: rows.flat() })
}
