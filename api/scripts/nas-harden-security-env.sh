#!/bin/sh
# Synology NAS: ensure security-related env keys exist in api/.env, then recreate containers.
#
# Usage (on NAS):
#   sh /volume1/docker/works-site/api/scripts/nas-harden-security-env.sh
#
# Idempotent: existing non-empty values are kept. Missing keys are generated.

set -e

REPO_DIR="${NAS_REPO_PATH:-/volume1/docker/works-site}"
COMPOSE_DIR="$REPO_DIR/api"
ENV_FILE="$COMPOSE_DIR/.env"

export PATH="/usr/local/bin:/var/packages/ContainerManager/target/usr/bin:/var/packages/Docker/target/usr/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

log() { echo "$@"; }

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

rand_hex() {
  # 32 bytes → 64 hex chars
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  if [ -r /dev/urandom ]; then
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
    echo
    return
  fi
  date +%s%N | sha256sum | awk '{print $1}'
}

env_get() {
  key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    echo ""
    return
  fi
  line=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)
  if [ -z "$line" ]; then
    echo ""
    return
  fi
  echo "${line#${key}=}" | tr -d '\r' | sed 's/^["'\'']//;s/["'\'']$//'
}

env_set() {
  key="$1"
  value="$2"
  tmp="${ENV_FILE}.tmp.$$"
  if [ ! -f "$ENV_FILE" ]; then
    printf '%s=%s\n' "$key" "$value" > "$ENV_FILE"
    return
  fi
  if grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    # replace in place without printing value
    awk -v k="$key" -v v="$value" '
      BEGIN { FS=OFS="=" }
      index($0, k "=") == 1 { print k "=" v; next }
      { print }
    ' "$ENV_FILE" > "$tmp"
    mv "$tmp" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

ensure_key() {
  key="$1"
  cur=$(env_get "$key")
  if [ -n "$cur" ]; then
    log "OK  $key already set (len=${#cur})"
    return 0
  fi
  gen=$(rand_hex | tr -d '\n')
  env_set "$key" "$gen"
  log "SET $key generated (len=${#gen})"
  return 0
}

if [ ! -d "$COMPOSE_DIR" ]; then
  log "ERROR: missing $COMPOSE_DIR"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  log "ERROR: missing $ENV_FILE — create from .env.example first"
  exit 1
fi

log "==> harden security env in $ENV_FILE"

# Signing secret separate from passcode
ensure_key "DDDIT_TEAM_GATE_SECRET"

# Studio bookmarklet shared secret (Origin alone is not auth)
ensure_key "DDDIT_STUDIO_IMPORT_SECRET"

# Conti WS must share the same team secrets (compose env_file)
pass=$(env_get "DDDIT_TEAM_GATE_PASSCODE")
if [ -z "$pass" ]; then
  log "WARN DDDIT_TEAM_GATE_PASSCODE empty — team gate / conti-ws auth disabled until set"
else
  log "OK  DDDIT_TEAM_GATE_PASSCODE present (len=${#pass})"
fi

DOCKER=$(resolve_docker)
if [ -z "$DOCKER" ]; then
  log "ERROR: docker not found"
  exit 1
fi

SUDO=""
if [ "${WORKS_DOCKER_SUDO:-1}" = "1" ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

log "==> recreate works-api + conti-collab to load env"
cd "$COMPOSE_DIR"
$SUDO $DOCKER compose up -d --force-recreate --no-deps works-api conti-collab

# health
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:8788/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [ "$ok" = "1" ]; then
  log "==> health OK (:8788)"
else
  log "WARN: health check failed — containers may still be starting"
fi

log "==> done (secrets not printed)"
