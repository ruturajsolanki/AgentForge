#!/usr/bin/env bash
# ForgeOS boot script — brings up every service with a properly animated
# console boot sequence, then launches the browser.
#
# Usage:
#   ./start.sh           # boot everything and open the browser
#   ./start.sh --no-open # boot but don't launch the browser
#   ./start.sh --down    # stop every service started by this script
#   ./start.sh --logs    # tail the logs of running services
#   ./start.sh --status  # show what's currently running

set -u
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$ROOT/.boot/logs"
PID_DIR="$ROOT/.boot/pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# ── ANSI palette ───────────────────────────────────────────────────────
ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RED="${ESC}[31m"
GREEN="${ESC}[32m"
YELLOW="${ESC}[33m"
BLUE="${ESC}[34m"
MAGENTA="${ESC}[35m"
CYAN="${ESC}[36m"
WHITE="${ESC}[97m"
GREY="${ESC}[90m"
VIOLET="${ESC}[38;5;141m"
TEAL="${ESC}[38;5;79m"
AMBER="${ESC}[38;5;215m"
ROSE="${ESC}[38;5;211m"
HIDE_CUR="${ESC}[?25l"
SHOW_CUR="${ESC}[?25h"

trap 'printf "%s" "${SHOW_CUR}"; exit 130' INT
trap 'printf "%s" "${SHOW_CUR}"' EXIT

# ── Tiny utilities ─────────────────────────────────────────────────────
log() { printf "  %b %s\n" "${GREY}·${RESET}" "$*"; }
ok()  { printf "  %b %s\n" "${GREEN}✓${RESET}" "$*"; }
warn(){ printf "  %b %s\n" "${AMBER}!${RESET}" "$*"; }
err() { printf "  %b %s\n" "${RED}✗${RESET}" "$*"; }

# Spinner that loops a given function in the background.
SPIN_FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
spinner_pid=""
start_spinner() {
  local label="$1" color="${2:-${VIOLET}}"
  (
    i=0
    while :; do
      printf "\r  ${color}%s${RESET}  ${WHITE}%s${RESET}${GREY} …${RESET}" \
        "${SPIN_FRAMES[$((i % ${#SPIN_FRAMES[@]}))]}" "$label"
      sleep 0.08
      i=$((i+1))
    done
  ) &
  spinner_pid=$!
  disown 2>/dev/null || true
}
stop_spinner() {
  local result="$1" label="$2"
  if [[ -n "$spinner_pid" ]]; then
    kill "$spinner_pid" 2>/dev/null
    wait "$spinner_pid" 2>/dev/null
    spinner_pid=""
  fi
  printf "\r  "
  if [[ "$result" == "ok" ]]; then
    printf "${GREEN}✓${RESET}  ${WHITE}%s${RESET}                                                       \n" "$label"
  else
    printf "${RED}✗${RESET}  ${WHITE}%s${RESET}                                                       \n" "$label"
  fi
}

# Wait for a curl URL to respond OK; with a max timeout.
wait_for_url() {
  local url="$1" max="$2"
  local i=0
  while (( i < max )); do
    if curl -s -f -o /dev/null --max-time 1 "$url"; then return 0; fi
    sleep 0.5
    i=$((i+1))
  done
  return 1
}

# Wait for a TCP host:port to accept connections.
wait_for_port() {
  local host="$1" port="$2" max="$3"
  local i=0
  while (( i < max )); do
    if (echo > /dev/tcp/$host/$port) >/dev/null 2>&1; then return 0; fi
    sleep 0.5
    i=$((i+1))
  done
  return 1
}

# Check if a PID file refers to a live process.
pid_alive() {
  local f="$1"
  [[ -f "$f" ]] && kill -0 "$(cat "$f")" 2>/dev/null
}

