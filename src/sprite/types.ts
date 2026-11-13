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

export interface ExportOptions {
  cols?: number
  rows?: number
  /** 旧语义：整格目标高。 */
  targetHeight?: number
  /** 新语义（推荐）：角色/内容净高，配合 span 使用。 */
  charHeightPx?: number
  span?: { fromY: number; toY: number }
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
  warnings: string[]
  error?: string
}

/** `sprite_baseline` 的入参：把一组图集按锚点对齐到同一条地平线。 */
export interface BaselineArgs {
  /** 图集路径（png）。配套 meta 自动按同名找：`x.png` → `x.meta.json`，再退回 `x.json`。 */
  paths: string[]
  /** 取每张图的第几格（默认 0 = 首帧）。 */
  cellIndex?: number
  /** 格与格之间的横向空隙（像素，默认 8）。 */
  gap?: number
  /** 底色（默认 #202030）。 */
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
  items?: Array<{
    name: string
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

