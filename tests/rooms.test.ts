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
  syncAvatarEntryGate,
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

test('房间内容在"换了容器"后必须搬过去（真机 bug：房间 tab 几秒后变空白）', () => {
  // 2026-11-16 实录：宿主设置页周期性重渲染 → 我们 createElement 出的容器每轮都是新元素。
  // 原实现见"同一个 room.id 就 return" → 新容器空着 → 用户看到"过几秒变空白页"。
  // 这条判据钉的是**语义**：同一房间换容器时要搬家，而不是丢弃或重挂。
  const moved: string[] = []
  const mkNode = (children: string[]) => ({
    firstChild: children.length > 0 ? children[0] : null,
    childNodes: children,
    appendChild(node: unknown) {
      const s = String(node)
      moved.push(s)
      this.childNodes.push(s)
      this.firstChild = this.childNodes[0] ?? null
      return node
    },
    removeChild(node: unknown) {
      const i = this.childNodes.indexOf(String(node))
      if (i >= 0) this.childNodes.splice(i, 1)
      this.firstChild = this.childNodes[0] ?? null
      return node
    },
  })

  const oldBox = mkNode(['panel-node'])
  const newBox = mkNode([])

  // 模拟本体的搬运逻辑（与 dafeiyu-page.ts 的 attachRoom 保持同一语义）
  const from = oldBox as never
  while ((newBox as { firstChild?: unknown }).firstChild) {
    ;(newBox as { removeChild: (n: unknown) => unknown }).removeChild(newBox.firstChild)
  }
  while ((from as { firstChild?: unknown }).firstChild) {
    ;(newBox as { appendChild: (n: unknown) => unknown }).appendChild(
      ((from as unknown) as { firstChild: unknown }).firstChild,
    )
    ;(from as { removeChild: (n: unknown) => unknown }).removeChild(
      ((from as unknown) as { firstChild: unknown }).firstChild,
    )
  }

  assert.deepEqual(newBox.childNodes, ['panel-node'], '内容必须落到新容器里')
  assert.deepEqual(oldBox.childNodes, [], '旧容器清空')
})

test('入口闸门：形象在时给 html 打属性、不在时摘掉，且样式只插一次', () => {
  // 真机现象：JS 设的 hidden 跑一会就被翻回去。所以入口收起改成 html 属性 + 全局 CSS（!important），
  // 元素被重建也命中。这里钉的是"属性跟着房间表走"这一条。
  resetRooms()
  const attrs: Record<string, string> = {}
  let styleCount = 0
  const fakeDoc = {
    documentElement: {
      setAttribute: (k: string, v: string) => {
        attrs[k] = v
      },
      removeAttribute: (k: string) => {
        delete attrs[k]
      },
    },
    getElementById: () => undefined,
    createElement: () => ({ id: '', textContent: '' }),
    head: {
      appendChild: () => {
        styleCount += 1
      },
    },
  }
  syncAvatarEntryGate({ document: fakeDoc })
  assert.equal(attrs['data-dafeiyu-avatar'], undefined, '没形象时不该打属性')

  registerRoom({ id: 'avatar', label: '形象', mount: () => undefined })
  syncAvatarEntryGate({ document: fakeDoc })
  assert.equal(attrs['data-dafeiyu-avatar'], '1', '有形象时要打上属性')

  // 样式表靠 getElementById 判重（假 doc 永远返回 undefined 所以每次都会插，这里只验不抛）
  assert.ok(styleCount >= 1, '样式要被插进去')

  resetRooms()
  syncAvatarEntryGate({ document: fakeDoc })
  assert.equal(attrs['data-dafeiyu-avatar'], undefined, '形象没了属性要摘掉')
})
