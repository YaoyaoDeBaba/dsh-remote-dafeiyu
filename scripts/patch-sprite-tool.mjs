#!/usr/bin/env node
/**
 * patch-sprite-tool.mjs —— 给「序列帧精灵图工具.html」打补丁：
 * 把 assets/sprite/bridge.js 插进页面 <script type="module"> 块的末尾
 * （闭合标签之前，即 `$('statusText').textContent = '就绪 …'` 之后），
 * 生成 assets/sprite/sprite-tool.html 给 sprite/service 托管。
 *
 * 用法：
 *   node scripts/patch-sprite-tool.mjs <原始HTML> [输出路径]
 *   默认输出 <仓库根>/assets/sprite/sprite-tool.html
 *
 * 行为约定：
 *   · 幂等：输出里出现桥接起始标记就不再插第二遍（只做一次原样输出/复制）；
 *   · 找不到插入点、或模块里缺少桥接依赖的符号 → 打印原因并 exit 1，不写半成品；
 *   · 零外部依赖，只用 node: 内置模块。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BRIDGE_PATH = join(ROOT, 'assets', 'sprite', 'bridge.js')
const DEFAULT_OUT = join(ROOT, 'assets', 'sprite', 'sprite-tool.html')

const START_MARK = '/* ==== SPRITE-AGENT-BRIDGE v1 ==== */'
const END_MARK = '/* ==== /SPRITE-AGENT-BRIDGE ==== */'
/** 关闭标签拼出来，避免本文件自身被误当成 HTML 片段处理 */
const CLOSE_SCRIPT = '</' + 'script>'

/** 桥接必须能看见的内部符号：缺一个就说明源文件版本对不上 */
const REQUIRED = [
  { label: '全局状态 state',            probe: 'const state = {' },
  { label: '拼图 buildSheet()',         probe: 'function buildSheet(' },
  { label: '抠图请求 requestKey()',     probe: 'async function requestKey(' },
  { label: '抠图预览 renderKeyResult()', probe: 'async function renderKeyResult(' },
  { label: '初始化结束 statusText',      probe: "$('statusText').textContent" },
]

const fail = (message, detail) => {
  console.error('[patch] 失败：' + message)
  if (detail) console.error('        ' + detail)
  process.exit(1)
}

const countOf = (haystack, needle) => haystack.split(needle).length - 1
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length

/* ---------------- 参数 ---------------- */
const argv = process.argv.slice(2)
if (argv.length < 1 || argv.length > 2 || argv[0] === '-h' || argv[0] === '--help') {
  console.error('用法: node scripts/patch-sprite-tool.mjs <原始HTML> [输出路径]')
  process.exit(argv.length === 0 ? 1 : 0)
}
const srcPath = resolve(argv[0])
const outPath = argv[1] ? resolve(argv[1]) : DEFAULT_OUT

if (!existsSync(srcPath)) fail(`原始 HTML 不存在：${srcPath}`)
if (!existsSync(BRIDGE_PATH)) fail(`桥接文件不存在：${BRIDGE_PATH}`)

const srcStat = statSync(srcPath)
if (!srcStat.isFile()) fail(`不是文件：${srcPath}`)

/* ---------------- 读输入 ---------------- */
const html = readFileSync(srcPath, 'utf8')
const bridgeRaw = readFileSync(BRIDGE_PATH, 'utf8').trim()
if (html.trim() === '') fail(`原始 HTML 是空的：${srcPath}`)
if (bridgeRaw === '') fail(`桥接文件是空的：${BRIDGE_PATH}`)
if (!bridgeRaw.includes(START_MARK) || !bridgeRaw.includes(END_MARK)) {
  fail('bridge.js 里找不到起止标记，patch 脚本无法自检', `需要 ${START_MARK} 与 ${END_MARK}`)
}
if (bridgeRaw.includes(CLOSE_SCRIPT)) {
  fail('bridge.js 里出现脚本闭合标签字面量，会截断页面', '把它改成字符串拼接再保存')
}

const srcLines = html.split('\n').length

