/**
 * xyq/service — 小云雀能力的宿主侧实现：配置、鉴权探测、生成、轮询、预算。
 *
 * 所有命令都通过官方 CLI（`pippit-tool-cli`）执行；本文件**不拼 HTTP**，
 * 这样鉴权/上传/字段映射的改动只需升级 CLI，插件代码不动。
 *
 * 返回约定：`{ ok: true, ... }` 或 `{ ok: false, message }`——message 是**给人看的中文**，
 * 工具层直接把它回给模型/用户，不吞错误。
 */
import type { CliRunner, CliRunResult } from './cli.js'
import { readXyqConfig, viewXyqConfig, writeXyqConfig, type XyqConfig } from './config.js'

export interface XyqServiceDeps {
  configFile: string
  run: CliRunner
  resolveCli: () => Promise<string | undefined>
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  sleep?: (ms: number) => Promise<void>
  pollIntervalMs?: number
  videoTimeoutMs?: number
  imageTimeoutMs?: number
  now?: () => number
}

export interface XyqGenerateResult {
  ok: boolean
  message?: string
  threadId?: string
  runId?: string
  files?: string[]
  webLink?: string
  creditsUsed?: number
}

type Json = Record<string, unknown>

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    /* 有些命令会混着打印提示行：取最后一行 JSON */
    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim() !== '')
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      try {
        return JSON.parse(lines[i]!)
      } catch {
        /* 继续 */
      }
    }
    return undefined
  }
}

/** CLI 的鉴权失败 → 一句用户能照做的中文。 */
function authMessage(text: string): string | undefined {
  if (/登录凭证|XYQ_ACCESS_KEY|未授权|unauthorized|401|403/i.test(text)) {
    return '小云雀 Access Key 已过期或无效。请到小云雀官网 → ⚡CLI/API → API → 管理 Access Key 更新后，在「大肥鱼 → 小云雀」里重新填写。'
  }
  return undefined
}

interface SessionBudget {
  images: number
  videos: number
}

