/**
 * extensions.test —— 「扩展列表」的宿主侧判据（白名单 / 状态 / 计划 / 落盘回滚 / 两条路由）。
 *
 * ## 这些判据各钉住什么（2026-11-16）
 *
 * 1. **白名单**：路由只认 `registry.ts` 里的 `id`。这是整个插件里唯一"点一下就执行远程代码"
 *    的地方（装 = 往 profile 写 `git+url#sha` 再 `pnpm install`），所以非法 id 必须在
 *    **没碰盘**之前就被拒——判据查的是 `applyAction` 压根没被调用、package.json 一个字节没变。
 * 2. **`planAction`**：四动作对 `dependencies` / `bundles` 的改动是全功能的核心表；纯函数，
 *    判据把整张表钉死（包括"禁用时依赖保留"这条最容易写错的）。
 * 3. **`readExtensionStatus`**：三种真实现场（没装 / 装了但禁用 / 装了并启用）都要判对，
 *    外加两种边角：依赖写了但 node_modules 不在（pnpm 失败过）、package.json 坏了。
 * 4. **写坏能恢复**：原子写失败、写后校验失败、pnpm 失败三条路都得把原文件放回去；
 *    判据里注入 fs 桩制造这三种失败，**不许**用只读目录（Windows 上不稳）。
 * 5. **路由**：守卫（非回环 / 缺 `x-drc-pair` / 方法不对）与"失败要说中文原因"。
 *
 * 真实的 `pnpm install` 一次都不能跑：`PnpmRunner` 是注入的。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  applyAction,
  applyWrites,
  bundlesOf,
  createExtensionsService,
  isExtensionAction,
  nodeFs,
  planAction,
  readExtensionStatus,
  readExtensions,
  resolveProfileDir,
  resolveRuntimeDir,
  summarizePnpmFailure,
  type ExtensionStatus,
  type FsLike,
  type PnpmRunner,
} from '../src/extensions/service.js'
import { dependencyOf, EXTENSIONS, findExtension } from '../src/extensions/registry.js'
import {
  EXTENSIONS_ACTION_ROUTE,
  EXTENSIONS_ROUTE,
  extensionsActionHandler,
  extensionsListHandler,
  type ExtensionsRouteDeps,
} from '../src/extensions/routes.js'

const AVATAR = EXTENSIONS[0]!
const PACKAGE = AVATAR.packageName
const PINNED = dependencyOf(AVATAR)

/** 造一个假 profile：`dependencies` + `dsh.profile.bundles` +（可选）装上的包。 */
function makeProfile(t: { after: (fn: () => void) => void }, options: {
  dependencies?: Record<string, string>
  bundles?: string[]
  installedVersion?: string
  brokenJson?: string
}): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-ext-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  if (options.brokenJson !== undefined) {
    writeFileSync(path.join(dir, 'package.json'), options.brokenJson, 'utf8')
  } else {
    const doc = {
      name: 'dsh-profile-test',
      private: true,
      dependencies: options.dependencies ?? {},
      dsh: { profile: { bundles: options.bundles ?? [] } },
    }
    writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  }
  if (options.installedVersion !== undefined) {
    const pkgDir = path.join(dir, 'node_modules', PACKAGE)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: PACKAGE, version: options.installedVersion }), 'utf8')
  }
  return dir
}

function readProfile(dir: string): { dependencies: Record<string, string>; bundles: string[] } {
  const doc = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  return {
    dependencies: (doc.dependencies ?? {}) as Record<string, string>,
    bundles: bundlesOf(doc),
  }
}

const STATUS_BASE: Omit<ExtensionStatus, 'installed' | 'enabled'> = {
  id: AVATAR.id,
  label: AVATAR.label,
  description: AVATAR.description,
}

// ── ① 白名单 ─────────────────────────────────────────────────────────

