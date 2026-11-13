/**
 * sprite-match.test —— 三个重计算原语的判据（不需要浏览器、不需要文件）。
 *
 * 这一层只钉两件事：
 * 1. **算法对不对**：拿合成像素造"已知平移/已知缩放"的样本，看能不能复原到 1~2px。
 *    其中"同一模板在参考帧自身位置必须 ≥0.999"是硬自检——它一次同时验了
 *    NCC 公式、坐标方向（y 朝下）、金字塔各层的坐标换算；这条红了就别看别的数字。
 * 2. **工具接线对不对**：schema 里的参数真能到 service（防"schema 有、实现没接"），
 *    以及三档置信度/锚点口径没被写反。
 *
 * 为什么要合成像素而不是真实素材：真实素材没法给出"正确答案"，只能靠人眼看，
 * 而人眼在 ±10px 这个量级上是不可靠的（skill §3 的教训）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cropRgba,
  downsampleGray,
  erodeMask,
  featureConfidence,
  fitFeatureFrame,
  fitSilhouetteFrame,
  iouAt,
  largestComponent,
  maskFromAlpha,
  maskPoints,
  matchTemplate,
  pyramidFactors,
  resampleGray,
  scaleGrid,
  silhouetteConfidence,
  toGray,
  transferAnchor,
  type RgbaImage,
} from '../src/sprite/match.js'
import { buildTools } from '../src/sprite/tools.js'
import type { SpriteService } from '../src/sprite/service.js'

// ─────────────────────────────── 合成像素工具 ───────────────────────────────

/** 全透明（alpha=0）的底图：绿幕素材抠完之后就是这样。 */
function blank(width: number, height: number): RgbaImage {
  return { width, height, rgba: new Uint8Array(width * height * 4) }
}

function opaque(width: number, height: number, level = 128): RgbaImage {
  const image = blank(width, height)
  for (let i = 0; i < width * height; i++) {
    const p = i * 4
    image.rgba[p] = level
    image.rgba[p + 1] = level
    image.rgba[p + 2] = level
    image.rgba[p + 3] = 255
  }
  return image
}

function setPixel(image: RgbaImage, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  const p = (y * image.width + x) * 4
  image.rgba[p] = r
  image.rgba[p + 1] = g
  image.rgba[p + 2] = b
  image.rgba[p + 3] = a
}

/** 画一个**有纹理**的方块（纯色方块方差为 0，NCC 无定义——那正是要测的失败分支）。 */
function paintBlock(image: RgbaImage, x0: number, y0: number, size: number, seed = 0): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (x * 13 + y * 29 + ((x * y + seed) % 17) * 11) % 256
      setPixel(image, x0 + x, y0 + y, v, (v * 7) % 256, 255 - v)
    }
  }
}

function paintCircle(image: RgbaImage, cx: number, cy: number, radius: number, level = 220): void {
  const r2 = radius * radius
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) setPixel(image, x, y, level, level, level)
    }
  }
}

/**
 * 用"连续函数"渲染一帧：`value(X,Y) = sample((X−dx)/scale, (Y−dy)/scale)`。
 *
 * 每个像素做 3×3 超采样：这样目标帧就是参考帧**真的缩放+平移**（而不是把参考帧的
 * 二值结果硬搬过去），且两边的抗锯齿水平一致——否则测出来的分数是采样差，不是算法差。
 */
function renderMapped(
  width: number,
  height: number,
  scale: number,
  dx: number,
  dy: number,
  sample: (x: number, y: number) => number,
): RgbaImage {
  const image = blank(width, height)
  const offsets = [-1 / 3, 0, 1 / 3]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (const oy of offsets) {
        for (const ox of offsets) {
          sum += sample((x + 0.5 + ox - dx) / scale, (y + 0.5 + oy - dy) / scale)
        }
      }
      const value = Math.max(0, Math.min(255, sum / 9))
      const p = (y * width + x) * 4
      image.rgba[p] = value
      image.rgba[p + 1] = value
      image.rgba[p + 2] = value
      image.rgba[p + 3] = 255
    }
  }
  return image
}

/**
 * 两个"不变特征"：同心圆环（像眼睛/纽扣那样的靶环）。
 *
 * 为什么不用单个高斯斑点：高斯在缩放 1.13 倍时与 1.00 倍仍然高度相关（NCC≈0.99），
 * 尺度根本判不出来——**特征必须自带尺度信息**（环半径就是天然的尺子）。
 */
