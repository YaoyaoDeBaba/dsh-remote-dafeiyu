# 结构：这个插件是什么形状

> 读这篇的场景：你要新建一个 `src/<域>/`，或者不确定"这个文件该放哪一层"。
> 每条都给到仓库里的现场位置；写文档不写代码，能核实的都核实过。

## 1. 它是一个 bundle（这件事决定了很多别的规则）

`package.json` 里四处咬在一起，缺一处就装不上：

| 字段 | 值 | 作用 / 缺了会怎样 |
|---|---|---|
| `main` | `./dist/bundle/index.js`（`package.json:31`） | 宿主 `import` 的就是这一份；源码 `src/` 不进包 |
| `exports` | `.` / `./client` / `./cordis.patch.yml` / `./package.json` / `./locale/*.json`（`:32-38`） | 宿主按路径读词典与 patch，不走 exports 读不到 |
| `files` | `assets, copy, dist/bundle, cordis.patch.yml, icon.svg, locale`（`:39-46`） | 决定 npm/装机那一份带什么；`assets/skills/` 靠 `assets` 带出去 |
| `dsh.bundle.patch` | `./cordis.patch.yml`（`:47-50`） | 不指这份文件，宿主根本不知道有它 |

`dist/bundle` **必须入库**：市场按 git commit 装机，装机时不会跑构建（`README.md` 构建段；
`.gitignore` 里 `/dist/*` 之下有一条 `!/dist/bundle/` 例外）。`scripts/bundle-plugin.mjs` 用 esbuild
把 `src/index.ts` + 依赖打成一个自包含 ESM 文件，只留 `cordis` 与 `@deepseek-ai/*` 作 external
（打进去会造成两份实例，服务注册与事件派发都会错乱）。

## 2. `cordis.patch.yml`：三件事都踩过坑

```yaml
- insert:
    - id: dsh-remote-control      # 运行时 id：数据目录、路由前缀跟着它
      name: dsh-remote-dafeiyu    # ⚠️ 必须等于 package.json 的 name
      config: { … }               # 随包分发的默认配置
```

1. **`name` 必须等于包名**（`cordis.patch.yml:16`）。loader 拿它去 `import`；写成别的名字的表现是
   "文件都在、`bundles` 列表里也有、启动不报错，插件就是不加载"（2026-10-28 实测踩中，
   `tests/plugin-metadata.test.ts:139-151` 记着现场）。判据在 `:152-179`。
2. **`id` 与包名故意不同**（`:11`）。数据目录 `~/.dsh/dsh-remote-control`、pill 路由前缀都跟着 `id`，
   所以改包名不会丢已落盘的配对。判据 `tests/plugin-metadata.test.ts:178`。
3. **不写 `inject:` 闸门**（`:3-5`）。写闸门＝某一代宿主缺服务就整行不激活、插件静默不加载，
   比带着次优配置跑更难排查。
4. **不给 `DEFAULT_CONFIG` 里的键再写一份值**（`:19-24`）。这份 patch 是注入层，优先级更高，
   写第二份必然漂移，表现是"改了代码里的默认值、装机后不生效"。

## 3. 挂载链路

```
profile/package.json  dsh.profile.bundles: [ …, "dsh-remote-dafeiyu" ]
        │              （当前 profile：C:\Users\htsd\.dsh\profiles\desktop\package.json）
        ├─ dependencies 里的那一条 git+https://…#<sha> 决定装哪一版
        ▼
loader 按 bundles 里的名字 → 解析包 → main = dist/bundle/index.js
        ▼
该包的 cordis.patch.yml 被 insert 进 loader 树 → apply() 跑起来
```

三处名字必须一致：`bundles` 条目 = 包名 = patch 里的 `name`。`scripts/pack-to-profile.mjs:30`
专门写了一句"`bundles` 里的名字必须等于包名，旧条目要一并摘掉"。

## 4. 分层：谁能 import 什么

