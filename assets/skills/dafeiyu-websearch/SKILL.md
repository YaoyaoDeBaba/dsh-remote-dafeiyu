---
name: dafeiyu-websearch
description: 用 web_search_fy / paper_search / paper_read / repo_search / code_search / graphics_papers / hn_search 联网查资料：网页、论文（arXiv 为主，OpenAlex/DBLP 替补）、论文全文、GitHub 仓库、跨仓库代码、图形学论文索引、HN 讨论。web_search_fy 还有个 engine=doubao：拿本机已登录的网页版豆包当搜索引擎（白嫖、不花 key），返回整合答案 + 来源，适合「要一个答案」而不是「一堆链接」。要查最新事实、找论文、读全文、找开源项目或代码时读这篇，里面写了各上游的限额与已知不可用项。
---

# 联网搜索：四个工具怎么选

> 这一页是给 **agent** 看的操作说明，不是给用户看的介绍。
> 工具名就是入口：搜网页 web_search_fy、搜论文 paper_search、读正文 paper_read、找仓库 repo_search。

## 主力与替补（2026-11-20 用户裁决）

- **主力**：`paper_search` 默认走 **arXiv**（稳）；`repo_search` 走 **GitHub**（稳，未认证 60 次/小时）。
- **替补**：`openalex`（无 key 共享额度、常 429）、`dblp`（多半人机验证页）——只在 arxiv 失败或你明确要被引数/精确 venue 时才指定。
- **定向工具**：`code_search`（grep.app，本机 IP 常 429）、`graphics_papers`（kesen 图形学索引）、`hn_search`（HN 讨论）。

## 一句话选型

| 你想干什么 | 用哪个 | 备注 |
|---|---|---|
| 查一个事实/新闻/官网/文档页 | web_search_fy | Bing 主、Sogou 回退；返回标题+摘要+真实 URL |
| 找学术论文（默认） | `paper_search` 不写 source（= auto） | 先 arXiv（稳定），失败自动退 openalex / dblp |
| 需要被引数 | `paper_search(source: 'openalex')` | **替补**：无 key 时共享 0.10 美元/天，常 429 |
| 找最新预印本（ML/CV/物理） | paper_search（arxiv） | 有摘要前 200 字，通常比会议正式版更早 |
| 找 CS 会议/期刊的精确 venue | `paper_search(source: 'dblp')` | **替补**：现在多半回人机验证页，能通就通、不通换 arxiv |
| 读论文/网页正文 | paper_read | arXiv 链接会自动换成 ar5iv 的 HTML 全文 |
| 找开源项目/参考实现 | repo_search | GitHub REST，无需 key |

**别拿 web_search_fy 硬凑论文和仓库**：搜索引擎的结果页链接经常是聚合站/镜像，
paper_search、repo_search 走的是官方 API，字段（年份、被引、星数）才可信。

## web_search_fy

```
web_search_fy({ query: "DeepSeek V4 发布时间", count: 8, engine: "auto" })
```

- query 必填，空字符串会被拒（工具会抛中文错，不是静默返回空）。
- count 1~20，默认 8；engine = auto（默认）/ bing / sogou。
- 输出每条两行：第 1 行「1. 标题 — 摘要」，第 2 行缩进的 URL；最上面一行是「搜索「词」：N 条（引擎）」。
- auto 的行为：先 cn.bing.com（带桌面 UA + accept-language: zh-CN），
  被拦/超时/解析不出结果块就退 www.sogou.com/web，并在结果末尾注一句换引擎的原因。
- Bing 的 ck/a?...&u=a1<base64url> 跳转会被**还原成真实 URL**——拿到长跳转链说明
  格式变了，那时把原文 URL 当证据用，别自己猜。
- 同一 query + count + engine 的内存缓存 5 分钟：连着问同一件事不会重复打上游。
- 单次请求 8 秒超时；429/5xx 退避重试一次。

