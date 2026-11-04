/**
 * memory-panel — 设置页「人设」分栏里的「长期记忆」面板（0.9.x）。
 *
 * - 人设下拉：来自 `/api/dsh-persona-dafeiyu/status` 的 `value.personas`，默认当前人设；
 * - 条目列表：来自 `/api/dsh-remote-dafeiyu/memory?persona=…`；
 * - 添加 / 删除 / 清空：POST 同一条路由。
 *
 * 与识图面板同一条纪律：钩子由调用方传入（不能静态 require react），所有请求都带超时。
 */
import { MEMORY_BASE, PERSONA_STATUS, callJson } from './host-api.js'

type Hooks = {
  useState?: <S>(initial: S) => [S, (next: S) => void]
  useEffect?: (effect: () => void | (() => void), deps?: unknown[]) => void
}

type CreateElement = (type: unknown, props: Record<string, unknown>) => unknown

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

const fieldStyle: Record<string, string> = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  fontSize: '13px',
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
const labelStyle: Record<string, string> = {
  display: 'block',
  fontSize: '12px',
  color: 'var(--dsw-alias-label-secondary)',
  marginBottom: '4px',
}

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

    const personaSelect = personas.length > 0
      ? h('div', {
          children: [
            h('span', { style: labelStyle, children: '人设' }),
            h('select', {
              style: fieldStyle,
              value: persona,
              onChange: (event: Event) => switchPersona((event.target as HTMLSelectElement).value),
              children: personas.map((item) => h('option', { key: item.id, value: item.id, children: `${item.name}${item.current ? '（当前）' : ''}` })),
            }),
          ],
        })
      : null

    const list = entries.length === 0
      ? h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: '还没有记忆。大肥鱼觉得值得记的会自己记；你也可以在这里手动加。' })
      : h('div', {
          style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflow: 'auto' },
          children: entries.map((entry) =>
            h('div', {
              key: entry.id,
              style: {
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: 'var(--dsw-alias-bg-secondary, rgba(127,127,127,0.06))',
                fontSize: '13px',
              },
              children: [
                h('span', {
                  style: { flex: '1', wordBreak: 'break-word' },
                  children: `[${IMPORTANCE_LABEL[entry.importance] ?? '普通'}] ${entry.text}`,
                }),
                h('button', {
                  type: 'button',
                  style: { ...buttonStyle, padding: '2px 8px', fontSize: '12px' },
                  disabled: busy,
                  onClick: () => void remove(entry.id),
                  children: '删',
                }),
              ],
            }),
          ),
        })

    return h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '10px',
        marginTop: '16px',
      },
      children: [
        h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [
          h('strong', { style: { fontSize: '14px' }, children: '长期记忆' }),
          h('button', { type: 'button', style: { ...buttonStyle, padding: '2px 8px', fontSize: '12px' }, disabled: busy || persona === '', onClick: () => void clear(), children: '清空这个人的记忆' }),
        ] }),
        h('p', { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)' }, children: '按人设分开存。大肥鱼在对话里觉得值得记的会自己写进来；这里也能手动加、删。上限 100 条 / 人。' }),
        personaSelect,
        list,
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' }, children: [
          h('input', {
            style: { ...fieldStyle, flex: '1' },
            placeholder: '手动记一条（例如：用户叫我小鲸鱼）',
            value: draft,
            onChange: (event: Event) => setDraft((event.target as HTMLInputElement).value),
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') void add()
            },
          }),
          h('select', {
            style: { ...fieldStyle, width: '88px' },
            value: importance,
            onChange: (event: Event) => setImportance((event.target as HTMLSelectElement).value),
            children: [
              h('option', { value: '1', children: '普通' }),
              h('option', { value: '2', children: '重要' }),
              h('option', { value: '3', children: '关键' }),
            ],
          }),
          h('button', { type: 'button', style: buttonStyle, disabled: busy || persona === '', onClick: () => void add(), children: '添加' }),
        ] }),
        status
          ? h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', wordBreak: 'break-word' }, children: status })
          : null,
      ],
    })
  }
}
