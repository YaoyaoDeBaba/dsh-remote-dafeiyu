/**
 * sprite/types —— 序列帧工具对外（工具层）与对内（service 层）共用的形状。
 *
 * 这么做是为了让"契约"只有一份：工具 schema、service 入参、返回字段都从这里取，
 * 免得 schema 说支持 `mode`、service 却没转给页面（`.57` 之前的真实缺陷）。
 */
import type { SheetMeasurement } from './contact.js'

/** 抠图参数。**哪一档生效**见 `guide.ts` 里的参数语义表（C2）。 */
export interface KeyParams {
  /** 'classic' 经典档：intensity/feather/cleanup 生效；'advanced' 智能档：softness/despill/aggressive/greenToAlpha/autoPlate 生效。 */
  mode?: 'classic' | 'advanced'
  colorHex?: string
  intensity?: number
  feather?: number
  cleanup?: number
  softness?: number
  despill?: number
  greenToAlpha?: number
  aggressive?: boolean
  autoPlate?: boolean
  /** 智能档自己的强度/羽化（与 intensity/feather 分开，页面是这样存的）。 */
  advIntensity?: number
  advFeather?: number
}

/** 工具层能接受的**全部**参数键（用于算 `ignored`：传了但没被识别的键要报出来）。 */
export const KEY_PARAM_KEYS = [
  'mode',
  'colorHex',
  'intensity',
  'feather',
  'cleanup',
  'softness',
  'despill',
  'greenToAlpha',
  'aggressive',
  'autoPlate',
  'advIntensity',
  'advFeather',
] as const

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface TrimOptions {
  /** union = 全帧并集（防截肢，但漂浮物会撑大格子）；first-frame = 只按首帧 + pad（格子稳）。 */
  mode?: 'union' | 'first-frame'
  pad?: { top?: number; bottom?: number; left?: number; right?: number }
  alphaThreshold?: number
}

/**
 * measure 扫描条件能用的通道（P2-5）。
 * `blue-minus-red` = b-r（判蓝发最快）；`saturation` = max(r,g,b)-min(r,g,b)；
 * `luma` = 0.299r+0.587g+0.114b。全是与业务无关的通用量。
 * `whiteness` = 「低饱和 + 高亮度」的白色判据（定义见 `scan.ts` 的 WHITENESS_* 常量）：
 *   返回 luma（够白）或 0（不够白），判断写成 `op:">", value:0` 即可，别再用 r,g,b>200——
 *   肤色 (240,220,207) 会从那个老判据里漏过去。
 */
export const SCAN_CHANNELS = ['r', 'g', 'b', 'alpha', 'luma', 'blue-minus-red', 'saturation', 'whiteness'] as const
export type MeasureScanChannel = (typeof SCAN_CHANNELS)[number]

/** 比较方式。条件由调用方给，工具不内置"什么算头发"这类语义。 */
export const SCAN_OPS = ['>', '>=', '<', '<='] as const
export type MeasureScanOp = (typeof SCAN_OPS)[number]

/**
 * 多列扫描的聚合方式（`scan-horizontal` / `bodyTop`）：只用**命中**的列投票。
 * `median` 默认（抗单列被呆毛/手/特效骗）；`min` 上端语义常用（头顶取最高那列）；
 * `mode` 平票取最小的 py（确定性，不随列序变）。
 */
export const SCAN_AGGREGATES = ['min', 'max', 'median', 'mode'] as const
export type ScanAggregate = (typeof SCAN_AGGREGATES)[number]

/** 多列扫描里单列的命中结果（`perColumn` 的元素）。 */
export interface MeasureColumnHit {
  /** 源帧列号（像素）。 */
  x: number
  found: boolean
  py: number | null
  /** 该列命中的连续行数。 */
  run: number | null
  confidence?: number
  reason?: string
}

/** 一条扫描条件：通道 + 比较 + 阈值（+ 可选"连续多少行才算数"）。 */
export interface MeasureScanProbe {
  channel: MeasureScanChannel
  op: MeasureScanOp
  value: number
  /** 连续命中多少行才算一个有效 run（默认 1）。 */
  minRun?: number
}

