/**
 * sprite/tools —— 暴露给 LLM 的工具定义（14 个）。
 *
 * 三条纪律（评审文档 A/C 两条主线的落点）：
 * 1. **每个工具只做一件事**，返回一行 JSON 字符串：模型读数字（stats），人读路径（pngPath）。
 * 2. **描述要自解释**：锚点口径、两档参数、`preview` 会清缓存这类语义，写进 description，
 *    不让调用方去读 6000 行 HTML 逆推。
 * 3. **参数白名单按"页面能调的，API 就能调"**：`.57` 之前 `mode/feather/cleanup/adv*` 被
 *    工具层滤掉，高级档参数静默失效——这是评审文档的 P1，也是这次返工的直接起因。
 */
import type { SpriteService } from './service.js'
import { SPRITE_GUIDE } from './guide.js'
import { KEY_PARAM_KEYS, type KeyParams, type Rect } from './types.js'

const json = (value: unknown): string => JSON.stringify(value)
const fail = (error: unknown): never => {
  throw new Error(String((error as Error)?.message ?? error).slice(0, 500))
}

/** 把任意入参收敛成 `KeyParams`；不认识的键由调用方记进 `ignored`。 */
export function keyParamsOf(args: Record<string, unknown>): KeyParams {
  const out: KeyParams = {}
  if (args.mode === 'classic' || args.mode === 'advanced') out.mode = args.mode
  if (typeof args.colorHex === 'string' && args.colorHex.trim() !== '') out.colorHex = args.colorHex.trim()
  for (const key of ['intensity', 'feather', 'cleanup', 'softness', 'despill', 'greenToAlpha', 'advIntensity', 'advFeather'] as const) {
    const value = args[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
  }
  for (const key of ['aggressive', 'autoPlate'] as const) {
    if (typeof args[key] === 'boolean') out[key] = args[key]
  }
  return out
}

/** 传了但本工具不认识的键（P1 的"静默丢弃"要在返回里显形）。 */
export function ignoredKeysOf(args: Record<string, unknown>): string[] {
  const known = new Set<string>([...KEY_PARAM_KEYS, 'frame', 'indices', 'probeFrames'])
  return Object.keys(args).filter((key) => !known.has(key))
}

function rectOf(value: unknown): Rect | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const nums = [raw.x, raw.y, raw.w, raw.h]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  return { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) }
}

const KEY_PROPERTIES = {
  mode: { type: 'string', enum: ['classic', 'advanced'], description: '抠图档位：classic 走 intensity/feather/cleanup；advanced 走 softness/despill/aggressive/greenToAlpha/autoPlate' },
  colorHex: { type: 'string', description: '键色 #RRGGBB。**必须用 sprite_probe_color 实测的背景色**，写 #00FF00 基本抠不出来' },
  intensity: { type: 'number', description: '抠色力度 10~90（两档都吃）' },
  feather: { type: 'number', description: 'alpha 羽化半径 0~100（仅 classic）' },
  cleanup: { type: 'number', description: '去色溢出 0~100（仅 classic）' },
  softness: { type: 'number', description: '软边宽度 0~100（仅 advanced）' },
  despill: { type: 'number', description: '去绿边强度 0~100（仅 advanced）' },
  greenToAlpha: { type: 'number', description: '残绿转透明 0~300（仅 advanced）' },
  aggressive: { type: 'boolean', description: '主体轮廓也去绿（仅 advanced）' },
  autoPlate: { type: 'boolean', description: '自动背景板，**只在 key_apply 生效**，preview 看不出来（仅 advanced）' },
  advIntensity: { type: 'number', description: 'advanced 档自己的强度 0~100（不改 classic 的 intensity）' },
  advFeather: { type: 'number', description: 'advanced 档自己的羽化 0~100' },
} as const

function keySchema(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'object', properties: { ...KEY_PROPERTIES, ...extra } }
}

const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [{ type: 'text', text: String(value) }],
}