test('白名单：只认 registry 里的 id，非法 id 在碰盘之前就被拒', async (t) => {
  assert.equal(EXTENSIONS.length >= 1, true)
  assert.equal(AVATAR.id, 'avatar')
  assert.equal(AVATAR.packageName, 'dsh-avatar-dafeiyu')
  assert.match(AVATAR.gitUrl, /^https:\/\/github\.com\//, 'gitUrl 必须是 https 仓库地址（拼 git+ 用）')
  assert.match(AVATAR.commit, /^[0-9a-f]{40}$/, 'commit 必须是固定 40 位 sha，不许写分支名')
  assert.equal(PINNED, `git+${AVATAR.gitUrl}#${AVATAR.commit}`)

  assert.equal(findExtension('avatar')?.id, 'avatar')
  for (const id of ['', '  ', 'nope', '../package.json', 'dsh-selfloop', null, undefined]) {
    assert.equal(findExtension(id), undefined, `${String(id)} 不该在白名单里`)
  }

  // 就算 profile 是好的，非法 id 也不能让它动一个字节
  const dir = makeProfile(t, {})
  const before = readFileSync(path.join(dir, 'package.json'), 'utf8')
  let pnpmRuns = 0
  const service = createExtensionsService({
    profileDir: dir,
    log: () => undefined,
    runPnpm: async () => {
      pnpmRuns += 1
      return { ok: true, message: '不该被调用' }
    },
  })
  for (const id of ['dsh-selfloop', 'https://evil.example/x.git', '../dsh-avatar-dafeiyu']) {
    const result = await service.act(id, 'install')
    assert.equal(result.ok, false, `${id} 必须被拒`)
    assert.match(String(result.message), /不在白名单里/, '拒绝原因要说清是白名单')
  }
  const bad = await service.act('avatar', 'sudo-rm-rf')
  assert.equal(bad.ok, false)
  assert.match(String(bad.message), /不支持的动作/)
  assert.equal(pnpmRuns, 0, '被拒的请求不许跑 pnpm')
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), before, 'package.json 不许被改')
  assert.equal(isExtensionAction('install'), true)
  assert.equal(isExtensionAction('INSTALL'), false)
})

// ── ③ 状态读取：三种现场 + 两个边角 ──────────────────────────────────

test('状态：没装 / 装了但禁用 / 装了并启用，三种现场都判对', (t) => {
  const fresh = makeProfile(t, {})
  const freshStatus = readExtensionStatus(fresh, AVATAR)
  assert.equal(freshStatus.installed, false)
  assert.equal(freshStatus.enabled, false)
  assert.equal(freshStatus.version, undefined, '没装就没有版本号')
  assert.equal(freshStatus.label, AVATAR.label)
  assert.equal(freshStatus.description, AVATAR.description)

  const disabled = makeProfile(t, { dependencies: { [PACKAGE]: PINNED }, installedVersion: '0.1.2' })
  const disabledStatus = readExtensionStatus(disabled, AVATAR)
  assert.equal(disabledStatus.installed, true)
  assert.equal(disabledStatus.enabled, false, '不在 bundles 里就是禁用')
  assert.equal(disabledStatus.version, '0.1.2', '版本从装上的包读，不从 git 串猜')

  const enabled = makeProfile(t, {
    dependencies: { [PACKAGE]: PINNED },
    bundles: [PACKAGE],
    installedVersion: '0.1.3',
  })
  const enabledStatus = readExtensionStatus(enabled, AVATAR)
  assert.equal(enabledStatus.installed, true)
  assert.equal(enabledStatus.enabled, true)
  assert.equal(enabledStatus.version, '0.1.3')
})

