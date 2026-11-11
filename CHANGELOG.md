## 0.9.0-dafeiyu.43 —— 修推送 `Failed to fetch`（跨源预检 OPTIONS 405）

- 现场：`POST /guidance/push` 在宿主侧 200 正常，浏览器却报 `Failed to fetch`；
  抓预检：`OPTIONS` 返回 **405**（只处理 POST），浏览器直接拦掉真正的 POST；
- 修复：所有带 CORS 的写路由统一处理 `OPTIONS` → 204 + `Access-Control-Max-Age`，
  覆盖派活助手（配置/推送/归档）、小云雀、识图、记忆、备份、pill 配置等；
- 这同时修好了所有 JSON POST（之前只是推送按钮最常被点）。

## 0.9.0-dafeiyu.42 —— 派活助手列表：catalog 优先 + 错误可见 + 命名格式提示

- 列表成员改问 `subagents.listChildren/listDescendants`（纯内存投影，带 label），不再每次
  全量扫会话头；catalog 缺失时才退回 sessionQuery，且上限压到 2 秒；
- **读取失败不再悄悄清空**：面板底部显示「读取失败：…」，保留上一次列表；取不到当前会话也会提示；
- 命名不合规的行显示「未按要求填写 · 正确格式：名称｜一句话简述」；
- 测试同步为 catalog-first（新增 catalog 存在时无需 sessionQuery、以及两者都缺才抛错）。

## 0.9.0-dafeiyu.41 —— 子代理列表改读内存 catalog（不再碰会话头/日志）

- 上一版用 `sessions.list()` 拿不到 `parentSession`（它是扁平行），而且旧路径仍会读全部会话头；
- 现在优先问 `subagents` 投影 catalog 的 `listChildren/listDescendants`（纯内存、带 label），
  成员 id 直接从 catalog 拿，创建时间/运行态再按需读活 agent 会话头；
- 只有该代宿主没有 catalog 时才退回 `sessionQuery.listSessions`，且超时上限压到 2 秒；
- 这样“碰过派活助手 → 切会话要载入历史”的连带效应应消失（面板刷新不再触发磁盘读）。

## 0.9.0-dafeiyu.40 —— 子代理列表改读 live 会话，修“读不到子代理”

- 现场：`GET /subagents?sessionId=…` 在大会话/多会话环境下卡满 15s 超时，面板因此空白；
  根因是列表走了 `sessionQuery.listSessions`（要读全部持久化会话头）。
- 改为优先用内存里的 live sessions（`services.sessions.list()`）：秒级、不碰磁盘，
  也完全不参与 sessionQuery 那 5 格 LRU；只有这一代宿主不给 sessions 时才退回旧路径。
- 说明：派活助手本身**不是 agent 调用的工具**，agent 派活仍走内置 `subagent` 工具；
  插件负责把「名称｜简述」规范注入 + 监视/验收展示。

## 0.9.0-dafeiyu.39 —— 修派活助手“推送后重开闪退”

- 根因：面板刷新到「当前会话没有子代理」时会自动 `setOpen(false)`；推送本会话后注入消息会
  触发一次刷新/上下文更新，拿到的列表为空或会话 id 暂时为空，于是手动打开的面板被瞬间关闭；
- 修复：
  - 空列表不再自动关面板，改为显示空态；
  - 拿不到当前会话时不再清空并关闭（保留面板，等下一次刷新）；
  - 保留上一版的 250ms 打开点击防误关，以及放大/拖动。

## 0.9.0-dafeiyu.38 —— 工具面板支持拖动

- 派活助手 / 小云雀 / 识图三个悬浮面板：按住标题栏即可拖动，位置按面板记在
  `localStorage['drc.panelPos.<key>']`，刷新后保留；
- 双击标题栏复位到底部/右侧默认位置；
- 拖动时自动限制在窗口内；标题栏里的按钮（刷新/关闭/齿轮）仍然正常点击，不会触发拖动。

## 0.9.0-dafeiyu.37 —— 面板放大 + 派活助手闪退修复

- 派活助手 / 小云雀 / 识图三个面板统一放大：宽 480px、最大高度 76–80vh、内边距 16px、
  字号 13.5px、行高 1.55，不再挤在一起；
- 修复「派活助手打开一次后再打开就闪退」：从形象菜单打开面板的那一次 click 会继续冒泡到
  document，被外部点击处理器当成“点了外面”立刻关闭；现在打开后 250ms 内的点击忽略；
- 顺手清理了早前替换留下的无效 `var(#xxxxxx)` 写法（背景/边框/文字色现在都是显式值）。

## 0.9.0-dafeiyu.36 —— 锚点改为按需显示

- 「设置 → 大肥鱼 → 形象」里的锚点参考线**默认隐藏**，改为「显示锚点 / 隐藏锚点」按钮控制；
- 锚点错位问题已确认是精灵图输出工具那边的事，插件保持排查开关即可。

## 0.9.0-dafeiyu.35 —— 形象预览显示锚点

- 设置 → 大肥鱼 → 形象：预览上叠加锚点（红=脚底基线、蓝=水平中心、黄圈=锚点位置），
  右上角标注当前 `anchorX/anchorY`；默认显示，可点「隐藏锚点」关掉；
- 方便直接对照「蹭得累」和其它动作到底谁歪；
- 数据侧同步实测（v6）：8 个动作脚底中位数都在 255/267，bbox 中心都在 99.5–100/200
  （即整条动作的中位位置一致；tsundere 帧间中心 ±4px 属于动作本身的扭头）。

## 0.9.0-dafeiyu.34 —— 派活助手不再读会话日志（B 方案）

- 删除 `probeSubagent` 的 `readSession`：子代理的工作时长改为**事件流累计**
  （`turn/start` → `turn/end`，配合 runningSince 算本轮时长），最后活动时间沿用 `session/event`；
- 派活助手现在完全不碰 `sessionQuery.readSession`，不会再占用/挤出 DSH 那个 **5 格 LRU**
  （`preparedSessionCacheSize = 5`）导致桌面端冷读“载入历史…”；
- 任务文本/标题此前已不下发、不显示，这次把唯一还会读日志的探针也去掉了；
- 判据：subagents 单测同步更新（不再有日志回合差），全量 813 项通过。

## 0.9.0-dafeiyu.33 —— 派活助手改为事件驱动（SSE），不再定时轮询

- 宿主新增 `GET /subagents/stream`（SSE）：子代理环状态变化、或已识别子代理会话有新事件时推送
  （400ms 合并），客户端收到才刷新；
- 客户端移除 3s/20s 定时轮询：改为 EventSource 订阅 + 窗口 focus 刷新 + 面板「刷新」按钮；
  EventSource 不可用/断开时退回 30s 慢轮询兜底；
- 减少的读取：没有变化时完全不再调 `listSubagents`（也就不会读会话日志）。

## 0.9.0-dafeiyu.32 —— 降低宿主轮询/日志读取造成的 GC 抖动

- 排查手机端“能连上但加载不出会话”：宿主进程 2.6–3.4GB 抖动，继电器在线但 `paired=0`，
  判断是宿主 GC/心跳被拖垮导致配对通道断开；
- 我方最可疑的垃圾来源：子代理监视器调用 `readSession` **整份日志**，旧 TTL 是
  运行中 5 秒 / 空闲 60 秒，而监视器每 3 秒轮询 → 反复把几十 MB 日志读进内存；
- 修复：
  - 日志探针 TTL 改为 运行中 60 秒 / 空闲 10 分钟（工作时间/闲置时间仍由事件流与 runningSince 支撑）；
  - 子代理列表不再读取标题快照（界面已不显示 title）；
  - 客户端监视器改为自适应：无子代理 20 秒、有子代理/面板打开 3 秒；
  - 手机端会话状态兜底轮询 2 秒 → 5 秒；
- 这是止血，不是对“3GB 堆”的最终定论；后续仍建议加内存诊断路由做长周期观测。

## 0.9.0-dafeiyu.31 —— 面板白底蓝字 + 派活规范改为「只推当前会话」

- 派活助手 / 小云雀 / 肥鱼识图三个面板统一改成**白底**（#ffffff），文字用深蓝（#1d4ed8 / #1d3f8f），
  不再有透明底；输入框/下拉/按钮都跟随白底；
- 移除设置页里的「推送到所有在线会话」（派活助手、小云雀两处）；
- 派活助手面板顶栏新增 **「推送本会话」**：只把包工头/派活规范推到**当前打开的会话**，
  方便小范围测试与应用；宿主路由支持 `sessionId` 过滤，找不到目标会话会如实报错。

## 0.9.0-dafeiyu.30 —— 修复推送注入缺 id 导致会话历史损坏

- 事故：`guidance-push` 调 `agent.inject()` 时没给消息 id，会话里 `inbox/spliced.inserted[0]`
  与 `user/message` 两处对不上，回放时同一条消息被当成两条、整段历史读坏（用户手动修过会话文件）；
- 修复：注入消息补 `id`（`crypto.randomUUID()`，不可用时回退时间戳+随机串），并加了注释说明原因；
- 判据：pusher 单测断言「id 非空、两次推送 id 不同」，全量 813 项。

## 0.9.0-dafeiyu.29 —— 小云雀模型标识修正（生图用名称、生视频用 key）

- 报错「未找到可用模型 Seedance 2.0 Mini 体验版」的根因：面板把**显示名**当成提交标识传给了 CLI，
  生视频模型必须用 key（如 `Seedance_2.0_mini_lite`），生图模型才用完整名称；
- 模型列表现在同时返回 key+name；生图模型 `key = name`（CLI 只有名称），生视频用 key；
- 面板下拉显示名称、提交用 key；`model describe` 也按 key 查询；
- 顺手把「未找到可用模型…」这类 CLI 文本错误原样回给用户，不再包一层“无法解析的内容”。

## 0.9.0-dafeiyu.28 —— 派活助手：包工头模式 / 亲力亲为回退

- 提示词重写：默认让模型当「包工头」——能拆就拆、主动派活、盯进度、验收、写总结、和用户聊方案，
  自己少亲自动手；并重申「名称｜简述」命名规范；
- 新增派活风格 `mode`：`foreman`（默认）/ `hands-on`（回退：自己动手为主，别为了派活而派活）；
- 设置页「派活助手」新增下拉切换，切换后**重启 DSH 生效**；提示词预览与「推送」都按当前风格；
- 配置落 `subagents.json` 的 `mode` 字段。

## 0.9.0-dafeiyu.27 —— 三个面板统一「黑底蓝字」

- 派活助手 / 小云雀 / 肥鱼识图 统一配色：背景 #0d1117、正文 #7fb0ff、次级 #5f8fe0、边框 #1f3b63；
- 关闭按钮统一为蓝色加粗「✕」（识图/小云雀标题栏，派活助手是「关闭 ✕」），在浅色/深色主题下都能看见；
- 之前部分文字用的是主题变量，在某些主题下解析成黑底黑字，这次全部改成显式颜色。

## 0.9.0-dafeiyu.26 —— 识图面板可关闭

- 入口收进形象菜单后，识图面板原来只能靠再点一次已隐藏的 🐳 关闭，等于关不掉；
- 面板标题栏新增「✕」，支持 Esc 关闭；菜单再次点击也会切换开/关。

## 0.9.0-dafeiyu.25 —— 小云雀面板升级为生成工作台

- 面板：prompt 输入框、模型下拉（合并生图/生视频，选中即切参数）；
- 生图参数：比例（模型返回的枚举+label）、分辨率、数量；
- 视频参数：时长（模型 min~max）、画幅比例、分辨率（可选）；
- 显示预计消耗积分（已知单价模型的参考值；未知模型显示“以实际扣费为准”）与当前余额；
- 生成 → 提交后每 2.5s 轮询，成功后直接预览图片/视频；
- 右上角 ⚙ 二级窗口可输入/保存 Access Key（复用 `/xyq/config`）；
- 宿主新增 `GET /xyq/describe`、`POST /xyq/generate`、`GET /xyq/result`、`GET /xyq/file`（产物目录限制在 storages/…/xyq-output）。

## 0.9.0-dafeiyu.24 —— 派活助手界面卡片化

- 子代理以**卡片**显示：名称、任务简述、状态（工作中=黄字 / 空闲=绿字）、工作时间/闲置时间（互斥）；
- **不再显示指令正文**：宿主不再下发 task/title；不合规的命名也不下发名字/简述；
- 不合规时显示「子代理N / 未按要求填写」（N 按出现顺序自增，同一面板内稳定）；
- 顶栏新增「恢复归档子代理」：显示本面板归档过的子代理（存 localStorage 台账），可逐条恢复；
- 手机端同步这套显示规则（子代理N / 未按要求填写）。

