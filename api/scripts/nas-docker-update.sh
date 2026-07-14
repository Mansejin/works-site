#!/bin/sh
# Synology NAS: works-site git pull + works-api docker rebuild
#
# Usage:
#   cd /volume1/docker/works-site && sh api/scripts/nas-docker-update.sh
#   cd /volume1/docker/works-site && sh api/scripts/nas-docker-update.sh --pull-only
#
# Branch: WORKS_BRANCH=main sh api/scripts/nas-docker-update.sh
#        (or WORKS_DEPLOY_BRANCH in api/.env)
# Sudo:   WORKS_DOCKER_SUDO=1

set -e

REPO_DIR="/volume1/docker/works-site"
COMPOSE_DIR="$REPO_DIR/api"
GIT_IMAGE="alpine/git:latest"
PULL_ONLY=0
FORCE_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --pull-only) PULL_ONLY=1 ;;
    --full-build) FORCE_BUILD=1 ;;
  esac
done

export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

log() {
  echo "$@"
  if [ -n "$LOG_FILE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG_FILE"
  fi
}

read_deploy_branch() {
  if [ -n "$WORKS_BRANCH" ]; then
    echo "$WORKS_BRANCH"
    return
  fi
  if [ -f "$COMPOSE_DIR/.env" ]; then
    line=$(grep -E '^WORKS_DEPLOY_BRANCH=' "$COMPOSE_DIR/.env" 2>/dev/null | tail -n 1 || true)
    if [ -n "$line" ]; then
      echo "${line#WORKS_DEPLOY_BRANCH=}" | tr -d '\r' | tr -d '"' | tr -d "'"
      return
    fi
  fi
  echo "main"
}

BRANCH=$(read_deploy_branch)
LOG_DIR="$COMPOSE_DIR/logs"
LOG_FILE="$LOG_DIR/deploy.log"

resolve_docker() {
  for candidate in \
    /usr/local/bin/docker \
    /var/packages/ContainerManager/target/usr/bin/docker \
    /var/packages/ContainerManager/target/bin/docker \
    /var/packages/Docker/target/usr/bin/docker \
    /var/packages/Docker/target/bin/docker
  do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  if command -v docker >/dev/null 2>&1; then
    command -v docker
    return
  fi
  echo ""
}

resolve_git() {
  for candidate in \
    /usr/bin/git \
    /usr/local/bin/git \
    /var/packages/Git/target/usr/bin/git \
    /var/packages/Git/target/bin/git
  do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
  if command -v git >/dev/null 2>&1; then
    command -v git
    return
  fi
  echo ""
}

git_sync_deploy() {
  GIT=$(resolve_git)
  if [ -n "$GIT" ]; then
    log "==> git sync ($BRANCH) via $GIT"
    "$GIT" -C "$REPO_DIR" fetch origin "$BRANCH" || "$GIT" -C "$REPO_DIR" fetch origin
    "$GIT" -C "$REPO_DIR" clean -fd -e api/.env -e api/logs
    "$GIT" -C "$REPO_DIR" reset --hard "origin/$BRANCH"
    log "==> git at $("$GIT" -C "$REPO_DIR" rev-parse --short HEAD)"
    return
  fi

  log "==> git sync ($BRANCH) via docker (no native git on NAS)"
  ensure_docker_access
  short=$($DOCKER run --rm \
    --entrypoint sh \
    -v "$REPO_DIR:/git" \
    -w /git \
    "$GIT_IMAGE" \
    -ec "
      git config --global --add safe.directory /git
      git fetch origin '$BRANCH'
      git clean -fd -e api/.env -e api/logs
      git reset --hard 'origin/$BRANCH'
      git rev-parse --short HEAD
    ")
  log "==> git at $short"
}

git_current_rev() {
  GIT=$(resolve_git)
  if [ -n "$GIT" ]; then
    "$GIT" -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true
    return
  fi
  $DOCKER run --rm \
    --entrypoint git \
    -v "$REPO_DIR:/git" \
    -w /git \
    "$GIT_IMAGE" \
    -C /git rev-parse HEAD 2>/dev/null || true
}

api_changed() {
  old_rev="$1"
  new_rev="$2"
  if [ -z "$old_rev" ] || [ "$old_rev" = "$new_rev" ]; then
    return 1
  fi
  GIT=$(resolve_git)
  if [ -z "$GIT" ]; then
    ensure_docker_access
    if $DOCKER run --rm \
      --entrypoint sh \
      -v "$REPO_DIR:/git" \
      -w /git \
      "$GIT_IMAGE" \
      -ec "git diff --name-only '$old_rev' '$new_rev' 2>/dev/null | grep -q '^api/'"; then
      return 0
    fi
    return 1
  fi
  if "$GIT" -C "$REPO_DIR" diff --name-only "$old_rev" "$new_rev" 2>/dev/null | grep -q '^api/'; then
    return 0
  fi
  return 1
}

docker_can_run() {
  $DOCKER info >/dev/null 2>&1
}

ensure_docker_access() {
  if docker_can_run; then
    return
  fi
  base=$DOCKER
  for prefix in "sudo -n" "sudo"; do
    DOCKER="$prefix $base"
    if docker_can_run; then
      log "==> docker ($prefix)"
      return
    fi
  done
  log "ERROR: cannot access docker daemon. DSM Task Scheduler as root, or WORKS_DOCKER_SUDO=1"
  exit 126
}

read_env_flag() {
  key="$1"
  if [ -f "$COMPOSE_DIR/.env" ]; then
    line=$(grep -E "^${key}=" "$COMPOSE_DIR/.env" 2>/dev/null | tail -n 1 || true)
    if [ -n "$line" ]; then
      val=$(echo "${line#*=}" | tr -d '\r' | tr -d '"' | tr -d "'")
      if [ "$val" = "1" ] || [ "$val" = "true" ] || [ "$val" = "yes" ]; then
        echo "1"
        return
      fi
    fi
  fi
  echo ""
}

if [ -z "$WORKS_DOCKER_SUDO" ]; then
  WORKS_DOCKER_SUDO=$(read_env_flag WORKS_DOCKER_SUDO)
fi
if [ -z "$WORKS_DOCKER_SUDO" ]; then
  WORKS_DOCKER_SUDO=1
fi

DOCKER=$(resolve_docker)
if [ -z "$DOCKER" ]; then
  log "ERROR: docker not found. Open DSM Container Manager."
  exit 127
fi

mkdir -p "$LOG_DIR"
log "==> works-api deploy start (branch=$BRANCH)"

cd "$REPO_DIR" || exit 1

if [ ! -d .git ]; then
  log "ERROR: no .git in $REPO_DIR — clone Mansejin/works-site first"
  exit 1
fi

if [ -z "$WORKS_PRE_SYNC_REV" ]; then
  WORKS_PRE_SYNC_REV=$(git_current_rev)
fi
OLD_REV="$WORKS_PRE_SYNC_REV"
git_sync_deploy
SYNCED_REV=$(git_current_rev)

REPO_SCRIPT="$REPO_DIR/api/scripts/nas-docker-update.sh"
case "$0" in
  "$REPO_SCRIPT"|*/api/scripts/nas-docker-update.sh) ;;
  *)
    if [ -f "$REPO_SCRIPT" ]; then
      if [ "$OLD_REV" != "$SYNCED_REV" ]; then
        log "==> re-exec deploy script from repo (post git sync, rebuild)"
        exec sh "$REPO_SCRIPT" --full-build "$@"
      fi
      log "==> re-exec deploy script from repo (post git sync)"
      exec sh "$REPO_SCRIPT" "$@"
    fi
    ;;
