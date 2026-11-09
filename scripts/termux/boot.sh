#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
cd "$APP_ROOT"

# The service restores scanLoopState from durable app settings in DATA_DIR at startup;
# this boot wrapper deliberately does not reset, copy, or replace that persisted state.
DRY_RUN=0
if [[ "${TERMUX_DRY_RUN:-0}" == "1" || "${TERMUX_DRY_RUN:-}" == "true" ]]; then
  DRY_RUN=1
fi
if (( DRY_RUN )); then
  node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" --dry-run >/dev/null
  DATA_DIR="$(node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" --dry-run --print-data-dir)"
  printf '%s\n' 'TERMUX_DRY_RUN_OK: preflight passed; wake lock and service start skipped.'
  exit 0
fi
node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" >/dev/null
DATA_DIR="$(node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" --print-data-dir)"

command -v termux-wake-lock >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_BOOT_FAILED: termux-wake-lock is unavailable.' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_BOOT_FAILED: node is unavailable.' >&2; exit 1; }
command -v nohup >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_BOOT_FAILED: nohup is unavailable.' >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_BOOT_FAILED: curl is unavailable.' >&2; exit 1; }

termux-wake-lock >/dev/null 2>&1 || { printf '%s\n' 'TERMUX_BOOT_FAILED: wake lock could not be acquired.' >&2; exit 1; }
STATE_DIR="$DATA_DIR/termux"
mkdir -p -- "$STATE_DIR"
chmod 700 -- "$STATE_DIR"
PID_FILE="$STATE_DIR/service.pid"
LOG_FILE="$STATE_DIR/service.log"

if [[ -r "$PID_FILE" ]]; then
  read -r old_pid < "$PID_FILE" || old_pid=''
  if [[ "$old_pid" =~ ^[0-9]+$ ]] && kill -0 "$old_pid" 2>/dev/null; then
    printf '%s\n' 'TERMUX_BOOT_ALREADY_RUNNING'
    exit 0
  fi
  rm -f -- "$PID_FILE"
fi

# Application output stays in a private log rather than the Boot broadcast/terminal.
# Runtime environment values (including .env secrets) are never printed here.
nohup node build/server.cjs >>"$LOG_FILE" 2>&1 </dev/null &
service_pid=$!
printf '%s\n' "$service_pid" > "$PID_FILE"
chmod 600 -- "$PID_FILE" "$LOG_FILE"
PORT_VALUE="$(node "$SCRIPT_DIR/preflight.cjs" --root "$APP_ROOT" --dry-run --print-port)"
if [[ ! "$PORT_VALUE" =~ ^[0-9]{1,5}$ ]] || (( PORT_VALUE < 1 || PORT_VALUE > 65535 )); then
  printf '%s\n' 'TERMUX_BOOT_FAILED: invalid local service port.' >&2
  exit 1
fi
for attempt in $(seq 1 60); do
  if curl --fail --silent --max-time 2 "http://127.0.0.1:${PORT_VALUE}/health" >/dev/null 2>&1; then
    printf '%s\n' 'TERMUX_SERVICE_READY'
    exit 0
  fi
  if ! kill -0 "$service_pid" 2>/dev/null; then
    rm -f -- "$PID_FILE"
    printf '%s\n' 'TERMUX_BOOT_FAILED: service exited before health became ready; inspect the private DATA_DIR log.' >&2
    exit 1
  fi
  sleep 1
done
printf '%s\n' 'TERMUX_BOOT_FAILED: service did not become healthy within 60 seconds; inspect the private DATA_DIR log.' >&2
exit 1
