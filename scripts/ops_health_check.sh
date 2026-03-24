#!/usr/bin/env bash

# MindPlus stack health check (core-service + opendraft)
# Covers:
# - env/config sanity
# - systemd services
# - port listeners
# - local HTTP endpoints
# - optional DB checks
# - optional journal scan

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MINDPLUS_DIR="${MINDPLUS_DIR:-${ROOT_DIR}}"
CORE_SERVICE_DIR="${CORE_SERVICE_DIR:-${MINDPLUS_DIR}/core-service}"
OPENDRAFT_DIR="${OPENDRAFT_DIR:-${MINDPLUS_DIR}/opendraft-project}"
MINDUSER_DIR="${MINDUSER_DIR:-/home/xx/LINGINE/minduser}"

CORE_ENV="${CORE_ENV:-${CORE_SERVICE_DIR}/.env}"
OPENDRAFT_ENV="${OPENDRAFT_ENV:-${OPENDRAFT_DIR}/.env}"
MINDUSER_ENV="${MINDUSER_ENV:-${MINDUSER_DIR}/.env}"

FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-${CORE_SERVICE_DIR}/frontend/slide}"
NGINX_STATIC_DIR="${NGINX_STATIC_DIR:-/var/www/aippt/slide}"

SVC_AIPPT="${SVC_AIPPT:-aippt-server}"
SVC_OPENDRAFT="${SVC_OPENDRAFT:-opendraft}"
SVC_NGINX="${SVC_NGINX:-nginx}"
SVC_MINDUSER="${SVC_MINDUSER:-minduser}"

AIPPT_PORT="${AIPPT_PORT:-}"
OPENDRAFT_PORT="${OPENDRAFT_PORT:-}"
MINDUSER_PORT="${MINDUSER_PORT:-}"

AIPPT_HEALTH_URL="${AIPPT_HEALTH_URL:-}"
OPENDRAFT_INDEX_URL="${OPENDRAFT_INDEX_URL:-}"
OPENDRAFT_PAPERS_URL="${OPENDRAFT_PAPERS_URL:-}"
MINDUSER_HEALTH_URL="${MINDUSER_HEALTH_URL:-}"

# 1/true: always check local minduser service
# 0/false: never check local minduser service
# auto: check only when VITE_MINDUSER_BASE_URL points to localhost/127.0.0.1
CHECK_MINDUSER="${CHECK_MINDUSER:-auto}"

STRICT=0
CHECK_DB=1
CHECK_JOURNAL=1

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

CORE_BACKEND_PORT=""
CORE_BACKEND_HOST=""
MINDUSER_BASE_URL_FROM_CORE=""
OPENDRAFT_BASE_URL_FROM_CORE=""
MINDUSER_CHECK_ENABLED=0

if [[ -t 1 ]]; then
  C_PASS="\033[32m"
  C_WARN="\033[33m"
  C_FAIL="\033[31m"
  C_INFO="\033[36m"
  C_RESET="\033[0m"
else
  C_PASS=""
  C_WARN=""
  C_FAIL=""
  C_INFO=""
  C_RESET=""
fi

usage() {
  cat <<'EOF'
Usage:
  bash scripts/ops_health_check.sh [options]

Options:
  --strict      Treat WARN as non-zero exit
  --no-db       Skip DB checks
  --no-journal  Skip journalctl log scan
  -h, --help    Show this help

Useful env overrides:
  CORE_ENV=/path/to/core-service/.env
  OPENDRAFT_ENV=/path/to/opendraft/.env
  AIPPT_PORT=3001 OPENDRAFT_PORT=18080
  CHECK_MINDUSER=auto|1|0

Examples:
  bash scripts/ops_health_check.sh
  bash scripts/ops_health_check.sh --strict
  CHECK_MINDUSER=0 bash scripts/ops_health_check.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)
      STRICT=1
      ;;
    --no-db)
      CHECK_DB=0
      ;;
    --no-journal)
      CHECK_JOURNAL=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 2
      ;;
  esac
  shift
done

trim() {
  local value="$1"
  # shellcheck disable=SC2001
  value="$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  printf '%s' "$value"
}