export interface MeasureLandmark {
  id: string
  type:
    | 'bbox-top'
    | 'bbox-bottom'
    | 'bbox-left'
    | 'bbox-right'
    | 'point'
    | 'scan-vertical'
    | 'scan-horizontal'
    | 'boundary'
    | 'bodyTop'
    | 'bodyBottom'
  x?: number
  y?: number
  fromY?: number
  toY?: number
  alphaThreshold?: number
  /** `scan-horizontal`：要扫的颜色/亮度条件。 */
  probe?: MeasureScanProbe
  /** `boundary`：交界**上方**那一段（A）的条件。 */
  a?: MeasureScanProbe
  /** `boundary`：交界**下方**那一段（B）的条件。 */
  b?: MeasureScanProbe
  /**
   * 多列扫描要扫哪几列，**与 `x` 互斥**（两个都给会报错，不会猜你要哪个）。
   * 两种写法：像素数组 `[200,260,320,380]`；或字符串 `"0.30..0.70 step 0.05"`
   * ——字符串里的三个数是**帧宽的比例**（实现内部 × 帧宽再取整），不是像素。
   */
  columns?: number[] | string
  /** 多列聚合方式，默认 `median`（`bodyTop` 默认 `min`）。 */
  aggregate?: ScanAggregate
  /** `bodyTop`：连续命中多少行才算数（等价于 `probe.minRun`，这里给就覆盖它）。 */
  minRun?: number
  /** `bodyBottom`：行扫描的中央竖带（`centerFrac` 默认 0.5、`widthFrac` 默认 0.4，都是帧宽比例）。 */
  band?: { centerFrac?: number; widthFrac?: number }
  /** `bodyBottom`：该行上连续满足条件的**像素数**下限（默认 1，实际用必须给）。 */
  minRunPx?: number
}

/**
 * 一条 landmark 的测量结果。前四个字段是老六种就有的形状（向后兼容），
 * 其余是按原语补的可选字段——`found:false` + `reason` 表示"没扫到/越界"，
 * 这时 `px/py` 为 null，整次 measure 不会失败。
 */
export interface MeasureLandmarkResult {
  /** 测完由页面补上；单独调 scan 原语时可能没有。 */
  id?: string
  type?: string
  px: number | null
  py: number | null
  confidence: number
  /** 命中行的坐标（`scan-horizontal` / `boundary` 的 py 同值）；`bbox-*` 用 px 坐标。 */
  value?: number | null
  found?: boolean
  reason?: string
  /** 连续满足条件的行数；`boundary` 是 A 段 + B 段的合计。 */
  runLength?: number
  runStart?: number
  runEnd?: number
  /** `scan-horizontal` 的条件回显。 */
  channel?: string
  op?: string
  threshold?: number
  /** `boundary`：A/B 段各自的连续行数与起止行（`aEnd = py - 1`）。 */
  aRun?: number
  bRun?: number
  aStart?: number
  aEnd?: number
  bEnd?: number
  aChannel?: string
  bChannel?: string
  /** 扫的那一列，以及实际生效（可能被帧边界裁过）的 y 区间。 */
  column?: number
  fromY?: number
  toY?: number
  clipped?: boolean
  /** 只有 `point` 会给：坐标是否落在帧内。 */
  inside?: boolean
  /**
   * 坐标空间。多列原语（`scan-horizontal` 多列 / `bodyTop` / `bodyBottom`）一定会带
   * `space:"frame"`——这些 px 是**源帧**坐标，不是裁剪框/格子坐标。
   */
  space?: 'frame'
  /** 多列扫描的聚合方式回显。 */
  aggregate?: string
  /** 这次实际扫了哪几列（源帧 px，升序去重）。 */
  columns?: number[]
  /** 每列各自的结果：命中列数 < 50% 时整条 found:false，但这里全带上，能看出是哪几列挂了。 */
  perColumn?: MeasureColumnHit[]
  /**
   * 「别一路绿灯」的提示（P2-5 后续）：minRun 没给、画面边缘被压边、
   * 上下端疑似被遮挡/形变等。空/缺省表示没发现异常。
   */
  warnings?: string[]
  /** `bodyBottom`：该行上最长的一段连续命中像素数。 */
  run?: number
  /** `bodyBottom`：实际生效的"行内连续像素数"下限（回显，方便对账）。 */
  minRunPx?: number
  /** `bodyBottom`：行扫描实际生效的竖带列区间 `[x0,x1]`（含端点，源帧 px）。 */
  bandX?: [number, number]
}

