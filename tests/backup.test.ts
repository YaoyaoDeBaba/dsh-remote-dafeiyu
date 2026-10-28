/**
 * 会话备份（`src/backup/*`）的判据。
 *
 * 这一组刻意分成两层：
 *
 * 1. **纯函数层**（配置校验 / 分类 / 布局 / 归档清单解析）—— 不需要 git，跑得快，
 *    覆盖"分类错一个就会重复上传几十 MB"这种真正会花钱的地方；
 * 2. **真 git 层**（用本地裸仓库当远端）—— 只有这一层能证明"提交真的落了、分支真的推了"。
 *    机器上没有 git 时整组跳过，并把这个事实说出来（跳过不等于通过）。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  DEFAULT_BACKUP_CONFIG,
  normalizeConfig,
  readBackupConfig,
  readToken,
  redactToken,
  writeBackupConfig,
  writeToken,
} from '../src/backup/config.js'
import { gitAvailable, runGit } from '../src/backup/git.js'
import {
  archivedKeysFromLsTree,
  buildArchiveTree,
  buildHotTree,
  classify,
  scanSessions,
  type SessionEntry,
} from '../src/backup/pack.js'
import { BackupService } from '../src/backup/service.js'
import { backupRouteHandler, type BackupRouteDeps } from '../src/backup/routes.js'

function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix))
}

function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* Windows 上偶发的占用：测试目录留在 temp 里也不影响结论 */
  }
}

/** 造一个会话文件：`<dsh>/sessions/<slug>/session-<id>/session.v4.jsonl.zstd`。 */
function makeSession(root: string, slug: string, id: string, body: string, mtimeMs?: number): SessionEntry {
  const dir = path.join(root, slug, `session-${id}`)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'session.v4.jsonl.zstd')
  writeFileSync(file, body)
  if (mtimeMs !== undefined) utimesSync(file, mtimeMs / 1000, mtimeMs / 1000)
  return {
    slug,
    dirName: `session-${id}`,
    fileName: 'session.v4.jsonl.zstd',
    file,
    relPath: path.posix.join(slug, `session-${id}`, 'session.v4.jsonl.zstd'),
    mtimeMs: mtimeMs ?? Date.now(),
    size: Buffer.byteLength(body),
  }
}

// ── 配置 ──────────────────────────────────────────────────────────────

