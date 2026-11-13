/**
 * sprite/tools —— 暴露给 LLM 的工具定义（20 个）。
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
import { LOOP_MASK_MODES } from './loop.js'
import { KEY_PARAM_KEYS, PIXEL_SOURCES, SCAN_AGGREGATES, SCAN_CHANNELS, SCAN_OPS, type KeyParams, type Rect, type ReferenceSpec } from './types.js'

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

/** 像素矩形的 schema（三个重计算原语共用）。说清楚是**源帧像素**，别让人以为是归一化坐标。 */
function rectSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description,
    properties: {
      x: { type: 'number', description: '左上角 x（源帧像素，整数）' },
      y: { type: 'number', description: '左上角 y（源帧像素，整数）' },
      w: { type: 'number', description: '宽（像素，>0）' },
      h: { type: 'number', description: '高（像素，>0）' },
    },
    required: ['x', 'y', 'w', 'h'],
  }
}

/** 像素来源：keyed / raw。三个原语共用同一套语义（原帧整幅不透明，别拿它算剪影）。 */
function sourceSchema(): Record<string, unknown> {
  return {
    type: 'string',
    enum: [...PIXEL_SOURCES],
    description:
      '像素来源：keyed（默认，抠图结果；没 keyApply 会报错）或 raw（原帧；绿幕素材整幅不透明，剪影/模板都会被背景污染）',
  }
}

function scaleSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description,
    properties: {
      min: { type: 'number', description: '下界（默认按工具给的默认值）' },
      max: { type: 'number', description: '上界' },
      step: { type: 'number', description: '步长' },
    },
  }
}

/** 尺度范围从工具参数收敛成 service 认的形状（不认的键不编默认值，交给 service 兜）。 */
function scaleRangeOf(value: unknown): { min?: number; max?: number; step?: number } | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const out: { min?: number; max?: number; step?: number } = {}
  if (typeof raw.min === 'number' && Number.isFinite(raw.min)) out.min = raw.min
  if (typeof raw.max === 'number' && Number.isFinite(raw.max)) out.max = raw.max
  if (typeof raw.step === 'number' && Number.isFinite(raw.step)) out.step = raw.step
  return Object.keys(out).length > 0 ? out : undefined
}

/** 参考帧：{frame} / {imagePath}，两个都给时 service 让 imagePath 优先。 */
function referenceSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description,
    properties: {
      frame: { type: 'number', description: '当前会话的帧号（默认 0）' },
      imagePath: { type: 'string', description: '磁盘上一张 PNG 的绝对路径（8-bit、非隔行；上一段素材导出的那一帧）' },
    },
  }
}

/** `sprite_prepare` 的 `loop` 子对象：只收认得的键，其余交给 `ignoredLoop` 显形。 */
export interface PrepareLoopArg {
  targetFrames?: number
  minPeriodSec?: number
  targetMultiples?: number[]
  mask?: 'body-core' | 'none'
}

const PREPARE_LOOP_KEYS = ['targetFrames', 'minPeriodSec', 'targetMultiples', 'mask'] as const

/** 收敛 `sprite_prepare({loop})`：传了就进循环闭合流程（**不传是另一条完全不变的路径**）。 */
export function prepareLoopOf(value: unknown): { loop: PrepareLoopArg; ignored: string[] } {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const loop: PrepareLoopArg = {}
  if (typeof raw.targetFrames === 'number' && Number.isFinite(raw.targetFrames)) loop.targetFrames = raw.targetFrames
  if (typeof raw.minPeriodSec === 'number' && Number.isFinite(raw.minPeriodSec)) loop.minPeriodSec = raw.minPeriodSec
  if (Array.isArray(raw.targetMultiples)) {
    const multiples = raw.targetMultiples.filter((one): one is number => typeof one === 'number' && Number.isFinite(one))
    if (multiples.length > 0) loop.targetMultiples = multiples
  }
  if (raw.mask === 'body-core' || raw.mask === 'none') loop.mask = raw.mask
  const known = new Set<string>(PREPARE_LOOP_KEYS)
  const ignored = Object.keys(raw).filter((key) => !known.has(key))
  return { loop, ignored }
}

function referenceOf(value: unknown): ReferenceSpec {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const out: ReferenceSpec = {}
  if (typeof raw.frame === 'number' && Number.isFinite(raw.frame)) out.frame = raw.frame
  if (typeof raw.imagePath === 'string' && raw.imagePath.trim() !== '') out.imagePath = raw.imagePath.trim()
  return out
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

/**
 * measure 的 landmarks 类型清单。
 * 前六种是老原语（行为不许变）；`scan-horizontal` / `boundary` 是 P2-5 的颜色扫描原语；
 * 最后两种（`bodyTop` / `bodyBottom`）是语义原语——只描述「身高上端/下端」这个**概念**，
 * 具体用哪个像素路标由调用方给条件（`probe`），工具不认识任何素材语义。
 * 实现见 `src/sprite/scan.ts`（与页面 `spriteScanPrimitives()` 同源，parity 测试对拍）。
 */
const LANDMARK_TYPES = [
  'bbox-top',
  'bbox-bottom',
  'bbox-left',
  'bbox-right',
  'point',
  'scan-vertical',
  'scan-horizontal',
  'boundary',
  'bodyTop',
  'bodyBottom',
] as const

/** 扫描条件的 JSON Schema：`scan-horizontal` 的 probe、`boundary` 的 a/b 共用。 */
function probeSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    description,
    properties: {
      channel: {
        type: 'string',
        enum: [...SCAN_CHANNELS],
        description:
          '通道：r/g/b/alpha 取原值，luma=0.299r+0.587g+0.114b，blue-minus-red=b-r，saturation=max-min，' +
          'whiteness=低饱和(<25)且 luma>210 才算白（够白返回 luma，否则 0；判白色别用 r,g,b>200，肤色会漏）',
      },
      op: { type: 'string', enum: [...SCAN_OPS], description: '比较方式' },
      value: { type: 'number', description: '阈值（通道取值与它比较）' },
      minRun: { type: 'number', description: '连续命中多少行才算数，默认 1' },
    },
    required: ['channel', 'op', 'value'],
  }
}

