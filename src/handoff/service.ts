/**
 * handoff/service —— 「一键转生 / 一键分身」的作业管理。
 *
 * 一次作业的四步（每一步失败都要说清卡在哪，不许静默）：
 *   ① 注入写作指令 → ② 等交接文档落盘（轮询文件，最长 180s）
 *   → ③ 新建会话（工作目录 = 当前会话的目录） → ④ 发第一句「读文档 → 报到 → 停」
 *
 * 为什么不订阅事件流等标记：插件侧要为此接一条内核事件管道，而"文件出现且带标记"
 * 本身就是最强的完成信号——模型说写完了但没写，文件就是不存在。少一层耦合，少一处会坏的地方。
 *
 * 为什么交接没成功就**绝不**建新会话：多出一条空会话比一次失败更难解释，
 * 而且用户会以为转生成功了、在新会话里接着聊，结果对面什么都没拿到。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  HANDOFF_MARKER,
  buildFirstPrompt,
  buildFixInstruction,
  buildInjection,
  handoffFileName,
  type HandoffKind,
  type HandoffPlan,
} from './prompt.js'
import { checkHandoffDoc } from './doc-check.js'
import { listThreads } from './inbox.js'

/**
 * 交接文档结构不合格时，最多"打回补写"几轮（2026-11-17）。
 *
 * 为什么是 2：一轮通常就能补掉漏的小节与含糊话；第二轮是给"上一轮没看懂"留的余量。
 * 再往上堆只会把 180 秒的等待烧光，用户看到的反而是一次超时失败。
 */
const MAX_FIX_ROUNDS = 2

export type HandoffStatus = 'waiting' | 'creating' | 'done' | 'failed'

export interface HandoffJob {
  id: string
  kind: HandoffKind
  sessionId: string
  filePath: string
  status: HandoffStatus
  message?: string
  newSessionId?: string
  newSessionCwd?: string
  createdAt: number
  updatedAt: number
}

export interface HandoffDeps {
  /** 交接文档目录（默认由 start 决定）。 */
  handoffDir: string
  /** `~/.dsh`：算会话日志体积用。 */
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  now?: () => number
  /** 往当前会话投递写作指令（空闲会话靠 sendPrompt 唤醒，跑着的会话走 inject）。 */
  inject: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string }
  /** 新建会话（工作目录显式给，否则内核会落到 `/`，GUI 列表里看不见）。 */
  newSession: (args: { workspace?: string }) => Promise<{ ok: boolean; sessionId?: string; message?: string }>
  /** 往新会话发第一句。 */
  sendPrompt: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
  /** 当前会话的工作目录（转生要用它做新会话的 cwd）。 */
  sessionCwd: (sessionId: string) => Promise<string | undefined>
  /** 读会话标题（转世重命名要用：<前世名>转世<N>）。 */
  sessionTitle?: (sessionId: string) => Promise<string | undefined> | string | undefined
  /** 改会话标题。 */
  renameSession?: (sessionId: string, title: string) => Promise<{ ok: boolean; message?: string }>
  /**
   * 群交接（2026-11-20 方案 S1/S4/S5/S6/S7）。**可选**：没有群就没这回事。
   *
   * 全部由插件代发/代调：此刻"前世"可能已经没有工具（这一世代到点后 shell 会被收走），
   * 不能指望它自己去群里说话、拉人、改名片。
   */
  groupHandover?: {
    /** 这个会话在哪个群、什么身份；不在群里返回 undefined。 */
    locate: (sessionId: string) =>
      | {
          groupId: string
          groupName: string
          isOwner: boolean
          role?: string
          /** 这条群广播该发给谁：群主发全员，普通成员发群主。 */
          recipients: string[]
        }
      | undefined
    /** 以该会话的身份往群里发一条（raw，不套普通投递头）。 */
    post: (groupId: string, sessionId: string, text: string, to?: string[]) => Promise<{ ok: boolean; message?: string }>
    /** 把新会话拉进群。 */
    invite: (groupId: string, sessionIds: string[]) => Promise<{ ok: boolean; message?: string }>
    /** 把成员身份设成 role。 */
    setRole: (groupId: string, sessionId: string, role: string) => void
    /** 转移群主。 */
    setOwner: (groupId: string, sessionId: string) => void
    /** 把成员移出群。 */
    remove: (groupId: string, sessionId: string) => void

  }
  /** 缺口问答「安静多久算补齐」（默认 60s）。 */
  gapQuietMs?: number
  /** 转世一直没提问，等多久就放行（默认 90s）。 */
  gapGraceMs?: number
  /** 缺口等待硬上限（默认 5 分钟）：到点放行并把剩余未答写进 job.message。 */
  gapMaxMs?: number
  /** 等待交接文档落盘的轮询间隔（毫秒）。 */
  pollMs?: number
  /** 等待上限（毫秒）。 */
  timeoutMs?: number
}

