/**
 * avatar/start — 把两条只读路由挂到宿主的 webServer（软探测，挂不上不影响主链路）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { AVATAR_MANIFEST_ROUTE, AVATAR_SHEET_ROUTE, avatarDir, avatarManifestHandler, avatarSheetHandler } from './routes.js'

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

export interface AvatarHandle {
  stop(): void
  readonly probe: Record<string, string>
}

export function startAvatar(
  ctx: LooseContext,
  deps: { dshHome: string; log: (message: string) => void },
): AvatarHandle {
  const probe: Record<string, string> = {}
  const dir = avatarDir(deps.dshHome)
  const disposers: Array<() => void> = []
  let unregister: (() => void) | undefined
  let web: Registerable | undefined
  let started = false
  let stopped = false

  const tryStart = (): void => {
    if (started || stopped || web === undefined) return
    started = true
    try {
      disposers.push(web.register({ kind: 'exact', path: AVATAR_MANIFEST_ROUTE, handler: avatarManifestHandler(dir) }))
      disposers.push(web.register({ kind: 'exact', path: AVATAR_SHEET_ROUTE, handler: avatarSheetHandler(dir) }))
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

  const accept = (value: unknown, via: string): boolean => {
    if (!value || typeof value !== 'object' || typeof (value as Registerable).register !== 'function') return false
    web = value as Registerable
    probe.webServer = via
    tryStart()
    return true
  }
  try {
    const found = ctx.get?.('webServer', true)
    if (found) accept(found, 'via get')
    else probe.webServer = 'none'
  } catch (error) {
    probe.webServer = `get threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }
  try {
    ctx.inject?.(['webServer'], ((scoped: unknown) => {
      const asContext = scoped as { get?: (n: string, optional: true) => unknown }
      let candidate: unknown
      try {
        candidate = asContext?.get?.('webServer', true)
      } catch {
        candidate = undefined
      }
      if (!accept(candidate, 'via inject')) probe.webServer = `${probe.webServer ?? 'none'} (inject fired, empty)`
    }) as never)
  } catch (error) {
    probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 120)
  }

  return {
    probe,
    stop(): void {
      if (stopped) return
      stopped = true
      try {
        unregister?.()
      } catch {
        /* 停机不许抛 */
      }
    },
  }
}
