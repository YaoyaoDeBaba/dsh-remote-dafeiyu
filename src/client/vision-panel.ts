/**
 * vision-panel — 「识图」的浏览器那一半（0.9.0）。
 *
 * 两块：
 * 1. **设置页「人设」分栏里的识图配置块**：外挂视觉模型的地址/密钥/模型/协议/提示词，
 *    保存走宿主那三条路由（`/api/dsh-remote-dafeiyu/vision/*`）。
 * 2. **聊天页那颗鲸鱼按钮（FAB）**：选一张图 → 发给宿主识图 → 把识别文本注入当前会话
 *    （与 `dsh-vision` 同一条路：`ctx.sessions.binding(id).session.prompt([...], 'queue')`）。
 *    注入不了（这一代宿主没给 sessions）就退化成"显示识别结果 + 复制"。
 *
 * 纪律：钩子全部由调用方传入（不能静态 require react）；每个 DOM 操作都包 try。
 */
import { VISION_BASE, callJson } from './host-api.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

export interface VisionConfigView {
  enabled: boolean
  apiBase: string
  model: string
  protocol: string
  prompt: string
  timeoutMs: number
  requestTemplate: string
  responsePath: string
  apiKeySet: boolean
  apiKeyHint: string
}

export interface VisionPanelDeps {
  createElement: CreateElement
  hooks: Hooks
  /** 把识别文本注入当前会话；注入不了返回 false（面板退化成复制）。 */
  injectText?: (text: string) => Promise<boolean> | boolean
}


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
const labelStyle: Record<string, string> = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-secondary)',
  marginBottom: '4px',
}
const buttonStyle: Record<string, string> = {
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  cursor: 'pointer',
}

const PROTOCOLS: Array<[string, string]> = [
  ['auto', '自动（按地址猜）'],
  ['openai-chat', 'OpenAI Chat（/chat/completions）'],
  ['openai-responses', 'OpenAI Responses（/responses）'],
  ['anthropic', 'Anthropic（/v1/messages）'],
  ['gemini', 'Gemini（generateContent）'],
  ['custom', '自定义模板'],
]

