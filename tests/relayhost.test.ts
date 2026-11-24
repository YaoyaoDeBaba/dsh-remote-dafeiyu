/**
 * relayhost.test —— 一键部署本机中继那套（2026-11-24）。
 *
 * 判据的底线：**不联网、不起真进程**。下载器与 spawn 全部注入假实现；
 * /healthz 那一档用本机 127.0.0.1 上的一次性假中继（真的 HTTP，但不是真产物、不是真进程），
 * 因为"等健康"这件事的意义全在"对面回不回话"，用假的探活口验不了它。
 *
 * 钉住的六件事（对应任务书 ①~⑥）：
 *
 * 1. sha256 不对 ⇒ 拒绝落盘 + 抛中文（坏产物留在盘上会被下次 status 认成"已安装"）。
 * 2. 产物已在且哈希对 ⇒ 一次都不再下载（幂等，fetch 调用 0 次）。
 * 3. /healthz 不通 ⇒ state=failed、problem 里有端口、自己起的进程被收掉、不写配置。
 * 4. 成功路径 ⇒ serverUrl/hostToken 写进配置、state=running、configured=true、health 摘要来自真回答。
 * 5. stop 只 kill 自己的 pid；dispose 只放句柄不 kill。
 * 6. 没产物 ⇒ state=not-installed，且 status 不许触发下载。
 *
 * 另外顺手钉：token 的三级回落（入参 → 配置 → 现生成 32 位 hex）、三条路由的守卫。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createRelayHost,
  DEFAULT_RELAY_PORT,
  RELAY_BUNDLE_SHA256,
  RELAY_START_TIMEOUT_MS,
} from '../src/relayhost/service.js'
import {
  MAX_RELAYHOST_BODY_BYTES,
  RELAYHOST_DEPLOY_ROUTE,
  RELAYHOST_STATUS_ROUTE,
  RELAYHOST_STOP_ROUTE,
  relayhostHandlers,
} from '../src/relayhost/routes.js'
import type { RelayHostDeps, RelayHostService, RelayHostStatus } from '../src/relayhost/types.js'

const BUNDLE_NAME = 'relay-0.5.4.mjs'

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'drc-relayhost-'))
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** 假下载器：记账每一次调用，答案由调用方给。 */
function fakeFetch(bytes: Buffer, options: { ok?: boolean; status?: number; throws?: boolean } = {}) {
  const calls: string[] = []
  const impl: RelayHostDeps['fetchImpl'] = async (url) => {
    calls.push(url)
    if (options.throws === true) throw new Error('getaddrinfo ENOTFOUND github.com')
    return { ok: options.ok ?? true, status: options.status ?? 200, bytes }
  }
  return { calls, impl }
}

/** 假 spawn：记下参数与 kill 次数，**不起任何真进程**。 */
function fakeSpawn() {
  const spawns: Array<{ command: string; argv: string[]; env: Record<string, string>; cwd: string; killed: number }> = []
  const spawnImpl: RelayHostDeps['spawnImpl'] = (args) => {
    const record = { ...args, killed: 0 }
    spawns.push(record)
    return {
      pid: 4000 + spawns.length,
      kill() {
        record.killed += 1
      },
    }
  }
  return { spawns, spawnImpl }
}

/** 一次性假中继：真的 HTTP，只回答 /healthz。 */
async function startHealthServer() {
  let hits = 0
  const server = createServer((request, response) => {
    if ((request.url ?? '').split('?')[0] === '/healthz') {
      hits += 1
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ ok: true, version: '0.5.4', uptimeSec: 0, hosts: 2, clients: 1, protocolSelf: 1 }),
      )
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"ok":false}')
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  return {
    port,
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}

