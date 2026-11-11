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

export interface MeasureLandmark {
  id: string
  type: 'bbox-top' | 'bbox-bottom' | 'bbox-left' | 'bbox-right' | 'point' | 'scan-vertical'
  x?: number
  y?: number
  fromY?: number
  toY?: number
  alphaThreshold?: number
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
  landmarks?: Array<{ id: string; px: number | null; py: number | null; confidence: number }>
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
