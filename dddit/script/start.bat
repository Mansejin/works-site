@echo off
cd /d "%~dp0"
echo 디디딧 시나리오 머신 서버 시작 중...
echo 브라우저에서 http://localhost:8080 열기
start "" "http://localhost:8080"
python -m http.server 8080
if errorlevel 1 (
  echo.
  echo 서버 시작 실패. index.html을 직접 엽니다...
  start "" "%~dp0index.html"
  pause
)
