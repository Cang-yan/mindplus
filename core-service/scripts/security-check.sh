#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXIT_CODE=0

report_hits() {
  local title="$1"
  local hits="$2"
  if [[ -n "$hits" ]]; then
    echo "[security-check] $title"
    echo "$hits"
    echo
    EXIT_CODE=1
  fi
}

# 1) Prevent committing real API keys (sk-...)
# Keep placeholder examples in docs and env templates out of this check.
KEY_HITS="$(git grep -nE "sk-[A-Za-z0-9]{20,}" -- \
  . \
  ':!frontend/.env.example' \
  ':!frontend/src/utils/ai/README.md' \
  ':!frontend/src/utils/ai/setup.ts' \
  ':!README.md' \
  ':!README_EN.md' \
  ':!README.startup.md' \
  ':!docs/**' || true)"
report_hits "Detected potential real API keys in tracked files." "$KEY_HITS"

# 2) Legacy static runtime config must not contain real apiKey values.
LEGACY_CONFIG_HITS="$(git grep -nE "apiKey:\s*'[^']+'" -- \
  frontend/public/legacy-static/runtime-config.js \
  frontend/slide/legacy-static/runtime-config.js || true)"
report_hits "Legacy runtime-config.js must keep apiKey empty." "$LEGACY_CONFIG_HITS"

# 3) Vue runtime config placeholders must keep key fields empty.
APP_CONFIG_HITS="$(git grep -nE "(VITE|APP)_[A-Z0-9_]*(API_KEY|ACCESS_KEY|SECRET_KEY):\s*'[^']+'" -- \
  frontend/public/runtime-config.js \
  frontend/slide/runtime-config.js || true)"
report_hits "frontend runtime-config.js must keep *_KEY placeholders empty." "$APP_CONFIG_HITS"

# 4) Built runtimeConfig assets must not embed concrete key values.
ASSET_CONFIG_HITS="$(git grep -nE "(VITE|APP)_[A-Z0-9_]*(API_KEY|ACCESS_KEY|SECRET_KEY):\"[^\"]+\"" -- \
  frontend/slide/assets/runtimeConfig-*.js || true)"
report_hits "Built runtimeConfig assets must not embed concrete key values." "$ASSET_CONFIG_HITS"

if [[ "$EXIT_CODE" -ne 0 ]]; then
  echo "[security-check] FAILED"
  exit "$EXIT_CODE"
fi

echo "[security-check] PASSED"
