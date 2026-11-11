/**
 * sprite/service —— 「视频转序列帧精灵图」的编排层（给 agent 用的那双手）。
 *
 * 链路：插件起一个**只服务这个工具页**的本地 http 服务 → 无头 Edge 打开它 →
 * CDP `Runtime.evaluate` 调页面里的 `window.__spriteAgent` → 拿 dataURL 回 Node 侧算指标/落盘。
 *
 * 两条来自实测的纪律：
 * 1. **别用模拟点击**：取色按钮在无头下会状态失步，文件输入重复设置同一文件不触发 change。
 *    bridge 里所有关键动作都是直接调内部函数。
 * 2. **先收敛再全量**：单帧预览 < 2s，全量 apply 30~90s。所以 preview 用来迭代参数，
 *    apply 只跑一次；apply 之后必须复核一次指标（自动背景板只在 apply 时生效）。
 */
import http from 'node:http'
import { createServer, type Server } from 'node:http'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { analyzeSpritePng, type SpriteStats } from './analyze.js'
import { launchBrowser, type CdpSession } from './browser.js'

export type KeyParams = {
  colorHex?: string
  intensity?: number
  softness?: number
  despill?: number
  greenToAlpha?: number
  aggressive?: boolean
  autoPlate?: boolean
}

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

export interface PrepareResult {
  ok: boolean
  frames: number
  width: number
  height: number
  video: string
  error?: string
}

export interface PreviewResult {
  ok: boolean
  frame: number
  stats?: SpriteStats
  previewPath?: string
  maskPath?: string
  error?: string
}

export interface ApplyResult {
  ok: boolean
  frames: number
  plateApplied: boolean
  stats?: SpriteStats
  error?: string
}

export interface ExportResult {
  ok: boolean
  pngPath?: string
  metaPath?: string
  sheet?: { width: number; height: number }
  cell?: { width: number; height: number }
  /** 工具实际采用的缩放百分比（1~300）。 */
  scale?: number
  /** 内容物最终的像素高度（目标被 300% 上限夹住时会小于 targetHeight）。 */
  achievedPx?: number
  /** true = 想要的尺寸超出工具上限，
ote 里有怎么调。 */
  scaleClamped?: boolean
  note?: string
  error?: string
}

export interface SpriteService {
  prepare(args: { videoPath: string; start?: number; end?: number; fps?: number }): Promise<PrepareResult>
  keyPreview(args: KeyParams & { frame?: number }): Promise<PreviewResult>
  keyApply(args: KeyParams & { indices?: number[] }): Promise<ApplyResult>
  cleanup(args: { maskRect?: { x: number; y: number; w: number; h: number } | null; trimAlpha?: number }): Promise<{ ok: boolean; trimBox?: { x: number; y: number; w: number; h: number } | null; error?: string }>
  exportSheet(args: { cols?: number; rows?: number; targetHeight?: number; anchorX?: number; anchorY?: number; outDir?: string }): Promise<ExportResult>
  /** 停机：关浏览器与本地静态服务（幂等）。 */
  stop(): Promise<void>
  /** 现在是不是有个浏览器挂着（诊断用）。 */
  readonly busy: boolean
}

function dataUrlToBuffer(dataUrl: unknown): Buffer | undefined {
  const text = typeof dataUrl === 'string' ? dataUrl : ''
  const comma = text.indexOf(',')
  if (!text.startsWith('data:') || comma < 0) return undefined
  const head = text.slice(0, comma)
  if (!head.includes('base64')) return undefined
  try {
    return Buffer.from(text.slice(comma + 1), 'base64')
  } catch {
    return undefined
  }
}

const PAGE_ROUTE = '/'

/**
 * 只服务工具页的本地 http 服务。
 *
 * 为什么不借宿主的 webServer：那样要先知道宿主自己的 origin/端口（插件拿不到可靠值），
 * 而且宿主的页面有 CSP/鉴权那一套。这个服务只监听回环、只回一个文件、随用随关，风险面最小。
 */
