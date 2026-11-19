/**
 * groups/tools —— 给 agent 的「拉群」六个工具（2026-11-19）。
 *
 * 场景：前后端联调——两个（或多个）**顶层会话**各自干各自的，需要互相把结论同步过去。
 * 内核没有顶层互发的 API，插件用 sendPrompt 当邮差，所以这里只管「谁在群里、说了什么」。
 *
 * 形态照插件契约（§2）：六键齐、output.schema.type === 'string'、execute 返回字符串、
 * 出错抛中文原因。
 */
import { resolveSessionId } from '../handoff/tools.js'
import type { Groups } from './service.js'

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
  ],
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter((item) => item !== '') : []
}

export function buildGroupTools(deps: {
  groups: Groups
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}): Array<Record<string, unknown>> {
  return [
    {
      name: 'group_create',
      description:
        '拉一个群，把指定的顶层会话放进去，之后用 group_send 互相说话（典型用途：前后端联调时两个会话同步接口/字段结论）。\n' +
        '默认把自己也算进群；sessionIds 传别的顶层会话 id。建完返回 groupId，后面都用它。\n' +
        '群消息会逐条送进每个成员的会话（占用它们各自的上下文），所以只说必须让对方知道的。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '群名，例如「前后端联调」。' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: '要拉进来的其他会话 id（可多个）。' },
          includeMe: { type: 'boolean', description: '要不要把自己也放进去，默认 true。' },
        },
        required: ['name'],
      },
      output: OUT,
      timeoutMs: 15_000,
      async execute(args: unknown, exec?: unknown): Promise<string> {
        const input = (args ?? {}) as { name?: unknown; sessionIds?: unknown; includeMe?: unknown }
        const me = resolveSessionId(exec)
        const created = deps.groups.create({
          name: asString(input.name),
          members: asStringList(input.sessionIds),
          ...(input.includeMe === false || me === undefined ? {} : { me }),
        })
        deps.log('agent 建群', { ok: String(created.ok) })
        return JSON.stringify(created)
      },
    },
    {
      name: 'group_invite',
      description: '往已有的群里加成员（不额外发消息）。成员上限 12。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id（group_create 返回的那个）。' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: '要拉的会话 id。' },
        },
        required: ['groupId', 'sessionIds'],
      },
      output: OUT,
      timeoutMs: 15_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; sessionIds?: unknown }
        return JSON.stringify(
          deps.groups.invite({ id: asString(input.groupId), members: asStringList(input.sessionIds) }),
        )
      },
    },
    {
      name: 'group_leave',
      description: '让自己退出某个群（不再收到它的消息）。',
      parameters: {
        type: 'object',
        properties: { groupId: { type: 'string', description: '群 id。' } },
        required: ['groupId'],
      },
      output: OUT,
      timeoutMs: 15_000,
      async execute(args: unknown, exec?: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown }
        const me = resolveSessionId(exec)
        if (me === undefined) return JSON.stringify({ ok: false, message: '拿不到当前会话 id，退不了群。' })
        return JSON.stringify(deps.groups.leave({ id: asString(input.groupId), sessionId: me }))
      },
    },
    {
      name: 'group_list',
      description: '列出这台机器上所有的群（名字、id、成员）。找 groupId 时用。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 15_000,
      async execute(): Promise<string> {
        const groups = deps.groups.list().map((group) => ({
          id: group.id,
          name: group.name,
          members: group.members.map((member) => member.sessionId),
          updatedAt: group.updatedAt,
        }))
        return JSON.stringify({ ok: true, groups })
      },
    },
    {
      name: 'group_send',
      description:
        '往群里发一条：逐条送进其他成员的会话（自己那份不重发）。发送前先落盘，送不到的会列在 failed 里。\n' +
        '只说对方必须知道的事（接口变了、字段改名、谁在等谁）；单条上限 4000 字。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          message: { type: 'string', description: '要说的话。' },
        },
        required: ['groupId', 'message'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown, exec?: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; message?: unknown }
        const me = resolveSessionId(exec)
        if (me === undefined) return JSON.stringify({ ok: false, message: '拿不到当前会话 id，发不出去。' })
        const sent = await deps.groups.send({ id: asString(input.groupId), from: me, text: String(input.message ?? '') })
        deps.log('agent 群发', { ok: String(sent.ok) })
        return JSON.stringify(sent)
      },
    },
    {
      name: 'group_read',
      description: '读群里的最近消息（默认 20 条，最多 100）。补上下文用，别每轮都读。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          limit: { type: 'integer', minimum: 1, maximum: 100, description: '取最近几条，默认 20。' },
        },
        required: ['groupId'],
      },
      output: OUT,
      timeoutMs: 15_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; limit?: unknown }
        const read = deps.groups.read({
          id: asString(input.groupId),
          ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
        })
        return JSON.stringify(read)
      },
    },
  ]
}
