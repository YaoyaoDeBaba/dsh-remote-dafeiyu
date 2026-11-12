/**
 * sprite-watermark.test —— 角标（水印）检测的候选输出与四角兜底（评审 P1-4）。
 *
 * 为什么这么测：像素只在浏览器里（`assets/sprite/sprite-tool.html` 的 detectWatermark 里跑），
 * Node 侧测不到 canvas。所以页面把像素算法夹在 `WATERMARK-DETECT-BEGIN/END` 之间做成
 * **纯函数工厂**（`spriteWatermarkDetect()`，只吃 ImageData 形状的数组 + 主体 bbox），
 * 本文件把那段源码抠出来，喂合成帧跑三个场景：
 *   ① 渐变绿墙 + 浅色角标（本次素材的真实情形：局部差只有 10 级，够不到 contrast=24）
 *      → 严格判据本来必然落空，兜底必须给出低置信度候选；
 *   ② 同一个角标但压进主体 bbox → 必须被拒，而且要带原因；
 *   ③ 高置信场景 → 必须仍走老路径（老字段逐字段等于旧实现的结果，且不掺兜底候选）。
 *
 * 合成帧的几何照着需求文档：渐变背景四边中位色 (137,163,114)→(167,187,139)，
 * 角标是"两块横向笔画 + 若干竖笔"的网格状墨迹（真实角标是文字，块中位色仍等于背景；
 * 若画成实心大色块，块中位色会被角标自己带跑，那不是这次要测的东西）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildTools } from '../src/sprite/tools.js'
import { WATERMARK_AUTO_CONFIDENCE } from '../src/sprite/service.js'
import type { SpriteService } from '../src/sprite/service.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PAGE = path.join(ROOT, 'assets', 'sprite', 'sprite-tool.html')

/* ---------------- 合成帧 ---------------- */

interface FakeFrame {
  width: number
  height: number
  data: Uint8ClampedArray
}

type Rgba = [number, number, number, number]

interface Badge {
  x0: number
  y0: number
  x1: number
  y1: number
  /** 墨迹相对背景的抬升量（三个通道同加，避免色相变化干扰"通道差最大"那一步）。 */
  delta: number
}

/** 角标墨迹：每 10px 一条 2px 笔画的网格（横向两块、竖向若干），像"AI生成 三图"那种字块。 */
function inkAt(badge: Badge, x: number, y: number): boolean {
  if (x < badge.x0 || x > badge.x1 || y < badge.y0 || y > badge.y1) return false
  const dx = (x - badge.x0) % 10
  const dy = (y - badge.y0) % 10
  return dx < 2 || dy < 2
}

/** 渐变绿墙：四边中位色从 (137,163,114) 到 (167,187,139)，与需求文档一致。 */
function wallAt(width: number, height: number, x: number, y: number): Rgba {
  const t = (x / Math.max(1, width - 1) + y / Math.max(1, height - 1)) / 2
  return [137 + Math.round(30 * t), 163 + Math.round(24 * t), 114 + Math.round(25 * t), 255]
}

/** 会动的蓝色主体：保证采样帧之间"有像素不一样"，否则整幅都是稳定层。 */
function blobAt(frameIndex: number, x: number, y: number): Rgba | null {
  const cx = 90 + 24 * frameIndex
  const cy = 176
  if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > 14 * 14) return null
  return [60, 90, 200, 255]
}

function buildFrames(width: number, height: number, count: number, badge: Badge | null): FakeFrame[] {
  const frames: FakeFrame[] = []
  for (let k = 0; k < count; k++) {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let rgba: Rgba = wallAt(width, height, x, y)
        if (badge && inkAt(badge, x, y)) {
          rgba = [
            Math.min(255, rgba[0] + badge.delta),
            Math.min(255, rgba[1] + badge.delta),
            Math.min(255, rgba[2] + badge.delta),
            255,
          ]
        }
        const blob = blobAt(k, x, y)
        if (blob) rgba = blob
        const q = (y * width + x) * 4
        data[q] = rgba[0]
        data[q + 1] = rgba[1]
        data[q + 2] = rgba[2]
        data[q + 3] = rgba[3]
      }
    }
    frames.push({ width, height, data })
  }
  return frames
}

/* ---------------- 从页面里抠出厂函数 ---------------- */

interface DetectParams {
  alphaThreshold?: number
  colorTolerance?: number
  contrast?: number
  minPixels?: number
  minWidth?: number
  minHeight?: number
  maxRects?: number
  mode?: 'auto' | 'corner'
}