test('状态边角：依赖写了但包没装上算"没装"；package.json 坏了不崩；needsRestart 由调用方注入', (t) => {
  // ① `pnpm install` 失败过的现场：dependencies 里有它、node_modules 里没有
  const halfInstalled = makeProfile(t, { dependencies: { [PACKAGE]: PINNED }, bundles: [PACKAGE] })
  const half = readExtensionStatus(halfInstalled, AVATAR)
  assert.equal(half.installed, false, '包没落地就不算装了（否则界面会给"启用"，点了还是加载不到）')
  assert.equal(half.enabled, true, 'bundles 里有它就是 enabled —— 界面因此会显示"安装"而不是"启用"')

  // ② 坏 JSON：不抛，按"没装/没启用"回，apply 那一层会拒绝覆盖坏文件
  const broken = makeProfile(t, { brokenJson: '{"name": "x", ' })
  const brokenStatus = readExtensionStatus(broken, AVATAR)
  assert.equal(brokenStatus.installed, false)
  assert.equal(brokenStatus.enabled, false)

  // ③ needsRestart 是"本次运行里改过"的标记，重启后就没了
  const pending = new Set<string>(['avatar'])
  assert.equal(readExtensionStatus(freshish(t), AVATAR, { pendingRestart: pending }).needsRestart, true)
  assert.equal(readExtensionStatus(freshish(t), AVATAR).needsRestart, undefined)

  // ④ 整张表
  const table = readExtensions(freshish(t))
  assert.equal(table.length, EXTENSIONS.length)
  assert.deepEqual(table.map((row) => row.id), EXTENSIONS.map((spec) => spec.id))
})

function freshish(t: { after: (fn: () => void) => void }): string {
  return makeProfile(t, {})
}

// ── ② 计划表 ─────────────────────────────────────────────────────────

test('planAction：四动作对 dependencies / bundles 的改动（含"禁用保留依赖"与幂等）', () => {
  const notInstalled: ExtensionStatus = { ...STATUS_BASE, installed: false, enabled: false }
  const disabled: ExtensionStatus = { ...STATUS_BASE, installed: true, enabled: false }
  const enabled: ExtensionStatus = { ...STATUS_BASE, installed: true, enabled: true }

  // install
  assert.deepEqual(planAction(AVATAR, 'install', notInstalled), {
    changed: true,
    writes: { addDependency: PINNED, addBundle: true },
    runPnpm: true,
  })
  // 装了但禁用时点安装：目标是"装了且启用" ⇒ 只补 bundle（依赖照样重钉一次 sha）
  assert.deepEqual(planAction(AVATAR, 'install', disabled), {
    changed: true,
    writes: { addDependency: PINNED, addBundle: true },
    runPnpm: true,
  })
  // 幂等
  assert.deepEqual(planAction(AVATAR, 'install', enabled), { changed: false, message: '已经是这个状态' })

  // enable：只加 bundle，不装东西 ⇒ 不跑 pnpm
  assert.deepEqual(planAction(AVATAR, 'enable', disabled), { changed: true, writes: { addBundle: true }, runPnpm: false })
  assert.deepEqual(planAction(AVATAR, 'enable', enabled), { changed: false, message: '已经是这个状态' })
  const enableUninstalled = planAction(AVATAR, 'enable', notInstalled)
  assert.equal(enableUninstalled.changed, false, '没装就"启用"没有意义（会加载一个不存在的 bundle）')
  assert.match(String((enableUninstalled as { message: string }).message), /还没安装/)

  // disable：只移除 bundle，**依赖保留**（文件还在，随时能启用回来）
  assert.deepEqual(planAction(AVATAR, 'disable', enabled), { changed: true, writes: { removeBundle: true }, runPnpm: false })
  assert.deepEqual(planAction(AVATAR, 'disable', disabled), { changed: false, message: '已经是这个状态' })
  assert.deepEqual(planAction(AVATAR, 'disable', notInstalled), { changed: false, message: '已经是这个状态' })

  // uninstall：依赖与 bundle 都移除
  assert.deepEqual(planAction(AVATAR, 'uninstall', enabled), {
    changed: true,
    writes: { removeDependency: true, removeBundle: true },
    runPnpm: true,
  })
  assert.equal(planAction(AVATAR, 'uninstall', disabled).changed, true)
  assert.deepEqual(planAction(AVATAR, 'uninstall', notInstalled), { changed: false, message: '已经是这个状态' })

  // 不认的动作直接抛（路由先用 isExtensionAction 挡过一次）
  assert.throws(() => planAction(AVATAR, 'sudo' as never, enabled), /不支持的动作/)

  // disable 真的不动 dependencies：在 doc 上落一遍，依赖与版本串都还在
  const doc = { dependencies: { [PACKAGE]: PINNED, other: '1.0.0' }, dsh: { profile: { bundles: [PACKAGE] } } }
  const afterDisable = applyWrites(doc, { removeBundle: true }, AVATAR)
  assert.deepEqual(afterDisable.dependencies, { [PACKAGE]: PINNED, other: '1.0.0' }, '禁用不许动 dependencies')
  assert.deepEqual(bundlesOf(afterDisable), [])
  assert.deepEqual(bundlesOf(doc), [PACKAGE], 'applyWrites 不许改入参')
})

