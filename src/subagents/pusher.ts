/**
 * guidance-push —— 把提示段“推”进所有在线会话（一次性上下文）。
 *
 * 为什么需要它：提示段（`systemPrompt.section`）只在**会话新建/重开**时被渲染进
 * 系统提示；有些常驻会话（比如正在进行的对话）拿不到新注册的段。用户要一个按钮
 * “推送所有会话载入这段提示词”，这里就是那条路径：
 *
 *   ctx.agents.list() → 每个 agent 调 `agent.inject(message)`
 *
 * `inject()` 只把消息放进 next-step 队列、**不唤醒**驱动器：不会打断正在跑的回合，
 * 下一轮模型输入里就能看到。消息用 `source.kind = 'user'`（渲染器一定认识这个），
 * 文本前缀写清“插件推送”，避免看起来像用户自己说的。
 */
export interface GuidancePushResult {
  total: number
  pushed: number
  failed: number
  errors: string[]
}

interface LiveAgent {
  id?: unknown
  inject?: (input: unknown) => unknown
}

type AgentLister = () => unknown

export function createGuidancePusher(getAgents: () => unknown) {
  return async function push(text: string, summary: string): Promise<GuidancePushResult> {
    const result: GuidancePushResult = { total: 0, pushed: 0, failed: 0, errors: [] }
    const service = getAgents()
    const list = service && typeof (service as { list?: unknown }).list === 'function'
      ? ((service as { list: () => unknown[] }).list() ?? [])
      : []
    const agents = Array.isArray(list) ? (list as LiveAgent[]) : []
    result.total = agents.length
    const body = `【系统推送·大肥鱼插件】${summary}\n${text}\n（以上规范由插件推送到本会话，后续请遵守；这是系统推送，不是用户发言。）`
    for (const agent of agents) {
      if (!agent || typeof agent.inject !== 'function') {
        result.failed += 1
        result.errors.push('一个在线会话没有 inject 能力')
        continue
      }
      try {
        agent.inject({
          // ⚠️ 必须带 id：缺少 id 的注入消息会让会话日志里出现
          // `inbox/spliced.inserted[0]` 与 `user/message` 对不上（同一条消息两处 id 缺失/不一致），
          // 回放时被当成两条、甚至整段历史读坏（2026-11-10 真机事故，用户手动修过会话文件）。
          id: (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.()
            ?? `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
          role: 'user',
          content: [{ type: 'text', text: body }],
          source: { kind: 'user' },
        })
        result.pushed += 1
      } catch (error) {
        result.failed += 1
        result.errors.push(String((error as Error)?.message ?? error).slice(0, 120))
      }
    }
    return result
  }
}
