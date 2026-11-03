/**
 * persona-mount.test — 合包后「人设那一半挂没挂上」的判据（0.8.0）。
 *
 * 合包最大的风险不是人设坏了，是**人设坏了把远控也带坏**。所以这里钉死三件事：
 *
 * 1. 探不到 `systemPrompt` 时**不挂**，并且给出原因（而不是让整行不激活、静默消失）；
 * 2. 探测本身不抛——cordis 的 ctx 是 Proxy，读未声明属性**是抛错**，`?.` 挡不住；
 * 3. 有 `systemPrompt` 时段落真的注册进去了（人设那半是活的，不是"返回 mounted: true
 *    其实什么都没干"）。
 *
 * 第 3 条刻意只断言"注册了段落、且名字是人设的"，不去断言正文内容：
 * 正文是上游那边的判据（`dsh-persona-dafeiyu` 的 68 项），在这里重复一遍只会
 * 变成两份要同步维护的期望。
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { PERSONA_SECTION, hasSystemPrompt, mountPersona } from '../src/index.js'

test('hasSystemPrompt：Proxy 读属性会抛时返回 false，异常不许漏出去', () => {
  const throwing = new Proxy(
    {},
    {
      get() {
        throw new Error('cannot get property without inject')
      },
      has() {
        throw new Error('cannot use in without inject')
      },
    },
  )
  assert.equal(hasSystemPrompt(throwing), false)
  assert.equal(hasSystemPrompt(undefined), false)
  assert.equal(hasSystemPrompt(null), false)
  assert.equal(hasSystemPrompt({}), false)
  assert.equal(hasSystemPrompt({ systemPrompt: {} }), true)
})

test('mountPersona：宿主没 systemPrompt 就不挂，并说得出为什么', () => {
  const result = mountPersona({}, undefined)
  assert.deepEqual(result, { mounted: false, reason: 'no-systemPrompt' })
})

test('mountPersona：有 systemPrompt 时段落真的注册进去了', () => {
  const sections: { name: string }[] = []
  const ctx = {
    systemPrompt: {
      section: (def: { name: string }) => {
        sections.push(def)
        return () => {}
      },
      getSectionOrder: () => 0,
    },
    effect: (callback: () => unknown) => {
      callback()
      return () => {}
    },
    // 路由那半（`ctx.inject(['webServer'], cb)`）在宿主缺席时由人设自己软探测；
    // 这里的替身干脆不给 webServer —— 顺便证明"没有 webServer 也能挂上"。
    inject: () => {},
  }
  const result = mountPersona(ctx, {})
  assert.equal(result.mounted, true)
  assert.ok(sections.length > 0, '人设段落应被注册')
  assert.ok(
    sections.some((section) => section.name === PERSONA_SECTION),
    `应包含人设主段落 ${PERSONA_SECTION}`,
  )
})

test('mountPersona：persona.enabled = false 时仍挂载但整段停用（远控不受影响）', () => {
  const sections: { name: string }[] = []
  const ctx = {
    systemPrompt: {
      section: (def: { name: string }) => {
        sections.push(def)
        return () => {}
      },
      getSectionOrder: () => 0,
    },
    effect: (callback: () => unknown) => {
      callback()
      return () => {}
    },
    inject: () => {},
  }
  const result = mountPersona(ctx, { persona: { enabled: false } })
  assert.equal(result.mounted, true)
  // 总开关关掉时人设那半**一个段落都不注册**（上游判据同款）
  assert.equal(sections.length, 0)
})