esac

NEW_REV="$SYNCED_REV"

if [ "$PULL_ONLY" = "1" ]; then
  log "==> pull only (--pull-only)"
  log "==> done"
  exit 0
fi

if [ "$FORCE_BUILD" = "1" ] || api_changed "$OLD_REV" "$NEW_REV"; then
  ensure_docker_access
  log "==> docker compose up -d --build (api/)"
  cd "$COMPOSE_DIR" || exit 1
  $DOCKER compose up -d --build --remove-orphans
else
  log "==> api/ unchanged — skip docker build"
fi

if command -v curl >/dev/null 2>&1; then
  port=8788
  if [ -f "$COMPOSE_DIR/.env" ]; then
    line=$(grep -E '^WORKS_PORT=' "$COMPOSE_DIR/.env" 2>/dev/null | tail -n 1 || true)
    if [ -n "$line" ]; then
      port=$(echo "${line#WORKS_PORT=}" | tr -d '\r' | tr -d '"' | tr -d "'")
    fi
  fi
  health_ok=0
  i=0
  while [ "$i" -lt 30 ]; do
    if curl -sf "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      health_ok=1
      break
    fi
    i=$((i + 1))
    sleep 2
  done
  if [ "$health_ok" = "1" ]; then
    log "==> health OK (:${port})"
  else
    log "WARN: health check failed after 60s — docker logs works-api --tail 50"
  fi
fi

log "==> done ($(date '+%Y-%m-%d %H:%M'))"