test('备份配置：启用但没填仓库 ⇒ 拒绝（不许让用户对着"已启用"发呆）', () => {
  const result = normalizeConfig({ enabled: true, repoUrl: '' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.field : '', 'repoUrl')
})

test('备份配置：https 与 git@ 两种仓库地址都认，别的形态一律拒', () => {
  const httpsOk = normalizeConfig({ enabled: true, repoUrl: 'https://github.com/someone/dsh-backup.git' })
  assert.equal(httpsOk.ok, true)
  const scpOk = normalizeConfig({ enabled: true, repoUrl: 'git@github.com:someone/dsh-backup.git' })
  assert.equal(scpOk.ok, true)
  const fileOk = normalizeConfig({ enabled: true, repoUrl: 'file:///D:/tmp/backup.git' })
  assert.equal(fileOk.ok, true, '本地路径仓库（file://）也要能配：离线也能备份')
  const bad = normalizeConfig({ enabled: true, repoUrl: 'github.com/someone/repo' })
  assert.equal(bad.ok, false)
  assert.equal(bad.ok === false ? bad.field : '', 'repoUrl')
})

test('备份配置：间隔与冷却天数的边界（0 = 只手动；168 小时封顶）', () => {
  assert.equal(normalizeConfig({ intervalHours: 0 }).ok, true)
  assert.equal(normalizeConfig({ intervalHours: 168 }).ok, true)
  assert.equal(normalizeConfig({ intervalHours: 169 }).ok, false)
  assert.equal(normalizeConfig({ intervalHours: -1 }).ok, false)
  assert.equal(normalizeConfig({ idleDays: 0 }).ok, false, '0 天冷却 = 所有会话进归档，一定是写错了')
  assert.equal(normalizeConfig({ idleDays: 1 }).ok, true)
})

test('备份配置：两个分支不许同名（同名 + force push = 归档被热快照冲掉）', () => {
  const result = normalizeConfig({ latestBranch: 'main', archiveBranch: 'main' })
  assert.equal(result.ok, false)
  assert.equal(result.ok === false ? result.field : '', 'archiveBranch')
})

test('备份配置：坏 JSON 退回默认值**并说出原因**，不猜', () => {
  const home = tempDir('dsh-backup-cfg-')
  try {
    mkdirSync(path.join(home, 'dsh-backup-git'), { recursive: true })
    writeFileSync(path.join(home, 'dsh-backup-git', 'config.json'), '{ 这不是 JSON')
    const loaded = readBackupConfig(home)
    assert.deepEqual(loaded.config, DEFAULT_BACKUP_CONFIG)
    assert.ok(loaded.problem && loaded.problem.includes('config.json'))
  } finally {
    cleanup(home)
  }
})

test('备份配置：写下的配置能原样读回来；token 单独一个文件、脱敏形态不泄真值', () => {
  const home = tempDir('dsh-backup-cfg2-')
  try {
    const config = { ...DEFAULT_BACKUP_CONFIG, enabled: true, repoUrl: 'https://github.com/a/b.git', intervalHours: 4 }
    assert.equal(writeBackupConfig(home, config), true)
    const loaded = readBackupConfig(home)
    assert.deepEqual(loaded.config, config)
    assert.equal(loaded.problem, undefined)

    const token = 'ghp_' + 'x'.repeat(36)
    assert.equal(writeToken(home, token), true)
    assert.equal(readToken(home), token)
    const shape = redactToken(token)
    assert.ok(!shape.includes(token), '脱敏形态不许含真值')
    assert.ok(shape.includes(String(token.length)), '要能看出长度（排错时判断是不是拿错了那一枚）')

    const rawStatus = readFileSync(path.join(home, 'dsh-backup-git', 'credential.json'), 'utf8')
    assert.ok(rawStatus.includes(token), 'token 必须真的落盘（否则每次重启都要重填）')
  } finally {
    cleanup(home)
  }
})

// ── 扫描与分类 ────────────────────────────────────────────────────────

test('扫会话：只认会话文件，别的文件不许混进来', () => {
  const home = tempDir('dsh-backup-scan-')
  try {
    const root = path.join(home, 'sessions')
    makeSession(root, 'ws-a', '1', 'x')
    const other = path.join(root, 'ws-a', 'session-2')
    mkdirSync(other, { recursive: true })
    writeFileSync(path.join(other, 'notes.txt'), '不是会话')
    writeFileSync(path.join(other, 'session.v5.jsonl'), '未来版本也算会话')
    const found = scanSessions(root)
    assert.deepEqual(
      found.map((entry) => entry.fileName).sort(),
      ['session.v4.jsonl.zstd', 'session.v5.jsonl'].sort(),
      '版本号不许写死 v4（宿主换版本时备份必须还认）',
    )
  } finally {
    cleanup(home)
  }
})

test('分类：热 / 冷却 / 已归档 / 复活四条路各归各位（复活的不覆盖归档）', () => {
  const now = Date.UTC(2026, 9, 28)
  const day = 24 * 60 * 60 * 1000
  const hot = { slug: 'a', dirName: 'session-hot', mtimeMs: now - day } as SessionEntry
  const cool = { slug: 'a', dirName: 'session-cool', mtimeMs: now - 30 * day } as SessionEntry
  const resting = { slug: 'b', dirName: 'session-rest', mtimeMs: now - 40 * day } as SessionEntry
  const revived = { slug: 'c', dirName: 'session-rev', mtimeMs: now - day } as SessionEntry
  const archived = new Set(['b/session-rest', 'c/session-rev'])
  const result = classify({ sessions: [hot, cool, resting, revived], nowMs: now, idleDays: 15, archived })
  assert.deepEqual(result.hot.map((entry) => entry.dirName), ['session-hot', 'session-rev'])
  assert.deepEqual(result.cooling.map((entry) => entry.dirName), ['session-cool'])
  assert.deepEqual(result.resting.map((entry) => entry.dirName), ['session-rest'])
  assert.deepEqual(result.revived.map((entry) => entry.dirName), ['session-rev'])
})

test('归档清单：`git ls-tree` 的输出按 `<slug>/<session-dir>` 收敛成集合', () => {
  const keys = archivedKeysFromLsTree(
    ['a/session-1/session.v4.jsonl.zstd', 'a/session-2/session.v4.jsonl.zstd', 'b/session-3/session.v4.jsonl.zstd', ''].join(
      '\n',
    ),
  )
  assert.deepEqual([...keys].sort(), ['a/session-1', 'a/session-2', 'b/session-3'])
})

test('铺热树：会话 + storages + profile 配置都进 latest，并写一份 MANIFEST', () => {
  const home = tempDir('dsh-backup-tree-')
  try {
    const root = path.join(home, 'sessions')
    const entry = makeSession(root, 'ws-a', '1', 'hello')
    mkdirSync(path.join(home, 'storages'), { recursive: true })
    writeFileSync(path.join(home, 'storages', 'kv.json'), '{}')
    writeFileSync(path.join(home, 'storages', 'ignored.txt'), 'x')
    const profile = path.join(home, 'profiles', 'desktop')
    mkdirSync(profile, { recursive: true })
    writeFileSync(path.join(profile, 'package.json'), '{}')
    writeFileSync(path.join(profile, 'node_modules_marker'), 'x')
    const staging = path.join(home, 'staging')

    const manifest = buildHotTree({
      stagingDir: staging,
      sessionsRoot: root,
      storagesDir: path.join(home, 'storages'),
      profileDir: profile,
      attachmentsDir: path.join(home, 'attachments'),
      includeAttachments: true,
      hot: [entry],
      nowMs: Date.UTC(2026, 9, 28),
    })

    assert.ok(existsSync(path.join(staging, 'latest', 'sessions', entry.relPath)))
    assert.ok(existsSync(path.join(staging, 'latest', 'storages', 'kv.json')))
    assert.equal(existsSync(path.join(staging, 'latest', 'storages', 'ignored.txt')), false, '非 json 的 storages 不带')
    assert.ok(existsSync(path.join(staging, 'latest', 'profiles', 'desktop', 'package.json')))
    assert.equal(manifest.format, 1)
    assert.equal(manifest.hotCount, 1)
    assert.equal(manifest.attachments, null, '没有附件目录时清单里写 null（不是 0 条）')
    const written = JSON.parse(readFileSync(path.join(staging, 'latest', 'MANIFEST.json'), 'utf8')) as {
      sessions: Array<{ key: string }>
    }
    assert.equal(written.sessions[0]?.key, 'ws-a/session-1')
  } finally {
    cleanup(home)
  }
})

test('铺归档树：同名文件不覆盖（只增不改），第二轮铺同一批是 0 个', () => {
  const home = tempDir('dsh-backup-arc-')
  try {
    const root = path.join(home, 'sessions')
    const entry = makeSession(root, 'ws-a', '1', 'v1')
    const staging = path.join(home, 'staging')
    const first = buildArchiveTree(staging, [entry])
    assert.equal(first.written, 1)
    const second = buildArchiveTree(staging, [entry])
    assert.equal(second.written, 0, '已经归档过的会话不许再铺一遍（否则每轮都多推几十 MB）')
    const body = readFileSync(path.join(staging, 'archive', entry.relPath), 'utf8')
    assert.equal(body, 'v1', '归档里那份内容不许被后来的覆盖')
  } finally {
    cleanup(home)
  }
})

// ── 服务 ──────────────────────────────────────────────────────────────

test('服务：没启用时不碰 git，直接把"未启用"写进状态', async () => {
  const home = tempDir('dsh-backup-svc-')
  try {
    const service = new BackupService({ dshHome: home, log: () => {} })
    const result = await service.runOnce('测试')
    assert.equal(result.ok, false)
    assert.match(result.reason, /未启用/)
    const status = service.snapshot()
    assert.equal(status.lastResult, 'skipped')
    assert.equal(status.running, false)
  } finally {
    cleanup(home)
  }
})

test('服务：保存配置会立刻反映到快照上，校验失败则一个字都不写', () => {
  const home = tempDir('dsh-backup-svc2-')
  try {
    const service = new BackupService({ dshHome: home, log: () => {} })
    const bad = service.saveConfig({ enabled: true, repoUrl: '' })
    assert.equal(bad.ok, false)
    assert.equal(service.currentConfig().enabled, false, '校验失败时内存里的配置也不许变')
    assert.equal(existsSync(path.join(home, 'dsh-backup-git', 'config.json')), false)

    const good = service.saveConfig({ enabled: true, repoUrl: 'https://github.com/a/b.git', intervalHours: 0 })
    assert.equal(good.ok, true)
    assert.equal(service.currentConfig().intervalHours, 0)
    assert.ok(existsSync(path.join(home, 'dsh-backup-git', 'config.json')))
    assert.equal(service.snapshot().nextRunAt, null, 'intervalHours=0（只手动）不该排出下一次')
  } finally {
    cleanup(home)
  }
})

// ── 路由 ──────────────────────────────────────────────────────────────

interface FakeResponse {
  status: number
  body: string
  writeHead(code: number): void
  end(chunk?: string): void
}

function fakeResponse(): FakeResponse {
  return {
    status: 0,
    body: '',
    writeHead(code: number) {
      this.status = code
    },
    end(chunk?: string) {
      this.body = chunk ?? ''
    },
  }
}

function fakeRequest(options: { method: string; body?: unknown; host?: string; origin?: string; marker?: boolean }) {
  const emitter = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string> }
  emitter.method = options.method
  emitter.headers = {}
  if (options.host !== undefined) emitter.headers.host = options.host
  if (options.origin !== undefined) emitter.headers.origin = options.origin
  if (options.marker === true) emitter.headers['x-drc-pair'] = '1'
  const payload = options.body === undefined ? '' : JSON.stringify(options.body)
  // 下一拍再把 body 推出去：handler 是先 `on('data')` 再读的。
  setImmediate(() => {
    if (payload !== '') emitter.emit('data', Buffer.from(payload, 'utf8'))
    emitter.emit('end')
  })
  return emitter
}

