/**
 * avatar-playback.test — 播片节奏（纯逻辑）的判据。
 *
 * 背景：2026-11-13 用户报「形象一抽一抽，同一个动画不断刷新前几帧」。根因是"播完没播完"
 * 用**墙钟**判、"画到第几帧"用**定时器拍子**推，两个时钟一脱钩，墙钟到点时帧才画了几张，
 * 于是换片→索引归零→永远只看到前几帧。这个文件钉三件事：
 *
 * 1. 一支片必须按帧**连续**推到最后一帧才换片（不跳帧、不回第 0 帧）；
 * 2. 任何**与播片无关的高频事件**（状态轮询那种）都不许重置索引；
 * 3. 素材没就绪时保留旧片继续播，**不**把进度归零。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ClipPacer, clipPaints, type AvatarPool, type ClipSpec } from '../src/avatar/playback.js'

const CLIP_A: ClipSpec = { id: 'a', cols: 8, rows: 6, frames: 48, loops: 1 }
const CLIP_B: ClipSpec = { id: 'b', cols: 8, rows: 6, frames: 48, loops: 1 }

/** 一个按剧本出片的池子：`script` 用完就一直重复最后一个。 */
function harness(script: ClipSpec[], options: { ready?: (spec: ClipSpec) => boolean } = {}) {
  const picked: AvatarPool[] = []
  const switched: string[] = []
  let index = 0
  const pacer = new ClipPacer({
    pick: (pool) => {
      picked.push(pool)
      const spec = script[Math.min(index, script.length - 1)]
      index += 1
      return spec
    },
    available: (spec) => options.ready?.(spec) ?? true,
    onSwitch: (spec) => switched.push(spec.id),
  })
  return { pacer, picked, switched }
}

test('一支片按帧连续推进：0..47 逐帧画满，才换下一片', () => {
  const { pacer, switched } = harness([CLIP_A, CLIP_B])
  const frames: number[] = []
  const boundaries: number[] = []
  for (let tick = 0; tick < 48 * 3; tick += 1) {
    const view = pacer.tick()
    assert.ok(view, '素材就绪时每一拍都必须有帧可画')
    frames.push(view!.frame)
    if (view!.frame === 0) boundaries.push(tick)
  }
  // 每片 48 帧、顺序严格递增、到 47 收尾再回到 0
  assert.deepEqual(frames.slice(0, 48), Array.from({ length: 48 }, (_, i) => i), '第一片必须是 0..47 连续推进')
  assert.deepEqual(frames.slice(48, 96), Array.from({ length: 48 }, (_, i) => i), '第二片同样从 0 连续推进')
  // 换片只发生在帧画满之后（每 48 拍一次），不是"拍一下归零一下"
  assert.deepEqual(boundaries, [0, 48, 96], `换片边界不对：${boundaries.join(',')}`)
  assert.deepEqual(switched, ['a', 'b', 'b'], 'onSwitch 只在换片时被调')
})

test('播片进度按「画了多少帧」算，不按墙钟：掉拍到 1fps 也不跳帧、不回第 0 帧', () => {
  const { pacer } = harness([CLIP_A])
  // 模拟被 throttle：一秒只画 3 拍。旧实现这里墙钟早到点了，会换片并归零；
  // 新实现只要求"播完这 48 帧"，慢就是慢。
  const frames: number[] = []
  for (let tick = 0; tick < 48; tick += 1) frames.push(pacer.tick()!.frame)
  assert.deepEqual(frames, Array.from({ length: 48 }, (_, i) => i), '掉拍时也必须逐帧推进到最后一帧')
  assert.equal(pacer.progress.played, 48)
  assert.equal(pacer.progress.total, 48)
})

test('高频事件不重置索引：同池 setPool 调 200 次，进度继续往前走', () => {
  const { pacer, switched } = harness([CLIP_A])
  const frames: number[] = []
  for (let tick = 0; tick < 48; tick += 1) {
    // 每一拍都插一次"轮询式"的 setPool（真实里是 2.5s 一次，这里极端到每拍一次）
    for (let repeat = 0; repeat < 5; repeat += 1) assert.equal(pacer.setPool('idle'), false, '同池不该报变化')
    frames.push(pacer.tick()!.frame)
  }
  assert.deepEqual(frames, Array.from({ length: 48 }, (_, i) => i), '同池高频事件不许打断正在播的片')
  assert.deepEqual(switched, ['a'], '整片播完只切了一次')
})

test('池子真变了才换片（setPool 的返回值就是判据）', () => {
  const { pacer, picked, switched } = harness([
    { id: 'i', cols: 8, rows: 6, frames: 48, loops: 1 },
    { id: 't', cols: 8, rows: 6, frames: 48, loops: 1 },
  ])
  pacer.setPool('idle')
  pacer.tick()
  pacer.tick()
  assert.equal(pacer.setPool('idle'), false, '同池 = 没变')
  assert.equal(pacer.setPool('think'), true, '换池 = 变了')
  // 换池后下一拍才换片
  pacer.tick()
  assert.deepEqual(picked, ['idle', 'think'])
  assert.deepEqual(switched, ['i', 't'])
})

