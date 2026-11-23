/**
 * websearch/webai/service —— 「拿网页版豆包当搜索引擎」的服务本体。
 *
 * 两条纪律（都是"不这么做就现场翻车"的那种）：
 *
 * 1. **一个 profile 只留一个浏览器、请求串行**：网页版没有并发语义，两个请求同时发会互相污染
 *    对话页；同一个 `--user-data-dir` 也开不了两份（第二个进程会直接退出）。
 *    队列深度上限 2，超了直接抛中文错（429）。
 * 2. **空闲自关 + stop 立即关**：浏览器很吃内存，没人用就关；插件停机时必须关
 *    （不然宿主退出了还留一堆 renderer 占端口）。
 *
 * 登录态复用**识图插件那份 profile**：`<DSH_HOME>/storages/dsh-remote-dafeiyu/webvision/doubao`。
 * 用户登一次，识图与搜索都能用；本能力**不提供登录窗**，没登就抛中文错让人去识图插件里登。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveDshHome } from '../../memory/service.js'
import { launchWebAiBrowser, profileName, type CdpClient } from './driver.js'
import {
  DOUBAO_WEB_AI,
  PARTIAL_NOTE,
  anchorGroupsExpression,
  answerBudgetMs,
  answerProbeExpression,
  busyExpression,
  chooseAnswer,
  clearEditor,
  clickElement,
  clipText,
  collectCitations,
  editorEmptyExpression,
  editorReadyExpression,
  initialCompletion,
  isLoggedIn,
  notLoggedInHint,
  pollTrue,
  pressEnter,
  probeLogin,
  stepCompletion,
  typeInto,
  type AnswerProbe,
  type WebAiAnchorGroup,
} from './site.js'
import {
  WebAiError,
  type WebAiAskInput,
  type WebAiAskResult,
  type WebAiCitation,
  type WebAiLog,
  type WebAiSearchResult,
  type WebAiService,
  type WebAiServiceDeps,
} from './types.js'

/**
 * 对外形状与错误类从 types 转出：接线方（`src/websearch/start.ts`）从**这一个文件**取
 * `createWebAiService` 与 `WebAiService` 就够了，不必再记第二个路径。
 */
export type {
  WebAiAskInput,
  WebAiAskResult,
  WebAiCitation,
  WebAiLog,
  WebAiSearchResult,
  WebAiSearchService,
  WebAiService,
  WebAiServiceDeps,
} from './types.js'
export { WebAiError } from './types.js'

/** 等回答的默认预算（豆包答长问题有时要几十秒）。 */
export const DEFAULT_TIMEOUT_MS = 90_000

/** 两次请求之间的最小间隔（礼貌 + 降风控）。 */
const MIN_GAP_MS = 1_500

/** 没人用就关浏览器（省内存，也少一分风控面）。 */
const IDLE_CLOSE_MS = 5 * 60_000

/** 采样间隔：密了白烧 CPU，疏了会漏掉"最后一段已经写完"的时机。 */
const SAMPLE_MS = 600

/** 队列深度上限：网页版只跑得动一个，第二个排队，第三个直接拒绝。 */
const MAX_QUEUE = 2

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 识图插件那份 profile 的根：`<DSH_HOME>/storages/dsh-remote-dafeiyu/webvision`。
 *
 * 与 `vision/web/index.ts` 的 `webProfileDir` **同一个口径**（那里是 `join(dshHome, 'storages',
 * 'dsh-remote-dafeiyu', 'webvision', site)`）。改这里之前先确认识图那边没动——两份必须指到同一处，
 * 否则用户登完识图、搜索还是提示没登录。
 */
export function webvisionRoot(dshHome: string): string {
  return path.join(dshHome, 'storages', 'dsh-remote-dafeiyu', 'webvision')
}

/**
 * 豆包那份 profile 的目录。
 *
 * `profileRoot` 可以是"webvision 根"（默认口径），也可以直接给到豆包的 profile 目录
 * （判据/自部署用）；给到 `…/webvision/doubao` 时不再拼一层。
 */
export function resolveProfileDir(profileRoot?: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = String(profileRoot ?? '').trim()
  if (explicit !== '') {
    return path.basename(explicit) === DOUBAO_WEB_AI.id ? explicit : path.join(explicit, DOUBAO_WEB_AI.id)
  }
  const home = resolveDshHome(env)
  const root = home === '' ? path.join(os.homedir(), '.dsh') : home
  return path.join(webvisionRoot(root), DOUBAO_WEB_AI.id)
}

/**
 * 把一次问答的原始结果收成对外形状（**纯函数**，判据直接钉这里）。
 *
 * `truncated` 与 `partial` 分开：前者是"太长了截掉"，后者是"超时了可能没答完"。
 * 合成一个标记之后就分不清"答案完整但长"和"答案根本没写完"。
 */
export interface BuildSearchResultInput {
  answer: string
  citations?: WebAiCitation[]
  /** 等回答超时了（正文是已经拿到的部分）。 */
  deadlineHit: boolean
  elapsedMs: number
  maxChars?: number
  site?: string
}