# Stop a service by PID file.
stop_pid() {
  local name="$1" file="$PID_DIR/$1.pid"
  if pid_alive "$file"; then
    local pid; pid=$(cat "$file")
    kill "$pid" 2>/dev/null || true
    sleep 0.4
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$file"
    ok "stopped ${name} (pid ${pid})"
  else
    rm -f "$file"
    log "${name} was not running"
  fi
}

# ── The ForgeOS banner ─────────────────────────────────────────────────
banner() {
  printf "%s" "${HIDE_CUR}"
  clear
  cat <<EOF

${VIOLET}    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗ ██████╗ ███████╗${RESET}
${VIOLET}    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██╔════╝${RESET}
${TEAL}    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ██║   ██║███████╗${RESET}
${TEAL}    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ██║   ██║╚════██║${RESET}
${CYAN}    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗╚██████╔╝███████║${RESET}
${CYAN}    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝${RESET}

      ${BOLD}${WHITE}ForgeOS${RESET}${GREY} · AgentForge × Vultron unified runtime${RESET}
      ${GREY}v1.0 · 165-model smart router · 3-tier fallback · live streaming${RESET}

EOF
}

# ── Boot subcommand ─────────────────────────────────────────────────────

cmd_up() {
  local open_browser="$1"
  banner

  # 0. Prereqs
  start_spinner "checking prerequisites"
  local missing=()
  for tool in docker python3 node npm curl; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  if (( ${#missing[@]} > 0 )); then
    stop_spinner err "checking prerequisites"
    err "missing required tools: ${missing[*]}"
    exit 1
  fi
  stop_spinner ok "prerequisites present ($(python3 --version | cut -d' ' -f2), node $(node --version | tr -d v))"

  # Load .env (optional)
  if [[ -f "$ROOT/deploy/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$ROOT/deploy/.env"
    set +a
  fi

  # 1. Infrastructure containers
  start_spinner "starting infrastructure (postgres · redis · minio)"
  (cd "$ROOT/deploy" && docker compose -f docker-compose.dev.yml up -d \
      >"$LOG_DIR/docker.log" 2>&1) || { stop_spinner err "infrastructure"; tail -20 "$LOG_DIR/docker.log"; exit 1; }
  if ! wait_for_port localhost 5432 60; then
    stop_spinner err "postgres did not open port 5432"; exit 1
  fi
  if ! wait_for_port localhost 6379 30; then
    stop_spinner err "redis did not open port 6379"; exit 1
  fi

  # Wait for postgres to actually accept queries (not just TCP). With a fresh
  # volume the port opens before initdb finishes, so the first connection
  # gets reset by peer. pg_isready inside the container handles this cleanly.
  local pg_ready=0
  for i in $(seq 1 60); do
    if docker exec deploy-postgres-1 pg_isready -U forgeos -d forgeos >/dev/null 2>&1; then
      pg_ready=1; break
    fi
    sleep 0.5
  done
  if (( pg_ready == 0 )); then
    stop_spinner err "postgres never became ready (pg_isready timeout)"; exit 1
  fi
  stop_spinner ok "infrastructure ready  ${GREY}pg:5432 · redis:6379 · minio:9000${RESET}"

  # 2. Database migrations — alembic if available, else just verify connectivity.
  # Wrap in a retry loop because a freshly-bootstrapped Postgres sometimes
  # bounces the very first asyncpg connection during SSL negotiation.
  start_spinner "syncing database schema"
  local db_ok=0
  for attempt in 1 2 3 4 5; do
    (
      cd "$ROOT/backend"
      # Prefer `python3 -m alembic` over the bare `alembic` binary — the latter
      # isn't reliably on PATH when running from a user-installed Python.
      if [[ -f alembic.ini ]] && python3 -c "import alembic" >/dev/null 2>&1; then
        python3 -m alembic upgrade head
      else
        python3 -c "
import asyncio
from sqlalchemy import text
from app.db.session import engine
async def ping():
    async with engine.connect() as c: await c.execute(text('SELECT 1'))
asyncio.run(ping())
"
      fi
    ) >"$LOG_DIR/db.log" 2>&1 && { db_ok=1; break; }
    sleep 2
  done
  if (( db_ok == 0 )); then
    stop_spinner err "database schema"; tail -25 "$LOG_DIR/db.log"; exit 1
  fi
  stop_spinner ok "database schema synced"

  # 3. Backend (FastAPI)
  start_spinner "launching backend api  ${GREY}(fastapi · uvicorn)${RESET}"
  if pid_alive "$PID_DIR/backend.pid"; then
    stop_spinner ok "backend already running (pid $(cat "$PID_DIR/backend.pid"))"
  elif lsof -ti:8000 >/dev/null 2>&1 || curl -s -f -o /dev/null --max-time 1 http://127.0.0.1:8000/api/health; then
    stop_spinner ok "backend already healthy  ${GREY}(external — not managed by start.sh)${RESET}"
  else
    (
      cd "$ROOT/backend"
      nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 \
        >"$LOG_DIR/backend.log" 2>&1 &
      echo $! > "$PID_DIR/backend.pid"
    )
    if ! wait_for_url "http://127.0.0.1:8000/api/health" 60; then
      stop_spinner err "backend did not become healthy"; tail -30 "$LOG_DIR/backend.log"; exit 1
    fi
    stop_spinner ok "backend ready  ${GREY}http://127.0.0.1:8000${RESET}"
  fi

  # 4. Worker (Arq)
  start_spinner "launching background worker  ${GREY}(arq · redis queue)${RESET}"
  if pid_alive "$PID_DIR/worker.pid"; then
    stop_spinner ok "worker already running (pid $(cat "$PID_DIR/worker.pid"))"
  elif pgrep -f "arq app.queue.worker.WorkerSettings" >/dev/null 2>&1; then
    stop_spinner ok "worker already running  ${GREY}(external — not managed by start.sh)${RESET}"
  else
    (
      cd "$ROOT/backend"
      nohup python3 -m arq app.queue.worker.WorkerSettings \
        >"$LOG_DIR/worker.log" 2>&1 &
      echo $! > "$PID_DIR/worker.pid"
    )
    # Give the worker a moment to register; then check log for the "Starting worker" line.
    sleep 1
    if grep -q "Starting worker" "$LOG_DIR/worker.log" 2>/dev/null; then
      stop_spinner ok "worker ready  ${GREY}arq · run_full_pipeline${RESET}"
    else
      stop_spinner ok "worker spawned (warming up)"
    fi
  fi

  # 5. Frontend (Vite dev)
  start_spinner "launching frontend  ${GREY}(react · vite · tailwind)${RESET}"
  if pid_alive "$PID_DIR/frontend.pid"; then
    stop_spinner ok "frontend already running (pid $(cat "$PID_DIR/frontend.pid"))"
  elif lsof -ti:5173 >/dev/null 2>&1; then
    stop_spinner ok "frontend already healthy  ${GREY}(external — not managed by start.sh)${RESET}"
  else
    if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
      log "first run — installing npm deps (this takes a minute)"
      (cd "$ROOT/frontend" && npm install >"$LOG_DIR/npm.log" 2>&1) \
        || { stop_spinner err "npm install"; tail -20 "$LOG_DIR/npm.log"; exit 1; }
    fi
    (
      cd "$ROOT/frontend"
      nohup npm run dev -- --host >"$LOG_DIR/frontend.log" 2>&1 &
      echo $! > "$PID_DIR/frontend.pid"
    )
    # Vite prints the local URL once ready.
    local i=0
    while (( i < 60 )); do
      if grep -qE "Local:[[:space:]]+http" "$LOG_DIR/frontend.log" 2>/dev/null; then break; fi
      sleep 0.5
      i=$((i+1))
    done
    if (( i >= 60 )); then
      stop_spinner err "frontend did not start"; tail -30 "$LOG_DIR/frontend.log"; exit 1
    fi
    stop_spinner ok "frontend ready  ${GREY}http://localhost:5173${RESET}"
  fi

  # 6. LLM provider health
  start_spinner "verifying llm provider"
  local health
  health=$(curl -s --max-time 8 http://127.0.0.1:8000/api/health || echo '{}')
  local provider connected
  provider=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('provider','?'))" 2>/dev/null || echo "?")
  connected=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('provider_connected', False))" 2>/dev/null || echo "False")
  if [[ "$connected" == "True" ]]; then
    stop_spinner ok "llm provider live  ${GREY}${provider} · streaming + fallback armed${RESET}"
  else
    stop_spinner ok "llm provider configured  ${AMBER}(${provider} unreachable — fallback chain will engage)${RESET}"
  fi

  # 7. Open browser (after a tiny dramatic pause)
  if [[ "$open_browser" == "yes" ]]; then
    printf "\n  ${GREY}Launching browser in 1.5s…${RESET}\n"
    sleep 1.5
    local url="http://localhost:5173/?boot=1"
    case "$(uname -s)" in
      Darwin*) open "$url" ;;
      Linux*)  xdg-open "$url" >/dev/null 2>&1 || true ;;
      MINGW*|MSYS*|CYGWIN*) start "$url" ;;
    esac
  fi

  # Final summary
  cat <<EOF

  ${BOLD}${GREEN}▸ ForgeOS is live${RESET}

  ${WHITE}Frontend${RESET}   ${CYAN}http://localhost:5173${RESET}
  ${WHITE}API${RESET}        ${CYAN}http://localhost:8000${RESET}
  ${WHITE}MinIO${RESET}      ${CYAN}http://localhost:9001${RESET}  ${GREY}(forgeos / forgeospassword)${RESET}

  ${GREY}Logs   ${RESET}${DIM}${LOG_DIR}${RESET}
  ${GREY}Stop   ${RESET}${DIM}./start.sh --down${RESET}
  ${GREY}Tail   ${RESET}${DIM}./start.sh --logs${RESET}

EOF
}

# ── Down / status / logs ───────────────────────────────────────────────

cmd_down() {
  banner
  printf "  ${BOLD}Shutting ForgeOS down${RESET}\n\n"
  stop_pid frontend
  stop_pid worker
  stop_pid backend
  start_spinner "stopping infrastructure containers"
  (cd "$ROOT/deploy" && docker compose -f docker-compose.dev.yml down >>"$LOG_DIR/docker.log" 2>&1) \
    || true
  stop_spinner ok "infrastructure stopped"
  printf "\n  ${GREEN}all clean${RESET}\n\n"
}

cmd_status() {
  banner
  printf "  ${BOLD}Service status${RESET}\n\n"
  for svc in backend worker frontend; do
    if pid_alive "$PID_DIR/$svc.pid"; then
      ok "$svc  ${GREY}pid $(cat "$PID_DIR/$svc.pid")${RESET}"
    else
      err "$svc  ${GREY}not running${RESET}"
    fi
  done
  echo
  docker compose -f "$ROOT/deploy/docker-compose.dev.yml" ps 2>/dev/null || true
  echo
}

cmd_logs() {
  printf "%b\n" "${BOLD}Tailing all logs. Ctrl+C to stop.${RESET}"
  tail -F "$LOG_DIR"/*.log
}

# ── Arg dispatch ───────────────────────────────────────────────────────
ACTION="up"
OPEN="yes"
for arg in "$@"; do
  case "$arg" in
    --down)    ACTION="down" ;;
    --status)  ACTION="status" ;;
    --logs)    ACTION="logs" ;;
    --no-open) OPEN="no" ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0 ;;
    *)
      err "unknown flag: $arg"; exit 2 ;;
  esac
done

case "$ACTION" in
  up)     cmd_up "$OPEN" ;;
  down)   cmd_down ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
esac