// ── 落盘：正常路径 + 幂等 ───────────────────────────────────────────

test('applyAction：install 写依赖+启用的 bundle 并跑一次 pnpm；enable/disable 不跑 pnpm', async (t) => {
  const dir = makeProfile(t, {})
  let runs = 0
  const runPnpm: PnpmRunner = async (input) => {
    runs += 1
    assert.equal(input.profileDir, dir, 'pnpm 必须在 profile 目录里跑')
    // 真实 pnpm 会把包装进 node_modules —— 桩也得这么做，否则"装完"这个状态根本不成立
    const pkgDir = path.join(input.profileDir, 'node_modules', PACKAGE)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: PACKAGE, version: '0.1.2' }), 'utf8')
    return { ok: true, message: 'pnpm install 完成' }
  }
  const pending = new Set<string>()

  const installed = await applyAction(dir, AVATAR, 'install', { runPnpm, pendingRestart: pending })
  assert.equal(installed.ok, true)
  assert.equal(installed.changed, true)
  assert.equal(installed.needsRestart, true, '改动一律要重启才生效')
  assert.equal(runs, 1)
  assert.deepEqual(readProfile(dir).dependencies[PACKAGE], PINNED)
  assert.deepEqual(readProfile(dir).bundles, [PACKAGE], '装完即启用')
  assert.equal(installed.version, '0.1.2', '回执里带装上的版本号')
  assert.equal(pending.has(AVATAR.id), true)
  // 备份在：`package.json.bak` 是装之前那份（空的 bundles）
  const backup = JSON.parse(readFileSync(path.join(dir, 'package.json.bak'), 'utf8')) as Record<string, unknown>
  assert.deepEqual(bundlesOf(backup), [], '备份里是装之前那份')

  // 幂等：不报错、不静默（回一句"已经是这个状态"）、不再跑 pnpm
  const again = await applyAction(dir, AVATAR, 'install', { runPnpm, pendingRestart: pending })
  assert.equal(again.ok, true)
  assert.equal(again.changed, false)
  assert.equal(again.needsRestart, false)
  assert.equal(again.message, '已经是这个状态')
  assert.equal(runs, 1)

  // disable：依赖保留、bundle 移除、**不跑 pnpm**
  const disabled = await applyAction(dir, AVATAR, 'disable', { runPnpm })
  assert.equal(disabled.ok, true)
  assert.equal(disabled.changed, true)
  assert.equal(runs, 1, '禁用只是改 bundles，不需要 pnpm install')
  assert.deepEqual(readProfile(dir).bundles, [])
  assert.equal(readProfile(dir).dependencies[PACKAGE], PINNED, '禁用必须保留依赖')

  // enable：加回 bundle，仍不跑 pnpm
  const enabledAgain = await applyAction(dir, AVATAR, 'enable', { runPnpm })
  assert.equal(enabledAgain.ok, true)
  assert.equal(runs, 1)
  assert.deepEqual(readProfile(dir).bundles, [PACKAGE])

  // uninstall：两处都清、pnpm 再跑一次
  const uninstalled = await applyAction(dir, AVATAR, 'uninstall', { runPnpm })
  assert.equal(uninstalled.ok, true)
  assert.equal(runs, 2)
  assert.deepEqual(readProfile(dir).dependencies, {})
  assert.deepEqual(readProfile(dir).bundles, [])
})

