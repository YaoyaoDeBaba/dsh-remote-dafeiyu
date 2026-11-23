/**
 * tests/websearch-webai —— 「白嫖网页版豆包当搜索引擎」的判据。
 *
 * **纯单测：不起真浏览器、不碰网、不碰磁盘**（CI/无网也要绿）。
 * 钉住的是四件最容易退化的东西：
 *
 * 1. 选择器候选表能落顺位（第一顺位失效不许直接空手而归）；
 * 2. 完成判据（连续 N 次不变 + 没有忙标记 + 不超时才收工）；
 * 3. 未登录/找不到浏览器时给的是**中文、能照做**的原因；
 * 4. 引用抽取：去重、剔站内链接、抽不到就空数组（绝不编链接）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DOUBAO_WEB_AI,
  anchorGroupsExpression,
  answerBudgetMs,
  chooseAnswer,
  clipText,
  collectCitations,
  initialCompletion,
  notLoggedInHint,
  stepCompletion,
  type AnswerProbe,
} from '../src/websearch/webai/site.js'
import { browserMissingReason, resolveBrowser } from '../src/websearch/webai/driver.js'
import { buildSearchResult } from '../src/websearch/webai/service.js'

/* ────────────────────────── 1. 选择器候选表 ────────────────────────── */

test('回答候选：第一顺位有文本就直接用它', () => {
  const probes: AnswerProbe[] = [
    { selector: '[data-testid="message_text_content"]', texts: ['第一顺位的回答'], htmls: ['<p>第一顺位的回答</p>'] },
    { selector: '.flow-markdown-body', texts: ['第二顺位的回答'], htmls: ['<p>第二顺位的回答</p>'] },
  ]
  const pick = chooseAnswer(probes)
  assert.equal(pick.text, '第一顺位的回答')
  assert.equal(pick.selector, '[data-testid="message_text_content"]')
  assert.equal(pick.html, '<p>第一顺位的回答</p>')
})

test('回答候选：第一顺位全空/只有自己的提问时落到第二顺位', () => {
  const probes: AnswerProbe[] = [
    // 第一顺位：节点存在但文本是空白（前端改版后常见：节点还在，内容在别处）
    { selector: '[data-testid="message_text_content"]', texts: ['', '   '], htmls: ['', '  '] },
    // 第二顺位：只抽到我们自己那条提问，必须被 exclude 排掉并继续往下走
    { selector: '[data-testid="receive_message"] [data-testid*="text"]', texts: ['我们自己的提问'], htmls: ['<p>我们自己的提问</p>'] },
    // 第三顺位：真正的回答
    { selector: '.flow-markdown-body', texts: ['豆包的回答正文'], htmls: ['<p>豆包的回答正文</p>'] },
  ]
  const pick = chooseAnswer(probes, '我们自己的提问')
  assert.equal(pick.text, '豆包的回答正文')
  assert.equal(pick.selector, '.flow-markdown-body')
})

test('回答候选：全都不可用时返回空（不抛错）', () => {
  const pick = chooseAnswer([{ selector: 'a', texts: [''], htmls: [''] }], '提问')
  assert.deepEqual({ text: pick.text, selector: pick.selector, index: pick.index }, { text: '', selector: '', index: -1 })
})

test('站点表：豆包的候选表至少两顺位，且选择器都写在同一张表里', () => {
  assert.ok(DOUBAO_WEB_AI.answerSelectors.length >= 2, '回答候选至少要有两顺位，否则前端一改版就空手')
  assert.ok(DOUBAO_WEB_AI.busySelectors.length >= 1, '必须有「生成中」的忙标记，否则完成判据只剩超时')
  assert.ok(DOUBAO_WEB_AI.citationSelectors.length >= 1, '引用候选表不能空')
  assert.ok(DOUBAO_WEB_AI.authCookies.names.length >= 1, '登录判据至少认一个 cookie')
  assert.match(DOUBAO_WEB_AI.editorSelector, /ProseMirror/, '豆包输入框是 tiptap / ProseMirror')
  // 页面表达式里看得见候选表（证明"改版只改一处"不是空话）。
  // 注意转义：表达式是把选择器数组 JSON.stringify 进去的，双引号会变成 \"。
  const expression = anchorGroupsExpression(DOUBAO_WEB_AI)
  const firstCitation = DOUBAO_WEB_AI.citationSelectors[0] as string
  assert.ok(expression.includes(JSON.stringify(firstCitation).slice(1, -1)))
})

