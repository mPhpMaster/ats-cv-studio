<#
.SYNOPSIS
  Builds the ATS CV Studio Windows desktop app and its installer.

.DESCRIPTION
  1. Checks Node.js / npm.
  2. Installs dependencies (npm ci).
  3. Generates the app icon if it is missing.
  4. Type-checks and builds the web app (Vite).
  5. Packages it with Electron and creates an NSIS installer (and optionally a portable .exe).

  Output goes to .\release\

.PARAMETER SkipInstall
  Skip "npm ci" (use the node_modules already present).

.PARAMETER Portable
  Also build a portable single-file .exe that runs without installation.

.PARAMETER Clean
  Delete dist\ and release\ before building.

.EXAMPLE
  .\build-installer.ps1
  .\build-installer.ps1 -Portable -Clean
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall,
  [switch]$Portable,
  [switch]$Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "'$Command $($Arguments -join ' ')' failed with exit code $LASTEXITCODE"
  }
}

# ---------------------------------------------------------------- prerequisites
Write-Step 'Checking prerequisites'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is not installed. Install Node.js 20 or newer from https://nodejs.org and run this script again.'
}
$nodeVersion = (node --version).TrimStart('v')
if ([int]($nodeVersion.Split('.')[0]) -lt 20) {
  throw "Node.js 20+ is required (found v$nodeVersion)."
}
$npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { 'npm.cmd' } else { 'npm' }
$npx = if (Get-Command npx.cmd -ErrorAction SilentlyContinue) { 'npx.cmd' } else { 'npx' }
Write-Host "Node.js v$nodeVersion, npm $(& $npm --version)"

if ($Clean) {
  Write-Step 'Cleaning previous output'
  foreach ($dir in 'dist', 'release') {
    if (Test-Path $dir) { Remove-Item -Recurse -Force -Confirm:$false $dir }
  }
}

# ---------------------------------------------------------------- dependencies
if (-not $SkipInstall) {
  Write-Step 'Installing dependencies'
  if (Test-Path 'package-lock.json') { Invoke-Checked $npm @('ci') } else { Invoke-Checked $npm @('install') }
}

# ---------------------------------------------------------------- icon
$iconPath = Join-Path $PSScriptRoot 'build\icon.png'
if (-not (Test-Path $iconPath)) {
  Write-Step 'Generating application icon'
  New-Item -ItemType Directory -Force -Path (Split-Path $iconPath) | Out-Null
  Add-Type -AssemblyName System.Drawing
  $size = 512
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $radius = 110
  $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
  $shape.AddArc(0, 0, $radius, $radius, 180, 90)
  $shape.AddArc($size - $radius, 0, $radius, $radius, 270, 90)
  $shape.AddArc($size - $radius, $size - $radius, $radius, $radius, 0, 90)
  $shape.AddArc(0, $size - $radius, $radius, $radius, 90, 90)
  $shape.CloseFigure()
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $size, $size), ([System.Drawing.Color]::FromArgb(99, 91, 255)), ([System.Drawing.Color]::FromArgb(59, 50, 200))
  $g.FillPath($bg, $shape)

  # A white "page" with text lines and a green check mark.
  $page = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillRectangle($page, 130, 90, 252, 330)
  $line = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(200, 204, 222))
  $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 40, 60))), 160, 125, 150, 22)
  foreach ($y in 175, 210, 245, 280) { $g.FillRectangle($line, 160, $y, 190, 12) }
  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 163, 106))
  $g.FillEllipse($green, 300, 300, 150, 150)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 18
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLines($pen, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 337, 378), (New-Object System.Drawing.Point 364, 404), (New-Object System.Drawing.Point 414, 345)))

  $g.Dispose()
  $bmp.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Created $iconPath"
}

# ---------------------------------------------------------------- electron binary
# package.json sets build.electronDist to node_modules\electron\dist, so electron-builder copies Electron
# from there instead of extracting a zip to a temp folder and renaming it (the rename is often blocked by antivirus).
if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) {
  Write-Step 'Downloading the Electron runtime'
  Invoke-Checked 'node' @('node_modules\electron\install.js')
}

# ---------------------------------------------------------------- build
Write-Step 'Type-checking and building the app'
Invoke-Checked $npm @('run', 'build')

Write-Step 'Packaging the desktop app and creating the installer'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'   # no code-signing certificate needed
$targets = @('nsis')
if ($Portable) { $targets += 'portable' }
$builderArgs = @('electron-builder', '--win') + $targets + @('--x64', '--publish', 'never')

# Antivirus scanners (e.g. Microsoft Defender) often lock the freshly extracted Electron files for a few
# seconds, which makes electron-builder fail with "EPERM: operation not permitted, rename". Clean up and retry.
$maxAttempts = 3
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  foreach ($stale in 'release\win-unpacked', 'release\win-unpacked.tmp') {
    if (Test-Path $stale) {
      try { Remove-Item -Recurse -Force -Confirm:$false $stale -ErrorAction Stop } catch { Start-Sleep -Seconds 5 }
    }
  }
  & $npx @builderArgs
  if ($LASTEXITCODE -eq 0) { break }
  if ($attempt -eq $maxAttempts) {
    throw "electron-builder failed $maxAttempts times. If the error is EPERM, add '$PSScriptRoot\release' to your antivirus exclusions and run the script again."
  }
  Write-Host "Packaging failed (attempt $attempt of $maxAttempts) - retrying in 10 seconds..." -ForegroundColor Yellow
  Start-Sleep -Seconds 10
}

# ---------------------------------------------------------------- summary
Write-Step 'Done'
Get-ChildItem -Path 'release' -Filter '*.exe' -File |
  Sort-Object LastWriteTime -Descending |
  ForEach-Object { '{0}  ({1:N1} MB)' -f $_.FullName, ($_.Length / 1MB) } |
  Write-Host -ForegroundColor Green
