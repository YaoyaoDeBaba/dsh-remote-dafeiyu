/**
 * skills-install.test —— 「内置 skill 铺到用户目录」那套逻辑。
 *
 * ## 这个文件是从 `tests/sprite-skill.test.ts` 拆出来的（2026-11-16）
 *
 * 序列帧那一整块（含它自己的 skill 与安装器）搬去 `dsh-dev-kit-dafeiyu`，那份测试跟着走了。
 * **但批量安装器不是序列帧的私产**：它按约定认 `assets/skills/<name>/SKILL.md`，把本包
 * 的**全部**内置 skill 铺开——本包现在还剩 `dafeiyu-plugin-dev`。所以下面这三条判据
 * （认目录不认名字 / 幂等判据是内容指纹 / 随包目录名与 frontmatter 一致）原样留下，
 * 只把 import 从 `src/sprite/skill.ts` 换成 `src/skills/install.ts`。
 *
 * 删掉的是与序列帧强绑定的那几条（SKILL.md 的 frontmatter、`references/` 死链、
 * `sprite_guide` 正文一致性）——那些判据的对象已经不在这里了。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installBundledSkills, installPackagedSkills, packageRoot } from '../src/skills/install.js'

/**
 * 随包的那次安装（`installPackagedSkills`）必须**真能找到 assets**。
 *
 * 这条是给一个具体事故写的：`packageRoot()` 一开始写成固定的"往上两级"，
 * 这只在**打包后**（`dist/bundle/index.js`）成立；未打包时模块在 `dist/src/skills/` 里，
 * 指到的是 `dist/` —— 于是安装器读到 `dist/assets/skills`（不存在），
 * 静默返回 `missing-asset`，用户目录里的 `dafeiyu-plugin-dev` 从此不再更新。
 * 症状极隐蔽：**一条 error 都没有**（安装失败只写一行 log）。
 */
test('随包安装：packageRoot 认得出包根，installPackagedSkills 真的铺出 dafeiyu-plugin-dev', () => {
  const root = packageRoot()
  assert.ok(existsSync(path.join(root, 'package.json')), `packageRoot 指到了不认识的地方：${root}`)
  assert.ok(existsSync(path.join(root, 'assets', 'skills')), `packageRoot 下没有 assets/skills：${root}`)

  const home = mkdtempSync(path.join(tmpdir(), 'drc-packaged-skills-'))
  try {
    const result = installPackagedSkills({ dshHome: home, log: () => {} })
    assert.ok(result.ok, `随包安装失败：${result.reason ?? 'unknown'}`)
    assert.ok(
      result.installed.includes('dafeiyu-plugin-dev'),
      `本包还剩的那份开发规范 skill 没铺开（实际：${result.installed.join(', ') || '（空）'}）`,
    )
    assert.ok(
      existsSync(path.join(home, 'skills', 'dafeiyu-plugin-dev', 'SKILL.md')),
      '铺开之后 <dshHome>/skills/dafeiyu-plugin-dev/SKILL.md 必须存在',
    )
    // 序列帧那份**不该**再被本包铺（它随 dsh-dev-kit-dafeiyu 走了，那边有自己的安装器）
    assert.ok(
      !result.installed.includes('dafeiyu-sprite'),
      `dafeiyu-sprite 已随 dev-kit 迁出，本包不该再铺它（实际：${result.installed.join(', ')}）`,
    )
    // 幂等：第二次内容没变 ⇒ 什么都不装
    assert.deepEqual(installPackagedSkills({ dshHome: home, log: () => {} }).installed, [], '第二次不该重铺')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})


test('整批安装：assets/skills 下的每个 SKILL.md 都会铺开，没有 SKILL.md 的目录跳过', () => {
  // 2026-11-13 起这个插件会有多个 skill（工具指南 + 开发规范…），安装器必须认目录而不是认名字。
  const root = mkdtempSync(path.join(tmpdir(), 'drc-skills-'))
  const home = mkdtempSync(path.join(tmpdir(), 'drc-skills-home-'))
  try {
    for (const name of ['alpha-skill', 'beta-skill']) {
      mkdirSync(path.join(root, name, 'references'), { recursive: true })
      writeFileSync(path.join(root, name, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\nbody\n`, 'utf8')
      writeFileSync(path.join(root, name, 'references', 'x.md'), 'x', 'utf8')
    }
    // 没有 SKILL.md 的目录不该被当成 skill
    mkdirSync(path.join(root, 'not-a-skill'), { recursive: true })
    const result = installBundledSkills({ dshHome: home, assetsRoot: root, version: '2.0.0', log: () => {} })
    assert.ok(result.ok, result.reason ?? 'installBundledSkills 失败')
    assert.deepEqual([...result.installed].sort(), ['alpha-skill', 'beta-skill'])
    assert.ok(existsSync(path.join(home, 'skills', 'alpha-skill', 'references', 'x.md')))
    assert.ok(existsSync(path.join(home, 'skills', 'beta-skill', 'SKILL.md')))
    assert.equal(existsSync(path.join(home, 'skills', 'not-a-skill')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('整批安装幂等判据是内容指纹，不是版本号（改文档不必发版）', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'drc-skills2-'))
  const home = mkdtempSync(path.join(tmpdir(), 'drc-skills2-home-'))
  try {
    mkdirSync(path.join(root, 'alpha'), { recursive: true })
    writeFileSync(path.join(root, 'alpha', 'SKILL.md'), 'a', 'utf8')
    assert.deepEqual(installBundledSkills({ dshHome: home, assetsRoot: root, version: '1', log: () => {} }).installed, ['alpha'])
    // 内容没变：不管版本号动不动都不重铺
    assert.deepEqual(installBundledSkills({ dshHome: home, assetsRoot: root, version: '1', log: () => {} }).installed, [])
    assert.deepEqual(installBundledSkills({ dshHome: home, assetsRoot: root, version: '2', log: () => {} }).installed, [], '只改版本号不该重铺')
    // 内容变了：即使版本号不变也要重铺（否则"改个错别字还得发一版"）
    writeFileSync(path.join(root, 'alpha', 'SKILL.md'), 'a-much-longer-body', 'utf8')
    assert.deepEqual(installBundledSkills({ dshHome: home, assetsRoot: root, version: '2', log: () => {} }).installed, ['alpha'])
    assert.equal(readFileSync(path.join(home, 'skills', 'alpha', 'SKILL.md'), 'utf8'), 'a-much-longer-body')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('随包的真实 skills 目录里，每份 SKILL.md 的 name 都等于目录名', () => {
  // 名字和目录不一致 = 模型按目录名加载会失败；这条防的是"新建 skill 时复制粘贴忘改名"。
  // ⚠️ 2026-11-16 之后这个目录里只剩 `dafeiyu-plugin-dev`（`dafeiyu-sprite` 随包走了），
  // 判据本身不看具体名字，所以不用改——它仍然在防"下一份 skill 复制粘贴忘改名"。
  const skillsRoot = fileURLToPath(new URL('../../assets/skills', import.meta.url))
  const dirs = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  assert.ok(dirs.length > 0, `assets/skills 下至少该有一份随包 skill（实际 ${dirs.length} 个目录）`)
  for (const dir of dirs) {
    const skillFile = path.join(skillsRoot, dir.name, 'SKILL.md')
    if (!existsSync(skillFile)) continue
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(skillFile, 'utf8'))?.[1] ?? ''
    const name = /^name:\s*(.+)$/m.exec(front)?.[1]?.trim()
    assert.equal(name, dir.name, `${dir.name}/SKILL.md 的 name 与目录名不一致`)
  }
})
