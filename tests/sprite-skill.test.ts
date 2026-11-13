/**
 * sprite-skill.test —— 指南落成 DSH skill 的那套逻辑。
 *
 * 为什么钉它：指南曾经有三份（系统提示短版 / sprite_guide 长版 / docs 里的 md），
 * 每改一次就漂一次。现在唯一真源是 `assets/skills/dafeiyu-sprite/SKILL.md`，
 * 下面这几条保证：① 真源格式能被 skill 目录认（frontmatter 合法、描述不超上限）；
 * ② 铺到用户目录是幂等的；③ `sprite_guide` 读到的正文与真源一致（去掉 frontmatter）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installSpriteSkill,
  readSpriteSkillBody,
  resetSpriteSkillCache,
  SPRITE_SKILL_NAME,
} from '../src/sprite/skill.js'
import { SPRITE_GUIDE } from '../src/sprite/guide.js'

/** 仓库里的真源：由 dist/tests/ 往上两级定位，不依赖 cwd。 */
const ASSETS = fileURLToPath(new URL('../../assets/skills/' + SPRITE_SKILL_NAME, import.meta.url))

test('SKILL.md 的 frontmatter 符合 skill 目录要求：kebab-case 名字 + 有描述且不超 500 字', () => {
  const raw = readFileSync(path.join(ASSETS, 'SKILL.md'), 'utf8')
  const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(raw)
  assert.ok(matched, 'SKILL.md 必须以 YAML frontmatter 开头')
  const front = matched![1]!
  const name = /^name:\s*(.+)$/m.exec(front)?.[1]?.trim()
  const description = /^description:\s*(.+)$/m.exec(front)?.[1]?.trim()
  assert.equal(name, SPRITE_SKILL_NAME, 'name 必须与目录名一致（kebab-case）')
  assert.match(name!, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name 必须是 kebab-case')
  assert.ok(description && description.length > 0, 'description 必填')
  assert.ok(description!.length <= 500, `description 不能超过 500 字（实际 ${description!.length}）`)
})

test('references 目录真的存在（正文里引用了它们，缺了就是死链）', () => {
  const refs = ['tools.md', 'params.md', 'symptoms.md', 'coordinates.md']
  for (const name of refs) {
    assert.ok(existsSync(path.join(ASSETS, 'references', name)), `缺少 references/${name}`)
    // 正文必须真的链接到它，否则模型不知道有这份
    const body = readFileSync(path.join(ASSETS, 'SKILL.md'), 'utf8')
    assert.ok(body.includes(`references/${name}`), `SKILL.md 没有引用 references/${name}`)
  }
})

test('铺 skill：整份复制到 <dshHome>/skills/<name>/ 并写版本标记', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'drc-skill-'))
  try {
    const result = installSpriteSkill({ dshHome: home, assetsRoot: ASSETS, version: '9.9.9', log: () => {} })
    assert.ok(result.ok, result.reason ?? 'installSpriteSkill 失败')
    const target = path.join(home, 'skills', SPRITE_SKILL_NAME)
    assert.equal(result.path, target)
    assert.ok(existsSync(path.join(target, 'SKILL.md')), 'SKILL.md 没铺过去')
    assert.ok(existsSync(path.join(target, 'references', 'tools.md')), 'references 没铺过去')
    assert.equal(readFileSync(path.join(target, '.dafeiyu-skill-version'), 'utf8').trim(), '9.9.9')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('铺 skill 幂等：同版本不重复复制（升级才重铺）', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'drc-skill2-'))
  try {
    const first = installSpriteSkill({ dshHome: home, assetsRoot: ASSETS, version: '1.0.0', log: () => {} })
    assert.equal(first.ok, true)
    const target = path.join(home, 'skills', SPRITE_SKILL_NAME)
    // 手动改内容，模拟"用户/旧版本留下的痕迹"
    writeFileSync(path.join(target, 'SKILL.md'), 'tampered', 'utf8')
    const second = installSpriteSkill({ dshHome: home, assetsRoot: ASSETS, version: '1.0.0', log: () => {} })
    assert.equal(second.ok, true)
    assert.equal(readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'tampered', '同版本不该覆盖')
    // 版本变了 → 整份重铺（避免 SKILL.md 换了但 references 还是老的）
    const third = installSpriteSkill({ dshHome: home, assetsRoot: ASSETS, version: '1.0.1', log: () => {} })
    assert.equal(third.ok, true)
    assert.ok(readFileSync(path.join(target, 'SKILL.md'), 'utf8').includes('序列帧精灵图'), '升级必须重铺')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('素材缺失时不抛，返回明确原因（写进 probe，别静默）', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'drc-skill3-'))
  try {
    const result = installSpriteSkill({ dshHome: home, assetsRoot: path.join(home, 'nope'), version: '1', log: () => {} })
    assert.equal(result.ok, false)
    assert.match(String(result.reason), /missing-asset/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('sprite_guide 的正文 = SKILL.md 去掉 frontmatter', () => {
  resetSpriteSkillCache()
  const body = readSpriteSkillBody(ASSETS)
  const raw = readFileSync(path.join(ASSETS, 'SKILL.md'), 'utf8')
  assert.ok(!body.startsWith('---'), '正文里不该带 YAML frontmatter')
  assert.ok(body.length > 500, '正文不该是空的/过短的')
  assert.ok(raw.includes(body.slice(0, 40)), '正文必须真的来自 SKILL.md')
})

test('读不到 SKILL.md 时退回内置兜底（不许直接抛）', () => {
  resetSpriteSkillCache()
  const body = readSpriteSkillBody(path.join(tmpdir(), 'definitely-not-here'))
  assert.equal(body, SPRITE_GUIDE)
  resetSpriteSkillCache()
})