/** 设置页里的识图配置块（React 组件）。宿主没给 useState 时返回 undefined（调用方不渲染这块）。 */
export function buildVisionPanel(deps: VisionPanelDeps): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined

  return function VisionPanel(): unknown {
    const [cfg, setCfg] = useState<VisionConfigView | null>(null)
    const [apiKey, setApiKey] = useState<string>('')
    const [status, setStatus] = useState<string>('')
    const [models, setModels] = useState<string[]>([])
    const [busy, setBusy] = useState<boolean>(false)

    const load = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(`${VISION_BASE}/config`, undefined)
        if (result.ok) {
          setCfg(result.config as VisionConfigView)
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

    useEffect?.(() => {
      void load()
    }, [])

    if (cfg === null) {
      return h('div', {
        style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
        children: [h('span', { children: status || '正在读取识图配置…' }), ' ', h('button', { type: 'button', style: buttonStyle, onClick: () => void load(), children: '刷新' })],
      })
    }

    const patch = (next: Partial<VisionConfigView>): void => setCfg({ ...cfg, ...next })

    const save = async (): Promise<void> => {
      setBusy(true)
      try {
        const payload: Record<string, unknown> = {
          enabled: cfg.enabled,
          apiBase: cfg.apiBase,
          model: cfg.model,
          protocol: cfg.protocol,
          prompt: cfg.prompt,
          timeoutMs: cfg.timeoutMs,
          requestTemplate: cfg.requestTemplate,
          responsePath: cfg.responsePath,
        }
        // 空串 = 不改 key（密码框不显示已存的值）
        if (apiKey.trim() !== '') payload.apiKey = apiKey.trim()
        const result = await callJson(`${VISION_BASE}/config`, { config: payload })
        if (result.ok) {
          setCfg(result.config as VisionConfigView)
          setApiKey('')
          setStatus('已保存。开启/关闭识图提示词需要重启 DSH 生效；识图路由立即生效。')
        } else {
          setStatus(`保存失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`保存失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const pullModels = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(`${VISION_BASE}/models`, {})
        if (result.ok) {
          const list = Array.isArray(result.models) ? (result.models as string[]) : []
          setModels(list)
          setStatus(list.length > 0 ? `拉到 ${list.length} 个模型，点一个填入` : '模型列表是空的')
        } else {
          setStatus(`拉取失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`拉取失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const keyPlaceholder = cfg.apiKeySet ? `已保存（${cfg.apiKeyHint}）：留空不修改` : '粘贴 API Key（只存在本机）'
    return h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '10px',
        marginTop: '16px',
      },
      children: [
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          h('strong', { style: { fontSize: '14px' }, children: '识图（大肥鱼看懂图）' }),
          h('label', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }, children: [
            h('input', { type: 'checkbox', checked: cfg.enabled, onChange: (event: Event) => patch({ enabled: (event.target as HTMLInputElement).checked }) }),
            '开启',
          ] }),
        ] }),
        h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: '大肥鱼没有视觉，需要外挂一个视觉模型（OpenAI / Anthropic / Gemini 兼容接口都行）。填好后在聊天页右下角点鲸鱼按钮发图。' }),
        h('div', { children: [h('span', { style: labelStyle, children: '接口地址（打到 /v1 这一层）' }), h('input', { style: fieldStyle, value: cfg.apiBase, onChange: (event: Event) => patch({ apiBase: (event.target as HTMLInputElement).value }) })] }),
        h('div', { children: [h('span', { style: labelStyle, children: 'API Key' }), h('input', { style: fieldStyle, type: 'password', value: apiKey, placeholder: keyPlaceholder, onChange: (event: Event) => setApiKey((event.target as HTMLInputElement).value) })] }),
        h('div', { children: [h('span', { style: labelStyle, children: '模型名' }), h('input', { style: fieldStyle, value: cfg.model, placeholder: 'gpt-4o-mini / qwen-vl-max / claude-…', onChange: (event: Event) => patch({ model: (event.target as HTMLInputElement).value }) })] }),
        h('div', { children: [h('span', { style: labelStyle, children: '协议' }), h('select', { style: fieldStyle, value: cfg.protocol, onChange: (event: Event) => patch({ protocol: (event.target as HTMLSelectElement).value }), children: PROTOCOLS.map(([value, label]) => h('option', { key: value, value, children: label })) })] }),
        h('div', { children: [h('span', { style: labelStyle, children: '识图提示词（告诉外挂模型怎么描述图片）' }), h('textarea', { style: { ...fieldStyle, minHeight: '72px' }, rows: 3, value: cfg.prompt, onChange: (event: Event) => patch({ prompt: (event.target as HTMLTextAreaElement).value }) })] }),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' }, children: [
          h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void save(), children: '保存' }),
          h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void pullModels(), children: '拉模型列表' }),
          h('button', { type: 'button', style: buttonStyle, disabled: busy, onClick: () => void load(), children: '重新读取' }),
        ] }),
        models.length > 0
          ? h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' }, children: models.slice(0, 40).map((model) => h('button', { key: model, type: 'button', style: buttonStyle, onClick: () => patch({ model }), children: model })) })
          : null,
        status
          ? h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-word' }, children: status })
          : null,
      ],
    })
  }
}

/**
 * 聊天页右下角的鲸鱼按钮：选图 → 宿主识图 → 注入当前会话。
 * 返回清理函数（客户端 apply 的返回值就是 disposer）。
 */
