/**
 * client/groups-tab —— 设置页「群」那一栏（2026-11-19）。
 *
 * 管理面：建群、看成员、为群加人、打开悬浮群面板。
 * 聊天面在 `groups-panel.ts`（悬浮窗），两边读同一批路由。
 */
import { resolveHostUrl } from './host-url.js'
import type { CreateElement } from './pill.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

interface GroupView {
  id: string
  name: string
  dissolved?: boolean
  members: Array<{ sessionId: string; name?: string }>
}

interface SessionView {
  id: string
  title?: string
}

const LIST_ROUTE = '/api/dsh-remote-dafeiyu/groups'
const CREATE_ROUTE = '/api/dsh-remote-dafeiyu/groups/create'
const INVITE_ROUTE = '/api/dsh-remote-dafeiyu/groups/invite'
const SESSIONS_ROUTE = '/api/dsh-remote-dafeiyu/groups/sessions'

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

export function buildGroupsTab(options: {
  createElement: CreateElement
  hooks?: Hooks
}): ((props?: unknown) => unknown) | undefined {
  const { createElement, hooks } = options
  const useState = hooks?.useState
  const useEffect = hooks?.useEffect
  if (typeof useState !== 'function') return undefined

  const cardStyle: Record<string, string> = {
    border: '1px solid #dbe6fb',
    borderRadius: '10px',
    padding: '10px 12px',
    background: '#f7faff',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  }
  const hintStyle: Record<string, string> = { fontSize: '12px', color: '#5b7bb5', lineHeight: '1.6' }
  const inputStyle: Record<string, string> = {
    padding: '5px 8px',
    border: '1px solid #c7d9f7',
    borderRadius: '7px',
    font: 'inherit',
    color: '#1d3f8f',
    width: '220px',
  }
  const btnStyle: Record<string, string> = {
    border: '0',
    borderRadius: '7px',
    background: '#1d4ed8',
    color: '#fff',
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: '12.5px',
  }

  return (): unknown => {
    const [groups, setGroups] = useState<GroupView[]>([])
    const [sessions, setSessions] = useState<SessionView[]>([])
    const [name, setName] = useState<string>('')
    const [picked, setPicked] = useState<string[]>([])
    const [note, setNote] = useState<string>('')

    if (typeof useEffect === 'function') {
      useEffect(() => {
        /*
         * 会话名字是宿主**在后台按批折叠**的（一条 40MB 的日志要几秒），所以这里多拉几拍：
         * 第一次先出短号，标题缓存热了以后这一栏会自己更新。
         */
        const loadSessions = async (): Promise<void> => {
          const rows = await call(SESSIONS_ROUTE)
          if (Array.isArray(rows.sessions)) setSessions(rows.sessions as SessionView[])
        }
        void (async () => {
          const listed = await call(LIST_ROUTE)
          setGroups(Array.isArray(listed.groups) ? (listed.groups as GroupView[]) : [])
          await loadSessions()
          for (let round = 0; round < 10; round += 1) {
            setTimeout(() => void loadSessions(), 3_000 * (round + 1))
          }
        })()
      }, [])
    }

    const reload = async (): Promise<void> => {
      const listed = await call(LIST_ROUTE)
      setGroups(Array.isArray(listed.groups) ? (listed.groups as GroupView[]) : [])
    }

    const createGroup = async (): Promise<void> => {
      if (name.trim() === '') {
        setNote('先给群起个名字')
        return
      }
      const created = await call(CREATE_ROUTE, { name: name.trim(), sessionIds: picked })
      if (created.ok === true) {
        setName('')
        setPicked([])
        setNote('建好了（成员会收到入群通知）')
        await reload()
      } else {
        setNote('建群失败：' + String(created.message ?? '未知原因'))
      }
    }

    const inviteTo = async (groupId: string): Promise<void> => {
      if (picked.length === 0) {
        setNote('先在下面的会话列表里点几个要拉的人')
        return
      }
      const answer = await call(INVITE_ROUTE, { groupId, sessionIds: picked })
      const notified = Array.isArray(answer.notified) ? (answer.notified as Array<{ ok?: boolean }>) : []
      const failed = notified.filter((row) => row.ok !== true).length
      setNote(
        answer.ok === true
          ? failed === 0
            ? '已加进群，通知都送到了'
            : '已加进群，但有 ' + failed + ' 个没收到通知（会话可能离线）'
          : '没加成：' + String(answer.message ?? '未知原因'),
      )
      setPicked([])
      await reload()
    }

    const dissolve = async (groupId: string): Promise<void> => {
      const answer = await call('/api/dsh-remote-dafeiyu/groups/dissolve', { groupId })
      setNote(answer.ok === true ? '已解散，全体成员都收到了「本群不再可用」' : '解散失败：' + String(answer.message ?? '未知原因'))
      await reload()
    }

    const sessionLabel = (session: SessionView): string => {
      const title = session.title?.trim()
      // 没有标题时别再显示「9355d3c9（9355d3c9）」那种重复：说清楚它是未命名，短号只留一处。
      return title === undefined || title === '' ? '未命名会话（' + shortId(session.id) + '）' : title + '（' + shortId(session.id) + '）'
    }

    const sessionPicker = createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflow: 'auto' },
      children: sessions.slice(0, 40).map((session) =>
        createElement('label', {
          key: session.id,
          style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#1d3f8f' },
          children: [
            createElement('input', {
              type: 'checkbox',
              checked: picked.includes(session.id),
              onChange: () => {
                setPicked(
                  picked.includes(session.id)
                    ? picked.filter((id) => id !== session.id)
                    : [...picked, session.id],
                )
              },
            }),
            String(sessionLabel(session)),
          ],
        }),
      ),
    })

    return createElement('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '10px' },
      children: [
        createElement('div', {
          style: cardStyle,
          children: [
            createElement('div', { style: { fontWeight: '600' }, children: '打开群面板' }),
            createElement('div', {
              style: hintStyle,
              children: '聊天时用悬浮窗：选群、看记录、@ 人发消息。这里只管建群和加人。',
            }),
            createElement('button', {
              type: 'button',
              style: { ...btnStyle, alignSelf: 'flex-start' },
              onClick: () => {
                const scope = globalThis as { __dafeiyuGroupsOpen?: () => void }
                scope.__dafeiyuGroupsOpen?.()
              },
              children: '打开悬浮群面板',
            }),
          ],
        }),
        createElement('div', {
          style: cardStyle,
          children: [
            createElement('div', { style: { fontWeight: '600' }, children: '建群' }),
            createElement('div', {
              style: { display: 'flex', gap: '8px', alignItems: 'center' },
              children: [
                createElement('input', {
                  style: inputStyle,
                  value: name,
                  placeholder: '群名，例如：前后端联调',
                  onInput: (event: { target?: { value?: string } }) => setName(String(event.target?.value ?? '')),
                }),
                createElement('button', {
                  type: 'button',
                  style: btnStyle,
                  onClick: () => void createGroup(),
                  children: '建群',
                }),
              ],
            }),
            createElement('div', {
              style: hintStyle,
              children:
                '勾要拉进来的会话（你自己会自动进群）。名字是宿主在后台从会话日志里读的，' +
                '大日志要等几十秒，这一栏会自己刷新。',
            }),
            sessionPicker,
          ],
        }),
        createElement('div', {
          style: cardStyle,
          children: [
            createElement('div', { style: { fontWeight: '600' }, children: '已有的群' }),
            groups.length === 0
              ? createElement('div', { style: hintStyle, children: '还没有群。' })
              : createElement('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: '8px' },
                  children: groups.map((group) =>
                    createElement('div', {
                      key: group.id,
                      style: { borderTop: '1px solid #e6eefb', paddingTop: '6px' },
                      children: [
                        createElement('div', {
                          style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' },
                          children: [
                            createElement('span', {
                              style: { fontWeight: '600' },
                              children: group.name + '（' + group.members.length + ' 人）',
                            }),
                            createElement('div', {
                              style: { display: 'flex', gap: '6px' },
                              children: [
                                createElement('button', {
                                  type: 'button',
                                  style: { ...btnStyle, background: '#e8f0ff', color: '#1d4ed8' },
                                  onClick: () => void inviteTo(group.id),
                                  children: '把勾选的人加进来',
                                }),
                                createElement('button', {
                                  type: 'button',
                                  style: { ...btnStyle, background: 'transparent', color: '#b42318', border: '1px solid #f3b6ae' },
                                  onClick: () => void dissolve(group.id),
                                  children: '解散',
                                }),
                              ],
                            }),
                          ],
                        }),
                        createElement('div', {
                          style: hintStyle,
                          children:
                            group.members
                              .map((member) => member.name ?? shortId(member.sessionId))
                              .join('、') + '　id: ' + group.id,
                        }),
                      ],
                    }),
                  ),
                }),
          ],
        }),
        note === '' ? null : createElement('div', { style: hintStyle, children: note }),
      ],
    })
  }
}
