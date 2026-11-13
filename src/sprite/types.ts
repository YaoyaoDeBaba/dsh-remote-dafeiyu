/**
 * sprite/types —— 序列帧工具对外（工具层）与对内（service 层）共用的形状。
 *
 * 这么做是为了让"契约"只有一份：工具 schema、service 入参、返回字段都从这里取，
 * 免得 schema 说支持 `mode`、service 却没转给页面（`.57` 之前的真实缺陷）。
 */

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
}

export interface ExportResult {
  ok: boolean
  pngPath?: string
  metaPath?: string
  sheet?: { width: number; height: number }
  cell?: { width: number; height: number }
  scale?: number
  achievedPx?: number
  charHeightPx?: number
  scaleClamped?: boolean
  format?: 'png' | 'webp'
  bytes?: number
  stats?: { worst?: WorstFrame }
  reported?: Record<string, unknown>
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
