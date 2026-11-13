# 写一个工具：字段、文案、注释

> 读这篇的场景：你正在写 `src/<域>/tools.ts` 与 `src/<域>/start.ts`。
> 仓库里最好的两个模板：`src/subagents/tools.ts`（单工具 + 批量容错 + 人话报错）、
> `src/sprite/tools.ts`（14 个工具、参数分档、`ignored` 显形）。

## 1. 骨架（可以直接照着改）

```ts
const OUT = {
  schema: { type: 'string' },
  render: (_args: unknown, value: unknown): unknown[] => [{ type: 'text', text: String(value) }],
}

export function buildXxxTools(deps: XxxToolDeps): Array<Record<string, unknown>> {
  return [
    {
      name: 'xxx_do_something',
      description: '一句话说清它干什么 + 关键口径 + 什么情况别调',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: '绝对路径' } },
        required: ['path'],
      },
      output: OUT,
      timeoutMs: 30_000,
      async execute(args: Record<string, unknown>, exec: unknown): Promise<string> {
        // 1) 先把入参收敛，缺了就直接回一句能照做的错
        // 2) 干活走 service
        // 3) 返回一行 JSON 字符串（模型读数字，人读路径）
        return JSON.stringify({ ok: true, … })
      },
    },
  ]
}
```

## 2. 六个字段逐条

### `name`

- `<域>_<动作>`，蛇形全小写；同一域内前缀一致（`sprite_prepare` / `sprite_key_apply`），
  模型就是靠前缀认领"这一批是一个工具的家族"。
- **全仓唯一**。已占用的：`sprite_*`（14 个）、`record_memory` / `read_memory` / `forget_memory`、
  `recognize_image`、`generate_image` / `generate_video` / `xyq_balance` / `xyq_models`、`subagent_archive`。
- 别起 `do_task`、`run` 这种不带域的名字——并行 agent 各加一个，撞名之后注册顺序决定谁赢。

### `description`

这是**唯一给模型的说明书**：`src/sprite/tools.ts:2-9` 第 2 条纪律就是为它写的——
"锚点口径、两档参数、`preview` 会清缓存这类语义，写进 description，不让调用方去读 6000 行 HTML 逆推"。

必须包含三样：

1. **口径**：单位、坐标空间、默认值（例：`start 默认 0`、`minRun 连续命中多少行才算数，默认 1`）。
2. **哪一档生效**：参数分档时逐条标"仅 classic / 仅 advanced"，不然模型会传一堆被忽略的键。
3. **什么时候别调**：`src/xyq/tools.ts:35` 那句"用户没有明确要求画图时不要调用"——
   这类约束只能写在 description 里，代码拦不住。

反面：一句话带过（"生成图片"）⇒ 模型每次都猜参数、每次都要人纠正。
`src/subagents/tools.ts` 的做法更值得抄：把"该归档什么、**不要**归档什么"整段写进 description。

### `parameters`

- JSON Schema 子集：`type` / `properties` / `required` / `items` / `enum` / `minimum` / `maximum`。
  别用 `$ref`、`oneOf`、`allOf` 这类花活——宿主只透传，模型也读不懂。
- `required` 必须写全；**可选参数不要放进 required**。
- 枚举值从 `types.ts` 取常量展开（`src/sprite/scan.ts:16-21` 第 2 处），
  与实现共用一份，不然"schema 说支持 X、实现不认 X"迟早发生（`.57` 的 `mode` 就是）。
- 每个属性都带 `description`：模型看的是它，不是你的字段名。

### `output`

固定写法，不要自己发明：

```ts
const OUT = { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] }
```

### `timeoutMs`

必须显式给，按最坏情况估：

| 场景 | 参考值 | 现场 |
|---|---|---|
| 纯本地计算 / 读一小份文件 | 10_000 ~ 15_000 | `src/memory/start.ts:63`、`src/sprite/tools.ts:676` |
| 一次 HTTP / CLI 调用 | 30_000 ~ 120_000 | `src/subagents/tools.ts:55`、`src/vision/start.ts:221` |
| 要起子进程或浏览器 | 240_000 起 | `src/sprite/tools.ts:131`（抽帧）、`:203`（apply） |
| 批量 / 长任务 | 600_000 ~ 1_800_000 | `src/sprite/tools.ts:586`（batch） |

给太小的表现是"工具永远超时"，给太大会把并发拖死——按实测那一步最慢的情况给。

### `execute`

