/**
 * sprite-contact.test —— 纯核（格子切分 / alpha 包围盒 / 中位数聚合 / 画线合成）的判据。
 *
 * 全部用**合成像素**：每个断言都要求精确的预期值（第几行、几像素高、哪个颜色），
 * 拿真图只会让断言变成"看起来差不多"，而这批代码存在的意义正是"别差不多"。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  adaptiveBaselineBackground,
  anchorConventionWarnings,
  BASELINE_DARK_BG,
  BASELINE_LIGHT_BG,
  cellContentOf,
  clipEdgeThreshold,
  composeBaseline,
  contentLumaOf,
  createImage,
  deviates,
  drawCellOverlay,
  drawHLine,
  drawVLine,
  measureSheet,
  medianOf,
  parseColorHex,
  sampleCellIndices,
  type BaselineCellInput,
} from '../src/sprite/contact.js'

const OPAQUE: [number, number, number, number] = [200, 80, 40, 255]

function blank(width: number, height: number) {
  return createImage(width, height)
}

/** 在图上填一块实心矩形（半开区间）。 */
function fillRect(
  picture: { width: number; height: number; rgba: Uint8Array },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number] = OPAQUE,
): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) picture.rgba.set(color, (y * picture.width + x) * 4)
  }
}

function pixelAt(picture: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const i = (y * picture.width + x) * 4
  return [picture.rgba[i]!, picture.rgba[i + 1]!, picture.rgba[i + 2]!, picture.rgba[i + 3]!]
}

test('medianOf：奇数取中、偶数取均值、空集合抛错（不返回 NaN）', () => {
  assert.equal(medianOf([5]), 5)
  assert.equal(medianOf([7, 3, 5]), 5)
  assert.equal(medianOf([3, 5, 7, 9]), 6)
  assert.equal(medianOf([4, 5]), 5, '4.5 四舍五入成 5')
  assert.throws(() => medianOf([]), /中位数/)
})

test('sampleCellIndices：≤48 全量；>48 等间隔抽 12 格且一定含首末格', () => {
  assert.deepEqual(sampleCellIndices(0), [])
  assert.equal(sampleCellIndices(48).length, 48)
  const picked = sampleCellIndices(49)
  assert.equal(picked.length, 12)
  assert.equal(picked[0], 0, '第一格必须在抽样里')
  assert.equal(picked[picked.length - 1], 48, '最后一格必须在抽样里（不然"末尾空格"永远漏检）')
  assert.deepEqual(picked, [...picked].sort((a, b) => a - b), '抽样顺序要升序')
  assert.equal(new Set(picked).size, picked.length, '不许重复')
})

test('cellContentOf：包围盒、身高、空格子、贴边裁切各有明确结果', () => {
  const sheet = blank(20, 20)
  fillRect(sheet, 2, 3, 8, 9) // 第 0 格：x 2..7, y 3..8 → 高 6（没贴到格子边界）
  const cell = cellContentOf(sheet, { x: 0, y: 0, w: 10, h: 10 }, 0, 0, 0)
  assert.deepEqual(cell.bbox, { x: 2, y: 3, w: 6, h: 6 })
  assert.equal(cell.charHeightPx, 6, '身高 = soleY - headTopY + 1')
  assert.equal(cell.headTopY, 3)
  assert.equal(cell.soleY, 8)
  assert.equal(cell.empty, false)
  assert.equal(cell.clipped, false, '内容离格子边界还有一行，不算被切')

  const empty = cellContentOf(sheet, { x: 10, y: 0, w: 10, h: 10 }, 1, 1, 0)
  assert.equal(empty.empty, true)
  assert.equal(empty.bbox, null)
  assert.equal(empty.charHeightPx, 0, '空格子身高是 0，但 empty=true 说明这是"没内容"不是"高 0"')

  // 内容顶到格子下边缘 = 被切了（这种格子的身高会偏小，必须在 warnings 里点名）
  fillRect(sheet, 12, 5, 18, 10)
  const clipped = cellContentOf(sheet, { x: 10, y: 0, w: 10, h: 10 }, 1, 1, 0)
  assert.equal(clipped.empty, false)
  assert.equal(clipped.soleY, 9)
  assert.equal(clipped.clipped, true, '内容贴到格子边界就该报 clipped')
  // P1-4：报的时候要说清是哪条边、贴了多少像素（6px 宽横切面 → 远超 10px 格边长的阈值 2px）
  assert.equal(clipped.edgePx.bottom, 6)
  assert.deepEqual(clipped.clippedEdges, ['bottom'])
  assert.equal(clipped.clipThreshold.bottom, 2, '10px 的边 → max(2, ceil(0.2)) = 2')
})

