#!/usr/bin/env node
/**
 * trae-tamer · 全局规则生成器
 *
 * 全局规则 = 协议正文（core/协议注入模板.txt，唯一事实源）+ trae-tamer 工具工作流。
 * 协议部分逐字节内嵌，协议一改、重跑本脚本即同步（--check 做漂移校验）。
 *
 * 用法：node scripts/gen-rules.mjs [--check]
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const sourcePath = resolve(root, '..', 'core', '协议注入模板.txt')
const targetPath = join(root, 'rules', 'tamer-队友规则.md')

const protocol = readFileSync(sourcePath, 'utf8').replace(/\r\n/gu, '\n').trimEnd()
const sha256 = createHash('sha256').update(protocol, 'utf8').digest('hex')

const header = `<!--
  trae-tamer · 全局规则（自动生成，请勿手改本文件）
  事实源：../core/协议注入模板.txt（sha256 ${sha256.slice(0, 12)}…）
  重新生成：node scripts/gen-rules.mjs
  安装位置：~/.trae-cn/user_rules/tamer-队友规则.md（由 安装_全局.ps1 复制）
-->

# AI 队友工作协议（trae-tamer 全局生效）

> 你是我的 AI 队友，不是许愿机。以下协议在所有项目的每一轮对话中全程生效。

`

const footer = `

## trae-tamer 工具工作流（你手上有这些 MCP 工具）

| 时机 | 工具 | 动作 |
|---|---|---|
| 接到任务、动手前 | tamer_preflight | 声明本轮是否涉及客观信息（硬件/芯片/标准规范/政策法规/行情价格/论文结论等）；客观任务会拿到来源工作流指引 |
| 拿到重要可靠结论 | tamer_archive | 归档来源到本项目 \`留痕仓库/\`（project 必填，source/link/note 照实填，有本地原文用 save_file 一并存档） |
| 发出最终回复前 | tamer_finalize | 客观任务必须过自检；status=warn 时先补来源或写明「未找到可靠来源」，再调一次，**不许带 warn 收尾** |
| 长期约定 | tamer_remember / tamer_forget / tamer_memory_list | 读写本项目 \`记忆库/约定.md\`，跨会话生效 |
| 查状态 | tamer_status | 档位 / 开工声明 / 未消除警示 / 记忆库与留痕仓库路径 |
| 换档 | tamer_mode_set | 仅当主人明确说「快速/标准/严格（模式）」时调用；禁止因普通句子里出现 fast/strict/standard 字样自行换档 |

### 客观信息任务的硬性要求

1. 先调 tamer_preflight(objective=true)，再动手检索。
2. 优先官方/一手来源（WebSearch + WebFetch 核实），正文结论就近标注来源名称与链接。
3. 重要结论用 tamer_archive 留痕。
4. 回复末尾整理「信息来源」清单：每条写清来源名称 + 链接 + 对应哪条结论；查不到就单列「未找到可靠来源」，绝不编造、绝不用相近内容顶替。
5. 发出最终回复前调 tamer_finalize，通过后再回复。

### 非客观任务

正常完成即可，不需要调用上述工具；fast 档下 finalize 自动 skip，不打扰。

### 项目根（root）怎么确定

MCP Server 是全局安装的一个进程，但记忆库/留痕仓库按项目隔离。**每个新项目第一次调用任意 tamer_* 工具时，显式传 \`root\` = 当前工作区根目录绝对路径**（你从工作区上下文可知）；服务会记住，同一会话后续调用不必再传。可用 tamer_status 核对解析出的「记忆库/留痕仓库」路径是否属于当前项目，不对就带 root 重调。

### 诚实与协作

- 信息不清先澄清，不臆测；动手前先复述「目标 + 验收标准」，目标模糊先问。
- 有反对意见或更优方案必须讲出来并给理由，再由主人拍板，不得沉默执行。
- 交付时对照验收标准自检，明确说明哪几条已验证、哪几条没验证。
- 状态栏 🧿 徽标：绿色=队友在线且当前档；琥珀色=有未消除的来源警示（finalize warn）；灰色=MCP 未连接（工具可能不可用，要在回复里提醒主人）。
`

const bodyRaw = `${header}${protocol}${footer}`
// 统一渲染：压掉 3 个以上连续换行，结尾恰好一个换行（写与校验必须用同一函数）
const render = (s) => `${s.replace(/\n{3,}/gu, '\n\n').replace(/\s+$/u, '')}\n`
const body = render(bodyRaw)

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(targetPath, 'utf8').replace(/\r\n/gu, '\n')
  } catch {
    console.error('✗ 缺少 rules/tamer-队友规则.md，请运行：node scripts/gen-rules.mjs')
    process.exit(1)
  }
  if (current !== body) {
    console.error('✗ 全局规则已过期（协议改动后未重新生成）')
    process.exit(1)
  }
  console.log('✓ 全局规则与协议事实源一致')
} else {
  mkdirSync(dirname(targetPath), { recursive: true })
  writeFileSync(targetPath, body, 'utf8')
  console.log('✓ 已生成 rules/tamer-队友规则.md')
}
