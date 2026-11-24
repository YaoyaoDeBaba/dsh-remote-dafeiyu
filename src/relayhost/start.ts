/**
 * relayhost/start —— 接线：把「一键部署本机中继」挂进设置页可达的三条路由，并做**随宿主自启**。
 *
 * ## 为什么自启放在这里而不是 Windows 计划任务
 *
 * 中继单独活着没有意义——它唯一的用处是给这台 DSH 的插件和手机牵线。DSH 没起来时它只是白占端口，
 * 所以「开机自启」在这里的正确语义是：**插件加载时，如果用户勾了自启、且产物已经装好，就把它拉起来**。
 * 用户真要让中继脱离 DSH 常驻，那属于另一套部署（systemd/计划任务），不归这个开关管。
 *
 * ## 自启失败的噪音纪律
 *
 * 自启是后台动作：失败只写一行中文日志 + 把原因留在 `probe.autostart`，**绝不弹窗、不阻塞插件加载**——
 * 中继起不来的后果是「手机连不上」，而不是「远控插件挂了」。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { applyCors, hostIsLoopback, originIsLoopbackOrAbsent, preflight, rejectedBy } from '../pill/routes.js'
import {
  RELAYHOST_DEPLOY_ROUTE,
  RELAYHOST_STATUS_ROUTE,
  RELAYHOST_STOP_ROUTE,
  relayhostHandlers,
  type RelayhostRouteDeps,
} from './routes.js'
import { createRelayHost } from './service.js'
import type { RelayHostService } from './types.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
}

interface Registerable {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => unknown
  }): () => void
}

export interface RelayHostHandle {
  stop(): void
  readonly probe: Record<string, string>
}

export interface RelayHostStartInput {
  /** `<dshHome>/storages/dsh-remote-dafeiyu/relayhost` 由这里拼。 */
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 插件配置的读/写（中继地址与主机口令）。 */
  readConfig?: () => { serverUrl?: string; hostToken?: string }
  writeConfig?: (patch: { serverUrl?: string; hostToken?: string }) => void
}

/** 自启开关的落点（与产物同一个目录，换 DSH 家目录时一起搬）。 */
export const AUTOSTART_ROUTE = '/api/dsh-remote-dafeiyu/relayhost/autostart'

interface AutostartFile { enabled: boolean; port?: number }

/** 本机局域网 IPv4：只认**私有网段**，跳过 WSL/虚拟网卡那种 172.x 里明显是宿主虚拟交换机的地址。 */
export function pickLanAddress(): string | undefined {
  let interfaces: ReturnType<typeof os.networkInterfaces>
  try {
    interfaces = os.networkInterfaces()
  } catch {
    return undefined
  }
  const candidates: string[] = []
  for (const [name, rows] of Object.entries(interfaces)) {
    for (const row of rows ?? []) {
      if (row.family !== 'IPv4' || row.internal) continue
      // 虚拟网卡（WSL / Hyper-V / VMware）在 Windows 上通常挂在 vEthernet 下面，跳过
      if (/vEthernet|VirtualBox|VMware|Loopback/i.test(name)) continue
      candidates.push(row.address)
    }
  }
  return candidates[0]
}

