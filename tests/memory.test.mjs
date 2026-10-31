import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMemory, readMemory, appendMemory, removeMemory } from '../src/memory.js'
import { resolveMemoryPath, resolveRoot } from '../src/paths.js'

function tmp() {
  return mkdtempSync(join(tmpdir(), 'tamer-mem-'))
}

test('parseMemory 只取「- 」开头的约定行', () => {
  const md = '# 标题\n说明行\n- 约定一\n## 小节\n- 约定二\n'
  assert.deepEqual(parseMemory(md), ['- 约定一', '- 约定二'])
  assert.deepEqual(parseMemory(''), [])
  assert.deepEqual(parseMemory(null), [])
})

test('appendMemory 首次建文件、追加不重复前缀', () => {
  const dir = tmp()
  try {
    const p = join(dir, '记忆库', '约定.md')
    assert.equal(appendMemory(p, '第一条'), true)
    assert.equal(appendMemory(p, '- 第二条'), true)
    const entries = readMemory(p)
    assert.deepEqual(entries, ['- 第一条', '- 第二条'])
    assert.equal(appendMemory(p, '   '), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('removeMemory 按关键词删除并返回条数', () => {
  const dir = tmp()
  try {
    const p = join(dir, '约定.md')
    appendMemory(p, '硬件安全需人工确认')
    appendMemory(p, '优先本地网络')
    assert.equal(removeMemory(p, '硬件'), 1)
    assert.deepEqual(readMemory(p), ['- 优先本地网络'])
    assert.equal(removeMemory(p, '不存在'), 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('readMemory 文件不存在返回空数组', () => {
  assert.deepEqual(readMemory(join(tmp(), 'nope.md')), [])
})

test('resolveMemoryPath 显式优先，其次沿目录树向上探测', () => {
  const root = tmp()
  try {
    const deep = join(root, 'a', 'b', 'c')
    const mem = join(root, '记忆库', '约定.md')
    appendMemory(mem, 'x')
    assert.equal(resolveMemoryPath({ root: deep }), mem)
    // 找不到时回落到当前根
    const other = tmp()
    assert.equal(resolveMemoryPath({ root: other }), join(other, '记忆库', '约定.md'))
    rmSync(other, { recursive: true, force: true })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resolveRoot 优先级：callRoot > argRoot > envRoot > cwd', () => {
  const cwd = tmp()
  try {
    assert.match(resolveRoot({ cwd, callRoot: 'D:/xyz' }), /xyz$/)
    assert.equal(resolveRoot({ cwd, argRoot: cwd }), cwd)
    assert.ok(existsSync(resolveRoot({ cwd })))
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})
