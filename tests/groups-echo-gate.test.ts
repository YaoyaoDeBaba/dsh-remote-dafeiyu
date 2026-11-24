/**
 * groups-echo-gate.test —— 互吹闸与群聊纪律（2026-11-24，第二版）。
 *
 * 钉的是「群成员之间别每句废话都回」，同时**不许误杀干货**：
 * ① 同一对会话发到第 4 条"确认类"（收到/好的）时丢弃、message 说清原因、jsonl 留痕；
 * ② A→B 与 B→A 算同一对；
 * ③ 用户往群里发一条 ⇒ 计数清零，下一条立刻放行；
 * ④ 超过窗口的旧往返自然滚出去；
 * ⑤ 用户来源的投递既不计也不闸；
 * ⑥ **带实质内容的消息（数字/路径/长文）不占"确认类"预算**——这是真机反馈的回归点：
 *    早先按"所有往返"一刀切（6 次），把一份计划文件和一条修法也丢了；
 * ⑦ 只有硬上限（默认 20 条）才管到实质消息。
 *
 * 全程进程内：deliver 是假的、时钟是假的，不起会话、不碰网络。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createGroups,
  deliveryText,
  ECHO_DISCIPLINE,
  ECHO_DISCIPLINE_BRIEF,
  ECHO_GATE,
  type GroupRecord,
} from '../src/groups/service.js'

function makeHarness(
  over: { roundTripWindowMs?: number; maxRoundTrips?: number; hardMaxTrips?: number } = {},
) {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-echo-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const logs: string[] = []
  let clock = 1_700_000_000_000
  const groups = createGroups({
    dir,
    deliver: async (sessionId: string, text: string) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    // 闸单独验：把冷却关掉，免得 60 秒冷却先把投递吞了（那是另一条判据）
    cooldownMs: 0,
    ...(over.roundTripWindowMs === undefined ? {} : { roundTripWindowMs: over.roundTripWindowMs }),
    ...(over.maxRoundTrips === undefined ? {} : { maxRoundTrips: over.maxRoundTrips }),
    ...(over.hardMaxTrips === undefined ? {} : { hardMaxTrips: over.hardMaxTrips }),
    now: () => clock,
    log: (message: string) => {
      logs.push(message)
    },
  })
  return {
    dir,
    sent,
    logs,
    groups,
    tick: (ms: number): void => {
      clock += ms
    },
  }
}

/** 一次「a 说给 b」的群发言：kind=agent 才进闸。 */
async function say(
  groups: ReturnType<typeof createGroups>,
  id: string,
  from: string,
  to: string,
  text = '收到',
) {
  return groups.post({ id, from, text, targets: [to], kind: 'agent' })
}

function makeGroup(h: ReturnType<typeof makeHarness>): string {
  const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
  return created.group!.id
}

