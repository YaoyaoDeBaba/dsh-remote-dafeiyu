/**
 * handoff/inbox —— 前世 ↔ 来生的**收件箱**（2026-11-17）。
 *
 * ## 为什么需要它
 *
 * 转生之后，来生读交接文档总会发现缺口（当时为什么这么定、被否方案的原因、在等谁拍板）。
 * 以前这些只能靠用户两边传话：来生报缺口 → 用户去问前世 → 用户再回来贴答案，三轮人肉。
 *
 * 内核没有「顶层会话互相发消息」的 API（send_message 只在 subagent 树里）。但插件手里有
 * sendPrompt(sessionId, text)——转生本来就是靠它投递的。所以收件箱是插件层的一根电话线：
 * 来生 handoff_ask 投问题 → 插件送进前世会话 → 前世 handoff_answer 回答 → 插件送回给来生。
 *
 * ## 前提与兜底
 *
 * 真机上的用法是：**转生之后用户会让前世多活几天，交接彻底完成才归档**。所以这条线是通的。
 * 但也有答不了的场合（会话已归档 / 装机没开 / 上下文塞不进）。那时候不许静默：
 * 线程会被标成 undeliverable，工具返回值里直接告诉来生「去问用户」，别让它一直等。
 *
 * ## 存放
 *
 * 一条线程一个文件：<handoffDir>/inbox/<id>.json。人可读、坏一条不牵连别条。
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type InboxStatus = 'open' | 'answered' | 'undeliverable'

export interface InboxThread {
  id: string
  /** 提问方（来生）的会话 id。 */
  from: string
  /** 被问方（前世）的会话 id。 */
  to: string
  question: string
  /** 前世给的回答；没答之前是 undefined。 */
  answer?: string
  status: InboxStatus
  createdAt: number
  updatedAt: number
}

export interface InboxDeps {
  /** 收件箱目录（<handoffDir>/inbox）。 */
  dir: string
  /** 把一段文本送进某个会话（插件层那条 sendPrompt）。 */
  deliver: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
  now?: () => number
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export interface InboxResult {
  ok: boolean
  /** 成功时是线程；失败时把一句话原因放在 message 里。 */
  thread?: InboxThread
  message?: string
}

function ensureDir(dir: string): void {
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 写的时候还会再失败一次，由调用方报 */
  }
}

function threadPath(dir: string, id: string): string {
  return path.join(dir, String(id).replace(/[^A-Za-z0-9_-]/g, '_') + '.json')
}

function shortId(sessionId: string): string {
  return sessionId.replace(/^session-/, '').slice(0, 8)
}

export function readThread(dir: string, id: string): InboxThread | undefined {
  try {
    const parsed = JSON.parse(readFileSync(threadPath(dir, id), 'utf8')) as InboxThread
    if (typeof parsed?.id !== 'string' || typeof parsed.from !== 'string' || typeof parsed.to !== 'string') return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function listThreads(dir: string): InboxThread[] {
  try {
    const out: InboxThread[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      const thread = readThread(dir, file.replace(/\.json$/, ''))
      if (thread !== undefined) out.push(thread)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/** 送进前世会话的那段话：带上线程 id 与回答方式，别让它自己发明流程。 */
export function askDeliveryText(thread: InboxThread): string {
  return [
    '【来生提问 · 收件箱 ' + thread.id + '】',
    '来自会话 ' + shortId(thread.from) + '（它在接手你转生/分身出去的那条活）。',
    thread.question.trim(),
    '',
    '回答请调 handoff_answer：inboxId=' + thread.id + '，answer 写清「改哪个文件、跑什么命令、为什么这么定」。',
    '不知道就直说「不知道」，别猜——对面会拿你的话当事实用。',
  ].join('\n')
}

/** 送回给来生会话的那段话。 */
export function answerDeliveryText(thread: InboxThread): string {
  return [
    '【前世回复 · 收件箱 ' + thread.id + '】',
    String(thread.answer ?? '').trim(),
    '',
    '（这条是 ' + shortId(thread.to) + ' 对你提问的回答：写进交接文档对应小节，并把这条从「缺口」里划掉。）',
  ].join('\n')
}

function newId(now: number): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
  return (uuid ?? String(now) + Math.random().toString(36).slice(2, 8)).replace(/-/g, '').slice(0, 12)
}

export function createInbox(deps: InboxDeps) {
  const now = deps.now ?? (() => Date.now())

  const save = (thread: InboxThread): boolean => {
    ensureDir(deps.dir)
    try {
      writeFileSync(threadPath(deps.dir, thread.id), JSON.stringify(thread, null, 2) + '\n', 'utf8')
      return true
    } catch {
      return false
    }
  }

  return {
    /** 来生提问：落盘 → 送进前世会话。送不到就标 undeliverable，别让它以为问了。 */
    async ask(input: { from: string; to: string; question: string }): Promise<InboxResult> {
      const question = String(input.question ?? '').trim()
      if (question === '') return { ok: false, message: '问题不能是空的：写清你缺什么（改哪个文件 / 当时为什么这么定）。' }
      if (String(input.to ?? '').trim() === '') return { ok: false, message: '不知道该问谁：调用时把前世会话 id 传给 to。' }
      const at = now()
      const thread: InboxThread = {
        id: newId(at),
        from: input.from,
        to: input.to,
        question,
        status: 'open',
        createdAt: at,
        updatedAt: at,
      }
      if (!save(thread)) return { ok: false, message: '问题没落盘（收件箱目录不可写）。直接问用户吧。' }
      const sent = await deps.deliver(thread.to, askDeliveryText(thread)).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      if (!sent.ok) {
        thread.status = 'undeliverable'
        thread.updatedAt = now()
        save(thread)
        deps.log('收件箱：问题送不进前世会话', { id: thread.id, to: thread.to, message: String(sent.message ?? '').slice(0, 120) })
        return {
          ok: false,
          thread,
          message: '前世会话不在线（或这一代宿主不支持发消息），问题已存档但送不到：直接问用户，别等。',
        }
      }
      deps.log('收件箱：问题已送进前世会话', { id: thread.id, to: thread.to })
      return { ok: true, thread }
    },

    /** 前世回答：落盘 → 送回给来生。 */
    async answer(input: { id: string; answer: string }): Promise<InboxResult> {
      const thread = readThread(deps.dir, String(input.id ?? '').trim())
      if (thread === undefined) return { ok: false, message: '没有这条收件箱线程（id 可能不对）：看看提示里那串 id。' }
      const answer = String(input.answer ?? '').trim()
      if (answer === '') return { ok: false, message: '回答不能是空的。' }
      thread.answer = answer
      thread.status = 'answered'
      thread.updatedAt = now()
      if (!save(thread)) return { ok: false, message: '回答没落盘（收件箱目录不可写）。' }
      const sent = await deps.deliver(thread.from, answerDeliveryText(thread)).catch((error: unknown) => ({
        ok: false,
        message: String((error as Error)?.message ?? error),
      }))
      if (!sent.ok) {
        deps.log('收件箱：回答送不回来生会话', { id: thread.id, from: thread.from, message: String(sent.message ?? '').slice(0, 120) })
        return { ok: true, thread, message: '回答已存档，但没送进对面会话（它可能已归档）：告诉用户到这里取。' }
      }
      return { ok: true, thread }
    },

    list: () => listThreads(deps.dir),
    get: (id: string) => readThread(deps.dir, id),
  }
}

export type Inbox = ReturnType<typeof createInbox>