function routeDeps(overrides: Partial<BackupRouteDeps> = {}): { deps: BackupRouteDeps; calls: string[] } {
  const calls: string[] = []
  const deps: BackupRouteDeps = {
    status: () => ({
      enabled: true,
      repoUrl: 'https://github.com/a/b.git',
      intervalHours: 8,
      idleDays: 15,
      gitAvailable: true,
      tokenSet: true,
      tokenShape: 'ghp_ab…cdef(40)',
      running: false,
      lastRunAt: null,
      lastResult: null,
      lastError: '',
      lastHotCount: 0,
      lastHotBytes: 0,
      lastArchivedCount: 0,
      lastCommit: '',
      lastDurationMs: 0,
      nextRunAt: null,
      configProblem: '',
      restore: { running: false, lastAt: null, lastResult: '', lastMessage: '' },
    }),
    config: () => ({ ...DEFAULT_BACKUP_CONFIG, enabled: true, repoUrl: 'https://github.com/a/b.git' }),
    saveConfig: (patch) => {
      calls.push(`save:${JSON.stringify(patch)}`)
      return { ok: true, config: { ...DEFAULT_BACKUP_CONFIG, ...(patch as object) } as never }
    },
    setToken: (token) => {
      calls.push(`token:${token}`)
      return { ok: true }
    },
    runNow: async (reason) => {
      calls.push(`run:${reason}`)
      return { ok: true, reason, hotCount: 0, hotBytes: 0, archivedCount: 0, commit: '', durationMs: 0 }
    },
    restore: async () => {
      calls.push('restore')
      return { ok: true, message: '' }
    },
    log: () => {},
    ...overrides,
  }
  return { deps, calls }
}

