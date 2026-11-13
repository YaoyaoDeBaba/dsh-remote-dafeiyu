/**
 * subagents/idle —— 子代理「时间显示」的唯一口径（宿主与桌面面板共用一份）。
 *
 * ## 为什么单独一个文件
 *
 * 两个理由，都不是洁癖：
 *
 * 1. **口径只能有一份**。`idleMs` 的语义 2026-11-13 改过：以前宿主用 `now` 兜底，
 *    冷会话（`createdAt` 是 0）算出来 `idleMs = 0`，端上 `fmtDuration(0)` 显示 `—`；
 *    现在"不知道"就是**不下发这个字段**。要判"端上显示成什么"，这段文案必须能
 *    在 node 的判据里被调用——而浏览器代码（`src/client/**`）不在那个编译面上，
 *    node 测试 import 不到。搬到宿主侧的纯模块里，两边才能对着同一份断言。
 * 2. **桌面面板是通过 esbuild 打的 bundle**（`scripts/bundle-plugin.mjs`），
 *    它完全可以 import `src/` 下别的目录（`src/pill.ts` 已经在 import `src/copy/zh.ts`），
 *    所以这里不需要抄第二份。
 *
 * 这个文件里**不许出现任何 `node:` / DOM API**：它同时被浏览器和 Node 加载。
 */

/** 面板愿意喂进来的那一小撮字段（结构类型，`SubagentRow` 天然满足）。 */
export interface SubagentTimeRow {
  status?: 'running' | 'idle'
  /** 距最后一次活动的毫秒；**缺省表示宿主不知道**（不是 0）。 */
  idleMs?: number
  /** `idleMs` 的口径：`activity` = 真的见过活动；`created` = 只有创建时间（下界）。 */
  idleBasis?: 'activity' | 'created'
  runningMs?: number
  workMs?: number
}

/**
 * 毫秒 → 人能读的时长；**不知道就给 `—`**。
 *
 * `ms <= 0` 也归到 `—`：一个"闲置了 0 秒"的子代理在监视器上没有意义，
 * 而 0 恰好是"刚创建"与"没算出来"两种情况的共同外观——所以宿主那边现在干脆
 * 不下发这个字段，这里只负责"没有就显示一个诚实的破折号"。
 */
export function formatDuration(ms: number | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** 是否"太久没动静"（标黄 + 建议归档）。不知道闲置多久的一律不算。 */
export function isStale(row: SubagentTimeRow, warnMs: number): boolean {
  if (row.status === 'running') return false
  return typeof row.idleMs === 'number' && Number.isFinite(row.idleMs) && row.idleMs >= warnMs
}

/**
 * 卡片上那一行时间。
 *
 * 三句话必须分得开（这是 2026-11-13 修的那个症状）：
 * - `工作时间 …` —— 正在跑；
 * - `闲置时间 …` —— 本进程真的见过它的活动，时间是可信的；
 * - `已创建 …（无活动记录）` —— 只拿到创建时间。**它只是下界**，写成"闲置 12h"
 *   是在编一个我们并不知道的时刻（创建之后可能一直在干活，只是主机没看见）。
 * - `闲置时间 —` —— 连创建时间都没有（冷会话 + 持久化列表也没它）。老实说不知道。
 */
export function subagentTimeText(row: SubagentTimeRow, warnMs: number): string {
  if (row.status === 'running') return '工作时间 ' + formatDuration(row.runningMs ?? row.workMs)
  if (typeof row.idleMs !== 'number' || !Number.isFinite(row.idleMs)) return '闲置时间 ' + formatDuration(undefined)
  if (row.idleBasis === 'created') {
    return '已创建 ' + formatDuration(row.idleMs) + '（无活动记录）' + (row.idleMs >= warnMs ? ' · 建议归档' : '')
  }
  return '闲置时间 ' + formatDuration(row.idleMs) + (row.idleMs >= warnMs ? ' · 建议归档' : '')
}
