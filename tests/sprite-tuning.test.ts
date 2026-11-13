/**
 * sprite-tuning.test —— `sprite_autotune` 收口逻辑的判据（P1-3）。
 *
 * 事故原话：「手调 intensity:85 / softness:100 / despill:70 / greenToAlpha:25 / autoPlate:true
 * 得到 bgResidual 0.0004，autotune 的结果是 0.002~0.01」——搜索没达标时把它"最后一轮"的参数
 * 当结果返回，调用方手调好的那套被静默覆盖。
 *
 * 这里钉六条（全是纯函数，不需要浏览器）：
 * 1. 未达标 ⇒ `appliedParams` 与调用方给的**逐字段相等**；
 * 2. `bestParams` 可读，且就是搜索里 penalty 最小的那一轮；
 * 3. 未达标必须给 warning，文案里点出"已保留你给的参数"与最优解那一轮；
 * 4. 搜索最优比起点更差时，额外提示"别用 bestParams"；
 * 5. 达标 ⇒ appliedParams = bestParams = 达标那一轮（行为与以前一致）；
 * 6. 一轮指标都没拿到 ⇒ 仍然保留调用方参数 + 明确 warning。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  autotuneMissedReasons,
  autotunePenalty,
  pickAutotuneBest,
  resolveAutotune,
  resolveAutotuneGoal,
  stepReachedGoal,
} from '../src/sprite/tuning.js'
import type { AutotuneTraceStep, KeyParams } from '../src/sprite/types.js'

/** 用户手调好的那套（反馈原文里的参数）。 */
const HAND_TUNED: KeyParams = {
  mode: 'advanced',
  colorHex: '#86AF51',
  intensity: 85,
  softness: 100,
  despill: 70,
  greenToAlpha: 25,
  autoPlate: true,
}

function step(round: number, params: KeyParams, bg: number, cov: number, edge: number): AutotuneTraceStep {
  return { round, params, bgResidual: bg, subjectCoverage: cov, edgeGreen: edge }
}

test('resolveAutotuneGoal：缺省补成 0.005 / 0.6 / 0.02（评审 B9），给了就用给的', () => {
  assert.deepEqual(resolveAutotuneGoal(), { maxBgResidual: 0.005, minSubjectCoverage: 0.6, maxEdgeGreen: 0.02 })
  assert.deepEqual(resolveAutotuneGoal({ maxBgResidual: 0.01, maxEdgeGreen: 0.1 }), {
    maxBgResidual: 0.01,
    minSubjectCoverage: 0.6,
    maxEdgeGreen: 0.1,
  })
})

test('autotunePenalty / stepReachedGoal / missedReasons：三个指标各自对目标归一', () => {
  const goal = resolveAutotuneGoal()
  const perfect = step(0, {}, 0.005, 0.6, 0.02)
  assert.equal(stepReachedGoal(perfect, goal), true)
  assert.equal(autotunePenalty(perfect, goal), 2, 'bg 与 edge 刚好达标各 1 分，coverage 刚好达标贡献 0 → 2')

  const worse = step(0, {}, 0.02, 0.4, 0.06)
  assert.equal(stepReachedGoal(worse, goal), false)
  assert.ok(autotunePenalty(worse, goal) > 3)
  const reasons = autotuneMissedReasons(worse, goal)
  assert.equal(reasons.length, 3)
  assert.match(reasons[0]!, /bgResidual 0\.0200 > 目标 0\.0050/)
  assert.match(reasons[1]!, /subjectCoverage 0\.4000 < 目标 0\.6000/)
  assert.match(reasons[2]!, /edgeGreen 0\.0600 > 目标 0\.0200/)
})

test('pickAutotuneBest：取 penalty 最小的那一轮；同分取轮次小的（结论可复现）', () => {
  const goal = resolveAutotuneGoal()
  const trace = [
    step(0, { intensity: 85 }, 0.006, 0.7, 0.03),
    step(1, { intensity: 90 }, 0.004, 0.65, 0.03),
    step(2, { intensity: 95 }, 0.004, 0.65, 0.03),
  ]
  const best = pickAutotuneBest(trace, goal)
  assert.equal(best?.round, 1, '1 与 2 同分，取轮次小的')
  assert.equal(pickAutotuneBest([], goal), undefined)
})

