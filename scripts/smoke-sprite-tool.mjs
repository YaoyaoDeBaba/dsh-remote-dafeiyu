/**
 * smoke-sprite-tool —— 端到端冒烟：起工具页 → 拉无头浏览器 → 走一遍 prepare/keyPreview。
 *
 *   node scripts/smoke-sprite-tool.mjs [视频绝对路径]
 *
 * 不带视频时只验"页面起来了、bridge 挂上了、函数都在"。
 * 带视频时再验抽帧与单帧抠图（会打印量化指标，那是 agent 迭代参数的依据）。
 *
 * 退出码 0 = 这一层没问题。
 */
import http from 'node:http'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from '../dist/src/sprite/browser.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const toolHtml = path.join(here, '..', 'assets', 'sprite', 'sprite-tool.html')
const video = process.argv[2]

const html = readFileSync(toolHtml)
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.byteLength })
  response.end(html)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

let session
let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra === '' ? '' : '  ' + extra}`)
}

try {
  const startedAt = Date.now()
  session = await launchBrowser({ toolUrl: `${origin}/` })
  check(true, `工具页与 bridge 就绪`, `${Date.now() - startedAt}ms`)

  const api = await session.evaluate('Object.keys(window.__spriteAgent || {}).join(",")')
  const names = String(api).split(',')
  const requiredNames = [
    // v1
    'loadVideoBase64', 'setRange', 'extract', 'keyPreview', 'keyApply', 'buildSheet', 'sheetMeta',
    // v2（.58 起：尺子 / 采色 / 核对图 / 裁剪策略 / 水印 / webp / 缓存只读通道）
    'loadVideoUrl', 'keyState', 'probeColor', 'measure', 'overlay', 'getAnchor', 'setAnchorPx',
    'scaleTo', 'trim', 'detectWatermark', 'buildSheetDataURL', 'keyedDataURL',
  ]
  for (const required of requiredNames) {
    check(names.includes(required), `bridge 暴露 ${required}`)
  }

  if (video) {
    const base64 = readFileSync(video).toString('base64')
    const prepare = await session.evaluate(`(async () => {
      const api = window.__spriteAgent
      const loaded = await api.loadVideoBase64(${JSON.stringify(base64)}, ${JSON.stringify(path.basename(video))})
      if (!loaded || loaded.ok !== true) return { ok: false, step: 'load', error: loaded && loaded.error }
      const range = await api.setRange(0, 4, 12)
      if (!range || range.ok !== true) return { ok: false, step: 'range', error: range && range.error }
      const frames = await api.extract()
      if (!frames || frames.ok !== true) return { ok: false, step: 'extract', error: frames && frames.error }
      return { ok: true, count: frames.count, width: frames.width, height: frames.height }
    })()`)
    check(prepare && prepare.ok === true, '导入视频并抽帧', JSON.stringify(prepare))
    if (prepare && prepare.ok === true) {
      const preview = await session.evaluate(`(async () => {
        const api = window.__spriteAgent
        await api.setKeyParams({ intensity: 50, softness: 30, despill: 100, greenToAlpha: 25, aggressive: true, autoPlate: false })
        const row = await api.keyPreview(0)
        if (!row || row.ok !== true) return { ok: false, error: row && row.error }
        const url = String(row.dataURL || '')
        return { ok: true, bytes: url.length, head: url.slice(0, 24) }
      })()`)
      check(preview && preview.ok === true, '单帧抠图预览', JSON.stringify(preview))
    }
  }
} catch (error) {
  check(false, '冒烟过程抛错', String(error && error.message ? error.message : error))
} finally {
  await session?.close()
  server.close()
  console.log(failures === 0 ? '✅ 全通过' : `❌ ${failures} 项失败`)
  process.exitCode = failures === 0 ? 0 : 1
}