## 0.9.0-dafeiyu.23 —— 入口收进虚拟形象

- 去掉形象脚下的「拖动换位置 · 点按逗它」提示文字（拖动仍可用、双击仍复位）；
- **点击形象 → 展开功能菜单**：派活助手 / 小云雀 / 肥鱼识图 / 戳一下；
- 独立的 🐝（派活助手）与 🐳（识图）悬浮按钮不再显示，面板仍由菜单打开；
- 新增「小云雀」快捷面板：显示 Access Key 状态与剩余积分，刷新即可，详细配置仍在 设置 → 大肥鱼 → 小云雀；
- 判据：全量 813 项（796 通过 / 17 跳过 / 0 失败），客户端包 279KB。

## 0.9.0-dafeiyu.22 —— 修复「推送到所有在线会话」

- 根因 1：`startSubagents` 里 `pushGuidance` 的接线没落地（类型修完后那段替换没匹配上），路由存在但 `deps.pushGuidance` 为空 → 503；
- 根因 2：设置页用 `${BASE}/../guidance/push`，`..` 归一化后请求没打到宿主 → 浏览器报 `Failed to fetch`；
- 现在：push 用绝对路径 `/api/dsh-remote-dafeiyu/guidance/push`；宿主侧真正接上 `createGuidancePusher`（懒取 `ctx.get('agents')`，逐个 `agent.inject`），并带「已推送 N/M」回执；
- 失败提示改成「网络错误（…）——宿主可能还没重启到最新插件」。

## 0.9.0-dafeiyu.21 —— 形象切换不再闪白（双层交叉 + 小图）

- 闪白的根因不是没预加载，而是**单层元素替换 background-image 时浏览器要重新光栅化**
  （2400×2400 大图 + drop-shadow 更明显），中间会有一帧空白。
- 改成双图层：新动作先画在后台层并抬到最上层，**下一帧**再隐藏旧层——旧帧一直可见；
- 素材同步缩小：格子 300×400 → **200×267**（webp ~750KB，仍是统一比例、脚底/中心不变），
  光栅化成本更低；
- manifest 升 v5，sheet URL 带版本号；手机端同步 v5 素材。

## 0.9.0-dafeiyu.20 —— 形象显示固定 3:4 窗口

- 之前小窗画布比例跟着每个动作的 `cellWidth/cellHeight` 变（v2 素材各动作格子尺寸不同：256×348、259×380…），
  切动作时盒子高度变化，看起来就是“人物忽大忽小/被拉伸”。
- 现在：小窗与设置页预览都固定 **3:4** 画布（132×176 / 宽高固定），背景按 800%×600% 铺格；
  配合 v3 素材统一 300×400 格子，任何动作都 1:1 落在同一窗口，不再缩放。
- 素材本身校验：8 个动作人物像素高度中位数 344–350（±1.7%），源本身是统一的，问题在显示层。

## 0.9.0-dafeiyu.19 —— 形象素材脚底锚点对齐

- 之前直接按原始格子切图，各动作/各帧在格子里的位置没归一（角色中心差最大 29px、脚底差 34px），
  池子切动作时就“飘”。
- 新管线：每个动作统一叠到 **300×400 固定画布**，脚底对齐到 y=382、水平中心对齐到 x=150；
  偏移按**整条动作取中位数**（不是逐帧），所以动作本身的跳/晃保留，跨动作不再跳位；
- 校验：8 个动作第 0 帧脚底都在 382（dance 384 / tsundere 381，误差 ≤2px）；
- manifest 升到 v3（原生格子尺寸 + 锚点），并给 sheet URL 带版本号、manifest 加 no-store，
  避免浏览器 24h 缓存继续吃旧素材；
- 手机端 idle/think/talk 也换成对齐后的素材。

## 0.9.0-dafeiyu.18 —— 新一版动画素材 + 切换不闪白

- 素材替换为重新导出的一版（边缘更干净）：转换时加了 **despill 去绿边**（把 alpha>0 像素的 G 压到 max(R,B)）+ 低 alpha 碎点清零；
  每张 webp 降到 ~1MB（原 1.5–2.6MB），manifest 改用素材原生格子尺寸（cell 约 250×350），不再放大；
- **修复切换动画时一瞬间空白**：聊天页小窗挂载后预加载并 `decode()` 全部 sheet，切换动作只在已解码图上换背景；
  目标动作还没就绪时先挂起（同一 clip 等待），不白屏；
- 手机端同步替换 idle/think/talk 三张新素材，ui-test 全绿。

## 0.9.0-dafeiyu.17 —— 修复形象小窗重复挂载导致动画重叠

- 客户端插件 apply 可能被调用多次（或热更新），旧实例没拆就会叠出好几个鲸鱼娘；
- 挂载前先调用上一次的 cleanup + 清掉 DOM 里同 id 的残留节点，挂载后登记 cleanup；
- 每次状态轮询再做一次“同 id 只留自己”的兜底清理；
- 没有行为变化，纯粹去重；重启后生效。

## 0.9.0-dafeiyu.16 —— 形象：一个状态对应多种动画

- 语义状态不再绑死一个动作，改成**动作池**（权重随机，播完一轮再挑，尽量不连着重复）：
  - 待机：待机 / 打盹 / 吃饭；
  - 干活：动脑 / 吃饭 / 偷吃；
  - 交付：讲话 / 跳舞 / 蹭得累；
- 点一下小窗 = **逗它**：先播「蹭得累」1.8 秒再回当前状态（原来的点按暂停取消，拖动/双击复位保留）；
- 池里引用但素材缺失的动作自动跳过，不影响其余；
- 手机端暂仍是 idle/think/talk 三态（素材打包体积考虑），要同步再加。

## 0.9.0-dafeiyu.15 —— 形象小窗：默认右侧 + 可拖动

- PC 聊天页的形象小窗默认贴**右上角**（会话列表在左、输入框在底，都不挡）；
- 支持按住拖动换位置，位置记在 `localStorage`（`drc.avatarWidgetPos`），刷新后保持；
- 双击小窗回到默认位置；窗口缩放时自动夹回可视区；
- 点按暂停/继续保留；手机端本来就是右侧可拖动，这轮只改 PC。

## 0.9.0-dafeiyu.14 —— 形象接入聊天页 + 自动切动作 + 手机端

- **聊天页形象小窗**：左下角 132px 的鲸鱼娘 sprite，点一下暂停/继续；
- **按 agent 状态自动切动作**：干活 → 动脑（think）；回复到达 → 讲话（talk，2.5 秒）；空闲 → 待机（idle）；
  状态来自新路由 `GET /api/dsh-remote-dafeiyu/avatar/state?sessionId=`（`agents.get(id).status`）；
- **协议**：`@dsh-remote/protocol` 升到 `67149a6`，新增 `cmd.avatar_manifest` / `cmd.avatar_sheet`
  （手机端可按需拉 webp；PC 走回环 HTTP）；
- **手机端**：悬浮鲸鱼升级为 8 动作素材里的 idle/think/talk 三态（新 webp 替换旧的占位图），
  消息到达自动切讲话、跑任务切动脑、其余待机；ui-test 增加 talk 窗口判据；
- 判据：avatar 单测 4 条（含协议能力 manifest/sheet/非法 id/缺目录）+ 全量 813 项（796 通过 / 17 跳过）。

## 0.9.0-dafeiyu.13 —— 虚拟形象（8 动作 sprite）

- 「大肥鱼 → 形象」不再占位：播放 8 个动作的 sprite 动画（待机/讲话/动脑/蹭得累/吃饭/打盹/跳舞/偷吃），
  动作按钮切换、24fps 循环、可暂停；
- 素材管线：原始 8×6 序列帧 PNG（每张 ~40MB）转成 `manifest.json` + 8 张 webp（~1.5–2.6MB），
  落在 `storages/dsh-remote-dafeiyu/avatar/`；
- 宿主新路由：`GET /api/dsh-remote-dafeiyu/avatar/manifest` 与 `/avatar/sheet?id=<动作>`（只读、回环、
  id 白名单 + 路径穿越防护、长缓存）；
- 客户端只改 `background-position`（800%×600% 背景网格），不重建 DOM；
- 判据：avatar 单测 3 条（正常解析/非法动作与路径过滤/缺文件降级），全量 812 项（795 通过 / 17 跳过）。

## 0.9.0-dafeiyu.12 —— 提示词推送按钮

- 设置页「派活助手」「小云雀」两个分栏各加一颗 **「推送到所有在线会话」**：把对应提示段用
  `ctx.agents.list()` + `agent.inject()` 注入每个在线会话（不唤醒、下一轮可见），解决“常驻会话
  拿不到后注册的系统提示段”的问题；
- 推送文本带「【系统推送·大肥鱼插件】」前缀，避免被当成用户发言；返回“已推送 N/M，失败 K”；
- 新路由 `POST /api/dsh-remote-dafeiyu/guidance/push`（`which: subagent|xyq|both`，要 `x-drc-pair`）；
- 提示文本单一来源：`src/subagents/guidance.ts` / `src/xyq/guidance.ts`；
- 客户端包上限 256 → 320 KB（扩展三块设置界面后的正常占用，仍禁止内联 react）；
- 判据：pusher 单测 2 条（逐个注入、单点失败不拖累；agents 缺失不抛），全量 809 项。

## 0.9.0-dafeiyu.11 —— 小云雀工具并入（生图 / 生视频 / 余额）

- 新模块 `src/xyq/`：通过官方 `pippit-tool-cli` 调用小云雀能力，**不碰网页 UI**；
- 新工具：`generate_image`、`generate_video`、`xyq_balance`、`xyq_models`（异步提交 → 内部轮询 → 下载到本地，返回绝对路径）；
- 设置页「大肥鱼」新增**「小云雀」分栏**：Access Key（脱敏显示/检查状态与余额）、默认视频模型与时长、默认图片模型、单会话图片/视频额度、单条视频最长秒数、调用自由度（仅显式 / 预算内 / 放开）；
- 配置落 `storages/dsh-remote-dafeiyu/xyq.json`；Key 只在宿主进程内读出、经 `XYQ_ACCESS_KEY` 交给 CLI，不进日志、不回显；
- **过期处理**：鉴权失败时工具与设置页都提示「Access Key 已过期或无效，请到小云雀官网 ⚡CLI/API → API 更新」；
- 预算护栏：单会话额度、单条视频时长上限；额度用完工具直接拒绝并说明在哪里改；
- CLI 定位：先找 `~/.cache/pippit-tool-cli/...`，缺失时用 skill 的 `ensure-cli.js` 自动安装；
- 判据：xyq 单测 5 项（配置归一/密钥脱敏/过期提示/生成轮询/额度与时长截断）+ 合页分栏断言；全量 807 项（790 通过 / 17 跳过）。

## 0.9.0-dafeiyu.10 —— 派活助手（监视器收口）

- 设置页「大肥鱼」新增**「派活助手」分栏**：
  - 派活规范提示开关（`guidance`，改完重启 DSH 才对模型生效）；
  - 闲置阈值可配（10 分钟 / 30 分钟 / 1 小时 / 2 小时默认 / 8 小时 / 24 小时），PC 与手机面板的标黄、一键归档都读它；
  - 提示词预览 + 一键复制（文本与注入给模型的是同一份，单一来源 `src/subagents/guidance.ts`）。
- 配置落 `storages/dsh-remote-dafeiyu/subagents.json`，宿主新路由 `GET/POST /api/dsh-remote-dafeiyu/subagents/config`（写要 `x-drc-pair`）；
- `GET /subagents` 的响应里带上 `config`，手机端阈值自动跟随，不再写死 2h；
- 悬浮 🐝 图标与手机面板保持原样。

## 0.9.0-dafeiyu.9 —— 子代理监视器 v3（规范呈现 + 派活约定 + 一键归档）

- **规范呈现**：名称取官方 `subagent` 工具的 `description`（catalog label），按 `名称｜简述` 拆分；
  任务取子会话日志里第一条**人写的**用户消息（跳过 “working directory changed…” 等系统注入）；
  运行/闲置时间**互斥显示**（跑着看本轮运行时长，停了看闲置时长）；新增「正在：运行 Bash / 正在写回复 / 等待审批」。
