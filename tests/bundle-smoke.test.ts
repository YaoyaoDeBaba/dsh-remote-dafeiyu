/**
 * bundle-smoke.test — 打出来的包（`dist/bundle/index.js`）能不能在**宿主形状的 ctx** 上挂起来。
 *
 * 为什么单独测"成品"：src 层的测试再多，也验证不了 esbuild 打包时 externals 漏了哪个模块、
 * 或者 bundle 里某段初始化在 ESM/CJS 混载时炸掉。这里用**真的 dist bundle**、假的宿主服务
 * （webServer / systemPrompt / tools / provide / effect）跑一遍 `apply()`，钉住：
 *
 * 1. 识图 3 条路由 + 记忆 1 条路由都挂上；
 * 2. `dafeiyu:persona` / `dafeiyu:memory-hint` / `dafeiyu:memory` 三个段落都在，顺序对；
 * 3. `recognize_image` + 三个记忆工具都注册了；
 * 4. `dshRemoteControl` / `dafeiyuVision` / `dafeiyuMemory` 都 provide 了。
 *
 * 跑法：先 `node node_modules/typescript/bin/tsc -p tsconfig.json && node scripts/bundle-plugin.mjs`，
 * 再 `node --test "dist/tests/**\/*.test.js"`（CI 与本地同款）。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { DEFAULT_VISION_CONFIG } from '../src/vision/config.js'
import { createVisionService, writeVisionConfig } from '../src/vision/service.js'

test('成品 bundle：路由 / 段落 / 工具 / provide 在宿主形状的 ctx 上全部挂齐', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'dafeiyu-bundle-smoke-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    // 先把识图配置打开（默认是关的，关着就不注册工具/提示段——这是设计）
    const vision = createVisionService(home)
    assert.equal(writeVisionConfig(vision.configFile, { ...DEFAULT_VISION_CONFIG, enabled: true, apiKey: 'sk-smoke' }), true)

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

    for (const route of [
      '/api/dsh-remote-dafeiyu/vision/config',
      '/api/dsh-remote-dafeiyu/vision/recognize',
      '/api/dsh-remote-dafeiyu/vision/models',
      '/api/dsh-remote-dafeiyu/memory',
    ]) {
      assert.ok(routes.includes(route), `缺路由 ${route}（现有：${routes.join(', ')}）`)
    }

    const sectionNames = sections.map((item) => item.name).join(', ')
    const section = (name: string) => sections.find((item) => item.name === name)
    assert.ok(section('dafeiyu:persona'), '人设主段落要挂上')
    assert.ok(section('dafeiyu:memory-hint'), '记忆使用说明段要常驻')
    assert.ok(section('dafeiyu:memory'), '记忆段要挂上')
    assert.ok(section('dafeiyu:vision'), `识图开着时提示段要挂上（现有段落：${sectionNames}）`)
    const hintOrder = section('dafeiyu:memory-hint')?.order ?? -1
    const memoryOrder = section('dafeiyu:memory')?.order ?? -1
    const clockOrder = section('dafeiyu:clock')?.order ?? -1
    assert.ok(hintOrder < memoryOrder && memoryOrder < clockOrder, `段落顺序不对：${hintOrder} / ${memoryOrder} / ${clockOrder}`)
    assert.equal(typeof section('dafeiyu:memory')?.text, 'function', '记忆段必须是动态函数（按会话解析人设）')

    for (const name of ['recognize_image', 'record_memory', 'read_memory', 'forget_memory']) {
      assert.ok(tools.includes(name), `缺工具 ${name}（现有：${tools.join(', ')}）`)
    }
    for (const name of ['dshRemoteControl', 'dafeiyuVision', 'dafeiyuMemory']) {
      assert.ok(provided.includes(name), `缺 provide ${name}（现有：${provided.join(', ')}）`)
    }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    rmSync(home, { recursive: true, force: true })
  }
})
