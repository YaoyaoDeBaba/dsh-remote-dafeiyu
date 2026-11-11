/**
 * xyq-quick —— 形象菜单里的「小云雀」面板（0.25）。
 *
 * 一块面板完成：写 prompt → 选模型（生图/生视频自动切参数）→ 调比例/分辨率/时长/数量
 * → 看预计积分 → 生成 → 轮询结果 → 预览产物。右上角齿轮打开二级窗口填 Access Key。
 */
import { resolveHostUrl } from './host-url.js'

const BASE = '/api/dsh-remote-dafeiyu/xyq'
const PRICE_PER_SECOND: Record<string, number> = {
  'Seedance_2.0_mini_lite': 4,
  'Seedance_2.0_mini': 6,
  'Seedance_2.5': 20,
  'Seedance_2.5_draft': 2,
  'seedance2.0_vision': 12,
  'seedance2.0_fast_vision': 8,
}
const PRICE_PER_IMAGE: Record<string, number> = {
  '智能图片V2.5 Fast': 2,
  '智能图片V2.5 Pro': 6,
}

interface ModelOption {
  type: 'image' | 'video'
  /** 提交/查询用的标识：生图=完整名称；生视频=模型 key。 */
  key: string
  name: string
}

export interface XyqQuickHandle {
  open(): void
  dispose(): void
}

async function getJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(resolveHostUrl(path), { signal: AbortSignal.timeout(30_000) })
  return (await response.json()) as Record<string, unknown>
}

async function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(resolveHostUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
    body: JSON.stringify(body),
  })
  return (await response.json()) as Record<string, unknown>
}