- **用法规范**：插件激活时注册提示段 `dafeiyu:subagents`，要求模型派活必须用内置 `subagent` 工具且
  `description` 写成 `名称｜一句话简述`；没按格式写的行在两端标黄「⚠ 命名不合规」，并自动取名兜底。
- **一键归档**：每个非运行中的子代理行都有「归档」；面板顶栏新增「一键归档闲置 (N)」（闲置 ≥2h 批量，
  逐条走同一归档端口）。PC 路由 `POST /subagents/archive` 支持 `ids` 批量（最多 50）。
- 宿主新增认领 `subagents` 服务（`listChildren/listDescendants`）读取官方 label；缺失时退回标题/任务。
- 判据：subagents 单测 6 项（label 拆分/系统注入跳过/递归/缺席抛错/时长），手机 UI 126 项全绿。

## 0.9.0-dafeiyu.8 —— 修 PC 端子代理图标不出现

`.7` 的后端已经好了（`/subagents` 回 200、手机端 🐝 正常），只有桌面端不出现。两个原因：

1. **当前会话 id 解析错了**：`sessions.list.getSnapshot()` 这一代的形状是
   `{ids, byId, phase, projectionsBySession}`，**没有 `current`**。官方 UI 的“当前会话”
   在 `uiSession.current.getSnapshot().key`（`dsh-client-ui-session` 提供的服务）。
   改成按 `uiSession` → `sessions` 的顺序软探测。
2. **一次性捕获**：apply 跑在客户端服务就绪之前，旧实现把当时的 `sessions`（undefined）
   闭包缓存了下来，之后永远解析不到。现在每次调用都重新取服务。
3. 顺手给面板加了 `DOMContentLoaded` 退避：插件可能跑在 `<body>` 之前，之前会静默不挂。

## 0.9.0-dafeiyu.7 —— 修子代理监视器路由没挂上

`.6` 里 `src/subagents/start.ts` 探测 `webServer` 时直接读了 `ctx.webServer`——
cordis 对**未声明服务**的属性访问会抛，异常一路冒到 `index.ts` 外层 try 被吞掉，
于是两条路由一条都没挂上：`GET /api/dsh-remote-dafeiyu/subagents` 回的是 DSH 的兜底
`401 unauthorized`，PC 端图标永远不出现。

改成与识图/记忆同一条探测顺序：`ctx.get('webServer', true)` 优先，`ctx.webServer`
只在 `pickFrom` 的 try 里读，`inject(['webServer'])` 回调里再兜一层。

## 0.9.0-dafeiyu.6 —— 子代理监视器

给大肥鱼加了一个「sub agent 监视器」：看得到每个子代理在干什么、跑了多久、闲了多久，
闲置太久的可以一键归档。

**数据从哪来**（全部是宿主现成的事实，没有新存储）：

- 成员关系：子会话头里的 `parentSession` / `delegationDepth`（冷会话也在）；
- 运行/空闲：`agents.get(id).status`，实时侧还有 `agent/status` 事件；
- 任务：子会话日志里的第一条用户消息（截 160 字）；
- 工作时长：`turn/start` → `turn/end` 的时间差累加（含当前未结束回合），插件重启后照样准；
- 闲置时长：现在 − 最后一条事件时间；日志读不到时退回内存活动表与创建时间。

**桌面端**：右侧悬浮 🐝 图标，只有当前对话有子代理时才出现；面板里列任务/状态/工作/闲置，
闲置超 2 小时标黄并给「归档」（可恢复，走已有归档能力，不删数据）。路由：
`GET /api/dsh-remote-dafeiyu/subagents`、`POST /api/dsh-remote-dafeiyu/subagents/archive`（要 `x-drc-pair`）。

**手机端**：进对话页后每 5 秒拉一次 `cmd.list_subagents`，有子代理才显示 🐝 图标（带数量角标）；
面板与桌面同款；归档用已有的 `cmd.archive_session`。协议侧在 `dsh-remote-protocol` 新增
`cmd.list_subagents`（回复走 `ev.result.data.items`，不新增事件类型）。

判据：新增 5 条载体判据（成员/任务/时长/递归/能力缺失抛错）+ 1 条 runtime 接线判据 +
手机端 11 项 UI 自测；插件全量 798 项（781 通过 / 17 跳过）全绿。

## 0.9.0-dafeiyu.5 —— 人设面板汉化

「大肥鱼」合页里的「人设」分栏，原先整片英文：宿主的界面语言被设成 en 时，
`ctx.locale.bind('personaDafeiyu')` 会给回英文词条，而合页只把翻译权交给了宿主。

现在改成**中文优先**：

- 人设客户端导出它自带的中文词典（`exports.zh`）；
- 合页的 `resolvePersonaT(ctx, zh)` 先查这份中文词典，查不到再问宿主 locale，最后才用 key 兜底；
- 人设客户端内置的 `t` 也走同样顺序，所以聊天页的人设 chip / 浮层 / dock 一起变中文；
- `bind` 改成首次调用时才解析 —— 合页是「先挂组件、后 `apply()` 注册词典」，提前 bind 有拿到空命名空间的风险。

判据：`client-bundle.test.ts` 新增一条，真渲染合页的「人设」分栏，断言交给
`PersonaSettingsSection` 的 `t('scopeGlobal') === '全局'`、`t('listTitle') === '人设列表'`，
词典里没有的 key 原样兜底（不吞错）。

## 0.9.0-dafeiyu.4 —— 关掉人设就别再塞记忆

0.9.0-dafeiyu.3 有个漏：人设**总开关**关掉时，记忆段与记忆使用说明仍然会被注册并注入
（记忆段的求值只看「这个人设 enabled 没有」，没看总开关）。现在两段都挂在总开关下面：
`resolved.enabled === false` 时一个字都不往提示词里塞。

判据：`tests/memory.test.ts` 增加「总开关关掉 + 接了记忆库 ⇒ 没有 dafeiyu:memory* 段」。

## 0.9.0-dafeiyu.3 —— 记忆用得明白

0.9.0-dafeiyu.2 把记忆库做出来了，但有个逻辑坑：空库时「长期记忆」段整段不注入，
模型**根本不知道自己有记忆这回事**，于是「让它记住我」全靠工具描述碰运气。

这一版补一句常驻的使用说明（`dafeiyu:memory-hint`，order 10_290）：
什么时候该 `record_memory`、被问「还记得吗」用 `read_memory`、说「忘掉」用 `forget_memory`、
记忆和当前对话冲突以当前为准顺手更新。只在接入了记忆库时注册，没接就一个字也不多。

判据：`tests/memory.test.ts` 增加 hint 段的存在/顺序/工具名断言，以及「没接记忆库不许冒出来」。

## 0.9.0-dafeiyu.2 —— 长期记忆：大肥鱼记得住事

人设提示词每轮注入的都是同一段「你是谁」，聊过的东西一场就忘。这一版给每个**人设**
配一份长期记忆库，模型能自己往里写、按需读、实在不想让记就删，设置页里也能手动管。

### 做了什么

- **记忆库**（`src/memory/*`）：按人设隔离，落
  `~/.dsh/storages/dsh-remote-dafeiyu/memory/<personaId>.json`；
  条目 = 内容 + 重要度（普通/重要/关键）+ 时间 + 来源，同一个人设最多 100 条
  （超了淘汰「最不重要 + 最旧」），单条 ≤ 500 字，写入一律原子替换。
- **注入**：人设宿主新增 `dafeiyu:memory` 段（order 10_300，排在时间差之前），
  text 是动态函数——每次组装按**当前会话解析到的人设**取那本记忆；空库返回空串
  （等于不注入），总预算 800 字，超出的条目只跳过不删除。
- **工具**：`record_memory` / `read_memory` / `forget_memory`（手写 ToolDefinition，零依赖）。
  工具拿不到会话上下文，靠人设宿主新 provide 的 `dafeiyuPersona.lastPersonaId()` 兜底；
  连这个都没有时落到 `default` 一档（宁可记错档，不静默丢）。
- **设置页**：人设分栏里加「长期记忆」面板：按人设切换、列表、手动加（含重要度）、删单条、清空。
- **回环路由**：`GET/POST /api/dsh-remote-dafeiyu/memory`（Host/Origin 守卫与识图同款）。
- **纪律**：记忆起不来/路由挂不上/段落求值抛错，全部收敛成「少一块功能」——远控与识图一行不受影响。

### 判据

- `tests/memory.test.ts`：增删改查 / 人设隔离 / 重要度排序 / 预算裁剪不删条目 /
  超上限淘汰 / 文件名防穿越 / DSH_HOME 派生 / 「接了记忆库才注册记忆段」。
- `pill-isolation`：路由总数与注销数 12 条，provide 里多一个 `dafeiyuMemory`。

## 0.9.0-dafeiyu.1 —— 识图：大肥鱼看得懂图了

DeepSeek 文本模型没有视觉。这一版把「图片交给外挂视觉模型 → 拿回文本描述 → 大肥鱼基于它回答」
整条链路做进本包，同时把识图配置接进「大肥鱼 → 人设」那一栏。

### 做了什么

- **host 半**（`src/vision/*`）：配置落 `~/.dsh/storages/dsh-remote-dafeiyu/vision.json`
  （与人设存储互不打扰），协议适配 openai-chat / openai-responses / anthropic / gemini /
  custom（auto 按地址猜）；三条回环路由
  `/api/dsh-remote-dafeiyu/vision/{config,recognize,models}`（Host/Origin 守卫与远控同款）。
- **工具**：启动时若识图已开启且宿主给了 `tools` 服务，注册 `recognize_image`（手写
  ToolDefinition，零外部依赖）。
- **提示词段**：识图开启时注入 `dafeiyu:vision`（order 10100），告诉模型「图片描述会以
  【图片识别】开头的文本出现，别声称看到了原图」；开/关要重启 DSH 才换段落，路由侧永远实时。
- **client 半**（`src/client/vision-panel.ts`）：设置页「人设」分栏里加「识图」配置块；
  聊天页右下角鲸鱼按钮 → 选图 → 宿主识图 → 识别文本注入当前会话
  （`sessions.binding().session.prompt(..., 'queue')`，与 dsh-vision 同一套；注入不了退化复制）。
- **纪律不变**：识图起不来/路由挂不上只是少一块界面，远控与人设一行都不许被带走；
  配置里的 API Key 只留在本机，设置页只回显末尾几位。

### 判据

- `tests/vision.test.ts`：配置规整 / key 打码 / 四种协议请求与取文本 / 落盘往返 /
  未开启与无 key 的报错 / 桩 fetch 的识图与模型列表 / 路由守卫+保存+识别+上游 502。
- `pill-isolation`：路由总数与注销数同步改成 11 条（识图 3 + 配对 8），provide 里多一个
  `dafeiyuVision`。

# Changelog

## 0.8.0-dafeiyu.1 —— 「人设」搬进来了：一个包、一行

原来的分工是**两个包、两行、两个设置入口**：`dsh-remote-dafeiyu` 管手机远控，
`dsh-persona-dafeiyu` 管人设。用户装一次要配两遍，设置页里两块互不相干，
而人设那半的"远控时手机上看的是谁"这种问题根本没有地方回答。

### 做了什么

- **host 半合并**：人设的宿主代码（段落注入、人设库、四条回环路由、时间差段、体积守门）
  原样搬进本包的 `src/persona/host.ts`（`@ts-nocheck`，不类型化——一旦"顺手类型化一遍"，
  上游每发一版都得人工重看一千行）。挂载点是 `src/persona/mount.ts`，
  由 `apply()` 在远控之后单独一层 try 挂上：**远控起不来照样能配对，人设挂不上照样能远控**。
- **client 半合并**：人设的 `lib/client.js` 是**已裹好 loader 外壳**的文件（第一行就是
  `window.__ModuleLoader__.load({ id: "dsh-persona-dafeiyu", ... })`）。直接并进来等于在
  本包的 factory 里再注册一个别人的 id——装载器按包名查、对不上就整页白屏。
  所以新增 `scripts/unwrap-persona-client.mjs`：把外壳剥成 `export default function (require)`，
  生成 `src/persona/client-factory.js`（生成物入库），由 `apply()` 拿装载器的 `require` 调它。
- **清单**：`dsh.client.inject` 补上人设那两条包图边（`dsh-client-ui-renderer` /
  `dsh-client-locale`）；模块级 `inject` 并成 `['slots', 'locale']`。
