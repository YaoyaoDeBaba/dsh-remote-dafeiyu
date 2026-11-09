/**
 * xyq-panel — 设置页「小云雀」分栏（React 组件）。
 *
 * 配置：Access Key、默认模型/时长、预算上限、调用自由度；状态：登录是否有效、剩余积分。
 * 密钥只在输入框里出现一次，保存后设置页只显示“…后四位”。
 */
import { resolveHostUrl } from './host-url.js'
import { callJson } from './host-api.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}
type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

export interface XyqView {
  enabled: boolean
  accessKeySet: boolean
  accessKeyHint: string
  defaultVideoModel: string
  defaultVideoDurationSec: number
  defaultImageModel: string
  budget: { images: number; videos: number; maxVideoSeconds: number }
  freedom: 'explicit' | 'budgeted' | 'open'
}

const BASE = '/api/dsh-remote-dafeiyu/xyq'
const fieldStyle: Record<string, string> = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
}
const labelStyle: Record<string, string> = { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginBottom: '4px', display: 'block' }
const buttonStyle: Record<string, string> = {
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  cursor: 'pointer',
}
const cardStyle: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '10px',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}
const gridStyle: Record<string, string> = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(resolveHostUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, error: `宿主返回了非 JSON（HTTP ${response.status}）` }
  }
}

