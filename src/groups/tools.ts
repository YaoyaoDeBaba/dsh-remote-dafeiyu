/**
 * groups/tools —— 给 agent 的拉群工具（2026-11-19 v2）。
 *
 * 语义（用户 2026-11-19 定的）：群是**给用户看的记录**；agent 之间看不到群里的整段消息，
 * 只收到自己被 @ 的那条（带本轮协作对象）。所以这里没有「发给全群」的广播工具，
 * 只有 post（可以带 to 点名）。
 */
import { resolveSessionId } from '../handoff/tools.js'
import { ECHO_DISCIPLINE, shortId, type Groups } from './service.js'

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
  /** skill 正文（单一真源，别在这里复制文案）。 */
  guideBody: () => string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}): Array<Record<string, unknown>> {
  return [
    {
      name: 'group_create',
      description:
        '拉一个群，把指定的顶层会话放进去（典型用途：前后端联调时两个会话同步接口/字段结论）。\n' +
        '默认把自己也算进群；被拉进来的人会收到一条入群通知（含名单与用法）。返回 groupId。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '群名，例如「前后端联调」。' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: '要拉进来的其他会话 id。' },
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
          ...(me === undefined ? {} : { me }),
          ...(input.includeMe === false ? { includeMe: false } : {}),
        })
        deps.log('agent 建群', { ok: String(created.ok) })
        // 建完就唤醒成员（否则他们不知道自己进了群，要用户手动喊一声）
        if (created.ok && created.group !== undefined) {
          const announced = await deps.groups.announce({ id: created.group.id, ...(me === undefined ? {} : { except: me }) })
          return JSON.stringify({ ...created, announced })
        }
        return JSON.stringify(created)
      },
    },
    {
      name: 'group_invite',
      description: '往已有的群里加成员，并给每个新成员发入群通知（名单 + 用法）。成员上限 12。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          sessionIds: { type: 'array', items: { type: 'string' }, description: '要拉的会话 id。' },
        },
        required: ['groupId', 'sessionIds'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; sessionIds?: unknown }
        const result = await deps.groups.invite({
          id: asString(input.groupId),
          members: asStringList(input.sessionIds),
        })
        return JSON.stringify(result)
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
      description: '列出这台机器上所有的群（名字、id、成员短号）。找 groupId 时用。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 15_000,
      async execute(): Promise<string> {
        const groups = deps.groups.list().map((group) => ({
          id: group.id,
          name: group.name,
          members: group.members.map((member) => ({ sessionId: member.sessionId, label: member.label })),
          updatedAt: group.updatedAt,
        }))
        return JSON.stringify({ ok: true, groups })
      },
    },
    {
      name: 'group_post',
      description:
        '往群里说一句（记给用户看）。带 to 就把这句话**单独投给那几个人**（自己那份不重发）；不带 to 只入记录、不打扰人。\n' +
        '群里其他人看不到整段群聊——只有你 @ 的人会收到这条。单条上限 4000 字。\n' +
        '**不要为了回一句而回**：' +
        ECHO_DISCIPLINE +
        '\n同一对会话 10 分钟内 agent ↔ agent 连续确认类（收到/好的/明白）超过 3 条后，插件会直接丢弃后续投递（返回「互吹闸：…本次不投递」）——' +
        '看到这句就说明该停下了，别再原样重发。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          text: { type: 'string', description: '要说的话。' },
          to: { type: 'array', items: { type: 'string' }, description: '要投给谁（会话 id 或短号），不填就只入记录。' },
        },
        required: ['groupId', 'text'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown, exec?: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; text?: unknown; to?: unknown }
        const me = resolveSessionId(exec)
        if (me === undefined) return JSON.stringify({ ok: false, message: '拿不到当前会话 id，发不出去。' })
        // to 允许写短号：群里记的就是短号，模型手上不一定有全 id
        const raw = asStringList(input.to)
        const group = deps.groups.get(asString(input.groupId))
        const targets = raw.map((item) => {
          if (group === undefined) return item
          if (group.members.some((member) => member.sessionId === item)) return item
          const hit = group.members.find((member) => shortId(member.sessionId) === item)
          return hit === undefined ? item : hit.sessionId
        })
        const posted = await deps.groups.post({
          id: asString(input.groupId),
          from: me,
          text: String(input.text ?? ''),
          targets,
          kind: 'agent',
        })
        deps.log('agent 群发', { ok: String(posted.ok) })
        return JSON.stringify(posted)
      },
    },
    {
      name: 'group_set_owner',
      description:
        '指定 / 更换群主（必须是群成员）。用户 @ 多个 agent 时由群主分工；成员用 group_post 不带 to 时默认回给群主。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          sessionId: { type: 'string', description: '群主的会话 id 或短号。' },
        },
        required: ['groupId', 'sessionId'],
      },
      output: OUT,
      timeoutMs: 15_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; sessionId?: unknown }
        return JSON.stringify(deps.groups.setOwner({ id: asString(input.groupId), sessionId: asString(input.sessionId) }))
      },
    },
    {
      name: 'group_remove',
      description: '把某个成员移出群：他本人会收到「本群对你不再可用」，其余成员收到「XX 离开了本群」。',
      parameters: {
        type: 'object',
        properties: {
          groupId: { type: 'string', description: '群 id。' },
          sessionId: { type: 'string', description: '要移出的会话 id 或短号。' },
        },
        required: ['groupId', 'sessionId'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown; sessionId?: unknown }
        const group = deps.groups.get(asString(input.groupId))
        let target = asString(input.sessionId)
        if (group !== undefined && !group.members.some((member) => member.sessionId === target)) {
          const hit = group.members.find((member) => shortId(member.sessionId) === target)
          if (hit !== undefined) target = hit.sessionId
        }
        return JSON.stringify(await deps.groups.remove({ id: asString(input.groupId), sessionId: target }))
      },
    },
    {
      name: 'group_dissolve',
      description: '解散群：全体成员都会收到「群已解散、本群对你不再可用」，记录保留给用户看。',
      parameters: {
        type: 'object',
        properties: { groupId: { type: 'string', description: '群 id。' } },
        required: ['groupId'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { groupId?: unknown }
        return JSON.stringify(await deps.groups.dissolve({ id: asString(input.groupId) }))
      },
    },
    {
      name: 'group_read',
      description: '读群里的最近记录（默认 20 条，最多 100）。补上下文用，别每轮都读。',
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
    {
      name: 'groups_guide',
      description: '返回「肥鱼拉群」的完整用法（与 skill dafeiyu-groups 同一份正文）。上下文里没有那个 skill 时用它兜底。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 15_000,
      async execute(): Promise<string> {
        return deps.guideBody()
      },
    },
  ]
}
