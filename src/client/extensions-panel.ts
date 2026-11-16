/**
 * extensions-panel — 设置页「远程控制」里、配对码区块**下面**那半张「扩展列表」。
 *
 * 每行一个扩展：名字 + 版本/状态徽标 + 一句话说明，右侧是按钮：
 *
 * | 状态          | 按钮           |
 * |---------------|----------------|
 * | 未安装        | 安装           |
 * | 装了并启用    | 禁用、卸载     |
 * | 装了但禁用    | 启用、卸载     |
 * | 正在操作      | 全部禁用，被点的那个显示「安装中…」这类文案 |
 *
 * 三条界面纪律（对应"扩展功能不可用（宿主版本过旧）"那句兜底）：
 *
 * 1. **拿不到就说人话**：宿主旧版本的路径不存在（404 / 非 JSON / 连接被拒）→ 显示
 *    `EXTENSIONS_UNAVAILABLE` 那一行，空白和异常文本都不许出现；
 * 2. **失败要指名道姓**：服务端回的 `message`（「不在白名单里」/「pnpm 失败：<stderr 尾巴>」）
 *    显示在**那一行里**，不是弹一句"失败"；
 * 3. **改完必须说重启**：`needsRestart` 或本次动作 `changed` → 该行挂「需要重启生效」，
 *    不让人以为点完就生效了。
 *
 * 与其它面板同款：`createElement` / hooks 都由装载器传进来（不能静态 require react），
 * `fetchImpl` 也是参数——判据用桩打"旧宿主"和"pnpm 失败"，不碰真网络。
 */
import { resolveHostUrl } from './host-url.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}
type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

export const EXTENSIONS_BASE = '/api/dsh-remote-control/extensions'
export const EXTENSIONS_ACTION = `${EXTENSIONS_BASE}/action`

/** 宿主没有这两条路由（旧版本）时那一行话。判据钉的就是这句。 */
export const EXTENSIONS_UNAVAILABLE = '扩展功能不可用（宿主版本过旧）'

export type ExtensionAction = 'install' | 'enable' | 'disable' | 'uninstall'

export interface ExtensionRow {
  id: string
  label: string
  description: string
  installed: boolean
  enabled: boolean
  version?: string
  needsRestart?: boolean
}

/** 注入式 fetch：`body` 有值就是 POST（带 `x-drc-pair`），返回宿主那份 JSON。 */
export type ExtensionsFetch = (path: string, body?: unknown) => Promise<Record<string, unknown>>

export type ExtensionsRead = { kind: 'ready'; rows: ExtensionRow[] } | { kind: 'unavailable'; message: string }

/**
 * 把 `GET /extensions` 的响应归一成两态。纯函数，判据直接钉它。
 *
 * 判据：只有 `ok === true` **且** `extensions` 是数组才算拿到了表；其余（404 非 JSON、
 * `ok:false`、字段缺失、网络错被兜成 `{ok:false,error}`）一律 unavailable。
 * `extensions: []` 是合法的"表里一条都没有"，不算不可用。
 */
export function readExtensionsResult(result: Record<string, unknown> | null | undefined): ExtensionsRead {
  if (result?.ok !== true) return { kind: 'unavailable', message: EXTENSIONS_UNAVAILABLE }
  const list = result.extensions
  if (!Array.isArray(list)) return { kind: 'unavailable', message: EXTENSIONS_UNAVAILABLE }
  const rows: ExtensionRow[] = []
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (typeof item.id !== 'string' || item.id === '') continue
    const row: ExtensionRow = {
      id: item.id,
      label: typeof item.label === 'string' && item.label !== '' ? item.label : item.id,
      description: typeof item.description === 'string' ? item.description : '',
      installed: item.installed === true,
      enabled: item.enabled === true,
    }
    if (typeof item.version === 'string' && item.version !== '') row.version = item.version
    if (item.needsRestart === true) row.needsRestart = true
    rows.push(row)
  }
  return { kind: 'ready', rows }
}

export type RowState = 'not-installed' | 'enabled' | 'disabled'

export function rowStateOf(row: ExtensionRow): RowState {
  if (!row.installed) return 'not-installed'
  return row.enabled ? 'enabled' : 'disabled'
}

export interface RowButton {
  action: ExtensionAction
  label: string
  /** 正在跑这个动作时按钮上的字。 */
  busyLabel: string
}

