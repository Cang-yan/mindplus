#!/usr/bin/env bash

# MindPlus stack health check
# Covers:
# - systemd services
# - port listening
# - local HTTP endpoints
# - key env consistency
# - optional DB checks

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

MINDPLUS_DIR="${MINDPLUS_DIR:-${ROOT_DIR}}"
MINDUSER_DIR="${MINDUSER_DIR:-/home/xx/LINGINE/minduser}"

MINDUSER_ENV="${MINDUSER_ENV:-${MINDUSER_DIR}/.env}"
AIPPT_ENV="${AIPPT_ENV:-${MINDPLUS_DIR}/AiPPT/frontend/.env}"
OPENDRAFT_ENV="${OPENDRAFT_ENV:-${MINDPLUS_DIR}/opendraft-project/.env}"
AIPPT_STATIC_DIR="${AIPPT_STATIC_DIR:-/var/www/aippt/slide}"

SVC_MINDUSER="${SVC_MINDUSER:-minduser}"
SVC_AIPPT="${SVC_AIPPT:-aippt-server}"
SVC_OPENDRAFT="${SVC_OPENDRAFT:-opendraft}"
SVC_NGINX="${SVC_NGINX:-nginx}"

MINDUSER_PORT="${MINDUSER_PORT:-3100}"
AIPPT_PORT="${AIPPT_PORT:-3001}"
OPENDRAFT_PORT="${OPENDRAFT_PORT:-18080}"

MINDUSER_HEALTH_URL="${MINDUSER_HEALTH_URL:-http://127.0.0.1:${MINDUSER_PORT}/health}"
AIPPT_HEALTH_URL="${AIPPT_HEALTH_URL:-http://127.0.0.1:${AIPPT_PORT}/health}"
OPENDRAFT_INDEX_URL="${OPENDRAFT_INDEX_URL:-http://127.0.0.1:${OPENDRAFT_PORT}/}"
OPENDRAFT_PAPERS_URL="${OPENDRAFT_PAPERS_URL:-http://127.0.0.1:${OPENDRAFT_PORT}/api/papers?uid=ops-health-check}"

STRICT=0
CHECK_DB=1
CHECK_JOURNAL=1

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

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

