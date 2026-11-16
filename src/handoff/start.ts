/**
 * handoff/start —— 宿主侧接线：软探测 `webServer`，挂三条回环路由。
 *
 * 与识图/派活同一条纪律：**不写 `inject:` 闸门**，这一半挂不上，远控一行都不受影响；
 * `stop()` 幂等；拿不到的服务写进 `probe`，不静默。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  HANDOFF_SELF_ROUTE,
  HANDOFF_START_ROUTE,
  HANDOFF_STATUS_ROUTE,
  handoffSelfHandler,
  handoffStartHandler,
  handoffStatusHandler,
  type HandoffRouteDeps,
} from './routes.js'
import { buildHandoffTools } from './tools.js'
import { createHandoffService, type HandoffService } from './service.js'

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

export interface HandoffHandle {
  stop(): void
  readonly probe: Record<string, string>
}

/** 交接文档目录：默认 `D:\dafeiyu-market\handoff`，可用 `DAFEIYU_HANDOFF_DIR` 覆盖。 */
export function resolveHandoffDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (env.DAFEIYU_HANDOFF_DIR ?? '').trim()
  if (explicit !== '') return explicit
  return 'D:\\dafeiyu-market\\handoff'
}

export function startHandoff(
  ctx: LooseContext,
  input: {
    dshHome: string
    log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
    /** 以下三个都**延后取**：路由可能在服务就绪之前就挂上了。 */
    inject: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }> | { ok: boolean; message?: string }
    newSession: (args: { workspace?: string }) => Promise<{ ok: boolean; sessionId?: string; message?: string }>
    sendPrompt: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
    sessionCwd: (sessionId: string) => Promise<string | undefined>
    handoffDir?: string
  },
): HandoffHandle {
  const probe: Record<string, string> = {}
  const service: HandoffService = createHandoffService({
    handoffDir: input.handoffDir ?? resolveHandoffDir(),
    dshHome: input.dshHome,
    log: input.log,
    inject: input.inject,
    newSession: input.newSession,
    sendPrompt: input.sendPrompt,
    sessionCwd: input.sessionCwd,
  })
  const deps: HandoffRouteDeps = {
    start: (kind, sessionId, note, boundary) => service.start(kind, sessionId, note, boundary),
    status: (jobId) => service.status(jobId),
    list: () => service.list(),
    selfCheck: (sessionId, cwd) => service.selfCheck(sessionId, cwd),
    sessionCwd: input.sessionCwd,
    log: input.log,
  }
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false

  const tryStart = (): void => {
    if (started || stopped || !web) return
    started = true
    const disposers: Array<() => void> = []
    try {
      disposers.push(web.register({ kind: 'exact', path: HANDOFF_SELF_ROUTE, handler: handoffSelfHandler(deps) }))
      disposers.push(web.register({ kind: 'exact', path: HANDOFF_START_ROUTE, handler: handoffStartHandler(deps) }))
      disposers.push(web.register({ kind: 'exact', path: HANDOFF_STATUS_ROUTE, handler: handoffStatusHandler(deps) }))
      unregister = () => {
        for (const dispose of disposers) dispose()
      }
      probe.routes = 'registered'
      input.log('转生/分身路由已挂上', { dir: resolveHandoffDir() })
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      const registered = disposers.splice(0)
      if (registered.length > 0) {
        unregister = () => {
          for (const dispose of registered) dispose()
        }
      }
      input.log('转生/分身路由注册失败（其它功能不受影响）', {
        message: String((error as Error)?.message ?? error).slice(0, 200),
      })
    }
  }

  /*
 * 给 agent 的两个工具（2026-11-16）：转生 / 分身 原来只能人点，模型没法发起。
 * 工具不重写逻辑，调的就是面板调的那个 `service.start()`。
 *
 * ⚠️ **`tools` 是晚到的服务**（真机探针：t0 时 `ctx.get('tools')` 是 undefined，
 * 要到 t8000 之后才变成对象）。只试一次的结果是「工具永远注册不上，而且没有任何报错」——
 * 我第一版就是这么写的，用新开的 agent 验出来清单里根本没有 handoff_*。
 * 所以这里照 `webServer` 那套：先试一次，再 `ctx.inject(['tools'])` 等它到。
 */
let toolsRegistered = false
const acceptTools = (value: unknown, via: string): boolean => {
  if (toolsRegistered) return true
  if (!value || typeof value !== 'object') return false
  const tools = value as { register?: (definition: Record<string, unknown>) => unknown }
  if (typeof tools.register !== 'function') {
    probe.tool = 'object without register()'
    return false
  }
  try {
    const definitions = buildHandoffTools({
      service: { start: (kind, sessionId, note, boundary) => service.start(kind, sessionId, note, boundary) },
      log: input.log,
    })
    for (const definition of definitions) tools.register(definition)
    toolsRegistered = true
    probe.tool = `${via}:${definitions.length}`
    return true
  } catch (error) {
    probe.tool = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    return false
  }
}

try {
  const found = ctx.get?.('tools', true)
  if (!acceptTools(found, 'via get')) probe.tool = probe.tool ?? 'none'
} catch (error) {
  probe.tool = `get threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
}
try {
  ctx.inject?.(['tools'], ((...args: unknown[]) => {
    try {
      for (const candidate of [...args, ctx]) {
        const value = (candidate as { get?: (n: string, optional: true) => unknown })?.get?.('tools', true)
        if (acceptTools(value ?? candidate, 'via inject')) return
      }
      probe.tool = `${probe.tool ?? 'none'} (inject fired, empty)`
    } catch (error) {
      probe['injectThrew:tools'] = String((error as Error)?.message ?? error).slice(0, 160)
    }
  }) as never)
} catch (error) {
  probe['injectThrew:tools'] = String((error as Error)?.message ?? error).slice(0, 160)
}

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
        for (const candidate of [args[0], ...args, ctx]) {
          if (acceptWeb(pickFrom(candidate), 'via inject')) return
        }
        probe.webServer = `${probe.webServer ?? 'none'} (inject fired, empty)`
      } catch (error) {
        probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
      }
    }) as never)
  } catch (error) {
    probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
  }

  return {
    probe,
    stop(): void {
      if (stopped) return
      stopped = true
      try {
        service.stop()
      } catch {
        /* 停服务不许拖住停机 */
      }
      try {
        unregister?.()
      } catch {
        /* 注销失败不许拖住停机 */
      }
    },
  }
}
