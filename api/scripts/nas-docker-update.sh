#!/bin/sh
# Synology NAS: works-site git pull + works-api docker update (fast by default)
#
# Usage:
#   cd /volume1/docker/works-site && sh api/scripts/nas-docker-update.sh
#   cd /volume1/docker/works-site && sh api/scripts/nas-docker-update.sh --pull-only
#   cd /volume1/docker/works-site && sh api/scripts/nas-docker-update.sh --full-build
#
# Branch: WORKS_BRANCH=main  (or WORKS_DEPLOY_BRANCH in api/.env)
# Path:   NAS_REPO_PATH=/volume1/docker/works-site
# Sudo:   WORKS_DOCKER_SUDO=1
#
# Change classes after git sync:
#   data-only  -> restart works-api (no build)
#   code       -> restart (bind-mounted app/ + server.py) unless image recipe changed
#   image      -> docker compose up -d --build
#   --full-build always forces image rebuild

set -e

REPO_DIR="${NAS_REPO_PATH:-/volume1/docker/works-site}"
if [ -z "$REPO_DIR" ]; then
  REPO_DIR="/volume1/docker/works-site"
fi
COMPOSE_DIR="$REPO_DIR/api"
GIT_IMAGE="alpine/git:latest"
GIT_REMOTE_URL="${WORKS_GIT_REMOTE:-https://github.com/Mansejin/works-site.git}"
PULL_ONLY=0
FORCE_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --pull-only) PULL_ONLY=1 ;;
    --full-build) FORCE_BUILD=1 ;;
  esac
done

export PATH="/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/var/packages/Git/target/usr/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

