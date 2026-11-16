/**
 * 设置页里的「远程控制」分区（2026-08-09 新增）。
 *
 * ## 为什么要有这一页
 *
 * pairing 的入口原来是那颗 pill，而它挂在 `conversation.composer.dock` 上——宿主那条渲染
 * 条件是 `sessionId !== void 0`（`app.asar` 原文：`variant === "composer" && input !==
 * void 0 && sessionId !== void 0 ? renderSlot("conversation.composer.dock", {}) : null`）。
 * ⇒ **新会话那一屏不渲染这个槽位**，从零开始的人（web profile 尤其明显：打开浏览器、
 * 一个会话都没有）找不到任何出码入口。
 *
 * `settings.section` 是 root 作用域：**不需要会话**，两端（桌面 App 与 web profile）都渲染它
 * （2026-10-09 运行时实拉两端的模块核对过）。所以这一页是配对入口的正门；pill 仍在，
 * 它是"正在会话里、顺手要配对"的那条近路。
 *
 * ## 形状上的三条决定，都有据
 *
 * 1. **内容全部走 `pill.ts` 已经导出的那几个函数**（`panelViewFor` 判成败、`pillLabel`
 *    出抬头那句、`secondsText` 出倒计时）。
 *    ⚠️ 2026-10-11：`relayRow`/`versionRow`/`waitingRow` 随页脚一起删除 —— 它们只服务于那三行。
 *    这里**一行决策逻辑都不重写**：同一件事在两个地方各判一次，迟早会在一个地方改、
 *    另一个地方不改（本仓 F2 那条纪律就是从这类事故里长出来的）。
 * 2. **React 只给一个挂载点**（`<div ref>`），DOM 命令式地建——与 pill 同一套做法，
 *    这样"码过期要换一张""退出配对之后要重画"这种时序都能写成可测的分支。
 * 3. **任何一步抛出都只留一行日志**，绝不把异常抛进宿主：宿主的槽位渲染器遇到抛出的组件
 *    会把这一条**整块清空**（`slot entry crashed in '<slot>'`），那比少一页难查得多。
 *
 * ## 2026-10-09 的重排（用户："排版还是比较乱……大空间放小内容"）
 *
 * 两件事一起修：
 *
 * 1. **那段 CSS 从来就没生效过。** `pill.ts` 的 `.drc-sec*` 整段把 `hostVar(...)`
 *    写成了**字面文本**（少一对美元花括号），浏览器一条声明都不认——卡片没有边框、
 *    没有底色、没有圆角，标题与按钮全无色。结构与类名都对，屏幕上是一列裸文本。
 *    ⇒ 换成插值，并补一条判据（`e2e/design-tokens.test.mjs`）钉死这个形状。
 * 2. **一列改成两栏。** 原来每一块都占满 720px 而内容只有 200px 宽。
 *
 * ## 3.2 的定形（用户截图三条标注之后）
 *
 * **整页只有一张码**——`pairing.png`（小程序码）。设置页收成两栏并排、等高：
 * 左栏「配对」那张卡（码 + 6 位数字 + 没配好时的「允许」），右栏「进阶」。两栏各半。
 * 原来右栏那张「手机端」静态入口码整块删掉（3.2 删了 `/miniprogram.jpg` 与
 * `/pair` 两条路由）：屏幕上只能有一种码，扫了必须真的能配上这台主机。
 */
import {
  createMpCodeImage,
  ensureStyle,
  mpCodeLoadingBox,
  NEW_ROUTE,
  STATUS_ROUTE,
  UNPAIR_ROUTE,
  panelViewFor,
  pairingCount,
  pillLabel,
  secondsText,
  warnSection,
  type CreateElement,
  type PanelView,
  type PillDeps,
} from './pill.js'
import { resolveHostUrl } from './host-url.js'
import { APP_DOWNLOAD_URL, APP_QR_DATA_URL } from '../copy/app-qr.js'

/** 槽位名：root 作用域，设置页左侧导航的一项 + 右侧分区（两端都渲染）。 */
const SETTINGS_SLOT = 'settings.section'
/** 条目 id 必须唯一：宿主按它做 `only: active` 的路由与导航高亮。 */
const SETTINGS_ID = 'dsh-remote-control'
/** 排在宿主自带分区之后。数字本身不重要，重要的是**稳定**：变一次用户就找不到它了。 */
const SETTINGS_ORDER = 30
/**
 * 导航上那一行字。
 *
 * ⚠️ 宿主自己的分区走 `label: () => ctx.locale.bind(ns)('nav')`（见
 * `dsh-client-ui-agent-preset` 的注册原文）。我们这一半是**纯 JS、没有 locale 命名空间**
 * （`ctx.locale.register` 要同时给 zh/en 两份词典，属于另一件事），所以这里先给字面量，
 * 由 `e2e/plugin-settings-section` 钉住"它非空且不是英文键名"。
 */
const SETTINGS_LABEL = '远程控制'

/**
 * 设置页「进阶」那一栏的读写路由（GET 读 / POST 写）。
 *
 * ⚠️ **逐字等于宿主侧 `pill/config-routes.ts` 的 `PLUGIN_CONFIG_ROUTE`**，而这里刻意
 * **不从那个模块 import**：它是 Node 侧的（import 了 `node:http` 与 `hostIsLoopback`），
 * 打进浏览器产物会把整条宿主路由链拖进去。两边一致这件事由
 * `client-bundle.test.ts` 的那条反证判据守着（它把产物里的 `/plugins/*` 字面量全列出来比）。
 */
export const CONFIG_ROUTE = '/plugins/dsh-remote-control/config'
/** 会话备份那条路由（2026-10-28）。同一个前缀、同一道守卫。 */
export const BACKUP_ROUTE = '/plugins/dsh-remote-control/backup'

/**
 * 「一致，允许」那条放行路由（2026-11-16 重新接上）。
 *
 * ⚠️ 逐字等于宿主侧 `src/pill/routes.ts` 的 `PAIR_APPROVE_ROUTE`，而这里**不 import 它**：
 * 那个模块 import 了 `node:http`，打进浏览器产物会把整条宿主路由链拖进去
 * （与 `CONFIG_ROUTE` 那条同一个理由，判据也同一个形状）。
 */
export const APPROVE_ROUTE = '/plugins/dsh-remote-control/pair/approve'

/**
 * 「进阶」那一栏**自带**的一张小样式表。
 *
 * 为什么不并进 `pill.ts` 那张：`pill.ts` 是**只读**的（用户裁决：那颗 pill 只负责
 * 自动注册与展示，不参与配置），而这一栏是 2026-10-11 新加的。两张表各自按
 * `data-plugin-css` 对齐内容，互不覆盖。
 *
 * ⚠️ 两处形态纪律照 `pill.ts` 那张表：**不许出现反引号**（模板会当场截断），
 * 颜色一律走宿主变量（`hostVar`）而不是裸色号。
 */
const ADV_STYLE_ID = 'dsh-remote-control/settings.css'
/** 宿主变量的取值形态：以 `--dsw-alias-*` 为名、带回退值。与 `pill.ts` 的 `hostVar` 同一形状。 */
const hostVar = (name: string, fallback: string): string => `var(--dsw-alias-${name}, ${fallback})`
/**
 * **绝对的白**（照 `pill.ts` 同名常量的口径）。
 *
 * 只给两处：那张二维码的纸、危险按钮确认后的字色。**故意不走主题 token**——
 * 码能不能被扫出来由码点与纸的对比度决定，不跟主题走；而确认态是红底，
 * 红底上的字同理不能用 `label-primary`（暗主题下那是近白，可读性靠巧合）。
 */
const FIXED_WHITE = '#ffffff'

