#!/usr/bin/env node
/**
 * 生成「手动添加 MCP Server」用的 JSON（规范 2 空格缩进，便于直接粘贴）。
 * 用法：node scripts/gen-mcp-config.mjs <server 绝对路径> [输出文件]
 * 不给输出文件则打印到 stdout。
 */
import { writeFileSync } from 'node:fs'

const [serverPath, outPath] = process.argv.slice(2)
if (!serverPath) {
  console.error('用法：node gen-mcp-config.mjs <server 绝对路径> [输出文件]')
  process.exit(2)
}

const config = {
  mcpServers: {
    'trae-tamer': {
      command: 'node',
      args: [serverPath],
    },
  },
}
const text = `${JSON.stringify(config, null, 2)}\n`
if (outPath) writeFileSync(outPath, text, 'utf8')
process.stdout.write(text)