## web_search_fy(engine: "doubao")：把网页版豆包当搜索引擎用

```
web_search_fy({ query: "2026 年国产大模型价格谁最便宜", engine: "doubao" })
```

- 走的是**本机已登录的网页版豆包**（白嫖，不花 API key）：起一个无头浏览器、打字、回车、抽它答完的正文。
- 登录态与识图插件**共用同一份 profile**（`<dshHome>/storages/dsh-remote-dafeiyu/webvision/doubao`）：
  识图那边登过一次，这里就能直接用。没登录会抛中文错，照它说的先在识图插件里点登录。
- 输出形态和 bing/sogou 不一样：**一段整合后的回答 + 它给的来源列表**，
  不是一条条搜索页。它没给链接时输出会明说「别把上面的回答当成有出处的检索结果来引用」。
- 慢（几十秒），`count` 在这里只用来限制来源条数。超时返回的部分会标「没等到答完」。
- **不进 auto**：auto 仍然只走 Bing → Sogou。豆包依赖登录态和网页版改版，
  所以只在你要「一个答案 / 对比 / 总结」时显式写 `engine: "doubao"`；要「一堆可点开的链接」还是 auto。

## paper_search

```
paper_search({ query: "diffusion model acceleration", year_from: 2022, limit: 6 })   // auto：arxiv → openalex → dblp
```

- 输出一行一条：标题 · 年份 · venue · 被引 N · URL；arXiv 会多一行「摘要：…（前 200 字）」。
- openalex：api.openalex.org/works，字段取 display_name / publication_year /
  primary_location.source.display_name / cited_by_count / open_access.oa_url。
  oa_url 有值就是**免费全文**，优先给用户这个。
  它 2026 起有额度：**不带 key 是整台机器/出口 IP 共享的 0.10 美元/天**，被同 IP 别的程序吃光就回 429。
  配 `OPENALEX_API_KEY`（免费，openalex.org/settings/api）后每天 1 美元，工具会自动带上；
  真撞上 429 就先用 `source: "arxiv"` 顶上。
- arxiv：export.arxiv.org/api/query（Atom XML）。**官方要求 3 秒一次**，
  批量搜时中间自己歇一下，别连发。
- dblp：dblp.org/search/publ/api?format=json。它会回 **202**，有两种现实：真在排队，或者
  撞上了**人机验证挑战页**（2026-11-20 本机实测拿到的是「正在确认你是不是机器人！」那个 HTML）。
  两种情况都等于「没拿到」，工具会退避重试一次并在报错里区分；**别把 202 当成 0 结果**。
  这时换 `source: "openalex"` 或 `"arxiv"` 更快。
- 被引数只有 openalex 有（dblp / arxiv 都不给）。它是 **OpenAlex 口径，不是 Google Scholar 口径**，
  别混着报。

## paper_read

```
paper_read({ url: "https://arxiv.org/abs/2005.14165", max_chars: 8000 })
```

- arXiv 的 abs / pdf 链接都会换成 https://ar5iv.labs.arxiv.org/html/<id> 抓 HTML 全文
  （本机实测 200 / 122KB / 0.8s）。ar5iv 抓不下来时会退回原链接并**明说**退回了。
- 其它 URL 走通用 HTML→文本：剥 script/style/标签、解实体、压空白。
- max_chars 默认 8000（500~50000）。超长会截断，并在末尾写「（已截断，原文 N 字）」——
  **引用时别把截断点当原文结尾**，需要更多就再调一次并调大 max_chars。
- PDF 直接链接抓不出正文（会报中文错）。要读 PDF 就找它的 HTML 版（arXiv 自动处理）。

## repo_search

```
repo_search({ query: "vector database", language: "rust", min_stars: 500, sort: "stars", limit: 8 })
```

