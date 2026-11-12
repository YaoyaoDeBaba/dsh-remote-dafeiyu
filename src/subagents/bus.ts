/**
 * subagents/bus —— 子代理变化的进程内事件总线。
 *
 * 客户端不再定时轮询，而是订阅 SSE；哪些变化要唤醒它：
 * - 子代理的 run 状态变了（translateAgentStatus）；
 * - 已识别为子代理的会话有新事件（新建/回合/工具等，说明它有进展）。
 *
 * 2026-11-12（性能优化）改了三条，都是为了把"没有变化也刷"这件事掐掉：
 *
 * 1. **推送带载荷**：以前 SSE 帧只有一个字 `change`，客户端收到就必须换一次全量
 *    `GET /subagents`。现在发的是宿主算好的**轻量快照**（每个父会话的 [总数, running 数]），
 *    面板关着时只用它更新徽标，一次请求都不发。参考 dsh-agent-team 的「推数据而不是推信号」。
 * 2. **相同载荷不发**：上一次发过的 JSON 与这次逐字节相同就直接丢掉——这就是
 *    dsh-agent-team 里 `apply` 返回同一引用 + view 走 WeakMap 复用在做的事（语义一致即可，
 *    我们不需要投影那一套，因为状态本来就在内存里）。
 * 3. **没有订阅者不发**：一条 SSE 连接都没有时连 400ms 定时器都不设，不留白跑的事件。
 *
 * 合并策略也顺手修了：以前是「首帧调度、窗口内的全丢」，现在是「窗口内只保留最后一次」。
 * 对状态快照来说必须取最后一次，丢掉中间态没关系，丢掉最后态会让界面停在旧值。
 */
import { EventEmitter } from 'node:events'

export const subagentBus = new EventEmitter()
subagentBus.setMaxListeners(64)

let pending: ReturnType<typeof setTimeout> | undefined
/** 窗口内最后一次待发的载荷（undefined = 这一轮没有新东西）。 */
let queued: string | undefined
/** 上一次真正发出去的载荷；与它相同就不再发。 */
let lastPayload: string | undefined

/**
 * 「现在到底有没有人在听」。
 *
 * 单看 `listenerCount` 是没用的：start.ts 一启动就订阅了总线，哪怕一条 SSE 连接都没有，
 * 它照样算"有听众"。真正该问的是**有没有活跃的 SSE 客户端**，而这件事只有接线层知道，
 * 所以由 start.ts 通过 `setSubagentBusGate` 注入。
 */
let hasConsumers: () => boolean = () => subagentBus.listenerCount('change') > 0

/** 注入"有没有人在听"的判据（start.ts 接上 SSE 客户端集合）。 */
export function setSubagentBusGate(gate: () => boolean): void {
  hasConsumers = gate
}

/** 恢复默认判据（停机/卸载时用）。 */
export function resetSubagentBusGate(): void {
  hasConsumers = () => subagentBus.listenerCount('change') > 0
}

/** 仅供测试：清空去重状态，避免用例之间互相污染。 */
export function resetSubagentBusState(): void {
  if (pending !== undefined) {
    clearTimeout(pending)
    pending = undefined
  }
  queued = undefined
  lastPayload = undefined
}

/**
 * 通知订阅者「子代理状态变了」。
 *
 * @param payload 轻量快照（JSON 字符串）。给了就参与去重；不给则退回旧的 `change` 信号
 *                （保持兼容，某些调用点确实只想说"有变化"）。
 */
export function emitSubagentChange(payload?: string): void {
  // 没有人在听就不排定时器：省一次事件循环唤醒，也省一次快照构建。
  if (!hasConsumers()) return
  if (payload === undefined) {
    queued = 'change'
  } else {
    // 与上次发过的完全一样：没有任何客户端会因此看到差别，直接丢。
    if (payload === lastPayload) return
    queued = payload
  }
  if (pending !== undefined) return
  pending = setTimeout(() => {
    pending = undefined
    const next = queued
    queued = undefined
    if (next === undefined) return
    if (next === lastPayload) return
    lastPayload = next
    try {
      subagentBus.emit('change', next)
    } catch {
      /* 订阅方抛错不影响宿主 */
    }
  }, 400)
  // 不阻止进程退出
  if (typeof pending === 'object' && pending !== null && 'unref' in pending) {
    ;(pending as { unref?: () => void }).unref?.()
  }
}