export function buildXyqPanel(deps: { createElement: CreateElement; hooks: Hooks }): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined

  return function XyqPanel(): unknown {
    const [cfg, setCfg] = useState<XyqView | null>(null)
    const [key, setKey] = useState<string>('')
    const [status, setStatus] = useState<string>('')
    const [balance, setBalance] = useState<string>('')
    const [busy, setBusy] = useState<boolean>(false)

    const load = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(`${BASE}/config`, undefined)
        if (result.ok && result.config && typeof result.config === 'object') {
          setCfg(result.config as XyqView)
          setStatus('已载入')
        } else setStatus(`读取失败：${String(result.error ?? '未知错误')}`)
      } catch (error) {
        setStatus(`读取失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const checkStatus = async (): Promise<void> => {
      setBusy(true)
      try {
        const s = await callJson(`${BASE}/status`, undefined)
        if (s.ok === true) setStatus(s.loggedIn === true ? `Access Key 有效（${String(s.source ?? '')}）` : String(s.message ?? 'Access Key 未生效'))
        else setStatus(`检查失败：${String(s.message ?? s.error ?? '未知错误')}`)
        const b = await callJson(`${BASE}/balance`, undefined)
        if (b.ok === true) setBalance(`剩余积分：${String(b.totalRemain ?? '未知')}`)
        else setBalance(String(b.message ?? ''))
      } catch (error) {
        setStatus(`检查失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const push = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await postJson(`${BASE}/../guidance/push`, { which: 'xyq' })
        if (result.ok === true && result.result && typeof result.result === 'object') {
          const r = result.result as { pushed?: number; failed?: number; total?: number }
          setStatus(`已推送到 ${r.pushed ?? 0}/${r.total ?? 0} 个在线会话${(r.failed ?? 0) > 0 ? `（${r.failed} 个失败）` : ''}`)
        } else {
          setStatus(`推送失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`推送失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const save = async (patch: Record<string, unknown>): Promise<void> => {
      setBusy(true)
      try {
        const result = await postJson(`${BASE}/config`, patch)
        if (result.ok && result.config && typeof result.config === 'object') {
          setCfg(result.config as XyqView)
          setStatus('已保存')
          setKey('')
        } else setStatus(`保存失败：${String(result.error ?? '未知错误')}`)
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
      return h('div', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' }, children: status || '正在读取小云雀配置…' })
    }

    const number = (value: string, fallback: number): number => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }

    return h('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      children: [
        h('p', {
          style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.6' },
          children:
            '通过小云雀官方 CLI 提供 generate_image / generate_video / xyq_balance / xyq_models 四个工具。' +
            'Access Key 在 小云雀官网 → ⚡CLI/API → API → 管理 Access Key 新建；它有时效，过期后工具会报错并在下面提示。',
        }),
        h('div', {
          style: cardStyle,
          children: [
            h('span', { style: labelStyle, children: `Access Key（${cfg.accessKeySet ? '已设置 ' + cfg.accessKeyHint : '未设置'}）` }),
            h('div', { style: { display: 'flex', gap: '8px' }, children: [
              h('input', { type: 'password', value: key, placeholder: cfg.accessKeySet ? '留空则不改' : '粘贴 Access Key', style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setKey(String(event?.target?.value ?? '')) }),
              h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void save(key.trim() === '' ? {} : { accessKey: key.trim() }), children: '保存 Key' }),
              h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void checkStatus(), children: '检查状态/余额' }),
              h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void push(), children: '推送到所有在线会话' }),
            ] }),
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: status }),
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: balance }),
          ],
        }),
        h('div', {
          style: cardStyle,
          children: [
            h('span', { style: labelStyle, children: '生成参数与预算' }),
            h('div', { style: gridStyle, children: [
              h('div', { children: [
                h('span', { style: labelStyle, children: '默认视频模型（key）' }),
                h('input', { value: cfg.defaultVideoModel, style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, defaultVideoModel: String(event?.target?.value ?? '') }), onBlur: () => void save({ defaultVideoModel: cfg.defaultVideoModel }) }),
              ] }),
              h('div', { children: [
                h('span', { style: labelStyle, children: '默认视频时长（秒）' }),
                h('input', { type: 'number', min: 4, max: 30, value: String(cfg.defaultVideoDurationSec), style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, defaultVideoDurationSec: number(String(event?.target?.value ?? ''), cfg.defaultVideoDurationSec) }), onBlur: () => void save({ defaultVideoDurationSec: cfg.defaultVideoDurationSec }) }),
              ] }),
              h('div', { children: [
                h('span', { style: labelStyle, children: '默认图片模型（完整名称）' }),
                h('input', { value: cfg.defaultImageModel, style: fieldStyle, placeholder: '如 智能图片V2.5 Fast', onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, defaultImageModel: String(event?.target?.value ?? '') }), onBlur: () => void save({ defaultImageModel: cfg.defaultImageModel }) }),
              ] }),
            ] }),
            h('div', { style: gridStyle, children: [
              h('div', { children: [
                h('span', { style: labelStyle, children: '单会话图片上限（0 = 不限）' }),
                h('input', { type: 'number', min: 0, max: 200, value: String(cfg.budget.images), style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, budget: { ...cfg.budget, images: number(String(event?.target?.value ?? ''), cfg.budget.images) } }), onBlur: () => void save({ budget: cfg.budget }) }),
              ] }),
              h('div', { children: [
                h('span', { style: labelStyle, children: '单会话视频上限（0 = 不限）' }),
                h('input', { type: 'number', min: 0, max: 50, value: String(cfg.budget.videos), style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, budget: { ...cfg.budget, videos: number(String(event?.target?.value ?? ''), cfg.budget.videos) } }), onBlur: () => void save({ budget: cfg.budget }) }),
              ] }),
              h('div', { children: [
                h('span', { style: labelStyle, children: '单条视频最长秒数' }),
                h('input', { type: 'number', min: 4, max: 30, value: String(cfg.budget.maxVideoSeconds), style: fieldStyle, onChange: (event: { target?: { value?: string } }) => setCfg({ ...cfg, budget: { ...cfg.budget, maxVideoSeconds: number(String(event?.target?.value ?? ''), cfg.budget.maxVideoSeconds) } }), onBlur: () => void save({ budget: cfg.budget }) }),
              ] }),
            ] }),
            h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' }, children: [
              h('span', { style: labelStyle, children: '调用自由度' }),
              h('select', { value: cfg.freedom, style: { ...fieldStyle, width: 'auto' }, onChange: (event: { target?: { value?: string } }) => void save({ freedom: String(event?.target?.value ?? 'explicit') }), children: [
                h('option', { value: 'explicit', children: '仅用户明确要求（默认）' }),
                h('option', { value: 'budgeted', children: '预算内可自行调用' }),
                h('option', { value: 'open', children: '放开（只记账）' }),
              ] }),
            ] }),
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: '改动会立即写盘；自由度与提示语在重启 DSH 后对模型生效。' }),
          ],
        }),
      ],
    })
  }
}
