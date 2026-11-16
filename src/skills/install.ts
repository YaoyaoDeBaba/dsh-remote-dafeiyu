/**
 * skills/install —— 把**内置指南**落成 DSH skill（单一真源）。
 *
 * ## 为什么这个文件从 `sprite/skill.ts` 搬到这里（2026-11-16）
 *
 * 序列帧那一整块搬去独立包 `dsh-dev-kit-dafeiyu`，安装器原本躺在 `src/sprite/skill.ts` 里。
 * 但它装的**不是一个 skill**：它按约定认 `assets/skills/<name>/SKILL.md`，把**全部**内置
 * skill 铺到 `<dshHome>/skills/` —— 包括仍然留在这个包里的 `dafeiyu-plugin-dev`
 * （插件开发规范）。整块删掉 `src/sprite/` 会连带把"铺 dafeiyu-plugin-dev"这件事一起删掉，
 * 而那种丢失是**静默**的（用户目录里旧的那份还在，直到有人清理才发现没再更新）。
 *
 * ⇒ 只搬这一个函数出来，认目录不认名字的逻辑一个字没改。序列帧自己的
 * `installSpriteSkill` / `readSpriteSkillBody`（`sprite_guide` 工具的正文兜底）随包走了。
 *
 * ## 实现取向：放文件系统根目录（`<dshHome>/skills/`），不自己写 provider
 *
 * - 不碰 `ctx.skills.registerProvider` 的契约（那是内核内部 API，签名会变）；
 * - 官方的 `dsh-skill-filesystem` 会扫这个根目录并**监视**它，改正文不用重启；
 * - 代价：会在用户目录里落一份文件，所以用内容指纹 + 版本标记管理。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 记录"这份 skill 是从哪个插件版本铺过来的"，用来事后核对，不参与"要不要重铺"的判断。 */
export const SKILL_VERSION_FILE = '.dafeiyu-skill-version'

/** 插件包根目录（`dist/src/skills/install.js` → 上三级）。 */
/**
 * 插件包根目录：**从当前模块目录往上找**，认"有 `package.json` 且有 `assets/skills/`"这一层。
 *
 * ⚠️ 别图省事写成固定的 `'..','..'`：这个文件在两种形态下跑，**相对深度不一样**——
 *   · 打包后：全部内联进 `dist/bundle/index.js` ⇒ 模块目录是 `<pkg>/dist/bundle`，往上**两级**；
 *   · 未打包（`node --test dist/tests/*.js` 之类）：模块是 `<pkg>/dist/src/skills/install.js`
 *     ⇒ 往上**四级**。
 * 写死任何一种，另一种形态就会指到包外面去——而症状是"skill 永远不更新"，
 * 一行日志都不会有（安装器只 log 成功那一下）。所以这里逐级探，探到认出来为止。
 */
export function packageRoot(): string {
  try {
    let candidate = path.dirname(fileURLToPath(import.meta.url))
    for (let depth = 0; depth < 5; depth += 1) {
      if (existsSync(path.join(candidate, 'package.json')) && existsSync(path.join(candidate, 'assets', 'skills'))) {
        return candidate
      }
      const parent = path.dirname(candidate)
      if (parent === candidate) break
      candidate = parent
    }
  } catch {
    /* 走下面的兜底 */
  }
  return process.cwd()
}

/** 插件版本：读不到就用 unknown（重铺一次无害）。 */
export function packageVersion(): string {
  try {
    const raw = readFileSync(path.join(packageRoot(), 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
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
  return walk(dir, '').filter((line) => !line.startsWith(SKILL_VERSION_FILE)).join('|')
}

export interface BundledSkillsResult {
  ok: boolean
  installed: string[]
  /** ok=false 时的原因（写进 probe / 日志，别静默）。 */
  reason?: string
}

/**
 * 把**所有**内置 skill 铺到用户 skill 根目录（`assets/skills/<name>/SKILL.md`）。
 *
 * 为什么是"全部"而不是单个：这个插件有多个 skill（`dafeiyu-sprite` 工具指南、
 * `dafeiyu-plugin-dev` 开发规范…），每个都写一遍安装逻辑必然会漂。
 * 这里只认一个约定：`assets/skills/<name>/SKILL.md` 就是一份 skill。
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
}): BundledSkillsResult {
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
    const stamp = path.join(target, SKILL_VERSION_FILE)
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
      return { ok: false, installed, reason: `copy-failed: ${entry.name}` }
    }
  }
  if (installed.length > 0) deps.log('内置 skill 已铺开', { skills: installed.join(','), version: deps.version })
  return { ok: true, installed }
}

/** 铺一次随包的内置 skill（`assets/skills`），失败只返回原因、绝不抛。 */
export function installPackagedSkills(deps: {
  dshHome: string
  log: (message: string, fields?: Record<string, string | number | boolean | undefined>) => void
}): BundledSkillsResult {
  try {
    return installBundledSkills({
      dshHome: deps.dshHome,
      assetsRoot: path.join(packageRoot(), 'assets', 'skills'),
      version: packageVersion(),
      log: deps.log,
    })
  } catch (error) {
    return { ok: false, installed: [], reason: `threw: ${String((error as Error)?.message ?? error).slice(0, 160)}` }
  }
}
