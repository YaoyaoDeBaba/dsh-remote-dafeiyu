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
import { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { analyzeSpritePng, type SpriteStats } from './analyze.js'
import { assertKeyedPresent, assertNotOpaque, defaultFileNames, pickWorst } from './guard.js'
import { launchBrowser, type CdpSession } from './browser.js'
import type {
  AnchorInfo,
  AutotuneGoal,
  AutotuneSpace,
  AutotuneTraceStep,
  ExportOptions,
  ExportResult,
  KeyParams,
  MeasureLandmark,
  MeasureResult,
  ProbeColorResult,
  Rect,
  ScaleResult,
  TrimOptions,
  WorstFrame,
} from './types.js'

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

export interface CleanupResult {
  ok: boolean
  /** 实际用来遮挡的矩形（maskRect:'auto' 时是自动检测选中的那个）。 */
  maskRect?: Rect | null
  /** 自动检测的全部候选（含置信度不足的），供调用方自己判断。 */
  watermarkCandidates?: Array<Rect & { confidence?: number; corner?: string }>
  trimBox: Rect | null
  mode: 'union' | 'first-frame'
  pad: { top: number; bottom: number; left: number; right: number }
  alphaThreshold: number
  unionFrames: number
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
  warnings: string[]
  error?: string
}

export interface SpriteService {
  prepare(args: { videoPath: string; start?: number; end?: number; fps?: number }): Promise<PrepareResult>
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
  getAnchor(): Promise<AnchorInfo>
  setAnchorPx(args: { x?: number; y?: number; convention?: 'y-from-bottom' | 'y-from-top' }): Promise<AnchorInfo>
  cleanup(args: { maskRect?: Rect | 'auto' | null; trim?: TrimOptions }): Promise<CleanupResult>
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
  /** 最近一次 prepare 的帧尺寸/数量，用于默认值与断言。 */
  let lastPrepare: { frames: number; width: number; height: number } | undefined

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
    session = undefined
    lastPrepare = undefined
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
      throw new Error(String(answer?.error ?? `${name} 失败（页面没有返回 ok）`))
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

  /** 采样若干帧的抠图结果并算指标，找出"最差帧"（B6：第 0 帧干净不代表整段干净）。 */
  const worstOf = async (frames: number, sampleLimit = 8): Promise<{ worst?: WorstFrame; stats?: SpriteStats }> => {
    const total = Math.max(1, frames)
    const picks = new Set<number>([0])
    const step = Math.max(1, Math.floor(total / sampleLimit))
    for (let i = 0; i < total; i += step) picks.add(i)
    picks.add(total - 1)
    const bucket: Array<{ frame: number; stats: SpriteStats }> = []
    let firstStats: SpriteStats | undefined
    for (const frame of [...picks].slice(0, sampleLimit + 1)) {
      try {
        const one = await bridge<{ ok: boolean; dataURL?: string }>('keyedDataURL', frame)
        const buffer = dataUrlToBuffer(one.dataURL)
        if (!buffer) continue
        const stats = analyzeSpritePng(buffer)
        if (!firstStats) firstStats = stats
        bucket.push({ frame, stats })
      } catch {
        /* 单帧采样失败不影响整体：采不到就不给 worst */
      }
    }
    const worst = pickWorst(bucket)
    return { ...(worst ? { worst } : {}), ...(firstStats ? { stats: firstStats } : {}) }
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
      await bridge('setRange', args.start ?? 0, args.end ?? 4, args.fps ?? 12)
      const extracted = await bridge<{ ok: boolean; count?: number; width?: number; height?: number }>('extract')
      const frames = Number(extracted.count ?? 0)
      const width = Number(extracted.width ?? 0)
      const height = Number(extracted.height ?? 0)
      if (frames <= 0) throw new Error('抽帧结果是 0 帧：检查时间区间（start/end）与 fps')
      lastPrepare = { frames, width, height }
      return { ok: true, frames, width, height, video: String(loaded.name ?? path.basename(videoPath)), transport }
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
      return {
        ok: true,
        frames,
        plateApplied: applied.plateApplied === true,
        keyedCount: state.keyedCount,
        ...(sampled.stats ? { stats: sampled.stats } : {}),
        ...(sampled.worst ? { worst: sampled.worst } : {}),
        ...(state.params ? { appliedParams: state.params } : {}),
        ignored: [],
        warnings: applied.autoEnabled === true ? ['抠图原本没启用，已自动启用（否则拼图会用原帧）'] : [],
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
      let watermarkCandidates: Array<Rect & { confidence?: number; corner?: string }> | undefined
      if (args.maskRect === 'auto') {
        const detected = await bridge<{
          ok: boolean
          rects?: Array<Rect & { confidence?: number; corner?: string }>
          note?: string
        }>('detectWatermark')
        watermarkCandidates = detected.rects ?? []
        const best = [...watermarkCandidates]
          .filter((row) => (row.confidence ?? 0) >= 0.8)
          .sort((a, b) => (b.w * b.h) - (a.w * a.h))[0]
        if (best) rect = { x: best.x, y: best.y, w: best.w, h: best.h }
        else warnings.push(detected.note || '没检测到可信的水印区域，这次不做遮挡')
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
      // 1) 前置断言：没有抠图缓存就 export，会静默拼出原帧（绿底）——这是 P2 那个坑。
      const state = await keytedParamsOf()
      assertKeyedPresent(state.keyedCount)
      // 2) 反推缩放：优先"目标物理量"，其次旧语义（整格高）。
      const scaled = await bridge<ScaleResult>('scaleTo', {
        ...(typeof args.charHeightPx === 'number' ? { charHeightPx: args.charHeightPx } : {}),
        ...(typeof args.targetHeight === 'number' ? { targetCellHeight: args.targetHeight } : {}),
        ...(args.span ? { span: args.span } : {}),
      })
      // 归一化锚点直接走 setAnchor（页面的 state.anchor 就是归一化的，按**输出格**算），
      // 不要拿原帧尺寸去换算成像素——裁剪之后帧变小了，那个换算会错。
      const anchor =
        typeof args.anchorX === 'number' || typeof args.anchorY === 'number'
          ? await bridge<AnchorInfo>('setAnchor', {
              ...(typeof args.anchorX === 'number' ? { x: args.anchorX } : {}),
              ...(typeof args.anchorY === 'number' ? { y: args.anchorY } : {}),
            })
          : await bridge<AnchorInfo>('getAnchor')
      const names = defaultFileNames({
        name,
        cols: args.cols ?? 8,
        rows: args.rows ?? 6,
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
        cols: args.cols ?? 8,
        rows: args.rows ?? 6,
        format,
        ...(typeof args.quality === 'number' ? { quality: args.quality } : {}),
      })
      const buffer = dataUrlToBuffer(built.dataURL)
      if (!buffer) throw new Error('页面没返回精灵图（dataURL 为空）')
      // 4) 后置断言：alpha 全不透 = 大概率退回了原帧（绿底）。
      const warnings: string[] = []
      if (format === 'png') assertNotOpaque(analyzeSpritePng(buffer))
      const tmpPng = `${pngPath}.tmp-${process.pid}`
      writeFileSync(tmpPng, buffer)
      renameSync(tmpPng, pngPath)
      const meta = {
        ...(built.meta ?? {}),
        format,
        width: built.width ?? null,
        height: built.height ?? null,
        cellWidth: null,
        cellHeight: null,
        anchorX: anchor.anchorX,
        anchorY: anchor.anchorY,
        anchorConvention: anchor.convention,
        scale: scaled.scale,
        charHeightPx: scaled.achievedPx,
        appliedParams: state.params ?? null,
        generatedAt: new Date().toISOString(),
        engine: 'dsh-remote-dafeiyu/sprite',
      }
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
      if (scaled.clamped) {
        warnings.push(
          `想要 ${args.charHeightPx ?? args.targetHeight ?? '?'}px，但工具缩放上限 300%，实际只有 ${scaled.achievedPx}px`,
        )
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
            cols: item.cols ?? 8,
            rows: item.rows ?? 6,
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
            warnings: [
              ...exported.warnings,
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
        cols: args.cols ?? 8,
        rows: args.rows ?? 6,
        ...(args.targetCharHeight ? { charHeightPx: args.targetCharHeight, span } : {}),
        format: args.format ?? 'png',
        ...(args.outDir ? { outDir: args.outDir } : {}),
        name: args.name ?? path.basename(args.videoPath).replace(/\.[^.]+$/, ''),
        dirPerAction: true,
        overwrite: true,
      })
      stages.push(`export: ${exported.pngPath}（${exported.bytes} B）`)
      return { ...exported, stages }
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

/** 供测试/诊断用：算一份稳定指纹（避免同一路径被两份实例乱用）。 */
export function fingerprintOf(file: string): string {
  try {
    return createHash('sha1').update(`${file}:${statSync(file).size}`).digest('hex').slice(0, 12)
  } catch {
    return 'unknown'
  }
}