/* ────────────────────────── 2. 完成判据 ────────────────────────── */

const RULES = { minStableMs: 1_000, minStableSamples: 3 }

test('完成判据：连续 N 次采样不变 + 稳定够久才算答完', () => {
  let state = initialCompletion(0)
  let step = stepCompletion(state, { text: '第一段', busy: false }, 0, RULES)
  state = step.state
  assert.equal(step.done, false, '只采样到一次不许算答完')

  step = stepCompletion(state, { text: '第一段', busy: false }, 600, RULES)
  state = step.state
  assert.equal(step.done, false, '两次也不够')

  step = stepCompletion(state, { text: '第一段', busy: false }, 1_200, RULES)
  assert.equal(step.done, true, '三次不变 + 稳定 1200ms 应判完成')
  assert.equal(step.state.stableSamples, 3)
})

test('完成判据：文本还在变（说明还在吐字）时不许判完成', () => {
  let state = initialCompletion(0)
  let step = stepCompletion(state, { text: '第一段', busy: false }, 0, RULES)
  state = step.state
  step = stepCompletion(state, { text: '第一段第二句', busy: false }, 1_500, RULES)
  assert.equal(step.done, false, '文本变了 = 又开始了新的一轮稳定计时')
  assert.equal(step.state.stableSamples, 1)
})

test('完成判据：有「停止生成」这类忙标记时，文本再稳定也不算完成', () => {
  let state = initialCompletion(0)
  let step = stepCompletion(state, { text: '一段话', busy: true }, 0, RULES)
  state = step.state
  assert.equal(step.done, false)
  step = stepCompletion(state, { text: '一段话', busy: true }, 600, RULES)
  state = step.state
  assert.equal(step.done, false)
  step = stepCompletion(state, { text: '一段话', busy: true }, 1_200, RULES)
  state = step.state
  assert.equal(step.done, false, '忙标记在就不算答完——豆包两段之间会停顿，不能只看文本')

  step = stepCompletion(state, { text: '一段话', busy: false }, 3_000, RULES)
  assert.equal(step.done, true, '忙标记消失后才允许完成')
})

test('完成判据：空文本永远不算完成', () => {
  const step = stepCompletion(initialCompletion(0), { text: '   ', busy: false }, 9_999, RULES)
  assert.equal(step.done, false)
  assert.equal(step.state.stableSamples, 0)
})

test('超时预算：配得太小也要给到 20 秒，默认 90 秒由 service 决定', () => {
  assert.equal(answerBudgetMs(1_000), 20_000)
  assert.equal(answerBudgetMs(undefined), 20_000)
  assert.equal(answerBudgetMs(45_000), 45_000)
})

/* ────────────────────────── 3. 未登录 / 找不到浏览器的文案 ────────────────────────── */

test('未登录文案：中文、点名豆包、告诉用户去哪儿登（可照做）', () => {
  const hint = notLoggedInHint()
  assert.match(hint, /[\u4e00-\u9fff]/, '必须是中文')
  assert.ok(hint.includes('登录'), '必须说「登录」')
  assert.ok(hint.includes('豆包'), '必须点名豆包')
  assert.ok(hint.includes('vision_web_login(doubao)'), '要说清楚点哪个入口（复用识图插件那份 profile）')
  assert.ok(!/\bError\b|stack/i.test(hint), '不许把英文栈塞给用户')
})

test('浏览器探测：找不到 Edge/Chrome 时给中文原因（注入 exists，不碰磁盘）', () => {
  const missing = resolveBrowser({ exists: () => false, env: {} })
  assert.equal(missing.ok, false)
  if (missing.ok) return
  assert.match(missing.reason, /[\u4e00-\u9fff]/, '必须是中文')
  assert.match(missing.reason, /Edge/)
  assert.match(missing.reason, /Chrome/)
  assert.match(missing.reason, /DAFEIYU_WEBAI_BROWSER/, '要给出可照做的下一步')

  assert.ok(browserMissingReason().includes('Edge'))
})

test('浏览器探测：注入的候选表里能挑出真实存在的那个', () => {
  const found = resolveBrowser({ exists: (file) => file === 'C:/fake/chrome.exe', env: {}, candidates: ['C:/nope.exe', 'C:/fake/chrome.exe'] })
  assert.deepEqual(found, { ok: true, exe: 'C:/fake/chrome.exe' })
})

