/**
 * xyq-quick —— 形象菜单里的「小云雀」快捷面板（0.23）。
 *
 * 只做“看一眼 + 刷新”：登录状态、剩余积分；详细配置仍在 设置 → 大肥鱼 → 小云雀。
 */
import { resolveHostUrl } from './host-url.js'

const BASE = '/api/dsh-remote-dafeiyu/xyq'

export interface XyqQuickHandle {
  open(): void
  dispose(): void
}

export function mountXyqQuick(): XyqQuickHandle {
  const doc = (globalThis as { document?: Document }).document
  if (!doc || !doc.body) return { open: () => {}, dispose: () => {} }

  const styleId = 'dafeiyu-xyq-quick-style'
  const oldStyle = doc.getElementById(styleId)
  if (oldStyle) oldStyle.remove()
  const style = doc.createElement('style')
  style.id = styleId
  style.textContent = `
#dafeiyu-xyq-quick { position: fixed; right: 24px; top: 300px; width: 260px; padding: 12px;
  border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
  background: var(--dsw-alias-bg-primary, #1e1e1e); color: var(--dsw-alias-label-primary, #eee);
  box-shadow: 0 8px 26px rgba(0,0,0,.4); font-size: 13px; z-index: 2147483001; display: none; }
#dafeiyu-xyq-quick.open { display: block; }
#dafeiyu-xyq-quick .title { font-weight: 600; margin-bottom: 6px; }
#dafeiyu-xyq-quick .line { color: var(--dsw-alias-label-secondary, #aaa); margin-top: 4px; word-break: break-word; }
#dafeiyu-xyq-quick .row { display: flex; gap: 8px; margin-top: 8px; }
#dafeiyu-xyq-quick button { padding: 4px 10px; border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, #333); background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
`
  doc.head.appendChild(style)

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-xyq-quick'
  const title = doc.createElement('div')
  title.className = 'title'
  title.textContent = '小云雀'
  const line = doc.createElement('div')
  line.className = 'line'
  line.textContent = '正在读取…'
  const row = doc.createElement('div')
  row.className = 'row'
  const refresh = doc.createElement('button')
  refresh.type = 'button'
  refresh.textContent = '刷新'
  const close = doc.createElement('button')
  close.type = 'button'
  close.textContent = '关闭'
  row.append(refresh, close)
  panel.append(title, line, row)
  doc.body.appendChild(panel)

  const load = async (): Promise<void> => {
    line.textContent = '正在读取…'
    try {
      const status = await (await fetch(resolveHostUrl(`${BASE}/status`), { signal: AbortSignal.timeout(8000) })).json()
      const balance = await (await fetch(resolveHostUrl(`${BASE}/balance`), { signal: AbortSignal.timeout(8000) })).json()
      const bits: string[] = []
      bits.push(status?.ok === true && status.loggedIn === true ? 'Access Key 有效' : String(status?.message ?? 'Key 未生效'))
      bits.push(balance?.ok === true ? `剩余积分 ${String(balance.totalRemain ?? '未知')}` : String(balance?.message ?? '积分读取失败'))
      bits.push('详细配置：设置 → 大肥鱼 → 小云雀')
      line.textContent = bits.join('｜')
    } catch (error) {
      line.textContent = `读取失败：${String((error as Error)?.message ?? error)}`
    }
  }

  refresh.addEventListener('click', () => void load())
  close.addEventListener('click', () => panel.classList.remove('open'))
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
      void load()
    },
    dispose(): void {
      doc.removeEventListener('click', onClick)
      panel.remove()
      style.remove()
    },
  }
}
