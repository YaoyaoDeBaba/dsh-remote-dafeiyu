/**
 * sprite/skill —— 把内置指南落成 **DSH skill**（单一真源）。
 *
 * 为什么改成 skill（2026-11-13）：
 * - 旧的形态是「系统提示里塞一段十几行的短版 + 一个自定义 `sprite_guide` 工具返回长版」。
 *   短版**每个请求都占上下文**，长版还要模型自己想到去调 —— 结果就是真正的方法论
 *   （语义点/路标/坐标空间/自校准）根本进不了上下文，每批素材都得重新踩一遍。
 * - DSH 的 skill 是「目录 + 正文」分离：模型每次只看到一条 `名字 + 描述（≤500 字）`，
 *   正文按需加载，还支持用户用 `/dafeiyu-sprite` 直接点名。重内容放 `references/`
 *   再按需读，比一篇大 markdown 更省。
 *
 * 实现取向：**放文件系统根目录**（`<dshHome>/skills/`），不自己写 provider。
 * - 不碰 `ctx.skills.registerProvider` 的契约（那是内核内部 API，签名会变）；
 * - 官方的 `dsh-skill-filesystem` 会扫这个根目录并**监视**它，改正文不用重启；
 * - 代价：会在用户目录里落一份文件，所以用版本标记管理，升级时整份替换。
 *
 * 三处内容只有一份真源：`assets/skills/dafeiyu-sprite/SKILL.md`。
 * `sprite_guide` 工具与这里都读它，不可能再出现"指南一套、代码一套"。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { SPRITE_GUIDE } from './guide.js'

export const SPRITE_SKILL_NAME = 'dafeiyu-sprite'
/** 记录"这份 skill 是从哪个插件版本铺过来的"，用来决定升级时要不要刷新。 */
const VERSION_FILE = '.dafeiyu-skill-version'

export interface SpriteSkillDeps {
  /** `~/.dsh`（宿主配置根），skill 落在 `<dshHome>/skills/<name>/`。 */
  dshHome: string
  /** 插件包里 `assets/skills/dafeiyu-sprite` 的绝对路径。 */
  assetsRoot: string
  /** 插件版本；写进版本文件，变一次就重铺一次。 */
  version: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}

export interface SpriteSkillResult {
  ok: boolean
  path?: string
  /** ok=false 时的原因（写进 probe，别静默）。 */
  reason?: string
}

/**
 * 目录指纹：`<相对路径>:<字节数>` 的有序拼接。
 *
 * 为什么需要它：只按**版本号**决定要不要重铺，会导致"改错别字也要发一版"——
 * 而文档恰恰是改得最勤、最不该触发发版的东西。用指纹比内容更便宜（只 stat 不读），
 * 但足够发现"SKILL.md 或 references 有任何增删改"。
 */
function fingerprint(dir: string): string {
  const walk = (base: string, rel: string): string[] => {
    let entries: Array<{ name: string; isDirectory(): boolean }>
    try {
      entries = readdirSync(path.join(base, rel), { withFileTypes: true })
    } catch {
      return []
    }
    const out: string[] = []
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) out.push(...walk(base, childRel))
      else {
        try {
          out.push(`${childRel}:${statSync(path.join(base, childRel)).size}`)
        } catch {
          out.push(`${childRel}:?`)
        }
      }
    }
    return out
  }
  return walk(dir, '').filter((line) => !line.startsWith(VERSION_FILE)).join('|')
}

/**
 * 把**所有**内置 skill 铺到用户 skill 根目录（`assets/skills/<name>/SKILL.md`）。
 *
 * 为什么是"全部"而不是单个：2026-11-13 之后这个插件会有多个 skill
 * （`dafeiyu-sprite` 工具指南、`dafeiyu-plugin-dev` 开发规范…），
 * 每个都写一遍安装逻辑必然会漂。这里只认一个约定：`assets/skills/<name>/SKILL.md` 就是一份 skill。
 *
 * 幂等判据是**内容指纹**（不是版本号）：文档改了就重铺，不用为改一句话发一版。
 * 重铺是整份替换，避免"SKILL.md 换了 references 还是老的"。
 */