read_env_value() {
  local env_file="$1"
  local key="$2"
  local raw

  [[ -f "$env_file" ]] || return 1

  raw="$(
    awk -v k="$key" '
      $0 ~ "^[[:space:]]*(export[[:space:]]+)?"k"=" {
        sub("^[[:space:]]*(export[[:space:]]+)?"k"=","",$0)
        print $0
      }
    ' "$env_file" | tail -n 1
  )"
  [[ -n "${raw:-}" ]] || return 1

  raw="${raw%%#*}"
  raw="$(trim "$raw")"

  if [[ ${#raw} -ge 2 ]]; then
    if [[ "$raw" == \"*\" && "$raw" == *\" ]]; then
      raw="${raw:1:${#raw}-2}"
    elif [[ "$raw" == \'*\' && "$raw" == *\' ]]; then
      raw="${raw:1:${#raw}-2}"
    fi
  fi

  printf '%s' "$raw"
}

tolower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

normalize_port() {
  local value="$1"
  local fallback="$2"
  local n
  n="$(printf '%s' "$value" | tr -cd '0-9')"
  if [[ -n "$n" ]] && [[ "$n" =~ ^[0-9]+$ ]] && [[ "$n" -gt 0 ]] && [[ "$n" -le 65535 ]]; then
    printf '%s' "$n"
  else
    printf '%s' "$fallback"
  fi
}

parse_url_host_port() {
  local url="$1"
  local host=""
  local port=""
  if [[ "$url" =~ ^https?://([^/:]+)(:([0-9]+))?(/|$) ]]; then
    host="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[3]}"
    if [[ -z "$port" ]]; then
      if [[ "$url" == https://* ]]; then
        port="443"
      else
        port="80"
      fi
    fi
  fi
  printf '%s %s\n' "$host" "$port"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo -e "${C_PASS}[PASS]${C_RESET} $*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  echo -e "${C_WARN}[WARN]${C_RESET} $*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo -e "${C_FAIL}[FAIL]${C_RESET} $*"
}

info() {
  echo -e "${C_INFO}[INFO]${C_RESET} $*"
}

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

check_file_exists() {
  local path="$1"
  local label="$2"
  if [[ -f "$path" ]]; then
    pass "${label}: found (${path})"
  else
    fail "${label}: missing (${path})"
  fi
}

check_dir_exists() {
  local path="$1"
  local label="$2"
  if [[ -d "$path" ]]; then
    pass "${label}: found (${path})"
  else
    fail "${label}: missing (${path})"
  fi
}

check_service_active() {
  local service="$1"
  local out rc

  if ! have_cmd systemctl; then
    warn "systemctl not found, skip service check: ${service}"
    return
  fi

  out="$(systemctl is-active "$service" 2>&1)"
  rc=$?

  if [[ $rc -eq 0 ]]; then
    pass "service ${service} is active"
  elif echo "$out" | grep -qiE 'failed to connect to bus|not been booted with systemd|operation not permitted'; then
    warn "cannot query systemd bus for ${service} in this runtime (${out})"
  elif echo "$out" | grep -qiE 'could not be found|not-found'; then
    fail "service ${service} is not installed (${out})"
  else
    fail "service ${service} is NOT active (${out})"
  fi
}

check_port_listen() {
  local port="$1"
  local label="$2"

  if ! have_cmd ss; then
    warn "ss not found, skip port check: ${label}:${port}"
    return
  fi

  if ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -Eq ":${port}$"; then
    pass "${label} listening on :${port}"
  else
    fail "${label} NOT listening on :${port}"
  fi
}

http_fetch() {
  local url="$1"
  local body_file="$2"
  local err_file="$3"
  local timeout="${4:-8}"
  local code

  code="$(
    curl --noproxy '*' -sS -m "$timeout" -o "$body_file" -w '%{http_code}' "$url" 2>"$err_file" || true
  )"
  printf '%s' "$code"
}

check_http_ok() {
  local label="$1"
  local url="$2"
  local require_ok_pattern="${3:-}"
  local body_file err_file code

  body_file="$(mktemp)"
  err_file="$(mktemp)"
  code="$(http_fetch "$url" "$body_file" "$err_file")"

  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    if [[ -n "$require_ok_pattern" ]]; then
      if grep -Eq "$require_ok_pattern" "$body_file"; then
        pass "${label} HTTP ${code} (${url})"
      else
        warn "${label} HTTP ${code} but body pattern not matched (${url})"
      fi
    else
      pass "${label} HTTP ${code} (${url})"
    fi
  else
    local snippet
    snippet="$(head -c 200 "$body_file" | tr '\n' ' ')"
    local cerr
    cerr="$(head -c 200 "$err_file" | tr '\n' ' ')"
    fail "${label} HTTP ${code:-000} (${url}) body='${snippet}' err='${cerr}'"
  fi

  rm -f "$body_file" "$err_file"
}

check_nginx_config() {
  if ! have_cmd nginx; then
    warn "nginx command not found, skip nginx -t"
    return
  fi

  local out rc
  out="$(nginx -t 2>&1)"
  rc=$?
  if [[ $rc -eq 0 ]]; then
    pass "nginx -t passed"
    return
  fi

  if echo "$out" | grep -qi 'permission denied'; then
    warn "nginx -t permission denied (run as root to validate full config)"
  else
    fail "nginx -t failed: $(echo "$out" | tr '\n' ' ' | head -c 240)"
  fi
}

resolve_runtime_expectations() {
  CORE_BACKEND_PORT="$(read_env_value "$CORE_ENV" "VITE_BACKEND_PORT" 2>/dev/null || true)"
  CORE_BACKEND_HOST="$(read_env_value "$CORE_ENV" "VITE_BACKEND_HOST" 2>/dev/null || true)"
  MINDUSER_BASE_URL_FROM_CORE="$(read_env_value "$CORE_ENV" "VITE_MINDUSER_BASE_URL" 2>/dev/null || true)"
  OPENDRAFT_BASE_URL_FROM_CORE="$(read_env_value "$CORE_ENV" "OPENDRAFT_SERVICE_BASE_URL" 2>/dev/null || true)"

  if [[ -z "$AIPPT_PORT" ]]; then
    AIPPT_PORT="$CORE_BACKEND_PORT"
  fi
  AIPPT_PORT="$(normalize_port "$AIPPT_PORT" "3001")"

  if [[ -z "$OPENDRAFT_PORT" ]]; then
    OPENDRAFT_PORT="$(read_env_value "$OPENDRAFT_ENV" "OPENDRAFT_PORT" 2>/dev/null || true)"
  fi
  if [[ -z "$OPENDRAFT_PORT" ]]; then
    OPENDRAFT_PORT="$(read_env_value "$OPENDRAFT_ENV" "PORT" 2>/dev/null || true)"
  fi
  OPENDRAFT_PORT="$(normalize_port "$OPENDRAFT_PORT" "18080")"

  if [[ -z "$MINDUSER_PORT" ]]; then
    local mu_host mu_port
    read -r mu_host mu_port < <(parse_url_host_port "$MINDUSER_BASE_URL_FROM_CORE")
    MINDUSER_PORT="$mu_port"
  fi
  MINDUSER_PORT="$(normalize_port "$MINDUSER_PORT" "3100")"

  AIPPT_HEALTH_URL="${AIPPT_HEALTH_URL:-http://127.0.0.1:${AIPPT_PORT}/health}"
  OPENDRAFT_INDEX_URL="${OPENDRAFT_INDEX_URL:-http://127.0.0.1:${OPENDRAFT_PORT}/}"
  OPENDRAFT_PAPERS_URL="${OPENDRAFT_PAPERS_URL:-http://127.0.0.1:${OPENDRAFT_PORT}/api/papers?uid=ops-health-check}"
  MINDUSER_HEALTH_URL="${MINDUSER_HEALTH_URL:-http://127.0.0.1:${MINDUSER_PORT}/health}"

  local minduser_mode
  minduser_mode="$(tolower "$CHECK_MINDUSER")"
  case "$minduser_mode" in
    1|true|yes|on)
      MINDUSER_CHECK_ENABLED=1
      ;;
    0|false|no|off)
      MINDUSER_CHECK_ENABLED=0
      ;;
    auto|"")
      local host port
      read -r host port < <(parse_url_host_port "$MINDUSER_BASE_URL_FROM_CORE")
      if [[ "$host" == "127.0.0.1" || "$host" == "localhost" || "$host" == "0.0.0.0" ]]; then
        MINDUSER_CHECK_ENABLED=1
      else
        MINDUSER_CHECK_ENABLED=0
      fi
      ;;
    *)
      warn "invalid CHECK_MINDUSER=${CHECK_MINDUSER}; fallback to auto"
      local host2 port2
      read -r host2 port2 < <(parse_url_host_port "$MINDUSER_BASE_URL_FROM_CORE")
      if [[ "$host2" == "127.0.0.1" || "$host2" == "localhost" || "$host2" == "0.0.0.0" ]]; then
        MINDUSER_CHECK_ENABLED=1
      else
        MINDUSER_CHECK_ENABLED=0
      fi
      ;;
  esac
}

check_env_consistency() {
  info "Checking env files and key config consistency"

  check_dir_exists "$CORE_SERVICE_DIR" "core-service dir"
  check_dir_exists "$OPENDRAFT_DIR" "opendraft dir"
  check_file_exists "$CORE_ENV" "core-service env file"

  if [[ -f "$OPENDRAFT_ENV" ]]; then
    pass "opendraft env file: found (${OPENDRAFT_ENV})"
  else
    warn "opendraft env file missing (${OPENDRAFT_ENV})"
  fi

  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]]; then
    if [[ -f "$MINDUSER_ENV" ]]; then
      pass "minduser env file: found (${MINDUSER_ENV})"
    else
      warn "minduser env file missing (${MINDUSER_ENV})"
    fi
  else
    info "minduser local checks disabled (CHECK_MINDUSER=${CHECK_MINDUSER}, VITE_MINDUSER_BASE_URL=${MINDUSER_BASE_URL_FROM_CORE:-<empty>})"
  fi

  local static_ok=0
  if [[ -f "${FRONTEND_BUILD_DIR}/index.html" ]]; then
    pass "frontend build index: found (${FRONTEND_BUILD_DIR}/index.html)"
    static_ok=1
  else
    warn "frontend build index missing (${FRONTEND_BUILD_DIR}/index.html)"
  fi

  if [[ -f "${NGINX_STATIC_DIR}/index.html" ]]; then
    pass "nginx static index: found (${NGINX_STATIC_DIR}/index.html)"
    static_ok=1
  else
    warn "nginx static index missing (${NGINX_STATIC_DIR}/index.html)"
  fi

  if [[ "$static_ok" -eq 0 ]]; then
    fail "no static index found in FRONTEND_BUILD_DIR or NGINX_STATIC_DIR"
  fi

  local jwt_secret minduser_jwt
  jwt_secret="$(read_env_value "$CORE_ENV" "JWT_SECRET" 2>/dev/null || true)"
  minduser_jwt="$(read_env_value "$CORE_ENV" "MINDUSER_JWT_SECRET" 2>/dev/null || true)"

  if [[ -z "$jwt_secret" ]]; then
    fail "core JWT_SECRET is empty"
  elif [[ "$jwt_secret" == "change-this-to-a-random-secret-string" || "$jwt_secret" == "change-this-secret-in-production" ]]; then
    fail "core JWT_SECRET is still default placeholder"
  else
    pass "core JWT_SECRET is set"
  fi

  if [[ -z "$minduser_jwt" ]]; then
    warn "core MINDUSER_JWT_SECRET is empty (will fallback to JWT_SECRET in backend config)"
  elif [[ "$minduser_jwt" == "change-this-secret-in-production" ]]; then
    fail "core MINDUSER_JWT_SECRET is still default placeholder"
  else
    pass "core MINDUSER_JWT_SECRET is set"
  fi

  if [[ -n "$jwt_secret" && -n "$minduser_jwt" ]]; then
    if [[ "$jwt_secret" == "$minduser_jwt" ]]; then
      pass "JWT alignment: JWT_SECRET == MINDUSER_JWT_SECRET"
    else
      warn "JWT mismatch: JWT_SECRET != MINDUSER_JWT_SECRET (check MindUser SSO compatibility)"
    fi
  fi

  local mysql_host mysql_port mysql_user mysql_db
  mysql_host="$(read_env_value "$CORE_ENV" "MYSQL_HOST" 2>/dev/null || true)"
  mysql_port="$(read_env_value "$CORE_ENV" "MYSQL_PORT" 2>/dev/null || true)"
  mysql_user="$(read_env_value "$CORE_ENV" "MYSQL_USER" 2>/dev/null || true)"
  mysql_db="$(read_env_value "$CORE_ENV" "MYSQL_DATABASE" 2>/dev/null || true)"

  if [[ -z "$mysql_host" ]]; then
    warn "MYSQL_HOST not set in ${CORE_ENV}"
  else
    pass "MYSQL_HOST=${mysql_host}"
  fi

  if [[ -z "$mysql_port" ]]; then
    warn "MYSQL_PORT not set in ${CORE_ENV}"
  else
    pass "MYSQL_PORT=${mysql_port}"
  fi

  if [[ -z "$mysql_user" || -z "$mysql_db" ]]; then
    fail "MYSQL_USER or MYSQL_DATABASE missing in ${CORE_ENV}"
  else
    pass "MYSQL target=${mysql_user}@${mysql_host:-127.0.0.1}:${mysql_port:-3306}/${mysql_db}"
  fi

  if [[ -n "$CORE_BACKEND_HOST" ]]; then
    pass "VITE_BACKEND_HOST=${CORE_BACKEND_HOST}"
  else
    warn "VITE_BACKEND_HOST missing in ${CORE_ENV}"
  fi

  if [[ -n "$CORE_BACKEND_PORT" ]]; then
    pass "VITE_BACKEND_PORT=${CORE_BACKEND_PORT}"
  else
    warn "VITE_BACKEND_PORT missing in ${CORE_ENV}, using fallback ${AIPPT_PORT}"
  fi

  if [[ -z "$OPENDRAFT_BASE_URL_FROM_CORE" ]]; then
    warn "OPENDRAFT_SERVICE_BASE_URL is empty (OpenDraft proxy may be disabled)"
  else
    pass "OPENDRAFT_SERVICE_BASE_URL=${OPENDRAFT_BASE_URL_FROM_CORE}"
    if [[ "$OPENDRAFT_BASE_URL_FROM_CORE" =~ :${OPENDRAFT_PORT}(/|$) ]]; then
      pass "opendraft target port in env matches expected ${OPENDRAFT_PORT}"
    else
      warn "opendraft target port in env differs from expected ${OPENDRAFT_PORT}"
    fi
  fi

  if [[ -z "$MINDUSER_BASE_URL_FROM_CORE" ]]; then
    warn "VITE_MINDUSER_BASE_URL is empty"
  else
    pass "VITE_MINDUSER_BASE_URL=${MINDUSER_BASE_URL_FROM_CORE}"
  fi
}

check_stack_runtime() {
  info "Checking services, ports, and HTTP endpoints"

  check_service_active "$SVC_AIPPT"
  check_service_active "$SVC_OPENDRAFT"
  check_service_active "$SVC_NGINX"
  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]]; then
    check_service_active "$SVC_MINDUSER"
  fi

  check_port_listen "$AIPPT_PORT" "aippt-server"
  check_port_listen "$OPENDRAFT_PORT" "opendraft"
  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]]; then
    check_port_listen "$MINDUSER_PORT" "minduser"
  fi

  if have_cmd ss; then
    if ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -Eq ':(80|443)$'; then
      pass "nginx listening on :80 or :443"
    else
      warn "no listener found on :80 or :443"
    fi
  else
    warn "ss not found, skip nginx port check"
  fi

  check_http_ok "aippt health" "$AIPPT_HEALTH_URL" '"status"[[:space:]]*:[[:space:]]*"ok"'
  check_http_ok "opendraft index" "$OPENDRAFT_INDEX_URL"
  check_http_ok "opendraft papers api" "$OPENDRAFT_PAPERS_URL"
  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]]; then
    check_http_ok "minduser health" "$MINDUSER_HEALTH_URL" '"status"[[:space:]]*:[[:space:]]*"ok"'
  fi

  check_nginx_config
}