test('浏览器探测：环境变量指到不存在的文件时直接报它，不静默滑到下一档', () => {
  const result = resolveBrowser({
    exists: () => false,
    env: { DAFEIYU_WEBAI_BROWSER: 'D:/gone/msedge.exe' },
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.ok(result.reason.includes('DAFEIYU_WEBAI_BROWSER'))
  assert.ok(result.reason.includes('D:/gone/msedge.exe'))
})

/* ────────────────────────── 4. 截断 / partial 标记 ────────────────────────── */

test('截断：maxChars 裁过要标 truncated，partial 不跟着乱标', () => {
  const clipped = clipText('abcdef', 3)
  assert.deepEqual(clipped, { text: 'abc', truncated: true })
  assert.deepEqual(clipText('abc', 3), { text: 'abc', truncated: false })
  assert.deepEqual(clipText('abc'), { text: 'abc', truncated: false })

  const result = buildSearchResult({ answer: 'abcdef', deadlineHit: false, elapsedMs: 10, maxChars: 3 })
  assert.equal(result.answer, 'abc')
  assert.equal(result.truncated, true)
  assert.equal(result.partial, false, '截断不是超时')
  assert.deepEqual(result.citations, [])
  assert.equal(result.site, '豆包')
})

test('超时：deadlineHit ⇒ partial 为真（正文是已经拿到的部分），truncated 不跟着乱标', () => {
  const result = buildSearchResult({ answer: '只拿到一半', deadlineHit: true, elapsedMs: 90_000 })
  assert.equal(result.partial, true)
  assert.equal(result.truncated, false)
  assert.equal(result.answer, '只拿到一半', '超时也要把已拿到的部分带回去')
})

/* ────────────────────────── 5. 引用抽取 ────────────────────────── */

test('引用抽取：抽出 title + url、去重、剔掉豆包站内链接', () => {
  const html = [
    '<a href="https://www.doubao.com/chat/123456">豆包自己的会话</a>',
    '<a href="https://example.com/a"><span>示例</span> A</a>',
    '<a href="https://example.com/a/">示例 A 的重复链接</a>',
    '<a href="https://other.org/b?x=1&amp;y=2">B &amp; C</a>',
    '<a href="javascript:void(0)">点我</a>',
    '<a href="#anchor">页内锚点</a>',
    '<a>没有 href 的假链接</a>',
  ].join('\n')
  const citations = collectCitations({ answerHtml: html })
  assert.equal(citations.length, 2, '重复的只留一条，站内/无效链接全剔掉')
  assert.deepEqual(citations[0], { title: '示例 A', url: 'https://example.com/a' })
  assert.deepEqual(citations[1], { title: 'B & C', url: 'https://other.org/b?x=1&y=2' })
  assert.ok(
    citations.every((row) => !row.url.includes('doubao.com')),
    '豆包自己的会话链接不是「来源」',
  )
})

test('引用抽取：站点给的选择器优先级更高（组内先出现），但同样去重', () => {
  const citations = collectCitations({
    groups: [
      { selector: '[data-testid="search_result"]', anchors: [{ title: '组内来源', url: 'https://group.example/x' }] },
      { selector: '[data-testid="reference_list"]', anchors: [{ title: '组内来源重复', url: 'https://group.example/x' }] },
    ],
    answerHtml: '<a href="https://group.example/x">又一条重复</a><a href="https://html.example/y">HTML 里的来源</a>',
  })
  assert.deepEqual(
    citations.map((row) => row.url),
    ['https://group.example/x', 'https://html.example/y'],
  )
  assert.equal(citations[0]?.title, '组内来源', '先到先得，标题别被后来的覆盖')
})

test('引用抽取：抽不到就返回空数组（不抛错、不编链接）', () => {
  assert.deepEqual(collectCitations({ answerHtml: '<p>这段回答没有任何链接</p>' }), [])
  assert.deepEqual(collectCitations({}), [])
  assert.deepEqual(collectCitations({ groups: [], answerHtml: '' }), [])
  // 只有站内链接 = 没有来源
  assert.deepEqual(collectCitations({ answerHtml: '<a href="https://www.doubao.com/chat/1">豆包</a>' }), [])
})