export function buildTools(
  service: SpriteService,
  options?: { guideBody?: () => string },
): Array<Record<string, unknown>> {
  return [
    {
      name: 'sprite_prepare',
      description:
        '序列帧第一步：导入视频并抽帧。返回 {frames,width,height,transport}。' +
        'transport=http 表示视频走本地直传（快）；base64 是兜底通道（慢 20 秒左右）。' +
        '**循环动作**（跑/走/待机/呼吸/漂浮——会一直循环播的）加 `loop:{}`：内部会先按 fps 预采样测出真实周期，' +
        '再按新采样率重新精确抽 T 帧，返回里多给 {fps,periodSec,loopClosed,loop}（一次性动作别传，会被截成半截）。' +
        '不传 loop 时行为与以前完全一样。',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string', description: '视频文件绝对路径（mp4/webm/mov，≤200MB）' },
          start: { type: 'number', description: '起始秒，默认 0' },
          end: { type: 'number', description: '结束秒，默认 4' },
          fps: { type: 'number', description: '抽帧帧率，默认 12（loop 模式下是**预采样**帧率，至少要 10、且区间 ≥2 秒）' },
          loop: {
            type: 'object',
            description:
              '循环闭合（可选开关）：传了就进"预采样 → 自相关测周期 → 按周期重采 T 帧"流程。' +
              '周期判不清（曲线平缓）时会**报错而不是硬截**，说明这段动画该按一次性动作处理。',
            properties: {
              targetFrames: { type: 'number', description: '交付帧数（默认从 targetMultiples 里挑，通常 24 或 48）' },
              minPeriodSec: { type: 'number', description: '最短周期（秒，默认 2）。动作一个循环不到 2 秒就调小，否则扫不到真周期' },
              targetMultiples: { type: 'array', items: { type: 'number' }, description: '候选交付帧数，默认 [24,48]' },
              mask: {
                type: 'string',
                enum: [...LOOP_MASK_MODES],
                description: '周期扫描的掩膜口径：body-core（默认）= 第 0 帧最大连通域 + 1px 腐蚀；none = 整幅（绿幕素材别用）',
              },
            },
          },
        },
        required: ['videoPath'],
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        const videoPath = typeof args.videoPath === 'string' ? args.videoPath : ''
        if (videoPath === '') return fail('需要 videoPath（视频绝对路径）')
        const looped = args.loop !== undefined ? prepareLoopOf(args.loop) : undefined
        try {
          const result = await service.prepare({
            videoPath,
            ...(typeof args.start === 'number' ? { start: args.start } : {}),
            ...(typeof args.end === 'number' ? { end: args.end } : {}),
            ...(typeof args.fps === 'number' ? { fps: args.fps } : {}),
            ...(looped ? { loop: looped.loop } : {}),
          })
          // loop 子对象里不认识的键也要显形（顶层靠 ignoredKeysOf，这里不能断档）。
          return json(looped && looped.ignored.length > 0 ? { ...result, ignoredLoop: looped.ignored } : result)
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_loop_scan',
      description:
        '扫**当前会话已抽好的帧**的循环周期（自相关：score(L)=平均帧差(i,i+L)），只给建议、**不改会话状态**' +
        '（不改 fps、不改帧、不改锚点）。返回 {periodFrames,periodSec,suggestedFps,targetFrames,scoreCurve,closureScore,confidence,suggestedAction,warnings}。' +
        '前置：会话 fps ≥10 且帧数 ≥24（不够会直接报中文错，让你先 sprite_prepare 到 12fps）。' +
        '算法口径：掩膜只用**第 0 帧那张** body-core（逐帧各算会让边界变化冒充动作差异）；' +
        '自相关先在 1/4 降采样上扫（全分辨率 48 帧×19 候选 ≈16 亿次，会卡死），只在最优 L 上回全分辨率复核 L±1。' +
        'closureScore = 末帧与首帧之差 ÷ 相邻帧平均差：≈0 说明还有重复帧、明显 >1 说明没闭合。' +
        '**confidence=low 时**：返回里会有 `suggestedAction:"treat-as-one-shot"`，并且 `warnings[0]` 就是' +
        '"建议按一次性动作处理（别做循环闭合）"——直接照它办，别只翻 reason。' +
        '**只对循环动作调它**；要真按周期重采，用 sprite_prepare({loop})。',
      parameters: {
        type: 'object',
        properties: {
          preFps: { type: 'number', description: '预采样帧率（默认取会话当前 fps）：只用于回显/对账，周期换算一律用会话实际帧率' },
          minPeriodSec: {
            type: 'number',
            description: '最短周期（秒，默认 2）。低于它（× fps）的候选不扫——动作周期更短就调小，否则扫到的只会是噪声',
          },
          targetMultiples: {
            type: 'array',
            items: { type: 'number' },
            description: '候选交付帧数（默认 [24,48]）：挑"新采样率离预采样率最近"的那个，避免插值凑帧',
          },
          mask: {
            type: 'string',
            enum: [...LOOP_MASK_MODES],
            description: '掩膜口径：body-core（默认，第 0 帧最大连通域 + 1px 腐蚀）或 none（整幅都算，绿幕噪声会压对比度）',
          },
        },
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.loopScan({
              ...(typeof args.preFps === 'number' ? { preFps: args.preFps } : {}),
              ...(typeof args.minPeriodSec === 'number' ? { minPeriodSec: args.minPeriodSec } : {}),
              ...(Array.isArray(args.targetMultiples)
                ? { targetMultiples: args.targetMultiples.filter((one): one is number => typeof one === 'number') }
                : {}),
              ...(args.mask === 'body-core' || args.mask === 'none' ? { mask: args.mask } : {}),
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
        '把参数应用到**全部帧**（含自动背景板），完成后回 {frames,keyedCount,stats,worst,appliedParams,warnings}。慢，30~90 秒。' +
        'worst 是抽样帧里最差的一帧——第 0 帧干净不代表整段干净。' +
        'warnings 里出现「画面边缘有主体/道具压边」= 边框带（短边 2%）不透明 > 5%：' +
        '多半是手/特效被抠成了主体，这种帧的 bbox 会撑到画框，先看核对图再往下走。',
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
        '坐标一律「帧原始像素、左上原点、右下开区间」。' +
        '同时量了 bodyTop + bodyBottom 时会在 warnings 里报「疑似被遮挡/形变」（各列 py 极差 > 帧高 10% 或置信度 < 0.6）。',
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
            description:
              '要量的基准点；不传就只给几何统计。' +
              '量颜色交界（不靠 alpha）：scan-horizontal = 沿列扫第一个连续满足 probe 的 run' +
              '（给 columns 就多列投票，单列会被呆毛/手/特效骗几十 px）；' +
              'boundary = 「a 段结束、紧接 b 段」的交界行（返回的 py 是 b 段第一行）；' +
              'bodyTop = 身高上端（多列扫描 + 取 min）；bodyBottom = 身高下端（中央带行扫描，从下往上找）。' +
              '条件全由你给（channel/op/value），扫不到或越界回 found:false + reason，不会让整次 measure 失败。' +
              '同时量出 bodyTop 与 bodyBottom 时会做交叉校验，可疑就回 warnings（疑似被遮挡/形变）。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: [...LANDMARK_TYPES] },
                x: { type: 'number', description: '单列扫描的列号（与 columns 互斥；只给 x 就是老的单列行为）' },
                y: { type: 'number' },
                columns: {
                  description:
                    '多列扫描要扫哪几列（与 x 互斥，两个都给会报错）：像素数组 [200,260,320,380]；' +
                    '或字符串 "0.30..0.70 step 0.05"——字符串里 a/b/step 三个数是**帧宽的比例**（内部 × 帧宽取整），' +
                    '不是像素；最多 200 列。bodyTop 用它，bodyBottom 不用。',
                  oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'number' } }],
                },
                aggregate: {
                  type: 'string',
                  enum: [...SCAN_AGGREGATES],
                  description:
                    '多列投票方式（默认 median；bodyTop 默认 min）。只用命中的列；' +
                    'mode 平票取最小的 py。命中列数 < 50% 直接 found:false + reason，perColumn 里能看到哪几列挂了。',
                },
                minRun: { type: 'number', description: 'bodyTop：连续命中多少行才算数（覆盖 probe.minRun）' },
                band: {
                  type: 'object',
                  description: 'bodyBottom：行扫描的中央竖带（都是帧宽比例，centerFrac 默认 0.5、widthFrac 默认 0.4）',
                  properties: {
                    centerFrac: { type: 'number' },
                    widthFrac: { type: 'number' },
                  },
                },
                minRunPx: {
                  type: 'number',
                  description: 'bodyBottom：该行上连续满足条件的**像素数**下限（默认 1，实际用必须给，否则散落阴影也能满足）',
                },
                fromY: { type: 'number', description: '扫描起点行（含），默认 0' },
                toY: { type: 'number', description: '扫描终点行（含），默认 帧高 - 1' },
                alphaThreshold: { type: 'number' },
                probe: probeSchema('扫描条件（通道 + 比较 + 阈值 + 可选 minRun 连续长度）'),
                a: probeSchema('boundary 上方那一段（A）的条件'),
                b: probeSchema('boundary 下方那一段（B）的条件'),
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
        'maskRect:"auto" 时先在四角严格判据里找角标，判不出高置信会自动退到四角 40~120px 兜底扫描；' +
        '全部候选（含置信度、命中/未选原因）都在 watermarkCandidates 里按置信度降序给出。' +
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
          maskMode: {
            type: 'string',
            enum: ['auto', 'corner'],
            description:
              '自动识别的策略（默认 auto）：auto = 严格判据优先、判不出高置信才四角兜底；' +
              'corner = 跳过严格判据直接四角扫描（兜底候选置信度偏低，需人工确认 maskRect 没吃掉角色）',
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
              ...(args.maskMode === 'auto' || args.maskMode === 'corner' ? { maskMode: args.maskMode } : {}),
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
        '命名默认 <name>_<cols>x<rows>.<format>，dirPerAction 时放进 <outDir>/<name>/。' +
        '返回里 `measured` 是**成品实测**（解自己导出的 PNG → 按格切 → 量身高 → 取中位数）：' +
        'charHeightPx（本次采用的基准）/ bboxHeight（alpha 包围盒口径）/ semanticHeight（身高上端→下端，' +
        '给的 span 或猜出来的）/ basis（semantic | guessed | bbox）/ headTopY/soleY/cellWidth/cellHeight/' +
        'perCell/min/max/source:"sheet-rgba"，格子数 >48 时只等间隔抽 12 格并给 sampled:true。' +
        '**判成品对不对看 measured，别看 achievedPx**——achievedPx 只是"你给的 span/整格高被缩到了多少"的参数回显。' +
        '给了 charHeightPx 时默认跑**一次**收敛闭环：量完发现与目标差超过容差（相对 1% / 绝对 2px）就按 ' +
        '目标/实测 修正一次缩放、**重导一次**（只一次、不循环；耗时约翻倍），回执在 correction ' +
        '{passes,basis,before,after,target}；第二次仍不准只写 warning、不再重导。' +
        'correction:false 可关（关掉时行为与以前完全一致、返回里没有 correction）。' +
        '**anchorX/anchorY 建议每次都传**（0~1，anchorY 是 y-from-bottom，0=格底）：不传时 meta 的 anchorWritten 是 false' +
        '（下游常读到默认 0.5/0，角色横向偏 20~40px），并会有一条告警。' +
        'debugOverlay:true 再出一张 <outDir>/_debug/<name>-overlay.png（品红=实测头顶、青=实测脚底、' +
        '白十字=锚点；身高偏离中位数 >5% 的格整格标黄），路径在 overlayPath。' +
        '`loop:true`（或本次会话是 sprite_prepare({loop}) 采的）时额外给 loopCheck ' +
        '{firstLastDiff,adjacentDiff,ok}：用**已解好的图集格子**比首尾，不额外解码；' +
        'ok = |首尾差−相邻帧差|/相邻帧差 < 0.5，不 ok 时进 warnings。一次性动作别传 loop。',
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
          anchorX: { type: 'number', description: '锚点 x（0~1，按**输出格**宽比例）；传了 meta 里 anchorWritten=true' },
          anchorY: { type: 'number', description: '锚点 y（0~1，**y-from-bottom**，0=格底）；传了 meta 里 anchorWritten=true' },
          correction: {
            type: 'boolean',
            description:
              '默认 true = 给了 charHeightPx 就量完再校正**一次**（偏超过 1%/2px 时重导一次，耗时约翻倍）；' +
              'false = 不重导（行为与以前完全一致，返回里也没有 correction）',
          },
          outDir: { type: 'string', description: '输出目录（默认 storages/.../sprite-out）' },
          fileName: { type: 'string', description: '图片文件名（含扩展名）' },
          metaName: { type: 'string', description: 'meta 文件名' },
          dirPerAction: { type: 'boolean', description: 'true → 放进 <outDir>/<name>/' },
          overwrite: { type: 'boolean', description: 'false 时目标已存在就报错（默认 true）' },
          format: { type: 'string', enum: ['png', 'webp'], description: '默认 png；webp 体积小得多，但 webp 解不回像素 → 没有 measured/overlay' },
          quality: { type: 'number', description: 'webp 质量 0~1，默认 0.9' },
          name: { type: 'string', description: '动作名（用于默认文件名与子目录）' },
          debugOverlay: {
            type: 'boolean',
            description:
              'true = 额外出一张核对图 <outDir>/_debug/<name>-overlay.png（只在 png 导出时生效）；' +
              '逐格画像量头顶/脚底横线与锚点十字，异常格标黄；路径回在 overlayPath',
          },
          loop: {
            type: 'boolean',
            description:
              'true = 这是循环动作，导出时算 loopCheck（首尾差 vs 相邻帧差，png 才有效）并检查闭合度；' +
              'sprite_prepare({loop}) 采过的会话会自动带。一次性动作别传',
          },
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
              ...(typeof args.debugOverlay === 'boolean' ? { debugOverlay: args.debugOverlay } : {}),
              ...(typeof args.loop === 'boolean' ? { loop: args.loop } : {}),
              ...(typeof args.correction === 'boolean' ? { correction: args.correction } : {}),
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
        '自动调参：先自动采色，然后按指标迭代（bgResidual/subjectCoverage/edgeGreen），' +
        '返回 {params,appliedParams,bestParams,bestStep,trace,reachedGoal,warnings}。' +
        '省掉你"读 stats 改参数试三轮"。⚠️ 它内部用 preview（会清缓存），调完要 sprite_key_apply。' +
        '**P1-3 口径**：`params` 是起点（你手调好的那套可以传进来）；**未达标时 appliedParams 就是你给的这套**，' +
        '不会被搜索过程里的劣解覆盖，并且一定带一条 warning；搜索到的最优解在 `bestParams`，要和 appliedParams 比过再用。' +
        '达成目标时 appliedParams = bestParams = 达标那一轮。',
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'object',
            properties: {
              maxBgResidual: { type: 'number', description: '默认 0.005（评审 B9）' },
              minSubjectCoverage: { type: 'number', description: '默认 0.6（人物是镂空形状，0.98 会让完美参数判未达标）' },
              maxEdgeGreen: { type: 'number', description: '默认 0.02' },
            },
          },
          params: {
            type: 'object',
            description:
              '起点参数 = 你手调好的那套（可选，缺的项补默认值）。未达标时**原样保留**并作为 appliedParams 返回；' +
              '字段与 sprite_key_apply 一致（mode/colorHex/intensity/softness/despill/greenToAlpha/aggressive/autoPlate/advIntensity/advFeather）。' +
              '`colorHex` 不给就用自动采色。不认识的键会进 ignoredParams。',
            properties: {
              mode: { type: 'string', enum: ['classic', 'advanced'] },
              colorHex: { type: 'string', description: '键色 #RRGGBB；不给就自动采色' },
              intensity: { type: 'number', description: '抠色力度 10~90（两档都吃）' },
              softness: { type: 'number', description: '软边宽度 0~100（仅 advanced）' },
              despill: { type: 'number', description: '去绿边强度 0~100（仅 advanced）' },
              greenToAlpha: { type: 'number', description: '残绿转透明 0~300（仅 advanced）' },
              aggressive: { type: 'boolean', description: '主体轮廓也去绿（仅 advanced）' },
              autoPlate: { type: 'boolean', description: '自动背景板（只在 key_apply 生效）' },
              feather: { type: 'number', description: '羽化 0~100（仅 classic）' },
              cleanup: { type: 'number', description: '去色溢出 0~100（仅 classic）' },
              advIntensity: { type: 'number', description: 'advanced 档自己的强度 0~100' },
              advFeather: { type: 'number', description: 'advanced 档自己的羽化 0~100' },
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
          const paramsRaw = (args.params ?? {}) as Record<string, unknown>
          const intensity = Array.isArray(spaceRaw.intensity) && spaceRaw.intensity.length === 2
            ? ([Number(spaceRaw.intensity[0]), Number(spaceRaw.intensity[1])] as [number, number])
            : undefined
          // 起点参数走同一套白名单；不认识的键显形（P1："传了但被静默丢弃"不许再发生）。
          const params = keyParamsOf(paramsRaw)
          const ignoredParams = Object.keys(paramsRaw).filter((key) => !(KEY_PARAM_KEYS as readonly string[]).includes(key))
          const result = await service.autotune({
            goal: {
              ...(typeof goalRaw.maxBgResidual === 'number' ? { maxBgResidual: goalRaw.maxBgResidual } : {}),
              ...(typeof goalRaw.minSubjectCoverage === 'number' ? { minSubjectCoverage: goalRaw.minSubjectCoverage } : {}),
              ...(typeof goalRaw.maxEdgeGreen === 'number' ? { maxEdgeGreen: goalRaw.maxEdgeGreen } : {}),
            },
            ...(Object.keys(params).length > 0 ? { params } : {}),
            ...(intensity ? { space: { intensity } } : {}),
            ...(typeof args.maxIters === 'number' ? { maxIters: args.maxIters } : {}),
            ...(typeof args.frame === 'number' ? { frame: args.frame } : {}),
          })
          return json(ignoredParams.length > 0 ? { ...result, ignoredParams } : result)
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_batch',
      description:
        '批量：一个 items 数组跑完整管线（prepare→采色→measure→apply→cleanup→export），单条失败不影响其他条。' +
        '每条占一个子目录 <outRoot>/<name>/。当前串行执行（并发需要会话隔离）。' +
        '**每条都要传 anchorX/anchorY**（0~1，anchorY 是 y-from-bottom）：不传就只有 anchorWritten:false 的告警，' +
        'meta 里落的是页面当前锚点（下游常读到默认 0.5/0，角色横向偏 20~40px）。' +
        '给了 targetCharHeight 时每条都会跑一次收敛闭环（量完偏了就按 目标/实测 再导一次，**最多一次**，' +
        '那一条的耗时约翻倍）；不想闭环就在单条里看 measured 自己决定。',
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
                anchorX: { type: 'number', description: '锚点 x（0~1，按输出格宽）。不传 meta 里就没有这次设的锚点' },
                anchorY: { type: 'number', description: '锚点 y（0~1，**y-from-bottom**，0=格底）' },
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
                  ...(typeof item.anchorX === 'number' ? { anchorX: item.anchorX } : {}),
                  ...(typeof item.anchorY === 'number' ? { anchorY: item.anchorY } : {}),
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
        '返回和 sprite_export 一样的字段，外加 stages（每步一句话，出问题时先看它）。' +
        '**传 anchorX/anchorY**（0~1，anchorY 是 y-from-bottom）：不传就一定会有一条 anchorWritten:false 的告警，' +
        'meta 里落的是页面当前锚点（下游常读到默认 0.5/0，角色横向偏 20~40px）。' +
        '给了 targetCharHeight 时会跑一次收敛闭环：量完成品发现与目标差超过容差（相对 1% / 绝对 2px）就按 ' +
        '目标/实测 修正一次缩放、**重导一次**（只一次、不循环；那一条耗时约翻倍），回执在 correction ' +
        '{passes,basis,before,after,target} 里；第二次仍不准只写 warning、不再重导。',
      parameters: {
        type: 'object',
        properties: {
          videoPath: { type: 'string' },
          name: { type: 'string', description: '产物名，默认用文件名' },
          outDir: { type: 'string' },
          targetCharHeight: { type: 'number', description: '角色/内容净高（像素）；会触发一次收敛闭环' },
          cols: { type: 'number' },
          rows: { type: 'number' },
          format: { type: 'string', enum: ['png', 'webp'] },
          trimMode: { type: 'string', enum: ['union', 'first-frame'] },
          maskAuto: { type: 'boolean', description: 'true = 自动去水印' },
          anchorX: { type: 'number', description: '锚点 x（0~1，按输出格宽）；写了 meta 里 anchorWritten=true' },
          anchorY: { type: 'number', description: '锚点 y（0~1，**y-from-bottom**，0=格底）；写了 meta 里 anchorWritten=true' },
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
              ...(typeof args.anchorX === 'number' ? { anchorX: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { anchorY: args.anchorY } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_match',
      description:
        '模板匹配：在某一帧里找 templateRect 那块图案。NCC 归一化互相关（对亮度线性变化免疫），' +
        '1/4 → 1/2 → 1 三级金字塔粗搜 + 原分辨率 ±2px 精修，所以整幅搜索也只有百毫秒级。' +
        '坐标一律是**源帧像素**（space:"frame"，左上原点、右下开区间），不是裁剪框/格子坐标；' +
        'templateRect 属于 templateFrame 的空间，返回的 x/y 属于 inFrame 的空间。' +
        '返回 {found,x,y,score,space:"frame"}：同一位置自匹配 score≈1.000（这是判公式/方向对不对的硬自检）；' +
        '低于 minScore（默认 0.85）时 found:false，但仍回传最高分的位置与分值。' +
        '模板是纯色（方差 0）时 NCC 无定义，会返回 found:false + reason——换一块有纹理的区域（纽扣、徽章、眼睛）。' +
        'source=keyed（默认）用抠图结果；raw 是原帧，绿幕没抠时整幅不透明，别拿它找图案。',
      parameters: {
        type: 'object',
        properties: {
          templateFrame: { type: 'number', description: '模板取自哪一帧，默认同 inFrame（再缺省 0）' },
          templateRect: rectSchema('模板矩形（**templateFrame 的源帧像素**，必须整块落在帧内）'),
          inFrame: { type: 'number', description: '在哪个帧里找，默认同 templateFrame' },
          searchRect: rectSchema('只在这个矩形里搜（源帧像素，默认整幅；会被帧边界夹紧）'),
          minScore: { type: 'number', description: '判定阈值，默认 0.85（0.90 以上可信，0.85~0.90 谨慎，更低视为失败）' },
          source: sourceSchema(),
        },
        required: ['templateRect'],
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const templateRect = rectOf(args.templateRect)
          if (!templateRect) return fail('需要 templateRect {x,y,w,h}（源帧像素，四个都是数字）')
          const searchRect = rectOf(args.searchRect)
          return json(
            await service.match({
              templateRect,
              ...(typeof args.templateFrame === 'number' ? { templateFrame: args.templateFrame } : {}),
              ...(typeof args.inFrame === 'number' ? { inFrame: args.inFrame } : {}),
              ...(searchRect ? { searchRect } : {}),
              ...(args.source === 'keyed' || args.source === 'raw' ? { source: args.source } : {}),
              ...(typeof args.minScore === 'number' ? { minScore: args.minScore } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_feature_fit',
      description:
        '特征反推：用 1~2 个「姿势无关」的不变特征（眼睛、头饰、纽扣列）对齐两帧/两段素材，' +
        '求出 scale + 平移（dx,dy），并把参考帧的锚点搬到目标帧。**姿势差异大时用它**（剪影会因姿势而失配）。' +
        '数学：p_target = p_ref × scale + (dx, dy)（源帧像素）；单模板只能定平移，双模板用两点间距比值定 scale，' +
        '两个模板各自反推的平移差就是 residualPx（>2px 说明特征被遮挡/形变，confidence 降级）。' +
        '参考帧两种给法：{frame} 用当前会话某帧；{imagePath} 用磁盘上一张 PNG（上一段素材导出的某帧）——跨素材对齐靠这条。' +
        '返回 {frame,scale,dx,dy,score,residualPx,perTemplate,confidence}，给了 anchorX/anchorY 才有 transferredAnchor' +
        '（归一化 0~1、y-from-bottom，与 meta.json 同口径；只给一个时另一个按 0.5 补）。' +
        'confidence：score≥0.90 且 residual<2px → high；0.80~0.90 → medium（拿语义点复核）；更低 → low（别用）。' +
        '限帧：search.frames 缺省/写 "all" 时按 24 帧×720×966 折算抽样（帧更大自动更少），显式给帧号列表则照办。',
      parameters: {
        type: 'object',
        properties: {
          reference: referenceSchema('参考帧（特征是从它上面裁的）。默认 {frame:0}'),
          templates: {
            type: 'array',
            description: '特征模板，建议 2 个（单模板只能定平移）。rect 是**参考帧的源帧像素**；优先头部特征，别用手脚/披风下摆',
            items: {
              type: 'object',
              properties: {
                rect: rectSchema('特征矩形（参考帧的源帧像素）'),
                weight: { type: 'number', description: '权重，默认 1（头部特征可以给高一点）' },
              },
              required: ['rect'],
            },
          },
          anchorX: { type: 'number', description: '参考帧上的锚点 x（0~1，归一化、按参考帧宽）；给了才回传 transferredAnchor' },
          anchorY: { type: 'number', description: '参考帧上的锚点 y（0~1，**y-from-bottom**，与 meta.json 同口径）' },
          search: {
            type: 'object',
            description: '搜索范围',
            properties: {
              frames: {
                description: '要搜的帧：帧号数组，或 "all"（默认，会按预算抽样，见描述）',
                oneOf: [{ type: 'array', items: { type: 'number' } }, { type: 'string', enum: ['all'] }],
              },
              scale: scaleSchema('尺度范围，默认 0.85~1.15 step 0.01（31 档；先粗搜再精修，不会因为 31 档就慢）'),
            },
          },
          source: sourceSchema(),
        },
        required: ['templates'],
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const templates = Array.isArray(args.templates)
            ? args.templates
                .map((row) => {
                  const item = row as Record<string, unknown>
                  const rect = rectOf(item.rect)
                  if (!rect) return undefined
                  return { rect, ...(typeof item.weight === 'number' ? { weight: item.weight } : {}) }
                })
                .filter((one): one is { rect: Rect; weight?: number } => one !== undefined)
            : []
          if (templates.length === 0) return fail('需要 templates：[{rect:{x,y,w,h}},…]（建议 2 个，rect 是参考帧的源帧像素）')
          const search: { frames?: number[] | 'all'; scale?: { min?: number; max?: number; step?: number } } = {}
          const rawSearch = (args.search && typeof args.search === 'object' ? args.search : {}) as Record<string, unknown>
          if (rawSearch.frames === 'all') search.frames = 'all'
          else if (Array.isArray(rawSearch.frames)) {
            search.frames = rawSearch.frames.filter((one): one is number => typeof one === 'number')
          }
          const scale = scaleRangeOf(rawSearch.scale)
          if (scale) search.scale = scale
          return json(
            await service.featureFit({
              reference: referenceOf(args.reference),
              templates,
              ...(typeof args.anchorX === 'number' ? { anchorX: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { anchorY: args.anchorY } : {}),
              ...(Object.keys(search).length > 0 ? { search } : {}),
              ...(args.source === 'keyed' || args.source === 'raw' ? { source: args.source } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_silhouette_fit',
      description:
        '剪影拟合：拿参考帧的剪影当尺子，在目标动画里找姿势最接近的那一帧，返回 {frame,iou,scale,dx,dy,confidence}。' +
        '同角色批量对齐的主力（idle 的剪影去对齐 walk/idle2 这类）。' +
        'mask 默认 body-core = alpha 阈值 → **最大连通域**（去掉漂浮特效/手）→ 1px 腐蚀；raw 只按 alpha 阈值。' +
        '**三档必须看 IoU，不许硬拓印**：≥0.90 缩放与平移都可信（transferredAnchor.anchorSource="silhouette"，可拓印）；' +
        '0.75~0.90 只采用 scale（anchorSource="semantic-required"，锚点必须走语义点）；' +
        '<0.75 → confidence:"low" 且 transferredAnchor 直接给 null（这段动画里没有姿势接近的帧）。' +
        '坐标同 sprite_match：源帧像素、space 由输入图决定；p_target = p_ref × scale + (dx, dy)。' +
        '参考帧可以是 {frame}（当前会话某帧）或 {imagePath}（磁盘上一张 PNG，跨素材靠这条）。' +
        '性能：粗搜在 1/4 分辨率（质心定初值）+ 原分辨率 ±4px 精修，报的 IoU 是原分辨率算的；' +
        'target.frames 缺省/写 "all" 时按 24 帧×720×966 折算抽样，要全跑就显式给帧号列表。',
      parameters: {
        type: 'object',
        properties: {
          reference: referenceSchema('参考帧（尺子）。默认 {frame:0}'),
          target: {
            type: 'object',
            description: '在哪些帧里找',
            properties: {
              frames: {
                description: '帧号数组或 "all"（默认，会按预算抽样）',
                oneOf: [{ type: 'array', items: { type: 'number' } }, { type: 'string', enum: ['all'] }],
              },
            },
          },
          mask: {
            type: 'string',
            enum: ['raw', 'body-core'],
            description: '掩膜口径：body-core（默认）= 最大连通域 + 1px 腐蚀，去特效/去手；raw = 只按 alpha 阈值（效果物本身就是剪影的一部分时才用）',
          },
          search: {
            type: 'object',
            description: '搜索范围',
            properties: {
              scale: scaleSchema('尺度范围，默认 0.85~1.15 step 0.05（最多 9 档；给更细的步长会自动均分整个区间）'),
            },
          },
          alphaThreshold: { type: 'number', description: 'alpha 阈值（默认 32）' },
          anchorX: { type: 'number', description: '参考帧上的锚点 x（0~1）；给了才回传 transferredAnchor' },
          anchorY: { type: 'number', description: '参考帧上的锚点 y（0~1，y-from-bottom）' },
          source: sourceSchema(),
        },
      },
      output: OUT,
      timeoutMs: 240_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          const rawTarget = (args.target && typeof args.target === 'object' ? args.target : {}) as Record<string, unknown>
          const target: { frames?: number[] | 'all' } = {}
          if (rawTarget.frames === 'all') target.frames = 'all'
          else if (Array.isArray(rawTarget.frames)) {
            target.frames = rawTarget.frames.filter((one): one is number => typeof one === 'number')
          }
          const rawSearch = (args.search && typeof args.search === 'object' ? args.search : {}) as Record<string, unknown>
          const scale = scaleRangeOf(rawSearch.scale)
          return json(
            await service.silhouetteFit({
              reference: referenceOf(args.reference),
              ...(Object.keys(target).length > 0 ? { target } : {}),
              ...(args.mask === 'raw' || args.mask === 'body-core' ? { mask: args.mask } : {}),
              ...(scale ? { search: { scale } } : {}),
              ...(typeof args.alphaThreshold === 'number' ? { alphaThreshold: args.alphaThreshold } : {}),
              ...(typeof args.anchorX === 'number' ? { anchorX: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { anchorY: args.anchorY } : {}),
              ...(args.source === 'keyed' || args.source === 'raw' ? { source: args.source } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_verify',
      description:
        '一批产物的**一致性自检**（纯读 meta，不解码图片）：组内身高方差 ≤1%、锚点 X 偏差 ≤2px、锚点口径一致、必备字段齐全。' +
        '解决的是"每条单看都没事、整组不像话"——2026-11-13 那批 6 条动画单份全绿，组内身高差到 ±5%，全靠人眼才发现。' +
        '入参二选一：metas 直接给对象数组，或 paths 给 meta.json / 目录（目录里所有 .json 会被当成 meta 读）。' +
        '基准默认取组内中位数（离群点不会把基准带跑），也可以用 referenceCharHeight 指定（跨批次沿用上一批的尺子）。' +
        '返回 {ok,count,reference,tolerance,items[{name,charHeightPx,deltaPct,anchorXPx,deltaAnchorXPx,problems}],warnings}；' +
        'ok=false 时逐条 warnings 会写清是哪一条、偏了多少、容差多少。' +
        '注意它只回答"这一组彼此自洽吗"，"每条本身准不准"要靠 measure/export 的成品实测。',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'meta.json 的路径或包含它们的目录（相对路径按导出目录解析）',
          },
          metas: {
            type: 'array',
            items: { type: 'object' },
            description: '直接给 meta 对象数组（与 paths 可同时用，结果是两者合并）',
          },
          referenceCharHeight: { type: 'number', description: '基准身高（不给就取组内中位数）' },
          heightPct: { type: 'number', description: '身高允许的相对偏差，默认 0.01（1%）' },
          anchorPx: { type: 'number', description: '锚点 X 允许的源帧像素偏差，默认 2' },
        },
      },
      output: OUT,
      timeoutMs: 20_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          return json(
            await service.verify({
              ...(Array.isArray(args.paths) ? { paths: args.paths.filter((one): one is string => typeof one === 'string') } : {}),
              ...(Array.isArray(args.metas)
                ? { metas: args.metas.filter((one) => one && typeof one === 'object') as Record<string, unknown>[] }
                : {}),
              ...(typeof args.referenceCharHeight === 'number' ? { referenceCharHeight: args.referenceCharHeight } : {}),
              ...(typeof args.heightPct === 'number' ? { heightPct: args.heightPct } : {}),
              ...(typeof args.anchorPx === 'number' ? { anchorPx: args.anchorPx } : {}),
            }),
          )
        } catch (error) {
          return fail(error)
        }
      },
    },
    {
      name: 'sprite_baseline',
      description:
        '准绳图：把**一组图集**按各自 meta 里的 anchorX/anchorY 对齐到同一条**地平线**、再画上头顶线，供人目视验收' +
        '（skill §9 第 3 条）。每张图取 `cellIndex` 格（默认 0=首帧；**也可以给 "tallest"/"median"**——' +
        '姿势差异大的动画用首帧的 bbox 高会误判身高不一致），按路径顺序横向排开。' +
        '画三条参考线：地平线（青，= 锚点所在行）、头顶线（品红，= 各格实测最高点的**中位数**行）、' +
        '每格的竖向中轴（绿，= 锚点 x）；每格头顶再点一个小十字，看得出线是怎么来的。' +
        '**meta 是硬要求**：`x.png` 找同目录 `x.meta.json`，再退回 `x.json`；找不到直接报错（不猜锚点），' +
        'meta 里缺 cellWidth/cellHeight/anchorX/anchorY 也报错（老产物先重新 export）。' +
        '⚠️ 这里量的是**成品像素**（解 PNG → 按格切 → alpha 包围盒），不是 meta 的参数回显。' +
        '底色**不给就按主体亮度自适应**（偏亮→深底 #202030、偏暗→浅底 #f2f2f5），给的显式值永远赢。' +
        '锚点口径会校验：一组里 anchorConvention 混用、或 anchorY 与 anchorYTopDown 对不上都会 warning（口径不一致=整条地平线平移）。' +
        '输出 `<outDir>/_debug/baseline-<ts>.png`（outDir 默认取所有输入路径的公共父目录）。' +
        '返回 {ok,path,width,height,baselineY,headTopY,background,cellIndexUsed,items[{name,cellIndex,charHeightPx,…}],warnings}；' +
        '组内身高差 >1% 时会写 warning。',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: '图集路径（png，相对路径按导出目录解析）；顺序就是准绳图里从左到右的顺序',
          },
          cellIndex: {
            oneOf: [{ type: 'number' }, { type: 'string', enum: ['tallest', 'median'] }],
            description:
              '取哪一格：不传=0（首帧，向后兼容）；"tallest"=语义身高最大的那一格（猜不到语义身高就退回 bbox 高，' +
              '适合吹哨/惊吓这类姿势差异大的动画）；"median"=bbox 高最接近中位数的那一格。固定格号仍可传数字。',
          },
          gap: { type: 'number', description: '格与格的横向空隙（像素，默认 8）' },
          background: {
            type: 'string',
            description: '底色 #RRGGBB。不给就按主体亮度自适应（浅色角色→深底、深色角色→浅底）；给了就用给的',
          },
          padding: { type: 'number', description: '四周留白（像素，默认 4）' },
          outDir: { type: 'string', description: '输出根目录（默认取所有输入路径的公共父目录）' },
        },
        required: ['paths'],
      },
      output: OUT,
      timeoutMs: 120_000,
      async execute(args: Record<string, unknown>): Promise<string> {
        try {
          // cellIndex 既可能是数字格号，也可能是 "tallest"/"median"（JSON Schema 里写成 string enum，
          // 数字照收——两边都过到 service，由 service 统一校验/报错，不在工具层编默认值）。
          const cellIndex = args.cellIndex
          return json(
            await service.baseline({
              paths: (Array.isArray(args.paths) ? args.paths : []).filter((one): one is string => typeof one === 'string'),
              ...(typeof cellIndex === 'number' && Number.isFinite(cellIndex)
                ? { cellIndex }
                : cellIndex === 'tallest' || cellIndex === 'median'
                  ? { cellIndex }
                  : {}),
              ...(typeof args.gap === 'number' ? { gap: args.gap } : {}),
              ...(typeof args.background === 'string' ? { background: args.background } : {}),
              ...(typeof args.padding === 'number' ? { padding: args.padding } : {}),
              ...(typeof args.outDir === 'string' ? { outDir: args.outDir } : {}),
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
        '返回这套工具的完整指南（方法论 / 六步原语 / 参数语义表 / 症状速查 / 坐标换算 / 锚点口径）。' +
        '它与 skill `dafeiyu-sprite` 是同一份内容：优先用 skill，加载不到再调它。',
      parameters: { type: 'object', properties: {} },
      output: OUT,
      timeoutMs: 10_000,
      async execute(): Promise<string> {
        // 真源是 skill 的 SKILL.md（见 skill.ts）；读不到才退回内置兜底。
        return options?.guideBody?.() ?? SPRITE_GUIDE
      },
    },
  ]
}
