/**
 * client/groups-panel —— 肥鱼拉群的**三栏群面板**（2026-11-19 v3，参照 QQ 消息界面）。
 *
 * 左：群列表 +「创建群」；中：消息流 + 输入框（@ 候选）；右：成员列表（右键菜单 + 加人）。
 * 纯 DOM（挂在 body 上，不属于任何 react 槽位）。
 *
 * ⚠️ 面板必须是**全页单例**：本体 client 被装载多次时，每份实例都会挂一个自己的面板、
 * 也各自监听 dafeiyu:action——形象菜单派发一次就会同时打开 N 个。
 * 所以挂载走 `globalThis.__dafeiyuGroupsPanel ??=`，open() 也要幂等。
 */
import { makeDraggable } from './draggable.js'
import { resolveHostUrl } from './host-url.js'

export interface GroupsPanelDeps {
  /** 当前选中的会话 id（发消息时作为 me）。 */
  getCurrentSession: () => string | undefined
}

interface MemberView {
  sessionId: string
  name?: string
  role?: string
}

interface GroupView {
  id: string
  name: string
  dissolved?: boolean
  owner?: string
  ownerName?: string
  members: MemberView[]
  updatedAt?: number
}

interface EntryView {
  at: number
  kind: 'user' | 'agent' | 'system'
  from: string
  targets?: string[]
  text: string
  summary?: string
}

interface SessionView {
  id: string
  title?: string
}

const LIST_ROUTE = '/api/dsh-remote-dafeiyu/groups'
const MESSAGES_ROUTE = '/api/dsh-remote-dafeiyu/groups/messages'
const POST_ROUTE = '/api/dsh-remote-dafeiyu/groups/post'
const CREATE_ROUTE = '/api/dsh-remote-dafeiyu/groups/create'
const INVITE_ROUTE = '/api/dsh-remote-dafeiyu/groups/invite'
const REMOVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/remove'
const DISSOLVE_ROUTE = '/api/dsh-remote-dafeiyu/groups/dissolve'
const OWNER_ROUTE = '/api/dsh-remote-dafeiyu/groups/owner'
const ROLE_ROUTE = '/api/dsh-remote-dafeiyu/groups/role'
const SESSIONS_ROUTE = '/api/dsh-remote-dafeiyu/groups/sessions'
const POLL_MS = 3_000

function shortId(id: string): string {
  return String(id).replace(/^session-/, '').slice(0, 8)
}

