#!/usr/bin/env node
/**
 * trae-tamer · 一键自检：语法 → JSON 清单 → 协议/规则漂移 → 交付物完整性 → 单元测试。
 * 零外部依赖（仅 node 内置 + spawn node --check/--test）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const failures = []
const notes = []
const ok = (m) => console.log(`  ✓ ${m}`)
const bad = (m) => { failures.push(m); console.log(`  ✗ ${m}`) }
const note = (m) => notes.push(m)

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (['.js', '.mjs'].includes(extname(entry.name))) out.push(full)
  }
  return out
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: 'utf8', cwd: root })
}

/* 1. 语法 */
console.log('[1/5] 语法检查')
const files = [
  ...walk(join(root, 'src')),
  ...walk(join(root, 'scripts')),
  ...walk(join(root, 'tests')),
  join(root, 'vscode-extension', 'extension.js'),
]
for (const f of files) {
  const r = run(process.execPath, ['--check', f])
  if (r.status !== 0) bad(`语法错误 ${f.replace(root, '.')}\n${r.stderr?.trim()}`)
}
if (failures.length === 0) ok(`${files.length} 个 JS/MJS 文件语法通过`)

/* 2. JSON 清单 */
console.log('[2/5] JSON 清单')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const extPkgPath = join(root, 'vscode-extension', 'package.json')
const extPkg = JSON.parse(readFileSync(extPkgPath, 'utf8'))
if (pkg.type !== 'module') bad('package.json 必须是 ESM（type: module）')
if (extPkg.main !== './extension.js') bad('扩展 package.json main 应为 ./extension.js')
if (!extPkg.activationEvents?.includes('onStartupFinished')) bad('扩展应在 onStartupFinished 激活')
if (!extPkg.contributes?.commands?.some((c) => c.command === 'traeTamer.showStatus')) bad('扩展缺少状态命令')
if (!existsSync(join(root, 'vscode-extension', 'icon.svg'))) bad('缺少 vscode-extension/icon.svg')
ok('package.json / 扩展清单自洽')

/* 3. 漂移 */
console.log('[3/5] 单一事实源漂移检查')
const proto = run(process.execPath, [join(root, 'scripts', 'gen-protocol.mjs'), '--check'])
process.stdout.write(`  ${proto.stdout?.trim()}\n`)
if (proto.status !== 0) bad('src/protocol.js 已漂移（跑 node scripts/gen-protocol.mjs）')
const rules = run(process.execPath, [join(root, 'scripts', 'gen-rules.mjs'), '--check'])
process.stdout.write(`  ${rules.stdout?.trim()}\n`)
if (rules.status !== 0) bad('全局规则已漂移（跑 node scripts/gen-rules.mjs）')

/* 4. 交付物完整性 */
console.log('[4/5] 交付物完整性')
const ruleText = readFileSync(join(root, 'rules', 'tamer-队友规则.md'), 'utf8')
for (const marker of ['四条核心', 'tamer_preflight', 'tamer_finalize', 'tamer_archive', '信息来源']) {
  if (!ruleText.includes(marker)) bad(`全局规则缺少关键内容：${marker}`)
}
const skill = readFileSync(join(root, 'skills', 'tamer-teammate', 'SKILL.md'), 'utf8')
if (!/^name:\s*tamer-teammate/mu.test(skill)) bad('SKILL.md frontmatter 缺少 name: tamer-teammate')
if (!/^description:\s*.+/mu.test(skill)) bad('SKILL.md frontmatter 缺少 description')
const server = readFileSync(join(root, 'src', 'mcp-server.mjs'), 'utf8')
for (const t of ['tamer_preflight', 'tamer_finalize', 'tamer_archive', 'tamer_remember', 'tamer_forget', 'tamer_memory_list', 'tamer_mode_set', 'tamer_status']) {
  if (!server.includes(`name: '${t}'`)) bad(`MCP Server 未注册工具 ${t}`)
}
for (const ps of ['安装_全局.ps1', '卸载_全局.ps1']) {
  if (!existsSync(join(root, ps))) bad(`缺少 ${ps}`)
}
if (!existsSync(join(root, 'scripts', 'gen-mcp-config.mjs'))) bad('缺少 scripts/gen-mcp-config.mjs')
else {
  const installer = readFileSync(join(root, '安装_全局.ps1'), 'utf8')
  if (!installer.includes('gen-mcp-config.mjs')) bad('安装器未调用 gen-mcp-config.mjs 生成 MCP 配置')
}
if (!existsSync(join(root, 'README.md'))) bad('缺少 README.md')
if (!existsSync(join(root, 'vscode-extension', 'README.md'))) bad('缺少 vscode-extension/README.md（徽标点击打开，且需打进 VSIX）')
else {
  const pack = readFileSync(join(root, 'scripts', 'pack-vsix.ps1'), 'utf8')
  if (!pack.includes('extension/README.md')) bad('pack-vsix.ps1 未把扩展 README 打进 VSIX')
}
if (failures.length === 0) ok('规则 / 技能 / 8 工具 / 安装脚本 / README 齐全')
if (!existsSync(join(root, 'dist'))) note('dist/ 尚不存在：跑 安装_全局.ps1 或 scripts/pack-vsix.ps1 生成产物')

/* 5. 单元测试 */
console.log('[5/5] 单元测试')
const test = run(process.execPath, ['--test', 'tests/*.test.mjs'])
process.stdout.write(`${test.stdout?.split('\n').filter((l) => /^# (tests|pass|fail)/u.test(l) || /^. (tests|pass|fail) /u.test(l)).join('\n')}\n`)
if (test.status !== 0) {
  bad('单元测试未全部通过')
  process.stdout.write(`${test.stdout?.split('\n').filter((l) => l.includes('✖')).slice(0, 10).join('\n')}\n`)
}

console.log('')
if (notes.length) for (const n of notes) console.log(`  · ${n}`)
if (failures.length) {
  console.error(`✗ 自检失败：${failures.length} 项`)
  process.exit(1)
}
console.log('✓ trae-tamer 自检全部通过')
