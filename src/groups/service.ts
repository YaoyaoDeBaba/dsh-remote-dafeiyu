/**
 * groups/service —— 「肥鱼拉群」：把几个**顶层会话**拉进一个群互相说话（2026-11-19）。
 *
 * ## 为什么做在插件层
 *
 * 内核没有「顶层会话之间互发消息」的 API（`send_message` 只在 subagent 树里）。但插件手里有
 * `sendPrompt(sessionId, text)`——转生/分身与『前世↔来生收件箱』本来就是靠它投递的。
 * 于是「拉群」= 一份成员表 + 一条消息日志 + 逐个 sendPrompt。不需要内核配合，也不需要用户两边转述。
 *
 * ## 纪律（照收件箱那套抄）
 *
 * 1. **送不到不许静默**：谁没收到、为什么没收到，要原样带给调用方——不然发起方会以为对方知道了。
 * 2. **消息落盘先于投递**：先写日志再送。送失败至少还能 `group_read` 补发，不会凭空消失。
 * 3. **只发成员**：不认识的 sessionId 直接拒；一次最多 12 个成员、单条最多 4000 字。
 * 4. **不带附件、不带指令**：投递的正文只有群名 + 发送方短号 + 消息本体 + 「怎么回复」。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs'
import path from 'node:path'

export interface GroupMember {
  sessionId: string
  joinedAt: number
}

export interface GroupRecord {
  version: 1
  id: string
  name: string
  members: GroupMember[]
  createdAt: number
  updatedAt: number
}

export interface GroupMessage {
  at: number
  from: string
  text: string
}

export interface GroupsDeps {
  /** 群目录（`<dshHome>/storages/dsh-remote-dafeiyu/groups`）。 */
  dir: string
  /** 把一段文本送进某个会话（插件层那条 sendPrompt）。 */
  deliver: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
  now?: () => number
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export interface DeliveryResult {
  sessionId: string
  ok: boolean
  message?: string
}

export const MAX_MEMBERS = 12
export const MAX_MESSAGE_CHARS = 4_000

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 写的时候还会再失败一次，由调用方报 */
  }
}

function safeId(id: string): string {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '_')
}

function groupPath(dir: string, id: string): string {
  return path.join(dir, safeId(id) + '.json')
}

function logPath(dir: string, id: string): string {
  return path.join(dir, safeId(id) + '.jsonl')
}

/** 会话短号：界面与投递正文都用它，别把整串 uuid 塞进别人上下文。 */
export function shortId(sessionId: string): string {
  return String(sessionId).replace(/^session-/, '').slice(0, 8)
}

export function readGroup(dir: string, id: string): GroupRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(groupPath(dir, id), 'utf8')) as GroupRecord
    if (typeof parsed?.id !== 'string' || typeof parsed.name !== 'string' || !Array.isArray(parsed.members)) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

