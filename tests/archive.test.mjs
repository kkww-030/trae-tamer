import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  sanitizeSegment, stamp, buildMark, uniqueMarkPath, archiveSource,
} from '../src/archive.js'

function tmp() {
  return mkdtempSync(join(tmpdir(), 'tamer-arc-'))
}

test('sanitizeSegment 阻断穿越与非法字符，保留下划线中文', () => {
  assert.equal(sanitizeSegment('../../etc'), 'etc')
  assert.equal(sanitizeSegment('a/../b'), 'a_b')
  assert.equal(sanitizeSegment('_插件自检'), '_插件自检')
  assert.equal(sanitizeSegment('v2_最终稿'), 'v2_最终稿')
  assert.equal(sanitizeSegment('a:b?c'), 'a_b_c')
  assert.equal(sanitizeSegment('   '), '未命名')
  assert.match(sanitizeSegment('CON'), /^_CON/)
  assert.match(sanitizeSegment('nul.txt'), /^_nul/)
})

test('stamp 与 buildMark 格式', () => {
  assert.match(stamp(new Date(2026, 9, 7, 8, 9, 10)), /^20261007_080910$/)
  const md = buildMark({
    project: 'p', subject: 's', source: 'src', link: 'http://x', note: 'n', now: new Date(2026, 0, 1),
  })
  assert.match(md, /保存时间: 2026-01-01/)
  assert.match(md, /项目\/任务: p/)
  assert.match(md, /来源链接: http:\/\/x/)
})

test('archiveSource 落盘且同秒不覆盖', () => {
  const root = tmp()
  try {
    const now = new Date(2026, 5, 1, 12, 0, 0)
    const a = archiveSource({ root, project: '硬件', source: 'S1', now })
    const b = archiveSource({ root, project: '硬件', source: 'S2', now })
    assert.notEqual(a.path, b.path)
    assert.ok(existsSync(a.path))
    assert.ok(existsSync(b.path))
    assert.match(readFileSync(a.path, 'utf8'), /来源名称: S1/)
    assert.match(readFileSync(b.path, 'utf8'), /来源名称: S2/)
    assert.match(a.path, /留痕仓库|硬件/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveSource 缺 project 抛错', () => {
  const root = tmp()
  try {
    assert.throws(() => archiveSource({ root, project: '  ' }), /project/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archiveSource 复制原文；源文件缺失时跳过', () => {
  const root = tmp()
  try {
    const src = join(root, 'ds.pdf')
    writeFileSync(src, 'binary-ish')
    const r = archiveSource({ root, project: 'p', saveFile: src })
    assert.ok(existsSync(join(r.dir, 'ds.pdf')))
    const r2 = archiveSource({ root, project: 'p2', saveFile: join(root, 'missing.bin') })
    assert.equal(r2.savedFile, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('uniqueMarkPath 冲突时追加序号', () => {
  const root = tmp()
  try {
    const p1 = uniqueMarkPath(root, '20260101_000000')
    writeFileSync(p1, 'x')
    const p2 = uniqueMarkPath(root, '20260101_000000')
    assert.notEqual(p1, p2)
    assert.match(p2, /_2\.md$/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
