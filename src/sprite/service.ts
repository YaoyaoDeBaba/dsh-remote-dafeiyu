/**
 * sprite/service —— 「视频转序列帧精灵图」的编排层（给 agent 用的那双手）。
 *
 * 链路：插件起一个**只服务这个工具页 + 待处理的视频**的本地 http 服务 → 无头 Edge 打开它 →
 * CDP `Runtime.evaluate` 调页面里的 `window.__spriteAgent` → 拿 dataURL 回 Node 侧算指标/落盘。
 *
 * 三条来自实测的纪律：
 * 1. **别用模拟点击**：取色按钮在无头下会状态失步，文件输入重复设置同一文件不触发 change。
 * 2. **先收敛再全量**：单帧预览 < 2s，全量 apply 30~90s。preview 用来迭代参数，apply 只跑一次。
 * 3. **失败要响**：`.58` 起每个"可能静默降级"的地方都会抛错或写 warnings——
 *    尤其是「keyed 缓存被 preview 清空后还去 export」和「导出图 alpha 全不透」这两种，
 *    以前都会返回 `ok:true`，然后交出一张绿底图。
 */
import { createServer, type Server } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { analyzeSpritePng, borderOpaqueRatio, borderOpaqueWarning, type SpriteStats } from './analyze.js'
import {
  assertKeyedPresent,
  assertNotOpaque,
  checkGridCapacity,
  defaultFileNames,
  gridFor,
  measuredMismatchWarning,
  pickWorst,
} from './guard.js'
import { composeBaseline, drawCellOverlay, measureSheet, type BaselineCellInput, type SheetMeasurement } from './contact.js'
import { encodePng } from './encode.js'
import { launchBrowser, type CdpSession } from './browser.js'
import {
  cropRgba,
  featureConfidence,
  fitFeatureFrame,
  fitSilhouetteFrame,
  matchTemplate,
  round4,
  silhouetteConfidence,
  transferAnchor,
  type FeatureFrameFit,
  type MaskImage,
  type RgbaImage,
} from './match.js'
import {
  autocorrelation,
  bodyCoreMask,
  closureOf,
  downsample,
  downsampleMask,
  frameDiff,
  fullMask,
  LOOP_DOWNSAMPLE_FACTOR,
  maskArea,
  pickPeriod,
  scanRangeFor,
  suggestFps,
  type LoopClosureCheck,

  multipleSuspectWarning
} from './loop.js'
import { decodePng } from './png.js'
import type {
  AnchorInfo,
  AutotuneGoal,
  AutotuneSpace,
  AutotuneTraceStep,
  BaselineArgs,
  BaselineResult,
  ExportOptions,
  ExportResult,
  FeatureFitInput,
  FeatureFitResult,
  KeyParams,
  LoopScanArgs,
  LoopScanResult,
  MatchInput,
  MatchResult,
  MeasureLandmark,
  MeasureResult,
  ProbeColorResult,
  Rect,
  ReferenceSpec,
  ScaleResult,
  SilhouetteFitInput,
  SilhouetteFitResult,
  TransferredAnchor,
  TrimOptions,
  WorstFrame,
} from './types.js'
import { verifyConsistency, type VerifyArgs, type VerifyMeta, type VerifyResult } from './verify.js'

export interface SpriteServiceOptions {
  /** 打补丁后的工具页（绝对路径）。 */
  toolHtmlPath: string
  /** 导出目录（默认 `<dshHome>/storages/dsh-remote-dafeiyu/sprite-out`）。 */
  outDir: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
  /** 空闲多久关浏览器（默认 5 分钟）。 */
  idleMs?: number
  /** 浏览器可执行文件（不传就按常见路径找）。 */
  browserPath?: string
}

interface LoadedVideo {
  ok: boolean
  name?: string
  bytes?: number
  width?: number
  height?: number
  duration?: number
  error?: string
}

interface KeyedStats {
  appliedParams?: KeyParams
  keyedCount?: number
}

export interface PrepareResult {
  ok: boolean
  frames: number
  width: number
  height: number
  video: string
  /** 视频走的是哪条通道（http 直传 / base64）。诊断用。 */
  transport: 'http' | 'base64'
  /** 只有 `loop` 模式才有：重采后的帧率（**不传 loop 时这些字段一个都不出现**）。 */
  fps?: number
  periodSec?: number
  loopClosed?: boolean
  /** 只有 `loop` 模式才有：周期/建议帧数/闭合度的完整回执。 */
  loop?: {
    periodFrames: number
    targetFrames: number
    suggestedFps: number
    confidence: 'high' | 'medium' | 'low'
    closure: LoopClosureCheck
  }
  warnings?: string[]
  error?: string
}

export interface PreviewResult {
  ok: boolean
  frame: number
  stats?: SpriteStats
  previewPath?: string
  maskPath?: string
  appliedParams?: KeyParams
  ignored: string[]
  error?: string
}

export interface ApplyResult {
  ok: boolean
  frames: number
  plateApplied: boolean
  keyedCount: number
  stats?: SpriteStats
  worst?: WorstFrame
  appliedParams?: KeyParams
  ignored: string[]
  warnings: string[]
  error?: string
}

/**
 * 自动遮挡的置信度门槛：跨帧稳定占比 >= 80% 才敢自动套用（P1-4 之前这个数写死在 cleanup 里，
 * 抽出来是因为页面侧（四角兜底）用同一个数决定"这算不算高置信"）。
 */
export const WATERMARK_AUTO_CONFIDENCE = 0.8

/** 页面 `detectWatermark` 返回的一条候选（老字段在前，新增字段只做解释）。 */
export interface WatermarkCandidate extends Rect {
  confidence?: number
  corner?: string
  /** 'strict' = 严格判据命中；'corner' = 四角兜底。 */
  source?: 'strict' | 'corner'
  tier?: 'high' | 'low'
  /** false = 只是"摆出来给调用方看"的候选，不参与自动选中（低置信/被过滤/被同角挤掉）。 */
  selected?: boolean
  candidatePixels?: number
  scores?: { stability?: number; contrast?: number; size?: number }
  reasons?: string[]
  rejectedReason?: string
}

export interface CleanupResult {
  ok: boolean
  /** 实际用来遮挡的矩形（maskRect:'auto' 时是自动检测选中的那个）。 */
  maskRect?: Rect | null
  /** 自动检测的全部候选（含置信度不足的，含未选原因），按置信度降序，供调用方自己判断。 */
  watermarkCandidates?: WatermarkCandidate[]
  trimBox: Rect | null
  mode: 'union' | 'first-frame'
  pad: { top: number; bottom: number; left: number; right: number }
  alphaThreshold: number
  unionFrames: number
  warnings?: string[]
  error?: string
}

export interface BatchItem {
  videoPath: string
  action: string
  name?: string
  start?: number
  end?: number
  fps?: number
  keyColor?: string
  intensity?: number
  mode?: 'classic' | 'advanced'
  maskRect?: Rect | 'auto'
  targetCharHeight?: number
  trimMode?: 'union' | 'first-frame'
  cols?: number
  rows?: number
  format?: 'png' | 'webp'
}

export interface BatchOptions {
  outRoot: string
  items: BatchItem[]
  /** 预留；当前实现串行（A5 session 隔离做完后才支持 >1）。 */
  concurrency?: number
  overwrite?: boolean
}

export interface BatchResultItem {
  action: string
  name: string
  ok: boolean
  pngPath?: string
  metaPath?: string
  cellW?: number
  cellH?: number
  scale?: number
  charHeightPx?: number
  anchorX?: number
  anchorY?: number
  stats?: { worst?: WorstFrame }
  overlayPath?: string
  /** 成品实测（见 `ExportResult.measured`）；batch 透传每条自己的实测。 */
  measured?: SheetMeasurement
  warnings: string[]
  error?: string
}

export interface SpriteService {
  prepare(args: {
    videoPath: string
    start?: number
    end?: number
    fps?: number
    /**
     * 循环闭合（可选，**不传时行为与以前一字不变**）：先按 preFps 预采样 → 自相关测周期 →
     * 按新采样率重新精确抽 `targetFrames` 帧。一次性动作别传（会被截成半截）。
     */
    loop?: {
      targetFrames?: number
      minPeriodSec?: number
      targetMultiples?: number[]
      mask?: 'body-core' | 'none'
    }
  }): Promise<PrepareResult>
  /** 扫当前会话帧的循环周期（只读像素，不改 fps/帧/锚点）。 */
  loopScan(args: LoopScanArgs): Promise<LoopScanResult>
  probeColor(args: { frame?: number; bandPx?: number }): Promise<ProbeColorResult>
  keyPreview(args: KeyParams & { frame?: number }): Promise<PreviewResult>
  keyApply(args: KeyParams & { indices?: number[]; probeFrames?: number }): Promise<ApplyResult>
  measure(args: {
    frame?: number | 'all'
    alphaThreshold?: number
    landmarks?: MeasureLandmark[]
    overlay?: boolean
    /** 量抠图结果（默认）还是原始帧。绿幕素材的原帧整幅不透明，量原帧只会得到「整幅」。 */
    source?: 'keyed' | 'raw'
  }): Promise<MeasureResult>
  scaleTo(args: { charHeightPx?: number; targetCellHeight?: number; span?: { fromY: number; toY: number } }): Promise<ScaleResult>
  /** 模板匹配（NCC）。坐标一律源帧像素。 */
  match(args: MatchInput): Promise<MatchResult>
  /** 特征反推：用 1~2 个不变特征求 scale + 平移，可跨素材（reference.imagePath）。 */
  featureFit(args: FeatureFitInput): Promise<FeatureFitResult>
  /** 剪影拟合：按 IoU 给三档，只有 ≥0.90 才允许拓印锚点。 */
  silhouetteFit(args: SilhouetteFitInput): Promise<SilhouetteFitResult>
  /** 一批产物的一致性自检（纯读 meta，不解码图片）。 */
  verify(args: VerifyArgs): Promise<VerifyResult>
  /**
   * 准绳图：把几张图集按 meta 的锚点对齐到**同一条地平线**，画上地平线/头顶线/每格中轴，
   * 供人目视验收（skill §9 第 3 条）。
   */
  baseline(args: BaselineArgs): Promise<BaselineResult>
  getAnchor(): Promise<AnchorInfo>
  setAnchorPx(args: { x?: number; y?: number; convention?: 'y-from-bottom' | 'y-from-top' }): Promise<AnchorInfo>
  cleanup(args: { maskRect?: Rect | 'auto' | null; maskMode?: 'auto' | 'corner'; trim?: TrimOptions }): Promise<CleanupResult>
  exportSheet(args: ExportOptions): Promise<ExportResult>
  autotune(args: { goal?: AutotuneGoal; space?: AutotuneSpace; maxIters?: number; frame?: number }): Promise<{
    ok: boolean
    params?: KeyParams
    trace: AutotuneTraceStep[]
    reachedGoal: boolean
    stats?: SpriteStats
    error?: string
  }>
  batch(args: BatchOptions): Promise<{ ok: boolean; results: BatchResultItem[]; failures: Array<{ action: string; error: string }> }>
  /** 一段素材的一条龙（A7）。 */
  auto(args: {
    videoPath: string
    name?: string
    outDir?: string
    targetCharHeight?: number
    cols?: number
    rows?: number
    format?: 'png' | 'webp'
    trimMode?: 'union' | 'first-frame'
    maskRect?: Rect | 'auto'
  }): Promise<ExportResult & { stages: string[] }>
  stop(): Promise<void>
  readonly busy: boolean
}

function dataUrlToBuffer(dataUrl: unknown): Buffer | undefined {
  const text = typeof dataUrl === 'string' ? dataUrl : ''
  const comma = text.indexOf(',')
  if (!text.startsWith('data:') || comma < 0) return undefined
  if (!text.slice(0, comma).includes('base64')) return undefined
  try {
    return Buffer.from(text.slice(comma + 1), 'base64')
  } catch {
    return undefined
  }
}

const PAGE_ROUTE = '/'
const VIDEO_ROUTE = '/__video/'
const MAX_VIDEO_BYTES = 200 * 1024 * 1024

