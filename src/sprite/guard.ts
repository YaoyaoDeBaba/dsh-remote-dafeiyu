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

/** 默认产物名：`<name>_<cols>x<rows>.<format>`（与 Unity SheetPath 一个习惯）。 */
export function defaultFileNames(args: {
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
