/**
 * websearch/probe —— 设置页「测一下」那一次**真调用**（2026-11-20）。
 *
 * ## 为什么按钮要真跑一次，而不是"检查 token 形状"
 *
 * 用户点这颗按钮时想知道的是"现在能不能用"：token 抄错一位、被 GitHub 撤销、
 * 出口 IP 被限流——这些只有真发一次请求才看得出来。本地校验只能验长度，验不了这些。
 *
 * ## 为什么单独一个文件
 *
 * 这段逻辑要在**不联网**的判据里验（成功一行、失败中文、非法 kind），
 * 所以它只认"一个工具表 + 一个 execute"，不认 http、不认配置。
 */
/** 三种可测的对象。`github` 走 repo_search、`arxiv` 走 paper_search、`web` 走 web_search_fy。 */
export type WebsearchProbeKind = 'github' | 'arxiv' | 'web'

export const WEBSEARCH_PROBE_KINDS: readonly WebsearchProbeKind[] = ['github', 'arxiv', 'web']

/** 测什么就搜什么：固定一个真实存在的词，避免"关键词太怪所以没结果"被读成"token 坏了"。 */
const PROBE_QUERY = 'deepseek'

/** summary 的长度上限（设置页那一行显示得下就行）。 */
export const PROBE_SUMMARY_MAX = 120

export function isProbeKind(value: unknown): value is WebsearchProbeKind {
  return typeof value === 'string' && (WEBSEARCH_PROBE_KINDS as readonly string[]).includes(value)
}

/**
 * 取工具输出的**第一行**（跳过空行）并截到 `max` 字。
 *
 * 为什么是"第一行"而不是整段：工具输出第一条就是"仓库「x」：N 条"或错误那一句，
 * 后面全是结果明细——设置页只要一句"成没成"，明细留给对话里的模型。
 */
export function firstLine(text: unknown, max: number = PROBE_SUMMARY_MAX): string {
  const raw = typeof text === 'string' ? text : String(text ?? '')
  const line = raw.split('\n').map((piece) => piece.trim()).find((piece) => piece !== '') ?? ''
  return line.length > max ? line.slice(0, max) + '…' : line
}

/** 每个 kind 的叫法（写进中文错误里）与调哪个工具、带什么参数。 */
const PROBE_PLAN: Record<WebsearchProbeKind, { label: string; tools: string[]; args: Record<string, unknown> }> = {
  github: { label: 'GitHub', tools: ['repo_search'], args: { query: PROBE_QUERY, limit: 1 } },
  arxiv: { label: 'arXiv', tools: ['paper_search'], args: { query: PROBE_QUERY, source: 'arxiv', limit: 1 } },
  web: { label: '联网搜索', tools: ['web_search_fy'], args: { query: PROBE_QUERY, count: 1 } },
}

type ToolLike = {
  name?: unknown
  execute?: (args: unknown, context?: unknown) => unknown
}

function findTool(tools: Array<Record<string, unknown>>, names: string[]): ToolLike | undefined {
  for (const name of names) {
    const hit = tools.find((tool) => tool.name === name)
    if (hit !== undefined) return hit as unknown as ToolLike
  }
  return undefined
}

/**
 * 跑一次。**永不抛**：失败也回 `{ ok: false, summary: 中文原因 }`——
 * 设置页那一行只需要一句话，抛出去只会变成"按钮点了没反应"。
 */
export async function runProbe(
  tools: Array<Record<string, unknown>>,
  kind: unknown,
): Promise<{ ok: boolean; summary: string }> {
  if (!isProbeKind(kind)) {
    return { ok: false, summary: 'kind 只能是 github / arxiv / web' }
  }
  const plan = PROBE_PLAN[kind]
  const tool = findTool(tools, plan.tools)
  if (tool === undefined || typeof tool.execute !== 'function') {
    return { ok: false, summary: plan.label + ' 的工具没注册上（' + plan.tools[0] + '），这一项测不了' }
  }
  try {
    const output = await tool.execute(plan.args)
    return { ok: true, summary: firstLine(output) }
  } catch (error) {
    const message = String((error as Error)?.message ?? error).trim()
    /*
     * 工具自己抛的就是中文原因（"GitHub 没查成：HTTP 403——…"），别再套一层
     * "测 GitHub 没成：GitHub 没查成：…" 那样的叠字。真出了意料之外的英文错时，
     * 才补上中文前缀，否则用户看到的是"fetch failed"。
     */
    const hasChinese = /[\u4e00-\u9fff]/.test(message)
    const summary = hasChinese ? message : '测' + plan.label + '没成：' + (message === '' ? '没有返回原因' : message)
    return { ok: false, summary: firstLine(summary, PROBE_SUMMARY_MAX + 40) }
  }
}