/**
 * 只服务工具页与待处理视频的本地 http 服务。
 *
 * 为什么不借宿主的 webServer：那要先知道宿主自己的 origin/端口（插件拿不到可靠值），
 * 而且宿主的页面有 CSP/鉴权那一套。这个服务只监听回环、只回两类东西、随用随关。
 *
 * 视频走 `/__video/<token>`：token 一次性、只映射到"本次要处理的那条路径"，
 * 这样页面不用把 2.5MB 塞进 CDP 的 evaluate 字符串（P13 的主要耗时来源）。
 */
function startToolServer(
  toolHtmlPath: string,
  videos: Map<string, string>,
): Promise<{ origin: string; server: Server }> {
  return new Promise((resolve, reject) => {
    const html = readFileSync(toolHtmlPath)
    const server = createServer((request, response) => {
      const url = request.url ?? '/'
      if (url.startsWith(VIDEO_ROUTE)) {
        const token = url.slice(VIDEO_ROUTE.length).split('?')[0] ?? ''
        const file = videos.get(token)
        if (!file || !existsSync(file)) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          response.end('video not found')
          return
        }
        const stat = statSync(file)
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Cache-Control': 'no-store',
        })
        if (request.method === 'HEAD') {
          response.end()
          return
        }
        createReadStream(file).pipe(response)
        return
      }
      if (!url.startsWith(PAGE_ROUTE)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('not found')
        return
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.byteLength,
        'Cache-Control': 'no-store',
      })
      response.end(html)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      if (!port) {
        reject(new Error('工具页服务没拿到端口'))
        return
      }
      resolve({ origin: `http://127.0.0.1:${port}`, server })
    })
  })
}

/** 调页面桥接的函数形状：名字 + JSON 参数。exportSheet 与测试桩共用这一条路径。 */
export type BridgeCall = <T>(name: string, ...args: unknown[]) => Promise<T>

/**
 * export 要写进 meta 的锚点：**与 `sprite_set_anchor` 同一条读回路径**。
 *
 * 为什么不能直接拿 `setAnchor` 的返回值：页面 `setAnchor(x,y)` 只回 `{ok,x,y}`（归一化后的值），
 * 并不是 `AnchorInfo`。上一版按 `AnchorInfo` 读它写 meta，`anchorX/anchorY` 全是 undefined，
 * `JSON.stringify` 直接把这两个键丢掉（`anchorYTopDown` 变成 NaN → 落盘成 null）。
 * 现在要设就先 `setAnchor`，然后一律 `getAnchor` 回读完整值，meta 只用回读值。
 */
export async function resolveExportAnchor(
  call: BridgeCall,
  args: Pick<ExportOptions, 'anchorX' | 'anchorY'>,
): Promise<{ anchor: AnchorInfo; written: boolean }> {
  const written = typeof args.anchorX === 'number' || typeof args.anchorY === 'number'
  if (written) {
    await call('setAnchor', {
      ...(typeof args.anchorX === 'number' ? { x: args.anchorX } : {}),
      ...(typeof args.anchorY === 'number' ? { y: args.anchorY } : {}),
    })
  }
  const anchor = await call<AnchorInfo>('getAnchor')
  if (typeof anchor?.anchorX !== 'number' || typeof anchor?.anchorY !== 'number') {
    // 宁可报错也不写半份 meta：静默丢键正是上一版的坑。
    throw new Error('页面 getAnchor 没有返回 anchorX/anchorY（桥接版本过旧？），这次不写 meta 里的锚点')
  }
  return {
    anchor: {
      ...anchor,
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
      convention: anchor.convention === 'y-from-top' ? 'y-from-top' : 'y-from-bottom',
    },
    written,
  }
}

/** `buildExportMeta` 的入参：exportSheet 里除锚点外的那些已算好的值。 */
export interface ExportMetaInput {
  built: { meta?: Record<string, unknown>; width?: number; height?: number }
  name: string
  format: 'png' | 'webp'
  cellWidth: number | null
  cellHeight: number | null
  anchor: AnchorInfo
  /** 这次到底写没写锚点：false = 调用方没传，meta 里是页面当前值。 */
  anchorWritten: boolean
  fps: number
  scaled: Pick<ScaleResult, 'scale' | 'achievedPx'>
  appliedParams: KeyParams | null
  generatedAt?: string
}

/**
 * 组装 meta.json 的内容。exportSheet 落盘前**唯一**一处拼装；
 * 单测直接拿这份对象做 JSON 往返，钉住"键不会被 stringify 吃掉"。
 */
export function buildExportMeta(input: ExportMetaInput): Record<string, unknown> {
  return {
    ...(input.built.meta ?? {}),
    // P0-2：页面那边 meta.name 取的是「输出参数」输入框（headless 永远是 sprite_sheet），
    // 跟实际文件名对不上；这里用调用方真正传的 name 覆盖掉。
    name: input.name,
    format: input.format,
    width: input.built.width ?? null,
    height: input.built.height ?? null,
    sheetWidth: input.built.width ?? null,
    sheetHeight: input.built.height ?? null,
    // P0-1：以前这里写死 null，下游只能自己拿 width/cols 去除，四舍五入差 1px 就对不齐裁剪。
    // 现在直接给整数，并保证 cellWidth*cols === width（除不尽时按整除值给，差的那点进 warnings）。
    cellWidth: input.cellWidth,
    cellHeight: input.cellHeight,
    anchorX: input.anchor.anchorX,
    anchorY: input.anchor.anchorY,
    anchorConvention: input.anchor.convention,
    // P2-6：两个方向都给，消费端（形象 manifest / 桌面挂件用 0=顶）不用再人工换算。
    anchorYTopDown: Number((1 - input.anchor.anchorY).toFixed(6)),
    // P0-1：明确告诉调用方"这次到底写没写锚点"——没传锚点参数时是 false（meta 里是页面当前值）。
    anchorWritten: input.anchorWritten,
    // P2-7：帧率跟着 prepare 的 fps 走，缺省 12（工具默认）。形象侧想按它播就直接读。
    fps: input.fps,
    scale: input.scaled.scale,
    charHeightPx: input.scaled.achievedPx,
    appliedParams: input.appliedParams,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    engine: 'dsh-remote-dafeiyu/sprite',
  }
}