test('clipEdgeThreshold：按边长 2% 算，下限 2px（小格子不许 1px 就报）', () => {
  assert.equal(clipEdgeThreshold(217), 5, '217×2% = 4.34 → 5（Boss_Whistle 那批的格宽）')
  assert.equal(clipEdgeThreshold(337), 7)
  assert.equal(clipEdgeThreshold(10), 2, '10px 的边 2% 只有 0.2 → 被下限抬到 2')
  assert.equal(clipEdgeThreshold(20), 2)
  assert.equal(clipEdgeThreshold(0), 2, '没有边长也保底 2px，不返回 0')
})

test('P1-4：贴到 pad 边界的细尖**不报** clipped，真被横切的**必须报**', () => {
  // 40×20 的格子（右边还留 20px，否则最后一格的右边就是图集外边界，不计入贴边统计）
  // 右边界的阈值 = max(2, ceil(20×2%)=1) = 2px
  const padOnly = blank(60, 20)
  fillRect(padOnly, 39, 5, 40, 7) // 只有 2px 贴在右边界（呆毛/抗锯齿那种细尖）
  const sliver = cellContentOf(padOnly, { x: 0, y: 0, w: 40, h: 20 }, 0, 0, 0)
  assert.equal(sliver.edgePx.right, 2, '贴边像素数要如实报出来（人自己判断）')
  assert.deepEqual(sliver.clippedEdges, [], '2px 不比阈值大 → 不算被裁')
  assert.equal(sliver.clipped, false, '贴 pad 边界不是"被裁"，不许再刷这格')

  // 同一条边上一条 13px 的横切面 = 很像真被裁了
  const realCut = blank(60, 20)
  fillRect(realCut, 39, 3, 40, 16)
  const cut = cellContentOf(realCut, { x: 0, y: 0, w: 40, h: 20 }, 0, 0, 0)
  assert.equal(cut.edgePx.right, 13)
  assert.deepEqual(cut.clippedEdges, ['right'])
  assert.equal(cut.clipped, true, '13px > 阈值 2px：这一格必须报')
})

test('measureSheet：clipped 汇总说明"按贴边像素数判定"，并给出最严重的一格的数值', () => {
  const sheet = blank(80, 10) // 3 格 × 20×10（右边还留 20px，否则最后一格的右边就是图集外边界）
  fillRect(sheet, 3, 2, 8, 8) // 第 0 格：干净
  fillRect(sheet, 39, 4, 40, 9) // 第 1 格：右边界 5px（>2 → 报）
  fillRect(sheet, 59, 0, 60, 10) // 第 2 格：右边界 10px（最严重）
  const measured = measureSheet(sheet, { cols: 3, rows: 1, cellWidth: 20, cellHeight: 10 })
  assert.deepEqual(
    measured.perCell.map((cell) => cell.clipped),
    [false, true, true],
  )
  const text = measured.warnings.join('\n')
  assert.match(text, /贴边像素数/)
  assert.match(text, /最严重的是第 2 格（right 边 10px \/ 阈值 2px/)
  assert.match(text, /2\/3 格/, '分母要用量过的格数')
})

