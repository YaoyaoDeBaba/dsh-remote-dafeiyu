/**
 * sprite-guard.test —— 三道闸门的判据（纯函数，不需要浏览器）。
 *
 * 这三条对应的都是「返回成功但交出一张废图」的形状：
 * - 抠图缓存被 preview 清空后仍去 export（P2，评审里白了 2 次整轮）；
 * - 导出图 alpha 全 255（原帧拼进去了，绿底）；
 * - 抽样找最差帧（P8：只看第 0 帧会漏掉后面帧的残留）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertKeyedPresent, assertNotOpaque, checkGridCapacity, defaultFileNames, gridFor, pickWorst } from '../src/sprite/guard.js'
import type { SpriteStats } from '../src/sprite/analyze.js'

function stats(over: Partial<SpriteStats> = {}): SpriteStats {
  return {
    width: 100,
    height: 100,
    bbox: { x: 10, y: 10, w: 50, h: 50 },
    bgResidual: 0,
    subjectCoverage: 1,
    edgeGreen: 0,
    alphaHistogram: [0.7, 0.1, 0.1, 0.1],
    ...over,
  }
}

test('缓存闸：keyed 为空直接报错，并在报错里告诉用户下一步怎么做', () => {
  assert.throws(() => assertKeyedPresent(0), /请先再跑一次 sprite_key_apply/)
  assert.doesNotThrow(() => assertKeyedPresent(1))
  assert.doesNotThrow(() => assertKeyedPresent(48))
})

test('缓存闸：读不到状态（-1）也要停，不许猜测', () => {
  assert.throws(() => assertKeyedPresent(-1), /读不到抠图缓存状态/)
})

test('不透明闸：alpha 全不透（原帧）必须报错；正常精灵图放行', () => {
  assert.throws(() => assertNotOpaque(stats({ alphaHistogram: [0, 0, 0, 1] })), /几乎全不透明/)
  // 实测的真实素材：全透占比 60%~90%
  assert.doesNotThrow(() => assertNotOpaque(stats({ alphaHistogram: [0.7, 0.05, 0.05, 0.2] })))
  // 边界：刚好 0.99 放行（> 才拦，避免把"几乎没主体"的极窄素材误杀）
  assert.doesNotThrow(() => assertNotOpaque(stats({ alphaHistogram: [0, 0, 0.01, 0.99] })))
})

test('最差帧：取"残留 + 绿边 + 主体缺失"综合最差的那一帧，而不是最后一帧', () => {
  const worst = pickWorst([
    { frame: 0, stats: stats() },
    { frame: 12, stats: stats({ bgResidual: 0.3, edgeGreen: 0.2 }) },
    { frame: 47, stats: stats({ subjectCoverage: 0.9 }) },
  ])
  assert.deepEqual(worst, { frame: 12, bgResidual: 0.3, edgeGreen: 0.2, subjectCoverage: 1 })
  assert.equal(pickWorst([]), undefined)
})

test('默认命名：<name>_<cols>x<rows>.<format>，显式给了就用给的', () => {
  assert.deepEqual(defaultFileNames({ name: 'Idle', cols: 8, rows: 6, format: 'png' }), {
    file: 'Idle_8x6.png',
    meta: 'Idle_8x6.meta.json',
  })
  assert.deepEqual(defaultFileNames({ name: 'Idle', cols: 8, rows: 6, format: 'webp', fileName: 'Dafeiyu_Idle' }), {
    file: 'Dafeiyu_Idle.webp',
    meta: 'Dafeiyu_Idle.meta.json',
  })
  // 名字里的非法字符要清掉（Windows 文件名）
  assert.equal(defaultFileNames({ name: 'a/b:c*', cols: 2, rows: 2, format: 'png' }).file, 'a_b_c__2x2.png')
  // 已经带扩展名的不重复加
  assert.equal(defaultFileNames({ name: 'x', cols: 1, rows: 1, format: 'png', fileName: 'x.png' }).file, 'x.png')
})
test('网格：按帧数推（48 沿用 8×6、其它 sqrt）；塞不下必须报错，太空给 warning', () => {
  assert.deepEqual(gridFor(48), { cols: 7, rows: 7 })
  assert.deepEqual(gridFor(30), { cols: 6, rows: 5 })
  assert.deepEqual(gridFor(1), { cols: 1, rows: 1 })

  // 塞不下 = 静默丢帧，必须抛
  assert.throws(() => checkGridCapacity(60, 8, 6), /静默丢掉 12 帧/)
  assert.deepEqual(checkGridCapacity(48, 8, 6), { warnings: [] })
  // 空格过半 → warning（不拦）
  assert.match(checkGridCapacity(20, 8, 6).warnings[0] ?? '', /末尾会留大片空格/)
})