/**
 * panel-kit — 设置页各分栏（React 侧）共用的那一套：卡片、标题、状态标签、按钮、键值行、表格、行。
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
 *    都要能看。每个令牌都带兜底值（兜底取自 `pill.ts` 那份 FALLBACK，也就是宿主的浅色值），
 *    所以变量没定义时也只是一块"浅色版"，不会变成"没边框 / 没底色"。
 *
 * ## 版式取自样板（`docs/mockup/panel-tabs-mockup-20261116.html`）
 *
 * | 样板 | 这里 | 数字 |
 * |---|---|---|
 * | `.card` | `cardStyle` | 1px 边 + 12px 圆角 + 16px 内边距，卡列间距 12 |
 * | `.card h2` | `headStyle` | 12px / 600 / 灰色 / 字距 .5px（分区标题，比内容低一档） |
 * | `.item` | `itemStyle` | 另一层底 + 10px 圆角 + 10/12 内边距 + 左文右动作 |
 * | `.list` | `listStyle` | 竖排、行距 8 |
 * | `.btn` / `.btn.ghost` / `.btn.danger` | `button({kind})` | 主 / 次 / 危险三档 |
 * | `.tag`（4 色） | `tag(h, text, tone)` | ok / warn / key / off |
 * | `.field` | `fieldStyle` + `labelStyle` | 标签在上、控件在下 |
 * | `.kv` | `kvStyle` 等 | 键列按内容、值列吃掉剩余 |
 *
 * 这些是**纯工厂函数**：不碰 react、不碰 DOM，`h` 由调用方传进来（照本仓纪律：
 * 浏览器半边不能静态 require react）。
 */

export type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

/**
 * 宿主令牌 + 兜底。
 *
 * 兜底值**不是**"我们的配色"，是 `pill.ts` 里那份 FALLBACK（宿主浅色主题的值）：
 * 变量在的时候完全走宿主主题，变量不在的时候至少还是"浅色可读"。
 * 写成一个函数而不是把 `var(...)` 抄进每个对象：抄了十几处就会有人漏兜底
 * （漏兜底的表现是 `border: 1px solid var(--x)` 整条失效 ⇒ 边框凭空消失）。
 */
const v = (name: string, fallback: string): string => `var(--dsw-alias-${name}, ${fallback})`
/**
 * 同一个语义在宿主里可能有两套拼写（`state-warning-primary` / `state-warn-primary`）。
 * CSS 的 `var()` 兜底可以嵌套，所以这层只多几个字节，换来"哪个名字是真的都不会掉色"。
 */
const v2 = (name: string, alt: string, fallback: string): string => `var(--dsw-alias-${name}, var(--dsw-alias-${alt}, ${fallback}))`

const LINE = v('border-l2', 'rgba(0, 0, 0, 0.16)')
const LINE_SOFT = v('border-l1', 'rgba(0, 0, 0, 0.08)')
const SURFACE_CARD = v('bg-layer-3', '#ffffff')
const SURFACE_ROW = v('bg-layer-1', '#ffffff')
const TEXT = v('label-primary', '#1f2329')
const TEXT_DIM = v('label-secondary', '#6b7280')
const TEXT_FAINT = v('label-tertiary', '#9aa0a6')
const ACCENT = v('brand-primary', '#247bbf')

/** 一列卡片（每个分栏的外层容器）——样板里卡与卡之间 12px。 */
export const columnStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: 0,
}

/**
 * 一张卡：一层底 + 一圈细边 + 12px 圆角 + 16px 内边距（与样板 `.card`、
 * 也与「远程控制」栏里已定稿的 `.drc-sec-card` 同一档：同一页里同一层东西该长得一样）。
 */
export const cardStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '16px',
  borderRadius: '12px',
  border: `1px solid ${LINE}`,
  background: SURFACE_CARD,
  minWidth: 0,
}

/** 分区标题：12px、加字距、灰色——它是"这一块叫什么"，不是"这一页叫什么"。 */
export const headStyle: Record<string, string | number> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  margin: 0,
  fontSize: '12px',
  fontWeight: '600',
  letterSpacing: '0.5px',
  lineHeight: '18px',
  color: TEXT_FAINT,
}

/** 标题行右端那句计数（「人设库 4 个」这种）。 */
export const countStyle: Record<string, string | number> = {
  fontSize: '12px',
  fontWeight: '400',
  letterSpacing: '0',
  color: TEXT_FAINT,
}