// ── ④ 写坏能恢复：三条失败路径都要回滚 ──────────────────────────────

test('原子写失败（rename 抛）→ 原文件不动、临时文件清掉、回中文原因', async (t) => {
  const dir = makeProfile(t, { dependencies: { keep: '1.0.0' }, bundles: ['keep'] })
  const before = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const stub: FsLike = {
    ...nodeFs,
    renameSync: () => {
      throw new Error('EPERM: operation not permitted, rename')
    },
  }
  const result = await applyAction(dir, AVATAR, 'install', { fs: stub, runPnpm: async () => ({ ok: true, message: '' }) })
  assert.equal(result.ok, false)
  assert.equal(result.changed, false)
  assert.match(String(result.message), /写 profile 失败/)
  assert.match(String(result.message), /已回滚|没有动/, '失败必须说清文件还在不在')
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), before, '原文件必须原样还在')
  assert.equal(readFileSync(path.join(dir, 'package.json.bak'), 'utf8'), before, '备份也在')
})

test('写后校验失败（读回来不是合法 JSON）→ 回滚到原内容，并说清"已回滚"', async (t) => {
  const dir = makeProfile(t, { dependencies: { keep: '1.0.0' }, bundles: ['keep'] })
  const file = path.join(dir, 'package.json')
  const before = readFileSync(file, 'utf8')
  let swapped = false
  const stub: FsLike = {
    ...nodeFs,
    renameSync: (from, to) => {
      nodeFs.renameSync(from, to)
      swapped = true // 从这一刻起读回来的是"坏文件"
    },
    readFileSync: (target, encoding) => {
      if (swapped && target === file) return '{"dependencies": {'
      return nodeFs.readFileSync(target, encoding)
    },
  }
  const result = await applyAction(dir, AVATAR, 'install', { fs: stub, runPnpm: async () => ({ ok: true, message: '' }) })
  assert.equal(result.ok, false)
  assert.match(String(result.message), /写后读不回来/)
  assert.match(String(result.message), /已回滚/)
  // 真 fs 上看到的就是原来那份（依赖 keep、没有 avatar）
  assert.equal(readFileSync(file, 'utf8'), before)
  assert.deepEqual(readProfile(dir), { dependencies: { keep: '1.0.0' }, bundles: ['keep'] })
})

test('写后校验发现字段没写进去 → 同样回滚，原因指名道姓', async (t) => {
  const dir = makeProfile(t, {})
  const file = path.join(dir, 'package.json')
  const before = readFileSync(file, 'utf8')
  // 写盘照做，但读回来永远是"没改过"的那份 ⇒ verifyWrites 判缺失
  const stub: FsLike = {
    ...nodeFs,
    readFileSync: (target, encoding) => (target === file ? before : nodeFs.readFileSync(target, encoding)),
  }
  const result = await applyAction(dir, AVATAR, 'install', { fs: stub, runPnpm: async () => ({ ok: true, message: '' }) })
  assert.equal(result.ok, false)
  assert.match(String(result.message), /写后校验失败/)
  assert.match(String(result.message), /bundles|dependencies/, '要说清是哪一项没写进去')
  assert.equal(readFileSync(file, 'utf8'), before)
})

