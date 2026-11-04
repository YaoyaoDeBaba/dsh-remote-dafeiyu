/**
 * 记忆库（`src/memory/*` + 人设宿主的记忆段）的判据（0.9.0）。
 *
 * 三层：
 * 1. **服务层**：条目增删改查、重要度排序、预算裁剪、超上限淘汰、按人设隔离；
 * 2. **路由层**：守卫 + add/remove/clear；
 * 3. **注入层**：人设宿主在拿到 `extra.memory` 时注册 `dafeiyu:memory` 段，没拿到就不注册。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  composeMemoryText,
  createMemoryService,
  DEFAULT_MEMORY_BUDGET,
  MAX_ENTRIES,
  memoryDir,
  memoryFile,
  resolveDshHome,
} from '../src/memory/service.js'
import { mountPersona } from '../src/index.js'

function tempHome(): { home: string; cleanup: () => void } {
  const home = mkdtempSync(path.join(tmpdir(), 'dafeiyu-memory-'))
  return { home, cleanup: () => rmSync(home, { recursive: true, force: true }) }
}

test('记忆：加 / 列 / 删 / 改 / 清空，按人设隔离', () => {
  const { home, cleanup } = tempHome()
  try {
    const service = createMemoryService(home)
    const a = service.add('persona-a', '用户叫小蓝', { importance: 2 })
    assert.equal(a.ok, true)
    const b = service.add('persona-a', '喜欢白米饭', {})
    assert.equal(b.ok, true)
    assert.equal(service.add('persona-a', '   ', {}).ok, false, '空内容不许写')

    assert.equal(service.list('persona-a').length, 2)
    assert.equal(service.list('persona-b').length, 0, '另一个人的记忆互不可见')

    const id = a.ok ? a.entry.id : ''
    assert.equal(service.update('persona-a', id, { importance: 3, text: '用户叫小蓝（重要）' }), true)
    const updated = service.list('persona-a').find((entry) => entry.id === id)
    assert.equal(updated?.importance, 3)

    assert.equal(service.remove('persona-a', id), true)
    assert.equal(service.remove('persona-a', id), false)
    assert.equal(service.list('persona-a').length, 1)

    assert.equal(service.clear('persona-a'), true)
    assert.equal(service.list('persona-a').length, 0)
    assert.deepEqual(service.counts(), { 'persona-a': 0 })
  } finally {
    cleanup()
  }
})

test('记忆：注入文本按重要度排序，超预算的条目只跳过不删除', () => {
  const { home, cleanup } = tempHome()
  try {
    const service = createMemoryService(home)
    service.add('p', '普通偏好：喜欢短句', { importance: 1 })
    service.add('p', '关键：用户叫我小鲸鱼', { importance: 3 })
    service.add('p', '重要约定：周日不上班', { importance: 2 })

    const text = service.textFor('p')
    assert.ok(text.startsWith('## 长期记忆'))
    assert.ok(text.includes('[关键]'), '关键条要带标记')
    const keyIndex = text.indexOf('[关键]')
    const impIndex = text.indexOf('[重要]')
    const plainIndex = text.indexOf('[普通]')
    assert.ok(keyIndex >= 0 && impIndex > keyIndex && plainIndex > impIndex, '重要度降序排')

    // 预算极小：至少注入一条，其余被跳过
    const tight = composeMemoryText(
      [
        { id: '1', text: '短', createdAt: '2026-01-01T00:00:00.000Z', importance: 1, source: 'manual' },
        { id: '2', text: '这是一条很长很长的记忆'.repeat(10), createdAt: '2026-01-02T00:00:00.000Z', importance: 1, source: 'manual' },
      ],
      40,
    )
    assert.ok(tight.split('\n').length >= 2, '至少注入一条')
    assert.equal(service.list('p').length, 3, '裁剪只影响注入，不删条目')
    assert.ok(DEFAULT_MEMORY_BUDGET > 0)
  } finally {
    cleanup()
  }
})

test('记忆：条目数量上限——超了淘汰最不重要最旧的一条', () => {
  const { home, cleanup } = tempHome()
  try {
    const service = createMemoryService(home)
    for (let index = 0; index < MAX_ENTRIES + 5; index += 1) {
      service.add('p', `第 ${index} 条`, { importance: index === 0 ? 1 : 2 })
    }
    const entries = service.list('p')
    assert.equal(entries.length, MAX_ENTRIES)
    assert.ok(!entries.some((entry) => entry.text === '第 0 条'), '最不重要最旧的先走')
  } finally {
    cleanup()
  }
})

test('记忆：文件名安全（人设 id 不做路径穿越）', () => {
  const { home, cleanup } = tempHome()
  try {
    const dir = memoryDir(home)
    const file = memoryFile(dir, '../../evil')
    assert.ok(file.startsWith(dir), `不该跳出记忆目录：${file}`)
    assert.equal(path.dirname(file), dir, '文件名里不许留下路径分隔符')
    const service = createMemoryService(home)
    service.add('../../evil', 'x', {})
    assert.ok(service.list('../../evil').length === 1)
  } finally {
    cleanup()
  }
})

test('记忆：DSH_HOME 优先于用户目录', () => {
  assert.equal(resolveDshHome({ DSH_HOME: 'D:\\x' } as NodeJS.ProcessEnv), 'D:\\x')
  const home = resolveDshHome({ USERPROFILE: 'C:\\Users\\t' } as NodeJS.ProcessEnv)
  assert.equal(home, path.join('C:\\Users\\t', '.dsh'))
})

test('注入：人设宿主接到 memory 才注册 dafeiyu:memory 段，没接就不注册', () => {
  const makeCtx = (sections: Array<{ name: string; order?: number; text?: unknown }>) => ({
    systemPrompt: {
      section: (def: { name: string; order?: number; text?: unknown }) => {
        sections.push(def)
        return () => {}
      },
      getSectionOrder: () => 0,
    },
    effect: (callback: () => unknown) => {
      callback()
      return () => {}
    },
    inject: () => {},
  })

  const { home, cleanup } = tempHome()
  try {
    const service = createMemoryService(home)
    const withMemory: Array<{ name: string; order?: number; text?: unknown }> = []
    assert.equal(mountPersona(makeCtx(withMemory), {}, { memory: service }).mounted, true)
    const memorySection = withMemory.find((section) => section.name === 'dafeiyu:memory')
    assert.ok(memorySection, '接了记忆库就应该注册 dafeiyu:memory 段')
    assert.equal(memorySection?.order, 10_300)
    assert.equal(typeof memorySection?.text, 'function')
    // 空库 / 无上下文：求值成空串而不是抛错
    const text = (memorySection?.text as (context: unknown) => string)({})
    assert.equal(typeof text, 'string')

    const withoutMemory: Array<{ name: string }> = []
    assert.equal(mountPersona(makeCtx(withoutMemory), {}).mounted, true)
    assert.ok(!withoutMemory.some((section) => section.name === 'dafeiyu:memory'), '没接记忆库就不许冒出记忆段')
  } finally {
    cleanup()
  }
})