const ADV_CSS = `
/*
 * 表单格：**标签在上、输入在下**（一列）。
 *
 * ⚠️ 2026-11-16 改：原来是 max-content + 1fr 两列（标签在左、输入在右），那是这两个表单
 * 各占**整屏**时的排版。收进「本机设置」之后它们只占**半列**（约 320px），
 * 而「间隔（小时，0 = 只手动）」这一行标签自己就要 180px ⇒ 输入框被挤出卡片右边
 * （无头 Edge 截图实测溢出 30px）。样板本身也是标签在上、输入在下（.field 是 flex 列）。
 * 一列排不会溢出，也不再依赖"标签有多长"。
 *
 * ⚠️ 这段注释在 CSS 模板字符串里：**一个反引号都不许出现**（出现即截断整张表）。
 */
.drc-adv-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px 12px;
  align-items: center; }
.drc-adv-label { margin-top: 6px; font-size: 13px; line-height: 20px; color: ${hostVar('label-secondary', '#6b7280')}; }
.drc-adv-label:first-child { margin-top: 0; }
.drc-adv-input { appearance: none; box-sizing: border-box; width: 100%; min-width: 0; font: inherit;
  font-size: 13px; line-height: 20px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid ${hostVar('border-l2', 'rgba(128,128,128,.35)')};
  background: ${hostVar('bg-layer-3', 'transparent')};
  color: ${hostVar('label-primary', 'inherit')}; }
.drc-adv-input:focus-visible { outline: 2px solid ${hostVar('brand-primary', '#4d6bfe')}; outline-offset: 1px; }
.drc-adv-note { margin: 0; font-size: 12px; line-height: 1.6; color: ${hostVar('label-tertiary', '#8a8f98')}; }
.drc-adv-note[data-kind="failed"] { color: ${hostVar('state-error-primary', '#d92d20')}; }
.drc-adv-note[data-kind="ok"] { color: ${hostVar('label-secondary', '#6b7280')}; }
/* 确认码那一块（2026-10-21）：数字要大到"扫之前先看见"，与倒计时同一档强调色。 */
.drc-sec-sas { margin: 0; font-size: 28px; line-height: 36px; font-weight: 600;
  letter-spacing: 4px; font-variant-numeric: tabular-nums;
  color: ${hostVar('label-primary', 'inherit')}; }
.drc-sec-sasnote { margin: 0 0 8px; font-size: 12px; line-height: 18px;
  color: ${hostVar('label-secondary', '#6b7280')}; }

/* ── 抬头那颗状态（2026-11-16 重排：原来那条独立的「状态条」收成抬头右上角一颗）── */
.drc-sec-pill { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  padding: 2px 10px; border-radius: 999px; font-size: 12px; line-height: 18px;
  border: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')};
  background: ${hostVar('bg-layer-1', '#ffffff')}; }

/* ── ① 状态总览：四格，只读但可点（点了滚到对应区块）──────────────────── */
.drc-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 560px) { .drc-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.drc-stat { appearance: none; font: inherit; text-align: left; display: flex; flex-direction: column;
  gap: 6px; min-width: 0; padding: 10px 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')};
  background: ${hostVar('bg-layer-1', '#ffffff')}; color: inherit; }
.drc-stat:hover { background: ${hostVar('interactive-bg-hover', 'rgba(0,0,0,.04)')}; }
.drc-stat:focus-visible { outline: 2px solid ${hostVar('brand-primary', '#247bbf')}; outline-offset: 1px; }
.drc-stat-k { font-size: 12px; line-height: 16px; color: ${hostVar('label-tertiary', '#9aa0a6')}; }
.drc-stat-v { display: flex; align-items: center; gap: 6px; font-size: 15px; line-height: 20px;
  font-weight: 600; color: ${hostVar('label-primary', 'inherit')}; }
.drc-stat-v[data-tone="on"] { color: ${hostVar('state-success-primary', '#52c41a')}; }
.drc-stat-v[data-tone="wait"] { color: ${hostVar('state-warn-primary', '#faad14')}; }
.drc-stat-v[data-tone="error"] { color: ${hostVar('state-error-primary', '#ff4d4f')}; }

/* ── ② 连接手机：未配对那一屏是「左边一张码、右边码字与引导」──────────── */
.drc-pair { display: grid; grid-template-columns: minmax(0, 256px) minmax(0, 1fr);
  gap: 18px; align-items: start; }
@media (max-width: 620px) { .drc-pair { grid-template-columns: minmax(0, 1fr); } }
/* 左边那一格：占位与图叠在同一列（图没到时占位撑住尺寸，图到了它自己收起） */
.drc-pair-qr { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
.drc-codewrap { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
/* 右列里的这几行改成左对齐：它们已经在码的右边，再居中会跟码抢视线 */
.drc-codewrap .drc-sec-code { align-items: flex-start; }
.drc-codewrap .drc-code { text-align: left; font-size: 26px; line-height: 34px; letter-spacing: 6px; }
.drc-codewrap .drc-count { text-align: left; }
.drc-codewrap .drc-sec-guide { text-align: left; }
/* ③ 手机 App 下载：并进②，一条折叠条（不再是独立一张卡） */
.drc-appline { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 4px;
  padding: 12px 0 0; border: 0; border-top: 1px dashed ${hostVar('border-l1', 'rgba(0,0,0,.1)')};
  background: transparent; color: ${hostVar('label-secondary', '#6b7280')};
  font: inherit; font-size: 13px; line-height: 20px; text-align: left; cursor: pointer; }
.drc-appline:hover { color: ${hostVar('label-primary', 'inherit')}; }
.drc-appline-chev { color: ${hostVar('label-tertiary', '#9aa0a6')}; }
.drc-appline[data-open="1"] .drc-appline-chev { display: inline-block; transform: rotate(90deg); }
.drc-appbox { display: flex; align-items: center; gap: 14px; margin-top: 10px; padding: 12px;
  border-radius: 10px; border: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')};
  background: ${hostVar('bg-layer-1', '#ffffff')}; }
.drc-appbox[data-open="0"] { display: none; }
.drc-appbox-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.drc-appbox-title { font-size: 13px; font-weight: 600; line-height: 20px; }
/* 下载码那张小纸：与配对码同一个理由（绝对白），只是小一号 */
.drc-app-qr { display: block; width: 96px; height: 96px; flex: 0 0 auto; padding: 6px;
  border-radius: 8px; background: ${FIXED_WHITE}; image-rendering: pixelated; }

/* ── ② 已配对 / 审批中 / 失败 三屏 ───────────────────────────────────── */
.drc-paired { display: flex; align-items: center; gap: 14px; }
.drc-avatar { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto;
  border-radius: 12px; font-size: 20px; border: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')};
  background: ${hostVar('bg-layer-1', '#ffffff')}; }
.drc-paired-who { font-size: 14px; font-weight: 600; line-height: 20px; }
.drc-paired-meta { margin-top: 2px; font-size: 12px; line-height: 18px;
  color: ${hostVar('label-secondary', '#6b7280')}; }
.drc-approval { display: flex; flex-direction: column; gap: 8px; }
/* 失败那一屏：左边一条红，把"这不是引导、是故障"摆在眼睛前面 */
.drc-fail { display: flex; flex-direction: column; gap: 6px; padding-left: 12px;
  border-left: 3px solid ${hostVar('state-error-primary', '#ff4d4f')}; }
.drc-fail-why { margin: 0; font-size: 13px; line-height: 20px;
  color: ${hostVar('state-error-primary', '#ff4d4f')}; }
.drc-fail-log { white-space: pre-wrap; word-break: break-word; }

/* ── ④⑤ 两个折叠区（本机设置 / 危险操作）────────────────────────────── */
details.drc-sec-card { display: block; padding: 0; overflow: hidden; }
details.drc-sec-card > summary.drc-fold-summary { display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; cursor: pointer; list-style: none;
  font-size: 13px; font-weight: 600; line-height: 20px;
  color: ${hostVar('label-secondary', '#6b7280')}; }
details.drc-sec-card > summary.drc-fold-summary::-webkit-details-marker { display: none; }
details.drc-sec-card[open] > summary.drc-fold-summary {
  border-bottom: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')}; }
.drc-fold-chev { margin-left: auto; color: ${hostVar('label-tertiary', '#9aa0a6')}; }
details.drc-sec-card[open] > summary.drc-fold-summary .drc-fold-chev { transform: rotate(90deg); }
.drc-fold-body { display: flex; flex-direction: column; gap: 14px; padding: 16px; }
.drc-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
@media (max-width: 620px) { .drc-cols { grid-template-columns: minmax(0, 1fr); } }
.drc-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
/* 折叠区里的说明文字**左对齐**：.drc-sec-note 在共用表里是居中的（那是给"一张卡里只有
   一张图 + 两行字"的版式准备的），搬进半宽的表单列之后居中会读成一块标语。 */
.drc-col .drc-sec-note { text-align: left; }
.drc-col-title { margin: 0; font-size: 12px; line-height: 18px; font-weight: 600;
  color: ${hostVar('label-tertiary', '#9aa0a6')}; }
/* 危险区：标题红字，条目之间一条细线，与常规按钮拉开距离 */
details.drc-sec-card[data-role="danger"] > summary.drc-fold-summary {
  color: ${hostVar('state-error-primary', '#ff4d4f')}; }
.drc-danger-row { display: flex; align-items: center; gap: 12px; padding-top: 12px;
  border-top: 1px solid ${hostVar('border-l1', 'rgba(0,0,0,.1)')}; }
.drc-danger-row:first-child { padding-top: 0; border-top: 0; }
.drc-danger-text { flex: 1 1 auto; min-width: 0; }
.drc-danger-title { display: block; font-size: 13px; font-weight: 600; line-height: 20px; }
.drc-danger-desc { display: block; margin-top: 2px; font-size: 12px; line-height: 18px;
  color: ${hostVar('label-tertiary', '#9aa0a6')}; }
/* 按钮另外两档：danger（红字红边）与 danger 已武装（红底白字）。
   ⚠️ 这两条必须写在 [data-kind="primary"] 那三条**之后**（同特异度、后写的赢）；
   它们住在另一张表里，而这张表注入得更晚 —— 顺序天然成立。 */
.drc-sec-btn:disabled { opacity: .45; cursor: not-allowed; }
.drc-sec-btn[data-kind="danger"] { color: ${hostVar('state-error-primary', '#ff4d4f')};
  border-color: ${hostVar('state-error-primary', '#ff4d4f')}; }
.drc-sec-btn[data-kind="danger"][data-armed="1"] {
  background: ${hostVar('state-error-primary', '#ff4d4f')}; color: ${FIXED_WHITE};
  border-color: ${hostVar('state-error-primary', '#ff4d4f')}; }
`

/** 注入「进阶」那张小样式表（幂等：已插过就按内容对齐；与 `ensureStyle` 同一套做法）。 */
function ensureAdvancedStyle(doc: Document): void {
  try {
    const existing = doc.querySelector(`style[data-plugin-css="${ADV_STYLE_ID}"]`)
    // ⚠️ 还要求属性**逐字对上**：夹具（`FakeDocument.querySelector`）对任何含
    // `data-plugin-css` 的选择器都会返回那份预置的旧表 —— 不校验属性的话，这里会把
    // pill 那张表的内容改写成这一张（真 DOM 上不会，但判据会因此变成碰运气）。
    if (existing && existing.getAttribute('data-plugin-css') === ADV_STYLE_ID) {
      existing.setAttribute('data-plugin', SETTINGS_ID)
      if (existing.textContent !== ADV_CSS) existing.textContent = ADV_CSS
      return
    }
    const element = doc.createElement('style')
    element.setAttribute('data-plugin-css', ADV_STYLE_ID)
    element.setAttribute('data-plugin', SETTINGS_ID)
    element.textContent = ADV_CSS
    doc.head.appendChild(element)
  } catch (error) {
    warnSection('进阶那一栏的样式注入失败（表单仍可用，只是没排版）', error)
  }
}

/** `GET /config` 的回答（宿主侧 `EffectivePluginConfig` 的同形）。**不含 token 真值。** */
interface ConfigAnswer {
  serverUrl?: unknown
  defaultServerUrl?: unknown
  serverUrlSource?: unknown
  hostTokenSet?: unknown
  hostTokenShape?: unknown
  hostTokenSource?: unknown
  userConfigFile?: unknown
}

/** 来源的中文说法。认不出的来源一律照原样印出来（比"未知"更有用于排错）。 */
const SOURCE_TEXT: Record<string, string> = {
  env: '环境变量',
  patch: '配置文件（patch）',
  user: '本页',
  claimed: '机器自动认领',
  default: '官方默认',
  none: '未设置',
}
const sourceText = (value: unknown): string => {
  const key = typeof value === 'string' ? value : ''
  return SOURCE_TEXT[key] ?? (key === '' ? '未知' : key)
}

/** 发码/退出配对这两条写路由的 CSRF 判据（宿主侧 `routes.ts` 同一个头）。 */
const MARKER: Record<string, string> = { 'x-drc-pair': '1' }

interface LooseAnswer {
  [key: string]: unknown
}

/** 直接借用那两个函数的入参类型：它们的形状就是"宿主会回什么"的唯一真源。 */
type NewAnswerShape = Parameters<typeof panelViewFor>[0]
type StatusShape = Parameters<typeof pillLabel>[0]

/**
 * 在 `root` 里建出这一页，返回卸载函数。
 *
 * 版式是**抬头 + 两栏卡片**：左栏是这台主机（配对卡 + 连接读数），右栏是手机端
 * （静态的小程序码 + 「怎么用」那一段文档）。窄屏由 CSS 折成一列。
 * 与 pill 面板同一套类名与配色变量，所以外观随宿主主题走，不会自己长成另一个样子。
 * 详细的形状与"两张码各自是什么"见下面 `paint` 的注释。
 */