Examples:
  bash scripts/ops_health_check.sh
  bash scripts/ops_health_check.sh --strict
  MINDUSER_PORT=3200 bash scripts/ops_health_check.sh
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
      $0 ~ "^[[:space:]]*"k"=" {
        sub("^[[:space:]]*"k"=","",$0)
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

check_env_consistency() {
  info "Checking env files and key config consistency"

  check_file_exists "$MINDUSER_ENV" "minduser env file"
  check_file_exists "$AIPPT_ENV" "aippt env file"
  check_file_exists "$OPENDRAFT_ENV" "opendraft env file"
  check_dir_exists "$AIPPT_STATIC_DIR" "aippt static dir"
  check_file_exists "${AIPPT_STATIC_DIR}/index.html" "aippt static index"
  check_file_exists "${AIPPT_STATIC_DIR}/runtime-config.js" "aippt runtime config"

  local mu_jwt aippt_jwt
  mu_jwt="$(read_env_value "$MINDUSER_ENV" "JWT_SECRET" 2>/dev/null || true)"
  aippt_jwt="$(read_env_value "$AIPPT_ENV" "MINDUSER_JWT_SECRET" 2>/dev/null || true)"

  if [[ -z "$mu_jwt" ]]; then
    fail "minduser JWT_SECRET is empty"
  elif [[ "$mu_jwt" == "change-this-secret-in-production" ]]; then
    fail "minduser JWT_SECRET is still default placeholder"
  else
    pass "minduser JWT_SECRET is set"
  fi

  if [[ -z "$aippt_jwt" ]]; then
    fail "aippt MINDUSER_JWT_SECRET is empty"
  elif [[ "$aippt_jwt" == "change-this-secret-in-production" ]]; then
    fail "aippt MINDUSER_JWT_SECRET is still default placeholder"
  else
    pass "aippt MINDUSER_JWT_SECRET is set"
  fi

  if [[ -n "$mu_jwt" && -n "$aippt_jwt" ]]; then
    if [[ "$mu_jwt" == "$aippt_jwt" ]]; then
      pass "JWT secret alignment: minduser JWT_SECRET == aippt MINDUSER_JWT_SECRET"
    else
      fail "JWT secret mismatch between minduser and aippt"
    fi
  fi

  local od_url
  od_url="$(read_env_value "$AIPPT_ENV" "OPENDRAFT_SERVICE_BASE_URL" 2>/dev/null || true)"
  if [[ -z "$od_url" ]]; then
    fail "aippt OPENDRAFT_SERVICE_BASE_URL is empty"
  else
    pass "aippt OPENDRAFT_SERVICE_BASE_URL=${od_url}"
    if [[ "$od_url" =~ :${OPENDRAFT_PORT}(/|$) ]]; then
      pass "opendraft target port in env matches expected ${OPENDRAFT_PORT}"
    else
      warn "opendraft target port in env differs from expected ${OPENDRAFT_PORT}"
    fi
  fi

  local minduser_base
  minduser_base="$(read_env_value "$AIPPT_ENV" "VITE_MINDUSER_BASE_URL" 2>/dev/null || true)"
  if [[ -z "$minduser_base" ]]; then
    fail "aippt VITE_MINDUSER_BASE_URL is empty"
  else
    pass "aippt VITE_MINDUSER_BASE_URL=${minduser_base}"
  fi
}

check_stack_runtime() {
  info "Checking services, ports, and HTTP endpoints"

  check_service_active "$SVC_MINDUSER"
  check_service_active "$SVC_AIPPT"
  check_service_active "$SVC_OPENDRAFT"
  check_service_active "$SVC_NGINX"

  check_port_listen "$MINDUSER_PORT" "minduser"
  check_port_listen "$AIPPT_PORT" "aippt-server"
  check_port_listen "$OPENDRAFT_PORT" "opendraft"

  # Nginx usually listens on 80/443 (at least one should exist).
  if have_cmd ss; then
    if ss -ltn 2>/dev/null | awk 'NR>1{print $4}' | grep -Eq ':(80|443)$'; then
      pass "nginx listening on :80 or :443"
    else
      warn "no listener found on :80 or :443"
    fi
  else
    warn "ss not found, skip nginx port check"
  fi

  check_http_ok "minduser health" "$MINDUSER_HEALTH_URL" '"status"[[:space:]]*:[[:space:]]*"ok"'
  check_http_ok "aippt health" "$AIPPT_HEALTH_URL" '"status"[[:space:]]*:[[:space:]]*"ok"'
  check_http_ok "opendraft index" "$OPENDRAFT_INDEX_URL"
  check_http_ok "opendraft papers api" "$OPENDRAFT_PAPERS_URL"

  check_nginx_config
}

check_db_runtime() {
  [[ "$CHECK_DB" -eq 1 ]] || return
  info "Checking DB connectivity"

  if have_cmd mysql; then
    local host port user pass dbname
    host="$(read_env_value "$AIPPT_ENV" "MYSQL_HOST" 2>/dev/null || true)"
    port="$(read_env_value "$AIPPT_ENV" "MYSQL_PORT" 2>/dev/null || true)"
    user="$(read_env_value "$AIPPT_ENV" "MYSQL_USER" 2>/dev/null || true)"
    pass="$(read_env_value "$AIPPT_ENV" "MYSQL_PASSWORD" 2>/dev/null || true)"
    dbname="$(read_env_value "$AIPPT_ENV" "MYSQL_DATABASE" 2>/dev/null || true)"

    host="${host:-127.0.0.1}"
    port="${port:-3306}"

    if [[ -z "$user" || -z "$dbname" ]]; then
      warn "skip aippt mysql check: MYSQL_USER or MYSQL_DATABASE missing in ${AIPPT_ENV}"
    else
      if MYSQL_PWD="$pass" mysql --protocol=TCP -h "$host" -P "$port" -u "$user" -D "$dbname" -Nse "SELECT 1;" >/dev/null 2>&1; then
        pass "aippt mysql connectivity (${user}@${host}:${port}/${dbname})"
      else
        fail "aippt mysql connectivity failed (${user}@${host}:${port}/${dbname})"
      fi

      local table_count
      table_count="$(
        MYSQL_PWD="$pass" mysql --protocol=TCP -h "$host" -P "$port" -u "$user" -D "$dbname" -Nse \
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${dbname}' AND table_name IN ('users','presentations','opendraft_papers','theses');" \
          2>/dev/null || echo "0"
      )"
      if [[ "$table_count" =~ ^[0-9]+$ ]] && [[ "$table_count" -ge 4 ]]; then
        pass "mindplus key tables present (users/presentations/opendraft_papers/theses)"
      else
        warn "mindplus key tables check not complete (found=${table_count})"
      fi
    fi
  else
    warn "mysql CLI not found, skip mysql connectivity checks"
  fi

  if have_cmd npm && [[ -d "$MINDUSER_DIR" ]]; then
    local out rc
    out="$(cd "$MINDUSER_DIR" && npm run -s db:check 2>&1)"
    rc=$?
    if [[ $rc -eq 0 ]]; then
      pass "minduser db:check passed"
      echo "$out" | sed 's/^/[DB-CHECK] /'
    else
      fail "minduser db:check failed: $(echo "$out" | tr '\n' ' ' | head -c 260)"
    fi
  else
    warn "npm not found or minduser dir missing, skip minduser db:check"
  fi
}

check_journal_runtime() {
  [[ "$CHECK_JOURNAL" -eq 1 ]] || return
  info "Scanning recent service logs (journalctl)"

  if ! have_cmd journalctl; then
    warn "journalctl not found, skip log scan"
    return
  fi

  local services=("$SVC_MINDUSER" "$SVC_AIPPT" "$SVC_OPENDRAFT" "$SVC_NGINX")
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
  info "minduser dir: ${MINDUSER_DIR}"

  check_env_consistency
  check_stack_runtime
  check_db_runtime
  check_journal_runtime
  print_summary_and_exit
}

main
