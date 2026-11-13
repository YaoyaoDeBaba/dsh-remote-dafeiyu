/**
 * sprite/guard —— 三道"以前会静默降级"的判据，抽成纯函数方便钉死。
 *
 * 为什么单独一个文件：这三条都是"看起来成功、实际给了一张废图"的形状，
 * 是评审文档里最贵的两个坑（P2 缓存被清、导出退原帧）。纯函数才好写单测。
 */
import type { SpriteStats } from './analyze.js'
import type { WorstFrame } from './types.js'

/**
 * 导出前的第一道闸：抠图缓存必须非空。
 *
 * `.57` 之前 `sprite_key_preview` 会先 `setKeyParams` → `onKeyParamChange()` 清空 keyed，
 * 之后直接 export 就会拿**原帧**拼图（绿底），还照回 `ok:true`。用户那边就是"整轮重跑"。
 */
export function assertKeyedPresent(keyedCount: number): void {
  if (keyedCount > 0) return
  if (keyedCount < 0) {
    throw new Error(
      '读不到抠图缓存状态（页面的 keyState 没接通）。为了不给你一张绿底图，这里直接停：' +
        '请重新 sprite_key_apply 后再 export。',
    )
  }
  throw new Error(
    '抠图缓存是空的（可能刚跑过 sprite_key_preview / 改过参数）。' +
      '请先再跑一次 sprite_key_apply，然后立刻 export。',
  )
}

/**
 * 导出后的第二道闸：整图几乎全不透明 = 大概率是原帧拼进去的。
 *
 * 阈值取 0.99：真实的角色精灵图总有大量透明区（实测 8 段素材 alpha 全透占比 60%~90%）。
 */
export function assertNotOpaque(stats: SpriteStats, threshold = 0.99): void {
  if (stats.alphaHistogram[3] <= threshold) return
  throw new Error(
    '导出的图几乎全不透明（alpha 全 255），大概率是把原帧拼进去了（绿底）。' +
      '常见原因：抠图缓存被清空 / 键色不对。请重跑 sprite_key_apply 后再导出。',
  )
}

/** 从抽样帧里挑"最差"的一帧：背景残留 + 绿边 + (1 - 主体完整度) 的最大值。 */
export function pickWorst(candidates: Array<{ frame: number; stats: SpriteStats }>): WorstFrame | undefined {
  let worst: WorstFrame | undefined
  let bestScore = -1
  for (const candidate of candidates) {
    const { stats } = candidate
    const score = stats.bgResidual + stats.edgeGreen + (1 - stats.subjectCoverage)
    if (score > bestScore) {
      bestScore = score
      worst = {
        frame: candidate.frame,
        bgResidual: stats.bgResidual,
        edgeGreen: stats.edgeGreen,
        subjectCoverage: stats.subjectCoverage,
      }
    }
  }
  return worst
}

/**
 * 第三道判据：**参数回显 vs 成品实测**。
 *
 * `achievedPx` 只是"你给的 span/整格高被缩到了多少"，不是成品里角色有多高。
 * 2026-11-13 用户连续三次栽在这上面：`achievedPx:300`，解出成品一量是 382 / 341 / 303。
 * 所以 export 现在自己把导出的图量一遍，差超过容差就把两个数并排放进 warnings。
 *
 * 容差口径（2026-11-13 定）：**相对 0.5% 与绝对 2px 取宽松的那个**。
 * 起因是用户第三次的 300→303 只差 3px（0.99%），按 1% 相对容差**刚好不告警**——
 * 那正是他最需要被提醒的一次。只按比例又会对大目标把取整噪声当事故，所以两者取 max：\n * 2px 以内算取整，超过 2px 或超过 0.5% 都要说话。
 *
 * @param achievedPx 缩放桥接回的参数回显（`scaleTo.achievedPx`）
 * @param measuredPx 成品实测的身高中位数
 * @param tolerance 相对容差（默认 0.5%）
 * @param absolutePx 绝对容差（默认 2px：误差预算里语义点本身就允许 ±2）
 * @returns 需要告警时的中文文案；在容差内返回 null
 */
