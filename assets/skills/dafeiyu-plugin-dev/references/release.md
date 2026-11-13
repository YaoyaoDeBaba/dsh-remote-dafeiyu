# 发版：从改版本到用户装上

> 读这篇的场景：这一轮活干完、判据全绿，准备发一个新版本。
> 每一步都在下面给了"为什么"；跳步的代价在最末尾的表格里。

## 0. 前置

三样都过：

```powershell
$env:PATH = "$env:TEMP\pnpmshim;$env:PATH"
pnpm typecheck
pnpm build
node --test "dist/tests/*.test.js"      # 基线 929 项、fail 0（见 references/testing.md）
```

没全绿不发版。**别在自己的对话里重启宿主**——用户在跑别的会话（见 §5）。

## 1. 改版本号

`package.json` 的 `version`：`0.9.0-dafeiyu.N` → `0.9.0-dafeiyu.N+1`（单调加一，别跳号、别重排前缀）。

版本号不只是装饰，它有三处消费者：

- `scripts/bundle-plugin.mjs` 把它 `define` 成 `__DRC_VERSION__`，pill 上显示的版本就是它；
- skill 的版本标记 `.dafeiyu-skill-version` 用它判断"要不要把 `assets/skills/**` 整份重铺"
  （`src/sprite/skill.ts` 的安装器）；⇒ **改了 skill 正文却没升版本，用户那边不会更新**；
- market 的 `versions[]` 用它做安装选择。

## 2. 构建并提交产物

```powershell
pnpm build
git add -A
git commit -m "build: 0.9.0-dafeiyu.N"
```

为什么产物要入库：市场按 **git commit** 装机，装机时**不跑构建**（`README.md` 构建段）。
`dist/bundle/index.js` 与 `dist/bundle/client.cjs` 都在 `.gitignore` 的例外里（`!/dist/bundle/`）。
跳过这一步的表现是"版本号变了、功能没变"——因为用户装到的是上一个提交里的旧 bundle。

## 3. 打 tag、推

```powershell
git tag v0.9.0-dafeiyu.N
git push origin <分支>
git push origin v0.9.0-dafeiyu.N
```

现状可对照：`git tag --list --points-at <某个 commit>`。上一个版本 `.71` 的 tag 打在
**market 提交**（`45640e2`）上，而 market 条目与 profile pin 指向的是**build 提交**（`efa4cb5`）。

### ⚠️ 3.1 顺手把 `main` 快进到发版分支（2026-11-13 补）

**这一步漏了，仓库就是"一片旧版"。**

仓库有两条线：`main`（GitHub **默认分支**，别人打开仓库看到的就是它）和 `release-main`（发版线）。
2026-11-13 实测：`main` 停在 `82fac2e`（**11-05**），落后 `release-main` **152 个提交**。
后果不是"看不到新代码"这么轻——

- 任何人 `git clone` / 浏览器里翻代码，拿到的都是 8 天前的版本；
- README 里那个 `github:` 简写**跟的就是默认分支**，等于"按文档装的人装到旧版"；
- 只有走 market 或 commit-pin 的人才拿到新版 —— 而这两种恰恰是"懂行的人"才会用。

```powershell
# 纯快进（main 是 release-main 的祖先，不重写历史）
git push origin origin/release-main:refs/heads/main
# 验证两条线指向同一个提交
git rev-parse origin/main; git rev-parse origin/release-main
```

出过事之后的回退：`git push origin <旧 sha>:refs/heads/main`（要先把工作区切到那个提交，或用 `+` 强推）。

> 更彻底的解法是把 GitHub 的默认分支改成 `release-main`（仓库 Settings → Branches），
> 但那是网页操作，脚本里做不到；所以发版时**必须**手动快进 `main`。


## 4. 更新 market 索引

脚本：`%TEMP%\add-market-version.mjs`，四个参数 `(file, version, publishTimestamp, commit)`：

```powershell
node "$env:TEMP\add-market-version.mjs" market/index.json 0.9.0-dafeiyu.N <epoch秒> <build提交完整sha>
git add market/index.json
git commit -m "market: 0.9.0-dafeiyu.N"
git push origin <分支>
```

它会做的（读源码可核实）：

- 按 `name === 'dsh-remote-dafeiyu'` 找到自己那一条，往 `versions[]` **追加**（已存在同版本就不重复加）；
- 新条目形状：`{ version, publishTimestamp, source: { type:'git', url:'https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu', commit }, engines: { dsh: '>=0.2.1' } }`；
- 写完自检：文件小于 1000 字节就抛错（防"写了个空对象覆盖掉整份索引"）。

⚠️ `commit` 必须是**含 `dist/bundle` 的那个 build 提交**，不是这次的 market 提交。
填错的症状是"市场里能看到新版本，装上还是旧的"（或者干脆装不上）。

## 5. 改 profile pin、装、重启

```powershell
# C:\Users\htsd\.dsh\profiles\desktop\package.json
# dependencies["dsh-remote-dafeiyu"] = "git+https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu.git#<build提交sha>"
$env:PATH = "$env:TEMP\pnpmshim;$env:PATH"
pnpm install        # 在 profile 目录里跑
```

- pin 是 `#<sha>` 形式（当前 profile 里是 `#efa4cb5f…`，即 `.71` 的 build 提交）。
  别写分支名：分支会漂，而"这台机器装的是哪一版"是排错时第一个要回答的问题。
- `pnpm install` 会按 sha 重新解析并更新 `node_modules`。
- **重启宿主由用户做**：`dsh` 桌面应用重启会中断别的会话。把"改完了、需要重启"这句话
  交给用户，不要自己 kill/start 宿主进程。重启时机也有讲究：`dsh.profile.bundles` 里的条目
  与 `cordis.patch.yml` 都是**加载时**读的，不重启不会生效。

## 6. 发完自检

```powershell
git log --oneline -4                       # 期望：market: 0.9.0-dafeiyu.N / build: 0.9.0-dafeiyu.N / …
git tag --list 'v0.9.0-dafeiyu.*' | Select-Object -Last 3
# market/index.json 里最后一条 version 与 sha 对不对
Select-String -Path market/index.json -Pattern '"version"' | Select-Object -Last 1
```

用户重启后确认三件事：pill 上的版本号变了；新工具在模型侧出现（`tools` 注册成功）；
`<dshHome>/skills/<新域>/` 里出现了新铺的 skill 目录（若有配套 skill）。

## 7. 常见事故

| 症状 | 根因 | 判据/防法 |
|---|---|---|
| 版本变了、功能没变 | 忘了把 `dist/bundle` 一起提交（或 build 在 commit 之后才跑） | `git show --stat <build提交>` 里必须有 `dist/bundle/*` |
| 市场能看到版本，装机失败 | market 条目的 `commit` 填成了 market 提交（或填了分支名） | 条目里的 `commit` 必须是 build 提交的完整 40 位 sha |
| 插件整个不加载、启动无报错 | patch 的 `name` 与包名不一致 | `tests/plugin-metadata.test.ts:152-179` |
| 用户那边 skill 还是旧的 | 改了 `assets/skills/**` 但没升 `version`（版本标记没变 ⇒ 不重铺） | `src/sprite/skill.ts` 里对 `.dafeiyu-skill-version` 的判断 |
| 改了源码却没生效 | 改的是 `src/`，装的是 `dist/bundle` | 必须 `pnpm build` 并提交产物 |
| 自己重启把别人的会话打断 | — | 重启交给用户（§5） |
