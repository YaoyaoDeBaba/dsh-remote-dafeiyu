/**
 * groups/service —— 「肥鱼拉群」的群记录、投递与通知（2026-11-19，v2）。
 *
 * ## 语义（v2 起最关键的一条）
 *
 * 群界面是**给用户看的记录**，不是发给全员的广播。用户 @A @B 发一条，插件拆成两条投递：
 * A 收到「你被 @ 了 + 本轮协作对象 + 对方要点」，B 收到对称的一条；两边都看不到整段群聊。
 * 这跟「前世↔来生收件箱」是同一根电话线（插件层 sendPrompt），只是多了一层给用户看的界面。
 *
 * ## 存储
 *
 * - `<dir>/<id>.json`：群元信息（名字、成员、时间）；
 * - `<dir>/<id>.jsonl`：**记录**（user / agent / system 三类），一条一行，坏一行不牵连别行。
 *
 * ## 纪律
 *
 * 1. 先落盘再投递：送失败还能 read 补发，不会凭空消失；
 * 2. 送不到不许静默：逐条带回 failed（谁没收到、为什么）；
 * 3. 只投给成员；上限 12 人、单条 4000 字；
 * 4. 投递正文带**当时的名单**与「怎么回复」——这就是成员「实时知道群里有谁」的唯一来源。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export interface GroupMember {
  sessionId: string
  /** 界面上显示用的名字（可选；面板拿会话标题填）。 */
  label?: string
  /** 用户给的身份（2026-11-19）：前端主程 / 后端主程 / 总经理……群内 agent 也读得到。 */
  role?: string
  joinedAt: number
}

export interface GroupRecord {
  version: 2
  id: string
  name: string
  members: GroupMember[]
  createdAt: number
  updatedAt: number
  /** 群主（2026-11-19）：用户 @ 多个 agent 时由它分工；未设则按 @ 顺序直投。 */
  ownerSessionId?: string
  /**
   * 已经收到过「完整用法」的成员（sessionId → 时刻）。
   *
   * 2026-11-19：投递不再每条都灌一遍说明书——第一次完整，之后只带极短的头部。
   */
  briefed?: Record<string, number>
  /** 解散时刻（2026-11-19）：解散后群对成员不可用，记录保留给用户看。 */
  dissolvedAt?: number
}

export type EntryKind = 'user' | 'agent' | 'system'

export interface GroupEntry {
  at: number
  kind: EntryKind
  /** user = 'user'；agent = 发起它的会话 id。 */
  from: string
  /** 这条 @ 了谁（空 = 只说给用户看，不投递）。 */
  targets?: string[]
  text: string
  /** 给用户看的摘要（agent 回复才有）：首行「摘要：…」，解析不到取前 25 字。 */
  summary?: string
}

export interface GroupsDeps {
  /** 群目录（`<dshHome>/storages/dsh-remote-dafeiyu/groups`）。 */
  dir: string
  /** 群主分工的等待上限（毫秒，默认 90 秒）：超时降级为直投被 @ 的人。 */
  dispatchTimeoutMs?: number
  /** 同一对会话之间的投递冷却（毫秒，默认 60 秒）：防来回刷屏。 */
  cooldownMs?: number
  /** 把一段文本送进某个会话（插件层 sendPrompt）。 */
  deliver: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
  /** 会话标题（可注入；用于名单里显示名字，拿不到就用短号）。 */
  titleOf?: (sessionId: string) => string | undefined
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
/** 群主一轮最多派几个活（防它一次把整群人点一遍）。 */
export const MAX_DISPATCH_TARGETS = 5

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

/** 会话短号：投递正文与界面都用它，别把整串 uuid 塞进别人上下文。 */
export function shortId(sessionId: string): string {
  return String(sessionId).replace(/^session-/, '').slice(0, 8)
}

export function readGroup(dir: string, id: string): GroupRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(groupPath(dir, id), 'utf8')) as Partial<GroupRecord>
    if (typeof parsed?.id !== 'string' || typeof parsed.name !== 'string' || !Array.isArray(parsed.members)) {
      return undefined
    }
    return {
      version: 2,
      id: parsed.id,
      name: parsed.name,
      members: parsed.members,
      createdAt: Number(parsed.createdAt ?? 0),
      updatedAt: Number(parsed.updatedAt ?? 0),
      ...(typeof parsed.ownerSessionId === 'string' && parsed.ownerSessionId.trim() !== '' ? { ownerSessionId: parsed.ownerSessionId.trim() } : {}),
      ...(parsed.briefed !== null && typeof parsed.briefed === 'object' ? { briefed: parsed.briefed as Record<string, number> } : {}),
      ...(Number(parsed.dissolvedAt ?? 0) > 0 ? { dissolvedAt: Number(parsed.dissolvedAt) } : {}),
    }
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

