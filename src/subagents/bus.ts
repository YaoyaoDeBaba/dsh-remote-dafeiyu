/**
 * subagents/bus —— 子代理变化的进程内事件总线（0.33）。
 *
 * 客户端不再定时轮询，而是订阅 SSE；哪些变化要唤醒它：
 * - 子代理的 run 状态变了（translateAgentStatus）；
 * - 已识别为子代理的会话有新事件（新建/回合/工具等，说明它有进展）。
 *
 * 400ms 合并一次：一个回合里事件很密，逐条推会让客户端反复刷新。
 */
import { EventEmitter } from 'node:events'

export const subagentBus = new EventEmitter()
subagentBus.setMaxListeners(64)

let pending: ReturnType<typeof setTimeout> | undefined

export function emitSubagentChange(): void {
  if (pending !== undefined) return
  pending = setTimeout(() => {
    pending = undefined
    try {
      subagentBus.emit('change')
    } catch {
      /* 订阅方抛错不影响宿主 */
    }
  }, 400)
  // 不阻止进程退出
  if (typeof pending === 'object' && pending !== null && 'unref' in pending) {
    ;(pending as { unref?: () => void }).unref?.()
  }
}
