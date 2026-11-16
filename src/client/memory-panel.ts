/**
 * memory-panel — 设置页「人设」分栏里的「长期记忆」面板（0.9.x）。
 *
 * - 人设下拉：来自 `/api/dsh-persona-dafeiyu/status` 的 `value.personas`，默认当前人设；
 * - 条目列表：来自 `/api/dsh-remote-dafeiyu/memory?persona=…`；
 * - 添加 / 删除 / 清空：POST 同一条路由。
 *
 * 与识图面板同一条纪律：钩子由调用方传入（不能静态 require react），所有请求都带超时。
 *
 * 2026-11-16 版式统一：这一块原来自己抄了一套 `fieldStyle`/`buttonStyle`（与
 * `vision-panel.ts`、`subagents-settings.ts` 各一份，改一处漏两处），现在全部改成
 * `./panel-kit.ts` 的卡片 / 行 / 标签 / 按钮——**功能、文案、路由一个字没动**。
 * 行里左端那颗标签是记忆的档位（关键 / 重要 / 普通），四色口径与「肥鱼识图」栏的状态标签同一套。
 */
import { MEMORY_BASE, PERSONA_STATUS, callJson } from './host-api.js'
import {
  button,
  card,
  emptyStyle,
  fieldGroupStyle,
  fieldStyle,
  hintStyle,
  item,
  itemSub,
  itemTitle,
  labelStyle,
  listStyle,
  notesStyle,
  rowStyle,
  tag,
  type CreateElement,
  type TagTone,
} from './panel-kit.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

export interface MemoryEntryView {
  id: string
  text: string
  createdAt: string
  importance: number
  source: string
}

export interface MemoryPanelDeps {
  createElement: CreateElement
  hooks: Hooks
}

interface PersonaRef {
  id: string
  name: string
  current: boolean
}

const IMPORTANCE_LABEL: Record<number, string> = { 1: '普通', 2: '重要', 3: '关键' }
/** 档位 → 标签语气：关键用 `key`（与"要注意"的 warn 分开），普通用中性。 */
const IMPORTANCE_TONE: Record<number, TagTone> = { 1: 'off', 2: 'warn', 3: 'key' }

