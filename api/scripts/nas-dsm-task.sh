#!/bin/sh
# DSM Task Scheduler wrapper — curl latest deploy script from GitHub.
#
# DSM -> Task Scheduler -> works-api-auto-pull -> user: root
#   sh /volume1/docker/works-site/api/scripts/nas-dsm-task.sh
#
# First-time copy (or after clone):
#   curl -fsSL https://raw.githubusercontent.com/Mansejin/works-site/main/api/scripts/nas-dsm-task.sh \
#     -o /volume1/docker/works-site/api/scripts/nas-dsm-task.sh
#   chmod +x /volume1/docker/works-site/api/scripts/nas-dsm-task.sh

REPO="/volume1/docker/works-site"
LOG="$REPO/api/logs/scheduled-pull.log"
LOCK="/tmp/works-api-deploy.lock"
BRANCH="main"

mkdir -p "$REPO/api/logs"
export PATH="/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

if [ -f "$REPO/api/.env" ]; then
  line=$(grep -E '^WORKS_DEPLOY_BRANCH=' "$REPO/api/.env" 2>/dev/null | tail -n 1 || true)
  if [ -n "$line" ]; then
    BRANCH=$(echo "${line#WORKS_DEPLOY_BRANCH=}" | tr -d '\r' | tr -d '"' | tr -d "'")
  fi
fi

if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || stat -f %m "$LOCK") ))
  if [ "$age" -lt 1800 ]; then
    exit 0
  fi
  rm -f "$LOCK"
fi
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

echo "=== $(date '+%Y-%m-%d %H:%M:%S') DSM task start branch=$BRANCH ===" >> "$LOG"

export WORKS_BRANCH="$BRANCH"
export WORKS_DOCKER_SUDO=1

if ! curl -fsSL "https://raw.githubusercontent.com/Mansejin/works-site/${BRANCH}/api/scripts/nas-docker-update.sh" \
  -o /tmp/works-api-deploy.sh >> "$LOG" 2>&1; then
  echo "ERROR: curl deploy script failed" >> "$LOG"
  exit 1
fi

sed -i 's/\r$//' /tmp/works-api-deploy.sh 2>/dev/null || true
cd "$REPO" || exit 1
sh /tmp/works-api-deploy.sh >> "$LOG" 2>&1
rc=$?
echo "=== $(date '+%Y-%m-%d %H:%M:%S') DSM task end exit=$rc ===" >> "$LOG"
exit $rc
