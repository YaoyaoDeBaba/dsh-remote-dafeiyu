/**
 * subagents/start — 宿主侧接线：软探测 `webServer` 挂一条只读路由。
 *
 * 与识图/记忆同一条纪律：**不写 `inject:` 闸门**，这一半挂不上，远控一行都不受影响；
 * `stop()` 幂等；失败写 `probe` + 一行日志，不静默。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  SUBAGENTS_ARCHIVE_ROUTE,
  SUBAGENTS_CONFIG_ROUTE,
  GUIDANCE_PUSH_ROUTE,
  SUBAGENTS_STREAM_ROUTE,
  streamClients,
  subagentsStreamHandler,
  guidancePushHandler,
  SUBAGENTS_ROUTE,
  subagentsArchiveHandler,
  subagentsConfigHandler,
  subagentsHandler,
  type SubagentRouteDeps,
} from './routes.js'
import { readSubagentsConfig, resolveSubagentsConfigFile, writeSubagentsConfig, type SubagentsConfig } from './config.js'
import type { KernelSubagent } from '../ports/index.js'
import { SUBAGENT_GUIDANCE, subagentGuidance } from './guidance.js'
import { createGuidancePusher, type GuidancePushResult } from './pusher.js'
import { subagentBus } from './bus.js'
import { readXyqConfig, resolveXyqConfigFile } from '../xyq/config.js'
import { xyqGuidance } from '../xyq/guidance.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
}

// 派活规范（提示词段）的唯一一份：设置页预览与模型注入同源，避免两处分叉。
const GUIDANCE = SUBAGENT_GUIDANCE

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
  input: Omit<SubagentRouteDeps, 'log' | 'config'> & {
    dshHome: string
    log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  },
): SubagentsHandle {
  const probe: Record<string, string> = {}
  const configFile = resolveSubagentsConfigFile(input.dshHome)
  let config: SubagentsConfig = readSubagentsConfig(configFile)
  const configFace = {
    read: (): SubagentsConfig => config,
    write: (patch: unknown): SubagentsConfig => {
      config = writeSubagentsConfig(configFile, patch)
      return config
    },
  }
  // 推送：懒取 agents（启动时服务可能还没就绪），每次推送现取一次在线列表。
  const pusher = createGuidancePusher(() => {
    try {
      return (ctx.get?.('agents', true) as unknown) ?? undefined
    } catch {
      return undefined
    }
  })
  const xyqConfigFile = resolveXyqConfigFile(input.dshHome)
  const guidanceTexts: Record<'subagent' | 'xyq', string> = {
    get subagent(): string {
      return subagentGuidance(config.mode)
    },
    get xyq(): string {
      return xyqGuidance(readXyqConfig(xyqConfigFile).freedom)
    },
  }
  const deps: SubagentRouteDeps = {
    ...input,
    config: configFace,
    guidanceText: () => subagentGuidance(config.mode),
    pushGuidance: async (which: 'subagent' | 'xyq' | 'both', sessionId?: string, mode?: string): Promise<GuidancePushResult> => {
      const merged: GuidancePushResult = { total: 0, pushed: 0, failed: 0, errors: [] }
      const targets: Array<'subagent' | 'xyq'> = which === 'both' ? ['subagent', 'xyq'] : [which]
      for (const target of targets) {
        const text = target === 'subagent' && mode !== undefined
          ? subagentGuidance(mode)
          : guidanceTexts[target]
        const one = await pusher(
          text,
          target === 'subagent' ? '派活规范（子代理监视器）' : '小云雀工具使用说明',
          sessionId,
        )
        merged.total = Math.max(merged.total, one.total)
        merged.pushed += one.pushed
        merged.failed += one.failed
        merged.errors.push(...one.errors)
      }
      return merged
    },
  }
  // 提示词段：插件激活就告诉模型「按 名称｜简述 派活」。拿不到 systemPrompt 只是少一段提示。
  // 配置里 guidance=false 就不注入（改开关要重启宿主才生效，与识图同一条纪律）。
  if (!config.guidance) probe.section = 'disabled-by-config'
  else try {
    const systemPrompt = ctx.get?.('systemPrompt', true) as
      | { section?: (definition: { name: string; order: number; text: string }) => unknown }
      | undefined
    if (systemPrompt && typeof systemPrompt.section === 'function') {
      // 动态取文本：mode 改了下一轮重新装配时就能生效，不需要重启。
    systemPrompt.section({
      name: 'dafeiyu:subagents',
      order: 10090,
      // 宿主类型写的是 string，但 assemble 时会调用函数（见 dsh-system-prompt 的 section.text 分支）。
      text: (() => subagentGuidance(config.mode)) as unknown as string,
    })
      probe.section = 'registered'
    } else {
      probe.section = 'no-systemPrompt'
    }
  } catch (error) {
    probe.section = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
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
      disposers.push(web.register({ kind: 'exact', path: SUBAGENTS_ROUTE, handler: subagentsHandler(deps) }))
      disposers.push(
        web.register({ kind: 'exact', path: SUBAGENTS_ARCHIVE_ROUTE, handler: subagentsArchiveHandler(deps) }),
      )
      disposers.push(
        web.register({ kind: 'exact', path: SUBAGENTS_CONFIG_ROUTE, handler: subagentsConfigHandler(deps) }),
      )
      disposers.push(web.register({ kind: 'exact', path: GUIDANCE_PUSH_ROUTE, handler: guidancePushHandler(deps) }))
      disposers.push(web.register({ kind: 'exact', path: SUBAGENTS_STREAM_ROUTE, handler: subagentsStreamHandler() }))
      unregister = () => {
        for (const dispose of disposers) dispose()
      }
      probe.routes = 'registered'
      deps.log('子代理监视器路由已挂上')
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      // 挂上一半就抛：已经挂上的那几条必须还能收回（停机/卸载时统一走 unregister）
      if (disposers.length > 0) {
        const registered = disposers.splice(0)
        unregister = () => {
          for (const dispose of registered) dispose()
        }
      }
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

  /**
   * 事件总线 → SSE 的桥。
   *
   * 2026-11-11 之前这座桥是**断的**：`emitSubagentChange()` 在内核事件里被调用，
   * 但没有任何地方订阅它，`streamClients` 也就永远收不到数据。表现是面板的 EventSource
   * 连上了却不刷新（连上就不会触发退化轮询），"事件驱动"名存实亡。
   * 总线本身 400ms 合并一次，这里只负责写给订阅者；写失败（客户端已断）就把它摘掉。
   */
  const onBusChange = (): void => {
    for (const client of streamClients) {
      try {
        client.write('data: change\n\n')
      } catch {
        streamClients.delete(client)
      }
    }
  }
  try {
    subagentBus.on('change', onBusChange)
    probe.bus = 'subscribed'
  } catch (error) {
    probe.bus = `subscribe threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }

  return {
    probe,
    stop(): void {
      if (stopped) return
      stopped = true
      try {
        subagentBus.removeListener('change', onBusChange)
      } catch {
        /* 退不掉也不许拖住停机 */
      }
      try {
        unregister?.()
      } catch {
        /* 注销失败不许拖住停机 */
      }
    },
  }
}