export function buildSearchResult(input: BuildSearchResultInput): WebAiSearchResult {
  const clipped = clipText(input.answer, input.maxChars)
  const partial = input.deadlineHit === true
  return {
    answer: clipped.text,
    citations: Array.isArray(input.citations) ? input.citations : [],
    site: typeof input.site === 'string' && input.site !== '' ? input.site : DOUBAO_WEB_AI.label,
    elapsedMs: input.elapsedMs,
    truncated: clipped.truncated,
    partial,
  }
}

interface Runtime {
  client?: CdpClient
  chain: Promise<unknown>
  pending: number
  lastUsed: number
  idleTimer?: NodeJS.Timeout
}

function chineseReason(error: unknown, fallback: string): string {
  const message = String((error as Error)?.message ?? error ?? '').trim()
  if (message === '') return fallback
  if (/[\u4e00-\u9fff]/.test(message)) return message
  return fallback + '：' + message
}

/** 建服务。接线方只用 `search` / `ask` / `status` / `stop`。 */
export function createWebAiService(deps: WebAiServiceDeps = {}): WebAiService {
  const log: WebAiLog = deps.log ?? ((): void => undefined)
  const profileDir = resolveProfileDir(deps.profileRoot)
  const spec = DOUBAO_WEB_AI
  const runtime: Runtime = { chain: Promise.resolve(), pending: 0, lastUsed: 0 }
  let stopped = false

  const clearIdle = (): void => {
    if (runtime.idleTimer !== undefined) {
      clearTimeout(runtime.idleTimer)
      runtime.idleTimer = undefined
    }
  }

  const scheduleIdleClose = (): void => {
    clearIdle()
    const timer = setTimeout(() => {
      void closeBrowser()
    }, IDLE_CLOSE_MS)
    timer.unref?.()
    runtime.idleTimer = timer
  }

  const closeBrowser = async (): Promise<void> => {
    clearIdle()
    const client = runtime.client
    runtime.client = undefined
    if (client) {
      log('关闭网页版搜索浏览器', { site: spec.label, profile: profileName(profileDir) })
      await client.close().catch(() => undefined)
    }
  }

  const ensureBrowser = async (): Promise<CdpClient> => {
    if (runtime.client) {
      runtime.lastUsed = Date.now()
      return runtime.client
    }
    fs.mkdirSync(profileDir, { recursive: true })
    const client = await launchWebAiBrowser({ profileDir, headless: true, log })
    runtime.client = client
    runtime.lastUsed = Date.now()
    return client
  }

  /**
   * 串行执行：网页版一次只能跑一个。
   *
   * 队列深度按 `pending` 算（含正在跑的那一个）。排队的人也会拿到"上一个还没跑完"的位置，
   * 所以上限是 2 而不是 1。
   */
  const runSerial = async <T>(task: () => Promise<T>): Promise<T> => {
    if (runtime.pending >= MAX_QUEUE) {
      throw new WebAiError(spec.label + '还在处理上一个请求（网页版一次只能跑一个），等它答完再试', 429)
    }
    runtime.pending += 1
    const gap = Math.max(0, MIN_GAP_MS - (Date.now() - runtime.lastUsed))
    const run = runtime.chain
      .catch(() => undefined)
      .then(async () => {
        if (stopped) throw new WebAiError('网页版搜索的浏览器已经关掉了（插件在停机）：重启插件后再试', 0)
        if (gap > 0) await wait(gap)
        try {
          return await task()
        } finally {
          runtime.lastUsed = Date.now()
          scheduleIdleClose()
        }
      })
      .finally(() => {
        runtime.pending = Math.max(0, runtime.pending - 1)
      })
    runtime.chain = run.catch(() => undefined)
    return run as Promise<T>
  }

  /**
   * 一次完整问答：进对话页 → 登录校验 → 打字发送 → 采样到答完 → 抽引用 → 截断/超时标注。
   * 任何环节失败都抛 `WebAiError`（带站点名与下一步）。
   */
  const runQuery = async (prompt: string, options: { timeoutMs?: number; maxChars?: number }): Promise<WebAiSearchResult> => {
    const question = String(prompt ?? '').trim()
    if (question === '') throw new WebAiError('网页版' + spec.label + '要一个非空的 query（说一下要查什么）', 0)
    const startedAt = Date.now()

    return runSerial(async () => {
      const client = await ensureBrowser()

      await client.goto(spec.homeUrl)
      const ready = await pollTrue(client, editorReadyExpression(spec), 25_000)
      if (ready !== true) {
        const loggedIn = await isLoggedIn(client, spec)
        if (loggedIn !== true) throw new WebAiError(notLoggedInHint(spec.label), 401)
        throw new WebAiError(
          spec.label + '页面没加载出来（找不到输入框 ' + spec.editorSelector + '）：检查网络，或前端改版后更新选择器',
          0,
        )
      }

      const loggedIn = await isLoggedIn(client, spec)
      if (loggedIn !== true) throw new WebAiError(notLoggedInHint(spec.label), 401)

      // 清空输入框：上一轮没发出去的字不许留到这一轮（否则变成"同一句话打两遍"）
      await clearEditor(client, spec.editorSelector)
      const typed = await typeInto(client, spec.editorSelector, question)
      if (typed !== true) throw new WebAiError(spec.label + '输入框拿不到焦点（前端可能改版了）', 0)

      const emptyProbe = editorEmptyExpression(spec.editorSelector)
      let sent = false
      if (spec.sendSelector !== undefined && spec.sendSelector !== '') {
        sent = await clickElement(client, spec.sendSelector).catch(() => false)
        if (sent) sent = await pollTrue(client, emptyProbe, 4_000)
      }
      if (!sent) {
        await pressEnter(client)
        sent = await pollTrue(client, emptyProbe, 4_000)
      }
      if (!sent) {
        throw new WebAiError(spec.label + '消息没发出去（输入框里还留着字）：前端可能改版，或这颗账号被限制了', 0)
      }

      // 等回答：连续采样不变 + 没有忙标记 + 有超时上限
      const budget = answerBudgetMs(options.timeoutMs)
      const answerDeadline = Date.now() + budget
      let state = initialCompletion(Date.now())
      let lastHtml = ''
      let deadlineHit = false
      for (;;) {
        await wait(SAMPLE_MS)
        const probes = await client.evaluate<AnswerProbe[]>(answerProbeExpression(spec)).catch(() => [] as AnswerProbe[])
        const busy = await client.evaluate<boolean>(busyExpression(spec)).catch(() => false)
        const pick = chooseAnswer(Array.isArray(probes) ? probes : [], question)
        if (pick.html !== '') lastHtml = pick.html
        const now = Date.now()
        const step = stepCompletion(state, { text: pick.text, busy: busy === true }, now)
        state = step.state
        if (step.done) break
        if (now >= answerDeadline) {
          deadlineHit = true
          break
        }
      }

      const answer = state.text.trim()
      if (answer === '') {
        const shot = path.join(os.tmpdir(), 'dafeiyu-webai-' + Date.now() + '.png')
        await client.screenshot(shot)
        throw new WebAiError(
          spec.label + '没有返回可读的回答（等了 ' + Math.round((Date.now() - startedAt) / 1000) + ' 秒）：' +
            '可能没登录、被风控，或前端改版了。截图：' + shot,
          0,
        )
      }

      // 引用：先按选择器捞，再退回回答 HTML；抽不到就是空数组（不编链接）
      let groups: WebAiAnchorGroup[] = []
      try {
        const rawGroups = await client.evaluate<WebAiAnchorGroup[]>(anchorGroupsExpression(spec))
        if (Array.isArray(rawGroups)) groups = rawGroups
      } catch {
        groups = []
      }
      const citations = collectCitations({ groups, answerHtml: lastHtml }, spec)

      if (deadlineHit) log('网页版搜索超时，返回已拿到的部分（' + PARTIAL_NOTE + '）', { chars: answer.length })
      log('网页版搜索完成', {
        site: spec.label,
        chars: answer.length,
        citations: citations.length,
        elapsedMs: Date.now() - startedAt,
        partial: deadlineHit,
      })

      return buildSearchResult({
        answer,
        citations,
        deadlineHit,
        elapsedMs: Date.now() - startedAt,
        maxChars: options.maxChars,
        site: spec.label,
      })
    })
  }

  return {
    search(query, options) {
      return runQuery(query, options ?? {})
    },

    async ask(input: WebAiAskInput): Promise<WebAiAskResult> {
      const result = await runQuery(String(input?.prompt ?? ''), {
        timeoutMs: input?.timeoutMs,
        maxChars: input?.maxChars,
      })
      return {
        text: result.answer,
        site: result.site,
        elapsedMs: result.elapsedMs,
        truncated: result.truncated,
        partial: result.partial,
      }
    },

    /**
     * 登录态探测：只读，起一次无头浏览器判完就关。
     *
     * 有共享实例就复用（不关，那是别人正在用的）；否则自己起一个、判完关掉。
     * 探测期间占着队列，避免和正在跑的问答抢同一个页面。
     */
    async status() {
      if (runtime.pending >= MAX_QUEUE) {
        return { loggedIn: false, profileDir, reason: spec.label + '还在回答上一个问题，等它跑完再探登录态' }
      }
      const shared = runtime.client
      try {
        return await runSerial(async () => {
          const client = shared !== undefined ? shared : await ensureBrowser()
          const probe = await probeLogin(client, spec)
          if (probe.loggedIn === true) return { loggedIn: true, profileDir }
          return { loggedIn: false, profileDir, reason: notLoggedInHint(spec.label) }
        })
      } catch (error) {
        return { loggedIn: false, profileDir, reason: chineseReason(error, '探' + spec.label + '登录态没成') }
      } finally {
        if (shared === undefined) await closeBrowser().catch(() => undefined)
      }
    },

    stop(): void {
      stopped = true
      clearIdle()
      const client = runtime.client
      runtime.client = undefined
      if (client) void client.close().catch(() => undefined)
    },
  }
}
