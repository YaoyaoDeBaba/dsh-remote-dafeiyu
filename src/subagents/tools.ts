/**
 * subagents/tools —— 给 agent 用的「归档子代理」工具。
 *
 * 为什么需要它：归档接口一直只挂在 HTTP 路由上（桌面面板 / 手机点按钮），
 * **模型侧没有任何入口**。于是"包工头主动清点、把用不上的子代理收起来"这句提示词
 * 只能是一句空话——模型看得见列表，却没有手。
 *
 * 实测背景（2026-11-12）：会话与闲置子代理攒多了会让整个 DSH 变慢（切会话反复冷读），
 * 归档之后明显恢复。所以归档必须是包工头的**常规动作**，而不是"清理时才做的事"。
 *
 * ## 2026-11-13：「名字当 id」那次事故
 *
 * 内核的 `list_agents` 显示的是**名字/路径**（`dsh-subagent` 的 `list-agents.ts`
 * 用的是 `entry.path ?? entry.id`），而这里的工具描述原来写着"ids 就是 `list_agents`
 * 里显示的那个 id"——模型照做，把 `agent-1` 当 id 传，内核回
 * `cannot archive session 'agent-1': … hold no such session`。
 * 日志实证：同一次批量归档 **9 个 UUID 成功、7 个名字全灭**。
 *
 * 现在两条都认：先按给的值归档；报"没有这条会话"时，用内核的 `resolveName`
 * 把名字换成真 id 再试一次。`resolveName` 是**软探测**的（内核各代际不一定有），
 * 拿不到就保持原错误，并明确告诉模型"这是名字不是 id"。
 */
export interface SubagentToolDeps {
  /** 归档 / 取消归档，与面板、手机走同一条内核能力 */
  archive?: (sessionId: string, archived: boolean) => Promise<{ ok: boolean; message?: string }>
  /**
   * 名字/路径 → 会话 id（内核 `subagents.resolveName(agent, name, signal)`）。
   *
   * 没给（内核这一代没有这个方法）时，工具只能按 id 归档——错误文案里会说清这件事。
   * 返回 `undefined` 表示"解析不出来"，调用方保持原错误。
   */
  resolveName?: (agent: unknown, name: string, signal?: AbortSignal) => Promise<string | undefined>
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [{ type: 'text', text: String(value) }],
}

/** 内核"没有这条会话"的报错（各代际措辞略有出入，命中任一条就算）。 */
const NOT_A_SESSION = /hold no such session|no such session|unknown session|session not found|不存在/i

/** 把上游/内核的报错压成一句能照做的话。 */
function explain(message: string | undefined, archived: boolean): string {
  const raw = String(message ?? '').slice(0, 200)
  if (/running|在跑|busy|active/i.test(raw)) {
    return `还在跑，等它收工再${archived ? '归档' : '取消归档'}（内核不允许归档运行中的会话）：${raw}`
  }
  return raw === '' ? `${archived ? '归档' : '取消归档'}失败（内核没给原因）` : raw
}

/**
 * 名字解析不出来时的那句话。
 *
 * 模型看到它就够照做了：这不是内核抽风，是它把 `list_agents` 显示的名字当成了 id。
 */
function nameNotId(name: string, raw: string | undefined, canResolve: boolean): string {
  const tail = String(raw ?? '').slice(0, 160)
  const head = `「${name}」这是名字不是 id（内核里没有这条会话）`
  const advice = canResolve
    ? '：名字解析也没能换成 id，请改用 list_agents 里给出的 UUID'
    : '：这一代宿主不能把名字换成 id，请改用 list_agents 里给出的 UUID（或用桌面面板收）'
  return `${head}${advice}${tail === '' ? '' : `（内核原话：${tail}）`}`
}