/** 设置页里的「长期记忆」块。宿主没给 useState 时返回 undefined。 */
export function buildMemoryPanel(deps: MemoryPanelDeps): (() => unknown) | undefined {
  const { createElement: h, hooks } = deps
  const useState = hooks.useState
  const useEffect = hooks.useEffect
  if (typeof useState !== 'function') return undefined

  return function MemoryPanel(): unknown {
    const [personas, setPersonas] = useState<PersonaRef[]>([])
    const [persona, setPersona] = useState<string>('')
    const [entries, setEntries] = useState<MemoryEntryView[]>([])
    const [draft, setDraft] = useState<string>('')
    const [importance, setImportance] = useState<string>('2')
    const [status, setStatus] = useState<string>('正在读取…')
    const [busy, setBusy] = useState<boolean>(false)

    const loadPersonas = async (): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(PERSONA_STATUS, undefined)
        const list = result.ok && result.value && typeof result.value === 'object'
          ? ((result.value as { personas?: unknown }).personas as Array<Record<string, unknown>> | undefined) ?? []
          : []
        const refs = list
          .filter((item) => typeof item?.id === 'string' && item.id !== '')
          .map((item) => ({ id: String(item.id), name: String(item.name ?? item.id), current: item.current === true }))
        setPersonas(refs)
        const current = refs.find((item) => item.current) ?? refs[0]
        const nextPersona = persona !== '' ? persona : current?.id ?? ''
        setPersona(nextPersona)
        if (nextPersona !== '') await loadEntries(nextPersona)
        else setStatus('人设库是空的（先去「人设」页建一个）')
      } catch (error) {
        setStatus(`读取人设失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const loadEntries = async (personaId: string): Promise<void> => {
      try {
        const result = await callJson(`${MEMORY_BASE}?persona=${encodeURIComponent(personaId)}`, undefined)
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries as MemoryEntryView[])
          setStatus(`共 ${(result.entries as MemoryEntryView[]).length} 条记忆`)
        } else {
          setEntries([])
          setStatus(`读取记忆失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setEntries([])
        setStatus(`读取记忆失败：${String((error as Error)?.message ?? error)}`)
      }
    }

    useEffect?.(() => {
      void loadPersonas()
    }, [])

    if (!useState) return undefined

    const switchPersona = (next: string): void => {
      setPersona(next)
      setEntries([])
      setStatus('读取中…')
      void loadEntries(next)
    }

    const add = async (): Promise<void> => {
      if (persona === '') return
      const text = draft.trim()
      if (text === '') {
        setStatus('先写一句要记住的话')
        return
      }
      setBusy(true)
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: 'add', text, importance: Number(importance) })
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries as MemoryEntryView[])
          setDraft('')
          setStatus(`已添加，共 ${(result.entries as MemoryEntryView[]).length} 条`)
        } else {
          setStatus(`添加失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`添加失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const remove = async (id: string): Promise<void> => {
      setBusy(true)
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: 'remove', id })
        if (result.ok && Array.isArray(result.entries)) {
          setEntries(result.entries as MemoryEntryView[])
          setStatus(`已删除，剩 ${(result.entries as MemoryEntryView[]).length} 条`)
        } else {
          setStatus(`删除失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`删除失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const clear = async (): Promise<void> => {
      if (persona === '') return
      setBusy(true)
      try {
        const result = await callJson(MEMORY_BASE, { persona, action: 'clear' })
        if (result.ok) {
          setEntries([])
          setStatus('已清空这个人的全部记忆')
        } else {
          setStatus(`清空失败：${String(result.error ?? '未知错误')}`)
        }
      } catch (error) {
        setStatus(`清空失败：${String((error as Error)?.message ?? error)}`)
      } finally {
        setBusy(false)
      }
    }

    const personaField = personas.length > 0
      ? h('div', {
          style: fieldGroupStyle,
          children: [
            h('span', { style: labelStyle, children: '人设' }),
            h('select', {
              style: fieldStyle,
              value: persona,
              onChange: (event: Event) => switchPersona((event.target as HTMLSelectElement).value),
              children: personas.map((ref) => h('option', { key: ref.id, value: ref.id, children: `${ref.name}${ref.current ? '（当前）' : ''}` })),
            }),
          ],
        })
      : null

    /* 记忆列表：一行一条，左端是档位标签、中间是正文与日期、右端是删除（样板 `.item` 的形状）。 */
    const list = entries.length === 0
      ? h('p', { style: emptyStyle, children: '还没有记忆。大肥鱼觉得值得记的会自己记；你也可以在这里手动加。' })
      : h('div', {
          style: { ...listStyle, maxHeight: '260px', overflow: 'auto' },
          children: entries.map((entry) =>
            item(
              h,
              [
                itemTitle(h, entry.text),
                itemSub(h, entry.createdAt === '' ? IMPORTANCE_LABEL[entry.importance] ?? '普通' : `${entry.createdAt} · ${IMPORTANCE_LABEL[entry.importance] ?? '普通'}`),
              ],
              [
                tag(h, IMPORTANCE_LABEL[entry.importance] ?? '普通', IMPORTANCE_TONE[entry.importance] ?? 'off'),
                button(h, '删', () => void remove(entry.id), { disabled: busy }),
              ],
            ),
          ),
        })

    return card(
      h,
      '长期记忆',
      [
        h('p', { style: hintStyle, children: '按人设分开存。大肥鱼在对话里觉得值得记的会自己写进来；这里也能手动加、删。上限 100 条 / 人。' }),
        personaField,
        h('div', {
          style: rowStyle,
          children: [
            h('input', {
              style: { ...fieldStyle, flex: '1 1 200px', width: 'auto' },
              placeholder: '手动记一条（例如：用户叫我小鲸鱼）',
              value: draft,
              onChange: (event: Event) => setDraft((event.target as HTMLInputElement).value),
              onKeyDown: (event: KeyboardEvent) => {
                if (event.key === 'Enter') void add()
              },
            }),
            h('select', {
              style: { ...fieldStyle, width: '88px', flex: '0 0 auto' },
              value: importance,
              onChange: (event: Event) => setImportance((event.target as HTMLSelectElement).value),
              children: [
                h('option', { value: '1', children: '普通' }),
                h('option', { value: '2', children: '重要' }),
                h('option', { value: '3', children: '关键' }),
              ],
            }),
            button(h, '添加', () => void add(), { kind: 'primary', disabled: busy || persona === '' }),
            button(h, '清空这个人的记忆', () => void clear(), { kind: 'danger', disabled: busy || persona === '' }),
          ],
        }),
        list,
        h('p', { style: notesStyle, children: status }),
      ],
      { count: entries.length > 0 ? `当前人设 · ${entries.length} 条` : undefined },
    )
  }
}
