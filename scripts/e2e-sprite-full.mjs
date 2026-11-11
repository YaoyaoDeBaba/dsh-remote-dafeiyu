/**
 * e2e-sprite-full —— 序列帧工具的端到端验收（真浏览器 + 真素材）。
 *
 *   node scripts/e2e-sprite-full.mjs [视频目录或单个视频]
 *
 * 不传参数时用 `C:\Users\htsd\Downloads\肥鱼Test\肥鱼修正` 里第一条 mp4。
 *
 * 覆盖的是评审文档里"agent 实跑会踩到"的那些点：
 *   A1 两档参数真的生效 / A2 preview 之后再 export 必须报错 / A3 命名与目录可控
 *   B1 measure（含 all 与 perFrameSpread）/ B2 按净高缩放 / B3 锚点闭环 + 口径
 *   B4 核对图落盘 / B5 两种裁剪策略 / B6 最差帧 / B7 水印自动识别 / B8 自动采色
 *   A6 webp 导出 / 视频 http 直传
 *
 * 退出码 0 = 全绿。
 */
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSpriteService } from '../dist/src/sprite/service.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = 'C:\\Users\\htsd\\Downloads\\肥鱼Test\\肥鱼修正'

function pickVideo(arg) {
  const target = arg ?? DEFAULT_DIR
  if (existsSync(target) && statSync(target).isFile()) return target
  const files = readdirSync(target).filter((name) => /\.(mp4|webm|mov)$/i.test(name)).sort()
  if (files.length === 0) throw new Error(`目录里没有视频：${target}`)
  return path.join(target, files[0])
}

const video = pickVideo(process.argv[2])
const outDir = path.join(os.tmpdir(), `sprite-e2e-${Date.now()}`)
mkdirSync(outDir, { recursive: true })

