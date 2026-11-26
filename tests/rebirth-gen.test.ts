import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseGenSuffix } from '../src/handoff/service.js'

/*
 * 转世/分身序号（2026-11-26 用户口径）：**从前世名字解析**，不再依赖计数器文件。
 * 规则：抓到「转世N / 分身N」就 +1；抓不到就补 1；两条序列互不相干。
 */
const nextTitle = (title: string, kind: '转世' | '分身'): string => {
  const parsed = parseGenSuffix(title)
  const gen = parsed.kind === kind ? parsed.gen + 1 : 1
  return parsed.base + kind + String(gen)
}

test('转世序号：从名字里的 转世N 自增', () => {
  assert.equal(nextTitle('2-3总工-转世1', '转世'), '2-3总工-转世2')
  assert.equal(nextTitle('2-3总工-转世3', '转世'), '2-3总工-转世4')
  assert.equal(nextTitle('2-3总工-转世9', '转世'), '2-3总工-转世10')
})

test('名字里没有关键词时，下一世补「转世1」', () => {
  assert.equal(nextTitle('2-3总工', '转世'), '2-3总工转世1')
  assert.equal(nextTitle('插件大总管', '转世'), '插件大总管转世1')
})

test('两条序列互不相干：分身2 去转生 → 转世1；转世2 去分身 → 分身1', () => {
  assert.equal(nextTitle('2-3总工-分身2', '转世'), '2-3总工-转世1')
  assert.equal(nextTitle('2-3总工-转世2', '分身'), '2-3总工-分身1')
})

test('只认紧贴末尾且带数字的代号：名字中间的「转世」不算', () => {
  assert.deepEqual(parseGenSuffix('转世部-总工'), { base: '转世部-总工', gen: 0 })
  assert.deepEqual(parseGenSuffix('转世1测试'), { base: '转世1测试', gen: 0 })
  assert.deepEqual(parseGenSuffix('2-3总工-转世0'), { base: '2-3总工-', kind: '转世', gen: 0 })
})
