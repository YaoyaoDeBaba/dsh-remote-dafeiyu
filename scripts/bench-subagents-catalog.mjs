/**
 * bench-subagents-catalog —— 「同样的 N 次面板刷新，宿主侧要付出多少」的离线 A/B 基准。
 *
 * 为什么要有它：真实宿主一次只跑一个版本，A/B 得重启机器；而这个脚本直接拿**编译产物**
 * （`dist/src/platform/carrier-services.js`）跑同一套假服务，两边代码都是真的，只是宿主是假的。
 *
 * 假服务的关键设计：`subagents.listChildren()` 返回一个**永不 settle 的 promise**——
 * 这复现了实测现象（父会话没有活子代理时它不返回，一路耗到 4000ms 超时）。
 * 超时用的是全局 setTimeout，所以这里的 4 秒是**真的 4 秒**，不是模拟。
 *
 * 用法：
 *   node scripts/bench-subagents-catalog.mjs <dist/src/platform/carrier-services.js> [次数]
 *
 * 读数：
 *   - listChildren 调用次数：宿主每多问一次 catalog，就是多一次 4 秒的超时机会；
 *   - 总墙钟时间：这段时间宿主的事件循环里压着一个没完成的刷新；
 *   - 单次均值：面板每次刷新实际要等多久。
 *
 * 注意：脚本只读、只计算，不启动宿主、不写任何文件、不碰真实会话。
 */
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const target = process.argv[2]
const rounds = Number(process.argv[3] ?? 10)
if (!target) {
  console.error('用法：node scripts/bench-subagents-catalog.mjs <dist/src/platform/carrier-services.js> [次数]')
  process.exit(1)
}

const mod = await import(pathToFileURL(path.resolve(target)).href)
const createServicesKernel = mod.createServicesKernel
if (typeof createServicesKernel !== 'function') {
  console.error(`FAIL：${target} 里没有 createServicesKernel`)
  process.exit(1)
}

let catalogCalls = 0
const neverSettles = () => new Promise(() => {})

const bundle = {
  agents: { get: () => ({ status: 'idle' }) },
  sessions: { list: () => [{ id: 'child-x', createdAt: 1 }] },
  subagents: {
    listChildren: () => {
      catalogCalls += 1
      return neverSettles()
    },
    listDescendants: () => {
      catalogCalls += 1
      return neverSettles()
    },
  },
  // catalog 不可信时的回退路径：给空表，让它立刻返回，这样测出来的时间就是 catalog 超时的时间。
  sessionQuery: { listSessions: () => Promise.resolve([]) },
}

const startedAt = Date.now()
const clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
}
const port = createServicesKernel(bundle, { clock, log: () => {} })

const t0 = performance.now()
for (let i = 0; i < rounds; i += 1) {
  await port.listSubagents('session-p', { includeArchived: true })
}
const elapsed = performance.now() - t0

const perCall = elapsed / rounds
console.log('== bench-subagents-catalog ==')
console.log(`  构建产物：${target}`)
console.log(`  刷新次数：${rounds}（模拟面板打开态连续刷新）`)
console.log(`  listChildren 调用：${catalogCalls} 次`)
console.log(`  总墙钟：${(elapsed / 1000).toFixed(2)} s`)
console.log(`  单次均值：${perCall.toFixed(0)} ms`)
console.log(`  折算：面板开 60 秒（约 150 次刷新）宿主侧约 ${((perCall * 150) / 1000).toFixed(0)} s`)
console.log(`  实测经过：${((Date.now() - startedAt) / 1000).toFixed(2)} s`)