/** 一段说明（可读的正文，不是提示）。 */
export const notesStyle: Record<string, string | number> = {
  margin: 0,
  fontSize: '13px',
  lineHeight: '1.65',
  color: TEXT_DIM,
  wordBreak: 'break-word',
}

/** 一句小字提示（比 `notesStyle` 更弱：只在需要时看一眼）。 */
export const hintStyle: Record<string, string | number> = {
  margin: 0,
  fontSize: '11.5px',
  lineHeight: '1.6',
  color: TEXT_FAINT,
  wordBreak: 'break-word',
}

export const rowStyle: Record<string, string | number> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

/** 卡内一组行（样板 `.list`）：竖排、行距 8。 */
export const listStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0,
}

/**
 * 一行（样板 `.item`）：**另一层底 + 圆角 + 左右分布**。
 *
 * 这是"元素有层次"的关键一条——裸文字直接铺在卡片里，读起来就是一坨；
 * 套一层浅底之后，"这一行是一件事"才成立。底色用 `bg-layer-1`：
 * 与卡片（`bg-layer-3`）差一层，正是「远程控制」栏 `.drc-stat` 与 `.drc-sec-card` 的关系。
 */
export const itemStyle: Record<string, string | number> = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${LINE_SOFT}`,
  background: SURFACE_ROW,
  minWidth: 0,
}

/** 行里的正文格（吃掉剩余宽度，标题在上、副标题在下）。 */
export const itemTextStyle: Record<string, string | number> = {
  flex: '1 1 auto',
  minWidth: 0,
  fontSize: '13px',
  lineHeight: '20px',
  color: TEXT,
  wordBreak: 'break-word',
}

/** 行里的副标题（「导入 · 6 条记忆」这种）。 */
export const itemSubStyle: Record<string, string | number> = {
  display: 'block',
  marginTop: '2px',
  fontSize: '12px',
  lineHeight: '18px',
  color: TEXT_FAINT,
  wordBreak: 'break-word',
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
  color: TEXT_FAINT,
  whiteSpace: 'nowrap',
}

export const kvValueStyle: Record<string, string | number> = {
  minWidth: 0,
  wordBreak: 'break-word',
  color: TEXT,
}

/** 次按钮（样板 `.btn.ghost`）：透明底 + 一圈细边。 */
export const btnStyle: Record<string, string | number> = {
  appearance: 'none',
  font: 'inherit',
  padding: '5px 12px',
  borderRadius: '8px',
  border: `1px solid ${LINE}`,
  background: 'transparent',
  color: TEXT,
  fontSize: '13px',
  lineHeight: '18px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

/**
 * 主动作（样板 `.btn`）：填色 + 反白字。
 *
 * ⚠️ 填充与字色**各拿各的宿主令牌**（`button-primary-fill` / `label-primary-foreground`），
 * 不写死 `#fff`：填色在浅色主题下是深蓝、在深色主题下是浅蓝，写死白字会在后一种里消失。
 * 这一对与「远程控制」栏 `.drc-sec-btn[data-kind="primary"]` 是同一对（同一页不许两种主按钮）。
 */
export const btnPrimaryStyle: Record<string, string | number> = {
  ...btnStyle,
  border: '1px solid transparent',
  background: v('button-primary-fill', '#247bbf'),
  color: v('label-primary-foreground', '#ffffff'),
  fontWeight: '600',
}

/** 危险动作（样板 `.btn.danger`）：红字红边、不填色——它要显眼但不该像主按钮那样勾人去点。 */
export const btnDangerStyle: Record<string, string | number> = {
  ...btnStyle,
  border: `1px solid ${v('state-error-primary', '#ff4d4f')}`,
  color: v('state-error-primary', '#ff4d4f'),
}

/** 输入类控件（样板 `.field input`）：白底细边、与按钮同一档圆角。 */
export const fieldStyle: Record<string, string | number> = {
  boxSizing: 'border-box',
  width: '100%',
  minWidth: 0,
  padding: '6px 10px',
  borderRadius: '8px',
  border: `1px solid ${LINE}`,
  background: SURFACE_ROW,
  color: TEXT,
  fontSize: '13px',
  fontFamily: 'inherit',
}

export const labelStyle: Record<string, string | number> = {
  display: 'block',
  fontSize: '12px',
  lineHeight: '18px',
  color: TEXT_DIM,
  marginBottom: '4px',
}

/** 「标签在上、控件在下」的一格（样板 `.field`）。 */
export const fieldGroupStyle: Record<string, string | number> = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
}

