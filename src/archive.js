/**
 * trae-tamer · 留痕归档
 *
 * 落盘格式与 tracing/archive.py、dsh-tamer 完全一致（同一套字段与文件名规则）。
 * 相对 dsh 版修正两处：
 *   1. 同一秒连续归档不再静默互相覆盖（自动追加 -2/-3 后缀）；
 *   2. Windows 保留设备名（CON/PRN/NUL…）做了防护，避免写文件抛怪异错误。
 */
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/iu

/** 把 `project` 归一化成安全的单段目录名，避免穿越出留痕仓库。 */
export function sanitizeSegment(value, fallback = '未命名') {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback
  // 按路径分隔符切段，丢弃空段与 `.` / `..`，再用 `_` 拼回单段：穿越意图直接消失，
  // 合法下划线/中文/空格原样保留。
  let cleaned = raw
    .split(/[\\/]+/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .join('_')
    .replace(/[:*?"<>|]/gu, '_')
    .replace(/[.\s]+$/u, '')
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `_${cleaned}`
  return cleaned || fallback
}

/** 时间戳：文件名用 `YYYYMMDD_HHMMSS`（与 archive.py 一致）。 */
export function stamp(date = new Date()) {
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(
    date.getMinutes(),
  )}${p(date.getSeconds())}`
}

/** 登记文件正文（字段顺序与 archive.py 一致，便于 diff）。 */
export function buildMark({ project, subject, source, link, note, saveFileName, now = new Date() }) {
  const p = (n) => String(n).padStart(2, '0')
  const lines = [
    '# 信息来源留痕',
    '',
    `- 保存时间: ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(
      now.getMinutes(),
    )}:${p(now.getSeconds())}`,
    `- 项目/任务: ${project}`,
  ]
  if (subject) lines.push(`- 主题: ${subject}`)
  if (source) lines.push(`- 来源名称: ${source}`)
  if (link) lines.push(`- 来源链接: ${link}`)
  if (note) lines.push(`- 用途: ${note}`)
  if (saveFileName) lines.push(`- 存档原文: ${saveFileName}`)
  lines.push('', '（本记录由 trae-tamer 插件自动生成，用于结论追溯。）')
  return `${lines.join('\n')}\n`
}

/** 选一个不与现有文件冲突的登记文件路径（同秒追加 -2/-3）。 */
export function uniqueMarkPath(dir, ts) {
  const first = join(dir, `来源登记_${ts}.md`)
  if (!existsSync(first)) return first
  for (let i = 2; i < 100; i += 1) {
    const candidate = join(dir, `来源登记_${ts}_${i}.md`)
    if (!existsSync(candidate)) return candidate
  }
  // 极端兜底：毫秒
  return join(dir, `来源登记_${ts}_${Date.now()}.md`)
}

/**
 * 归档一条来源。
 * @returns {{path: string, dir: string, bytes: number, savedFile: string|null, totalBytes: number}}
 */
export function archiveSource(input) {
  const { root, project, subject = '', source = '', link = '', note = '', saveFile = '', copyFiles = true } = input
  if (!project || typeof project !== 'string' || !project.trim()) {
    throw new Error('tamer_archive: project（项目/任务名）为必填')
  }
  const now = input.now instanceof Date ? input.now : new Date()
  const dir = join(resolve(root), sanitizeSegment(project))

  let savedFile = null
  let saveFileName = ''
  if (copyFiles && saveFile && existsSync(saveFile)) {
    saveFileName = basename(saveFile)
    savedFile = saveFileName
  }

  const body = buildMark({ project, subject, source, link, note, saveFileName, now })
  mkdirSync(dir, { recursive: true })
  const path = uniqueMarkPath(dir, stamp(now))
  writeFileSync(path, body, 'utf8')

  if (savedFile) {
    const target = join(dir, saveFileName)
    if (resolve(target) !== resolve(saveFile)) copyFileSync(saveFile, target)
  }

  return { path, dir, bytes: Buffer.byteLength(body, 'utf8'), savedFile, totalBytes: statSync(path).size }
}
