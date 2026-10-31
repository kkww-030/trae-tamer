import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createServer, SERVER_VERSION } from '../src/mcp-server.mjs'
import { heartbeatPath } from '../src/state.js'

const here = dirname(fileURLToPath(import.meta.url))
const serverFile = resolve(here, '..', 'src', 'mcp-server.mjs')

function tmp() {
  return mkdtempSync(join(tmpdir(), 'tamer-mcp-'))
}

function rpc(server, method, params, id = 1) {
  return server.handle({ jsonrpc: '2.0', id, method, params })
}

test('initialize 握手返回协议版本与 tools 能力', () => {
  const s = createServer()
  const r = rpc(s, 'initialize', {})
  assert.equal(r.result.protocolVersion, '2024-11-05')
  assert.deepEqual(r.result.capabilities.tools, { listChanged: false })
  assert.equal(r.result.serverInfo.name, 'trae-tamer')
})

test('通知（无 id）不产生响应；未知方法报错；ping 通', () => {
  const s = createServer()
  assert.equal(s.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
  assert.equal(rpc(s, 'ping', {}).result && true, true)
  assert.equal(rpc(s, 'nope/method', {}, 9).error.code, -32601)
})

test('tools/list 暴露恰好 8 个工具且 schema 完整', () => {
  const s = createServer()
  const tools = rpc(s, 'tools/list').result.tools
  assert.equal(tools.length, 8)
  for (const t of tools) {
    assert.equal(t.inputSchema.type, 'object')
    assert.ok(t.description && t.description.length > 10)
  }
  assert.deepEqual(tools.map((t) => t.name), [
    'tamer_preflight', 'tamer_finalize', 'tamer_archive', 'tamer_remember',
    'tamer_forget', 'tamer_memory_list', 'tamer_mode_set', 'tamer_status',
  ])
})

test('完整工作流：preflight(客观) → 无来源 finalize=warn → 归档 → finalize=pass', () => {
  const project = tmp()
  const home = tmp()
  try {
    const s = createServer({ cwd: project, env: { TAMER_HOME: home } })

    // 未声明客观时，普通回复直接 pass（信任 preflight 声明，标准档不做回复扫描）
    const idle = s.callTool('tamer_finalize', { reply_text: '该芯片支持 3.3V。' })
    assert.match(idle.content[0].text, /通过（non-objective）/)

    // 声明客观
    const pre = s.callTool('tamer_preflight', { objective: true, task: '查引脚' })
    assert.equal(pre.isError, undefined)
    assert.match(pre.content[0].text, /tamer_archive/)

    // 没补来源前仍 warn
    const warn2 = s.callTool('tamer_finalize', { reply_text: '引脚如下。' })
    assert.equal(warn2.isError, true)

    // 归档后 pass
    const arc = s.callTool('tamer_archive', { project: '硬件项目', source: 'ST 手册', link: 'https://st.com/x' })
    assert.equal(arc.isError, undefined)
    assert.match(arc.content[0].text, /已归档/)

    const pass = s.callTool('tamer_finalize', { reply_text: '见手册。' })
    assert.equal(pass.isError, undefined)
    assert.match(pass.content[0].text, /通过（archived）/)

    // 文件真的落到了项目留痕仓库
    const mark = join(project, '留痕仓库', '硬件项目')
    assert.ok(existsSync(mark))
    assert.match(readFileSync(`${mark}/${readdir(mark)}`, 'utf8'), /ST 手册|来源名称/)

    // 状态已持久化（徽标数据源）
    assert.equal(JSON.parse(readFileSync(listState(home), 'utf8')).pendingWarning, null)
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('诚实声明「未找到可靠来源」→ pass', () => {
  const project = tmp()
  const home = tmp()
  try {
    const s = createServer({ cwd: project, env: { TAMER_HOME: home } })
    s.callTool('tamer_preflight', { objective: true })
    const r = s.callTool('tamer_finalize', { reply_text: '该参数未找到可靠来源。' })
    assert.match(r.content[0].text, /honest-not-found|通过/)
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('记忆增删查 + 非法参数 isError', () => {
  const project = tmp()
  const home = tmp()
  try {
    const s = createServer({ cwd: project, env: { TAMER_HOME: home } })
    assert.equal(s.callTool('tamer_remember', { content: '硬件安全要人工确认' }).isError, undefined)
    assert.match(s.callTool('tamer_memory_list').content[0].text, /硬件安全/)
    assert.match(s.callTool('tamer_forget', { keyword: '硬件' }).content[0].text, /删除 1 条/)
    assert.equal(s.callTool('tamer_remember', { content: '  ' }).isError, true)
    assert.equal(s.callTool('tamer_mode_set', { mode: 'fastboot' }).isError, true)
    const set = s.callTool('tamer_mode_set', { mode: '严格' })
    assert.match(set.content[0].text, /strict|严格/)
    assert.match(s.callTool('tamer_status').content[0].text, /档位：strict/)
    assert.ok(existsSync(join(project, '记忆库', '约定.md')))
  } finally {
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

test('真实子进程 stdio 冒烟：initialize → tools/list → 心跳文件出现', async () => {
  const project = tmp()
  const home = tmp()
  let child
  try {
    child = spawn(process.execPath, [serverFile, '--root', project], {
      env: { ...process.env, TAMER_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (c) => { out += c })

    const send = (o) => child.stdin.write(`${JSON.stringify(o)}\n`)
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })

    await waitFor(() => out.includes('"id":2'), 3000)
    assert.match(out, /trae-tamer/)
    assert.match(out, /tamer_archive/)
    // 心跳（5 秒一次，首拍立即写；给 2 秒余量）
    await waitFor(() => existsSync(heartbeatPath(home)), 3000)
    const hb = JSON.parse(readFileSync(heartbeatPath(home), 'utf8'))
    assert.equal(hb.server, 'trae-tamer')
    assert.equal(hb.version, SERVER_VERSION)
  } finally {
    child?.kill()
    rmSync(project, { recursive: true, force: true })
    rmSync(home, { recursive: true, force: true })
  }
})

// ── 辅助 ────────────────────────────────────────────────────────
function readdir(p) { return readdirSync(p)[0] }
function listState(home) { return join(home, 'workspaces', readdirSync(join(home, 'workspaces'))[0]) }
async function waitFor(pred, timeout = 2000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (pred()) return
    await new Promise((r) => setTimeout(r, 30))
  }
  throw new Error('等待条件超时')
}
