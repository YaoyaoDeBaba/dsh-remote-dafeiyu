/**
 * memory/start — 记忆库的宿主侧接线：挂读写路由、provide 服务、注册三个工具。
 *
 * 纪律与识图那边同款：
 * 1. 不写 `inject:` 闸门；起不来只是少一块功能。
 * 2. `stop()` 幂等，注销抛错只吞不抛。
 * 3. 工具拿不到「当前人设」时落到 `default` 一档：宁可记到默认名下，也不许静默丢。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { registerMemoryRoutes } from './routes.js'
import { createMemoryService, type MemoryService } from './service.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
  provide?(name: string, value: unknown): unknown
}

interface Registerable {
  register(route: { kind: 'exact'; path: string; handler: (request: IncomingMessage, response: ServerResponse) => unknown }): () => void
}

export interface MemoryHandle {
  stop(): void
  readonly probe: Record<string, string>
  readonly available: boolean
  readonly service: MemoryService
}

export const MEMORY_SERVICE_NAME = 'dafeiyuMemory'

/** 「当前人设」问询：优先人设宿主提供的 `dafeiyuPersona`，没有就 default。 */
function resolvePersonaId(ctx: LooseContext): string {
  try {
    const provider = ctx.get?.('dafeiyuPersona', true) as { lastPersonaId?: () => unknown } | undefined
    const id = provider?.lastPersonaId?.()
    if (typeof id === 'string' && id !== '') return id
  } catch {
    /* 这一代宿主没有人设服务 */
  }
  return 'default'
}

function registerTools(ctx: LooseContext, service: MemoryService): void {
  const tools = ctx.get?.('tools', true) as { register?: (definition: Record<string, unknown>) => unknown } | undefined
  if (!tools || typeof tools.register !== 'function') return
  const personaOf = (args: Record<string, unknown>): string =>
    typeof args.persona === 'string' && args.persona.trim() !== '' ? args.persona.trim() : resolvePersonaId(ctx)

  tools.register({
    name: 'record_memory',
    description: '把一条值得长期记住的事写进大肥鱼的记忆库（跨会话有效）：用户的偏好、称呼、约定、重要事实。一次一句、自包含。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '要记住的一句话' },
        importance: { type: 'integer', minimum: 1, maximum: 3, description: '1 普通 / 2 重要 / 3 关键' },
        persona: { type: 'string', description: '可选：写到哪个人设名下（默认当前人设）' },
      },
      required: ['content'],
    },
    output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
    timeoutMs: 15_000,
    async execute(args: Record<string, unknown>): Promise<string> {
      const persona = personaOf(args)
      const result = service.add(persona, String(args.content ?? ''), { importance: args.importance, source: 'tool' })
      if (!result.ok) throw new Error(result.error)
      return `已记住（${persona}，第 ${service.list(persona).length} 条）：${result.entry.text}`
    },
  })

  tools.register({
    name: 'read_memory',
    description: '读大肥鱼的长期记忆。query 可选：给了词就只返回包含它的条目，不给返回全部（按重要度排序）。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '可选关键词' },
        persona: { type: 'string', description: '可选：读哪个人设的记忆（默认当前人设）' },
      },
    },
    output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
    timeoutMs: 10_000,
    async execute(args: Record<string, unknown>): Promise<string> {
      const persona = personaOf(args)
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const entries = service
        .list(persona)
        .filter((entry) => query === '' || entry.text.includes(query))
      if (entries.length === 0) return query === '' ? '（还没有记忆）' : `（没有包含「${query}」的记忆）`
      return entries.map((entry) => {
        const level = entry.importance === 3 ? '关键' : entry.importance === 2 ? '重要' : '普通'
        return `${entry.createdAt.slice(0, 10)} [${level}] ${entry.text}（id=${entry.id}）`
      }).join('\n')
    },
  })

  tools.register({
    name: 'forget_memory',
    description: '删掉一条记忆（用 read_memory 返回的 id）。用户明确说「忘掉这个」时才用。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '记忆条目的 id' },
        persona: { type: 'string', description: '可选：哪个人设的记忆（默认当前人设）' },
      },
      required: ['id'],
    },
    output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
    timeoutMs: 10_000,
    async execute(args: Record<string, unknown>): Promise<string> {
      const persona = personaOf(args)
      const removed = service.remove(persona, String(args.id ?? ''))
      return removed ? '已删掉那条记忆' : '没有这条记忆（id 可能不对）'
    },
  })
}

export function startMemory(
  ctx: LooseContext,
  deps: { dshHome: string; log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void },
): MemoryHandle {
  const service = createMemoryService(deps.dshHome)
  const probe: Record<string, string> = {}
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false

  const tryStart = (): void => {
    if (started || stopped || !web) return
    started = true
    try {
      unregister = registerMemoryRoutes(web, { service, log: deps.log })
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
      return
    }
    deps.log('记忆路由已挂上', { dir: service.dir })
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
      } catch {
        /* 晚到回调里的异常不许穿出去 */
      }
    }) as never)
  } catch {
    /* inject 本身不可用 */
  }

  try {
    ctx.provide?.(MEMORY_SERVICE_NAME, {
      get dir() {
        return service.dir
      },
      list: (persona: string) => service.list(persona),
      counts: () => service.counts(),
      textFor: (persona: string, budget?: number) => service.textFor(persona, budget),
    })
    probe.provide = 'ok'
  } catch (error) {
    probe.provide = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }

  try {
    registerTools(ctx, service)
    probe.tools = 'registered'
  } catch (error) {
    probe.tools = `threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    const off = unregister
    unregister = undefined
    try {
      off?.()
    } catch {
      /* 宿主可能已经先一步把 webServer 拆了 */
    }
    if (started) deps.log('记忆路由已停')
  }

  return {
    stop,
    probe,
    service,
    get available() {
      return !stopped && started && probe.routes === 'registered'
    },
  }
}
