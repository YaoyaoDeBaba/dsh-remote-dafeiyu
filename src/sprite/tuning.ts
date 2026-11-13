/**
 * sprite/tuning —— `sprite_autotune` 的**收口逻辑**（P1-3）。
 *
 * 反馈原文：「我用同一批素材手调 intensity:85 / softness:100 / despill:70 / greenToAlpha:25 /
 * autoPlate:true 得到 bgResidual 0.0004，autotune 的结果是 0.002~0.01」。
 * 也就是说：搜索跑完没达标时，它把**搜索过程中最后一个（往往更差的）参数**当结果返回，
 * 调用方手调好的那套被静默覆盖了——等于"自动调参"越调越糟。
 *
 * 这里的规矩（纯函数，方便逐条钉死）：
 * 1. **未达标就保留调用方给的参数**（`appliedParams` = 起点那套，一个字段都不动）；
 * 2. 搜索到的最优解**一并返回**（`bestParams` + `bestStep`），要不要用由调用方决定；
 * 3. 未达标**必须**给 warning，写清"已保留你给的参数 / 搜索到的最优解是第几轮、指标更好还是更差"；
 * 4. 达标时行为与以前一致（`appliedParams` = `bestParams` = 达标那一轮）。
 *
 * 打分：三个指标各自**除以目标**再相加（都在"刚好达标"处等于 1），
 * 于是 bgResidual 的 0.001 与 edgeGreen 的 0.001 权重可比，不用手工调系数。
 */
import type { AutotuneGoal, AutotuneTraceStep, KeyParams } from './types.js'

/** 补全后的目标（三个阈值都给了数）。 */
export interface ResolvedAutotuneGoal {
  maxBgResidual: number
  minSubjectCoverage: number
  maxEdgeGreen: number
}

/** 把（可能缺省的）目标补成三个确定数值；与 service 的默认值同一套口径。 */
export function resolveAutotuneGoal(goal?: AutotuneGoal): ResolvedAutotuneGoal {
  return {
    maxBgResidual: Number.isFinite(goal?.maxBgResidual) ? Number(goal?.maxBgResidual) : 0.005,
    minSubjectCoverage: Number.isFinite(goal?.minSubjectCoverage) ? Number(goal?.minSubjectCoverage) : 0.6,
    maxEdgeGreen: Number.isFinite(goal?.maxEdgeGreen) ? Number(goal?.maxEdgeGreen) : 0.02,
  }
}

/** 某一轮离目标有多远（< 3 表示三项都刚好或更好；越小越好）。 */
export function autotunePenalty(step: AutotuneTraceStep, goal: ResolvedAutotuneGoal): number {
  const bg = step.bgResidual / Math.max(goal.maxBgResidual, 1e-6)
  const edge = step.edgeGreen / Math.max(goal.maxEdgeGreen, 1e-6)
  // coverage 是"越高越好"：低于目标为负贡献，富余则减分（但不会把别的指标抵掉，权重对齐后最多 −1）。
  const coverage = (goal.minSubjectCoverage - step.subjectCoverage) / Math.max(goal.minSubjectCoverage, 1e-6)
  return bg + edge + coverage
}

/** 这一轮是否达上了全部三个目标。 */
export function stepReachedGoal(step: AutotuneTraceStep, goal: ResolvedAutotuneGoal): boolean {
  return (
    step.bgResidual <= goal.maxBgResidual &&
    step.subjectCoverage >= goal.minSubjectCoverage &&
    step.edgeGreen <= goal.maxEdgeGreen
  )
}

/** 未达标原因（逐项点名，别只说"未达标"）。 */
export function autotuneMissedReasons(step: AutotuneTraceStep, goal: ResolvedAutotuneGoal): string[] {
  const out: string[] = []
  if (!(step.bgResidual <= goal.maxBgResidual)) {
    out.push(`bgResidual ${fmt(step.bgResidual)} > 目标 ${fmt(goal.maxBgResidual)}`)
  }
  if (!(step.subjectCoverage >= goal.minSubjectCoverage)) {
    out.push(`subjectCoverage ${fmt(step.subjectCoverage)} < 目标 ${fmt(goal.minSubjectCoverage)}`)
  }
  if (!(step.edgeGreen <= goal.maxEdgeGreen)) {
    out.push(`edgeGreen ${fmt(step.edgeGreen)} > 目标 ${fmt(goal.maxEdgeGreen)}`)
  }
  return out
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return Math.abs(value) >= 1 ? value.toFixed(3) : value.toFixed(4)
}

/** 搜索过程中指标最好的那一轮（同分取轮次小的，结论可复现）。 */
export function pickAutotuneBest(trace: AutotuneTraceStep[], goal: ResolvedAutotuneGoal): AutotuneTraceStep | undefined {
  let best: AutotuneTraceStep | undefined
  let bestPenalty = Number.POSITIVE_INFINITY
  for (const step of trace) {
    const penalty = autotunePenalty(step, goal)
    if (penalty < bestPenalty) {
      best = step
      bestPenalty = penalty
    }
  }
  return best
}

