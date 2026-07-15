# works-site static server (run from repo root)
# Usage: .\dddit\script\start-local.ps1

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Port = if ($env:PORT) { $env:PORT } else { 8080 }

Set-Location $Root

Write-Host ""
Write-Host "works-site local server"
Write-Host "  root:      $Root"
Write-Host "  workspace: http://localhost:${Port}/dddit/"
Write-Host "  script:    http://localhost:${Port}/dddit/script/?project=vendict"
Write-Host "  tina ppm:  http://localhost:${Port}/project/tinasinger/mv/ppm/"
Write-Host ""
Write-Host "Stop: Ctrl+C"
Write-Host ""

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    py -m http.server $Port
    exit $LASTEXITCODE
  }
  Write-Error "Python not found. Install from https://www.python.org/downloads/"
}

python -m http.server $Port
