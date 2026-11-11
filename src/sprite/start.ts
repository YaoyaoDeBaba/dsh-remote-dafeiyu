/**
 * sprite/start —— 序列帧精灵图工具的接线：托管工具页 + 注册 5 个 agent 工具。
 *
 * 与识图/派活同一条纪律：软挂载、`stop()` 幂等、失败写 `probe` 并留一行日志。
 * 区别是它会**起子进程**（无头 Edge），所以：
 * - 只在真正调用工具时才起，闲置超时自己关；
 * - 停机时无条件关（`stop()` 里 await，不留孤儿进程）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SPRITE_PAGE_ROUTE, spritePageHandler } from './routes.js'
import { createSpriteService, type SpriteService } from './service.js'

interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
}

interface Registerable {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => unknown
  }): () => void
}

export interface SpriteHandle {
  stop(): void
  readonly probe: Record<string, string>
}

/** 引导语：告诉模型这套工具怎么用（写进 systemPrompt 段）。 */
export const SPRITE_GUIDANCE = `你有「序列帧精灵图」能力：把带绿幕背景的视频转成透明底精灵图（抽帧 → 抠背景 → 去水印/裁剪 → 拼图导出）。
标准流程：sprite_prepare → 调参循环（sprite_key_preview 看 stats → 改参数）→ sprite_key_apply → sprite_cleanup → sprite_export。
调参规则：
- bgResidual > 0.02 且 subjectCoverage > 0.98 → 加 intensity（+10，上限 90）
- bgResidual 高但 subjectCoverage 掉到 0.98 以下 → 加 softness 或降 intensity（别把主体抠掉）
- edgeGreen > 0.10 → 开 aggressive，greenToAlpha +10
- 背景斑驳（参数够了但仍有残留）→ 开 autoPlate 再 apply（注意：autoPlate 只在 apply 生效，单帧预览看不出来）
最多迭代 6 轮，每轮记下参数与 stats；收敛后才 apply。apply 之后 stats 会再给一次（那是含自动背景板的结果）。
如果迭代到上限仍不收敛，就明确告诉用户"背景不可抠/需要重拍"，不要硬塞一张烂图。`

/** 插件包根目录（dist/bundle/index.js → 上两级）。 */
function packageRoot(): string {
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  } catch {
    return process.cwd()
  }
}

export interface SpriteStartDeps {
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 工具页（打补丁后的 HTML）路径；不给就按包内 assets 找。 */
  toolHtmlPath?: string
  /** 导出目录；不给就用 dshHome 下 storages/.../sprite-out。 */
  outDir?: string
  /** 关掉工具注册（设置里禁用时用）。 */
  enabled?: boolean
}