check_db_runtime() {
  [[ "$CHECK_DB" -eq 1 ]] || return
  info "Checking DB connectivity"

  if have_cmd mysql; then
    local host port user pass dbname
    host="$(read_env_value "$CORE_ENV" "MYSQL_HOST" 2>/dev/null || true)"
    port="$(read_env_value "$CORE_ENV" "MYSQL_PORT" 2>/dev/null || true)"
    user="$(read_env_value "$CORE_ENV" "MYSQL_USER" 2>/dev/null || true)"
    pass="$(read_env_value "$CORE_ENV" "MYSQL_PASSWORD" 2>/dev/null || true)"
    dbname="$(read_env_value "$CORE_ENV" "MYSQL_DATABASE" 2>/dev/null || true)"

    host="${host:-127.0.0.1}"
    port="${port:-3306}"

    if [[ -z "$user" || -z "$dbname" ]]; then
      warn "skip mysql check: MYSQL_USER or MYSQL_DATABASE missing in ${CORE_ENV}"
    else
      if MYSQL_PWD="$pass" mysql --protocol=TCP -h "$host" -P "$port" -u "$user" -D "$dbname" -Nse "SELECT 1;" >/dev/null 2>&1; then
        pass "mysql connectivity (${user}@${host}:${port}/${dbname})"
      else
        fail "mysql connectivity failed (${user}@${host}:${port}/${dbname})"
      fi

      local table_count
      table_count="$(
        MYSQL_PWD="$pass" mysql --protocol=TCP -h "$host" -P "$port" -u "$user" -D "$dbname" -Nse \
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${dbname}' AND table_name IN ('users','presentations','opendraft_papers','theses');" \
          2>/dev/null || echo "0"
      )"
      if [[ "$table_count" =~ ^[0-9]+$ ]] && [[ "$table_count" -ge 3 ]]; then
        pass "mindplus key tables present (users/presentations/opendraft_papers/theses)"
      else
        warn "mindplus key tables check not complete (found=${table_count})"
      fi
    fi
  else
    warn "mysql CLI not found, skip mysql connectivity checks"
  fi

  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]] && have_cmd npm && [[ -d "$MINDUSER_DIR" ]]; then
    local out rc
    out="$(cd "$MINDUSER_DIR" && npm run -s db:check 2>&1)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
      pass "minduser db:check passed"
      echo "$out" | sed 's/^/[DB-CHECK] /'
    else
      warn "minduser db:check failed: $(echo "$out" | tr '\n' ' ' | head -c 260)"
    fi
  else
    info "skip minduser db:check (minduser local checks disabled or dir missing)"
  fi
}