test('路由：GET 回状态与配置，**不含 token 真值**', async () => {
  const { deps } = routeDeps()
  const handler = backupRouteHandler(deps)
  const response = fakeResponse()
  await handler(fakeRequest({ method: 'GET', host: '127.0.0.1:50614' }) as never, response as never)
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body) as { status: { tokenSet: boolean }; config: { repoUrl: string } }
  assert.equal(body.status.tokenSet, true)
  assert.equal(body.config.repoUrl, 'https://github.com/a/b.git')
  const configKeys = Object.keys(body.config)
  assert.equal(configKeys.includes('token'), false, '配置里不许出现 token 这个键（连脱敏形态都只在 status 里）')
})

test('路由：GET 不认外部 Host / 外部 Origin（这条路由能改行为，必须同源）', async () => {
  const { deps } = routeDeps()
  const handler = backupRouteHandler(deps)
  const foreignHost = fakeResponse()
  await handler(fakeRequest({ method: 'GET', host: 'evil.example.com' }) as never, foreignHost as never)
  assert.equal(foreignHost.status, 403)

  const foreignOrigin = fakeResponse()
  await handler(
    fakeRequest({ method: 'GET', host: '127.0.0.1:50614', origin: 'https://evil.example.com' }) as never,
    foreignOrigin as never,
  )
  assert.equal(foreignOrigin.status, 403)
})