export interface SelfCheck {
  ok: true
  handoffDir: string
  handoffDirReady: boolean
  sessionId: string
  cwd?: string
  logBytes: number
  /** 超过这个体积就认为"确实该转生了"（只是提示，不阻止）。 */
  overloadBytes: number
  overloaded: boolean
  memoryEntries: number
}

/** 日志体积超过它就提醒"这条会话确实该转了"。15MB 是交接文档里"超大会话"那条经验的量级。 */
export const OVERLOAD_BYTES = 15 * 1024 * 1024
const MAX_JOBS = 20

function idOf(prefix: string): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
  return uuid ?? `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** 把 `~/.dsh/sessions/<slug>/<dir>` 里的日志字节数加起来。找不到就 0（自检显示，不影响业务）。 */
export function sessionLogBytes(sessionsRoot: string, sessionId: string): number {
  const bare = sessionId.replace(/^session-/, '')
  let total = 0
  let slugs: string[]
  try {
    slugs = readdirSync(sessionsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  } catch {
    return 0
  }
  for (const slug of slugs) {
    for (const candidate of [sessionId, bare, `session-${bare}`]) {
      const dir = path.join(sessionsRoot, slug, candidate)
      if (!existsSync(dir)) continue
      try {
        for (const file of readdirSync(dir)) {
          if (!file.includes('.jsonl.')) continue
          total += statSync(path.join(dir, file)).size
        }
      } catch {
        /* 读不到就当 0，自检不是业务 */
      }
    }
  }
  return total
}

/** 记忆库条目数：数 JSON 里的条目，不猜（自检用，不参与任何判定）。 */
export function memoryEntryCount(memoryDir: string): number {
  try {
    let total = 0
    for (const file of readdirSync(memoryDir)) {
      if (!file.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(readFileSync(path.join(memoryDir, file), 'utf8')) as { entries?: unknown }
        if (Array.isArray(parsed.entries)) total += parsed.entries.length
      } catch {
        /* 单个文件坏了不影响别的 */
      }
    }
    return total
  } catch {
    return 0
  }
}

export interface HandoffService {
  start(kind: HandoffKind, sessionId: string, note?: string, boundary?: string, content?: string): Promise<{ ok: boolean; jobId?: string; message?: string }>
  status(jobId: string): HandoffJob | undefined
  list(): HandoffJob[]
  selfCheck(sessionId: string, cwd?: string): SelfCheck
  /** 停机：停掉所有等待中的计时器（等待中的作业直接判失败）。 */
  stop(): void
}

export function createHandoffService(deps: HandoffDeps): HandoffService {
  const now = deps.now ?? (() => Date.now())
  const pollMs = deps.pollMs ?? 1_000
  const timeoutMs = deps.timeoutMs ?? 180_000
  const jobs = new Map<string, HandoffJob>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let stopped = false

  const touch = (job: HandoffJob, patch: Partial<HandoffJob>): HandoffJob => {
    Object.assign(job, patch)
    job.updatedAt = now()
    return job
  }

  const prune = (): void => {
    if (jobs.size <= MAX_JOBS) return
    const sorted = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)
    for (const victim of sorted.slice(0, jobs.size - MAX_JOBS)) jobs.delete(victim.id)
  }

  /** 交接文档落盘且带标记 = 写作完成。返回 'ok' | 'pending' | 'empty'。 */
  /**
   * 「<前世名>转世<N>」的序号（2026-11-20 方案，用户拍板：**按 base 累加**）。
   *
   * 计数器落在 handoffDir/rebirth-gen.json：同 base 已经转过几代就 +1。
   * 前世本身已叫 `…转世K` 时先剥掉后缀再算，避免出现 `转世1转世1`。
   */
  const nextRebirthGen = (base: string): number => {
    const file = path.join(deps.handoffDir, 'rebirth-gen.json')
    let map: Record<string, number> = {}
    try {
      map = JSON.parse(readFileSync(file, 'utf8')) as Record<string, number>
    } catch {
      map = {}
    }
    const value = Number(map[base] ?? 0) + 1
    map[base] = value
    try {
      writeFileSync(file, JSON.stringify(map, null, 2) + '\n', 'utf8')
    } catch {
      /* 写不进去就用算出来的数，下次会重新从 1 开始——不会因此卡住转生 */
    }
    return value
  }

  const probeFile = (filePath: string): 'ok' | 'pending' | 'empty' => {
    try {
      if (!existsSync(filePath)) return 'pending'
      const raw = readFileSync(filePath, 'utf8')
      if (raw.trim() === '') return 'empty'
      return raw.includes(HANDOFF_MARKER) || raw.length > 400 ? 'ok' : 'pending'
    } catch {
      return 'pending'
    }
  }

  const finish = (jobId: string, status: HandoffStatus, message?: string): void => {
    const job = jobs.get(jobId)
    if (!job) return
    touch(job, { status, message })
    deps.log('转生/分身作业结束', { jobId, status, message: message?.slice(0, 120) })
  }



  /**
   * S3 · 等「前世 ↔ 转世」把缺口补齐，再往下走（2026-11-20 用户裁决）。
   *
   * 机制本来就存在：来生用 handoff_ask 提问、前世用 handoff_answer 回答，线程落在
   * `<handoffDir>/inbox/*.json`。这里只是**加一道闸**：等该答的都答完、且安静一段时间，
   * 才允许改名/拉群——否则群里会出现「A 刚接手、文档还缺一半」的尴尬。
   *
   * 三条出路，任何一条到点都放行（绝不无限等）：
   *   · 提了问题、全都答完、之后安静 quietMs → 放行；
   *   · 一直没提问、过了 graceMs → 放行（转世认为没缺口）；
   *   · 超过 maxMs → 放行，把「还有几个没答」写进 job.message。
   */
  const waitGapsCleared = async (childId: string): Promise<string | undefined> => {
    const inboxDir = path.join(deps.handoffDir, 'inbox')
    const quietMs = deps.gapQuietMs ?? 60_000
    const graceMs = deps.gapGraceMs ?? 90_000
    const maxMs = deps.gapMaxMs ?? 480_000
    const pollMs = deps.pollMs ?? 1_000
    const startedAt = now()
    let lastActivity = 0
    let answered = 0
    for (;;) {
      const threads = listThreads(inboxDir).filter((thread) => thread.from === childId)
      const open = threads.filter((thread) => thread.status === 'open').length
      answered = threads.filter((thread) => thread.status === 'answered').length
      if (threads.length > 0) lastActivity = Math.max(...threads.map((thread) => thread.updatedAt))
      const elapsed = now() - startedAt
      if (open === 0 && threads.length > 0 && now() - lastActivity >= quietMs) return undefined
      if (threads.length === 0 && elapsed >= graceMs) return '转世没提缺口（等了 ' + Math.round(graceMs / 1000) + ' 秒）'
      if (elapsed >= maxMs) {
        /*
         * 到上限时的措辞必须分清两种现实（2026-11-20 真机踩到）：
         * 全答完了、只是没等满安静窗口，和「还有问题没人答」是两回事。
         * 上一版一律说「没补完」，于是 job.message 出现「0 个问题没答」这种自相矛盾的话。
         */
        if (open === 0) {
          return '缺口问答已答完（' + String(answered) + ' 个），但没等满安静窗口就放行了'
        }
        return '缺口没补完就放行了（' + String(open) + ' 个问题没答，已答 ' + String(answered) + ' 个）'
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, pollMs)
        try {
          ;(timer as { unref?: () => void }).unref?.()
        } catch {
          /* 环境没有 unref 就算了 */
        }
      })
    }
  }
  /**
   * S4~S7 · 群交接（2026-11-20 方案，用户已拍板）：
   * 重命名 → 拉群 → 复制身份（群主则转移）→ 群广播「后续由谁接手」→ 前世退群。
   *
   * 顺序不能换：先改名再拉人，群成员表里一进来就是最终名字；先广播再退群，否则前世已经不在群里、发不出去。
   */
  const handoverGroup = async (job: HandoffJob, childId: string): Promise<string | undefined> => {
    const h = deps.groupHandover
    if (h === undefined) return undefined
    let spot: ReturnType<NonNullable<typeof h.locate>>
    try {
      spot = h.locate(job.sessionId)
    } catch {
      return undefined
    }
    if (spot === undefined) return undefined
    const notes: string[] = []

    // S3 先等缺口补齐（三条出路都不会无限等），再改名/拉群
    try {
      touch(job, { message: '等待「前世↔转世」把文档缺口补齐…' })
      const gapNote = await waitGapsCleared(childId)
      if (gapNote !== undefined) notes.push(gapNote)
    } catch (error) {
      notes.push('等缺口时抛错：' + String((error as Error)?.message ?? error).slice(0, 80))
    }

    // S4 重命名：<前世名>转世<N>
    let title: string | undefined
    try {
      const parentTitle = String((await deps.sessionTitle?.(job.sessionId)) ?? '').trim()
      const rename = deps.renameSession
      if (parentTitle !== '' && rename !== undefined) {
        const base = parentTitle.replace(/\s*转世\d+$/, '').trim()
        const next = base + '转世' + String(nextRebirthGen(base))
        const renamed = await rename(childId, next)
        if (renamed.ok) title = next
        else notes.push('改名失败：' + String(renamed.message ?? '未知原因'))
      }
    } catch (error) {
      notes.push('改名抛错：' + String((error as Error)?.message ?? error).slice(0, 80))
    }

    // S5 拉群 + 身份 + 群主转移
    let invitedOk = false
    try {
      const invited = await h.invite(spot.groupId, [childId])
      invitedOk = invited.ok
      if (!invited.ok) notes.push('拉群失败：' + String(invited.message ?? '未知原因'))
      else {
        if (typeof spot.role === 'string' && spot.role.trim() !== '') h.setRole(spot.groupId, childId, spot.role.trim())
        if (spot.isOwner) h.setOwner(spot.groupId, childId)
      }
    } catch (error) {
      notes.push('拉群抛错：' + String((error as Error)?.message ?? error).slice(0, 80))
    }
    /*
     * 没拉进来就别宣布交接完成、也别退群：
     * 群满 12 人时 invite 会 ok:false 但**前世还在群里**——这时先把原因说清楚，
     * 用户手动腾个位置再拉；要是这时把前世退了，群里就成了「没人接手」的空档。
     */
    if (!invitedOk) {
      try {
        await h.post(
          spot.groupId,
          job.sessionId,
          '【交接未完成 · ' + spot.groupName + '】\n转世已经建好了，但**没能把 TA 拉进群**（' +
            String(notes.find((note) => note.startsWith('拉群')) ?? '原因未知') +
            '）。\n我先留在群里继续顶，请腾出一个位置后再拉一次：' +
            (title ?? childId) + '（' + childId.replace(/^session-/, '').slice(0, 8) + '）。',
          spot.recipients,
        )
      } catch {
        /* 说不上话也不影响上面的 notes 被带进 job.message */
      }
      return notes.join('；')
    }

    // S6 群广播（发完再退群）
    const childLabel = (title ?? childId) + '（' + childId.replace(/^session-/, '').slice(0, 8) + '）'
    const done = spot.isOwner
      ? '【交接完成 · ' + spot.groupName + '】\n已完成转世交接 → 后续我的工作由 ' + childLabel + ' 接手，群主已一并转给他。'
      : '【交接完成 · ' + spot.groupName + '】\n已完成转世交接 → 后续我的工作由 ' + childLabel + ' 接手。'
    try {
      const posted = await h.post(spot.groupId, job.sessionId, done, spot.recipients)
      if (!posted.ok) notes.push('群广播失败：' + String(posted.message ?? '未知原因'))
    } catch (error) {
      notes.push('群广播抛错：' + String((error as Error)?.message ?? error).slice(0, 80))
    }

    // S7 前世退群（用户拍板：同一角色不留两个 agent）
    try {
      h.remove(spot.groupId, job.sessionId)
    } catch (error) {
      notes.push('退群失败：' + String((error as Error)?.message ?? error).slice(0, 80))
    }

    return notes.length === 0 ? undefined : notes.join('；')
  }
  /** ③④：交接文档到手 → 建会话 → 发第一句。 */
  const spawnHeir = async (job: HandoffJob, plan: HandoffPlan): Promise<void> => {
    touch(job, { status: 'creating' })
    let cwd: string | undefined
    try {
      cwd = await deps.sessionCwd(job.sessionId)
    } catch {
      cwd = undefined
    }
    let created: { ok: boolean; sessionId?: string; message?: string }
    try {
      created = await deps.newSession(cwd ? { workspace: cwd } : {})
    } catch (error) {
      finish(job.id, 'failed', `新建会话抛错：${String((error as Error)?.message ?? error).slice(0, 120)}`)
      return
    }
    if (!created.ok || !created.sessionId) {
      finish(job.id, 'failed', created.message ?? '新建会话失败')
      return
    }
    touch(job, { newSessionId: created.sessionId, ...(cwd ? { newSessionCwd: cwd } : {}) })
    /*
     * 记一条"来生 → 前世"的谱系（2026-11-17）。收件箱靠它找"该问谁"：
     * 来生手里没有前世会话 id，也不该让它自己猜。
     */
    try {
      const lineagePath = path.join(path.dirname(job.filePath), 'lineage.json')
      let lineage: Record<string, string> = {}
      try {
        lineage = JSON.parse(readFileSync(lineagePath, 'utf8')) as Record<string, string>
      } catch {
        lineage = {}
      }
      lineage[created.sessionId] = job.sessionId
      writeFileSync(lineagePath, JSON.stringify(lineage, null, 2) + '\n', 'utf8')
    } catch {
      /* 谱系写不进去：收件箱还能靠显式 to 参数工作，不拦流程 */
    }
    // 首句失败也不回滚会话：会话在那儿，用户点进去手动发一句也能接上，
    // 但要把原因写进 status，不能让面板显示成"一切正常"。
    try {
      const sent = await deps.sendPrompt(created.sessionId, buildFirstPrompt(plan))
      if (!sent.ok) {
        finish(job.id, 'failed', `新会话已建好（${created.sessionId}），但首句没发出去：${sent.message ?? '未知原因'}`)
        return
      }
    } catch (error) {
      finish(job.id, 'failed', `新会话已建好（${created.sessionId}），首句抛错：${String((error as Error)?.message ?? error).slice(0, 120)}`)
      return
    }
    // S4~S7：群交接（不在群里就什么都不做）
    let handoverNote: string | undefined
    try {
      handoverNote = await handoverGroup(job, created.sessionId)
    } catch (error) {
      handoverNote = '群交接抛错：' + String((error as Error)?.message ?? error).slice(0, 100)
    }
    finish(
      job.id,
      'done',
      handoverNote === undefined ? '交接完成，新会话已报到（等你点头）' : '交接完成，但群交接有遗留：' + handoverNote,
    )
  }

  const watch = (job: HandoffJob, plan: HandoffPlan): void => {
    const startedAt = now()
    let emptyHits = 0
    /**
     * 上一轮检查过的原文（用来分辨"内容又变了"）与已打回轮数。
     *
     * 结构判据（doc-check）不通过时把问题清单再注入一次，让**前世自己**补；
     * 补完内容变了才重新判，避免同一份文件被反复判、反复发消息。
     */
    let lastChecked = ''
    let fixRounds = 0
    /** 已经打过补写指令、还在等文件变化：这时**不许**拿同一份内容继续走流程。 */
    let awaitingFix = false
    const tick = (): void => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (stopped) return
        const state = probeFile(job.filePath)
        if (state === 'ok') {
          let text = ''
          try {
            text = readFileSync(job.filePath, 'utf8')
          } catch {
            text = ''
          }
          if (awaitingFix && text === lastChecked) {
            // 补写指令发出去了，文件还没变：继续等，别拿旧内容建会话
            tick()
            return
          }
          if (text !== '' && text !== lastChecked) {
            lastChecked = text
            awaitingFix = false
            const verdict = checkHandoffDoc(text, plan.kind)
            if (!verdict.ok) {
              if (fixRounds < MAX_FIX_ROUNDS) {
                fixRounds += 1
                touch(job, {
                  message: `交接文档有 ${verdict.problems.length} 处不合格，已要求补写（第 ${fixRounds}/${MAX_FIX_ROUNDS} 轮）`,
                })
                deps.log('交接文档结构不合格，打回补写', {
                  jobId: job.id,
                  round: fixRounds,
                  problems: verdict.problems.length,
                })
                awaitingFix = true
                void deps.inject(job.sessionId, buildFixInstruction(plan, verdict.problems, fixRounds))
                tick()
                return
              }
              // 补到上限还是不合格：**不要再拖**。把问题带进首句，让来生知道哪里得自己补。
              plan.knownGaps = verdict.problems.slice(0, 6)
              touch(job, {
                message: `交接文档仍有 ${verdict.problems.length} 处不合格，已带进首句交给来生自查`,
              })
              deps.log('交接文档补到上限仍不合格，带缺口建新会话', {
                jobId: job.id,
                problems: verdict.problems.length,
              })
            }
          }
          void spawnHeir(job, plan)
          return
        }
        if (state === 'empty') {
          // 空文件可能是正在写：连续两次都是空才当失败，避免和写入抢跑。
          emptyHits += 1
          if (emptyHits >= 3) {
            finish(job.id, 'failed', '交接文档是空的（模型没写内容）')
            return
          }
        }
        if (now() - startedAt > timeoutMs) {
          /*
           * 超时兜底（2026-11-20 真机）：以前这里直接判 failed，于是"前世没有写盘工具"
           * 就变成"整条转生链断掉、什么也没留下"。现在照样建新会话，把缺口写进首句——
           * 宁可来生多查一步，也别让用户点了转生却什么也没发生。
           */
          plan.knownGaps = [
            ...(plan.knownGaps ?? []),
            '交接文档缺失（' + job.filePath + '）：等了 ' + Math.round(timeoutMs / 1000) +
              ' 秒没等到，可能前世没有文件写入工具。请先用 read_memory / git / 磁盘现场自行复原，别假设文档里的结论成立。',
          ]
          touch(job, { message: '等不到交接文档，已按兜底建新会话（缺口写进首句）' })
          deps.log('交接文档超时，兜底建新会话', { jobId: job.id, sessionId: job.sessionId })
          void spawnHeir(job, plan)
          return
        }
        tick()
      }, pollMs)
      timers.add(timer)
      if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
        ;(timer as { unref?: () => void }).unref?.()
      }
    }
    tick()
  }

  return {
    async start(kind, sessionId, note, boundary, content) {
      if (stopped) return { ok: false, message: '插件正在停机' }
      const id = String(sessionId ?? '').trim()
      if (id === '') return { ok: false, message: '缺少 sessionId' }
      const trimmedNote = String(note ?? '').trim()
      if (kind === 'branch' && trimmedNote === '') {
        return { ok: false, message: '分身必须写清楚分支任务（不然它不知道去干什么）' }
      }
      try {
        mkdirSync(deps.handoffDir, { recursive: true })
      } catch {
        /* 目录建不出来后面写文件会失败，这里的失败由文件探测兜住 */
      }
      const at = new Date(now())
      // 文件名带毫秒尾数：同一秒里连点两次也不会互相覆盖（同一秒同名会让"等文件"永远等不到）。
      const filePath = path.join(deps.handoffDir, handoffFileName(kind, id, at).replace(/\.md$/, `-${at.getMilliseconds()}.md`))
      const plan: HandoffPlan = {
        kind,
        filePath,
        parentSessionId: id,
        ...(trimmedNote ? { note: trimmedNote } : {}),
        ...(String(boundary ?? '').trim() ? { boundary: String(boundary ?? '').trim() } : {}),
      }
      /*
       * 交接文档由**插件自己**落盘（2026-11-20）：前世可能没有文件工具（这一世代到点后
       * shell/文件工具会被平台收走），那就永远等不到文档、整条转生链断在最后一步。
       * 给了 content 就跳过"让前世写文档"，直接进建会话那一步。
       */
      /*
       * S1 · 转生预告（2026-11-20 方案）：在群里的话先说一声，不然群友只会看到「这个人突然不回话了」。
       * 由插件代发——前世此刻可能已经没有工具。**必须早于下面那条 direct 早返回**，
       * 否则「插件代写文档」这条路（前世没工具）群里就一条预告也看不到。
       */
      const spot = deps.groupHandover?.locate(id)
      if (spot !== undefined && deps.groupHandover !== undefined) {
        const announce = spot.isOwner
          ? '【转生预告 · ' + spot.groupName + '】\n我要转生了（上下文超载）：先写交接文档，转世起来后我会把群主和身份一并交给他。\n交接完成前这条群照常运作，分工照旧由我下。'
          : '【转生预告 · ' + spot.groupName + '】\n我的上下文已超载 → 将转生交接给下一世 → 稍后将我的转世拉进群。\n交接期间我的群消息可能迟缓，急事请直接 @ 我。'
        void deps.groupHandover.post(spot.groupId, id, announce, spot.recipients).catch(() => ({ ok: false }))
      }

      const direct = String(content ?? '').trim()
      if (direct !== '') {
        try {
          writeFileSync(filePath, direct.endsWith('\n') ? direct : direct + '\n', 'utf8')
        } catch (error) {
          return { ok: false, message: '写交接文档失败：' + String((error as Error)?.message ?? error).slice(0, 120) }
        }
        const directJob: HandoffJob = {
          id: idOf('handoff'),
          kind,
          sessionId: id,
          filePath,
          status: 'creating',
          createdAt: now(),
          updatedAt: now(),
        }
        jobs.set(directJob.id, directJob)
        prune()
        deps.log('转生/分身：文档由插件落盘，直接建新会话', { jobId: directJob.id, kind, sessionId: id })
        void spawnHeir(directJob, plan)
        return { ok: true, jobId: directJob.id }
      }
      const injected = await deps.inject(id, buildInjection(plan))
      if (!injected.ok) return { ok: false, message: injected.message ?? '投递写作指令失败（会话可能不在线）' }
      const job: HandoffJob = {
        id: idOf('handoff'),
        kind,
        sessionId: id,
        filePath,
        status: 'waiting',
        createdAt: now(),
        updatedAt: now(),
      }
      jobs.set(job.id, job)
      prune()
      deps.log('转生/分身作业开始', { jobId: job.id, kind, sessionId: id })
      watch(job, plan)
      return { ok: true, jobId: job.id }
    },

    status(jobId) {
      return jobs.get(String(jobId ?? ''))
    },

    list() {
      return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt)
    },

    selfCheck(sessionId, cwd) {
      const logBytes = sessionLogBytes(path.join(deps.dshHome, 'sessions'), sessionId)
      // 与 memory/service.ts 的 memoryDir() 同一个位置（storages/dsh-remote-dafeiyu/memory/*.json）。
      const memoryDir = path.join(deps.dshHome, 'storages', 'dsh-remote-dafeiyu', 'memory')
      let ready = false
      try {
        mkdirSync(deps.handoffDir, { recursive: true })
        ready = statSync(deps.handoffDir).isDirectory()
      } catch {
        ready = false
      }
      return {
        ok: true,
        handoffDir: deps.handoffDir,
        handoffDirReady: ready,
        sessionId,
        ...(cwd ? { cwd } : {}),
        logBytes,
        overloadBytes: OVERLOAD_BYTES,
        overloaded: logBytes >= OVERLOAD_BYTES,
        memoryEntries: memoryEntryCount(memoryDir),
      }
    },

    stop() {
      stopped = true
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      for (const job of jobs.values()) {
        if (job.status === 'waiting' || job.status === 'creating') touch(job, { status: 'failed', message: '插件停机，作业中断' })
      }
    },
  }
}