check_journal_runtime() {
  [[ "$CHECK_JOURNAL" -eq 1 ]] || return
  info "Scanning recent service logs (journalctl)"

  if ! have_cmd journalctl; then
    warn "journalctl not found, skip log scan"
    return
  fi

  local services=("$SVC_AIPPT" "$SVC_OPENDRAFT" "$SVC_NGINX")
  if [[ "$MINDUSER_CHECK_ENABLED" -eq 1 ]]; then
    services+=("$SVC_MINDUSER")
  fi

  local svc raw hit_count
  for svc in "${services[@]}"; do
    raw="$(journalctl -u "$svc" -n 120 --no-pager 2>/dev/null || true)"
    if [[ -z "$raw" ]]; then
      warn "no readable logs for ${svc} (permission or service missing)"
      continue
    fi

    hit_count="$(echo "$raw" | grep -Eic 'error|exception|traceback|failed' || true)"
    if [[ "$hit_count" =~ ^[0-9]+$ ]] && [[ "$hit_count" -gt 0 ]]; then
      warn "recent log scan for ${svc}: found ${hit_count} lines with error keywords"
    else
      pass "recent log scan for ${svc}: no obvious error keywords"
    fi
  done
}

print_summary_and_exit() {
  echo
  echo "================ SUMMARY ================"
  echo "PASS: ${PASS_COUNT}"
  echo "WARN: ${WARN_COUNT}"
  echo "FAIL: ${FAIL_COUNT}"
  echo "========================================="

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    exit 1
  fi
  if [[ "$STRICT" -eq 1 && "$WARN_COUNT" -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main() {
  info "MindPlus ops health check started at $(date '+%F %T %z')"
  info "mindplus dir: ${MINDPLUS_DIR}"
  info "core-service dir: ${CORE_SERVICE_DIR}"
  info "opendraft dir: ${OPENDRAFT_DIR}"

  resolve_runtime_expectations
  info "runtime expected ports -> aippt:${AIPPT_PORT}, opendraft:${OPENDRAFT_PORT}, minduser:${MINDUSER_PORT}"
  info "minduser local check enabled: ${MINDUSER_CHECK_ENABLED} (CHECK_MINDUSER=${CHECK_MINDUSER})"

  check_env_consistency
  check_stack_runtime
  check_db_runtime
  check_journal_runtime
  print_summary_and_exit
}

main