| 层 | 允许的事 | 现场 |
|---|---|---|
| `src/index.ts` | 只做接线：读配置、探载体、把端口/中继/运行时连起来；`apply()` 绝不向外抛 | `src/index.ts:1-17` |
| `src/ports/index.ts` | 插件自己的端口形状（`KernelPort`、`Clock`…），可选方法用 `?:` | `src/ports/index.ts:1-20` |
| `src/platform/`、`src/shell/` | **只有这两层**可以 import `cordis` 与 `@deepseek-ai/*` | 同上注释 |
| `src/core/` | 只认端口形状，不认宿主包 | 同上 |
| `src/<业务域>/` | 自己的 service/tools/routes/start；跨域能力走 `ports` 或 `ctx.get` | 见下表 |
| `src/client/` | 浏览器面，**另一套编译面**（DOM lib、无 node 类型） | `tsconfig.json` 的 `exclude: ["src/client"]`、`tsconfig.client.json`（`noEmit: true`） |

编译面：`tsconfig.json` 收 `src/**/*.ts` + `tests/**/*.ts`，`outDir: dist`、`rootDir: .`，
所以测试产物是 `dist/tests/*.test.js`（`pnpm test` 就跑这个 glob）。

## 5. 域目录实际长什么样（别照抄一个并不存在的模板）

`src/<域>/{index,start,routes,tools,types,service}.ts` 只是**职责菜单**，不是每个域都有这些文件。
现状（`src/` 下 17 个目录的实际文件）：

| 域 | 文件 |
|---|---|
| `sprite` | `analyze browser guard guide orphans png routes scan service skill start tools types` |
| `subagents` | `bus config guidance pusher routes start tools` |
| `memory` | `routes service start`（工具直接写在 `start.ts` 里） |
| `vision` | `config protocols routes service start`（工具也在 `start.ts` 里，`:207-222`） |
| `xyq` | `cli config guidance routes service start tools` |
| `avatar` | `routes start`（只有一条素材路由） |

要点：
- **`index.ts` 只出现在 `ports/`**。别为"看起来整齐"给每个域加一个 barrel，仓库没这个惯例。
- 只有一个工具、且没有别的东西时，工具定义写在 `start.ts` 里是允许的（`memory`、`vision`）；
  工具一多就单独 `tools.ts`（`sprite` 14 个）。
- 纯函数判据抽出来单独成文件才好测：`src/sprite/guard.ts:1-6` 写的就是这个理由
  （"这三条都是看起来成功、实际给了一张废图"）。

## 6. 软探测：形状与代码骨架

`start.ts` 对宿主只认一个**宽松**形状，别 import 宿主类型：

```ts
interface LooseContext {
  get?<T>(name: string, optional: true): T | undefined
  inject?(names: string[], callback: (scoped: unknown) => void): unknown
}
```

模板（`src/sprite/start.ts` 的骨架，直接照着写）：

```ts
const probe: Record<string, string> = {}

// 1) 工具
try {
  const tools = ctx.get?.('tools', true) as { register?: (d: Record<string, unknown>) => unknown } | undefined
  if (tools && typeof tools.register === 'function') {
    for (const definition of buildXxxTools(service)) tools.register(definition)
    probe.tools = 'registered'
  } else probe.tools = 'no-tools'          // 没有这一面 ≠ 报错
} catch (error) { probe.tools = `threw: ${String((error as Error)?.message ?? error).slice(0, 120)}` }

// 2) 路由（宿主 webServer 可能晚到：先 get，再 inject 一次兜底）
try { const found = ctx.get?.('webServer', true); if (found) acceptWeb(found, 'via get'); else probe.webServer = 'none' }
catch (error) { probe.webServer = `get threw: …` }
try { ctx.inject?.(['webServer'], (…args) => { … }) } catch { probe['injectThrew:webServer'] = '…' }

// 3) 提示段
systemPrompt.section({ name: 'dafeiyu:<域>', order: 10091, text: GUIDANCE })
```

