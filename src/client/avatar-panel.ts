/**
 * avatar-panel — 设置页「形象」分栏：播放 8 个 sprite 动画。
 *
 * 素材：`manifest.json` + `<id>.webp`（8×6 网格、48 帧），由宿主
 * `/api/dsh-remote-dafeiyu/avatar/manifest` 与 `/avatar/sheet?id=` 提供。
 *
 * 渲染：一个 div 当画布，`background-size: 800% 600%`，每帧只改 `background-position`
 * 的百分比（col/(cols-1)、row/(rows-1)），不重建 DOM、不占 canvas。24fps。
 */
import { callJson } from './host-api.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}
type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

export interface AvatarStateView {
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

const buttonStyle: Record<string, string> = {
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  cursor: 'pointer',
}

export function buildAvatarPanel(deps: { createElement: CreateElement; hooks: Hooks }): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined

  return function AvatarPanel(): unknown {
    const [states, setStates] = useState<AvatarStateView[]>([])
    const [active, setActive] = useState<string>('idle')
    const [playing, setPlaying] = useState<boolean>(true)
    const [status, setStatus] = useState<string>('正在读取素材…')

    useEffect?.(() => {
      let cancelled = false
      void (async () => {
        try {
          const result = await callJson(`${BASE}/manifest`, undefined)
          const manifest = result.manifest as { states?: AvatarStateView[] } | null | undefined
          if (cancelled) return
          if (result.ok === true && manifest && Array.isArray(manifest.states) && manifest.states.length > 0) {
            setStates(manifest.states)
            setStatus(`共 ${manifest.states.length} 个动作`)
            if (!manifest.states.some((state) => state.id === 'idle')) setActive(manifest.states[0]!.id)
          } else {
            setStatus(String(result.message ?? '虚拟形象素材未安装'))
          }
        } catch (error) {
          if (!cancelled) setStatus(`读取失败：${String((error as Error)?.message ?? error)}`)
        }
      })()
      return () => {
        cancelled = true
      }
    }, [])

    const current = states.find((state) => state.id === active) ?? states[0]

    useEffect?.(() => {
      if (!current || !playing) return
      const element = document.getElementById('dafeiyu-avatar-sprite') as HTMLElement | null
      if (!element) return
      let frame = 0
      const total = current.frames
      const cols = current.cols
      const rows = current.rows
      const paint = (): void => {
        const col = frame % cols
        const row = Math.floor(frame / cols) % rows
        element.style.backgroundPosition = `${(col / Math.max(1, cols - 1)) * 100}% ${(row / Math.max(1, rows - 1)) * 100}%`
        frame = (frame + 1) % total
      }
      paint()
      const timer = setInterval(paint, Math.round(1000 / FPS))
      return () => clearInterval(timer)
    }, [current?.id, playing])

    if (states.length === 0) {
      return h('p', { style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' }, children: status })
    }

    const sprite = current
      ? h('div', {
          style: {
            width: '100%',
            maxWidth: '520px',
            aspectRatio: `${current.cellWidth} / ${current.cellHeight}`,
            backgroundImage: `url(${BASE}/sheet?id=${encodeURIComponent(current.id)})`,
            backgroundSize: `${current.cols * 100}% ${current.rows * 100}%`,
            backgroundRepeat: 'no-repeat',
            borderRadius: '12px',
            border: '1px solid var(--dsw-alias-border-l2)',
            backgroundPosition: '0% 0%',
          },
          id: 'dafeiyu-avatar-sprite',
        })
      : null

    return h('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '12px' },
      children: [
        h('p', {
          style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', lineHeight: '1.6' },
          children: `虚拟形象素材（${status}）：8×6 sprite，24fps 循环；换动作直接点下面的按钮。`,
        }),
        h('div', {
          style: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
          children: states.map((state) =>
            h('button', {
              type: 'button',
              key: state.id,
              style: state.id === active ? { ...buttonStyle, background: 'var(--dsw-alias-bg-secondary)', fontWeight: 600 } : buttonStyle,
              onClick: () => setActive(state.id),
              children: state.label,
            }),
          ),
        }),
        sprite,
        h('div', {
          style: { display: 'flex', gap: '8px', alignItems: 'center' },
          children: [
            h('button', { type: 'button', style: buttonStyle, onClick: () => setPlaying(!playing), children: playing ? '暂停' : '播放' }),
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: current ? `${current.frames} 帧 · ${FPS}fps · ${playing ? '循环中' : '已暂停'}` : '' }),
          ],
        }),
      ],
    })
  }
}