- 输出：owner/name · ★N · 语言 · 更新 YYYY-MM-DD · 一句话描述，下一行缩进 URL。
- 给了 author 就走 /users/<author>/repos?sort=updated（最多 100 条）再本地按
  language / min_stars / query 过滤，然后按 sort 排序取前 limit 条。
- **未认证限速 60 次/小时**：结果末尾的 x-ratelimit-remaining ≤3 时会提示一句。
  在设置页「大肥鱼 → 搜索」里填，或配环境变量 GITHUB_TOKEN（/ DSH_GITHUB_TOKEN），能提到 5000 次/小时。
- 403/429 时工具报的是「GitHub 没查成：HTTP 403（被拦）（未认证每小时只有 60 次…）」——
  看到这句先想额度，别以为网断了。

## 已知不可用 / 坑（2026-11-20 本机实测）

| 上游 | 状态 | 结论 |
|---|---|---|
| Bing cn.bing.com | 200 / 97KB / 350ms | 主引擎，结果块是 li class="b_algo" |
| Bing 跳转链 | www.bing.com/ck/a?...&u=a1<base64url> | base64url 解开就是真实 URL，工具已解 |
| Sogou www.sogou.com/web?query= | 200 可用 | 回退引擎；结果链接是加密跳转（/link?url=），**还原不了真实域名** |
| Baidu | 会出安全验证 | **不用**，别指望它 |
| DuckDuckGo html | 连不上 | **不用** |
| Semantic Scholar / grep.app | 常 429 | 不接，别为了它们加退避 |
| OpenAlex（**替补**） | 429 常态 | 无 key 时**共享 0.10 美元/天**，吃光回 429；配 OPENALEX_API_KEY 后 1 美元/天 |
| DBLP（**替补**） | 202 | 通常是 202 + 人机验证挑战页，这一轮基本查不了 |

> **替补区的意思**（2026-11-20 用户裁决）：`paper_search` 默认 `auto`，顺序是 **arxiv → openalex → dblp**。
> arXiv 是主力；openalex / dblp 只在 arxiv 失败时兜底，或者你明确需要被引数 / 精确 venue 时才手动指定。
| GitHub REST | 正常（本机实测剩余额度会掉到个位数） | 未认证 60/h；配 GITHUB_TOKEN 后 5000/h |
| ar5iv | 200 / 1.2MB / 0.6s | 比 arXiv 的 PDF 小一个数量级且可直接转文本 |

## 配置（两种方式，二选一即可）

**方式 A（推荐）：设置页「大肥鱼 → 搜索」栏**

直接填 GitHub Token / OpenAlex Key，保存即生效（工具每次调用现读文件，不用重启）。
已填的显示成 `已配置（…abcd）`，不会回显明文；旁边还有「测一下」真跑一次验证连通性。
**优先级：设置页 > 环境变量**（填了设置页就以它为准，免得出现「填了却还在用旧凭据」）。

**方式 B：环境变量**（适合 CI / 临时试）

| 变量 | 作用 |
|---|---|
| `GITHUB_TOKEN` / `DSH_GITHUB_TOKEN` | repo_search 带上 Bearer，额度 60/h → 5000/h |
| `OPENALEX_API_KEY` / `DSH_OPENALEX_API_KEY` | paper_search（openalex）避开共享额度，0.10 → 1 美元/天 |

## 输出与引用纪律

1. 结果里给的 URL 就是证据链：**引用时贴这个 URL**，不要自己重排/缩短。
2. 摘要只代表搜索页给的那句话，**不是全文结论**——要下判断先 paper_read 读正文。
3. 搜不到就说搜不到：工具抛的中文错（被拦 / 0 条 / 解析失败）原样转述给用户，
   不要用「据我所知」补一段看起来像搜过的话。
4. 一次没成就别硬刷：web_search_fy 有 5 分钟缓存，连续重试只会拿同一份缓存/同一张验证页。
   换个关键词、换 engine、或换工具（论文/仓库）才是有效动作。