export function startSprite(ctx: LooseContext, deps: SpriteStartDeps): SpriteHandle {
  const probe: Record<string, string> = {}
  const toolHtmlPath = deps.toolHtmlPath ?? path.join(packageRoot(), 'assets', 'sprite', 'sprite-tool.html')
  const outDir = deps.outDir ?? path.join(deps.dshHome, 'storages', 'dsh-remote-dafeiyu', 'sprite-out')

  let service: SpriteService | undefined
  if (deps.enabled === false) {
    probe.service = 'disabled'
  } else if (!existsSync(toolHtmlPath)) {
    probe.service = `missing-tool-html: ${toolHtmlPath}`
    deps.log('序列帧工具页不存在（工具不会注册）', { path: toolHtmlPath })
  } else {
    try {
      service = createSpriteService({ toolHtmlPath, outDir, log: deps.log })
      probe.service = 'ready'
    } catch (error) {
      service = undefined
      probe.service = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    }
  }

  // ── 工具注册（服务在时才注册；缺了就明确不注册，免得模型调到一半发现没有实现）──
  if (service) {
    try {
      const tools = ctx.get?.('tools', true) as
        | { register?: (definition: Record<string, unknown>) => unknown }
        | undefined
      if (tools && typeof tools.register === 'function') {
        for (const definition of buildTools(service)) tools.register(definition)
        probe.tools = 'registered'
      } else {
        probe.tools = 'no-tools'
      }
    } catch (error) {
      probe.tools = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
    }
  } else {
    probe.tools = 'skipped'
  }

  // ── 提示段：告诉模型这套工具存在、怎么迭代 ──
  try {
    const systemPrompt = ctx.get?.('systemPrompt', true) as
      | { section?: (definition: { name: string; order: number; text: string }) => unknown }
      | undefined
    if (service && systemPrompt && typeof systemPrompt.section === 'function') {
      systemPrompt.section({ name: 'dafeiyu:sprite', order: 10091, text: SPRITE_GUIDANCE })
      probe.section = 'registered'
    } else {
      probe.section = service ? 'no-systemPrompt' : 'skipped'
    }
  } catch (error) {
    probe.section = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}`
  }

  // ── 工具页托管（给人用）──
  let web: Registerable | undefined
  let unregister: (() => void) | undefined
  let started = false
  let stopped = false
  const tryStart = (): void => {
    if (started || stopped || !web || !service) return
    started = true
    try {
      unregister = web.register({
        kind: 'exact',
        path: SPRITE_PAGE_ROUTE,
        handler: spritePageHandler({ toolHtmlPath, log: deps.log }),
      })
      probe.routes = 'registered'
    } catch (error) {
      probe.routes = `register threw: ${String((error as Error)?.message ?? error).slice(0, 80)}`
      started = false
    }
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
      } catch (error) {
        probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
      }
    }) as never)
  } catch (error) {
    probe['injectThrew:webServer'] = String((error as Error)?.message ?? error).slice(0, 160)
  }

  return {
    probe,
    stop(): void {
      if (stopped) return
      stopped = true
      try {
        unregister?.()
      } catch {
        /* 注销失败不许拖住停机 */
      }
      // 子进程必须在停机时收掉：这里不能 await，所以挂一个不会抛的 then。
      void service?.stop().catch(() => undefined)
    },
  }
}

/**
 * 五个工具。返回结构一律是**一行 JSON 字符串**：
 * 模型读数字（stats），人读路径（pngPath）。图不在工具返回里回传——dataURL 太大，
 * 需要看图时让它去看文件。
 */
function buildTools(service: SpriteService): Array<Record<string, unknown>> {
  const json = (value: unknown): string => JSON.stringify(value)
  const fail = (error: unknown): never => {
    throw new Error(String((error as Error)?.message ?? error).slice(0, 400))
  }

  return [
    {
      name: 'sprite_prepare',
      description: '序列帧精灵图第一步：导入视频并抽帧。返回帧数与像素尺寸。',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string', description: '视频文件绝对路径（mp4/webm/mov）' },
          start: { type: 'number', description: '起始秒，默认 0' },
          end: { type: 'number', description: '结束秒，默认 4' },
          fps: { type: 'number', description: '抽帧帧率，默认 12' },
        },
        required: ['videoPath'],
      },
      output: { schema: { type: 'string' }, render: (_a: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 180_000,
      async execute(args: { videoPath?: unknown; start?: unknown; end?: unknown; fps?: unknown }): Promise<string> {
        const videoPath = typeof args.videoPath === 'string' ? args.videoPath : ''
        if (videoPath === '') return fail('需要 videoPath（视频绝对路径）')
        try {
          const result = await service.prepare({
            videoPath,
            ...(typeof args.start === 'number' ? { start: args.start } : {}),
            ...(typeof args.end === 'number' ? { end: args.end } : {}),
            ...(typeof args.fps === 'number' ? { fps: args.fps } : {}),
          })
          return json(result)
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_key_preview',
      description:
        '按参数抠一帧并返回量化指标（bgResidual/subjectCoverage/edgeGreen/alphaHistogram）。用它迭代参数，快（秒级）。',
      parameters: {
        type: 'object',
        properties: {
          frame: { type: 'number', description: '第几帧，默认 0' },
          colorHex: { type: 'string', description: '键色，如 #00FF00' },
          intensity: { type: 'number', description: '抠色力度，关键参数，10~90' },
          softness: { type: 'number', description: '柔和度 0~100' },
          despill: { type: 'number', description: '去绿边 0~100' },
          greenToAlpha: { type: 'number', description: '残绿转透明 0~300' },
          aggressive: { type: 'boolean', description: '去绿边（管主体轮廓）' },
          autoPlate: { type: 'boolean', description: '自动背景板（预览不生效，只在 apply 生效）' },
        },
      },
      output: { schema: { type: 'string' }, render: (_a: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 120_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const result = await service.keyPreview(keyParamsOf(args))
          return json(result)
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_key_apply',
      description: '把当前参数应用到全部帧（含自动背景板），完成后会再算一次指标。慢，30~90 秒。',
      parameters: {
        type: 'object',
        properties: {
          colorHex: { type: 'string' },
          intensity: { type: 'number' },
          softness: { type: 'number' },
          despill: { type: 'number' },
          greenToAlpha: { type: 'number' },
          aggressive: { type: 'boolean' },
          autoPlate: { type: 'boolean' },
        },
      },
      output: { schema: { type: 'string' }, render: (_a: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 300_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(await service.keyApply(keyParamsOf(args)))
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_cleanup',
      description: '去水印（可选矩形）并做尺寸最小化裁剪。必须在抠图合格之后调用（背景残留会让裁剪失效）。',
      parameters: {
        type: 'object',
        properties: {
          maskRect: {
            type: 'object',
            description: '去水印矩形 {x,y,w,h}（像素，基于帧原始尺寸）',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
              w: { type: 'number' },
              h: { type: 'number' },
            },
          },
        },
      },
      output: { schema: { type: 'string' }, render: (_a: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 120_000,
      async execute(args: { maskRect?: unknown }): Promise<string> {
        try {
          const rect = args.maskRect as { x?: number; y?: number; w?: number; h?: number } | undefined
          const maskRect =
            rect && typeof rect === 'object' && [rect.x, rect.y, rect.w, rect.h].every((n) => typeof n === 'number')
              ? { x: Number(rect.x), y: Number(rect.y), w: Number(rect.w), h: Number(rect.h) }
              : null
          return json(await service.cleanup({ maskRect }))
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_export',
      description: '拼成精灵图并导出 PNG + meta.json（含锚点）。默认 7×7、目标高度 512。',
      parameters: {
        type: 'object',
        properties: {
          cols: { type: 'number', description: '列数，默认 7' },
          rows: { type: 'number', description: '行数，默认 7' },
          targetHeight: { type: 'number', description: '单格目标高度（像素），默认 512，建议不超过 512' },
          anchorX: { type: 'number', description: '锚点 X（0~1），默认 0.5' },
          anchorY: { type: 'number', description: '锚点 Y（0~1），默认 0.04' },
        },
      },
      output: { schema: { type: 'string' }, render: (_a: unknown, value: unknown) => [{ type: 'text', text: String(value) }] },
      timeoutMs: 300_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.exportSheet({
              ...(typeof args.cols === 'number' ? { cols: args.cols } : {}),
              ...(typeof args.rows === 'number' ? { rows: args.rows } : {}),
              ...(typeof args.targetHeight === 'number' ? { targetHeight: args.targetHeight } : {}),
              ...(typeof args.anchorX === 'number' ? { anchorX: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { anchorY: args.anchorY } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
  ]
}

function keyParamsOf(args: Record<string, unknown>): {
  colorHex?: string
  intensity?: number
  softness?: number
  despill?: number
  greenToAlpha?: number
  aggressive?: boolean
  autoPlate?: boolean
  frame?: number
} {
  const out: Record<string, unknown> = {}
  if (typeof args.colorHex === 'string' && args.colorHex.trim() !== '') out.colorHex = args.colorHex.trim()
  for (const key of ['intensity', 'softness', 'despill', 'greenToAlpha', 'frame'] as const) {
    if (typeof args[key] === 'number' && Number.isFinite(args[key] as number)) out[key] = args[key]
  }
  for (const key of ['aggressive', 'autoPlate'] as const) {
    if (typeof args[key] === 'boolean') out[key] = args[key]
  }
  return out as never
}