/** 识别结果 / 提示词预览那种「一块引文」（样板 `.quote`）。 */
export const quoteStyle: Record<string, string | number> = {
  margin: 0,
  padding: '8px 12px',
  borderRadius: '0 8px 8px 0',
  borderLeft: `2px solid ${ACCENT}`,
  background: SURFACE_ROW,
  fontSize: '12.5px',
  lineHeight: '1.6',
  color: TEXT_DIM,
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

/** 表头：灰字、下沿一条线（样板 `table.tools th`）。 */
export const thStyle: Record<string, string | number> = {
  textAlign: 'left',
  padding: '6px 8px',
  fontWeight: '500',
  color: TEXT_FAINT,
  borderBottom: `1px solid ${LINE}`,
  whiteSpace: 'nowrap',
}

/** 表格行：行之间一条更淡的线（样板 `table.tools td`）。 */
export const tdStyle: Record<string, string | number> = {
  padding: '8px',
  verticalAlign: 'top',
  borderBottom: `1px solid ${LINE_SOFT}`,
}

/** 表格里的工具名（`subagent` 这种）。 */
export const codeStyle: Record<string, string | number> = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  fontSize: '12px',
  padding: '1px 5px',
  borderRadius: '5px',
  background: SURFACE_ROW,
  color: TEXT,
}

/** 空状态那一句（样板 `.empty`）：居中、淡、留一点上下白。 */
export const emptyStyle: Record<string, string | number> = {
  margin: 0,
  padding: '14px 0',
  textAlign: 'center',
  fontSize: '12.5px',
  color: TEXT_FAINT,
}

/**
 * 标签的四种语气（样板 `.tag` 的四色）。
 *
 * - `ok` 可用 / 已就绪；
 * - `warn` 半配置 / 要注意；
 * - `key` 关键（记忆的"关键"档用它，与 `warn` 分开：一个是要注意，一个是很重要）；
 * - `off` 中性 / 没开启。
 */
export type TagTone = 'ok' | 'warn' | 'key' | 'off'

const TAG_COLORS: Record<TagTone, string> = {
  ok: v('state-success-primary', '#52c41a'),
  warn: v2('state-warning-primary', 'state-warn-primary', '#faad14'),
  key: ACCENT,
  off: TEXT_FAINT,
}

/** 状态标签（样板 `.tag`）。底色由字色按 12% 掺出来，所以四色都跟着主题走。 */
export function tag(h: CreateElement, text: string, tone: TagTone): unknown {
  const color = TAG_COLORS[tone]
  return h('span', {
    'data-tone': tone,
    style: {
      display: 'inline-block',
      padding: '1px 8px',
      borderRadius: '999px',
      border: `1px solid ${color}`,
      background: 'color-mix(in srgb, currentColor 12%, transparent)',
      color,
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

/**
 * 一颗按钮。`kind`: `primary` 填色主动作、`plain` 次动作、`danger` 危险动作。
 *
 * ⚠️ 宿主有一份全局 `button{...}` reset，所以这里显式给 `appearance`/`font`/`border`，
 * 不靠继承——否则同一颗按钮在宿主改版后会自己跑偏。
 */
export function button(
  h: CreateElement,
  label: string,
  onClick: () => void,
  options?: { kind?: 'primary' | 'plain' | 'danger'; disabled?: boolean },
): unknown {
  const style = options?.kind === 'primary' ? btnPrimaryStyle : options?.kind === 'danger' ? btnDangerStyle : btnStyle
  return h('button', {
    type: 'button',
    style,
    disabled: options?.disabled === true,
    onClick,
    children: label,
  })
}

/**
 * 一行（样板 `.item`）：左边一坨文字（`children`），右边一串动作（`trailing`）。
 *
 * `trailing` 单独一个参数而不是塞进 `children`：样板里右侧动作是"靠右"的，
 * 混进正文里就得靠调用方自己写 `margin-left: auto`，那件事迟早会被漏掉。
 */
export function item(h: CreateElement, children: unknown[], trailing?: unknown[]): unknown {
  return h('div', {
    style: itemStyle,
    children: [
      h('div', { style: itemTextStyle, children }),
      ...(trailing === undefined ? [] : trailing),
    ],
  })
}

/** 行里那一行粗标题（`<b>` 在样板里就是这个）。 */
export function itemTitle(h: CreateElement, text: string): unknown {
  return h('b', { style: { fontWeight: '600', fontSize: '13px', lineHeight: '20px' }, children: text })
}

/** 行里那句副标题。 */
export function itemSub(h: CreateElement, text: string): unknown {
  return h('span', { style: itemSubStyle, children: text })
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