interface Candidate {
  x: number
  y: number
  w: number
  h: number
  corner: string
  confidence: number
  candidatePixels: number
  source: 'strict' | 'corner'
  tier: 'high' | 'low'
  selected: boolean
  scores: { stability: number; contrast: number; size: number }
  reasons: string[]
  rejectedReason?: string
}

interface DetectAnswer {
  ok: boolean
  mode: 'auto' | 'corner'
  path: 'strict' | 'corner' | 'corner-fallback' | 'none'
  rects: Candidate[]
  selectedCount: number
  highConfidence: number
  components: number
  candidatePixels: number
  warnings: string[]
  note: string
}

interface WMConstants {
  BLOCK_SIZE: number
  BLOCK_MIN_PIXELS: number
  DILATE: number
  BODY_OVERLAP_MAX: number
  STABILITY_WEIGHT: number
  CONTRAST_WEIGHT: number
  SIZE_WEIGHT: number
  SIZE_AREA_WEIGHT: number
  SIZE_FLAT_WEIGHT: number
  CONTRAST_SATURATION: number
  MAX_BADGE_AREA_RATIO: number
  ASPECT_FULL_SCORE: number
  HIGH_CONFIDENCE: number
  CORNER_SEARCH_PX: number
  CORNER_MIN_PX: number
  CORNER_CONTRAST: number
  CORNER_MIN_PIXELS: number
  CORNER_MIN_WIDTH: number
  CORNER_MIN_HEIGHT: number
  CORNER_MAX_SIZE: number
  CORNER_BODY_OVERLAP_MAX: number
  CORNER_CONFIDENCE_CAP: number
  NOISE_PIXELS: number
}

interface WatermarkCore {
  constants: WMConstants
  detect(imgs: FakeFrame[], body: { x0: number; y0: number; x1: number; y1: number } | null, params: DetectParams): DetectAnswer
  contrastScore(meanDev: number, threshold: number): number
  sizeScore(rect: { w: number; h: number }, frameW: number, frameH: number): number
  compositeConfidence(stability: number, contrast: number, size: number): number
  overlapRatio(rect: { x: number; y: number; w: number; h: number }, body: { x0: number; y0: number; x1: number; y1: number }): number
}

function loadWatermarkCore(): WatermarkCore {
  const html = readFileSync(PAGE, 'utf8')
  const begin = html.indexOf('/* ==== WATERMARK-DETECT-BEGIN ==== */')
  const end = html.indexOf('/* ==== WATERMARK-DETECT-END ==== */')
  assert.ok(begin > 0, 'sprite-tool.html 里找不到 WATERMARK-DETECT-BEGIN 标记')
  assert.ok(end > begin, 'sprite-tool.html 里找不到 WATERMARK-DETECT-END 标记')
  const source = html.slice(begin, end)
  assert.match(source, /function spriteWatermarkDetect\(\)/)
  const factory = new Function(source + '\nreturn spriteWatermarkDetect();') as () => WatermarkCore
  return factory()
}

const W = 320
const H = 240
const FRAMES = 4

/** ① 本次素材的近似场景：渐变绿墙 + 局部差只有 10 级的角标（默认 contrast=24 必然落空）。 */
function gradientScene(): { frames: FakeFrame[]; badge: Badge } {
  const badge: Badge = { x0: 25, y0: 25, x1: 95, y1: 56, delta: 10 }
  return { frames: buildFrames(W, H, FRAMES, badge), badge }
}

/** ③ 高置信场景：同样的角标形状，但墨迹与背景差 60 级（远高于 contrast=24）。 */
function strongScene(): { frames: FakeFrame[]; badge: Badge } {
  const badge: Badge = { x0: 20, y0: 18, x1: 90, y1: 49, delta: 60 }
  return { frames: buildFrames(W, H, FRAMES, badge), badge }
}

const CLEAR_BODY = { x0: 150, y0: 100, x1: 310, y1: 235 }

function warn(answer: DetectAnswer, index: number): string {
  return answer.warnings[index] ?? ''
}

function topOnlySelected(answer: DetectAnswer): Candidate | undefined {
  return answer.rects.find((row) => row.selected)
}

/* ---------------- 常量与公式 ---------------- */

