/**
 * client/groups-panel —— 肥鱼拉群的**悬浮群面板**（2026-11-19 v2）。
 *
 * 纯 DOM（与派活/转生那两个面板同一条理由：挂在 body 上，不属于任何 react 槽位）。
 * v2 起多了三件事：成员显示**对话名**（不是 id）、输入框打 @ 弹候选、成员可移出 / 群可解散。
 * 真正的活儿在宿主侧（src/groups/）：拆条投递、入群通知、离开/解散通知都在那边。
 */
import { makeDraggable } from './draggable.js'
import { resolveHostUrl } from './host-url.js'

export interface GroupsPanelDeps {
  /** 当前选中的会话 id（发消息时作为 me）。 */
  getCurrentSession: () => string | undefined
}

interface MemberView {
  sessionId: string
  name: string
}

interface GroupView {
  id: string
  name: string
  dissolved?: boolean
  /** 群主（成员里带 👑 的那位）：用户 @ 多人时由它分工。 */
  owner?: string
  members: MemberView[]
  updatedAt?: number
}

interface EntryView {
  at: number
  kind: 'user' | 'agent' | 'system'
  from: string
  targets?: string[]
  text: string
}

const LIST_ROUTE = '/api/dsh-remote-dafeiyu/groups'
const MESSAGES_ROUTE = '/api/dsh-remote-dafeiyu/groups/messages'
const POST_ROUTE = '/api/dsh-remote-dafeiyu/groups/post'
const REMOVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/remove'
const DISSOLVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/dissolve'
const POLL_MS = 3_000

function shortId(id: string): string {
  return String(id).replace(/^session-/, '').slice(0, 8)
}

