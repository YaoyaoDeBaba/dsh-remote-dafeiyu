/**
 * websearch 的 engine='doubao' 判据（2026-11-23）：拿网页版豆包当搜索引擎。
 *
 * 这里只测**工具层**（形状、格式化、失败文案、缓存、不进 auto），
 * 真浏览器那一路在 websearch-webai.test.ts 里用假驱动测。**一条都不许起浏览器**。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  SEARCH_ENGINES,
  buildWebsearchTools,
  formatWebAi,
  type WebAiSearchResult,
} from '../src/websearch/tools.js'

type Tool = { name: string; execute: (args: unknown) => Promise<string> }

function toolNamed(deps: Parameters<typeof buildWebsearchTools>[0], name: string): Tool {
  const found = buildWebsearchTools(deps).find((one) => (one as { name?: string }).name === name)
  assert.ok(found, '没有 ' + name + ' 这个工具')
  return found as unknown as Tool
}

const noLog = (): void => {}

function fakeResult(overrides: Partial<WebAiSearchResult> = {}): WebAiSearchResult {
  return {
    answer: '豆包说：便宜的在 2026 年是一个月 9 块那档。',
    citations: [
      { title: '价格页', url: 'https://example.com/price' },
      { title: '价格页', url: 'https://example.com/price' },
      { title: '对比', url: 'https://example.com/vs' },
    ],
    site: '网页豆包',
    elapsedMs: 12_300,
    truncated: false,
    partial: false,
    ...overrides,
  }
}

test('engine 档位里有 doubao，且 auto 不包含它（auto 仍然是 Bing → Sogou）', () => {
  assert.ok(SEARCH_ENGINES.includes('doubao'), 'doubao 没进档位表：模型根本选不到它')
  assert.deepEqual(SEARCH_ENGINES, ['auto', 'bing', 'sogou', 'doubao'], 'auto 顺序被改了：豆包依赖登录态，不许塞进 auto')
})

test('formatWebAi：正文 + 去重后的来源，来源条数受限，不给链接时明说别当有出处引用', () => {
  const text = formatWebAi('谁最便宜', fakeResult(), 8)
  assert.match(text, /网页豆包/, '没写是谁答的')
  assert.match(text, /豆包说：便宜的在 2026 年/, '正文丢了')
  const citations = text.split('\n').filter((line) => /^\d+\. /.test(line))
  assert.equal(citations.length, 2, '来源没去重：同一 url 出现了两次')
  const limited = formatWebAi('谁最便宜', fakeResult(), 1)
  assert.equal(limited.split('\n').filter((line) => /^\d+\. /.test(line)).length, 1, 'count 没限制来源条数')
  const none = formatWebAi('谁最便宜', fakeResult({ citations: [] }), 8)
  assert.match(none, /没给链接/, '没来源时必须明说，否则模型会把回答当有出处的事实')
})

test('formatWebAi：没答完 / 被截断要分别标出来，别合成一句', () => {
  const partial = formatWebAi('q', fakeResult({ partial: true }), 8)
  assert.match(partial, /没等到/, '超时没标')
  const truncated = formatWebAi('q', fakeResult({ truncated: true }), 8)
  assert.match(truncated, /截断/, '截断没标')
  const both = formatWebAi('q', fakeResult({ partial: true, truncated: true }), 8)
  assert.match(both, /没等到/)
  assert.match(both, /截断/)
})

test('engine=doubao 走注入的引擎，并且结果进缓存（同一 query 不重复起浏览器）', async () => {
  const calls: string[] = []
  const tool = toolNamed(
    {
      guideBody: () => '',
      log: noLog,
      webAi: {
        search: (query: string) => {
          calls.push(query)
          return Promise.resolve(fakeResult())
        },
      },
    },
    'web_search',
  )
  const first = await tool.execute({ query: '谁最便宜', engine: 'doubao' })
  assert.match(first, /豆包说/)
  const second = await tool.execute({ query: '谁最便宜', engine: 'doubao' })
  assert.match(second, /豆包说/)
  assert.deepEqual(calls, ['谁最便宜'], '缓存没生效：同一个 query 起了两次浏览器')
})

test('engine=doubao 但引擎没挂上：抛中文原因，不静默换引擎冒充搜索结果', async () => {
  const tool = toolNamed({ guideBody: () => '', log: noLog }, 'web_search')
  await assert.rejects(
    () => tool.execute({ query: '谁最便宜', engine: 'doubao' }),
    (error: Error) => {
      assert.match(error.message, /豆包/, '错误里没点名豆包')
      assert.match(error.message, /登录|engine=auto/, '错误里没给下一步怎么做')
      return true
    },
  )
})
