/**
 * groups-echo-gate.test —— 互吹闸与群聊纪律（2026-11-24）。
 *
 * 钉的是「群成员之间别每句废话都回」这一条：
 * ① 同一对会话往返 4 次后第 5 次丢弃、message 说清原因、jsonl 留痕；
 * ② A→B 与 B→A 算同一对；
 * ③ 用户往群里发一条 ⇒ 计数清零，下一条立刻放行；
 * ④ 超过窗口的旧往返自然滚出去；
 * ⑤ 用户来源的投递既不计也不闸；
 * ⑥ 纪律文案落在投递正文与 group_post 的描述里（一份真源）。
 *
 * 全程进程内：deliver 是假的、时钟是假的，不起会话、不碰网络。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildGroupTools } from '../src/groups/tools.js'
import {
  createGroups,
  deliveryText,
  ECHO_DISCIPLINE,
  ECHO_DISCIPLINE_BRIEF,
  ECHO_GATE,
  type GroupRecord,
} from '../src/groups/service.js'

function makeHarness(over: { roundTripWindowMs?: number; maxRoundTrips?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-groups-echo-'))
  const sent: Array<{ sessionId: string; text: string }> = []
  const logs: string[] = []
  let clock = 1_700_000_000_000
  const groups = createGroups({
    dir,
    deliver: async (sessionId, text) => {
      sent.push({ sessionId, text })
      return { ok: true }
    },
    // 闸单独验：把冷却关掉，免得 60 秒冷却先把投递吞了（那是另一条判据）
    cooldownMs: 0,
    ...(over.roundTripWindowMs === undefined ? {} : { roundTripWindowMs: over.roundTripWindowMs }),
    ...(over.maxRoundTrips === undefined ? {} : { maxRoundTrips: over.maxRoundTrips }),
    now: () => clock,
    log: (message) => {
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
  text = '字段改成 v2 了',
) {
  return groups.post({ id, from, text, targets: [to], kind: 'agent' })
}

test('① 往返 6 次后第 7 次丢弃：不投递、message 说明、jsonl 留 skipped', async () => {
  const h = makeHarness()
  try {
    const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    for (let i = 0; i < 6; i += 1) {
      const posted = await say(h.groups, id, 'session-a', 'session-b', '第 ' + (i + 1) + ' 条：字段改完了')
      assert.equal(posted.ok, true, '前 6 次往返都要送到')
      assert.equal(posted.delivered!.length, 1)
    }
    assert.equal(h.sent.length, 6, '6 次都真投了')

    const gated = await say(h.groups, id, 'session-a', 'session-b', '收到')
    assert.equal(gated.ok, true, '被闸掉不是错误（ok 仍为 true）')
    assert.equal(h.sent.length, 6, '第 7 次真不投递')
    assert.deepEqual(gated.delivered, [], '没送到就不许报 delivered')
    assert.match(String(gated.message), /互吹闸/)
    assert.match(String(gated.message), /10 分钟内已往返 6 次/)
    assert.match(String(gated.message), /本次不投递/)

    const trail = h.groups.read({ id }).messages!.filter((row) => row.skipped === ECHO_GATE)
    assert.equal(trail.length, 1, 'jsonl 里要留一行 skipped=' + ECHO_GATE)
    assert.ok(trail[0]!.text.includes('丢弃'), '留痕要说明是丢掉的投递')
    assert.ok(
      h.logs.some((line) => line.includes('互吹闸')),
      '要写一行中文日志（事后查「为什么这条没送到」靠它）',
    )
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('② A→B 与 B→A 算同一对：交替 6 次后两个方向都丢', async () => {
  const h = makeHarness()
  try {
    const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    const order: Array<[string, string]> = [
      ['session-a', 'session-b'],
      ['session-b', 'session-a'],
      ['session-a', 'session-b'],
      ['session-b', 'session-a'],
      ['session-a', 'session-b'],
      ['session-b', 'session-a'],
    ]
    for (const [from, to] of order) {
      const posted = await say(h.groups, id, from, to, '第 ' + h.sent.length + ' 条')
      assert.equal(posted.delivered!.length, 1, from + ' → ' + to + ' 前 6 次都放行')
    }
    assert.equal(h.sent.length, 6)

    const forward = await say(h.groups, id, 'session-a', 'session-b', '好的')
    assert.match(String(forward.message), /互吹闸/, 'A→B 第 7 次要丢')
    const backward = await say(h.groups, id, 'session-b', 'session-a', '明白')
    assert.match(String(backward.message), /互吹闸/, 'B→A 第 7 次也要丢（同一对）')
    assert.equal(h.sent.length, 6, '两个方向都没真投')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('③ 用户发言后计数清零：下一条立刻放行', async () => {
  const h = makeHarness()
  try {
    const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    for (let i = 0; i < 6; i += 1) await say(h.groups, id, 'session-a', 'session-b', '第 ' + (i + 1) + ' 条')
    assert.match(String((await say(h.groups, id, 'session-a', 'session-b', '收到')).message), /互吹闸/)

    const fromUser = await h.groups.post({ id, from: 'user', text: '接口这段先停一下，等我确认', targets: ['session-b'], kind: 'user' })
    assert.equal(fromUser.ok, true, '用户的消息本身照常送')
    assert.equal(h.sent.length, 7)

    const again = await say(h.groups, id, 'session-a', 'session-b', '用户说要停，等你确认')
    assert.equal(again.delivered!.length, 1, '用户发言之后这一对重新开始计数')
    assert.equal(h.sent.length, 8)
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('④ 超过窗口：旧往返滚出去，自然放行', async () => {
  const h = makeHarness({ roundTripWindowMs: 1_000 })
  try {
    const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    for (let i = 0; i < 6; i += 1) await say(h.groups, id, 'session-a', 'session-b', '第 ' + (i + 1) + ' 条')
    h.tick(500)
    assert.match(String((await say(h.groups, id, 'session-a', 'session-b', '收到')).message), /互吹闸/, '窗口内仍然算满')
    h.tick(600)
    const after = await say(h.groups, id, 'session-a', 'session-b', '过了 1.1 秒，有新信息：orderId 也改了')
    assert.equal(after.delivered!.length, 1, '窗口滑过去之后自然放行')
    assert.equal(after.message, undefined, '放行时不许再带闸的提示')
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑤ 用户来源的投递从不计数', async () => {
  const h = makeHarness()
  try {
    const created = h.groups.create({ name: '互吹', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id
    for (let i = 0; i < 6; i += 1) {
      const posted = await h.groups.post({ id, from: 'user', text: '用户第 ' + (i + 1) + ' 条', targets: ['session-b'], kind: 'user' })
      assert.equal(posted.ok, true)
    }
    assert.equal(h.sent.length, 6, '用户的 6 条都送到')
    const firstAgent = await say(h.groups, id, 'session-a', 'session-b', '字段改完了')
    assert.equal(firstAgent.delivered!.length, 1, '用户消息不占闸的额度')
    assert.equal(firstAgent.message, undefined)
    assert.equal(
      h.groups.read({ id }).messages!.some((row) => row.skipped === ECHO_GATE),
      false,
      '用户消息一条都不该被闸',
    )
  } finally {
    rmSync(h.dir, { recursive: true, force: true })
  }
})

test('⑥ 纪律文案：投递正文与 group_post 描述都写了「不需要每条都回」', () => {
  const group: GroupRecord = { version: 2, id: 'g-echo', name: '互吹', members: [], createdAt: 0, updatedAt: 0 }
  const full = deliveryText(group, 'user', '你好', ['session-12345678'])
  assert.ok(full.includes(ECHO_DISCIPLINE), '第一次的投递正文要带完整纪律')
  assert.match(full, /不需要每条都回/)
  assert.match(full, /「收到」「好的」「明白」/)
  const brief = deliveryText(group, 'user', '你好', ['session-12345678'], undefined, undefined, true)
  assert.ok(brief.includes(ECHO_DISCIPLINE_BRIEF), '第二次起带两行版')
  assert.ok(!brief.includes('group_read'), '极短版仍不复述工具用法')

  const { dir, groups } = makeHarness()
  try {
    const definition = buildGroupTools({ groups, guideBody: () => '# guide', log: () => {} }).find(
      (tool) => tool.name === 'group_post',
    )
    const description = String(definition!.description)
    assert.match(description, /不要为了回一句而回/)
    assert.match(description, /不需要每条都回/)
    assert.match(description, /互吹闸/, '工具描述要预告「超限会被丢」')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
