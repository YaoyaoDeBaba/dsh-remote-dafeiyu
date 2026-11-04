/**
 * mount — 把「人设」这一半挂进远控那个包里（0.8.0 起两件事共用一个包、一行）。
 *
 * 为什么单独一个文件而不是直接写进 `index.ts`：
 *
 * 1. **它必须能被单独测**。合包最大的风险不是"人设坏了"，是"人设坏了把远控也带坏"。
 *    所以这里的判据是"探不到 `systemPrompt` 就干脆不挂，并且说得出为什么"，
 *    这条必须能在测试里用假 ctx 复现（`tests/persona-mount.test.ts`）。
 * 2. `index.ts` 已经有 1400 行、管着远控主链路；人设挂载失败**不许**在那里留一个
 *    裸 try/catch 就完事——要留下可查的原因。
 *
 * ## 为什么不是 `export const inject = ['systemPrompt']`（这是本文件最关键的一段）
 *
 * cordis 的 ctx 是 Proxy：**没写进 `inject` 的服务名，读它就是抛错**。人设那边原来的表述
 * 是模块级 `inject: ['systemPrompt']`（它自己是这么拿到段落的）。照抄到本包会踩两条：
 *
 * 1. 远控这一侧的纪律是**不写 inject 闸门**（见 `cordis.patch.yml` 的注释）：写闸门的后果是
 *    某一代宿主缺这个服务时**整行不激活**——远控跟着一起没了。这一条是 2026-09 真机上
 *    踩出来的（`fiber` 进 FAILED、六个 `ctx.inject` 子 fiber 全被 dispose）。
 * 2. 闸门是**全行**生效的，人设和远控挤在同一行 ⇒ 闸门写谁的名字都会把另一个带上。
 *
 * 所以这里走另一条路：**软探测 `ctx.get('systemPrompt', true)`，探到了再给人设那一半
 * 套一层只补这一个属性的 Proxy**。这样"人设能不能挂"与"这一行激不激活"彻底解耦。
 */
import { apply as applyPersonaHost } from './host.js'

export type PersonaMountResult =
  | { mounted: true; config: Record<string, unknown> }
  | { mounted: false; reason: 'no-systemPrompt' }

type ServiceGetter = { get?: (name: string, optional?: true) => unknown }

/**
 * `systemPrompt` 在不在——**只能这么探**。
 *
 * 两条路都要走：
 * - `ctx.get(name, true)`：真宿主上的正路（与远控探 `webServer` / `slots` 同款）；
 * - `'x' in ctx` + 直接读：测试替身/别的代际没有 `get` 时仍要能认出这个服务。
 *
 * 全程 try：cordis 的 Proxy 读未声明属性**是抛错**，`?.` 挡不住。
 */
export function probeSystemPrompt(ctx: unknown): unknown {
  if (ctx === undefined || ctx === null) return undefined
  try {
    const got = (ctx as ServiceGetter).get?.('systemPrompt', true)
    if (got !== undefined && got !== null) return got
  } catch {
    /* 没有 get，或者这一代不认这个服务名 */
  }
  try {
    if (typeof ctx === 'object' && 'systemPrompt' in (ctx as Record<string, unknown>)) {
      const value = (ctx as { systemPrompt?: unknown }).systemPrompt
      if (value !== undefined && value !== null) return value
    }
  } catch {
    /* 同上：Proxy 的 has trap 也可能不支持 */
  }
  return undefined
}

/** 探测的结果是一句话：探到了返回服务，探不到返回 undefined。 */
export function hasSystemPrompt(ctx: unknown): boolean {
  return probeSystemPrompt(ctx) !== undefined
}

/**
 * 给人设那一半套一层 Proxy：只补 `systemPrompt`，其余原样转发。
 *
 * `Reflect.get(target, prop)` 不传 receiver 是**故意的**：cordis 把方法绑在自己的 ctx 上，
 * 把代理当 receiver 传进去会让 `this` 变成代理，某些内部记账会错位。
 */
function withSystemPrompt(ctx: unknown, systemPrompt: unknown): unknown {
  if (ctx === null || typeof ctx !== 'object') return ctx
  return new Proxy(ctx as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop === 'systemPrompt') return systemPrompt
      return Reflect.get(target, prop)
    },
    has(target, prop) {
      if (prop === 'systemPrompt') return true
      return Reflect.has(target, prop)
    },
  })
}

/**
 * 挂人设半。返回结果而不是抛错：调用方（`apply`）只负责记一行日志。
 *
 * `injected.persona` 是合包后新增的配置口：`{ enabled: false }` 可以单独关掉人设那半，
 * 而不影响远控。默认 `{ enabled: true }`。
 */
export function mountPersona(
  ctx: unknown,
  injected?: { persona?: unknown },
  extra?: { memory?: unknown },
): PersonaMountResult {
  const systemPrompt = probeSystemPrompt(ctx)
  if (systemPrompt === undefined) return { mounted: false, reason: 'no-systemPrompt' }
  const raw = injected?.persona
  const config: Record<string, unknown> = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
  if (config.enabled === undefined) config.enabled = true
  // `extra.memory`（0.9.0）：记忆库句柄，人设宿主拿它拼「长期记忆」段。
  // 不传等于不接记忆（段落不注册、功能全关）。
  applyPersonaHost(withSystemPrompt(ctx, systemPrompt), config, extra)
  return { mounted: true, config }
}
