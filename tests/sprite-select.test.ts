/**
 * sprite-select.test —— 准绳图"取哪一格"的判据（P2-6）。
 *
 * 事故原话：「姿势不同的动画（吹哨首帧手臂下垂、后仰惊吓），首帧 bbox 高度差 6%，
 * 被误判为'身高不一致'」——因为 baseline 只会取第 0 格。
 *
 * 这里钉四件事：
 * 1. 固定格号的行为与以前一字不差（越界由 select 自己报错）；
 * 2. `median` = bbox 高最接近中位数的那一格；
 * 3. `tallest` 拿不到语义身高时按 bbox 高选；
 * 4. `tallest` **语义身高优先**：bbox 更高的那一格，如果语义身高更矮，就要选另一格。
 *
 * 全部合成像素，不碰文件/浏览器。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createImage } from '../src/sprite/contact.js'
import { selectBaselineCell } from '../src/sprite/select.js'

const OPAQUE: [number, number, number, number] = [200, 80, 40, 255]
const MID: [number, number, number, number] = [150, 150, 150, 255]
const WHITE: [number, number, number, number] = [255, 255, 255, 255]
const DARK: [number, number, number, number] = [20, 20, 20, 255]

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

/** 2×2 格（每格 20×20），四格的 bbox 高分别是 10 / 6 / 6 / 4。 */
function ladderSheet() {
  const sheet = createImage(40, 40)
  fillRect(sheet, 4, 5, 16, 15) // 第 0 格：y5..14 → 高 10
  fillRect(sheet, 24, 7, 36, 13) // 第 1 格：y7..12 → 高 6
  fillRect(sheet, 4, 25, 16, 31) // 第 2 格：y25..30 → 高 6
  fillRect(sheet, 24, 30, 36, 34) // 第 3 格：y30..33 → 高 4
  return sheet
}

const LADDER_GRID = { cols: 2, rows: 2, cellWidth: 20, cellHeight: 20 }

test('selectBaselineCell：固定格号原样返回，越界要报"超出网格"', () => {
  const sheet = ladderSheet()
  const picked = selectBaselineCell(sheet, LADDER_GRID, 2)
  assert.deepEqual(picked, { cellIndex: 2, basis: 'fixed', heightPx: 0, cellsScanned: 0, semanticCells: 0 }, '固定格号不量任何格子')
  assert.throws(() => selectBaselineCell(sheet, LADDER_GRID, 4), /超出网格（2×2，最大序号 3）/)
})

test('selectBaselineCell("median")：取 bbox 高最接近中位数的那一格', () => {
  const sheet = ladderSheet()
  const picked = selectBaselineCell(sheet, LADDER_GRID, 'median')
  // 四个高度 10/6/6/4 → 中位数 (6+6)/2 = 6 → 第 1 格与第 2 格同分，取序号小的
  assert.equal(picked.cellIndex, 1)
  assert.equal(picked.basis, 'bbox')
  assert.equal(picked.heightPx, 6)
  assert.equal(picked.cellsScanned, 4)
  assert.match(String(picked.note), /cellIndex=median/)
  assert.match(String(picked.note), /第 1 格/)
})

test('selectBaselineCell("tallest")：猜不到语义身高就按 bbox 高选（并标明 basis=bbox）', () => {
  const sheet = ladderSheet()
  const picked = selectBaselineCell(sheet, LADDER_GRID, 'tallest')
  assert.equal(picked.cellIndex, 0, 'bbox 最高的就是第 0 格（高 10）')
  assert.equal(picked.basis, 'bbox')
  assert.equal(picked.heightPx, 10)
  assert.equal(picked.semanticCells, 0, '橙色主体没有白色上端/深色下端，语义身高猜不出来')
  assert.match(String(picked.note), /语义身高没猜出来/)
})

test('selectBaselineCell("tallest")：语义身高优先——bbox 更高但语义更矮的那格不选（P2-6）', () => {
  // 每格 40×40，格子横向排开（cols=2）
  const sheet = createImage(80, 40)
  // 第 0 格：一整块的灰身体（bbox 从 y0 一直到底 = 40），但真正"身高"从白色发带 y=20 量起 → 语义高 19
  fillRect(sheet, 10, 0, 30, 40, MID)
  fillRect(sheet, 10, 20, 30, 24, WHITE) // 白（发带）——身高上端的路标
  fillRect(sheet, 10, 36, 30, 39, DARK) // 深色鞋底——身高下端的路标
  // 第 1 格：bbox 只有 28（y3..29），但语义高 25（白带腐蚀后从 y4 起、鞋底到 y28）
  fillRect(sheet, 50, 3, 70, 30, MID)
  fillRect(sheet, 50, 3, 70, 7, WHITE)
  fillRect(sheet, 50, 27, 70, 30, DARK)

  const picked = selectBaselineCell(sheet, { cols: 2, rows: 1, cellWidth: 40, cellHeight: 40 }, 'tallest')
  assert.equal(picked.basis, 'semantic', '这一批能猜出语义身高（白带 + 深色鞋底都在）')
  assert.equal(picked.semanticCells, 2, '两格都猜出来了')
  assert.equal(picked.cellIndex, 1, '按 bbox 会选第 0 格（40 > 28），但语义高 25 > 19 → 必须选第 1 格')
  assert.equal(picked.heightPx, 25)
  assert.match(String(picked.note), /语义高 25px/)
})

test('selectBaselineCell：整张图都是空的时候退回第 0 格并说明（不返回 NaN）', () => {
  const blank = createImage(40, 40)
  const picked = selectBaselineCell(blank, LADDER_GRID, 'tallest')
  assert.equal(picked.cellIndex, 0)
  assert.equal(picked.heightPx, 0)
  assert.match(String(picked.note), /一格内容都没有/)
})
