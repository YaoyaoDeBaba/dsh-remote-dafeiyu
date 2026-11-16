/**
 * subagents-settings — 设置页「Agent 团队」分栏里的「派活助手」那块（React 组件）。
 *
 * 三块配置：
 * - 「派活规范提示」开关（写 `guidance`，改完**重启 DSH** 才对模型生效）；
 * - 闲置阈值（写 `idleWarnMs`，即时生效：PC/手机面板的标黄与「一键归档闲置」都读它）；
 * - 提示词预览 + 一键复制（文本由宿主 `GET .../subagents/config` 返回，与注入给模型的是**同一份**）。
 *
 * 钩子由调用方传入（不能静态 require react）；所有 DOM 操作都有退路。
 *
 * 2026-11-16 版式统一：这一块原来是"一句说明 + 一张自带边框的卡"，且自己抄了一套
 * `cardStyle`/`rowStyle`/`buttonStyle`（与 `vision-panel.ts`、`memory-panel.ts` 各一份）。
 * 现在整块就是 `./panel-kit.ts` 的**一张卡 + 三种行**（开关行 / 选择行 / 预览行），
 * 说明也收进卡里——它属于"这一卡在管什么"，不该单独浮在卡列里。功能与文案没动。
 */
import { resolveHostUrl } from './host-url.js'
import { callJson } from './host-api.js'
import {
  button,
  card,
  fieldStyle,
  hintStyle,
  item,
  itemSub,
  itemTitle,
  labelStyle,
  notesStyle,
  quoteStyle,
  rowStyle,
  type CreateElement,
} from './panel-kit.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

export interface SubagentsSettingsView {
  enabled: boolean
  guidance: boolean
  idleWarnMs: number
  mode: 'foreman' | 'hands-on'
}

const BASE = '/api/dsh-remote-dafeiyu/subagents'

const IDLE_OPTIONS: Array<[number, string]> = [
  [10 * 60 * 1000, '10 分钟'],
  [30 * 60 * 1000, '30 分钟'],
  [60 * 60 * 1000, '1 小时'],
  [2 * 60 * 60 * 1000, '2 小时（默认）'],
  [8 * 60 * 60 * 1000, '8 小时'],
  [24 * 60 * 60 * 1000, '24 小时'],
]

/** 行里那颗勾选框：尺寸显式给死，别让它跟着宿主的 reset 走。 */
const CHECKBOX_STYLE: Record<string, string | number> = {
  width: '16px',
  height: '16px',
  flex: '0 0 auto',
  margin: 0,
  cursor: 'pointer',
  accentColor: 'var(--dsw-alias-brand-primary, #247bbf)',
}

/** 行里那两格下拉：`fieldStyle` 的紧凑版（行高与文字对齐，不吃满整行）。 */
const ROW_SELECT_STYLE: Record<string, string | number> = {
  ...fieldStyle,
  width: 'auto',
  maxWidth: '100%',
  flex: '0 0 auto',
  padding: '4px 8px',
}

async function postConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(resolveHostUrl(`${BASE}/config`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
    body: JSON.stringify(patch),
  })
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, error: `宿主返回了非 JSON（HTTP ${response.status}）` }
  }
}

