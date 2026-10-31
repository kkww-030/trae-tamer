import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseModeArg, normalizeMode, modeHint, MODES } from '../src/modes.js'

test('parseModeArg 接受枚举名与整串中文别名', () => {
  assert.equal(parseModeArg('fast'), 'fast')
  assert.equal(parseModeArg(' STRICT '), 'strict')
  assert.equal(parseModeArg('严格模式'), 'strict')
  assert.equal(parseModeArg('快速'), 'fast')
  assert.equal(parseModeArg('标准'), 'standard')
})

test('parseModeArg 拒绝子串匹配（FastAPI / fastboot / strict mode 句子都不切档）', () => {
  // 这是 dsh-tamer 的真实事故根因，这里必须严格
  for (const bad of ['FastAPI', '用 fastboot 刷机', 'strictly speaking', '标准库怎么用', '讲一下 fast io', '']) {
    assert.equal(parseModeArg(bad), null, `不应把「${bad}」识别为档位`)
  }
})

test('parseModeArg 对非字符串与垃圾输入返回 null', () => {
  assert.equal(parseModeArg(undefined), null)
  assert.equal(parseModeArg(123), null)
  assert.equal(parseModeArg(null), null)
})

test('normalizeMode 非法回落', () => {
  assert.equal(normalizeMode('xxx', 'fast'), 'fast')
  assert.equal(normalizeMode(undefined), 'standard')
})

test('每档都有文案', () => {
  for (const m of MODES) assert.match(modeHint(m), /：/)
})
