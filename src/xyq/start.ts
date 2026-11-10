/**
 * xyq/start — 宿主接线：挂四条设置页路由、注册四个工具、注入使用提示。
 *
 * 与识图/记忆同一条纪律：软探测 `webServer` / `tools` / `systemPrompt`，
 * 任何一块挂不上都只少那一块，远控主链路不受影响；`stop()` 幂等。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { createXyqService, type XyqService } from './service.js'
import { resolveXyqConfigFile, readXyqConfig } from './config.js'
import {
  XYQ_BALANCE_ROUTE,
  XYQ_CONFIG_ROUTE,
  XYQ_DESCRIBE_ROUTE,
  XYQ_FILE_ROUTE,
  XYQ_GENERATE_ROUTE,
  XYQ_MODELS_ROUTE,
  XYQ_RESULT_ROUTE,
  XYQ_STATUS_ROUTE,
  xyqConfigHandler,
  xyqDescribeHandler,
  xyqFileHandler,
  xyqGenerateHandler,
  xyqQueryHandler,
  xyqResultHandler,
  type XyqRouteDeps,
} from './routes.js'
import { xyqTools } from './tools.js'
import { defaultCliRunner, resolveCliPath, type CliRunner } from './cli.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
  effect?(execute: () => (() => unknown) | void): unknown
}

interface Registerable {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => unknown
  }): () => void
}

export interface XyqHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly service: XyqService
}

// 提示文本的唯一一份（推送按钮也复用）。
import { xyqGuidance as guidanceText } from './guidance.js'

export function startXyq(
  ctx: LooseContext,
  deps: {
    dshHome: string
    log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
    run?: CliRunner
    resolveCli?: () => Promise<string | undefined>
  },
): XyqHandle {
  const probe: Record<string, string> = {}
  const run = deps.run ?? defaultCliRunner
  const resolveCli =
    deps.resolveCli ??
    (() => resolveCliPath(run, { log: (message, fields) => deps.log(message, fields) }))
  const configFile = resolveXyqConfigFile(deps.dshHome)
  const service = createXyqService({ configFile, run, resolveCli, log: deps.log })

  const disposers: Array<() => void> = []
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false

  const outDir = path.join(deps.dshHome, 'storages', 'dsh-remote-dafeiyu', 'xyq-output')
  const routeDeps: XyqRouteDeps = { service, outDir, log: deps.log }
  const tryStart = (): void => {
    if (started || stopped) return
    started = true
    try {
      const registers: Array<[string, (request: IncomingMessage, response: ServerResponse) => unknown]> = [
        [XYQ_CONFIG_ROUTE, xyqConfigHandler(routeDeps)],
        [XYQ_STATUS_ROUTE, xyqQueryHandler('status', routeDeps)],
        [XYQ_BALANCE_ROUTE, xyqQueryHandler('balance', routeDeps)],
        [XYQ_MODELS_ROUTE, xyqQueryHandler('models', routeDeps)],
        [XYQ_DESCRIBE_ROUTE, xyqDescribeHandler(routeDeps)],
        [XYQ_GENERATE_ROUTE, xyqGenerateHandler(routeDeps)],
        [XYQ_RESULT_ROUTE, xyqResultHandler(routeDeps)],
        [XYQ_FILE_ROUTE, xyqFileHandler(routeDeps)],
      ]
      for (const [path, handler] of registers) disposers.push(web!.register({ kind: 'exact', path, handler }))
      unregister = () => {
        for (const dispose of disposers.splice(0)) dispose()
      }
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      if (disposers.length > 0) {
        const registered = disposers.splice(0)
        unregister = () => {
          for (const dispose of registered) dispose()
        }
      }
    }
  }

  let web: Registerable | undefined
  const acceptWeb = (value: unknown, via: string): boolean => {
    if (!value || typeof value !== 'object') return false
    if (typeof (value as Registerable).register !== 'function') {
      probe.webServer = 'object without register()'
      return false
    }
    web = value as Registerable
    probe.webServer = via
    tryStart()
    return true
  }
  const pickFrom = (source: unknown): unknown => {
    if (!source || typeof source !== 'object') return undefined
    const asContext = source as { get?: (n: string, optional: true) => unknown }
    if (typeof asContext.get === 'function') {
      try {
        const got = asContext.get('webServer', true)
        if (got) return got
      } catch {
        /* 这个候选没有该服务 */
      }
    }
    try {
      return (source as Record<string, unknown>)['webServer']
    } catch {
      return undefined
    }
  }
  try {
    const found = ctx.get?.('webServer', true)
    if (found) acceptWeb(found, 'via get')
    else probe.webServer = 'none'
  } catch (error) {
    probe.webServer = `get threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }
  try {
    ctx.inject?.(['webServer'], ((...args: unknown[]) => {
      try {
        for (const candidate of [args[0], ...args, ctx]) if (acceptWeb(pickFrom(candidate), 'via inject')) return
        probe.webServer = `${probe.webServer ?? 'none'} (inject fired, empty)`
      } catch (error) {
        probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
      }
    }) as never)
  } catch (error) {
    probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
  }

  // 工具：配置里关掉就不注册（改开关要重启，与识图同一条）
  const config = readXyqConfig(configFile)
  if (!config.enabled) {
    probe.tools = 'disabled-by-config'
  } else {
    try {
      const tools = ctx.get?.('tools', true) as { register?: (definition: Record<string, unknown>) => unknown } | undefined
      if (tools && typeof tools.register === 'function') {
        for (const tool of xyqTools(service)) tools.register(tool)
        probe.tools = 'registered'
      } else {
        probe.tools = 'no-tools'
      }
    } catch (error) {
      probe.tools = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    }
    try {
      const systemPrompt = ctx.get?.('systemPrompt', true) as
        | { section?: (definition: { name: string; order: number; text: string }) => unknown }
        | undefined
      if (systemPrompt && typeof systemPrompt.section === 'function') {
        systemPrompt.section({ name: 'dafeiyu:xyq', order: 10095, text: guidanceText(config.freedom) })
        probe.section = 'registered'
      } else {
        probe.section = 'no-systemPrompt'
      }
    } catch (error) {
      probe.section = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    }
  }

  return {
    probe,
    service,
    stop(): void {
      if (stopped) return
      stopped = true
      try {
        unregister?.()
      } catch {
        /* 停机不许抛 */
      }
      unregister = undefined
    },
  }
}