export interface MeasureResult {
  ok: boolean
  frame: number | 'all'
  width: number
  height: number
  alphaBBox: { x0: number; y0: number; x1: number; y1: number }
  contentHeight: number
  contentWidth: number
  perFrameSpread?: {
    frames: number
    topY: { min: number; max: number }
    soleY: { min: number; max: number }
    bboxUnion: { x0: number; y0: number; x1: number; y1: number }
  }
  landmarks?: MeasureLandmarkResult[]
  /**
   * 整次 measure 级别的告警（`measure` 在页面侧算好、service 原样透传）：
   * 同时量了 `bodyTop` + `bodyBottom` 时，若置信度低或各列 py 极差过大，
   * 会写「疑似被遮挡/形变：…」。
   */
  warnings?: string[]
  /** 这次量的是抠图结果还是原帧（.58）：绿幕素材的原帧整幅不透明，量原帧只会得到「整幅」。 */
  source?: 'keyed' | 'raw'
  /** bbox 面积 / 帧面积 —— 一眼看出「量的是整幅还是主体」。 */
  bboxAreaRatio?: number
  overlayPath?: string
  error?: string
}

export interface ProbeColorResult {
  ok: boolean
  keyColor: string
  spread: number
  samples: Array<{ edge: string; rgb: [number, number, number]; alphaRatio: number }>
  rejected: string[]
  error?: string
}

export interface AnchorInfo {
  ok: boolean
  anchorX: number
  anchorY: number
  convention: 'y-from-bottom' | 'y-from-top'
  pixels: { x: number; y: number }
  frameWidth?: number
  frameHeight?: number
  error?: string
}

export interface ScaleResult {
  ok: boolean
  scale: number
  wantedScale?: number | null
  clamped: boolean
  sourcePx: number
  achievedPx: number
  cellW: number
  cellH: number
  frameW?: number
  frameH?: number
  auto?: boolean
  error?: string
}

/**
 * `measured.charHeightPx` 用的是哪个口径（P1-5）。
 *
 * - `semantic`：调用方给了 `span`（身高上端→身高下端），并且声明它是语义 span ⇒ 最可信；
 * - `guessed`：没给 span，用 `whiteness` / `luma<110` 的默认判据在一格上猜出来的；
 * - `bbox`：猜不到，只能退回 alpha 包围盒（会把呆毛/尾巴/挂件算进身高，差 4~6%）。
 */
export type MeasuredBasis = 'semantic' | 'bbox' | 'guessed'

/**
 * 一次收敛闭环的回执（任务 B）。
 *
 * `passes:1` 表示"量完发现偏了、按 `target/measured` 修正后重导了一次"；
 * **最多一次**（`exportSheet` 里没有循环），所以不会振荡。
 */
export interface ExportCorrection {
  passes: 0 | 1
  /** 收敛对齐的那个基准（语义 / 猜测 / bbox）。 */
  basis: MeasuredBasis
  /** 校正前实测（px，格子空间）。 */
  before: number
  /** 校正后实测（px）；`passes:0` 时等于 `before`。 */
  after: number
  /** 你要的值（`charHeightPx`）。 */
  target: number
}

