<#
.SYNOPSIS
  卸载 trae-tamer 的自动安装部分（全局规则 + 全局技能；可选清除运行数据）。

.DESCRIPTION
  删除：
    ~/.trae-cn/user_rules/tamer-队友规则.md
    <全局技能目录>/tamer-teammate（默认两个候选目录都检查）
  -PurgeData 额外删除 ~/.trae-tamer（每项目档位状态、心跳）。
  不动：项目里的 记忆库/ 与 留痕仓库/（那是你的数据）。
  需手动移除：Trae 设置 → MCP 中的 trae-tamer 条目；扩展面板卸载徽标扩展。

.PARAMETER PurgeData
  同时删除 ~/.trae-tamer 运行数据。
#>
[CmdletBinding()]
param([switch]$PurgeData)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Stop'

function Ok($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Info($m) { Write-Host " -  $m" -ForegroundColor Gray }

$removed = 0

$rule = Join-Path $env:USERPROFILE '.trae-cn\user_rules\tamer-队友规则.md'
if (Test-Path $rule) { Remove-Item $rule -Force; Ok "已删除全局规则：$rule"; $removed++ }
else { Info "全局规则不存在（已卸载过？）：$rule" }

$skillDirs = @(
  (Join-Path $env:USERPROFILE '.trae-cn\skills\tamer-teammate'),
  (Join-Path $env:USERPROFILE '.trae\skills\tamer-teammate')
)
foreach ($d in $skillDirs) {
  if (Test-Path $d) { Remove-Item $d -Recurse -Force; Ok "已删除技能：$d"; $removed++ }
}

if ($PurgeData) {
  $data = Join-Path $env:USERPROFILE '.trae-tamer'
  if (Test-Path $data) { Remove-Item $data -Recurse -Force; Ok "已清除运行数据：$data"; $removed++ }
  else { Info "运行数据目录不存在：$data" }
}

Write-Host ''
if ($removed -eq 0) { Write-Host '没有需要删除的自动安装内容。' -ForegroundColor Yellow }
else { Write-Host '自动部分已清理。请再手动完成：' -ForegroundColor Cyan }
Write-Host '  1. 设置 → MCP：删除 trae-tamer 条目' -ForegroundColor White
Write-Host '  2. 扩展面板：卸载「AI驯服工具 · 队友徽标」' -ForegroundColor White
Write-Host '  3. 重启 Trae' -ForegroundColor White
if (-not $PurgeData) {
  Write-Host ''
  Write-Host '  运行数据（档位/心跳）保留中；要一起清除：.\卸载_全局.ps1 -PurgeData' -ForegroundColor DarkGray
  Write-Host '  项目里的 记忆库/ 与 留痕仓库/ 永远不会被本脚本删除。' -ForegroundColor DarkGray
}