- **存储与路由一个都没动**：人设库仍是 `<DSH_HOME>/storages/dsh-persona-dafeiyu/personas.json`，
  路由仍是 `/api/dsh-persona-dafeiyu/{status,mutate,persona,preview}`。
  ⇒ 装回旧包、或两边都有，数据都在。

### 合包踩到、并且已经钉住的三件事

1. **静态 `require("react")` 的位置**：构建脚本原来禁止产物里出现它（会提到 factory 顶层，
   宿主给不出 react 时在 factory 第一行抛 ⇒ 整页 boot 失败）。人设那份的 `require("react")`
   现在落在 `personaClientFactory()` 的**函数体内**、外面还有 try/catch，与禁的那个形状不是
   一回事。判据改成"只许出现在人设工厂定义之后"。
2. **体积上限 128 → 256 KB**：两份界面共处一个 bundle，190 KB 是正常的；内联 react 会到
   400 KB 以上，所以这条探针仍然拦得住它。
3. **降级日志走 `warn` 不走 `error`**：人设界面没挂上（宿主没 react / 没给 slots / 装载器没给
   `require`）是代际差异，不是故障。远控那半的判据里 `console.error` 的条数就是"有没有故障"
   的指标，混进降级信号等于把两件事搅在一起。

### 判据

763 → 767 项（新增 `tests/persona-mount.test.ts` 四条：Proxy 探测不抛、探不到不挂且说得出
原因、有 `systemPrompt` 时段落真的注册、`persona.enabled=false` 时一个段落都不注册）。


## 0.5.4 —— 「只允许一台」不再误伤**同一台手机**的旧通道

线上取证（2026-10-27，生产 relay `/v05` 的容器日志 10:29–10:38Z）：
一台主机 `drc-63a5d5717e5b` 配过 **6 个不同 clientId**，每一台新手机进来就把上一台踢掉
（作废发生在配成后 **+16.7s ～ +101.7s**，`clients=1`）。被踢的手机手里还捏着那张
**已经烧掉的码**，重连再拿它认领 ⇒ 中继 `already_used` ⇒ 用户被迫反复扫码，
而主机侧**一条异常日志都没有**。

### 做了什么

「只允许一台」（2026-10-03 拍板）的判据从「**除新通道外全部作废**」改成
「**除新通道、以及**同一台手机**自己的旧通道之外，全部作废**」。

- `peerJoinedFrame` **本来就带 `clientId`**（protocol 早就有），但 `transport/relay.ts`
  调用 `onPeerJoined` 时**把它丢了** ⇒ 现在一路透传
  （`onPeerJoined(conversationId, pairingToken, clientId)`）。
- 新增 `RelayClient.clientIdsOf(conversationId)`：读一条通道的成员表。
  主机侧成员表在 `peer-joined` 那一刻就有 `clientId` ⇒ 不依赖手机发过数据。
- 决策抽成纯函数 `core/void-policy.ts` ⇒ **产品与判据跑同一份代码**
  （第一版判据桩了自己的一份实现 ⇒ 删掉产品里的修复行，判据一条没红）。

### ⚠️ 查不到成员 ⇒ **照旧作废**

成员表是**瞬时态**（进程刚起来时为空）⇒ 查不到**不等于**「不是同一台」
⇒ 那时按「无法证明是同一台」处理，**照旧作废**（不因为一条信息缺失就放宽「只允许一台」）。

### 判据

- `packages/plugin/tests/pair-flow-void-policy.test.ts`（6 条，含**反证**：
  换一台手机进来 ⇒ 旧通道**仍然**全部作废）。
- `e2e/mp-same-phone-repair.test.mjs`（3 条）。
- 变异验证：删掉 `void-policy.ts` 里那行判断 ⇒ 单测 1 条红（反证那条仍绿）。

⚠️ **主机侧有两条作废路径在 e2e 里分不出来**：「只允许一台」这条策略，与
「中继通知」（`peer-left{unpaired:true}`，手机重配时中继 `claim` 的 `leaveAll` 触发）
落到了同一个 `voidConversation` ⇒ 同机重配时**两条都会作废** ⇒ 单看会话数分不出是谁干的
⇒ e2e 只钉「换一台手机进来 ⇒ 旧通道必须让位」，策略层的细判据在纯函数单测里。

## 0.5.3 —— 挂起 1 分钟还没人管，就发一条微信提醒

审批/提问挂起时，手机**可能不在**（用户去干别的了）—— 而这恰恰是最需要他的时刻：
桌面那一半只能干等（不设期限），用户回到电脑前才发现"刚才有个审批没答"。

### 做了什么

- 审批与提问**创建时**各挂一个 **60 秒**的提醒定时器（`NOTIFY_DELAY_MS`）。
- 到点检查五步：卡还在吗 → 手机在线吗 → 收集同会话里未通知的卡 →
  全部标记 `notified` → 发一帧 `notify-approval`。
- `settle()` 同时清掉提醒定时器（与结算定时器**两回事**，都要清）。

### 四条纪律

1. **按声明开**：中继没声明 `notify.v1` ⇒ **连定时器都不挂**（老中继会回
   `unknown_frame`，发了就是给两端刷错误）。
2. **在线不发**（v1）：手机此刻在线的话，它本来就能看到卡。
3. **一张卡一条**：标记 `notified`；同会话的审批+提问**聚合成一条**。
4. **不重试、不补发**：主机重启后 pending 本身已丢，不会恢复提醒。

提醒帧只含**元数据**（哪张卡 / 什么时候挂起 / 审批还是提问）——
**一个字的内容都没有**，模板正文由中继按固定文案填。

判据：`tests/interactions-notify.test.ts`（8 条）。

## 0.5.2 —— 换码节奏放慢 + 码龄可见

### 屏幕上的码不再每 90 秒变一次脸

换码线从「剩余不足半程」（线上 TTL 180s ⇒ 每 90 秒换一张）改成「**剩余不足 30 秒**」
（`core/pairing-window.ts` 的 `ROTATE_MARGIN_MS`；TTL 很短时仍封顶半程，防换码风暴）。

换码**不会作废旧码**（中继的 pending 表里它一直活到自己的 TTL），所以早换只剩下副作用：
二维码在用户正要扫的时候变脸、`pair token issued` 刷屏（实测一晚 409 条）。
改完之后屏幕上的码稳定约 150 秒，而换码那一刻仍有 30 秒余量——认领是一个来回，秒级。

### `/status` 新增码龄 / 剩余寿命

`pairing: { ageSec, expiresInSec } | null`（`core/pair-issuance.ts` 的 `info()`）。
**只有两个数字**：宿主 UI 可以显示"这张码 45 秒前生成、还有 135 秒"，而不必让用户扫了
才知道失效。凭据（token/psk）**一个字都不许**过这条每 2 秒被轮询的只读接口——
带凭据的那份仍在 0600 的 `status.json`。

判据：`tests/pairing-window.test.ts` 改 2 条 + 新 1 条（180s 的码在 95 秒时不许换）、
`tests/pair-issuance.test.ts` +1（`info()` 只吐两个数字、花掉即 null）、
`tests/pill-routes.test.ts` 的 `/status` 白名单（九个 → 十个非凭据字段）。

## 0.5.1 —— 三包深审收口（行为零变化）

- `helloOkFor*` 缺省补 `PROTOCOL_VERSION`（schema 必填；构造器不许造出"对侧静默丢帧"的形状）；
- 协议注释与现状对齐（版本上报默认方向、`FRAME_TYPES` 计数）；
- `kernel-events.ts` / `index.ts` 两处注释编辑残迹清掉；
- 中继侧那条死开关（`reportSoftwareVersion`）在 relay 包删掉，插件侧同步注释。

## 3.2.14 —— 与 3.2.13 逐字节相同（版本对齐）

`src/` 无任何改动。3.2.14 的实质改动在 relay（`/code` 拒渲染死码 + 主机宽限改挂起），
plugin 只随号对齐，方便「四包同号」的核对口径。

## 3.2.13 —— 配对码"谁都不补"的三处修复（真机 2026-10-23 上午）

### 手机端解配 ⇒ 主机自动补一张新码

用户报："手机端退出配对，主机端不会自动刷码" —— pill 停在「未连接」+ 一颗「刷新」，
面板里再也不会出现二维码。

根因两层：① 屏幕那张码在配对成功那一刻就被中继 `claim` 烧掉（`markConsumed` 清空
窗口 `active`），而自动发码 `pairOnStartSec` 默认 **0** ⇒ `pairingWindow.tick()` 第一行
`if (pairSec <= 0 && active === null) return false` 直接早退，**谁都不会补**；
② `peer-left{unpaired:true}` 只走到 `onConversationGone`（清确认码），传输层没有
"这次是用户主动解的"这个出口。

修复：`RelayClient` 新增 `onClientUnpaired`（与"掉线"的 `onClientLeft` 严格分开），
`index.ts` 接上 `ensureFreshPairing()` —— 中继不在线时记一笔 `pairingCodeOwed`，
`online` 之后自动补上。主机自己那颗「退出配对」（`unpairAll`）一直会补，两端语义这才对称。

### 码被消费 ⇒ 立刻补发

`onPeerJoined` 的消费分支原来只清旧码（注释承诺"当场换一张新的"只做了前半），
补发指望 `tick()`，而 `tick()` 在默认配置下早退 ⇒ 屏幕上挂着烧掉的码，
重扫必 `already_used`。现在消费即 `wrappedPublish()`。

### 过期倒计时：pill 与配置页统一

- **pill**：倒计时归零原来只画一句「配对码已过期 点右上角刷新重新生成」
  （2026-10-05 的产品裁决），现场是"码直接没掉、要手动点刷新" ⇒ 改为**过期就地补一张**，
  与配置页同一口径。
- **配置页**：倒计时改成**墙钟重算**（原来每拍减 1000，后台冻结一拍就漂 —— 显示还有时间、
  码其实已死），归零时**先停表再补码**（原来下一拍又 `<= 0`，每秒发一张）。

### pill 面板：解配后就地换回二维码页

`settlePanel()` 原来只在"二维码页"那一支跟着状态走；「已配对点开只给状态」那一屏在
配对簿归零后照旧画状态 ⇒ 用户只能自己点「刷新」。现在 `view.kind === 'info'` 且
`pairings === 0` 时就地切回二维码页（判据用 `pairings` 不是 `paired`：手机退后台是
"手机离线"，不该拿二维码盖住）。

## 3.2.12 —— P1-3 主机侧半步：run 输出不受「没有活客户端」闸

### `RUN_OUTPUT` 分流

内核事件管道（delta / inbox / tool / run-state / todo / retry / compaction，
含 DeltaWindow flush）**无条件上线**——断线期的输出由中继环接住、手机重连
`hello.resume` 补投；周期/状态帧（session_changed / model / keep_awake_state /
host_info，含 15 秒周期推）照旧被闸（5737 的噪声修复不许原样回来）。

判据三层：transport 分流 / runtime 调用点选择（防 RUN_OUTPUT 漂到周期推上）/
真插件全链 30 帧断线补齐。**至此 mvjctc63 型"转圈后内容跳变"的机制面闭环。**

### 其他

- 「始终允许」记忆表（`sessionAllowed`）有界化：256 条 LRU + 命中刷新队尾
  （原来只在 `stop()` 清 ⇒ 进程级累积）。刻意**不按会话列表裁剪**（列表是
  LISTING_LIMIT 截断的，旧会话掉出前 100 会被误清——`rememberModel` 同款判例）。
- `isoOrUndefined` 与 protocol 规范版合并（plugin 版一行转调，行为逐字节相同）。

## 3.2.11

版本号随四包同步。本包**无代码改动**（本轮只改小程序端，主机侧行为不变）。

## 3.2.10 —— 修「始终允许」点了等于没点（而且之后再也不弹）

真机（2026-10-22，用户报）：手机审批卡点「始终允许」→ 桌面那张卡照旧等人，
这次工具调用**一直不落地**；同时之后同类审批**连弹都不弹**，全部静默挂住。

两个症状是同一个根因的两头，根因在 `platform/carrier-services.ts` 的 `participate()`：

- 手机的答案白名单只认 `'allowed-once'` / `'rejected'`，v3 新增的
  **`'allowed-session'`（「始终允许」）掉进了 `answered: false` 那一支** ⇒ 手机这一票被丢掉，
  `Promise.race` 只能继续等桌面（桌面那张卡永远不会自己被撤）。
