/**
 * xyq/tools — 给模型的三个工具：生图 / 生视频 / 查余额（外加查模型）。
 *
 * 纪律：
 * - 失败一律抛出带中文原因的错（模型会把这句话转述给用户），不静默；
 * - 成功时把**本地文件绝对路径**放进输出，模型能直接引用/展示；
 * - 额度/Key 的判定在 service 里，工具层只负责形状与文案。
 */
import type { XyqService } from './service.js'

function sessionKeyOf(exec: unknown): string {
  const record = exec && typeof exec === 'object' ? (exec as Record<string, unknown>) : undefined
  const agent = record?.agent && typeof record.agent === 'object' ? (record.agent as Record<string, unknown>) : undefined
  const session = agent?.session && typeof agent.session === 'object' ? (agent.session as Record<string, unknown>) : undefined
  const id = session?.id ?? record?.sessionId ?? record?.session
  return typeof id === 'string' && id !== '' ? id : 'default'
}

function resultText(result: { ok: boolean; files?: string[]; webLink?: string; message?: string; threadId?: string }): string {
  if (!result.ok) return `生成失败：${result.message ?? '未知原因'}`
  const files = result.files ?? []
  const lines = [`生成完成，${files.length} 个文件：`, ...files.map((file) => `- ${file}`)]
  if (result.webLink !== undefined) lines.push(`在线查看：${result.webLink}`)
  if (result.threadId !== undefined) lines.push(`任务：${result.threadId}`)
  return lines.join('\n')
}

export function xyqTools(service: XyqService): Array<Record<string, unknown>> {
  return [
    {
      name: 'generate_image',
      description:
        '用小云雀生成/编辑图片。prompt 必须是用户原始描述；可传参考图（本地绝对路径）。按张消耗积分。' +
        '用户没有明确要求画图时不要调用。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图片描述（用户原话，不要扩写）' },
          model: { type: 'string', description: '图片模型完整名称（先用 xyq_models 查 image 列表）；不传则用设置里的默认值' },
          images: { type: 'array', items: { type: 'string' }, description: '参考图本地绝对路径，可多张' },
          ratio: { type: 'string', description: '比例（模型返回的数字枚举，如 3 表示 9:16）' },
          count: { type: 'number', description: '生成数量（可选）' },
          outDir: { type: 'string', description: '下载目录；默认 xyq_output' },
        },
        required: ['prompt'],
      },
      output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 10 * 60_000,
      async execute(args: Record<string, unknown>, exec: unknown): Promise<string> {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
        if (prompt === '') throw new Error('需要 prompt（用户原始描述）')
        const images = Array.isArray(args.images) ? args.images.filter((value): value is string => typeof value === 'string' && value !== '') : []
        const result = await service.generateImage({
          prompt,
          ...(typeof args.model === 'string' && args.model !== '' ? { model: args.model } : {}),
          images,
          ...(typeof args.ratio === 'string' && args.ratio !== '' ? { ratio: args.ratio } : {}),
          ...(typeof args.count === 'number' ? { count: args.count } : {}),
          ...(typeof args.outDir === 'string' && args.outDir !== '' ? { outDir: args.outDir } : {}),
          sessionKey: sessionKeyOf(exec),
        })
        if (!result.ok) throw new Error(result.message ?? '生成失败')
        return resultText(result)
      },
    },
    {
      name: 'generate_video',
      description:
        '用小云雀生成视频（支持参考图/首尾帧）。按时长计费（Seedance 2.0 Mini 体验版约 4 积分/秒）。' +
        '用户没有明确要求生成视频时不要调用；时长会被设置里的上限截断。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '视频描述（用户原话）' },
          model: { type: 'string', description: '视频模型 key（先用 xyq_models 查 video 列表）；不传用默认 Seedance_2.0_mini_lite' },
          duration: { type: 'number', description: '时长（秒，4~30，会被设置上限截断）' },
          ratio: { type: 'string', description: '比例，如 1:1 / 16:9 / 9:16' },
          images: { type: 'array', items: { type: 'string' }, description: '参考图本地绝对路径，可多张' },
          outDir: { type: 'string', description: '下载目录；默认 xyq_output' },
        },
        required: ['prompt'],
      },
      output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 20 * 60_000,
      async execute(args: Record<string, unknown>, exec: unknown): Promise<string> {
        const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
        if (prompt === '') throw new Error('需要 prompt（用户原始描述）')
        const images = Array.isArray(args.images) ? args.images.filter((value): value is string => typeof value === 'string' && value !== '') : []
        const result = await service.generateVideo({
          prompt,
          ...(typeof args.model === 'string' && args.model !== '' ? { model: args.model } : {}),
          ...(typeof args.duration === 'number' ? { duration: args.duration } : {}),
          ...(typeof args.ratio === 'string' && args.ratio !== '' ? { ratio: args.ratio } : {}),
          images,
          ...(typeof args.outDir === 'string' && args.outDir !== '' ? { outDir: args.outDir } : {}),
          sessionKey: sessionKeyOf(exec),
        })
        if (!result.ok) throw new Error(result.message ?? '生成失败')
        return resultText(result)
      },
    },
    {
      name: 'xyq_balance',
      description: '查询小云雀账户剩余积分。生成前先查，避免余额不足。',
      parameters: { type: 'object', properties: {} },
      output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 60_000,
      async execute(): Promise<string> {
        const result = await service.balance()
        if (!result.ok) throw new Error(result.message ?? '查询余额失败')
        return `小云雀剩余积分：${result.totalRemain ?? '未知'}`
      },
    },
    {
      name: 'xyq_models',
      description: '查询小云雀可用模型（type=video 或 image）。生图/生视频前用它确认模型名。',
      parameters: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['video', 'image'], description: '模型类型' } },
        required: ['type'],
      },
      output: { schema: { type: 'string' }, render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 90_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        const kind = args.type === 'image' ? 'image' : 'video'
        const result = await service.models(kind)
        if (!result.ok) throw new Error(result.message ?? '查询模型失败')
        const list = result.models ?? []
        return list.length === 0 ? '（没有查到模型）' : list.map((model) => `- ${model.name}（${model.key}）`).join('\n')
      },
    },
  ]
}
