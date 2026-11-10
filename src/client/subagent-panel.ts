/**
 * 子代理监视器（桌面端）：右侧一颗悬浮小图标 + 一个面板。
 *
 * 数据走宿主自己的只读路由 `GET /api/dsh-remote-dafeiyu/subagents?sessionId=`：
 * 页面与宿主同源（`resolveHostUrl` 会按宿主给的 origin 拼），所以不需要经过中继。
 *
 * ## 什么时候出现
 * 只有**当前对话有子代理**时图标才出现（每 3 秒问一次宿主；没有就隐藏并关面板）。
 * 用户切到别的会话（没有子代理）时它会自己消失——这正是需求里的"选中有子 agent
 * 的对话才出现"。
 *
 * ## 为什么是纯 DOM，不用 react
 * 与识图 FAB 同一条：这个面板挂在 `document.body` 上，不属于任何槽位；用 react 反而
 * 要和宿主的分层、样式隔离打交道。纯 DOM 的另一个好处是：宿主整页重渲染也不会把它
 * 带走（它不在 React 树里）。
 */
import { resolveHostUrl } from './host-url.js'

export interface SubagentRow {
  id: string
  parentId: string
  depth?: number
  title?: string
  task?: string
  /** 显示名（来自官方 label 的 `名称`；没按约定写时是自动取的） */
  name?: string
  /** 一句话简述（label 里 `｜` 右边那段，或任务首句） */
  summary?: string
  /** ok = 按 `名称｜简述` 约定填的；fallback = 自动取名（端上标黄） */
  naming?: 'ok' | 'fallback'
  /** running 时「正在干什么」 */
  activity?: string
  status: 'running' | 'idle'
  createdAt?: string
  lastActiveAt?: string
  workMs?: number
  idleMs?: number
  /** 本轮已运行（running 时才有） */
  runningMs?: number
}

export interface SubagentMonitorDeps {
  /** 入口收在形象菜单里时设 false：不显示独立 🐝 按钮，但面板仍可通过 expose 打开。 */
  showFab?: boolean
  /** 把 open/close 交给外部（虚拟形象菜单）。 */
  expose?: (api: { open: () => void; close: () => void }) => void
  /** 当前选中的会话 id（拿不到就返回 undefined：列表页/设置页都不显示）。 */
  getCurrentSession: () => string | undefined
}

/** 闲置多久开始提示清理（与手机端同一口径：2 小时）。 */
const IDLE_WARN_MS = 2 * 60 * 60 * 1000
const POLL_MS = 3_000

