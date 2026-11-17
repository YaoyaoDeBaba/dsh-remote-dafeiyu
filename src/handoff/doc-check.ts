/**
 * handoff/doc-check —— 交接文档的**结构判据**（2026-11-17）。
 *
 * ## 为什么要有它
 *
 * 指令里一直写着「写完自查一遍，逐条打勾」，但那是靠模型自觉。真机上的结果是：
 * 每次转生/分身，来生都要报一堆"文档缺口"，用户再回头催前世补——三轮人肉。
 *
 * 缺口其实可以机器认出来：小节空着、下一步写不出入口、含糊话（「见之前对话」「跑通即可」）。
 * 所以这里把它做成**服务端的判据**：文件落盘后先过这一关，不合格就把问题清单再注入一次
 * （最多补 2 轮，见 service.ts），补完才建新会话。判据不合格的交接 = 没有交接。
 *
 * ## 刻意宽松
 *
 * 这是"打回重写"的开关，太严会把好文档反复打回、最后超时失败。所以：
 * · 只查**结构**与**入口**，不评价内容好坏；
 * · 每个小节里随便有一行东西就算非空（写"无"也算）；
 * · 含糊词只认几张黑名单，不做语义判断。
 */
import type { HandoffKind } from './prompt.js'

export interface DocCheckResult {
  ok: boolean
  /** 一句话一条，直接拼进"补写指令"发给模型。 */
  problems: string[]
}

/** 转生必答的小节（前缀匹配：允许写成 `## 未完成 / 下一步｜...`）。 */
const REBIRTH_SECTIONS = [
  '目标',
  '现状（做到哪一步）',
  '已完成（不要重做）',
  '未完成 / 下一步',
  '等用户拍板',
  '后台在跑',
  '边界（不要碰的东西）',
  '长期记忆要点',
  '关键决定与理由',
  '坑与教训',
  '工作区与版本',
  '相关文件',
]

/** 分身必答的小节。 */
const BRANCH_SECTIONS = [
  '本体背景',
  '长期记忆要点',
  '分支任务',
  '边界（不要碰的东西）',
  '后台在跑',
  '关键决定与理由',
  '坑与教训',
  '工作区与版本',
  '相关文件',
]

/** 「下一步」这类小节里，每条都得能直接开工：要么给文件/命令，要么显式标「未定位」。 */
const NEEDS_ENTRY = ['未完成 / 下一步', '未完成']

/** 含糊话黑名单（与注入指令里那张表同源，改一处要一起改）。 */
const VAGUE = ['见之前对话', '后面再看', '视情况', '跑通即可', '大概差不多', '细节见上文']

interface Section {
  /** 去掉分隔符之后的描述，只留小节名。 */
  name: string
  /** 小节正文（不含标题行）。 */
  body: string
}

function splitSections(text: string): Section[] {
  const out: Section[] = []
  let current: Section | undefined
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('## ')) {
      const title = line.slice(3).trim()
      current = { name: title.split('\uFF5C')[0]!.trim(), body: '' }
      out.push(current)
      continue
    }
    if (current !== undefined) current.body += rawLine + '\n'
  }
  return out
}

/** 正文是不是"什么都没有"（纯空白）。 */
function blank(body: string): boolean {
  return body.replace(/\s+/g, '') === ''
}

/**
 * 正文是不是显式写了"无"。
 *
 * 指令要求"没内容的写无"——所以"无"是**合格答案**，不是缺口。
 * 只有真正留白（空白 / 什么都不写）才算问题。
 */
function declaredNone(body: string): boolean {
  return /^(无|没有了|暂无)[。.]?$/.test(body.replace(/\s+/g, ''))
}

/** 一行里有没有"能照着做"的东西：路径、命令、被反引号包住的片段。 */
function hasEntry(line: string): boolean {
  if (/`[^`]+`/.test(line)) return true
  if (/[A-Za-z]:[\\/]/.test(line)) return true
  if (/[\w.-]+\/([\w.-]+\/)*[\w.-]+/.test(line)) return true
  if (/\.(ts|tsx|js|mjs|cjs|json|md|ps1|yml|yaml)\b/i.test(line)) return true
  if (/\b(git|node|pnpm|npm|pwsh|python|tsc)\b/.test(line)) return true
  if (line.includes('未定位')) return true
  return false
}

function bulletLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^([-*+]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^([-*+]|\d+[.)])\s+/, ''))
}

/**
 * 检查一份交接文档。
 *
 * `problems` 直接就是"发回给前世"的话术：一条一个可执行的修改点。
 */
export function checkHandoffDoc(text: string, kind: HandoffKind): DocCheckResult {
  const problems: string[] = []
  const sections = splitSections(text)
  if (sections.length === 0) {
    problems.push('整篇没有 Markdown 小节（必须是 `## 小节名` 开头的结构）。')
    return { ok: false, problems }
  }
  const byName = new Map<string, Section>()
  for (const section of sections) {
    if (!byName.has(section.name)) byName.set(section.name, section)
  }
  const required = kind === 'rebirth' ? REBIRTH_SECTIONS : BRANCH_SECTIONS
  const find = (name: string): Section | undefined => {
    for (const [key, value] of byName) {
      if (key === name || key.startsWith(name)) return value
    }
    return undefined
  }

  const missing = required.filter((name) => find(name) === undefined)
  if (missing.length > 0) {
    problems.push('缺这些小节：' + missing.map((name) => '「' + name + '」').join('、') + '。没有内容的写"无"，但小节标题必须在。')
  }

  for (const name of required) {
    const section = find(name)
    if (section === undefined) continue
    if (blank(section.body)) {
      problems.push('「' + name + '」是空的：要么写内容，要么写"无"。')
      continue
    }
    if (declaredNone(section.body)) continue
    if (NEEDS_ENTRY.some((needle) => name.startsWith(needle))) {
      const bullets = bulletLines(section.body)
      if (bullets.length === 0) {
        problems.push('「' + name + '」没有条目：用列表写，每条一件能直接开工的事。')
      } else {
        const naked = bullets.filter((line) => !hasEntry(line))
        if (naked.length > 0) {
          problems.push(
            '「' + name + '」里有 ' + naked.length + ' 条没给入口（改哪个文件 / 跑什么命令 / 怎么算做完），' +
              '写不出入口的标「未定位」：' + naked[0]!.slice(0, 40),
          )
        }
      }
    }
  }

  for (const word of VAGUE) {
    if (text.includes(word)) problems.push('出现含糊话「' + word + '」：换成具体判据（跑什么命令、输出该是什么）。')
  }

  return { ok: problems.length === 0, problems: problems.slice(0, 8) }
}