test('pnpm 失败 → profile 回滚（不许留一个"重启就加载不到"的 bundle），原因带 pnpm 的尾巴', async (t) => {
  const dir = makeProfile(t, {})
  const before = readFileSync(path.join(dir, 'package.json'), 'utf8')
  const runs: string[] = []
  const result = await applyAction(dir, AVATAR, 'install', {
    runPnpm: async () => {
      runs.push('install')
      return { ok: false, code: 1, message: 'pnpm 失败（退出码 1）：ERR_PNPM_FETCH_404 GET https://github.com/...: Not Found' }
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.changed, false)
  assert.equal(result.needsRestart, false)
  assert.equal(runs.length, 1)
  assert.match(String(result.message), /pnpm 失败/)
  assert.match(String(result.message), /ERR_PNPM_FETCH_404/, '必须把 pnpm 的 stderr 尾巴带回来')
  assert.match(String(result.message), /profile 已回滚/)
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), before, '文件要回到没装之前')
})

test('坏 profile（非法 JSON）拒绝写：不覆盖、不跑 pnpm、说清先修好', async (t) => {
  const dir = makeProfile(t, { brokenJson: '{"name": "x", ' })
  let runs = 0
  const result = await applyAction(dir, AVATAR, 'install', {
    runPnpm: async () => {
      runs += 1
      return { ok: true, message: '' }
    },
  })
  assert.equal(result.ok, false)
  assert.equal(runs, 0)
  assert.match(String(result.message), /读不出来/)
  assert.match(String(result.message), /不覆盖坏文件/)
  assert.equal(readFileSync(path.join(dir, 'package.json'), 'utf8'), '{"name": "x", ')
})

// ── ⑤ 路由 ───────────────────────────────────────────────────────────

const LOOPBACK = { host: '127.0.0.1:19387', 'x-drc-pair': '1' }

function fakeRequest(options: { method: string; headers?: Record<string, string>; body?: string }): IncomingMessage {
  const listeners = new Map<string, Array<(chunk?: unknown) => void>>()
  const req = {
    method: options.method,
    url: '/',
    headers: options.headers ?? LOOPBACK,
    destroy: () => undefined,
    on: (event: string, handler: (chunk?: unknown) => void) => {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return req
    },
  } as unknown as IncomingMessage
  queueMicrotask(() => {
    if (options.body !== undefined) for (const handler of listeners.get('data') ?? []) handler(Buffer.from(options.body))
    for (const handler of listeners.get('end') ?? []) handler()
  })
  return req
}

function fakeResponse(): { res: ServerResponse; reply: () => { status: number; body: string } } {
  let status = 0
  let body = ''
  const res = {
    writeHead: (code: number) => {
      status = code
    },
    end: (chunk?: unknown) => {
      body = typeof chunk === 'string' ? chunk : ''
    },
    setHeader: () => undefined,
  } as unknown as ServerResponse
  return { res, reply: () => ({ status, body }) }
}

function routeDeps(profileDir: string, options: { runPnpm?: PnpmRunner } = {}): ExtensionsRouteDeps & { logs: string[] } {
  const logs: string[] = []
  const service = createExtensionsService({
    profileDir,
    log: (message) => void logs.push(message),
    runPnpm: options.runPnpm,
  })
  return {
    list: () => service.list(),
    act: (id, action) => service.act(id, action),
    log: (message) => void logs.push(message),
    logs,
  }
}

