/**
 * extensions/start — 宿主接线：软探测 `webServer`，挂两条扩展路由。
 *
 * 与识图/小云雀同一条纪律（见 skill §3）：
 * 1. `ctx.get?.('webServer', true)` **第二个参数必须是 true**（可选）：宿主没登记这一面时
 *    抛异常会把外层 try 整段带走，两条路由一条都挂不上；
 * 2. 探不到就 `ctx.inject(['webServer'], …)` 等它晚到（桌面宿主常常先起插件、后起 web）；
 * 3. 每块失败只写 `probe[...]` + 一行中文日志，**不影响远控主链路**；
 * 4. `stop()` 幂等，注销抛错只吞不抛。
 *
 * 这里**不注册工具**：扩展列表是设置页上给人点的事，模型没有理由自己去装插件
 * （真要装，那也是人先按下那个按钮）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createExtensionsService,
  type ExtensionsService,
  type FsLike,
  type Log,
  type PnpmRunner,
} from './service.js'
import {
  COMPAT_ROUTE,
  EXTENSIONS_ACTION_ROUTE,
  EXTENSIONS_ROUTE,
  compatHandler,
  extensionsActionHandler,
  extensionsListHandler,
} from './routes.js'
import { buildCompatReport, type CompatFs } from '../compat/index.js'
import { nodeFs } from './service.js'

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

export interface ExtensionsHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly service: ExtensionsService
}

export function startExtensions(
  ctx: LooseContext,
  deps: { profileDir: string; log: Log; fs?: FsLike; runPnpm?: PnpmRunner; timeoutMs?: number },
): ExtensionsHandle {
  const probe: Record<string, string> = {}
  const service = createExtensionsService({
    profileDir: deps.profileDir,
    log: deps.log,
    fs: deps.fs,
    runPnpm: deps.runPnpm,
    timeoutMs: deps.timeoutMs,
  })
  const routeDeps = {
    list: () => service.list(),
    act: (id: string, action: unknown) => service.act(id, action),
    log: deps.log,
  }

  const disposers: Array<() => void> = []
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false
  let web: Registerable | undefined

  const tryStart = (): void => {
    if (started || stopped || !web) return
    started = true
    try {
      disposers.push(web.register({ kind: 'exact', path: EXTENSIONS_ROUTE, handler: extensionsListHandler(routeDeps) }))
      disposers.push(
        web.register({ kind: 'exact', path: EXTENSIONS_ACTION_ROUTE, handler: extensionsActionHandler(routeDeps) }),
      )
      disposers.push(
        web.register({
          kind: 'exact',
          path: COMPAT_ROUTE,
          handler: compatHandler({
            report: () => buildCompatReport(deps.profileDir, (deps.fs ?? nodeFs) as unknown as CompatFs),
            log: deps.log,
          }),
        }),
      )
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      // 挂了一半：把已挂的那条收掉，别留一条能用的、一条 404 的怪状态
      if (disposers.length > 0) {
        const registered = disposers.splice(0)
        unregister = () => {
          for (const dispose of registered) {
            try {
              dispose()
            } catch {
              /* 注销不许抛 */
            }
          }
        }
      }
      deps.log('扩展列表路由挂不上（远控不受影响）', { probe: probe.routes })
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
    const asContext = source as { get?: (name: string, optional: true) => unknown }
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
      // 还没挂上的那条也补收一次（`register` 抛错时可能留了半拉）
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          /* 同上 */
        }
      }
    },
  }
}
