/**
 * extensions/registry — 可安装扩展的**白名单**（2026-11-16）。
 *
 * ## 为什么必须是白名单
 *
 * 设置页上那个「安装」按钮的真实动作是：往 profile 的 `package.json` 里写一条
 * `dependencies[包名] = git+URL#sha`，再跑 `pnpm install`。也就是说**点一下就执行一段
 * 远程代码**。所以路由只认这张表里的 `id`，永远不接受前端传来的 URL / 包名 / 分支：
 *
 * - 表里没有 → 直接拒（路由回 `不在白名单里：<id>`），**不看请求体里其余字段**；
 * - 每条都钉**固定 commit**（不是分支名）：分支会漂，一漂就等于"用户点安装、实际装到的
 *   是别人刚推上去的东西"，那是这个功能最不该有的性质；
 * - 加新扩展 = 在这里加一行 + 发版。白名单的改动走正常发版评审，不是运行期行为。
 *
 * ## 装机不构建
 *
 * 这些扩展包都把 `dist/bundle` 提交进了 git（见 `README.md` 构建段），所以「安装」只是
 * 写依赖 + 加 bundle + `pnpm install`，**不跑任何构建脚本**——这也是上面那条"钉 sha"
 * 能成立的前提：装到的东西就是仓库里那棵树。
 */

export interface ExtensionSpec {
  /** 稳定 id，前端与路由都用它（不是包名）。 */
  id: string
  /** npm 包名（写进 `dependencies` 与 `dsh.profile.bundles` 的那个键）。 */
  packageName: string
  /** 设置页上显示的名字。 */
  label: string
  /** 一句话说明（面板上名字下面那一行）。 */
  description: string
  /** git 仓库地址（`https://`，不带 `git+` 前缀；拼依赖时再加）。 */
  gitUrl: string
  /** 固定 sha。**不许写分支名 / tag**，理由见文件头。 */
  commit: string
}

/**
 * 可安装扩展。两条：形象 + 肥鱼自治（selfloop）。
 *
 * 形象是房间协议（`src/client/rooms.ts`）的第一个住客，装上之后设置页多出「形象」那一栏；
 * selfloop 目前没有 `dsh.client`（它的 UI 由自己的静态服托管），所以装上了也**不会有 tab**，
 * 但它仍是可安装/启用/禁用的资产。
 *
 * ⚠️ `commit` 必须是**该版本已发布的完整 40 位 sha**：从 UI 重装会按这条重新钉版本，
 * 写旧了就是"点安装把包降级"。
 */
export const EXTENSIONS: readonly ExtensionSpec[] = [
  {
    id: 'avatar',
    packageName: 'dsh-avatar-dafeiyu',
    label: '形象',
    description: '大肥鱼的形象包：设置页「形象」分栏（素材查看器）与桌面悬浮小鲸鱼。',
    gitUrl: 'https://github.com/YaoyaoDeBaba/dafeiyu-avatar',
    commit: '445ff99775db2f5c23f8b1e379a0e519084c104f',
  },
  {
    id: 'selfloop',
    packageName: 'dsh-selfloop',
    label: '肥鱼自治（Selfloop）',
    description: '把「改参数 → 观测 → 判据 → 搜索」的闭环跑起来，产出可复验的证据包。',
    gitUrl: 'https://github.com/YaoyaoDeBaba/dafeiyu-harness-plugin',
    commit: '3a3d61904698e554cafc9d3ab5b960de9d506238',
  },
  {
    id: 'vision',
    packageName: 'dsh-vision-dafeiyu',
    label: '肥鱼识图 / 小云雀',
    description: '识图（外挂视觉模型）与小云雀（生图/生视频 CLI）：两个设置分栏 + 悬浮快捷入口。',
    gitUrl: 'https://github.com/YaoyaoDeBaba/dafeiyu-vision',
    commit: '462801acee307fde7437bff141a4b5de4077a76d',
  },
  {
    id: 'dev-kit',
    packageName: 'dsh-dev-kit-dafeiyu',
    label: '序列帧工具',
    description: '序列帧精灵图生成器：20 个 sprite_* 工具、工具页与配套 skill。',
    gitUrl: 'https://github.com/YaoyaoDeBaba/dafeiyu-dev-kit',
    commit: 'baf4e526ff4072bf52fc95111e50401ea726e966',
  },
]

/** 按 id 找白名单条目；找不到就是 undefined（调用方负责拒）。 */
export function findExtension(id: string | undefined | null): ExtensionSpec | undefined {
  const needle = typeof id === 'string' ? id.trim() : ''
  if (needle === '') return undefined
  return EXTENSIONS.find((spec) => spec.id === needle)
}

/**
 * 写进 `dependencies` 的那个值：`git+<url>#<sha>`。
 *
 * `git+` 前缀是 npm/pnpm 认 git 依赖的写法；profile 里现有的三条扩展依赖也都是这个形状
 * （见 `C:\Users\htsd\.dsh\profiles\desktop\package.json`）。
 */
export function dependencyOf(spec: ExtensionSpec): string {
  return `git+${spec.gitUrl}#${spec.commit}`
}
