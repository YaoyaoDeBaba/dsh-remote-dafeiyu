/**
 * avatar-widget — 聊天页的虚拟形象小窗（0.21：双层交叉切换，杜绝闪白）。
 *
 * 闪白的原因不是“图没预加载”，而是单层元素换 background-image 时，浏览器要重新
 * 光栅化这一层（尤其大图 + drop-shadow），中间会有一帧空白。修法：两块同尺寸的
 * 图层，新动作先画在后台层，下一帧再把前后层对调——旧帧一直在，绝不会白。
 *
 * 其余行为不变：默认右上、可拖动并记位置、双击复位、点按逗它（蹭得累）、
 * 待机/干活/交付三个动作池随机播放。
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
const WIDGET_WIDTH = 132
const POS_KEY = 'drc.avatarWidgetPos'
const DRAG_SLOP = 4

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
const POKE_CLIP = 'tsundere'
const POKE_MS = 1800

export interface AvatarWidgetDeps {
  getCurrentSession: () => string | undefined | null
  /** 点击菜单项：派活助手 / 小云雀 / 肥鱼识图（入口都收在形象身上）。 */
  onMenuAction?: (id: 'subagents' | 'xyq' | 'vision') => void
}

export function mountAvatarWidget(deps: AvatarWidgetDeps): () => void {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return () => {}
  const previous = (globalThis as Record<string, unknown>).__dafeiyuAvatarCleanup
  if (typeof previous === 'function') {
    try {
      ;(previous as () => void)()
    } catch {
      /* 旧实例已经拆过 */
    }
  }
  for (const stale of Array.from(doc.querySelectorAll('#dafeiyu-avatar-widget'))) {
    try {
      stale.remove()
    } catch {
      /* ignore */
    }
  }

  const styleId = 'dafeiyu-avatar-widget-style'
  const existing = doc.getElementById(styleId)
  if (existing) existing.remove()
  const style = doc.createElement('style')
  style.id = styleId
  style.textContent = `
#dafeiyu-avatar-widget { position: fixed; left: 24px; top: 96px; width: ${WIDGET_WIDTH}px; z-index: 2147482999;
  display: flex; flex-direction: column; align-items: center; gap: 2px; }
#dafeiyu-avatar-widget[hidden] { display: none !important; }
#dafeiyu-avatar-widget .stage { position: relative; width: ${WIDGET_WIDTH}px; aspect-ratio: 3 / 4;
  border-radius: 12px; cursor: grab; touch-action: none; filter: drop-shadow(0 6px 16px rgba(0,0,0,.25)); }
#dafeiyu-avatar-widget .stage.dragging { cursor: grabbing; }
#dafeiyu-avatar-widget .layer { position: absolute; inset: 0; background-repeat: no-repeat;
  pointer-events: none; will-change: opacity; }
#dafeiyu-avatar-menu { position: absolute; top: calc(100% + 4px); right: 0; width: 168px; padding: 6px;
  display: flex; flex-direction: column; gap: 2px; border-radius: 10px;
  border: 1px solid #1f3b63; background: #0d1117;
  box-shadow: 0 10px 28px rgba(0,0,0,.5); z-index: 3; }
#dafeiyu-avatar-menu[hidden] { display: none !important; }
#dafeiyu-avatar-menu button { display: flex; gap: 8px; align-items: center; width: 100%;
  padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; text-align: left;
  color: #8ab4ff; font-size: 13px; cursor: pointer; }
#dafeiyu-avatar-menu button:hover { background: rgba(75,123,236,.22); color: #cfe0ff; }
`
  doc.head.appendChild(style)

  const wrap = doc.createElement('div')
  wrap.id = 'dafeiyu-avatar-widget'
  wrap.hidden = true
  const stage = doc.createElement('div')
  stage.className = 'stage'
  const layers = [doc.createElement('div'), doc.createElement('div')]
  for (const layer of layers) layer.className = 'layer'
  layers[0]!.style.opacity = '1'
  layers[1]!.style.opacity = '0'
  let active = 0
  stage.append(layers[0]!, layers[1]!)
  const menu = doc.createElement('div')
  menu.id = 'dafeiyu-avatar-menu'
  menu.hidden = true
  let menuOpen = false
  const toggleMenu = (next?: boolean): void => {
    menuOpen = next ?? !menuOpen
    menu.hidden = !menuOpen
  }
  const addMenuButton = (icon: string, label: string, onClick: () => void): void => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.textContent = `${icon} ${label}`
    button.addEventListener('click', (event) => {
      event.stopPropagation()
      toggleMenu(false)
      onClick()
    })
    menu.appendChild(button)
  }
  addMenuButton('🐝', '派活助手', () => deps.onMenuAction?.('subagents'))
  addMenuButton('☁️', '小云雀', () => deps.onMenuAction?.('xyq'))
  addMenuButton('🐳', '肥鱼识图', () => deps.onMenuAction?.('vision'))
  addMenuButton('😤', '戳一下', () => {
    if (available(POKE_CLIP)) {
      pokeUntil = Date.now() + POKE_MS
      playClip(POKE_CLIP, 1)
    }
  })
  wrap.append(stage, menu)
  doc.body.appendChild(wrap)

  const onDocClick = (event: Event): void => {
    if (!menuOpen) return
    const target = event.target as Node | null
    if (target && wrap.contains(target)) return
    toggleMenu(false)
  }
  doc.addEventListener('click', onDocClick)
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') toggleMenu(false)
  }
  doc.addEventListener('keydown', onKey as EventListener)

  let states: AvatarStateView[] = []
  let current: AvatarStateView | undefined
  let frame = 0
  let playing = true
  let timer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let lastStatus: 'running' | 'idle' | undefined
  let talkUntil = 0
  let disposed = false
  let placed = false
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | undefined
  let stateKey: 'idle' | 'think' | 'talk' = 'idle'
  let clipUntil = 0
  let pokeUntil = 0
  let lastClipId: string | undefined
  let pendingClip: { id: string; loops: number } | undefined
  let manifestVersion = 0

  const assetStatus = new Map<string, 'loading' | 'ready' | 'failed'>()
  const assetUrl = (state: AvatarStateView): string =>
    resolveHostUrl(`${BASE}/sheet?id=${encodeURIComponent(state.id)}${manifestVersion > 0 ? `&v=${manifestVersion}` : ''}`)
  const ready = (state: AvatarStateView): boolean => assetStatus.get(state.file) === 'ready'

  const ensureAsset = (state: AvatarStateView, onReady?: () => void): void => {
    const known = assetStatus.get(state.file)
    if (known === 'ready' || known === 'failed') return
    assetStatus.set(state.file, 'loading')
    const img = new Image()
    img.onload = () => {
      const done = (): void => {
        assetStatus.set(state.file, 'ready')
        onReady?.()
      }
      if (typeof img.decode === 'function') img.decode().then(done).catch(done)
      else done()
    }
    img.onerror = () => assetStatus.set(state.file, 'failed')
    img.src = assetUrl(state)
  }

  const viewport = (): { w: number; h: number } => {
    const w = doc.documentElement?.clientWidth || (globalThis as { innerWidth?: number }).innerWidth || 1280
    const h = doc.documentElement?.clientHeight || (globalThis as { innerHeight?: number }).innerHeight || 800
    return { w, h }
  }

  const spriteHeight = (): number => Math.round(WIDGET_WIDTH * 4 / 3)

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
        /* ignore */
      }
    }
  }

  const defaultPosition = (): { x: number; y: number } => {
    const { w } = viewport()
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
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) place(Number(saved.x), Number(saved.y), false)
    else {
      const p = defaultPosition()
      place(p.x, p.y, false)
    }
  }

  const paint = (): void => {
    if (!current) return
    const col = frame % current.cols
    const row = Math.floor(frame / current.cols) % current.rows
    const layer = layers[active]!
    layer.style.backgroundPosition = `${(col / Math.max(1, current.cols - 1)) * 100}% ${(row / Math.max(1, current.rows - 1)) * 100}%`
    frame = (frame + 1) % current.frames
  }

  /**
   * 双层切换：新动作先画在后台层并抬到最上层，**等下一帧**再把旧层隐藏。
   * 这样即使新层这一帧还没被浏览器合成，旧帧仍然完整可见，不会闪白。
   */
  let swapping = false
  const switchTo = (state: AvatarStateView): void => {
    if (swapping) return
    const previousIndex = active
    const next = 1 - active
    const layer = layers[next]!
    const previousLayer = layers[previousIndex]!
    layer.style.backgroundImage = `url(${assetUrl(state)})`
    layer.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`
    layer.style.backgroundPosition = '0% 0%'
    layer.style.zIndex = '2'
    layer.style.opacity = '1'
    active = next
    current = state
    frame = 0
    paint()
    swapping = true
    requestAnimationFrame(() => {
      previousLayer.style.opacity = '0'
      previousLayer.style.zIndex = '1'
      swapping = false
    })
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

  const playClip = (id: string | undefined, loops: number): boolean => {
    if (id === undefined) return false
    const state = states.find((row) => row.id === id)
    if (state === undefined) return false
    if (!ready(state)) {
      ensureAsset(state)
      return false
    }
    if (current?.id !== state.id) switchTo(state)
    lastClipId = state.id
    clipUntil = Date.now() + Math.max(1, loops) * (state.frames / FPS) * 1000
    return true
  }

  const enterState = (next: 'idle' | 'think' | 'talk'): void => {
    const changed = next !== stateKey
    stateKey = next
    if (pendingClip !== undefined) {
      if (playClip(pendingClip.id, pendingClip.loops)) pendingClip = undefined
      return
    }
    if (!changed && Date.now() < clipUntil) return
    const clip = pickClip(STATE_POOLS[next])
    if (!clip) return
    if (!playClip(clip.id, clip.loops)) pendingClip = clip
  }

  const targetId = (): 'idle' | 'think' | 'talk' => {
    const status = (globalThis as Record<string, unknown>).__dafeiyuAvatarStatus as string | undefined
    if (status === 'running') return 'think'
    if (Date.now() < talkUntil) return 'talk'
    return 'idle'
  }

  const refresh = (): void => {
    if (disposed) return
    for (const stale of Array.from(doc.querySelectorAll('#dafeiyu-avatar-widget'))) {
      if (stale !== wrap) {
        try {
          stale.remove()
        } catch {
          /* ignore */
        }
      }
    }
    const session = deps.getCurrentSession?.()
    if (!session) {
      wrap.hidden = true
      return
    }
    void (async () => {
      try {
        const response = await fetch(resolveHostUrl(`${BASE}/state?sessionId=${encodeURIComponent(session)}`), {
          signal: AbortSignal.timeout(4000),
        })
        const answer = (await response.json()) as { status?: string }
        const status = answer.status === 'running' ? 'running' : 'idle'
        if (lastStatus === 'running' && status === 'idle') talkUntil = Date.now() + 2000
        lastStatus = status
        ;(globalThis as Record<string, unknown>).__dafeiyuAvatarStatus = status
        if (current === undefined) {
          const idle = states.find((state) => state.id === 'idle') ?? states[0]
          if (idle && ready(idle)) switchTo(idle)
          else if (idle) ensureAsset(idle, () => {
            if (current === undefined) switchTo(idle)
          })
        }
        if (Date.now() < pokeUntil) {
          wrap.hidden = false
          return
        }
        enterState(targetId())
      } catch {
        if (current === undefined) {
          const idle = states.find((state) => state.id === 'idle') ?? states[0]
          if (idle && ready(idle)) switchTo(idle)
        } else enterState('idle')
      }
      wrap.hidden = false
    })()
  }

  void (async () => {
    try {
      const response = await fetch(resolveHostUrl(`${BASE}/manifest?t=${Date.now()}`), {
        signal: AbortSignal.timeout(8000),
        cache: 'no-store',
      })
      const answer = (await response.json()) as {
        ok?: boolean
        manifest?: { version?: number; states?: AvatarStateView[] } | null
      }
      if (answer.ok === true && answer.manifest && Array.isArray(answer.manifest.states) && answer.manifest.states.length > 0) {
        states = answer.manifest.states
        manifestVersion = typeof answer.manifest.version === 'number' ? answer.manifest.version : 0
        for (const state of states) ensureAsset(state)
        const idle = states.find((state) => state.id === 'idle') ?? states[0]
        if (idle) ensureAsset(idle, () => { if (current === undefined) switchTo(idle) })
      }
    } catch {
      /* 没素材就整块隐藏 */
    }
  })()

  const onDown = (event: PointerEvent): void => {
    if (event.button !== undefined && event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY, left: parseFloat(wrap.style.left) || 0, top: parseFloat(wrap.style.top) || 0, moved: false }
    stage.classList.add('dragging')
    try {
      stage.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
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
    stage.classList.remove('dragging')
    if (moved) {
      place(parseFloat(wrap.style.left) || 0, parseFloat(wrap.style.top) || 0, true)
    } else {
      toggleMenu()
    }
  }
  const onDouble = (): void => {
    const p = defaultPosition()
    place(p.x, p.y, true)
  }
  const onResize = (): void => {
    if (placed) place(parseFloat(wrap.style.left) || 0, parseFloat(wrap.style.top) || 0, false)
  }

  stage.addEventListener('pointerdown', onDown)
  stage.addEventListener('pointermove', onMove)
  stage.addEventListener('pointerup', onUp)
  stage.addEventListener('pointercancel', onUp)
  stage.addEventListener('dblclick', onDouble)
  ;(globalThis as { addEventListener?: (type: string, listener: () => void) => void }).addEventListener?.('resize', onResize)

  timer = setInterval(() => {
    if (playing) paint()
  }, Math.round(1000 / FPS))
  pollTimer = setInterval(refresh, 2500)
  const clipTimer = setInterval(() => {
    if (disposed || !playing) return
    if (Date.now() < pokeUntil) return
    if (Date.now() >= clipUntil) enterState(stateKey)
  }, 400)
  refresh()

  const dispose = (): void => {
    disposed = true
    drag = undefined
    if (timer) clearInterval(timer)
    if (pollTimer) clearInterval(pollTimer)
    clearInterval(clipTimer)
    try {
      doc.removeEventListener('click', onDocClick)
      doc.removeEventListener('keydown', onKey as EventListener)
      wrap.remove()
      style.remove()
    } catch {
      /* ignore */
    }
  }
  ;(globalThis as Record<string, unknown>).__dafeiyuAvatarCleanup = dispose
  return dispose
}