export function createXyqService(deps: XyqServiceDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const pollInterval = deps.pollIntervalMs ?? 5_000
  const videoTimeout = deps.videoTimeoutMs ?? 15 * 60_000
  const imageTimeout = deps.imageTimeoutMs ?? 6 * 60_000
  const budgets = new Map<string, SessionBudget>()

  const readConfig = (): XyqConfig => readXyqConfig(deps.configFile)

  function budgetOf(sessionKey: string): SessionBudget {
    const current = budgets.get(sessionKey)
    if (current) return current
    const fresh: SessionBudget = { images: 0, videos: 0 }
    budgets.set(sessionKey, fresh)
    return fresh
  }

  async function call(args: string[], timeoutMs: number): Promise<{ result: CliRunResult; json?: Json; message?: string }> {
    const config = readConfig()
    if (!config.enabled) return { result: { code: -1, stdout: '', stderr: '', timedOut: false }, message: '小云雀能力已关闭（设置页 → 大肥鱼 → 小云雀）' }
    if (config.accessKey === '') {
      return {
        result: { code: -1, stdout: '', stderr: '', timedOut: false },
        message: '还没填小云雀 Access Key。请到小云雀官网 → ⚡CLI/API → API → 管理 Access Key 新建，然后填到「大肥鱼 → 小云雀」里。',
      }
    }
    const cli = await deps.resolveCli()
    if (cli === undefined) {
      return {
        result: { code: -1, stdout: '', stderr: '', timedOut: false },
        message: '没找到 pippit-tool-cli，自动安装也失败了。请先在终端运行 `npx @pippit-dev/cli@latest install`，再重试。',
      }
    }
    const result = await deps.run([cli, ...args], { env: { XYQ_ACCESS_KEY: config.accessKey }, timeoutMs })
    const combined = `${result.stdout}\n${result.stderr}`
    const auth = authMessage(combined)
    if (auth !== undefined) return { result, message: auth }
    const modelMissing = combined.match(/未找到可用模型[^\n]*/)
    if (modelMissing) return { result, message: modelMissing[0].trim() }
    const json = parseJson(result.stdout) as Json | undefined
    if (result.timedOut) return { result, message: `小云雀命令超时（${Math.round(timeoutMs / 1000)} 秒）` }
    if (json === undefined) {
      const reason = result.stderr.trim() !== '' ? result.stderr.trim() : result.stdout.trim()
      return { result, message: reason !== '' ? `小云雀返回了无法解析的内容：${reason.slice(0, 200)}` : '小云雀没有返回内容' }
    }
    return { result, json }
  }

  async function poll(threadId: string, runId: string, outDir: string, timeoutMs: number): Promise<{ ok: boolean; files: string[]; status?: string; message?: string }> {
    const started = (deps.now ?? Date.now)()
    for (;;) {
      const answered = await call(
        ['query-result', '--thread-id', threadId, '--run-id', runId, '--download-dir', outDir],
        Math.max(30_000, timeoutMs),
      )
      if (answered.message !== undefined) return { ok: false, files: [], message: answered.message }
      const json = answered.json ?? {}
      const status = typeof json.status === 'string' ? json.status : 'unknown'
      if (json.error_message !== undefined && String(json.error_message).trim() !== '') {
        return { ok: false, files: [], status, message: `小云雀任务失败：${String(json.error_message).slice(0, 200)}` }
      }
      if (status === 'succeeded') {
        const files: string[] = []
        for (const key of ['videos', 'images'] as const) {
          const list = Array.isArray(json[key]) ? (json[key] as Array<Record<string, unknown>>) : []
          for (const item of list) {
            if (typeof item.output_path === 'string' && item.output_path !== '') files.push(item.output_path)
          }
        }
        return { ok: true, files, status }
      }
      if (status === 'failed' || status === 'canceled' || status === 'interrupted') {
        return { ok: false, files: [], status, message: `小云雀任务${status === 'canceled' ? '被取消' : '失败'}了` }
      }
      if ((deps.now ?? Date.now)() - started > timeoutMs) {
        return { ok: false, files: [], status, message: `等小云雀出片超时（${Math.round(timeoutMs / 60_000)} 分钟），任务还在跑；稍后可以用 thread_id/run_id 继续查：${threadId} / ${runId}` }
      }
      await sleep(pollInterval)
    }
  }

  return {
    config: readConfig,
    view: () => viewXyqConfig(readConfig()),
    update: (patch: unknown) => viewXyqConfig(writeXyqConfig(deps.configFile, patch)),

    async status(): Promise<{ ok: boolean; loggedIn?: boolean; source?: string; message?: string }> {
      const answered = await call(['status'], 30_000)
      if (answered.message !== undefined) return { ok: false, message: answered.message }
      const json = answered.json ?? {}
      return {
        ok: true,
        loggedIn: json.logged_in === true,
        source: typeof json.source === 'string' ? json.source : '',
        ...(json.logged_in === true ? {} : { message: 'Access Key 未生效，请检查是否过期' }),
      }
    },

    async balance(): Promise<{ ok: boolean; totalRemain?: string; message?: string }> {
      const answered = await call(['get-credit-balance'], 30_000)
      if (answered.message !== undefined) return { ok: false, message: answered.message }
      const json = answered.json ?? {}
      return { ok: true, totalRemain: typeof json.total_remain_amount === 'string' ? json.total_remain_amount : String(json.total_remain_amount ?? '') }
    },

    async models(kind: 'video' | 'image'): Promise<{ ok: boolean; models?: Array<{ key: string; name: string }>; message?: string }> {
      const answered = await call(['model', 'list', '--type', kind], 60_000)
      if (answered.message !== undefined) return { ok: false, message: answered.message }
      const json = answered.json ?? {}
      const list = Array.isArray(json.models) ? (json.models as Array<Record<string, unknown>>) : []
      return {
        ok: true,
        models: list
          .filter((row) => typeof row.name === 'string' && String(row.name).trim() !== '')
          .map((row) => ({
            // 生图模型只有 name（CLI 就用完整名称）；生视频模型有 key（提交要用 key）。
            key: typeof row.key === 'string' && row.key !== '' ? String(row.key) : String(row.name),
            name: String(row.name),
          })),
      }
    },

    async generateImage(input: {
      prompt: string
      model?: string
      images?: string[]
      ratio?: string
      count?: number
      outDir?: string
      sessionKey?: string
    }): Promise<XyqGenerateResult> {
      const config = readConfig()
      const sessionKey = input.sessionKey ?? 'default'
      const budget = budgetOf(sessionKey)
      if (config.budget.images > 0 && budget.images >= config.budget.images) {
        return { ok: false, message: `本会话的生图额度已用完（上限 ${config.budget.images} 张，可在「大肥鱼 → 小云雀」里调整）` }
      }
      const model = (input.model ?? config.defaultImageModel).trim()
      if (model === '') {
        return { ok: false, message: '没指定图片模型。先用 `model list --type image` 查可用模型，或在「大肥鱼 → 小云雀」里设默认图片模型。' }
      }
      const args = ['generate-image', '--prompt', input.prompt, '--model', model]
      for (const image of input.images ?? []) {
        if (typeof image === 'string' && image !== '') args.push('--image', image)
      }
      if (typeof input.ratio === 'string' && input.ratio !== '') args.push('--ratio', input.ratio)
      if (typeof input.count === 'number' && Number.isFinite(input.count) && input.count > 0) args.push('--generate-image-count', String(Math.round(input.count)))
      const submitted = await call(args, 120_000)
      if (submitted.message !== undefined) return { ok: false, message: submitted.message }
      const json = submitted.json ?? {}
      const threadId = typeof json.thread_id === 'string' ? json.thread_id : ''
      const runId = typeof json.run_id === 'string' ? json.run_id : ''
      if (threadId === '' || runId === '') return { ok: false, message: '小云雀没有返回 thread_id / run_id，生成未提交成功' }
      budget.images += 1
      const outDir = input.outDir ?? 'xyq_output'
      const polled = await poll(threadId, runId, outDir, imageTimeout)
      return {
        ok: polled.ok,
        ...(polled.ok ? {} : { message: polled.message }),
        threadId,
        runId,
        files: polled.files,
        ...(typeof json.web_thread_link === 'string' ? { webLink: json.web_thread_link } : {}),
      }
    },

    /** UI 用：只提交生图任务，返回 thread/run（结果由 queryOnce 轮询）。 */
    async startImage(input: {
      prompt: string
      model: string
      images?: string[]
      ratio?: string
      resolution?: string
      count?: number
      sessionKey?: string
    }): Promise<{ ok: boolean; threadId?: string; runId?: string; webLink?: string; message?: string }> {
      const config = readConfig()
      const budget = budgetOf(input.sessionKey ?? 'default')
      if (config.budget.images > 0 && budget.images >= config.budget.images) {
        return { ok: false, message: `本会话的生图额度已用完（上限 ${config.budget.images} 张）` }
      }
      if (input.model.trim() === '') return { ok: false, message: '没指定图片模型' }
      const args = ['generate-image', '--prompt', input.prompt, '--model', input.model]
      for (const image of input.images ?? []) if (image !== '') args.push('--image', image)
      if (typeof input.ratio === 'string' && input.ratio !== '') args.push('--ratio', input.ratio)
      if (typeof input.resolution === 'string' && input.resolution !== '') args.push('--resolution', input.resolution)
      if (typeof input.count === 'number' && input.count > 0) args.push('--generate-image-count', String(Math.round(input.count)))
      const submitted = await call(args, 120_000)
      if (submitted.message !== undefined) return { ok: false, message: submitted.message }
      const json = submitted.json ?? {}
      const threadId = typeof json.thread_id === 'string' ? json.thread_id : ''
      const runId = typeof json.run_id === 'string' ? json.run_id : ''
      if (threadId === '' || runId === '') return { ok: false, message: '小云雀没有返回 thread_id / run_id' }
      budget.images += 1
      return { ok: true, threadId, runId, ...(typeof json.web_thread_link === 'string' ? { webLink: json.web_thread_link } : {}) }
    },

    /** UI 用：只提交生视频任务。 */
    async startVideo(input: {
      prompt: string
      model: string
      duration?: number
      ratio?: string
      resolution?: string
      images?: string[]
      sessionKey?: string
    }): Promise<{ ok: boolean; threadId?: string; runId?: string; webLink?: string; message?: string }> {
      const config = readConfig()
      const budget = budgetOf(input.sessionKey ?? 'default')
      if (config.budget.videos > 0 && budget.videos >= config.budget.videos) {
        return { ok: false, message: `本会话的视频额度已用完（上限 ${config.budget.videos} 条）` }
      }
      if (input.model.trim() === '') return { ok: false, message: '没指定视频模型' }
      const duration = Math.min(config.budget.maxVideoSeconds, Math.max(4, Math.round(input.duration ?? config.defaultVideoDurationSec)))
      const args = ['generate-video', '--model', input.model, '--prompt', input.prompt, '--duration', String(duration)]
      for (const image of input.images ?? []) if (image !== '') args.push('--image', image)
      if (typeof input.ratio === 'string' && input.ratio !== '' && input.ratio !== 'adaptive') args.push('--ratio', input.ratio)
      if (typeof input.resolution === 'string' && input.resolution !== '') args.push('--resolution', input.resolution)
      args.push('--task-type', 'reference')
      const submitted = await call(args, 180_000)
      if (submitted.message !== undefined) return { ok: false, message: submitted.message }
      const json = submitted.json ?? {}
      const threadId = typeof json.thread_id === 'string' ? json.thread_id : ''
      const runId = typeof json.run_id === 'string' ? json.run_id : ''
      if (threadId === '' || runId === '') return { ok: false, message: '小云雀没有返回 thread_id / run_id' }
      budget.videos += 1
      return { ok: true, threadId, runId, ...(typeof json.web_thread_link === 'string' ? { webLink: json.web_thread_link } : {}) }
    },

    /** UI 用：查一次任务状态（不轮询、不阻塞）。 */
    async queryOnce(threadId: string, runId: string, outDir: string): Promise<{
      ok: boolean
      status?: string
      files?: string[]
      message?: string
    }> {
      const answered = await call(
        ['query-result', '--thread-id', threadId, '--run-id', runId, '--download-dir', outDir],
        120_000,
      )
      if (answered.message !== undefined) return { ok: false, message: answered.message }
      const json = answered.json ?? {}
      const status = typeof json.status === 'string' ? json.status : 'unknown'
      if (typeof json.error_message === 'string' && json.error_message !== '') {
        return { ok: false, status, message: `小云雀任务失败：${json.error_message.slice(0, 200)}` }
      }
      if (status !== 'succeeded') return { ok: true, status }
      const files: string[] = []
      for (const key of ['videos', 'images'] as const) {
        const list = Array.isArray(json[key]) ? (json[key] as Array<Record<string, unknown>>) : []
        for (const item of list) {
          if (typeof item.output_path === 'string' && item.output_path !== '') files.push(item.output_path)
        }
      }
      return { ok: true, status, files }
    },

    /** 模型详情（比例/分辨率/时长等），给设置面板的下拉框用。 */
    async describe(name: string, kind: 'video' | 'image'): Promise<{ ok: boolean; model?: Record<string, unknown>; message?: string }> {
      const answered = await call(['model', 'describe', name, '--type', kind], 60_000)
      if (answered.message !== undefined) return { ok: false, message: answered.message }
      const json = answered.json ?? {}
      const model = json.model && typeof json.model === 'object' ? (json.model as Record<string, unknown>) : undefined
      if (model === undefined) return { ok: false, message: '没有拿到模型详情' }
      return { ok: true, model }
    },

    async generateVideo(input: {
      prompt: string
      model?: string
      duration?: number
      ratio?: string
      images?: string[]
      outDir?: string
      sessionKey?: string
    }): Promise<XyqGenerateResult> {
      const config = readConfig()
      const sessionKey = input.sessionKey ?? 'default'
      const budget = budgetOf(sessionKey)
      if (config.budget.videos > 0 && budget.videos >= config.budget.videos) {
        return { ok: false, message: `本会话的视频额度已用完（上限 ${config.budget.videos} 条，可在「大肥鱼 → 小云雀」里调整）` }
      }
      const model = (input.model ?? config.defaultVideoModel).trim()
      if (model === '') return { ok: false, message: '没指定视频模型（默认 Seedance_2.0_mini_lite，可在设置里改）' }
      const duration = Math.min(config.budget.maxVideoSeconds, Math.max(4, Math.round(input.duration ?? config.defaultVideoDurationSec)))
      const args = ['generate-video', '--model', model, '--prompt', input.prompt, '--duration', String(duration)]
      for (const image of input.images ?? []) {
        if (typeof image === 'string' && image !== '') args.push('--image', image)
      }
      if (typeof input.ratio === 'string' && input.ratio !== '') args.push('--ratio', input.ratio)
      args.push('--task-type', 'reference')
      const submitted = await call(args, 180_000)
      if (submitted.message !== undefined) return { ok: false, message: submitted.message }
      const json = submitted.json ?? {}
      const threadId = typeof json.thread_id === 'string' ? json.thread_id : ''
      const runId = typeof json.run_id === 'string' ? json.run_id : ''
      if (threadId === '' || runId === '') return { ok: false, message: '小云雀没有返回 thread_id / run_id，生成未提交成功' }
      budget.videos += 1
      const outDir = input.outDir ?? 'xyq_output'
      const polled = await poll(threadId, runId, outDir, videoTimeout)
      return {
        ok: polled.ok,
        ...(polled.ok ? {} : { message: polled.message }),
        threadId,
        runId,
        files: polled.files,
        ...(typeof json.web_thread_link === 'string' ? { webLink: json.web_thread_link } : {}),
      }
    },
  }
}

export type XyqService = ReturnType<typeof createXyqService>