function fmtDuration(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`
  return `${s}s`
}

export function mountSubagentMonitor(deps: SubagentMonitorDeps): () => void {
  const doc = (globalThis as { document?: Document }).document
  if (!doc) return () => undefined
  // 客户端插件可能跑在 <body> 之前（loader immediately）：等 DOM 就绪再挂，
  // 否则整个监视器会静默不出现（0.9.0-dafeiyu.7 的 PC 端就是这么消失的）。
  if (!doc.body) {
    let disposed = false
    let cleanup: (() => void) | undefined
    const onReady = (): void => {
      if (disposed) return
      cleanup = mountSubagentMonitor(deps)
    }
    doc.addEventListener('DOMContentLoaded', onReady, { once: true })
    return () => {
      disposed = true
      doc.removeEventListener('DOMContentLoaded', onReady)
      try {
        cleanup?.()
      } catch {
        /* 卸载不许抛 */
      }
    }
  }

  const style = doc.createElement('style')
  style.textContent = `
    #dafeiyu-subagent-fab { position: fixed; right: 16px; top: 46%; z-index: 2147483000;
      width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
      background: var(--dsw-alias-bg-primary, #1e1e1e); color: #4b7bec; cursor: pointer;
      display: none; align-items: center; justify-content: center; font-size: 18px;
      box-shadow: 0 4px 14px rgba(0,0,0,.3); }
    #dafeiyu-subagent-fab.open, #dafeiyu-subagent-fab.has-items { display: flex; }
  #dafeiyu-subagent-fab[hidden] { display: none !important; }
    #dafeiyu-subagent-fab:hover { border-color: #4b7bec; }
    #dafeiyu-subagent-fab .badge { position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px;
      padding: 0 4px; border-radius: 8px; background: #4b7bec; color: #fff; font-size: 10px; line-height: 16px; }
    #dafeiyu-subagent-panel { position: fixed; right: 64px; top: 28%; width: 360px; max-height: 60vh;
      overflow: auto; padding: 12px; border-radius: 12px; border: 1px solid var(--dsw-alias-border-l2, #333);
      background: var(--dsw-alias-bg-primary, #1e1e1e); color: var(--dsw-alias-label-primary, #eee);
      z-index: 2147483001; display: none; box-shadow: 0 8px 26px rgba(0,0,0,.4); font-size: 12.5px; }
    #dafeiyu-subagent-panel.open { display: block; }
    #dafeiyu-subagent-panel .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
    #dafeiyu-subagent-panel .head .tools { display: flex; gap: 6px; align-items: center; }
    #dafeiyu-subagent-panel .head .ghost { background: #2a2a40; color: #cfcfe0; border: 0; border-radius: 7px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: 400; }
    #dafeiyu-subagent-panel .warn { color: #e0a83a; font-size: 11px; margin-left: 4px; }
    #dafeiyu-subagent-panel .act { color: #8fd6c3; margin-top: 3px; line-height: 1.5; }
    #dafeiyu-subagent-panel .head button { background: transparent; color: #9a9ab0; border: 0; cursor: pointer; font-size: 13px; }
    #dafeiyu-subagent-panel .row { border-top: 1px solid var(--dsw-alias-border-l2, #2a2a3a); padding: 8px 0; }
    #dafeiyu-subagent-panel .row .top { display: flex; gap: 6px; align-items: center; }
    #dafeiyu-subagent-panel .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
    #dafeiyu-subagent-panel .dot.run { background: #3ecf8e; }
    #dafeiyu-subagent-panel .dot.idle { background: #8a8aa0; }
    #dafeiyu-subagent-panel .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #dafeiyu-subagent-panel .meta { color: #9a9ab0; margin-top: 3px; line-height: 1.5; }
    #dafeiyu-subagent-panel .stale { color: #e0a83a; }
    #dafeiyu-subagent-panel .task { margin-top: 3px; color: #b9b9cc; line-height: 1.45; max-height: 2.9em; overflow: hidden; }
    #dafeiyu-subagent-panel .acts { margin-top: 5px; }
    #dafeiyu-subagent-panel .acts button { background: #2a2a40; color: #cfcfe0; border: 0; border-radius: 7px;
      padding: 4px 9px; font-size: 11.5px; cursor: pointer; }
    #dafeiyu-subagent-panel .empty { color: #9a9ab0; padding: 8px 0; }
    #dafeiyu-subagent-panel .foot { color: #7c7c90; margin-top: 8px; font-size: 11px; line-height: 1.5; }
  `
  doc.head?.appendChild(style)

  const fab = doc.createElement('button')
  fab.id = 'dafeiyu-subagent-fab'
  fab.title = '子代理监视器'
  fab.textContent = '🐝'
  const badge = doc.createElement('span')
  badge.className = 'badge'
  badge.hidden = true
  fab.appendChild(badge)
  doc.body.appendChild(fab)
  if (deps.showFab === false) fab.hidden = true

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-subagent-panel'
  const head = doc.createElement('div')
  head.className = 'head'
  const title = doc.createElement('span')
  title.textContent = '子代理监视器'
  const tools = doc.createElement('span')
  tools.className = 'tools'
  const archiveIdle = doc.createElement('button')
  archiveIdle.className = 'ghost'
  archiveIdle.textContent = '一键归档闲置'
  archiveIdle.title = '把闲置超过 2 小时的子代理一次归档（可恢复）'
  const close = doc.createElement('button')
  close.textContent = '关闭 ✕'
  tools.append(archiveIdle, close)
  head.append(title, tools)
  const body = doc.createElement('div')
  const foot = doc.createElement('div')
  foot.className = 'foot'
  foot.textContent = '闲置超过 2 小时的子代理会标黄，可一键归档（可恢复）。'
  panel.append(head, body, foot)
  doc.body.appendChild(panel)

  let items: SubagentRow[] = []
  // 闲置阈值来自宿主配置（设置页「派活助手」可改），缺省 2h。
  let idleWarnMs = IDLE_WARN_MS
  let session = ''
  let timer = 0
  let busy = false
  let opened = false

  const setOpen = (next: boolean): void => {
    opened = next
    panel.classList.toggle('open', next)
    fab.classList.toggle('open', next)
    if (next) void refresh()
  }
  deps.expose?.({ open: () => setOpen(true), close: () => setOpen(false) })

  const render = (): void => {
    body.textContent = ''
    if (items.length === 0) {
      const empty = doc.createElement('div')
      empty.className = 'empty'
      empty.textContent = '这个对话还没有子代理。'
      body.appendChild(empty)
      return
    }
    for (const row of items) {
      const line = doc.createElement('div')
      line.className = 'row'
      const top = doc.createElement('div')
      top.className = 'top'
      const dot = doc.createElement('span')
      dot.className = 'dot ' + (row.status === 'running' ? 'run' : 'idle')
      const name = doc.createElement('span')
      name.className = 'name'
      // 名称优先级：官方 label 的「名称」→ 会话标题 → 任务首行 → id
      name.textContent = row.name || row.title || row.task || row.id.slice(0, 12)
      name.title = row.id
      top.append(dot, name)
      if (row.naming === 'fallback') {
        const warn = doc.createElement('span')
        warn.className = 'warn'
        warn.textContent = '⚠ 命名不合规'
        warn.title = '派活时 description 应按「名称｜一句话简述」填写'
        top.appendChild(warn)
      }
      const meta = doc.createElement('div')
      meta.className = 'meta'
      const idleWarn = row.status === 'idle' && (row.idleMs ?? 0) >= idleWarnMs
      meta.classList.toggle('stale', idleWarn)
      // 两个时间**互斥**：跑着看「运行」，停了看「闲置」
      const time = row.status === 'running'
        ? '运行 ' + fmtDuration(row.runningMs ?? row.workMs)
        : '闲置 ' + fmtDuration(row.idleMs)
      meta.textContent =
        (row.status === 'running' ? '运行中' : '空闲') + ' · ' + time + (idleWarn ? ' · 建议归档' : '')
      line.append(top, meta)
      const summary = row.summary || (row.task && row.task !== name.textContent ? row.task : '')
      if (summary) {
        const text = doc.createElement('div')
        text.className = 'task'
        text.textContent = summary
        line.appendChild(text)
      }
      if (row.status === 'running' && row.activity) {
        const act = doc.createElement('div')
        act.className = 'act'
        act.textContent = '正在：' + row.activity
        line.appendChild(act)
      }
      // 归档：非运行中的行都给按钮（宿主本来就拒归档运行中的会话）
      if (row.status !== 'running') {
        const acts = doc.createElement('div')
        acts.className = 'acts'
        const archive = doc.createElement('button')
        archive.textContent = '归档'
        archive.addEventListener('click', (event) => {
          event.stopPropagation()
          void archiveRow(row.id, archive)
        })
        acts.appendChild(archive)
        line.appendChild(acts)
      }
      body.appendChild(line)
    }
    const idleCount = items.filter((row) => row.status !== 'running' && (row.idleMs ?? 0) >= idleWarnMs).length
    archiveIdle.disabled = idleCount === 0
    archiveIdle.textContent = idleCount > 0 ? `一键归档闲置 (${idleCount})` : '一键归档闲置'
  }

  /** 顶栏的批量归档：一口气归档所有闲置 ≥ 2h 的子代理（逐条走同一归档端口）。 */
  const archiveIdleNow = async (): Promise<void> => {
    const ids = items.filter((row) => row.status !== 'running' && (row.idleMs ?? 0) >= IDLE_WARN_MS).map((row) => row.id)
    if (ids.length === 0) return
    archiveIdle.disabled = true
    archiveIdle.textContent = '归档中…'
    try {
      const response = await fetch(resolveHostUrl('/api/dsh-remote-dafeiyu/subagents/archive'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
        body: JSON.stringify({ ids, archived: true }),
      })
      const answer = (await response.json()) as { ok?: boolean }
      if (answer.ok !== true) archiveIdle.title = '部分归档失败，见宿主日志'
      await refresh()
    } catch (error) {
      archiveIdle.title = String((error as Error)?.message ?? error)
    } finally {
      archiveIdle.disabled = false
    }
  }
  archiveIdle.addEventListener('click', (event) => {
    event.stopPropagation()
    void archiveIdleNow()
  })

  const archiveRow = async (id: string, button: HTMLButtonElement): Promise<void> => {
    button.disabled = true
    button.textContent = '归档中…'
    try {
      const response = await fetch(resolveHostUrl('/api/dsh-remote-dafeiyu/subagents/archive'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
        body: JSON.stringify({ sessionId: id, archived: true }),
      })
      const answer = (await response.json()) as { ok?: boolean; message?: string }
      if (answer.ok !== true) throw new Error(answer.message || '归档失败')
      await refresh()
    } catch (error) {
      button.disabled = false
      button.textContent = '归档失败，点我重试'
      button.title = String((error as Error)?.message ?? error)
    }
  }

  const apply = (next: SubagentRow[]): void => {
    items = next
    const has = items.length > 0
    fab.classList.toggle('has-items', has)
    badge.hidden = !has
    badge.textContent = String(items.length)
    if (!has && opened) setOpen(false)
    render()
  }

  const refresh = async (): Promise<void> => {
    if (busy) return
    const current = deps.getCurrentSession()
    if (!current) {
      session = ''
      apply([])
      return
    }
    if (current !== session) {
      session = current
      items = []
      render()
    }
    busy = true
    try {
      const response = await fetch(
        resolveHostUrl('/api/dsh-remote-dafeiyu/subagents?sessionId=' + encodeURIComponent(current)),
      )
      const answer = (await response.json()) as {
        ok?: boolean
        items?: SubagentRow[]
        config?: { idleWarnMs?: number }
      }
      if (answer.config && typeof answer.config.idleWarnMs === 'number' && Number.isFinite(answer.config.idleWarnMs)) {
        idleWarnMs = answer.config.idleWarnMs
      }
      if (answer.ok === true && Array.isArray(answer.items)) apply(answer.items)
      else apply([])
    } catch {
      // 宿主没起这条路由（旧版本）或网络抖动：安静隐藏，不打扰用户
      apply([])
    } finally {
      busy = false
    }
  }

  fab.addEventListener('click', (event) => {
    event.stopPropagation()
    setOpen(!opened)
  })
  close.addEventListener('click', () => setOpen(false))
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && opened) setOpen(false)
  }
  doc.addEventListener('keydown', onKey)
  const onClick = (event: MouseEvent): void => {
    if (!opened) return
    const target = event.target as Node | null
    if (target && (panel.contains(target) || fab.contains(target))) return
    setOpen(false)
  }
  doc.addEventListener('click', onClick)

  timer = (globalThis as { setInterval?: (fn: () => void, ms: number) => number }).setInterval?.(() => {
    void refresh()
  }, POLL_MS) ?? 0
  void refresh()

  return () => {
    if (timer) (globalThis as { clearInterval?: (id: number) => void }).clearInterval?.(timer)
    timer = 0
    doc.removeEventListener('keydown', onKey)
    doc.removeEventListener('click', onClick)
    fab.remove()
    panel.remove()
    style.remove()
  }
}
