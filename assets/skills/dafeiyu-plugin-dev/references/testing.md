# 判据：怎么写、怎么跑、红了先看哪

> 读这篇的场景：要给自己新加的工具补测试，或者测试红了但看不出为什么。
> 命令、基线、四个常用套路、三条纪律。

## 1. 跑法与基线

环境（这台机器）：

```
node : C:\Users\htsd\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
pnpm : …\dependencies\pnpm\bin\pnpm.mjs
```

仓库脚本内部会再调 `pnpm`，所以**先把 `%TEMP%\pnpmshim` 放到 PATH 最前**（里面是 `pnpm.cmd`）。

```powershell
$env:PATH = "$env:TEMP\pnpmshim;$env:PATH"
pnpm typecheck                                  # tsc --noEmit + tsconfig.client.json（noEmit，不写盘）
pnpm build                                      # clean + 两个编译面 + esbuild 打 bundle
node --test "dist/tests/*.test.js"              # 跑判据（先 build 才有新产物）
```

一次全绿（`pnpm build && node --test`）可以写成 `pnpm test`（`package.json:68`）。

**基线（2026-11-13，`dist` 已构建时实测）**：`tests 929 / pass 912 / fail 0 / skipped 17`，
耗时约 24.5 秒。同轮还有别的 agent 在加用例，所以这个数会往上走——**以你自己那次 build 之后的
输出为准**，标准只有一个：`fail 0`。`skipped` 那 17 条是既有的
"本机没有 git / win32 没有 POSIX 权限位"类用例（`tests/test-platform.ts:18-32`），**别动它们**。

⚠️ `pnpm build` 会 `rm -rf dist` 重建 —— 而 `dist/bundle` 是**入库产物**。所以：
只写文档/只加 `assets/` 时**不要顺手 build**（会把别人的 bundle 一起改动）；真要 build 就在
你自己那一轮里把它当"要提交的产物"对待（见 `references/release.md`）。

## 2. 文件与定位

- 一个域一两个文件：`tests/<域>.test.ts`（能跑起来的整体）和 `tests/<域>-<细节>.test.ts`
  （某个判据的现场，例：`tests/sprite-scan.test.ts`、`tests/sprite-export-meta.test.ts`）。
- **不要写死 `..` 去认包根**：测试会被编译到 `dist/tests/` 再跑。两种正确写法：
  - 按包名往上找（`tests/plugin-metadata.test.ts:36-50` 的 `packageRoot()`）；
  - `path.resolve(dirname(fileURLToPath(import.meta.url)), '../..')` 两级上去（`tests/sprite-scan.test.ts:33`）。
    这条 `..` 只能用在"dist/tests → 仓根"这一层关系上，`assets/` 也在仓根，别再多加一级。
- 临时目录一律 `mkdtempSync(join(tmpdir(), 'drc-xxx-'))` + `finally rmSync`（`tests/sprite-skill.test.ts`
  里几个用例都是这个形状），别往仓库里写。

## 3. 三条纪律

### 纪律一：先写判据，再写实现

判据先落在测试里，实现是"让它变绿"。理由不是教条：这个仓库的判据经常是**唯一**能说清
"我们到底要什么"的地方（`tests/sprite-export-meta.test.ts:2-8` 就是先写"meta 三个键一个都不许丢"）。

### 纪律二：判据要能红（反向判据 + 夹具自检）

一条永远为真的断言等于没写。所以：

- 断言前先**自检夹具**："真清单必须是齐的，否则下面的变异证明不了任何东西"
  （`tests/plugin-metadata.test.ts:118-121`）；
- 再做**反向判据**：手工构造"去掉 icon / 两份词典写成同一句 / 把 locale 从 files 里摘掉"，
  逐条断言"这时那条规则必须不成立"（`:118-137`）。

### 纪律三：每个"曾经踩过的坑"都变成一条测试，且测试名要写它防的是什么

对照表（都能直接读）：

| 事故 | 判据 | 测试名怎么写的 |
|---|---|---|
| patch 的 `name` 写成旧包名 ⇒ 插件静默不加载 | `tests/plugin-metadata.test.ts:152-179` | `cordis.patch.yml：insert 的 name 必须等于包名，否则插件静默不加载` |
| 锚点只 `setAnchor` 不回读 ⇒ meta 里 `anchorX` 变 `undefined` | `tests/sprite-export-meta.test.ts:71-114` | `P0-1：传了 anchorX/anchorY 时先 setAnchor、再 getAnchor 回读，落盘 meta 键齐全` |
| 指南三处漂移（文档一套、工具一套） | `tests/sprite-skill.test.ts`（用例 `sprite_guide 的正文 = SKILL.md 去掉 frontmatter`） | `sprite_guide 的正文 = SKILL.md 去掉 frontmatter` |
| 新建 skill 时复制粘贴忘改 `name` | `tests/sprite-skill.test.ts`（用例 `随包的真实 skills 目录里，每份 SKILL.md 的 name 都等于目录名`） | 名字与目录不一致 ⇒ 模型按目录名加载会失败 |
| `minRun` 没给，被 4 行呆毛骗走 | `tests/sprite-scan.test.ts:36-46`（夹具里埋了干扰带） | 用例名里直接写"没有 minRun 就会认错" |

