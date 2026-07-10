#!/usr/bin/env bash
# 로컬에서 디디딧 정적 사이트 + 시나리오 머신 테스트
# 사용: ./dddit/script/start-local.sh
# 열기: http://localhost:8080/dddit/script/?project=vendict
# works-api(프로덕션) 자동 연동 — API 키 불필요. 직접 Gemini만 쓰려면 ?api=direct

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${PORT:-8080}"
SESSION="dddit-local-dev"

if tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION" 2>/dev/null; then
  echo "이미 실행 중: http://localhost:${PORT}/dddit/"
  echo "시나리오 머신: http://localhost:${PORT}/dddit/script/?project=vendict"
  exit 0
fi

tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION" -c "$ROOT" -- "${SHELL:-bash}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION:0.0" "python3 -m http.server ${PORT}" C-m

echo "로컬 서버 시작: http://localhost:${PORT}/dddit/"
echo "시나리오 머신: http://localhost:${PORT}/dddit/script/?project=vendict"
echo "중지: tmux -f /exec-daemon/tmux.portal.conf kill-session -t ${SESSION}"