test('路由：GET 列表 / 守卫 / 方法 / 写路由要 x-drc-pair', async (t) => {
  const dir = makeProfile(t, {})
  const deps = routeDeps(dir)

  const ok = fakeResponse()
  extensionsListHandler(deps)(fakeRequest({ method: 'GET' }), ok.res)
  const okBody = JSON.parse(ok.reply().body) as { ok: boolean; extensions: Array<{ id: string; installed: boolean }> }
  assert.equal(ok.reply().status, 200)
  assert.equal(okBody.ok, true)
  assert.equal(okBody.extensions.length, EXTENSIONS.length)
  assert.equal(okBody.extensions[0]?.installed, false)

  // 非回环 Host
  const foreign = fakeResponse()
  extensionsListHandler(deps)(fakeRequest({ method: 'GET', headers: { host: '10.1.2.3:8080' } }), foreign.res)
  assert.equal(foreign.reply().status, 403)
  assert.match(JSON.parse(foreign.reply().body).message, /只接受本机回环请求/)

  // 方法不对
  const wrong = fakeResponse()
  extensionsListHandler(deps)(fakeRequest({ method: 'POST' }), wrong.res)
  assert.equal(wrong.reply().status, 405)
  assert.match(JSON.parse(wrong.reply().body).message, /只支持 GET/)

  // 写路由缺 x-drc-pair
  const action = extensionsActionHandler(deps)
  const noPair = fakeResponse()
  await action(fakeRequest({ method: 'POST', headers: { host: '127.0.0.1:19387' }, body: '{"id":"avatar","action":"enable"}' }), noPair.res)
  assert.equal(noPair.reply().status, 403)
  assert.match(JSON.parse(noPair.reply().body).message, /x-drc-pair/)

  // 写路由方法不对
  const getAction = fakeResponse()
  await action(fakeRequest({ method: 'GET' }), getAction.res)
  assert.equal(getAction.reply().status, 405)

  // 请求体坏了
  const badBody = fakeResponse()
  await action(fakeRequest({ method: 'POST', body: 'not json' }), badBody.res)
  assert.equal(badBody.reply().status, 400)
  assert.match(JSON.parse(badBody.reply().body).message, /请求体不对/)

  assert.match(EXTENSIONS_ROUTE, /extensions$/)
  assert.match(EXTENSIONS_ACTION_ROUTE, /extensions\/action$/)
})

test('路由：动作回执带最新整表；白名单外 / pnpm 失败都给中文原因并落日志', async (t) => {
  const dir = makeProfile(t, {})
  let pnpmRuns = 0
  const failing: PnpmRunner = async () => {
    pnpmRuns += 1
    return { ok: false, code: 1, message: 'pnpm 失败（退出码 1）：ERR_PNPM_NO_MATCHING_VERSION' }
  }
  const deps = routeDeps(dir, { runPnpm: failing })
  const action = extensionsActionHandler(deps)

  // 白名单外：ok:false + 中文原因 + 整表（界面靠它刷新）
  const illegal = fakeResponse()
  await action(fakeRequest({ method: 'POST', body: '{"id":"https://evil","action":"install"}' }), illegal.res)
  const illegalBody = JSON.parse(illegal.reply().body) as { ok: boolean; message: string; extensions: unknown[] }
  assert.equal(illegal.reply().status, 200, '业务失败是 200 + ok:false（不是 HTTP 错误）')
  assert.equal(illegalBody.ok, false)
  assert.match(illegalBody.message, /不在白名单里/)
  assert.equal(illegalBody.extensions.length, EXTENSIONS.length)
  assert.equal(pnpmRuns, 0)

  // pnpm 失败：原因带尾巴，profile 回滚后状态还是"未安装"
  const failed = fakeResponse()
  await action(fakeRequest({ method: 'POST', body: JSON.stringify({ id: 'avatar', action: 'install' }) }), failed.res)
  const failedBody = JSON.parse(failed.reply().body) as {
    ok: boolean
    message: string
    needsRestart: boolean
    extensions: Array<{ installed: boolean }>
  }
  assert.equal(failedBody.ok, false)
  assert.match(failedBody.message, /pnpm 失败/)
  assert.match(failedBody.message, /ERR_PNPM_NO_MATCHING_VERSION/)
  assert.equal(failedBody.needsRestart, false)
  assert.equal(failedBody.extensions[0]?.installed, false)
  assert.equal(deps.logs.some((line) => line.includes('pnpm 失败')), true, '失败必须落一行日志')

  // 成功路径：禁用 → 回执 changed/needsRestart，整表跟着变
  const enabledDir = makeProfile(t, { dependencies: { [PACKAGE]: PINNED }, bundles: [PACKAGE], installedVersion: '0.1.2' })
  const okDeps = routeDeps(enabledDir)
  const disabled = fakeResponse()
  await extensionsActionHandler(okDeps)(
    fakeRequest({ method: 'POST', body: JSON.stringify({ id: 'avatar', action: 'disable' }) }),
    disabled.res,
  )
  const disabledBody = JSON.parse(disabled.reply().body) as {
    ok: boolean
    changed: boolean
    needsRestart: boolean
    extensions: Array<{ id: string; installed: boolean; enabled: boolean; version?: string; needsRestart?: boolean }>
  }
  assert.equal(disabledBody.ok, true)
  assert.equal(disabledBody.changed, true)
  assert.equal(disabledBody.needsRestart, true)
  const row = disabledBody.extensions[0]!
  assert.equal(row.id, 'avatar')
  assert.equal(row.installed, true)
  assert.equal(row.enabled, false)
  assert.equal(row.version, '0.1.2')
})

