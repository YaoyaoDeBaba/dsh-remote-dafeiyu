/**
 * mount — 把「人设」这一半挂进远控那个包里（0.8.0 起两件事共用一个包、一行）。
 *
 * 为什么单独一个文件而不是直接写进 `index.ts`：
 *
 * 1. **它必须能被单独测**。合包最大的风险不是"人设坏了"，是"人设坏了把远控也带坏"。
 *    所以这里的判据是"探测不到 `systemPrompt` 就干脆不挂，并且说得出为什么"，
 *    这条必须能在测试里用假 ctx 复现（`tests/persona-mount.test.ts`）。
 * 2. `index.ts` 已经有 1400 行、管着远控主链路；人设挂载失败**不许**在那里留一个
 *    裸 try/catch 就完事——要留下可查的原因。
 *
 * 纪律（与远控主链路同款）：
 * - 不写 `inject:` 闸门。宿主缺 `systemPrompt` 时我们**软探测**并跳过，而不是让整行不激活——
 *   远控不能因为人设没挂上就跟着不出现。
 * - 探测属性一律走 try：cordis 的 ctx 是 Proxy，读一个未声明的属性名**是抛错**，
 *   可选链 `?.` 挡不住（远控这边为这件事吃过一次 fiber 进 FAILED 的亏）。
 */
import { apply as applyPersonaHost } from './host.js'

export type PersonaMountResult =
  | { mounted: true; config: Record<string, unknown> }
  | { mounted: false; reason: 'no-systemPrompt' }

/**
 * `systemPrompt` 在不在——**只能这么探**。
 *
 * `'systemPrompt' in ctx` 走的是 Proxy 的 has trap，不抛错；
 * 直接读 `ctx.systemPrompt` 会抛。两种宿主（真宿主 / 测试替身）都要过。
 */
export function hasSystemPrompt(ctx: unknown): boolean {
  if (ctx === undefined || ctx === null) return false
  try {
    if (typeof ctx === 'object' && 'systemPrompt' in (ctx as Record<string, unknown>)) return true
    const value = (ctx as { systemPrompt?: unknown }).systemPrompt
    return value !== undefined && value !== null
  } catch {
    return false
  }
}

/**
 * 挂人设半。返回结果而不是抛错：调用方（`apply`）只负责记一行日志。
 *
 * `injected.persona` 是合包后新增的配置口：`{ enabled: false }` 可以单独关掉人设那半，
 * 而不影响远控。默认 `{ enabled: true }`。
 */
export function mountPersona(ctx: unknown, injected?: { persona?: unknown }): PersonaMountResult {
  if (!hasSystemPrompt(ctx)) return { mounted: false, reason: 'no-systemPrompt' }
  const raw = injected?.persona
  const config: Record<string, unknown> = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {}
  if (config.enabled === undefined) config.enabled = true
  applyPersonaHost(ctx, config)
  return { mounted: true, config }
}
