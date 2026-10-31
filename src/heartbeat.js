/**
 * trae-tamer · 心跳（MCP Server → 状态栏徽标 的唯一通信通道）
 *
 * 设计：MCP 每 5 秒原子写一次 ~/.trae-tamer/heartbeat.json；VSIX 扩展只读文件、
 * 不联网、不连进程。超过 15 秒没更新 = MCP 没运行（徽标灰色）。
 * 多窗口时最后写入者获胜——v1 可接受，徽标本就是「插件活着」的粗粒度信号。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { heartbeatPath, tamerHome } from './state.js'

export const HEARTBEAT_INTERVAL_MS = 5000
/** 超过这个时间没心跳即视为离线（留 3 倍余量，避免偶发 IO 抖动误报）。 */
export const STALE_MS = 15000

/** 原子写：先写临时文件再 rename，避免徽标读到半截 JSON。 */
export function writeHeartbeat(snapshot, { home = tamerHome() } = {}) {
  const path = heartbeatPath(home)
  const tmp = `${path}.tmp`
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(tmp, `${JSON.stringify({ ts: Date.now(), ...snapshot })}\n`, 'utf8')
    renameSync(tmp, path)
  } catch {
    /* 心跳失败不影响工具 */
  }
}

/**
 * @returns {{alive: boolean, snapshot: object|null, ageMs: number|null}}
 */
export function readHeartbeat({ home = tamerHome(), now = Date.now() } = {}) {
  try {
    const raw = JSON.parse(readFileSync(heartbeatPath(home), 'utf8'))
    const ageMs = typeof raw?.ts === 'number' ? now - raw.ts : null
    return { alive: ageMs !== null && ageMs <= STALE_MS, snapshot: raw, ageMs }
  } catch {
    return { alive: false, snapshot: null, ageMs: null }
  }
}

/**
 * 启动周期心跳。snapshotProvider 每次取最新状态（档位/警示会变）。
 * @returns {() => void} stop
 */
export function startHeartbeat(snapshotProvider, { home = tamerHome(), intervalMs = HEARTBEAT_INTERVAL_MS } = {}) {
  writeHeartbeat(snapshotProvider(), { home })
  const timer = setInterval(() => {
    writeHeartbeat(snapshotProvider(), { home })
  }, intervalMs)
  // 不阻止进程退出
  if (typeof timer.unref === 'function') timer.unref()
  return () => clearInterval(timer)
}