- 而 `runtime.settleApproval()` **已经**把 `(sessionId, 工具名)` 写进了 `sessionAllowed`
  ⇒ 下一次同类请求在挂卡之前就命中记忆、**一帧都不发**。
- 于是"允许"这一半丢了、"别再问"那一半生效了：**越点越不弹，工具全卡住**。

修法两处：

1. `'allowed-session'` 进白名单 —— 它是手机的**答案**，不是"没答"。
2. 交回平台的返回值翻成 `allowed-once`：`'allowed-session'` 是我们自己的词汇，
   平台（`@deepseek-ai/dsh-user-approval` 的 `ApprovalOutcome`）不认识它，交给它等于"这次没结论"。
   "同一会话同类操作别再问"仍由 `runtime.sessionAllowed` 承担（`ports/index.ts` 的契约原文）。
   `face.last` 仍印 `allowed-session`，doctor 靠它分清"允许一次"与"这一档已记住"。

判据：`tests/carrier-services.test.ts` 的「「始终允许」是手机的答案」（桌面那一半**永不作答**，
用 50ms 哨兵防判据自己挂死）。修前实测返回 `HUNG`（正是用户看到的"没反应"），修后 `allowed-once`。

## 3.2.9 —— 修「扫码配对全挂」+ 设置页输入框焦点 + 提问卡可收起/跳过

### 🔴 严重：扫码配对全挂（当天引入、当天修）

`core/client.js` 的 `_sendHello` 里加了
`if (version.REPORT_VERSION) hello.softwareVersion = version.APP_VERSION`，
**但那个文件里从没 require 过 `./version`** ⇒ `version` 是未定义标识符
⇒ 建连时抛 `ReferenceError` ⇒ `hello` 帧发不出去 ⇒ 中继不认这条连接
⇒ **扫码走到「认领成功」之后就断在那里**（用户报："开发版小程序内部扫配对码不能用了"）。

⚠️ 它**不只影响开发版**：所有版本都会挂（开发版只是当时在用的那个）。
⚠️ 只有 `e2e/mp-client.test.mjs`（真 client × 真中继 × 真插件）能抓到 ——
它报的是 `Test hook "before" ... ReferenceError`，25 条测试 `pass 0 / fail 0`。

修：补 `var version = require('./version.js')`。
判据：新增**源码级**一条（`mp-version.test.mjs`）—— 读了 `version.*` 就必须真的 require，
把这个"只有真跑才炸"的错误挡在最快的一层。

### 设置页（插件的，不是宿主本体的）输入框焦点一直丢

`paint()` 每 2 秒被状态轮询调一次，原本做的是 `box.replaceChildren(...)` ——
**整棵子树换掉**。「进阶」那张卡（含两个 `<input>`）虽然只建一次，
却被塞进**每次重建**的 `grid` 里 ⇒ 每 2 秒被摘出 DOM 再插回 ⇒ **焦点每 2 秒丢一次**。

修：常驻骨架 —— 把"每次都变的"与"带输入框的"分成两棵树：

```
box            ← 常驻，永不换
 ├ topHost     ← 常驻容器，内部每次重画（抬头 + 状态条）
 └ grid        ← 常驻（data-two 仍管两列）
    ├ leftCol  ← 常驻容器，内部每次重画（配对卡）
    └ rightCol ← 常驻容器，装「进阶」卡，永不重画
```

视觉不变：原来"两卡等高"靠 grid 的 `align-items: stretch`，拆列容器后由
`.drc-sec-col` 的 flex 接管（判据同步更新）。

判据：读**祖先链的对象身份** + 新增 `FakeElement.moves`（每个节点被摘出过几次）。
⚠️ 只比 `parent` 不够：`replaceChildren` 之后又 `appendChild` 回**同一个**父节点时，
前后 `parent` 一模一样，可中间那一下照样失焦。

### 提问卡：可收起、可跳过

用户报："提问框没办法跳过或者关掉"。两条出口分开：

- **收起**（`panelFolded`）：收成一条细条「已收起 · 主机仍在等你答复 / 展开」——
  主机那边照样在等，随时放回；
- **跳过**：`onSkipQuestion` ⇒ `client.interrupt()`（`cmd.interrupt` →
  主机 `agent.cancel({kind:'user'}, {keepInbox:true})`）⇒ **真让主机中止这一轮**。

两者都在**同一行底部**：**左「跳过」· 右「收起 / 展开」**（用户裁决）。
收起与展开**位置完全相同**（站定右下角），用户不用在两种形态之间重新找那颗按钮；
这一行在收起分支**之外**，所以收起之后照样能展开、能跳过。

⚠️ **跳过绝不许实现成"发一个空答案"**：`cmd.answer` 的 `answers` 是 `min(1)`，
而"一条里一个都没选"的答案会被主机**当成真答案**交回提问服务
（那条链只判"有没有值"）⇒ 用户以为跳过了，其实答了一个空。
判据钉住 `onSkipQuestion` 必须调 `.interrupt(`、不许出现 `.answer(`。

### 提问卡输入框打不了字（同一天早些时候）

它挂的是 **`bindfocus="onInputFocus"`** —— 那是 **composer 的**聚焦钩子，
而 composer 写着 `focus="{{inputFocus}}"` ⇒ 提问卡一被聚焦，composer 就抢走焦点。
修：独立状态 `panelInputFocus` + 自己的 `onPanelInputFocus/onPanelInputBlur`，
并在提问卡出现时收掉 composer 的焦点。

### 首页：给插件包名 + 文案

- 未配对页新增一行 **DSH插件：@dsh-remote/plugin**（从微信搜索来的用户不知道要装什么），
  位置在「扫一扫电脑上的码」**之前**；
- `hero-desc` 压短之后补回"跟进"（审核判据要求首屏出现"查看/跟进/同步"这一族动词）。

### 版本上报（默认关，零知识不变）

`hello` 帧新增可选 `softwareVersion`：

- 两端（主机 / 小程序）都支持，**默认不带这个键**（不是空串）⇒ 帧逐字节不变；
- 只有 `DRC_REPORT_VERSION=1` 的部署才带（小程序在上传时注入）；
- 中继侧 `reportSoftwareVersion` 默认 **false**（开源版不记对端版本）。

判据：协议层钉"不给参数 ⇒ 帧里没这个键"；relay 钉"默认关、只认 1/true"。

### 判据纪律（当天两次踩到）

1. **扫源码的判据必须先剥注释**：我在 hero 上方写了句"避开审核词表
   （远程控制 / 控制电脑…）"，而那条判据扫的是含注释的原文 ⇒ 误红。
   注释会被编译掉、审核员一个字看不到。
2. **"快判据全绿"不代表"小程序还能连上"**：改了 `core/*.js` 必须跑
   `e2e/mp-client.test.mjs`（真跑 client 的那条）。

## 3.2.8 —— 新用户装不到新版：`dependencies` 里那 5 个包全是多余的

### 现象（2026-10-22 14:0x 实测）

新用户装 `@dsh-remote/plugin@latest`（pnpm 11 + npmmirror）⇒ **装到 3.1.11**，
落后六个版本 ⇒ **3.1.x 插件 + 3.2.x 小程序 = 根本配不成**
（线上已有一台真实主机在反复重试：4 分钟内配对 4 次、失败 2 次 `already_used`）。

### 根因（两层叠加）

1. **pnpm v11 的 `minimumReleaseAge` 默认 1440 分钟（24h）** ⇒ 只装发布满 24h 的版本。
   ⚠️ 它是**内建默认**：`pnpm config get` 查不到、`.npmrc` 里写 `minimum-release-age=0`
   **也无效**（实测仍是 3.1.11）⇒ **换 registry 源也没用**（它是 pnpm 层的行为，与源无关）。
2. **本包 `dependencies` 里那 5 个包全是多余的** ⇒ 于是形成死结：
   - plugin 3.2.x 的 `dependencies` 要求 `@dsh-remote/protocol`；
   - protocol 的最新版也发布于 24h 内 ⇒ 不可用；
   - pnpm 一路回退，直到找到**一对都够老**的组合 ⇒ **plugin 3.1.11 + protocol 3.1.12**。

### 修法：`dependencies` 清空（全部移进 `devDependencies`）

- **运行时零依赖是真的**：`main` 指向 `dist/bundle/index.js`，
  `files` 只含 `dist/bundle` ⇒ npm 包里**只有 bundle**；
  而 bundle 已**内联 162 个非本包模块**（protocol / ws / zod / tweetnacl / qrcode 全在内），
  外部 `require()` 只剩 Node 内置与 `ws` 的两个**可选**原生加速器
  （`bufferutil` / `utf-8-validate`，缺失时 ws 自动回退 JS ⇒ **行为无变化**）。
- 打包脚本 `external` 只留 `cordis` / `@deepseek-ai/*` / 那两个可选加速器
  ⇒ **不依赖 `dependencies` 字段** ⇒ 移走不影响打包。
- 仓里 relay 的 `dependencies` 本来就是 `{}` ⇒ 这才是本仓的惯例，
  plugin 那 5 个是**历史遗留**（3.2 之前 protocol 没被内联时的残留）。

### 效果

- 新用户不再被 protocol 的 24h 拖累 ⇒ 装到**最后一个发布满 24h 的 plugin**，
  而它**内联着自己那一版的 protocol** ⇒ **版本自洽、可用**。
- ⚠️ **plugin 自身的 24h 限制仍在**（pnpm 策略，改不了）⇒ 最新版要**发布满 24h** 才装得到。
  ⇒ **发版节奏要 aware**：重要版本发布后约一天才会到达用户。
  ⇒ 想要"立刻到达"，只能走**自定义 registry**（宿主「添加插件」里有那个选项）。

## 3.2.7 —— 配对文案纠错 + provenance 判据收紧

### 产品代码

- 主机侧配对确认文案：原来写「在手机上按停止」，可手机上只有「数字一致 / 不一致」
  ⇒ 改成「在手机上选不一致」（pill 与设置页两处）。
- 只改文案，不改配对流程：3.2.5 起主机端没有放行按钮，确认只留在手机端。

### 判据

- `client-bundle.test.ts` 同时钉住 pill 与设置页的那句话（两处不许分叉）。
- 发布工作流的 provenance 判据收紧：`grep -Eq` 容忍压缩/展开两种 JSON，
  并要求至少一条 attestation（空数组不算）；`e2e/npm-publish-tp.test.mjs`
  用样例真跑这条正则。

## 3.2.6 —— review 补修：解配时那串确认码也消失（两条解配路都清）

### 产品代码

- `pairApproval.clear()` 连带清掉"最近放行"那串确认码；
- **解配有两条路**，原来只清了一条 ⇒ 另一半漏：
  · 主机端点「退出配对」（`unpairAll()`）；
  · **手机端解配**（中继发 `peer-left{unpaired:true}` → `voidConversation`
  → `onConversationGone`）。
  ⇒ 两处都清。它不是凭据（真凭据在密文里、90 秒后自动消失），但「该消失的东西留着」
  本身就是一种不一致 —— 界面上的每一样东西都该对应当前状态。

### 判据

- 单元测试 ×2：刚放行时它在 / 过时自动消失 / clear 后消失；
- e2e ×1：手机端解配后主机的 `lastPairApproval` 必须变 null（真路径那条）。

### ⚠️ 顺带修掉一个**装置**的 bug（它让三个 e2e 文件红着）

等 `pair-grant` 的**基线**取晚了：原来放行是**手动**的（`POST /pair/approve`），
基线取在放行**之前**是对的；改成**自动放行**后 grant 可能在认领那一刻就到了
⇒ 基线取晚 ⇒ **跳过本轮那一条** ⇒ 等"下一条"永远等不到。

症状极像"配对没成"，而现场其实**配对已经成功了**（主机那侧带着本轮的 token 与 SAS）。
⇒ 基线挪到 `connect()` / `onPair()` **之前**，并加一条判据钉住这个位置。

⚠️ 这个 bug 是被 `wire-resume-delta` / `restart-resume` / `pairing-refresh`
逮到的 —— 它们在 `e2e/run.mjs`（全链路）**之外** ⇒ **全链路绿着而它们红着**。
⇒ `node e2e/run.mjs` 只是其中一条链，"它绿"不等于"全部绿"。

# Changelog

### review 补修（2026-10-22 凌晨）

review 找出两处**同一类**疏漏：`lastGranted()` 那串确认码在「解配」时没被清。

