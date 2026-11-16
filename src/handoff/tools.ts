/**
 * handoff/tools —— 给 **agent** 用的「一键转生 / 一键分身」（2026-11-16）。
 *
 * ## 为什么要有它
 *
 * 转生/分身原来只有两种入口：
 * 1. 设置页「Agent 团队」那两颗按钮（人点）；
 * 2. 形象小窗的右键菜单（人点）。
 *
 * 也就是说**模型自己没法发起**——而"把某个模块的后续维护交接出去"这件事，
 * 发起者本来就该是 agent。补这两个工具是为了让"交接"能由 agent 完成，而不是必须有人点一下。
 *
 * ## 与面板的关系
 *
 * 工具**不重写任何逻辑**：它调的就是面板调的那个 `HandoffService.start()`。
 * 交接文档的写法、等待上限、新会话的建法全在 `service.ts` / `prompt.ts` 里，只有一份。
 *
 * ## sessionId 从哪来
 *
 * `service.start()` 需要"从哪个会话出发"。工具调用上下文（`exec`）不保证带会话 id，
 * 所以：**先试 `exec.agent` 上几种常见形状**，试不出来就要求调用方显式给 `sessionId`，
 * 并把"怎么找到它"写进错误里。宁可要一次显式参数，也不要猜错了把上下文转生到别的会话去。
 */
import type { HandoffKind } from './prompt.js'
import type { HandoffService } from './service.js'

export interface HandoffToolDeps {
  service: Pick<HandoffService, 'start'>
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

interface HandoffStartResult {
  ok: boolean
  jobId?: string
  status?: string
  message?: string
  /** 交接文档的落点（新会话会读它）。 */
  handoffFile?: string
}

const OUT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    jobId: { type: 'string' },
    status: { type: 'string' },
    message: { type: 'string' },
    handoffFile: { type: 'string' },
  },
  required: ['ok'],
  additionalProperties: false,
}

/**
 * 从工具执行上下文里找"当前会话 id"。
 *
 * 只认**明确叫 sessionId / session.id** 的形状：`agent.id` 那种太含糊
 * （有的宿主里它是 agent id 不是会话 id），猜错的代价是把别人的上下文转生出去。
 */
export function resolveSessionId(exec: unknown): string | undefined {
  const candidate = (exec ?? {}) as {
    sessionId?: unknown
    session?: { id?: unknown }
    agent?: { sessionId?: unknown; session?: { id?: unknown } }
  }
  const shapes: unknown[] = [
    candidate.sessionId,
    candidate.session?.id,
    candidate.agent?.sessionId,
    candidate.agent?.session?.id,
  ]
  for (const value of shapes) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function explainMissingSession(): string {
  return JSON.stringify({
    ok: false,
    error:
      '拿不到当前会话 id。请显式传 `sessionId`：' +
      '它就是你正在对话的那个会话（桌面端在会话列表里能看到；也可以用 `list_agents` 里的会话 UUID 对照）。',
  })
}

/** 两个工具：转生（换会话接着干）与分身（复制上下文并行）。 */
export function buildHandoffTools(deps: HandoffToolDeps): Array<Record<string, unknown>> {
  const make = (kind: HandoffKind) => ({
    name: kind === 'rebirth' ? 'handoff_rebirth' : 'handoff_branch',
    description:
      kind === 'rebirth'
        ? '把**当前会话**一键转生：让本会话写一份交接文档，然后在**新会话**里接着干。适合上下文要满了、或要把一件事交出去。\n' +
          '返回 `jobId`；作业跑完（新会话已发出第一句）前状态是 `running`，可用 `handoff_status` 查。'
        : '把**当前会话**一键分身：复制上下文成**新会话**，两边并行干活、互不影响。\n' +
          '典型用法：把某个模块的后续维护交给分身去迭代，主会话继续干别的。返回 `jobId`。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '从哪个会话出发。**通常不用传**（工具能从执行上下文读到）；读不到时必须显式给。',
        },
        note: {
          type: 'string',
          description: '交接重点（选填）：比如「重点把 X 做完，Y 已经放弃别再试」。写进交接文档。',
        },
        boundary: {
          type: 'string',
          description: '分界（选填）：交接文档里那行「到此为止」的说明，一般留空。',
        },
      },
      required: [],
    },
    output: OUT,
    timeoutMs: 30_000,
    async execute(args: unknown, exec?: unknown): Promise<string> {
      const input = (args ?? {}) as { sessionId?: unknown; note?: unknown; boundary?: unknown }
      const given = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
      const sessionId = given !== '' ? given : resolveSessionId(exec)
      if (sessionId === undefined) return explainMissingSession()
      const note = typeof input.note === 'string' ? input.note.slice(0, 2000) : undefined
      const boundary = typeof input.boundary === 'string' ? input.boundary.slice(0, 500) : undefined
      try {
        const result = (await deps.service.start(kind, sessionId, note, boundary)) as HandoffStartResult
        deps.log(`agent 发起${kind === 'rebirth' ? '转生' : '分身'}`, {
          sessionId,
          ok: String(result.ok),
          jobId: result.jobId ?? '',
        })
        return JSON.stringify(result)
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: `${kind === 'rebirth' ? '转生' : '分身'}没起来：${String((error as Error)?.message ?? error).slice(0, 200)}`,
        })
      }
    },
  })

  return [make('rebirth'), make('branch')]
}