test('measureSheet：聚合用中位数，min/max 给抖动，头脚来自"最接近中位数"的那格', () => {
  const sheet = blank(20, 10) // 2 格 × 10×10
  fillRect(sheet, 1, 2, 9, 9) // 第 0 格：y 2..8 → 高 7
  fillRect(sheet, 12, 3, 18, 8) // 第 1 格：y 3..7 → 高 5
  const measured = measureSheet(sheet, { cols: 2, rows: 1, cellWidth: 10, cellHeight: 10 })
  assert.equal(measured.charHeightPx, 6, '(7+5)/2 = 6')
  assert.deepEqual(measured.min, { charHeightPx: 5 })
  assert.deepEqual(measured.max, { charHeightPx: 7 })
  assert.equal(measured.source, 'sheet-rgba')
  assert.equal(measured.totalCells, 2)
  assert.equal(measured.sampled, false)
  assert.equal(measured.perCell.length, 2)
  assert.deepEqual(
    measured.perCell.map((cell) => [cell.index, cell.charHeightPx, cell.headTopY, cell.soleY]),
    [
      [0, 7, 2, 8],
      [1, 5, 3, 7],
    ],
  )
  // 代表格的头脚与中位数最多差 1px（偶数格时的理论极限），perCell 里有真值可对账
  const representativeHeight = measured.soleY! - measured.headTopY! + 1
  assert.ok(
    Math.abs(representativeHeight - measured.charHeightPx) <= 1,
    `头脚与中位数差 ${representativeHeight - measured.charHeightPx}px`,
  )
  // 有空格子 → 必须给 warning（不许假装"高 0px"）
  assert.equal(measured.warnings.length, 0)
})

test('measureSheet：空格子要报出来，全空要报"量不到内容"，>48 格要标 sampled', () => {
  const sheet = blank(20, 10)
  fillRect(sheet, 1, 2, 9, 9)
  const partial = measureSheet(sheet, { cols: 2, rows: 1, cellWidth: 10, cellHeight: 10 })
  assert.match(partial.warnings.join('\n'), /1 格是空的/)

  const allEmpty = measureSheet(blank(20, 10), { cols: 2, rows: 1, cellWidth: 10, cellHeight: 10 })
  assert.equal(allEmpty.charHeightPx, 0)
  assert.equal(allEmpty.headTopY, null)
  assert.match(allEmpty.warnings.join('\n'), /量不到任何内容/)

  const many = blank(80, 80) // 64 格
  const sampled = measureSheet(many, { cols: 8, rows: 8, cellWidth: 10, cellHeight: 10 })
  assert.equal(sampled.sampled, true)
  assert.equal(sampled.totalCells, 64)
  assert.equal(sampled.perCell.length, 12)
  assert.match(sampled.warnings.join('\n'), /只等间隔抽了 12 格/)
})

test('deviates：偏离中位数超过 5% 才算异常格', () => {
  const cell = {
    index: 0,
    col: 0,
    row: 0,
    bbox: null,
    charHeightPx: 100,
    headTopY: 0,
    soleY: 99,
    empty: false,
    clipped: false,
    edgePx: { left: 0, top: 0, right: 0, bottom: 0 },
    clippedEdges: [],
    clipThreshold: { left: 2, top: 2, right: 2, bottom: 2 },
  }
  assert.equal(deviates(cell, 100), false)
  assert.equal(deviates(cell, 105), false, '5% 恰好不算（要用 >）')
  assert.equal(deviates({ ...cell, charHeightPx: 94 }, 100), true)
  assert.equal(deviates({ ...cell, empty: true, charHeightPx: 0 }, 100), false, '空格子不参与')
})

