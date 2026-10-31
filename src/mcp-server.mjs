#!/usr/bin/env node
/**
 * trae-tamer · 零依赖 MCP Server（stdio / JSON-RPC 2.0，MCP 2024-11-05）
 *
 * 不依赖 @modelcontextprotocol/sdk：协议面只用得到 initialize / tools/list /
 * tools/call 三个方法 + 换行分隔 JSON，手写实现约 200 行，换来零安装、可审计。
 *
 * 直接运行：node src/mcp-server.mjs [--root <项目根>]
 * 测试用：导出 createServer()，在进程内驱动完整 JSON-RPC 序列。
 */
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runPreflight, evaluateFinalize } from './censor.js'
import { archiveSource } from './archive.js'
import { appendMemory, readMemory, removeMemory } from './memory.js'
import { resolveMemoryPath, resolveArchiveRoot, resolveRoot } from './paths.js'
import { parseModeArg, modeHint, normalizeMode } from './modes.js'
import { StateStore, tamerHome } from './state.js'
import { startHeartbeat } from './heartbeat.js'

export const SERVER_NAME = 'trae-tamer'
export const SERVER_VERSION = '0.1.0'
export const PROTOCOL_VERSION = '2024-11-05'

/** 工具定义（name/description/inputSchema 即 MCP Tool 结构）。 */
export const TOOL_DEFS = [
  {
    name: 'tamer_preflight',
    description:
      '【开工自检】接到任务后、动手前调用。声明本轮是否涉及客观信息（硬件/芯片/标准规范/政策法规/行情价格/论文结论等）。objective=true 时返回来源工作流指引；并重置本轮归档计数。',
    inputSchema: {
      type: 'object',
      properties: {
        objective: { type: 'boolean', description: '本轮是否涉及客观事实、需要可核验来源' },
        task: { type: 'string', description: '本轮任务一句话概述（可选，便于追溯）' },
        root: { type: 'string', description: '项目根绝对路径；不传则用 MCP 工作区/cwd' },
      },
      required: ['objective'],
    },
  },
  {
    name: 'tamer_finalize',
    description:
      '【交付自检】发出最终回复前必须调用（preflight 声明客观、或严格档时）。校验是否已归档/已列来源/已诚实声明查不到。status=warn 时必须先补齐再回复，不要把 warn 当通过。',
    inputSchema: {
      type: 'object',
      properties: {
        reply_text: { type: 'string', description: '即将发出的回复全文（用于检查来源链接与「未找到可靠来源」声明）' },
        said_not_found: { type: 'boolean', description: '是否已在回复中明确写「未找到可靠来源」' },
        root: { type: 'string' },
      },
    },
  },
  {
    name: 'tamer_archive',
    description:
      '把一条信息来源归档到本项目「留痕仓库/<project>/来源登记_时间戳.md」，可选复制原文。返回登记文件绝对路径。涉及客观信息的重要结论结束时使用。',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: '项目/任务名（决定子文件夹，必填）' },
        subject: { type: 'string', description: '信息主题，如「STM32F103 引脚定义」' },
        source: { type: 'string', description: '来源名称，如「ST 官方数据手册」' },
        link: { type: 'string', description: '来源链接 URL' },
        note: { type: 'string', description: '用途说明' },
        save_file: { type: 'string', description: '可选：一并复制进仓库的本地原文绝对路径' },
        root: { type: 'string' },
      },
      required: ['project'],
    },
  },
  {
    name: 'tamer_remember',
    description: '向本项目「记忆库/约定.md」追加一条长期约定（长期生效，跨会话）。',
    inputSchema: {
      type: 'object',
      properties: { content: { type: 'string' }, root: { type: 'string' } },
      required: ['content'],
    },
  },
  {
    name: 'tamer_forget',
    description: '删除记忆库中包含指定关键词的约定，返回删除条数。',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string' }, root: { type: 'string' } },
      required: ['keyword'],
    },
  },
  {
    name: 'tamer_memory_list',
    description: '列出本项目记忆库中的全部长期约定。',
    inputSchema: { type: 'object', properties: { root: { type: 'string' } } },
  },
  {
    name: 'tamer_mode_set',
    description: '显式切换驯服档位：fast(快速) / standard(标准，默认) / strict(严格)。仅在用户明确要求换档时调用。',
    inputSchema: {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['fast', 'standard', 'strict', '快速', '标准', '严格', '快速模式', '标准模式', '严格模式'] } },
      required: ['mode'],
    },
  },
  {
    name: 'tamer_status',
    description: '查看当前项目的档位、开工声明、未消除警示、记忆库条数与留痕仓库路径。',
    inputSchema: { type: 'object', properties: { root: { type: 'string' } } },
  },
]

