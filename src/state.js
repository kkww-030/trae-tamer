/**
 * trae-tamer · 每项目持久状态
 *
 * 档位等状态按项目存放在用户主目录的 ~/.trae-tamer/workspaces/ 下
 * （文件名 = 项目目录名 + 路径短哈希），不在用户项目里留任何痕迹。
 * 文件损坏时回落到默认状态而不是抛错——状态丢失最多重切一次档位。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { normalizeMode } from './modes.js'

export function tamerHome(env = process.env) {
  return env.TAMER_HOME || join(homedir(), '.trae-tamer')
}

/** 项目路径 → 状态文件名（可读目录名 + sha1 前 10 位防碰撞）。 */
export function workspaceKey(rootPath) {
  const abs = resolve(rootPath)
  const hash = createHash('sha1').update(abs, 'utf8').digest('hex').slice(0, 10)
  const base = abs.split(/[\\/]/u).filter(Boolean).pop() || 'root'
  const safe = base.replace(/[^a-zA-Z0-9一-鿿_-]/gu, '_').slice(0, 40) || 'root'
  return `${safe}_${hash}.json`
}

function freshState(config = {}) {
  return {
    version: 1,
    mode: normalizeMode(config.defaultMode, 'standard'),
    /** 本轮开工声明（preflight）：null = 尚未声明 */
    preflight: null,
    /** 最近一次交付校验结果 */
    lastFinalize: null,
    /** 最近一次未消除的警示（徽标琥珀色来源）；补齐后清空 */
    pendingWarning: null,
    updatedAt: null,
  }
}

/**
 * 状态仓库：所有 IO 都吞错并回落，保证工具调用永远不因状态文件而失败。
 */
export class StateStore {
  constructor({ home = tamerHome(), defaultMode = 'standard' } = {}) {
    this.home = home
    this.defaultMode = defaultMode
    this.dir = join(home, 'workspaces')
  }

  pathFor(root) {
    return join(this.dir, workspaceKey(root))
  }

  load(root) {
    const base = freshState({ defaultMode: this.defaultMode })
    try {
      const file = this.pathFor(root)
      if (!existsSync(file)) return base
      const raw = JSON.parse(readFileSync(file, 'utf8'))
      return {
        ...base,
        ...raw,
        mode: normalizeMode(raw?.mode, base.mode),
        preflight: raw?.preflight && typeof raw.preflight === 'object' ? raw.preflight : null,
        lastFinalize: raw?.lastFinalize && typeof raw.lastFinalize === 'object' ? raw.lastFinalize : null,
        pendingWarning: typeof raw?.pendingWarning === 'string' ? raw.pendingWarning : null,
      }
    } catch {
      return base
    }
  }

  /** 合并补丁并落盘；返回最新状态。落盘失败只影响持久化，不影响本次返回值。 */
  update(root, patch) {
    const next = { ...this.load(root), ...patch, updatedAt: new Date().toISOString() }
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.pathFor(root), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    } catch {
      /* 持久化失败不阻断工具 */
    }
    return next
  }
}

/** 心跳文件路径（徽标扩展只读它）。 */
export function heartbeatPath(home = tamerHome()) {
  return join(home, 'heartbeat.json')
}