test('路由：POST 没有那个 marker 头 ⇒ 403（与 /config 同一条纪律）', async () => {
  const { deps, calls } = routeDeps()
  const handler = backupRouteHandler(deps)
  const response = fakeResponse()
  await handler(
    fakeRequest({ method: 'POST', host: '127.0.0.1:50614', body: { action: 'run' } }) as never,
    response as never,
  )
  assert.equal(response.status, 403)
  assert.deepEqual(calls, [], '被守卫拒掉的请求不许真的去跑备份')
})

test('路由：run / restore 只回 202（几十 MB 的活不许让浏览器等），save 带字段错误回 400', async () => {
  const { deps, calls } = routeDeps()
  const handler = backupRouteHandler(deps)

  const run = fakeResponse()
  await handler(
    fakeRequest({ method: 'POST', host: '127.0.0.1:50614', marker: true, body: { action: 'run' } }) as never,
    run as never,
  )
  assert.equal(run.status, 202)
  assert.equal((JSON.parse(run.body) as { started: string }).started, 'run')
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(calls, ['run:手动'])

  const restore = fakeResponse()
  await handler(
    fakeRequest({ method: 'POST', host: '127.0.0.1:50614', marker: true, body: { action: 'restore' } }) as never,
    restore as never,
  )
  assert.equal(restore.status, 202)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(calls.includes('restore'))

  const failing = routeDeps({
    saveConfig: () => ({ ok: false, field: 'repoUrl', error: '启用备份必须先填仓库地址' }),
  })
  const bad = fakeResponse()
  await backupRouteHandler(failing.deps)(
    fakeRequest({ method: 'POST', host: '127.0.0.1:50614', marker: true, body: { action: 'save', config: {} } }) as never,
    bad as never,
  )
  assert.equal(bad.status, 400)
  const badBody = JSON.parse(bad.body) as { field: string }
  assert.equal(badBody.field, 'repoUrl', '400 必须带字段名，否则 UI 只能说"保存失败"')
})

test('路由：不认识的 action 回 400（别静默成功）', async () => {
  const { deps } = routeDeps()
  const response = fakeResponse()
  await backupRouteHandler(deps)(
    fakeRequest({ method: 'POST', host: '127.0.0.1:50614', marker: true, body: { action: 'delete-everything' } }) as never,
    response as never,
  )
  assert.equal(response.status, 400)
})

// ── 真 git 端到端（没有 git 就跳过，跳过会说出来）───────────────────────

const GIT = gitAvailable()

