#!/usr/bin/env bash
# ForgeOS stop / teardown script. Escalating levels of nuke:
#
#   ./stop.sh           # graceful: stop services + containers, keep all data
#   ./stop.sh --wipe    # + delete docker volumes (DB + MinIO data)
#   ./stop.sh --purge   # + delete projects/, .forgeos/previews/, .boot/, forgeos_settings.json
#   ./stop.sh --all     # ☠ full nuke: --purge + remove deploy/.env (loses API keys!)
#
# Optional:
#   --yes               skip the "are you sure?" prompt for destructive ops

set -u
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_DIR="$ROOT/.boot/logs"
PID_DIR="$ROOT/.boot/pids"

# ── ANSI palette ───────────────────────────────────────────────────────
ESC=$'\033'
RESET="${ESC}[0m"
BOLD="${ESC}[1m"
DIM="${ESC}[2m"
RED="${ESC}[31m"
GREEN="${ESC}[32m"
YELLOW="${ESC}[33m"
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

# ── helpers ─────────────────────────────────────────────────────────────
log()  { printf "  %b %s\n" "${GREY}·${RESET}"  "$*"; }
ok()   { printf "  %b %s\n" "${GREEN}✓${RESET}" "$*"; }
warn() { printf "  %b %s\n" "${AMBER}!${RESET}" "$*"; }
err()  { printf "  %b %s\n" "${RED}✗${RESET}"   "$*"; }
hdr()  { printf "\n  ${BOLD}${WHITE}%s${RESET}\n\n" "$*"; }

SPIN_FRAMES=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
spinner_pid=""
start_spinner() {
  local label="$1"; local color="${2:-${ROSE}}"
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

pid_alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_pid() {
  local name="$1" file="$PID_DIR/$1.pid"
  if pid_alive "$file"; then
    local pid; pid=$(cat "$file")
    kill "$pid" 2>/dev/null || true
    sleep 0.4
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$file"
    ok "stopped ${name} ${GREY}(pid ${pid})${RESET}"
  fi
}

confirm() {
  local prompt="$1"
  if [[ "$AUTO_YES" == "yes" ]]; then return 0; fi
  printf "  ${AMBER}? ${WHITE}%s${RESET} ${GREY}[y/N]${RESET} " "$prompt"
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

banner() {
  printf "%s" "${HIDE_CUR}"
  clear
  cat <<EOF

${ROSE}    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗ ██████╗ ███████╗${RESET}
${ROSE}    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██╔════╝${RESET}
${AMBER}    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ██║   ██║███████╗${RESET}
${AMBER}    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ██║   ██║╚════██║${RESET}
${RED}    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗╚██████╔╝███████║${RESET}
${RED}    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝${RESET}

      ${BOLD}${WHITE}ForgeOS${RESET}${GREY} · shutdown protocol${RESET}
      ${GREY}level: ${LEVEL_LABEL}${RESET}

EOF
}

# ── parse args ──────────────────────────────────────────────────────────
LEVEL="graceful"
AUTO_YES="no"
LEVEL_LABEL="graceful · keeps data"

for arg in "$@"; do
  case "$arg" in
    --wipe)
      LEVEL="wipe"; LEVEL_LABEL="${AMBER}wipe${RESET}${GREY} · removes db + minio data${RESET}" ;;
    --purge)
      LEVEL="purge"; LEVEL_LABEL="${ROSE}purge${RESET}${GREY} · removes all generated state${RESET}" ;;
    --all)
      LEVEL="all"; LEVEL_LABEL="${RED}NUCLEAR${RESET}${GREY} · removes API keys too${RESET}" ;;
    --yes|-y)
      AUTO_YES="yes" ;;
    -h|--help)
      sed -n '2,11p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)
      err "unknown flag: $arg  (try --help)"; exit 2 ;;
  esac
done

banner

# ── 1. stop processes by pidfile ────────────────────────────────────────
hdr "1. Stopping managed services"
stop_pid frontend
stop_pid worker
stop_pid backend