export interface AutotuneOutcomeInput {
  /** 调用方给的起点（已补全默认值的那一套）——未达标时原样作为 `appliedParams`。 */
  startParams: KeyParams
  /** 每一轮实测（`trace[0]` 就是 `startParams` 那一轮）。 */
  trace: AutotuneTraceStep[]
  goal: ResolvedAutotuneGoal
  /** 达标的那一轮；没达标就是 undefined。 */
  reachedStep?: AutotuneTraceStep
}

export interface AutotuneOutcome {
  appliedParams: KeyParams
  bestParams: KeyParams
  bestStep?: AutotuneTraceStep
  reachedGoal: boolean
  /** 未达标时一定非空（第一条就是"已保留你给的参数"那句）。 */
  warnings: string[]
  /** 起点那套参数对应的指标（= `trace[0]`；`trace` 为空时 undefined）。 */
  startStep?: AutotuneTraceStep
}

/**
 * 收口：达标就用达标那一轮，未达标**保留调用方参数**并把搜索最优解一并回传。
 *
 * 注意 `appliedParams` 与 `bestParams` 是两个独立的东西：前者"现在生效的"，
 * 后者"搜索认为更好的（但没达标）"。别把 bestParams 直接当结果用——那正是 P1-3 的事故。
 */
export function resolveAutotune(input: AutotuneOutcomeInput): AutotuneOutcome {
  const startStep = input.trace[0]
  if (input.reachedStep) {
    return {
      appliedParams: { ...input.reachedStep.params },
      bestParams: { ...input.reachedStep.params },
      bestStep: input.reachedStep,
      reachedGoal: true,
      warnings: [],
      ...(startStep ? { startStep } : {}),
    }
  }
  const best = pickAutotuneBest(input.trace, input.goal)
  const appliedParams = { ...input.startParams }
  const warnings: string[] = []
  if (!best) {
    warnings.push(
      'autotune 未达标，而且一轮指标都没拿到（preview 没回 stats）：已按你给的参数返回，没有生成任何搜索结论——' +
        '先用 sprite_key_preview 确认页面能出 stats 再重跑',
    )
    return { appliedParams, bestParams: appliedParams, reachedGoal: false, warnings }
  }
  const missed = startStep ? autotuneMissedReasons(startStep, input.goal) : []
  const missedText = missed.length > 0 ? missed.join('；') : '目标没达成'
  if (!startStep || best.round === startStep.round) {
    warnings.push(
      `autotune 未达标（${missedText}）：**已保留你给的参数**，而且搜索没找到更好的组合` +
        '（bestParams 与你给的完全相同）——直接用 appliedParams，别去 trace 里挑更差的轮次',
    )
    return {
      appliedParams,
      bestParams: { ...best.params },
      bestStep: best,
      reachedGoal: false,
      warnings,
      ...(startStep ? { startStep } : {}),
    }
  }
  warnings.push(
    `autotune 未达标（${missedText}）：**已保留你给的参数**（没被搜索中的劣解覆盖）；` +
      `搜索到的最优解是第 ${best.round} 轮 ${describeStep(best, input.goal)}。` +
      `与你的参数相比：${compareSteps(startStep, best)}——要不要用它自己决定` +
      '（appliedParams 是你现在这套，bestParams 是搜索认为更好的那套）',
  )
  return {
    appliedParams,
    bestParams: { ...best.params },
    bestStep: best,
    reachedGoal: false,
    warnings,
    ...(startStep ? { startStep } : {}),
  }
}

/** 一轮指标的短描述（告警文案用）。 */
export function describeStep(step: AutotuneTraceStep, goal: ResolvedAutotuneGoal): string {
  return (
    `（bgResidual ${fmt(step.bgResidual)}/${fmt(goal.maxBgResidual)}、` +
    `subjectCoverage ${fmt(step.subjectCoverage)}/${fmt(goal.minSubjectCoverage)}、` +
    `edgeGreen ${fmt(step.edgeGreen)}/${fmt(goal.maxEdgeGreen)}）`
  )
}

/** 「从 A 变成 B 是更好还是更差」：两个指标越小越好，逐项给结论（P1-3 要的正是这句对比）。 */
export function compareSteps(from: AutotuneTraceStep, to: AutotuneTraceStep): string {
  const verdict = (a: number, b: number): string => (b < a - 1e-9 ? '更好' : b > a + 1e-9 ? '更差' : '持平')
  return (
    `bgResidual ${fmt(from.bgResidual)} → ${fmt(to.bgResidual)}（${verdict(from.bgResidual, to.bgResidual)}）、` +
    `edgeGreen ${fmt(from.edgeGreen)} → ${fmt(to.edgeGreen)}（${verdict(from.edgeGreen, to.edgeGreen)}）`
  )
}