export interface ExportOptions {
  cols?: number
  rows?: number
  /** 旧语义：整格目标高。 */
  targetHeight?: number
  /** 新语义（推荐）：角色/内容净高，配合 span 使用。 */
  charHeightPx?: number
  span?: { fromY: number; toY: number }
  /**
   * `span` 的**口径**（默认 `semantic`）：
   * - `semantic` = 调用方给的 span 就是"身高上端→身高下端"（可信，`measured.basis` 会跟着变 semantic）；
   * - `bbox` = 这个 span 其实是 alpha 包围盒（`sprite_auto` / `sprite_batch` 就是这种：它们把
   *   `measure.alphaBBox` 直接当 span 用）。标成 bbox 之后 `measured.basis` 不会谎称 semantic，
   *   下游按语义身高对齐时才不会被呆毛/尾巴骗（P1-5）。
   */
  spanBasis?: 'semantic' | 'bbox'
  /**
   * 一次收敛闭环（默认**开启**）：量完成品 `measured` 后，若给了 `charHeightPx` 且实测与目标
   * 差超过容差（相对 1% / 绝对 2px 取宽松），就按 `target/measured` 修正一次缩放、**重导一次**。
   * 只一次（不迭代）；`false` = 关掉，行为与以前完全一致（不重导，返回里也不出现 `correction`）。
   */
  correction?: boolean
  anchorX?: number
  anchorY?: number
  outDir?: string
  fileName?: string
  metaName?: string
  dirPerAction?: boolean
  overwrite?: boolean
  format?: 'png' | 'webp'
  quality?: number
  /** 用于默认命名的动作名（如 Idle / SneakEat）。 */
  name?: string
  /**
   * true = 额外出一张核对图 `<outDir>/_debug/<name>-overlay.png`：
   * 逐格画实测头顶（品红）/脚底（青）/锚点十字（白），异常格整格变黄。
   * 只在 png 导出时生效（webp 解不回像素，没法量也没法画）。
   */
  debugOverlay?: boolean
  /**
   * 显式声明"这是循环动作"：为 true 时导出会算 `loopCheck` 并在没闭合时进 `warnings`。
   * 不传也不算错——`sprite_prepare({loop})` 采过的会话会自动带上（一次性动作别传，
   * 它们首尾本来就不该闭合，报了只会是噪音）。
   */
  loop?: boolean
}

export interface ExportResult {
  ok: boolean
  pngPath?: string
  metaPath?: string
  sheet?: { width: number; height: number }
  cell?: { width: number; height: number }
  scale?: number
  /**
   * ⚠️ **参数回显**：只是"你给的目标（charHeightPx/span 或整格高）被缩放到了多少"。
   * 它不等于成品里的真实身高——用户实测三次都是 achievedPx:300 而成品是 382/341/303。
   * 要判断成品对不对，看 `measured.charHeightPx`（解自己导出的 PNG 量出来的）。
   */
  achievedPx?: number
  charHeightPx?: number
  scaleClamped?: boolean
  format?: 'png' | 'webp'
  bytes?: number
  stats?: { worst?: WorstFrame }
  reported?: Record<string, unknown>
  /** 成品实测（解导出图 → 按格切 → alpha 包围盒 → 中位数）。webp 导出没有这一项。 */
  measured?: SheetMeasurement
  /** 核对图路径（只有 `debugOverlay:true` 且 png 导出时才给）。 */
  overlayPath?: string
  /**
   * 循环闭合校验（只对循环动作给）：用**已经解好的图集格子**比首尾，不额外解码。
   * `ok = |firstLastDiff − adjacentDiff| / adjacentDiff < 0.5`；
   * 首尾差 ≈0 = 还有重复帧、明显大于相邻帧差 = 跳变。不 ok 时会进 `warnings`。
   */
  loopCheck?: { firstLastDiff: number; adjacentDiff: number; ok: boolean }
  /**
   * 一次收敛闭环的回执（任务 B）：只有"给了 `charHeightPx` + 量到了成品 + 没被
   * `correction:false` 关掉"时才会出现。`passes:1` = 重导过（耗时约翻倍）。
   */
  correction?: ExportCorrection
  warnings: string[]
  error?: string
}

// ─────────────────── 循环闭合（自相关测周期 / 按周期重采 / 导出校验） ───────────────────