- `pairApproval.clear()` 没清它；
- 而**解配有两条路**：主机端点「退出配对」（`unpairAll()`）与**手机端解配**
  （中继发 `peer-left{unpaired:true}` → `voidConversation` → `onConversationGone`）。
  只清一条 ⇒ 另一半漏。

⇒ 两处都清（`unpairAll()` + `onConversationGone`），并加判据：
单元测试钉 `clear()` 的语义，e2e 钉**手机端解配**那条真路径
（`e2e/run.mjs` 第 18 步：手机 unpair 后主机的 `lastPairApproval` 必须变 null）。

⚠️ 它不是凭据（真凭据在密文里，90 秒后自动消失），但「该消失的东西留着」本身就是
一种不一致 —— 界面上的每一样东西都该对应当前状态。

## 3.2.5 —— 配对确认只留一边（手机端）+ 首页文案精简 + 版本提示条移到正确的位置

### 配对：主机改成**自动放行**，确认只留在手机端

用户裁决（2026-10-21 晚）：「小程序和主机端都要点确认有点繁琐，只保留一边可以吗」
⇒ **只保留手机端**。

**为什么主机那一次点击可以不省**：它**不增加任何安全性** —— 它只是把"用户已经看过
手机上的数字"这件事说了一遍；而真正的比对必须在**持有手机**的那一端做
（中继换掉公钥时两端算出的数字不同 ⇒ 手机上弹窗里那个数字与主机屏幕上的不一致
⇒ 用户点"不一致"即可中止）。

⇒ 主机在 `onPairRequest` 里**自动放行**（把 psk 加密送回手机），
主机界面**仍然显示那 6 位数字**供用户对照，但**不再有「数字一致，允许」按钮**。
`POST /pair/approve` 那条路由**留着**（自动放行没赶上时是唯一的兜底，
e2e 装置与排错也走它），但**浏览器端不再调用它**。

**新能力**：`pairApproval.lastGranted()` —— 放行是"取走即焚"，`current()` 立刻变 null
⇒ 主机界面就再也显示不出那串数字。而它是**用户唯一能对照的东西**
⇒ 放行之后仍要留 90 秒给用户对照（`status.lastPairApproval`）。

### 修：放行入口挂在**用不上的分支**里（真机死锁）

2026-10-21 23:00 的真机现场：中继日志里 `paired` **每次都成功**，主机 `pairApproval`
也确实挂上了申请（token 006867 / sas 325175），可用户点了半天**找不到那个按钮**。

根因：放行入口只画在 `view.kind === 'qr'` 那一支里，而面板进不进那一支看的是
`pairingNow() > 0`（**密钥簿里还有几条会话**）—— 主机密钥簿里只要留着**任何一条**会话
（哪怕那台手机早就不在了），面板就进 `info` 态 ⇒ **按钮不渲染** ⇒ 用户无从放行
⇒ 主机永远不回 `pair-grant` ⇒ 手机永远卡在"正在连接…" ⇒ 而主机那边显示
"已配对，不用再扫码"，**看起来一切正常**。

⇒ **放行入口属于"有申请"这件事，不属于"哪一屏"。** 现在每一屏都画它。

### 修：首页的插件版本提示条挂在**用不上的分支**里

同一类错误，第二处：那 6 位提示条（"电脑上的插件太旧，请升级"）原来挂在
**主机卡**那一块，而主机卡在 `wx:if="{{paired}}"` 里面 ⇒ **插件太旧的用户恰恰
还没配对**（配不上才要提示升级）⇒ 那条提示只在**用不上的场景**里出现。

⇒ 提到**页面最上面**（两个分支之外）：已配对（主机太旧、该升级）与未配对
（正是配不上的那一刻）两种画面都要看得见它。

### 精简首页文案

- `hero-desc`：「把电脑上跑着的任务带到手机上：进度、待办、要你确认的事。」
  → 「把电脑上跑着的事，带到手机上看。」
  （原文与下面 `hero-note` 的"进度、待办"**重复了一遍** —— 两句话都在列举"同步什么"，
  而首页只需要说清**这是什么**。）
- 按钮下那句：「也可以直接用微信扫一扫；扫不出来就输 6 位配对码。」
  → 「微信扫一扫也能进。」
  （后半句是**下面那个折叠入口**干的事，按钮下面再说一遍等于把折叠区又讲了一遍。）

### 判据

- 新增 `e2e/mp-page-pairing.test.mjs`（真中继 + 真主机 + **真页面** + 真 client）：
  走**页面**那条收尾路（`pairPhone()` 走的是 `client.confirmPairGrant()` 捷径，
  **绕开了页面**，所以真机多出来的那段重连从没被覆盖过）。
- 新增「位置」判据：提示条必须在两个分支之外（读 wxml 结构，**先剥注释**）。
- 新增「死锁回归」判据：`pairings: 1` 且有 `pairApproval` 时那 6 位数字必须显示。
- 判据本身也修了：按 `wx:if="{{paired}}"` 切分 wxml 的那几条**必须先剥注释** ——
  注释里也写着同样的字样，不剥就是按注释切分（切片只剩 900 字符，假红）。

## 3.2.4

`hostInfoPayload()` 现在带上 `pluginVersion: PLUGIN_VERSION`（规范 §13.2）。

手机靠它在首页判断"电脑上的插件够不够新"：3.2 换掉了整条配对协议，
**3.1.x 的插件配不上 3.2.x 的小程序而两端都不报错**；pnpm 的 `minimumReleaseAge`
还会静默把插件降级到最后一个"够老"的版本 —— 不报这一格，手机就只能对用户沉默。

⚠️ 它**不走 `hostMeta` 注入**：那是平台信息（注入是为了让单测能钉住 `state.sleep`
的推导），而版本是**本包自己的事实**，报别人的版本等于骗手机。

判据钉在 `tests/runtime.test.ts` 的「ev.host_info」那条里（必须等于 `PLUGIN_VERSION`）。

## 3.2.3

版本号随四包同步。**运行时代码无改动**（3.2.1 那次修复已生效）。

`scripts/pack-to-profile.mjs`：装机时顺手把 pnpm 的 `minimumReleaseAge` 豁免写进 profile
的 `pnpm-workspace.yaml`（三个分支都实测过：幂等 / 文件不存在 / 有键无裸包名）。

- pnpm v11 起 `minimumReleaseAge` **默认 1440 分钟**：只装「发布满 24 小时」的版本。
  它是**内建默认值** —— 配置里查不到、`pnpm config get` 返回 undefined，极难想到。
- 后果：宿主 plugin-manager 每次操作都把插件装成最后一个"够老"的版本。
  2026-10-21 实测 3.1.8 发布 31.6h（满足）、3.1.9 起全在 8h 内（被静默跳过）
  ⇒ 用户「不管装什么版本都会回到 3.1.8」，命令行只有一行 `+ … 3.1.8` 看不出降级。
- 豁免**按包名生效、覆盖该包所有版本** ⇒ 写裸包名一条就够，不必每发一版手工加一条。
  之前攒下的 `@…@3.1.6` / `@…@3.1.7` 就是手工加的遗留。

⚠️ scripts/ 不在 package.json 的 `files` 里 ⇒ 已发布的 3.2.3 产物不受影响，无需重发。

## 3.2.2

版本号随四包同步。插件无代码改动（3.2.1 那次修复已随 3.2.1 生效）。

## 3.2.1

### 清理：主机手里不再有"码的文本"

- `LivePairing` 去掉 `qr`；`pairingEpoch(token)` 改成 `sha256('dsh-rc/mp-code:' + token)` 的前 16 位。
  发码回答里的 `epoch` 与 `pairing.png` 的 `ETag` 仍然同一个口径，只是不再依赖一段已经被删掉的 URI。
- `index.ts` 不再 `buildPairingUri`（`status.json` 的 `pairing` 也随之不再出现 `qr` 字段 ——
  那本来是一条带 PSK 的字符串）。
- 删 `shell/mp-code.ts` 的 `kindFor()`：它回答"屏幕上该放小程序码还是旧码"，而旧码没了，
  只剩一个恒真分支。日志文案同步改成"这一格会空着（503）"，不再是"回落到旧码"。

### 修复：配完对之后，主机自报的限额永远到不了手机（3.2.0 引入）

- **根因**：`index.ts` 在 `onPeerJoined` 里推 `ev.host_info` 与挂起的卡，而 3.2 的 psk 是
  `pair-grant` 里送回来的 —— 用户还要比对一次 6 位数字才装进手机。`peer-joined` 早于
  `pair-grant`，那一刻发出去的密文手机上 `kH2C` 还是 `null`，`client.js` 的 `_onEncrypted`
  开头就 `return false`：**静默丢，连"解密失败"都不记**（所以两端都没有任何日志）。
- **后果**：扫码配完对之后 `hostLimits` 一直是 `null`，页面按"未知 ⇒ 照上界"放行选图，
  而真主机（web profile 那台内核）其实一张都收不下；挂起的审批/提问卡同样不出现。
- **修法**：交付点统一挪到 `onClientRejoined`，它的语义从"手机回来了"扩成
  **"这台手机的密钥面可以用来推东西了"** —— 触发点由 `transport/relay.ts` 新增的
  `awaitingKeys` 给出（配对登记 → 第一帧解得开的东西到达）。`sendHostInfo` 仍然排在
  `replayPending` 之前，帧顺序纪律不变。
- **判据**：`e2e/mp-client.test.mjs` 的 12j（修前红、修后绿）与 `e2e/pairing-refresh.test.mjs`。
  plugin 679。

### 判据

- 删 `tests/pairing-uri-source.test.ts`（整文件测的就是那条 URI 的 URL 源，功能已不存在）。
- `/status` 那条用例的名字从"九个字段…pairCode"改成"八个"（字段早就删了，名字一直没改）。
- ETag 那条断言跟着改成 `pairingEpoch(pairing.token)`。
- plugin 679。

## 3.2.0

### 破坏性：只剩小程序码这一种码（2026-10-21 用户裁决「不做兼容，只保留最优解」）

删掉的东西（都不是"藏起来"，是**删干净**）：

- **本机渲染 `dshr:` 二维码**那一整套：`src/platform/qr.ts`（含 vendored 编码器）、
  `src/pill/miniprogram.ts`、`GET /miniprogram.jpg`（设置页右栏那张静态入口码）、
  `GET /pair`（不依赖会话的配对页）。
- `PillStatus.pairCode` 与 `status.json` 的 `pill.miniprogramCode`：屏幕上只有一种码了，
  这两个读数没有"另一种可能"要表达。
- 根目录那个真实解码校验脚本（它解码的东西已经不存在了）。

现在 `GET /pairing.png` **只出一种码**：中继签发的小程序码（JPEG）。取不到就回 **503
`mp_code_unavailable`**，**不回落**成另一张码 —— 回落意味着屏幕上出现一张"用户以为能扫、
其实不是同一件事"的图，那正是 3.1.x 两次现场投诉的形状。

设置页恒为两张卡：左「配对这台主机」（码 + 6 位数字 + 待放行时的「数字一致，允许」）、
右「进阶」，两栏各半、底边对齐。

plugin 685。

## 3.1.12

### 已配对 / 手机离线时不再摆回入口码（2026-10-21 用户报）

上一版按"不是 mp 就摆"的规则走，于是**屏幕上根本没有码**的那两种状态下
（配对卡写着"已配对，不用再扫码"），`pairCode` 只能是 `unknown` ⇒ 入口卡又被摆了出来，
版面看着和改动前一模一样。

⇒ 只认**正面证据**：`pairCode === 'legacy'` 才建那张卡。顺带把"网格里只剩主卡"
收成一列（`data-single="1"`）—— 否则主卡被挤在左半边、右边留一个 224px 的空洞。

plugin 707。

## 3.1.11

### 设置页收成两栏：右栏的入口卡整张去掉、数字小一档、进阶上移（2026-10-21 用户截图标注）

三条都是用户在同一张截图上点的：

1. **「这个不要」** —— `pairCode=mp` 时右栏那张「手机端」卡**整张不建**（上一版只去掉了
   图、留了一行字，仍然占着一栏）。一张小程序码本身就是入口，不需要第二块内容解释它。
2. **「小点，不用这么大」** —— 6 位码 `16px`（原 20px）、字距 2px（原 4px）。它是
   "手输那条路"的备选，不是主角。
3. **「移到右上，与码并列，等高」** —— 右栏空出来之后，「进阶」那张表单挪进网格右列，
   `data-two="1"` 让两栏各占一半并 `align-items: stretch`（底边对齐）。回落成旧码时
   右列仍是入口码，它照旧独占一行。

