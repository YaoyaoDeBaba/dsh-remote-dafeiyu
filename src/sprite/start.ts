/**
 * sprite/start —— 序列帧精灵图工具的接线：托管工具页 + 注册 agent 工具 + 注入指南。
 *
 * 与识图/派活同一条纪律：软挂载、`stop()` 幂等、失败写 `probe` 并留一行日志。
 * 区别是它会**起子进程**（无头 Edge），所以：
 * - 只在真正调用工具时才起，闲置超时自己关；
 * - 停机时无条件关（`stop()` 里 await，不留孤儿进程）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SPRITE_PAGE_ROUTE, spritePageHandler } from './routes.js'
import { createSpriteService, type SpriteService } from './service.js'
import { sweepOrphanBrowsers } from './orphans.js'
import { buildTools } from './tools.js'
import { SPRITE_GUIDANCE } from './guide.js'

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

export interface SpriteHandle {
  stop(): void
  readonly probe: Record<string, string>
  /** 给测试/诊断用：暴露 service（没起来时是 undefined）。 */
  readonly service?: SpriteService
}

/** 插件包根目录（dist/bundle/index.js → 上两级）。 */
function packageRoot(): string {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  } catch {
    return process.cwd()
  }
}

export interface SpriteStartDeps {
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 工具页（打补丁后的 HTML）路径；不给就按包内 assets 找。 */
  toolHtmlPath?: string
  /** 导出目录；不给就用 dshHome 下 storages/.../sprite-out。 */
  outDir?: string
  /** 关掉工具注册（设置里禁用时用）。 */
  enabled?: boolean
}

export function startSprite(ctx: LooseContext, deps: SpriteStartDeps): SpriteHandle {
  const probe: Record<string, string> = {}
  const toolHtmlPath = deps.toolHtmlPath ?? path.join(packageRoot(), 'assets', 'sprite', 'sprite-tool.html')
  const outDir = deps.outDir ?? path.join(deps.dshHome, 'storages', 'dsh-remote-dafeiyu', 'sprite-out')

  let service: SpriteService | undefined
  if (deps.enabled === false) {
    probe.service = 'disabled'
  } else if (!existsSync(toolHtmlPath)) {
    probe.service = `missing-tool-html: ${toolHtmlPath}`
    deps.log('序列帧工具页不存在（工具不会注册）', { path: toolHtmlPath })
  } else {
    try {
      service = createSpriteService({ toolHtmlPath, outDir, log: deps.log })
      probe.service = 'ready'
      // 启动清理：宿主上次被强杀时留下的无头浏览器，父进程已经没了，这里收掉。
      // 判据是"父进程不存在"，所以不会误杀另一个还在跑的 DSH 实例里的浏览器。
      void sweepOrphanBrowsers(deps.log)
        .then((count) => {
          if (count > 0) probe.orphansSwept = String(count)
        })
        .catch(() => undefined)
    } catch (error) {
      service = undefined
      probe.service = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    }
  }

  // ── 工具注册 ──
  let toolCount = 0
  if (service) {
    try {
      const tools = ctx.get?.('tools', true) as
        | { register?: (definition: Record<string, unknown>) => unknown }
        | undefined
      if (tools && typeof tools.register === 'function') {
        const definitions = buildTools(service)
        for (const definition of definitions) tools.register(definition)
        toolCount = definitions.length
        probe.tools = `registered(${toolCount})`
      } else {
        probe.tools = 'no-tools'
      }
    } catch (error) {
      probe.tools = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    }
  } else {
    probe.tools = 'skipped'
  }

  // ── 提示段 ──
  try {
    const systemPrompt = ctx.get?.('systemPrompt', true) as
      | { section?: (definition: { name: string; order: number; text: string }) => unknown }
      | undefined
    if (service && systemPrompt && typeof systemPrompt.section === 'function') {
      systemPrompt.section({ name: 'dafeiyu:sprite', order: 10091, text: SPRITE_GUIDANCE })
      probe.section = 'registered'
    } else {
      probe.section = service ? 'no-systemPrompt' : 'skipped'
    }
  } catch (error) {
    probe.section = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
  }

  // ── 工具页托管（给人用）──
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false
  const tryStart = (): void => {
    if (started || stopped || !web || !service) return
    started = true
    try {
      unregister = web.register({
        kind: 'exact',
        path: SPRITE_PAGE_ROUTE,
        handler: spritePageHandler({ toolHtmlPath, log: deps.log }),
      })
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
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
        /* 注销失败不许拖住停机 */
      }
      // 子进程必须在停机时收掉：这里不能 await，所以挂一个不会抛的 then。
      void service?.stop().catch(() => undefined)
    },
  }
}
