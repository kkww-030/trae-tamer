<#
.SYNOPSIS
  把 vscode-extension/ 打包成可离线安装的 .vsix（零依赖，不用 npm/vsce）。

.DESCRIPTION
  VSIX 本质就是个 zip：根放 [Content_Types].xml 与 extension.vsixmanifest，
  extension/ 下放扩展文件。本脚本用 .NET ZipFile 压缩（条目路径用正斜杠，
  符合 OPC 规范），并做语法校验与产物回读检查。

  产物：dist/trae-tamer-badge-<version>.vsix
  安装：Trae 扩展面板右上角「…」→ 从 VSIX 安装。
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$extDir = Join-Path $root 'vscode-extension'
$distDir = Join-Path $root 'dist'
$stage = Join-Path $distDir 'vsix-stage'

function Fail($m) { Write-Host "[x] $m" -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $extDir 'extension.js'))) { Fail '缺少 vscode-extension/extension.js' }

$pkg = Get-Content (Join-Path $extDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$pkg.version
$id = [string]$pkg.name
$publisher = [string]$pkg.publisher
if (-not $version -or -not $id -or -not $publisher) { Fail 'package.json 缺 name/publisher/version' }

# 0. 语法检查
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & $node.Source --check (Join-Path $extDir 'extension.js')
  if ($LASTEXITCODE -ne 0) { Fail 'extension.js 语法错误' }
}

# 1. 准备暂存目录（先清干净，避免旧条目进包）
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'extension') | Out-Null
Copy-Item (Join-Path $extDir 'package.json') (Join-Path $stage 'extension\package.json')
Copy-Item (Join-Path $extDir 'extension.js') (Join-Path $stage 'extension\extension.js')
Copy-Item (Join-Path $extDir 'icon.svg') (Join-Path $stage 'extension\icon.svg')

# 2. [Content_Types].xml
$contentTypes = @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="text/javascript"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/extension.vsixmanifest" ContentType="text/xml"/>
</Types>
'@
Set-Content -LiteralPath (Join-Path $stage '[Content_Types].xml') -Value $contentTypes -Encoding UTF8

# 3. extension.vsixmanifest（描述里的 & 需转义）
$desc = [System.Security.SecurityElement]::Escape([string]$pkg.description)
$display = [System.Security.SecurityElement]::Escape([string]$pkg.displayName)
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Id="$id" Version="$version" Publisher="$publisher" Language="zh-CN"/>
    <DisplayName>$display</DisplayName>
    <Description xml:space="preserve">$desc</Description>
    <InstalledByMsi>false</InstalledByMsi>
  </Metadata>
  <Installation InstalledByMsi="false">
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.svg" Addressable="true"/>
  </Assets>
</PackageManifest>
"@
Set-Content -LiteralPath (Join-Path $stage 'extension.vsixmanifest') -Value $manifest -Encoding UTF8

# 4. 压缩（手动建条目：.NET Framework 的 CreateFromDirectory 会写成反斜杠，
#    不符合 OPC/VSIX 规范，必须显式用正斜杠条目名）
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
$vsix = Join-Path $distDir "$id-$version.vsix"
if (Test-Path $vsix) { Remove-Item $vsix -Force }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @(
  '[Content_Types].xml',
  'extension.vsixmanifest',
  'extension/package.json',
  'extension/extension.js',
  'extension/icon.svg'
)
$fs = [System.IO.File]::Open($vsix, [System.IO.FileMode]::CreateNew)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($rel in $files) {
      $disk = Join-Path $stage ($rel -replace '/', '\')
      $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
      $in = [System.IO.File]::OpenRead($disk)
      try {
        $out = $entry.Open()
        try { $in.CopyTo($out) } finally { $out.Dispose() }
      } finally { $in.Dispose() }
    }
  } finally { $zip.Dispose() }
} finally { $fs.Dispose() }

# 5. 回读校验：条目齐全
$zip = [System.IO.Compression.ZipFile]::OpenRead($vsix)
try {
  $names = $zip.Entries.FullName
  foreach ($need in @('[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/extension.js')) {
    if ($names -notcontains $need) { Fail "产物缺少条目：$need" }
  }
} finally {
  $zip.Dispose()
}

$sizeKb = [math]::Round((Get-Item $vsix).Length / 1KB, 1)
Write-Host ''
Write-Host '[OK] VSIX 打包完成' -ForegroundColor Green
Write-Host "     $vsix  ($sizeKb KiB)" -ForegroundColor Gray
Write-Host '     安装：Trae 扩展面板 → 右上角「…」→ 从 VSIX 安装 → 选本文件 → 重启 Trae' -ForegroundColor Gray
