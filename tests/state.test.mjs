import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StateStore, workspaceKey, tamerHome, heartbeatPath } from '../src/state.js'
import { writeHeartbeat, readHeartbeat, startHeartbeat, STALE_MS } from '../src/heartbeat.js'

function tmp() {
  return mkdtempSync(join(tmpdir(), 'tamer-st-'))
}

test('workspaceKey 同路径稳定、不同路径不同', () => {
  assert.equal(workspaceKey('D:/AI驯服工具'), workspaceKey('D:\\AI驯服工具'))
  assert.notEqual(workspaceKey('D:/a'), workspaceKey('D:/b'))
})

test('StateStore 默认状态 + 持久化更新', () => {
  const home = tmp()
  try {
    const store = new StateStore({ home })
    const root = 'D:/some-project'
    assert.equal(store.load(root).mode, 'standard')
    const next = store.update(root, { mode: 'strict', pendingWarning: 'w' })
    assert.equal(next.mode, 'strict')
    // 新 store 实例（模拟进程重启）能读到
    const store2 = new StateStore({ home })
    assert.equal(store2.load(root).mode, 'strict')
    assert.equal(store2.load(root).pendingWarning, 'w')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('状态文件损坏时回落默认，不抛错', () => {
  const home = tmp()
  try {
    const store = new StateStore({ home })
    const root = 'D:/p'
    store.update(root, { mode: 'fast' })
    writeFileSync(store.pathFor(root), '{ 坏 json', 'utf8')
    assert.equal(store.load(root).mode, 'standard')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('心跳：写入即可读、过期判离线、原子文件不残留 .tmp', () => {
  const home = tmp()
  try {
    writeHeartbeat({ mode: 'standard', warning: null }, { home })
    const fresh = readHeartbeat({ home, now: Date.now() })
    assert.equal(fresh.alive, true)
    assert.equal(fresh.snapshot.mode, 'standard')
    const stale = readHeartbeat({ home, now: Date.now() + STALE_MS + 1000 })
    assert.equal(stale.alive, false)
    assert.ok(!existsSync(join(home, 'heartbeat.json.tmp')))
    assert.equal(readHeartbeat({ home: join(home, 'nope') }).alive, false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('startHeartbeat 周期写且可停止', async () => {
  const home = tmp()
  try {
    let mode = 'standard'
    const stop = startHeartbeat(() => ({ mode, warning: null }), { home, intervalMs: 20 })
    mode = 'strict'
    await new Promise((r) => setTimeout(r, 45))
    assert.equal(readHeartbeat({ home }).snapshot.mode, 'strict')
    stop()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('tamerHome 支持 TAMER_HOME 覆盖', () => {
  assert.equal(tamerHome({ TAMER_HOME: 'X:/t' }), 'X:/t')
  assert.match(heartbeatPath('X:/t'), /heartbeat\.json$/)
})