test('parseColorHex：认 #RRGGBB / #RRGGBBAA / 不带 #，别的一律抛错', () => {
  assert.deepEqual(parseColorHex('#202030'), { r: 0x20, g: 0x20, b: 0x30, a: 255 })
  assert.deepEqual(parseColorHex('ff00ff'), { r: 255, g: 0, b: 255, a: 255 })
  assert.deepEqual(parseColorHex('#00e5ff80'), { r: 0, g: 0xe5, b: 0xff, a: 0x80 })
  assert.throws(() => parseColorHex('nope'), /不是合法的/)
  assert.throws(() => parseColorHex('#12345'), /不是合法的/)
})

test('drawHLine / drawVLine：1px 线 + 半透明黑描边（浅底也能看见）', () => {
  const picture = blank(6, 5)
  drawHLine(picture, 0, 5, 2, parseColorHex('#ff00ff'))
  assert.deepEqual(pixelAt(picture, 3, 2), [255, 0, 255, 255], '线本身是不透明的品红')
  assert.deepEqual(pixelAt(picture, 3, 1), [0, 0, 0, 120], '上方是半透明黑描边')
  assert.deepEqual(pixelAt(picture, 3, 3), [0, 0, 0, 120], '下方也是')
  assert.deepEqual(pixelAt(picture, 3, 0), [0, 0, 0, 0], '再远就不该被画到')

  drawVLine(picture, 2, 0, 4, parseColorHex('#00e5ff'), false)
  assert.deepEqual(pixelAt(picture, 2, 0), [0, 0xe5, 0xff, 255])
  assert.deepEqual(pixelAt(picture, 1, 4), [0, 0, 0, 0], 'halo=false 时不留描边')
})

test('drawCellOverlay：逐格画实测头顶/脚底/锚点，异常格整格变黄', () => {
  const sheet = blank(20, 10) // 2 格 × 10×10
  fillRect(sheet, 1, 1, 9, 7) // 第 0 格：高 6（y 1..6）
  fillRect(sheet, 11, 1, 19, 8) // 第 1 格：高 7（y 1..7）
  const measured = measureSheet(sheet, { cols: 2, rows: 1, cellWidth: 10, cellHeight: 10 })
  assert.equal(measured.charHeightPx, 7, '(6+7)/2 = 6.5 → 7')
  const overlay = drawCellOverlay(sheet, measured, { anchorX: 0.5, anchorY: 0.5 })

  // 异常格（第 0 格，6 vs 7 偏 14%）→ 头顶/脚底都画黄
  assert.deepEqual(overlay.flagged, [0])
  assert.deepEqual(pixelAt(overlay.image, 0, 1), [255, 212, 0, 255], '第 0 格头顶线应为黄色')
  assert.deepEqual(pixelAt(overlay.image, 0, 6), [255, 212, 0, 255], '第 0 格脚底线应为黄色')
  // 正常格 → 品红头、青脚
  assert.deepEqual(pixelAt(overlay.image, 10, 1), [255, 0, 255, 255], '第 1 格头顶线应为品红')
  assert.deepEqual(pixelAt(overlay.image, 10, 7), [0, 0xe5, 0xff, 255], '第 1 格脚底线应为青色')
  // 锚点十字：正常格是白色（anchorY=0.5 → 格内第 5 行）
  assert.deepEqual(pixelAt(overlay.image, 15, 5), [255, 255, 255, 255], '第 1 格锚点十字应为白色')
  // 原图不能被改（overlay 是副本）
  assert.deepEqual(pixelAt(sheet, 0, 1), [0, 0, 0, 0], 'drawCellOverlay 不许改到传入的图')
})

function cellInput(
  name: string,
  picture: { width: number; height: number; rgba: Uint8Array },
  cellWidth: number,
  cellHeight: number,
  anchorY: number,
  anchorX = 0.5,
): BaselineCellInput {
  return {
    name,
    image: picture,
    cellIndex: 0,
    cols: Math.max(1, Math.round(picture.width / cellWidth)),
    cellWidth,
    cellHeight,
    anchorX,
    anchorY,
  }
}

