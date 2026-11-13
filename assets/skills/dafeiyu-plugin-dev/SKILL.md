---
name: dafeiyu-plugin-dev
description: 给「大肥鱼」DSH 桌面插件（dsh-remote-dafeiyu）新增工具/域/路由/skill 的施工契约：bundle 形态、src/<域> 目录与 ports 边界、工具定义形状、软探测注册、配套 skill 与 guide 兜底、node:test 判据与跨端 parity、发版几步，以及多个 agent 同时改这个仓库时哪些共享文件不能各碰各的。要往这个插件里加工具、改接线、发新版，或与别人的 agent 并行改同一仓库时，先加载本 skill。
---

# 大肥鱼插件：给「下一个加工具的 agent」的契约

> 读者是**下一个要往 `dsh-remote-dafeiyu` 里加工具的 agent**，不是最终用户。
> 每条规则后面挂着它防的事故；能定位的都给到文件行号，去现场读比读这份摘要有用。
> 之所以写这么细：接下来会有多个 agent 并行加工具。没有统一形态就会各写一套、互相改同一个
> 文件打架、发版步骤不一致——这份就是那套形态。

## 0. 四条红线（先记住，其余都是细节）

| 红线 | 它防的是什么 |
|---|---|
| 这是 **bundle**，不是源码仓直跑 | 市场按 git commit 装机、装机时**不跑构建** ⇒ `dist/bundle` 必须入库（`README.md` 构建段、`.gitignore` 的 `!/dist/bundle/`） |
| **永远不写 `inject:` 闸门** | 某一代宿主缺某个服务时整行不激活 ⇒ 插件**静默不加载**，比"带着次优配置跑"难查一个量级（`cordis.patch.yml:3-5`） |
| 对外能力**只经 `src/ports/index.ts`** | 只有 `platform/` 与 `shell/` 允许 import `@deepseek-ai/*`；`core/` 只认端口形状，否则那层"可测性契约"当场失效（`src/ports/index.ts:1-20`） |
| 一人一个 `src/<域>/` | 并行 agent 互改同一文件＝互相覆盖，事后没人说得清跑的是哪一版 |

## 1. 加一个工具：七步（照做，别跳）

1. **建域目录** `src/<域>/`，先写 `types.ts`：工具层与 service 层**共用同一份形状**（`src/sprite/types.ts:1-6`：schema 说支持 `mode`、service 却没转给页面，这是真出过的缺陷）。
2. **写 `service.ts`**：活在这里干；它对内核只用 `ports` 形状。
3. **要给人用再写 `routes.ts`**：一条回环路由，`kind:'exact'`，记得 `hostIsLoopback` + CORS（模板 `src/sprite/routes.ts:19-40`）。
4. **写 `tools.ts`**：`buildXxxTools(service) => Array<Record<string, unknown>>`，形状见 §2。
5. **写 `start.ts`**：用 `ctx.get?.('tools', true)` **软探测**注册（模板：`src/sprite/start.ts` 里「工具注册」那一段、`src/memory/start.ts:45-56`）。
6. **同时做配套 skill**：`assets/skills/dafeiyu-<域>/SKILL.md` + `references/`；工具里再留一个 `<域>_guide` 读**同一份正文**当兜底（`src/sprite/skill.ts` 的 `readSpriteSkillBody`）。两份文案必漂，只能有一份真源。目录放对就会被打包时一起铺到 `<dshHome>/skills/`（`references/structure.md` §7）。
7. **补测试**（`references/testing.md`）→ 跑 `pnpm typecheck && pnpm build && node --test "dist/tests/*.test.js"`。

**接线整段包 `try/catch`**，失败只留一行中文日志：`src/index.ts:1575-1580` 是照抄模板
（`startSprite` 那段），`stop()` 里同样一句 `spriteHandle?.stop()`（`src/index.ts:1697-1702`）。
—— 防的是：一个新工具起不来，把远控主链路一起带走。

## 2. 工具定义：六个键，缺一个就不算完

| 键 | 要求 | 依据 |
|---|---|---|
| `name` | `<域>_<动作>` 蛇形，全仓唯一 | `sprite_prepare`、`record_memory`、`recognize_image` |
| `description` | **自解释**：口径、默认值、两档参数哪档生效、什么情况别调，全写进去 | `src/sprite/tools.ts:49-62` |
| `parameters` | JSON Schema 子集（`type/properties/required/enum`），枚举从 `types.ts` 取 | `src/sprite/scan.ts:16-21`（三处必须等价） |
| `output` | `{ schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }` | `src/sprite/tools.ts:68-71` |
| `timeoutMs` | 明确给数（快工具 15s，要起浏览器/子进程的 240s 量级） | `src/sprite/tools.ts:131`、`src/memory/start.ts:63` |
| `execute` | 返回**字符串**（JSON 或 markdown）；出错 `throw` 带中文原因，模型会转述给用户 | `src/xyq/tools.ts:1-7`、`src/xyq/tools.ts:49`（签名 `execute(args, exec)`，需要会话 id 时用第二个参数） |

