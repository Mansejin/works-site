# works-site 루트에서 정적 서버 (Windows PowerShell)
# 사용: .\dddit\script\start-local.ps1
# 열기: http://localhost:8080/dddit/script/?project=vendict

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Port = if ($env:PORT) { $env:PORT } else { 8080 }

Set-Location $Root

Write-Host ""
Write-Host "works-site 로컬 서버 (루트: $Root)"
Write-Host "  워크스페이스:  http://localhost:${Port}/dddit/"
Write-Host "  시나리오 머신: http://localhost:${Port}/dddit/script/?project=vendict"
Write-Host ""
Write-Host "중지: Ctrl+C"
Write-Host ""

$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
  $py = Get-Command py -ErrorAction SilentlyContinue
  if ($py) {
    py -m http.server $Port
    exit $LASTEXITCODE
  }
  Write-Error "Python이 없습니다. https://www.python.org/downloads/ 설치 후 PATH에 추가하세요."
}

python -m http.server $Port
