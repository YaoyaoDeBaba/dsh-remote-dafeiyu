/**
 * avatar-widget — 聊天页左下角的虚拟形象小窗（0.14）。
 *
 * 行为：
 * - 有当前会话且有素材时出现；点一下暂停/继续；
 * - 每 2.5s 问一次 `/avatar/state?sessionId=`，按 agent 状态自动切动作：
 *   running → 动脑（think）；idle → 待机（idle）；从 running→idle 的头 2 秒播「讲话」；
 * - 素材清单只拉一次；首帧就位前不显示，避免白框。
 *
 * 纪律：所有 DOM 操作都包 try；素材缺失就整块隐藏（不占地方）。
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

export interface AvatarWidgetDeps {
  getCurrentSession: () => string | undefined | null
}

export function mountAvatarWidget(deps: AvatarWidgetDeps): () => void {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return () => {}
  const style = doc.createElement('style')
  style.textContent = `
#dafeiyu-avatar-widget { position: fixed; left: 20px; bottom: 88px; width: 132px; z-index: 2147482999;
  display: flex; flex-direction: column; align-items: center; gap: 2px; pointer-events: none; }
#dafeiyu-avatar-widget[hidden] { display: none !important; }
#dafeiyu-avatar-widget .sprite { width: 132px; aspect-ratio: var(--dafeiyu-avatar-ratio, 1 / 1);
  border-radius: 12px; background-repeat: no-repeat; pointer-events: auto; cursor: pointer;
  filter: drop-shadow(0 6px 16px rgba(0,0,0,.25)); }
#dafeiyu-avatar-widget .hint { font-size: 10px; color: rgba(127,127,127,.85); user-select: none; }
`
  const styleId = 'dafeiyu-avatar-widget-style'
  const existing = doc.getElementById(styleId)
  if (existing) existing.remove()
  style.id = styleId
  doc.head.appendChild(style)

  const wrap = doc.createElement('div')
  wrap.id = 'dafeiyu-avatar-widget'
  wrap.hidden = true
  const sprite = doc.createElement('div')
  sprite.className = 'sprite'
  const hint = doc.createElement('div')
  hint.className = 'hint'
  hint.textContent = '点击暂停/继续'
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
  let disposed = false

  const paint = (): void => {
    if (!current) return
    const col = frame % current.cols
    const row = Math.floor(frame / current.cols) % current.rows
    sprite.style.backgroundPosition = `${(col / Math.max(1, current.cols - 1)) * 100}% ${(row / Math.max(1, current.rows - 1)) * 100}%`
    frame = (frame + 1) % current.frames
  }

  const apply = (state: AvatarStateView | undefined): void => {
    if (!state) {
      wrap.hidden = true
      return
    }
    if (current?.id !== state.id) {
      current = state
      frame = 0
      wrap.style.setProperty('--dafeiyu-avatar-ratio', `${state.cellWidth} / ${state.cellHeight}`)
      sprite.style.backgroundImage = `url(${resolveHostUrl(`${BASE}/sheet?id=${encodeURIComponent(state.id)}`)})`
      sprite.style.backgroundSize = `${state.cols * 100}% ${state.rows * 100}%`
      paint()
    }
    wrap.hidden = false
    hint.textContent = state.label + (playing ? '' : ' · 已暂停')
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
        const wanted = targetId()
        const fallback = states.find((state) => state.id === 'idle')
        apply(states.find((state) => state.id === wanted) ?? fallback)
      } catch {
        /* 状态读不到就按 idle 显示 */
        apply(states.find((state) => state.id === 'idle'))
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

  timer = setInterval(() => {
    if (playing) paint()
  }, Math.round(1000 / FPS))
  pollTimer = setInterval(refresh, 2500)
  refresh()

  sprite.addEventListener('click', () => {
    playing = !playing
    hint.textContent = (current?.label ?? '') + (playing ? '' : ' · 已暂停')
  })

  return () => {
    disposed = true
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
