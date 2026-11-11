/**
 * make-sprite-fixture —— 生成一段**绿幕测试素材**（webm），给冒烟与回归用。
 *
 *   node scripts/make-sprite-fixture.mjs [输出路径]
 *
 * 为什么要自己生成：仓库里不能塞视频（体积），而回归又必须有一个"背景确定可抠"的输入，
 * 否则抠图指标只能靠人眼看。这里用无头浏览器画布 + MediaRecorder 现场录一段：
 * 纯绿背景 + 一个移动的白色方块，尺寸小、帧数少、几秒钟就生成好。
 *
 * 输出的 webm 直接喂给 `scripts/smoke-sprite-tool.mjs`。
 */
import os from 'node:os'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { launchBrowser } from '../dist/src/sprite/browser.js'

const outFile = process.argv[2] ?? path.join(os.tmpdir(), 'sprite-fixture-green.webm')

// 注意：这一段会被当字符串丢进页面里执行，所以只用页面里有的东西（document/canvas/MediaRecorder）。
const pageScript = `(async () => {
  const width = 160, height = 240, fps = 12, seconds = 1.5
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const stream = canvas.captureStream(fps)
  const chunks = []
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 800_000 })
  recorder.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data) }
  const stopped = new Promise((resolve) => { recorder.onstop = () => resolve() })
  recorder.start()
  const total = Math.round(fps * seconds)
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = '#00ff00'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    const side = 60
    const x = 20 + ((width - 2 * side) * i) / Math.max(1, total - 1)
    const y = height / 2 - side / 2
    ctx.fillRect(x, y, side, side)
    ctx.fillStyle = '#000000'
    ctx.fillRect(x + side / 3, y + side / 3, side / 6, side / 6)
    await new Promise((resolve) => setTimeout(resolve, 1000 / fps))
  }
  recorder.stop()
  await stopped
  const blob = new Blob(chunks, { type: 'video/webm' })
  const buffer = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i])
  return { ok: true, base64: btoa(binary), bytes: buffer.length, frames: total, width, height }
})()`

let session
let failures = 0
try {
  session = await launchBrowser({
    toolUrl: 'data:text/html,<!doctype html><title>fixture</title><body></body>',
    readyExpression: "document.readyState === 'complete'",
  })
  const result = await session.evaluate(pageScript, 120_000)
  if (!result || result.ok !== true || typeof result.base64 !== 'string' || result.base64 === '') {
    throw new Error('页面没有返回录制结果')
  }
  writeFileSync(outFile, Buffer.from(result.base64, 'base64'))
  console.log(`PASS 生成绿幕素材：${outFile}（${Math.round(result.bytes / 1024)}KB，${result.frames} 帧，${result.width}x${result.height}）`)
} catch (error) {
  failures += 1
  console.error('FAIL 生成素材：' + String(error && error.message ? error.message : error))
} finally {
  await session?.close()
  console.log(failures === 0 ? '✅ 完成' : '❌ 失败')
  process.exitCode = failures === 0 ? 0 : 1
}