let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra === '' ? '' : '  ' + extra}`)
}

const service = createSpriteService({
  toolHtmlPath: path.join(here, '..', 'assets', 'sprite', 'sprite-tool.html'),
  outDir,
  log: (message, fields) => {
    if (process.env.SPRITE_E2E_VERBOSE) console.log('[log]', message, fields ?? '')
  },
  idleMs: 200_000,
})

const t0 = Date.now()
const lap = (label) => console.log(`     … ${label} @${((Date.now() - t0) / 1000).toFixed(1)}s`)

try {
  console.log(`视频：${video}`)
  console.log(`输出：${outDir}\n`)

  // ── A: prepare（走 http 直传）──
  lap('prepare')
  const prepared = await service.prepare({ videoPath: video, start: 0, end: 4, fps: 12 })
  check(prepared.frames > 0 && prepared.width > 0, 'A 抽帧', `${prepared.frames} 帧 ${prepared.width}x${prepared.height} transport=${prepared.transport}`)
  check(prepared.transport === 'http', 'A 视频走 http 直传（不再 base64 过 CDP）')

  // ── B8: 自动采色 ──
  lap('probeColor')
  const probe = await service.probeColor({ frame: 0 })
  check(/^#[0-9A-Fa-f]{6}$/.test(probe.keyColor), 'B8 采色', `${probe.keyColor} spread=${probe.spread.toFixed(3)} rejected=${probe.rejected.join('/') || 'none'}`)
  check(probe.spread < 0.2, 'B8 背景均匀度可用', `spread=${probe.spread.toFixed(3)}`)
  check(probe.rejected.length === 0, 'B8 原始帧（整幅不透明）不该把边判成"前景压边"', `rejected=${probe.rejected.join('/') || 'none'}`)

  // ── B1: 测量（先量原帧，确认它确实是"整幅"这个语义）──
  lap('measure(raw)')
  const rawMeasured = await service.measure({ frame: 0, source: 'raw', overlay: false })
  const rawRatio = rawMeasured.bboxAreaRatio ?? 1
  check(rawRatio > 0.95, 'B1 原帧 bbox 就是整幅（绿幕素材的正常形态）', `ratio=${rawRatio.toFixed(3)} bbox=${JSON.stringify(rawMeasured.alphaBBox)}`)
  // ── A1: 两档参数（用采到的键色，advanced 档）──
  lap('keyApply(advanced)')
  const applied = await service.keyApply({
    mode: 'advanced',
    colorHex: probe.keyColor,
    intensity: 85,
    softness: 100,
    despill: 70,
    greenToAlpha: 25,
    aggressive: true,
    autoPlate: false,
  })
  check(applied.keyedCount > 0, 'A2 keyApply 后有抠图缓存', `keyed=${applied.keyedCount}`)
  check(applied.appliedParams?.mode === 'advanced', 'A1 advanced 档真的生效', JSON.stringify(applied.appliedParams?.mode))
  const st = applied.stats
  // 注意：`subjectCoverage` 是「bbox 内的不透明占比」，bbox 一旦被某帧的残渣撑大就会失真，
  // 所以这里只把 bgResidual / edgeGreen 当硬判据，bbox 面积单独校验（背景真的被去掉了）。
  const bboxArea = st?.bbox ? (st.bbox.w * st.bbox.h) / (st.width * st.height) : 1
  check(
    !!st && st.bgResidual < 0.02 && st.edgeGreen < 0.1,
    '抠图质量达标（背景残留/绿边）',
    st ? `bg=${st.bgResidual.toFixed(4)} edge=${st.edgeGreen.toFixed(4)} cov=${st.subjectCoverage.toFixed(4)} bbox占画面=${(bboxArea * 100).toFixed(1)}%` : '(无 stats)',
  )
  check(bboxArea < 0.9, '主体 bbox 明显小于整幅（说明背景真的被去掉了）', `${(bboxArea * 100).toFixed(1)}%`)
  check(!!applied.worst, 'B6 给出最差帧', applied.worst ? `frame=${applied.worst.frame} bg=${applied.worst.bgResidual.toFixed(4)}` : '(无)')

  // ── B1: 抠图之后再用 measure 量（默认 source=keyed）──
  lap('measure(keyed)')
  const measured = await service.measure({ frame: 0, overlay: true })
  const keyedRatio = measured.bboxAreaRatio ?? 1
  check(measured.source === 'keyed', 'B1 默认量抠图结果', String(measured.source))
  check(keyedRatio < 0.9, 'B1 抠图后 bbox 明显小于整幅（尺子量对了对象）', `ratio=${keyedRatio.toFixed(3)} bbox=${JSON.stringify(measured.alphaBBox)} 高=${measured.contentHeight}`)
  check(existsSync(measured.overlayPath ?? ''), 'B4 核对图落盘', measured.overlayPath ?? '(无)')
  const allFrames = await service.measure({ frame: 'all' })
  const spreadOk = !!allFrames.perFrameSpread && allFrames.perFrameSpread.frames === prepared.frames
  check(spreadOk, 'B1 全帧分布', allFrames.perFrameSpread ? `topY ${allFrames.perFrameSpread.topY.min}~${allFrames.perFrameSpread.topY.max} soleY ${allFrames.perFrameSpread.soleY.min}~${allFrames.perFrameSpread.soleY.max}` : '(无)')

  // ── B2: 按净高缩放 ──
  lap('scaleTo')
  const span = { fromY: measured.alphaBBox.y0, toY: measured.alphaBBox.y1 - 1 }
  const scaled = await service.scaleTo({ charHeightPx: 300, span })
  check(scaled.ok === true && scaled.scale > 0, 'B2 按净高缩放', `scale=${scaled.scale}% achieved=${scaled.achievedPx}px source=${scaled.sourcePx}px`)
  check(Math.abs(scaled.achievedPx - 300) <= 2 || scaled.clamped, 'B2 目标偏差 ≤2px（或被 300% 上限夹住）', `achieved=${scaled.achievedPx}`)

  // ── B3: 锚点闭环 ──
  lap('anchor')
  const before = await service.getAnchor()
  check(before.convention === 'y-from-bottom', 'B3 锚点自带口径', before.convention)
  // 像素空间是「最终格子」（裁剪+缩放后），不是原帧——传原帧宽度会被夹到 1.0（桥接自己报过这个坑）。
  const cellW = Number(before.frameWidth ?? 0)
  const cellH = Number(before.frameHeight ?? 0)
  check(cellW > 0 && cellH > 0, 'B3 锚点像素空间=格子', `${cellW}x${cellH}`)
  const setPx = await service.setAnchorPx({ x: Math.round(cellW / 2), y: 6, convention: 'y-from-bottom' })
  const after = await service.getAnchor()
  check(
    Math.abs(after.anchorY - setPx.anchorY) < 1e-6 && Math.abs(after.anchorX - setPx.anchorX) < 1e-6,
    'B3 set/get 闭环',
    `x=${after.anchorX.toFixed(4)} y=${after.anchorY.toFixed(4)}`,
  )

  // ── B5: 两种裁剪策略 ──
  lap('cleanup union')
  const union = await service.cleanup({ trim: { mode: 'union' } })
  lap('cleanup first-frame')
  const first = await service.cleanup({ trim: { mode: 'first-frame', pad: { top: 4, bottom: 4 } } })
  check(!!union.trimBox && !!first.trimBox, 'B5 两种策略都出框', `union=${JSON.stringify(union.trimBox)} first=${JSON.stringify(first.trimBox)}`)
  check(union.mode === 'union' && first.mode === 'first-frame', 'B5 策略回显')
  check(first.pad.top === 4 && first.pad.bottom === 4, 'B5 pad 回显（P17：差 1~2px 要对得上账）', JSON.stringify(first.pad))
  check(union.unionFrames === prepared.frames && first.unionFrames === 1, 'B5 并集帧数回显（union=全帧 / first-frame=1）', 'union=' + union.unionFrames + ' first=' + first.unionFrames)

  // ── B7: 水印自动识别 ──
  lap('cleanup auto watermark')
  const autoMask = await service.cleanup({ maskRect: 'auto', trim: { mode: 'union' } })
  const wm = autoMask.maskRect
  const candCount = (autoMask.watermarkCandidates ?? []).length
  // 这批素材左上角有「AI生成」半透明胶囊（原帧里是浅绿，抠图后看不见，但确实存在）
  check(
    !!wm && wm.x < 140 && wm.y < 140 && candCount > 0,
    'B7 水印自动识别命中左上角标',
    wm ? `rect=${JSON.stringify(wm)} 候选=${candCount}` : `未命中（候选 ${candCount}）`,
  )

  // ── A2: 回归——preview 之后 export 必须报错 ──
  lap('preview → export（应失败）')
  await service.keyPreview({ colorHex: probe.keyColor, mode: 'advanced', intensity: 80, frame: 0 })
  let guarded = false
  try {
    await service.exportSheet({ outDir, name: 'guard-test', format: 'png' })
  } catch (error) {
    guarded = /抠图缓存是空的/.test(String(error?.message ?? error))
  }
  check(guarded, 'A2 preview 清缓存后 export 直接报错（不再闷声出绿图）')

  // ── 恢复抠图后再导出 ──
  lap('keyApply 重建缓存')
  await service.keyApply({ mode: 'advanced', colorHex: probe.keyColor, intensity: 85, softness: 100, aggressive: true, greenToAlpha: 25 })
  await service.cleanup({ trim: { mode: 'union' } })
  lap('export png')
  const pngOut = await service.exportSheet({
    cols: 8,
    rows: 6,
    charHeightPx: 300,
    span,
    outDir,
    name: 'Idle',
    dirPerAction: true,
    format: 'png',
  })
  check(existsSync(pngOut.pngPath) && existsSync(pngOut.metaPath), 'A3 命名/子目录可控', `${pngOut.pngPath}`)
  const meta = JSON.parse(readFileSync(pngOut.metaPath, 'utf8'))
  check(meta.anchorConvention === 'y-from-bottom', 'A3 meta 写清锚点口径', meta.anchorConvention)
  check(meta.appliedParams?.mode === 'advanced', 'A3 meta 带 appliedParams')

  // ── A6: webp ──
  lap('export webp')
  const webpOut = await service.exportSheet({
    cols: 8,
    rows: 6,
    charHeightPx: 300,
    span,
    outDir,
    name: 'Idle',
    dirPerAction: true,
    format: 'webp',
    quality: 0.9,
  })
  const pngBytes = statSync(pngOut.pngPath).size
  const webpBytes = statSync(webpOut.pngPath).size
  check(webpBytes > 0 && pngBytes > 0, 'A6 webp 导出成功', `png=${(pngBytes / 1024).toFixed(0)}KB webp=${(webpBytes / 1024).toFixed(0)}KB`)
  check(webpBytes < pngBytes, 'A6 webp 比 png 小', `${(pngBytes / webpBytes).toFixed(1)}x`)

  // ── A7/A4: 一条龙 + 批量 ──
  lap('auto')
  const autoOut = await service.auto({ videoPath: video, targetCharHeight: 300, outDir, name: 'AutoIdle', format: 'webp' })
  check(autoOut.ok === true && existsSync(autoOut.pngPath ?? ''), 'A7 auto 一条龙', (autoOut.stages ?? []).join(' | ').slice(0, 240))

  lap('batch')
  const batchOut = await service.batch({
    outRoot: path.join(outDir, 'batch'),
    items: [{ videoPath: video, action: 'idle', name: 'Idle', targetCharHeight: 300, cols: 8, rows: 6, format: 'webp' }],
  })
  check(batchOut.results.length === 1 && batchOut.failures.length === 0, 'A4 batch 单条通过', JSON.stringify(batchOut.results[0]?.pngPath ?? batchOut.failures))
} catch (error) {
  check(false, 'e2e 过程抛错', String(error?.message ?? error))
} finally {
  await service.stop()
  console.log(`\n输出保留在：${outDir}`)
  console.log(failures === 0 ? '✅ 全绿' : `❌ ${failures} 项失败`)
  process.exitCode = failures === 0 ? 0 : 1
}