/**
 * `sprite_loop_scan` 的入参。**扫描只读像素，不改会话状态**（不改 fps、不改帧、不改锚点）。
 */
export interface LoopScanArgs {
  /** 预采样帧率（默认取会话当前 fps，缺省 12）：用来把 minPeriodSec 换成帧数、并反推新采样率。 */
  preFps?: number
  /** 最短周期（秒，默认 2）。半周期/噪声低谷靠它排除。 */
  minPeriodSec?: number
  /** 候选交付帧数（默认 [24, 48]），`suggestFps` 从里面挑。 */
  targetMultiples?: number[]
  /** 掩膜口径：`body-core`（默认，第 0 帧最大连通域 + 1px 腐蚀）或 `none`（整幅都算）。 */
  mask?: 'body-core' | 'none'
}

/** 自相关表里的一项（`frames` 是候选周期帧数，与工具返回字段同名）。 */
export interface LoopScorePoint {
  frames: number
  score: number
}

export interface LoopScanResult {
  ok: boolean
  /** 真实周期（帧）。 */
  periodFrames: number
  /** 真实周期（秒）= periodFrames / preFps。 */
  periodSec: number
  /** 建议采样率 = targetFrames / periodSec。 */
  suggestedFps: number
  /** 建议交付帧数（从 targetMultiples 里挑的）。 */
  targetFrames: number
  /** 分数最低的若干个候选（看"是不是勉强赢的"）。 */
  scoreCurve: LoopScorePoint[]
  /** `frameDiff(末帧, 首帧) / 相邻帧平均差`：越小越好；≈0 说明还有重复帧，明显 >1 说明没闭合。 */
  closureScore: number
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  /** 低置信度时给原因（"动作本身不严格周期，建议按一次性动作处理"）。 */
  reason?: string
  /**
   * 显式的**动作建议**（P1-补）：只有 `confidence:"low"` 时出现，值为 `treat-as-one-shot`，
   * 表示这段动画不该按循环闭合处理。同一句话也会出现在 `warnings[0]`——
   * 以前它只藏在 `reason` 里，调用方不知道该不该信。
   */
  suggestedAction?: 'treat-as-one-shot'
  /** 这次扫的口径（回显，方便对账）。 */
  scanned: {
    frames: number
    fps: number
    mask: 'body-core' | 'none'
    source: 'keyed' | 'raw'
    /** 自相关在几分之一分辨率上扫（全分辨率会卡死）。 */
    downsample: number
    candidates: number
    /** 扫描区间（帧，含端点）。 */
    range: { lo: number; hi: number }
  }
  elapsedMs: number
}

/**
 * `sprite_baseline` 的格子选择口径：
 * - 数字 = 固定第几格（默认 0，向后兼容）；
 * - `tallest` = **语义身高最大**的那一格（拿不到语义身高就退回 bbox 高）——
 *   专门给"首帧手臂下垂、后仰惊吓"这种姿势差异大的动画用（P2-6）；
 * - `median` = bbox 高度**最接近中位数**的那一格（避开个别拔高的呆毛/特效帧）。
 */
export type BaselineCellSelector = number | 'tallest' | 'median'

/** `sprite_baseline` 的入参：把一组图集按锚点对齐到同一条地平线。 */
export interface BaselineArgs {
  /** 图集路径（png）。配套 meta 自动按同名找：`x.png` → `x.meta.json`，再退回 `x.json`。 */
  paths: string[]
  /** 取每张图的哪一格（默认 0 = 首帧）；也可以给 `"tallest"` / `"median"`。 */
  cellIndex?: BaselineCellSelector
  /** 格与格之间的横向空隙（像素，默认 8）。 */
  gap?: number
  /**
   * 底色。**不给就按主体亮度自适应**（P2-7）：主体偏亮 → 深底 `#202030`，主体偏暗 → 浅底 `#f2f2f5`。
   * 给了就一律用给的（显式值永远赢）。
   */
  background?: string
  /** 四周留白（默认 4），给地平线/头顶线留出可见空间。 */
  padding?: number
  /** 输出根目录（默认取所有输入路径的公共父目录），图会落在它下面的 `_debug/`。 */
  outDir?: string
}