/** 一行该有哪几个按钮。纯函数：状态机全在这里，判据不用起 DOM。 */
export function buttonsOf(row: ExtensionRow): RowButton[] {
  const state = rowStateOf(row)
  if (state === 'not-installed') return [{ action: 'install', label: '安装', busyLabel: '安装中…' }]
  if (state === 'enabled') {
    return [
      { action: 'disable', label: '禁用', busyLabel: '禁用中…' },
      { action: 'uninstall', label: '卸载', busyLabel: '卸载中…' },
    ]
  }
  return [
    { action: 'enable', label: '启用', busyLabel: '启用中…' },
    { action: 'uninstall', label: '卸载', busyLabel: '卸载中…' },
  ]
}

/** 版本/状态徽标：`已启用 v0.1.2` / `已禁用 v0.1.2` / `未安装`。 */
export function badgeOf(row: ExtensionRow): string {
  const version = row.version ? ` v${row.version}` : ''
  const state = rowStateOf(row)
  if (state === 'not-installed') return '未安装'
  return `${state === 'enabled' ? '已启用' : '已禁用'}${version}`
}

/**
 * 默认 fetch：走宿主回环路由（`resolveHostUrl` 补 origin）。**任何异常都收敛成 `{ok:false}`**，
 * 绝不让面板因为一次网络错整块空白。
 */
export async function defaultExtensionsFetch(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const init: RequestInit =
    body === undefined
      ? { method: 'GET' }
      : {
          method: 'POST',
          // 写路由要 `x-drc-pair`（与归档那条同一口径）：桌面宿主转发时会删掉 origin，
          // 光靠 Origin 判据在真机上不成立。
          headers: { 'content-type': 'application/json', 'x-drc-pair': '1' },
          body: JSON.stringify(body),
        }
  try {
    const response = await fetch(resolveHostUrl(path), init)
    const text = await response.text()
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      return { ok: false, error: `宿主返回了非 JSON（HTTP ${response.status}）` }
    }
  } catch (error) {
    return { ok: false, error: String((error as Error)?.message ?? error) }
  }
}

