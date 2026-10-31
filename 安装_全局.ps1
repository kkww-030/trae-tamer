﻿<#
.SYNOPSIS
  trae-tamer 一键安装（全局规则 + 全局技能 + MCP 配置产物 + VSIX 打包）。

.DESCRIPTION
  自动完成的：
    1) 跑一遍单元测试（坏的不安装）；
    2) 全局规则复制到 ~/.trae-cn/user_rules/；
    3) 队友技能复制到全局技能目录（默认 ~/.trae-cn/skills，可用 -SkillDir 覆盖）；
    4) 生成 dist/mcp-config.json（MCP 手动添加时粘贴）；
    5) 打包 dist/trae-tamer-badge-<ver>.vsix。
  需要你手动完成的（Trae 没有开放自动化接口，脚本不碰 Trae 内部数据库）：
    A. 设置 → MCP → 手动添加，粘贴 JSON；
    B. 扩展面板 → 从 VSIX 安装；
    C. 重启 Trae。

.PARAMETER SkillDir
  全局技能目录。默认：~/.trae-cn/skills（CN 版数据目录）。
  若装完技能不出现，改用：-SkillDir "$env:USERPROFILE\.trae\skills"

.PARAMETER BothSkillDirs
  同时复制到 .trae-cn 与 .trae 两个候选目录（排查哪个生效时用）。

.PARAMETER SkipTests
  跳过单元测试（不推荐）。
#>
[CmdletBinding()]
param(
  [string]$SkillDir = '',
  [switch]$BothSkillDirs,
  [switch]$SkipTests
)

# 中文输出在 PS5 管道里默认 cp936，固定 UTF-8 避免乱码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ruleSrc = Join-Path $here 'rules\tamer-队友规则.md'
$skillSrc = Join-Path $here 'skills\tamer-teammate'
$serverJs = Join-Path $here 'src\mcp-server.mjs'
$distDir = Join-Path $here 'dist'

function Ok($m) { Write-Host "[OK] $m" -ForegroundColor Green }
function Step($m) { Write-Host " -  $m" -ForegroundColor Gray }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }
function Die($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '    AI驯服工具 · trae-tamer 全局安装' -ForegroundColor Cyan
Write-Host '  ============================================================' -ForegroundColor Cyan

# 0. 前置
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die '找不到 node（需要 Node.js 18+，本机此前已装 v24）。' }
foreach ($f in @($ruleSrc, (Join-Path $skillSrc 'SKILL.md'), $serverJs)) {
  if (-not (Test-Path $f)) { Die "缺少文件：$f（仓库不完整？）" }
}
Ok "Node：$($node.Source)"

# 1. 测试门禁
if (-not $SkipTests) {
  Write-Host '[1/5] 单元测试门禁' -ForegroundColor White
  Push-Location $here
  try {
    $testOut = & node --test 'tests/*.test.mjs' 2>&1
    if ($LASTEXITCODE -ne 0) {
      $testOut | Select-Object -Last 40 | ForEach-Object { Write-Host $_ -ForegroundColor DarkRed }
      Die '测试未通过，已中止安装（可 -SkipTests 强装，但不推荐）'
    }
    $summary = ($testOut | Select-String -Pattern '^. (pass|tests|fail) ' ) | ForEach-Object { $_.Line }
    $summary | Select-Object -Last 4 | ForEach-Object { Step $_ }
    Ok '测试全部通过'
  } finally { Pop-Location }
}

# 2. 全局规则
Write-Host '[2/5] 全局规则' -ForegroundColor White
$rulesDir = Join-Path $env:USERPROFILE '.trae-cn\user_rules'
New-Item -ItemType Directory -Force -Path $rulesDir | Out-Null
Copy-Item $ruleSrc (Join-Path $rulesDir 'tamer-队友规则.md') -Force
Ok "已安装：$(Join-Path $rulesDir 'tamer-队友规则.md')"

# 3. 全局技能
Write-Host '[3/5] 全局技能' -ForegroundColor White
$cnSkillDir = Join-Path $env:USERPROFILE '.trae-cn\skills'
$intlSkillDir = Join-Path $env:USERPROFILE '.trae\skills'
$targets = if ($SkillDir) { @($SkillDir) }
           elseif ($BothSkillDirs) { @($cnSkillDir, $intlSkillDir) }
           else { @($cnSkillDir) }
foreach ($sd in $targets) {
  $dst = Join-Path $sd 'tamer-teammate'
  New-Item -ItemType Directory -Force -Path $sd | Out-Null
  if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
  Copy-Item $skillSrc $dst -Recurse
  Ok "已安装技能：$dst"
}
if (-not $SkillDir -and -not $BothSkillDirs) {
  Warn "默认技能目录是 $cnSkillDir。重启后若技能列表没有 tamer-teammate，"
  Warn "重跑：.\安装_全局.ps1 -SkillDir '$intlSkillDir'"
}

# 4. MCP 配置产物
Write-Host '[4/5] MCP 配置产物' -ForegroundColor White
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$mcpPath = Join-Path $distDir 'mcp-config.json'
& node (Join-Path $here 'scripts\gen-mcp-config.mjs') $serverJs $mcpPath | Out-Null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $mcpPath)) { Die 'MCP 配置生成失败' }
try { $null = Get-Content $mcpPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { Die "MCP 配置不是合法 JSON：$_" }
$mcpJson = Get-Content $mcpPath -Raw -Encoding UTF8
Ok "配置已生成：$mcpPath"

# 5. VSIX
Write-Host '[5/5] 状态栏徽标 VSIX' -ForegroundColor White
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'scripts\pack-vsix.ps1') | Out-Null
$vsix = Get-ChildItem (Join-Path $distDir '*.vsix') | Select-Object -First 1
if ($vsix) { Ok "徽标包：$($vsix.FullName)" } else { Warn 'VSIX 打包失败（不影响规则/技能/MCP）' }

# ── 收尾：手动动作清单 ─────────────────────────────────────────
Write-Host ''
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host '  自动部分完成。还需手动做 3 步（约 1 分钟）：' -ForegroundColor Cyan
Write-Host '  ============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host '  A. 添加 MCP Server（设置 → MCP → 添加 → 手动添加，粘贴以下 JSON）：' -ForegroundColor White
Write-Host ''
Write-Host $mcpJson -ForegroundColor Gray
Write-Host ''
Write-Host "     （JSON 也存于：$mcpPath）" -ForegroundColor DarkGray
Write-Host ''
Write-Host "  B. 安装徽标：扩展面板右上角「…」→ 从 VSIX 安装 → 选" -ForegroundColor White
Write-Host "     $($vsix.FullName)" -ForegroundColor Gray
Write-Host ''
Write-Host '  C. 重启 Trae。验证：状态栏出现「队友·标准」徽标；在对话里让 AI 调 tamer_status。' -ForegroundColor White
Write-Host '     若徽标灰色 = MCP 未连上；琥珀色 = 有未补来源的警示。' -ForegroundColor White
Write-Host ''
Write-Host '  卸载：.\卸载_全局.ps1（规则/技能/数据）；MCP 条目与 VSIX 在界面里手动移除。' -ForegroundColor DarkGray
Write-Host ''
