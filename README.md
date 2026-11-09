# dsh-remote-dafeiyu

DSH 远程控制插件的**大肥鱼定制版**（基于上游 [`dsh-remote/plugin`](https://github.com/dsh-remote/plugin) 0.5.4，MIT）。

在官方插件的基础上加了四件事：

1. **三条新命令**：`cmd.rename_session`（改会话名）、`cmd.get_models`（模型清单）、`cmd.set_model`（切模型 + 推理档位）。
2. **设置页多一张卡**：`手机 App（安卓）` —— 二维码直接指向 APK 的最新构建，扫码即装。
3. **设置页再多一张卡（0.7 起）：`会话备份（git）`** —— 把本机的会话记录定时推到你自己的**私有**仓库，换电脑一键拉回来。
4. 包名/版本独立：`dsh-remote-dafeiyu@0.7.0-dafeiyu.0`，与官方插件互斥（装了这个就不用再装官方那个）。
5. **识图（0.9.0 起）**：可接任意 OpenAI 兼容 / Responses / Anthropic / Gemini 端点，手机拍的照片发过来它能看懂。
6. **长期记忆（0.9.0 起）**：人设带一份按人设隔离的记忆库，模型自己记/读/忘，设置页里也能手动管。

## 会话备份（0.7 起）

一个插件管两件事：**远控**和**搬家**。备份默认**关闭**，装完不会自己上传任何东西。

配置在 设置 → 插件 → dsh-remote-dafeiyu → 「会话备份（git）」那张卡：

| 填什么 | 说明 |
| --- | --- |
| 仓库地址 | 一个**私有**仓库，例如 `https://github.com/你的账号/dsh-backup-主机名.git`（仓库要先用你的账号建好，空仓库即可） |
| 访问令牌（PAT） | GitHub → Settings → Developer settings → Personal access tokens，勾 `repo` 权限，只填一次 |
| 间隔（小时） | 默认 8。填 0 = 只手动备份 |
| 冷却天数 | 默认 15。多久没聊的会话转存到归档分支 |

跑起来之后仓库里长这样：

```
latest  分支（只有一个提交，每轮整体覆盖）
  sessions/<工作区>/session-<id>/session.v4.jsonl.zstd
  storages/*.json
  profiles/<名字>/{package.json,cordis.patch.yml,cordis.yml}
  attachments/**            （图片/文件附件，可在配置里关）
  MANIFEST.json             这一份快照的清单（每个会话的大小与校验和）
archive 分支（只增不改）
  <工作区>/session-<id>/session.v4.jsonl.zstd    ← 冷却的老会话
```

三条纪律：

1. **只留最新**：`latest` 每轮整体替换（孤儿提交 + force push），仓库不会越推越大。
2. **冷却即归档**：超过冷却天数没动的会话挪进 `archive`（不删；复活后又聊起来的会重新进 `latest`，归档那份不动）。
3. **凭据不出本机**：token 存 `~/.dsh/dsh-backup-git/credential.json`（0600），git 通过 `GIT_ASKPASS` 拿，**不进命令行、不进日志、不进仓库**。

换电脑：装同一个插件 → 填 URL + token → 点「从备份恢复」→ 重启飞鱼。
恢复时本机现有的 `sessions` / `storages` / `attachments` 会被改名成
`*.before-restore-<时间戳>` 留底（**不删除**），然后备份内容铺回去。

要求：本机有 `git`（`git --version` 能跑）。没有就装 [Git for Windows](https://git-scm.com/download/win)。

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

### 手机上只同步「有效消息」（0.7.0-dafeiyu.4 起）

工具调用的细节（工具名、参数预览、结果预览）**不下发手机**，实时流与历史回放都一样：
手机端能存的消息条数有限，工具行是里面最贵、最没用的一类。手机上只剩用户消息、助手回复，
以及待办清单、重试、压缩这类状态提示；「跑到第几步」仍然在状态摘要里看得到。

### 手机上能看主机上的图（0.7.0-dafeiyu.5 起）

DSH 在主机上干活时会产出静态效果图（Unity VFX 预览、截图之类），正文里通常就是一个路径。
现在手机端会把这些路径认出来，变成一颗「🖼 xxx.png · 点我看图」的按钮：

- **点了才拉**：不点不花流量（按用户要求做的选择，不做自动下载）。
- **分块传**：中继单帧硬上限 1MB，一帧里只能装约 580KB 原图，整张图会被掐断连接（App 直接掉线）。
  所以协议上只定义了「取一块」（`cmd.file_image`，带 `offset`），手机按 `next` 一直取到空，
  本地拼成 Blob 再显示。一张 3MB 的预览图大约 12 块。
- **只读、只认图片**：扩展名白名单 `png/jpg/jpeg/webp/gif/bmp`，单文件上限 20MB；
  路径必须是不带空格的绝对路径或写在反引号/引号里（带空格也能认）。
- 手机端要 **App 也升到最新版**（旧 App 不认识这条命令，点了只会超时）。

### 手机上常驻一只大肥鱼（占位形象，0.9.x 起）

手机 App 界面上多了一只可拖动的小鲸鱼：电脑端在跑活时它会上下晃，点一下冒个小气泡
（当前会话名 + 在回话/空闲），位置记在本机、重启还在。素材到了之前是内联 SVG 占位画。

换真皮：把 `idle.png` / `think.png`（各 ≤256px）放进手机仓库的 `app/src/main/assets/fish/`，
重新出包即可 —— 图片在就用图片，缺了或加载失败自动退回占位画，交互逻辑一行都不用改。

## 小云雀工具（0.9.0-dafeiyu.11 起）

「大肥鱼 → 小云雀」分栏里填 **Access Key**，模型就多了四个工具：

- `generate_image`：文生图 / 参考图编辑，返回本地文件路径；
- `generate_video`：文生视频 / 参考图生视频（默认 `Seedance_2.0_mini_lite`，约 4 积分/秒），返回本地 mp4；
- `xyq_balance`：查剩余积分；
- `xyq_models`：查可用模型（先查再用，不猜模型名）。

实现走官方 CLI（`pippit-tool-cli`），插件只负责：定位/安装 CLI、把 Key 经环境变量交给它、轮询下载、额度与时长上限。
Access Key 在 小云雀官网 → ⚡CLI/API → API → 管理 Access Key 新建；**它有时效**，过期后工具会明确提示去更新。

## 子代理监视器（0.9.0-dafeiyu.6 起）

DSH 里派出去的 subagent 现在有地方看了：

- **桌面端**：当前对话有子代理时，右侧出现一颗 🐝 图标；点开是面板——任务、运行/空闲、
  工作时长、闲置时长。闲置超过 2 小时的行标黄，可以一键归档（可恢复，不删文件）。
- **手机端**：进对话页后出现同样的图标（带数量角标），面板内容一致。

数据全部来自宿主现成事实：子会话头的 `parentSession`、`agents.get().status`、子会话日志里的
第一条用户消息与 `turn/start…turn/end` 时间戳。不需要额外落盘，也不影响远控主链路。

## 识图（0.9.0 起）

`大肥鱼 → 人设` 分栏底部有「识图」配置块：填 API 地址、Key、模型名，选协议
（OpenAI 兼容 / Responses / Anthropic / Gemini / 自定义模板），保存后可以用右下角的
悬浮按钮拍/选一张图试。开启后会多一个 `dafeiyu:vision` 提示段和一个 `recognize_image` 工具；
识别结果以 `【图片识别】` 文本进会话，**不是**把原图交给模型。改配置后要重启 DSH 才会重挂提示段。

## 长期记忆（0.9.0 起）

每个人设一本记忆库，落 `~/.dsh/storages/dsh-remote-dafeiyu/memory/<personaId>.json`：

- **模型自己记**：`record_memory` / `read_memory` / `forget_memory` 三个工具；
- **注入有预算**：每轮把人设的那本记忆拼成 `dafeiyu:memory` 段（800 字封顶，按重要度 → 新近度），
  超预算的条目只是这轮不注入，不删；
- **能管**：设置页「人设」分栏里可以按人设切换、手动加（普通/重要/关键）、删单条、清空；
- 同一个人设最多 100 条，超了淘汰「最不重要 + 最旧」。

## 与官方插件的差异（维护者看）

- `src/ports/index.ts`：内核端口新增 `renameSession` / `modelCatalog` / `selectModel`（都是可选方法，缺了会明确回失败）。
- `src/platform/carrier-services.ts`：三条端口在真实宿主上的实现。
- `src/core/runtime.ts`：`handleCommand` 里四条 `case`（含 `cmd.file_image`）。
- `src/core/file-image.ts`：看图的实现体（只读分块 + 扩展名/大小闸）。
- `src/client/settings.ts` + `src/copy/app-qr.ts`：设置页那张「手机 App」卡。
- `src/vision/*`：识图（配置/协议/服务/路由/提示段与工具）。
- `src/memory/*`：长期记忆（服务/路由/工具）；人设宿主的 `dafeiyu:memory` 段在 `src/persona/host.ts`。
- 协议侧在 [`dsh-remote-protocol`](https://github.com/YaoyaoDeBaba/dsh-remote-protocol)（同一份命令的 payload/schema 登记）。

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
