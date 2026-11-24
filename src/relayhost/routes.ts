/**
 * relayhost/routes —— 设置页「一键部署本机中继」的三条同域路由（2026-11-24）。
 *
 *   `GET  /api/dsh-remote-dafeiyu/relayhost/status`   此刻装没装、跑没跑、健康与否（只读）
 *   `POST /api/dsh-remote-dafeiyu/relayhost/deploy`   下载 → 起进程 → 等 /healthz → 写配置
 *   `POST /api/dsh-remote-dafeiyu/relayhost/stop`      收掉**自己起的**那个进程
 *
 * ## 守卫照抄仓里的既有域
 *
 * 与 `src/websearch/routes.ts` / `src/sprite/routes.ts` 同一套（见 `src/pill/routes.ts`）：
 *
 * - `hostIsLoopback`：挡 DNS 重绑定把这条路由当跳板；
 * - `applyCors` + `preflight`：桌面页在 `dsh-app://` 上，**每个请求都是跨源**，缺头就整条链路静默失败；
 * - 两条写路由再要 `x-drc-pair: 1`（**不能**拿 Origin 当凭据：桌面宿主转发时会删掉它，
 *   2026-10-03 在真宿主上点 pill 直接 403 就是这条）；
 * - 响应**一律 JSON**，失败也带一句中文。
 *
 * ## 为什么 deploy 这条要自己把错误折成中文
 *
 * 这条路由的失败会原样显示在设置页那张卡片上。`ECONNREFUSED` / `spawn ENOENT` 对用户是噪音，
 * 而"为什么没成"（下载失败？校验不过？端口被占？）恰恰是他唯一能动手的地方。
 * 服务层已经给的是中文；这里只兜住"某个非中文异常漏出来了"那一档。
 *
 * ## 为什么 deploy 是**同步等**（不像备份那样回 202 + 轮询）
 *
 * 一键部署最长 15 秒（等 /healthz 那一档），浏览器侧容忍得了；而回 202 的话，设置页就得自己
 * 维护"我点过一下、它现在在起"这种状态——那正是"转圈转到天荒地老"的来源。宁可同步等到一句话。
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent, preflight, rejectedBy } from '../pill/routes.js'
import type { RelayHostLog, RelayHostService, RelayHostStatus } from './types.js'

export const RELAYHOST_STATUS_ROUTE = '/api/dsh-remote-dafeiyu/relayhost/status'
export const RELAYHOST_DEPLOY_ROUTE = '/api/dsh-remote-dafeiyu/relayhost/deploy'
export const RELAYHOST_STOP_ROUTE = '/api/dsh-remote-dafeiyu/relayhost/stop'

/** POST body 上限：就两个短字段（port / token），4 KB 已经宽到离谱。 */
export const MAX_RELAYHOST_BODY_BYTES = 4 * 1024

export interface RelayhostRouteDeps {
  service: RelayHostService
  log: RelayHostLog
}

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  response.end(payload)
}

/**
 * 下发给页面的一份回答：**扁平字段 + 嵌套 status** 都给。
 *
 * 为什么两份：设置页读扁平的（`answer.state`，少一层解引用），而"重新部署失败时把当前状态
 * 一起带回来"那一档读嵌套的（`answer.status`，与服务层同一个形状）。两份是同一个对象，
 * 不存在"两份值不一样"的可能。
 */
function answerWith(status: RelayHostStatus): Record<string, unknown> {
  return { ok: status.state !== 'failed', ...status, status }
}

/** 把任意异常折成一句中文（非中文的那些加一句前缀，别让用户对着英文堆栈猜）。 */
function chineseReason(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const text = raw.trim().slice(0, 300)
  if (text === '') return fallback
  return /[\u4e00-\u9fa5]/.test(text) ? text : fallback + '：' + text
}