写法上就一句话：**名字里带"否则会怎样"**，别叫 `test tool works`。

## 4. 四个常用套路

### 套路 A：纯函数 + 空壳 service（不碰浏览器/网络）

把可判定的逻辑抽成纯函数（`src/sprite/scan.ts`、`src/sprite/guard.ts` 都是这么来的，
理由写在 `src/sprite/guard.ts:1-6`），测试里给它喂向量。
工具层用**只记录调用的空壳 service**：`tests/sprite-tools.test.ts:16-35` 的 `stubService()`——
不需要真跑浏览器，就能断言"参数有没有原样转下去"。

### 套路 B：页面桩（跨进程/跨语言时唯一划算的做法）

像素只在浏览器里，Node 侧测不到 canvas。做法是**照抄页面那个函数的真实返回形状**写一个桩：

```ts
/* 页面 setAnchor 的真实返回：归一化后的 x/y，没有 anchorX/anchorY/convention/pixels */
setAnchor: (opts) => ({ ok: true, x: opts?.x ?? 0.5, y: opts?.y ?? 0 }),
getAnchor: () => ({ ok: true, anchorX: 0.4164, anchorY: 0.9375, convention: 'y-from-bottom', … }),
```

（`tests/sprite-export-meta.test.ts:26-53`）。前提写在注释里：**形状照抄 HTML**，页面一改就同步。
最后一步别忘了**落盘回读**：`JSON.stringify` 写出去再读回来，才验得出 `undefined` 被吞掉的形状
（`:59-69`）。

### 套路 C：parity（同一份逻辑有两份实现时的唯一出路）

跨端的东西（TS 参考实现 ↔ 页面里真正跑的那份）必须有对拍，否则迟早一边改了另一边没跟。

现成范式：`tests/sprite-scan.test.ts:259-270`

```ts
const begin = html.indexOf('/* ==== SCAN-PRIMITIVES-BEGIN ==== */')
const end   = html.indexOf('/* ==== SCAN-PRIMITIVES-END ==== */')
assert.ok(begin > 0, 'sprite-tool.html 里找不到 SCAN-PRIMITIVES-BEGIN 标记（parity 无从校验）')
const source = html.slice(begin, end)
const factory = new Function(source + '\nreturn spriteScanPrimitives();')
```

然后喂**同一批向量**给两边，逐字段 `assert.equal` / `deepEqual`（`:272-390`）。
三条要点：

1. 页面里那段必须**显式标记** `BEGIN/END`，且标记本身要断言（找不到就红，别静默跳过）；
2. 向量要包含**边界与异常**（`NaN`、越界、`null`、非法枚举），别只测顺路；
3. 同样的枚举清单还要和 schema 对一遍（`:392-426`），保证"schema 能表达实现认的每一个值"。

### 套路 D：跳过要带原因

用 `{ skip: false | '原因' }` 形态（`tests/test-platform.ts:51-59` 提供了
`skipUnlessPosix()` / `skipIfCannotChmodDir()`）。**不许**写一个"前提造不出来所以悄悄通过"的用例：
那是最坏的假绿（`tests/test-platform.ts:14-22` 写清了这一点）。

## 5. 红了先看哪

| 症状 | 先查 |
|---|---|
| `Cannot find module '../src/...'` | 有没有先 `pnpm build`（测试跑的是 `dist/`，不是 `src/`） |
| parity 用例红，报"漂了" | 两边是否只改了一边；`BEGIN/END` 段是否被人挪动/重排 |
| 断言 `NaN`/`undefined` 相等 | 是不是断言了 `deepEqual` 里带 `undefined` 的键（`JSON.stringify` 会吞掉它） |
| 找不到 assets | `dist/tests` 往上两级才是仓根，别多加一级 |
| typecheck 过而 build 红 | esbuild 只打包不校验；build 里挂了通常是 `scripts/bundle-plugin.mjs` 的形状断言（外壳/react/体积），看它的报错原文 |

## 6. 两条别做

1. **别为了让判据变绿去改判据**（改判据等于删掉这条事故的免疫）。
2. **别在判据里写死"本应等于包名"的字符串**——`scripts/bundle-plugin.mjs` 的注释记着教训：
   写死之后包名一改，判据和实现一起漂，而它红着没人管过一段时间。应当比较的是
   `MANIFEST.name`，不是字面量。
