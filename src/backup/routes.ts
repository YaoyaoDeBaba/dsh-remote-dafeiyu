/**
 * routes — 设置页「会话备份」那张卡片唯一的一条同域路由。
 *
 * 与 `/config` 那条同一个前缀、同一道守卫（环回 Host + Origin 白名单 + `x-drc-pair`），
 * 理由也一样：这是一条**能改行为**的写路由（它会往远端仓库推东西、还会把备份解回 `~/.dsh`）。
 *
 * ## 为什么长任务不在这条路由里等
 *
 * 备份要传几十 MB、恢复要拉几十 MB，几分钟是常态；浏览器那一侧的超时是 8 秒。
 * 所以 `run` / `restore` 只**起个头**就回 202，真正的进度看 `GET` 的 `status`
 * （`running` / `lastResult` / `lastError`）——卡片就是靠轮询那一份来显示"正在备份"。
 *
 * ## 一条硬纪律
 *
 * `GET` 的回复里**不许有 token 真值**，只给"有没有"和脱敏形态。
 * 这与 `status.json` 同一条纪律：那个文件被设计成可以随时贴进工单。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostIsLoopback, originIsLoopbackOrAbsent, rejectedBy } from '../pill/routes.js'
import type { BackupStatus, RunResult, SaveResult } from './service.js'
import type { BackupConfig } from './config.js'

export const BACKUP_ROUTE = '/plugins/dsh-remote-control/backup'

/** POST body 上限：几个短字符串 + 一份配置对象，16 KB 足够。 */
const MAX_BODY_BYTES = 16 * 1024

export interface BackupRouteDeps {
  /** 现读状态（每次请求现算，不缓存）。 */
  status(): BackupStatus
  /** 现读配置（不含 token）。 */
  config(): BackupConfig
  /** 保存配置（只认认识的键）。 */
  saveConfig(patch: Partial<Record<keyof BackupConfig, unknown>>): SaveResult
  /** 写 / 清 token。 */
  setToken(token: string): { ok: boolean; error?: string }
  /** 起一次备份（异步；调用方不 await 也行，这里自己吞掉结果）。 */
  runNow(reason: string): Promise<RunResult>
  /** 从备份恢复（同样异步）。 */
  restore(): Promise<{ ok: boolean; message: string }>
  log(message: string, fields?: Record<string, string | number | boolean | undefined>): void
}

interface JsonAnswer {
  state: 'ok' | 'failed'
  status?: BackupStatus
  config?: Omit<BackupConfig, never>
  error?: string
  field?: string
  detail?: string
  started?: string
}

function json(response: ServerResponse, code: number, body: JsonAnswer | Record<string, unknown>): void {
  const payload = JSON.stringify(body)
  response.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  response.end(payload)
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let done = false
    const finish = (value: unknown): void => {
      if (done) return
      done = true
      resolve(value)
    }
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        finish(undefined)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        finish(text === '' ? {} : JSON.parse(text))
      } catch {
        finish(undefined)
      }
    })
    request.on('error', () => finish(undefined))
  })
}

/** 配置里能回给浏览器的部分（目前就是全量：token 根本不在这个结构里）。 */
function publicConfig(config: BackupConfig): BackupConfig {
  return { ...config }
}

export function backupRouteHandler(deps: BackupRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (!hostIsLoopback(request.headers.host) || !originIsLoopbackOrAbsent(request.headers.origin)) {
        json(response, 403, { state: 'failed', error: 'request-not-trusted' })
        return
      }
      try {
        const status = deps.status()
        json(response, 200, { state: 'ok', status, config: publicConfig(deps.config()) })
      } catch (error) {
        json(response, 500, { state: 'failed', error: String((error as Error)?.message ?? error).slice(0, 200) })
      }
      return
    }

    if (request.method !== 'POST') {
      json(response, 405, { state: 'failed', error: 'method not allowed' })
      return
    }
    const guard = rejectedBy(request)
    if (guard) {
      deps.log('备份路由被守卫拒', { guard })
      json(response, 403, { state: 'failed', error: 'request-not-trusted', detail: guard })
      return
    }
    const body = await readJson(request)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      json(response, 400, { state: 'failed', error: 'invalid', detail: 'body 要是一个 JSON 对象' })
      return
    }
    const payload = body as { action?: unknown; config?: unknown; token?: unknown }
    const action = typeof payload.action === 'string' ? payload.action : ''

    try {
      if (action === 'save') {
        const patch =
          payload.config && typeof payload.config === 'object' && !Array.isArray(payload.config)
            ? (payload.config as Partial<Record<keyof BackupConfig, unknown>>)
            : {}
        const saved = deps.saveConfig(patch)
        if (!saved.ok) {
          json(response, 400, { state: 'failed', error: 'invalid', field: saved.field, detail: saved.error })
          return
        }
        // token 单独处理：与配置分开存，清空用空串表达。
        if ('token' in payload) {
          const token = typeof payload.token === 'string' ? payload.token.trim() : ''
          const set = deps.setToken(token)
          if (!set.ok) {
            json(response, 400, { state: 'failed', error: 'invalid', field: 'token', detail: set.error ?? '' })
            return
          }
        }
        json(response, 200, { state: 'ok', config: publicConfig(saved.config), status: deps.status() })
        return
      }

      if (action === 'run') {
        // 不 await：一趟几十 MB，浏览器等不起（它自己会轮询 status）。
        void deps.runNow('手动').catch(() => {})
        json(response, 202, { state: 'ok', started: 'run' })
        return
      }

      if (action === 'restore') {
        void deps.restore().catch(() => {})
        json(response, 202, { state: 'ok', started: 'restore' })
        return
      }

      json(response, 400, { state: 'failed', error: 'invalid', field: 'action', detail: '只认 save / run / restore' })
    } catch (error) {
      json(response, 500, { state: 'failed', error: String((error as Error)?.message ?? error).slice(0, 200) })
    }
  }
}

