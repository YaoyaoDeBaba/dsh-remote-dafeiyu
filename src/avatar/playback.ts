/**
 * avatar/playback — 形象小窗的「播片节奏」：纯逻辑，不碰 DOM、不碰定时器。
 *
 * ## 为什么把它抽出来
 *
 * 2026-11-13 用户报「形象一抽一抽的，同一个动画不断刷新前几帧」。根因不是素材、也不是
 * 图集读错了字段，而是**播片进度用了两个时钟**：
 *
 * - 画面哪一帧：`avatar-widget` 的 `setInterval(paint, 1000/24)` 一拍推进 `frame += 1`；
 * - 这一片算不算播完：`clipUntil = Date.now() + loops × frames / FPS × 1000`，按**墙钟**。
 *
 * 两个时钟一旦脱钩（主线程被别的模块占住掉了一拍、窗口被遮挡被 throttle、合盖刚唤醒），
 * 墙钟说"到点了"而帧才画到个位数 ⇒ 立刻换片 ⇒ 换片又把 `frame` 归零 ⇒ 你看到的永远是
 * 每个动作的**前几帧**，而且掉拍越厉害重启越频繁（正反馈）。实测：42ms 一拍→48 帧全播；
 * 掉拍到 120ms 一拍→每片只播 17 帧；250ms→9 帧；后台 1s→3 帧。
 *
 * 修法：**"播完了"只看画了多少帧，不看墙钟**。`frames × loops` 帧画满才换片，掉拍只会
 * 让同一个动作播得慢一点，绝不跳帧、绝不回第 0 帧。
 *
 * ## 也给"别的模块带坏它"留了判据
 *
 * 状态轮询（每 2.5s 一次 `setPool('idle')`）、SSE、面板刷新之类的高频事件，只要**目标池
 * 没变**就不可能打断正在播的片（`setPool` 同池是 no-op）。这条从"没准会重启"变成结构性
 * 保证，`tests/avatar-playback.test.ts` 钉住了它。
 */

/** 三个动作池：待机 / 干活 / 交付。 */
export type AvatarPool = 'idle' | 'think' | 'talk'

/** 一支要播的片（一个动作）。 */
export interface ClipSpec {
  /** 动作 id（= manifest 里的 state.id，也用来查素材就绪状态）。 */
  id: string
  /** 网格列数。 */
  cols: number
  /** 网格行数。 */
  rows: number
  /** 这一片一共多少帧（≤ cols × rows）。 */
  frames: number
  /** 连播几遍再换片。 */
  loops: number
}

/** 这一拍该画哪一格。 */
export interface FrameView {
  /** 格子列（0 起）。 */
  col: number
  /** 格子行（0 起）。 */
  row: number
  /** 本片第几帧（0 起；跨 loop 会重复，用于画）。 */
  frame: number
  /** 本片已经画到第几帧（0 起；**跨 loop 不重复**，就是播放进度）。 */
  played: number
  /**
   * 这一帧是不是本片的**最后一帧**（画完这一帧，下一拍就换片）。
   * 只给界面做"要换片了"的提示，判据用 `pacer.progress` 更直接。
   */
  last: boolean
}

export interface ClipPacerDeps {
  /**
   * 从某个池子里挑一支片播。返回 `undefined` = 这个池子里没有能用的动作。
   * 挑法（权重、避免连播同一个）由调用方决定，这里只管节奏。
   */
  pick: (pool: AvatarPool) => ClipSpec | undefined
  /**
   * 这支片现在**能不能立刻播**（素材已就绪）。
   *
   * 实现方可以在里面顺手踢一次预加载；返回 false 时 pacers 会保留旧片继续放、
   * 隔几帧再挑（**不重置播放进度**）。
   */
  available: (spec: ClipSpec) => boolean
  /** 真去切片（DOM 几何 + backgroundImage）。被调用时进度已经归零。 */
  onSwitch: (spec: ClipSpec) => void
}

/** 素材没就绪时，隔多少帧再挑一次（约 250ms，别每拍都随机挑）。 */
const RETRY_FRAMES = 6

/** 一支片要画多少帧才算播完（`frames × loops`，两个数都至少按 1 算）。 */
export function clipPaints(spec: ClipSpec): number {
  const frames = spec.frames > 0 ? Math.floor(spec.frames) : 1
  const loops = spec.loops > 0 ? Math.floor(spec.loops) : 1
  return frames * loops
}