三条细节，都是别人付过学费的：

1. **`get(name, true)` 的第二参必须是 `true`**。`src/subagents/start.ts:220-229` 记着 0.9.0-dafeiyu.6：
   直接读 `ctx.webServer` 在 cordis 未声明时**会抛**，异常冒到外层 `try` ⇒ 两条路由一条都没挂上。
2. **`webServer` 会晚到**。所以是 `get` + `inject([...], cb)` 两条路都试，`acceptWeb` 里校验
   `typeof value.register === 'function'`，拿到后 `tryStart()`（都在 `src/sprite/start.ts` 里）。
3. **`order` 是提示段的插队顺序**：现有域用 10090/10091/10100，新域取一个不撞的数。

`probe` 的契约：`Record<string, string>`，**只写"这一面此刻怎么样"**（`ready` / `no-tools` / `disabled` /
`threw: …`）。它挂在 handle 上（`SpriteHandle.probe`）给测试与排错读；同时失败处必须留一行中文 log。

## 7. 配套 skill 怎么铺到用户目录

不是"往 assets 里放个文件"就完事：`assets/` 只在包里，模型看到的是
`<dshHome>/skills/<name>/`（当前机器：`C:\Users\htsd\.dsh\skills\`，里面已有 `dafeiyu-sprite`）。

`src/sprite/skill.ts` 是现成模板，三条取向照抄：

1. **落在文件系统根目录，不自己写 provider**（见该文件头部的取舍说明）：`ctx.skills.registerProvider` 是内核内部
   契约、签名会变；官方的文件系统 provider 会扫并**监视**这个根目录，改正文不用重启。
2. **版本标记 + 整份替换**（函数 `installSpriteSkill`）：`.dafeiyu-skill-version` 等于当前插件版本就不动；
   版本一变就 `rmSync` + `cpSync` 整份铺，避免"`SKILL.md` 换了而 `references/` 还是老的"。
3. **读不到就退回内置兜底，不许抛**（函数 `readSpriteSkillBody`）：去掉 frontmatter 后返回正文；
   文件缺失时退回 `guide.ts` 里的短文案。

失败只写 `probe.skills = 'skipped: …'`，不影响工具本身（`startSprite` 里那段 `try`）。

> **约定（2026-11-13 起）**：`assets/skills/<name>/SKILL.md` 存在 = 这是一份内置 skill。
> 安装器 `installBundledSkills`（`src/sprite/skill.ts`，由 `startSprite` 调用）会扫 `assets/skills/`
> 下**每一个**带 `SKILL.md` 的目录，逐个铺到 `<dshHome>/skills/<name>/`，版本标记仍是
> `.dafeiyu-skill-version`。⇒ 新域只要把目录放对，就会被一起铺走，不需要再写一份安装逻辑
> （单个版本的 `installSpriteSkill` 保留给测试与"只想要一个"的场景）。
> ⚠️ 这条约定之前的形态是"每个域各接一次安装调用"——那正是会漂的形状，别退回去。

## 8. 前端那一半（如果你要加设置卡/面板）

- 源码在 `src/client/`，另一套编译面：`tsconfig.client.json`（DOM lib、`types: []`、`noEmit: true`）。
  `tsconfig.json` 明确 `exclude: ["src/client"]`，混着编译会到处 `Document is not defined`。
- 产物是 `dist/bundle/client.cjs`，**必须裹在 `window.__ModuleLoader__.load({ id, factory })` 里**，
  `id` 必须等于包名（`scripts/bundle-plugin.mjs` 顶部长注释；名字对不上就注册不上）。
- 打包脚本里有几条"错了就整页起不来"的断言（外壳形状、`react` 不许落在 factory 顶层、体积上限
  320 KB）。改前端产物后跑 `pnpm build`，别绕过它们。