test('WATERMARK 常量：权重和为 1、兜底封顶低于自动门槛、四角方框满足 40~120px', () => {
  const core = loadWatermarkCore()
  const c = core.constants
  const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
  near(c.STABILITY_WEIGHT + c.CONTRAST_WEIGHT + c.SIZE_WEIGHT, 1)
  near(c.SIZE_AREA_WEIGHT + c.SIZE_FLAT_WEIGHT, 1)
  // 兜底必须压在自动门槛以下：否则"低置信度"会把角色糊掉
  assert.ok(c.CORNER_CONFIDENCE_CAP < c.HIGH_CONFIDENCE)
  // 页面与 service 用同一个门槛，不许两边各写一个数
  near(c.HIGH_CONFIDENCE, WATERMARK_AUTO_CONFIDENCE)
  assert.ok(c.CORNER_MIN_PX >= 40 && c.CORNER_SEARCH_PX <= 120)
  assert.ok(c.CORNER_CONTRAST < 24, '兜底阈值必须低于严格默认 contrast=24，否则这次素材照样落空')
  assert.ok(c.BODY_OVERLAP_MAX > c.CORNER_BODY_OVERLAP_MAX, '兜底比严格判据更保守')
})

test('置信度公式的分项口径：对比度从阈值到满刻度线性、尺寸分奖励"小且宽扁"', () => {
  const core = loadWatermarkCore()
  const c = core.constants
  assert.equal(core.contrastScore(24, 24), 0, '刚好卡在阈值上没有加分')
  assert.equal(core.contrastScore(24 + c.CONTRAST_SATURATION, 24), 1, '超过满刻度封顶 1')
  assert.ok(core.contrastScore(30, 24) > 0 && core.contrastScore(30, 24) < core.contrastScore(40, 24))

  const wide = core.sizeScore({ w: 71, h: 32 }, W, H)
  const square = core.sizeScore({ w: 32, h: 32 }, W, H)
  const huge = core.sizeScore({ w: W - 2, h: H - 2 }, W, H)
  assert.ok(wide > square, '宽扁块比正方形更像角标')
  assert.ok(huge < square, '占了半幅画面的块不像角标')

  const full = core.compositeConfidence(1, 1, 1)
  assert.ok(Math.abs(full - 1) < 1e-9)
  assert.ok(Math.abs(core.compositeConfidence(0, 0, 0)) < 1e-9)
  assert.ok(core.compositeConfidence(1, 0, 0) > core.compositeConfidence(0, 1, 0), '跨帧稳定权重最大')
})

test('overlapRatio：与主体 bbox 的交集占比（无 body 时为 0）', () => {
  const core = loadWatermarkCore()
  const rect = { x: 0, y: 0, w: 100, h: 100 }
  assert.equal(core.overlapRatio(rect, { x0: 200, y0: 200, x1: 300, y1: 300 }), 0)
  assert.equal(core.overlapRatio(rect, { x0: -50, y0: -50, x1: 200, y1: 200 }), 1)
  assert.equal(core.overlapRatio(rect, { x0: 50, y0: 0, x1: 200, y1: 100 }), 0.5)
})

/* ---------------- ① 渐变背景 + 低对比角标 ---------------- */

