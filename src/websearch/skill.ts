/**
 * websearch/skill —— 读「联网搜索」那份 skill 正文（单一真源）。
 *
 * 工具 websearch_guide 与 assets/skills/dafeiyu-websearch/SKILL.md 是同一份正文：
 * 那边改了这边自动跟着变，不用手工同步两份文案。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const WEBSEARCH_SKILL_NAME = 'dafeiyu-websearch'

/** 读 skill 正文；读不到时给一段最小可用的兜底（绝不让工具抛）。 */
export function readWebsearchSkillBody(skillDir: string): string {
  try {
    const file = path.join(skillDir, 'SKILL.md')
    if (existsSync(file)) {
      const text = readFileSync(file, 'utf8')
      if (text.trim() !== '') return text
    }
  } catch {
    /* 走兜底 */
  }
  return [
    '# 联网搜索（兜底说明）',
    '',
    '搜网页用 web_search(query, count, engine)；搜论文用 paper_search(query, source, year_from, limit)；',
    '读全文用 paper_read(url, max_chars)；找仓库用 repo_search(query, author, language, min_stars, sort, limit)。',
    '',
    '已知不可用：Baidu 要安全验证、DuckDuckGo html 连不上，所以主引擎是 Bing、回退 Sogou。',
    'GitHub 未认证限速 60 次/小时；OpenAlex 免费无 key；arXiv 建议 3 秒一次。',
  ].join('\n')
}