/**
 * 播片节奏状态机。
 *
 * 调用约定（`avatar-widget.paint()` 就是这么用的）：
 *
 * ```ts
 * const view = pacer.tick()   // 一拍 = 一次 tick
 * if (view) drawCell(view)    // undefined = 暂时没片可播（素材还没就绪）
 * ```
 */
export class ClipPacer {
  private poolValue: AvatarPool = 'idle'
  private clipValue: ClipSpec | undefined
  /** 本片已画帧数（0 = 还没画第一帧）。 */
  private playedValue = 0
  /** 下一拍要先换片。 */
  private dirty = true
  /** 挑片失败的退避计数（按帧，不是墙钟）。 */
  private retryIn = 0

  constructor(private readonly deps: ClipPacerDeps) {}

  /** 当前目标池。 */
  get pool(): AvatarPool {
    return this.poolValue
  }

  /** 正在播的片（`undefined` = 还没开播）。 */
  get clip(): ClipSpec | undefined {
    return this.clipValue
  }

  /** 播放进度：`played / total`，测试与诊断用。 */
  get progress(): { clipId: string | undefined; played: number; total: number } {
    return {
      clipId: this.clipValue?.id,
      played: this.playedValue,
      total: this.clipValue ? clipPaints(this.clipValue) : 0,
    }
  }

  /**
   * 换目标池（状态变化：待机/干活/交付）。
   *
   * - **同池重复调用是 no-op**：这正是"高频事件不会重置索引"的结构性保证——轮询每 2.5s
   *   调一次 `setPool('idle')` 也不会打断正在播的片。
   * - 真换了池子（或还没开播）才在下一拍换片。
   *
   * @returns 目标池是否真的变了。
   */
  setPool(pool: AvatarPool): boolean {
    const changed = pool !== this.poolValue
    this.poolValue = pool
    if (changed || this.clipValue === undefined) {
      this.dirty = true
      this.retryIn = 0
    }
    return changed
  }

  /**
   * 强制播一支指定的片（戳一下那种一次性反应）。
   *
   * `pool` 不变，所以这一片播完会自动回到当前池子继续（不会卡在反应动作上）。
   *
   * @returns 素材没就绪（没切）时返回 false。
   */
  force(spec: ClipSpec): boolean {
    if (!this.deps.available(spec)) return false
    this.start(spec)
    return true
  }

  /** 画下一帧。返回 `undefined` = 这一拍没片可播（素材没就绪），**进度不变**。 */
  tick(): FrameView | undefined {
    if (this.dirty) this.beginNext()
    const clip = this.clipValue
    if (clip === undefined) return undefined

    const frames = clip.frames > 0 ? Math.floor(clip.frames) : 1
    const cols = clip.cols > 0 ? Math.floor(clip.cols) : 1
    const rows = clip.rows > 0 ? Math.floor(clip.rows) : 1
    const total = clipPaints(clip)
    const index = this.playedValue % frames
    const view: FrameView = {
      col: index % cols,
      row: Math.floor(index / cols) % rows,
      frame: index,
      played: this.playedValue,
      last: this.playedValue + 1 >= total,
    }
    this.playedValue += 1
    // 播满了：下一拍换片（**不是**这一拍，这一帧还得画完）
    if (this.playedValue >= total) this.dirty = true
    return view
  }

  private start(spec: ClipSpec): void {
    this.clipValue = spec
    this.playedValue = 0
    this.dirty = false
    this.retryIn = 0
    this.deps.onSwitch(spec)
  }

  /**
   * 挑下一支片。
   *
   * 没素材就绪时**保留旧片继续放**（进度不动），隔 `RETRY_FRAMES` 帧再挑——
   * 旧实现这里会把索引归零并换成半张图，是"抽"的第二个来源。
   */
  private beginNext(): void {
    this.dirty = false
    if (this.retryIn > 0) {
      this.retryIn -= 1
      return
    }
    const picked = this.deps.pick(this.poolValue)
    if (picked === undefined || !this.deps.available(picked)) {
      this.retryIn = RETRY_FRAMES
      return
    }
    this.start(picked)
  }
}