function sampleFeature(x: number, y: number): number {
  const ring = (cx: number, cy: number, radius: number, width: number, amp: number): number => {
    const d = Math.hypot(x - cx, y - cy)
    return amp * Math.exp(-((d - radius) ** 2) / (2 * width * width))
  }
  const blob = (cx: number, cy: number, sigma: number, amp: number): number =>
    amp * Math.exp(-(((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma)))
  return (
    36 +
    ring(42, 42, 10, 2.5, 170) +
    ring(42, 42, 5, 2, 120) +
    blob(42, 42, 3, 70) +
    ring(132, 152, 7.5, 2, 160) +
    ring(132, 152, 3.5, 1.6, 120) +
    8 * Math.sin(x / 9) * Math.cos(y / 11)
  )
}

// ─────────────────────────────── 基础量 ───────────────────────────────

test('toGray：按 alpha 预乘（透明区一律 0，keyed/raw 同一套公式）', () => {
  const image = blank(2, 1)
  setPixel(image, 0, 0, 255, 255, 255, 255)
  setPixel(image, 1, 0, 255, 255, 255, 0)
  const gray = toGray(image)
  assert.equal(gray.data[0], 255, '不透明白 = 255')
  assert.equal(gray.data[1], 0, '全透明像素不能保留亮度，否则羽化边会被当成实心内容')
})

test('cropRgba：越界要带中文原因抛错（不静默给半张图）', () => {
  const image = opaque(40, 30)
  const cropped = cropRgba(image, { x: 5, y: 6, w: 10, h: 8 })
  assert.equal(cropped.width, 10)
  assert.equal(cropped.height, 8)
  assert.equal(cropped.rgba.length, 10 * 8 * 4)
  assert.deepEqual([...cropped.rgba.subarray(0, 4)], [128, 128, 128, 255])
  assert.throws(() => cropRgba(image, { x: 35, y: 0, w: 10, h: 8 }), /超出了帧 40x30/)
  assert.throws(() => cropRgba(image, { x: 0, y: 0, w: 0, h: 8 }), /宽高必须为正/)
})

test('金字塔层数按模板短边定（<16 不做降采样：那层只剩噪声）', () => {
  assert.deepEqual(pyramidFactors(64, 40), [4, 2, 1])
  assert.deepEqual(pyramidFactors(40, 24), [2, 1])
  assert.deepEqual(pyramidFactors(12, 12), [1])
})

test('scaleGrid：默认 0.85~1.15 step 0.01 = 31 档；超上限时均分整个区间而不是硬截断', () => {
  const grid = scaleGrid()
  assert.equal(grid.length, 31)
  assert.equal(grid[0], 0.85)
  assert.equal(grid[30], 1.15)
  const wide = scaleGrid({ min: 0.5, max: 2, step: 0.01 }, { min: 0.85, max: 1.15, step: 0.01 }, 9)
  assert.equal(wide.length, 9)
  assert.equal(wide[0], 0.5)
  assert.equal(wide[8], 2, '截断会让"想要 2 倍"的调用方永远搜不到')
})

// ─────────────────────────────── 任务 1：模板匹配 ───────────────────────────────

test('sprite_match 硬自检：同一模板在参考帧自身位置必须命中且 score ≥ 0.999', () => {
  const frame = opaque(220, 180, 96)
  paintBlock(frame, 37, 52, 24, 3)
  paintBlock(frame, 150, 120, 20, 9)
  const template = cropRgba(frame, { x: 37, y: 52, w: 24, h: 24 })
  const hit = matchTemplate(frame, template)
  assert.equal(hit.found, true)
  assert.equal(hit.x, 37, 'x 方向（左上原点）不许镜像')
  assert.equal(hit.y, 52, 'y 方向（左上原点、y 朝下）不许镜像')
  assert.ok(hit.score >= 0.999, `自匹配分值应 ≈1，实际 ${hit.score}`)
  assert.equal(hit.space, 'frame')
})

test('sprite_match：图案被搬到别处时能精确复原平移（合成图误差 0px）', () => {
  const templateFrame = opaque(200, 200, 80)
  paintBlock(templateFrame, 20, 20, 28, 5)
  const target = opaque(200, 200, 80)
  paintBlock(target, 118, 74, 28, 5) // 与模板帧同一块图案，平移 (+98, +54)
  const hit = matchTemplate(target, cropRgba(templateFrame, { x: 20, y: 20, w: 28, h: 28 }))
  assert.equal(hit.found, true)
  assert.equal(hit.x, 118)
  assert.equal(hit.y, 74)
  assert.ok(hit.score >= 0.999, `分值 ${hit.score}`)
})

test('sprite_match：searchRect 生效（区域外有更高相关的干扰块也不该被选中）', () => {
  const templateFrame = opaque(200, 160, 90)
  paintBlock(templateFrame, 10, 10, 22, 7)
  const target = opaque(200, 160, 90)
  paintBlock(target, 130, 100, 22, 7)
  paintBlock(target, 20, 20, 22, 7) // 更早出现在搜索区里的同一块
  const hit = matchTemplate(target, cropRgba(templateFrame, { x: 10, y: 10, w: 22, h: 22 }), {
    searchRect: { x: 120, y: 90, w: 80, h: 70 },
  })
  assert.equal(hit.found, true)
  assert.equal(hit.x, 130)
  assert.equal(hit.y, 100)
})

test('sprite_match：低于阈值 found:false，但仍回传最高分位置（"差多少"要看得见）', () => {
  const templateFrame = opaque(120, 120, 70)
  paintBlock(templateFrame, 10, 10, 24, 1)
  const target = opaque(120, 120, 70)
  paintBlock(target, 60, 60, 24, 99) // 完全不同的一块
  const hit = matchTemplate(target, cropRgba(templateFrame, { x: 10, y: 10, w: 24, h: 24 }), { minScore: 0.85 })
  assert.equal(hit.found, false)
  assert.match(String(hit.reason), /低于阈值/)
  assert.equal(typeof hit.x, 'number')
})

test('sprite_match：纯色模板（方差 0）判失败并说明原因，不许给 1.0', () => {
  const frame = opaque(80, 80, 120)
  const flat = opaque(12, 12, 120)
  const hit = matchTemplate(frame, flat, { minScore: 0 })
  assert.equal(hit.found, false)
  assert.ok(hit.reason === undefined || hit.score === 0, 'NCC 无定义时不能报"找得挺好"')
})

test('sprite_match：模板比搜索区域大时说清楚放不下，而不是硬搜', () => {
  const frame = opaque(60, 60, 90)
  paintBlock(frame, 10, 10, 20, 2)
  const hit = matchTemplate(frame, cropRgba(frame, { x: 10, y: 10, w: 20, h: 20 }), {
    searchRect: { x: 0, y: 0, w: 12, h: 12 },
  })
  assert.equal(hit.found, false)
  assert.match(String(hit.reason), /比模板/)
})

// ─────────────────────────────── 任务 2：特征反推 ───────────────────────────────

test('feature_fit：在"已知缩放 + 已知平移"的合成图上复原 scale/dx/dy（误差 ≤1px）', () => {
  const reference = renderMapped(200, 200, 1, 0, 0, sampleFeature)
  const target = renderMapped(260, 260, 1.1, 15, -10, sampleFeature)
  const templates = [
    { rect: { x: 28, y: 28, w: 28, h: 28 } },
    { rect: { x: 118, y: 138, w: 28, h: 28 } },
  ]
  const fit = fitFeatureFrame(reference, target, { templates })
  assert.ok(Math.abs(fit.scale - 1.1) <= 0.01 + 1e-9, `scale=${fit.scale}`)
  assert.ok(Math.abs(fit.dx - 15) <= 1, `dx=${fit.dx}`)
  assert.ok(Math.abs(fit.dy + 10) <= 1, `dy=${fit.dy}`)
  assert.ok(fit.score >= 0.9, `score=${fit.score}`)
  assert.ok(fit.residualPx < 2, `两个模板反推的平移差应 <2px，实际 ${fit.residualPx}`)
  assert.equal(featureConfidence(fit.score, fit.residualPx).confidence, 'high')
})

test('feature_fit：单模板只能定平移（scale 保持 1 也不会崩），且不会假装高置信', () => {
  const reference = renderMapped(160, 160, 1, 0, 0, sampleFeature)
  const target = renderMapped(200, 200, 1, 20, 12, sampleFeature)
  const fit = fitFeatureFrame(reference, target, { templates: [{ rect: { x: 28, y: 28, w: 28, h: 28 } }] })
  assert.ok(Math.abs(fit.dx - 20) <= 1, `dx=${fit.dx}`)
  assert.ok(Math.abs(fit.dy - 12) <= 1, `dy=${fit.dy}`)
  assert.equal(fit.residualPx, 0, '单模板没有"两个模板间距"可比，残差只能是 0（别编一个数）')
})

test('feature_fit：种子只影响速度不影响结论（同帧喂 seed 与不喂结果一致）', () => {
  const reference = renderMapped(180, 180, 1, 0, 0, sampleFeature)
  const target = renderMapped(220, 220, 1.05, 8, 6, sampleFeature)
  const templates = [{ rect: { x: 28, y: 28, w: 28, h: 28 } }, { rect: { x: 118, y: 138, w: 28, h: 28 } }]
  const cold = fitFeatureFrame(reference, target, { templates })
  const warm = fitFeatureFrame(reference, target, {
    templates,
    seed: { scale: cold.scale, positions: cold.perTemplate.map((one) => ({ x: one.x, y: one.y })) },
  })
  assert.equal(warm.scale, cold.scale)
  assert.equal(warm.dx, cold.dx)
  assert.equal(warm.dy, cold.dy)
})

test('transferAnchor：p_target = p_ref × scale + (dx,dy)，两个口径都给且互为 1−y', () => {
  const moved = transferAnchor({
    anchorX: 0.5,
    anchorY: 0.2,
    refWidth: 200,
    refHeight: 200,
    scale: 2,
    dx: 10,
    dy: -20,
    width: 400,
    height: 400,
  })
  // 参考锚点像素 = (100, 160)；缩放+平移 → (210, 300)；归一化 → (0.525, 1−0.75=0.25)
  assert.equal(moved.anchorX, 0.525)
  assert.equal(moved.anchorY, 0.25)
  assert.equal(moved.anchorYTopDown, 0.75)
  assert.equal(moved.anchorY + moved.anchorYTopDown, 1)
})

// ─────────────────────────────── 任务 3：剪影拟合 ───────────────────────────────

test('maskFromAlpha / body-core：只留最大连通域（去特效、去手），再腐蚀 1px', () => {
  const image = blank(120, 120)
  paintCircle(image, 40, 40, 20) // 主体
  paintCircle(image, 105, 20, 6) // 漂浮特效
  const raw = maskFromAlpha(image, { mode: 'raw' })
  const core = maskFromAlpha(image, { mode: 'body-core' })
  const rawPoints = maskPoints(raw)
  const corePoints = maskPoints(core)
  assert.ok(corePoints.area < rawPoints.area, 'body-core 要剔掉特效并腐蚀一圈')
  assert.ok(corePoints.area > 800, `主体还在（实际 ${corePoints.area}）`)
  // 特效所在的角落必须是空的
  assert.equal(core.data[20 * 120 + 105], 0)
})

test('erodeMask / largestComponent：小样本上可手算的期望', () => {
  const mask = { width: 5, height: 5, data: new Uint8Array(25) }
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) mask.data[y * 5 + x] = 1
  const eroded = erodeMask(mask, 1)
  const points = maskPoints(eroded)
  assert.equal(points.area, 9, '5×5 实心块腐蚀一次剩 3×3')
  const withHole = { width: 9, height: 5, data: new Uint8Array(45) }
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) withHole.data[y * 9 + x] = 1
  withHole.data[2 * 9 + 7] = 1
  const biggest = largestComponent(withHole)
  assert.equal(maskPoints(biggest).area, 9)
  assert.equal(biggest.data[2 * 9 + 7], 0, '小的那一块要被清掉')
})

