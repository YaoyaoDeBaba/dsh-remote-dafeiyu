/**
 * groups/start —— 拉群的接线（2026-11-19 v2）：软探测 tools 与 webServer。
 *
 * 两块各自独立失败：工具挂不上 = agent 侧没有 group_*；路由挂不上 = 面板打不开。
 * 两个都只写 probe + 一行中文日志，不影响远控主链路。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { createGroups, type Groups } from './service.js'
import { buildGroupTools } from './tools.js'
import { groupsHandlers, type GroupsRouteDeps } from './routes.js'
import { readGroupsSkillBody } from './skill.js'

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

export interface GroupsHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly service: Groups
}

export interface GroupsStartInput {
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 把一段文本（可带图，2026-11-25 需求⑥）送进某个会话（插件层 sendPrompt）。 */
  deliver: (
    sessionId: string,
    text: string,
    images?: ReadonlyArray<{ data: string; mimeType: string }>,
  ) => Promise<{ ok: boolean; message?: string }>
  /** 会话标题（名单里显示名字用，可选）。 */
  titleOf?: (sessionId: string) => string | undefined
  /** 候选会话（面板拉人用，可选）。 */
  listSessions?: () => Promise<Array<{ id: string; title?: string; updatedAt?: string }>>
  /** 包根目录（读 assets/skills/dafeiyu-groups/SKILL.md）。 */
  packageRoot: string
  /** 群聊纪律是否已挂成常驻 system 段（方案 A）：true 时消息尾巴精简成一行。 */
  sectionReady?: () => boolean
}

export function startGroups(ctx: LooseContext, input: GroupsStartInput): GroupsHandle {
  const probe: Record<string, string> = {}
  const skillDir = path.join(input.packageRoot, 'assets', 'skills', 'dafeiyu-groups')
  const groups = createGroups({
    dir: path.join(input.dshHome, 'storages', 'dsh-remote-dafeiyu', 'groups'),
    deliver: async (sessionId, text) => input.deliver(sessionId, text),
    ...(input.titleOf === undefined ? {} : { titleOf: input.titleOf }),
    ...(input.sectionReady === undefined ? {} : { sectionReady: input.sectionReady }),
    log: input.log,
  })

  let toolsRegistered = false
  let stopped = false
  let toolTimer: ReturnType<typeof setInterval> | undefined
  const disposers: Array<() => void> = []

  const acceptTools = (value: unknown, via: string): boolean => {
    if (toolsRegistered) return true
    if (!value || typeof value !== 'object') return false
    const host = value as { register?: (definition: Record<string, unknown>) => unknown }
    if (typeof host.register !== 'function') {
      probe.tools = 'object without register()'
      return false
    }
    try {
      const definitions = buildGroupTools({
        groups,
        guideBody: () => readGroupsSkillBody(skillDir),
        log: input.log,
      })
      for (const definition of definitions) host.register(definition)
      toolsRegistered = true
      probe.tools = via + ':' + definitions.length
      return true
    } catch (error) {
      probe.tools = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
  }

  // tools 是晚到服务：先试一次，再 500ms × 60 拍
  const tryToolsOnce = (via: string): boolean => {
    let value: unknown
    try {
      value = ctx.get?.('tools', true)
    } catch (error) {
      probe.tools = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
    return acceptTools(value, via)
  }
  tryToolsOnce('via get')
  if (!toolsRegistered) {
    let attempts = 0
    try {
      toolTimer = setInterval(() => {
        attempts += 1
        if (stopped || toolsRegistered) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          return
        }
        if (tryToolsOnce('via poll')) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          return
        }
        if (attempts >= 60) {
          if (toolTimer !== undefined) clearInterval(toolTimer)
          probe.tools = (probe.tools ?? 'none') + ' (poll gave up after ' + attempts + ')'
          input.log('拉群工具没挂上：等了 30 秒没等到 tools（远控不受影响）')
        }
      }, 500)
    } catch (error) {
      probe.tools = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
    }
  }

  // webServer：面板路由（软探测 + inject 等它）
  let web: Registerable | undefined
  let routesOn = false
  const routeDeps: GroupsRouteDeps = {
    groups,
    ...(input.listSessions === undefined ? {} : { listSessions: input.listSessions }),
    log: input.log,
  }
  const tryRoutes = (): void => {
    if (routesOn || stopped || !web) return
    routesOn = true
    try {
      for (const route of groupsHandlers(routeDeps)) {
        disposers.push(web.register({ kind: 'exact', path: route.path, handler: route.handler }))
      }
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      routesOn = false
      input.log('拉群路由挂不上（远控不受影响）', { message: probe.routes })
    }
  }
  const acceptWeb = (value: unknown, via: string): void => {
    if (!value || typeof value !== 'object') return
    if (typeof (value as Registerable).register !== 'function') {
      probe.webServer = 'object without register()'
      return
    }
    web = value as Registerable
    probe.webServer = via
    tryRoutes()
  }
  try {
    const found = ctx.get?.('webServer', true)
    if (found) acceptWeb(found, 'via get')
    else probe.webServer = 'none'
  } catch (error) {
    probe.webServer = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
  }
  try {
    ctx.inject?.(['webServer'], ((...args: unknown[]) => {
      /*
       * 回调给的东西**不保证是服务本身**（有的宿主把 ctx 传回来，有的一个参数都不给）。
       * 所以逐个候选试：显式参数 → 参数里的 ctx → 我们自己手里的 ctx。
       * 2026-11-19：漏了这条候选，`webServer` 晚到的场景下群面板一条路由都挂不上。
       */
      try {
        for (const candidate of [...args, ctx]) {
          const fromGet = (candidate as { get?: (name: string, optional: true) => unknown })?.get?.('webServer', true)
          if (fromGet) {
            acceptWeb(fromGet, 'via inject')
            if (routesOn) return
          }
          acceptWeb(candidate, 'via inject')
          if (routesOn) return
        }
      } catch {
        /* inject 回调里的异常不许冒 */
      }
    }) as never)
  } catch {
    /* 没有 inject 就算了：probe 里已经有 webServer 的状态 */
  }

  return {
    probe,
    service: groups,
    stop(): void {
      stopped = true
      try {
        if (toolTimer !== undefined) clearInterval(toolTimer)
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
    },
  }
}
