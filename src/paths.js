/**
 * trae-tamer · 项目根与标准目录解析
 *
 * MCP Server 是全局配置的一个进程，但工具要操作的是「当前项目」。
 * 根目录解析优先级（每个工具调用时）：
 *   1. 工具参数里显式传入的 root（模型知道当前工作区，可显式传递）；
 *   2. 启动参数 --root / 环境变量 TAMER_WORKSPACE；
 *   3. MCP 进程的 cwd（多数客户端会把它设成工作区目录）。
 * 记忆库/留痕仓库相对项目根定位，并沿目录树向上探测（与 dsh-tamer 行为一致）。
 */
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/**
 * @param {object} input
 * @param {string} [input.argRoot]  - 服务启动 --root
 * @param {string} [input.envRoot]  - TAMER_WORKSPACE
 * @param {string} [input.cwd]      - 进程 cwd
 * @param {string} [input.callRoot] - 单次工具调用传入的 root
 */
export function resolveRoot({ argRoot, envRoot, cwd = process.cwd(), callRoot } = {}) {
  const candidate = callRoot || argRoot || envRoot || cwd
  if (typeof candidate !== 'string' || !candidate.trim()) return resolve(cwd)
  // 显式传入相对路径时按 cwd 解析；拒绝空字节等明显非法输入
  const clean = candidate.replace(/\0/gu, '')
  return isAbsolute(clean) ? resolve(clean) : resolve(cwd, clean)
}

/**
 * 记忆库路径：显式值优先；否则在项目根下找 `记忆库/约定.md`，逐级向上最多 5 层；
 * 找不到则回落到项目根下的默认位置（首次写入时创建）。
 */
export function resolveMemoryPath({ root, configured = '' } = {}) {
  if (configured) return isAbsolute(configured) ? configured : resolve(root, configured)
  let dir = resolve(root)
  for (let i = 0; i < 5; i += 1) {
    const candidate = join(dir, '记忆库', '约定.md')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return join(resolve(root), '记忆库', '约定.md')
}

/** 留痕仓库根：显式值优先；否则用项目根下 `留痕仓库/`（不向上找，避免归档写到别的项目）。 */
export function resolveArchiveRoot({ root, configured = '' } = {}) {
  if (configured) return isAbsolute(configured) ? configured : resolve(root, configured)
  return join(resolve(root), '留痕仓库')
}