test('iouAt：完全重合 = 1，完全错开 = 0', () => {
  const mask = blank(40, 40)
  paintCircle(mask, 20, 20, 10)
  const points = maskPoints(maskFromAlpha(mask, { mode: 'raw' }))
  assert.equal(iouAt(maskFromAlpha(mask, { mode: 'raw' }), points, 0, 0, points.area), 1)
  assert.ok(iouAt(maskFromAlpha(mask, { mode: 'raw' }), points, 30, 30, points.area) < 0.05)
})

test('silhouette_fit：同剪影放大 1.1 倍 + 平移，能复原 scale 并给出 IoU ≥0.9', () => {
  const reference = blank(200, 200)
  paintCircle(reference, 100, 100, 45)
  const target = blank(240, 240)
  paintCircle(target, 120, 90, 49.5) // 圆心 (100,100) → (110,100) 再平移 (+10,−20)
  const fit = fitSilhouetteFrame(reference, target, {})
  assert.ok(Math.abs(fit.scale - 1.1) < 1e-6, `scale=${fit.scale}`)
  assert.ok(Math.abs(fit.dx - 10) <= 2, `dx=${fit.dx}`)
  assert.ok(Math.abs(fit.dy + 20) <= 2, `dy=${fit.dy}`)
  assert.ok(fit.iou >= 0.9, `iou=${fit.iou}`)
  assert.equal(silhouetteConfidence(fit.iou).confidence, 'high')
})