export const MEASURED_REL_TOLERANCE = 0.005
export const MEASURED_ABS_TOLERANCE_PX = 2

export function measuredMismatchWarning(
  achievedPx: number | undefined,
  measuredPx: number | undefined,
  tolerance = MEASURED_REL_TOLERANCE,
  absolutePx = MEASURED_ABS_TOLERANCE_PX,
): string | null {
  if (typeof achievedPx !== 'number' || !Number.isFinite(achievedPx)) return null
  if (typeof measuredPx !== 'number' || !Number.isFinite(measuredPx) || measuredPx <= 0) return null
  const delta = Math.abs(measuredPx - achievedPx)
  // 相对 0.5% 与绝对 1px 取宽松的那个：小目标上 3px 已经是 1%，只按比例会漏（用户的 300→303 正是这种）；
  // 大目标上 1px 的取整噪声也不该天天报警。两者取 max 正好同时满足。
  if (!(delta > Math.max(absolutePx, measuredPx * tolerance))) return null
  const percent = Math.round((delta / measuredPx) * 1000) / 10
  const direction = measuredPx > achievedPx ? '大' : '小'
  return (
    `参数回显与成品实测不一致：参数 ${Math.round(achievedPx)}px / 实测 ${Math.round(measuredPx)}px（偏 ${percent}%，差 ${Math.round(delta)}px）。` +
    `achievedPx 只是"你给的 span/整格高被缩到了多少"，成品里 alpha 的内容高是 ${Math.round(measuredPx)}px` +
    `（比参数${direction}）——按成品身高对齐请用 measured.charHeightPx 重算，别信 achievedPx。`
  )
}

/** 默认产物名：`<name>_<cols>x<rows>.<format>`（与 Unity SheetPath 一个习惯）。 */export function defaultFileNames(args: {
  name: string
  cols: number
  rows: number
  format: 'png' | 'webp'
  fileName?: string
  metaName?: string
}): { file: string; meta: string } {
  const safeName = (args.name || 'sheet').replace(/[\\/:*?"<>|]/g, '_')
  const base = args.fileName ?? `${safeName}_${args.cols}x${args.rows}`
  const file = base.toLowerCase().endsWith(`.${args.format}`) ? base : `${base}.${args.format}`
  const meta = args.metaName ?? `${file.replace(new RegExp(`\\.${args.format}$`, 'i'), '')}.meta.json`
  return { file, meta }
}
/**
 * 按帧数推网格（评审文档 §8：`cols = rows = ceil(sqrt(frames))` 的思路）。
 *
 * 为什么不让调用方总靠自己算：48 帧几乎总被写成 8×6，但 30 帧的素材写成 8×6 会留一排空格，
 * 而 60 帧写成 8×6 会**直接丢掉 12 帧**——后者是静默数据丢失，必须由工具挡住。
 */
export function gridFor(frames: number): { cols: number; rows: number } {
  const total = Math.max(1, Math.floor(frames))
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)))
  const rows = Math.max(1, Math.ceil(total / cols))
  return { cols, rows }
}

/**
 * 网格容量校验：放不下就抛（静默丢帧是最坏的一种"成功"）；浪费超过一半给 warning。
 */
export function checkGridCapacity(frames: number, cols: number, rows: number): { warnings: string[] } {
  const capacity = Math.max(1, Math.floor(cols)) * Math.max(1, Math.floor(rows))
  if (frames > capacity) {
    throw new Error(
      `网格塞不下：${frames} 帧要放进 ${cols}×${rows}=${capacity} 格。` +
        `会静默丢掉 ${frames - capacity} 帧——请把 cols/rows 调大，或不传让工具按帧数自动推。`,
    )
  }
  const warnings: string[] = []
  if (capacity >= frames * 2) {
    warnings.push(`网格偏大：${cols}×${rows}=${capacity} 格只放 ${frames} 帧，末尾会留大片空格`)
  }
  return { warnings }
}