export function mountVisionFab(deps: {
  injectText?: (text: string) => Promise<boolean> | boolean
  /** 入口收在形象菜单里时设 true：不显示独立 🐳 按钮。 */
  hideFab?: boolean
  expose?: (api: { open: () => void; close: () => void }) => void
}): () => void {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return () => undefined

  const style = doc.createElement('style')
  style.textContent = `
    #dafeiyu-vision-fab { position: fixed; right: 20px; bottom: 88px; width: 44px; height: 44px; border-radius: 12px;
      border: 1px solid var(#1f3b63); background: var(#0d1117);
      color: #4b7bec; cursor: pointer; z-index: 2147483000; box-shadow: 0 4px 14px rgba(0,0,0,.3);
      display: flex; align-items: center; justify-content: center; font-size: 20px; }
    #dafeiyu-vision-fab:hover { border-color: #4b7bec; }
  #dafeiyu-vision-fab[hidden] { display: none !important; }
    #dafeiyu-vision-panel { position: fixed; right: 20px; bottom: 140px; width: 320px; max-height: 70vh; overflow: auto;
      padding: 12px; border-radius: 12px; border: 1px solid var(#1f3b63);
      background: var(#0d1117); color: var(#7fb0ff);
      z-index: 2147483001; display: none; box-shadow: 0 8px 26px rgba(0,0,0,.4); font-size: 13px; }
    #dafeiyu-vision-panel.open { display: block; }
    #dafeiyu-vision-result { width: 100%; min-height: 120px; margin-top: 8px; box-sizing: border-box;
      background: transparent; color: inherit; border: 1px solid var(#1f3b63); border-radius: 8px; padding: 8px; }
    #dafeiyu-vision-note { color: var(#4b7bec); font-size: 12px; margin-top: 6px; word-break: break-word; }
  `
  doc.head?.appendChild(style)

  const fab = doc.createElement('button')
  fab.id = 'dafeiyu-vision-fab'
  fab.title = '大肥鱼识图：点一下选图'
  fab.textContent = '🐳'
  doc.body.appendChild(fab)
  if (deps.hideFab === true) fab.hidden = true

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-vision-panel'
  const head = doc.createElement('div')
  head.style.cssText = 'display:flex; align-items:center; gap:8px;'
  const title = doc.createElement('div')
  title.textContent = '发一张图给大肥鱼看'
  title.style.cssText = 'flex:1; font-weight:600;'
  const closePanel = doc.createElement('button')
  closePanel.type = 'button'
  closePanel.textContent = '✕'
  closePanel.title = '关闭'
  closePanel.style.cssText = 'background:transparent; border:0; color:inherit; cursor:pointer; font-size:15px;'
  closePanel.addEventListener('click', () => panel.classList.remove('open'))
  head.append(title, closePanel)
  const input = doc.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.style.marginTop = '8px'
  const result = doc.createElement('textarea')
  result.id = 'dafeiyu-vision-result'
  result.placeholder = '识别结果会出现在这里'
  const actions = doc.createElement('div')
  actions.style.cssText = 'display:flex; gap:8px; margin-top:8px; flex-wrap:wrap'
  const sendBtn = doc.createElement('button')
  sendBtn.textContent = '发送到当前会话'
  sendBtn.style.cssText = 'padding:4px 10px; border-radius:6px; border:1px solid var(#1f3b63); background:transparent; color:inherit; cursor:pointer'
  const copyBtn = doc.createElement('button')
  copyBtn.textContent = '复制'
  copyBtn.style.cssText = sendBtn.style.cssText
  const note = doc.createElement('div')
  note.id = 'dafeiyu-vision-note'
  actions.append(sendBtn, copyBtn)
  panel.append(head, input, result, actions, note)
  doc.body.appendChild(panel)

  let recognized = ''
  let busy = false

  const setNote = (text: string): void => {
    note.textContent = text
  }

  const recognize = async (file: File): Promise<void> => {
    if (busy) return
    busy = true
    setNote('识别中…（大图可能要十几秒）')
    try {
      const base64 = await fileToBase64(file)
      const response = await callJson(`${VISION_BASE}/recognize`, { imageBase64: base64, mime: file.type || 'image/png' }, 120_000)
      if (response.ok && typeof response.text === 'string') {
        recognized = response.text
        result.value = recognized
        setNote('识别完成：点「发送到当前会话」让大肥鱼基于它回答')
      } else {
        setNote(`识别失败：${String(response.error ?? '未知错误')}`)
      }
    } catch (error) {
      setNote(`识别失败：${String((error as Error)?.message ?? error)}`)
    } finally {
      busy = false
    }
  }

  input.addEventListener('change', (): void => {
    const file = input.files?.[0]
    if (file) void recognize(file)
  })

  sendBtn.addEventListener('click', (): void => {
    if (recognized === '') {
      setNote('还没有识别结果')
      return
    }
    const text = `【图片识别】\n${recognized}`
    try {
      const maybe = deps.injectText?.(text)
      if (maybe && typeof (maybe as Promise<boolean>).then === 'function') {
        void (maybe as Promise<boolean>).then((ok) => setNote(ok ? '已发到当前会话' : '没找到当前会话：请复制后自己发'))
      } else {
        setNote(maybe ? '已发到当前会话' : '没找到当前会话：请复制后自己发')
      }
    } catch {
      setNote('发送失败：请复制后自己发')
    }
  })

  copyBtn.addEventListener('click', (): void => {
    if (recognized === '') return
    void (async (): Promise<void> => {
      try {
        await navigator.clipboard.writeText(recognized)
        setNote('已复制')
      } catch {
        result.select()
        setNote('复制失败：已全选，按 Ctrl+C')
      }
    })()
  })

  fab.addEventListener('click', () => {
    panel.classList.toggle('open')
    if (panel.classList.contains('open')) setNote('选一张图，识别结果会出现在下面')
  })

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') panel.classList.remove('open')
  }
  doc.addEventListener('keydown', onKey)

  deps.expose?.({
    open: () => {
      if (!panel.classList.contains('open')) fab.click()
    },
    close: () => panel.classList.remove('open'),
  })

  const cleanup = (): void => {
    try {
      doc.removeEventListener('keydown', onKey)
      fab.remove()
      panel.remove()
      style.remove()
    } catch {
      /* 页面可能已经卸载 */
    }
  }
  return cleanup
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      const comma = value.indexOf(',')
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(new Error('读不出文件'))
    reader.readAsDataURL(file)
  })
}
