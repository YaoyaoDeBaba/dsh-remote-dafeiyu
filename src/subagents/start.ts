/**
 * subagents/start — 宿主侧接线：软探测 `webServer` 挂一条只读路由。
 *
 * 与识图/记忆同一条纪律：**不写 `inject:` 闸门**，这一半挂不上，远控一行都不受影响；
 * `stop()` 幂等；失败写 `probe` + 一行日志，不静默。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SUBAGENTS_ARCHIVE_ROUTE, SUBAGENTS_ROUTE, subagentsArchiveHandler, subagentsHandler, type SubagentRouteDeps } from './routes.js'
import type { KernelSubagent } from '../ports/index.js'

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

export interface SubagentsHandle {
  stop(): void
  readonly probe: Record<string, string>
}

export function startSubagents(
  ctx: LooseContext,
  deps: Omit<SubagentRouteDeps, 'log'> & {
    log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  },
): SubagentsHandle {
  const probe: Record<string, string> = {}
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false

  const tryStart = (): void => {
    if (started || stopped || !web) return
    started = true
    try {
      const disposers: Array<() => void> = []
      disposers.push(web.register({ kind: 'exact', path: SUBAGENTS_ROUTE, handler: subagentsHandler(deps) }))
      disposers.push(
        web.register({ kind: 'exact', path: SUBAGENTS_ARCHIVE_ROUTE, handler: subagentsArchiveHandler(deps) }),
      )
      unregister = () => {
        for (const dispose of disposers) dispose()
      }
      probe.routes = 'registered'
      deps.log('子代理监视器路由已挂上')
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      deps.log('子代理监视器路由注册失败（远控不受影响）', {
        message: String((error as Error)?.message ?? error).slice(0, 200),
      })
    }
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

  // 与识图/记忆同一个探测顺序（⚠️ 直接读 `ctx.webServer` 在 cordis 未声明时会**抛**，
  // 0.9.0-dafeiyu.6 就是栽在这一步：异常冒到外层 try，两条路由一条都没挂上，
  // 表现是 /api/.../subagents 回 401 unauthorized）。
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
        unregister?.()
      } catch {
        /* 注销失败不许拖住停机 */
      }
    },
  }
}
