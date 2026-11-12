/**
 * sprite-orphans.test —— 无头浏览器"孤儿"治理的三条判据。
 *
 * 这里的每一条都对应一次真实事故：宿主崩溃后残留一堆 `msedge --headless`，
 * 把一次 `sprite_cleanup` 拖到 240 秒超时。判据一旦写宽就会误伤用户自己的浏览器，
 * 写窄了又治不了孤儿，所以全部钉成测试。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOurSpriteBrowserCommandLine, processAlive, SPRITE_PROFILE_PREFIX } from '../src/sprite/orphans.js'

const OUR_PROFILE = `--user-data-dir=C:\\Users\\x\\AppData\\Local\\Temp\\${SPRITE_PROFILE_PREFIX}abc123`

test('识别本插件的无头浏览器：无头 + 本插件临时 profile', () => {
  assert.equal(isOurSpriteBrowserCommandLine(`msedge.exe --headless --disable-gpu ${OUR_PROFILE} about:blank`), true)
  // 参数顺序不该影响判断
  assert.equal(isOurSpriteBrowserCommandLine(`msedge.exe ${OUR_PROFILE} --headless=new`), true)
  assert.equal(isOurSpriteBrowserCommandLine(`msedge.exe --headless --user-data-dir=D:\\tmp\\${SPRITE_PROFILE_PREFIX}z`), true)
})

test('绝不能误伤用户自己的 Edge 窗口', () => {
  // 正常 Edge 没有 --headless
  assert.equal(isOurSpriteBrowserCommandLine(`msedge.exe ${OUR_PROFILE}`), false)
  // 无头但 profile 不是我们的（比如别人家的 headless 工具）
  assert.equal(isOurSpriteBrowserCommandLine('msedge.exe --headless --user-data-dir=C:\\other\\profile'), false)
  assert.equal(isOurSpriteBrowserCommandLine('chrome.exe --headless --user-data-dir=C:\\Users\\x\\AppData\\Local\\Temp\\puppeteer-1'), false)
})

test('脏输入一律判否，不许抛', () => {
  assert.equal(isOurSpriteBrowserCommandLine(''), false)
  assert.equal(isOurSpriteBrowserCommandLine(undefined), false)
  assert.equal(isOurSpriteBrowserCommandLine(null), false)
})

test('processAlive：自己活着、随机 PID 不存在、非法输入不算活', () => {
  assert.equal(processAlive(process.pid), true, '当前进程必须判为活着')
  assert.equal(processAlive(2 ** 22 + 12345), false, '不存在的 PID 必须判为死了')
  assert.equal(processAlive(0), false)
  assert.equal(processAlive(-1), false)
  assert.equal(processAlive(Number.NaN), false)
})