function startToolServer(toolHtmlPath: string): Promise<{ origin: string; server: Server }> {
  return new Promise((resolve, reject) => {
    const html = readFileSync(toolHtmlPath)
    const etag = `"${html.byteLength}-${html.length}"`
    const server = createServer((request, response) => {
      const url = request.url ?? '/'
      if (!url.startsWith(PAGE_ROUTE)) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        response.end('not found')
        return
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.byteLength,
        'Cache-Control': 'no-store',
        ETag: etag,
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
  let session: CdpSession | undefined
  let toolServer: Server | undefined
  let toolOrigin = ''
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let launching: Promise<CdpSession> | undefined
  let stopped = false

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
        const started = await startToolServer(options.toolHtmlPath)
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

  /** 调页面里的 bridge 函数；统一把 `{ok:false,error}` 转成异常，免得每个调用点都判一次。 */
  const bridge = async <T>(name: string, ...args: unknown[]): Promise<T> => {
    const active = await ensureSession()
    touch()
    const expression = `(async () => {
      const api = window.__spriteAgent
      if (!api || !api.${name}) return { ok: false, error: '页面没有 __spriteAgent.${name}' }
      try { return await api.${name}(${args.map((arg) => JSON.stringify(arg ?? null)).join(', ')}) }
      catch (error) { return { ok: false, error: String(error && error.message || error) } }
    })()`
    const answer = await active.evaluate<{ ok?: boolean; error?: string } & Record<string, unknown>>(expression, 120_000)
    if (!answer || answer.ok !== true) {
      throw new Error(String(answer?.error ?? `${name} 失败（页面没有返回 ok）`))
    }
    return answer as T
  }

  const outDir = (override?: string): string => {
    const dir = override && override.trim() !== '' ? override.trim() : options.outDir
    mkdirSync(dir, { recursive: true })
    return dir
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
      // 100MB 上限：base64 之后还要过 CDP，太大就是给自己找麻烦。
      if (stat.size > 100 * 1024 * 1024) throw new Error(`视频太大（>100MB），先裁一段再来：${videoPath}`)
      const base64 = readFileSync(videoPath).toString('base64')
      const loaded = await bridge<{ ok: boolean; name?: string; bytes?: number }>(
        'loadVideoBase64',
        base64,
        path.basename(videoPath),
      )
      await bridge('setRange', args.start ?? 0, args.end ?? 4, args.fps ?? 12)
      const extracted = await bridge<{ ok: boolean; count?: number; width?: number; height?: number }>('extract')
      return {
        ok: true,
        frames: Number(extracted.count ?? 0),
        width: Number(extracted.width ?? 0),
        height: Number(extracted.height ?? 0),
        video: String(loaded.name ?? path.basename(videoPath)),
      }
    },

    async keyPreview(args) {
      const frame = Math.max(0, Math.floor(args.frame ?? 0))
      const params: KeyParams = { ...args }
      delete (params as { frame?: number }).frame
      await bridge('setKeyParams', params)
      const preview = await bridge<{ ok: boolean; dataURL?: string }>('keyPreview', frame)
      const previewBuffer = dataUrlToBuffer(preview.dataURL)
      if (!previewBuffer) throw new Error('页面没返回预览图（dataURL 为空）')
      const dir = outDir()
      const previewPath = path.join(dir, `preview-${frame}.png`)
      writeFileSync(previewPath, previewBuffer)
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
      return {
        ok: true,
        frame,
        stats: analyzeSpritePng(previewBuffer),
        previewPath,
        ...(maskPath ? { maskPath } : {}),
      }
    },

    async keyApply(args) {
      const params: KeyParams = { ...args }
      delete (params as { indices?: number[] }).indices
      await bridge('setKeyParams', params)
      const applied = await bridge<{ ok: boolean; frames?: number; plateApplied?: boolean }>(
        'keyApply',
        args.indices ?? null,
      )
      // apply 之后必须复核：自动背景板只在 apply 生效，单帧预览看不出它修好了没有。
      let stats: SpriteStats | undefined
      try {
        const check = await bridge<{ ok: boolean; dataURL?: string }>('keyPreview', 0)
        const buffer = dataUrlToBuffer(check.dataURL)
        if (buffer) stats = analyzeSpritePng(buffer)
      } catch {
        /* 复核失败不推翻 apply 本身，但报告里会缺 stats */
      }
      return {
        ok: true,
        frames: Number(applied.frames ?? 0),
        plateApplied: applied.plateApplied === true,
        ...(stats ? { stats } : {}),
      }
    },

    async cleanup(args) {
      if (args.maskRect !== undefined) {
        await bridge('setMaskRect', args.maskRect ?? null)
        await bridge('applyMask')
      }
      const trimmed = await bridge<{ ok: boolean; box?: { x: number; y: number; w: number; h: number } | null }>('computeTrim')
      await bridge('applyTrim')
      return { ok: true, trimBox: trimmed.box ?? null }
    },

    async exportSheet(args) {
      const dir = outDir(args.outDir)
      // 反推缩放：`measureScale(0, 0, targetHeight)` = 让工具按"内容物高度"自动测高，
      // 再算出"内容物要变成 targetHeight 像素"需要的百分比。工具自身上限 300%，
      // 超了会夹住——夹住这件事必须回给调用方，否则 agent 会以为拿到了 512 高。
      const scaled = await bridge<{
        ok: boolean
        scale?: number
        wantedScale?: number | null
        scaleClamped?: boolean
        achievedPx?: number
        sourcePx?: number
      }>('measureScale', 0, 0, args.targetHeight ?? 512)
      await bridge('setAnchor', args.anchorX ?? 0.5, args.anchorY ?? 0.04)
      const built = await bridge<{ ok: boolean; dataURL?: string; meta?: Record<string, unknown> }>(
        'buildSheet',
        args.cols ?? 7,
        args.rows ?? 7,
      )
      const buffer = dataUrlToBuffer(built.dataURL)
      if (!buffer) throw new Error('页面没返回精灵图（dataURL 为空）')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const pngPath = path.join(dir, `sheet-${stamp}.png`)
      writeFileSync(pngPath, buffer)
      const meta = built.meta ?? (await bridge<Record<string, unknown>>('sheetMeta').catch(() => ({})))
      const metaPath = path.join(dir, `sheet-${stamp}.json`)
      writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8')
      const stats = analyzeSpritePng(buffer)
      return {
        ok: true,
        pngPath,
        metaPath,
        sheet: { width: stats.width, height: stats.height },
        ...(typeof scaled.scale === 'number' ? { scale: scaled.scale } : {}),
        ...(typeof scaled.achievedPx === 'number' ? { achievedPx: scaled.achievedPx } : {}),
        ...(scaled.scaleClamped === true
          ? {
              scaleClamped: true,
              note: `想要 ${Number(args.targetHeight ?? 512)}px，但工具缩放上限 300%，实际只有 ${
                scaled.achievedPx ?? '?'
              }px；把 targetHeight 调小或裁掉多余画面再来`,
            }
          : {}),
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
