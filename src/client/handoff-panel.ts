/**
 * handoff-panel —— 「一键转生 / 一键分身」的桌面面板。
 *
 * 纯 DOM（和派活/小云雀面板同一条理由：它挂在 body 上，不属于任何 react 槽位，
 * 宿主整页重渲染也带不走它）。
 *
 * 面板只做四件事：**自检 → 收输入 → 发起作业 → 盯状态**。
 * 真正的活儿全在宿主侧（`src/handoff/`）：注入写作指令、等交接文档、建新会话、发首句。
 * 面板绝不自己拼 prompt——文本只有一份，在 `handoff/prompt.ts` 里。
 */
import { resolveHostUrl } from './host-url.js'
import { makeDraggable } from './draggable.js'

export type HandoffKind = 'rebirth' | 'branch'

export interface HandoffPanelDeps {
  /** 当前选中的会话 id（拿不到就返回 undefined）。 */
  getCurrentSession: () => string | undefined
}

interface SelfCheck {
  ok?: boolean
  handoffDir?: string
  handoffDirReady?: boolean
  cwd?: string
  logBytes?: number
  overloadBytes?: number
  overloaded?: boolean
  memoryEntries?: number
  error?: string
}

interface JobView {
  id: string
  kind?: HandoffKind
  status?: 'waiting' | 'creating' | 'done' | 'failed'
  message?: string
  filePath?: string
  newSessionId?: string
  newSessionCwd?: string
}

const STATUS_ROUTE = '/api/dsh-remote-dafeiyu/handoff/status'
const START_ROUTE = '/api/dsh-remote-dafeiyu/handoff/start'
const SELF_ROUTE = '/api/dsh-remote-dafeiyu/handoff/self'
const POLL_MS = 1_500
/** 宿主侧等待交接文档的上限是 180s，这里多给一点余量再放弃。 */
const GIVE_UP_MS = 200_000