- 签名 `execute(args, exec)`。第二参是执行上下文，只在需要会话 id 时用：
  `src/xyq/tools.ts:11-16` 的 `sessionKeyOf` 从 `exec.agent.session.id` 取。
- **返回字符串**：成功的形状是一行 JSON（模型读数字、人读路径），或者 markdown（给人看的清单）。
- **失败就 `throw`**，错误消息是中文、能被照做。宿主会把这句话给模型，模型会转述给用户。
  `src/subagents/tools.ts:26-33` 的 `explain()` 是范本：把内核的 `running/busy` 翻成
  "还在跑，等它收工再归档（内核不允许归档运行中的会话）"+ 原文截断。
- **批量工具逐条容错**，不许"一条失败整批抛"：`src/subagents/tools.ts:83-96` 收集
  `done` / `failed[]`，返回 `{ ok, done, failed, note }`；`note` 里写"下一步该干什么"，
  免得模型以为没成功就结束了。
- **入参先收敛再干活**：去重、去空白、类型校验都在最前面（`src/subagents/tools.ts:78-82`），
  返回里显式说"哪个键不合法"。

### `ignored`：传了但没认的键必须显形

`src/sprite/tools.ts:35-39` 的 `ignoredKeysOf`：工具只认白名单，其它键收进 `ignored` 一起返回。
这条判据来自 `.57`："工具层把 `mode/feather/cleanup/adv*` 滤掉了，高级档参数静默失效"。
你自己写的域，凡是"参数按档位/按步骤生效"的，都要在返回里带 `ignored`。

## 3. 配套 `<域>_guide`：兜底，不是第二份文档

模型读不到 skill 时（打包漏了、目录没铺开）需要一条退路，所以工具里留一个 `<域>_guide`。
**但它不许自己写一份文案**：

```ts
const definitions = buildTools(service, { guideBody: () => readSpriteSkillBody(skillAssetsRoot) })
```

- 真源只有一份：`assets/skills/dafeiyu-<域>/SKILL.md`（+ `references/`）。
- 去掉 frontmatter 后返回正文的函数是 `src/sprite/skill.ts` 的 `readSpriteSkillBody`；
  读不到时退回 `guide.ts` 里的**短**兜底（`src/sprite/guide.ts:28-33`：六步 + 三条硬规则 + 两个坑，
  刻意不复刻整篇）。
- 防的事故：指南曾经有三份（系统提示短版 / `sprite_guide` 长版 / docs 里的 md），
  改 A 忘了 B，结果是"文档说一套、工具做一套"，每批素材重新踩一遍（`src/sprite/guide.ts:9-10`）。

## 4. `start.ts` 里的日志

`log` 的签名是 `(message: string, fields?: Record<string, string | number | boolean | undefined>) => void`。
规矩：

- **message 用中文，一句话说"发生了什么"**；变化量/原因放 `fields`。
- 外部错误消息必须截断再进 fields（`.slice(0, 200)`），错误消息长度不由我们决定
  （`tests/log-line.test.ts:6` 记着这条）。
- 失败路径**必须**留一行：软挂载失败的静默，是这套东西里最贵的故障形态。

## 5. 注释：写"为什么"，不写"做了什么"

仓库的注释风格是硬要求，不是偏好（`src/index.ts:9-16`、`src/sprite/scan.ts:1-23`、
`src/sprite/guard.ts:1-6` 都是这个风格）：

1. **文件头**：这个文件为什么存在 / 为什么单独成文件 / 它替掉了什么旧形状。
2. **踩过的坑写成注释**：日期 + 症状 + 根因 + 判据在哪。
   例：`src/subagents/start.ts:220-222`（0.9.0-dafeiyu.6 的 inject 抛错）、
   `src/sprite/guard.ts:12-17`（`.57` 导出退原帧）。
3. **别复述代码**：`// 遍历 ids` 这种零信息；要写"为什么这里必须去重"。
4. **中文**。变量名/类型名/API 名保持英文，说明文字中文。
5. **不要写"以后可能要……"的空头承诺**——真做不了就删掉，别留一句会过期的注释。

## 6. 一个容易忽略的边界

工具里**不要碰内核对象**。要宿主能力（列会话、发消息、归档…）就走 `ports` 的可选方法，
缺了就 `throw` 一句中文（"主机这一代不支持 X（没有 listSubagents）"，见 `src/index.ts:1474`）。
工具层直接 `import '@deepseek-ai/*'` = 把可测性契约撕了，单测就只能靠手写替身。
