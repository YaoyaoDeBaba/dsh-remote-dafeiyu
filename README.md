# dsh-remote-dafeiyu

DSH 远程控制插件的**大肥鱼定制版**（基于上游 [`dsh-remote/plugin`](https://github.com/dsh-remote/plugin) 0.5.4，MIT）。

在官方插件的基础上加了三件事：

1. **三条新命令**：`cmd.rename_session`（改会话名）、`cmd.get_models`（模型清单）、`cmd.set_model`（切模型 + 推理档位）。
2. **设置页多一张卡**：`手机 App（安卓）` —— 二维码直接指向 APK 的最新构建，扫码即装。
3. 包名/版本独立：`dsh-remote-dafeiyu@0.6.0-dafeiyu.1`，与官方插件互斥（装了这个就不用再装官方那个）。

## 装法一：插件市场（推荐）

需要 DSH 里已经有「插件 → 发现」这个 tab。DSH 的市场界面是实验功能，打包在
`@deepseek-ai/dsh-experimental-plugin-market-bundle` 里、**默认不启用**——只看到
「添加插件」一个输入框就属于这种情况，先把它加进 profile 的 `dsh.profile.bundles`
再重启（见「没有『发现』怎么办」）。

DSH → 插件 → **发现** → 添加索引源，填：

```
https://raw.githubusercontent.com/YaoyaoDeBaba/dsh-remote-dafeiyu/main/market/index.json
```

国内拉不动 raw 的话可以用 CDN：

```
https://cdn.jsdelivr.net/gh/YaoyaoDeBaba/dsh-remote-dafeiyu@main/market/index.json
```

然后在这条索引里点安装即可（安装规格是 `git+https://…#<commit>`，锁到具体提交，不会跑到一半变版本）。

## 装法二：插件页「添加插件」里填一行

没有「发现」的版本（市场是实验功能，默认不启用）也能装，输入框认这四种：

| 填什么 | 结果 |
| --- | --- |
| `dsh-remote-dafeiyu` | **只有发布到 npm 才行**，本仓库没发 npm，会被当成"注册表里查不到"拒掉 |
| `github:YaoyaoDeBaba/dsh-remote-dafeiyu` | ✓ 从 GitHub 拉，装最新 main |
| `https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu` | ✓ 同上 |
| `.../main/market/index.json` | ✗ 索引不是仓库地址，会报"无法连接 raw.githubusercontent.com" |

```text
github:YaoyaoDeBaba/dsh-remote-dafeiyu
```

`github:` 前缀不能省：不带前缀的 `YaoyaoDeBaba/dsh-remote-dafeiyu` 会被当成包名，
而包名规则不允许大写字母，直接被拒。

⚠️ `github:` 跟的是默认分支，每次安装都取当时的最新 main。要锁死版本就用下面这种带提交的写法。

## 装法三：锁到具体提交

在 profile 的 `package.json` 里把依赖换成：

```json
"dsh-remote-dafeiyu": "git+https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu.git#6c27483c4e42cf90d9165d9284aa24bfcb8dd18c"
```

同时要改三处，漏一处启动就会报找不到模块：

1. `dependencies` 里删掉 `@dsh-remote/plugin`、加上上面这一行（两者互斥，会抢同一个中转连接）；
2. `dsh.profile.bundles` 里同样把 `@dsh-remote/plugin` 换成 `dsh-remote-dafeiyu`；
3. `cordis.yml` 里那条插件登记（`id: dsh-remote-control`）的 `name` 改成 `dsh-remote-dafeiyu`。

然后 `pnpm install` 再重启。旧插件的配对密钥在 `~/.dsh/dsh-remote-control`，没动过就不用重新配对。

## 没有「发现」怎么办

`@deepseek-ai/dsh-experimental-plugin-market-bundle` 默认不在 bundles 列表里，插件页就只剩
「添加插件」。两种走法：

- 想用市场：往 `dsh.profile.bundles` 追加这个包名，重启后插件页会出现「发现」，再按装法一加索引；
- 不想动 bundles：用装法二（或插件页「添加插件」里直接填仓库地址 `https://github.com/YaoyaoDeBaba/dsh-remote-dafeiyu`）。

注意「添加插件」那个框要的是**仓库地址或包名**，填索引 JSON 的 URL 会被拒
（提示「无法连接 raw.githubusercontent.com…」），因为索引文件不是仓库。

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
