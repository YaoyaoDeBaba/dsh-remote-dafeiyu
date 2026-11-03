/**
 * `client-factory.js`（生成物）的类型声明。
 *
 * 那份生成物是「人设客户端剥掉 loader 外壳」得到的工厂：喂它装载器的 `require`，
 * 它返回人设客户端自己的 `module.exports`（`apply` / `inject` / 几个 React 组件）。
 * 这里只声明本仓用到的那两样。
 */
export default function personaClientFactory(require: (id: string) => unknown): {
  apply?: (ctx: unknown) => void
  inject?: readonly string[]
  name?: string
}