test('silhouette_fit：目标帧剪影是空的要明确说原因（不返回 0 分"成功"）', () => {
  const reference = blank(120, 120)
  paintCircle(reference, 60, 60, 30)
  const empty = blank(120, 120)
  const fit = fitSilhouetteFrame(reference, empty, {})
  assert.equal(fit.iou, 0)
  assert.match(String(fit.reason), /剪影是空的/)
  assert.equal(silhouetteConfidence(0).confidence, 'low')
})

test('三档判定：0.75~0.90 只采用 scale、锚点标 semantic-required；<0.75 不给锚点', () => {
  assert.deepEqual(silhouetteConfidence(0.95), { confidence: 'high', anchorSource: 'silhouette' })
  const medium = silhouetteConfidence(0.82)
  assert.equal(medium.confidence, 'medium')
  assert.equal(medium.anchorSource, 'semantic-required')
  assert.match(String(medium.reason), /只采用 scale/)
  const low = silhouetteConfidence(0.6)
  assert.equal(low.confidence, 'low')
  assert.equal(low.anchorSource, null)
  assert.equal(featureConfidence(0.92, 5).confidence, 'medium', '分够但双特征打架 → 不许 high')
  assert.equal(featureConfidence(0.7, 0).confidence, 'low')
})

// ─────────────────────────────── 影像层：量化误差汇总 ───────────────────────────────