const toolNames = new Set(TOOL_DEFS.map((t) => t.name))

/**
 * 创建服务器实例（不持有 stdin/stdout，方便测试）。
 * @param {object} [opts]
 * @param {string} [opts.argRoot]
 * @param {NodeJS.ProcessEnv} [opts.env]
 * @param {string} [opts.cwd]
 * @param {boolean} [opts.heartbeat] - 是否启动周期心跳（直接运行时 true）
 */
export function createServer(opts = {}) {
  const env = opts.env ?? process.env
  const cwd = opts.cwd ?? process.cwd()
  const argRoot = opts.argRoot
  const store = new StateStore({ home: tamerHome(env), defaultMode: 'standard' })
  /** 每项目本轮计数：root → { objective, archivedCount, task } */
  const turns = new Map()
  let lastRoot = null

  const rootOf = (args = {}) => {
    const root = resolveRoot({ argRoot, envRoot: env.TAMER_WORKSPACE, cwd, callRoot: args.root })
    lastRoot = root
    return root
  }

  function snapshot() {
    const root = lastRoot || argRoot || env.TAMER_WORKSPACE || cwd
    const s = store.load(root)
    return {
      server: SERVER_NAME,
      version: SERVER_VERSION,
      mode: s.mode,
      project: basename(root),
      warning: s.pendingWarning ?? null,
    }
  }

  let stopHeartbeat = () => {}
  if (opts.heartbeat) stopHeartbeat = startHeartbeat(snapshot, { home: tamerHome(env) })

  function text(value, isError = false) {
    // MCP 惯例：isError 缺省即成功；只有失败时显式带 true
    return isError
      ? { content: [{ type: 'text', text: String(value) }], isError: true }
      : { content: [{ type: 'text', text: String(value) }] }
  }

  /** 执行单个工具；返回 MCP CallToolResult。 */
  function callTool(name, args = {}) {
    if (!toolNames.has(name)) return text(`未知工具：${name}`, true)
    try {
      switch (name) {
        case 'tamer_preflight': {
          if (typeof args.objective !== 'boolean') return text('参数 objective（布尔）必填', true)
          const root = rootOf(args)
          const state = store.load(root)
          const guide = runPreflight({ objective: args.objective, task: args.task, mode: state.mode })
          turns.set(root, { objective: guide.objective, archivedCount: 0, task: String(args.task ?? '') })
          store.update(root, {
            preflight: { objective: guide.objective, task: String(args.task ?? ''), at: new Date().toISOString() },
          })
          return text(`${guide.guidance}\n（当前档位：${state.mode}）`)
        }
        case 'tamer_archive': {
          if (!args.project || typeof args.project !== 'string' || !args.project.trim()) {
            return text('参数 project（项目/任务名）必填', true)
          }
          const root = rootOf(args)
          const r = archiveSource({
            root: resolveArchiveRoot({ root }),
            project: args.project,
            subject: args.subject ?? '',
            source: args.source ?? '',
            link: args.link ?? '',
            note: args.note ?? '',
            saveFile: args.save_file ?? '',
            copyFiles: true,
          })
          const turn = turns.get(root)
          if (turn) turn.archivedCount += 1
          return text(`已归档：${r.path}${r.savedFile ? `\n原文已复制：${r.savedFile}` : ''}`)
        }
        case 'tamer_finalize': {
          const root = rootOf(args)
          const state = store.load(root)
          const turn = turns.get(root)
          const verdict = evaluateFinalize({
            declaredObjective: turn?.objective ?? state.preflight?.objective ?? false,
            archivedCount: turn?.archivedCount ?? 0,
            replyText: typeof args.reply_text === 'string' ? args.reply_text : '',
            saidNotFound: args.said_not_found === true,
            mode: state.mode,
          })
          store.update(root, {
            lastFinalize: { ...verdict, at: new Date().toISOString() },
            pendingWarning: verdict.status === 'warn' ? `${verdict.code} @ ${new Date().toISOString()}` : null,
          })
          if (verdict.status === 'warn') {
            return text(`⚠️ 来源自检未通过（${verdict.code}）：${verdict.reason}\n补救：${verdict.action ?? ''}`, true)
          }
          return text(`✅ 来源自检通过（${verdict.code}）：${verdict.reason}`)
        }
        case 'tamer_remember': {
          if (!args.content || typeof args.content !== 'string' || !args.content.trim()) {
            return text('参数 content 必填', true)
          }
          const root = rootOf(args)
          const path = resolveMemoryPath({ root })
          const ok = appendMemory(path, args.content)
          return ok ? text(`已记入长期记忆：${path}\n当前共 ${readMemory(path).length} 条约定`) : text('写入失败（空内容？）', true)
        }
        case 'tamer_forget': {
          if (!args.keyword || typeof args.keyword !== 'string' || !args.keyword.trim()) {
            return text('参数 keyword 必填', true)
          }
          const root = rootOf(args)
          const path = resolveMemoryPath({ root })
          const n = removeMemory(path, args.keyword)
          return text(`已删除 ${n} 条含「${args.keyword}」的约定（${path}）`)
        }
        case 'tamer_memory_list': {
          const root = rootOf(args)
          const path = resolveMemoryPath({ root })
          const entries = readMemory(path)
          return text(entries.length ? `记忆库（${path}）：\n${entries.join('\n')}` : `记忆库为空（${path}）`)
        }
        case 'tamer_mode_set': {
          const mode = parseModeArg(args.mode)
          if (!mode) return text(`非法档位：${args.mode}（只接受 fast/standard/strict 或 快速/标准/严格）`, true)
          const root = rootOf(args)
          store.update(root, { mode })
          return text(`已切换到【${mode}】：${modeHint(mode)}`)
        }
        case 'tamer_status': {
          const root = rootOf(args)
          const state = store.load(root)
          const memPath = resolveMemoryPath({ root })
          const lines = [
            `档位：${state.mode}（${modeHint(normalizeMode(state.mode))}）`,
            `开工声明：${state.preflight ? (state.preflight.objective ? '客观信息任务' : '非客观任务') : '本轮尚未 preflight'}`,
            `未消除警示：${state.pendingWarning ?? '无'}`,
            `最近自检：${state.lastFinalize ? `${state.lastFinalize.status}(${state.lastFinalize.code})` : '无'}`,
            `记忆库：${readMemory(memPath).length} 条 · ${memPath}`,
            `留痕仓库：${resolveArchiveRoot({ root })}`,
            `数据主目录：${tamerHome(env)}`,
          ]
          return text(lines.join('\n'))
        }
        default:
          return text(`未实现的工具：${name}`, true)
      }
    } catch (error) {
      return text(`工具执行失败：${String(error?.stack ?? error)}`, true)
    }
  }

  /**
   * 处理一条已解析的 JSON-RPC 消息。
   * @returns 响应对象；通知（无 id）返回 null
   */
  function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0') return null
    const { id, method, params } = message
    const reply = (result) => ({ jsonrpc: '2.0', id, result })
    const error = (code, messageText, data) => ({
      jsonrpc: '2.0',
      id,
      error: { code, message: messageText, ...(data ? { data } : {}) },
    })
    // 通知一律无响应
    if (id === undefined || id === null) return null

    if (method === 'initialize') {
      return reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      })
    }
    if (method === 'ping') return reply({})
    if (method === 'tools/list') return reply({ tools: TOOL_DEFS })
    if (method === 'tools/call') {
      if (!params || typeof params.name !== 'string') return error(-32602, '缺少 params.name')
      return reply(callTool(params.name, params.arguments ?? {}))
    }
    // 已初始化通知等：无 id 已在上面过滤；未知带 id 方法按 MCP 惯例回方法不存在
    return error(-32601, `未知方法：${method}`)
  }

  return { handle, callTool, snapshot, stop: stopHeartbeat }
}

/** 连接 stdin/stdout（仅直接运行时）。 */
export function serveStdio() {
  const argv = process.argv.slice(2)
  let argRoot
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root' && argv[i + 1]) argRoot = argv[i + 1]
  }

  const server = createServer({ argRoot, heartbeat: true })
  let buffer = ''

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let nl
    // MCP stdio：每条消息一行 JSON
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let message
      try {
        message = JSON.parse(line)
      } catch {
        continue // 坏行直接忽略，不能因此挂掉
      }
      const response = server.handle(message)
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
    }
  })
  process.stdin.on('end', () => {
    server.stop()
    process.exit(0)
  })
}

// ESM 直接运行（node src/mcp-server.mjs）时启动；被 import 时不启动
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  serveStdio()
}