test('P1-3：未达标时**不许**覆盖调用方参数，bestParams 另行给出', () => {
  const goal = resolveAutotuneGoal({ maxBgResidual: 0.001 })
  const trace = [
    // 起点就是用户手调那套：bgResidual 0.0004（很好），但 edgeGreen 0.03 没达标
    step(0, { ...HAND_TUNED }, 0.0004, 0.72, 0.03),
    // 搜索把 greenToAlpha 往上推：bg 略微变差、edgeGreen 反而达标了（penalty 更小 → 最优解）
    step(1, { ...HAND_TUNED, greenToAlpha: 35 }, 0.0006, 0.72, 0.015),
    // 再推一轮就崩了（反馈里 0.002~0.01 的那一档）
    step(2, { ...HAND_TUNED, greenToAlpha: 45, intensity: 90 }, 0.01, 0.7, 0.01),
  ]
  const outcome = resolveAutotune({ startParams: { ...HAND_TUNED }, trace, goal })

  assert.equal(outcome.reachedGoal, false)
  assert.deepEqual(outcome.appliedParams, HAND_TUNED, 'appliedParams 必须是调用方给的那套，一个字段都不许变')
  assert.equal(outcome.appliedParams.intensity, 85, 'intensity 不许被推到 90')
  assert.equal(outcome.appliedParams.softness, 100)
  assert.equal(outcome.appliedParams.autoPlate, true)

  assert.deepEqual(outcome.bestParams, trace[1]!.params, 'bestParams = penalty 最小的那一轮')
  assert.equal(outcome.bestStep?.round, 1)
  assert.equal(outcome.warnings.length, 1)
  const warning = outcome.warnings[0]!
  assert.match(warning, /autotune 未达标/)
  assert.match(warning, /已保留你给的参数/)
  assert.match(warning, /第 1 轮/)
  assert.match(warning, /bgResidual 0\.0004 → 0\.0006（更差）/, '要和用户给的那套逐项比，别只报一个数')
  assert.match(warning, /edgeGreen 0\.0300 → 0\.0150（更好）/)
  assert.match(warning, /edgeGreen 0\.0300 > 目标 0\.0200/, '未达标的原因要具体到哪一项')
})

test('P1-3：搜索没找到更好的组合时，明说 bestParams 与 appliedParams 相同', () => {
  const goal = resolveAutotuneGoal({ maxBgResidual: 0.001 })
  const trace = [
    step(0, { ...HAND_TUNED }, 0.0004, 0.72, 0.03), // 已经很好，只是 edgeGreen 差一点
    step(1, { ...HAND_TUNED, intensity: 90 }, 0.01, 0.7, 0.05), // 搜索越调越糟
  ]
  const outcome = resolveAutotune({ startParams: { ...HAND_TUNED }, trace, goal })
  const text = outcome.warnings.join('\n')
  assert.deepEqual(outcome.appliedParams, HAND_TUNED)
  assert.equal(outcome.bestStep?.round, 0, '起点就是最优解')
  assert.match(text, /已保留你给的参数/)
  assert.match(text, /搜索没找到更好的组合/)
  assert.match(text, /bestParams 与你给的完全相同/)
})

test('P1-3：达成目标时行为与以前一致（appliedParams = bestParams = 达标那轮，无 warning）', () => {
  const goal = resolveAutotuneGoal()
  const reached = step(2, { ...HAND_TUNED, greenToAlpha: 55 }, 0.0004, 0.72, 0.01)
  const outcome = resolveAutotune({
    startParams: { ...HAND_TUNED },
    trace: [step(0, { ...HAND_TUNED }, 0.02, 0.5, 0.05), step(1, { ...HAND_TUNED, greenToAlpha: 35 }, 0.005, 0.6, 0.02), reached],
    goal,
    reachedStep: reached,
  })
  assert.equal(outcome.reachedGoal, true)
  assert.deepEqual(outcome.appliedParams, reached.params)
  assert.deepEqual(outcome.bestParams, reached.params)
  assert.equal(outcome.bestStep?.round, 2)
  assert.deepEqual(outcome.warnings, [], '达标时不许刷 warning')
})

test('P1-3：一轮指标都没拿到时也保留调用方参数，并说清"没有搜索结论"', () => {
  const outcome = resolveAutotune({ startParams: { ...HAND_TUNED }, trace: [], goal: resolveAutotuneGoal() })
  assert.deepEqual(outcome.appliedParams, HAND_TUNED)
  assert.equal(outcome.reachedGoal, false)
  assert.equal(outcome.warnings.length, 1)
  assert.match(outcome.warnings[0]!, /已按你给的参数返回/)
  assert.match(outcome.warnings[0]!, /preview 没回 stats/)
})
