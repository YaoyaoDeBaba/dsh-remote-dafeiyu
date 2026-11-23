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
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { HandoffKind } from './prompt.js'
import type { HandoffService } from './service.js'

export interface HandoffToolDeps {
  service: Pick<HandoffService, 'start'>
  /** 收件箱（前世 ↔ 来生）：本工具只做参数解析与话术，存取全在 inbox.ts。 */
  inbox: {
    ask: (input: { from: string; to: string; question: string }) => Promise<{ ok: boolean; thread?: { id: string; to: string }; message?: string }>
    answer: (input: { id: string; answer: string }) => Promise<{ ok: boolean; thread?: { id: string; from: string; status: string }; message?: string }>
  }
  /** 交接目录：读 lineage.json（来生 → 前世 的谱系），让 handoff_ask 不用人肉传 id。 */
  handoffDir: string
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

/**
 * 工具输出声明。
 *
 * ⚠️ 内核要的是 `{ schema, render }`（`presentationMeta?` 可选），**不是裸 JSON Schema**。
 * 我第一版写成裸 schema，`tools.register` 直接抛：
 *   `tool "handoff_rebirth" must declare output { schema, render, presentationMeta? }`
 * 而我当时把异常吞进 probe 了——于是"工具没注册"这件事**没有任何报错**，
 * 只有把 probe 写进 status.json 才看见。工具定义写错一定要让它在开发期炸出来。
 */
const OUT = {
  // 类型必须与 execute 的返回值一致：我们返回的是 JSON 字符串，所以这里是 string。
  // 写成 object 会被内核拒收：returned invalid output: value must be an object。
  // （subagents 的工具也是 string + 同一个 render，照它的形状抄准没错。）
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [
    { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) },
  ],
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
        ? '把**当前会话**一键转生：让本会话写一份交接文档，然后在**新会话**里接着干。\n' +
          '什么时候用：上下文快满了 / 要把一件长期的事交出去 / 用户说"你自己转生"。\n' +
          '**你（agent）可以直接发起，不需要用户点任何按钮**。\n' +
          '`note` 最省钱：写 3 条以内——**为什么现在转、哪些活已经干完别重做、接手者第一步敲什么**（原样进交接文档）。\n' +
          '调用后会收到一条"写交接文档"的指令：必须按它写完并调 `record_memory`，不许半路停；宿主等文件出现后再建新会话、投递第一句。\n' +
          '**兜底**：本工具不可用时，改用 `schedule_create`（`target: new_once` + 一次性 rrule），把"读交接文档、接手"作为投递到新会话的第一条指令——效果等价、不依赖本插件。'
        : '把**当前会话**一键分身：复制上下文成**新会话**，两边并行干活、互不影响。\n' +
          '**你（agent）可以直接发起，不需要用户点任何按钮**——用户说"你自己分身"时，就是让你调这个工具。\n' +
          '`note` **必填，就是这条分身的职责**：它只干这一件事、干到怎么算完。\n' +
          '在群里发起时，整条链子会自动走完（2026-11-23）：**通知群 → 建分身并改名 <本体名>分身N → ' +
          '把 note 当职责写进它的群身份 → 迎新广播**。本体**不退群、不交群主**——分身是添人手，不是接班。\n' +
          '`boundary` 强烈建议填：本体正在改的文件/目录、本体正在跑的后台任务——分身不许碰，碰了两边一起改同一个文件。\n' +
          '调用后会收到一条"写交接文档"的指令，必须按它写完并调 `record_memory`。返回 `jobId`。\n' +
          '**兜底**：同上，本工具不可用时改用 `schedule_create`（`target: new_once`）投递第一条指令。',
    parameters: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: '从哪个会话出发。**通常不用传**（工具能从执行上下文读到）；读不到时必须显式给。',
        },
        note: {
          type: 'string',
          description:
            '交接重点（强烈建议写）：为什么现在转 / 哪些已完成别重做 / 接手者第一步敲什么（文件或命令）。原样写进交接文档。',
        },
        boundary: {
          type: 'string',
          description:
            '边界（选填但强烈建议）：接手者不许碰的文件、目录、后台任务（本体正在动的、别人正在跑的都算）。两个工具都认。',
        },
        content: {
          type: 'string',
          description:
            '交接文档正文（选填）。给了就由插件自己落盘、直接建新会话——适合**你没有文件写入工具**的时候：把文档内容原样放这里，不要再等自己写盘。不给则按老流程等你写文件。',
        },
      },
      required: [],
    },
    output: OUT,
    timeoutMs: 30_000,
    async execute(args: unknown, exec?: unknown): Promise<string> {
      const input = (args ?? {}) as { sessionId?: unknown; note?: unknown; boundary?: unknown; content?: unknown }
      const given = typeof input.sessionId === 'string' ? input.sessionId.trim() : ''
      const sessionId = given !== '' ? given : resolveSessionId(exec)
      if (sessionId === undefined) return explainMissingSession()
      const note = typeof input.note === 'string' ? input.note.slice(0, 2000) : undefined
      const boundary = typeof input.boundary === 'string' ? input.boundary.slice(0, 500) : undefined
      const content = typeof input.content === 'string' ? input.content.slice(0, 60_000) : undefined
      try {
        const result = (await deps.service.start(kind, sessionId, note, boundary, content)) as HandoffStartResult
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

  /**
   * 收件箱的两个工具（2026-11-17）。
   *
   * 内核没有「顶层会话互相发消息」的 API，但插件有 sendPrompt——转生本来就是靠它投递的。
   * 这两个工具就是那根电话线的两头：来生问（handoff_ask）、前世答（handoff_answer）。
   * 送不到时**不许静默**：返回值里直接说「去问用户」，别让来生一直等一个不会来的回答。
   */
  const makeAsk = (): Record<string, unknown> => ({
    name: 'handoff_ask',
    description:
      '问「前世」会话一个交接文档没写清的问题（它是把你这条活交接出来的那条会话）。\n' +
      '**先用它、再问用户**：文档缺口里「当时为什么这么定 / 被否方案的原因 / 在等谁拍板」这类，前世都答得上。\n' +
      'to 通常不用传（按 lineage.json 自动找前世）；question 要写清「你缺什么、要解决什么问题」。\n' +
      '回答会作为新消息送回来；返回 ok:false 说明前世不在线——那就直接问用户，别等。',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '缺什么：一个问题一条，别把一堆问题塞进一段。' },
        to: { type: 'string', description: '前世会话 id（选填；不传就按谱系自动找）。' },
      },
      required: ['question'],
    },
    output: OUT,
    timeoutMs: 20_000,
    async execute(args: unknown, exec?: unknown): Promise<string> {
      const input = (args ?? {}) as { question?: unknown; to?: unknown }
      const from = resolveSessionId(exec)
      if (from === undefined) {
        return JSON.stringify({ ok: false, error: '拿不到当前会话 id：收件箱要先知道你是谁，才能把回答送回来。' })
      }
      const explicit = typeof input.to === 'string' ? input.to.trim() : ''
      const to = explicit !== '' ? explicit : parentOf(deps.handoffDir, from) ?? ''
      if (to === '') {
        return JSON.stringify({
          ok: false,
          error: '找不到前世会话（lineage.json 里没有你）：把前世会话 id 传给 to，或者直接问用户。',
        })
      }
      const result = await deps.inbox.ask({ from, to, question: String(input.question ?? '') })
      deps.log('agent 用收件箱问前世', { ok: String(result.ok), to })
      return JSON.stringify(result)
    },
  })

  const makeAnswer = (): Record<string, unknown> => ({
    name: 'handoff_answer',
    description:
      '回收件箱里「来生」的提问（转生/分身后接手那条会话）。\n' +
      '回答要能直接照做：改哪个文件、跑什么命令、当时为什么这么定。\n' +
      '返回 ok:true 且不带 message 表示回答已送回给提问的会话；带 message 说明存档了但没送进去（对面可能已归档）。',
    parameters: {
      type: 'object',
      properties: {
        inboxId: { type: 'string', description: '提问里给的那串线程 id。' },
        answer: { type: 'string', description: '回答正文。' },
      },
      required: ['inboxId', 'answer'],
    },
    output: OUT,
    timeoutMs: 20_000,
    async execute(args: unknown): Promise<string> {
      const input = (args ?? {}) as { inboxId?: unknown; answer?: unknown }
      const id = typeof input.inboxId === 'string' ? input.inboxId.trim() : ''
      if (id === '') return JSON.stringify({ ok: false, error: '缺少 inboxId（提问里那串线程 id）。' })
      const result = await deps.inbox.answer({ id, answer: String(input.answer ?? '') })
      deps.log('agent 回收件箱回答', { ok: String(result.ok) })
      return JSON.stringify(result)
    },
  })

  return [make('rebirth'), make('branch'), makeAsk(), makeAnswer()]
}

/**
 * 从谱系里找「我的前世是谁」。
 *
 * 谱系是 service 在 spawnHeir 时写的（来生 → 前世），读失败就当没有——
 * 这时候靠 to 显式传，或退回问用户。
 */
export function parentOf(handoffDir: string, sessionId: string): string | undefined {
  try {
    const raw = readFileSync(path.join(handoffDir, 'lineage.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const parent = parsed[sessionId]
    return typeof parent === 'string' && parent.trim() !== '' ? parent.trim() : undefined
  } catch {
    return undefined
  }
}
