/**
 * avatar-widget — 聊天页的虚拟形象小窗（0.15：默认右侧 + 可拖动）。
 *
 * 行为：
 * - 默认贴右下（会话列表在左侧，不挡列表）；拖动后位置记在 localStorage；
 * - 点一下暂停/继续，按住拖动换位置，双击回到默认位置；
 * - 每 2.5s 问一次 `/avatar/state?sessionId=`，按 agent 状态自动切动作：
 *   running → 动脑（think）；回复到达后的 2.5 秒 → 讲话（talk）；其余 → 待机（idle）。
 *
 * 纪律：所有 DOM 操作都包 try；素材缺失就整块隐藏。
 */
import { resolveHostUrl } from './host-url.js'

type AvatarStateView = {
  id: string
  label: string
  cols: number
  rows: number
  frames: number
  cellWidth: number
  cellHeight: number
  file: string
}

const BASE = '/api/dsh-remote-dafeiyu/avatar'
const FPS = 24
/**
 * 语义状态 → 动作池（权重越高越常出现）。
 *
 * 用户要的是“一个状态对应多种动画，不然太单调”，所以这里不是一个状态一个动作，
 * 而是一个池子：进入状态时随机挑一个，播完一轮再挑下一个（尽量不连着重复）。
 * 池里引用的 id 在 manifest 里不存在时自动跳过——素材没补全也不会崩。
 */
const STATE_POOLS: Record<'idle' | 'think' | 'talk', Array<{ id: string; weight: number; loops?: number }>> = {
  idle: [
    { id: 'idle', weight: 60, loops: 2 },
    { id: 'nap', weight: 25, loops: 2 },
    { id: 'eat', weight: 15, loops: 1 },
  ],
  think: [
    { id: 'think', weight: 60, loops: 1 },
    { id: 'eat', weight: 25, loops: 1 },
    { id: 'sneak', weight: 15, loops: 1 },
  ],
  talk: [
    { id: 'talk', weight: 65, loops: 1 },
    { id: 'dance', weight: 20, loops: 1 },
    { id: 'tsundere', weight: 15, loops: 1 },
  ],
}
/** 点一下的反应：先播「蹭得累」再回到当前状态。 */
const POKE_CLIP = 'tsundere'
const POKE_MS = 1800
const WIDGET_WIDTH = 132
const POS_KEY = 'drc.avatarWidgetPos'
const DRAG_SLOP = 4

export interface AvatarWidgetDeps {
  getCurrentSession: () => string | undefined | null
}

