/**
 * memory — 大肥鱼的「长期记忆」（0.9.0）。
 *
 * 一个轻量、可见、可删的记忆库：每个**人设**一份，落在
 * `<DSH_HOME>/storages/dsh-remote-dafeiyu/memory/<personaId>.json`。
 *
 * 三条设计约束：
 * 1. **按人设隔离**：切到「阿茶」不该看到大肥鱼记的偏好。人设 id 是文件名。
 * 2. **注入有预算**：段落总长 ≤ 800 字（可改），按重要度 → 新近度裁剪；超出的条目**不删**，
 *    只是这轮不注入。所以「记一点不用的」不会把真正的偏好挤掉。
 * 3. **条目有上限**：同一个人设最多 100 条，超出时淘汰「最不重要 + 最旧」的那条，
 *    避免一个会话把库撑成日志。
 *
 * 写入一律原子（临时文件 + rename）：半截 JSON 比没有记忆更糟。
 */
import fs from 'node:fs'
import path from 'node:path'

export type MemoryImportance = 1 | 2 | 3

export interface MemoryEntry {
  id: string
  text: string
  createdAt: string
  /** 1 普通 / 2 重要 / 3 关键。 */
  importance: MemoryImportance
  source: 'tool' | 'manual'
}

interface MemoryFile {
  version: 1
  entries: MemoryEntry[]
}

export const DEFAULT_MEMORY_BUDGET = 800
export const MAX_ENTRIES = 100
export const MAX_ENTRY_CHARS = 500

/** `DSH_HOME`（或 `~/.dsh`）——与 vision 同一套派生规则。 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.DSH_HOME ?? '').trim()
  if (explicit !== '') return explicit
  const home = (env.USERPROFILE ?? env.HOME ?? '').trim()
  return home === '' ? '' : path.join(home, '.dsh')
}

export function memoryDir(dshHome: string): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'memory')
}

/** 人设 id → 文件名：只留安全字符，避免路径穿越。 */
export function memoryFile(dir: string, personaId: string): string {
  const safe = String(personaId ?? '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'default'
  return path.join(dir, `${safe}.json`)
}

function makeId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeImportance(value: unknown): MemoryImportance {
  const num = Number(value)
  return num === 3 ? 3 : num === 2 ? 2 : 1
}

function readFileOf(file: string): MemoryFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: unknown }
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
          .filter((entry): entry is MemoryEntry => Boolean(entry) && typeof (entry as MemoryEntry).text === 'string')
          .map((entry) => ({
            id: typeof entry.id === 'string' ? entry.id : makeId(),
            text: String(entry.text).slice(0, MAX_ENTRY_CHARS),
            createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
            importance: normalizeImportance(entry.importance),
            source: entry.source === 'tool' ? ('tool' as const) : ('manual' as const),
          }))
      : []
    return { version: 1, entries }
  } catch {
    return { version: 1, entries: [] }
  }
}

function writeFileOf(file: string, entries: MemoryEntry[]): boolean {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}

function escapeLine(text: string): string {
  // 段落里一行一条；条目里的换行压成空格，别把提示词结构顶歪。
  return String(text).replace(/\s+/g, ' ').trim()
}

export function formatEntryLine(entry: MemoryEntry, withDate: boolean): string {
  const level = entry.importance === 3 ? '[关键]' : entry.importance === 2 ? '[重要]' : '[普通]'
  const date = withDate ? `[${entry.createdAt.slice(0, 10)}]` : ''
  return `- ${level}${date} ${escapeLine(entry.text)}`
}

/** 按重要度降序、新近度降序排：预算不足时先丢「不重要 + 旧」的。 */
export function sortEntries(entries: MemoryEntry[]): MemoryEntry[] {
  return [...entries].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/**
 * 组装注入文本。空库返回 ''（等于不注入，不需要重挂段落）。
 * 超预算的条目丢弃，但至少注入一条（否则用户看到「明明有记忆却不生效」）。
 */
export function composeMemoryText(entries: MemoryEntry[], budget = DEFAULT_MEMORY_BUDGET): string {
  if (entries.length === 0) return ''
  const header = '## 长期记忆（你自己攒的；跨会话有效，可据它主动接话）'
  const sorted = sortEntries(entries)
  const lines: string[] = []
  let used = header.length + 1
  for (const entry of sorted) {
    const line = formatEntryLine(entry, true)
    if (used + line.length + 1 > budget && lines.length > 0) continue
    lines.push(line)
    used += line.length + 1
  }
  return `${header}\n${lines.join('\n')}`
}

export interface MemoryService {
  readonly dir: string
  list(personaId: string): MemoryEntry[]
  add(personaId: string, text: string, options?: { importance?: unknown; source?: 'tool' | 'manual' }): { ok: true; entry: MemoryEntry } | { ok: false; error: string }
  update(personaId: string, id: string, patch: { text?: unknown; importance?: unknown }): boolean
  remove(personaId: string, id: string): boolean
  clear(personaId: string): boolean
  textFor(personaId: string, budget?: number): string
  counts(): Record<string, number>
}

export function createMemoryService(dshHome: string, budget: number = DEFAULT_MEMORY_BUDGET): MemoryService {
  const dir = memoryDir(dshHome)

  return {
    dir,
    list(personaId) {
      return sortEntries(readFileOf(memoryFile(dir, personaId)).entries)
    },
    add(personaId, text, options) {
      const value = escapeLine(text).slice(0, MAX_ENTRY_CHARS)
      if (value === '') return { ok: false, error: '记忆内容不能为空' }
      const file = memoryFile(dir, personaId)
      const entries = readFileOf(file).entries
      const entry: MemoryEntry = {
        id: makeId(),
        text: value,
        createdAt: new Date().toISOString(),
        importance: normalizeImportance(options?.importance),
        source: options?.source === 'tool' ? 'tool' : 'manual',
      }
      entries.push(entry)
      // 超上限：淘汰「最不重要 + 最旧」的一条。
      if (entries.length > MAX_ENTRIES) {
        const victim = [...entries].sort((a, b) => a.importance - b.importance || a.createdAt.localeCompare(b.createdAt))[0]
        if (victim) entries.splice(entries.indexOf(victim), 1)
      }
      if (!writeFileOf(file, entries)) return { ok: false, error: '记忆写不进去（磁盘/权限）' }
      return { ok: true, entry }
    },
    update(personaId, id, patch) {
      const file = memoryFile(dir, personaId)
      const entries = readFileOf(file).entries
      const hit = entries.find((entry) => entry.id === id)
      if (!hit) return false
      if (typeof patch.text === 'string') hit.text = escapeLine(patch.text).slice(0, MAX_ENTRY_CHARS)
      if (patch.importance !== undefined) hit.importance = normalizeImportance(patch.importance)
      return writeFileOf(file, entries)
    },
    remove(personaId, id) {
      const file = memoryFile(dir, personaId)
      const entries = readFileOf(file).entries
      const next = entries.filter((entry) => entry.id !== id)
      if (next.length === entries.length) return false
      return writeFileOf(file, next)
    },
    clear(personaId) {
      return writeFileOf(memoryFile(dir, personaId), [])
    },
    textFor(personaId, limit = budget) {
      return composeMemoryText(readFileOf(memoryFile(dir, personaId)).entries, limit)
    },
    counts() {
      const result: Record<string, number> = {}
      try {
        for (const name of fs.readdirSync(dir)) {
          if (!name.endsWith('.json')) continue
          result[name.slice(0, -5)] = readFileOf(path.join(dir, name)).entries.length
        }
      } catch {
        /* 目录还不存在 = 没有记忆 */
      }
      return result
    },
  }
}