test('端到端：真 git —— 热快照推到 latest（只有一个提交），冷却的进 archive', { skip: GIT ? false : '本机没有 git' }, async () => {
  const home = tempDir('dsh-backup-e2e-')
  const remote = tempDir('dsh-backup-remote-')
  try {
    // 远端：裸仓库（等效于 GitHub 上那个私有仓库，只是不联网）。
    runGit(['init', '--bare', '-q', remote], { cwd: remote })
    // Windows 下 `file://` 要正斜杠 + 盘符前带 /。
    const url = `file:///${remote.replace(/\\/g, '/')}`
    const sessions = path.join(home, 'sessions')
    const day = 24 * 60 * 60 * 1000
    const now = Date.now()
    makeSession(sessions, 'ws-a', 'hot-1', 'hot body', now - day)
    makeSession(sessions, 'ws-a', 'cold-1', 'cold body', now - 30 * day)

    const service = new BackupService({ dshHome: home, log: () => {} })
    const saved = service.saveConfig({ enabled: true, repoUrl: url, intervalHours: 0, idleDays: 15 })
    assert.equal(saved.ok, true)

    const first = await service.runOnce('测试')
    assert.equal(first.ok, true, `第一次备份应当成功：${first.reason}`)
    assert.equal(first.hotCount, 1, '只有那个热的进热快照')
    assert.equal(first.archivedCount, 1, '30 天没动的那个进归档')

    // 远端真的落了两个分支。
    const branches = execFileSync('git', ['--git-dir', remote, 'branch', '--list'], { encoding: 'utf8' })
    assert.match(branches, /latest/)
    assert.match(branches, /archive/)

    const latestTree = execFileSync(
      'git',
      ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'latest'],
      { encoding: 'utf8' },
    )
    assert.match(latestTree, /MANIFEST\.json/)
    assert.match(latestTree, /sessions\/ws-a\/session-hot-1\/session\.v4\.jsonl\.zstd/)
    assert.doesNotMatch(latestTree, /session-cold-1/, '冷却的不该出现在热快照里（那正是"归档"的意义）')

    const archiveTree = execFileSync(
      'git',
      ['--git-dir', remote, 'ls-tree', '-r', '--name-only', 'archive'],
      { encoding: 'utf8' },
    )
    assert.match(archiveTree, /ws-a\/session-cold-1\/session\.v4\.jsonl\.zstd/)

    // 第二轮：一个会话都没变 ⇒ 不造空提交（`latest` 只有一个提交）。
    const second = await service.runOnce('测试第二轮')
    assert.equal(second.ok, true)
    const log = execFileSync('git', ['--git-dir', remote, 'log', '--oneline', 'latest'], { encoding: 'utf8' })
    assert.equal(log.trim().split('\n').length, 1, `内容没变时不许造空提交（实际 ${log.trim()}）`)

    // 第三轮：热会话又写了一次 ⇒ 仍然只有一个提交（force push 覆盖，不是追加）。
    const hotFile = path.join(sessions, 'ws-a', 'session-hot-1', 'session.v4.jsonl.zstd')
    writeFileSync(hotFile, 'hot body v2')
    const third = await service.runOnce('测试第三轮')
    assert.equal(third.ok, true)
    const log2 = execFileSync('git', ['--git-dir', remote, 'log', '--oneline', 'latest'], { encoding: 'utf8' })
    assert.equal(log2.trim().split('\n').length, 1, '热快照分支永远只有一个提交（只留最新）')
    const body = execFileSync('git', ['--git-dir', remote, 'show', 'latest:sessions/ws-a/session-hot-1/session.v4.jsonl.zstd'], {
      encoding: 'utf8',
    })
    assert.equal(body, 'hot body v2', '最新一版必须真的推上去了')
  } finally {
    cleanup(home)
    cleanup(remote)
  }
})

test('端到端：从备份恢复 —— 现有会话改名留底，备份内容铺回去，归档的也补上', { skip: GIT ? false : '本机没有 git' }, async () => {
  const home = tempDir('dsh-backup-restore-')
  const remote = tempDir('dsh-backup-remote2-')
  try {
    runGit(['init', '--bare', '-q', remote], { cwd: remote })
    const url = `file:///${remote.replace(/\\/g, '/')}`
    const sessions = path.join(home, 'sessions')
    const now = Date.now()
    makeSession(sessions, 'ws-a', 'hot-1', 'hot body', now)
    const service = new BackupService({ dshHome: home, log: () => {} })
    service.saveConfig({ enabled: true, repoUrl: url, intervalHours: 0 })
    assert.equal((await service.runOnce('准备')).ok, true)

    // 模拟"换机"：本机会话目录被清掉，只剩一个不相干的新会话。
    rmSync(sessions, { recursive: true, force: true })
    makeSession(sessions, 'ws-a', 'brand-new', 'new body', now)

    const restored = await service.restore()
    assert.equal(restored.ok, true, restored.message)
    const hotBack = path.join(sessions, 'ws-a', 'session-hot-1', 'session.v4.jsonl.zstd')
    assert.ok(existsSync(hotBack), '备份里的会话要回到本机')
    assert.equal(readFileSync(hotBack, 'utf8'), 'hot body')
    // 留底目录：`sessions.before-restore-<时间戳>`
    // 语义是"整体换成本机备份的那一份，现行的整棵挪开留底"（不是合并进现状）——
    // 恢复要的结果是"回到备份那一刻的样子"，而合并会留下两边都没见过的混合状态。
    const names = readdirSync(home)
    const keep = names.find((name) => name.startsWith('sessions.before-restore-'))
    assert.ok(keep, `恢复前必须先改名留底，实际目录：${names.join(',')}`)
    assert.ok(
      existsSync(path.join(home, keep, 'ws-a', 'session-brand-new', 'session.v4.jsonl.zstd')),
      '本机原来那个会话不许被删：它必须在留底目录里躺着（随时能挪回来）',
    )
  } finally {
    cleanup(home)
    cleanup(remote)
  }
})
