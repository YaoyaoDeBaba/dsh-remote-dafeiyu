/**
 * subagents/tools —— 给 agent 用的「归档子代理」工具。
 *
 * 为什么需要它：归档接口一直只挂在 HTTP 路由上（桌面面板 / 手机点按钮），
 * **模型侧没有任何入口**。于是"包工头主动清点、把用不上的子代理收起来"这句提示词
 * 只能是一句空话——模型看得见列表，却没有手。
 *
 * 实测背景（2026-11-12）：会话与闲置子代理攒多了会让整个 DSH 变慢（切会话反复冷读），
 * 归档之后明显恢复。所以归档必须是包工头的**常规动作**，而不是"清理时才做的事"。
 */
export interface SubagentToolDeps {
  /** 归档 / 取消归档，与面板、手机走同一条内核能力 */
  archive?: (sessionId: string, archived: boolean) => Promise<{ ok: boolean; message?: string }>
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [{ type: 'text', text: String(value) }],
}

/** 把上游/内核的报错压成一句能照做的话。 */
function explain(message: string | undefined, archived: boolean): string {
  const raw = String(message ?? '').slice(0, 200)
  if (/running|在跑|busy|active/i.test(raw)) {
    return `还在跑，等它收工再${archived ? '归档' : '取消归档'}（内核不允许归档运行中的会话）：${raw}`
  }
  return raw === '' ? `${archived ? '归档' : '取消归档'}失败（内核没给原因）` : raw
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
            description: '要处理的子代理 id（就是 `list_agents` 里显示的那个 id），可批量',
          },
          unarchive: { type: 'boolean', description: 'true = 取消归档（误收了要放回来时用）' },
          reason: { type: 'string', description: '一句话说明为什么不再需要（只进日志，便于事后复盘）' },
        },
        required: ['ids'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: unknown): Promise<string> {
        const input = (args ?? {}) as { ids?: unknown; unarchive?: unknown; reason?: unknown }
        const archived = input.unarchive !== true
        const reason = typeof input.reason === 'string' ? input.reason.slice(0, 120) : ''
        const rawIds = Array.isArray(input.ids) ? input.ids : []
        // 去重 + 只留非空字符串：模型偶尔会把 id 写成带引号或被截断的形式，直接跳过比整批失败好
        const ids = [...new Set(rawIds.map((id) => String(id ?? '').trim()).filter((id) => id !== ''))]
        if (ids.length === 0) {
          return JSON.stringify({ ok: false, error: 'ids 不能为空：给 `list_agents` 里的子代理 id' })
        }

        const done: string[] = []
        const failed: Array<{ id: string; error: string }> = []
        for (const id of ids) {
          try {
            const result = await deps.archive!(id, archived)
            if (result?.ok) done.push(id)
            else failed.push({ id, error: explain(result?.message, archived) })
          } catch (error) {
            failed.push({ id, error: explain(String((error as Error)?.message ?? error), archived) })
          }
        }
        if (reason !== '') deps.log('包工头归档子代理', { count: done.length, archived, reason })
        return JSON.stringify({
          ok: failed.length === 0,
          action: archived ? 'archive' : 'unarchive',
          done,
          failed,
          // 提醒模型下一步该做什么，避免它以为"归档完就结束了"
          note:
            done.length > 0
              ? '已归档的不会再出现在 list_agents 的正常列表里；需要时可用 unarchive:true 放回来。'
              : '一个都没成功，看 failed 里的原因。',
        })
      },
    },
  ]
}