export function mountGroupsPanel(deps: GroupsPanelDeps): { open: () => void; close: () => void; destroy: () => void } {
  const doc = (globalThis as { document?: Document }).document
  const noop = { open: () => undefined, close: () => undefined, destroy: () => undefined }
  if (!doc?.body) return noop

  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-groups-panel'
  panel.style.cssText =
    'position:fixed;right:28px;bottom:96px;width:min(440px,94vw);height:min(540px,74vh);' +
    'display:none;flex-direction:column;background:#ffffff;color:#1d3f8f;border:1px solid #c7d9f7;' +
    'border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.28);z-index:2147483003;font-size:13px;overflow:hidden;'

  const head = doc.createElement('div')
  head.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#f2f7ff;cursor:move;font-weight:600;'
  const title = doc.createElement('span')
  title.textContent = '肥鱼拉群'
  const headBtns = doc.createElement('div')
  headBtns.style.cssText = 'display:flex;gap:6px;align-items:center;'
  const dissolveBtn = doc.createElement('button')
  dissolveBtn.textContent = '解散本群'
  dissolveBtn.style.cssText = 'border:1px solid #f3b6ae;background:transparent;color:#b42318;border-radius:7px;padding:2px 8px;font-size:11.5px;cursor:pointer;'
  const close = doc.createElement('button')
  close.textContent = '关闭 ✕'
  close.style.cssText = 'border:0;background:transparent;color:#1d4ed8;cursor:pointer;font-size:12.5px;'
  headBtns.append(dissolveBtn, close)
  head.append(title, headBtns)

  const groupBar = doc.createElement('div')
  groupBar.style.cssText = 'display:flex;gap:6px;padding:8px 10px;overflow-x:auto;border-bottom:1px solid #e6eefb;'
  const memberBar = doc.createElement('div')
  memberBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid #e6eefb;background:#fbfdff;'
  const log = doc.createElement('div')
  log.style.cssText = 'flex:1 1 auto;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px;background:#fbfdff;'

  const composer = doc.createElement('div')
  composer.style.cssText = 'position:relative;border-top:1px solid #e6eefb;padding:8px 10px;display:flex;flex-direction:column;gap:6px;background:#fff;'
  const mentionBar = doc.createElement('div')
  mentionBar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;'
  const input = doc.createElement('textarea')
  input.placeholder = '说点什么：输入 @ 选择要通知的会话'
  input.style.cssText =
    'width:100%;box-sizing:border-box;min-height:54px;max-height:130px;padding:8px;border:1px solid #c7d9f7;' +
    'border-radius:8px;font:inherit;color:#1d3f8f;resize:vertical;'
  const dropdown = doc.createElement('div')
  dropdown.hidden = true
  dropdown.style.cssText =
    'position:absolute;left:10px;right:10px;bottom:96px;max-height:180px;overflow:auto;background:#fff;' +
    'border:1px solid #c7d9f7;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,.18);z-index:2147483004;display:flex;flex-direction:column;'
  const sendRow = doc.createElement('div')
  sendRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:8px;'
  const hint = doc.createElement('span')
  hint.style.cssText = 'font-size:11px;color:#6b8cc4;'
  const HINT_DEFAULT = '只有被 @ 的会话会收到这条；其他成员只在记录里看到'
  hint.textContent = HINT_DEFAULT
  const send = doc.createElement('button')
  send.textContent = '发送'
  send.style.cssText = 'border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:6px 14px;cursor:pointer;'
  sendRow.append(hint, send)
  composer.append(mentionBar, input, dropdown, sendRow)
  panel.append(head, groupBar, memberBar, log, composer)
  doc.body.appendChild(panel)
  try {
    makeDraggable(panel, head, 'groups')
  } catch {
    /* 拖动是增强项 */
  }

  let groups: GroupView[] = []
  let currentId = ''
  let targets = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let opened = false

  const call = async (route: string, body?: unknown): Promise<Record<string, unknown>> => {
    try {
      const response = await fetch(
        resolveHostUrl(route),
        body === undefined
          ? { method: 'GET', headers: { 'x-drc-pair': '1' } }
          : { method: 'POST', headers: { 'content-type': 'application/json', 'x-drc-pair': '1' }, body: JSON.stringify(body) },
      )
      return (await response.json()) as Record<string, unknown>
    } catch {
      return { ok: false }
    }
  }

  const currentGroup = (): GroupView | undefined => groups.find((group) => group.id === currentId)

  const paintGroups = (): void => {
    groupBar.replaceChildren()
    if (groups.length === 0) {
      const empty = doc.createElement('span')
      empty.style.cssText = 'font-size:12px;color:#6b8cc4;'
      empty.textContent = '还没有群：到 设置 → 大肥鱼 → 群 里建一个。'
      groupBar.appendChild(empty)
      return
    }
    for (const group of groups) {
      const chip = doc.createElement('button')
      chip.textContent = group.name + (group.dissolved === true ? '（已解散）' : '')
      chip.dataset.group = group.id
      const active = group.id === currentId
      chip.style.cssText =
        'border:1px solid ' + (active ? '#1d4ed8' : '#c7d9f7') +
        ';background:' + (active ? '#1d4ed8' : 'transparent') +
        ';color:' + (active ? '#fff' : '#1d4ed8') +
        ';border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer;white-space:nowrap;'
      chip.addEventListener('click', () => {
        currentId = group.id
        targets = new Set()
        paintGroups()
        paintMembers()
        paintMentions()
        void paintLog()
      })
      groupBar.appendChild(chip)
    }
  }

  const paintMembers = (): void => {
    memberBar.replaceChildren()
    const group = currentGroup()
    if (group === undefined) return
    const label = doc.createElement('span')
    label.style.cssText = 'font-size:11.5px;color:#6b8cc4;align-self:center;'
    label.textContent = '成员（点名字 @，点 × 移出）：'
    memberBar.appendChild(label)
    for (const member of group.members) {
      const wrap = doc.createElement('span')
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;border:1px solid #c7d9f7;border-radius:999px;padding:1px 4px 1px 8px;'
      const chip = doc.createElement('button')
      chip.textContent = (group.owner === member.sessionId ? '👑 ' : '') + member.name
      chip.title = group.owner === member.sessionId ? '群主：用户 @ 多人时由它分工' : '点一下 @ 他'
      const on = targets.has(member.sessionId)
      chip.style.cssText =
        'border:0;background:transparent;color:' + (on ? '#1d4ed8' : '#365a96') + ';font-size:11.5px;cursor:pointer;padding:1px 2px;' +
        (on ? 'font-weight:600;' : '')
      chip.addEventListener('click', () => {
        if (targets.has(member.sessionId)) targets.delete(member.sessionId)
        else targets.add(member.sessionId)
        paintMembers()
        paintMentions()
      })
      const kick = doc.createElement('button')
      kick.textContent = '×'
      kick.title = '移出本群'
      kick.style.cssText = 'border:0;background:transparent;color:#b42318;cursor:pointer;font-size:12px;padding:0 3px;'
      kick.addEventListener('click', () => {
        void (async () => {
          const answer = await call(REMOVE_ROUTE, { groupId: group.id, sessionId: member.sessionId })
          hint.textContent = answer.ok === true ? member.name + ' 已移出本群（双方都会收到通知）' : '移出失败：' + String(answer.message ?? '未知原因')
          await refresh()
        })()
      })
      wrap.append(chip, kick)
      memberBar.appendChild(wrap)
    }
  }

  const paintMentions = (): void => {
    mentionBar.replaceChildren()
    const group = currentGroup()
    if (group === undefined) return
    for (const member of group.members) {
      if (!targets.has(member.sessionId)) continue
      const chip = doc.createElement('span')
      chip.textContent = '@' + member.name
      chip.style.cssText = 'border:1px solid #1d4ed8;background:#e8f0ff;color:#1d4ed8;border-radius:999px;padding:2px 8px;font-size:11.5px;'
      mentionBar.appendChild(chip)
    }
  }

  const paintLog = async (): Promise<void> => {
    if (currentId === '') return
    const group = currentGroup()
    const answer = await call(MESSAGES_ROUTE + '?groupId=' + encodeURIComponent(currentId) + '&limit=50')
    const rows = Array.isArray(answer.messages) ? (answer.messages as EntryView[]) : []
    log.replaceChildren()
    if (rows.length === 0) {
      const empty = doc.createElement('div')
      empty.style.cssText = 'color:#6b8cc4;font-size:12px;'
      empty.textContent = '还没有消息。'
      log.appendChild(empty)
      return
    }
    const nameOf = (sessionId: string): string => {
      const member = group?.members.find((row) => row.sessionId === sessionId)
      return member?.name ?? shortId(sessionId)
    }
    for (const row of rows) {
      const isUser = row.kind === 'user'
      const isSystem = row.kind === 'system'
      const who = isSystem ? '系统' : isUser ? '我' : nameOf(row.from)
      const targetsText = (row.targets ?? []).map((id) => '@' + nameOf(id)).join(' ')
      const line = doc.createElement('div')
      line.style.cssText =
        'padding:6px 9px;border-radius:9px;line-height:1.5;' +
        (isUser
          ? 'background:#e8f0ff;align-self:flex-end;max-width:88%;'
          : isSystem
            ? 'color:#8a5a00;background:#fff8e6;font-size:12px;'
            : 'background:#f3f6fb;max-width:88%;')
      const meta = doc.createElement('div')
      meta.style.cssText = 'font-size:11px;color:#6b8cc4;margin-bottom:2px;'
      meta.textContent = who + (targetsText === '' ? '' : ' → ' + targetsText)
      const body = doc.createElement('div')
      body.style.cssText = 'white-space:pre-wrap;word-break:break-word;'
      body.textContent = row.text
      line.append(meta, body)
      log.appendChild(line)
    }
    log.scrollTop = log.scrollHeight
  }

  const refresh = async (): Promise<void> => {
    const answer = await call(LIST_ROUTE)
    const list = Array.isArray(answer.groups) ? (answer.groups as GroupView[]) : []
    groups = list
    if (currentId === '' && list.length > 0) currentId = list[0]!.id
    if (currentId !== '' && !list.some((group) => group.id === currentId)) currentId = list[0]?.id ?? ''
    paintGroups()
    paintMembers()
    paintMentions()
    await paintLog()
  }

  const schedule = (): void => {
    if (!opened) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refresh().finally(schedule)
    }, POLL_MS)
  }

  /* ── @ 候选下拉：输入框里打 @ 就弹（全体 + 每个成员，显示对话名） ── */
  const hideDropdown = (): void => {
    dropdown.hidden = true
    dropdown.replaceChildren()
  }
  const showDropdown = (): void => {
    const group = currentGroup()
    if (group === undefined) {
      hideDropdown()
      return
    }
    dropdown.replaceChildren()
    const rows: Array<{ key: string; label: string; sessionIds: string[] }> = [
      { key: 'all', label: '全体（' + group.members.length + ' 人）', sessionIds: group.members.map((member) => member.sessionId) },
      ...group.members.map((member) => ({ key: member.sessionId, label: member.name, sessionIds: [member.sessionId] })),
    ]
    for (const row of rows) {
      const item = doc.createElement('button')
      item.type = 'button'
      item.textContent = row.label
      item.dataset.mentionOption = row.key
      item.style.cssText =
        'border:0;background:transparent;text-align:left;padding:6px 10px;font-size:12.5px;color:#1d3f8f;cursor:pointer;'
      item.addEventListener('mousedown', (event) => {
        event.preventDefault()
        for (const id of row.sessionIds) targets.add(id)
        input.value = input.value.replace(/@[^@]*$/, '')
        paintMembers()
        paintMentions()
        hideDropdown()
        input.focus()
      })
      dropdown.appendChild(item)
    }
    dropdown.hidden = false
  }
  input.addEventListener('input', () => {
    if (/@[^@]*$/.test(input.value)) showDropdown()
    else hideDropdown()
  })
  input.addEventListener('blur', () => {
    // 给 mousedown 一点时间：它是先于 blur 触发的
    setTimeout(hideDropdown, 150)
  })

  send.addEventListener('click', () => {
    const text = input.value.trim()
    if (text === '' || currentId === '') return
    send.disabled = true
    void (async () => {
      const answer = await call(POST_ROUTE, { groupId: currentId, text, targets: [...targets] })
      input.value = ''
      targets = new Set()
      hint.textContent =
        answer.ok === true ? HINT_DEFAULT : '发送有问题：' + String(answer.message ?? '未知原因')
      await refresh()
      send.disabled = false
    })()
  })

  dissolveBtn.addEventListener('click', () => {
    const group = currentGroup()
    if (group === undefined) return
    void (async () => {
      const answer = await call(DISSOLVE_ROUTE, { groupId: group.id })
      hint.textContent =
        answer.ok === true ? '群已解散，全体成员都收到了通知' : '解散失败：' + String(answer.message ?? '未知原因')
      await refresh()
    })()
  })

  const hide = (): void => {
    opened = false
    panel.style.display = 'none'
    if (timer !== undefined) clearTimeout(timer)
  }
  close.addEventListener('click', hide)

  return {
    open(): void {
      opened = true
      panel.style.display = 'flex'
      void refresh().finally(schedule)
    },
    close: hide,
    destroy(): void {
      hide()
      panel.remove()
    },
  }
}
