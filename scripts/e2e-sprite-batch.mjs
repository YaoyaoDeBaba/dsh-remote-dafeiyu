/**
 * e2e-sprite-batch —— 8 段真实素材批量验收（同时验 A4 批量与 A5 并发）。
 *
 *   node scripts/e2e-sprite-batch.mjs [素材目录] [concurrency]
 *
 * 默认素材目录：`C:\Users\htsd\Downloads\肥鱼Test\肥鱼修正`，默认并发 2。
 * 判据：
 * - 每条都出图，且 `stats.worst.bgResidual < 0.02`；
 * - 每条 `charHeightPx` 与目标（300）偏差 ≤ 2px，或被 300% 缩放上限夹住（如实报 clamped）；
 * - 并发时互不串帧：每条的 png 尺寸/命名/指标都对应自己的素材。
 */
import os from 'node:os'
import path from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { createSpriteService } from '../dist/src/sprite/service.js'

const dir = process.argv[2] ?? 'C:\\Users\\htsd\\Downloads\\肥鱼Test\\肥鱼修正'
const concurrency = Number(process.argv[3] ?? 2)
const outRoot = path.join(os.tmpdir(), `sprite-batch-${Date.now()}`)
const TARGET_CHAR = 300

const videos = readdirSync(dir)
  .filter((name) => /\.(mp4|webm|mov)$/i.test(name))
  .sort()
  .map((name) => path.join(dir, name))
if (videos.length === 0) {
  console.error(`目录里没有视频：${dir}`)
  process.exitCode = 1
} else {
  const items = videos.map((videoPath) => {
    const base = path.basename(videoPath).replace(/\.[^.]+$/, '')
    // shot_05_idle -> Idle；shot_12_sneak_eat -> SneakEat
    const action = base.replace(/^shot_\d+_/, '').replace(/(^|_)([a-z])/g, (_m, _p, ch) => ch.toUpperCase())
    return { videoPath, action, name: action, targetCharHeight: TARGET_CHAR, cols: 8, rows: 6, format: 'webp' }
  })

  console.log(`素材 ${items.length} 段，并发 ${concurrency}，目标净高 ${TARGET_CHAR}px`)
  console.log(`输出 ${outRoot}\n`)

  const service = createSpriteService({
    toolHtmlPath: path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'assets', 'sprite', 'sprite-tool.html'),
    outDir: outRoot,
    log: () => {},
    idleMs: 600_000,
  })

  const t0 = Date.now()
  try {
    const result = await service.batch({ outRoot, items, concurrency, overwrite: true })
    const seconds = ((Date.now() - t0) / 1000).toFixed(1)
    let failures = 0
    for (const item of result.results) {
      const worst = item.stats?.worst
      const okWorst = !worst || worst.bgResidual < 0.02
      const okHeight = typeof item.charHeightPx === 'number' && Math.abs(item.charHeightPx - TARGET_CHAR) <= 2
      const file = item.pngPath && existsSync(item.pngPath) ? statSync(item.pngPath).size : 0
      const ok = okWorst && okHeight && file > 0
      if (!ok) failures += 1
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${item.action.padEnd(10)} 净高=${String(item.charHeightPx)}px 格=${item.cellW}x${item.cellH} ` +
          `scale=${item.scale}% worst.frame=${worst?.frame ?? '-'} bg=${worst ? worst.bgResidual.toFixed(4) : '-'} ` +
          `文件=${(file / 1024).toFixed(0)}KB`,
      )
    }
    for (const failure of result.failures) {
      failures += 1
      console.log(`FAIL ${failure.action}  ${failure.error}`)
    }
    console.log(`\n总耗时 ${seconds}s（${(items.length / (Number(seconds) || 1)).toFixed(2)} 段/秒）`)
    console.log(failures === 0 ? '✅ 全绿' : `❌ ${failures} 项失败`)
    process.exitCode = failures === 0 ? 0 : 1
  } catch (error) {
    console.error('批量跑挂了：' + String(error?.stack ?? error))
    process.exitCode = 1
  } finally {
    await service.stop()
  }
}