test('composeBaseline：按锚点对齐到同一条地平线（公式逐项对账）', () => {
  const a = blank(10, 10)
  fillRect(a, 3, 2, 7, 8) // 高 6，头顶在第 2 行
  const b = blank(10, 10)
  fillRect(b, 3, 3, 7, 7) // 高 4，头顶在第 3 行
  const composed = composeBaseline([cellInput('A', a, 10, 10, 0.2), cellInput('B', b, 10, 10, 0.5)], {
    gap: 8,
    background: '#202030',
  })
  // 公式：anchorYPx = round((1−anchorY)×cellH) → A=8、B=5；topSpace=8、bottom=5；padding=4
  assert.equal(composed.baselineY, 4 + 8, '地平线 = padding + max(anchorYPx)')
  assert.equal(composed.height, 2 * 4 + 8 + 5, '高 = 2·padding + topSpace + bottomSpace')
  assert.equal(composed.width, 2 * 4 + 10 + 10 + 8, '宽 = 2·padding + ΣcellW + gap·(n−1)')
  assert.equal(composed.items[0]!.drawX, 4)
  assert.equal(composed.items[1]!.drawX, 4 + 10 + 8, '第二格从第一格右边 + gap 开始')
  assert.equal(composed.items[0]!.drawY, composed.baselineY - 8, 'A 的锚点（第 8 行）要落在基线上')
  assert.equal(composed.items[1]!.drawY, composed.baselineY - 5, 'B 的锚点（第 5 行）也要落在基线上')
  // 头顶线 = 各格 (drawY + headTopY) 的中位数 → A: 4+2=6, B: 7+3=10 → median = 8
  assert.equal(composed.headTopY, 8)
  // 内容真的搬过去了：A 的内容落在画布 (4+3, 4+2) 起的区域（避开参考线与十字的位置取样）
  assert.deepEqual(pixelAt(composed.image, 7, 10), [200, 80, 40, 255], 'A 的内容要落在 drawY + 格子内偏移')
  // 底色生效
  assert.deepEqual(pixelAt(composed.image, 0, 0), [0x20, 0x20, 0x30, 255])
  // 地平线与头顶线颜色（画在整幅上）
  assert.deepEqual(pixelAt(composed.image, composed.width - 1, composed.baselineY), [0, 0xe5, 0xff, 255])
  assert.deepEqual(pixelAt(composed.image, composed.width - 1, composed.headTopY!), [255, 0, 255, 255])
  // 竖向中轴：A 的 anchorX=0.5 → 第 5 列
  assert.deepEqual(pixelAt(composed.image, 4 + 5, 0), [0x33, 0xff, 0x99, 255])
})

test('composeBaseline：空格子要 warn 且不参与头顶线；组内身高差 >1% 要 warn', () => {
  const a = blank(10, 10)
  fillRect(a, 3, 2, 7, 8)
  const empty = blank(10, 10)
  const composed = composeBaseline([cellInput('A', a, 10, 10, 0.5), cellInput('空', empty, 10, 10, 0.5)], { gap: 2 })
  assert.equal(composed.items[1]!.empty, true)
  assert.equal(composed.items[1]!.charHeightPx, 0)
  assert.match(composed.warnings.join('\n'), /空 的第 0 格是空的/)
  assert.equal(composed.headTopY, 4 + (5 - 5) + 2, '只有一个非空格时头顶线就是它自己')

  const tall = blank(10, 10)
  fillRect(tall, 3, 0, 7, 10) // 高 10
  const uneven = composeBaseline([cellInput('A', a, 10, 10, 0.5), cellInput('tall', tall, 10, 10, 0.5)])
  assert.match(uneven.warnings.join('\n'), /组内身高差/)
})