async function call(route: string, body?: unknown): Promise<Record<string, unknown>> {
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

export function mountGroupsPanel(deps: GroupsPanelDeps): { open: () => void; close: () => void; destroy: () => void } {
  const doc = (globalThis as { document?: Document }).document
  const noop = { open: () => undefined, close: () => undefined, destroy: () => undefined }
  if (!doc?.body) return noop

  /* ── 外壳 ─────────────────────────────────────────────── */
  const panel = doc.createElement('div')
  panel.id = 'dafeiyu-groups-panel'
  panel.style.cssText =
    'position:fixed;right:24px;bottom:80px;width:min(780px,95vw);height:min(560px,76vh);display:none;' +
    'flex-direction:column;background:#fff;color:#1d3f8f;border:1px solid #c7d9f7;border-radius:14px;' +
    'box-shadow:0 18px 50px rgba(20,50,120,.24);z-index:2147483003;font-size:13px;overflow:hidden;'

  const bar = doc.createElement('div')
  bar.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:#f2f7ff;' +
    'border-bottom:1px solid #dbe6fb;cursor:move;font-weight:600;flex:0 0 auto;'
  const barTitle = doc.createElement('span')
  barTitle.textContent = '肥鱼拉群'
  const barRight = doc.createElement('div')
  barRight.style.cssText = 'display:flex;gap:8px;align-items:center;'
  const dissolveBtn = doc.createElement('button')
  dissolveBtn.textContent = '解散本群'
  dissolveBtn.style.cssText = 'border:0;background:transparent;color:#b42318;cursor:pointer;font-size:12px;'
  const closeBtn = doc.createElement('button')
  closeBtn.textContent = '关闭 ✕'
  closeBtn.style.cssText = 'border:0;background:transparent;color:#1d4ed8;cursor:pointer;font-size:12.5px;'
  barRight.append(dissolveBtn, closeBtn)
  bar.append(barTitle, barRight)

  const body = doc.createElement('div')
  body.style.cssText = 'flex:1 1 auto;display:flex;min-height:0;'

  /* 左栏 */
  const left = doc.createElement('div')
  left.style.cssText = 'width:186px;border-right:1px solid #dbe6fb;display:flex;flex-direction:column;background:#f8fbff;flex:0 0 auto;'
  const leftHead = doc.createElement('div')
  leftHead.style.cssText = 'padding:8px 10px;display:flex;gap:6px;'
  const newGroupBtn = doc.createElement('button')
  newGroupBtn.textContent = '+ 创建群'
  newGroupBtn.style.cssText =
    'flex:1;border:1px solid #dbe6fb;background:#fff;color:#1d4ed8;border-radius:8px;padding:5px 0;font-size:12.5px;cursor:pointer;'
  leftHead.append(newGroupBtn)
  const gList = doc.createElement('div')
  gList.style.cssText = 'overflow:auto;flex:1;'
  left.append(leftHead, gList)

  /* 中栏 */
  const mid = doc.createElement('div')
  mid.style.cssText = 'flex:1 1 auto;display:flex;flex-direction:column;min-width:0;'
  const midHead = doc.createElement('div')
  midHead.style.cssText = 'padding:8px 14px;border-bottom:1px solid #dbe6fb;display:flex;justify-content:space-between;align-items:center;'
  const midName = doc.createElement('span')
  midName.style.fontWeight = '600'
  const midMeta = doc.createElement('span')
  midMeta.style.cssText = 'font-size:11.5px;color:#5b7bb5;'
  midHead.append(midName, midMeta)
  const msgs = doc.createElement('div')
  msgs.style.cssText = 'flex:1 1 auto;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:9px;background:#fbfdff;'
  const composer = doc.createElement('div')
  composer.style.cssText = 'position:relative;border-top:1px solid #dbe6fb;padding:8px 12px;background:#fff;flex:0 0 auto;'
  const chips = doc.createElement('div')
  chips.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;'
  const input = doc.createElement('textarea')
  input.placeholder = '说点什么：输入 @ 选择要通知的会话（多选即分工）'
  input.style.cssText =
    'width:100%;min-height:56px;max-height:110px;resize:vertical;padding:8px 10px;border:1px solid #c7d9f7;' +
    'border-radius:9px;font:inherit;color:#1d3f8f;'
  const atMenu = doc.createElement('div')
  atMenu.style.cssText =
    'position:absolute;left:12px;bottom:112px;width:240px;max-height:190px;overflow:auto;background:#fff;' +
    'border:1px solid #c7d9f7;border-radius:9px;box-shadow:0 10px 24px rgba(20,50,120,.2);display:none;z-index:6;'
  const sendRow = doc.createElement('div')
  sendRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-top:6px;'
  const hint = doc.createElement('span')
  hint.style.cssText = 'font-size:11px;color:#93a9cf;'
  const HINT = '只有被 @ 的会话会收到这条；其他成员只在记录里看到'
  hint.textContent = HINT
  const sendBtn = doc.createElement('button')
  sendBtn.textContent = '发送'
  sendBtn.style.cssText = 'border:0;border-radius:9px;background:#1d4ed8;color:#fff;padding:6px 16px;cursor:pointer;'
  sendRow.append(hint, sendBtn)
  composer.append(chips, input, atMenu, sendRow)
  mid.append(midHead, msgs, composer)

  /* 右栏 */
  const right = doc.createElement('div')
  right.style.cssText = 'width:196px;border-left:1px solid #dbe6fb;display:flex;flex-direction:column;background:#f8fbff;flex:0 0 auto;'
  const rightHead = doc.createElement('div')
  rightHead.style.cssText =
    'padding:9px 10px;border-bottom:1px solid #dbe6fb;font-weight:600;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;'
  const rightTitle = doc.createElement('span')
  rightTitle.textContent = '群成员'
  const addMemberBtn = doc.createElement('button')
  addMemberBtn.textContent = '+ 加人'
  addMemberBtn.title = '把会话拉进这个群'
  addMemberBtn.style.cssText = 'border:1px solid #dbe6fb;background:#fff;color:#1d4ed8;border-radius:7px;padding:1px 8px;font-size:11.5px;cursor:pointer;'
  rightHead.append(rightTitle, addMemberBtn)
  const mList = doc.createElement('div')
  mList.style.cssText = 'overflow:auto;flex:1;padding:6px;'
  right.append(rightHead, mList)

  body.append(left, mid, right)

  /* 创建群 / 加人 二级视图 */
  const overlay = doc.createElement('div')
  overlay.style.cssText =
    'position:absolute;inset:0;background:rgba(240,246,255,.98);display:none;flex-direction:column;z-index:7;'
  const ovHead = doc.createElement('div')
  ovHead.style.cssText =
    'padding:10px 14px;border-bottom:1px solid #dbe6fb;display:flex;justify-content:space-between;align-items:center;font-weight:600;'
  const ovTitle = doc.createElement('span')
  const ovBack = doc.createElement('button')
  ovBack.textContent = '返回'
  ovBack.style.cssText = 'border:0;background:transparent;color:#1d4ed8;cursor:pointer;font-size:12.5px;'
  ovHead.append(ovTitle, ovBack)
  const ovBody = doc.createElement('div')
  ovBody.style.cssText = 'padding:14px;display:flex;gap:14px;flex:1;min-height:0;'
  const ovLeft = doc.createElement('div')
  ovLeft.style.cssText = 'display:flex;flex-direction:column;gap:8px;flex:0 0 240px;'
  const nameInput = doc.createElement('input')
  nameInput.type = 'text'
  nameInput.placeholder = '群名，例如：前后端联调'
  nameInput.style.cssText = 'padding:7px 10px;border:1px solid #c7d9f7;border-radius:8px;font:inherit;color:#1d3f8f;'
  const ovTip = doc.createElement('div')
  ovTip.style.cssText = 'font-size:12px;color:#5b7bb5;line-height:1.7;'
  ovLeft.append(nameInput, ovTip)
  const ovRight = doc.createElement('div')
  ovRight.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:6px;min-width:0;'
  const pickBox = doc.createElement('div')
  pickBox.style.cssText = 'flex:1;overflow:auto;border:1px solid #dbe6fb;border-radius:9px;background:#fff;padding:6px;'
  ovRight.append(pickBox)
  ovBody.append(ovLeft, ovRight)
  const ovFoot = doc.createElement('div')
  ovFoot.style.cssText = 'padding:10px 14px;border-top:1px solid #dbe6fb;display:flex;justify-content:space-between;align-items:center;'
  const ovCount = doc.createElement('span')
  ovCount.style.cssText = 'font-size:11.5px;color:#5b7bb5;'
  const ovOk = doc.createElement('button')
  ovOk.style.cssText = 'border:0;border-radius:8px;background:#1d4ed8;color:#fff;padding:6px 14px;cursor:pointer;'
  ovFoot.append(ovCount, ovOk)
  overlay.append(ovHead, ovBody, ovFoot)

  /* 身份小窗 */
  const roleBox = doc.createElement('div')
  roleBox.style.cssText =
    'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:300px;background:#fff;' +
    'border:1px solid #c7d9f7;border-radius:12px;box-shadow:0 18px 50px rgba(20,50,120,.22);padding:14px;display:none;z-index:8;'
  const roleTitle = doc.createElement('div')
  roleTitle.style.cssText = 'font-weight:600;margin-bottom:8px;'
  const roleInput = doc.createElement('input')
  roleInput.type = 'text'
  roleInput.maxLength = 20
  roleInput.placeholder = '例如：前端主程 / 后端主程 / 总经理'
  roleInput.style.cssText = 'width:100%;padding:7px 9px;border:1px solid #c7d9f7;border-radius:8px;font:inherit;color:#1d3f8f;box-sizing:border-box;'
  const roleRow = doc.createElement('div')
  roleRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:10px;'
  const roleCancel = doc.createElement('button')
  roleCancel.textContent = '取消'
  roleCancel.style.cssText = 'border:1px solid #dbe6fb;background:#fff;color:#1d3f8f;border-radius:8px;padding:5px 12px;cursor:pointer;'
  const roleSave = doc.createElement('button')
  roleSave.textContent = '保存'
  roleSave.style.cssText = 'border:0;background:#1d4ed8;color:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;'
  roleRow.append(roleCancel, roleSave)
  roleBox.append(roleTitle, roleInput, roleRow)

  /* 右键菜单 */
  const ctxMenu = doc.createElement('div')
  ctxMenu.style.cssText =
    'position:fixed;background:#fff;border:1px solid #c7d9f7;border-radius:9px;box-shadow:0 10px 24px rgba(20,50,120,.2);' +
    'padding:4px;display:none;z-index:2147483005;min-width:150px;'

  panel.append(bar, body, overlay, roleBox)
  doc.body.appendChild(panel)
  doc.body.appendChild(ctxMenu)
  try {
    makeDraggable(panel, bar, 'groups')
  } catch {
    /* 拖动是增强项 */
  }

  /* ── 状态 ─────────────────────────────────────────────── */
  let groups: GroupView[] = []
  let sessions: SessionView[] = []
  let currentId = ''
  let targets = new Set<string>()
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let opened = false
  let overlayMode: 'create' | 'invite' = 'create'
  let pickOrder: string[] = []
  let roleTarget = ''

  const current = (): GroupView | undefined => groups.find((group) => group.id === currentId)
  const memberName = (group: GroupView | undefined, id: string): string => {
    const member = group?.members.find((row) => row.sessionId === id)
    const name = member?.name?.trim()
    return name !== undefined && name !== '' ? name : shortId(id)
  }

  /* ── 渲染 ─────────────────────────────────────────────── */
  const el = (tag: string, css: string, text?: string): HTMLElement => {
    const node = doc.createElement(tag)
    node.style.cssText = css
    if (text !== undefined) node.textContent = text
    return node
  }

  const renderGroups = (): void => {
    gList.replaceChildren()
    if (groups.length === 0) {
      gList.appendChild(el('div', 'padding:10px;font-size:12px;color:#93a9cf;', '还没有群，点上面「+ 创建群」。'))
      return
    }
    for (const group of groups) {
      const item = el('div', 'padding:8px 10px;cursor:pointer;border-left:3px solid transparent;' +
        (group.id === currentId ? 'background:#e8f0ff;border-left-color:#1d4ed8;' : ''))
      const nameRow = el('div', 'font-size:13px;font-weight:600;display:flex;gap:6px;align-items:center;')
      nameRow.append(el('span', 'width:7px;height:7px;border-radius:50%;background:#3ecf8e;flex:0 0 auto;'))
      nameRow.append(el('span', '', group.name + (group.dissolved === true ? '（已解散）' : '')))
      const sub = el('div', 'font-size:11.5px;color:#5b7bb5;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
        group.members.length + ' 人 · 群主 ' + (group.ownerName ?? '未设'))
      item.append(nameRow, sub)
      item.addEventListener('click', () => {
        currentId = group.id
        targets = new Set()
        render()
      })
      gList.appendChild(item)
    }
  }

  const renderHead = (): void => {
    const group = current()
    midName.textContent = group?.name ?? '（未选群）'
    midMeta.textContent = group === undefined ? '' : group.members.length + ' 人 · 群主 ' + (group.ownerName ?? '未设')
    rightTitle.textContent = '群成员'
    barTitle.textContent = group === undefined ? '肥鱼拉群' : '肥鱼拉群 · ' + group.name
    dissolveBtn.disabled = group === undefined
    addMemberBtn.disabled = group === undefined
  }

  const roleTag = (group: GroupView, member: MemberView): HTMLElement | undefined => {
    if (group.owner === member.sessionId) return el('span', 'font-size:10.5px;color:#fff;background:#e2a33a;border-radius:999px;padding:0 6px;', '群主')
    if (typeof member.role === 'string' && member.role.trim() !== '') {
      return el('span', 'font-size:10.5px;color:#fff;background:#7aa2f7;border-radius:999px;padding:0 6px;', member.role.trim())
    }
    return undefined
  }

  const renderMsgs = (): void => {
    const group = current()
    msgs.replaceChildren()
    if (group === undefined) return
    const visible = group.dissolved === true ? '（群已解散）' : ''
    if (visible !== '') msgs.appendChild(el('div', 'color:#8a5a00;background:#fff8e6;padding:6px 10px;border-radius:8px;font-size:12px;', visible))
    const rows = (group as unknown as { entries?: EntryView[] }).entries ?? []
    if (rows.length === 0) {
      msgs.appendChild(el('div', 'color:#93a9cf;font-size:12px;', '还没有消息。'))
      return
    }
    for (const row of rows) {
      const isUser = row.kind === 'user'
      const isSystem = row.kind === 'system'
      const wrap = el('div', 'max-width:82%;' + (isUser ? 'margin-left:auto;' : ''))
      const who = el('div', 'font-size:11px;color:#5b7bb5;margin-bottom:2px;display:flex;gap:6px;align-items:center;' + (isUser ? 'justify-content:flex-end;' : ''))
      const whoName = isSystem ? '系统' : isUser ? '我' : memberName(group, row.from)
      who.append(el('span', '', whoName))
      const member = group.members.find((m) => m.sessionId === row.from)
      const tag = member === undefined ? undefined : roleTag(group, member)
      if (tag !== undefined && !isUser && !isSystem) who.append(tag)
      for (const target of row.targets ?? []) {
        who.append(el('span', 'color:#93a9cf;', '→ @' + memberName(group, target)))
      }
      const bubble = el('div', 'padding:7px 10px;border-radius:10px;white-space:pre-wrap;word-break:break-word;' +
        (isUser ? 'background:#e8f0ff;' : isSystem ? 'background:#fff8e6;color:#8a5a00;font-size:12px;' : 'background:#f3f6fb;'))
      bubble.textContent = row.kind === 'agent' && typeof row.summary === 'string' && row.summary !== ''
        ? row.summary
        : row.text
      wrap.append(who, bubble)
      if (row.kind === 'agent' && typeof row.summary === 'string' && row.summary !== '' && row.text !== row.summary) {
        const toggle = el('div', 'margin-top:4px;font-size:11.5px;color:#1d4ed8;cursor:pointer;', '展开全文')
        const full = el('div', 'display:none;margin-top:6px;padding-top:6px;border-top:1px dashed #dbe6fb;color:#365a96;font-size:12.5px;white-space:pre-wrap;', row.text)
        toggle.addEventListener('click', () => {
          const open = full.style.display !== 'none'
          full.style.display = open ? 'none' : 'block'
          toggle.textContent = open ? '展开全文' : '收起'
        })
        bubble.append(toggle, full)
      }
      wrap.append(bubble)
      msgs.appendChild(wrap)
    }
    msgs.scrollTop = msgs.scrollHeight
  }

  const renderMembers = (): void => {
    const group = current()
    mList.replaceChildren()
    if (group === undefined) return
    for (const member of group.members) {
      const row = el('div', 'display:flex;gap:8px;align-items:center;padding:6px 7px;border-radius:8px;cursor:pointer;')
      row.title = '右键：任命群主 / 设置身份 / 移出本群'
      row.addEventListener('mouseenter', () => { row.style.background = '#eef4ff' })
      row.addEventListener('mouseleave', () => { row.style.background = 'transparent' })
      const name = member.name?.trim() || shortId(member.sessionId)
      const avatar = el('div', 'width:26px;height:26px;border-radius:50%;background:#cfe0ff;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex:0 0 auto;', name.slice(0, 1))
      const info = el('div', 'min-width:0;flex:1;')
      const nameRow = el('div', 'font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', (group.owner === member.sessionId ? '👑 ' : '') + name)
      const roleRow = el('div', 'font-size:11px;color:#5b7bb5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
        typeof member.role === 'string' && member.role.trim() !== '' ? member.role : '未设身份')
      info.append(nameRow, roleRow)
      row.append(avatar, info)
      row.addEventListener('contextmenu', (event) => {
        event.preventDefault()
        openCtx(event.clientX, event.clientY, member.sessionId)
      })
      mList.appendChild(row)
    }
  }

  const renderChips = (): void => {
    chips.replaceChildren()
    const group = current()
    if (group === undefined || targets.size === 0) {
      chips.appendChild(el('span', 'font-size:11.5px;color:#93a9cf;', '输入 @ 选择要通知的会话'))
      return
    }
    for (const id of targets) {
      chips.appendChild(el('span', 'border:1px solid #1d4ed8;background:#e8f0ff;color:#1d4ed8;border-radius:999px;padding:1px 8px;font-size:11.5px;', '@' + memberName(group, id)))
    }
  }

  const render = (): void => {
    renderGroups()
    renderHead()
    renderMsgs()
    renderMembers()
    renderChips()
  }

  /* ── 数据 ─────────────────────────────────────────────── */
  const loadMessages = async (): Promise<void> => {
    if (currentId === '') return
    const answer = await call(MESSAGES_ROUTE + '?groupId=' + encodeURIComponent(currentId) + '&limit=60')
    const group = current()
    if (group === undefined) return
    ;(group as unknown as { entries?: EntryView[] }).entries = Array.isArray(answer.messages)
      ? (answer.messages as EntryView[])
      : []
  }

  const refresh = async (): Promise<void> => {
    const listed = await call(LIST_ROUTE)
    groups = Array.isArray(listed.groups) ? (listed.groups as GroupView[]) : []
    if (currentId === '' && groups.length > 0) currentId = groups[0]!.id
    if (currentId !== '' && !groups.some((group) => group.id === currentId)) currentId = groups[0]?.id ?? ''
    await loadMessages()
    render()
  }

  const schedule = (): void => {
    if (!opened) return
    if (pollTimer !== undefined) clearTimeout(pollTimer)
    pollTimer = setTimeout(() => {
      pollTimer = undefined
      void refresh().finally(schedule)
    }, POLL_MS)
  }

  /* ── 右键菜单 ─────────────────────────────────────────── */
  const hideCtx = (): void => {
    ctxMenu.style.display = 'none'
    ctxMenu.replaceChildren()
  }
  const openCtx = (x: number, y: number, sessionId: string): void => {
    const group = current()
    if (group === undefined) return
    hideCtx()
    const mk = (label: string, run: () => void, danger = false): void => {
      const button = el('button', 'display:block;width:100%;text-align:left;border:0;background:#fff;padding:6px 10px;cursor:pointer;font-size:12.5px;border-radius:6px;color:' + (danger ? '#b42318' : '#1d3f8f') + ';', label)
      button.addEventListener('click', () => {
        hideCtx()
        run()
      })
      ctxMenu.appendChild(button)
    }
    mk('任命为群主', () => {
      void (async () => {
        await call(OWNER_ROUTE, { groupId: group.id, sessionId })
        await refresh()
      })()
    })
    mk('设置身份…', () => {
      roleTarget = sessionId
      const member = group.members.find((row) => row.sessionId === sessionId)
      roleTitle.textContent = '设置身份 · ' + (member?.name ?? shortId(sessionId))
      roleInput.value = member?.role ?? ''
      roleBox.style.display = 'block'
      roleInput.focus()
    })
    mk('移出本群', () => {
      void (async () => {
        await call(REMOVE_ROUTE, { groupId: group.id, sessionId })
        await refresh()
      })()
    }, true)
    ctxMenu.style.left = x + 'px'
    ctxMenu.style.top = y + 'px'
    ctxMenu.style.display = 'block'
  }
  doc.addEventListener('click', hideCtx)

  roleCancel.addEventListener('click', () => { roleBox.style.display = 'none' })
  roleSave.addEventListener('click', () => {
    const group = current()
    if (group === undefined || roleTarget === '') {
      roleBox.style.display = 'none'
      return
    }
    void (async () => {
      await call(ROLE_ROUTE, { groupId: group.id, sessionId: roleTarget, role: roleInput.value.trim() })
      roleBox.style.display = 'none'
      await refresh()
    })()
  })

  /* ── @ 候选 ───────────────────────────────────────────── */
  const hideAt = (): void => {
    atMenu.style.display = 'none'
    atMenu.replaceChildren()
  }
  const showAt = (): void => {
    const group = current()
    if (group === undefined) return
    atMenu.replaceChildren()
    const rows: Array<{ label: string; ids: string[] }> = [
      { label: '全体（' + group.members.length + ' 人）', ids: group.members.map((member) => member.sessionId) },
      ...group.members.map((member) => ({
        label: (member.name?.trim() || shortId(member.sessionId)) + (member.role === undefined ? '' : '（' + member.role + '）'),
        ids: [member.sessionId],
      })),
    ]
    for (const row of rows) {
      const item = el('button', 'display:block;width:100%;text-align:left;border:0;background:#fff;padding:6px 10px;cursor:pointer;font-size:12.5px;color:#1d3f8f;', row.label)
      item.addEventListener('mousedown', (event) => {
        event.preventDefault()
        for (const id of row.ids) targets.add(id)
        input.value = input.value.replace(/@[^@]*$/, '')
        renderChips()
        hideAt()
        input.focus()
      })
      atMenu.appendChild(item)
    }
    atMenu.style.display = 'block'
  }
  input.addEventListener('input', () => {
    if (/@[^@]*$/.test(input.value)) showAt()
    else hideAt()
  })
  input.addEventListener('blur', () => setTimeout(hideAt, 150))

  sendBtn.addEventListener('click', () => {
    const group = current()
    const text = input.value.trim()
    if (group === undefined || text === '') return
    sendBtn.disabled = true
    void (async () => {
      const answer = await call(POST_ROUTE, { groupId: group.id, text, targets: [...targets] })
      input.value = ''
      targets = new Set()
      hint.textContent = answer.ok === true ? HINT : '发送有问题：' + String(answer.message ?? '未知原因')
      await refresh()
      sendBtn.disabled = false
    })()
  })

  /* ── 二级视图：创建群 / 加人 ─────────────────────────── */
  const loadSessions = async (): Promise<void> => {
    const answer = await call(SESSIONS_ROUTE)
    if (Array.isArray(answer.sessions)) sessions = answer.sessions as SessionView[]
  }

  const sessionLabel = (session: SessionView): string => {
    const title = session.title?.trim()
    return title === undefined || title === '' ? '未命名会话（' + shortId(session.id) + '）' : title + '（' + shortId(session.id) + '）'
  }

  const renderPicks = (candidates: SessionView[]): void => {
    pickBox.replaceChildren()
    if (candidates.length === 0) {
      pickBox.appendChild(el('div', 'padding:8px;font-size:12px;color:#93a9cf;', '没有可选的会话。'))
    }
    for (const session of candidates) {
      const index = pickOrder.indexOf(session.id)
      const row = el('div', 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:7px;cursor:pointer;font-size:12.5px;' +
        (index >= 0 ? 'background:#eef4ff;' : ''))
      const box = el('span', 'width:13px;height:13px;border:1px solid #9bb6e6;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#1d4ed8;',
        index >= 0 ? '✓' : '')
      row.append(box)
      if (overlayMode === 'create' && index >= 0) {
        row.append(el('span', 'font-size:11px;color:#93a9cf;width:26px;', '#' + (index + 1)))
      }
      row.append(el('span', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', sessionLabel(session)))
      if (overlayMode === 'create' && index === 0) {
        row.append(el('span', 'font-size:11px;color:#e2a33a;', '（第一个勾选 → 群主）'))
      }
      row.addEventListener('click', (event) => {
        event.preventDefault()
        const at = pickOrder.indexOf(session.id)
        if (at >= 0) pickOrder.splice(at, 1)
        else pickOrder.push(session.id)
        renderPicks(candidates)
      })
      pickBox.appendChild(row)
    }
    ovCount.textContent = '已选 ' + pickOrder.length + ' 个'
  }

  const openOverlay = (mode: 'create' | 'invite'): void => {
    overlayMode = mode
    pickOrder = []
    nameInput.value = ''
    nameInput.style.display = mode === 'create' ? 'block' : 'none'
    ovLeft.style.display = mode === 'create' ? 'flex' : 'none'
    ovTitle.textContent = mode === 'create' ? '创建群' : '把会话拉进群'
    ovOk.textContent = mode === 'create' ? '创建群' : '加入本群'
    ovTip.textContent = ''
    overlay.style.display = 'flex'
    void (async () => {
      await loadSessions()
      const group = current()
      const candidates = mode === 'invite'
        ? sessions.filter((session) => group?.members.every((member) => member.sessionId !== session.id))
        : sessions
      if (mode === 'create') {
        ovTip.textContent = '默认把你算进群；第一个勾选的会话当群主（负责分工）。'
      }
      renderPicks(candidates)
    })()
  }

  newGroupBtn.addEventListener('click', () => openOverlay('create'))
  addMemberBtn.addEventListener('click', () => openOverlay('invite'))
  ovBack.addEventListener('click', () => { overlay.style.display = 'none' })

  ovOk.addEventListener('click', () => {
    void (async () => {
      if (overlayMode === 'create') {
        const name = nameInput.value.trim()
        if (name === '') {
          ovCount.textContent = '先给群起个名字'
          return
        }
        if (pickOrder.length === 0) {
          ovCount.textContent = '至少勾一个会话'
          return
        }
        const created = await call(CREATE_ROUTE, { name, sessionIds: pickOrder, owner: pickOrder[0] })
        if (created.ok !== true) {
          ovCount.textContent = '建群失败：' + String(created.message ?? '未知原因')
          return
        }
        const id = (created.group as { id?: string } | undefined)?.id
        if (typeof id === 'string') currentId = id
      } else {
        const group = current()
        if (group === undefined || pickOrder.length === 0) {
          ovCount.textContent = '先勾要拉进来的人'
          return
        }
        const answer = await call(INVITE_ROUTE, { groupId: group.id, sessionIds: pickOrder })
        if (answer.ok !== true) {
          ovCount.textContent = '加人失败：' + String(answer.message ?? '未知原因')
          return
        }
      }
      overlay.style.display = 'none'
      await refresh()
    })()
  })

  dissolveBtn.addEventListener('click', () => {
    const group = current()
    if (group === undefined) return
    void (async () => {
      const answer = await call(DISSOLVE_ROUTE, { groupId: group.id })
      hint.textContent = answer.ok === true ? '群已解散，全体成员都收到通知' : '解散失败：' + String(answer.message ?? '未知原因')
      await refresh()
    })()
  })

  closeBtn.addEventListener('click', () => {
    opened = false
    panel.style.display = 'none'
    if (pollTimer !== undefined) clearTimeout(pollTimer)
  })

  return {
    open(): void {
      if (opened) return
      opened = true
      panel.style.display = 'flex'
      void refresh().finally(schedule)
    },
    close(): void {
      opened = false
      panel.style.display = 'none'
      if (pollTimer !== undefined) clearTimeout(pollTimer)
    },
    destroy(): void {
      opened = false
      if (pollTimer !== undefined) clearTimeout(pollTimer)
      panel.remove()
      ctxMenu.remove()
    },
  }
}