# ── 2. kill strays (in case they were started outside start.sh) ─────────
hdr "2. Killing stray processes"
start_spinner "scanning for stray uvicorn/arq/vite/preview processes"
strays_killed=0
for pattern in "uvicorn app.main:app" "arq app.queue.worker" "node.*vite" "npx.*vite"; do
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    pkill -f "$pattern" 2>/dev/null
    strays_killed=$((strays_killed+1))
  fi
done
sleep 1
stop_spinner ok "stray processes cleaned (${strays_killed} pattern matches)"

# Verify ports are free.
for p in 8000 5173 5300 5301 5302 5303 5304; do
  pid=$(lsof -ti:$p 2>/dev/null) || pid=""
  if [[ -n "$pid" ]]; then
    warn "port $p still bound (pid $pid) — force-killing"
    kill -9 "$pid" 2>/dev/null
  fi
done

# ── 3. stop docker containers ───────────────────────────────────────────
hdr "3. Stopping docker containers"
start_spinner "docker compose down"
(cd "$ROOT/deploy" && docker compose -f docker-compose.dev.yml down >>"$LOG_DIR/docker.log" 2>&1) || true
stop_spinner ok "infrastructure containers stopped"

# ── 4. (--wipe) remove docker volumes ───────────────────────────────────
if [[ "$LEVEL" == "wipe" || "$LEVEL" == "purge" || "$LEVEL" == "all" ]]; then
  hdr "4. Removing docker volumes  ${GREY}(database + minio data)${RESET}"
  if ! confirm "Delete deploy_pgdata-dev and deploy_minio-dev volumes? this destroys all demands + artifacts"; then
    warn "skipped volume removal"
  else
    start_spinner "docker volume rm"
    docker volume rm deploy_pgdata-dev deploy_minio-dev >/dev/null 2>&1 || true
    stop_spinner ok "volumes deleted  ${GREY}deploy_pgdata-dev · deploy_minio-dev${RESET}"
  fi
fi

# ── 5. (--purge) remove local generated state ───────────────────────────
if [[ "$LEVEL" == "purge" || "$LEVEL" == "all" ]]; then
  hdr "5. Removing local generated state"
  if ! confirm "Delete .boot/, projects/, .forgeos/previews/, forgeos_settings.json?"; then
    warn "skipped local state removal"
  else
    rm -rf "$ROOT/.boot" "$ROOT/projects" "$ROOT/.forgeos/previews" "$ROOT/forgeos_settings.json"
    ok "removed .boot, projects, .forgeos/previews, forgeos_settings.json"
  fi
fi

# ── 6. (--all) wipe API key envfile ─────────────────────────────────────
if [[ "$LEVEL" == "all" ]]; then
  hdr "6. ${RED}Removing deploy/.env  ${GREY}(API keys will need to be re-entered!)${RESET}"
  if ! confirm "Really delete deploy/.env? you will lose your NIM, Groq, OpenRouter keys"; then
    warn "kept deploy/.env"
  else
    rm -f "$ROOT/deploy/.env"
    ok "removed deploy/.env"
  fi
fi

# ── Final report ────────────────────────────────────────────────────────
echo
case "$LEVEL" in
  graceful) printf "  ${GREEN}▸ ForgeOS stopped${RESET}  ${GREY}data preserved, ready to ${WHITE}./start.sh${GREY} again${RESET}\n" ;;
  wipe)     printf "  ${AMBER}▸ ForgeOS wiped${RESET}  ${GREY}volumes gone, settings.json + .env kept${RESET}\n" ;;
  purge)    printf "  ${ROSE}▸ ForgeOS purged${RESET}  ${GREY}only ${WHITE}deploy/.env${GREY} survives${RESET}\n" ;;
  all)      printf "  ${RED}▸ ForgeOS obliterated${RESET}  ${GREY}you will need to re-enter API keys on next boot${RESET}\n" ;;
esac
echo