/** 读 body 并 JSON.parse。**永不抛**：超限 / 坏 JSON 都是 undefined。 */
function readJsonBody(request: IncomingMessage): Promise<unknown> {
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
      size += chunk.byteLength
      if (size > MAX_RELAYHOST_BODY_BYTES) {
        // 超限不销毁连接：这条是本机页面在打，"连接被重置"只会被读成网络故障。
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

/** 只读那一档守卫。返回 `undefined` 表示放行。 */
function readDenied(request: IncomingMessage): string | undefined {
  if (!hostIsLoopback(request.headers.host)) return 'host-not-loopback'
  if (!originIsLoopbackOrAbsent(request.headers.origin)) return 'origin-not-trusted'
  return undefined
}

/**
 * 写那一档守卫：回环 + `x-drc-pair: 1` + （Origin 若在则须像宿主自己）。
 * 返回 `undefined` 表示放行；其它值是**具体**被哪一道拦下的（要写进 403 的回答里）。
 */
function writeDenied(request: IncomingMessage): string | undefined {
  return rejectedBy(request) as string | undefined
}

/** `GET /relayhost/status`：只读，绝不下载、绝不起进程。 */
export function relayhostStatusHandler(deps: RelayhostRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      json(response, 405, { ok: false, message: '这边只支持 GET（部署要 POST）' })
      return
    }
    const denied = readDenied(request)
    if (denied !== undefined) {
      json(response, 403, { ok: false, error: denied })
      return
    }
    try {
      json(response, 200, answerWith(await deps.service.status()))
    } catch (error) {
      const message = chineseReason(error, '读取本机中继状态失败')
      deps.log('读取本机中继状态失败', { message })
      json(response, 500, { ok: false, message })
    }
  }
}

/** `POST /relayhost/deploy`：一键部署。body 可省（`{ port?, token? }`）。 */
export function relayhostDeployHandler(deps: RelayhostRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, message: '这边只支持 POST（看状态用 GET /relayhost/status）' })
      return
    }
    const denied = writeDenied(request)
    if (denied !== undefined) {
      deps.log('一键部署被守卫拒', { guard: denied })
      json(response, 403, { ok: false, error: denied })
      return
    }
    const body = await readJsonBody(request)
    if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
      json(response, 400, { ok: false, message: '请求体要是一个 JSON 对象（{ port?, token? }）' })
      return
    }
    const record = body as { port?: unknown; token?: unknown }
    let port: number | undefined
    if (record.port !== undefined && record.port !== null) {
      if (typeof record.port !== 'number' || !Number.isInteger(record.port) || record.port < 1 || record.port > 65535) {
        json(response, 400, { ok: false, message: 'port 要是 1~65535 的整数' })
        return
      }
      port = record.port
    }
    let token: string | undefined
    if (record.token !== undefined && record.token !== null) {
      if (typeof record.token !== 'string') {
        json(response, 400, { ok: false, message: 'token 要是字符串' })
        return
      }
      if (record.token.trim().length > 256) {
        json(response, 400, { ok: false, message: 'token 太长：最多 256 个字符' })
        return
      }
      // 空串 = "没指定"，交给服务层按 配置里那一枚 → 现生成 的顺序回落。
      token = record.token.trim() === '' ? undefined : record.token.trim()
    }

    let status: RelayHostStatus
    try {
      status = await deps.service.deploy({ port, token })
    } catch (error) {
      const message = chineseReason(error, '一键部署失败')
      deps.log('本机中继一键部署失败', { message })
      // 失败也把"此刻状态"带回去：界面上那句红字要和卡片上的状态对得上。
      let current: RelayHostStatus | undefined
      try {
        current = await deps.service.status()
      } catch {
        current = undefined
      }
      json(response, 500, { ok: false, message, state: current?.state, status: current })
      return
    }
    deps.log('本机中继一键部署完成', { state: status.state, port: status.port })
    json(response, 200, answerWith(status))
  }
}

/** `POST /relayhost/stop`：只收掉自己起的那个进程。幂等（没在跑就是"已停止"）。 */
export function relayhostStopHandler(deps: RelayhostRouteDeps) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    applyCors(request, response)
    if (preflight(request, response)) return
    if (request.method !== 'POST') {
      json(response, 405, { ok: false, message: '这边只支持 POST' })
      return
    }
    const denied = writeDenied(request)
    if (denied !== undefined) {
      deps.log('停止本机中继被守卫拒', { guard: denied })
      json(response, 403, { ok: false, error: denied })
      return
    }
    try {
      const status = await deps.service.stop()
      deps.log('本机中继已停止', { state: status.state })
      json(response, 200, answerWith(status))
    } catch (error) {
      const message = chineseReason(error, '停止本机中继失败')
      deps.log('停止本机中继失败', { message })
      json(response, 500, { ok: false, message })
    }
  }
}

export function relayhostHandlers(deps: RelayhostRouteDeps): Array<{
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => unknown
}> {
  return [
    { path: RELAYHOST_STATUS_ROUTE, handler: relayhostStatusHandler(deps) },
    { path: RELAYHOST_DEPLOY_ROUTE, handler: relayhostDeployHandler(deps) },
    { path: RELAYHOST_STOP_ROUTE, handler: relayhostStopHandler(deps) },
  ]
}
