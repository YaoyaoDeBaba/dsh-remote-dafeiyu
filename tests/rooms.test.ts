/**
 * rooms.test —— 房间注册表（跨包扩展点的契约）
 *
 * 这是"配置页只有本体三块、其余能力各领一间房"的第一版实现。
 * 钉住四件事：注册/排序/覆盖语义、订阅通知、卸载幂等、宿主安装幂等 + 就绪事件。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  installRoomHost,
  listRooms,
  onRoomsChange,
  registerRoom,
  resetRooms,
  type DafeiyuRoom,
} from '../src/client/rooms.js'

function room(over: Partial<DafeiyuRoom> = {}): DafeiyuRoom {
  return { id: 'avatar', label: '形象', mount: () => undefined, ...over }
}

test('注册后能在列表里看到；mount/label/order 原样保留', () => {
  resetRooms()
  registerRoom(room({ id: 'avatar', label: '形象', order: 10 }))
  const list = listRooms()
  assert.equal(list.length, 1)
  assert.equal(list[0]?.id, 'avatar')
  assert.equal(list[0]?.label, '形象')
  assert.equal(list[0]?.order, 10)
})

test('按 order 升序；没有 order 的排在最后（按注册顺序）', () => {
  resetRooms()
  registerRoom(room({ id: 'b-no-order', label: 'B' }))
  registerRoom(room({ id: 'c-order-5', label: 'C', order: 5 }))
  registerRoom(room({ id: 'a-order-1', label: 'A', order: 1 }))
  assert.deepEqual(
    listRooms().map((r) => r.id),
    ['a-order-1', 'c-order-5', 'b-no-order'],
  )
})

test('同 order 按注册顺序（先注册的在前）', () => {
  resetRooms()
  registerRoom(room({ id: 'first', label: '1', order: 10 }))
  registerRoom(room({ id: 'second', label: '2', order: 10 }))
  assert.deepEqual(listRooms().map((r) => r.id), ['first', 'second'])
})

test('重复 id 覆盖并通知（不静默）', () => {
  resetRooms()
  let notified = 0
  onRoomsChange(() => notified++)
  registerRoom(room({ id: 'avatar', label: '旧' }))
  registerRoom(room({ id: 'avatar', label: '新' }))
  assert.equal(listRooms().length, 1)
  assert.equal(listRooms()[0]?.label, '新')
  assert.equal(notified, 2)
})

test('dispose 只移除自己那一间；被覆盖后旧 dispose 不许带走新的', () => {
  resetRooms()
  const oldDispose = registerRoom(room({ id: 'avatar', label: '旧' }))
  registerRoom(room({ id: 'avatar', label: '新' }))
  oldDispose()
  assert.equal(listRooms().length, 1, '旧注册的 dispose 不该删掉新住客')
  assert.equal(listRooms()[0]?.label, '新')
})

test('dispose 幂等', () => {
  resetRooms()
  const dispose = registerRoom(room())
  dispose()
  dispose()
  assert.equal(listRooms().length, 0)
})

test('非法注册直接抛（住客的错要在它自己开发期暴露）', () => {
  resetRooms()
  assert.throws(() => registerRoom(room({ id: 'Bad Id' })), /id 不合法/)
  assert.throws(() => registerRoom(room({ id: 'a' })), /id 不合法/, '太短也不行')
  assert.throws(() => registerRoom(room({ label: ' ' })), /缺 label/)
  assert.throws(() => registerRoom(room({ mount: undefined as never })), /缺 mount/)
})

test('订阅能退订；一个订阅者抛错不影响别人', () => {
  resetRooms()
  let a = 0
  let b = 0
  const offA = onRoomsChange(() => {
    a++
    throw new Error('订阅者自己的错误')
  })
  onRoomsChange(() => b++)
  registerRoom(room())
  assert.equal(a, 1)
  assert.equal(b, 1, '前一个订阅者抛错不许拖住后面的')
  offA()
  registerRoom(room({ id: 'other', label: '其它' }))
  assert.equal(a, 1, '退订后不再收到')
  assert.equal(b, 2)
})

test('installRoomHost 幂等；没有 window 时返回 false 且不抛', () => {
  resetRooms()
  assert.equal(installRoomHost({ window: undefined }), false)
  const fired: string[] = []
  const fake: Record<string, unknown> = {
    dispatchEvent: (event: { type?: string }) => {
      fired.push(String(event.type))
      return true
    },
    CustomEvent: class {
      type: string
      constructor(type: string) {
        this.type = type
      }
    },
  }
  assert.equal(installRoomHost({ window: fake }), true)
  assert.equal(fired[0], 'dafeiyu:rooms-ready', '装好要派发就绪事件（住客可能先起来）')
  const host = fake.__dafeiyuRooms as { version: number; register: (r: DafeiyuRoom) => void }
  assert.equal(host.version, 1)
  // 第二次调用不再覆盖、也不再派发
  assert.equal(installRoomHost({ window: fake }), true)
  assert.equal(fired.length, 1)
  // 通过 host 注册能落到同一张表里
  host.register(room({ id: 'via-host', label: '住客' }))
  assert.equal(listRooms().length, 1)
})
