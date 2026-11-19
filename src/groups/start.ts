/**
 * groups/start —— 宿主接线：软探测 tools，把「拉群」六个工具挂上去（2026-11-19）。
 *
 * 与转生/识图同一条纪律：
 * 1. 不写 inject 闸门——这一半挂不上，远控/人设一行都不受影响；
 * 2. tools 是**晚到服务**：apply 期间 ctx.get 可能还是 undefined，所以先试一次，
 *    再按 500ms × 60 拍轮询（30 秒收手），失败写进 probe + 一行中文日志；
 * 3. stop() 幂等。
 */
import path from 'node:path'
import { createGroups, type Groups } from './service.js'
import { buildGroupTools } from './tools.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
}

export interface GroupsHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly service: Groups
}

export interface GroupsStartInput {
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 把一段文本送进某个会话（插件层 sendPrompt）。 */
  deliver: (sessionId: string, text: string) => Promise<{ ok: boolean; message?: string }>
}

export function startGroups(ctx: LooseContext, input: GroupsStartInput): GroupsHandle {
  const probe: Record<string, string> = {}
  const groups = createGroups({
    dir: path.join(input.dshHome, 'storages', 'dsh-remote-dafeiyu', 'groups'),
    deliver: async (sessionId, text) => input.deliver(sessionId, text),
    log: input.log,
  })
  let registered = false
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined

  const accept = (value: unknown, via: string): boolean => {
    if (registered) return true
    if (!value || typeof value !== 'object') return false
    const tools = value as { register?: (definition: Record<string, unknown>) => unknown }
    if (typeof tools.register !== 'function') {
      probe.tool = 'object without register()'
      return false
    }
    try {
      const definitions = buildGroupTools({ groups, log: input.log })
      for (const definition of definitions) tools.register(definition)
      registered = true
      probe.tool = via + ':' + definitions.length
      return true
    } catch (error) {
      probe.tool = 'register threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
  }

  const tryOnce = (via: string): boolean => {
    let value: unknown
    try {
      value = ctx.get?.('tools', true)
    } catch (error) {
      probe.tool = 'get threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
      return false
    }
    return accept(value, via)
  }

  tryOnce('via get')
  if (!registered) {
    let attempts = 0
    try {
      timer = setInterval(() => {
        attempts += 1
        if (stopped || registered) {
          if (timer !== undefined) clearInterval(timer)
          return
        }
        if (tryOnce('via poll')) {
          if (timer !== undefined) clearInterval(timer)
          return
        }
        if (attempts >= 60) {
          if (timer !== undefined) clearInterval(timer)
          probe.tool = (probe.tool ?? 'none') + ' (poll gave up after ' + attempts + ')'
          input.log('拉群工具没挂上：等了 30 秒没等到 tools（远控不受影响）')
        }
      }, 500)
    } catch (error) {
      probe.tool = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
    }
  }

  return {
    probe,
    service: groups,
    stop(): void {
      stopped = true
      try {
        if (timer !== undefined) clearInterval(timer)
      } catch {
        /* 停机不许抛 */
      }
    },
  }
}