/** 拿一个"确定没人听"的端口（起一下立刻关掉）。 */
async function closedPort(): Promise<number> {
  const server = createServer((_request, response) => {
    response.writeHead(200)
    response.end('{}')
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
  return port
}

/** 可信安装标记（只有判据会手写它；真安装是服务自己写的）。 */
function writeMarker(dir: string, size: number, sha = RELAY_BUNDLE_SHA256): void {
  writeFileSync(path.join(dir, BUNDLE_NAME + '.sha256'), JSON.stringify({ sha256: sha, size }, null, 2))
}

/** 两个口子共用的假配置（写进去要能被下次读到，configured 才验得出来）。 */
function fakeConfig(initial: { serverUrl?: string; hostToken?: string } = {}) {
  let value = { ...initial }
  const writes: Array<{ serverUrl?: string; hostToken?: string }> = []
  return {
    writes,
    readConfig: () => ({ ...value }),
    writeConfig: (patch: { serverUrl?: string; hostToken?: string }) => {
      writes.push(patch)
      value = { ...value, ...patch }
    },
  }
}

/* ── ① sha256 不对：拒绝落盘、抛中文、不起进程 ─────────────────────── */

test('① 哈希不对：一个字节都不落盘，抛中文，不起进程也不写配置', async () => {
  const dir = tempDir()
  try {
    const fetch = fakeFetch(Buffer.from('这不是官方那一份中继产物'))
    const spawn = fakeSpawn()
    const config = fakeConfig()
    const logs: string[] = []
    const service = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: config.readConfig,
      writeConfig: config.writeConfig,
      lanAddress: () => '192.168.1.5',
      log: (message) => logs.push(message),
    })

    await assert.rejects(
      () => service.deploy(),
      (error: Error) => {
        assert.match(error.message, /[\u4e00-\u9fa5]/, '失败原因必须是中文，不许把英文堆栈怼给用户')
        assert.match(error.message, /sha256|校验/, '要说清是校验不过：' + error.message)
        return true
      },
    )

    assert.equal(fetch.calls.length, 1, '下载该试一次')
    assert.equal(existsSync(path.join(dir, BUNDLE_NAME)), false, '校验不过的产物不许出现在落点')
    assert.deepEqual(readdirSync(dir), [], '连临时文件 / 标记也不许留')
    assert.equal(spawn.spawns.length, 0, '产物没验过就不许起进程')
    assert.equal(config.writes.length, 0, '失败不许写配置')

    const status = await service.status()
    assert.equal(status.state, 'failed', '失败要留痕（否则用户只看到"没装"却不知道为什么）')
    assert.match(status.problem ?? '', /sha256|校验/)
    assert.equal(status.configured, false)
    assert.equal(status.bundlePath, undefined)
    assert.ok(logs.length > 0, '失败要有一行日志')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('① 下载失败（HTTP 非 2xx / 网络抛错）也是中文原因，且不落盘', async () => {
  const dir = tempDir()
  try {
    const failing = fakeFetch(Buffer.alloc(0), { ok: false, status: 502 })
    const spawn = fakeSpawn()
    const service = createRelayHost({ dir, fetchImpl: failing.impl, spawnImpl: spawn.spawnImpl, lanAddress: () => undefined })
    await assert.rejects(
      () => service.deploy(),
      (error: Error) => {
        assert.match(error.message, /下载官方中继失败/, error.message)
        assert.match(error.message, /502/)
        return true
      },
    )
    const throwing = fakeFetch(Buffer.alloc(0), { throws: true })
    const offline = createRelayHost({ dir, fetchImpl: throwing.impl, spawnImpl: spawn.spawnImpl, lanAddress: () => undefined })
    await assert.rejects(
      () => offline.deploy(),
      (error: Error) => {
        assert.match(error.message, /下载官方中继失败/)
        assert.match(error.message, /[\u4e00-\u9fa5]/)
        return true
      },
    )
    assert.deepEqual(readdirSync(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ② 已存在且哈希对：一次都不再下载 ────────────────────────────── */

test('② 产物已在且标记可信：fetch 一次都不调，直接起进程并跑通', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('本地已经装好的那一份（判据里用假字节 + 可信标记代表它）')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)

    const fetch = fakeFetch(Buffer.from('不该被用到'))
    const spawn = fakeSpawn()
    const config = fakeConfig({ hostToken: 'host-token-from-config' })
    const service = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: config.readConfig,
      writeConfig: config.writeConfig,
      lanAddress: () => '192.168.1.5',
    })

    const status = await service.deploy({ port: health.port })
    assert.equal(fetch.calls.length, 0, '已装好的产物不许再下一次')
    assert.equal(spawn.spawns.length, 1)
    assert.equal(status.state, 'running')
    assert.equal(status.bundlePath, path.join(dir, BUNDLE_NAME))
    assert.equal(status.version, '0.5.4')
    assert.equal(status.pid, 4001)
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('② 没有标记但只要哈希对，同样跳过下载（现算哈希这一支）', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('judge-only: 小产物 + 它自己的 sha256')
    const localSha = sha256(bytes)
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)

    const fetch = fakeFetch(Buffer.from('不该被用到'))
    const spawn = fakeSpawn()
    const service = createRelayHost({
      dir,
      bundle: { sha256: localSha },
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: () => ({}),
      writeConfig: () => {},
      lanAddress: () => '10.0.0.7',
    })
    const status = await service.deploy({ port: health.port })
    assert.equal(fetch.calls.length, 0, '哈希对就是"已安装"')
    assert.equal(status.state, 'running')
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('② 标记对不上（尺寸变了）⇒ 重新下载，并写上新的标记', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const stale = Buffer.from('半截产物')
    writeFileSync(path.join(dir, BUNDLE_NAME), stale)
    writeMarker(dir, stale.length + 999) // 尺寸对不上 ⇒ 不算已安装

    const fresh = Buffer.from('judge-only: 重新下回来的那一份')
    const freshSha = sha256(fresh)
    const fetch = fakeFetch(fresh)
    const spawn = fakeSpawn()
    const service = createRelayHost({
      dir,
      bundle: { sha256: freshSha },
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: () => ({}),
      writeConfig: () => {},
      lanAddress: () => '10.0.0.7',
    })
    const status = await service.deploy({ port: health.port })
    assert.equal(fetch.calls.length, 1, '标记不可信就要重下')
    assert.equal(status.state, 'running')
    assert.equal(readFileSync(path.join(dir, BUNDLE_NAME)).toString(), fresh.toString(), '盘上要换成新产物')
    const marker = JSON.parse(readFileSync(path.join(dir, BUNDLE_NAME + '.sha256'), 'utf8')) as { sha256: string; size: number }
    assert.equal(marker.sha256, freshSha)
    assert.equal(marker.size, fresh.length)
    assert.equal(statSync(path.join(dir, BUNDLE_NAME)).size, fresh.length)
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ③ /healthz 不通：failed + 带端口 + 收掉自己起的进程 ───────────── */

test('③ healthz 不通：15 秒后 failed、problem 带端口、进程被收掉、不写配置', async () => {
  const dir = tempDir()
  try {
    const bytes = Buffer.from('judge-only: 产物在，但没人服务')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)
    const port = await closedPort()
    const fetch = fakeFetch(Buffer.from('不该被用到'))
    const spawn = fakeSpawn()
    const config = fakeConfig()
    const service = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: config.readConfig,
      writeConfig: config.writeConfig,
      lanAddress: () => '192.168.1.5',
    })

    const startedAt = Date.now()
    await assert.rejects(
      () => service.deploy({ port }),
      (error: Error) => {
        assert.match(error.message, /[\u4e00-\u9fa5]/)
        assert.ok(error.message.includes(String(port)), '原因里要带端口：' + error.message)
        assert.match(error.message, /超时|healthz/)
        return true
      },
    )
    const elapsed = Date.now() - startedAt
    assert.ok(elapsed >= RELAY_START_TIMEOUT_MS - 1500, '不该比 15 秒这一档更早放弃，实际 ' + elapsed + 'ms')
    assert.ok(elapsed < RELAY_START_TIMEOUT_MS + 5000, '也不该拖太久，实际 ' + elapsed + 'ms')

    assert.equal(fetch.calls.length, 0)
    assert.equal(spawn.spawns.length, 1)
    assert.equal(spawn.spawns[0]?.killed, 1, '超时要把自己起的那个进程收掉，别留孤儿占端口')
    assert.equal(config.writes.length, 0, '没等到健康就不许写配置')

    const status = await service.status()
    assert.equal(status.state, 'failed')
    assert.ok((status.problem ?? '').includes(String(port)), 'status.problem 也要带端口：' + status.problem)
    assert.equal(status.pid, undefined, '进程已经收掉了，status 不许还报一个 pid')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ④ 成功路径：写配置 + running + health 摘要 ──────────────────── */

test('④ 成功路径：serverUrl/hostToken 写进配置、state=running、configured=true、health 来自真回答', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('judge-only: 一个能过哈希的产物')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)
    const fetch = fakeFetch(Buffer.from('不该被用到'))
    const spawn = fakeSpawn()
    const config = fakeConfig({ hostToken: 'config-token-0123456789abcdef' })
    const service = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: config.readConfig,
      writeConfig: config.writeConfig,
      lanAddress: () => '192.168.1.5',
    })

    const status = await service.deploy({ port: health.port })
    assert.equal(status.state, 'running')
    assert.equal(status.port, health.port)
    assert.equal(status.bind, '0.0.0.0', '本机部署要听 0.0.0.0，否则同局域网的手机连不上')
    assert.equal(status.configured, true, '写完配置就要显示"已配置"')
    assert.equal(config.writes.length, 1)
    assert.equal(config.writes[0]?.serverUrl, 'ws://192.168.1.5:' + health.port)
    assert.equal(config.writes[0]?.hostToken, 'config-token-0123456789abcdef', '已有 token 要沿用（换了等于换了一台主机）')
    assert.equal(status.health?.ok, true)
    assert.equal(status.health?.protocolSelf, 1)
    assert.equal(status.health?.hosts, 2)
    assert.equal(status.health?.clients, 1)
    assert.equal(status.health?.version, '0.5.4')

    // 环境变量：中继的启动参数一个都不许少（DRC_BIND 尤其——它的默认值是 127.0.0.1）
    const env = spawn.spawns[0]?.env ?? {}
    assert.equal(env.DRC_HOST_TOKEN, 'config-token-0123456789abcdef')
    assert.equal(env.DRC_PORT, String(health.port))
    assert.equal(env.DRC_BIND, '0.0.0.0')
    assert.equal(spawn.spawns[0]?.argv.length, 1, 'node <产物>：只一条参数')
    assert.ok((spawn.spawns[0]?.argv[0] ?? '').endsWith(BUNDLE_NAME), '跑的必须是 .mjs（官方产物是 ESM）')
    assert.equal(spawn.spawns[0]?.cwd, dir)

    // 再问一次状态：还是 running（这条就是设置页轮询的那一下）
    const again = await service.status()
    assert.equal(again.state, 'running')
    assert.equal(again.configured, true)
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('④ token 三级回落：入参 > 配置里那枚 > 现生成 32 位 hex', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('judge-only: token 回落')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)
    const spawn = fakeSpawn()

    // 入参优先
    const first = fakeConfig({ hostToken: 'from-config' })
    await createRelayHost({
      dir,
      fetchImpl: fakeFetch(Buffer.alloc(0)).impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: first.readConfig,
      writeConfig: first.writeConfig,
      lanAddress: () => undefined,
    }).deploy({ port: health.port, token: 'from-options' })
    assert.equal(first.writes[0]?.hostToken, 'from-options')

    // 都没有 ⇒ 现生成 32 位 hex，serverUrl 回环（没探到 lan）
    const second = fakeConfig()
    const status = await createRelayHost({
      dir,
      fetchImpl: fakeFetch(Buffer.alloc(0)).impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: second.readConfig,
      writeConfig: second.writeConfig,
      lanAddress: () => undefined,
    }).deploy({ port: health.port })
    const generated = second.writes[0]?.hostToken ?? ''
    assert.match(generated, /^[0-9a-f]{32}$/, '没现成 token 就生成 32 位 hex，实际 ' + generated)
    assert.equal(second.writes[0]?.serverUrl, 'ws://127.0.0.1:' + health.port)
    assert.equal(status.configured, true)
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ⑤ stop 只杀自己的 pid；dispose 不 kill ──────────────────────── */

test('⑤ stop 只 kill 自己起的那个 pid，停完是 stopped', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('judge-only: stop')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)
    const spawn = fakeSpawn()
    const config = fakeConfig()
    const service = createRelayHost({
      dir,
      fetchImpl: fakeFetch(Buffer.alloc(0)).impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: config.readConfig,
      writeConfig: config.writeConfig,
      lanAddress: () => undefined,
    })
    await service.deploy({ port: health.port })
    assert.equal(spawn.spawns[0]?.killed, 0)

    const stopped = await service.stop()
    assert.equal(spawn.spawns[0]?.killed, 1, '自己起的那个必须被杀')
    assert.equal(stopped.state, 'stopped')
    assert.equal(stopped.pid, undefined)

    // 再停一次：没有可杀的，不许重复 kill，也不许抛
    const again = await service.stop()
    assert.equal(spawn.spawns[0]?.killed, 1, 'stop 是幂等的')
    assert.equal(again.state, 'stopped')
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('⑤ dispose 只释放句柄、不 kill（别人的进程不许杀）', async () => {
  const dir = tempDir()
  const health = await startHealthServer()
  try {
    const bytes = Buffer.from('judge-only: dispose')
    writeFileSync(path.join(dir, BUNDLE_NAME), bytes)
    writeMarker(dir, bytes.length)
    const spawn = fakeSpawn()
    const service = createRelayHost({
      dir,
      fetchImpl: fakeFetch(Buffer.alloc(0)).impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: () => ({}),
      writeConfig: () => {},
      lanAddress: () => undefined,
    })
    await service.deploy({ port: health.port })
    service.dispose()
    assert.equal(spawn.spawns[0]?.killed, 0, 'dispose 不许 kill')

    // 句柄已经放掉了 ⇒ 之后的 stop 也不再碰它
    const stopped = await service.stop()
    assert.equal(spawn.spawns[0]?.killed, 0, '句柄放掉之后 stop 也不该杀它')
    assert.equal(stopped.pid, undefined)
  } finally {
    await health.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── ⑥ 没产物：not-installed，且不调 fetch ───────────────────────── */

test('⑥ 没产物时 status 是 not-installed，而且一次 fetch 都不发', async () => {
  const dir = tempDir()
  try {
    const fetch = fakeFetch(Buffer.from('不该被用到'))
    const spawn = fakeSpawn()
    const service = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: () => ({}),
      writeConfig: () => {},
      lanAddress: () => undefined,
    })
    const status = await service.status()
    assert.equal(status.state, 'not-installed')
    assert.equal(fetch.calls.length, 0, 'status 只读：绝不下载')
    assert.equal(spawn.spawns.length, 0, 'status 只读：绝不起进程')
    assert.equal(status.bundlePath, undefined)
    assert.equal(status.version, undefined)
    assert.equal(status.port, DEFAULT_RELAY_PORT)
    assert.equal(status.serverUrl, 'ws://127.0.0.1:8787', '探不到 lan 就回环')
    assert.equal(status.configured, false)

    // 端口从配置里的 serverUrl 读（用户上次部署过的那个端口）
    const adopted = createRelayHost({
      dir,
      fetchImpl: fetch.impl,
      spawnImpl: spawn.spawnImpl,
      readConfig: () => ({ serverUrl: 'ws://192.168.1.5:9100', hostToken: 'tok' }),
      writeConfig: () => {},
      lanAddress: () => '192.168.1.5',
    })
    const adoptedStatus = await adopted.status()
    assert.equal(adoptedStatus.port, 9100)
    assert.equal(adoptedStatus.serverUrl, 'ws://192.168.1.5:9100')
    assert.equal(adoptedStatus.configured, true, '配置里就是这一套值 ⇒ 已配置')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

/* ── 路由：守卫与回答形状 ────────────────────────────────────────── */

interface FakeResponse {
  status: number
  headers: Record<string, string>
  chunks: string[]
  setHeader(name: string, value: string): void
  writeHead(status: number, headers?: Record<string, string>): void
  end(chunk?: string): void
}

function makeResponse(): FakeResponse {
  return {
    status: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = String(value)
    },
    writeHead(status, headers) {
      this.status = status
      for (const [key, value] of Object.entries(headers ?? {})) this.headers[key.toLowerCase()] = String(value)
    },
    end(chunk?: string) {
      if (typeof chunk === 'string') this.chunks.push(chunk)
    },
  }
}

function makeRequest(method: string, options: { headers?: Record<string, string>; body?: string } = {}): IncomingMessage {
  const listeners = new Map<string, Array<(chunk?: unknown) => void>>()
  const request = {
    method,
    url: '/',
    headers: { host: '127.0.0.1:19387', ...(options.headers ?? {}) },
    on(event: string, handler: (chunk?: unknown) => void) {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return request
    },
  } as unknown as IncomingMessage
  // body 要在 handler 注册完之后再喂（readJsonBody 是注册在前、收数据在后）。
  // ⚠️ 没有 body 也要发 end：否则 readJsonBody 永远等不到 end，整条路由悬在那里。
  queueMicrotask(() => {
    if (options.body !== undefined) {
      for (const handler of listeners.get('data') ?? []) handler(Buffer.from(options.body))
    }
    for (const handler of listeners.get('end') ?? []) handler()
  })
  return request
}

const IDLE: RelayHostStatus = {
  state: 'not-installed',
  port: 8787,
  bind: '0.0.0.0',
  serverUrl: 'ws://127.0.0.1:8787',
  configured: false,
}

function stubService(overrides: Partial<RelayHostService> = {}): RelayHostService {
  return {
    status: async () => IDLE,
    deploy: async () => ({ ...IDLE, state: 'running' as const }),
    stop: async () => ({ ...IDLE, state: 'stopped' as const }),
    dispose: () => {},
    ...overrides,
  }
}

async function call(
  handler: (request: IncomingMessage, response: ServerResponse) => unknown,
  method: string,
  options: { headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Record<string, string> }> {
  const response = makeResponse()
  await handler(makeRequest(method, options), response as unknown as ServerResponse)
  const text = response.chunks.join('')
  return {
    status: response.status,
    headers: response.headers,
    body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
  }
}

const WRITE_HEADERS = { 'x-drc-pair': '1' }

test('路由：三条路径对得上，status 走只读档，deploy/stop 走写档', async () => {
  assert.equal(RELAYHOST_STATUS_ROUTE, '/api/dsh-remote-dafeiyu/relayhost/status')
  assert.equal(RELAYHOST_DEPLOY_ROUTE, '/api/dsh-remote-dafeiyu/relayhost/deploy')
  assert.equal(RELAYHOST_STOP_ROUTE, '/api/dsh-remote-dafeiyu/relayhost/stop')
  assert.equal(MAX_RELAYHOST_BODY_BYTES, 4096)
  const handlers = relayhostHandlers({ service: stubService(), log: () => {} })
  assert.deepEqual(
    handlers.map((entry) => entry.path),
    [RELAYHOST_STATUS_ROUTE, RELAYHOST_DEPLOY_ROUTE, RELAYHOST_STOP_ROUTE],
  )

  const [statusHandler, deployHandler, stopHandler] = handlers.map((entry) => entry.handler)
  assert.ok(statusHandler && deployHandler && stopHandler)

  // status：GET 200，扁平 state + 嵌套 status 都在
  const read = await call(statusHandler, 'GET')
  assert.equal(read.status, 200)
  assert.equal(read.body.state, 'not-installed')
  assert.deepEqual(read.body.status, IDLE)
  // 写方法打到只读路由 ⇒ 405
  assert.equal((await call(statusHandler, 'POST', { headers: WRITE_HEADERS })).status, 405)
  // 非回环 Host ⇒ 403（挡 DNS 重绑定）
  const rebound = await call(statusHandler, 'GET', { headers: { host: 'evil.example.com' } })
  assert.equal(rebound.status, 403)
  // 外来 Origin ⇒ 403（不给任意网页读）
  const crossOrigin = await call(statusHandler, 'GET', { headers: { origin: 'https://evil.example.com' } })
  assert.equal(crossOrigin.status, 403)
  // 宿主自己的 Origin ⇒ 回声 ACAO（桌面页在 dsh-app:// 上，缺这个头整条链路静默失败）
  const sameOrigin = await call(statusHandler, 'GET', { headers: { origin: 'dsh-app://app' } })
  assert.equal(sameOrigin.status, 200)
  assert.equal(sameOrigin.headers['access-control-allow-origin'], 'dsh-app://app')
  // 预检：2xx + ACAO，不许 405
  const preflight = await call(statusHandler, 'OPTIONS', { headers: { origin: 'dsh-app://app' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers['access-control-allow-origin'], 'dsh-app://app')

  // deploy：缺 x-drc-pair ⇒ 403，且**没碰业务**
  const deployed: Array<{ port?: number; token?: string }> = []
  const service = stubService({
    deploy: async (options) => {
      deployed.push(options ?? {})
      return { ...IDLE, state: 'running' as const }
    },
  })
  const guarded = relayhostHandlers({ service, log: () => {} })
  const noMarker = await call(guarded[1]!.handler, 'POST')
  assert.equal(noMarker.status, 403)
  assert.equal(deployed.length, 0, '被守卫拒了就不许动业务')

  const ok = await call(guarded[1]!.handler, 'POST', { headers: WRITE_HEADERS, body: '{"port":8799,"token":"tk"}' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.ok, true)
  assert.deepEqual(deployed[0], { port: 8799, token: 'tk' })

  // deploy：GET 打进来 ⇒ 405
  assert.equal((await call(guarded[1]!.handler, 'GET')).status, 405)
  // deploy：坏 body ⇒ 400
  assert.equal((await call(guarded[1]!.handler, 'POST', { headers: WRITE_HEADERS, body: '{oops' })).status, 400)
  // deploy：端口越界 ⇒ 400
  const badPort = await call(guarded[1]!.handler, 'POST', { headers: WRITE_HEADERS, body: '{"port":70000}' })
  assert.equal(badPort.status, 400)
  assert.match(String(badPort.body.message), /1~65535/)

  // stop：同一条写档守卫，成功 200
  const stopped = await call(guarded[2]!.handler, 'POST', { headers: WRITE_HEADERS })
  assert.equal(stopped.status, 200)
  assert.equal(stopped.body.state, 'stopped')
  assert.equal((await call(guarded[2]!.handler, 'POST')).status, 403)
})

test('路由：deploy 失败回 500 + 中文原因 + 当前状态（界面那句红字要和卡片对得上）', async () => {
  const failing = stubService({
    deploy: async () => {
      throw new Error('中继启动超时：15 秒内 http://127.0.0.1:8787/healthz 没有回 ok，已结束该进程（端口 8787 可能被占用）')
    },
    status: async () => ({ ...IDLE, state: 'failed' as const, problem: '中继启动超时（端口 8787）' }),
  })
  const handlers = relayhostHandlers({ service: failing, log: () => {} })
  const answer = await call(handlers[1]!.handler, 'POST', { headers: WRITE_HEADERS })
  assert.equal(answer.status, 500)
  assert.equal(answer.body.ok, false)
  assert.match(String(answer.body.message), /端口 8787/, '失败原因要带端口')
  assert.equal((answer.body.status as RelayHostStatus).state, 'failed')

  // 非中文异常也要被折成中文
  const english = stubService({
    deploy: async () => {
      throw new Error('ECONNREFUSED')
    },
  })
  const folded = await call(relayhostHandlers({ service: english, log: () => {} })[1]!.handler, 'POST', {
    headers: WRITE_HEADERS,
  })
  assert.match(String(folded.body.message), /一键部署失败：ECONNREFUSED/)
})
