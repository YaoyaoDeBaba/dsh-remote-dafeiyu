/**
 * subagents-settings — 设置页「派活助手」分栏（React 组件）。
 *
 * 三块配置：
 * - 「派活规范提示」开关（写 `guidance`，改完**重启 DSH** 才对模型生效）；
 * - 闲置阈值（写 `idleWarnMs`，即时生效：PC/手机面板的标黄与「一键归档闲置」都读它）；
 * - 提示词预览 + 一键复制（文本由宿主 `GET .../subagents/config` 返回，与注入给模型的是**同一份**）。
 *
 * 钩子由调用方传入（不能静态 require react）；所有 DOM 操作都有退路。
 */
import { resolveHostUrl } from './host-url.js'
import { callJson } from './host-api.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

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

const cardStyle: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '10px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}
const rowStyle: Record<string, string> = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
const labelStyle: Record<string, string> = { fontSize: '12.5px', color: 'var(--dsw-alias-label-secondary)' }
const buttonStyle: Record<string, string> = {
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  cursor: 'pointer',
}
const previewStyle: Record<string, string> = {
  whiteSpace: 'pre-wrap',
  fontSize: '12px',
  lineHeight: '1.6',
  color: 'var(--dsw-alias-label-secondary)',
  background: 'var(--dsw-alias-bg-tertiary, rgba(127,127,127,.08))',
  borderRadius: '8px',
  padding: '10px',
  maxHeight: '220px',
  overflow: 'auto',
  margin: '0',
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

    if (cfg === null) {
      return h('div', {
        style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
        children: [
          h('span', { children: status || '正在读取派活助手配置…' }),
          ' ',
          h('button', { type: 'button', style: buttonStyle, onClick: () => void load(), children: '刷新' }),
        ],
      })
    }

    const copy = async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(preview)
        setStatus('提示词已复制')
      } catch {
        setStatus('复制失败：请手动全选复制')
      }
    }

    return h('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      children: [
        h('p', {
          style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.6' },
          children:
            '派活助手 = 子代理监视器：派出去的子代理会出现在电脑右侧 / 手机对话页的 🐝 面板里。' +
            '想让用户的机器人都按「名称｜简述」派活，就保持下面的规范提示开启。',
        }),
        h('div', {
          style: cardStyle,
          children: [
            h('div', {
              style: rowStyle,
              children: [
                h('span', { style: labelStyle, children: '派活规范提示（重启 DSH 后生效）' }),
                h('input', {
                  type: 'checkbox',
                  checked: cfg.guidance,
                  disabled: busy,
                  onChange: (event: { target?: { checked?: boolean } }) =>
                    void save({ guidance: event?.target?.checked === true }),
                }),
                h('span', { style: { ...labelStyle, fontSize: '11.5px' }, children: cfg.guidance ? '开' : '关' }),
              ],
            }),
            h('div', {
              style: rowStyle,
              children: [
                h('span', { style: labelStyle, children: '派活风格（重启 DSH 后生效）' }),
                h('select', {
                  value: cfg.mode ?? 'foreman',
                  disabled: busy,
                  style: { ...buttonStyle, padding: '4px 8px' },
                  onChange: (event: { target?: { value?: string } }) =>
                    void save({ mode: event?.target?.value === 'hands-on' ? 'hands-on' : 'foreman' }),
                  children: [
                    h('option', { value: 'foreman', children: '包工头：主动拆活/派活/验收/汇报' }),
                    h('option', { value: 'hands-on', children: '亲力亲为：自己动手为主' }),
                  ],
                }),
              ],
            }),
            h('div', {
              style: rowStyle,
              children: [
                h('span', { style: labelStyle, children: '闲置阈值（超过它算“太久”，可一键归档）' }),
                h(
                  'select',
                  {
                    value: String(cfg.idleWarnMs),
                    disabled: busy,
                    style: { ...buttonStyle, padding: '4px 8px' },
                    onChange: (event: { target?: { value?: string } }) =>
                      void save({ idleWarnMs: Number(event?.target?.value ?? 0) }),
                    children: IDLE_OPTIONS.map(([ms, label]) => h('option', { key: String(ms), value: String(ms), children: label })),
                  },
                ),
                h('span', { style: { ...labelStyle, fontSize: '11.5px' }, children: status }),
              ],
            }),
            h('div', {
              style: { display: 'flex', gap: '8px', alignItems: 'center' },
              children: [
                h('span', { style: labelStyle, children: '提示词预览（与注入给模型的是同一份）' }),
                h('button', { type: 'button', style: buttonStyle, onClick: () => void copy(), children: '复制' }),
                h('button', { type: 'button', style: buttonStyle, onClick: () => void load(), children: '刷新' }),
              ],
            }),
            h('pre', { style: previewStyle, children: preview || '（宿主没有返回提示词文本）' }),
          ],
        }),
      ],
    })
  }
}