/** 名单一行：`名字(身份)`，agent 靠它猜出各人职责。 */
export function rosterLine(group: GroupRecord, titleOf?: (sessionId: string) => string | undefined): string {
  return group.members
    .map((member) => {
      const title = member.label ?? titleOf?.(member.sessionId)?.trim()
      const name = title !== undefined && title !== '' ? title : shortId(member.sessionId)
      const crown = group.ownerSessionId === member.sessionId ? '👑' : ''
      const role = typeof member.role === 'string' && member.role.trim() !== '' ? '（' + member.role.trim() + '）' : ''
      return crown + name + role
    })
    .join('、')
}

/**
 * 从一段回复里取摘要（2026-11-19）。
 *
 * 约定写在 skill 里：回复首行写 `摘要：一句话`。解析不到就取正文前 25 个字兜底——
 * 群里那条气泡是给用户扫一眼的，全文仍然留在记录里（点开能看）。
 */
export function summarize(text: string): string {
  const raw = String(text ?? '')
  const firstLine = raw.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== '') ?? ''
  const matched = /^(?:摘要|summary)\s*[:：]\s*(.+)$/i.exec(firstLine)
  if (matched !== null) {
    const summary = matched[1]!.trim()
    if (summary !== '') return summary.slice(0, 120)
  }
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.slice(0, 25)
}

/** 投递给被 @ 的成员的那段话：只带他需要知道的（看不到整段群聊）。 */
export function deliveryText(
  group: GroupRecord,
  from: string,
  text: string,
  others: string[],
  titleOf?: (sessionId: string) => string | undefined,
  /** 这条是投给谁的：协作对象要把它排除掉（不能把自己列成自己的协作对象）。 */
  recipient?: string,
  /** 第二次及以后：只带极短头部，不再复述工具用法（2026-11-19）。 */
  brief?: boolean,
): string {
  const peers = others
    .filter((sessionId) => sessionId !== from && sessionId !== recipient)
    .map((sessionId) => titleOf?.(sessionId)?.trim() || shortId(sessionId))
  const ownerLabel = group.ownerSessionId === undefined ? '' : titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)
  if (brief === true) {
    return [
      '【群 ' + group.name + ' · 来自 ' + (from === 'user' ? '用户' : shortId(from)) + '】',
      text.trim(),
      '成员：' + rosterLine(group, titleOf) + (ownerLabel === '' ? '' : '｜群主 ' + ownerLabel),
    ].join('\n')
  }
  return [
    '【群 ' + group.name + ' · ' + group.id + ' · 来自 ' + (from === 'user' ? '用户' : shortId(from)) + '】',
    text.trim(),
    '',
    '群成员：' + rosterLine(group, titleOf) + (ownerLabel === '' ? '' : '｜群主 ' + ownerLabel),
    peers.length > 0 ? '本轮协作对象：' + peers.join('、') : '本轮只有你。',
    '你看不到群里的整段记录（插件只投给你被 @ 的部分）。要说点什么就调 group_post：groupId=' +
      group.id +
      '，text 写正文；要直接找某个成员，把 to 填成对方的短号或会话 id。',
    group.ownerSessionId === undefined
      ? '想看最近记录用 group_read(groupId=' + group.id + ')。'
      : '汇报对象：群主 ' + (titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)) +
        '（你的 group_post 不带 to 时默认回给群主）；想看最近记录用 group_read(groupId=' + group.id + ')。',
  ].join('\n')
}

