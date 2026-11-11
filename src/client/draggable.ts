/**
 * draggable —— 悬浮工具面板的拖动支持（0.38）。
 *
 * 由面板标题栏拖拽；位置存 `localStorage['drc.panelPos.<key>']`，刷新后保留。
 * 只把 `left/top` 改成显式值（同时清掉 right/bottom），布局仍是 fixed。
 */
const MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function place(panel: HTMLElement, left: number, top: number): void {
  panel.style.left = `${Math.round(left)}px`
  panel.style.top = `${Math.round(top)}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
}

function bounds(panel: HTMLElement, viewportW: number, viewportH: number): { left: number; top: number } {
  const width = Math.min(panel.offsetWidth || 320, viewportW - MARGIN * 2)
  const height = Math.min(panel.offsetHeight || 200, viewportH - MARGIN * 2)
  return {
    left: Math.max(MARGIN, viewportW - width - MARGIN),
    top: Math.max(MARGIN, viewportH - height - MARGIN),
  }
}

export function makeDraggable(panel: HTMLElement, handle: HTMLElement, key: string): void {
  const storageKey = `drc.panelPos.${key}`
  let saved: { left: number; top: number } | null = null
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown }
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') saved = { left: parsed.left, top: parsed.top }
    }
  } catch {
    saved = null
  }
  if (saved) {
    place(panel, clamp(saved.left, MARGIN, Math.max(MARGIN, window.innerWidth - 80)), clamp(saved.top, MARGIN, Math.max(MARGIN, window.innerHeight - 80)))
  }

  handle.style.cursor = 'move'
  handle.style.userSelect = 'none'
  handle.style.touchAction = 'none'
  handle.title = handle.title || '拖动这里移动面板（双击复位）'

  let dragging = false
  let startX = 0
  let startY = 0
  let baseLeft = 0
  let baseTop = 0

  const onMove = (event: PointerEvent): void => {
    if (!dragging) return
    const max = bounds(panel, window.innerWidth, window.innerHeight)
    place(
      panel,
      clamp(baseLeft + event.clientX - startX, MARGIN, Math.max(MARGIN, window.innerWidth - (panel.offsetWidth || 320) - MARGIN)),
      clamp(baseTop + event.clientY - startY, MARGIN, Math.max(MARGIN, max.top > 0 ? window.innerHeight - (panel.offsetHeight || 200) - MARGIN : MARGIN)),
    )
  }
  const onUp = (): void => {
    if (!dragging) return
    dragging = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        left: parseFloat(panel.style.left || '0') || 0,
        top: parseFloat(panel.style.top || '0') || 0,
      }))
    } catch {
      /* 存不了就只影响记忆位置 */
    }
  }

  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target && target.closest('button, input, textarea, select, a')) return
    const rect = panel.getBoundingClientRect()
    baseLeft = rect.left
    baseTop = rect.top
    place(panel, rect.left, rect.top)
    startX = event.clientX
    startY = event.clientY
    dragging = true
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    event.preventDefault()
  })

  handle.addEventListener('dblclick', () => {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      /* ignore */
    }
    panel.style.left = ''
    panel.style.top = ''
    panel.style.right = ''
    panel.style.bottom = ''
  })
}