plugin 707。

### 设置页只出一张码：配对卡已是小程序码时不再摆第二张（2026-10-21 用户报）

现场：上一版让配对卡里那张**变成小程序码**之后，右边那张静态入口码就成了
"长得一样的第二张"——用户当场问"怎么还是双码、我该扫哪个"。

改法：`/status` 增 `pairCode: 'mp' | 'legacy' | 'unknown'`（只读缓存、不发请求，
图片那条路由先被请求过就有结论）。`mp` ⇒ 设置页**不建那张 `<img>`**，只留一句
"在微信里搜「黑鲸远控」"；`legacy` / `unknown` ⇒ 照旧摆出来（自部署中继签不出
小程序码时，它是唯一的装机指引）。plugin 707。

### 修：`startPill` 把取码口吞了，真机一直出旧码（2026-10-21）

现场：3.1.9 装上、healthz 报 3.1.9、路由全挂上、`status.json` 全绿，而
`GET /pairing.png` 返回的仍是本机渲的 `dshr:` 旧码 —— **扫出来的不是小程序码**。

根因：`index.ts` 把 `mpCodeFor` 传进了 `startPill`，而 `startPill` 逐个字段重建
路由入参时没有转发它 ⇒ 路由侧 `typeof deps.mpCodeFor === 'undefined'` ⇒ 永远走
回落分支。零报错、零日志。

判据改成走**行为**（`pill-isolation`）：把一条假取码口塞进 `startPill`，再真打
`/pairing.png`，断言 `Content-Type: image/jpeg` 且取码口被调用过。做过反向验证——
去掉那行转发，这条当场红。plugin 706。

## 3.1.9

### 双码合一：默认出小程序码，密钥由主机加密送回手机（2026-10-21）

**用户现场**：原来微信扫的是宿主自己渲的 `dshr:` 码，**密钥就印在码里**；想要"微信
扫一下直接进小程序并完成配对"，就必须让码里只有配对码——而个人主体小程序用不了
"扫普通链接二维码打开小程序"，`scene` 又只有 32 字符（装不下 44 字符的密钥）。

**新路线（docs/PAIRING-ONE-CODE.md 的乙′）**：码里只有 6 位配对码 → 手机生成一次性
X25519 密钥对 → 认领帧带 `clientPub` → 中继转 `pair-request` 给主机 → **主机屏幕上出现
6 位确认码** → 用户点「数字一致，允许」→ 主机用 `wrapPsk` 把密钥加密送回手机
（`pair-grant`）→ 手机 `unwrapPsk` 拿到密钥。中继全程零知识。

改动：

- `src/shell/mp-code.ts`（新）：向中继 `GET /code?token=` 要这一枚码的小程序码。
  成败看 JPEG 魔数；失败按原因负缓存 60 秒——自部署中继没配小程序是**常态**，
  没有负缓存就是"每开一次弹窗打一次外网"。
- `GET /pairing.png` **默认给小程序码**（JPEG），拿不到才回落到本机渲的旧码（PNG）；
  `?kind=legacy` 强行要旧码。Content-Type 按实际给的那一档写（写死 png 浏览器解不开）。
- `POST /pair/approve`（新，第八条同域路由）：用户确认后放行，回 `pair-grant`。
- 设置页与 pill 同步：有人在等放行时显示 6 位确认码 + 「数字一致，允许」；
  旧码折进「旧版扫码 / 手动输入」，不再是默认那一张。

判据 705（新增 `tests/mp-code.test.ts` 6 条 + 图片路由三条 + 设置页三条）。

## 3.1.8

版本号随四包同步（本包无代码改动）。

## 3.1.7

### 桌面版跨源：补 CORS 与预检，配对不再「请求失败」（2026-10-20）

0.2.1 桌面页面在 `dsh-app://` 上，而路由在宿主 HTTP origin 上 ⇒ **每个请求都是跨源**。
带 `x-drc-pair` 的 POST 会先发 `OPTIONS` 预检，而路由没有预检分支（回 405）⇒ `fetch` 直接
reject，界面显示「配对请求没成功：读不到主机状态（请求失败）」。

修法：`registerPillRoutes` 给**每一条**路由套一层 CORS——`OPTIONS` 就地回 204 + 允许头，
其余请求回声 `Access-Control-Allow-Origin`（**只对"像这台宿主自己"的 Origin**：环回 http(s)
与 `dsh-app:` 白名单，与 `rejectedBy` 同一套判据；写路由仍要 `x-drc-pair`）。

另加 `POST /client-report`（客户端半自报，写到 `~/.dsh/dsh-remote-control/client-report.json`）：
客户端半在宿主里没有任何可观测出口，这条把"apply 看到了什么"变成读数。
判据 685（路由 7→8 的条数与清单断言已同步）。

## 3.1.6

### DSH 0.2.1-rc.2 适配：客户端半不再赌服务名 + 走宿主 HTTP origin（2026-10-20）

用户现场：升级到 DSH 0.2.1-rc.2 后**插件让 DSH 启动不起来**；清理掉插件后设置页能渲染，
但所有宿主调用都是 `HTTP 0`（「发不出配对码」「这一版宿主没有 /config 路由」）。

**根因有两条，都在浏览器那一半：**

1. **启动崩溃**：0.2.1 的 web boot 会对**任何 pending 条目**抛
   `web boot: N entry/entries did not activate`。这一半原来声明了 `inject: ['slots']`
   （模块级）与 `dsh.client.inject: ["@deepseek-ai/dsh-client-ui-conversation"]`（清单级）
   —— 两条都是"服务/包晚到就整页起不来"的赌注。现在**两条都撤掉**：
   `apply()` 立即激活，槽位靠 `mountPill` 的软探测 + `ctx.inject` 晚到回调补挂
   （2026-10-03 那次真机事故之后就写好的退路）。代价是可能先留一行 warn，值得——
   少一颗 pill 只是少一个入口，起不来是整台机器打不开。

2. **HTTP 0**：0.2.1 桌面版的页面挂在自定义 scheme `dsh-app://` 上，而插件路由仍在宿主
   自己的 HTTP origin 上（`/plugins/dsh-remote-control/*`）。相对路径的 `fetch` 解析成
   `dsh-app://plugins/...` ⇒ 请求根本没出门（status 0）。修法照官方前端的口径：
   `window.__DSH_TRANSPORT__?.streamBaseUrl ?? document.baseURI`，见新增的
   `src/client/host-url.ts`；web 形态没有那个全局 ⇒ 退回相对路径（同源，不变）。
   二维码 `<img src>` 同一条路。

判据：`tests/client-bundle.test.ts` 翻转两条旧断言（原钉"必须有 inject"），新增
桌面/ web 两种 origin 的 URL 判据；plugin 共 **686** 条。

## 3.1.5

### 落盘加固：敏感**目录**也走凭据级端口（2026-10-13 第六轮 review）

⚠️ **文档与实现分叉**：README 的「设计上的三条硬线」第 2 条写着凭据落盘一律 0600，
`status.json`、配对密钥簿、宿主身份文件、**附件目录**都走同一个落盘端口。前三项与附件的
**文件**确实走了（`writeSecure` 的五步），**目录本身没走** —— 三处都是
`mkdirSync(dir, { recursive: true })`，不带 `mode` ⇒ 用进程 umask，典型 **0755**：

- 别的本地用户能**列出**这些目录：会话 id、用户上传的文件名（文件名本身就说明了内容）；
- umask 宽松时（容器 / 自建服务常见 `UMask=0000`）目录变 **0777** ⇒ 别的本地用户能在里面
  **删/替换**文件 —— 而 `conversations-<hostId>.json` 里是**每个会话的 PSK**，
  附件路径则被写进 prompt 正文交给 Agent 读。

⇒ `secure-file.ts` 新增 `ensureSecureDir`（`SECURE_DIR_MODE = 0o700`）+ `mkdir({mode})`
**再** `chmod`（`mode` 只在创建那一刻生效，而 `recursive` 遇已存在目录直接返回 ⇒
一条 0755 的老目录永远收不紧）。三处敏感目录改走它：附件目录、配对密钥簿目录、
host-token 所在目录。

⚠️ **只收窄、不改属主已收紧过的目录**（`pair-store.test.ts` 抓到的第一版过度收紧）：
现有判据「目录只读（0500）时 save 必须优雅失败而不是抛」被第一版红了出来——它把运维
刻意设的只读**改回可写**。⇒ 规则收成：**组/他人两位上还有 1 才收**（0755/0777 → 0700），
已经只属主的（0700，含运维设的 0500）**一律不碰**。插件不该改一个自己没有设过的权限。

判据：`tests/secure-file.test.ts` +4 条（建目录 0700 / 老 0755 目录被收紧 /
三个敏感目录的创建点都走端口 / 属主收紧过的目录不许被改动）。**变异验证**：
去掉 chmod ⇒ 「老 0755 目录被收紧」那条立刻红。plugin 676 → **680** 条。

> 四个包一起 bump 到 `3.1.5`。**主体是小程序的审核整改**（见
> `packages/client/CHANGELOG.md` 的 3.1.5 一节），另含 2026-10-12 深度 review 的一批修复。

### 深度 review 补丁（2026-10-12）

- ⚠️ **自愈额度改成"按连续失败"计**（`src/index.ts`）：原来只增不减 ⇒ 一台机器跨天遇到
  第二次 `bad_token`（间隔远超冷却）就会把 5 次用尽、**被永久放弃**，而自愈要应付的
  恰恰是**会反复发生**的事（别人重建机器、令牌表裁剪、中继重部署）。现在一次 `hello-ok`
  就清空窗口。
  同时**拆成两个读数**：`diagnostics.hostToken.heals`（累计，只增不减，给运维看
  "这台被顶过吗"）与 `healFailedInRow`（这一轮连续失败，同时是额度读数）。
- ⚠️ **`hello-ok` 之后摘掉过期的 `hostToken` problem**：那几条 warn 说的是"这台主机
  现在连不上"，而走到 `hello-ok` 就证明令牌此刻能用 —— 不摘的话，用户手工换 token 之后
  一切正常，`status.json` 里却永久挂着一条假警报。
- **去掉一处重复实现**：`runtime.ts` 里有个**没人调用**的 `pendingForSession()`，而
  `cmd.get_pending` 那边内联复制了同一段筛选（注释还写着"必须逐字同判据"——两份实现
  正是它警告的事）。现在两条重放路（`cmd.get_pending` / `replayPending`）共用
  `pendingEntries()`。
- `pill/routes.ts` 的 `pairPageHandler(deps)` 不读 `deps`：**保留参数**（路由表统一工厂
  形状，判据按那个形状调用），但显式 `void deps` 并把理由写在注释里 —— 让"这个工厂
  不碰宿主状态"在代码里看得见。

> ⇒ npm 上仍是 3.1.4；这一版**要不要发**由下一次真发版时统一决定（小程序本身不发 npm）。

## 3.1.4

> 四个包一起 bump 到 `3.1.4`。**主题：把"向后兼容"整条清掉**（用户裁决：没有真实用户）。

- **认领必须带 `hostId`，且盘上那枚必须写 `hostId`**：`host-token.json` 的 `hostId`
  从可选变**必需**（缺了整份不可用，不再有"老文件照旧用"那条退路）；
  `readStoredHostToken(file, serverUrl, hostId, log)` 的身份判定从"两边都说得清才比"
  改成"不等就作废"。
- **host 身份只认自己产出的形状**：`host-id` 文件里除了 `drc-<12hex>` 之外一律换掉
  （旧写法 `h_xxxx` 不再沿用）。
- **能力位相关的接线删除**：`hello` 不再报 `capabilities`，`ev.host_info` 不再带 `caps`；
  `core/capabilities.ts` 只留"这一代内核能不能收图片"的探测（那是内核面的事实，不是版本兼容）。
- **重连重发 `ev.host_info` 的理由重写**：它现在只承载限额；不再有 `hostCaps` /
  `supportsResume()` 这套簿记。
- **打包脚本去掉上一代装法的擦屁股代码**：`pack-to-profile.mjs` 删 `LEGACY_DIR` 与
  "清掉旧直拷目录"，`install-to-profile.mjs` 不再替用户删旧的 `file:` 依赖。
