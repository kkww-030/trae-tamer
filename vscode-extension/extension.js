/**
 * trae-tamer · 状态栏徽标（VS Code / Trae 扩展宿主）
 *
 * 唯一数据来源：~/.trae-tamer/heartbeat.json（由 MCP Server 每 5 秒原子写入）。
 * 本扩展不联网、不连进程、不执行任何命令，只用稳定 API：
 *   window.createStatusBarItem / workspace.fs / ThemeColor
 *
 * 三态：
 *   灰色 eye-closed  MCP 未连接（无心跳或已过期）
 *   绿色 eye-watch   MCP 在线，显示当前档位
 *   琥珀色背景       在线但有未消除的来源警示（finalize warn）
 */
const vscode = require('vscode')
const fs = require('fs')
const os = require('os')
const path = require('path')

const STALE_MS = 15000

const MODE_LABEL = {
  fast: '快速',
  standard: '标准',
  strict: '严格',
}

function tamerHome() {
  const configured = vscode.workspace.getConfiguration('trae-tamer').get('home', '')
  return configured && configured.trim() ? configured.trim() : path.join(os.homedir(), '.trae-tamer')
}

function pollMs() {
  const n = Number(vscode.workspace.getConfiguration('trae-tamer').get('pollMs', 3000))
  return Number.isFinite(n) && n >= 1000 ? n : 3000
}

function readHeartbeat() {
  try {
    const file = path.join(tamerHome(), 'heartbeat.json')
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    const ageMs = typeof raw.ts === 'number' ? Date.now() - raw.ts : null
    return { raw, alive: ageMs !== null && ageMs <= STALE_MS, ageMs }
  } catch {
    return { raw: null, alive: false, ageMs: null }
  }
}

function activate(context) {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.command = 'traeTamer.showStatus'
  context.subscriptions.push(item)
  item.show()

  function render() {
    const { raw, alive, ageMs } = readHeartbeat()
    item.backgroundColor = undefined
    if (!alive) {
      item.text = '$(eye-closed) 队友离线'
      item.tooltip = new vscode.MarkdownString(
        [
          '**trae-tamer MCP 未连接**',
          '',
          `心跳文件：${path.join(tamerHome(), 'heartbeat.json')}`,
          ageMs === null
            ? '从未收到心跳：请在 Trae「设置 → MCP」中添加 trae-tamer Server。'
            : `心跳已过期 ${Math.round(ageMs / 1000)} 秒：MCP Server 可能已停止。`,
          '',
          '点击查看配置步骤。',
        ].join('\n'),
      )
      return
    }
    const label = MODE_LABEL[raw.mode] || raw.mode || '未知档位'
    const warning = typeof raw.warning === 'string' && raw.warning.length > 0
    if (warning) {
      item.text = `$(eye-watch) 队友·${label} $(warning)`
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground')
      item.tooltip = new vscode.MarkdownString(
        [
          `**trae-tamer 在线 · ${label}档 · 有待补来源**`,
          '',
          `项目：${raw.project || '?'}`,
          `警示：${raw.warning}`,
          '',
          '在对话中补齐「信息来源」或归档后重新 finalize，琥珀色即消除。',
        ].join('\n'),
      )
    } else {
      item.text = `$(eye-watch) 队友·${label}`
      item.tooltip = new vscode.MarkdownString(
        [
          `**trae-tamer 在线 · ${label}档**`,
          '',
          `项目：${raw.project || '?'}`,
          `版本：${raw.version || '?'}`,
          '点击查看状态说明。',
        ].join('\n'),
      )
    }
  }

  const timer = setInterval(render, pollMs())
  context.subscriptions.push({ dispose: () => clearInterval(timer) })
  render()

  context.subscriptions.push(
    vscode.commands.registerCommand('traeTamer.showStatus', () => {
      const { raw, alive, ageMs } = readHeartbeat()
      if (!alive) {
        vscode.window.showWarningMessage(
          ageMs === null
            ? 'trae-tamer MCP 从未连接：请在 Trae 设置 → MCP 手动添加（JSON 见仓库 trae-tamer/README.md）。'
            : `trae-tamer MCP 心跳过期 ${Math.round(ageMs / 1000)} 秒。`,
          '打开 README',
        ).then((pick) => {
          if (pick === '打开 README') {
            const readme = path.join(__dirname, 'README.md')
            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(readme))
          }
        })
        return
      }
      vscode.window.showInformationMessage(
        `trae-tamer 在线（${raw.version || '?'}）· 项目 ${raw.project || '?'} · ${MODE_LABEL[raw.mode] || raw.mode}档`
        + `${raw.warning ? ' · 有待补来源警示' : ' · 无警示'}`,
      )
    }),
  )

  // 配置变化时立即重绘并重置节奏（轻量处理：直接重绘即可）
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('trae-tamer')) render()
  }))
}

function deactivate() {}

module.exports = { activate, deactivate }