export function buildSettingsSection(root: Element, deps: PillDeps): () => void {
  const doc = root.ownerDocument
  // 自己注入样式：没有会话时 pill 不会挂上，没有人替我们插这张表（见 `ensureStyle` 的注释）。
  ensureStyle(doc)
  // 「进阶」那一栏自带的那张小表（与 pill 那张分开，见 `ensureAdvancedStyle` 的注释）。
  ensureAdvancedStyle(doc)
  const box = doc.createElement('div')
  box.className = 'drc-sec'
  root.appendChild(box)

  /**
   * ── 常驻骨架（2026-10-22 立，2026-11-16 重排后仍保留）─────────────────
   *
   * ## 为什么要有它
   * 状态轮询每 2 秒 `paint()` 一次，而 `paint()` 原来做的是
   * `box.replaceChildren(...children)` —— **整棵子树换掉**。
   * 「进阶」那张卡（现在是「本机设置」里的一列）虽然**只建一次**，却被塞进每次重建的
   * `grid` 里 ⇒ **每 2 秒它被摘出 DOM 再插回去** ⇒ 里面那些 `<input>`
   * （中继地址 / 主机口令 / 备份仓库 / PAT / 间隔 / 冷却天数）的**焦点必然丢**
   * ⇒ 用户在填表单时，键盘每 2 秒合一次（真机报："输入框一直被页面刷新，焦点一直丢失"）。
   *
   * ## 拆法：把"每次都变的"与"带输入框的"分成两棵树
   * ```
   * box           ← 常驻，永不换
   *  ├ topHost    ← 常驻容器，**内部**每次重画（抬头 + 状态 pill）
   *  ├ overviewHost ← 常驻容器，**内部**每次重画（① 状态总览四格）
   *  ├ pairHost   ← 常驻容器，**内部**每次重画（② 连接手机 + ③ 下载折叠条）
   *  ├ settingsFold ← **只建一次，永不重画**（④ 本机设置：六个 input 都在这棵树下）
   *  └ dangerFold  ← **只建一次，永不重画**（⑤ 危险操作：二次确认的状态活在节点上）
   * ```
   * ⇒ 只有前三个容器的**内部**被换
   * ⇒ 带 input 的那棵树**一个节点都不动** ⇒ 焦点与已输入的内容都保住。
   *
   * ⚠️ 2026-11-16 的重排把"两栏等高"（`.drc-sec-grid[data-two="1"]`）**去掉了**：
   * 样板是单列自上而下（总览 → 连接 → 折叠区），两栏并排的语义不复存在。
   * 那条 CSS 还留在 `pill.ts` 那张共用表里（那张表本轮不动），但页面上不再产出它。
   */
  const topHost = doc.createElement('div')
  const overviewHost = doc.createElement('div')
  const pairHost = doc.createElement('div')
  box.appendChild(topHost)
  box.appendChild(overviewHost)
  box.appendChild(pairHost)

  let disposed = false
  let statusTimer: ReturnType<typeof setInterval> | undefined
  let countTimer: ReturnType<typeof setInterval> | undefined
  /** 这张码的墙钟到期时刻（`Date.now()` 口径）。倒计时按它重算，不按节拍递减。 */
  let expiresAt = 0
  let status: StatusShape | undefined
  let view: PanelView = { kind: 'loading' }
  let expiresInMs = 0
  /**
   * 倒计时那一行的引用。**存引用而不是 `querySelector` 找回来**：每次重画都是新节点，
   * 查回来的可能已经不在树上了；而假 DOM 夹具（`FakeElement`）也没有 `querySelector`。
   * 与 `pill.ts` 的 `countNode` 同一个理由。
   */
  let countNode: HTMLElement | undefined
  /** 配对簿里还有几次会话（= 配过对）。决定②那一屏给"未配对"还是"已配对"。 */
  let paired = false
  /**
   * 最后一次**看到手机连着**的墙钟时刻（`Date.now()`）。
   *
   * 为什么要在客户端记：`/status` 只给 `paired`（此刻连着几台），**没有**"最近在线"的时间戳，
   * 而②的已配对那一屏要写「最近在线 X 前」。⇒ 用桌面这一侧每次轮询的观测时间当代理，
   * 语义是"这台主机最后一次看到它在线是什么时候"——比编一个假时间诚实。
   * ⚠️ 它活在闭包里，刷新设置页会清零（那时显示"刚刚"），这是已知取舍。
   */
  let lastOnlineAt = 0
  /**
   * 挂着的配对授权（小程序码路线，2026-10-21）：手机扫了码、主机还没放行。
   * 与 pill 同一个字段、同一套断言（"有就显示 6 位"）。
   */
  let lastApproval: { sas: string; remainSec: number } | null = null
  /**
   * ③ 下载折叠条是不是展开着。
   *
   * ⚠️ 状态必须存在**闭包**里、不能只存在 DOM 上：那条折叠条住在②的重画区里，
   * 每 2 秒整块换新 —— 状态若只写在节点上，用户点开 2 秒后自己合上（还顺带丢掉焦点）。
   */
  let appOpen = false
  /**
   * 失败那一屏里「看日志」展开没有。同样活在闭包里（那一屏每 2 秒重画一次）。
   *
   * ⚠️ 这一页**读不到日志**：没有那条路由（`/backup` 只认 save/run/restore，
   * `/status` 只给 relay 与 pairing）。所以这颗按钮给的是"失败现场在哪儿看"，
   * 不是一份真日志 —— 写清楚比假装能给好。
   */
  let failLogShown = false
  /**
   * ②那一屏的**动作结果**（放行失败 / 已拒绝……）。
   *
   * 为什么不是一个 DOM 引用：②整块每 2 秒重画一次，节点存不住。所以存成一行文本，
   * 由 `paint()` 决定这一拍画不画它（与 `countNode` 那条"存引用"的取舍相反，
   * 因为那一行只在本拍有效）。
   */
  let pairNote = ''
  /**
   * ── 「进阶」那一栏（自部署地址 / token，2026-10-11 加）────────────────────
   *
   * 目标形态是「装完就能用」：默认走官方中继、token 自动认领。这一栏留给**自部署与
   * 自定义**的人——它必须留着：默认改成官方之后**自部署用户会连错**
   * （用户裁决：自定义项不是可选项）。
   *
   * ⚠️ 2026-11-16 起它住进「本机设置」折叠区（`settingsFold`），而那个 `<details>`
   * **只建一次**：状态轮询每 2 秒 `paint()` 一次，重建会把用户正在输入的内容抹掉。
   */
  let cfg: ConfigAnswer | undefined
  let advUrlInput: HTMLInputElement | undefined
  let advTokenInput: HTMLInputElement | undefined
  let advHint: HTMLElement | undefined
  let advNote: HTMLElement | undefined
  /** ④ 本机设置那个 `<details>`：**只建一次**，装 6 个 input/4 颗按钮。 */
  let settingsFold: HTMLElement | undefined
  /** ⑤ 危险操作那个 `<details>`：同样只建一次（二次确认的武装态写在按钮属性上）。 */
  let dangerFold: HTMLElement | undefined
  /** ⑤ 里那颗「取消配对」：②那一屏的「取消配对…」把它滚进视野并聚焦。 */
  let dangerCancelBtn: HTMLElement | undefined
  /** ② 这张卡：①的四格要靠它滚过去，所以每次重画都要记下新节点。 */
  let pairCard: HTMLElement | undefined

  /** 危险按钮的二次确认态（照样板：第一次点变「再点一次确认」，4 秒不点自动退回）。 */
  let armedBtn: HTMLElement | undefined
  let armedLabel = ''
  let armedTimer: unknown

  /**
   * 小程序码那张图的加载态（`loading` / `ready` / `failed`）——**与 pill 同一份实现**
   * （见 `pill.ts` 的 `createMpCodeImage`）：同一张图、同一段等待、同一句话，
   * 两处各判一次迟早一处改了另一处没改。
   *
   * 状态一变就重画：图到了要把占位收掉，取不到要把「正在转」换成一句人话。
   * ⚠️ 这个回调是**浏览器**在 `load` / `error` 事件里调的，它可能在我们没在等的时候来
   * ⇒ 重画必须自己站得住（`disposed` 之后不许再动屏）。
   */
  const mpCode = createMpCodeImage(doc, () => {
    if (!disposed) paint()
  })

  const fail = (message: string, error?: unknown): void => {
    warnSection(message, error)
    deps.warn?.(message)
  }

  const text = (tag: string, className: string, content?: string): HTMLElement => {
    const node = doc.createElement(tag)
    node.className = className
    if (content !== undefined) node.textContent = content
    return node
  }

  /** 每条请求的超时信号；老环境拿不到就不带，不让这里抛出去。 */
  const signal = (): AbortSignal | undefined => {
    try {
      const timeouts = (globalThis as { AbortSignal?: { timeout?: (ms: number) => AbortSignal } }).AbortSignal
      return typeof timeouts?.timeout === 'function' ? timeouts.timeout(8000) : undefined
    } catch {
      return undefined
    }
  }

  const call = async (
    input: string,
    init: Record<string, unknown>,
  ): Promise<{ ok: boolean; status: number; body: LooseAnswer }> => {
    try {
      const response = (await deps.fetchImpl(input, { ...init, signal: signal() })) as
        { ok?: boolean; status?: number; json?: () => Promise<unknown> } | undefined
      const statusCode = typeof response?.status === 'number' ? response.status : 0
      let body: LooseAnswer = {}
      try {
        const parsed = await response?.json?.()
        if (parsed && typeof parsed === 'object') body = parsed as LooseAnswer
      } catch {
        /* 没有 body 也是合法回答（204）：交给 panelViewFor 判 */
      }
      return { ok: response?.ok === true, status: statusCode, body }
    } catch (error) {
      fail('请求失败', error)
      return { ok: false, status: 0, body: {} }
    }
  }

  /** 取状态：只读，用于抬头那颗 pill 与①的四格。 */
  const loadStatus = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(`${STATUS_ROUTE}?t=${Date.now()}`, { method: 'GET' })
    if (disposed) return
    if (answer.ok && answer.body && typeof answer.body === 'object') {
      status = answer.body as StatusShape
      paired = pairingCount(status) > 0
      /**
       * 「最近在线 X 前」的观测点：这一拍看到手机连着，就把"最后一次看到"刷成现在。
       * （理由见 `lastOnlineAt` 的说明：`/status` 没有这个时间戳，只能由这一侧观测。）
       */
      const connectedNow = typeof status?.paired === 'number' ? status.paired : 0
      if (connectedNow > 0) lastOnlineAt = Date.now()
      /**
       * 那 6 位确认码（2026-10-21）：**两个来源，谁先有值用谁**。
       *  · `pairApproval` —— **还挂着**的申请（还没放行）。
       *  · `lastPairApproval` —— **最近放行**的那一次（主机改自动放行之后，
       *    放行是"取走即焚"，前者立刻变 null；但那 6 位数字还要留给用户对照一会儿：
       *    手机上弹窗一串、主机屏幕上一串，两处一致才说明中间没人换公钥）。
       *
       * 形状判据与 pill 那条一致——只认 `sas` 是字符串，别的（缺字段 / null）一律当"没有"。
       */
      const readApproval = (raw: unknown): { sas: string; remainSec: number } | null =>
        raw && typeof raw === 'object' && typeof (raw as { sas?: unknown }).sas === 'string'
          ? {
              sas: (raw as { sas: string }).sas,
              remainSec:
                typeof (raw as { remainSec?: unknown }).remainSec === 'number'
                  ? (raw as { remainSec: number }).remainSec
                  : 0,
            }
          : null
      const body = answer.body as {
        pairApproval?: { sas?: unknown; remainSec?: unknown } | null
        lastPairApproval?: { sas?: unknown; remainSec?: unknown } | null
      }
      lastApproval = readApproval(body.pairApproval) ?? readApproval(body.lastPairApproval)
      paint()
    }
  }
  const mint = async (): Promise<void> => {
    if (disposed) return
    view = { kind: 'loading' }
    /**
     * 重发码之前把**上一张失败的那张**丢掉（成功的那张留着）。
     * 与 pill 同一条理由：发码是幂等的，重试拿回的是同一个 src，
     * 而那个 src 刚才失败过 ⇒ 不丢掉就只是把同一张失败的图再摆一次。
     */
    mpCode.invalidate()
    paint()
    const answer = await call(NEW_ROUTE, { method: 'POST', headers: MARKER })
    if (disposed) return
    view = panelViewFor(answer.body as NewAnswerShape, answer.status)
    expiresInMs = view.kind === 'qr' ? view.expiresInMs : 0
    // 墙钟口径（2026-10-23）：原来倒计时是"每拍减 1000"，后台冻结一拍就漂
    //（pill 的 `syncCountdown` 注释钉过同款缺陷）——显示"还有 2 分钟"而码其实已过期，
    // 用户照着扫就是扫一张不作数的图。
    expiresAt = Date.now() + expiresInMs
    paint()
    startCountdown()
  }

  /** 退出配对：作废全部配对通道，然后回到"未配对 + 一张新码"。 */
  const unpair = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(UNPAIR_ROUTE, { method: 'POST', headers: MARKER })
    if (disposed) return
    if (!answer.ok) {
      view = { kind: 'failed', detail: `HTTP ${answer.status}` }
      paint()
      return
    }
    paired = false
    await loadStatus()
    if (!disposed) await mint()
  }

  /**
   * 「一致，允许」：把这条申请的密钥放出去（`POST /pair/approve`，带同一个守卫头）。
   *
   * ⚠️ 2026-10-21 的用户裁决是"主机端不要放行按钮"（理由：主机那一次点击不增加任何安全性，
   * 真正的比对必须在持有手机的那一端）。**2026-11-16 的样板把这一颗加回来了**，
   * 这是样板明确要求的（审批中态的两颗按钮），本轮照办。
   * 它在语义上仍是"我已经在手机上比对过、两处一致"的确认 —— 不是主机替用户决定。
   */
  const approvePair = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(APPROVE_ROUTE, { method: 'POST', headers: MARKER })
    if (disposed) return
    if (!answer.ok) {
      /**
       * 409 / `state:"stale"` = 这条申请已经作废（超时 / 已放行过）——
       * 那不是故障，要说成"没人在等了"，而不是一个红色 HTTP 码。
       */
      pairNote =
        answer.status === 409 || answer.body.state === 'stale'
          ? '这条申请已经作废了（可能超时，或已经在手机上放行过）。'
          : `放行失败：HTTP ${answer.status}`
      paint()
      return
    }
    pairNote = ''
    lastApproval = null
    await loadStatus()
  }

  /**
   * 「不一致，拒绝」：宿主**没有** deny 那条路由（`pill/routes.ts` 只有
   * new / png / status / unpair / pair/approve），而"拒绝一次配对"在主机这一侧
   * 的动作就是**作废这次的配对通道** —— 所以它走 `/unpair`，然后回到未配对 + 一张新码。
   */
  const rejectPair = async (): Promise<void> => {
    if (disposed) return
    pairNote = '已拒绝这次配对，手机需要重新扫码。'
    await unpair()
    if (!disposed) paint()
  }

  const startCountdown = (): void => {
    if (countTimer !== undefined) clearInterval(countTimer)
    if (view.kind !== 'qr' || expiresInMs <= 0) {
      countTimer = undefined
      return
    }
    countTimer = setInterval(() => {
      // 墙钟重算（同 pill 的 `syncCountdown`）：单拍走飞（后台冻结）也自愈——
      // 下一拍按墙钟一次补回全部欠账，绝不出现"屏上还有时间、码已经死了"。
      expiresInMs = Math.max(0, expiresAt - Date.now())
      if (expiresInMs <= 0) {
        expiresInMs = 0
        // **先停表再补码**：不自清的话下一拍又会 `<= 0` 又 `mint()`（每秒一发）。
        // `mint()` 落地后 `startCountdown()` 自己会另起一拍。
        if (countTimer !== undefined) {
          clearInterval(countTimer)
          countTimer = undefined
        }
        // 过期就自己换一张：留在废码上比没有码更糟（用户会一直扫一张不作数的图）。
        void mint()
        return
      }
      if (countNode) {
        countNode.textContent = `${secondsText(expiresInMs)}后过期`
        if (expiresInMs <= 30_000) countNode.setAttribute('data-kind', 'urgent')
      }
    }, 1000)
  }

  /**
   * 一张卡片：标题 + 任意内容。所有卡的边框/底色/圆角/内边距全走同一套类。
   *
   * 2026-11-16 重排：**`trailing` 那个参数删了**。样板里没有任何一张卡把动作放在标题行
   * 右端 —— ②的主操作（重新配对 / 一致允许 / 重试）都在状态块**下面一行**，①③④⑤根本没有
   * 标题行动作。留着那条分支就是留一段"能画但没人调"的代码（上一轮判据正是被这类死结构
   * 绊住的）。`drc-sec-headrow` 那条 CSS 仍在共用表里（本轮不动 `pill.ts`），页面上不产出。
   */
  const card = (heading: string): HTMLElement => {
    const node = doc.createElement('section')
    node.className = 'drc-sec-card'
    node.appendChild(text('h3', 'drc-sec-heading', heading))
    return node
  }

  /**
   * 按钮：`kind: 'primary'` 是填色的主动作，`'danger'` 是危险区那一档（红字红边，
   * 武装后红底白字 —— 见 ADV_CSS），不给就是次级。
   */
  const button = (label: string, onClick: () => void, kind?: 'primary' | 'danger'): HTMLElement => {
    const node = doc.createElement('button')
    node.type = 'button'
    node.className = 'drc-sec-btn'
    if (kind) node.setAttribute('data-kind', kind)
    node.textContent = label
    node.addEventListener('click', onClick)
    return node
  }

  /** 一排动作（`.drc-sec-actions` 那条 flex 行）。 */
  const actionRow = (...nodes: HTMLElement[]): HTMLElement => {
    const row = doc.createElement('div')
    row.className = 'drc-sec-actions'
    for (const node of nodes) row.appendChild(node)
    return row
  }

  /**
   * 滚到某一区块（①的四格用它）。
   *
   * 两处都包了 try：假 DOM（判据用的那个）没有 `scrollIntoView`，而 `<details>` 的
   * `open` 属性在那边只是个普通属性；真浏览器里这两下都是"点一下就过去的"。
   */
  const reveal = (node: HTMLElement | undefined, openFold = false): void => {
    if (!node) return
    try {
      if (openFold) (node as HTMLDetailsElement).open = true
      const scroller = node as { scrollIntoView?: (options?: unknown) => void }
      scroller.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    } catch {
      /* 滚不过去不影响正确性：用户自己滚 */
    }
  }

  /** ②「取消配对…」：滚到危险区并把它展开 —— 真正的取消要过那里那道二次确认。 */
  const focusDanger = (): void => {
    reveal(dangerFold, true)
    try {
      dangerCancelBtn?.focus()
    } catch {
      /* 假 DOM 里 focus 是个空实现；真浏览器里是"光标落到那颗按钮上" */
    }
  }

  /**
   * 「最近在线」那句的人话：刚看过就"刚刚"，一分钟以上报分钟，再往上报小时/天。
   *
   * 不报秒：这一行是扫一眼的（与 `secondsText` 那条"十分钟以上不再报秒"同一取舍）。
   */
  const agoText = (ms: number): string => {
    const sec = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0
    if (sec < 60) return '刚刚'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} 分钟前`
    const hour = Math.floor(min / 60)
    if (hour < 24) return `${hour} 小时前`
    return `${Math.floor(hour / 24)} 天前`
  }

  // ── ⑤ 危险操作的二次确认（照样板：第一次点武装，4 秒不点自动退回）──────

  /** 定时器口子：老环境 / 判据夹具可能没有 setTimeout，拿不到就不武装超时。 */
  const timers = globalThis as {
    setTimeout?: (fn: () => void, ms: number) => unknown
    clearTimeout?: (id: unknown) => void
  }

  const disarmDanger = (): void => {
    const node = armedBtn
    armedBtn = undefined
    if (armedTimer !== undefined) {
      try {
        timers.clearTimeout?.(armedTimer)
      } catch {
        /* 没有 clearTimeout 就让它空跑一次，回调里会自己判 */ 
      }
      armedTimer = undefined
    }
    if (!node) return
    node.setAttribute('data-armed', '0')
    node.textContent = armedLabel
    ;(node as HTMLButtonElement).disabled = false
  }

  /**
   * 危险按钮：**第一次点不执行**，只把按钮换成「再点一次确认」；再点才真干。
   *
   * 为什么不用 `window.confirm`：`confirm` 在部分宿主壳里被策略拦掉（返回 undefined），
   * 那时"确认"这一步会静默消失 —— 而这两颗按钮一颗会踢掉手机、一颗会删本地备份。
   * 写成"两次点击 + 4 秒自动退回"就与宿主有没有 dialog 无关了。
   */
  const armDanger = (node: HTMLElement, label: string, run: () => void): void => {
    if (armedBtn === node) {
      disarmDanger()
      node.setAttribute('data-armed', 'done')
      node.textContent = '已确认'
      ;(node as HTMLButtonElement).disabled = true
      run()
      return
    }
    disarmDanger()
    armedBtn = node
    armedLabel = label
    node.setAttribute('data-armed', '1')
    node.textContent = '再点一次确认'
    armedTimer = timers.setTimeout?.(() => {
      // 4 秒内没再点 ⇒ 退回原样（`data-armed` 回 0 就是"没武装"）。
      if (armedBtn === node) disarmDanger()
    }, 4000)
  }

  /** 危险按钮的工厂：把"武装 → 再点一次 → 执行"这一套收在一处，两颗按钮不各写一遍。 */
  const dangerButton = (label: string, run: () => void): HTMLElement => {
    const node = doc.createElement('button')
    node.type = 'button'
    node.className = 'drc-sec-btn'
    node.setAttribute('data-kind', 'danger')
    node.textContent = label
    node.addEventListener('click', () => armDanger(node, label, run))
    return node
  }

  // ── 进阶那一栏（自部署地址 / token）──────────────────────────────────

  /** 状态行：最近一次动作的结果（保存失败那句话就是唯一的现场）。 */
  const setNote = (message: string, kind?: 'ok' | 'failed'): void => {
    if (!advNote) return
    advNote.textContent = message
    /**
     * ⚠️ 不用 `removeAttribute`：本仓的假 DOM 夹具（`client-bundle.test.ts` 的 FakeElement）
     * 没有那个方法，写了会在判据里抛错。空串属性足以表达"没有 kind"——
     * CSS 里那两条选择器都带具体取值（`[data-kind="failed"]`）。
     */
    advNote.setAttribute('data-kind', kind ?? '')
  }

  /** 把 `GET /config` 的回答铺到表单上（**不重建那张卡**，否则输入内容会被抹掉）。 */
  const showConfig = (answer: ConfigAnswer): void => {
    cfg = answer
    if (advUrlInput) advUrlInput.value = typeof answer.serverUrl === 'string' ? answer.serverUrl : ''
    if (advTokenInput) {
      advTokenInput.value = ''
      advTokenInput.setAttribute(
        'placeholder',
        answer.hostTokenSet === true ? '已设置，留空不改动' : '未设置（官方中继会自动认领）',
      )
    }
    if (advHint) {
      const locked = answer.serverUrlSource === 'env' || answer.serverUrlSource === 'patch'
      const shape =
        typeof answer.hostTokenShape === 'string' && answer.hostTokenShape !== '' ? `（${answer.hostTokenShape}）` : ''
      advHint.textContent =
        `中继地址：${sourceText(answer.serverUrlSource)}　口令：${sourceText(answer.hostTokenSource)}${shape}` +
        (locked ? '。当前地址由 patch / 环境变量决定，在这一页保存会被它们盖住' : '')
    }
  }

  /** 读一次当前配置。读不到**不重画整页**：那一栏就地说明白，配对那条路一个字不受影响。 */
  const loadConfig = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(CONFIG_ROUTE, { method: 'GET' })
    if (disposed) return
    if (answer.ok && answer.body && typeof answer.body.serverUrl === 'string') {
      showConfig(answer.body as ConfigAnswer)
      return
    }
    // 老版宿主没有这一条路由（404）：这一栏就是"用不了"，说清楚而不是留一个空表单。
    setNote(`读不到当前配置（HTTP ${answer.status}）——这一版宿主没有 /config 路由`, 'failed')
  }

  /**
   * 保存。**只提交改动过的那一项**：口令输入框默认是空的（占位符说明"已设置"），
   * 无条件提交就等于每保存一次都把口令清空一次 —— 那是最容易犯、后果最重的一种。
   */
  const submitAdvanced = async (): Promise<void> => {
    if (disposed) return
    const url = advUrlInput?.value.trim() ?? ''
    const token = advTokenInput?.value.trim() ?? ''
    const payload: Record<string, string> = {}
    /**
     * 与当前生效值不同 ⇒ 提交；**空串是有意义的值**（= 删掉这一项、回落到下一层）。
     *
     * ⚠️ 但**还没读到当前值**（`cfg` 未定义：GET 还在路上、或它失败了）时，
     * 空串**不算**一次改动 —— 那时输入框本来就是空的，把它当成"用户清空了地址"
     * 会把盘上写过的自部署地址**静默删掉**（用户只是填了个口令就点了保存）。
     * 这种"读不到"的场合只提交非空值：那是用户真的填进去的。
     */
    if (cfg) {
      if (url !== (typeof cfg.serverUrl === 'string' ? cfg.serverUrl : '')) payload.serverUrl = url
    } else if (url !== '') {
      payload.serverUrl = url
    }
    if (token !== '') payload.hostToken = token
    if (Object.keys(payload).length === 0) {
      setNote('没有改动', undefined)
      return
    }
    const answer = await call(CONFIG_ROUTE, {
      method: 'POST',
      headers: { ...MARKER, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (disposed) return
    if (!answer.ok) {
      const detail = String(answer.body.detail ?? answer.body.error ?? `HTTP ${answer.status}`)
      setNote(`保存失败：${detail}`, 'failed')
      return
    }
    if (answer.body.config && typeof answer.body.config === 'object') showConfig(answer.body.config as ConfigAnswer)
    setNote('已保存。中继地址与口令在**下次启动**时生效（重启 Harness）。', 'ok')
  }

  /** 只清口令（地址不动）。走"空串 = 删掉这一项"那条语义，宿主侧不用另开一条接口。 */
  const clearTokenAdvanced = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(CONFIG_ROUTE, {
      method: 'POST',
      headers: { ...MARKER, 'content-type': 'application/json' },
      body: JSON.stringify({ hostToken: '' }),
    })
    if (disposed) return
    if (!answer.ok) {
      setNote(`清除失败：HTTP ${answer.status}`, 'failed')
      return
    }
    if (advTokenInput) advTokenInput.value = ''
    if (answer.body.config && typeof answer.body.config === 'object') showConfig(answer.body.config as ConfigAnswer)
    setNote('已清除自定义口令。重启 Harness 后这台主机会回到环境变量 / 配置文件 / 自动认领那一枚。', 'ok')
  }

  /** 恢复默认：把这一页写的两项都删掉（自部署用户改回官方中继、或清掉自己填的口令）。 */
  const resetAdvanced = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(CONFIG_ROUTE, {
      method: 'POST',
      headers: { ...MARKER, 'content-type': 'application/json' },
      body: JSON.stringify({ serverUrl: '', hostToken: '' }),
    })
    if (disposed) return
    if (!answer.ok) {
      setNote(`恢复失败：HTTP ${answer.status}`, 'failed')
      return
    }
    if (answer.body.config && typeof answer.body.config === 'object') showConfig(answer.body.config as ConfigAnswer)
    setNote('已恢复默认（这一页写的自定义项都删掉了）。重启 Harness 后生效。', 'ok')
  }

  /**
   * ④「本机设置」的**左列**：中继地址 / 主机口令 / 保存。
   *
   * **只建一次**（由 `buildSettingsFold()` 调，那个 `<details>` 永不重画）：
   * `paint()` 每 2 秒被状态轮询调一次，重建会把用户正在输入的内容抹掉、把焦点丢掉。
   *
   * 2026-11-16 重排前它是独立一张卡（标题「进阶：自部署 / 自定义」），现在并进折叠区，
   * 标题降成列标题 —— 折叠区标题统一叫「本机设置」，因为这一块是"这台机器的配置"，
   * 「进阶」两个字吓走过人（用户原话：「我该不该动它」）。
   */
  const buildAdvancedColumn = (): HTMLElement => {
    const section = doc.createElement('div')
    section.className = 'drc-col'
    section.setAttribute('data-role', 'advanced')
    section.appendChild(text('h4', 'drc-col-title', '中继'))
    section.appendChild(
      text(
        'p',
        'drc-sec-note',
        '默认走官方中继，口令由主机自动认领，什么都不用填。自己搭了中继、或想用另一枚口令，才需要改这里。',
      ),
    )
    const grid = doc.createElement('div')
    grid.className = 'drc-adv-grid'

    const urlId = `${SETTINGS_ID}-server-url`
    const urlLabel = text('label', 'drc-adv-label', '中继地址')
    urlLabel.setAttribute('for', urlId)
    const urlInput = doc.createElement('input')
    urlInput.id = urlId
    urlInput.className = 'drc-adv-input'
    urlInput.setAttribute('type', 'text')
    urlInput.setAttribute('spellcheck', 'false')
    urlInput.setAttribute('autocomplete', 'off')
    urlInput.setAttribute('placeholder', 'wss://drc.provid.cc/v05')
    advUrlInput = urlInput

    const tokenId = `${SETTINGS_ID}-host-token`
    const tokenLabel = text('label', 'drc-adv-label', '主机口令')
    tokenLabel.setAttribute('for', tokenId)
    const tokenInput = doc.createElement('input')
    tokenInput.id = tokenId
    tokenInput.className = 'drc-adv-input'
    // `password`：口令是凭据，屏幕上不许明文摆着（截图、投屏、旁边的人）。
    tokenInput.setAttribute('type', 'password')
    tokenInput.setAttribute('autocomplete', 'off')
    tokenInput.setAttribute('placeholder', '未设置（官方中继会自动认领）')
    advTokenInput = tokenInput

    for (const node of [urlLabel, urlInput, tokenLabel, tokenInput]) grid.appendChild(node)
    section.appendChild(grid)

    section.appendChild(
      actionRow(
        button('保存', () => void submitAdvanced(), 'primary'),
        button('清除口令', () => void clearTokenAdvanced()),
        button('恢复默认', () => void resetAdvanced()),
      ),
    )

    advHint = text('p', 'drc-adv-note', '正在读取当前配置…')
    section.appendChild(advHint)
    advNote = text('p', 'drc-adv-note', '')
    advNote.setAttribute('data-kind', '')
    section.appendChild(advNote)
    return section
  }

  /**
   * ── ③「没有 App？下载安卓版」那条折叠条（2026-11-16 并进②）─────────────
   *
   * 重排前它是一张独立卡（「手机 App（安卓）」），和配对卡各说一遍"扫码"——
   * 两块讲同一件事（设计说明 §2 第 2 条）。现在收成②下面的一条折叠条：
   * 默认收起，展开才是那张下载码 + 复制链接。
   *
   * 二维码是**预生成的 data URL**（`copy/app-qr.ts`），不走主机路由：
   * 它指向的是一个永久链接，内容不会变，于是这一页离线也能显示、也不占一条路由。
   *
   * ⚠️ 链接文字**始终在展开区里**：剪贴板在部分环境下会被拒（非安全上下文、
   * 权限策略），那时用户还能长按那一行自己复制——不给"复制按钮是唯一出路"。
   *
   * ⚠️ 展开与否存在闭包的 `appOpen` 里，因为这条折叠条住在**每 2 秒重画一次**的②里
   * （理由见 `appOpen` 的说明）。
   */
  const buildAppDownload = (): HTMLElement => {
    const wrap = doc.createElement('div')
    wrap.setAttribute('data-role', 'app-download')
    const line = doc.createElement('button')
    line.type = 'button'
    line.className = 'drc-appline'
    line.setAttribute('data-open', appOpen ? '1' : '0')
    line.appendChild(text('span', 'drc-appline-chev', '▸'))
    line.appendChild(text('span', '', '没有 App？下载安卓版'))
    line.addEventListener('click', () => {
      appOpen = !appOpen
      paint()
    })
    wrap.appendChild(line)

    const box = doc.createElement('div')
    box.className = 'drc-appbox'
    box.setAttribute('data-open', appOpen ? '1' : '0')
    const image = doc.createElement('img')
    // ⚠️ 类名是 `drc-app-qr` 而**不是** `drc-qr`：后者在共用表里被钉成 240px 的配对码
    // （那张纸的尺寸与"扫得出来"有关）。下载码是另一件事，小一号。
    image.className = 'drc-app-qr'
    image.setAttribute('alt', '手机 App 下载二维码')
    image.setAttribute('src', APP_QR_DATA_URL)
    box.appendChild(image)

    const body = doc.createElement('div')
    body.className = 'drc-appbox-text'
    body.appendChild(text('span', 'drc-appbox-title', '大肥鱼远控 · 安卓'))
    body.appendChild(text('span', 'drc-sec-note', '扫码下载最新版（约 8 MB）。装好打开，和这台主机配对后就能发指令。'))
    const copyBtn = button('复制下载链接', () => copyDownloadUrl(copyBtn))
    body.appendChild(actionRow(copyBtn))
    const urlLine = text('p', 'drc-sec-note', APP_DOWNLOAD_URL)
    urlLine.setAttribute('data-role', 'app-download-url')
    body.appendChild(urlLine)
    box.appendChild(body)
    wrap.appendChild(box)
    return wrap
  }

  /** 复制下载链接：成功闪一下文案，失败就直说"长按那一行"。 */
  const copyDownloadUrl = (btn: HTMLElement): void => {
    const flash = (label: string): void => {
      const before = btn.textContent ?? ''
      btn.textContent = label
      if (typeof timers.setTimeout !== 'function') return
      timers.setTimeout(() => {
        btn.textContent = before
      }, 1500)
    }
    const clipboard = (
      globalThis as { navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } } }
    ).navigator?.clipboard
    if (typeof clipboard?.writeText !== 'function') {
      flash('复制失败，长按下面那行')
      return
    }
    clipboard.writeText(APP_DOWNLOAD_URL).then(
      () => flash('已复制'),
      () => flash('复制失败，长按下面那行'),
    )
  }

  /**
   * ── 「会话备份（git）」那张卡（2026-10-28 追加）────────────────────────
   *
   * 与远控**同一个插件**，但它是**旁路**：默认关闭、坏了也只影响卡片上的那一行红字。
   *
   * 三个动作都是"起个头就回来"（宿主那边回 202，真正的进度靠轮询 `GET` 的 `status`），
   * 因为一次备份要传几十 MB，浏览器那侧的超时是 8 秒——在这一页等它等于必然超时。
   *
   * ⚠️ token 输入框默认空着、占位符写"已设置"：与「进阶」那栏同一条纪律，
   * 无条件提交空串就等于每保存一次把凭据清空一次。
   */
  let bkNote: HTMLElement | undefined
  let bkStatusLine: HTMLElement | undefined
  let bkUrlInput: HTMLInputElement | undefined
  let bkTokenInput: HTMLInputElement | undefined
  let bkIntervalInput: HTMLInputElement | undefined
  let bkIdleInput: HTMLInputElement | undefined
  let bkToggleBtn: HTMLElement | undefined
  let bkEnabled = false

  const bkSetNote = (message: string, kind?: 'ok' | 'failed'): void => {
    if (!bkNote) return
    bkNote.textContent = message
    bkNote.setAttribute('data-kind', kind ?? '')
  }

  const numOf = (raw: unknown, fallback: number): number => (typeof raw === 'number' ? raw : fallback)
  const strOf = (raw: unknown, fallback = ''): string => (typeof raw === 'string' ? raw : fallback)

  /** 状态那一行：把宿主那份 status 的要点压成几句人话。 */
  const paintBackupStatus = (body: Record<string, unknown>): void => {
    const status = body.status && typeof body.status === 'object' ? (body.status as Record<string, unknown>) : {}
    const config = body.config && typeof body.config === 'object' ? (body.config as Record<string, unknown>) : {}
    bkEnabled = config.enabled === true
    if (bkToggleBtn) bkToggleBtn.textContent = bkEnabled ? '停用备份' : '启用备份'
    if (bkUrlInput && doc.activeElement !== bkUrlInput) bkUrlInput.value = strOf(config.repoUrl)
    if (bkIntervalInput && doc.activeElement !== bkIntervalInput) {
      bkIntervalInput.value = String(numOf(config.intervalHours, 8))
    }
    if (bkIdleInput && doc.activeElement !== bkIdleInput) {
      bkIdleInput.value = String(numOf(config.idleDays, 15))
    }
    if (bkTokenInput && doc.activeElement !== bkTokenInput) {
      bkTokenInput.value = ''
      bkTokenInput.setAttribute('placeholder', status.tokenSet === true ? '已设置，留空不改动' : '未设置：填你的 PAT')
    }
    if (!bkStatusLine) return
    const parts: string[] = []
    if (status.gitAvailable !== true) parts.push('本机没装 git：先装 Git for Windows')
    parts.push(bkEnabled ? '已启用' : '未启用')
    const interval = numOf(config.intervalHours, 8)
    parts.push(interval > 0 ? `每 ${interval} 小时` : '只手动')
    parts.push(`冷却 ${numOf(config.idleDays, 15)} 天归档`)
    if (status.running === true) {
      parts.push('正在跑…')
    } else if (typeof status.lastRunAt === 'string' && status.lastRunAt !== '') {
      const when = status.lastRunAt.replace('T', ' ').replace(/\..*$/, '')
      const result = status.lastResult === 'ok' ? '成功' : status.lastResult === 'skipped' ? '跳过' : '失败'
      parts.push(`上次 ${when} ${result}`)
      if (result === '成功') {
        const mb = (numOf(status.lastHotBytes, 0) / (1024 * 1024)).toFixed(1)
        parts.push(`${numOf(status.lastHotCount, 0)} 个会话 / ${mb} MB`)
        if (numOf(status.lastArchivedCount, 0) > 0) parts.push(`归档 ${numOf(status.lastArchivedCount, 0)} 个`)
      } else if (typeof status.lastError === 'string' && status.lastError !== '') {
        parts.push(status.lastError.slice(0, 120))
      }
    } else {
      parts.push('还没跑过')
    }
    const restore = status.restore && typeof status.restore === 'object' ? (status.restore as Record<string, unknown>) : {}
    if (typeof restore.lastMessage === 'string' && restore.lastMessage !== '') {
      parts.push(`恢复：${restore.lastMessage.slice(0, 120)}`)
    }
    bkStatusLine.textContent = parts.join('　')
  }

  const loadBackup = async (): Promise<void> => {
    if (disposed) return
    const answer = await call(BACKUP_ROUTE, { method: 'GET' })
    if (disposed) return
    if (!answer.ok) {
      if (bkStatusLine) bkStatusLine.textContent = `读不到备份状态（HTTP ${answer.status}）`
      return
    }
    paintBackupStatus(answer.body as Record<string, unknown>)
  }

  /** 提交配置；`token` 不在 payload 里表示"不动它"。 */
  const postBackup = async (payload: Record<string, unknown>, okText: string): Promise<void> => {
    if (disposed) return
    const answer = await call(BACKUP_ROUTE, {
      method: 'POST',
      headers: { ...MARKER, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (disposed) return
    if (!answer.ok) {
      const detail = String(answer.body.detail ?? answer.body.error ?? `HTTP ${answer.status}`)
      bkSetNote(`失败：${detail}`, 'failed')
      return
    }
    bkSetNote(okText, 'ok')
    await loadBackup()
  }

  const saveBackup = async (): Promise<void> => {
    const config: Record<string, unknown> = {
      repoUrl: bkUrlInput?.value.trim() ?? '',
      intervalHours: Number(bkIntervalInput?.value.trim() ?? '8'),
      idleDays: Number(bkIdleInput?.value.trim() ?? '15'),
      enabled: bkEnabled,
    }
    const token = bkTokenInput?.value.trim() ?? ''
    const payload: Record<string, unknown> = { action: 'save', config }
    if (token !== '') payload.token = token
    await postBackup(payload, '已保存。改了节奏立刻生效，不用重启。')
  }

  /**
   * ④「本机设置」的**右列**：会话备份（git，2026-10-28 加，2026-11-16 并进折叠区）。
   *
   * 与远控**同一个插件**，但它是**旁路**：默认关闭、坏了也只影响卡片上的那一行红字。
   *
   * 三个动作都是"起个头就回来"（宿主那边回 202，真正的进度靠轮询 `GET` 的 `status`），
   * 因为一次备份要传几十 MB，浏览器那侧的超时是 8 秒——在这一页等它等于必然超时。
   *
   * ⚠️ token 输入框默认空着、占位符写"已设置"：与左列同一条纪律，
   * 无条件提交空串就等于每保存一次把凭据清空一次。
   */
  const buildBackupColumn = (): HTMLElement => {
    const section = doc.createElement('div')
    section.className = 'drc-col'
    section.setAttribute('data-role', 'backup')
    section.appendChild(text('h4', 'drc-col-title', '会话备份（git）'))
    section.appendChild(
      text(
        'p',
        'drc-sec-note',
        '把本机的会话记录定时传到你的私有仓库：活跃的每 8 小时一份（只留最新），15 天没聊的转存到归档分支。换电脑后在这里一键拉回来。',
      ),
    )

    const grid = doc.createElement('div')
    grid.className = 'drc-adv-grid'

    const urlLabel = text('label', 'drc-adv-label', '仓库地址')
    const urlInput = doc.createElement('input')
    urlInput.className = 'drc-adv-input'
    urlInput.setAttribute('type', 'text')
    urlInput.setAttribute('spellcheck', 'false')
    urlInput.setAttribute('autocomplete', 'off')
    urlInput.setAttribute('placeholder', 'https://github.com/你的账号/dsh-backup-主机名.git')
    bkUrlInput = urlInput

    const tokenLabel = text('label', 'drc-adv-label', '访问令牌（PAT）')
    const tokenInput = doc.createElement('input')
    tokenInput.className = 'drc-adv-input'
    tokenInput.setAttribute('type', 'password')
    tokenInput.setAttribute('autocomplete', 'off')
    tokenInput.setAttribute('placeholder', '未设置：填你的 PAT')
    bkTokenInput = tokenInput

    const intervalLabel = text('label', 'drc-adv-label', '间隔（小时，0 = 只手动）')
    const intervalInput = doc.createElement('input')
    intervalInput.className = 'drc-adv-input'
    intervalInput.setAttribute('type', 'number')
    intervalInput.setAttribute('min', '0')
    intervalInput.setAttribute('max', '168')
    intervalInput.setAttribute('value', '8')
    bkIntervalInput = intervalInput

    const idleLabel = text('label', 'drc-adv-label', '冷却天数（多久没聊转归档）')
    const idleInput = doc.createElement('input')
    idleInput.className = 'drc-adv-input'
    idleInput.setAttribute('type', 'number')
    idleInput.setAttribute('min', '1')
    idleInput.setAttribute('max', '3650')
    idleInput.setAttribute('value', '15')
    bkIdleInput = idleInput

    for (const node of [urlLabel, urlInput, tokenLabel, tokenInput, intervalLabel, intervalInput, idleLabel, idleInput]) {
      grid.appendChild(node)
    }
    section.appendChild(grid)

    const toggle = button('启用备份', () => {
      bkEnabled = !bkEnabled
      void saveBackup()
    }, 'primary')
    bkToggleBtn = toggle
    section.appendChild(
      actionRow(
        button('保存', () => void saveBackup(), 'primary'),
        toggle,
        button('立即推送', () => {
          bkSetNote('已开始，跑完这一行会自己更新（几分钟）', 'ok')
          void postBackup({ action: 'run' }, '已开始推送…')
        }),
        button('从备份恢复', () => {
          // 恢复会覆盖本机 `~/.dsh/sessions`（旧的改名留底），所以问一次。
          const view = doc.defaultView as { confirm?: (message: string) => boolean } | null
          const sure = typeof view?.confirm === 'function'
            ? view.confirm('要用仓库里的备份覆盖本机会话吗？现有会话会被改名留底，不会删除。')
            : true
          if (!sure) return
          void postBackup({ action: 'restore' }, '已开始恢复，完成后重启飞鱼')
        }),
      ),
    )

    bkStatusLine = text('p', 'drc-adv-note', '正在读取备份状态…')
    section.appendChild(bkStatusLine)
    bkNote = text('p', 'drc-adv-note', '')
    bkNote.setAttribute('data-kind', '')
    section.appendChild(bkNote)
    return section
  }

  /**
   * ── ① 状态总览：四格（2026-11-16 新增，照样板）───────────────────────
   *
   * 用户来这一栏最常问的是「配好了吗 / 手机连上了吗 / 有没有事等我」，
   * 而重排前这三个答案分散在配对卡、状态条与扩展列表里，没有一处能一眼读完。
   *
   * **数据全部来自现有 `GET /status`**（`PillStatus` 那八个字段），一条宿主路由都不加：
   * ```
   * 主机   relay === 'idle' ? 已停止 : 运行中        ← relay
   * 中继   online 已连接 / connecting 连接中 / offline 连不上 / idle 未启动   ← relay
   * 已配对 pairingCount(status) > 0 ? N 台 : 未配对  ← pairings（密钥簿条数）
   * 待处理 status.waiting                             ← waiting
   * ```
   * ⚠️ 设计说明 §3.1 写的是「主机读 `/status` 的 `status` 字段」——**那个字段不存在**
   * （`pill/routes.ts` 的白名单只有 relay/paired/pairings/serverUrl/version/waiting/
   * waitingOldestSec/pairApproval/pairing/lastPairApproval）。`relay: 'idle'` 的语义是
   * "runtime 还没起来"，那就是"这台主机没在跑远控"，所以主机那一格读它。
   * 想让它显示真·进程状态就得往 `/status` 加字段 —— 那是宿主侧的改动，本轮不做。
   *
   * 四格**只读、但可点**：点了滚到对应区块（中继那一格还会把「本机设置」展开，
   * 因为改中继地址就在那里）。
   */
  const statCell = (key: string, value: string, tone: 'on' | 'wait' | 'error' | 'idle', onPick: () => void): HTMLElement => {
    const node = doc.createElement('button')
    node.type = 'button'
    node.className = 'drc-stat'
    node.appendChild(text('span', 'drc-stat-k', key))
    const line = text('span', 'drc-stat-v', undefined)
    line.setAttribute('data-tone', tone)
    if (tone === 'on' || tone === 'wait' || tone === 'error') {
      const dot = doc.createElement('span')
      dot.className = 'drc-dot'
      dot.setAttribute('data-tone', tone)
      dot.setAttribute('aria-hidden', 'true')
      line.appendChild(dot)
    }
    line.appendChild(text('span', '', value))
    node.appendChild(line)
    node.addEventListener('click', onPick)
    return node
  }

  /** ① 的那张卡：每次重画都新建（里面没有输入框，重建零成本）。 */
  const buildOverview = (): HTMLElement => {
    const section = card('状态总览')
    section.setAttribute('data-role', 'overview')
    const grid = doc.createElement('div')
    grid.className = 'drc-overview'
    const relay = status?.relay
    const hostDown = relay === 'idle'
    const relays: Record<string, { text: string; tone: 'on' | 'wait' | 'error' | 'idle' }> = {
      online: { text: '已连接', tone: 'on' },
      connecting: { text: '连接中', tone: 'wait' },
      offline: { text: '连不上', tone: 'error' },
      idle: { text: '未启动', tone: 'idle' },
    }
    const relayCell = relays[typeof relay === 'string' ? relay : ''] ?? { text: '未知', tone: 'idle' as const }
    const count = pairingCount(status)
    const waiting = typeof status?.waiting === 'number' && status.waiting > 0 ? Math.floor(status.waiting) : 0
    grid.appendChild(statCell('主机', hostDown ? '已停止' : '运行中', hostDown ? 'idle' : 'on', () => reveal(pairCard)))
    grid.appendChild(statCell('中继', relayCell.text, relayCell.tone, () => reveal(settingsFold, true)))
    grid.appendChild(statCell('已配对', count > 0 ? `${count} 台` : '未配对', 'idle', () => reveal(pairCard)))
    grid.appendChild(statCell('待处理', String(waiting), waiting > 0 ? 'wait' : 'idle', () => reveal(pairCard)))
    section.appendChild(grid)
    return section
  }

  /**
   * ④「本机设置」整块（`<details>`，默认收起）。**只建一次**。
   *
   * 合并前的两张卡（「进阶：自部署 / 自定义」+「会话备份（git）」）都是"配一次就再也不碰"
   * 的东西，却和主操作抢同样的版面（设计说明 §2 第 1、4 条）。收进一个折叠区之后，
   * ②上面那张码才是这一页唯一的主角。
   */
  const buildSettingsFold = (): HTMLElement => {
    const details = doc.createElement('details')
    details.className = 'drc-sec-card'
    details.setAttribute('data-role', 'settings')
    // 没有 `open` 属性 = 默认收起（HTML 语义，不需要额外记状态）。
    const summary = text('summary', 'drc-fold-summary', '本机设置')
    summary.appendChild(text('span', 'drc-fold-chev', '▸'))
    details.appendChild(summary)
    const body = doc.createElement('div')
    body.className = 'drc-fold-body'
    const cols = doc.createElement('div')
    cols.className = 'drc-cols'
    cols.appendChild(buildAdvancedColumn())
    cols.appendChild(buildBackupColumn())
    body.appendChild(cols)
    details.appendChild(body)
    return details
  }

  /**
   * ⑤「危险操作」整块（`<details>`，默认收起，标题红字）。**只建一次**。
   *
   * ## 为什么单独一块
   * 重排前「取消配对」和「保存中继地址」长得一模一样（设计说明 §2 第 4 条）。
   * 危险操作用的是另一档按钮（红字红边 → 武装后红底白字），且整块默认收起。
   *
   * ## 「删除本地会话备份」为什么是禁用的
   * 宿主那侧**没有这条接口**：`src/backup/routes.ts` 只认 `save` / `run` / `restore`，
   * `service.ts` 里唯一能删的是 `resetBackupState()`（注释写明"只给测试用"）。
   * 而本轮**不许新增宿主路由**（任务约束）。⇒ 按钮画出来、说清为什么点不了，
   * 比画一个假装能用的按钮诚实；接上它需要宿主侧加一个 `purge` 动作（另一件事）。
   */
  const buildDangerFold = (): HTMLElement => {
    const details = doc.createElement('details')
    details.className = 'drc-sec-card'
    details.setAttribute('data-role', 'danger')
    const summary = text('summary', 'drc-fold-summary', '危险操作')
    summary.appendChild(text('span', 'drc-fold-chev', '▸'))
    details.appendChild(summary)
    const body = doc.createElement('div')
    body.className = 'drc-fold-body'

    const unpaired = doc.createElement('div')
    unpaired.className = 'drc-danger-row'
    const text1 = doc.createElement('div')
    text1.className = 'drc-danger-text'
    text1.appendChild(text('b', 'drc-danger-title', '取消配对'))
    text1.appendChild(text('span', 'drc-danger-desc', '手机会被踢下线，需要重新扫码。'))
    unpaired.appendChild(text1)
    dangerCancelBtn = dangerButton('取消配对', () => void unpair())
    unpaired.appendChild(dangerCancelBtn)
    body.appendChild(unpaired)

    const wipe = doc.createElement('div')
    wipe.className = 'drc-danger-row'
    const text2 = doc.createElement('div')
    text2.className = 'drc-danger-text'
    text2.appendChild(text('b', 'drc-danger-title', '删除本地会话备份'))
    text2.appendChild(text('span', 'drc-danger-desc', '这一版宿主还没有这条接口（备份路由只认 save / run / restore）。'))
    wipe.appendChild(text2)
    const wipeBtn = dangerButton('删除', () => {
      // 走到这里说明用户已经点了两次；没有接口就明说，不假装成功。
      bkSetNote('没删：这一版宿主没有「删除本地备份」的接口（需要新增一条写路由）。', 'failed')
    })
    ;(wipeBtn as HTMLButtonElement).disabled = true
    wipeBtn.setAttribute('data-role', 'backup-purge')
    wipe.appendChild(wipeBtn)
    body.appendChild(wipe)

    details.appendChild(body)
    return details
  }

  /**
   * ②「连接手机」那张卡 —— **五种态**（照样板，同一时刻只出一屏）：
   *
   * | 态 | 主内容 | 主按钮 | 次按钮 |
   * |---|---|---|---|
   * | 未配对 | 二维码 + 6 位码 + 倒计时 + 扫码引导 | （扫就行） | （③那条折叠条） |
   * | 加载中 | 正在生成配对码… | 重试（灰） | — |
   * | 失败 | 左侧红条 + 发不出配对码：<原因> | 重试 | 看日志 |
   * | 已配对 | 头像位 + N 台手机 + 最近在线 X 前 | 重新配对 | 取消配对… |
   * | 审批中 | SAS 六位数字 + 一句对照说明 | 一致，允许 | 不一致，拒绝 |
   *
   * ⚠️ **优先级**：审批中 > 已配对 > 未配对三态。
   *  · 未配对且有挂起申请 ⇒ 审批中（这一屏没有别的东西好扫，比对才是唯一要做的事）；
   *  · **已配对**时若还有 6 位数字（`lastPairApproval` 放行后还要留 90 秒给用户对照），
   *    那一屏仍以"已配对"为主，把 6 位数字**附在最前面**——2026-10-21 的真机事故就是
   *    "已配对"把 6 位吃掉了：主机挂着待放行申请、屏幕上却没有数字 ⇒ 用户无从比对
   *    ⇒ 手机永远卡在"正在连接…"。这条不许再破。
   */
  const buildPairCard = (): HTMLElement => {
    const section = card('连接手机')
    section.setAttribute('data-role', 'pair')

    // ── 审批中 ────────────────────────────────────────────────────
    if (lastApproval !== null && !paired) {
      const block = doc.createElement('div')
      block.className = 'drc-approval'
      block.setAttribute('data-state', 'approval')
      block.appendChild(text('p', 'drc-sec-sasnote', '手机上会显示同一串数字，两处一致才点允许。'))
      /**
       * ⚠️ 6 位**原样**输出、不加分隔：判据钉的是它 `textContent` 恰好是那 6 位
       * （`client-bundle.test.ts`），而它是用户要逐位比对的东西 ——
       * 样板里写成「482 917」只是排版好看，机器核对与用户念读都不如原串直接。
       */
      block.appendChild(text('p', 'drc-sec-sas', lastApproval.sas))
      section.appendChild(block)
      section.appendChild(
        actionRow(
          button('一致，允许', () => void approvePair(), 'primary'),
          button('不一致，拒绝', () => void rejectPair()),
        ),
      )
      if (pairNote !== '') section.appendChild(text('p', 'drc-sec-guide', pairNote))
      return section
    }

    // ── 已配对 ────────────────────────────────────────────────────
    if (paired) {
      /**
       * 6 位数字属于"有申请"这件事，不属于"哪一屏"（见上面的优先级说明）。
       * 附在最前面：先比对，再谈"已经配上了"。
       */
      if (lastApproval !== null) {
        section.appendChild(text('p', 'drc-sec-sas', lastApproval.sas))
        section.appendChild(text('p', 'drc-sec-sasnote', '手机上也显示这串数字，两处不一致就在手机上选不一致'))
      }
      const block = doc.createElement('div')
      block.className = 'drc-paired'
      block.setAttribute('data-state', 'paired')
      block.appendChild(text('div', 'drc-avatar', '🐋'))
      const who = doc.createElement('div')
      /**
       * 手机名：`/status` **不带**主机/手机名（`pill/routes.ts` 的白名单里没有这一格），
       * 所以这里只能报"几台"。真要显示「小米 14」得给 `/status` 加一个字段 ——
       * 那是宿主侧改动，本轮不做（见①那段注释里同一条理由）。
       */
      who.appendChild(text('div', 'drc-paired-who', `${pairingCount(status)} 台手机`))
      const ago = agoText(Date.now() - lastOnlineAt)
      const connectedNow = typeof status?.paired === 'number' ? status.paired : 0
      who.appendChild(
        text('div', 'drc-paired-meta', `最近在线 ${ago}${connectedNow > 0 ? '' : ' · 自动重连中'}`),
      )
      block.appendChild(who)
      section.appendChild(block)
      section.appendChild(
        actionRow(
          button('重新配对', () => void mint(), 'primary'),
          // 带省略号 = "去危险区过那道二次确认"，不在这里直接踢人。
          button('取消配对…', () => focusDanger()),
        ),
      )
      if (pairNote !== '') section.appendChild(text('p', 'drc-sec-guide', pairNote))
      return section
    }

    // ── 未配对三态 ────────────────────────────────────────────────
    if (view.kind === 'qr') {
      const grid = doc.createElement('div')
      grid.className = 'drc-pair'
      grid.setAttribute('data-state', 'unpaired')

      const left = doc.createElement('div')
      left.className = 'drc-pair-qr'
      /**
       * 那张码。
       *
       * ⚠️ **复用同一个元素**（与 pill 同一套控制器，见 `createMpCodeImage`）：
       * `/pairing.png` 是 `no-store`，每新建一个 `<img>` 都必然回源一次、
       * 宿主那边重新签一张码。**这一页原来每 2 秒重画一次就新建一个** ——
       * 于是图每 2 秒闪一次、中继每 2 秒被叫一次。
       *
       * ⚠️ **先取元素、再读状态**：src 变了的时候 `element(src)` 会换一张新的、
       * 状态回到 `loading`，而状态是从**当前那一张**上读的。
       */
      const image = mpCode.element(view.imageSrc)
      /**
       * 图还在路上 ⇒ 把"等大的那一格"画上（理由见 `createMpCodeImage`）：
       * 那条路由要中继去微信那边签一张码才回得来（1～3 秒），
       * 而 `<img>` 在它落地之前是**一个空框**——用户分不清"正在取"与"取不到"。
       */
      const loadState = mpCode.state()
      if (loadState !== 'ready') left.appendChild(mpCodeLoadingBox(doc, loadState))
      left.appendChild(image)
      grid.appendChild(left)

      const codeWrap = doc.createElement('div')
      codeWrap.className = 'drc-codewrap'
      /**
       * 6 位码与它上面那行小字分两个节点：判据钉的是 `drc-code` 的 `textContent`
       * **恰好是那 6 位**（`client-bundle.test.ts`），说明文字混进去会让"手输这条路"
       * 变得没法机械核对。
       */
      const code = doc.createElement('div')
      code.className = 'drc-sec-code'
      code.appendChild(text('span', 'drc-sec-code-label', '或在小程序里手输这 6 位码'))
      code.appendChild(text('p', 'drc-code', view.token))
      codeWrap.appendChild(code)

      countNode = text('p', 'drc-count', `${secondsText(expiresInMs)}后过期`)
      if (expiresInMs <= 30_000) countNode.setAttribute('data-kind', 'urgent')
      codeWrap.appendChild(countNode)

      codeWrap.appendChild(
        text('p', 'drc-sec-guide', '用微信扫这张码。扫一次以后这台主机就在小程序的列表里，之后自动连上。'),
      )
      grid.appendChild(codeWrap)
      section.appendChild(grid)
      // ③ 手机 App 下载：一条折叠条，不再是独立一张卡。
      section.appendChild(buildAppDownload())
      if (pairNote !== '') section.appendChild(text('p', 'drc-sec-guide', pairNote))
      return section
    }

    if (view.kind === 'loading' || view.kind === 'info') {
      section.appendChild(text('p', 'drc-sec-state', '正在生成配对码…'))
      const retry = button('重试', () => void mint())
      ;(retry as HTMLButtonElement).disabled = true
      section.appendChild(actionRow(retry))
      return section
    }

    /**
     * 失败 / 中继不在线 / 发不出码：**同一屏**，只是原因不同。
     *
     * 形状是"左边一条红 + 一句为什么 + 下一步"，因为这不是引导、是故障
     * （重排前它与那张码挤在同一张卡里，长得跟引导一模一样）。
     */
    const reason =
      view.kind === 'failed' ? view.detail : view.kind === 'unavailable' ? view.reason : '中继不在线'
    const block = doc.createElement('div')
    block.className = 'drc-fail'
    block.setAttribute('data-state', 'failed')
    block.appendChild(text('p', 'drc-fail-why', `发不出配对码：${reason}`))
    block.appendChild(text('p', 'drc-sec-guide', '检查网络，或到「本机设置」确认中继地址。'))
    section.appendChild(block)
    if (failLogShown) {
      section.appendChild(
        text(
          'p',
          'drc-fail-log',
          `这一页读不到日志文件（宿主没有日志路由）。失败现场在 status.json（relay / pairing）与 Harness 日志里，本次原因：${reason}`,
        ),
      )
    }
    section.appendChild(
      actionRow(
        button('重试', () => void mint(), 'primary'),
        button('看日志', () => {
          failLogShown = !failLogShown
          paint()
        }),
      ),
    )
    if (pairNote !== '') section.appendChild(text('p', 'drc-sec-guide', pairNote))
    return section
  }

  /**
   * 整块重画。只在"状态真的变了"的时候调用，倒计时那一拍只改一行文本。
   *
   * ## 版式（2026-11-16 重排，照 `remote-panel-mockup-20261116.html`）
   *
   * ```
   * 抬头：大肥鱼 · 远程控制        [● 已连接]
   * ┌ ① 状态总览 ── 主机 / 中继 / 已配对 / 待处理（四格，可点）┐
   * ┌ ② 连接手机 ── 未配对 / 加载中 / 失败 / 已配对 / 审批中（五选一）┐
   * │   └ 没有 App？下载安卓版 ▸（折叠，原来独立的一张卡）        │
   * ┌ ▸ 本机设置（折叠，默认收起：中继地址 / 口令 / 备份）        ┐
   * ┌ ▸ 危险操作（折叠，默认收起，红字，二次确认）                ┐
   * ```
   *
   * ⚠️ 这里**只换三个容器的内部**：`topHost` / `overviewHost` / `pairHost`。
   * 带 input 的「本机设置」与带武装态的危险区都住在**常驻**节点里，
   * 建好之后一次都不许被摘出来重插（那会让 input 失焦 —— 见「常驻骨架」的说明）。
   */
  const paint = (): void => {
    if (disposed) return
    countNode = undefined

    // ── 抬头：标题 + 一句"这一页是干什么的" + 状态 pill ──────────────
    const header = doc.createElement('div')
    header.className = 'drc-sec-header'
    header.appendChild(text('h2', 'drc-sec-title', `大肥鱼 · ${SETTINGS_LABEL}`))
    header.appendChild(
      text('p', 'drc-sec-sub', '用微信小程序远程操作这台主机上的 DSH 会话：发指令、看流式输出、审批工具调用。'),
    )
    /**
     * 状态 pill（2026-11-16）：重排前它是一条**独立的整行状态条**，而那一行回答的问题
     * 与①的四格完全重复（连上没有 / 配没配上）。收成抬头右上角一颗之后，
     * "第一眼看到什么"由①的四格承担，抬头只留一句结论。
     * 文案仍走 `pillLabel`（与那颗悬浮 pill 同一份决策，两条路不许分叉）。
     */
    const label = pillLabel(status)
    const pill = doc.createElement('span')
    pill.className = 'drc-sec-pill'
    pill.setAttribute('data-tone', label.tone)
    const pillDot = doc.createElement('span')
    pillDot.className = 'drc-dot'
    pillDot.setAttribute('data-tone', label.tone)
    pillDot.setAttribute('aria-hidden', 'true')
    pill.appendChild(pillDot)
    pill.appendChild(text('span', 'drc-sec-statustext', label.text))
    header.appendChild(pill)
    topHost.replaceChildren(header)

    // ── ① 状态总览 ────────────────────────────────────────────────
    overviewHost.replaceChildren(buildOverview())

    // ── ② 连接手机（含③下载折叠条）────────────────────────────────
    pairCard = buildPairCard()
    pairHost.replaceChildren(pairCard)

    /**
     * ④⑤：**只建一次**，插进常驻的 `box` 末尾（顺序：本机设置在前、危险操作在后）。
     *
     * ⚠️ 它们里面有六个 `<input>` 与一个"武装态"按钮；`paint()` 每 2 秒来一次，
     * 重建一次就等于把用户正在填的东西抹掉、把二次确认的武装态清零。
     */
    if (!settingsFold) {
      settingsFold = buildSettingsFold()
      box.appendChild(settingsFold)
    }
    if (!dangerFold) {
      dangerFold = buildDangerFold()
      box.appendChild(dangerFold)
    }
  }

  paint()
  /**
   * **先读一次状态，再决定发不发码**（2026-11-16）。
   *
   * 重排前是"挂上就发"：已配对的主机每次打开这一页都白烧一张码，而那一屏根本不显示二维码
   * （②的已配对态）。现在先问 `/status`，只有"没配上"才发。
   *
   * ⚠️ 读失败（老宿主 404 / 网络断）时 `paired` 仍是 `false` ⇒ 退化成"照发"——
   * 不让一次读失败把这一页变成空白。这是刻意的兜底，别把它"修"掉。
   */
  void loadStatus().then(() => {
    if (!disposed && !paired) void mint()
  })
  // 「进阶」那一栏的读数：与状态轮询分开取（它不在那条 2 秒节拍上——那是"手机上刚扫完，
  // 电脑这一页马上就变"的路，而配置几乎不会在你看这一页的时候变）。
  void loadConfig()
  /**
   * 备份那张卡的读数（2026-10-28）：**挂在状态那条节拍上，隔几拍取一次**。
   *
   * ⚠️ 刻意不另起 `setInterval`：这一页的节拍数量是被测试钉住的（假时钟一次只 fire 一个
   * 定时器），凭空多一条会让"归零自动换一张"那条判据打到错的定时器上。
   * 备份状态不是秒级的东西，6 秒一次足够。
   */
  let backupTick = 0
  /**
   * 状态每 2 秒回来一次：这是"手机上刚扫完，电脑这一页马上就变"的那条路。
   * 与 pill 同一个节拍——用户在设置页停留时也应当看到别人扫码的结果。
   *
   * 备份那张卡的读数搭同一条节拍（每 3 拍 = 6 秒），理由见上面那段：不另起定时器。
   */
  statusTimer = setInterval(() => {
    void loadStatus()
    backupTick += 1
    if (backupTick % 3 === 0) void loadBackup()
  }, 2000)
  void loadBackup()

  return () => {
    disposed = true
    if (statusTimer !== undefined) clearInterval(statusTimer)
    if (countTimer !== undefined) clearInterval(countTimer)
    statusTimer = undefined
    countTimer = undefined
    try {
      box.remove()
    } catch {
      /* 宿主已经把它摘掉了 */
    }
  }
}

export interface SettingsHost {
  effect?(execute: (() => unknown) | void): unknown
  /** 模块 `inject: ['slots']` 声明之后这一格直接可读（宿主自带模板就是这个写法）。 */
  slots?: unknown
  get?(name: string, strict?: boolean): unknown
  /** 这一代宿主没把 slots 当服务给时的退路：等 `inject(['slots'], cb)` 回调。 */
  inject?(names: string[], callback: (...args: unknown[]) => void): unknown
}

/** 认得出 slots 服务吗（与 `pill.ts` 同一个判据，这里再看一遍是为了不导出内部工具）。 */
interface SlotRegistry {
  inject(name: string, callback: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

function isSlots(value: unknown): value is SlotRegistry {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.inject === 'function' && typeof record.register === 'function'
}

export function pickSlots(source: unknown): SlotRegistry | undefined {
  if (isSlots(source)) return source
  const gettable = source as { get?: (name: string, strict?: boolean) => unknown } | null | undefined
  if (gettable && typeof gettable.get === 'function') {
    try {
      const got = gettable.get('slots', true)
      if (isSlots(got)) return got
    } catch {
      /* 这个候选没有该服务 */
    }
  }
  return undefined
}

/**
 * 把这一页注册进 `settings.section`。
 *
 * 与 `mountPill` 同一套：`slots.inject(槽位名, 回调)` 等到**槽位声明**再注册
 * （这正是它存在的理由——宿主可能晚声明；直接 `register` 一个未声明的槽位会抛）。
 * 返回 false = "到这一刻还没挂上"，调用方只关心它不外抛。
 */
/** 设置页那个分区的注册参数；缺省就是「远程控制」那份老配置。 */
export interface SettingsSectionOptions {
  id: string
  order: number
  label: string
  /**
   * 由挂载逻辑生成「注册时的组件」。
   *
   * 默认实现是老行为：`() => createElement('div', { ref: attach })`，宿主把设置页容器
   * 元素传进 `attach`，由 `buildSettingsSection` 把整页 DOM 灌进去。
   * 合页（0.8.0 的「大肥鱼」分栏）要自己决定 attach 怎么用，所以把它做成参数。
   */
  buildComponent?: (attach: (node: unknown) => void) => () => unknown
}

export type SettingsMountResult = 'mounted' | 'pending' | 'failed'

export function mountSettingsSection(
  ctx: SettingsHost,
  createElement: CreateElement | undefined,
  options?: SettingsSectionOptions,
): SettingsMountResult {
  if (!createElement) {
    // 拿不到 react 就连挂载点都没有。pill 那边也是这条：少一页，不是整页起不来。
    warnSection('装载器给不出 react：设置里的那一页不会出现')
    return 'failed'
  }
  let mounted = false
  // 晚到登记也算"接管了"：宿主把 slots 补给我的时候，这一格会自己出现。
  // （0.8.0 合页靠这个返回值决定"要不要再挂老版远程卡"——挂重了设置页就两张卡。）
  let scheduledLate = false
  const mount = (slots: SlotRegistry): void => {
    if (mounted) return
    /** `ref` 回调必须身份稳定，否则宿主每次重渲染都会先 `ref(null)` 再 `ref(node)`。 */
    let cleanup: (() => void) | undefined
    const attach = (node: unknown): void => {
      const element = node as Element | null
      if (element && typeof element.appendChild === 'function' && element.ownerDocument) {
        if (cleanup) return
        cleanup = buildSettingsSection(element, {
          fetchImpl: (input, init) => globalThis.fetch(resolveHostUrl(String(input)), init as RequestInit | undefined),
          warn: (message) => warnSection(message),
        })
      } else if (cleanup) {
        cleanup()
        cleanup = undefined
      }
    }
    const component = (options?.buildComponent ?? ((attachRef) => () => createElement('div', { ref: attachRef })))(attach)
    mounted = true
    try {
      slots.inject(SETTINGS_SLOT, () => {
        try {
          slots.register(
            {
              name: SETTINGS_SLOT,
              id: options?.id ?? SETTINGS_ID,
              order: options?.order ?? SETTINGS_ORDER,
              label: () => options?.label ?? SETTINGS_LABEL,
            },
            component,
          )
        } catch (error) {
          warnSection('设置分区注册失败（这一页不出现）', error)
        }
      })
    } catch (error) {
      mounted = false
      warnSection('设置分区注入失败（这一页不出现）', error)
      return
    }
    try {
      ctx.effect?.(() => () => {
        if (cleanup) {
          cleanup()
          cleanup = undefined
        }
      })
    } catch {
      /* 没有 effect 口就不登记卸载：宿主整页卸载会带走这一页 */
    }
  }
  /**
   * 两条路都要有，形状照 `mountPill`（真机取证过的那一份）：
   *
   * ⚠️ 2026-08-09 这一条是**判据逼出来的**：夹具里 `lateSlots` 那个形状
   * （apply 时拿不到 slots，注入回调之后才有）下，只写"早"这一条会让设置分区
   * **整块不出现**——而宿主那边的常态恰恰就是"apply 早于服务到位"。
   * 少了晚到这条退路，屏幕上就是"设置里没有这一页"，日志里什么都没有。
   */
  let early: SlotRegistry | undefined
  try {
    early = pickSlots(ctx.slots) ?? pickSlots(ctx.get?.('slots', true))
  } catch {
    /* 这一代宿主没这个服务名，或读它就是抛 */
  }
  if (early) mount(early)

  try {
    scheduledLate = true
    ctx.inject?.(['slots'], ((...args: unknown[]) => {
      for (const candidate of [...args, ctx]) {
        const found = pickSlots(candidate)
        if (found) {
          mount(found)
          return
        }
      }
    }) as never)
  } catch (error) {
    warnSection('ctx.inject 口不可用：slots 再晚到也没人补挂', error)
  }
  if (!mounted) {
    if (scheduledLate) {
      // 已登记晚到回调：宿主补 slots 时这一页会出现，不算失败。
      return 'pending'
    }
    warnSection('apply 时没探到 slots（已挂注入回调等它晚到）；设置里一直没有这一页就是这代宿主没这个服务')
  }
  return mounted ? 'mounted' : 'failed'
}
