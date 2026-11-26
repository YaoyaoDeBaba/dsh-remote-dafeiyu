/**
 * groups-avatar.test —— 群头像 data URL 的完整性校验（2026-11-26）。
 *
 * 事故背景：某会话传上来的 base64 被截断（长度 %4==1、缺 JPEG 尾标 FF D9），
 * 后端照收、浏览器不画，面板只剩空方块。这组判据钉死「坏数据必须在入口被拒」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { avatarProblem, createGroups } from '../src/groups/service.js'

/** 结构上合法的 JPEG：magic FFD8FF + 填充 + 尾标 FFD9（校验只看结构，不看像素）。 */
function jpegBytes(size = 200): Buffer {
  const body = Buffer.alloc(size, 0x20)
  body[0] = 0xff
  body[1] = 0xd8
  body[2] = 0xff
  body[size - 2] = 0xff
  body[size - 1] = 0xd9
  return body
}

/** 结构上合法的 PNG：签名 + 填充 + IEND 块（含 CRC）。 */
function pngBytes(size = 200): Buffer {
  const body = Buffer.alloc(size, 0x20)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body, 0)
  Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]).copy(body, size - 8)
  return body
}

const jpegUrl = (bytes: Buffer): string => 'data:image/jpeg;base64,' + bytes.toString('base64')
const pngUrl = (bytes: Buffer): string => 'data:image/png;base64,' + bytes.toString('base64')

test('头像校验：合法 JPEG / PNG 通过', () => {
  assert.equal(avatarProblem(jpegUrl(jpegBytes())), undefined)
  assert.equal(avatarProblem(pngUrl(pngBytes())), undefined)
})

test('头像校验：base64 长度不是 4 的倍数要拒（这次事故的形态）', () => {
  const url = jpegUrl(jpegBytes())
  // 事故现场是 %4==1（少了 3 个字符）；顺手把 %4==3 也钉上
  for (const cut of [1, 3]) {
    const broken = url.slice(0, url.length - cut)
    const payload = broken.slice('data:image/jpeg;base64,'.length)
    assert.equal(payload.length % 4, cut === 3 ? 1 : 3, '构造出来的正是被截断的形态')
    const problem = avatarProblem(broken)
    assert.ok(problem !== undefined && problem.includes('4 的倍数'), '要明确说截断：' + String(problem))
  }
})

test('头像校验：JPEG 缺 FF D9 / PNG 缺 IEND 要拒', () => {
  const cut = jpegBytes().subarray(0, 198) // 去掉尾标，长度仍是 3 的倍数 → base64 仍 %4==0
  const url = 'data:image/jpeg;base64,' + cut.toString('base64')
  // 198 字节 → base64 长度 %4==0，只卡尾标这一条
  assert.equal(cut.length % 3, 0, '构造出来的 base64 长度合法')
  const problem = avatarProblem(url)
  assert.ok(problem !== undefined && problem.includes('结束标记'), '缺尾标要拒：' + String(problem))

  const png = pngBytes()
  png[png.length - 1] = 0x00 // 破坏 IEND 的 CRC
  const pngProblem = avatarProblem(pngUrl(png))
  assert.ok(pngProblem !== undefined && pngProblem.includes('IEND'), 'PNG 缺 IEND 要拒：' + String(pngProblem))
})

test('头像校验：非法字符 / MIME 与内容不符 / 太短都要拒', () => {
  assert.ok(String(avatarProblem('data:image/jpeg;base64,AAA A')).includes('非法字符'), '空格要拒')
  assert.ok(String(avatarProblem(jpegUrl(pngBytes()))).includes('不是 JPEG'), '声明 JPEG 实际 PNG 要拒')
  assert.ok(String(avatarProblem(jpegUrl(Buffer.alloc(32, 0x20)))).includes('太短'), '太短要拒')
  assert.ok(String(avatarProblem('https://example.com/a.png')).includes('data:image'), '非 data URL 要拒')
})

test('设置头像：坏数据不落盘、好数据落盘、空串清空', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'drc-group-avatar-'))
  const groups = createGroups({ dir, deliver: async () => ({ ok: true }), log: () => {} })
  try {
    const created = groups.create({ name: '头像判据', me: 'session-a', members: ['session-b'] })
    const id = created.group!.id

    const bad = groups.setMemberAvatar({ id, sessionId: 'session-a', avatar: jpegUrl(jpegBytes()).slice(0, -1) })
    assert.equal(bad.ok, false, '坏数据必须拒')
    assert.equal(groups.get(id)!.members.find((m) => m.sessionId === 'session-a')!.avatar, undefined, '拒了就不能落盘')

    const good = groups.setMemberAvatar({ id, sessionId: 'session-a', avatar: jpegUrl(jpegBytes()) })
    assert.equal(good.ok, true)
    assert.ok(String(groups.get(id)!.members.find((m) => m.sessionId === 'session-a')!.avatar).startsWith('data:image/jpeg'))

    const cleared = groups.setMemberAvatar({ id, sessionId: 'session-a', avatar: '' })
    assert.equal(cleared.ok, true)
    assert.equal(groups.get(id)!.members.find((m) => m.sessionId === 'session-a')!.avatar, undefined, '空串 = 清空')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