test('composeBaseline：身高一样但头顶错开 → 要 warn（锚点口径不一致，看身高差发现不了）', () => {
  const a = blank(10, 10)
  fillRect(a, 3, 0, 7, 5) // 高 5，头顶第 0 行
  const b = blank(10, 10)
  fillRect(b, 3, 0, 7, 5) // 同样高 5、同样头顶第 0 行
  const composed = composeBaseline([cellInput('A', a, 10, 10, 0.5), cellInput('B', b, 10, 10, 0.8)], { gap: 2 })
  assert.equal(composed.items[0]!.charHeightPx, 5)
  assert.equal(composed.items[1]!.charHeightPx, 5)
  // anchorY 0.5 → 锚点第 5 行；0.8 → 第 2 行：两格头顶差 3px
  assert.equal(
    Math.abs(composed.items[0]!.drawY + composed.items[0]!.headTopY! - (composed.items[1]!.drawY + composed.items[1]!.headTopY!)),
    3,
  )
  assert.match(composed.warnings.join('\n'), /各格头顶行极差 3px/)
  assert.doesNotMatch(composed.warnings.join('\n'), /组内身高差/, '身高一致时不该报身高差')
})

test('composeBaseline：锚点越界直接报错（不猜一个"差不多"的位置）', () => {
  const a = blank(10, 10)
  assert.throws(() => composeBaseline([cellInput('A', a, 10, 10, 1.2)]), /anchorY 不在 0~1/)
  assert.throws(() => composeBaseline([cellInput('A', a, 10, 10, 0.5, -0.1)]), /anchorX 不在 0~1/)
  assert.throws(() => composeBaseline([]), /至少一张/)
})

test('contentLumaOf：只算 alpha>阈值 的内容像素，没内容返回 null', () => {
  const picture = blank(10, 10)
  fillRect(picture, 0, 0, 10, 10, [0, 0, 0, 255])
  fillRect(picture, 2, 2, 6, 6, [255, 255, 255, 255]) // 16 个白像素
  const luma = contentLumaOf(picture, { x: 0, y: 0, w: 10, h: 10 })
  // 100 个像素里 84 个黑（0）+ 16 个白（255）→ 平均 40.8
  assert.ok(Math.abs((luma ?? 0) - 40.8) < 0.001, `实测 ${luma}`)
  assert.equal(contentLumaOf(blank(10, 10), { x: 0, y: 0, w: 10, h: 10 }), null, '全透明不许冒充"亮度 0"')
})

test('adaptiveBaselineBackground：浅色角色 → 深底、深色角色 → 浅底；量不到就退回老默认', () => {
  assert.deepEqual(
    { hex: adaptiveBaselineBackground(216).hex, adaptive: adaptiveBaselineBackground(216).adaptive },
    { hex: BASELINE_DARK_BG, adaptive: true },
    '白发带那种浅色角色在深底上才看得清（P2-7）',
  )
  assert.equal(adaptiveBaselineBackground(66).hex, BASELINE_LIGHT_BG, '深色角色用浅底')
  assert.equal(adaptiveBaselineBackground(127).hex, BASELINE_LIGHT_BG, '分界 128：127 还算偏暗')
  assert.equal(adaptiveBaselineBackground(128).hex, BASELINE_DARK_BG, '128 起算偏亮')
  const none = adaptiveBaselineBackground(null)
  assert.equal(none.hex, BASELINE_DARK_BG, '量不到内容亮度时行为与老默认一致')
  assert.equal(none.adaptive, true)
  assert.match(String(none.reason), /默认深底/)
})

