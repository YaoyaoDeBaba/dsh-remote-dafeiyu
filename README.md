# dsh-remote-dafeiyu

DSH 远程控制插件的**大肥鱼定制版**（基于上游 [`dsh-remote/plugin`](https://github.com/dsh-remote/plugin) 0.5.4，MIT）。

在官方插件的基础上加了三件事：

1. **三条新命令**：`cmd.rename_session`（改会话名）、`cmd.get_models`（模型清单）、`cmd.set_model`（切模型 + 推理档位）。
2. **设置页多一张卡**：`手机 App（安卓）` —— 二维码直接指向 APK 的最新构建，扫码即装。
3. 包名/版本独立：`dsh-remote-dafeiyu@0.6.0-dafeiyu.1`，与官方插件互斥（装了这个就不用再装官方那个）。

## 装法一：插件市场（推荐）

DSH → 插件 → **发现** → 添加索引源，填：

```
https://raw.githubusercontent.com/YaoyaoDeBaba/dsh-remote-dafeiyu/main/market/index.json
```

国内拉不动 raw 的话可以用 CDN：

```
https://cdn.jsdelivr.net/gh/YaoyaoDeBaba/dsh-remote-dafeiyu@main/market/index.json
```

然后在这条索引里点安装即可（安装规格是 `git+https://…#<commit>`，锁到具体提交，不会跑到一半变版本）。

## 装法二：直接用 git 地址装

在 profile 的 `package.json` 里把依赖换成：

```json
"dsh-remote-dafeiyu": "git+https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu.git#2daba53fe189d536774ffa1a99746abbb5cabd30"
```

## 手机 App

安卓 APK 走 GitHub Releases 的最新构建：

<https://github.com/YaoyaoDeBaba/dsh-pc-to-androidphone/releases/latest/download/app-debug.apk>

插件设置页里那张二维码指的就是这个地址；国内拉不动时，改 `src/copy/app-qr.ts` 里的常量重新构建即可换源。

## 与官方插件的差异（维护者看）

- `src/ports/index.ts`：内核端口新增 `renameSession` / `modelCatalog` / `selectModel`（都是可选方法，缺了会明确回失败）。
- `src/platform/carrier-services.ts`：三条端口在真实宿主上的实现。
- `src/core/runtime.ts`：`handleCommand` 里三条 `case`。
- `src/client/settings.ts` + `src/copy/app-qr.ts`：设置页那张「手机 App」卡。
- 协议侧在 [`dsh-remote-protocol`](https://github.com/YaoyaoDeBaba/dsh-remote-protocol)（同一份三条命令的 payload/schema 登记）。

## 构建

```bash
node <pnpm.cjs> install
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.client.json
node scripts/bundle-plugin.mjs     # 产物进 dist/bundle，**要一起提交**
```

`dist/bundle` 必须入库：市场按 commit 安装，装机时不会跑构建。

## 许可

MIT，见 `LICENSE`。上游版权归 `dsh-remote` 作者所有。