/** `sprite_baseline` 的返回。 */
export interface BaselineResult {
  ok: boolean
  /** 准绳图路径。 */
  path?: string
  width?: number
  height?: number
  /** 地平线的画布行（所有锚点都落在这一行，y-from-top）。 */
  baselineY?: number
  /** 头顶线的画布行（各格实测最高点的中位数）。 */
  headTopY?: number | null
  /** 本次用的底色（自适应时 `adaptive:true`，并给出主体平均亮度）。 */
  background?: { hex: string; meanLuma: number | null; adaptive: boolean; reason?: string }
  /**
   * 本次格子选择方式（P2-6）：`mode` 是 `cellIndex` 的口径，
   * `perItem` 逐条说明"这张图用了第几格、按什么高选出来的"。
   */
  cellIndexUsed?: {
    mode: 'fixed' | 'tallest' | 'median'
    perItem: Array<{ name: string; cellIndex: number; basis: 'fixed' | 'semantic' | 'bbox'; heightPx: number }>
  }
  items?: Array<{
    name: string
    /** 这一条实际取的格子序号（P2-6：`tallest`/`median` 时逐条不同）。 */
    cellIndex: number
    charHeightPx: number
    anchorX: number
    anchorY: number
    anchorXPx: number
    anchorYPx: number
    headTopY: number | null
    soleY: number | null
    drawX: number
    drawY: number
    empty: boolean
  }>
  warnings: string[]
  error?: string
}


export interface WorstFrame {
  frame: number
  bgResidual: number
  edgeGreen: number
  subjectCoverage: number
}

export interface AutotuneGoal {
  maxBgResidual?: number
  minSubjectCoverage?: number
  maxEdgeGreen?: number
}

export interface AutotuneSpace {
  intensity?: [number, number]
  mode?: Array<'classic' | 'advanced'>
}

export interface AutotuneTraceStep {
  round: number
  params: KeyParams
  bgResidual: number
  subjectCoverage: number
  edgeGreen: number
}

/** `sprite_autotune` 的入参。 */
export interface AutotuneArgs {
  goal?: AutotuneGoal
  /**
   * 调用方给的**起点参数**（P1-3）：作为搜索起点，并且**未达标时原样保留**
   * （不再拿搜索过程里的劣解覆盖你手调好的那套）。`colorHex` 不给就用自动采色。
   */
  params?: KeyParams
  space?: AutotuneSpace
  maxIters?: number
  frame?: number
}

/** `sprite_autotune` 的返回。 */
export interface AutotuneResult {
  ok: boolean
  /**
   * **向后兼容字段** = `appliedParams`（实际生效的那套）。
   * 未达标时它就是你传进来的 `params`，不再是"搜索到最后一轮"的参数。
   */
  params?: KeyParams
  /** 实际生效的参数（要拿去 key_apply 的就是它）。 */
  appliedParams?: KeyParams
  /** 搜索过程中**指标最好**的那一轮参数（供你和 `appliedParams` 比较，要不要用由你决定）。 */
  bestParams?: KeyParams
  /** `bestParams` 那一轮的指标（同 `trace` 里的一项）。 */
  bestStep?: AutotuneTraceStep
  /** 未达标时**一定有**一条 warning，写清"已保留你给的参数 / 搜索到的最优解"。 */
  warnings?: string[]
  trace: AutotuneTraceStep[]
  reachedGoal: boolean
  stats?: import('./analyze.js').SpriteStats
  error?: string
}

// ─────────────────── 重计算原语（模板匹配 / 特征反推 / 剪影拟合） ───────────────────
//
// 这三个原语都是"在像素上做搜索"，所以**所有矩形与坐标都是源帧像素**
// （左上原点、右下开区间；返回里带 `space:"frame"`）。
// 像素只在宿主 Node 里算（页面只把 dataURL 搬过来），算法核在 `match.ts`。