export function buildSubagentTools(deps: SubagentToolDeps): Array<Record<string, unknown>> {
  if (!deps.archive) return []
  return [
    {
      name: 'subagent_archive',
      description:
        '归档（或取消归档）子代理会话。归档 = 从监视器与列表里隐藏、不再占着你的清点视野，**不删除历史**。\n' +
        '包工头的常规动作：每次收到子代理的返回、或派出新子代理之后，先看一眼 `list_agents`，' +
        '把「已经交付且不再需要」「探路产物结论已拿到」「和当前任务无关」的子代理批量归档。\n' +
        '**不要归档**：还在跑的、你准备追加指令的、当前这轮验收还没过的。',
      parameters: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description:
              '要处理的子代理：可以是 `list_agents` 里显示的**名字/路径**，也可以是会话 UUID。可批量。\n' +
              '⚠️ 面板里看得到、但 `list_agents` 里没有的子代理（one-shot）不在内核列表里，只能去面板收。',
          },
          unarchive: { type: 'boolean', description: 'true = 取消归档（误收了要放回来时用）' },
          reason: { type: 'string', description: '一句话说明为什么不再需要（只进日志，便于事后复盘）' },
        },
        required: ['ids'],
      },
      output: OUT,
      timeoutMs: 30_000,
      /**
       * `exec` 是内核给的执行上下文：`exec.agent` 是**发起这次调用的那个 agent**，
       * `exec.signal` 是这一轮的取消信号。`resolveName` 需要前者（它按 agent
       * 能看到的范围解析名字），所以第二个参数必须用上——以前这里是
       * `async execute(args)`，压根没接它。
       */
      async execute(args: unknown, exec?: unknown): Promise<string> {
        const input = (args ?? {}) as { ids?: unknown; unarchive?: unknown; reason?: unknown }
        const context = (exec ?? {}) as { agent?: unknown; signal?: AbortSignal }
        const archived = input.unarchive !== true
        const reason = typeof input.reason === 'string' ? input.reason.slice(0, 120) : ''
        const rawIds = Array.isArray(input.ids) ? input.ids : []
        // 去重 + 只留非空字符串：模型偶尔会把 id 写成带引号或被截断的形式，直接跳过比整批失败好
        const ids = [...new Set(rawIds.map((id) => String(id ?? '').trim()).filter((id) => id !== ''))]
        if (ids.length === 0) {
          return JSON.stringify({ ok: false, error: 'ids 不能为空：给 `list_agents` 里的子代理名字或 UUID' })
        }

        const done: string[] = []
        /** 名字 → 真 id：能换成就记一笔，好让模型知道"我给你的名字被换成了 UUID"。 */
        const resolved: Array<{ given: string; id: string }> = []
        const failed: Array<{ id: string; error: string }> = []

        /**
         * 处理一个 id：先按给的值归档；内核说"没这条会话"且能解析名字时，换成真 id 再试一次。
         *
         * 抽成一个函数而不是在循环里展开，是因为"端口返回 ok:false"和"端口抛错"
         * 两条路上都要做同一件事——上面那次事故里，正是一边有重试、另一边没有。
         */
        const one = async (given: string): Promise<{ ok: boolean; id: string; error?: string }> => {
          let message: string | undefined
          try {
            const result = await deps.archive!(given, archived)
            if (result?.ok) return { ok: true, id: given }
            message = result?.message
          } catch (error) {
            message = String((error as Error)?.message ?? error)
          }
          const raw = String(message ?? '')
          if (!NOT_A_SESSION.test(raw)) return { ok: false, id: given, error: explain(message, archived) }
          // 到这儿：内核认为这个值不是会话 id。名字/路径的可能最大——换成真 id 再试。
          if (!deps.resolveName) return { ok: false, id: given, error: nameNotId(given, raw, false) }
          let sid: string | undefined
          try {
            sid = await deps.resolveName(context.agent, given, context.signal)
          } catch {
            sid = undefined
          }
          if (sid === undefined || sid === '' || sid === given) {
            return { ok: false, id: given, error: nameNotId(given, raw, true) }
          }
          try {
            const retry = await deps.archive!(sid, archived)
            if (retry?.ok) {
              deps.log('归档时把名字换成了会话 id', { name: given, sessionId: sid })
              return { ok: true, id: sid }
            }
            return { ok: false, id: given, error: explain(retry?.message, archived) }
          } catch (error) {
            return { ok: false, id: given, error: explain(String((error as Error)?.message ?? error), archived) }
          }
        }

        for (const given of ids) {
          const outcome = await one(given)
          if (outcome.ok) {
            done.push(outcome.id)
            if (outcome.id !== given) resolved.push({ given, id: outcome.id })
          } else {
            failed.push({ id: given, error: String(outcome.error ?? '失败') })
          }
        }
        if (reason !== '') deps.log('包工头归档子代理', { count: done.length, archived, reason })
        return JSON.stringify({
          ok: failed.length === 0,
          action: archived ? 'archive' : 'unarchive',
          done,
          ...(resolved.length > 0 ? { resolved } : {}),
          failed,
          // 提醒模型下一步该做什么，避免它以为"归档完就结束了"
          note:
            done.length > 0
              ? '已归档的不会再出现在 list_agents 的正常列表里；需要时可用 unarchive:true 放回来。'
              : `一个都没成功，看 failed 里的原因。ids 认名字也认 UUID，但只有 \`list_agents\` 里出现过的才收得掉（one-shot 子代理去桌面面板收）。`,
        })
      },
    },
  ]
}