export function installBundledSkills(deps: {
  dshHome: string
  /** 插件包里 `assets/skills` 的绝对路径。 */
  assetsRoot: string
  version: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}): { ok: boolean; installed: string[]; reason?: string } {
  let entries: Array<{ name: string; dir: string }>
  try {
    entries = readdirSync(deps.assetsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, dir: path.join(deps.assetsRoot, entry.name) }))
      .filter((entry) => existsSync(path.join(entry.dir, 'SKILL.md')))
  } catch (error) {
    return { ok: false, installed: [], reason: `missing-asset: ${String((error as Error)?.message ?? error)}` }
  }
  if (entries.length === 0) return { ok: false, installed: [], reason: `no-skill-under: ${deps.assetsRoot}` }

  const installed: string[] = []
  for (const entry of entries) {
    const target = path.join(deps.dshHome, 'skills', entry.name)
    const stamp = path.join(target, VERSION_FILE)
    try {
      // 内容没变就跳过（版本号只写进标记，用来事后核对"这份是从哪版铺的"）
      if (existsSync(stamp) && fingerprint(entry.dir) === fingerprint(target)) continue
      mkdirSync(path.dirname(target), { recursive: true })
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      cpSync(entry.dir, target, { recursive: true })
      writeFileSync(stamp, `${deps.version}\n`, 'utf8')
      installed.push(entry.name)
    } catch (error) {
      deps.log('铺 skill 失败（不影响工具本身）', {
        skill: entry.name,
        message: String((error as Error)?.message ?? error).slice(0, 120),
      })
      return { ok: installed.length > 0, installed, reason: `copy-failed: ${entry.name}` }
    }
  }
  if (installed.length > 0) deps.log('内置 skill 已铺开', { skills: installed.join(','), version: deps.version })
  return { ok: true, installed }
}

/**
 * 把一个 skill 铺到用户 skill 根目录（单个，保留给测试与"只想要一个"的场景）。
 *
 * **不用 `ctx.skills.register`**：嵌入式注册要求记住 provider 契约（list/load 的返回形状），
 * 而那是内核内部 API；文件系统根目录是官方文档写明的对外契约，稳得多。
 */
export function installSpriteSkill(deps: SpriteSkillDeps): SpriteSkillResult {
  const source = path.join(deps.assetsRoot, 'SKILL.md')
  if (!existsSync(source)) return { ok: false, reason: `missing-asset: ${source}` }
  const target = path.join(deps.dshHome, 'skills', SPRITE_SKILL_NAME)
  const stamp = path.join(target, VERSION_FILE)
  try {
    if (existsSync(stamp)) {
      const current = readFileSync(stamp, 'utf8').trim()
      if (current === deps.version) return { ok: true, path: target }
    }
    mkdirSync(path.dirname(target), { recursive: true })
    // 整份替换：只在版本变化时发生，避免半新半旧（SKILL.md 换了但 references 还是老的）
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    cpSync(deps.assetsRoot, target, { recursive: true })
    writeFileSync(stamp, `${deps.version}\n`, 'utf8')
    deps.log('序列帧 skill 已铺开', { path: target, version: deps.version })
    return { ok: true, path: target }
  } catch (error) {
    return { ok: false, reason: String((error as Error)?.message ?? error).slice(0, 160) }
  }
}

/** 读一次 cached 的 skill 正文（去掉 frontmatter）；读不到就退回内置文案。 */
let cachedBody: string | undefined
export function readSpriteSkillBody(assetsRoot: string): string {
  if (cachedBody !== undefined) return cachedBody
  try {
    const raw = readFileSync(path.join(assetsRoot, 'SKILL.md'), 'utf8')
    // frontmatter 是给 skill 目录用的，模型看正文时不需要（也不该看到 YAML）
    cachedBody = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()
  } catch {
    cachedBody = SPRITE_GUIDE
  }
  return cachedBody
}

/** 仅供测试：清掉正文缓存。 */
export function resetSpriteSkillCache(): void {
  cachedBody = undefined
}