export function mountAvatarWidget(deps: AvatarWidgetDeps): () => void {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return () => {}
  const styleId = 'dafeiyu-avatar-widget-style'
  const existing = doc.getElementById(styleId)
  if (existing) existing.remove()
  const style = doc.createElement('style')
  style.id = styleId
  style.textContent = `
#dafeiyu-avatar-widget { position: fixed; left: 24px; top: 120px; width: ${WIDGET_WIDTH}px; z-index: 2147482999;
  display: flex; flex-direction: column; align-items: center; gap: 2px; }
#dafeiyu-avatar-widget[hidden] { display: none !important; }
#dafeiyu-avatar-widget .sprite { width: ${WIDGET_WIDTH}px; aspect-ratio: var(--dafeiyu-avatar-ratio, 354 / 480);
  border-radius: 12px; background-repeat: no-repeat; cursor: grab; touch-action: none;
  filter: drop-shadow(0 6px 16px rgba(0,0,0,.25)); }
#dafeiyu-avatar-widget .sprite.dragging { cursor: grabbing; }
#dafeiyu-avatar-widget .hint { font-size: 10px; color: rgba(127,127,127,.85); user-select: none; pointer-events: none; }
`
  doc.head.appendChild(style)

  const wrap = doc.createElement('div')
  wrap.id = 'dafeiyu-avatar-widget'
  wrap.hidden = true
  const sprite = doc.createElement('div')
  sprite.className = 'sprite'
  const hint = doc.createElement('div')
  hint.className = 'hint'
  hint.textContent = '拖动换位置 · 点按逗它'
  wrap.append(sprite, hint)
  doc.body.appendChild(wrap)

  let states: AvatarStateView[] = []
  let current: AvatarStateView | undefined
  let frame = 0
  let playing = true
  let timer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let lastStatus: 'running' | 'idle' | undefined
  let talkUntil = 0
  let stateKey: 'idle' | 'think' | 'talk' = 'idle'
  let clipUntil = 0
  let pokeUntil = 0
  let lastClipId: string | undefined
  let disposed = false
  let placed = false
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | undefined

  const viewport = (): { w: number; h: number } => {
    const w = doc.documentElement?.clientWidth || (globalThis as { innerWidth?: number }).innerWidth || 1280
    const h = doc.documentElement?.clientHeight || (globalThis as { innerHeight?: number }).innerHeight || 800
    return { w, h }
  }

  const spriteHeight = (): number => {
    const ratio = current ? current.cellHeight / current.cellWidth : 480 / 354
    return Math.round(WIDGET_WIDTH * ratio)
  }

  const clamp = (x: number, y: number): { x: number; y: number } => {
    const { w, h } = viewport()
    return {
      x: Math.min(Math.max(8, x), Math.max(8, w - WIDGET_WIDTH - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, h - spriteHeight() - 40)),
    }
  }

  const place = (x: number, y: number, persist: boolean): void => {
    const p = clamp(x, y)
    wrap.style.left = p.x + 'px'
    wrap.style.top = p.y + 'px'
    placed = true
    if (persist) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(p))
      } catch {
        /* 隐私模式可能禁止 localStorage */
      }
    }
  }

  const defaultPosition = (): { x: number; y: number } => {
    const { w, h } = viewport()
    // 右上角贴边：会话列表在左、输入框在底，这里都不挡
    return { x: w - WIDGET_WIDTH - 24, y: 96 }
  }

  const restoreOrDefault = (): void => {
    let saved: { x?: unknown; y?: unknown } | null = null
    try {
      const raw = localStorage.getItem(POS_KEY)
      saved = raw ? (JSON.parse(raw) as { x?: unknown; y?: unknown }) : null
    } catch {
      saved = null
    }
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      place(Number(saved.x), Number(saved.y), false)
    } else {
      const p = defaultPosition()
      place(p.x, p.y, false)
    }
  }

  const paint = (): void => {
    if (!current) return
    const col = frame % current.cols
    const row = Math.floor(frame / current.cols) % current.rows
    sprite.style.backgroundPosition = `${(col / Math.max(1, current.cols - 1)) * 100}% ${(row / Math.max(1, current.rows - 1)) * 100}%`
    frame = (frame + 1) % current.frames
  }

  const available = (id: string): boolean => states.some((state) => state.id === id)

  const pickClip = (pool: Array<{ id: string; weight: number; loops?: number }>): { id: string; loops: number } | undefined => {
    const options = pool.filter((entry) => available(entry.id))
    if (options.length === 0) return undefined
    const fresh = options.filter((entry) => entry.id !== lastClipId)
    const use = fresh.length > 0 ? fresh : options
    const total = use.reduce((sum, entry) => sum + entry.weight, 0)
    let roll = Math.random() * total
    for (const entry of use) {
      roll -= entry.weight
      if (roll <= 0) return { id: entry.id, loops: entry.loops ?? 1 }
    }
    const last = use[use.length - 1]!
    return { id: last.id, loops: last.loops ?? 1 }
  }

  const playClip = (id: string | undefined, loops: number): void => {
    if (id === undefined) return
    const state = states.find((row) => row.id === id)
    if (state === undefined) return
    if (current?.id !== state.id) {
      current = state
      frame = 0
      wrap.style.setProperty('--dafeiyu-avatar-ratio', `${state.cellWidth} / ${state.cellHeight}`)
      sprite.style.backgroundImage = `url(${resolveHostUrl(`${BASE}/sheet?id=${encodeURIComponent(state.id)}`)})`
      sprite.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`
      if (!placed) restoreOrDefault()
      paint()
    }
    lastClipId = state.id
    clipUntil = Date.now() + Math.max(1, loops) * (state.frames / FPS) * 1000
  }

  /** 进入语义状态：从池子里挑一个动作；已经在池内动作时尽量不打断。 */
  const enterState = (next: 'idle' | 'think' | 'talk'): void => {
    const changed = next !== stateKey
    stateKey = next
    if (!changed && Date.now() < clipUntil) return
    const clip = pickClip(STATE_POOLS[next])
    if (clip) playClip(clip.id, clip.loops)
  }

  const apply = (state: AvatarStateView | undefined): void => {
    if (!state) {
      wrap.hidden = true
      return
    }
    if (current?.id !== state.id) {
      // 首次拿到素材时由 apply 兜底；后续动作切换统一走 playClip
      current = state
      frame = 0
      wrap.style.setProperty('--dafeiyu-avatar-ratio', `${state.cellWidth} / ${state.cellHeight}`)
      sprite.style.backgroundImage = `url(${resolveHostUrl(`${BASE}/sheet?id=${encodeURIComponent(state.id)}`)})`
      sprite.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`
      if (!placed) restoreOrDefault()
      paint()
    }
    wrap.hidden = false
    hint.textContent = '拖动换位置 · 点按逗它'
  }

  const targetId = (): string => {
    const status = (globalThis as Record<string, unknown>).__dafeiyuAvatarStatus as string | undefined
    if (status === 'running') return 'think'
    if (Date.now() < talkUntil) return 'talk'
    return 'idle'
  }

  const refresh = (): void => {
    if (disposed) return
    const session = deps.getCurrentSession?.()
    if (!session) {
      wrap.hidden = true
      return
    }
    void (async () => {
      try {
        const response = await fetch(resolveHostUrl(`${BASE}/state?sessionId=${encodeURIComponent(session)}`), { signal: AbortSignal.timeout(4000) })
        const answer = (await response.json()) as { status?: string }
        const status = answer.status === 'running' ? 'running' : 'idle'
        if (lastStatus === 'running' && status === 'idle') talkUntil = Date.now() + 2000
        lastStatus = status
        ;(globalThis as Record<string, unknown>).__dafeiyuAvatarStatus = status
        if (!current) {
          const fallback = states.find((state) => state.id === 'idle') ?? states[0]
          apply(fallback)
        }
        if (Date.now() < pokeUntil) {
          wrap.hidden = false
          return
        }
        enterState(targetId() as 'idle' | 'think' | 'talk')
      } catch {
        if (!current) apply(states.find((state) => state.id === 'idle') ?? states[0])
        else enterState('idle')
      }
    })()
  }

  void (async () => {
    try {
      const response = await fetch(resolveHostUrl(`${BASE}/manifest`), { signal: AbortSignal.timeout(8000) })
      const answer = (await response.json()) as { ok?: boolean; manifest?: { states?: AvatarStateView[] } | null }
      if (answer.ok === true && answer.manifest && Array.isArray(answer.manifest.states) && answer.manifest.states.length > 0) {
        states = answer.manifest.states
        apply(states.find((state) => state.id === 'idle') ?? states[0])
      }
    } catch {
      /* 没素材就整块隐藏 */
    }
  })()

  // 拖动 + 点按
  const onDown = (event: PointerEvent): void => {
    if (event.button !== undefined && event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY, left: parseFloat(wrap.style.left) || 0, top: parseFloat(wrap.style.top) || 0, moved: false }
    sprite.classList.add('dragging')
    try {
      sprite.setPointerCapture(event.pointerId)
    } catch {
      /* 老浏览器 */
    }
  }
  const onMove = (event: PointerEvent): void => {
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > DRAG_SLOP) drag.moved = true
    if (drag.moved) place(drag.left + dx, drag.top + dy, false)
  }
  const onUp = (): void => {
    if (!drag) return
    const moved = drag.moved
    drag = undefined
    sprite.classList.remove('dragging')
    if (moved) {
      place(parseFloat(wrap.style.left) || 0, parseFloat(wrap.style.top) || 0, true)
    } else {
      // 点一下 = 逗它：先播「蹭得累」，播完自动回到当前状态
      if (available(POKE_CLIP)) {
        pokeUntil = Date.now() + POKE_MS
        playClip(POKE_CLIP, 1)
      }
    }
  }
  const onDouble = (): void => {
    const p = defaultPosition()
    place(p.x, p.y, true)
  }
  const onResize = (): void => {
    if (!placed) return
    place(parseFloat(wrap.style.left) || 0, parseFloat(wrap.style.top) || 0, false)
  }

  sprite.addEventListener('pointerdown', onDown)
  sprite.addEventListener('pointermove', onMove)
  sprite.addEventListener('pointerup', onUp)
  sprite.addEventListener('pointercancel', onUp)
  sprite.addEventListener('dblclick', onDouble)
  ;(globalThis as { addEventListener?: (type: string, listener: () => void) => void }).addEventListener?.('resize', onResize)

  timer = setInterval(() => {
    if (playing) paint()
  }, Math.round(1000 / FPS))
  pollTimer = setInterval(refresh, 2500)
  // 每个动作播完后，从当前状态的池子里再挑一个（这就是“一个状态多种动画”）
  setInterval(() => {
    if (disposed || !playing) return
    if (Date.now() < pokeUntil) return
    if (Date.now() >= clipUntil) enterState(stateKey)
  }, 400)
  refresh()

  return () => {
    disposed = true
    drag = undefined
    if (timer) clearInterval(timer)
    if (pollTimer) clearInterval(pollTimer)
    try {
      wrap.remove()
      style.remove()
    } catch {
      /* 宿主可能已经拆了 */
    }
  }
}
