/**
 * avatar-widget — 聊天页的虚拟形象小窗（0.21：双层交叉切换，杜绝闪白）。
 *
 * 闪白的原因不是“图没预加载”，而是单层元素换 background-image 时，浏览器要重新
 * 光栅化这一层（尤其大图 + drop-shadow），中间会有一帧空白。修法：两块同尺寸的
 * 图层，新动作先画在后台层，下一帧再把前后层对调——旧帧一直在，绝不会白。
 *
 * 其余行为不变：默认右上、可拖动并记位置、双击复位、点按逗它（蹭得累）、
 * 待机/干活/交付三个动作池随机播放。
 *
 * ## 2026-11-13：播片节奏搬去 `src/avatar/playback.ts`（修"一抽一抽 + 总重现前几帧"）
 *
 * 这里原来有两套时钟：`clipUntil` 按**墙钟**判"这一片播完了"，`frame` 按 `setInterval`
 * 的拍子推进画面。主线程被页面上的别的模块占住掉一拍（或窗口被遮挡被 throttle）时，
 * 墙钟照样走到点、而帧才画了几张 ⇒ 立刻换片 ⇒ 换片把索引归零 ⇒ **永远只能看到每个动作
 * 的前几帧**，且掉拍越厉害重启越频繁。现在"播完"只看**画了多少帧**（`frames × loops`），
 * 掉拍只会让同一个动作播得慢一点，不跳帧、不回第 0 帧。`ClipPacer` 是纯逻辑，可单测。
 */
import { ClipPacer, type AvatarPool, type ClipSpec, type FrameView } from '../avatar/playback.js'
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
  /** 锚点（0~1，y 以格子顶部为 0）；缺省 0.5 / 0.955（历史素材的口径）。 */
  anchorX?: number
  anchorY?: number
}

const BASE = '/api/dsh-remote-dafeiyu/avatar'
const FPS = 24
const WIDGET_WIDTH = 132
/** 舞台高度：与 CSS 的 aspect-ratio: 3/4 保持一致。 */
const STAGE_HEIGHT = Math.round((WIDGET_WIDTH * 4) / 3)
/** 锚点落在舞台里的固定位置（脚底靠下、左右居中）——所有动作都对齐到这里。 */
const ANCHOR_SCREEN_X = WIDGET_WIDTH / 2
const ANCHOR_SCREEN_Y = STAGE_HEIGHT - 8
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
  /** 点击菜单项：派活助手 / 小云雀 / 肥鱼识图 / 转生 / 分身（入口都收在形象身上）。 */
  onMenuAction?: (id: 'subagents' | 'xyq' | 'vision' | 'rebirth' | 'branch' | 'sprite') => void
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
#dafeiyu-avatar-widget .layer { position: absolute; inset: 0; overflow: hidden;
  pointer-events: none; will-change: opacity; }