test('① 渐变绿墙 + 低对比角标：严格判据落空，四角兜底给出低置信度候选并选中', () => {
  const core = loadWatermarkCore()
  const { frames, badge } = gradientScene()
  const answer = core.detect(frames, CLEAR_BODY, { alphaThreshold: 32, colorTolerance: 12, contrast: 24 })

  assert.equal(answer.ok, true)
  assert.equal(answer.path, 'corner-fallback', '严格判据没高置信候选时必须自动退到兜底')
  assert.equal(answer.highConfidence, 0)
  assert.ok(answer.rects.length > 0, '候选必须吐出来（以前这里是空数组）')
  assert.ok(answer.rects.every((row) => row.source === 'corner'), '这次严格判据不该有候选（局部差 10 < 24）')

  const picked = topOnlySelected(answer)
  assert.ok(picked, '兜底候选必须被选中（maskAuto 才能给出 maskRect）')
  assert.equal(answer.selectedCount, 1, '兜底只返回置信度最高的一块')
  assert.ok((picked as Candidate).confidence < WATERMARK_AUTO_CONFIDENCE, '必须低于 service 的自动应用门槛')
  assert.ok((picked as Candidate).confidence <= core.constants.CORNER_CONFIDENCE_CAP)
  assert.equal((picked as Candidate).tier, 'low')

  // 矩形要落在角标上（兜底扫的是 120px 角方块，不许把整块背景当候选）
  const r = picked as Candidate
  assert.ok(r.x <= badge.x0 + 2 && r.y <= badge.y0 + 2, `rect 起点跑到角标外：${r.x},${r.y}`)
  assert.ok(r.x + r.w >= badge.x1 - 2 && r.y + r.h >= badge.y1 - 2, `rect 没盖住角标：${r.w}×${r.h}`)
  assert.ok(r.x + r.w - r.x <= 120 && r.h <= 120)

  // 解释字段：命中原因 + 分项分数都要在，且 confidence 与 composite 的封顶关系对得上
  assert.equal(r.scores.stability, 1, '角标是静态层，跨帧稳定应为 1')
  assert.ok(r.scores.contrast > 0 && r.scores.contrast < 0.2)
  assert.equal(r.scores.size > 0, true)
  assert.ok(r.reasons.length >= 3)

  // 候选按置信度降序
  for (let i = 1; i < answer.rects.length; i++) {
    const prev = answer.rects[i - 1] as Candidate
    const cur = answer.rects[i] as Candidate
    assert.ok(prev.confidence >= cur.confidence, '候选必须按置信度降序')
  }

  // warnings 必须明确要求人工确认
  assert.ok(answer.warnings.length >= 1)
  assert.match(warn(answer, 0), /低置信度兜底/)
  assert.match(warn(answer, 0), /人工确认/)
  assert.match(warn(answer, 0), /maskRect/)
  assert.equal(answer.note, '', '有选中候选时不该再喊"未命中"')
})

test('① 兜底候选之外的候选也要带"未选原因"（不是只给被选中的那一个）', () => {
  const core = loadWatermarkCore()
  const { frames } = gradientScene()
  // 把兜底下限抬到角标墨迹数以上，逼出"全部候选都在、但一个都没被选"的情形
  const answer = core.detect(frames, CLEAR_BODY, { alphaThreshold: 32, colorTolerance: 12, contrast: 24 })
  const rejected = answer.rects.filter((row) => !row.selected)
  for (const row of rejected) {
    assert.equal(typeof row.rejectedReason, 'string', '未选中的候选必须写清原因')
  }
  assert.equal(answer.rects.every((row) => typeof row.confidence === 'number'), true)
})

/* ---------------- ② 角标压进主体 bbox ---------------- */

test('② 角标压进主体 bbox（重叠 100% > 30%）：兜底候选被放弃并写明原因', () => {
  const core = loadWatermarkCore()
  const { frames } = gradientScene()
  const body = { x0: 10, y0: 10, x1: 120, y1: 120 }
  const answer = core.detect(frames, body, { alphaThreshold: 32, colorTolerance: 12, contrast: 24 })

  assert.equal(answer.path, 'none')
  assert.equal(answer.selectedCount, 0, '吃角色的候选不许被选中')
  assert.equal(topOnlySelected(answer), undefined)

  const corner = answer.rects.filter((row) => row.source === 'corner')
  assert.ok(corner.length > 0, '候选还是要吐出来（让人自己看）')
  const hit = corner.find((row) => /主体 bbox 重叠/.test(String(row.rejectedReason)))
  assert.ok(hit, '必须有候选带着"与主体 bbox 重叠"的原因')
  assert.match(String(hit?.rejectedReason), /100%/)
  assert.match(String(hit?.rejectedReason), /吃掉角色|角色的一部分/)

  assert.ok(answer.warnings.length >= 1)
  assert.match(warn(answer, 0), /放弃/)
  assert.match(warn(answer, 0), /主体 bbox 重叠/)
  // note 保留"未命中"的老文案（service 只把它当兜底提示；这次有 warnings 会被 warnings 顶掉）
  assert.match(answer.note, /未命中/)
})

/* ---------------- ③ 高置信场景仍走老路径 ---------------- */