/** 像素来源：`keyed` = 抠图结果（默认）；`raw` = 原始帧（绿幕没抠，整幅不透明）。 */
export const PIXEL_SOURCES = ['keyed', 'raw'] as const

export interface MatchInput {
  /** 模板取自哪一帧（默认同 inFrame，再缺省 0）。 */
  templateFrame?: number
  /** 模板矩形（**templateFrame 的源帧像素空间**）。 */
  templateRect: Rect
  /** 在哪个帧里找（默认同 templateFrame）。 */
  inFrame?: number
  /** 只在这个矩形里搜（默认整幅；会被帧边界夹紧）。 */
  searchRect?: Rect
  source?: 'keyed' | 'raw'
  /** 低于它就 `found:false`（默认 0.85）。分值仍然回传。 */
  minScore?: number
}

export interface MatchResult {
  found: boolean
  /** 命中位置左上角（**inFrame 的源帧像素空间**）。 */
  x: number
  y: number
  /** NCC 分值（−1~1；同位置自匹配 ≥0.999）。 */
  score: number
  space: 'frame'
  reason?: string
}

export interface FeatureTemplateSpec {
  rect: Rect
  /** 权重（默认 1）。头部特征一般给得比躯干高。 */
  weight?: number
}

/**
 * 参考帧：要么是当前会话的某一帧，要么是磁盘上一张 PNG
 * ——后者是"跨素材对齐"的唯一入口（上一段素材导出的那一帧）。
 */
export interface ReferenceSpec {
  frame?: number
  imagePath?: string
}

export interface ScaleRange {
  min?: number
  max?: number
  step?: number
}

export interface FeatureFitInput {
  reference?: ReferenceSpec
  /** 特征模板（建议 2 个：单模板只能定平移，双模板才能定 scale）。 */
  templates: FeatureTemplateSpec[]
  /** 参考帧上的归一化锚点（0~1，y-from-bottom，与 meta.json 同口径）；给了才回传 transferredAnchor。 */
  anchorX?: number
  anchorY?: number
  search?: {
    frames?: number[] | 'all'
    scale?: ScaleRange
  }
  source?: 'keyed' | 'raw'
}

export interface TransferredAnchor {
  anchorX: number
  anchorY: number
  anchorYTopDown: number
  /** 锚点是怎么来的：`silhouette` 拓印 / `semantic-required` 必须走语义点 / `feature` 特征反推。 */
  anchorSource?: 'silhouette' | 'semantic-required' | 'feature'
}

export type FitConfidence = 'high' | 'medium' | 'low'

export interface FeatureFitResult {
  /** 命中的目标帧号。 */
  frame: number
  scale: number
  /** 参考图坐标 → 目标图坐标：`p_target = p_ref × scale + (dx, dy)`（源帧像素）。 */
  dx: number
  dy: number
  /** 各模板 NCC 的加权平均。 */
  score: number
  /** 两个模板各自反推的平移差（px）；>2px 说明特征被遮挡/形变。 */
  residualPx: number
  transferredAnchor?: TransferredAnchor
  perTemplate: Array<{ score: number; x: number; y: number }>
  confidence: FitConfidence
  reason?: string
  warnings?: string[]
}

export interface SilhouetteFitInput {
  reference?: ReferenceSpec
  target?: { frames?: number[] | 'all' }
  /** `body-core`（默认）= 最大连通域 + 1px 腐蚀（去特效/去手）；`raw` = 只按 alpha 阈值。 */
  mask?: 'raw' | 'body-core'
  search?: { scale?: ScaleRange }
  source?: 'keyed' | 'raw'
  anchorX?: number
  anchorY?: number
  alphaThreshold?: number
}

export interface SilhouetteFitResult {
  frame: number
  iou: number
  scale: number
  dx: number
  dy: number
  /** `null` = IoU < 0.75，锚点不可拓印（必须走语义点）。 */
  transferredAnchor: TransferredAnchor | null
  confidence: FitConfidence
  reason?: string
  warnings?: string[]
}

