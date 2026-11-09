#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
if [[ -n "${PORT:-}" ]]; then
  PORT_VALUE="$PORT"
else
  command -v node >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_HEALTH_FAILED: node is unavailable.' >&2; exit 1; }
  PORT_VALUE="$(node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" --dry-run --print-port)"
fi
if [[ ! "$PORT_VALUE" =~ ^[0-9]{1,5}$ ]] || (( PORT_VALUE < 1 || PORT_VALUE > 65535 )); then
  printf '%s\n' 'TERMUX_HEALTH_FAILED: invalid local service port.' >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_HEALTH_FAILED: curl is unavailable.' >&2; exit 1; }

if ! curl --fail --silent --show-error --max-time 8 "http://127.0.0.1:${PORT_VALUE}/health" >/dev/null 2>&1; then
  printf '%s\n' 'TERMUX_HEALTH_FAILED: local service check failed.' >&2
  exit 1
fi

DEADMAN_URL="${TERMUX_DEADMAN_URL:-}"
if [[ -z "$DEADMAN_URL" ]]; then
  printf '%s\n' 'TERMUX_HEALTH_OK: dead-man ping not configured; no external request made.'
  exit 0
fi
# Require an explicitly configured HTTPS endpoint with no userinfo, query, or fragment;
# those URL components can embed credentials. The fixed body contains no runtime data.
if [[ ! "$DEADMAN_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~!$\&\'\(\)\*+,;=:@%/-]*)?$ ]] || [[ "$DEADMAN_URL" == *'@'* ]]; then
  printf '%s\n' 'TERMUX_HEALTH_FAILED: dead-man URL must be an explicit HTTPS URL without credentials or query parameters.' >&2
  exit 1
fi
if ! curl --fail --silent --show-error --max-time 8 --request POST \
  --header 'Content-Type: application/json' \
  --data-binary '{"status":"ok"}' "$DEADMAN_URL" >/dev/null 2>&1; then
  printf '%s\n' 'TERMUX_HEALTH_FAILED: dead-man ping failed.' >&2
  exit 1
fi
printf '%s\n' 'TERMUX_HEALTH_OK: local check and configured dead-man ping passed.'