test('降采样/重采样：1:1 不做无谓模糊；4× 降采样把同一块内容缩到 1/4 位置', () => {
  const frame = opaque(160, 160, 100)
  paintBlock(frame, 44, 24, 32, 11)
  const gray = toGray(frame)
  assert.equal(resampleGray(gray, 1), gray, 'scale===1 必须原样返回')

  const tpl = toGray(cropRgba(frame, { x: 44, y: 24, w: 32, h: 32 }))
  const quarter = downsampleGray(tpl, 4)
  assert.equal(quarter.width, 8, '32 / 4 = 8')
  assert.equal(quarter.height, 8)
  const bigQuarter = downsampleGray(gray, 4)
  const hit = matchTemplate(
    { width: bigQuarter.width, height: bigQuarter.height, rgba: quarterToRgba(bigQuarter) },
    { width: quarter.width, height: quarter.height, rgba: quarterToRgba(quarter) },
    { minScore: 0.999 },
  )
  assert.equal(hit.found, true)
  assert.deepEqual([hit.x, hit.y], [11, 6], '在 1/4 图上位置应是原位置的 1/4（44/4, 24/4）')
})

/** 灰度图 -> 不透明 RGBA（只为把降采样结果喂回 matchTemplate）。 */
function quarterToRgba(gray: { width: number; height: number; data: Float32Array }): Uint8Array {
  const rgba = new Uint8Array(gray.width * gray.height * 4)
  for (let i = 0; i < gray.data.length; i++) {
    const value = Math.max(0, Math.min(255, Math.round(gray.data[i]!)))
    rgba[i * 4] = value
    rgba[i * 4 + 1] = value
    rgba[i * 4 + 2] = value
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

// ─────────────────────────────── 工具接线 ───────────────────────────────

function stubService(): { service: SpriteService; calls: Array<{ name: string; args: unknown }> } {
  const calls: Array<{ name: string; args: unknown }> = []
  const record = (name: string) => async (args: unknown) => {
    calls.push({ name, args })
    return { ok: true, marker: name } as never
  }
  const service = {
    match: record('match'),
    featureFit: record('featureFit'),
    silhouetteFit: record('silhouetteFit'),
  } as unknown as SpriteService
  return { service, calls }
}

test('三个新工具的形状：走六键、名字蛇形、描述自解释', () => {
  const { service } = stubService()
  const tools = new Map(buildTools(service).map((tool) => [String(tool.name), tool]))
  for (const name of ['sprite_match', 'sprite_feature_fit', 'sprite_silhouette_fit']) {
    const tool = tools.get(name)
    assert.ok(tool, `缺工具 ${name}`)
    assert.equal(typeof tool!.execute, 'function')
    assert.equal(typeof tool!.timeoutMs, 'number')
    assert.ok(Number(tool!.timeoutMs) >= 120_000, `${name} 要跑像素搜索，超时得给足`)
    assert.ok(String(tool!.description).length > 100, `${name} 的描述要说清口径`)
    const parameters = tool!.parameters as { type?: string; properties?: Record<string, { description?: string }> }
    assert.equal(parameters.type, 'object')
    assert.match(String(tool!.description), /源帧像素/, `${name} 必须写明坐标空间是源帧像素`)
  }
  const match = tools.get('sprite_match')!
  assert.deepEqual((match.parameters as { required?: string[] }).required, ['templateRect'])
  const feature = tools.get('sprite_feature_fit')!
  assert.deepEqual((feature.parameters as { required?: string[] }).required, ['templates'])
})

test('sprite_match：templateRect 真的转到 service；缺了要拒绝', async () => {
  const { service, calls } = stubService()
  const tool = buildTools(service).find((one) => one.name === 'sprite_match')!
  await assert.rejects(
    async () => (tool.execute as (args: unknown) => Promise<unknown>)({}),
    /templateRect/,
  )
  await (tool.execute as (args: unknown) => Promise<unknown>)({
    templateFrame: 0,
    templateRect: { x: 10, y: 20, w: 24, h: 24 },
    inFrame: 3,
    searchRect: { x: 0, y: 0, w: 200, h: 200 },
    minScore: 0.9,
    source: 'raw',
  })
  const call = calls.find((one) => one.name === 'match')!
  assert.deepEqual(call.args, {
    templateRect: { x: 10, y: 20, w: 24, h: 24 },
    templateFrame: 0,
    inFrame: 3,
    searchRect: { x: 0, y: 0, w: 200, h: 200 },
    minScore: 0.9,
    source: 'raw',
  })
})

test('sprite_feature_fit：templates / search.frames / search.scale / 锚点都转得过去', async () => {
  const { service, calls } = stubService()
  const tool = buildTools(service).find((one) => one.name === 'sprite_feature_fit')!
  await (tool.execute as (args: unknown) => Promise<unknown>)({
    reference: { imagePath: 'D:\\out\\idle-0.png' },
    templates: [{ rect: { x: 10, y: 10, w: 20, h: 20 }, weight: 2 }, { rect: { x: 60, y: 80, w: 18, h: 18 } }],
    anchorX: 0.4164,
    anchorY: 0.12,
    search: { frames: 'all', scale: { min: 0.9, max: 1.1, step: 0.02 } },
  })
  const call = calls.find((one) => one.name === 'featureFit')!
  assert.deepEqual(call.args, {
    reference: { imagePath: 'D:\\out\\idle-0.png' },
    templates: [
      { rect: { x: 10, y: 10, w: 20, h: 20 }, weight: 2 },
      { rect: { x: 60, y: 80, w: 18, h: 18 } },
    ],
    anchorX: 0.4164,
    anchorY: 0.12,
    search: { frames: 'all', scale: { min: 0.9, max: 1.1, step: 0.02 } },
  })
})

test('sprite_feature_fit：没给 rect 的模板要被丢掉，一个都不剩就拒绝', async () => {
  const { service } = stubService()
  const tool = buildTools(service).find((one) => one.name === 'sprite_feature_fit')!
  await assert.rejects(
    async () => (tool.execute as (args: unknown) => Promise<unknown>)({ templates: [{ weight: 1 }] }),
    /templates/,
  )
})

test('sprite_silhouette_fit：mask / target.frames / alphaThreshold 都转得过去', async () => {
  const { service, calls } = stubService()
  const tool = buildTools(service).find((one) => one.name === 'sprite_silhouette_fit')!
  await (tool.execute as (args: unknown) => Promise<unknown>)({
    reference: { frame: 2 },
    target: { frames: [0, 5, 9] },
    mask: 'raw',
    search: { scale: { min: 0.95, max: 1.05, step: 0.01 } },
    alphaThreshold: 40,
    anchorX: 0.5,
    anchorY: 0.1,
  })
  const call = calls.find((one) => one.name === 'silhouetteFit')!
  assert.deepEqual(call.args, {
    reference: { frame: 2 },
    target: { frames: [0, 5, 9] },
    mask: 'raw',
    search: { scale: { min: 0.95, max: 1.05, step: 0.01 } },
    alphaThreshold: 40,
    anchorX: 0.5,
    anchorY: 0.1,
  })
})

// ─────────────────────────────── 性能回归（默认跳，见 DSH_SPRITE_PERF） ───────────────────────────────

/**
 * 预算：`search.frames:"all"` 在 **24 帧、720×966、5 档尺度**下 20 秒内跑完。
 *
 * 默认 `skip`：这套测试在 CI/普通改动里不该每次多花 2 秒（而且时间断言在慢机器上会假红）。
 * 要实测就 `set DSH_SPRITE_PERF=1` 再跑——报告里的数字就是这样得到的。
 */
test(
  '性能预算：24 帧 720×966 × 5 档尺度（剪影）在 20s 内',
  { skip: process.env.DSH_SPRITE_PERF !== '1' },
  (t) => {
    const width = 720
    const height = 966
    const body = (scale: number, dx: number, dy: number): RgbaImage => {
      const image = blank(width, height)
      const cx = (width / 2) * scale + dx
      const cyBody = height * 0.62 * scale + dy
      const cyHead = height * 0.26 * scale + dy
      const rx = 150 * scale
      const ry = 240 * scale
      const head = 96 * scale
      for (let y = Math.floor(cyBody - ry); y <= Math.ceil(cyBody + ry); y++) {
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const nx = (x + 0.5 - cx) / rx
          const ny = (y + 0.5 - cyBody) / ry
          if (nx * nx + ny * ny <= 1) setPixel(image, x, y, 200, 200, 200)
        }
      }
      for (let y = Math.floor(cyHead - head); y <= Math.ceil(cyHead + head); y++) {
        for (let x = Math.floor(cx - head); x <= Math.ceil(cx + head); x++) {
          const ddx = x + 0.5 - cx
          const ddy = y + 0.5 - cyHead
          if (ddx * ddx + ddy * ddy <= head * head) setPixel(image, x, y, 210, 210, 210)
          // 漂浮特效：body-core 要把它剔掉（也顺带压一压耗时）
          const sparkle = Math.hypot(x + 0.5 - (cx + 300 * scale), y + 0.5 - (cyHead - 120 * scale))
          if (sparkle <= 14) setPixel(image, x, y, 255, 255, 255)
        }
      }
      return image
    }
    const reference = body(1, 0, 0)
    const frames = Array.from({ length: 24 }, (_one, index) => body(1 + (index - 12) * 0.005, (index - 12) * 3, (index % 5) - 2))
    const started = Date.now()
    let best: { iou: number; frame: number } | undefined
    for (let index = 0; index < frames.length; index++) {
      const fit = fitSilhouetteFrame(reference, frames[index]!, { scale: { min: 0.9, max: 1.1, step: 0.05 } })
      if (!best || fit.iou > best.iou) best = { iou: fit.iou, frame: index }
    }
    const elapsed = Date.now() - started
    t.diagnostic(`24 帧 × 5 档尺度：${elapsed}ms（最佳帧 ${best?.frame} IoU=${best?.iou}）`)
    assert.ok(best && best.iou >= 0.9, '同角色同姿势的帧至少要有一个 IoU ≥ 0.9')
    assert.ok(elapsed < 20_000, `超预算：${elapsed}ms ≥ 20000ms（要么减帧，要么把默认上限降到 12 帧）`)
  },
)