log() {
  # stderr so command substitutions ($(git_*), kind=$(classify_*)) stay clean
  echo "$@" >&2
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

git_bootstrap_clone() {
  parent=$(dirname "$REPO_DIR")
  name=$(basename "$REPO_DIR")
  stamp=$(date '+%Y%m%d%H%M%S')
  env_backup=""
  logs_backup=""
  override_backup=""

  mkdir -p "$parent"
  if [ -d "$REPO_DIR" ] || [ -L "$REPO_DIR" ]; then
    # Follow symlink target for preserving secrets/logs from real tree
    real_repo="$REPO_DIR"
    if [ -L "$REPO_DIR" ]; then
      log "==> $REPO_DIR is symlink — bootstrap should target real tree, not replace the link"
      log "ERROR: clone into symlink path is unsafe. Fix NAS_REPO_PATH to the real directory"
      exit 1
    fi
    if [ -f "$real_repo/api/.env" ]; then
      env_backup="/tmp/works-api-env-$stamp"
      cp "$real_repo/api/.env" "$env_backup"
      log "==> preserved api/.env -> $env_backup"
    fi
    if [ -d "$real_repo/api/logs" ]; then
      logs_backup="/tmp/works-api-logs-$stamp"
      cp -a "$real_repo/api/logs" "$logs_backup"
      log "==> preserved api/logs -> $logs_backup"
    fi
    if [ -f "$real_repo/api/docker-compose.override.yml" ]; then
      override_backup="/tmp/works-api-compose-override-$stamp.yml"
      cp "$real_repo/api/docker-compose.override.yml" "$override_backup"
      log "==> preserved api/docker-compose.override.yml"
    fi
    backup="${REPO_DIR}.bak-$stamp"
    mv "$REPO_DIR" "$backup"
    log "==> moved broken tree to $backup"
  fi

  GIT=$(resolve_git)
  if [ -n "$GIT" ]; then
    log "==> bootstrap clone via $GIT ($BRANCH)"
    "$GIT" -C "$parent" clone --branch "$BRANCH" --single-branch "$GIT_REMOTE_URL" "$name"
  else
    log "==> bootstrap clone via docker ($BRANCH)"
    ensure_docker_access
    $DOCKER run --rm \
      --entrypoint sh \
      -v "$parent:/git" \
      -w /git \
      "$GIT_IMAGE" \
      -ec "git clone --branch '$BRANCH' --single-branch '$GIT_REMOTE_URL' '$name'"
  fi

  if [ -n "$env_backup" ] && [ -f "$env_backup" ]; then
    mkdir -p "$REPO_DIR/api"
    cp "$env_backup" "$REPO_DIR/api/.env"
    log "==> restored api/.env"
  fi
  if [ -n "$logs_backup" ] && [ -d "$logs_backup" ]; then
    mkdir -p "$REPO_DIR/api"
    rm -rf "$REPO_DIR/api/logs"
    mv "$logs_backup" "$REPO_DIR/api/logs"
    log "==> restored api/logs"
  fi
  if [ -n "$override_backup" ] && [ -f "$override_backup" ]; then
    mkdir -p "$REPO_DIR/api"
    cp "$override_backup" "$REPO_DIR/api/docker-compose.override.yml"
    log "==> restored api/docker-compose.override.yml"
  fi
}

git_preserve_excludes() {
  # Flags for git clean -e (do not delete local secrets / Synology overrides)
  echo "-e api/.env -e api/logs -e api/docker-compose.override.yml"
}

git_sync_deploy() {
  GIT=$(resolve_git)
  if [ -n "$GIT" ]; then
    log "==> git sync ($BRANCH) via $GIT"
    "$GIT" -C "$REPO_DIR" fetch origin "$BRANCH" || "$GIT" -C "$REPO_DIR" fetch origin
    # shellcheck disable=SC2046
    "$GIT" -C "$REPO_DIR" clean -fd $(git_preserve_excludes)
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
      git clean -fd -e api/.env -e api/logs -e api/docker-compose.override.yml
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
  ensure_docker_access
  $DOCKER run --rm \
    --entrypoint sh \
    -v "$REPO_DIR:/git" \
    -w /git \
    "$GIT_IMAGE" \
    -ec "git config --global --add safe.directory /git; git rev-parse HEAD" 2>/dev/null || true
}

git_diff_names() {
  old_rev="$1"
  new_rev="$2"
  GIT=$(resolve_git)
  if [ -n "$GIT" ]; then
    "$GIT" -C "$REPO_DIR" diff --name-only "$old_rev" "$new_rev" 2>/dev/null || true
    return
  fi
  ensure_docker_access
  $DOCKER run --rm \
    --entrypoint sh \
    -v "$REPO_DIR:/git" \
    -w /git \
    "$GIT_IMAGE" \
    -ec "git config --global --add safe.directory /git; git diff --name-only '$old_rev' '$new_rev'" 2>/dev/null || true
}

# Classify api/ delta: none | data | code | image
classify_api_changes() {
  old_rev="$1"
  new_rev="$2"
  if [ -z "$old_rev" ] || [ "$old_rev" = "$new_rev" ]; then
    echo "none"
    return
  fi

  names=$(git_diff_names "$old_rev" "$new_rev")
  api_names=$(printf '%s\n' "$names" | grep '^api/' || true)
  if [ -z "$api_names" ]; then
    echo "none"
    return
  fi

  # Image recipe / collab service — need rebuild
  if printf '%s\n' "$api_names" | grep -qE '^api/(Dockerfile|requirements\.txt|conti-collab/|docker-compose\.yml)'; then
    echo "image"
    return
  fi

  # Anything under api/ outside data/ (and not purely docs/scripts of host) → code
  non_data=$(printf '%s\n' "$api_names" | grep -vE '^api/data/' || true)
  if [ -n "$non_data" ]; then
    # scripts/docs only → no container action needed for serving
    codeish=$(printf '%s\n' "$non_data" | grep -E '^api/(app/|server\.py|conti-collab/)' || true)
    if [ -n "$codeish" ]; then
      echo "code"
      return
    fi
    # api/scripts, api/docs, tests alone — skip runtime
    echo "none"
    return
  fi

  echo "data"
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
  log "ERROR: cannot access docker daemon. DSM Task Scheduler as root, or WORKS_DOCKER_SUDO=1 (NOPASSWD docker)"
  exit 126
}

compose_restart_api() {
  ensure_docker_access
  cd "$COMPOSE_DIR" || exit 1
  log "==> docker compose restart works-api (no build)"
  if $DOCKER compose restart works-api; then
    return
  fi
  # Fallback if service name differs on older Synology projects
  log "==> restart via compose up -d --no-build works-api"
  $DOCKER compose up -d --no-build --no-deps works-api
}

compose_build_all() {
  ensure_docker_access
  cd "$COMPOSE_DIR" || exit 1
  log "==> docker compose up -d --build (api/)"
  $DOCKER compose up -d --build --remove-orphans
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
log "==> works-api deploy start (branch=$BRANCH path=$REPO_DIR)"

mkdir -p "$(dirname "$REPO_DIR")"
if [ ! -d "$REPO_DIR/.git" ]; then
  log "==> no .git in $REPO_DIR — bootstrapping clone"
  git_bootstrap_clone
fi

cd "$REPO_DIR" || exit 1

if [ ! -d .git ]; then
  log "ERROR: bootstrap failed — still no .git in $REPO_DIR"
  exit 1
fi

if [ -z "$WORKS_PRE_SYNC_REV" ]; then
  WORKS_PRE_SYNC_REV=$(git_current_rev)
fi
OLD_REV="$WORKS_PRE_SYNC_REV"
git_sync_deploy
SYNCED_REV=$(git_current_rev)

REPO_SCRIPT="$REPO_DIR/api/scripts/nas-docker-update.sh"
# After sync, re-exec once so DSM/curl callers pick up the updated script.
# Keep caller flags — never inject --full-build.
if [ -z "$WORKS_DEPLOY_REEXEC" ] && [ -f "$REPO_SCRIPT" ]; then
  if [ "$OLD_REV" != "$SYNCED_REV" ] || [ "$(readlink -f "$0" 2>/dev/null || echo "$0")" != "$(readlink -f "$REPO_SCRIPT" 2>/dev/null || echo "$REPO_SCRIPT")" ]; then
    export WORKS_DEPLOY_REEXEC=1
    export WORKS_PRE_SYNC_REV="$OLD_REV"
    log "==> re-exec deploy script from repo (post git sync)"
    exec sh "$REPO_SCRIPT" "$@"
  fi
fi

NEW_REV="$SYNCED_REV"

if [ "$PULL_ONLY" = "1" ]; then
  log "==> pull only (--pull-only)"
  log "==> done"
  exit 0
fi

if [ "$FORCE_BUILD" = "1" ]; then
  kind="image"
else
  kind=$(classify_api_changes "$OLD_REV" "$NEW_REV")
fi
log "==> change class: $kind (old=${OLD_REV:-none} new=${NEW_REV:-none})"

case "$kind" in
  image)
    compose_build_all
    ;;
  code|data)
    compose_restart_api
    ;;
  none)
    log "==> api runtime unchanged — skip docker"
    ;;
  *)
    log "WARN: unknown class '$kind' — restart works-api"
    compose_restart_api
    ;;
esac

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
    log "WARN: health check failed after 60s — check docker logs for works-api / p8e1b72d-w1"
  fi
fi

log "==> done ($(date '+%Y-%m-%d %H:%M'))"