export function listGroups(dir: string): GroupRecord[] {
  try {
    const out: GroupRecord[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      const group = readGroup(dir, file.replace(/\.json$/, ''))
      if (group !== undefined) out.push(group)
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

/** 投递给群成员的那段话：只带必要信息 + 怎么回复。 */
export function deliveryText(group: GroupRecord, from: string, text: string): string {
  return [
    '【群 ' + group.name + ' · ' + group.id + ' · 来自 ' + shortId(from) + '】',
    text.trim(),
    '',
    '回复用 group_send：groupId=' + group.id + '，message 写你要说的话；只发给群里其他人，别回给发送方自己。',
    '要看前文用 group_read。不确定要不要说就别说——群里每句话都会占别人的上下文。',
  ].join('\n')
}

export function createGroups(deps: GroupsDeps) {
  const now = deps.now ?? (() => Date.now())

  const save = (group: GroupRecord): boolean => {
    ensureDir(deps.dir)
    try {
      writeFileSync(groupPath(deps.dir, group.id), JSON.stringify(group, null, 2) + '\n', 'utf8')
      return true
    } catch {
      return false
    }
  }

  const append = (id: string, message: GroupMessage): void => {
    try {
      ensureDir(deps.dir)
      appendFileSync(logPath(deps.dir, id), JSON.stringify(message) + '\n', 'utf8')
    } catch {
      /* 日志写不进去：投递照做，read 时少一条 */
    }
  }

  const newId = (at: number): string => {
    const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
    return 'g-' + (uuid ?? String(at) + Math.random().toString(36).slice(2, 8)).replace(/-/g, '').slice(0, 10)
  }

  const deliverTo = async (group: GroupRecord, sender: string, text: string): Promise<DeliveryResult[]> => {
    const body = deliveryText(group, sender, text)
    const out: DeliveryResult[] = []
    for (const member of group.members) {
      if (member.sessionId === sender) continue
      const result = await deps.deliver(member.sessionId, body).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      out.push({
        sessionId: member.sessionId,
        ok: result.ok === true,
        ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
      })
    }
    return out
  }

  return {
    /** 建群：发起方自动入群（除非 me:false），可顺手带几个成员。 */
    create(input: { name: string; members?: string[]; me?: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const name = String(input.name ?? '').trim().slice(0, 40)
      if (name === '') return { ok: false, message: '群要有个名字（name）。' }
      const at = now()
      const ids: string[] = []
      const push = (id: string): void => {
        const trimmed = String(id ?? '').trim()
        if (trimmed !== '' && !ids.includes(trimmed)) ids.push(trimmed)
      }
      if (typeof input.me === 'string' && input.me.trim() !== '') push(input.me)
      for (const id of input.members ?? []) push(id)
      if (ids.length === 0) return { ok: false, message: '群里至少要有一个人（发起方）。' }
      if (ids.length > MAX_MEMBERS) return { ok: false, message: '一个群最多 ' + MAX_MEMBERS + ' 个会话。' }
      const group: GroupRecord = {
        version: 1,
        id: newId(at),
        name,
        members: ids.map((sessionId) => ({ sessionId, joinedAt: at })),
        createdAt: at,
        updatedAt: at,
      }
      if (!save(group)) return { ok: false, message: '群没落盘（目录不可写）。' }
      deps.log('建群', { id: group.id, members: group.members.length })
      return { ok: true, group }
    },

    /** 拉人进群：只加成员，不额外发消息。 */
    invite(input: { id: string; members: string[] }): { ok: boolean; group?: GroupRecord; added?: string[]; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群（id 可能不对）。' }
      const added: string[] = []
      for (const raw of input.members ?? []) {
        const id = String(raw ?? '').trim()
        if (id === '' || group.members.some((member) => member.sessionId === id)) continue
        if (group.members.length >= MAX_MEMBERS) break
        group.members.push({ sessionId: id, joinedAt: now() })
        added.push(id)
      }
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '成员没写进去（目录不可写）。' }
      return { ok: true, group, added }
    },

    /** 退群（自己走，或被移出）。 */
    leave(input: { id: string; sessionId: string }): { ok: boolean; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const before = group.members.length
      group.members = group.members.filter((member) => member.sessionId !== input.sessionId)
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '没保存成功（目录不可写）。' }
      return before === group.members.length ? { ok: true, message: '本来就不在群里。' } : { ok: true }
    },

    /** 发一条：先落盘，再逐成员投递；送不到的逐条带回。 */
    async send(input: { id: string; from: string; text: string }): Promise<{
      ok: boolean
      delivered?: DeliveryResult[]
      failed?: DeliveryResult[]
      message?: string
    }> {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群（先 group_create）。' }
      const text = String(input.text ?? '').trim()
      if (text === '') return { ok: false, message: '消息不能是空的。' }
      if (text.length > MAX_MESSAGE_CHARS) return { ok: false, message: '单条最多 ' + MAX_MESSAGE_CHARS + ' 字，拆开发。' }
      if (!group.members.some((member) => member.sessionId === input.from)) {
        return { ok: false, message: '你不在这个群里（先 group_invite 把自己加进去）。' }
      }
      append(group.id, { at: now(), from: input.from, text })
      group.updatedAt = now()
      save(group)
      const results = await deliverTo(group, input.from, text)
      const failed = results.filter((row) => !row.ok)
      deps.log('群发', { id: group.id, delivered: results.length - failed.length, failed: failed.length })
      return {
        ok: failed.length === 0,
        delivered: results.filter((row) => row.ok),
        failed,
        ...(failed.length === 0
          ? {}
          : { message: '有 ' + failed.length + ' 个成员没送到（可能已归档或宿主不支持发消息），清单在 failed 里。' }),
      }
    },

    /** 读最近 N 条（默认 20）。 */
    read(input: { id: string; limit?: number }): { ok: boolean; messages?: GroupMessage[]; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const limit = Math.min(100, Math.max(1, Math.round(Number(input.limit ?? 20) || 20)))
      const file = logPath(deps.dir, group.id)
      if (!existsSync(file)) return { ok: true, messages: [] }
      try {
        const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
        const messages: GroupMessage[] = []
        for (const line of lines.slice(-limit)) {
          try {
            const parsed = JSON.parse(line) as GroupMessage
            if (typeof parsed?.text === 'string' && typeof parsed.from === 'string') messages.push(parsed)
          } catch {
            /* 坏一行跳过 */
          }
        }
        return { ok: true, messages }
      } catch {
        return { ok: false, message: '日志读不出来。' }
      }
    },

    list: () => listGroups(deps.dir),
    get: (id: string) => readGroup(deps.dir, id),
  }
}

export type Groups = ReturnType<typeof createGroups>