export function createSpriteService(options: SpriteServiceOptions): SpriteService {
  const log = options.log
  const idleMs = options.idleMs ?? 5 * 60 * 1000
  const videos = new Map<string, string>()
  let session: CdpSession | undefined
  let toolServer: Server | undefined
  let toolOrigin = ''
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let launching: Promise<CdpSession> | undefined
  let stopped = false
  /** 最近一次 prepare 的帧尺寸/数量/帧率，用于默认值、断言与 meta 回填。 */
  let lastPrepare: { frames: number; width: number; height: number; fps: number; looped?: boolean } | undefined
  /**
   * 帧数据是不是已经被空闲回收掉了。
   *
   * 回收会关掉浏览器页面，`state.frames` 随之消失；但下一次 `ensureSession()` 会
   * 重新拉起一个**空页面**，于是任何依赖帧的调用只会得到页面那句「还没有帧，先 extract()」——
   * 而 `extract()` 这个工具根本不存在（真正要做的是重新 `sprite_prepare`）。
   * 2026-11-12 实测就有人在这上面白试了几轮，所以这里记一笔，把错误改成能照做的说法。
   */
  let framesLost = false

  const touch = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      void recycle('空闲超时')
    }, idleMs)
    if (typeof idleTimer === 'object' && idleTimer !== null && 'unref' in idleTimer) {
      ;(idleTimer as { unref?: () => void }).unref?.()
    }
  }

  const recycle = async (why: string): Promise<void> => {
    const current = session
    const hadFrames = lastPrepare !== undefined
    session = undefined
    lastPrepare = undefined
    // 只有"真的有帧、又被回收了"才置位：从没 prepare 过的会话报错说"已回收"是误导。
    if (hadFrames) framesLost = true
    if (current) {
      log('关掉序列帧浏览器', { why })
      await current.close().catch(() => undefined)
    }
  }

  const ensureSession = async (): Promise<CdpSession> => {
    if (stopped) throw new Error('序列帧服务已停机')
    if (session) {
      touch()
      return session
    }
    if (launching) return launching
    launching = (async () => {
      if (!toolServer) {
        const started = await startToolServer(options.toolHtmlPath, videos)
        toolServer = started.server
        toolOrigin = started.origin
      }
      const created = await launchBrowser({
        toolUrl: `${toolOrigin}${PAGE_ROUTE}`,
        ...(options.browserPath ? { executable: options.browserPath } : {}),
        log,
      })
      session = created
      touch()
      return created
    })()
    try {
      return await launching
    } finally {
      launching = undefined
    }
  }

  /** 调页面里的 bridge 函数；`{ok:false}` 一律转成异常，免得每个调用点都判一次。 */
  const bridge = async <T>(name: string, ...args: unknown[]): Promise<T> => {
    const active = await ensureSession()
    touch()
    const expression = `(async () => {
      const api = window.__spriteAgent
      if (!api || !api.${name}) return { ok: false, error: '页面没有 __spriteAgent.${name}（桥接版本过旧？）' }
      try { return await api.${name}(${args.map((arg) => JSON.stringify(arg ?? null)).join(', ')}) }
      catch (error) { return { ok: false, error: String(error && error.message || error) } }
    })()`
    const answer = await active.evaluate<{ ok?: boolean; error?: string } & Record<string, unknown>>(expression, 600_000)
    if (!answer || answer.ok !== true) {
      const raw = String(answer?.error ?? `${name} 失败（页面没有返回 ok）`)
      if (framesLost) {
        throw new Error(
          `会话已空闲回收（超过 ${Math.round(idleMs / 60_000)} 分钟无操作），帧数据已释放，请重新 sprite_prepare。原始错误：${raw}`,
        )
      }
      throw new Error(raw)
    }
    return answer as T
  }

  /** bridge 不一定在（旧页面）：能降级就降级，不能就抛。 */
  const hasBridge = async (name: string): Promise<boolean> => {
    const active = await ensureSession()
    touch()
    return active.evaluate<boolean>(`!!(window.__spriteAgent && window.__spriteAgent.${name})`, 10_000)
  }

  const outDirOf = (override?: string): string => {
    const dir = override && override.trim() !== '' ? override.trim() : options.outDir
    mkdirSync(dir, { recursive: true })
    return dir
  }

  const debugDirOf = (override?: string): string => {
    const dir = path.join(outDirOf(override), '_debug')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  const writeDataUrl = (dataUrl: unknown, target: string): number => {
    const buffer = dataUrlToBuffer(dataUrl)
    if (!buffer) throw new Error('页面返回的图片不是 base64 dataURL')
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, buffer)
    return buffer.byteLength
  }

  /**
   * 采样若干帧的抠图结果并算指标，找出"最差帧"（B6：第 0 帧干净不代表整段干净）。
   *
   * 顺带算「压边」：某帧画面边缘有大量不透明像素，多半是手/特效被抠成了主体（C 系列：
   * 这种帧的 bbox 会撑到画框，contentHeight 与缩放全跟着错）。带子按短边 2% 取，
   * 与 `bgResidual` 的 6% 分开——判的是"贴着画框"而不是"背景残渣"。
   */
  const worstOf = async (
    frames: number,
    sampleLimit = 8,
  ): Promise<{
    worst?: WorstFrame
    stats?: SpriteStats
    border?: { ratio: number; frame: number; bandPx: number }
  }> => {
    const total = Math.max(1, frames)
    const picks = new Set<number>([0])
    const step = Math.max(1, Math.floor(total / sampleLimit))
    for (let i = 0; i < total; i += step) picks.add(i)
    picks.add(total - 1)
    const bucket: Array<{ frame: number; stats: SpriteStats }> = []
    let firstStats: SpriteStats | undefined
    let border: { ratio: number; frame: number; bandPx: number } | undefined
    for (const frame of [...picks].slice(0, sampleLimit + 1)) {
      try {
        const one = await bridge<{ ok: boolean; dataURL?: string }>('keyedDataURL', frame)
        const buffer = dataUrlToBuffer(one.dataURL)
        if (!buffer) continue
        const stats = analyzeSpritePng(buffer)
        if (!firstStats) firstStats = stats
        bucket.push({ frame, stats })
        try {
          const edge = borderOpaqueRatio(buffer)
          if (!border || edge.ratio > border.ratio) border = { ratio: edge.ratio, frame, bandPx: edge.bandPx }
        } catch {
          /* 压边是增强项：这张解不开不影响其它指标 */
        }
      } catch {
        /* 单帧采样失败不影响整体：采不到就不给 worst */
      }
    }
    const worst = pickWorst(bucket)
    return {
      ...(worst ? { worst } : {}),
      ...(firstStats ? { stats: firstStats } : {}),
      ...(border ? { border } : {}),
    }
  }

  /**
   * 读页面上的抠图状态。注意 `mode` 是**顶层字段**（契约 §2），而 params 里没有它——
   * 这里合并进来，否则调用方会以为"advanced 没生效"（`.58` 的 e2e 真的踩到过）。
   */
  const keytedParamsOf = async (): Promise<{ params?: KeyParams; keyedCount: number }> => {
    try {
      const state = await bridge<{
        ok: boolean
        params?: KeyParams
        mode?: 'classic' | 'advanced'
        keyedCount?: number
      }>('keyState')
      const params: KeyParams | undefined = state.params
        ? { ...state.params, ...(state.mode ? { mode: state.mode } : {}) }
        : undefined
      return { ...(params ? { params } : {}), keyedCount: Number(state.keyedCount ?? 0) }
    } catch {
      return { keyedCount: -1 }
    }
  }

  /**
   * 读某一帧的像素（**内部方法，不注册成工具**）。
   *
   * 走的是页面已有的两条只读桥：`frameDataURL`（原帧）与 `keyedDataURL`（抠图结果）
   * ——两者都回 `{ok:true, dataURL}`，转 Buffer 后交给 `decodePng`，宿主侧就有 RGBA 了。
   *
   * 缓存只在**一次工具调用内**有效（调用方传进来一个 Map）：720×966 一帧的 RGBA 就是
   * 2.7MB，做成跨调用的全局缓存会把宿主内存吃掉。
   */
  const readFramePixels = async (
    opts: { frame: number; source?: 'keyed' | 'raw' },
    cache?: Map<string, RgbaImage>,
  ): Promise<RgbaImage> => {
    const source = opts.source === 'raw' ? 'raw' : 'keyed'
    const frame = Math.max(0, Math.floor(Number(opts.frame ?? 0)))
    if (!Number.isFinite(frame)) throw new Error(`帧号不是数字：${String(opts.frame)}`)
    const key = `${source}:${frame}`
    const cached = cache?.get(key)
    if (cached) return cached
    const bridgeName = source === 'raw' ? 'frameDataURL' : 'keyedDataURL'
    const answer = await bridge<{ ok: boolean; dataURL?: string }>(bridgeName, frame)
    const buffer = dataUrlToBuffer(answer?.dataURL)
    if (!buffer) throw new Error(`第 ${frame} 帧（${source}）没拿到 PNG dataURL，读不出像素`)
    const decoded = decodePng(buffer)
    const image: RgbaImage = { width: decoded.width, height: decoded.height, rgba: decoded.rgba }
    cache?.set(key, image)
    return image
  }

  /**
   * 一次搜索最多扫几帧。
   *
   * 为什么不是"全扫"：720×966 一帧的 RGBA 是 2.7MB，24 帧就是 67MB，加上每帧的金字塔
   * 与掩膜还要再翻一倍；帧数一多时间也不是线性可控的。预算按 24 帧 × 720×966 折算：
   * 帧更大就自动少扫几帧，调用方显式给帧号列表则照办。
   */
  const frameLimitFor = (width: number, height: number): number => {
    const budget = 720 * 966
    const pixels = Math.max(1, Math.round(width) * Math.round(height))
    return Math.max(6, Math.min(24, Math.round((24 * budget) / pixels)))
  }

  /**
   * 把 `number[] | 'all' | undefined` 收敛成帧号列表。
   * 显式列表照给（多给就多花时间，回一条 warning）；`'all'` 超过上限时**等间隔抽样**
   * ——限帧要主动做，不能指望工具超时兜底（超时那一下什么都没有）。
   */
  const framesOf = (
    spec: number[] | 'all' | undefined,
    limit: number,
  ): { frames: number[]; warnings: string[] } => {
    const warnings: string[] = []
    if (Array.isArray(spec)) {
      const frames = [
        ...new Set(
          spec
            .map((value) => Math.floor(Number(value)))
            .filter((value) => Number.isFinite(value) && value >= 0),
        ),
      ].sort((a, b) => a - b)
      if (frames.length === 0) throw new Error('frames 是空数组：要么给帧号，要么写 "all"')
      if (frames.length > limit) {
        warnings.push(`按你给的 ${frames.length} 帧全跑（超过默认上限 ${limit} 帧，会更慢）`)
      }
      return { frames, warnings }
    }
    const total = lastPrepare?.frames ?? 0
    if (total <= 0) {
      throw new Error(
        '不知道总帧数：本次会话没有 sprite_prepare 记录（或帧已被空闲回收）。请显式给帧号列表，或重新 sprite_prepare。',
      )
    }
    if (total <= limit) return { frames: Array.from({ length: total }, (_one, index) => index), warnings }
    const step = total / limit
    const picked = [
      ...new Set(Array.from({ length: limit }, (_one, index) => Math.min(total - 1, Math.round(index * step)))),
    ]
    warnings.push(
      `序列共 ${total} 帧，"all" 默认只扫等间隔的 ${picked.length} 帧（预算按 24 帧×720×966 折算）；要全跑就显式给 frames 列表。`,
    )
    return { frames: picked, warnings }
  }

  /** 参考图：当前会话的某一帧，或磁盘上一张 PNG（跨素材对齐的唯一入口）。 */
  const referenceImageOf = async (
    spec: ReferenceSpec | undefined,
    source: 'keyed' | 'raw',
    cache: Map<string, RgbaImage>,
  ): Promise<{ image: RgbaImage; frame?: number }> => {
    const imagePath = typeof spec?.imagePath === 'string' ? spec.imagePath.trim() : ''
    if (imagePath !== '') {
      if (!existsSync(imagePath)) throw new Error(`参考图不存在：${imagePath}`)
      const decoded = decodePng(readFileSync(imagePath))
      return { image: { width: decoded.width, height: decoded.height, rgba: decoded.rgba } }
    }
    const frame = Math.max(0, Math.floor(Number(spec?.frame ?? 0)))
    return { image: await readFramePixels({ frame, source }, cache), frame }
  }

  /** 锚点要不要回传：给了任一分量就算要（缺的那个按 0.5 补，description 里写明了）。 */
  const wantsAnchor = (args: { anchorX?: number; anchorY?: number }): boolean =>
    typeof args.anchorX === 'number' || typeof args.anchorY === 'number'

  // ───────────────────── 循环闭合：自相关测周期 / 按周期重采 ─────────────────────
  //
  // 三条已对齐的决定（别自己改）：
  // 1. 扫描跑在**当前会话已抽好的帧**上（不自己重新抽，否则冲掉用户已抽的帧）；
  // 2. 默认只给建议（periodFrames / suggestedFps），要改采样必须显式 prepare({loop})；
  // 3. 一次性动作不碰：loop 是显式开关，不按帧数自动触发。

  /** 全分辨率复核与闭合度采样要几对：分数是均值，6 对足够（实测 6 对 = 21ms）。 */
  const LOOP_VERIFY_PAIRS = 6

  /**
   * 扫周期（**纯读像素，不改会话状态**：不改 fps、不改帧、不改锚点）。
   *
   * 代价控制（这是本功能唯一的技术风险）：
   * - 每帧只读一次，读完立刻降到 1/4（180×241）——全分辨率存 48 帧就是 130MB；
   * - 自相关只在 1/4 上跑（实测 48 帧 × 19 候选 = 48ms；全分辨率要 ~16 亿次）；
   * - 只在最优 L 附近回全分辨率复核（L±1、各 6 对），把降采样的量化误差修回一格；
   * - 闭合度也在全分辨率算（跟真实播放同一口径，比值才有意义）。
   */
  const loopScanOf = async (params: {
    fps: number
    frames: number
    source: 'keyed' | 'raw'
    mask?: 'body-core' | 'none'
    minPeriodSec?: number
    targetMultiples?: number[]
  }): Promise<LoopScanResult> => {
    const startedAt = Date.now()
    const n = Math.max(1, Math.floor(Number(params.frames)))
    const fps = Number(params.fps) > 0 ? Number(params.fps) : 12
    const maskMode: 'body-core' | 'none' = params.mask === 'none' ? 'none' : 'body-core'
    const warnings: string[] = []
    if (!(fps >= 10)) throw new Error(`当前会话 fps=${fps} 太低（<10）：先 sprite_prepare 到 12fps 再扫`)
    if (n < 24) throw new Error(`当前会话只有 ${n} 帧（<24）：先 sprite_prepare 到 12fps、时长 ≥2 秒再扫`)
    if (params.source === 'raw') {
      warnings.push('还没 key_apply：这次用原帧扫（绿幕噪声会压低自相关的对比度）。扫完记得正常抠图再导出。')
    }

    // ① 逐帧读一次 → 立刻降采样；全分辨率只留候选复核要用的那几帧。
    const keepInside = Math.min(LOOP_VERIFY_PAIRS + 2, n - 1)
    const keepIdx = new Set<number>([n - 1])
    for (let i = 0; i <= keepInside; i++) keepIdx.add(i)
    const kept = new Map<number, RgbaImage>()
    const small: RgbaImage[] = []
    for (let i = 0; i < n; i++) {
      const img = await readFramePixels({ frame: i, source: params.source })
      if (keepIdx.has(i)) kept.set(i, img)
      const down = downsample(img, LOOP_DOWNSAMPLE_FACTOR)
      small.push({ width: down.width, height: down.height, rgba: down.rgba })
    }
    const first = kept.get(0)
    if (!first) throw new Error('第 0 帧没读到，没法建共用掩膜')

    // ② 共用一张掩膜（第 0 帧 body-core）。逐帧各算各的会让"边界变化"冒充动作差异。
    let mask = maskMode === 'none' ? fullMask(first.width, first.height) : bodyCoreMask(first)
    if (maskMode !== 'none' && maskArea(mask) < 16) {
      throw new Error('body-core 掩膜几乎是空的（alpha 没命中任何像素）：先 key_apply 抠图，或显式传 mask:"none"')
    }
    const smallMask = downsampleMask(mask, LOOP_DOWNSAMPLE_FACTOR)
    if (maskArea(smallMask) < 4) {
      throw new Error(`降到 1/${LOOP_DOWNSAMPLE_FACTOR} 后掩膜里几乎没有前景像素（角色太小）：换 mask:"none" 再扫`)
    }

    // ③ 自相关（1×/4 分辨率）
    const range = scanRangeFor(n, fps, params.minPeriodSec ?? 2)
    warnings.push(...range.warnings)
    const curve = autocorrelation(small, smallMask, { lo: range.lo, hi: range.hi })
    const pick = pickPeriod(curve)

    // ④ 全分辨率复核：只在最优 L 与 L±1 上算，精修一格
    const pixelsOf = async (index: number): Promise<RgbaImage> => {
      const hit = kept.get(index)
      if (hit) return hit
      const img = await readFramePixels({ frame: index, source: params.source })
      kept.set(index, img)
      return img
    }
    const scoreAt = async (L: number): Promise<number> => {
      const pairs = Math.max(1, Math.min(LOOP_VERIFY_PAIRS, n - L))
      let sum = 0
      for (let i = 0; i < pairs; i++) sum += frameDiff(await pixelsOf(i), await pixelsOf(i + L), mask)
      return sum / pairs
    }
    let periodFrames = pick.L
    let fullScore = await scoreAt(periodFrames)
    for (const neighbor of [pick.L - 1, pick.L + 1]) {
      if (neighbor < range.lo || neighbor > range.hi) continue
      const score = await scoreAt(neighbor)
      if (score < fullScore) {
        periodFrames = neighbor
        fullScore = score
      }
    }
    if (periodFrames !== pick.L) {
      warnings.push(
        `全分辨率复核把周期从 L=${pick.L}（1/${LOOP_DOWNSAMPLE_FACTOR} 分辨率上的最优）改成 L=${periodFrames}：降采样量化误差`,
      )
    }

    // ④.1 下限过滤 → 倍数误判（2026-11-13 实测：真周期 1.17s，默认 minPeriodSec=2 把它挡在门外，报成 2 倍）
    //     只在"候选被下界挡住"时补算，代价是多几次全分辨率 frameDiff，值得。
    for (const divisor of [2, 3]) {
      const candidate = Math.round(periodFrames / divisor)
      if (candidate < 2 || candidate >= range.lo) continue
      const candidateScore = await scoreAt(candidate)
      const suspect = multipleSuspectWarning(periodFrames, fullScore, divisor, candidateScore, range.lo, fps)
      if (suspect) {
        warnings.push(suspect)
        break
      }
    }

    // ⑤ 闭合度（全分辨率）：末帧 vs 首帧 ÷ 相邻帧平均差
    let adjacentSum = 0
    const adjPairs = Math.max(1, Math.min(LOOP_VERIFY_PAIRS, n - 1))
    for (let i = 0; i < adjPairs; i++) adjacentSum += frameDiff(await pixelsOf(i), await pixelsOf(i + 1), mask)
    const adjacent = adjacentSum / adjPairs
    if (adjacent <= 0) {
      // 相邻帧逐像素完全相同 = 静止画面：任何 L 的分数都会是 0，报"周期 6 帧"就是假答案。
      throw new Error(
        '掩膜内相邻帧逐像素完全相同（静止画面）：量不出周期，别按循环处理。确认视频里角色真的在动，或换 mask:"none" 重扫',
      )
    }
    const firstLast = frameDiff(await pixelsOf(n - 1), await pixelsOf(0), mask)
    const closureScore = round4(firstLast / adjacent)

    const suggested = suggestFps(periodFrames, fps, params.targetMultiples ?? [24, 48])
    if (pick.confidence === 'low' && pick.reason) warnings.push(pick.reason)
    const scoreCurve = [...curve]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map((point) => ({ frames: point.L, score: point.score }))
    return {
      ok: true,
      periodFrames,
      periodSec: round4(periodFrames / fps),
      suggestedFps: suggested.fps,
      targetFrames: suggested.targetFrames,
      scoreCurve,
      closureScore,
      confidence: pick.confidence,
      ...(pick.reason ? { reason: pick.reason } : {}),
      warnings,
      scanned: {
        frames: n,
        fps,
        mask: maskMode,
        source: params.source,
        downsample: LOOP_DOWNSAMPLE_FACTOR,
        candidates: curve.length,
        range: { lo: range.lo, hi: range.hi },
      },
      elapsedMs: Date.now() - startedAt,
    }
  }

  /**
   * `sprite_prepare({loop})` 的真实流程：预采样 → 测周期 → 按新采样率**重新精确抽 T 帧**。
   *
   * 不传 loop 的路径一个字节都不走这里（向后兼容）。三条硬边界：
   * - 周期判不清（confidence low）就**不重采**并报错——曲线平缓代表"这不是循环动作"，
   *   硬截会把它剪成半截（方法论 §4.4）；
   * - 重采后帧数必须**正好等于 T**，不等就报错（周期/采样率算错了，静默交付比失败更糟）；
   * - 重采后要验闭合度：首尾差要与相邻帧差同量级。
   */
  const prepareLooped = async (params: {
    video: string
    transport: 'http' | 'base64'
    start: number
    end: number
    preFps: number
    loop: { targetFrames?: number; minPeriodSec?: number; targetMultiples?: number[]; mask?: 'body-core' | 'none' }
  }): Promise<PrepareResult> => {
    const warnings: string[] = []
    // ① 预采样（只用来测周期，不交付）
    const preRange = await bridge<{ ok: boolean; start: number; end: number; fps: number }>(
      'setRange',
      params.start,
      params.end,
      params.preFps,
    )
    const start = Number(preRange?.start ?? params.start)
    const end = Number(preRange?.end ?? params.end)
    const preFps = Number(preRange?.fps ?? params.preFps)
    if (Math.abs(end - start) < 2) {
      warnings.push(`预采样区间只有 ${round4(Math.abs(end - start))}s（<2 秒）：周期可能量不准，建议给更大的 end`)
    }
    const pre = await bridge<{ ok: boolean; count?: number; width?: number; height?: number }>('extract')
    const preFrames = Number(pre.count ?? 0)
    let width = Number(pre.width ?? 0)
    let height = Number(pre.height ?? 0)
    if (preFrames <= 0) throw new Error('预采样抽帧结果是 0 帧：检查 start/end 与 fps')
    if (preFrames < 24) {
      throw new Error(
        `预采样只有 ${preFrames} 帧（<24）：循环闭合至少要 2 秒 × 12fps。把 end-start 拉长到 ≥2 秒，或把 fps 提到 12 以上再来`,
      )
    }
    lastPrepare = { frames: preFrames, width, height, fps: preFps }
    framesLost = false

    // ② 测周期
    const keyed = await keytedParamsOf()
    const scan = await loopScanOf({
      fps: preFps,
      frames: preFrames,
      source: keyed.keyedCount > 0 ? 'keyed' : 'raw',
      ...(params.loop.mask ? { mask: params.loop.mask } : {}),
      ...(typeof params.loop.minPeriodSec === 'number' ? { minPeriodSec: params.loop.minPeriodSec } : {}),
      ...(Array.isArray(params.loop.targetMultiples) ? { targetMultiples: params.loop.targetMultiples } : {}),
    })
    warnings.push(...scan.warnings)
    if (scan.confidence === 'low') {
      throw new Error(
        `周期不清晰，没有按周期重采（${scan.reason ?? '自相关曲线平缓'}）。` +
          '这段动画更适合当一次性动作：去掉 loop 重新 sprite_prepare；确认它确实循环就调小 loop.minPeriodSec 再试',
      )
    }

    // ③ 定目标帧数 → 反推采样率（P = L / preFps，fps_new = T / P）
    const multiples = Array.isArray(params.loop.targetMultiples) ? params.loop.targetMultiples : [24, 48]
    let targetFrames = scan.targetFrames
    if (params.loop.targetFrames !== undefined) {
      const wanted = Math.floor(Number(params.loop.targetFrames))
      if (!Number.isFinite(wanted) || wanted < 2) {
        throw new Error(`loop.targetFrames 必须是 ≥2 的整数（收到 ${String(params.loop.targetFrames)}）`)
      }
      targetFrames = wanted
      if (!multiples.includes(wanted)) {
        warnings.push(
          `loop.targetFrames=${wanted} 不在候选 ${JSON.stringify(multiples)} 里：能交付，但 8×6=48 / 8×3=24 这类网格会多出空位`,
        )
      }
    }
    const fpsNew = round4(targetFrames / scan.periodSec)
    const loopEnd = round4(start + scan.periodSec)
    if (loopEnd > end + 1e-6) {
      warnings.push(`周期 ${scan.periodSec}s 超出预采样区间 ${start}→${end}s：重采会用到区间外的画面（到片尾会被夹短）`)
    }

    // ④ 按新采样率重新精确抽 T 帧
    await bridge('setRange', start, loopEnd, fpsNew)
    const re = await bridge<{ ok: boolean; count?: number; width?: number; height?: number }>('extract')
    const frames = Number(re.count ?? 0)
    width = Number(re.width ?? width)
    height = Number(re.height ?? height)
    lastPrepare = { frames, width, height, fps: fpsNew, looped: true }
    framesLost = false
    if (frames !== targetFrames) {
      throw new Error(
        `按周期重采后应是 ${targetFrames} 帧，实际抽到 ${frames} 帧（周期 ${scan.periodSec}s → ${fpsNew}fps，区间 ${start}→${loopEnd}s）：` +
          '周期或采样率算错了（片尾夹短 / 帧率取整），别拿这批帧交付',
      )
    }

    // ⑤ 闭合度：首尾差要与相邻帧差同量级
    let firstFrame: RgbaImage | undefined
    let prev: RgbaImage | undefined
    let lastFrame: RgbaImage | undefined
    let maskImage: ReturnType<typeof fullMask> | undefined
    let adjacentSum = 0
    let adjPairs = 0
    for (let i = 0; i < frames; i++) {
      const img = await readFramePixels({ frame: i, source: 'raw' })
      if (!firstFrame) {
        firstFrame = img
        maskImage = params.loop.mask === 'none' ? fullMask(img.width, img.height) : bodyCoreMask(img)
        if (maskImage && maskArea(maskImage) < 16) {
          maskImage = fullMask(img.width, img.height)
          warnings.push('body-core 掩膜几乎是空的（还没抠图），闭合度改成整幅算')
        }
      }
      if (prev && maskImage) {
        adjacentSum += frameDiff(prev, img, maskImage)
        adjPairs++
      }
      prev = img
      lastFrame = img
    }
    const adjacent = adjPairs > 0 ? adjacentSum / adjPairs : 0
    const firstLast = lastFrame && firstFrame && maskImage ? frameDiff(lastFrame, firstFrame, maskImage) : 0
    const closure = closureOf(firstLast, adjacent)
    if (!closure.ok) {
      warnings.push(`首尾差 ${closure.firstLastDiff} 与相邻帧差 ${closure.adjacentDiff} 不同量级，循环没闭合`)
    }
    return {
      ok: true,
      frames,
      width,
      height,
      video: params.video,
      transport: params.transport,
      fps: fpsNew,
      periodSec: scan.periodSec,
      loopClosed: closure.ok,
      loop: {
        periodFrames: scan.periodFrames,
        targetFrames,
        suggestedFps: scan.suggestedFps,
        confidence: scan.confidence,
        closure,
      },
      warnings,
    }
  }

  return {
    get busy() {
      return session !== undefined
    },

    async prepare(args) {
      const videoPath = String(args.videoPath ?? '').trim()
      if (videoPath === '') throw new Error('需要视频的绝对路径（videoPath）')
      const stat = statSync(videoPath)
      if (stat.size === 0) throw new Error(`视频文件是空的：${videoPath}`)
      if (stat.size > MAX_VIDEO_BYTES) throw new Error(`视频太大（>200MB），先裁一段再来：${videoPath}`)
      await ensureSession()
      // 优先 http 直传：base64 走 CDP 时 2.5MB 的素材要额外 20 秒上下，纯浪费。
      let loaded: LoadedVideo
      let transport: 'http' | 'base64' = 'http'
      if (await hasBridge('loadVideoUrl')) {
        const token = randomBytes(9).toString('hex')
        videos.set(token, videoPath)
        try {
          loaded = await bridge<LoadedVideo>('loadVideoUrl', `${toolOrigin}${VIDEO_ROUTE}${token}`, path.basename(videoPath))
        } finally {
          // 页面已经把文件读进内存了，入口立刻作废（服务仍在，但这条 token 不再可用）。
          setTimeout(() => videos.delete(token), 5_000)
        }
        if (loaded.ok !== true) {
          // 直传失败就退回 base64——宁可慢一点，也别把上一步弄成一个死路。
          transport = 'base64'
          loaded = await bridge<LoadedVideo>(
            'loadVideoBase64',
            readFileSync(videoPath).toString('base64'),
            path.basename(videoPath),
          )
        }
      } else {
        transport = 'base64'
        loaded = await bridge<LoadedVideo>(
          'loadVideoBase64',
          readFileSync(videoPath).toString('base64'),
          path.basename(videoPath),
        )
      }
      if (loaded.ok !== true) throw new Error(loaded.error ?? '视频没能载入页面')
      // `loop` 是显式开关：传了就走"预采样 → 测周期 → 按周期重采"那条路，不传则**一字不变**。
      if (args.loop !== undefined) {
        return await prepareLooped({
          video: String(loaded.name ?? path.basename(videoPath)),
          transport,
          start: args.start ?? 0,
          end: args.end ?? 4,
          preFps: args.fps ?? 12,
          loop: args.loop ?? {},
        })
      }
      const fpsUsed = args.fps ?? 12
      await bridge('setRange', args.start ?? 0, args.end ?? 4, fpsUsed)
      const extracted = await bridge<{ ok: boolean; count?: number; width?: number; height?: number }>('extract')
      const frames = Number(extracted.count ?? 0)
      const width = Number(extracted.width ?? 0)
      const height = Number(extracted.height ?? 0)
      if (frames <= 0) throw new Error('抽帧结果是 0 帧：检查时间区间（start/end）与 fps')
      lastPrepare = { frames, width, height, fps: fpsUsed }
      // 这一段有了新帧，"已回收"的判定自然失效。
      framesLost = false
      return { ok: true, frames, width, height, video: String(loaded.name ?? path.basename(videoPath)), transport }
    },

    async loopScan(args) {
      const prepared = lastPrepare
      if (!prepared) {
        throw new Error('还没有帧：先 sprite_prepare（12fps、≥24 帧）再扫周期')
      }
      const extraWarnings: string[] = []
      if (typeof args.preFps === 'number' && Math.abs(args.preFps - prepared.fps) > 0.01) {
        // 帧就是按会话当前 fps 抽出来的，"预采样帧率"以会话为准；传别的值只会把 fps 建议带偏。
        extraWarnings.push(
          `preFps=${args.preFps} 与会话实际 fps=${prepared.fps} 不一致：周期换算一律用会话实际帧率（帧就是按它抽的）`,
        )
      }
      const keyed = await keytedParamsOf()
      const result = await loopScanOf({
        fps: prepared.fps,
        frames: prepared.frames,
        source: keyed.keyedCount > 0 ? 'keyed' : 'raw',
        ...(args.mask === 'none' || args.mask === 'body-core' ? { mask: args.mask } : {}),
        ...(typeof args.minPeriodSec === 'number' ? { minPeriodSec: args.minPeriodSec } : {}),
        ...(Array.isArray(args.targetMultiples) ? { targetMultiples: args.targetMultiples } : {}),
      })
      return extraWarnings.length > 0 ? { ...result, warnings: [...extraWarnings, ...result.warnings] } : result
    },

    async probeColor(args) {
      const answer = await bridge<ProbeColorResult>('probeColor', {
        ...(typeof args.frame === 'number' ? { frame: args.frame } : {}),
        ...(typeof args.bandPx === 'number' ? { bandPx: args.bandPx } : {}),
      })
      return answer
    },

    async keyPreview(args) {
      const frame = Math.max(0, Math.floor(args.frame ?? 0))
      const params: KeyParams = { ...args }
      delete (params as { frame?: number }).frame
      await bridge('setKeyParams', params)
      const preview = await bridge<{ ok: boolean; dataURL?: string }>('keyPreview', frame)
      const buffer = dataUrlToBuffer(preview.dataURL)
      if (!buffer) throw new Error('页面没返回预览图（dataURL 为空）')
      const dir = outDirOf()
      const previewPath = path.join(dir, `preview-${frame}.png`)
      writeFileSync(previewPath, buffer)
      let maskPath: string | undefined
      try {
        const mask = await bridge<{ ok: boolean; dataURL?: string }>('maskDataURL', frame)
        const maskBuffer = dataUrlToBuffer(mask.dataURL)
        if (maskBuffer) {
          maskPath = path.join(dir, `mask-${frame}.png`)
          writeFileSync(maskPath, maskBuffer)
        }
      } catch {
        /* 蒙版是增强项：拿不到不影响判定 */
      }
      const after = await keytedParamsOf()
      return {
        ok: true,
        frame,
        stats: analyzeSpritePng(buffer),
        previewPath,
        ...(maskPath ? { maskPath } : {}),
        ...(after.params ? { appliedParams: after.params } : {}),
        // preview 之后 keyed 缓存必然被清（P2），这里说清楚，免得调用方以为还能直接 export。
        ignored: [],
      }
    },

    async keyApply(args) {
      const params: KeyParams = { ...args }
      delete (params as { indices?: number[] }).indices
      delete (params as { probeFrames?: number }).probeFrames
      await bridge('setKeyParams', params)
      const applied = await bridge<{ ok: boolean; frames?: number; plateApplied?: boolean; autoEnabled?: boolean }>(
        'keyApply',
        args.indices ?? null,
      )
      const frames = Number(applied.frames ?? 0)
      const state = await keytedParamsOf()
      if (state.keyedCount === 0) {
        throw new Error('keyApply 跑完但抠图缓存是空的——页面那边出了问题，先别 export')
      }
      const sampled = await worstOf(frames, args.probeFrames ?? 8)
      const warnings: string[] = []
      if (applied.autoEnabled === true) warnings.push('抠图原本没启用，已自动启用（否则拼图会用原帧）')
      if (sampled.border) {
        const edgeWarning = borderOpaqueWarning(sampled.border, sampled.border.frame)
        if (edgeWarning) warnings.push(edgeWarning)
      }
      return {
        ok: true,
        frames,
        plateApplied: applied.plateApplied === true,
        keyedCount: state.keyedCount,
        ...(sampled.stats ? { stats: sampled.stats } : {}),
        ...(sampled.worst ? { worst: sampled.worst } : {}),
        ...(state.params ? { appliedParams: state.params } : {}),
        ignored: [],
        warnings,
      }
    },

    async measure(args) {
      const frame = args.frame === 'all' ? 'all' : Math.max(0, Math.floor(args.frame ?? 0))
      const answer = await bridge<MeasureResult>('measure', {
        frame,
        ...(args.source ? { source: args.source } : {}),
        ...(typeof args.alphaThreshold === 'number' ? { alphaThreshold: args.alphaThreshold } : {}),
        ...(Array.isArray(args.landmarks) ? { landmarks: args.landmarks } : {}),
      })
      let overlayPath: string | undefined
      if (args.overlay !== false) {
        try {
          const lines: Array<{ x0: number; y0: number; x1: number; y1: number; color?: string; label?: string }> = []
          const box = answer.alphaBBox
          if (box) {
            lines.push(
              { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y0, color: '#ff0000', label: 'top' },
              { x0: box.x0, y0: box.y1 - 1, x1: box.x1, y1: box.y1 - 1, color: '#00aaff', label: 'sole' },
              { x0: box.x0, y0: box.y0, x1: box.x0, y1: box.y1, color: '#00ff88' },
              { x0: box.x1 - 1, y0: box.y0, x1: box.x1 - 1, y1: box.y1, color: '#00ff88' },
            )
          }
          for (const mark of answer.landmarks ?? []) {
            if (mark.px === null || mark.py === null) continue
            lines.push({ x0: mark.px - 8, y0: mark.py, x1: mark.px + 8, y1: mark.py, color: '#ffcc00' })
            lines.push({ x0: mark.px, y0: mark.py - 8, x1: mark.px, y1: mark.py + 8, color: '#ffcc00' })
          }
          const texts = [
            {
              x: 8,
              y: 8,
              text: box
                ? `bbox=${box.x0},${box.y0},${box.x1 - box.x0}x${box.y1 - box.y0} h=${answer.contentHeight}`
                : 'bbox=null',
              color: '#ffffff',
            },
          ]
          const overlay = await bridge<{ ok: boolean; dataURL?: string }>('overlay', {
            frame: typeof frame === 'number' ? frame : 0,
            lines,
            texts,
          })
          const dir = debugDirOf()
          overlayPath = path.join(dir, `measure-${typeof frame === 'number' ? frame : 'all'}-${Date.now()}.png`)
          writeDataUrl(overlay.dataURL, overlayPath)
        } catch {
          /* 核对图是增强项 */
        }
      }
      return { ...answer, ...(overlayPath ? { overlayPath } : {}) }
    },

    async verify(args) {
      const metas: VerifyMeta[] = Array.isArray(args.metas) ? [...args.metas] : []
      for (const raw of Array.isArray(args.paths) ? args.paths : []) {
        const target = String(raw ?? '').trim()
        if (!target) continue
        const abs = path.isAbsolute(target) ? target : path.join(outDirOf(), target)
        let stat
        try {
          stat = statSync(abs)
        } catch {
          throw new Error(`找不到这个路径：${abs}`)
        }
        // 目录：把里面的 *.json 全当 meta 读（按文件名排序，结论可复现）
        const files = stat.isDirectory()
          ? readdirSync(abs)
              .filter((name) => name.toLowerCase().endsWith('.json'))
              .sort()
              .map((name) => path.join(abs, name))
          : [abs]
        if (files.length === 0) throw new Error(`这个目录里没有 .json：${abs}`)
        for (const file of files) {
          let parsed: unknown
          try {
            parsed = JSON.parse(readFileSync(file, 'utf8'))
          } catch (error) {
            throw new Error(`读不了 meta（${file}）：${String((error as Error)?.message ?? error).slice(0, 120)}`)
          }
          if (!parsed || typeof parsed !== 'object') throw new Error(`这个文件不是 meta 对象：${file}`)
          metas.push(parsed as VerifyMeta)
        }
      }
      if (metas.length === 0) throw new Error('需要 metas（直接给）或 paths（meta.json 或目录）')
      return verifyConsistency(metas, {
        ...(typeof args.referenceCharHeight === 'number' ? { referenceCharHeight: args.referenceCharHeight } : {}),
        ...(typeof args.heightPct === 'number' ? { heightPct: args.heightPct } : {}),
        ...(typeof args.anchorPx === 'number' ? { anchorPx: args.anchorPx } : {}),
      })
    },

    async baseline(args) {
      const raw = Array.isArray(args?.paths) ? args.paths : []
      const wanted = raw.map((one) => String(one ?? '').trim()).filter((one) => one !== '')
      if (wanted.length === 0) throw new Error('需要 paths：至少一张图集路径（同目录还要有配套的 meta.json）')
      const cellIndexWanted = Math.max(0, Math.floor(Number(args.cellIndex ?? 0)))
      const inputs: BaselineCellInput[] = []
      const resolved: string[] = []
      const warnings: string[] = []
      for (const target of wanted) {
        const abs = path.isAbsolute(target) ? target : path.join(outDirOf(), target)
        if (!existsSync(abs)) throw new Error(`找不到这张图集：${abs}`)
        let decoded
        try {
          decoded = decodePng(readFileSync(abs))
        } catch (error) {
          throw new Error(`读不了这张图集（${abs}）：${String((error as Error)?.message ?? error).slice(0, 150)}`)
        }
        const candidates = metaPathCandidates(abs)
        const metaFile = candidates.find((file) => existsSync(file))
        if (!metaFile) {
          // 没有 meta 就没法知道锚点在哪——猜一个只会把整张准绳图对歪，宁可报错。
          throw new Error(`找不到同名 meta.json：${candidates.join(' / ')}（准绳图要靠它拿 anchorX/anchorY/cellWidth/cellHeight，不许猜）`)
        }
        let meta: Record<string, unknown>
        try {
          const parsed: unknown = JSON.parse(readFileSync(metaFile, 'utf8'))
          if (!parsed || typeof parsed !== 'object') throw new Error('不是对象')
          meta = parsed as Record<string, unknown>
        } catch (error) {
          throw new Error(`读不了 meta（${metaFile}）：${String((error as Error)?.message ?? error).slice(0, 150)}`)
        }
        const numberOr = (key: string): number => {
          const value = Number(meta[key])
          return Number.isFinite(value) ? value : Number.NaN
        }
        const cellWidth = numberOr('cellWidth')
        const cellHeight = numberOr('cellHeight')
        const anchorX = numberOr('anchorX')
        const metaAnchorY = numberOr('anchorY')
        const missing: string[] = []
        if (!(cellWidth > 0)) missing.push('cellWidth')
        if (!(cellHeight > 0)) missing.push('cellHeight')
        if (!(anchorX >= 0 && anchorX <= 1)) missing.push('anchorX(0~1)')
        if (!(metaAnchorY >= 0 && metaAnchorY <= 1)) missing.push('anchorY(0~1)')
        if (missing.length > 0) {
          throw new Error(`meta 里缺 ${missing.join('/')}：${metaFile}（老产物？重新 export 一次，或手工补上再跑准绳图）`)
        }
        // 锚点口径：meta 里 anchorY 一律 y-from-bottom；万一写的是 y-from-top，这里翻过来（口径不一致会把线对歪）。
        const convention = typeof meta.anchorConvention === 'string' ? meta.anchorConvention : 'y-from-bottom'
        const anchorY = convention === 'y-from-top' ? 1 - metaAnchorY : metaAnchorY
        if (convention !== 'y-from-bottom' && convention !== 'y-from-top') {
          warnings.push(`${path.basename(abs)} 的 anchorConvention 是「${convention}」，按 y-from-bottom 处理`)
        }
        const cols = Number(meta.cols) > 0 ? Math.floor(Number(meta.cols)) : Math.max(1, Math.round(decoded.width / cellWidth))
        const rows = Number(meta.rows) > 0 ? Math.floor(Number(meta.rows)) : Math.max(1, Math.round(decoded.height / cellHeight))
        if (cellIndexWanted >= cols * rows) {
          throw new Error(
            `cellIndex=${cellIndexWanted} 超出网格（${path.basename(abs)} 是 ${cols}×${rows}，最大序号 ${cols * rows - 1}）`,
          )
        }
        const name = typeof meta.name === 'string' && meta.name.trim() !== '' ? meta.name.trim() : path.basename(abs, path.extname(abs))
        inputs.push({
          name,
          image: { width: decoded.width, height: decoded.height, rgba: decoded.rgba },
          cellIndex: cellIndexWanted,
          cols,
          cellWidth,
          cellHeight,
          anchorX,
          anchorY,
        })
        resolved.push(abs)
      }
      const composed = composeBaseline(inputs, {
        ...(typeof args.gap === 'number' ? { gap: args.gap } : {}),
        ...(typeof args.background === 'string' && args.background.trim() !== '' ? { background: args.background.trim() } : {}),
        ...(typeof args.padding === 'number' ? { padding: args.padding } : {}),
      })
      warnings.push(...composed.warnings)
      const root = typeof args.outDir === 'string' && args.outDir.trim() !== '' ? args.outDir.trim() : commonParentDir(resolved)
      const debugDir = path.join(root, '_debug')
      mkdirSync(debugDir, { recursive: true })
      const outPath = path.join(debugDir, `baseline-${Date.now()}.png`)
      writeFileSync(outPath, encodePng(composed.image))
      return {
        ok: true,
        path: outPath,
        width: composed.width,
        height: composed.height,
        baselineY: composed.baselineY,
        headTopY: composed.headTopY,
        items: composed.items,
        warnings,
      }
    },

    async match(args) {
      if (!args.templateRect || typeof args.templateRect !== 'object') {
        throw new Error('需要 templateRect（模板矩形，源帧像素 {x,y,w,h}）')
      }
      const source: 'keyed' | 'raw' = args.source === 'raw' ? 'raw' : 'keyed'
      const templateFrame = Math.max(0, Math.floor(Number(args.templateFrame ?? args.inFrame ?? 0)))
      const inFrame = Math.max(0, Math.floor(Number(args.inFrame ?? templateFrame)))
      const cache = new Map<string, RgbaImage>()
      const templatePixels = await readFramePixels({ frame: templateFrame, source }, cache)
      // 先按模板帧裁出模板（越界会带中文原因抛错），再拿到目标帧上搜。
      const template = cropRgba(templatePixels, args.templateRect)
      const imagePixels =
        inFrame === templateFrame ? templatePixels : await readFramePixels({ frame: inFrame, source }, cache)
      return matchTemplate(imagePixels, template, {
        ...(args.searchRect ? { searchRect: args.searchRect } : {}),
        ...(typeof args.minScore === 'number' ? { minScore: args.minScore } : {}),
      })
    },

    async featureFit(args) {
      const specs = Array.isArray(args.templates) ? args.templates : []
      if (specs.length === 0) {
        throw new Error('需要 templates：至少 1 个特征模板 {rect:{x,y,w,h}}（建议 2 个——单模板只能定平移）')
      }
      const templateSpecs = specs.map((one, index) => {
        if (!one || typeof one !== 'object' || !one.rect) throw new Error(`templates[${index}] 缺 rect`)
        return { rect: one.rect, ...(typeof one.weight === 'number' ? { weight: one.weight } : {}) }
      })
      const source: 'keyed' | 'raw' = args.source === 'raw' ? 'raw' : 'keyed'
      const cache = new Map<string, RgbaImage>()
      const ref = await referenceImageOf(args.reference, source, cache)
      const picked = framesOf(args.search?.frames ?? 'all', frameLimitFor(ref.image.width, ref.image.height))
      const warnings = [...picked.warnings]
      let best: { frame: number; fit: FeatureFrameFit; width: number; height: number } | undefined
      let seed: { scale: number; positions: Array<{ x: number; y: number }> } | undefined
      const failed: string[] = []
      for (const frame of picked.frames) {
        let pixels: RgbaImage
        try {
          pixels = await readFramePixels({ frame, source }, cache)
        } catch (error) {
          failed.push(`第 ${frame} 帧读不到：${String((error as Error)?.message ?? error).slice(0, 100)}`)
          continue
        }
        let fit: FeatureFrameFit
        try {
          fit = fitFeatureFrame(ref.image, pixels, {
            templates: templateSpecs,
            ...(args.search?.scale ? { scale: args.search.scale } : {}),
            ...(seed ? { seed } : {}),
          })
        } catch (error) {
          failed.push(`第 ${frame} 帧算不出：${String((error as Error)?.message ?? error).slice(0, 100)}`)
          cache.clear()
          continue
        }
        seed = { scale: fit.scale, positions: fit.perTemplate.map((one) => ({ x: one.x, y: one.y })) }
        if (!best || fit.score > best.fit.score) best = { frame, fit, width: pixels.width, height: pixels.height }
        // 逐帧放掉像素：24 帧 RGBA 一次全端着是 67MB，没必要。
        cache.clear()
      }
      if (!best) {
        throw new Error(`没有任何一帧能算特征匹配：${failed.slice(0, 3).join('；') || '全部帧都读不到'}`)
      }
      if (failed.length > 0) warnings.push(`${failed.length} 帧没算出来，已跳过（首条：${failed[0]}）`)
      const graded = featureConfidence(best.fit.score, best.fit.residualPx)
      const transferredAnchor: TransferredAnchor | undefined = wantsAnchor(args)
        ? {
            ...transferAnchor({
              anchorX: args.anchorX ?? 0.5,
              anchorY: args.anchorY ?? 0.5,
              refWidth: ref.image.width,
              refHeight: ref.image.height,
              scale: best.fit.scale,
              dx: best.fit.dx,
              dy: best.fit.dy,
              width: best.width,
              height: best.height,
            }),
            anchorSource: 'feature',
          }
        : undefined
      return {
        frame: best.frame,
        scale: best.fit.scale,
        dx: best.fit.dx,
        dy: best.fit.dy,
        score: best.fit.score,
        residualPx: best.fit.residualPx,
        ...(transferredAnchor ? { transferredAnchor } : {}),
        perTemplate: best.fit.perTemplate,
        confidence: graded.confidence,
        ...(graded.reason ? { reason: graded.reason } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      }
    },

    async silhouetteFit(args) {
      const source: 'keyed' | 'raw' = args.source === 'raw' ? 'raw' : 'keyed'
      const cache = new Map<string, RgbaImage>()
      const ref = await referenceImageOf(args.reference, source, cache)
      const picked = framesOf(args.target?.frames ?? 'all', frameLimitFor(ref.image.width, ref.image.height))
      const warnings = [...picked.warnings]
      const mask = args.mask === 'raw' ? 'raw' : 'body-core'
      let best: { frame: number; fit: ReturnType<typeof fitSilhouetteFrame>; width: number; height: number } | undefined
      const failed: string[] = []
      for (const frame of picked.frames) {
        let pixels: RgbaImage
        try {
          pixels = await readFramePixels({ frame, source }, cache)
        } catch (error) {
          failed.push(`第 ${frame} 帧读不到：${String((error as Error)?.message ?? error).slice(0, 100)}`)
          continue
        }
        let fit: ReturnType<typeof fitSilhouetteFrame>
        try {
          fit = fitSilhouetteFrame(ref.image, pixels, {
            mask,
            ...(args.search?.scale ? { scale: args.search.scale } : {}),
            ...(typeof args.alphaThreshold === 'number' ? { alphaThreshold: args.alphaThreshold } : {}),
          })
        } catch (error) {
          failed.push(`第 ${frame} 帧算不出：${String((error as Error)?.message ?? error).slice(0, 100)}`)
          cache.clear()
          continue
        }
        if (fit.reason) {
          failed.push(`第 ${frame} 帧：${fit.reason}`)
          cache.clear()
          continue
        }
        if (!best || fit.iou > best.fit.iou) best = { frame, fit, width: pixels.width, height: pixels.height }
        cache.clear()
      }
      if (!best) {
        throw new Error(`没有任何一帧能算剪影拟合：${failed.slice(0, 3).join('；') || '全部帧都读不到'}`)
      }
      if (failed.length > 0) warnings.push(`${failed.length} 帧没算出来，已跳过（首条：${failed[0]}）`)
      const graded = silhouetteConfidence(best.fit.iou)
      // 中间档只采用 scale：锚点标 semantic-required（调用方必须走语义点）；低档直接不给锚点。
      const transferredAnchor: TransferredAnchor | null =
        graded.anchorSource !== null && wantsAnchor(args)
          ? {
              ...transferAnchor({
                anchorX: args.anchorX ?? 0.5,
                anchorY: args.anchorY ?? 0.5,
                refWidth: ref.image.width,
                refHeight: ref.image.height,
                scale: best.fit.scale,
                dx: best.fit.dx,
                dy: best.fit.dy,
                width: best.width,
                height: best.height,
              }),
              anchorSource: graded.anchorSource,
            }
          : null
      return {
        frame: best.frame,
        iou: best.fit.iou,
        scale: best.fit.scale,
        dx: best.fit.dx,
        dy: best.fit.dy,
        transferredAnchor,
        confidence: graded.confidence,
        ...(graded.reason ? { reason: graded.reason } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      }
    },

    async scaleTo(args) {
      return bridge<ScaleResult>('scaleTo', {
        ...(typeof args.charHeightPx === 'number' ? { charHeightPx: args.charHeightPx } : {}),
        ...(typeof args.targetCellHeight === 'number' ? { targetCellHeight: args.targetCellHeight } : {}),
        ...(args.span ? { span: args.span } : {}),
      })
    },

    async getAnchor() {
      return bridge<AnchorInfo>('getAnchor')
    },

    async setAnchorPx(args) {
      return bridge<AnchorInfo>('setAnchorPx', {
        ...(typeof args.x === 'number' ? { x: args.x } : {}),
        ...(typeof args.y === 'number' ? { y: args.y } : {}),
        ...(args.convention ? { convention: args.convention } : {}),
      })
    },

    async cleanup(args) {
      const trim: TrimOptions = args.trim ?? {}
      // 水印：auto 时先检测再套用（B7）；显式矩形直接用；null/缺省 = 不遮。
      let rect: Rect | null = null
      const warnings: string[] = []
      // 所有候选都回给调用方（不只是被选中的那个）：置信度低不等于"不存在"，
      // 人/agent 看到 0.72 的候选时还能自己决定要不要手动给矩形。
      let watermarkCandidates: WatermarkCandidate[] | undefined
      if (args.maskRect === 'auto') {
        // maskMode 只影响页面的检测策略：auto = 严格判据优先、判不出高置信才四角兜底；
        // corner = 跳过严格判据直接兜底（P1-4 的退路）。
        const maskMode = args.maskMode === 'corner' ? 'corner' : 'auto'
        const detected = await bridge<{
          ok: boolean
          rects?: WatermarkCandidate[]
          note?: string
          warnings?: string[]
          selectedCount?: number
        }>('detectWatermark', { mode: maskMode })
        watermarkCandidates = detected.rects ?? []
        // 只有 selected !== false 的才参与自动选中：页面会把"被过滤掉/被同角挤掉"的候选也吐出来
        // 供人工参考，它们如果恰好稳定度高，不该把 maskRect 带偏（老行为只有 picked 参与）。
        const eligible = watermarkCandidates.filter((row) => row.selected !== false)
        const best = [...eligible]
          .filter((row) => (row.confidence ?? 0) >= WATERMARK_AUTO_CONFIDENCE)
          .sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]
        // 四角兜底：严格判据没给出高置信候选时才可能走到这里，置信度必然 < 门槛，
        // 所以只在没有高置信候选时用，并且一定要把"请人工确认"的理由带给调用方。
        const fallback = [...eligible]
          .filter((row) => row.source === 'corner')
          .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]
        if (best) rect = { x: best.x, y: best.y, w: best.w, h: best.h }
        else if (fallback) rect = { x: fallback.x, y: fallback.y, w: fallback.w, h: fallback.h }
        // 页面自己写的理由（兜底命中 / 兜底放弃 / 兜底未命中）优先；没有就退回老的那一句话。
        const pageWarnings = Array.isArray(detected.warnings) ? detected.warnings.filter((row) => typeof row === 'string') : []
        if (pageWarnings.length) warnings.push(...pageWarnings)
        else if (!rect) warnings.push(detected.note || '没检测到可信的水印区域，这次不做遮挡')
      } else if (args.maskRect && typeof args.maskRect === 'object') {
        rect = args.maskRect
      }
      await bridge('setMaskRect', rect)
      if (rect) await bridge('applyMask')
      const trimmed = await bridge<{
        ok: boolean
        box?: Rect | null
        mode?: 'union' | 'first-frame'
        pad?: { top: number; bottom: number; left: number; right: number }
        alphaThreshold?: number
        unionFrames?: number
      }>('trim', trim)
      if (trimmed.ok === true) await bridge('applyTrim')
      return {
        ok: true,
        maskRect: rect,
        ...(watermarkCandidates ? { watermarkCandidates } : {}),
        trimBox: trimmed.box ?? null,
        mode: trimmed.mode ?? (trim.mode ?? 'union'),
        pad: trimmed.pad ?? { top: 2, bottom: 2, left: 2, right: 2 },
        alphaThreshold: trimmed.alphaThreshold ?? trim.alphaThreshold ?? 32,
        unionFrames: trimmed.unionFrames ?? lastPrepare?.frames ?? 0,
        ...(warnings.length ? { warnings } : {}),
      } as CleanupResult & { warnings?: string[] }
    },

    async exportSheet(args) {
      const dir = outDirOf(args.outDir)
      const name = (args.name ?? 'sheet').replace(/[\\/:*?"<>|]/g, '_')
      const format = args.format === 'webp' ? 'webp' : 'png'
      // 网格：没给就按帧数推（48 帧 → 7×7；30 帧 → 6×5），给了就先验容量。
      const framesKnown = lastPrepare?.frames ?? 0
      // 48 帧沿用既有的 8×6（形象素材那套约定：正好 48 格，不留空）；其它帧数按 sqrt 推。
      const autoGrid = framesKnown === 48 ? { cols: 8, rows: 6 } : gridFor(framesKnown || 48)
      const cols = Math.max(1, Math.floor(args.cols ?? autoGrid.cols))
      const rows = Math.max(1, Math.floor(args.rows ?? autoGrid.rows))
      const gridWarnings =
        framesKnown > 0 ? checkGridCapacity(framesKnown, cols, rows).warnings : []
      // 1) 前置断言：没有抠图缓存就 export，会静默拼出原帧（绿底）——这是 P2 那个坑。
      const state = await keytedParamsOf()
      assertKeyedPresent(state.keyedCount)
      // 2) 反推缩放：优先"目标物理量"，其次旧语义（整格高）。
      const scaled = await bridge<ScaleResult>('scaleTo', {
        ...(typeof args.charHeightPx === 'number' ? { charHeightPx: args.charHeightPx } : {}),
        ...(typeof args.targetHeight === 'number' ? { targetCellHeight: args.targetHeight } : {}),
        ...(args.span ? { span: args.span } : {}),
      })
      // 归一化锚点先走 setAnchor（页面的 state.anchor 就是归一化的，按**输出格**算），
      // 不要拿原帧尺寸去换算成像素——裁剪之后帧变小了，那个换算会错。
      // 设完之后必须 getAnchor 回读：setAnchor 只回 {ok,x,y}，不是 AnchorInfo（P0-1）。
      const anchorOut = await resolveExportAnchor(bridge, args)
      const anchor = anchorOut.anchor
      const names = defaultFileNames({
        name,
        cols,
        rows,
        format,
        ...(args.fileName ? { fileName: args.fileName } : {}),
        ...(args.metaName ? { metaName: args.metaName } : {}),
      })
      const withExt = names.file
      const metaBase = names.meta
      const targetDir = args.dirPerAction === true ? path.join(dir, name) : dir
      mkdirSync(targetDir, { recursive: true })
      const pngPath = path.join(targetDir, withExt)
      const metaPath = path.join(targetDir, metaBase)
      if (args.overwrite === false) {
        if (existsSync(pngPath)) throw new Error(`目标文件已存在，且 overwrite=false：${pngPath}`)
        if (existsSync(metaPath)) throw new Error(`目标文件已存在，且 overwrite=false：${metaPath}`)
      }
      // 3) 拼图（format/quality 走页面编码，PNG 与 webp 同一条路径）。
      const built = await bridge<{
        ok: boolean
        dataURL?: string
        mime?: string
        meta?: Record<string, unknown>
        width?: number
        height?: number
      }>('buildSheetDataURL', {
        cols,
        rows,
        format,
        ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
      })
      const buffer = dataUrlToBuffer(built.dataURL)
      if (!buffer) throw new Error('页面没返回精灵图（dataURL 为空）')
      // 4) 后置断言：alpha 全不透 = 大概率退回了原帧（绿底）。
      const warnings: string[] = [...gridWarnings]
      if (format === 'png') assertNotOpaque(analyzeSpritePng(buffer))
      const tmpPng = `${pngPath}.tmp-${process.pid}`
      writeFileSync(tmpPng, buffer)
      renameSync(tmpPng, pngPath)
      // 格子尺寸从最终图集反推：图集一定是 cols×cellW 宽、rows×cellH 高。
      // 除不尽说明页面缩放时有亚像素漂移，按整数给并留一条 warning（宁可显式，不静默）。
      const sheetWidthOut = built.width ?? 0
      const sheetHeightOut = built.height ?? 0
      const cellWidthOut = sheetWidthOut > 0 ? Math.round(sheetWidthOut / cols) : null
      const cellHeightOut = sheetHeightOut > 0 ? Math.round(sheetHeightOut / rows) : null
      if (cellWidthOut !== null && cellWidthOut * cols !== sheetWidthOut) {
        warnings.push(
          `cellWidth*cols=${cellWidthOut * cols} 与图集宽 ${sheetWidthOut} 差 ${sheetWidthOut - cellWidthOut * cols}px（缩放取整）`,
        )
      }
      if (cellHeightOut !== null && cellHeightOut * rows !== sheetHeightOut) {
        warnings.push(
          `cellHeight*rows=${cellHeightOut * rows} 与图集高 ${sheetHeightOut} 差 ${sheetHeightOut - cellHeightOut * rows}px（缩放取整）`,
        )
      }
      // 4.5) **成品实测**：把"自己导出的这张图"解回来，按格切、量 alpha 包围盒、取中位数。
      //      achievedPx 只是参数回显（用户实测三次：回显 300，成品 382/341/303），
      //      这里量到的才是成品里角色真有高——两个数对不上就写进 warnings。
      let measured: SheetMeasurement | undefined
      let decodedSheet: ReturnType<typeof decodePng> | undefined
      if (format === 'png') {
        try {
          decodedSheet = decodePng(buffer)
          measured = measureSheet(
            { width: decodedSheet.width, height: decodedSheet.height, rgba: decodedSheet.rgba },
            {
              cols,
              rows,
              cellWidth: cellWidthOut ?? Math.max(1, Math.round(decodedSheet.width / cols)),
              cellHeight: cellHeightOut ?? Math.max(1, Math.round(decodedSheet.height / rows)),
            },
          )
          warnings.push(...measured.warnings)
          const mismatch = measuredMismatchWarning(scaled.achievedPx, measured.charHeightPx)
          if (mismatch) warnings.push(mismatch)
        } catch (error) {
          // 量不出就明说：不许让调用方以为"没有 measured 就是没问题"。
          warnings.push(
            `成品实测失败（${String((error as Error)?.message ?? error).slice(0, 120)}）：这张图没能自证，别只信 achievedPx`,
          )
        }
      } else {
        warnings.push('format=webp 解不回像素：这次没有 measured（成品实测），要验身高请用 png 导出')
      }
      // 4.55) 循环闭合校验：用**已经解好的图集格子**比首尾，不额外解码（D 的要求）。
      //       只对循环动作给——`loop:true` 显式声明，或这次会话是 prepare({loop}) 采出来的；
      //       一次性动作首尾本来就不该闭合，报了只会是噪音。
      let loopCheck: LoopClosureCheck | undefined
      const wantsLoopCheck = args.loop === true || lastPrepare?.looped === true
      if (wantsLoopCheck && format === 'png' && decodedSheet && cellWidthOut && cellHeightOut) {
        // 帧数塞不下网格时 checkGridCapacity 早就抛了；网格偏大时末尾是空格子，前 framesKnown 格才是帧。
        const cells = framesKnown
        if (cells >= 2) {
          try {
            const sheet = decodedSheet
            const cellMask: MaskImage = fullMask(cellWidthOut, cellHeightOut)
            const cellAt = (index: number): RgbaImage =>
              cropRgba(sheet, {
                x: (index % cols) * cellWidthOut,
                y: Math.floor(index / cols) * cellHeightOut,
                w: cellWidthOut,
                h: cellHeightOut,
              })
            let adjacentSum = 0
            for (let i = 0; i + 1 < cells; i++) adjacentSum += frameDiff(cellAt(i), cellAt(i + 1), cellMask)
            loopCheck = closureOf(frameDiff(cellAt(cells - 1), cellAt(0), cellMask), adjacentSum / (cells - 1))
            if (!loopCheck.ok) {
              warnings.push(
                `首尾差 ${loopCheck.firstLastDiff} 与相邻帧差 ${loopCheck.adjacentDiff} 不同量级，循环没闭合`,
              )
            }
          } catch (error) {
            // 算不出来就明说，别让调用方以为"没有 loopCheck 就是闭合了"。
            warnings.push(
              `循环闭合校验没算出来（${String((error as Error)?.message ?? error).slice(0, 120)}）：首尾接不接得上未经验证`,
            )
            loopCheck = undefined
          }
        }
      }
      const meta = buildExportMeta({
        built,
        name,
        format,
        cellWidth: cellWidthOut,
        cellHeight: cellHeightOut,
        anchor,
        anchorWritten: anchorOut.written,
        fps: lastPrepare?.fps ?? 12,
        scaled,
        appliedParams: state.params ?? null,
      })
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
      if (scaled.clamped) {
        warnings.push(
          `想要 ${args.charHeightPx ?? args.targetHeight ?? '?'}px，但工具缩放上限 300%，实际只有 ${scaled.achievedPx}px`,
        )
      }
      // 4.6) 核对图：在**成品副本**上逐格画实测头顶/脚底/锚点十字，异常格标黄。
      let overlayPath: string | undefined
      if (args.debugOverlay === true) {
        if (!measured || !decodedSheet) {
          warnings.push('debugOverlay 只在 png 导出时生效（webp 解不回像素），这次没出核对图')
        } else {
          try {
            const overlay = drawCellOverlay(decodedSheet, measured, { anchorX: anchor.anchorX, anchorY: anchor.anchorY })
            overlayPath = path.join(debugDirOf(args.outDir), `${name}-overlay.png`)
            writeFileSync(overlayPath, encodePng(overlay.image))
            if (measured.sampled) {
              warnings.push(`核对图只画了抽样的 ${measured.perCell.length} 格（共 ${measured.totalCells} 格）`)
            }
            if (overlay.flagged.length > 0) {
              warnings.push(
                `核对图里 ${overlay.flagged.length} 格身高偏离中位数 >5%，已标黄（第 ${overlay.flagged
                  .slice(0, 5)
                  .join('、')} 格）`,
              )
            }
          } catch (error) {
            warnings.push(`核对图没画出来：${String((error as Error)?.message ?? error).slice(0, 150)}`)
            overlayPath = undefined
          }
        }
      }
      let worst: WorstFrame | undefined
      if (format === 'png') {
        const stats = analyzeSpritePng(buffer)
        // 精灵图本身看不出裁掉后的主体质量，这里用第 0 帧的抠图结果做一次兜底采样。
        const sampled = await worstOf(lastPrepare?.frames ?? 1, 3)
        worst = sampled.worst
        void stats
      }
      return {
        ok: true,
        pngPath,
        metaPath,
        sheet: { width: built.width ?? 0, height: built.height ?? 0 },
        cell: { width: scaled.cellW, height: scaled.cellH },
        scale: scaled.scale,
        achievedPx: scaled.achievedPx,
        ...(scaled.auto ? {} : { charHeightPx: scaled.achievedPx }),
        ...(scaled.clamped ? { scaleClamped: true } : {}),
        format,
        bytes: buffer.byteLength,
        ...(worst ? { stats: { worst } } : {}),
        ...(measured ? { measured } : {}),
        ...(overlayPath ? { overlayPath } : {}),
        ...(loopCheck ? { loopCheck } : {}),
        reported: { meta },
        warnings,
      }
    },

    async autotune(args) {
      // 默认目标照评审文档 B9：`minSubjectCoverage` 取 **0.6** 而不是 0.98——
      // 人物是镂空形状，bbox 里天然有 30~40% 是空的；拿 0.98 当目标会让"已经完美"的参数被判未达标。
      const goal: AutotuneGoal = {
        maxBgResidual: args.goal?.maxBgResidual ?? 0.005,
        minSubjectCoverage: args.goal?.minSubjectCoverage ?? 0.6,
        maxEdgeGreen: args.goal?.maxEdgeGreen ?? 0.02,
      }
      const iters = Math.max(1, Math.min(12, args.maxIters ?? 6))
      const frame = Math.max(0, args.frame ?? 0)
      // 自动采色：键色错的话后面怎么调都没用（P3）。
      let params: KeyParams = {
        colorHex: (await this.probeColor({ frame })).keyColor,
        mode: args.space?.mode?.[0] ?? 'advanced',
        intensity: args.space?.intensity?.[0] ?? 60,
        softness: 60,
        despill: 70,
        greenToAlpha: 10,
        aggressive: true,
        autoPlate: false,
      }
      const trace: AutotuneTraceStep[] = []
      let stats: SpriteStats | undefined
      for (let round = 0; round < iters; round++) {
        const preview = await this.keyPreview({ ...params, frame })
        stats = preview.stats
        if (!stats) break
        trace.push({
          round,
          params: { ...params },
          bgResidual: stats.bgResidual,
          subjectCoverage: stats.subjectCoverage,
          edgeGreen: stats.edgeGreen,
        })
        const bgOk = stats.bgResidual <= (goal.maxBgResidual ?? 0.005)
        const covOk = stats.subjectCoverage >= (goal.minSubjectCoverage ?? 0.6)
        const edgeOk = stats.edgeGreen <= (goal.maxEdgeGreen ?? 0.02)
        if (bgOk && covOk && edgeOk) return { ok: true, params, trace, reachedGoal: true, ...(stats ? { stats } : {}) }
        if (!bgOk && covOk) {
          params = { ...params, intensity: Math.min(args.space?.intensity?.[1] ?? 90, (params.intensity ?? 60) + 10) }
        } else if (!bgOk && !covOk) {
          params = { ...params, softness: Math.min(100, (params.softness ?? 60) + 10) }
        }
        if (!edgeOk) {
          params = { ...params, aggressive: true, greenToAlpha: Math.min(300, (params.greenToAlpha ?? 10) + 10) }
        }
      }
      return { ok: true, params, trace, reachedGoal: false, ...(stats ? { stats } : {}) }
    },

    async batch(args) {
      const items = args.items ?? []
      const workers = Math.max(1, Math.min(4, Math.floor(args.concurrency ?? 1)))
      // A5 并发：桥接的页面状态是**全局**的（一个页面同时只能处理一段素材），所以真正隔离
      // 只能"一个 worker 一个浏览器实例"。代价是每个 worker 一份 Edge（~100MB 内存），
      // 所以上限压到 4，且只有当确实多于一条素材时才分池。
      if (workers > 1 && items.length > 1) {
        const poolSize = Math.min(workers, items.length)
        const pools: SpriteService[] = []
        try {
          for (let i = 0; i < poolSize; i++) {
            pools.push(createSpriteService({ ...options, idleMs }))
          }
          const buckets: BatchItem[][] = pools.map(() => [])
          items.forEach((item, index) => buckets[index % pools.length]!.push(item))
          log('sprite_batch 并发执行', { workers: poolSize, items: items.length })
          const settled = await Promise.all(
            pools.map((pool, index) =>
              pool.batch({ outRoot: args.outRoot, items: buckets[index]!, ...(args.overwrite === undefined ? {} : { overwrite: args.overwrite }) }),
            ),
          )
          const results = settled.flatMap((one) => one.results)
          const failures = settled.flatMap((one) => one.failures)
          return { ok: failures.length === 0, results, failures }
        } finally {
          await Promise.all(pools.map((pool) => pool.stop().catch(() => undefined)))
        }
      }
      const results: BatchResultItem[] = []
      const failures: Array<{ action: string; error: string }> = []
      for (const item of items) {
        const name = item.name ?? item.action
        try {
          const prepared = await this.prepare({
            videoPath: item.videoPath,
            start: item.start ?? 0,
            end: item.end ?? 4,
            fps: item.fps ?? 12,
          })
          const keyColor = item.keyColor ?? (await this.probeColor({ frame: 0 })).keyColor
          const params: KeyParams = {
            mode: item.mode ?? 'advanced',
            colorHex: keyColor,
            intensity: item.intensity ?? 85,
            softness: 100,
            despill: 70,
            greenToAlpha: 25,
            aggressive: true,
            autoPlate: false,
          }
          const applied = await this.keyApply(params)
          // 量抠图之后的帧（原帧整幅不透明，量原帧只会得到"整幅高"）。
          const measured = await this.measure({ frame: 0, overlay: true })
          const cleaned = await this.cleanup({
            maskRect: item.maskRect ?? null,
            trim: { mode: item.trimMode ?? 'union' },
          })
          const span = measured.alphaBBox
            ? { fromY: measured.alphaBBox.y0, toY: measured.alphaBBox.y1 - 1 }
            : undefined
          const exported = await this.exportSheet({
            ...(typeof item.cols === 'number' ? { cols: item.cols } : {}),
            ...(typeof item.rows === 'number' ? { rows: item.rows } : {}),
            ...(item.targetCharHeight ? { charHeightPx: item.targetCharHeight, ...(span ? { span } : {}) } : {}),
            format: item.format ?? 'png',
            outDir: args.outRoot,
            name,
            dirPerAction: true,
            overwrite: args.overwrite ?? true,
          })
          results.push({
            action: item.action,
            name,
            ok: true,
            ...(exported.pngPath ? { pngPath: exported.pngPath } : {}),
            ...(exported.metaPath ? { metaPath: exported.metaPath } : {}),
            ...(exported.cell ? { cellW: exported.cell.width, cellH: exported.cell.height } : {}),
            ...(typeof exported.scale === 'number' ? { scale: exported.scale } : {}),
            ...(typeof exported.achievedPx === 'number' ? { charHeightPx: exported.achievedPx } : {}),
            ...(applied.stats || applied.worst
              ? { stats: { ...(applied.worst ? { worst: applied.worst } : {}), ...(applied.stats ? { first: applied.stats } : {}) } as never }
              : {}),
            ...(measured.overlayPath ? { overlayPath: measured.overlayPath } : {}),
            ...(exported.measured ? { measured: exported.measured } : {}),
            warnings: [
              ...exported.warnings,
              ...applied.warnings,
              ...(cleaned.trimBox ? [] : ['没有算出裁剪框']),
              ...(applied.plateApplied ? [] : []),
              ...(prepared.transport === 'base64' ? ['视频走的是 base64 通道（较慢）'] : []),
            ],
          })
        } catch (error) {
          failures.push({ action: item.action, error: String((error as Error)?.message ?? error).slice(0, 300) })
        }
      }
      return { ok: failures.length === 0, results, failures }
    },

    async auto(args) {
      const stages: string[] = []
      const prepared = await this.prepare({ videoPath: args.videoPath, start: 0, end: 4, fps: 12 })
      stages.push(`prepare: ${prepared.frames} 帧 ${prepared.width}x${prepared.height}`)
      const color = await this.probeColor({ frame: 0 })
      stages.push(`probeColor: ${color.keyColor} spread=${color.spread.toFixed(3)}`)
      const tuned = await this.autotune({ frame: 0, maxIters: 6 })
      stages.push(
        `autotune: ${tuned.reachedGoal ? '达标' : '未达标'}，${tuned.trace.length} 轮，参数 ${JSON.stringify(tuned.params)}`,
      )
      const applied = await this.keyApply({ ...(tuned.params ?? { colorHex: color.keyColor }) })
      stages.push(`keyApply: ${applied.frames} 帧，缓存 ${applied.keyedCount}`)
      // 量「抠图之后」的帧：原帧整幅不透明，量原帧只会得到"整幅高"（评审文档 P6 的根）。
      const measured = await this.measure({ frame: 0, overlay: true })
      const span = { fromY: measured.alphaBBox.y0, toY: measured.alphaBBox.y1 - 1 }
      stages.push(`measure: bbox=${JSON.stringify(measured.alphaBBox)} 高=${measured.contentHeight}`)
      const cleaned = await this.cleanup({
        maskRect: args.maskRect ?? null,
        trim: { mode: args.trimMode ?? 'union' },
      })
      stages.push(`cleanup: trim=${JSON.stringify(cleaned.trimBox)} mode=${cleaned.mode}`)
      const exported = await this.exportSheet({
        ...(typeof args.cols === 'number' ? { cols: args.cols } : {}),
        ...(typeof args.rows === 'number' ? { rows: args.rows } : {}),
        ...(args.targetCharHeight ? { charHeightPx: args.targetCharHeight, span } : {}),
        format: args.format ?? 'png',
        ...(args.outDir ? { outDir: args.outDir } : {}),
        name: args.name ?? path.basename(args.videoPath).replace(/\.[^.]+$/, ''),
        dirPerAction: true,
        overwrite: true,
      })
      stages.push(`export: ${exported.pngPath}（${exported.bytes} B）`)
      /* 一条龙最容易"绿着交出烂图"：压边告警（手/特效被抠成主体）必须带到最终结果上 */
      return {
        ...exported,
        warnings: [...exported.warnings, ...applied.warnings],
        stages,
      }
    },

    async stop() {
      if (stopped) return
      stopped = true
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = undefined
      await recycle('停机')
      const server = toolServer
      toolServer = undefined
      if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

/**
 * 一张图集的配套 meta 候选路径（按顺序找）：
 * `idle_8x6.png` → `idle_8x6.meta.json`，再退回 `idle_8x6.json`。
 * 两份都没有就报错——准绳图不猜锚点。
 */
export function metaPathCandidates(imagePath: string): string[] {
  const ext = path.extname(imagePath)
  const stem = ext === '' ? imagePath : imagePath.slice(0, imagePath.length - ext.length)
  return [`${stem}.meta.json`, `${stem}.json`]
}

/**
 * 一组路径的公共父目录（准绳图的默认输出根）。
 *
 * 典型用法：`D:\out\idle\idle_8x6.png` + `D:\out\walk\walk_8x6.png` → `D:\out`
 * ——准绳图落在 `D:\out\_debug\`，跟用户文档里的约定一致。
 * 只有一个路径、或跨盘对不上时，退回第一张图所在目录（总能落盘，不会抛）。
 */
export function commonParentDir(paths: string[]): string {
  const dirs = paths.map((one) => path.dirname(path.resolve(one)))
  if (dirs.length === 0) return process.cwd()
  const parts = dirs.map((one) => one.split(path.sep))
  let common = parts[0]!.slice()
  for (const other of parts.slice(1)) {
    let i = 0
    while (i < common.length && i < other.length && common[i] === other[i]) i++
    common = common.slice(0, i)
  }
  if (common.length === 0) return dirs[0]!
  const joined = common.join(path.sep)
  return joined === '' ? dirs[0]! : joined
}

/** 供测试/诊断用：算一份稳定指纹（避免同一路径被两份实例乱用）。 */
export function fingerprintOf(file: string): string {  try {
    return createHash('sha1').update(`${file}:${statSync(file).size}`).digest('hex').slice(0, 12)
  } catch {
    return 'unknown'
  }
}