export function mountXyqQuick(): XyqQuickHandle {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return { open: () => {}, dispose: () => {} }

  const styleId = 'dafeiyu-xyq-quick-style'
  doc.getElementById(styleId)?.remove()
  const style = doc.createElement('style')
  style.id = styleId
  style.textContent = `
#dafeiyu-xyq-quick { position: fixed; right: 24px; top: 10vh; width: 480px; max-height: 80vh; overflow: auto; padding: 16px;
  border-radius: 12px; border: 1px solid #1f3b63;
  background: #0d1117; color: #7fb0ff;
  box-shadow: 0 12px 36px rgba(0,0,0,.45); font-size: 13.5px; line-height: 1.55; z-index: 2147483001; display: none; }
#dafeiyu-xyq-quick.open { display: block; }
#dafeiyu-xyq-quick .head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-weight: 600; }
#dafeiyu-xyq-quick .head .grow { flex: 1; }
#dafeiyu-xyq-quick .head button { background: transparent; border: 0; color: inherit; cursor: pointer; font-size: 14px; }
#dafeiyu-xyq-quick textarea { width: 100%; box-sizing: border-box; min-height: 70px; resize: vertical; padding: 8px;
  border-radius: 8px; border: 1px solid #1f3b63; background: transparent; color: inherit; font: inherit; }
#dafeiyu-xyq-quick select, #dafeiyu-xyq-quick input { width: 100%; box-sizing: border-box; padding: 6px 8px; margin-top: 6px;
  border-radius: 8px; border: 1px solid #1f3b63; background: transparent; color: inherit; font: inherit; }
#dafeiyu-xyq-quick .params { display: flex; flex-direction: column; gap: 0; margin-top: 6px; }
#dafeiyu-xyq-quick .line { color: #5f8fe0; margin-top: 6px; font-size: 12px; }
#dafeiyu-xyq-quick .actions { display: flex; gap: 8px; margin-top: 10px; }
#dafeiyu-xyq-quick .actions button { flex: 1; padding: 7px 10px; border-radius: 8px; border: 0; cursor: pointer;
  background: #4b7bec; color: #fff; font-size: 13px; }
#dafeiyu-xyq-quick .actions button.ghost { background: #13233f; color: #8ab4ff; }
#dafeiyu-xyq-quick .result { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
#dafeiyu-xyq-quick .result img, #dafeiyu-xyq-quick .result video { max-width: 100%; border-radius: 8px; }
#dafeiyu-xyq-quick .status { margin-top: 6px; font-size: 12px; color: #4b7bec; }
#dafeiyu-xyq-settings { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: none; align-items: center;
  justify-content: center; z-index: 2147483002; }
#dafeiyu-xyq-settings.open { display: flex; }
#dafeiyu-xyq-settings .box { width: 320px; padding: 14px; border-radius: 12px; border: 1px solid #1f3b63;
  background: #0d1117; color: #7fb0ff; font-size: 13px; }
#dafeiyu-xyq-settings .box .title { font-weight: 600; margin-bottom: 8px; }
#dafeiyu-xyq-settings .box input { width: 100%; box-sizing: border-box; padding: 6px 8px; margin-top: 6px; border-radius: 8px;
  border: 1px solid #1f3b63; background: transparent; color: inherit; font: inherit; }
#dafeiyu-xyq-settings .box .row { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
#dafeiyu-xyq-settings .box button { padding: 5px 12px; border-radius: 8px; border: 1px solid #1f3b63;
  background: transparent; color: inherit; cursor: pointer; font-size: 13px; }

  /* 白底蓝字覆盖（0.31） */
  #dafeiyu-xyq-quick { background: #ffffff !important; color: #1d4ed8 !important; border-color: #c7d9f7 !important; }
  #dafeiyu-xyq-quick textarea, #dafeiyu-xyq-quick select, #dafeiyu-xyq-quick input { background: #ffffff !important; color: #1d3f8f !important; border-color: #c7d9f7 !important; }
  #dafeiyu-xyq-quick .line, #dafeiyu-xyq-quick .status { color: #4a6bb3 !important; }
  #dafeiyu-xyq-quick .actions button { background: #1d4ed8 !important; color: #ffffff !important; }
  #dafeiyu-xyq-quick .actions button.ghost { background: #eaf1ff !important; color: #1d4ed8 !important; }
  #dafeiyu-xyq-quick .head button { color: #1d4ed8 !important; }
  #dafeiyu-xyq-settings .box { background: #ffffff !important; color: #1d4ed8 !important; border-color: #c7d9f7 !important; }
  #dafeiyu-xyq-settings .box input { background: #ffffff !important; color: #1d3f8f !important; border-color: #c7d9f7 !important; }
  #dafeiyu-xyq-settings .box button { background: #eaf1ff !important; color: #1d4ed8 !important; border-color: #c7d9f7 !important; }
`
  doc.head.appendChild(style)

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-xyq-quick'
  const head = doc.createElement('div')
  head.className = 'head'
  const title = doc.createElement('span')
  title.className = 'grow'
  title.textContent = '小云雀'
  const gear = doc.createElement('button')
  gear.type = 'button'
  gear.textContent = '⚙'
  gear.title = '设置 Access Key'
  const close = doc.createElement('button')
  close.type = 'button'
  close.textContent = '✕'
  head.append(title, gear, close)

  const prompt = doc.createElement('textarea')
  prompt.placeholder = '描述你要生成的内容（用户原话，不要扩写）'
  const modelSelect = doc.createElement('select')
  const params = doc.createElement('div')
  params.className = 'params'
  const estimate = doc.createElement('div')
  estimate.className = 'line'
  const balance = doc.createElement('div')
  balance.className = 'line'
  const actions = doc.createElement('div')
  actions.className = 'actions'
  const generate = doc.createElement('button')
  generate.type = 'button'
  generate.textContent = '生成'
  const refreshBtn = doc.createElement('button')
  refreshBtn.type = 'button'
  refreshBtn.className = 'ghost'
  refreshBtn.textContent = '刷新余额'
  actions.append(generate, refreshBtn)
  const status = doc.createElement('div')
  status.className = 'status'
  const result = doc.createElement('div')
  result.className = 'result'
  panel.append(head, prompt, modelSelect, params, estimate, balance, actions, status, result)
  doc.body.appendChild(panel)

  // 设置二级窗口
  const overlay = doc.createElement('div')
  overlay.id = 'dafeiyu-xyq-settings'
  const box = doc.createElement('div')
  box.className = 'box'
  const boxTitle = doc.createElement('div')
  boxTitle.className = 'title'
  boxTitle.textContent = '小云雀 Access Key'
  const keyInput = doc.createElement('input')
  keyInput.type = 'password'
  keyInput.placeholder = '粘贴 Access Key'
  const keyHint = doc.createElement('div')
  keyHint.className = 'line'
  keyHint.textContent = '在 小云雀官网 → ⚡CLI/API → API → 管理 Access Key 新建'
  const boxRow = doc.createElement('div')
  boxRow.className = 'row'
  const cancel = doc.createElement('button')
  cancel.type = 'button'
  cancel.textContent = '取消'
  const saveKey = doc.createElement('button')
  saveKey.type = 'button'
  saveKey.textContent = '保存'
  boxRow.append(cancel, saveKey)
  box.append(boxTitle, keyInput, keyHint, boxRow)
  overlay.appendChild(box)
  doc.body.appendChild(overlay)

  let options: ModelOption[] = []
  let paramSpec: { ratio?: { options: Array<string | number>; labels?: Record<string, string>; default?: string | number }; resolution?: { options: string[]; default?: string }; duration?: { min: number; max: number; default: number } } = {}
  let busy = false
  let pollTimer: ReturnType<typeof setInterval> | undefined

  const clearPoll = (): void => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = undefined
  }
  const setStatus = (text: string): void => {
    status.textContent = text
  }

  const selected = (): ModelOption | undefined => {
    const value = modelSelect.value
    return options.find((entry) => `${entry.type}::${entry.key}` === value)
  }

  const refreshBalance = async (): Promise<void> => {
    try {
      const answer = await getJson(`${BASE}/balance`)
      balance.textContent = answer.ok === true ? `剩余积分：${String(answer.totalRemain ?? '未知')}` : String(answer.message ?? '余额读取失败')
    } catch (error) {
      balance.textContent = `余额读取失败：${String((error as Error)?.message ?? error)}`
    }
  }

  const loadModels = async (): Promise<void> => {
    setStatus('正在读取模型…')
    try {
      const [images, videos] = await Promise.all([getJson(`${BASE}/models?type=image`), getJson(`${BASE}/models?type=video`)])
      const list: ModelOption[] = []
      for (const row of Array.isArray(images.models) ? (images.models as Array<Record<string, unknown>>) : []) {
        if (typeof row.name === 'string') list.push({ type: 'image', key: row.name, name: row.name })
      }
      for (const row of Array.isArray(videos.models) ? (videos.models as Array<Record<string, unknown>>) : []) {
        if (typeof row.name !== 'string') continue
        list.push({ type: 'video', key: typeof row.key === 'string' && row.key !== '' ? row.key : row.name, name: row.name })
      }
      options = list
      modelSelect.textContent = ''
      for (const option of options) {
        const element = doc.createElement('option')
        element.value = `${option.type}::${option.key}`
        element.textContent = `${option.type === 'image' ? '🖼 ' : '🎬 '}${option.name}`
        modelSelect.appendChild(element)
      }
      if (options.length > 0) await onModelChange()
      else setStatus('没有可用模型')
    } catch (error) {
      setStatus(`读取模型失败：${String((error as Error)?.message ?? error)}`)
    }
  }

  const fillSelect = (label: string, values: Array<{ value: string; text: string }>, current?: string): HTMLSelectElement => {
    const wrapper = doc.createElement('label')
    wrapper.style.display = 'block'
    const text = doc.createElement('span')
    text.className = 'line'
    text.textContent = label
    const select = doc.createElement('select')
    for (const value of values) {
      const element = doc.createElement('option')
      element.value = value.value
      element.textContent = value.text
      select.appendChild(element)
    }
    if (current !== undefined && values.some((value) => value.value === String(current))) select.value = String(current)
    wrapper.append(text, select)
    params.appendChild(wrapper)
    return select
  }

  const updateEstimate = (): void => {
    const option = selected()
    if (!option) {
      estimate.textContent = '预计消耗：—'
      return
    }
    if (option.type === 'video') {
      const duration = Number((panel.querySelector('select[data-param="duration"]') as HTMLSelectElement | null)?.value ?? paramSpec.duration?.default ?? 5)
      const price = PRICE_PER_SECOND[option.key] ?? Object.entries(PRICE_PER_SECOND).find(([key]) => option.key === key)?.[1]
      estimate.textContent = price ? `预计消耗：约 ${duration * price} 积分（${duration}s × ${price}/s，参考）` : '预计消耗：以实际扣费为准'
    } else {
      const count = Number((panel.querySelector('select[data-param="count"]') as HTMLSelectElement | null)?.value ?? 1)
      const price = PRICE_PER_IMAGE[option.name]
      estimate.textContent = price ? `预计消耗：约 ${count * price} 积分（参考）` : '预计消耗：以实际扣费为准'
    }
  }

  const onModelChange = async (): Promise<void> => {
    const option = selected()
    params.textContent = ''
    paramSpec = {}
    updateEstimate()
    if (!option) return
    setStatus('正在读取模型参数…')
    try {
      const answer = await getJson(`${BASE}/describe?name=${encodeURIComponent(option.key)}&type=${option.type}`)
      if (answer.ok !== true) {
        setStatus(String(answer.message ?? '读取模型参数失败'))
        return
      }
      const model = (answer.model ?? {}) as Record<string, any>
      paramSpec.ratio = model.ratio
      paramSpec.resolution = model.resolution
      paramSpec.duration = model.duration
      if (option.type === 'image') {
        if (model.ratio?.options) {
          const labels = model.ratio.option_labels ?? {}
          fillSelect('比例', model.ratio.options.map((value: string | number) => ({ value: String(value), text: String(labels[String(value)] ?? String(value)) })), model.ratio.default)
        }
        if (model.resolution?.options) {
          fillSelect('分辨率', model.resolution.options.map((value: string) => ({ value, text: value })), model.resolution.default)
        }
        fillSelect('数量', [1, 2, 3, 4].map((n) => ({ value: String(n), text: String(n) + ' 张' })), '1')
      } else {
        if (model.duration) {
          const min = Number(model.duration.min ?? 4)
          const max = Number(model.duration.max ?? 10)
          const values: Array<{ value: string; text: string }> = []
          for (let d = min; d <= max; d += 1) values.push({ value: String(d), text: `${d} 秒` })
          const select = fillSelect('时长', values, model.duration.default ?? min)
          select.dataset.param = 'duration'
          select.addEventListener('change', updateEstimate)
        }
        if (model.ratio?.options) {
          const labels = model.ratio.option_labels ?? {}
          fillSelect('画幅比例', model.ratio.options.map((value: string | number) => ({ value: String(value), text: String(labels[String(value)] ?? String(value)) })), model.ratio.default)
        }
        if (model.resolution?.options) {
          fillSelect('分辨率', model.resolution.options.map((value: string) => ({ value, text: value })), model.resolution.default)
        }
      }
      // 数量选择也要触发估价
      const countSelect = params.querySelector('select:last-of-type') as HTMLSelectElement | null
      if (countSelect && option.type === 'image') countSelect.addEventListener('change', updateEstimate)
      setStatus('')
      updateEstimate()
    } catch (error) {
      setStatus(`读取模型参数失败：${String((error as Error)?.message ?? error)}`)
    }
  }

  const readParam = (index: number): string | undefined => {
    const selects = params.querySelectorAll('select')
    const element = selects[index] as HTMLSelectElement | undefined
    return element?.value
  }

  const startGenerate = async (): Promise<void> => {
    if (busy) return
    const option = selected()
    const text = prompt.value.trim()
    if (!option) return setStatus('先选一个模型')
    if (text === '') return setStatus('先写 prompt')
    busy = true
    generate.disabled = true
    clearPoll()
    result.textContent = ''
    setStatus('提交中…')
    try {
      const payload: Record<string, unknown> = { type: option.type, prompt: text, model: option.key, sessionKey: 'xyq-panel' }
      if (option.type === 'image') {
        const selects = params.querySelectorAll('select')
        if (selects[0]) payload.ratio = (selects[0] as HTMLSelectElement).value
        if (selects[1]) payload.resolution = (selects[1] as HTMLSelectElement).value
        if (selects[2]) payload.count = Number((selects[2] as HTMLSelectElement).value)
      } else {
        const selects = params.querySelectorAll('select')
        let i = 0
        if (paramSpec.duration) payload.duration = Number((selects[i++] as HTMLSelectElement).value)
        if (paramSpec.ratio) payload.ratio = (selects[i++] as HTMLSelectElement).value
        if (paramSpec.resolution) payload.resolution = (selects[i++] as HTMLSelectElement).value
      }
      const answer = await postJson(`${BASE}/generate`, payload)
      if (answer.ok !== true) throw new Error(String(answer.message ?? answer.error ?? '提交失败'))
      const threadId = String(answer.threadId ?? '')
      const runId = String(answer.runId ?? '')
      if (!threadId || !runId) throw new Error('没有拿到任务 id')
      setStatus('已提交，等待出片…')
      void refreshBalance()
      const started = Date.now()
      pollTimer = setInterval(() => {
        void (async () => {
          try {
            const state = await getJson(`${BASE}/result?threadId=${encodeURIComponent(threadId)}&runId=${encodeURIComponent(runId)}`)
            if (state.ok !== true) throw new Error(String(state.message ?? '查询失败'))
            const st = String(state.status ?? '')
            if (st === 'succeeded') {
              clearPoll()
              busy = false
              generate.disabled = false
              setStatus('已完成')
              for (const file of Array.isArray(state.files) ? (state.files as string[]) : []) {
                const url = resolveHostUrl(`${BASE}/file?path=${encodeURIComponent(file)}`)
                if (/\.(png|jpe?g|webp)$/i.test(file)) {
                  const img = doc.createElement('img')
                  img.src = url
                  result.appendChild(img)
                } else {
                  const video = doc.createElement('video')
                  video.src = url
                  video.controls = true
                  result.appendChild(video)
                }
              }
              void refreshBalance()
            } else if (st === 'failed' || st === 'canceled' || st === 'interrupted') {
              clearPoll()
              busy = false
              generate.disabled = false
              setStatus(`任务${st === 'canceled' ? '被取消' : '失败'}`)
            } else if (Date.now() - started > 15 * 60_000) {
              clearPoll()
              busy = false
              generate.disabled = false
              setStatus('等待超时，任务可能还在跑；稍后到网页端查看')
            } else {
              setStatus(`生成中…（${Math.round((Date.now() - started) / 1000)}s）`)
            }
          } catch (error) {
            clearPoll()
            busy = false
            generate.disabled = false
            setStatus(`查询失败：${String((error as Error)?.message ?? error)}`)
          }
        })()
      }, 2500)
    } catch (error) {
      busy = false
      generate.disabled = false
      setStatus(`生成失败：${String((error as Error)?.message ?? error)}`)
    }
  }

  modelSelect.addEventListener('change', () => void onModelChange())
  generate.addEventListener('click', () => void startGenerate())
  refreshBtn.addEventListener('click', () => void refreshBalance())
  close.addEventListener('click', () => panel.classList.remove('open'))
  gear.addEventListener('click', async () => {
    overlay.classList.add('open')
    keyInput.value = ''
    try {
      const answer = await getJson(`${BASE}/config`)
      const cfg = (answer.config ?? {}) as Record<string, unknown>
      keyHint.textContent = cfg.accessKeySet === true ? `已设置（${String(cfg.accessKeyHint ?? '')}），重新输入会覆盖` : '尚未设置'
    } catch {
      /* 忽略 */
    }
  })
  cancel.addEventListener('click', () => overlay.classList.remove('open'))
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.classList.remove('open')
  })
  saveKey.addEventListener('click', async () => {
    const value = keyInput.value.trim()
    if (value === '') return
    try {
      const answer = await postJson(`${BASE}/config`, { accessKey: value })
      if (answer.ok !== true) throw new Error(String(answer.error ?? '保存失败'))
      keyInput.value = ''
      overlay.classList.remove('open')
      setStatus('Access Key 已保存')
      await refreshBalance()
    } catch (error) {
      keyHint.textContent = `保存失败：${String((error as Error)?.message ?? error)}`
    }
  })

  const onClick = (event: MouseEvent): void => {
    if (!panel.classList.contains('open')) return
    const target = event.target as Node | null
    if (target && panel.contains(target)) return
    panel.classList.remove('open')
  }
  doc.addEventListener('click', onClick)

  return {
    open(): void {
      panel.classList.add('open')
      void refreshBalance()
      if (options.length === 0) void loadModels()
    },
    dispose(): void {
      clearPoll()
      doc.removeEventListener('click', onClick)
      panel.remove()
      overlay.remove()
      style.remove()
    },
  }
}