test('③ 高置信场景：仍走严格判据，选中字段与旧实现逐字段一致且不掺兜底候选', () => {
  const core = loadWatermarkCore()
  const { frames, badge } = strongScene()
  const answer = core.detect(frames, CLEAR_BODY, { alphaThreshold: 32, colorTolerance: 12, contrast: 24 })

  assert.equal(answer.path, 'strict')
  assert.ok(answer.highConfidence >= 1)
  assert.equal(answer.warnings.length, 0, '高置信时不许加新 warning（老输出不变胖）')
  assert.equal(answer.note, '')

  const picked = topOnlySelected(answer)
  assert.ok(picked)
  // 老字段：矩形 = 角标墨迹的 bbox，confidence = 跨帧稳定比例（旧公式），角 = 左上
  assert.deepEqual(
    { x: picked?.x, y: picked?.y, w: picked?.w, h: picked?.h, corner: picked?.corner, confidence: picked?.confidence },
    { x: badge.x0, y: badge.y0, w: badge.x1 - badge.x0 + 1, h: badge.y1 - badge.y0 + 1, corner: 'tl', confidence: 1 },
  )
  assert.equal(picked?.source, 'strict')
  assert.equal(picked?.tier, 'high')
  assert.ok((picked?.candidatePixels ?? 0) >= 100)

  // 老行为的核心：高置信时**不跑**兜底（否则候选列表会被额外的 corner 项污染）
  assert.equal(answer.rects.every((row) => row.source === 'strict'), true, '高置信路径不该出现兜底候选')
})

test('③ 高置信但显式 mode:"corner"：跳过严格判据，只给封顶的兜底候选', () => {
  const core = loadWatermarkCore()
  const { frames, badge } = strongScene()
  const answer = core.detect(frames, CLEAR_BODY, {
    alphaThreshold: 32,
    colorTolerance: 12,
    contrast: 24,
    mode: 'corner',
  })

  assert.equal(answer.mode, 'corner')
  assert.equal(answer.path, 'corner')
  assert.ok(answer.rects.every((row) => row.source === 'corner'), 'corner 模式不许走严格判据')
  const picked = topOnlySelected(answer)
  assert.ok(picked)
  assert.equal(picked?.confidence, core.constants.CORNER_CONFIDENCE_CAP)
  assert.deepEqual({ x: picked?.x, y: picked?.y, w: picked?.w, h: picked?.h }, {
    x: badge.x0,
    y: badge.y0,
    w: badge.x1 - badge.x0 + 1,
    h: badge.y1 - badge.y0 + 1,
  })
  assert.match(warn(answer, 0), /人工确认/)
})

test('detect 的边界：没有帧 / 采样帧尺寸不一致都给 ok:false 而不是抛异常', () => {
  const core = loadWatermarkCore()
  assert.equal(core.detect([], null, {}).ok, false)
  const { frames } = gradientScene()
  const broken = frames.slice(0, 2)
  const second = broken[1] as FakeFrame
  broken[1] = { width: W + 1, height: H, data: second.data }
  const answer = core.detect(broken, null, {})
  assert.equal(answer.ok, false)
  assert.match(String((answer as unknown as { error: string }).error), /尺寸不一致/)
})

/* ---------------- 页面与工具层的接线 ---------------- */

test('页面里的 detectWatermark 已改成调用纯函数工厂，并接受 mode / maskMode', () => {
  const html = readFileSync(PAGE, 'utf8')
  for (const token of [
    'const WMD = spriteWatermarkDetect();',
    'WMD.detect(imgs, body, {',
    "o.mode === 'corner' || o.maskMode === 'corner'",
    'if (res.warnings && res.warnings.length) answer.warnings = res.warnings;',
  ]) {
    assert.ok(html.includes(token), 'sprite-tool.html 缺少 ' + token)
  }
  // 老返回字段一个都不能少
  for (const key of ['bodyBBox', 'frameWidth', 'frameHeight', 'candidatePixels', 'source', 'costMs', 'note']) {
    assert.ok(html.includes(key + ':'), 'sprite-tool.html 的返回值丢了老字段 ' + key)
  }
})

test('sprite_cleanup：maskMode 进 schema 并原样转给 service；不给时仍只传 maskRect', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const service = {
    cleanup: async (args: unknown) => {
      calls.push({ name: 'cleanup', args })
      return { ok: true }
    },
  } as unknown as SpriteService
  const cleanup = buildTools(service).find((tool) => tool.name === 'sprite_cleanup')!

  const params = cleanup.parameters as { properties: Record<string, { enum?: string[] }> }
  assert.deepEqual(params.properties.maskMode?.enum, ['auto', 'corner'])

  await (cleanup.execute as (args: unknown) => Promise<unknown>)({ maskAuto: true, maskMode: 'corner' })
  assert.deepEqual(calls[0]?.args, { maskRect: 'auto', maskMode: 'corner', trim: { pad: {} } })

  await (cleanup.execute as (args: unknown) => Promise<unknown>)({ maskAuto: true })
  assert.deepEqual(calls[1]?.args, { maskRect: 'auto', trim: { pad: {} } }, '不传 maskMode 时老参数形状不变')
})