test('① 确认类发到第 4 条丢弃：不投递、message 说明、jsonl 留 skipped', async () => {
  const h = makeHarness({ maxRoundTrips: 3 })
  try {
    const id = makeGroup(h)
    for (let i = 0; i < 3; i += 1) {
      const posted = await say(h.groups, id, 'session-a', 'session-b', '收到')
      assert.equal(posted.ok, true, '前 3 条确认都要送到')
      assert.equal(posted.delivered!.length, 1)
    }
    assert.equal(h.sent.length, 3)

    const gated = await say(h.groups, id, 'session-a', 'session-b', '好的')
    assert.equal(gated.ok, true, '被闸掉不是错误（ok 仍为 true）')
    assert.equal(h.sent.length, 3, '第 4 条确认真不投递')
    assert.deepEqual(gated.delivered, [], '没送到就不许报 delivered')
    assert.match(String(gated.message), /互吹闸/)
    assert.match(String(gated.message), /本次不投递/)

    const trail = h.groups.read({ id }).messages!.filter((row: GroupRecord extends never ? never : { skipped?: string }) => row.skipped === ECHO_GATE)
    assert.equal(trail.length, 1, 'jsonl 里要留一行 skipped=' + ECHO_GATE)
    assert.ok(h.logs.some((line: string) => line.includes('互吹闸')), '要写一行中文日志')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('② A→B 与 B→A 算同一对：确认类攒满 3 条后两个方向都丢', async () => {
  const h = makeHarness({ maxRoundTrips: 3 })
  try {
    const id = makeGroup(h)
    const order: Array<[string, string]> = [
      ['session-a', 'session-b'],
      ['session-b', 'session-a'],
      ['session-a', 'session-b'],
    ]
    for (const [from, to] of order) {
      const posted = await say(h.groups, id, from, to, '收到')
      assert.equal(posted.delivered!.length, 1, from + ' → ' + to + ' 前 3 条都放行')
    }
    assert.equal(h.sent.length, 3)

    const forward = await say(h.groups, id, 'session-a', 'session-b', '明白')
    assert.match(String(forward.message), /互吹闸/)
    const backward = await say(h.groups, id, 'session-b', 'session-a', '好的')
    assert.match(String(backward.message), /互吹闸/, 'B→A 也要丢（同一对）')
    assert.equal(h.sent.length, 3, '两个方向都没真投')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('③ 用户发言后计数清零：下一条确认立刻放行', async () => {
  const h = makeHarness({ maxRoundTrips: 3 })
  try {
    const id = makeGroup(h)
    for (let i = 0; i < 3; i += 1) await say(h.groups, id, 'session-a', 'session-b', '收到')
    assert.match(String((await say(h.groups, id, 'session-a', 'session-b', '好的')).message), /互吹闸/)

    const fromUser = await h.groups.post({ id, from: 'user', text: '这段先停一下', targets: ['session-b'], kind: 'user' })
    assert.equal(fromUser.ok, true, '用户的消息本身照常送')

    const again = await say(h.groups, id, 'session-a', 'session-b', '收到')
    assert.equal(again.delivered!.length, 1, '用户发言之后这一对重新开始计数')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('④ 超过窗口的旧往返自然滚出去', async () => {
  const h = makeHarness({ maxRoundTrips: 3, roundTripWindowMs: 60_000 })
  try {
    const id = makeGroup(h)
    for (let i = 0; i < 3; i += 1) await say(h.groups, id, 'session-a', 'session-b', '收到')
    assert.match(String((await say(h.groups, id, 'session-a', 'session-b', '好的')).message), /互吹闸/)

    h.tick(61_000)
    const afterWindow = await say(h.groups, id, 'session-a', 'session-b', '收到')
    assert.equal(afterWindow.delivered!.length, 1, '窗口外的旧确认不该继续占额度')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑤ 用户来源的投递既不计也不闸：连发 10 条都不触发', async () => {
  const h = makeHarness({ maxRoundTrips: 3 })
  try {
    const id = makeGroup(h)
    for (let i = 0; i < 10; i += 1) {
      const posted = await h.groups.post({ id, from: 'user', text: '收到', targets: ['session-b'], kind: 'user' })
      assert.equal(posted.delivered!.length, 1, '用户第 ' + (i + 1) + ' 条也要送到')
    }
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑥ 带实质内容的消息不占确认预算（真机回归：一堆确认之后，干货仍要送出去）', async () => {
  const h = makeHarness({ maxRoundTrips: 3 })
  try {
    const id = makeGroup(h)
    // 先把确认预算用光
    for (let i = 0; i < 3; i += 1) await say(h.groups, id, 'session-a', 'session-b', '收到')
    const gated = await say(h.groups, id, 'session-a', 'session-b', '好的')
    assert.match(String(gated.message), /互吹闸/, '确认类确实被拦住了')

    // 干货必须还能发（带路径 + 数字，长度也够）
    const plan = await say(
      h.groups,
      id,
      'session-a',
      'session-b',
      '4 个测量点写在 _work/tools/plan_cl_b1_rest.json：haloPeak=0，m1=12.5，m2=8.0 —— 判据是 node --test 全绿',
    )
    assert.equal(plan.delivered!.length, 1, '带数字/路径的实质消息被误杀了：这就是 2026-11-24 真机那条投诉')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑦ 硬上限：窗口内总往返 20 条后，连实质消息也拦（防真正的死循环）', async () => {
  const h = makeHarness({ maxRoundTrips: 3, hardMaxTrips: 5 })
  try {
    const id = makeGroup(h)
    for (let i = 0; i < 5; i += 1) {
      const posted = await say(h.groups, id, 'session-a', 'session-b', '第 ' + (i + 1) + ' 条：m' + i + '=1.5 写进 plan.json')
      assert.equal(posted.delivered!.length, 1, '第 ' + (i + 1) + ' 条实质消息要送到')
    }
    const blocked = await say(h.groups, id, 'session-a', 'session-b', '第 6 条：plan.json m5=2.0')
    assert.match(String(blocked.message), /硬上限/, '超过硬上限要拦，并说明是硬上限')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑧ 纪律已常驻 system 段时尾巴只剩一行；没挂上则仍带全文（方案 A+C 的兜底）', async () => {
  const h = makeHarness()
  try {
    const id = makeGroup(h)
    const group = h.groups.get(id) as GroupRecord
    const titleOf = (sid: string) => '会话' + sid.slice(-1)
    const full = deliveryText(group, 'session-a', '正文', ['session-b'], titleOf, 'session-b', false, false)
    const short = deliveryText(group, 'session-a', '正文', ['session-b'], titleOf, 'session-b', false, true)
    assert.ok(full.includes(ECHO_DISCIPLINE), '段没挂上时必须带完整纪律（不能赌它已经在了）')
    assert.equal(short.includes(ECHO_DISCIPLINE), false, '段挂上之后不该再带长纪律')
    assert.ok(short.includes(ECHO_DISCIPLINE_BRIEF), '精简后仍要保留那一行核心纪律')
    assert.ok(short.includes('成员：'), '精简版仍要带成员表（协作对象需要）')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})