function joinNotice(group: GroupRecord, titleOf?: (sessionId: string) => string | undefined): string {
  const owner = group.ownerSessionId === undefined ? '' : titleOf?.(group.ownerSessionId)?.trim() || shortId(group.ownerSessionId)
  return [
    '【入群通知 · ' + group.name + ' · ' + group.id + '】',
    '你被拉进这个群了（这是一次唤醒：不用等用户再喊你）。',
    '群成员：' + rosterLine(group, titleOf) + (owner === '' ? '' : '｜群主 ' + owner + '（用户 @ 多人时由群主分工）'),
    '',
    '用法（之后的消息只带极短头部，这份说明不再重复；忘了可以调 groups_guide）：',
    '· 有人 @ 你时你会收到一条独立消息，带「本轮协作对象」——你看不到群里的其他消息；',
    '· 回复用 group_post(groupId=' + group.id + ', text=...)，**首行写「摘要：一句话」**（群里只显示摘要，全文点开才看）；',
    '· 不带 to 时默认回给群主（汇报对象）；to 可以填对方短号或会话 id；',
    '· 想看最近记录用 group_read(groupId=' + group.id + ')。',
    '· 如果你的工具列表里没有 group_*（老会话），用 HTTP 兜底：把你自己的会话 id 和正文 POST 到',
    '  <DSH Web GUI 的 origin>/api/dsh-remote-dafeiyu/groups/agent-post（本机回环，带 x-drc-pair: 1；',
    '  body = {"groupId":"' + group.id + '","sessionId":"<你的会话id>","text":"…"}）。读用 agent-read。',
    '',
    '如果你现在正忙，先把这条记下；有空再回。知道有这个群、知道怎么回就够了。',
  ].join('\n')
}

/** 成员变动通知（发给**全体**）：谁进来了 / 谁走了。 */
export function memberNotice(group: GroupRecord, subject: string, action: '加入' | '离开', titleOf?: (sessionId: string) => string | undefined): string {
  const who = titleOf?.(subject)?.trim() || shortId(subject)
  return [
    '【群 ' + group.name + ' · ' + group.id + '】',
    who + action + '了本群。',
    '现在的成员：' + rosterLine(group, titleOf),
  ].join('\n')
}

/**
 * 「分工请求」：用户一次 @ 多个人时，投给群主的那条（2026-11-20）。
 *
 * 之前的实现只把 targets 换成群主，正文还是原话——于是群主看到的是「本轮只有你」，
 * 既不知道用户 @ 了谁，也不知道自己被要求分工（真机报的正是这个）。
 */
export function dispatchText(
  group: GroupRecord,
  asked: string[],
  text: string,
  titleOf?: (sessionId: string) => string | undefined,
): string {
  const names = asked.map((id) => {
    const title = titleOf?.(id)?.trim()
    return title !== undefined && title !== '' ? title : shortId(id)
  })
  return [
    '【分工请求 · ' + group.name + ' · ' + group.id + '】',
    '用户 @ 了：' + names.join('、'),
    '',
    '原话：' + text.trim(),
    '',
    '你来安排分工：用 group_post(groupId=' + group.id + '，text=...，to=[...]) 派活（一轮最多 5 个）。',
    '派完在群里回一条摘要（首行「摘要：…」）。',
    '90 秒内没人派活，系统会直接把原话投给他们，并记一笔「群主未分工」。',
  ].join('\n')
}