export function buildSubagentsPanel(deps: { createElement: CreateElement; hooks: Hooks }): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined

  return function SubagentsPanel(): unknown {
    const [cfg, setCfg] = useState<SubagentsSettingsView | null>(null)
    const [preview, setPreview] = useState<string>('')
    const [status, setStatus] = useState<string>('')
    const [busy, setBusy] = useState<boolean>(false)

    const load = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(`${BASE}/config`, undefined)
        if (result.ok && result.config && typeof result.config === 'object') {
          setCfg(result.config as SubagentsSettingsView)
          if (typeof result.guidanceText === 'string') setPreview(result.guidanceText)
          setStatus('已载入')
        } else {
          setStatus(`读取失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`读取失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const refreshPreview = async (): Promise<void> => {
      try {
        const result = await callJson(`${BASE}/config`, undefined)
        if (result.ok === true && typeof result.guidanceText === 'string') setPreview(result.guidanceText)
      } catch {
        /* 预览刷新失败不打扰 */
      }
    }

    const save = async (patch: Record<string, unknown>): Promise<void> => {
      setBusy(true)
      try {
        const result = await postConfig(patch)
        if (result.ok && result.config && typeof result.config === 'object') {
          setCfg(result.config as SubagentsSettingsView)
          if (typeof result.guidanceText === 'string') setPreview(result.guidanceText)
          else void refreshPreview()
          setStatus('已保存')
        } else {
          setStatus(`保存失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`保存失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    useEffect?.(() => {
      void load()
    }, [])

    /* 读不到配置时也一样是一张卡（原来是裸文字 + 一颗按钮，浮在卡列里最难看）。 */
    if (cfg === null) {
      return card(h, '派活助手', [
        h('p', { style: notesStyle, children: status || '正在读取派活助手配置…' }),
        h('div', { style: rowStyle, children: [button(h, '刷新', () => void load())] }),
      ])
    }

    const copy = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(preview)
        setStatus('提示词已复制')
      } catch {
        setStatus('复制失败：请手动全选复制')
      }
    }

    return card(
      h,
      '派活助手',
      [
        h('p', {
          style: notesStyle,
          children:
            '派活助手 = 子代理监视器：派出去的子代理会出现在电脑右侧 / 手机对话页的 🐝 面板里。' +
            '想让用户的机器人都按「名称｜简述」派活，就保持下面的规范提示开启。',
        }),
        /* 开关行：左文右勾（样板 .item） */
        item(
          h,
          [itemTitle(h, '派活规范提示'), itemSub(h, '重启 DSH 后生效')],
          [
            h('input', {
              type: 'checkbox',
              style: CHECKBOX_STYLE,
              checked: cfg.guidance,
              disabled: busy,
              onChange: (event: { target?: { checked?: boolean } }) =>
                void save({ guidance: event?.target?.checked === true }),
            }),
          ],
        ),
        /* 选择行：左文右选 */
        item(
          h,
          [itemTitle(h, '派活风格'), itemSub(h, '重启 DSH 后生效')],
          [
            h('select', {
              value: cfg.mode ?? 'foreman',
              disabled: busy,
              style: ROW_SELECT_STYLE,
              onChange: (event: { target?: { value?: string } }) =>
                void save({ mode: event?.target?.value === 'hands-on' ? 'hands-on' : 'foreman' }),
              children: [
                h('option', { value: 'foreman', children: '包工头：主动拆活/派活/验收/汇报' }),
                h('option', { value: 'hands-on', children: '亲力亲为：自己动手为主' }),
              ],
            }),
          ],
        ),
        /* 阈值行：左文右选（即时生效，所以副标题说清"即时"） */
        item(
          h,
          [itemTitle(h, '闲置阈值'), itemSub(h, '超过它算"太久"，可一键归档；即时生效')],
          [
            h('select', {
              value: String(cfg.idleWarnMs),
              disabled: busy,
              style: ROW_SELECT_STYLE,
              onChange: (event: { target?: { value?: string } }) =>
                void save({ idleWarnMs: Number(event?.target?.value ?? 0) }),
              children: IDLE_OPTIONS.map(([ms, label]) => h('option', { key: String(ms), value: String(ms), children: label })),
            }),
          ],
        ),
        /* 预览：标题一行 + 动作在右，正文是那块引文 */
        h('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
          children: [
            h('span', { style: { ...labelStyle, marginBottom: 0, flex: '1 1 auto' }, children: '提示词预览（与注入给模型的是同一份）' }),
            button(h, '复制', () => void copy(), { disabled: busy }),
            button(h, '刷新', () => void load(), { disabled: busy }),
          ],
        }),
        h('pre', { style: quoteStyle, children: preview || '（宿主没有返回提示词文本）' }),
        status === '' ? null : h('p', { style: hintStyle, children: status }),
      ],
      { count: cfg.guidance ? '规范提示已开' : '规范提示已关' },
    )
  }
}