function fmtBytes(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '未知'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function shortId(id: string | undefined): string {
  if (!id) return '（未知）'
  const bare = id.replace(/^session-/, '')
  return bare.slice(0, 8)
}

export function mountHandoffPanel(deps: HandoffPanelDeps): {
  open(kind: HandoffKind): void
  close(): void
  destroy(): void
} {
  const doc = (globalThis as { document?: Document }).document
  const noop = { open: () => undefined, close: () => undefined, destroy: () => undefined }
  if (!doc) return noop
  if (!doc.body) {
    let cleanup: { open(kind: HandoffKind): void; close(): void; destroy(): void } | undefined
    const onReady = (): void => {
      cleanup = mountHandoffPanel(deps)
    }
    doc.addEventListener('DOMContentLoaded', onReady, { once: true })
    return {
      open: (kind) => cleanup?.open(kind),
      close: () => cleanup?.close(),
      destroy: () => {
        doc.removeEventListener('DOMContentLoaded', onReady)
        cleanup?.destroy()
      },
    }
  }

  const style = doc.createElement('style')
  style.textContent = `
    #dafeiyu-handoff-panel { position: fixed; right: 24px; top: 12vh; width: min(560px, 92vw); max-height: 84vh;
      overflow: auto; padding: 16px; border-radius: 16px; border: 1px solid #c7d9f7; background: #ffffff;
      color: #1d4ed8; z-index: 2147483002; display: none; box-shadow: 0 12px 36px rgba(0,0,0,.35);
      font-size: 13.5px; line-height: 1.6; }
    #dafeiyu-handoff-panel.open { display: block; }
    #dafeiyu-handoff-panel .hh { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; margin-bottom: 10px; }
    #dafeiyu-handoff-panel .hh button { background: transparent; border: 0; color: #1d4ed8; cursor: pointer; font-size: 14px; font-weight: 600; }
    #dafeiyu-handoff-panel .sec { border: 1px solid #dbe6fb; border-radius: 10px; padding: 10px; margin-bottom: 10px; background: #f7faff; }
    #dafeiyu-handoff-panel .row { display: flex; gap: 8px; flex-wrap: wrap; color: #1d3f8f; }
    #dafeiyu-handoff-panel .kv { font-size: 12.5px; color: #4a6bb3; }
    #dafeiyu-handoff-panel .warn { color: #b7791f; font-weight: 600; }
    #dafeiyu-handoff-panel label { display: block; font-size: 12.5px; color: #1d3f8f; margin: 8px 0 4px; }
    #dafeiyu-handoff-panel textarea { width: 100%; box-sizing: border-box; min-height: 64px; padding: 8px;
      border: 1px solid #c7d9f7; border-radius: 8px; font: inherit; color: #1d3f8f; background: #fff; resize: vertical; }
    #dafeiyu-handoff-panel textarea:focus { outline: 2px solid #93b4f5; }
    #dafeiyu-handoff-panel .go { margin-top: 10px; width: 100%; padding: 9px; border: 0; border-radius: 9px;
      background: #1d4ed8; color: #fff; font-weight: 600; font-size: 13.5px; cursor: pointer; }
    #dafeiyu-handoff-panel .go:disabled { background: #a9bff0; cursor: not-allowed; }
    #dafeiyu-handoff-panel .state { margin-top: 10px; font-size: 12.5px; color: #1d3f8f; white-space: pre-wrap; }
    #dafeiyu-handoff-panel .state.bad { color: #b42318; }
    #dafeiyu-handoff-panel .state.good { color: #16803c; }
    #dafeiyu-handoff-panel .foot { color: #5b7bb5; font-size: 11px; line-height: 1.5; margin-top: 8px; }
  `
  doc.head?.appendChild(style)

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-handoff-panel'

  const head = doc.createElement('div')
  head.className = 'hh'
  const title = doc.createElement('span')
  title.textContent = '一键转生'
  const closeBtn = doc.createElement('button')
  closeBtn.textContent = '关闭 ✕'
  head.append(title, closeBtn)

  const selfSec = doc.createElement('div')
  selfSec.className = 'sec'
  const selfBody = doc.createElement('div')
  selfBody.className = 'kv'
  selfBody.textContent = '正在读取当前会话…'
  selfSec.appendChild(selfBody)

  const inputSec = doc.createElement('div')
  inputSec.className = 'sec'
  const noteLabel = doc.createElement('label')
  noteLabel.textContent = '交接重点（选填）'
  const noteInput = doc.createElement('textarea')
  noteInput.placeholder = '比如：重点把 X 做完，Y 已经放弃别再试'
  const boundaryLabel = doc.createElement('label')
  boundaryLabel.textContent = '边界：哪些东西不要碰（选填）'
  const boundaryInput = doc.createElement('textarea')
  boundaryInput.placeholder = '比如：别碰 src/client.js，本体正在改它'
  inputSec.append(noteLabel, noteInput, boundaryLabel, boundaryInput)

  const goBtn = doc.createElement('button')
  goBtn.className = 'go'
  goBtn.textContent = '开始交接'

  const state = doc.createElement('div')
  state.className = 'state'
  const foot = doc.createElement('div')
  foot.className = 'foot'
  foot.textContent =
    '流程：往当前会话注入写作指令 → 它自己写交接文档 → 新建会话 → 新会话先「报到」。旧会话不会自动归档，建议你确认后手动归档。'

  panel.append(head, selfSec, inputSec, goBtn, state, foot)
  doc.body.appendChild(panel)
  makeDraggable(panel, head, 'handoff')

  let kind: HandoffKind = 'rebirth'
  let jobId = ''
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let giveUpAt = 0
  let busy = false

  const setState = (text: string, tone: 'normal' | 'good' | 'bad' = 'normal'): void => {
    state.className = 'state' + (tone === 'normal' ? '' : ' ' + tone)
    state.textContent = text
  }

  const stopPoll = (): void => {
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = undefined
    jobId = ''
    giveUpAt = 0
  }

  const applyKind = (): void => {
    const branch = kind === 'branch'
    title.textContent = branch ? '🧬 一键分身' : '🐟 一键转生'
    noteLabel.textContent = branch ? '分支任务（必填）：分身要去干什么' : '交接重点（选填）'
    boundaryLabel.textContent = branch ? '边界：哪些东西不要碰（选填，但很推荐写）' : '边界：哪些东西不要碰（选填）'
    goBtn.textContent = branch ? '开始分身' : '开始交接'
    foot.textContent = branch
      ? '分身继承本体的记忆与背景，但去干一条**独立的分支任务**；本体这条会话不受影响。新会话同样先「报到」。'
      : '流程：往当前会话注入写作指令 → 它自己写交接文档 → 新建会话 → 新会话先「报到」。旧会话不会自动归档，建议你确认后手动归档。'
  }

  const loadSelf = async (): Promise<void> => {
    const sessionId = deps.getCurrentSession()
    if (!sessionId) {
      selfBody.textContent = '读不到当前会话：先切到一条对话里再打开。'
      goBtn.disabled = true
      return
    }
    selfBody.textContent = '正在读取当前会话…'
    try {
      const response = await fetch(resolveHostUrl(`${SELF_ROUTE}?sessionId=${encodeURIComponent(sessionId)}`))
      const answer = (await response.json()) as SelfCheck
      if (answer.ok !== true) {
        selfBody.textContent = `自检失败：${String(answer.error ?? '宿主没有返回数据')}`
        goBtn.disabled = true
        return
      }
      const lines: string[] = []
      lines.push(`会话：${shortId(sessionId)}　工作目录：${answer.cwd ?? '（未知）'}`)
      lines.push(
        `会话日志：${fmtBytes(answer.logBytes)}${answer.overloaded ? '　⚠ 已偏大，确实该转了' : ''}` +
          `　记忆库：${answer.memoryEntries ?? 0} 条`,
      )
      lines.push(`交接文档目录：${answer.handoffDir ?? '（未知）'}${answer.handoffDirReady === false ? '（建不出来）' : ''}`)
      selfBody.textContent = lines.join('\n')
      selfBody.style.whiteSpace = 'pre-wrap'
      goBtn.disabled = answer.handoffDirReady === false
    } catch (error) {
      selfBody.textContent = `自检失败：${String((error as Error)?.message ?? error)}`
      goBtn.disabled = true
    }
  }

  const renderJob = (job: JobView | undefined): void => {
    if (!job) {
      setState('作业丢了（宿主可能重启过）。再点一次「开始」。', 'bad')
      stopPoll()
      goBtn.disabled = false
      busy = false
      return
    }
    const kindText = job.kind === 'branch' ? '分身' : '转生'
    if (job.status === 'waiting') {
      setState(`${kindText}进行中：已让当前会话写交接文档，正在等它落盘…\n文件：${job.filePath ?? ''}`)
      return
    }
    if (job.status === 'creating') {
      setState('交接文档到手，正在新建会话并让它报到…')
      return
    }
    if (job.status === 'done') {
      setState(
        `${kindText}完成 ✅\n新会话：${job.newSessionId ?? '（未知）'}${job.newSessionCwd ? `\n工作目录：${job.newSessionCwd}` : ''}` +
          `\n\n去会话列表点开它，它应该已经报到了（复述现状 + 打算的第一步），你点头它才会开工。` +
          `\n旧会话建议手动归档。` +
          (job.newSessionCwd ? '' : '\n⚠ 新会话没拿到工作目录，可能不在对应分组里。'),
        'good',
      )
      stopPoll()
      goBtn.disabled = false
      busy = false
      return
    }
    setState(`${kindText}失败：${job.message ?? '未知原因'}`, 'bad')
    stopPoll()
    goBtn.disabled = false
    busy = false
  }

  const poll = async (): Promise<void> => {
    if (!jobId) return
    if (Date.now() > giveUpAt) {
      setState('等太久了，先不盯了（宿主那边可能还在等交接文档，可以直接看面板重开）。', 'bad')
      stopPoll()
      goBtn.disabled = false
      busy = false
      return
    }
    try {
      const response = await fetch(resolveHostUrl(`${STATUS_ROUTE}?jobId=${encodeURIComponent(jobId)}`))
      const answer = (await response.json()) as { ok?: boolean; job?: JobView; error?: string }
      if (answer.ok !== true || !answer.job) {
        setState(`读取状态失败：${String(answer.error ?? '宿主没有返回作业')}`, 'bad')
        stopPoll()
        goBtn.disabled = false
        busy = false
        return
      }
      renderJob(answer.job)
      if (jobId) pollTimer = setTimeout(() => void poll(), POLL_MS)
    } catch (error) {
      setState(`读取状态失败：${String((error as Error)?.message ?? error)}`, 'bad')
      stopPoll()
      goBtn.disabled = false
      busy = false
    }
  }

  const start = async (): Promise<void> => {
    if (busy) return
    const sessionId = deps.getCurrentSession()
    if (!sessionId) {
      setState('读不到当前会话，先切到一条对话里。', 'bad')
      return
    }
    const note = noteInput.value.trim()
    if (kind === 'branch' && note === '') {
      setState('分身必须写清楚分支任务，不然它不知道去干什么。', 'bad')
      noteInput.focus()
      return
    }
    busy = true
    goBtn.disabled = true
    setState('正在注入写作指令…')
    stopPoll()
    try {
      const response = await fetch(resolveHostUrl(START_ROUTE), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
        body: JSON.stringify({ kind, sessionId, note, boundary: boundaryInput.value.trim() }),
      })
      const answer = (await response.json()) as { ok?: boolean; jobId?: string; message?: string; error?: string }
      if (answer.ok !== true || !answer.jobId) {
        setState(`发起失败：${String(answer.message ?? answer.error ?? '宿主没有受理')}`, 'bad')
        goBtn.disabled = false
        busy = false
        return
      }
      jobId = answer.jobId
      giveUpAt = Date.now() + GIVE_UP_MS
      setState('已注入写作指令，等它写交接文档…')
      pollTimer = setTimeout(() => void poll(), POLL_MS)
    } catch (error) {
      setState(`发起失败：${String((error as Error)?.message ?? error)}`, 'bad')
      goBtn.disabled = false
      busy = false
    }
  }

  const open = (next: HandoffKind): void => {
    kind = next === 'branch' ? 'branch' : 'rebirth'
    applyKind()
    panel.classList.add('open')
    stopPoll()
    busy = false
    goBtn.disabled = false
    setState('')
    void loadSelf()
  }
  const close = (): void => {
    panel.classList.remove('open')
    // 关面板不停作业：作业在宿主侧跑着，重新打开还能看到结果。
    if (pollTimer) clearTimeout(pollTimer)
    pollTimer = undefined
  }

  closeBtn.addEventListener('click', () => close())
  goBtn.addEventListener('click', () => void start())
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && panel.classList.contains('open')) close()
  }
  doc.addEventListener('keydown', onKey)

  return {
    open,
    close,
    destroy(): void {
      stopPoll()
      if (pollTimer) clearTimeout(pollTimer)
      doc.removeEventListener('keydown', onKey)
      panel.remove()
      style.remove()
    },
  }
}