/** 群不可用（解散 / 被移出）时给受影响会话的告知。 */
export function unavailableNotice(group: GroupRecord, reason: 'dissolved' | 'removed'): string {
  return [
    '【群 ' + group.name + ' · ' + group.id + '】',
    reason === 'dissolved'
      ? '这个群已经解散，**对你不再可用**：别再往这里发消息，也不需要再等群里的其他通知。'
      : '你已经被移出这个群，**本群对你不再可用**：别再往这里发消息，后续别再引用这里的结论。',
    '如果你还有没同步完的事情，直接问用户。',
  ].join('\n')
}

export function createGroups(deps: GroupsDeps) {
  const now = deps.now ?? (() => Date.now())
  const titleOf = deps.titleOf

  const save = (group: GroupRecord): boolean => {
    ensureDir(deps.dir)
    try {
      writeFileSync(groupPath(deps.dir, group.id), JSON.stringify(group, null, 2) + '\n', 'utf8')
      return true
    } catch {
      return false
    }
  }

  const append = (id: string, entry: GroupEntry): void => {
    try {
      ensureDir(deps.dir)
      appendFileSync(logPath(deps.dir, id), JSON.stringify(entry) + '\n', 'utf8')
    } catch {
      /* 记录写不进去：投递照做，read 时少一条 */
    }
  }

  const newId = (at: number): string => {
    const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
    return 'g-' + (uuid ?? String(at) + Math.random().toString(36).slice(2, 8)).replace(/-/g, '').slice(0, 10)
  }

  const deliverEach = async (
    group: GroupRecord,
    from: string,
    text: string,
    targets: string[],
    /** true = 原样投递（分工请求这种已经写好的整段话），不再套普通投递头。 */
    raw = false,
  ): Promise<DeliveryResult[]> => {
    const out: DeliveryResult[] = []
    for (const target of targets) {
      if (target === from) continue
      if (!group.members.some((member) => member.sessionId === target)) continue
      // 冷却：同一对（from → target）60 秒内只投一次，防来回刷屏
      const key = group.id + '|' + from + '|' + target
      const last = lastDeliveryAt.get(key)
      if (last !== undefined && now() - last < cooldownMs) {
        out.push({ sessionId: target, ok: true, message: '冷却中（' + Math.round(cooldownMs / 1000) + ' 秒内已投过一次），本次跳过' })
        continue
      }
      lastDeliveryAt.set(key, now())
      // 每个收件人一份正文：协作对象里不能出现他自己；第二次起只带极短头部。
      const brief = group.briefed?.[target] !== undefined
      const body = raw ? text : deliveryText(group, from, text, targets, titleOf, target, brief)
      const result = await deps.deliver(target, body).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      out.push({
        sessionId: target,
        ok: result.ok === true,
        ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
      })
      // 投成功就记一笔"这个成员已经知道怎么用了"，之后改投极短版本
      if (result.ok === true) {
        group.briefed = { ...(group.briefed ?? {}), [target]: now() }
        save(group)
      }
    }
    return out
  }

  /** 取群并判"还活着"。解散后的群对写入一律拒。 */
  const live = (id: string): { group?: GroupRecord; message?: string } => {
    const group = readGroup(deps.dir, String(id ?? '').trim())
    if (group === undefined) return { message: '没有这个群（id 可能不对）。' }
    if (group.dissolvedAt !== undefined) return { message: '这个群已经解散了，用不了。' }
    return { group }
  }

  /*
   * 群主分工的降级计时器 & 投递冷却（2026-11-19）。
   *
   * - 降级：用户 @ 多人后只投给群主；群主 90 秒没派活就直投被 @ 的人，并记一笔
   *   「群主未分工，本轮并行处理」——不能让整轮挂在群主身上；
   * - 冷却：同一对会话 60 秒内只投一次，防 A↔B 来回刷。
   */
  const dispatchTimeoutMs = deps.dispatchTimeoutMs ?? 90_000
  const cooldownMs = deps.cooldownMs ?? 60_000
  const pendingDispatch = new Map<string, ReturnType<typeof setTimeout>>()
  const lastDeliveryAt = new Map<string, number>()

  const cancelDispatch = (id: string): void => {
    const timer = pendingDispatch.get(id)
    if (timer === undefined) return
    try {
      clearTimeout(timer)
    } catch {
      /* 清不掉也不影响 */
    }
    pendingDispatch.delete(id)
  }

  const armDispatch = (group: GroupRecord, targets: string[], text: string): void => {
    cancelDispatch(group.id)
    const timer = setTimeout(() => {
      pendingDispatch.delete(group.id)
      void (async () => {
        const fresh = readGroup(deps.dir, group.id)
        if (fresh === undefined || fresh.dissolvedAt !== undefined) return
        append(fresh.id, { at: now(), kind: 'system', from: 'system', text: '群主未分工，本轮并行处理' })
        const results = await deliverEach(fresh, 'user', text, targets)
        deps.log('群主未分工，降级直投', {
          id: fresh.id,
          targets: targets.length,
          failed: results.filter((row) => !row.ok).length,
        })
      })()
    }, dispatchTimeoutMs)
    try {
      ;(timer as { unref?: () => void }).unref?.()
    } catch {
      /* 环境没有 unref 就算了 */
    }
    pendingDispatch.set(group.id, timer)
  }

  /** 给全体成员发一段话（送给不到的记进结果）。 */
  const notifyAll = async (group: GroupRecord, subject: string, text: string): Promise<DeliveryResult[]> => {
    const results: DeliveryResult[] = []
    for (const member of group.members) {
      if (member.sessionId === subject) continue
      const result = await deps.deliver(member.sessionId, text).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      results.push({
        sessionId: member.sessionId,
        ok: result.ok === true,
        ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
      })
    }
    return results
  }

  return {
    /** 建群：发起方自动入群（除非给了 includeMe:false），可顺手带几个成员。 */
    create(input: { name: string; members?: string[]; me?: string; includeMe?: boolean; owner?: string }): {
      ok: boolean
      group?: GroupRecord
      message?: string
    } {
      const name = String(input.name ?? '').trim().slice(0, 40)
      if (name === '') return { ok: false, message: '群要有个名字（name）。' }
      const at = now()
      const ids: string[] = []
      const push = (id: string): void => {
        const trimmed = String(id ?? '').trim()
        if (trimmed !== '' && !ids.includes(trimmed)) ids.push(trimmed)
      }
      if (input.includeMe !== false && typeof input.me === 'string' && input.me.trim() !== '') push(input.me)
      for (const id of input.members ?? []) push(id)
      if (ids.length === 0) return { ok: false, message: '群里至少要有一个人（发起方）。' }
      if (ids.length > MAX_MEMBERS) return { ok: false, message: '一个群最多 ' + MAX_MEMBERS + ' 个会话。' }
      const group: GroupRecord = {
        version: 2,
        id: newId(at),
        name,
        members: ids.map((sessionId) => {
          const label = titleOf?.(sessionId)?.trim()
          return { sessionId, joinedAt: at, ...(label ? { label } : {}) }
        }),
        createdAt: at,
        updatedAt: at,
        // 群主：显式指定的优先，否则发起方（或群里第一个人）当群主。
        ...((): { ownerSessionId?: string } => {
          const want = String(input.owner ?? '').trim()
          if (want !== '' && ids.includes(want)) return { ownerSessionId: want }
          return ids.length > 0 ? { ownerSessionId: ids[0]! } : {}
        })(),
      }
      if (!save(group)) return { ok: false, message: '群没落盘（目录不可写）。' }
      append(group.id, { at, kind: 'system', from: 'system', text: '建群：' + group.name + '（' + group.members.length + ' 人）' })
      deps.log('建群', { id: group.id, members: group.members.length })
      return { ok: true, group }
    },

    /** 拉人进群：加成员 + 给每个新成员发入群通知（带名单与用法）。 */
    async invite(input: { id: string; members: string[] }): Promise<{
      ok: boolean
      group?: GroupRecord
      added?: string[]
      notified?: DeliveryResult[]
      message?: string
    }> {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群（id 可能不对）。' }
      const added: string[] = []
      for (const raw of input.members ?? []) {
        const id = String(raw ?? '').trim()
        if (id === '' || group.members.some((member) => member.sessionId === id)) continue
        if (group.members.length >= MAX_MEMBERS) break
        const label = titleOf?.(id)?.trim()
        group.members.push({ sessionId: id, joinedAt: now(), ...(label ? { label } : {}) })
        added.push(id)
      }
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '成员没写进去（目录不可写）。' }
      if (added.length === 0) return { ok: true, group, added }
      const notified: DeliveryResult[] = []
      for (const id of added) {
        // 新成员收到入群须知（名单 + 用法）；**其余全体**收到一条「XX 加入了本群」。
        const joined = await deps.deliver(id, joinNotice(group, titleOf)).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: id,
          ok: joined.ok === true,
          ...(joined.ok === true || joined.message === undefined ? {} : { message: String(joined.message).slice(0, 160) }),
        })
        const others = await notifyAll(group, id, memberNotice(group, id, '加入', titleOf))
        notified.push(...others)
        append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(id) + ' 加入了本群' })
      }
      return { ok: true, group, added, notified }
    },

    /** 退群。 */
    leave(input: { id: string; sessionId: string }): { ok: boolean; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const before = group.members.length
      group.members = group.members.filter((member) => member.sessionId !== input.sessionId)
      group.updatedAt = now()
      if (!save(group)) return { ok: false, message: '没保存成功（目录不可写）。' }
      if (before !== group.members.length) {
        append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(input.sessionId) + ' 退出了群' })
      }
      return before === group.members.length ? { ok: true, message: '本来就不在群里。' } : { ok: true }
    },

    /**
     * 主动唤醒成员（2026-11-19）：建群之后要把「你进群了」推给每个成员。
     *
     * 为什么不能等用户的第一条群消息：agent 空闲时不会自己去看什么——
     * 用户不说一句，它就不知道自己被拉进群了。所以建群/加人之后立刻推一次入群通知
     * （带用法），并把成员标成已告知，之后的消息走极短版。
     */
    async announce(input: { id: string; except?: string }): Promise<{ ok: boolean; notified?: DeliveryResult[]; message?: string }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const notified: DeliveryResult[] = []
      for (const member of group.members) {
        if (member.sessionId === input.except) continue
        const result = await deps.deliver(member.sessionId, joinNotice(group, titleOf)).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: member.sessionId,
          ok: result.ok === true,
          ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
        })
        if (result.ok === true) {
          group.briefed = { ...(group.briefed ?? {}), [member.sessionId]: now() }
          save(group)
        }
      }
      return { ok: notified.every((row) => row.ok), notified }
    },

    /** 设置某个成员的身份（只在用户侧改；agent 只能读）。 */
    setMemberRole(input: { id: string; sessionId: string; role: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const member = group.members.find((row) => row.sessionId === input.sessionId) ??
        group.members.find((row) => shortId(row.sessionId) === String(input.sessionId ?? '').trim())
      if (member === undefined) return { ok: false, message: '这个人不在群里。' }
      const role = String(input.role ?? '').trim().slice(0, 20)
      if (role === '') delete member.role
      else member.role = role
      group.updatedAt = now()
      save(group)
      append(group.id, {
        at: now(),
        kind: 'system',
        from: 'system',
        text: shortId(member.sessionId) + (role === '' ? ' 的身份已清空' : ' 的身份设为「' + role + '」'),
      })
      return { ok: true, group }
    },

    /** 指定 / 更换群主（必须是群成员）。 */
    setOwner(input: { id: string; sessionId: string }): { ok: boolean; group?: GroupRecord; message?: string } {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const target = String(input.sessionId ?? '').trim()
      const member = group.members.find((row) => row.sessionId === target) ??
        group.members.find((row) => shortId(row.sessionId) === target)
      if (member === undefined) return { ok: false, message: '群主必须是群成员。' }
      group.ownerSessionId = member.sessionId
      group.updatedAt = now()
      save(group)
      append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(member.sessionId) + ' 成为群主' })
      return { ok: true, group }
    },

    /** 把某个成员移出群：通知他本人「不再可用」，通知剩下的人「XX 离开了本群」。 */
    async remove(input: { id: string; sessionId: string }): Promise<{
      ok: boolean
      group?: GroupRecord
      notified?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      const subject = String(input.sessionId ?? '').trim()
      if (!group.members.some((member) => member.sessionId === subject)) {
        return { ok: false, message: '这个会话不在群里。' }
      }
      group.members = group.members.filter((member) => member.sessionId !== subject)
      group.updatedAt = now()
      save(group)
      append(group.id, { at: now(), kind: 'system', from: 'system', text: shortId(subject) + ' 被移出了本群' })
      const notified: DeliveryResult[] = []
      const kicked = await deps.deliver(subject, unavailableNotice(group, 'removed')).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      notified.push({ sessionId: subject, ok: kicked.ok === true, ...(kicked.message === undefined ? {} : { message: kicked.message }) })
      const others = await notifyAll(group, subject, memberNotice(group, subject, '离开', titleOf))
      notified.push(...others)
      return { ok: true, group, notified }
    },

    /** 解散群：通知全体「本群已解散、不再可用」，记录保留给用户看。 */
    async dissolve(input: { id: string }): Promise<{
      ok: boolean
      group?: GroupRecord
      notified?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message }
      const group = alive.group
      group.dissolvedAt = now()
      group.updatedAt = group.dissolvedAt
      save(group)
      append(group.id, { at: group.dissolvedAt, kind: 'system', from: 'system', text: '群已解散' })
      const notified: DeliveryResult[] = []
      for (const member of group.members) {
        const result = await deps.deliver(member.sessionId, unavailableNotice(group, 'dissolved')).catch((error: unknown) => ({
          ok: false,
          message: String((error as Error)?.message ?? error),
        }))
        notified.push({
          sessionId: member.sessionId,
          ok: result.ok === true,
          ...(result.ok === true || result.message === undefined ? {} : { message: String(result.message).slice(0, 160) }),
        })
      }
      return { ok: true, group, notified }
    },

    /**
     * 一条群消息：`kind:'user'` 是用户在界面上发的（targets = 他 @ 的人），
     * `kind:'agent'` 是某个成员用 group_post 发的。**只投给 targets**。
     */
    async post(input: { id: string; from: string; text: string; targets?: string[]; kind?: EntryKind }): Promise<{
      ok: boolean
      entry?: GroupEntry
      delivered?: DeliveryResult[]
      failed?: DeliveryResult[]
      message?: string
    }> {
      const alive = live(input.id)
      if (alive.group === undefined) return { ok: false, message: alive.message ?? '没有这个群（先 group_create）。' }
      const group = alive.group
      const text = String(input.text ?? '').trim()
      if (text === '') return { ok: false, message: '消息不能是空的。' }
      if (text.length > MAX_MESSAGE_CHARS) return { ok: false, message: '单条最多 ' + MAX_MESSAGE_CHARS + ' 字，拆开发。' }
      const kind: EntryKind = input.kind === 'user' ? 'user' : input.kind === 'system' ? 'system' : 'agent'
      const from = String(input.from ?? '').trim()
      if (kind === 'agent' && !group.members.some((member) => member.sessionId === from)) {
        return { ok: false, message: '你不在这个群里（先 group_invite 把自己加进去）。' }
      }
      const asked = (input.targets ?? [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => id !== '' && group.members.some((member) => member.sessionId === id))
      const owner = group.ownerSessionId

      /*
       * 群主分工（2026-11-19）：
       * 用户一次 @ 多个人时，**不直接撒给所有人**，而是只投给群主 + 一句「你来分工」；
       * 群主用 group_post(to=[...]) 派活。超时没派活就降级为直投被 @ 的人。
       *
       * agent 侧：不带 to 时默认回给群主（汇报对象），这样一轮里消息路径是
       * 「群主 → 成员」与「成员 → 群主」，不会 A↔B 来回刷。
       */
      /*
       * 用户一次 @ 多个人 ⇒ 只投群主，而且投的是**分工请求**（不是原话）：
       * 群主得知道「用户 @ 了谁」和「我被要求分工」，否则它看到的就是一句「本轮只有你」。
       */
      const isDispatch = kind === 'user' && owner !== undefined && asked.length >= 2
      let targets = asked
      let body = text
      if (isDispatch) {
        targets = [owner]
        body = dispatchText(group, asked, text, titleOf)
      } else if (kind === 'agent' && asked.length === 0 && owner !== undefined && owner !== from) {
        targets = [owner]
      }
      if (kind === 'agent' && from === owner && targets.length > MAX_DISPATCH_TARGETS) {
        return { ok: false, message: '群主一次最多派 ' + MAX_DISPATCH_TARGETS + ' 个活：拆成几轮。' }
      }

      const entry: GroupEntry = {
        at: now(),
        kind,
        from,
        // 记录里写用户真正 @ 的人（群里要能看出 @全体），投递才用 owner-only 的 targets
        ...(asked.length > 0 ? { targets: asked } : {}),
        text,
        ...(kind === 'agent' ? { summary: summarize(text) } : {}),
      }
      append(group.id, entry)
      group.updatedAt = now()
      save(group)

      // 群主派了活 ⇒ 取消这一轮的降级计时器
      if (kind === 'agent' && from === owner && targets.length > 0) cancelDispatch(group.id)
      // 用户 @ 多人 ⇒ 起一个降级计时器（超时直投被 @ 的人）
      if (isDispatch) armDispatch(group, asked, text)

      if (targets.length === 0) return { ok: true, entry }
      const results = await deliverEach(group, kind === 'user' ? 'user' : from, body, targets, isDispatch)
      const failed = results.filter((row) => !row.ok)
      deps.log('群投递', { id: group.id, targets: targets.length, failed: failed.length })
      return {
        ok: failed.length === 0,
        entry,
        delivered: results.filter((row) => row.ok),
        failed,
        ...(failed.length === 0
          ? {}
          : { message: '有 ' + failed.length + ' 个成员没送到（可能已归档或宿主不支持发消息），清单在 failed 里。' }),
      }
    },

    /** 兼容旧调用：发一条给群里其他所有人（等价于 post 且 targets = 全部其他人）。 */
    async send(input: { id: string; from: string; text: string }) {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false as const, message: '没有这个群（先 group_create）。' }
      const targets = group.members.map((member) => member.sessionId).filter((id) => id !== input.from)
      return this.post({ id: input.id, from: input.from, text: input.text, targets, kind: 'agent' })
    },

    /** 读最近的记录（默认 20，上限 100）。 */
    read(input: { id: string; limit?: number }): { ok: boolean; messages?: GroupEntry[]; message?: string } {
      const group = readGroup(deps.dir, String(input.id ?? '').trim())
      if (group === undefined) return { ok: false, message: '没有这个群。' }
      const limit = Math.min(100, Math.max(1, Math.round(Number(input.limit ?? 20) || 20)))
      const file = logPath(deps.dir, group.id)
      if (!existsSync(file)) return { ok: true, messages: [] }
      try {
        const lines = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '')
        const messages: GroupEntry[] = []
        for (const line of lines.slice(-limit)) {
          try {
            const parsed = JSON.parse(line) as GroupEntry
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