test('路由：列表抛错回 500 + 中文原因（不把异常文本甩给前端）', () => {
  const deps: ExtensionsRouteDeps = {
    list: () => {
      throw new Error('disk exploded')
    },
    act: async () => ({ ok: true, changed: false, needsRestart: false }),
    log: () => undefined,
  }
  const res = fakeResponse()
  extensionsListHandler(deps)(fakeRequest({ method: 'GET' }), res.res)
  assert.equal(res.reply().status, 500)
  const body = JSON.parse(res.reply().body) as { ok: boolean; message: string; extensions: unknown[] }
  assert.equal(body.ok, false)
  assert.match(body.message, /读不出来/)
  assert.deepEqual(body.extensions, [])
})

// ── 纯工具 ───────────────────────────────────────────────────────────

test('pnpm 失败摘要：尾巴要够长够具体，超时也要说清', () => {
  const message = summarizePnpmFailure({
    code: 1,
    stderr: ['Progress: resolved 3', 'ERR_PNPM_GIT_UNKNOWN_ERROR', 'fatal: could not read from remote'].join('\n'),
  })
  assert.match(message, /退出码 1/)
  assert.match(message, /ERR_PNPM_GIT_UNKNOWN_ERROR/)
  assert.match(message, /could not read from remote/)

  const timeout = summarizePnpmFailure({ timedOut: true, stderr: 'stuck', timeoutMs: 300_000 })
  assert.match(timeout, /超时/)
  assert.match(timeout, /300s/)

  const empty = summarizePnpmFailure({ code: 2 })
  assert.match(empty, /没输出任何东西/)

  // 只保留最后几行：前面的噪声不许把尾巴挤掉
  const noisy = summarizePnpmFailure({ code: 1, stderr: Array.from({ length: 40 }, (_, index) => `line-${index}`).join('\n') })
  assert.equal(noisy.includes('line-0 '), false)
  assert.equal(noisy.includes('line-39'), true)
})

test('profile 与运行时目录的定位：环境变量说了算，猜不到就undefined', () => {
  assert.equal(resolveProfileDir({ DSH_PROFILE_DIR: 'C:\\p\\desktop' }, 'C:\\home\\.dsh'), 'C:\\p\\desktop')
  assert.equal(resolveProfileDir({ DSH_PROFILE: 'work' }, 'C:\\home\\.dsh'), path.join('C:\\home\\.dsh', 'profiles', 'work'))
  assert.equal(resolveProfileDir({}, 'C:\\home\\.dsh'), path.join('C:\\home\\.dsh', 'profiles', 'desktop'))

  const found = resolveRuntimeDir(
    { DSH_INSTALL_DIR: path.join('D:\\App', 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh') },
    { exists: (file) => file.endsWith(path.join('pnpm', 'bin', 'pnpm.mjs')) },
  )
  assert.equal(found, path.join('D:\\App', 'resources', 'runtime', 'primary-runtime'))

  assert.equal(resolveRuntimeDir({}, { exists: () => false }), undefined)
  assert.equal(resolveRuntimeDir({ DSH_RUNTIME_DIR: 'X:\\rt' }, { exists: (file) => String(file).startsWith('X:\\rt') }), 'X:\\rt')
})