test('composeBaseline：不传 background 时按主体亮度自适应，传了就按传的（P2-7）', () => {
  const light = blank(10, 10)
  fillRect(light, 2, 2, 8, 9, [240, 245, 250, 255]) // 浅色角色（luma≈244）
  const lightOut = composeBaseline([cellInput('浅色', light, 10, 10, 0.5)], { gap: 2 })
  assert.equal(lightOut.background.adaptive, true)
  assert.equal(lightOut.background.hex, BASELINE_DARK_BG)
  assert.deepEqual(pixelAt(lightOut.image, 0, 0), [0x20, 0x20, 0x30, 255], '浅色角色 → 深底')
  assert.match(lightOut.warnings.join('\n'), /底色自适应/)

  const dark = blank(10, 10)
  fillRect(dark, 2, 2, 8, 9, [20, 20, 20, 255]) // 深色角色（luma=20）
  const darkOut = composeBaseline([cellInput('深色', dark, 10, 10, 0.5)], { gap: 2 })
  assert.equal(darkOut.background.hex, BASELINE_LIGHT_BG)
  assert.deepEqual(pixelAt(darkOut.image, 0, 0), [0xf2, 0xf2, 0xf5, 255], '深色角色 → 浅底')

  // 显式值永远赢（哪怕它"正好"跟自适应结果一样，也必须标成 non-adaptive 且不再警告）
  const forced = composeBaseline([cellInput('深色', dark, 10, 10, 0.5)], { gap: 2, background: '#112233' })
  assert.deepEqual(forced.background, { hex: '#112233', meanLuma: 20, adaptive: false })
  assert.doesNotMatch(forced.warnings.join('\n'), /底色自适应/)
  assert.deepEqual(pixelAt(forced.image, 0, 0), [0x11, 0x22, 0x33, 255])
})

test('composeBaseline：items 带上实际用的 cellIndex（tallest/median 时逐条不同，P2-6）', () => {
  const picture = blank(20, 10) // 2×1 格
  fillRect(picture, 1, 2, 9, 9) // 第 0 格高 7
  fillRect(picture, 12, 4, 18, 9) // 第 1 格高 5
  const withCell = { ...cellInput('A', picture, 10, 10, 0.5), cellIndex: 1 }
  const composed = composeBaseline([withCell], { gap: 2, background: '#202030' })
  assert.equal(composed.items[0]!.cellIndex, 1)
  assert.equal(composed.items[0]!.charHeightPx, 5, '量的是第 1 格（不是第 0 格）')
})

test('anchorConventionWarnings：口径混用与 anchorYTopDown 对不上都要点名（P2-8）', () => {
  // 全部一致 → 不出声
  assert.deepEqual(
    anchorConventionWarnings([
      { name: 'a.png', convention: 'y-from-bottom', anchorY: 0.9375, anchorYTopDown: 0.0625 },
      { name: 'b.png', convention: 'y-from-bottom', anchorY: 0.5 },
    ]),
    [],
  )

  // 一组里混用口径 → 点名是哪几条
  const mixed = anchorConventionWarnings([
    { name: '8 条老 meta 之一.png', convention: 'y-from-top', anchorY: 0.9375 },
    { name: '新的.png', convention: 'y-from-bottom', anchorY: 0.9375 },
    { name: '没写口径.png', anchorY: 0.5 },
  ])
  assert.equal(mixed.length, 1)
  assert.match(mixed[0]!, /锚点口径混用/)
  assert.match(mixed[0]!, /8 条老 meta 之一\.png/)
  assert.match(mixed[0]!, /y-from-top/)
  assert.match(mixed[0]!, /口径疑似不一致，画出来的地平线可能整体偏移/)

  // 单条自己两个字段对不上 → 点名这一条，且给出两个值
  const mismatch = anchorConventionWarnings([{ name: 'bad.png', convention: 'y-from-bottom', anchorY: 0.8, anchorYTopDown: 0.8 }])
  assert.equal(mismatch.length, 1)
  assert.match(mismatch[0]!, /bad\.png/)
  assert.match(mismatch[0]!, /anchorY=0\.8/)
  assert.match(mismatch[0]!, /anchorYTopDown=0\.8/)
  assert.match(mismatch[0]!, /口径疑似不一致/)

  // 混用 + 单条不一致：两条都要有
  const both = anchorConventionWarnings([
    { name: 'a.png', convention: 'y-from-top', anchorY: 0.2 },
    { name: 'b.png', convention: 'y-from-bottom', anchorY: 0.8, anchorYTopDown: 0.8 },
  ])
  assert.equal(both.length, 2)
})