export function buildTools(service: SpriteService): Array<Record<string, unknown>> {
  return [
    {
      name: 'sprite_prepare',
      description:
        '序列帧第一步：导入视频并抽帧。返回 {frames,width,height,transport}。' +
        'transport=http 表示视频走本地直传（快）；base64 是兜底通道（慢 20 秒左右）。',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string', description: '视频文件绝对路径（mp4/webm/mov，≤200MB）' },
          start: { type: 'number', description: '起始秒，默认 0' },
          end: { type: 'number', description: '结束秒，默认 4' },
          fps: { type: 'number', description: '抽帧帧率，默认 12' },
        },
        required: ['videoPath'],
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        const videoPath = typeof args.videoPath === 'string' ? args.videoPath : ''
        if (videoPath === '') return fail('需要 videoPath（视频绝对路径）')
        try {
          return json(
            await service.prepare({
              videoPath,
              ...(typeof args.start === 'number' ? { start: args.start } : {}),
              ...(typeof args.end === 'number' ? { end: args.end } : {}),
              ...(typeof args.fps === 'number' ? { fps: args.fps } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_probe_color',
      description:
        '从帧的四边带自动采样背景色，返回 {keyColor,spread,samples,rejected}。' +
        'spread 越小说明背景越均匀（<0.05 可用）；被主体压住、判不准的边会进 rejected。**抠图前先调它。**',
      parameters: {
        type: 'object',
        properties: {
          frame: { type: 'number', description: '用第几帧采样，默认 0' },
          bandPx: { type: 'number', description: '边框带宽度（像素），默认按短边 3% 自动取' },
        },
      },
      output: OUT,
      timeoutMs: 60_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.probeColor({
              ...(typeof args.frame === 'number' ? { frame: args.frame } : {}),
              ...(typeof args.bandPx === 'number' ? { bandPx: args.bandPx } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_key_preview',
      description:
        '按参数抠**一帧**并返回量化指标（bgResidual/subjectCoverage/edgeGreen/alphaHistogram），秒级，用来迭代参数。' +
        '⚠️ 它会清空抠图缓存：之后要导出必须重新 sprite_key_apply。autoPlate 在预览里不生效（只在 apply 生效）。',
      parameters: keySchema({ frame: { type: 'number', description: '第几帧，默认 0' } }),
      output: OUT,
      timeoutMs: 120_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const result = await service.keyPreview({
            ...keyParamsOf(args),
            ...(typeof args.frame === 'number' ? { frame: args.frame } : {}),
          })
          return json({ ...result, ignored: ignoredKeysOf(args) })
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_key_apply',
      description:
        '把参数应用到**全部帧**（含自动背景板），完成后回 {frames,keyedCount,stats,worst,appliedParams}。慢，30~90 秒。' +
        'worst 是抽样帧里最差的一帧——第 0 帧干净不代表整段干净。',
      parameters: keySchema(),
      output: OUT,
      timeoutMs: 600_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const result = await service.keyApply(keyParamsOf(args))
          return json({ ...result, ignored: ignoredKeysOf(args) })
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_measure',
      description:
        '量这张（或全部）帧的内容边界：alphaBBox / contentHeight / perFrameSpread / 可选 landmarks，并出一张核对图（overlayPath）。' +
        'frame:"all" 能给每帧 topY/soleY 的极值分布——用它区分"真内容"和"某帧的残留"。' +
        '坐标一律「帧原始像素、左上原点、右下开区间」。',
      parameters: {
        type: 'object',
        properties: {
          frame: { type: 'number', description: '第几帧，默认 0' },
          all: { type: 'boolean', description: 'true = 统计全部帧（给 perFrameSpread，用来发现"某帧有残留"）' },
          alphaThreshold: { type: 'number', description: 'alpha 阈值，默认 32' },
          overlay: { type: 'boolean', description: '是否输出核对图，默认 true' },
          source: { type: 'string', enum: ['keyed', 'raw'], description: '量抠图结果（默认 keyed）还是原始帧（raw）' },
          landmarks: {
            type: 'array',
            description: '要量的基准点；不传就只给几何统计',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['bbox-top', 'bbox-bottom', 'bbox-left', 'bbox-right', 'point', 'scan-vertical'] },
                x: { type: 'number' },
                y: { type: 'number' },
                fromY: { type: 'number' },
                toY: { type: 'number' },
                alphaThreshold: { type: 'number' },
              },
              required: ['id', 'type'],
            },
          },
        },
      },
      output: OUT,
      timeoutMs: 300_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.measure({
              frame: args.all === true ? 'all' : typeof args.frame === 'number' ? args.frame : 0,
              ...(typeof args.alphaThreshold === 'number' ? { alphaThreshold: args.alphaThreshold } : {}),
              ...(Array.isArray(args.landmarks) ? { landmarks: args.landmarks as never } : {}),
              ...(typeof args.overlay === 'boolean' ? { overlay: args.overlay } : {}),
              ...(args.source === 'keyed' || args.source === 'raw' ? { source: args.source } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_scale_to',
      description:
        '按**目标物理量**反推缩放，回 {scale,wantedScale,clamped,sourcePx,achievedPx,cellW,cellH}。' +
        'charHeightPx + span（两个基准行）是推荐用法；targetCellHeight 是旧的"整格高"语义；都不给就按首帧 bbox 高。' +
        '缩放上限 300%，超了 clamped=true 并在 achievedPx 里给真实值。',
      parameters: {
        type: 'object',
        properties: {
          charHeightPx: { type: 'number', description: '目标：角色/内容净高（像素）' },
          targetCellHeight: { type: 'number', description: '目标：整格高（旧语义）' },
          span: {
            type: 'object',
            description: '参与计算的两个基准行（帧像素，含端点）',
            properties: { fromY: { type: 'number' }, toY: { type: 'number' } },
          },
        },
      },
      output: OUT,
      timeoutMs: 120_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const span =
            args.span && typeof args.span === 'object' &&
            typeof (args.span as Record<string, unknown>).fromY === 'number' &&
            typeof (args.span as Record<string, unknown>).toY === 'number'
              ? {
                  fromY: Number((args.span as Record<string, unknown>).fromY),
                  toY: Number((args.span as Record<string, unknown>).toY),
                }
              : undefined
          return json(
            await service.scaleTo({
              ...(typeof args.charHeightPx === 'number' ? { charHeightPx: args.charHeightPx } : {}),
              ...(typeof args.targetCellHeight === 'number' ? { targetCellHeight: args.targetCellHeight } : {}),
              ...(span ? { span } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_get_anchor',
      description:
        '读当前锚点：{anchorX,anchorY,convention,pixels,frameWidth,frameHeight}。' +
        'convention 固定 y-from-bottom（0=帧底）；主流运行时常用 y-from-top，两者是 1-y 的关系。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 60_000,
      async execute(): Promise<string> {
        try {
          return json(await service.getAnchor())
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_set_anchor',
      description:
        '按**像素**设锚点：{x,y,convention?}。⚠️ 像素空间是**最终格子**（裁剪+最小化+缩放之后），不是原帧——' +
        '传原帧坐标会被夹到边界。y 默认从格底往上量（y-from-bottom）；convention:"y-from-top" 时按从顶往下解释。' +
        '设置后 get_anchor 能读回同一组值（闭环）。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '锚点 x（帧像素）' },
          y: { type: 'number', description: '锚点 y（帧像素；口径由 convention 决定）' },
          convention: { type: 'string', enum: ['y-from-bottom', 'y-from-top'], description: '默认 y-from-bottom' },
        },
      },
      output: OUT,
      timeoutMs: 60_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.setAnchorPx({
              ...(typeof args.x === 'number' ? { x: args.x } : {}),
              ...(typeof args.y === 'number' ? { y: args.y } : {}),
              ...(args.convention === 'y-from-bottom' || args.convention === 'y-from-top'
                ? { convention: args.convention }
                : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_cleanup',
      description:
        '去水印（maskRect 可选矩形或 "auto" 自动识别）+ 裁剪（trim 策略可选）。' +
        'trim.mode:"union" 是 48 帧并集（防截肢，但漂浮物会撑大格子）；"first-frame" 只按首帧+pad（格子稳）。' +
        '返回里回显 pad / alphaThreshold / unionFrames，方便对账（差 1~2px 时先看这里）。',
      parameters: {
        type: 'object',
        properties: {
          maskAuto: { type: 'boolean', description: 'true = 自动识别水印区域再遮' },
          maskRect: {
            type: 'object',
            description: '去水印矩形 {x,y,w,h}（省略=不遮）',
            properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
          },
          trim: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['union', 'first-frame'], description: '默认 union' },
              pad: {
                type: 'object',
                properties: { top: { type: 'number' }, bottom: { type: 'number' }, left: { type: 'number' }, right: { type: 'number' } },
              },
              alphaThreshold: { type: 'number' },
            },
          },
        },
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const mask = args.maskAuto === true ? 'auto' : rectOf(args.maskRect) ?? null
          const trimArg = (args.trim ?? {}) as Record<string, unknown>
          const padRaw = (trimArg.pad ?? {}) as Record<string, unknown>
          return json(
            await service.cleanup({
              maskRect: mask,
              trim: {
                ...(trimArg.mode === 'first-frame' || trimArg.mode === 'union' ? { mode: trimArg.mode } : {}),
                pad: {
                  ...(typeof padRaw.top === 'number' ? { top: padRaw.top } : {}),
                  ...(typeof padRaw.bottom === 'number' ? { bottom: padRaw.bottom } : {}),
                  ...(typeof padRaw.left === 'number' ? { left: padRaw.left } : {}),
                  ...(typeof padRaw.right === 'number' ? { right: padRaw.right } : {}),
                },
                ...(typeof trimArg.alphaThreshold === 'number' ? { alphaThreshold: trimArg.alphaThreshold } : {}),
              },
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_export',
      description:
        '拼成精灵图并导出（PNG 或 webp）+ meta.json。**导出前必须有抠图缓存**：如果刚跑过 preview 或改过参数，' +
        '它会直接报错让你先 apply（以前这里会静默拼原帧，交出绿底图）。' +
        '命名默认 <name>_<cols>x<rows>.<format>，dirPerAction 时放进 <outDir>/<name>/。',
      parameters: {
        type: 'object',
        properties: {
          cols: { type: 'number', description: '列数，默认 8' },
          rows: { type: 'number', description: '行数，默认 6' },
          targetHeight: { type: 'number', description: '旧的"整格目标高"（像素）' },
          charHeightPx: { type: 'number', description: '推荐：角色/内容净高（像素），配 span 使用' },
          span: {
            type: 'object',
            description: '两个基准行（帧像素）；来自 sprite_measure 的 alphaBBox',
            properties: { fromY: { type: 'number' }, toY: { type: 'number' } },
          },
          anchorX: { type: 'number', description: '锚点 x（0~1，按帧宽比例）' },
          anchorY: { type: 'number', description: '锚点 y（0~1，**y-from-bottom**）' },
          outDir: { type: 'string', description: '输出目录（默认 storages/.../sprite-out）' },
          fileName: { type: 'string', description: '图片文件名（含扩展名）' },
          metaName: { type: 'string', description: 'meta 文件名' },
          dirPerAction: { type: 'boolean', description: 'true → 放进 <outDir>/<name>/' },
          overwrite: { type: 'boolean', description: 'false 时目标已存在就报错（默认 true）' },
          format: { type: 'string', enum: ['png', 'webp'], description: '默认 png；webp 体积小得多' },
          quality: { type: 'number', description: 'webp 质量 0~1，默认 0.9' },
          name: { type: 'string', description: '动作名（用于默认文件名与子目录）' },
        },
      },
      output: OUT,
      timeoutMs: 600_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const span =
            args.span && typeof args.span === 'object' &&
            typeof (args.span as Record<string, unknown>).fromY === 'number' &&
            typeof (args.span as Record<string, unknown>).toY === 'number'
              ? {
                  fromY: Number((args.span as Record<string, unknown>).fromY),
                  toY: Number((args.span as Record<string, unknown>).toY),
                }
              : undefined
          return json(
            await service.exportSheet({
              ...(typeof args.cols === 'number' ? { cols: args.cols } : {}),
              ...(typeof args.rows === 'number' ? { rows: args.rows } : {}),
              ...(typeof args.targetHeight === 'number' ? { targetHeight: args.targetHeight } : {}),
              ...(typeof args.charHeightPx === 'number' ? { charHeightPx: args.charHeightPx } : {}),
              ...(span ? { span } : {}),
              ...(typeof args.anchorX === 'number' ? { anchorX: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { anchorY: args.anchorY } : {}),
              ...(typeof args.outDir === 'string' ? { outDir: args.outDir } : {}),
              ...(typeof args.fileName === 'string' ? { fileName: args.fileName } : {}),
              ...(typeof args.metaName === 'string' ? { metaName: args.metaName } : {}),
              ...(typeof args.dirPerAction === 'boolean' ? { dirPerAction: args.dirPerAction } : {}),
              ...(typeof args.overwrite === 'boolean' ? { overwrite: args.overwrite } : {}),
              ...(args.format === 'png' || args.format === 'webp' ? { format: args.format } : {}),
              ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
              ...(typeof args.name === 'string' ? { name: args.name } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_autotune',
      description:
        '自动调参：先自动采色，然后按指标迭代（bgResidual/subjectCoverage/edgeGreen），返回 {params,trace,reachedGoal}。' +
        '省掉你"读 stats 改参数试三轮"。⚠️ 它内部用 preview（会清缓存），调完要 sprite_key_apply。',
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'object',
            properties: {
              maxBgResidual: { type: 'number', description: '默认 0.01' },
              minSubjectCoverage: { type: 'number', description: '默认 0.98' },
              maxEdgeGreen: { type: 'number', description: '默认 0.10' },
            },
          },
          space: {
            type: 'object',
            properties: {
              intensity: { type: 'array', items: { type: 'number' }, description: '[下界, 上界]' },
              mode: { type: 'array', items: { type: 'string' }, description: '可选档位列表' },
            },
          },
          maxIters: { type: 'number', description: '默认 6，上限 12' },
          frame: { type: 'number', description: '用哪一帧迭代，默认 0' },
        },
      },
      output: OUT,
      timeoutMs: 300_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const goalRaw = (args.goal ?? {}) as Record<string, unknown>
          const spaceRaw = (args.space ?? {}) as Record<string, unknown>
          const intensity = Array.isArray(spaceRaw.intensity) && spaceRaw.intensity.length === 2
            ? ([Number(spaceRaw.intensity[0]), Number(spaceRaw.intensity[1])] as [number, number])
            : undefined
          return json(
            await service.autotune({
              goal: {
                ...(typeof goalRaw.maxBgResidual === 'number' ? { maxBgResidual: goalRaw.maxBgResidual } : {}),
                ...(typeof goalRaw.minSubjectCoverage === 'number' ? { minSubjectCoverage: goalRaw.minSubjectCoverage } : {}),
                ...(typeof goalRaw.maxEdgeGreen === 'number' ? { maxEdgeGreen: goalRaw.maxEdgeGreen } : {}),
              },
              ...(intensity ? { space: { intensity } } : {}),
              ...(typeof args.maxIters === 'number' ? { maxIters: args.maxIters } : {}),
              ...(typeof args.frame === 'number' ? { frame: args.frame } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_batch',
      description:
        '批量：一个 items 数组跑完整管线（prepare→采色→measure→apply→cleanup→export），单条失败不影响其他条。' +
        '每条占一个子目录 <outRoot>/<name>/。当前串行执行（并发需要会话隔离）。',
      parameters: {
        type: 'object',
        properties: {
          outRoot: { type: 'string', description: '输出根目录' },
          concurrency: { type: 'number', description: '预留：>1 目前仍按串行跑并给 warning' },
          overwrite: { type: 'boolean', description: '默认 true' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                videoPath: { type: 'string' },
                action: { type: 'string', description: '动作 id，如 idle / sneak_eat' },
                name: { type: 'string', description: '产物名，默认用 action' },
                start: { type: 'number' },
                end: { type: 'number' },
                fps: { type: 'number' },
                keyColor: { type: 'string', description: '不给就自动采色' },
                intensity: { type: 'number' },
                mode: { type: 'string', enum: ['classic', 'advanced'] },
                maskAuto: { type: 'boolean', description: 'true = 自动去水印' },
                targetCharHeight: { type: 'number' },
                trimMode: { type: 'string', enum: ['union', 'first-frame'] },
                cols: { type: 'number' },
                rows: { type: 'number' },
                format: { type: 'string', enum: ['png', 'webp'] },
              },
              required: ['videoPath', 'action'],
            },
          },
        },
        required: ['outRoot', 'items'],
      },
      output: OUT,
      timeoutMs: 1_800_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const items = Array.isArray(args.items) ? args.items : []
          if (items.length === 0) return fail('items 不能为空')
          const outRoot = typeof args.outRoot === 'string' ? args.outRoot : ''
          if (outRoot === '') return fail('需要 outRoot（输出根目录）')
          return json(
            await service.batch({
              outRoot,
              items: items.map((row) => {
                const item = row as Record<string, unknown>
                return {
                  videoPath: String(item.videoPath ?? ''),
                  action: String(item.action ?? ''),
                  ...(typeof item.name === 'string' ? { name: item.name } : {}),
                  ...(typeof item.start === 'number' ? { start: item.start } : {}),
                  ...(typeof item.end === 'number' ? { end: item.end } : {}),
                  ...(typeof item.fps === 'number' ? { fps: item.fps } : {}),
                  ...(typeof item.keyColor === 'string' ? { keyColor: item.keyColor } : {}),
                  ...(typeof item.intensity === 'number' ? { intensity: item.intensity } : {}),
                  ...(item.mode === 'classic' || item.mode === 'advanced' ? { mode: item.mode } : {}),
                  ...(item.maskAuto === true ? { maskRect: 'auto' as const } : {}),
                  ...(typeof item.targetCharHeight === 'number' ? { targetCharHeight: item.targetCharHeight } : {}),
                  ...(item.trimMode === 'union' || item.trimMode === 'first-frame' ? { trimMode: item.trimMode } : {}),
                  ...(typeof item.cols === 'number' ? { cols: item.cols } : {}),
                  ...(typeof item.rows === 'number' ? { rows: item.rows } : {}),
                  ...(item.format === 'png' || item.format === 'webp' ? { format: item.format } : {}),
                }
              }),
              ...(typeof args.concurrency === 'number' ? { concurrency: args.concurrency } : {}),
              ...(typeof args.overwrite === 'boolean' ? { overwrite: args.overwrite } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_auto',
      description:
        '一段素材的一条龙：prepare → 自动采色 → measure → autotune → apply → cleanup → export。' +
        '返回和 sprite_export 一样的字段，外加 stages（每步一句话，出问题时先看它）。',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string' },
          name: { type: 'string', description: '产物名，默认用文件名' },
          outDir: { type: 'string' },
          targetCharHeight: { type: 'number' },
          cols: { type: 'number' },
          rows: { type: 'number' },
          format: { type: 'string', enum: ['png', 'webp'] },
          trimMode: { type: 'string', enum: ['union', 'first-frame'] },
          maskAuto: { type: 'boolean', description: 'true = 自动去水印' },
        },
        required: ['videoPath'],
      },
      output: OUT,
      timeoutMs: 900_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const videoPath = typeof args.videoPath === 'string' ? args.videoPath : ''
          if (videoPath === '') return fail('需要 videoPath')
          return json(
            await service.auto({
              videoPath,
              ...(typeof args.name === 'string' ? { name: args.name } : {}),
              ...(typeof args.outDir === 'string' ? { outDir: args.outDir } : {}),
              ...(typeof args.targetCharHeight === 'number' ? { targetCharHeight: args.targetCharHeight } : {}),
              ...(typeof args.cols === 'number' ? { cols: args.cols } : {}),
              ...(typeof args.rows === 'number' ? { rows: args.rows } : {}),
              ...(args.format === 'png' || args.format === 'webp' ? { format: args.format } : {}),
              ...(args.trimMode === 'union' || args.trimMode === 'first-frame' ? { trimMode: args.trimMode } : {}),
              ...(args.maskAuto === true ? { maskRect: 'auto' as const } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_guide',
      description:
        '返回这套工具的完整指南（六步原语 / 参数语义表 / 症状速查 / 锚点口径 / 交付约定）。' +
        '不确定语义时先调它，比读源码快。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 10_000,
      async execute(): Promise<string> {
        return SPRITE_GUIDE
      },
    },
  ]
}