const cardStyle: Record<string, string> = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: '10px',
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}
const rowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 0',
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}
const buttonStyle: Record<string, string> = {
  padding: '4px 12px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
  cursor: 'pointer',
}
const nameStyle: Record<string, string> = { fontSize: '13px', color: 'var(--dsw-alias-label-primary)' }
const badgeStyle: Record<string, string> = { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' }
const descStyle: Record<string, string> = {
  fontSize: '12px',
  color: 'var(--dsw-alias-label-tertiary)',
  lineHeight: '1.5',
  display: 'block',
}
const restartStyle: Record<string, string> = { fontSize: '12px', color: 'var(--dsw-alias-state-business-primary, #4b7bec)' }
const errorStyle: Record<string, string> = { fontSize: '12px', color: 'var(--dsw-alias-state-danger-primary, #d93025)' }

export function buildExtensionsPanel(deps: {
  createElement: CreateElement
  hooks: Hooks
  fetchImpl?: ExtensionsFetch
}): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks?.useState
  const useEffect = hooks?.useEffect
  if (typeof useState !== 'function') return undefined
  const fetchJson: ExtensionsFetch = deps.fetchImpl ?? defaultExtensionsFetch

  return function ExtensionsPanel(): unknown {
    const [rows, setRows] = useState<ExtensionRow[] | null>(null)
    const [unavailable, setUnavailable] = useState<string>('')
    const [busy, setBusy] = useState<{ id: string; action: ExtensionAction } | null>(null)
    // 每行的行内提示：`{kind:'info'|'error', text}`；需要重启用单独一个集合，两者能同时显示。
    const [notes, setNotes] = useState<Record<string, { kind: string; text: string }>>({})
    const [restart, setRestart] = useState<Record<string, boolean>>({})

    const withNote = (id: string, note: { kind: string; text: string } | undefined): void => {
      const next: Record<string, { kind: string; text: string }> = { ...notes }
      if (note === undefined) delete next[id]
      else next[id] = note
      setNotes(next)
    }
    const markRestart = (id: string): void => setRestart({ ...restart, [id]: true })

    const applyRows = (next: ExtensionRow[] | null): void => {
      if (next === null) return
      setRows(next)
    }

    const runAction = async (id: string, action: ExtensionAction): Promise<void> => {
      if (busy !== null) return
      setBusy({ id, action })
      withNote(id, undefined)
      try {
        const result = await fetchJson(EXTENSIONS_ACTION, { id, action })
        const read = readExtensionsResult({ ok: result.ok === true, extensions: result.extensions })
        if (read.kind === 'ready') applyRows(read.rows)
        if (result.ok === true) {
          if (result.needsRestart === true || result.changed === true) markRestart(id)
          const message = typeof result.message === 'string' ? result.message : ''
          // 幂等（"已经是这个状态"）也要说出来：不能让点了没反应。
          if (result.changed !== true && message !== '') withNote(id, { kind: 'info', text: message })
        } else {
          // 服务端给的中文原因（不在白名单 / pnpm 失败：<stderr 尾巴>）原样落到行里。
          const reason =
            (typeof result.message === 'string' && result.message !== '' ? result.message : '') ||
            (typeof result.error === 'string' && result.error !== '' ? result.error : '') ||
            '宿主没说原因'
          withNote(id, { kind: 'error', text: `没成功：${reason}` })
        }
      } catch (error) {
        withNote(id, { kind: 'error', text: `没成功：${String((error as Error)?.message ?? error)}` })
      } finally {
        setBusy(null)
      }
    }

    useEffect?.(() => {
      let alive = true
      void (async () => {
        try {
          const result = await fetchJson(EXTENSIONS_BASE)
          if (!alive) return
          const read = readExtensionsResult(result)
          if (read.kind === 'ready') {
            setRows(read.rows)
          } else {
            setUnavailable(read.message)
          }
        } catch (error) {
          if (!alive) return
          // 连 fetch 都抛（宿主没起）：仍是那句"不可用"，不抛异常、不空白。
          setUnavailable(EXTENSIONS_UNAVAILABLE)
        }
      })()
      return () => {
        alive = false
      }
    }, [])

    if (unavailable !== '') {
      return h('div', {
        style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
        'data-extensions': 'unavailable',
        children: unavailable,
      })
    }
    if (rows === null) {
      return h('div', {
        style: { fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' },
        'data-extensions': 'loading',
        children: '正在读取扩展列表…',
      })
    }

    const children: unknown[] = [
      h('div', {
        style: { display: 'flex', alignItems: 'baseline', gap: '8px', justifyContent: 'space-between' },
        children: [
          h('span', { style: nameStyle, children: '扩展' }),
          h('span', { style: badgeStyle, children: '装好、启用或禁用之后都要重启 DSH 才生效' }),
        ],
      }),
    ]
    if (rows.length === 0) {
      children.push(h('span', { style: descStyle, children: '这一代没有可安装的扩展。' }))
    }
    for (const row of rows) {
      const buttons = buttonsOf(row)
      const note = notes[row.id]
      const needRestart = restart[row.id] === true || row.needsRestart === true
      children.push(
        h('div', {
          key: row.id,
          'data-extension': row.id,
          'data-state': rowStateOf(row),
          style: rowStyle,
          children: [
            h('div', {
              style: { flex: '1 1 auto', minWidth: '0' },
              children: [
                h('div', {
                  style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
                  children: [
                    h('span', { style: nameStyle, children: row.label }),
                    h('span', { style: badgeStyle, children: badgeOf(row) }),
                    needRestart ? h('span', { style: restartStyle, children: '需要重启生效' }) : null,
                  ],
                }),
                row.description !== '' ? h('span', { style: descStyle, children: row.description }) : null,
                note ? h('span', { style: note.kind === 'error' ? errorStyle : descStyle, children: note.text }) : null,
              ],
            }),
            h('div', {
              style: { display: 'flex', gap: '8px', flexShrink: '0' },
              children: buttons.map((button) =>
                h('button', {
                  key: `${row.id}:${button.action}`,
                  type: 'button',
                  'data-action': button.action,
                  disabled: busy !== null,
                  style: buttonStyle,
                  onClick: () => void runAction(row.id, button.action),
                  children:
                    busy !== null && busy.id === row.id && busy.action === button.action
                      ? button.busyLabel
                      : button.label,
                }),
              ),
            }),
          ],
        }),
      )
    }
    return h('div', { style: cardStyle, 'data-extensions': 'ready', children })
  }
}
