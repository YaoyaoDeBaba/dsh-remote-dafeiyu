# 症状 → 根因 → 处理

| 症状 | 大概率原因 | 处理 |
|---|---|---|
| 导出图 alpha 全 255、背景还是绿的 | 抠图缓存被清（跑过 preview / 改过参数）/ 键色不对 | 重新 `sprite_key_apply` 再立刻 `sprite_export`（工具会直接报错提醒） |
| 主体边缘一圈橄榄色 | 经典档去绿不足 | 换 advanced，或加 `greenToAlpha` |
| 裁剪框莫名变大 | 某帧有残留/漂浮物，并集把它带上 | 看 `measure` 的 `perFrameSpread`；或 `trim.mode:"first-frame"` |
| 角色高 ≠ 目标 | 用错了「bbox 高」语义 | 用 `scale_to` 的 `charHeightPx` + `span` |
| 切动作"瞬移" | 锚点跨素材复用 / 口径不一致 | 每段单独量；读 meta 的 `anchorConvention` 与 `anchorYTopDown` |
| 结果差 1~2px | trim pad / alphaThreshold 默认值 | 看 `cleanup` 返回的 `pad` 与 `alphaThreshold` |
| webp 导出报"不支持" | 这个浏览器没有 webp 编码 | 换 png，或升级浏览器 |
| 头顶线穿过额头 | "白色"判据把肤色算成白 | 用 `probe.channel:"whiteness"`（低饱和<25 + luma>210） |
| 纵轴偏高一点 | alpha 底含阴影 | 改用颜色/连续性判据 |
| `maskAuto` 说"未命中" | 角标压在渐变背景上，严格判据对比度不够 | 看 `warnings` 与 `path`：`corner-fallback` = 已用四角低置信兜底；也可显式 `maskMode:"corner"` |
| 报了 `maskRect` 但不确定对不对 | 低置信兜底（<0.8）会**真的**去遮 | 先看 `watermarkCandidates[].selected` 与 `rejectedReason`，确认没吃掉角色 |
| 取 `rects[0]` 遮到了 1px 高的残片 | 候选**全部**吐出，含 `selected:false` | 用 `selected===true`，或看 `selectedCount` / `path` |
| 报"会话已空闲回收" | 超过 5 分钟没操作，帧数据被释放（**没有 `extract()` 这个工具**） | 重新 `sprite_prepare`，前面的抠图参数要重来 |
| `sprite_*` 突然卡几分钟 | 宿主崩过留下的**孤儿无头浏览器**在抢端口 | 重启宿主：新版启动时会自动清"父进程已不在"的浏览器 |
| 传了锚点但 meta 里没有 | 旧版 export 的锚点没回读（`.71` 修） | 升级；或先 `set_anchor` 再 export。看 `meta.anchorWritten` |
| 一组里大小不一 | 逐条量的噪声 | 先证"同角色"，再统一缩放 |
| 整体偏大/偏小 | 基准样本选错 | 拿已确认样本当基准，先复现 ≤1px |
| 锚点系统性偏移 | 用"近似特征"替代了语义点 | 语义点单独测；或模板匹配 |
| 以为成功其实没生效 | 只看返回值 | 成品复量（`measured`）+ 大图准绳 |
| 参数改了没反应 | 接口参数未落盘 | 先用独立接口写入，再导出 |
| 单列扫描被呆毛/手/特效骗 | 单点必被局部干扰带偏 | 改用 `columns` 多列 + `aggregate:"median"`；命中率<50% 会直接 `found:false` |
| 导出绿着但图是烂的 | 主体压着画框边缘（手/道具/特效） | 看 `key_apply` 的 `warnings`（压边 >5% 会报）；`batch`/`auto` 也会透传 |
| 头顶线忽高忽低 | 某列扫到了遮挡物 | 看 `perColumn` 的逐列 `py` 与 `confidence`；极差 >帧高 10% 会报"疑似被遮挡" |
| `minRun` 不知道该给多少 | 没有参考尺度 | 缺省时返回里给推荐值（`round(帧高×0.2)` 取 5 的倍数，下限 8），照它给 |
