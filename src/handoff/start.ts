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
import { createHandoffService, type HandoffDeps, type HandoffService } from './service.js'
import { createInbox } from './inbox.js'

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
    /** 读会话标题（转世要叫「<前世名>转世<N>」）。拿不到就不改名，不编名字。 */
    sessionTitle?: (sessionId: string) => Promise<string | undefined> | string | undefined
    /** 改会话标题（端口可能没有这一代）。 */
    renameSession?: (sessionId: string, title: string) => Promise<{ ok: boolean; message?: string }>
    /**
     * 群交接（2026-11-20 方案 S1/S4/S5/S6/S7）。可选：没有群就没这回事。
     *
     * 为什么在插件这边做而不是让前世自己做：转生到点后前世的工具可能已经被收走，
     * 它没法自己去群里发预告、拉人、改名片。
     */
    groupHandover?: HandoffDeps['groupHandover']
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
    ...(input.sessionTitle === undefined ? {} : { sessionTitle: input.sessionTitle }),
    ...(input.renameSession === undefined ? {} : { renameSession: input.renameSession }),
    ...(input.groupHandover === undefined ? {} : { groupHandover: input.groupHandover }),
  })
  /*
   * 收件箱（2026-11-17）：前世 ↔ 来生的电话线。
   * deliver 直接用宿主的 sendPrompt —— 转生投递首句走的就是它，能到任意会话。
   */
  const inbox = createInbox({
    dir: `${input.handoffDir ?? resolveHandoffDir()}\\inbox`,
    deliver: async (sessionId, text) => input.sendPrompt(sessionId, text),
    log: input.log,
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
      inbox: { ask: (askInput) => inbox.ask(askInput), answer: (answerInput) => inbox.answer(answerInput) },
      handoffDir: input.handoffDir ?? resolveHandoffDir(),
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

/**
 * 拿 tools 服务：先同步试一次，再**轮询**（最多 30 秒）。
 *
 * 为什么不用"只 inject 一次"：真机上 `tools` 在 apply 期间还没就位，
 * 而 inject 回调会不会来、什么时候来，取决于内核的装载顺序——这条路我在真机上验过没生效。
 * 轮询对"晚到服务"是最稳的：服务一出现，下一拍就注册上。
 */
let toolsTimer: ReturnType<typeof setInterval> | undefined
const tryToolsOnce = (via: string): boolean => {
  let value: unknown
  try {
    value = ctx.get?.('tools', true)
  } catch (error) {
    probe.tool = `get threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
    return false
  }
  if (!value) {
    // 直接属性访问在某些内核里会抛（没有 inject 声明时），包一层
    try {
      value = (ctx as unknown as Record<string, unknown>)['tools']
    } catch {
      value = undefined
    }
  }
  return acceptTools(value, via)
}

tryToolsOnce('via get')
if (!toolsRegistered) {
  let attempts = 0
  try {
    toolsTimer = setInterval(() => {
      attempts += 1
      if (toolsRegistered) {
        if (toolsTimer !== undefined) clearInterval(toolsTimer)
        return
      }
      if (tryToolsOnce('via poll')) {
        if (toolsTimer !== undefined) clearInterval(toolsTimer)
        return
      }
      // 30 秒（60 拍）还没等到就收手，别再空转
      if (attempts >= 60) {
        if (toolsTimer !== undefined) clearInterval(toolsTimer)
        probe.tool = `${probe.tool ?? 'none'} (poll gave up after ${attempts})`
      }
    }, 500)
  } catch (error) {
    probe['pollThrew:tools'] = String((error as Error)?.message ?? error).slice(0, 160)
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
      try {
        if (toolsTimer !== undefined) clearInterval(toolsTimer)
      } catch {
        /* 清理不许抛 */
      }
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