参数**传了但没被识别**的键必须显形（`ignored[]`），不许静默吞掉——`src/sprite/tools.ts:35-39`。
这条是 `.57` 那次"高级档参数静默失效"的判据，别重犯。

## 3. 软挂载纪律（本插件最核心的一条）

- 每个内核面都软探测：`tools`、`webServer`、`systemPrompt`、`agents`、`skills`。
- `ctx.get?.(name, true)` 的**第二个参数必须是 `true`**（可选）。否则宿主没登记这一面时会**抛**：
  `src/subagents/start.ts:220-229` 记的就是 0.9.0-dafeiyu.6 栽在这里——异常冒到外层 `try`，
  两条路由一条都没挂上，表现是 `/api/.../subagents` 回 401。
- 失败必须写 `probe[key] = '原因'`（`Record<string, string>`，见 `src/sprite/start.ts:33-38`）
  **+ 一行中文 log**。判不出原因的那次排错，比功能缺失贵得多。
- `stop()` 幂等；注销/停机抛错只吞不抛（`src/sprite/start.ts` 末尾的 `stop()`）。
- 别用 `provide()` 冒充"服务在"：`provide` 无条件执行，`src/index.ts:15-16` 写明理由。

## 4. 并行协作：三个共享文件 + 五处禁地

| 共享文件 | 只在什么时候动 |
|---|---|
| `src/index.ts` | 接你这个域的那一段（import + try/catch + stop）；别重排别人的 |
| `src/ports/index.ts` | 真的需要新端口时；只加可选方法（`?:`），不改已有签名 |
| `package.json` | 版本号；加依赖前先问一句（bundle 会内联它） |

**动这三个之前必须在对话里说一声，改完立刻 `pnpm typecheck`。**

禁地：别人的 `src/<域>/`；别人的 `assets/skills/dafeiyu-<域>/`；`assets/sprite/sprite-tool.html`
（约 290 KB（295,994 字节），别人在用——要改只动 `SCAN-PRIMITIVES-BEGIN/END` 之间并跑 parity，见 `references/testing.md`）；
`dist/`（手改会被下一次 `pnpm clean` 抹掉）；`market/index.json`（发版那一步才动）。

## 5. 发版（细节在 `references/release.md`）

改版本 → `pnpm build` → commit（`build: <版本>`）→ `git tag v0.9.0-dafeiyu.N` → push 分支与 tag →
跑 `%TEMP%\add-market-version.mjs` 更新 `market/index.json` 并提交（`market: <版本>`）→
改 profile pin（`C:\Users\htsd\.dsh\profiles\desktop\package.json` 的 git sha）→ `pnpm install`。
**别自己重启宿主**——用户在跑别的会话，重启要交给用户。

## 6. 不要做的事

- 别把 PowerShell/平台相关脚本塞进这个 npm 包（`package.json:39-46` 的 `files` 只有
  `assets/copy/dist/bundle/cordis.patch.yml/icon.svg/locale`；`.ps1` 是**运行时**生成到 profile 目录的，
  见 `src/sprite/orphans.ts:102`）。
- 别在 `dist/` 里手改：`scripts.build` 第一句就是 `pnpm clean`（`package.json:65-67`）。
- 别把明文自由文本写进手机中继的状态摘要——那是零知识边界上唯一的明文业务面，
  字段只能是时刻/布尔/非负整数（`src/core/runtime.ts:1185-1199`）。
- 别为了性能数字好看删掉已有展示逻辑：`tests/client-bundle.test.ts` 有大半断言钉的是
  "界面上该显示什么"（如 `:2809-2829` 的按钮文案），删了就是红。
- 别为了让判据变绿去改判据；也别在判据里写死"本应等于包名"的字符串——
  `scripts/bundle-plugin.mjs` 的注释记着这条（写死之后包名一改，判据和实现一起漂）。

## 7. 什么时候读哪篇

| 文件 | 什么时候读 |
|---|---|
| `references/structure.md` | 不确定一个文件该放在哪层、bundle/patch/profile 怎么挂载、skill 怎么铺到用户目录时 |
| `references/authoring.md` | 正在写 `tools.ts` / `start.ts`，想知道字段怎么填、描述怎么写、注释写什么时 |
| `references/testing.md` | 要写判据、要跨端对拍、跑测试前、测试红但看不出为什么时 |
| `references/release.md` | 准备发版、改版本号、更新 market 与 profile pin 时 |
