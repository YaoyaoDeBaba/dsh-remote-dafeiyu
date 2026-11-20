/**
 * websearch/start —— 联网搜索的接线：只软探测 tools 服务（没路由、没后台任务）。
 *
 * 与 groups/start.ts 同一套纪律：500ms × 60 拍等 tools，失败只写 probe + 一行中文日志，
 * 绝不把远控主链路带下去。stop 幂等。
 *
 * 为什么要单独记一个 fetch 探针：工具全都要发 HTTP，而「本机 Node 没有全局 fetch」
 * 这个故障在日志里长得跟「网不通」一模一样——先把这条判掉，排错少走一天。
 */
import path from 'node:path'
import { buildExtraTools } from './extra.js'
import { buildWebsearchTools } from './tools.js'
import { readWebsearchSkillBody } from './skill.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
}

export interface WebsearchHandle {
  stop(): void
  readonly probe: Record<string, string>
}

export interface WebsearchStartInput {
  /** 包根目录（读 assets/skills/dafeiyu-websearch/SKILL.md）。 */
  packageRoot: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export function startWebsearch(ctx: LooseContext, input: WebsearchStartInput): WebsearchHandle {
  const probe: Record<string, string> = {}
  const skillDir = path.join(input.packageRoot, 'assets', 'skills', 'dafeiyu-websearch')

  let toolsRegistered = false
  let stopped = false
  let toolTimer: ReturnType<typeof setInterval> | undefined

  probe.fetch = typeof (globalThis as { fetch?: unknown }).fetch === 'function' ? 'ok' : 'none'
  if (probe.fetch === 'none') {
    input.log('这台机器的 Node 没有全局 fetch：联网搜索只能返回 guide，工具会报中文错（远控不受影响）')
  }

  const acceptTools = (value: unknown, via: string): boolean => {
    if (toolsRegistered) return true
    if (!value || typeof value !== 'object') return false
    const host = value as { register?: (definition: Record<string, unknown>) => unknown }
    if (typeof host.register !== 'function') {
      probe.tools = 'object without register()'
      return false
    }
    try {
      /*
       * 核心五个（web_search / paper_search / paper_read / repo_search / websearch_guide）
       * + 三个定向检索（code_search / graphics_papers / hn_search）。
       * extra 那几个是独立文件、零依赖，由这里合并注册——它的作者没碰本文件，避免抢同一个文件。
       */
      const definitions = [
        ...buildWebsearchTools({
          guideBody: () => readWebsearchSkillBody(skillDir),
          log: input.log,
        }),
        ...buildExtraTools(),
      ]
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
          input.log('联网搜索工具没挂上：等了 30 秒没等到 tools（远控不受影响）')
        }
      }, 500)
    } catch (error) {
      probe.tools = 'poll threw: ' + String((error as Error)?.message ?? error).slice(0, 80)
    }
  }

  return {
    probe,
    stop(): void {
      stopped = true
      try {
        if (toolTimer !== undefined) clearInterval(toolTimer)
      } catch {
        /* 停机不许抛 */
      }
    },
  }
}