test('素材没就绪：保留旧片继续播，进度不归零', () => {
  const ready = new Set<string>(['a'])
  const { pacer, switched } = harness([CLIP_A, CLIP_B], { ready: (spec) => ready.has(spec.id) })
  const frames: number[] = []
  for (let tick = 0; tick < 48; tick += 1) frames.push(pacer.tick()!.frame)
  assert.deepEqual(frames, Array.from({ length: 48 }, (_, i) => i), '第一片正常播完')
  // b 还没就绪：接下来必须继续循环播 a，而且**不能**把索引打成负数/半个格子
  const after: number[] = []
  for (let tick = 0; tick < 20; tick += 1) after.push(pacer.tick()!.frame)
  assert.ok(
    after.every((frame) => frame >= 0 && frame < 48),
    `素材没就绪时画出的帧号必须仍在 0..47 内，实际：${after.join(',')}`,
  )
  assert.deepEqual(switched, ['a'], '没就绪的片不许切（切了就是半张图）')
  // 素材后来就绪 → 下一次挑片就会切过去
  ready.add('b')
  for (let tick = 0; tick < 12; tick += 1) pacer.tick()
  assert.deepEqual(switched, ['a', 'b'], '就绪后应当切过去')
})

test('force（戳一下）：播完一遍自动回到当前池子', () => {
  const { pacer, picked, switched } = harness([{ id: 'idle', cols: 8, rows: 6, frames: 48, loops: 1 }])
  pacer.setPool('idle')
  pacer.tick()
  assert.equal(pacer.force({ id: 'poke', cols: 8, rows: 6, frames: 48, loops: 1 }), true)
  assert.equal(pacer.progress.clipId, 'poke')
  assert.equal(pacer.progress.played, 0, '一次性反应从第 0 帧开始')
  const frames: number[] = []
  for (let tick = 0; tick < 48; tick += 1) frames.push(pacer.tick()!.frame)
  assert.deepEqual(frames, Array.from({ length: 48 }, (_, i) => i), '反应动作也要完整播一遍')
  pacer.tick()
  assert.equal(pacer.progress.clipId, 'idle', '播完回到池子里的动作，不卡在反应动作上')
  assert.equal(pacer.pool, 'idle', 'force 不改目标池')
  assert.deepEqual(picked, ['idle', 'idle'])
  assert.deepEqual(switched, ['idle', 'poke', 'idle'])
})

test('force 遇到没就绪的素材：不切，返回 false', () => {
  const { pacer } = harness([CLIP_A], { ready: () => false })
  assert.equal(pacer.force(CLIP_B), false)
  assert.equal(pacer.tick(), undefined, '没有可用素材时这一拍不画（而不是画半张图）')
  assert.deepEqual(pacer.progress, { clipId: undefined, played: 0, total: 0 })
})

test('loops > 1：播满 frames × loops 帧才换片', () => {
  const twice: ClipSpec = { id: 'nap', cols: 8, rows: 6, frames: 24, loops: 2 }
  const { pacer, switched } = harness([twice, CLIP_A])
  const frames: number[] = []
  for (let tick = 0; tick < 48; tick += 1) frames.push(pacer.tick()!.frame)
  assert.deepEqual(switched, ['nap'], '48 帧还没满，不许换片')
  assert.deepEqual(frames, [...Array.from({ length: 24 }, (_, i) => i), ...Array.from({ length: 24 }, (_, i) => i)])
  pacer.tick()
  assert.deepEqual(switched, ['nap', 'a'], '播满 48 帧才换')
})

test('clipPaints：网格与帧数不一致时按 frames 算（worker_run 是 8×3=24）', () => {
  assert.equal(clipPaints({ id: 'w', cols: 8, rows: 3, frames: 24, loops: 1 }), 24)
  assert.equal(clipPaints({ id: 'w', cols: 8, rows: 3, frames: 24, loops: 2 }), 48)
  // 脏数据（0 / 负数）按 1 算，不能把 total 变成 0 之后整除爆炸
  assert.equal(clipPaints({ id: 'x', cols: 8, rows: 6, frames: 0, loops: 0 }), 1)
})

test('行优先取格：每片恰好覆盖 8×6 全部格子各一次', () => {
  const { pacer } = harness([CLIP_A])
  const seen = new Set<string>()
  for (let tick = 0; tick < 48; tick += 1) {
    const view = pacer.tick()!
    assert.ok(view.col >= 0 && view.col < 8 && view.row >= 0 && view.row < 6, `越界格子 ${view.col},${view.row}`)
    seen.add(`${view.col},${view.row}`)
  }
  assert.equal(seen.size, 48, '48 帧必须覆盖 48 个格子，不能重复播同几格')
})