- 判据：`claim-token` 的"老文件照样能用"翻成"缺 `hostId` 即不可用"；`host-id` 的
  "旧身份继续用"翻成"非本代形状一律换掉"；删掉"内核没有 `readHistory` 时不许报
  `resume`"那条（能力位没了）。

## 3.1.3

> 四个包一起 bump 到 `3.1.3`。**主题：认领时要表明身份**（配合中继侧
> 「按 hostId 一机一枚」的模型修正，起因是 2026-10-11 那次被别的机器顶下线的事故）。

- **认领请求带上 `{hostId}`**：中继据此把这枚令牌**绑到这一台**，于是别的机器认领时
  **顶不掉我们**。⚠️ 当时中继对不带 `hostId` 的认领还会落到"未绑定槽位"，
  而那条路在同一天晚间的后续改动里**已删除**（中继现在一律回 400 `host_id_required`；
  用户裁决「不需要兼容老客户端」）。
- **落盘记下 `hostId`**，并在"文件里的身份不是本机"时**当它不存在**（重新认领）。
  起因：`host-id` 文件被删/换了数据目录之后，盘上那枚属于**上一个身份**，
  拿它去连只会一直 `bad_token`，而插件有 token 就不再认领 ⇒ **永久连不上**且盘上文件看着正常。
  ⚠️ 当时为"老文件没有 `hostId` 字段"留了一条"照旧用"的退路，那条**已在 2026-10-11 晚间删除**：
  现在缺 `hostId` 的文件**整份不可用**（没有老用户，留着它只会让一个说不清归属的文件继续生效）。
- 中继回显的 `hostId` 与本机不同时留一条日志（不因此丢令牌：鉴权由中继按它记的槽位判定）。

判据 +3（`tests/claim-token.test.ts`）：请求体真的带了 hostId（且不知道身份时**不许**凭空编一个）/
落盘记下 hostId 且身份不符时作废 / 回显不符时留痕。
（"老文件照样能用"那一条判据后来**反向**了：缺 `hostId` 的文件现在整份不可用。）

## 3.1.2

> 四个包一起 bump 到 `3.1.2`。**这一版的主题是「插件装完就能用」**：
> 默认走官方中继、没有口令时启动自动认领并落盘，自部署与自定义收进设置页的进阶一栏。

- 🔴 **默认 `serverUrl` 改成 `wss://drc.provid.cc`**（原来是 `ws://127.0.0.1:8787`）。
  旧默认值只对"正好在本机跑着中继"的人成立，对下载插件的绝大多数人来说，
  它的真实含义是"配完也不通"（用户原话：下载下来发现不能用，直接就卸载了）。
  ⚠️ 随包分发的 `cordis.patch.yml` 里**刻意不再写** `serverUrl`：默认值只有一处事实源，
  两处各写一份必然漂移（那份 patch 是注入层，优先级高于默认值）。
- 🔴 **没有 host token 时，启动自动向中继认领一枚**（`POST <中继>/api/claim-token`），
  落进 `host-token.json`（0600，走 `platform/secure-file.ts` 那一条路，与 `status.json` 同目录），
  下次启动直接读盘。三条纪律都写进了判据：
  - 落盘**只走 `SecureFilePort`**（0600 + 原子写 + fsync），不新开写文件的路；
  - **形状定长校验**（48 位小写十六进制）：中继侧 `tokenMatches` 是定长比较，
    长度变了不会报错、只会让已装机的主机**静默**连不上 ⇒ 形状不对一律当失败、不落盘；
  - **认领失败不阻断启动**：载具与配对入口照常起来，只留一条 `warn:hostToken`
    与 `diagnostics.hostToken.*`（来源 / 认领结果 / 失败原因 / HTTP 状态码 / 文件名）。
    ⚠️ 盘上那枚记着"向哪台中继领的"：`serverUrl` 不同就不认它（拿旧凭据去连新中继，
    要么被拒，要么把上一台的服务器的凭据送给一台陌生的服务器）。
- **配置多出第四层**（`默认值 < 设置页写下的 < patch 注入 < 环境变量`）：设置页写下的自定义项
  落在 `user-config.json`（0600），**压在 patch 之下**——手写 patch 的人仍然说了算。
- **设置页多出「进阶：自部署 / 自定义」那一栏**（`GET|POST /plugins/dsh-remote-control/config`）：
  读当前中继地址与口令**来源**（只有脱敏形态，绝不给真值）、写自部署地址 / 自己的一枚口令、
  清除口令、恢复默认。三条行为判据：**只提交改动过的那一项**（口令框留空不许被当成"清空"）、
  保存失败要把宿主给的理由印出来（不许显示"已保存"）、状态轮询每两秒重画整页但
  **输入内容不许被抹掉**。
- 同类清理：`cordis.patch.yml` 里删掉 `approvalTimeoutSec: 180`（该键 2026-10-11 已删，
  留着只被静默忽略，而 README 又写着"没有这个键"）。

⚠️ 装机后**要重启 Harness** 才生效（换文件不热加载）；设置页那一栏改完也**重启才生效**
（中继地址与 token 是建连接时读一次的），回答里带 `restartRequired: true`。

✅ **中继已先部署**：`/api/claim-token` 随 `@dsh-remote/relay@3.1.2` 上了 ECS
（`https://drc.provid.cc/healthz` version=3.1.2；`GET /api/claim-token` → 405、
`POST` → 200 + 48 位 token、紧接着再 `POST` → 429）。顺序**必须先中继后插件**，
否则新装的插件认领会拿到 404 → 落到"没有 token" → 插件照常起来但连不上中继
（`diagnostics.hostToken.claim = failed` / `claimReason = http`）。

### 两条**仓级**修复（不进 npm 包，但同一版一起发）

- 🔴 **`release.yml` 里那一步写了两个 `run:`** —— GitHub 对重复 YAML 键是**整份拒绝**
  （`startup_failure`、0 秒、无 job、页面只写一句 `workflow file issue`）。
  于是 3.1.0 之后**三个包的自动发布全部停摆**，而症状看着像"Trusted Publishing 没配上"。
  修法：合成一个 `run: |`；判据见伞仓 `e2e/ci-gates.test.mjs` ⑨（+ ⑨b 反向）。
- **`scripts/pack-to-profile.mjs` 认不出 `DSH_PROFILE=desktop`** —— 那个环境变量
  **可能是路径、也可能是名字**（DSH 宿主自己就把名字放进环境里），当成路径会直接
  `profile not found: desktop`、装机一步都走不了。现在按
  `DSH_PROFILE_DIR` → 路径 → `~/.dsh/profiles/<名字>` 的顺序解析。

## 3.1.1

> 四个包（`protocol` / `relay` / `plugin` / `client`）一起 bump 到 `3.1.1`。
> **这一版是真修复**：审批卡、提问卡、待办三处都改成**只跟随宿主，不自己加逻辑**。

- 🔴 **审批/提问卡不再有主机侧期限**。原来 180/300 秒的上限**是插件自己加的**
  （宿主入参 `onApprovalRequest` / `onQuestionRequest` 本就不含期限字段），
  而它造成过真实故障：页面退后台 → 事件退订 → 卡帧到了 client 没到界面 →
  用户回到页面时主机早已判超时，于是"手机上点不动"。
  **现在跟随宿主的 `timeoutMs`：给了就跟随，没给就不设**（协议里 `expiresAt` 本就是可选的）。
- 🔴 **待办只转发内核发来的清单**。原来在轮次开始时若"上一轮显示过清单"就合成一帧空帧，
  而它的前提"内核不会为『这一轮没有待办』发帧"**是错的**（内核确实会发，同一条用例里就喂过
  `todos: []`）⇒ 那会造成双重清空。随它一起删掉的还有 `todoShown` 那套记账。
- 配置项 `approvalTimeoutSec` 随之删除（留着就是死配置）。
- 判据新增：形状（9 条，源码层面）与行为（1 条，两方向 × 两类卡）各一层，六处变异全部验证。

⚠️ 装机后**要重启 Harness** 才生效（换文件不热加载）。

⚠️ 重启后这样确认加载上了 —— **看顶层 `kernel` 这个键在不在**（不是看 `diagnostics` 的组数）：

```sh
python3 -c "import json,os;d=json.load(open(os.path.expanduser('~/.dsh/dsh-remote-control/status.json')));print('kernel 键数:', len(d.get('kernel') or {}))"
```

期望 `kernel 键数: 38` 左右、`kernel.attachmentFace = "commands.prompt"`。
⚠️ 我一度把这条判据说成"`diagnostics` 从 7 组变 8 组并多出 `kernel`" —— **那是错的**：
`kernel` 是**顶层键**，`diagnostics` 本来就是 7 组，两者都不随版本变。

## 3.1.0

> 四个包（`protocol` / `relay` / `plugin` / `client`）一起 bump 到 `3.1.0`。

**本包无功能改动** —— 3.0.8 那批修复（离线挂账 / 重连补推 / 工作区登记）就是当前行为。

- **发布链路换成 npm Trusted Publishing（OIDC）**：新增 `.github/workflows/release.yml`，
  打 `v*` tag 即发。没有 `NPM_TOKEN`、没有长期凭据 —— GitHub 签一个 OIDC token，npm 核对
  「这次运行确实是本仓、本工作流」之后发一个短时发布 token。
  `publishConfig.provenance` 随之打开 ⇒ **从这一版起 npm 上有供应链溯源**（v3.0.x 各版都没有）。
- **修 `repository` / `homepage` / `bugs`**：一直指向 `dsh-remote/dsh-remote-<包名>`（**不存在**），
  实际仓名是 `dsh-remote/<包名>` ⇒ npm 包页的仓库链接此前是 404。

## 3.0.0

> 3.0.1 ~ 3.0.8 是 v3 上线前后的迭代版本（都已发到 npm），逐版记录在伞仓
> [`docs/RELEASE.md`](https://github.com/linbin/dsh-remote-v3) 的「已发布记录」。
> 这一节只保留 3.0.0 当时的内容。

- v3：四端合并进 `dsh-remote-v3` 单仓开发；包名由 `dsh-remote-control` 迁到 **`@dsh-remote/plugin`**，
  仓库改到 [`dsh-remote/dsh-remote-plugin`](https://github.com/dsh-remote/dsh-remote-plugin)。
  运行时标识 `dsh-remote-control` **保持不变**（路由前缀、数据目录、profile 安装名）——那是有意的稳定标识。
- **PathsPort**（`src/platform/paths.ts`）：绝对路径判定 / 数据目录派生 / 工作区形状判定收成一处。
  修 v2 三处分叉——`config.ts` 两条 `startsWith('/')` 在 Windows 上把 `C:\` 路径**静默改道**；
  校验把正确的 `C:\` 配置报成「必须是绝对路径」；`carrier-services` 只收 POSIX 形态。
  判定带 `platform` 参数 ⇒ **在 macOS 上就能验 win32 行为**（15 形态 × 3 平台表驱动）。
- **SecureFilePort**（`src/platform/secure-file.ts`）：5 处 0600 落盘收敛为一处；补上 v2 只在 relay
  做了的「清同 pid 残留」；win32 上 `chmod` 只切只读位 ⇒ **显式 warn 一次**而不是假装生效；
  `safeFileName` 补 Windows 保留名（`CON` / `con.txt`）——此前会让**整批附件回滚**。
- **审批「本次会话内始终允许」**（§9.1）：查表放在挂 waterfall **之前**（放在之后就只是记账），
  键取「会话 + 类别」，随 `stop()` 清空。直接服务 30 秒原则。
- **浏览器半** `client/src` → `src/client`（消除第二个源码根），两个编译面各自自包含。
- **配对地址只有一处事实源**：二维码 `s=` 逐字等于 `serverUrl`（判据），小程序侧没有手填入口；
  死文案「请先扫码或**填写**中继服务地址」清零。
- **设计语义映射**（`docs/DESIGN-TOKENS.md`）：pill 的 7 个 fallback 色值从 CSS 里 18 处字面量
  收成一处（顺带修掉一个没人报的不一致：`label-secondary` 原来有两个兜底值）。
- 脚本去 shell 化：`install-to-profile.sh` → `.mjs`（`lastIndexOf('/')` 在 Windows 上得 -1，
  会把备份写到当前目录，而那文件带 hostToken）。
- 判据 524 → 562。

2.0.21 及更早的完整历史见 npm 版本页（旧仓已于 2026-10-20 删除，发布物仍在）：
[`dsh-remote-control` 的历史版本](https://www.npmjs.com/package/dsh-remote-control?activeTab=versions)。