#dafeiyu-avatar-widget .cell { position: absolute; left: 0; top: 0;
  background-repeat: no-repeat; pointer-events: none; }
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
  // 每层里再放一个「单元格」：它只有一格大小，背景是整张 sheet —— 于是相邻格
  // 永远落在它外面（被 layer 的 overflow:hidden 裁掉），不会串帧。
  const cells = layers.map((layer) => {
    const cell = doc.createElement('div')
    cell.className = 'cell'
    layer.appendChild(cell)
    return cell
  })
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
  addMenuButton('🐟', '一键转生', () => deps.onMenuAction?.('rebirth'))
  addMenuButton('🧬', '一键分身', () => deps.onMenuAction?.('branch'))
  addMenuButton('🎞', '序列帧工具', () => deps.onMenuAction?.('sprite'))
  addMenuButton('😤', '戳一下', () => {
    const spec = specOf(POKE_CLIP, 1)
    if (spec === undefined) return
    // 戳一下是一次性反应：播完这一遍会自动回到当前池子继续（pacer.force 不动 pool）。
    if (pacer.force(spec)) pokeUntil = Date.now() + POKE_MS
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
  let playing = true
  let timer: ReturnType<typeof setInterval> | undefined
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let lastStatus: 'running' | 'idle' | undefined
  let talkUntil = 0
  let disposed = false
  let placed = false
  let drag: { x: number; y: number; left: number; top: number; moved: boolean } | undefined
  let pokeUntil = 0
  let lastClipId: string | undefined
  let manifestVersion = 0

  const assetStatus = new Map<string, 'loading' | 'ready' | 'failed'>()
  const assetUrl = (state: AvatarStateView): string =>
    resolveHostUrl(`${BASE}/sheet?id=${encodeURIComponent(state.id)}${manifestVersion > 0 ? `&v=${manifestVersion}` : ''}`)
  const ready = (state: AvatarStateView): boolean => assetStatus.get(state.file) === 'ready'

  /**
   * 预加载一张 sheet。
   *
   * 就绪与否由 `assetStatus` 记账，播片那边每拍问一次 `ready()`——**不再回调里切片**：
   * 回调里直接 `switchTo` 会绕过"素材没就绪就继续放旧片"的保护，是"抽"的老来源之一。
   */
  const ensureAsset = (state: AvatarStateView): void => {
    const known = assetStatus.get(state.file)
    if (known === 'ready' || known === 'failed') return
    assetStatus.set(state.file, 'loading')
    const img = new Image()
    img.onload = () => {
      const done = (): void => {
        assetStatus.set(state.file, 'ready')
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

  const spriteHeight = (): number => STAGE_HEIGHT

  const anchorOf = (state: AvatarStateView): { x: number; y: number } => ({
    x: typeof state.anchorX === 'number' ? state.anchorX : 0.5,
    y: typeof state.anchorY === 'number' ? state.anchorY : 0.955,
  })

  /**
   * 所有动作共用一个「格像素 → 屏幕像素」比例（取最大的那格刚好放进舞台）。
   * 这样换动作时角色的大小不会跟着格子尺寸跳。
   */
  let displayScale = 1
  const recomputeScale = (): void => {
    let maxW = 0
    let maxH = 0
    for (const state of states) {
      maxW = Math.max(maxW, state.cellWidth)
      maxH = Math.max(maxH, state.cellHeight)
    }
    displayScale = maxW > 0 && maxH > 0 ? Math.min(WIDGET_WIDTH / maxW, STAGE_HEIGHT / maxH) : 1
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

  /** 把一帧画到当前可见格上（**只画**，不推进进度——进度归 `ClipPacer`）。 */
  const drawFrame = (view: FrameView): void => {
    const state = current
    if (state === undefined) return
    const cellW = state.cellWidth > 0 ? state.cellWidth : 1
    const cellH = state.cellHeight > 0 ? state.cellHeight : 1
    const scale = displayScale
    const cell = cells[active]
    if (cell === undefined) return
    cell.style.backgroundPosition = `${-view.col * cellW * scale}px ${-view.row * cellH * scale}px`
  }

  /**
   * 双层切换：新动作先画在后台层并抬到最上层，**等下一帧**再把旧层隐藏。
   * 这样即使新层这一帧还没被浏览器合成，旧帧仍然完整可见，不会闪白。
   */
  let swapping = false
  let pendingHide: HTMLDivElement | undefined
  /** 上一次切换还没等到 rAF 就把旧层收掉（页面被遮挡时 rAF 可能一整段时间不跑，不能让它卡住换片）。 */
  const finishSwap = (): void => {
    if (pendingHide !== undefined) {
      pendingHide.style.opacity = '0'
      pendingHide.style.zIndex = '1'
      pendingHide = undefined
    }
    swapping = false
  }

  const switchTo = (state: AvatarStateView): void => {
    // 上一次换片的 rAF 还没来（同一拍里连切，或 rAF 被 throttle）：先收尾再切。
    // **不能像以前那样 `return`**——那会把 current/active 留在旧动作上，
    // 而进度已经归零，画面就成了"新片的第 0 帧 + 旧片的格子几何"。
    if (swapping) finishSwap()
    const previousIndex = active
    const next = 1 - active
    const layer = layers[next]!
    const cell = cells[next]!
    const previousLayer = layers[previousIndex]!
    // 单元格只有「一格」大小，背景却是整张 sheet：相邻格永远在它外面，被裁掉。
    const scale = displayScale
    const cellW = state.cellWidth > 0 ? state.cellWidth : 1
    const cellH = state.cellHeight > 0 ? state.cellHeight : 1
    const anchor = anchorOf(state)
    cell.style.width = `${cellW * scale}px`
    cell.style.height = `${cellH * scale}px`
    // 单元格左上角 = 锚点落点 - 锚点在格内的偏移
    cell.style.left = `${ANCHOR_SCREEN_X - anchor.x * cellW * scale}px`
    cell.style.top = `${ANCHOR_SCREEN_Y - anchor.y * cellH * scale}px`
    cell.style.backgroundImage = `url(${assetUrl(state)})`
    cell.style.backgroundSize = `${state.cols * cellW * scale}px ${state.rows * cellH * scale}px`
    cell.style.backgroundPosition = '0px 0px'
    layer.style.zIndex = '2'
    layer.style.opacity = '1'
    active = next
    current = state
    swapping = true
    pendingHide = previousLayer
    requestAnimationFrame(finishSwap)
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

  /** manifest 的一行动作 + 池子给的 loops → 一条播片规格。 */
  const specOf = (id: string, loops: number): ClipSpec | undefined => {
    const state = states.find((row) => row.id === id)
    if (state === undefined) return undefined
    return { id: state.id, cols: state.cols, rows: state.rows, frames: state.frames, loops }
  }

  /**
   * 播片节奏（纯逻辑，见 `src/avatar/playback.ts`）。
   *
   * 三个依赖都是**软**的：挑不到片、素材没就绪都只影响"这一拍画什么"，
   * 绝不让进度归零——这正是"越忙越抽"那条反馈链断掉的地方。
   */
  const pacer = new ClipPacer({
    pick: (pool: AvatarPool) => {
      const clip = pickClip(STATE_POOLS[pool])
      if (clip === undefined) return undefined
      lastClipId = clip.id
      return specOf(clip.id, clip.loops)
    },
    available: (spec: ClipSpec) => {
      const state = states.find((row) => row.id === spec.id)
      if (state === undefined) return false
      if (ready(state)) return true
      ensureAsset(state)
      return false
    },
    onSwitch: (spec: ClipSpec) => {
      const state = states.find((row) => row.id === spec.id)
      if (state !== undefined) switchTo(state)
    },
  })

  /** 一拍：问 pacer 要下一帧，有就画。 */
  const paint = (): void => {
    const view = pacer.tick()
    if (view !== undefined) drawFrame(view)
  }

  /**
   * 目标池变化时调这里。
   *
   * `setPool` 同池是 no-op ⇒ 每 2.5s 一次的状态轮询（以及任何别的高频事件）**不可能**
   * 打断正在播的片。
   */
  const enterState = (next: AvatarPool): void => {
    pacer.setPool(next)
  }

  const targetId = (): AvatarPool => {
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
        if (Date.now() < pokeUntil) {
          wrap.hidden = false
          return
        }
        enterState(targetId())
      } catch {
        // 轮询失败**不改变**目标池：以前这里 `enterState('idle')`，于是宿主一忙、这条
        // 4s 超时一响，正在播的片就被切掉重来（"一抽一抽"的第二个来源）。
        // 播片自己会继续（pacer 与轮询无关），等下一次轮询成功再纠正池子。
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
        recomputeScale()
        // 预加载全部素材（换动作时才不会白）；开播交给 pacer 的第一拍，
        // 不再在这里直接 switchTo——那会绕过"素材没就绪就等着"的保护。
        for (const state of states) ensureAsset(state)
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

  // 一个 24fps 的节拍就够：换片由"帧画满了"驱动（pacer），不再要第二个 400ms 的墙钟定时器。
  // 掉拍（主线程被别的模块占用 / 窗口被 throttle）只会让动画播得慢一点。
  timer = setInterval(() => {
    if (playing) paint()
  }, Math.round(1000 / FPS))
  pollTimer = setInterval(refresh, 2500)
  refresh()

  const dispose = (): void => {
    disposed = true
    drag = undefined
    if (timer) clearInterval(timer)
    if (pollTimer) clearInterval(pollTimer)
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
