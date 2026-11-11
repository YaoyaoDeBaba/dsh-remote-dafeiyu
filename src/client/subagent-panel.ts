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
import { makeDraggable } from './draggable.js'

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
      width: 40px; height: 40px; border-radius: 12px; border: 1px solid #1f3b63;
      background: #0d1117; color: #4b7bec; cursor: pointer;
      display: none; align-items: center; justify-content: center; font-size: 18px;
      box-shadow: 0 4px 14px rgba(0,0,0,.3); }
    #dafeiyu-subagent-fab.open, #dafeiyu-subagent-fab.has-items { display: flex; }
  #dafeiyu-subagent-fab[hidden] { display: none !important; }
    #dafeiyu-subagent-fab:hover { border-color: #4b7bec; }
    #dafeiyu-subagent-fab .badge { position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px;
      padding: 0 4px; border-radius: 8px; background: #4b7bec; color: #fff; font-size: 10px; line-height: 16px; }
    #dafeiyu-subagent-panel { position: fixed; right: 24px; top: 12vh; width: 480px; max-height: 76vh;
      overflow: auto; padding: 16px; border-radius: 14px; border: 1px solid #1f3b63;
      background: #0d1117; color: #7fb0ff;
      z-index: 2147483001; display: none; box-shadow: 0 12px 36px rgba(0,0,0,.45); font-size: 13.5px; line-height: 1.55; }
    #dafeiyu-subagent-panel.open { display: block; }
    #dafeiyu-subagent-panel .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-weight: 600; }
    #dafeiyu-subagent-panel .head .tools { display: flex; gap: 6px; align-items: center; }
    #dafeiyu-subagent-panel .head .ghost { background: #13233f; color: #8ab4ff; border: 0; border-radius: 7px; padding: 4px 8px; font-size: 11px; cursor: pointer; font-weight: 400; }
    #dafeiyu-subagent-panel .warn { color: #e0a83a; font-size: 11px; margin-left: 4px; }
    #dafeiyu-subagent-panel .act { color: #8fd6c3; margin-top: 3px; line-height: 1.5; }
    #dafeiyu-subagent-panel .head button { background: transparent; color: #7fb0ff; border: 0; cursor: pointer; font-size: 14px; font-weight: 600; }
    #dafeiyu-subagent-panel .card { border: 1px solid var(--dsw-alias-border-l2, #2a2a3a); border-radius: 10px;
      padding: 10px; margin-top: 8px; background: rgba(75,123,236,.10); }
    #dafeiyu-subagent-panel .card .top { display: flex; gap: 8px; align-items: center; }
    #dafeiyu-subagent-panel .card .name { flex: 1; font-weight: 600; font-size: 13px; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    #dafeiyu-subagent-panel .status { font-size: 12px; font-weight: 600; flex: 0 0 auto; }
    #dafeiyu-subagent-panel .status.running { color: #e0a83a; }
    #dafeiyu-subagent-panel .status.idle { color: #3ecf8e; }
    #dafeiyu-subagent-panel .summary { margin-top: 6px; color: #8ab4ff; font-size: 12.5px; line-height: 1.45; }
    #dafeiyu-subagent-panel .time { margin-top: 4px; color: #5f8fe0; font-size: 11.5px; }
    #dafeiyu-subagent-panel .stale { color: #e0a83a; }
    #dafeiyu-subagent-panel .restoreRow { display: flex; align-items: center; gap: 8px; margin-top: 6px;
      border: 1px solid var(--dsw-alias-border-l2, #2a2a3a); border-radius: 8px; padding: 6px 8px; }
    #dafeiyu-subagent-panel .restoreRow .grow { flex: 1; }
    #dafeiyu-subagent-panel .acts { margin-top: 5px; }
    #dafeiyu-subagent-panel .acts button { background: #13233f; color: #8ab4ff; border: 0; border-radius: 7px;
      padding: 4px 9px; font-size: 11.5px; cursor: pointer; }
    #dafeiyu-subagent-panel .empty { color: #5f8fe0; padding: 8px 0; }
    #dafeiyu-subagent-panel .foot { color: #4b7bec; margin-top: 8px; font-size: 11px; line-height: 1.5; }
  
  /* 白底蓝字覆盖（0.31）：用户要求白色背景、不要透明底 */
  #dafeiyu-subagent-panel { background: #ffffff !important; color: #1d4ed8 !important; border-color: #c7d9f7 !important; }
  #dafeiyu-subagent-panel .card { background: #f7faff !important; border-color: #dbe6fb !important; }
  #dafeiyu-subagent-panel .summary { color: #1d3f8f !important; }
  #dafeiyu-subagent-panel .time { color: #4a6bb3 !important; }
  #dafeiyu-subagent-panel .empty, #dafeiyu-subagent-panel .foot { color: #5b7bb5 !important; }
  #dafeiyu-subagent-panel .head .ghost { background: #eaf1ff !important; color: #1d4ed8 !important; }
  #dafeiyu-subagent-panel .acts button { background: #eaf1ff !important; color: #1d4ed8 !important; }
  #dafeiyu-subagent-panel .status.running { color: #b7791f !important; }
  #dafeiyu-subagent-panel .status.idle { color: #16803c !important; }
  #dafeiyu-subagent-panel .restoreRow { border-color: #dbe6fb !important; }
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
  const pushBtn = doc.createElement('button')
  pushBtn.className = 'ghost'
  pushBtn.textContent = '推送本会话'
  pushBtn.title = '把「包工头/派活规范」推到当前这个会话（只推当前，不推全部）'
  const restore = doc.createElement('button')
  restore.className = 'ghost'
  restore.textContent = '恢复归档子代理'
  restore.title = '把本面板归档过的子代理恢复回来'
  const archiveIdle = doc.createElement('button')
  archiveIdle.className = 'ghost'
  archiveIdle.textContent = '一键归档闲置'
  archiveIdle.title = '把闲置超过阈值的子代理一次归档（可恢复）'
  const refreshNow = doc.createElement('button')
  refreshNow.className = 'ghost'
  refreshNow.textContent = '刷新'
  const close = doc.createElement('button')
  close.textContent = '关闭 ✕'
  tools.append(pushBtn, restore, archiveIdle, refreshNow, close)
  head.append(title, tools)
  const body = doc.createElement('div')
  const foot = doc.createElement('div')
  foot.className = 'foot'
  foot.textContent = '闲置超过 2 小时的子代理会标黄，可一键归档（可恢复）。'
  panel.append(head, body, foot)
  doc.body.appendChild(panel)
  makeDraggable(panel, head, 'subagent')

  let items: SubagentRow[] = []
  // 闲置阈值来自宿主配置（设置页「派活助手」可改），缺省 2h。
  let idleWarnMs = IDLE_WARN_MS
  let session = ''
  let timer = 0
  let busy = false
  let opened = false
  let restoring = false
  let numbering = new Map<string, number>()
  let nextNumber = 1
  let ledger: Array<{ id: string; name: string }> = []

  const ledgerKey = (sid: string): string => 'drc.subagentArchive.' + sid
  const loadLedger = (sid: string): void => {
    try {
      const raw = localStorage.getItem(ledgerKey(sid))
      const parsed = raw ? JSON.parse(raw) : []
      ledger = Array.isArray(parsed)
        ? parsed.filter((row) => row && typeof row.id === 'string').map((row) => ({ id: row.id, name: String(row.name ?? '子代理') }))
        : []
    } catch {
      ledger = []
    }
  }
  const saveLedger = (): void => {
    if (!session) return
    try {
      localStorage.setItem(ledgerKey(session), JSON.stringify(ledger))
    } catch {
      /* 隐私模式 */
    }
  }
  const displayName = (row: SubagentRow): string => {
    if (row.naming === 'ok' && row.name) return row.name
    if (!numbering.has(row.id)) numbering.set(row.id, nextNumber++)
    return '子代理' + numbering.get(row.id)
  }
  const rememberArchived = (ids: string[]): void => {
    for (const row of items) {
      if (!ids.includes(row.id)) continue
      if (!ledger.some((entry) => entry.id === row.id)) ledger.push({ id: row.id, name: displayName(row) })
    }
    saveLedger()
  }

  // 从形象菜单点开时，打开面板那一次的 click 还会继续冒泡到 document；
  // 冒泡结束后外部点击处理器会把刚打开的面板当成“点了外面”立刻关掉（闪退）。
  // 记录打开时刻，250ms 内的 document click 一律忽略。
  let openedAt = 0
  const setOpen = (next: boolean): void => {
    opened = next
    panel.classList.toggle('open', next)
    fab.classList.toggle('open', next)
    if (next) {
      openedAt = Date.now()
      void refresh()
    }
  }
  deps.expose?.({ open: () => setOpen(true), close: () => setOpen(false) })

  const render = (): void => {
    body.textContent = ''
    if (restoring) {
      const titleLine = doc.createElement('div')
      titleLine.className = 'empty'
      titleLine.textContent = ledger.length === 0 ? '没有本面板归档过的子代理。' : '已归档（本面板记录）：'
      body.appendChild(titleLine)
      for (const entry of ledger) {
        const row = doc.createElement('div')
        row.className = 'restoreRow'
        const label = doc.createElement('span')
        label.className = 'grow'
        label.textContent = entry.name
        const button = doc.createElement('button')
        button.textContent = '恢复'
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          void restoreEntry(entry.id, button)
        })
        row.append(label, button)
        body.appendChild(row)
      }
      return
    }
    if (items.length === 0) {
      const empty = doc.createElement('div')
      empty.className = 'empty'
      empty.textContent = '这个对话还没有子代理。'
      body.appendChild(empty)
      return
    }
    for (const row of items) {
      const card = doc.createElement('div')
      card.className = 'card'
      const top = doc.createElement('div')
      top.className = 'top'
      const nameSpan = doc.createElement('span')
      nameSpan.className = 'name'
      nameSpan.textContent = displayName(row)
      const status = doc.createElement('span')
      status.className = 'status ' + (row.status === 'running' ? 'running' : 'idle')
      status.textContent = row.status === 'running' ? '工作中' : '空闲'
      top.append(nameSpan, status)
      card.appendChild(top)
      const summary = doc.createElement('div')
      summary.className = 'summary'
      summary.textContent =
        row.naming === 'ok' && row.summary
          ? row.summary
          : '未按要求填写 · 正确格式：名称｜一句话简述'
      card.appendChild(summary)
      const idleWarn = row.status === 'idle' && (row.idleMs ?? 0) >= idleWarnMs
      const time = doc.createElement('div')
      time.className = 'time' + (idleWarn ? ' stale' : '')
      time.textContent =
        row.status === 'running'
          ? '工作时间 ' + fmtDuration(row.runningMs ?? row.workMs)
          : '闲置时间 ' + fmtDuration(row.idleMs) + (idleWarn ? ' · 建议归档' : '')
      card.appendChild(time)
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
        card.appendChild(acts)
      }
      body.appendChild(card)
    }
    const idleCount = items.filter((row) => row.status !== 'running' && (row.idleMs ?? 0) >= idleWarnMs).length
    archiveIdle.disabled = idleCount === 0
    archiveIdle.textContent = idleCount > 0 ? `一键归档闲置 (${idleCount})` : '一键归档闲置'
  }

  const restoreEntry = async (id: string, button: HTMLButtonElement): Promise<void> => {
    button.disabled = true
    button.textContent = '恢复中…'
    try {
      const response = await fetch(resolveHostUrl('/api/dsh-remote-dafeiyu/subagents/archive'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
        body: JSON.stringify({ ids: [id], archived: false }),
      })
      const answer = (await response.json()) as { ok?: boolean; message?: string }
      if (answer.ok !== true) throw new Error(answer.message || '恢复失败')
      ledger = ledger.filter((entry) => entry.id !== id)
      saveLedger()
      restoring = ledger.length > 0
      await refresh()
    } catch (error) {
      button.disabled = false
      button.textContent = '恢复失败'
      button.title = String((error as Error)?.message ?? error)
    }
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
      rememberArchived(ids)
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
      rememberArchived([id])
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
    // 不要因为“当前会话没有子代理”就自动关面板：从形象菜单手动打开的面板
    // 会在刷新返回空时瞬间被关掉（闪退），推送/切会话后尤其明显。
    // 空列表就显示空态，让用户自己关。
    render()
  }

  const refresh = async (): Promise<void> => {
    if (busy) return
    const current = deps.getCurrentSession()
    if (!current) {
      // 拿不到当前会话（切换瞬间/推送后上下文更新）时不要清空并关闭面板，
      // 保留面板与上一次内容，等下一次刷新拿到会话再更新。
      if (!opened) {
        session = ''
        apply([])
      } else {
        foot.textContent = '读不到当前会话：切到一条对话后再打开'
      }
      return
    }
    if (current !== session) {
      session = current
      items = []
      numbering = new Map()
      nextNumber = 1
      restoring = false
      loadLedger(current)
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
        error?: string
        config?: { idleWarnMs?: number }
      }
      if (answer.config && typeof answer.config.idleWarnMs === 'number' && Number.isFinite(answer.config.idleWarnMs)) {
        idleWarnMs = answer.config.idleWarnMs
      }
      if (answer.ok === true && Array.isArray(answer.items)) {
        apply(answer.items)
        foot.textContent = defaultFoot
      } else {
        // 列表失败必须在界面上说清楚；悄悄清空会让人以为“没有子代理”。
        foot.textContent = `读取失败：${String(answer.error ?? '宿主没有返回数据')}`
      }
    } catch (error) {
      foot.textContent = `读取失败：${String((error as Error)?.message ?? error)}`
    } finally {
      busy = false
    }
  }

  fab.addEventListener('click', (event) => {
    event.stopPropagation()
    setOpen(!opened)
  })
  close.addEventListener('click', () => setOpen(false))
  restore.addEventListener('click', (event) => {
    event.stopPropagation()
    restoring = !restoring
    render()
  })

  const defaultFoot = '闲置超过阈值的子代理会标黄，可归档（可恢复）。'
  const setFoot = (text: string): void => {
    foot.textContent = text
    if (text !== defaultFoot) {
      setTimeout(() => {
        foot.textContent = defaultFoot
      }, 6000)
    }
  }
  pushBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    const sid = session || deps.getCurrentSession?.() || ''
    if (sid === '') {
      setFoot('没有当前会话，无法推送')
      return
    }
    void (async () => {
      pushBtn.disabled = true
      pushBtn.textContent = '推送中…'
      try {
        const response = await fetch(resolveHostUrl('/api/dsh-remote-dafeiyu/guidance/push'), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
          body: JSON.stringify({ which: 'subagent', sessionId: sid }),
        })
        const answer = (await response.json()) as { ok?: boolean; error?: string; result?: { pushed?: number; total?: number } }
        const pushed = answer.result?.pushed ?? 0
        setFoot(pushed > 0 ? '已把派活规范推送到当前会话' : `推送失败：${String(answer.error ?? '当前会话不在线')}`)
      } catch (error) {
        setFoot(`推送失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        pushBtn.disabled = false
        pushBtn.textContent = '推送本会话'
      }
    })()
  })
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && opened) setOpen(false)
  }
  doc.addEventListener('keydown', onKey)
  const onClick = (event: MouseEvent): void => {
    if (!opened) return
    if (Date.now() - openedAt < 250) return
    const target = event.target as Node | null
    if (target && (panel.contains(target) || fab.contains(target))) return
    setOpen(false)
  }
  doc.addEventListener('click', onClick)

  // 实时刷新靠 SSE，不再定时轮询；EventSource 不可用/断开时才退化为 30s 慢轮询。
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined
  let stream: EventSource | undefined
  const scheduleFallback = (): void => {
    if (fallbackTimer) return
    fallbackTimer = (globalThis as { setTimeout?: (fn: () => void, ms: number) => number }).setTimeout?.(() => {
      fallbackTimer = undefined
      if (stream === undefined || stream.readyState === 2) void refresh().finally(scheduleFallback)
    }, 30_000) ?? 0
  }
  const startStream = (): void => {
    if (typeof EventSource !== 'function') {
      scheduleFallback()
      return
    }
    try {
      stream = new EventSource(resolveHostUrl('/api/dsh-remote-dafeiyu/subagents/stream'))
      stream.onopen = () => {
        if (fallbackTimer) {
          ;(globalThis as { clearTimeout?: (id: number) => void }).clearTimeout?.(fallbackTimer as unknown as number)
          fallbackTimer = undefined
        }
      }
      stream.onmessage = () => void refresh()
      stream.onerror = () => scheduleFallback()
    } catch {
      scheduleFallback()
    }
  }
  startStream()
  const onFocus = (): void => void refresh()
  ;(globalThis as { addEventListener?: (type: string, fn: () => void) => void }).addEventListener?.('focus', onFocus)
  refreshNow.addEventListener('click', (event) => {
    event.stopPropagation()
    void refresh()
  })
  void refresh()

  return () => {
    if (fallbackTimer) (globalThis as { clearTimeout?: (id: number) => void }).clearTimeout?.(fallbackTimer as unknown as number)
    try {
      stream?.close()
    } catch {
      /* ignore */
    }
    ;(globalThis as { removeEventListener?: (type: string, fn: () => void) => void }).removeEventListener?.('focus', onFocus)
    doc.removeEventListener('keydown', onKey)
    doc.removeEventListener('click', onClick)
    fab.remove()
    panel.remove()
    style.remove()
  }
}
