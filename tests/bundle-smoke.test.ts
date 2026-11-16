/**
 * bundle-smoke.test — 打出来的包（`dist/bundle/index.js`）能不能在**宿主形状的 ctx** 上挂起来。
 *
 * 为什么单独测"成品"：src 层的测试再多，也验证不了 esbuild 打包时 externals 漏了哪个模块、
 * 或者 bundle 里某段初始化在 ESM/CJS 混载时炸掉。这里用**真的 dist bundle**、假的宿主服务
 * （webServer / systemPrompt / tools / provide / effect）跑一遍 `apply()`，钉住：
 *
 * 1. 记忆 1 条路由挂上了（识图那 3 条 2026-11-16 随 `dsh-vision-dafeiyu` 走了，
 *    所以这里同时反过来钉"本包**不再**注册它们"）；
 * 2. `dafeiyu:persona` / `dafeiyu:memory-hint` / `dafeiyu:memory` 三个段落都在，顺序对；
 * 3. 三个记忆工具都注册了（`recognize_image` 也随包走了）；
 * 4. `dshRemoteControl` / `dafeiyuMemory` 都 provide 了（`dafeiyuVision` 随包走）。
 *
 * 跑法：先 `node node_modules/typescript/bin/tsc -p tsconfig.json && node scripts/bundle-plugin.mjs`，
 * 再 `node --test "dist/tests/**\/*.test.js"`（CI 与本地同款）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

test('成品 bundle：路由 / 段落 / 工具 / provide 在宿主形状的 ctx 上全部挂齐', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dafeiyu-bundle-smoke-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const bundleFile = new URL('../bundle/index.js', import.meta.url)
    const mod = (await import(bundleFile.href)) as { apply?: (ctx: unknown, injected?: Record<string, unknown>) => void }
    assert.equal(typeof mod.apply, 'function', 'bundle 必须导出 apply')

    const routes: string[] = []
    const tools: string[] = []
    const sections: Array<{ name: string; order?: number; text?: unknown }> = []
    const provided: string[] = []
    const webServer = {
      register(route: { path: string }) {
        routes.push(route.path)
        return () => undefined
      },
    }
    const systemPrompt = {
      section(definition: { name: string; order?: number; text?: unknown }) {
        sections.push(definition)
        return () => undefined
      },
      getSectionOrder: () => 0,
    }
    const toolsService = {
      register(definition: { name: string }) {
        tools.push(definition.name)
      },
    }
    const ctx = {
      get(name: string, optional?: true) {
        if (!optional) return undefined
        if (name === 'webServer') return webServer
        if (name === 'systemPrompt') return systemPrompt
        if (name === 'tools') return toolsService
        return undefined
      },
      inject() {
        return () => undefined
      },
      provide(name: string) {
        provided.push(name)
      },
      effect(callback: () => unknown) {
        const off = callback()
        if (typeof off === 'function') off()
      },
      on() {},
      off() {},
    }

    mod.apply!(ctx, {
      hostToken: 'fake-host-token-for-smoke-test-0123456789abcdef',
      // dshHome = dirname(dirname(statusFile)) —— 按 `<home>/storages/status.json` 摆
      statusFile: path.join(home, 'storages', 'status.json'),
      serverUrl: 'ws://127.0.0.1:9/v05',
      enabled: true,
    })

    // 记忆那条路由必须挂上。
    assert.ok(routes.includes('/api/dsh-remote-dafeiyu/memory'), `缺路由 /api/dsh-remote-dafeiyu/memory（现有：${routes.join(', ')}）`)
    /*
     * 反向保险（2026-11-16 新增）：识图那三条、小云雀那七条**都不该**再出现在本包的成品里。
     * 它们随 `dsh-vision-dafeiyu` 走了——那边装不上时当然什么都没有，但本包**注册了**它们
     * 才是缺陷（两条同路径的 exact 路由会互相抢，先注册的那条拿到请求）。
     */
    for (const prefix of ['/api/dsh-remote-dafeiyu/vision', '/api/dsh-remote-dafeiyu/xyq']) {
      assert.ok(
        !routes.some((route) => route.startsWith(prefix)),
        `${prefix}/* 已随 dsh-vision-dafeiyu 迁出，本包不该再注册（现有：${routes.join(', ')}）`,
      )
    }

    const sectionNames = sections.map((item) => item.name).join(', ')
    const section = (name: string) => sections.find((item) => item.name === name)
    assert.ok(section('dafeiyu:persona'), '人设主段落要挂上')
    assert.ok(section('dafeiyu:memory-hint'), '记忆使用说明段要常驻')
    assert.ok(section('dafeiyu:memory'), '记忆段要挂上')
    // `dafeiyu:vision` 提示段随识图包走了：本包不该再挂它（原来这里钉"必须挂上"）。
    assert.equal(section('dafeiyu:vision'), undefined, `识图提示段已随包迁出（现有段落：${sectionNames}）`)
    const hintOrder = section('dafeiyu:memory-hint')?.order ?? -1
    const memoryOrder = section('dafeiyu:memory')?.order ?? -1
    const clockOrder = section('dafeiyu:clock')?.order ?? -1
    assert.ok(hintOrder < memoryOrder && memoryOrder < clockOrder, `段落顺序不对：${hintOrder} / ${memoryOrder} / ${clockOrder}`)
    assert.equal(typeof section('dafeiyu:memory')?.text, 'function', '记忆段必须是动态函数（按会话解析人设）')

    // 三个记忆工具必须在；`recognize_image` 随包走了（原来它在这个集合里）。
    for (const name of ['record_memory', 'read_memory', 'forget_memory']) {
      assert.ok(tools.includes(name), `缺工具 ${name}（现有：${tools.join(', ')}）`)
    }
    assert.ok(!tools.includes('recognize_image'), `recognize_image 已随 dsh-vision-dafeiyu 迁出（现有：${tools.join(', ')}）`)
    // 小云雀那 4 个工具同理。
    for (const name of ['generate_image', 'generate_video', 'xyq_balance', 'xyq_models']) {
      assert.ok(!tools.includes(name), `${name} 已随 dsh-vision-dafeiyu 迁出（现有：${tools.join(', ')}）`)
    }
    for (const name of ['dshRemoteControl', 'dafeiyuMemory']) {
      assert.ok(provided.includes(name), `缺 provide ${name}（现有：${provided.join(', ')}）`)
    }
    // `dafeiyuVision` 那个服务名也随包走了（原来由 `startVision` provide）。
    assert.ok(
      !provided.includes('dafeiyuVision'),
      `dafeiyuVision 已随 dsh-vision-dafeiyu 迁出（现有：${provided.join(', ')}）`,
    )
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
})
