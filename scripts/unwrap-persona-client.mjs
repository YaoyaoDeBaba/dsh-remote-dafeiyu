/**
 * unwrap-persona-client — 把人设插件那份**已经裹好 loader 外壳**的 `lib/client.js`
 * 剥成「工厂函数」，供肥鱼远控的客户端 bundle 内联调用。
 *
 * 为什么必须剥：
 * 人设的客户端文件第一行就是 `window.__ModuleLoader__.load({ id: "dsh-persona-dafeiyu", ... })`。
 * 直接并进远控的 `client.cjs`，等于在远控的 factory 里**再注册一个 id 是别人的条目**——
 * 装载器按包名查 `graphRows`，对不上就注册不上（表现是"网页白屏/整页 boot 失败"）。
 *
 * 产物 `src/persona/client-factory.js` 是一个 `export default function (require) { ... }`，
 * 内部仍是人设那份代码（含 `var module = { exports: {} }` 那套自己拼 CJS 的写法），
 * 只把外壳换掉。生成物入库——和 dist 一个路子，装机时不需要跑这个脚本。
 *
 * 用法：node scripts/unwrap-persona-client.mjs [源文件] [输出文件]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const SOURCE = process.argv[2] ?? 'D:\\dsh-persona-dafeiyu\\lib\\client.js'
const OUT = process.argv[3] ?? path.join(ROOT, 'src', 'persona', 'client-factory.js')

const text = readFileSync(SOURCE, 'utf8')
const lines = text.split('\n')

// 外壳必须是认得的样子；认不出就**中止**，不许"猜着剥"——剥错的表现是白屏，而白屏要重启才看得见。
const head = lines.slice(0, 3).map((line) => line.trim())
if (head[0] !== 'window.__ModuleLoader__.load({') {
  throw new Error(`外壳第一行不是 window.__ModuleLoader__.load({：${head[0]}`)
}
if (!/^id: ["']dsh-persona-dafeiyu["'],$/.test(head[1])) {
  throw new Error(`外壳的 id 不是人设包名：${head[1]}`)
}
if (!/^factory: \(require\) => \{$/.test(head[2])) {
  throw new Error(`外壳的 factory 签名不认识：${head[2]}`)
}

// 尾巴：return module.exports; / }, / });
let tailStart = -1
for (let index = lines.length - 1; index >= 0; index -= 1) {
  if (lines[index].trim() === 'return module.exports;') {
    tailStart = index
    break
  }
}
if (tailStart < 0) throw new Error('尾巴里找不到 return module.exports;')

const body = lines.slice(3, tailStart + 1).join('\n')

let out = `/**
 * client-factory — **生成物，别手改**。
 *
 * 由 \`scripts/unwrap-persona-client.mjs\` 从人设插件的 \`lib/client.js\` 剥掉 loader 外壳得到。
 * 改动方式：改人设仓库那份，再重新生成一次（或重新 \`node scripts/unwrap-persona-client.mjs\`）。
 *
 * 返回的是人设客户端的 module.exports（\`apply\` / \`inject\` / 几个组件）。
 * \`require\` 由装载器给（远控 factory 的形参），内部要的 react 靠它解析——
 * 所以这一份的 \`require("react")\` 落在**函数体内**，只有真调用时才求值。
 */
export default function personaClientFactory(require) {
${body}
}
`

// ── 0.8.0 合页用的两个小改动（只改这一份生成物，不碰人设仓库那份）──────────
// 1. `apply(ctx)` → `apply(ctx, options)`：`options.skipSettings` 为真时，人设自己的
//    `settings.section` 不注册——「大肥鱼」合页里那份人设页由我们自己的组件渲染，
//    不让它再单独出一张卡。
if (!out.includes('function apply(ctx) {')) {
  throw new Error('生成物里找不到 function apply(ctx) —— 上游签名的形状变了？')
}
out = out.replace('function apply(ctx) {', 'function apply(ctx, options) {', 1)

const settingsBlock = `\t\t\tctx.slots.inject("settings.section", () => ctx.slots.register({\n\t\t\t\tname: "settings.section",\n\t\t\t\tid: SECTION_ID,\n\t\t\t\torder: 18,\n\t\t\t\tlabel: () => t("nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tinject: () => ({ t }),\n\t\t\t}, PersonaSettingsSection));`
if (!out.includes(settingsBlock)) {
  throw new Error('生成物里找不到 settings.section 注册块 —— 上游那块的样子变了？')
}
out = out.replace(
  settingsBlock,
  `\t\t\tif (!options?.skipSettings) {\n${settingsBlock}\n\t\t\t}`,
  1,
)

writeFileSync(OUT, out, 'utf8')
console.log(`[unwrap-persona-client] ${path.basename(SOURCE)} → ${path.relative(ROOT, OUT)}（${out.length} 字节）`)