export function startRelayHost(ctx: LooseContext, input: RelayHostStartInput): RelayHostHandle {
  const probe: Record<string, string> = {}
  const dir = path.join(input.dshHome, 'storages', 'dsh-remote-dafeiyu', 'relayhost')
  const autostartFile = path.join(dir, 'autostart.json')

  const readAutostart = (): AutostartFile => {
    try {
      const parsed = JSON.parse(readFileSync(autostartFile, 'utf8')) as Partial<AutostartFile>
      return { enabled: parsed.enabled === true, ...(typeof parsed.port === 'number' ? { port: parsed.port } : {}) }
    } catch {
      return { enabled: false }
    }
  }
  const writeAutostart = (value: AutostartFile): AutostartFile => {
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(autostartFile, JSON.stringify(value, null, 2) + '\n', 'utf8')
    } catch (error) {
      input.log('中继自启开关写不进盘（下次启动会按旧值走）', {
        message: String((error as Error)?.message ?? error).slice(0, 160),
      })
    }
    return value
  }

  let service: RelayHostService | undefined
  try {
    service = createRelayHost({
      dir,
      log: input.log,
      ...(input.readConfig ? { readConfig: input.readConfig } : {}),
      ...(input.writeConfig ? { writeConfig: input.writeConfig } : {}),
      lanAddress: () => pickLanAddress(),
    })
    probe.service = 'ready'
  } catch (error) {
    probe.service = 'start failed: ' + String((error as Error)?.message ?? error).slice(0, 80)
    input.log('本机中继服务起不来（远控/其它功能不受影响）', { message: probe.service })
  }

  const routeDeps: RelayhostRouteDeps = { service: service as RelayHostService, log: input.log }

  /** 自启开关的读写（客户端一个 checkbox）。GET 读、POST 写；写要 `x-drc-pair`。 */
  const autostartHandler = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const json = (status: number, body: unknown): void => {
      const payload = JSON.stringify(body)
      response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
      response.end(payload)
    }
    applyCors(request, response)
    if (preflight(request, response)) return
    if (!hostIsLoopback(request.headers.host) || !originIsLoopbackOrAbsent(request.headers.origin)) {
      json(403, { ok: false, error: 'host-not-loopback' })
      return
    }
    if (request.method === 'GET') {
      json(200, { ok: true, enabled: readAutostart().enabled })
      return
    }
    if (request.method !== 'POST') {
      json(405, { ok: false, error: '只支持 GET/POST' })
      return
    }
    const denied = rejectedBy(request)
    if (denied) {
      json(403, { ok: false, error: denied })
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
    let body: { enabled?: unknown } = {}
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as { enabled?: unknown }
    } catch {
      json(400, { ok: false, error: '请求体不是合法 JSON' })
      return
    }
    const enabled = body.enabled !== false
    const saved = writeAutostart({ ...readAutostart(), enabled })
    input.log('中继自启开关', { enabled: saved.enabled })
    json(200, { ok: true, enabled: saved.enabled })
  }

  const disposers: Array<() => void> = []
  const tryRoutes = (web: Registerable): boolean => {
    try {
      for (const one of relayhostHandlers(routeDeps)) {
        disposers.push(web.register({ kind: 'exact', path: one.path, handler: one.handler }))
      }
      disposers.push(web.register({ kind: 'exact', path: AUTOSTART_ROUTE, handler: autostartHandler }))
      probe.routes = 'registered'
      return true
    } catch (error) {
      probe.routes = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
  }

  let web: Registerable | undefined
  try {
    const found = ctx.get?.('webServer', true)
    if (found && typeof (found as Registerable).register === 'function') web = found as Registerable
    else probe.routes = 'no-webServer'
  } catch (error) {
    probe.routes = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
  }
  if (web && !tryRoutes(web)) web = undefined
  // webServer 常常晚到：500ms × 40 拍（与别的域同一套纪律）
  let timer: ReturnType<typeof setInterval> | undefined
  if (web === undefined) {
    let attempts = 0
    try {
      timer = setInterval(() => {
        attempts += 1
        if (attempts > 40) {
          if (timer !== undefined) clearInterval(timer)
          probe.routes = (probe.routes ?? 'none') + ' (gave up)'
          return
        }
        try {
          const found = ctx.get?.('webServer', true)
          if (found && typeof (found as Registerable).register === 'function') {
            if (tryRoutes(found as Registerable)) {
              if (timer !== undefined) clearInterval(timer)
              timer = undefined
            }
          }
        } catch {
          /* 轮询里抛错只丢掉这一拍 */
        }
      }, 500)
      ;(timer as { unref?: () => void }).unref?.()
    } catch {
      probe.routes = 'poll threw'
    }
  }

  /* ── 随宿主自启 ─────────────────────────────────────────────────── */
  const autostart = readAutostart()
  if (autostart.enabled && service) {
    void service
      .deploy(autostart.port === undefined ? {} : { port: autostart.port })
      .then((status) => {
        probe.autostart = status.state + (status.problem ? ': ' + status.problem : '')
        input.log('中继随宿主自启完成', { state: status.state, port: status.port })
      })
      .catch((error: unknown) => {
        probe.autostart = 'failed: ' + String((error as Error)?.message ?? error).slice(0, 120)
        input.log('中继随宿主自启失败（手动点一次「一键部署」即可）', {
          message: probe.autostart,
        })
      })
  } else {
    probe.autostart = autostart.enabled ? 'enabled-but-no-service' : 'off'
  }

  return {
    probe,
    stop(): void {
      try {
        if (timer !== undefined) clearInterval(timer)
      } catch {
        /* 停机不许抛 */
      }
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* 注销不许抛 */
        }
      }
      try {
        service?.dispose()
      } catch {
        /* 释放句柄不许抛 */
      }
    },
  }
}