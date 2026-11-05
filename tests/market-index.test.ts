/**
 * market-index.test — 插件源的 `market/index.json` 必须是**能解析的合法 JSON**。
 *
 * 为什么要有这条：0.9.0 那几次加版本号，是用"在文本里找 `        }` 再插一段"的土办法，
 * 结果把好几个版本条目的 `engines`/收口大括号一起吃掉了，整份文件在 0.9.0-dafeiyu.2
 * 之后就是**坏的**（`JSON.parse` 直接抛）——市场端一读就整页空，但仓库里没人跑过它。
 * 现在钉住三件事：
 *
 * 1. 文件能 `JSON.parse`；
 * 2. `plugins[0].versions` 每条都有 version / publishTimestamp / source.commit / engines；
 * 3. 版本号形如 `x.y.z-dafeiyu.n`，且时间戳不乱序（后发布的更大或相等）。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const marketFile = path.join(process.cwd(), 'market', 'index.json')
const pkgFile = path.join(process.cwd(), 'package.json')

test('market/index.json：合法 JSON，版本条目字段齐全，时间戳不乱序', () => {
  const raw = readFileSync(marketFile, 'utf8')
  let parsed: { plugins?: Array<{ name?: string; versions?: Array<Record<string, unknown>> }> }
  assert.doesNotThrow(() => {
    parsed = JSON.parse(raw)
  }, 'market/index.json 不是合法 JSON —— 市场端会整页读不出来')

  const plugins = parsed!.plugins ?? []
  assert.ok(plugins.length > 0, '至少要有一个插件')
  const self = plugins.find((plugin) => plugin.name === 'dsh-remote-dafeiyu')
  assert.ok(self, '缺 dsh-remote-dafeiyu 这个插件条目')
  const versions = self!.versions ?? []
  assert.ok(versions.length > 0, '至少要有版本条目')

  let previousTs = -Infinity
  for (const entry of versions) {
    const version = String(entry.version ?? '')
    assert.match(version, /^\d+\.\d+\.\d+-dafeiyu\.\d+$/, `版本号不合法：${version}`)
    const ts = Number(entry.publishTimestamp)
    assert.ok(Number.isFinite(ts) && ts > 0, `${version} 缺 publishTimestamp`)
    assert.ok(ts >= previousTs, `${version} 的时间戳比上一版还小（顺序乱了）`)
    previousTs = ts
    const source = entry.source as { type?: string; url?: string; commit?: string } | undefined
    assert.equal(source?.type, 'git', `${version} 的 source.type 不是 git`)
    assert.match(String(source?.commit ?? ''), /^[0-9a-f]{7,40}$/, `${version} 的 commit 不合法`)
    assert.ok((entry.engines as { dsh?: string } | undefined)?.dsh, `${version} 缺 engines.dsh`)
  }

  // 最新一条一般对应 package.json 的版本；发布途中（package 已 bump、market 还没补）
  // 允许 market 落后一版，只提醒一句，不当成失败。
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { version?: string }
  const last = String(versions.at(-1)?.version ?? '')
  if (last !== pkg.version) {
    console.log(`[market] package.json=${pkg.version}，market 最新=${last}（发布途中允许落后一版）`)
  }
})