/* ---------------- 幂等：已经打过补丁就只输出 ---------------- */
if (countOf(html, START_MARK) > 0) {
  const times = countOf(html, START_MARK)
  console.log('[patch] 输入已经打过补丁（标记出现 ' + times + ' 次），不再插入')
  if (resolve(srcPath) === resolve(outPath)) {
    console.log('[patch] 输入即输出，无需改动：' + outPath)
    process.exit(0)
  }
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, html, 'utf8')
  const outStat = statSync(outPath)
  console.log('[patch] 已原样输出：' + outPath)
  console.log('[patch] 体积 ' + outStat.size + ' B（' + (outStat.size / 1024).toFixed(1) + ' KB）·标记 ' + times + ' 次')
  process.exit(0)
}

/* ---------------- 定位插入点：module script 的闭合标签之前 ---------------- */
const openRe = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i
const openMatch = openRe.exec(html)
if (!openMatch) fail('找不到 <script type="module"> 块', '这是桥接唯一能看见内部符号的位置')
const bodyStart = openMatch.index + openMatch[0].length

const closeIdx = html.indexOf(CLOSE_SCRIPT, bodyStart)
if (closeIdx < 0) fail('找不到 module script 的闭合标签', '文件可能被截断')
const body = html.slice(bodyStart, closeIdx)

const missing = REQUIRED.filter((item) => !body.includes(item.probe))
if (missing.length) {
  fail(
    'module 块里缺少桥接依赖的符号，源文件版本可能变了',
    missing.map((m) => m.label + '（查找 ' + m.probe + '）').join('； '),
  )
}
/* 防止把桥接插到另一个（非主逻辑的）module 块里：主块必须含 state 与 buildSheet，已由上面校验 */

const insertLine = lineOf(html, closeIdx)
const indent = ''

/* 保证闭合标签独占一行，插入的代码前后都留空行 */
let injected = '\n' + indent + bridgeRaw + '\n'
if (!html.slice(0, closeIdx).endsWith('\n')) injected = '\n' + injected
const patched = html.slice(0, closeIdx) + injected + html.slice(closeIdx)

/* ---------------- 写输出 ---------------- */
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, patched, 'utf8')

/* ---------------- 自检 ---------------- */
const written = readFileSync(outPath, 'utf8')
const marks = countOf(written, START_MARK)
const endMarks = countOf(written, END_MARK)
if (marks !== 1) fail('自检失败：输出里桥接起始标记出现 ' + marks + ' 次（应为 1）')
if (endMarks !== 1) fail('自检失败：输出里桥接结束标记出现 ' + endMarks + ' 次（应为 1）')
if (written.length !== html.length + injected.length) {
  fail('自检失败：输出长度与预期不符', `期望 ${html.length + injected.length}，实际 ${written.length}`)
}
if (countOf(written, '<script') !== countOf(html, '<script')) {
  fail('自检失败：script 标签数量变了（插入内容破坏了文档结构）')
}
if (countOf(written, CLOSE_SCRIPT) !== countOf(html, CLOSE_SCRIPT)) {
  fail('自检失败：脚本闭合标签数量变了')
}

const outStat = statSync(outPath)
const outLines = written.split('\n').length

/* ---------------- 报告 ---------------- */
console.log('[patch] 原始：' + srcPath)
console.log('[patch]       ' + srcStat.size + ' B（' + (srcStat.size / 1024).toFixed(1) + ' KB）· ' + srcLines + ' 行')
console.log('[patch] 桥接：' + BRIDGE_PATH)
console.log('[patch]       ' + Buffer.byteLength(bridgeRaw, 'utf8') + ' B · ' + bridgeRaw.split('\n').length + ' 行 · 标记 v1')
console.log('[patch] 插入：module script 内部、' + CLOSE_SCRIPT + ' 之前（第 ' + insertLine + ' 行，' +
  "$('statusText').textContent … 之后）")
console.log('[patch] 输出：' + outPath)
console.log('[patch]       ' + outStat.size + ' B（' + (outStat.size / 1024).toFixed(1) + ' KB）· ' + outLines + ' 行')
console.log('[patch] 自检：起始标记 ' + marks + ' 次 · 结束标记 ' + endMarks + ' 次 · script 标签数未变')
