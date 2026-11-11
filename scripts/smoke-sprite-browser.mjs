/**
 * smoke-sprite-browser —— 只验「无头浏览器 + CDP 驱动」这一层，不碰工具页。
 *
 * 为什么单独留一个：工具页没准备好（补丁没打、静态路由没挂）时，报错信息会混在
 * bridge 那一层里，分不清到底是"驱动坏了"还是"页面坏了"。这个脚本用一个十行的
 * 最小页面，只回答一个问题：**能不能把浏览器拉起来、能不能在页面里求值**。
 *
 *   node scripts/smoke-sprite-browser.mjs
 *
 * 退出码 0 = 驱动这一层没问题。
 */
import http from 'node:http'
import { launchBrowser } from '../dist/src/sprite/browser.js'

const page = `<!doctype html><title>sprite-driver-smoke</title>
<body><div id="x">hello</div><script>window.answer = 6 * 7</script></body>`

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(page)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const startedAt = Date.now()
let session
try {
  session = await launchBrowser({
    toolUrl: `http://127.0.0.1:${port}/`,
    readyExpression: "document.readyState === 'complete'",
  })
  const answer = await session.evaluate('window.answer')
  const text = await session.evaluate("document.getElementById('x').textContent")
  const ok = answer === 42 && text === 'hello'
  console.log(`${ok ? 'PASS' : 'FAIL'} 浏览器驱动：evaluate 回了 ${String(answer)} / ${String(text)}，启动 ${Date.now() - startedAt}ms`)
  process.exitCode = ok ? 0 : 1
} catch (error) {
  console.error('FAIL 浏览器驱动起不来：' + String(error && error.message ? error.message : error))
  process.exitCode = 1
} finally {
  await session?.close()
  server.close()
}
