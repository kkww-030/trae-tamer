/**
 * trae-tamer · 外部记忆库
 *
 * 文件格式与 记忆库/约定.md、dsh-tamer、tracing/archive.py 完全兼容：
 * 只把 `- ` 开头的行当作长期约定，`#` 注释与说明行一律忽略。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 从记忆库文件全文里提取约定行（保持原顺序）。 */
export function parseMemory(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
}

/** 记忆库文件是否存在。 */
export function memoryExists(path) {
  return typeof path === 'string' && path.length > 0 && existsSync(path)
}

/** 读取记忆库，返回约定行数组；文件不存在返回空数组。读失败也返回空数组（绝不让工具崩）。 */
export function readMemory(path) {
  if (!memoryExists(path)) return []
  try {
    return parseMemory(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

/** 追加一条约定。返回是否写入成功。 */
export function appendMemory(path, text) {
  const value = String(text ?? '').trim()
  if (!value) return false
  const line = value.startsWith('- ') ? value : `- ${value}`
  const existing = memoryExists(path) ? readFileSync(path, 'utf8') : '# AI驯服工具 · 外部记忆库（长期约定）\n'
  const separator = existing.endsWith('\n') ? '' : '\n'
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${existing}${separator}${line}\n`, 'utf8')
  return true
}

/** 删除包含关键词的约定行，返回删除条数。 */
export function removeMemory(path, keyword) {
  const needle = String(keyword ?? '').trim()
  if (!needle || !memoryExists(path)) return 0
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u)
  const kept = lines.filter((line) => !(line.trim().startsWith('- ') && line.includes(needle)))
  const removed = lines.length - kept.length
  if (removed > 0) {
    // 去掉尾部空行后统一以单个换行结尾
    const text = kept.join('\n').replace(/\n{2,}$/u, '\n')
    writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8')
  }
  return removed
}
