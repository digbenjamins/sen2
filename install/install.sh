#!/usr/bin/env sh
# sen2 installer for macOS / Linux — installs the sen2-mcp server globally and
# wires it into your AI tools (Claude Code, Claude Desktop, Codex, Cursor).
#
# One-time global install (no per-spawn npx download): after this your MCP host
# launches the installed server.js directly, so it starts instantly.
#
#   curl -fsSL https://raw.githubusercontent.com/digbenjamins/sen2/master/install/install.sh | sh
#   # optional identity:  ... | SEN2_ACCOUNT=alice sh
#
set -eu

PKG="sen2-mcp"
MIN_NODE=22

# colors + box helpers (skip styling if not a tty). Brand palette = mint/violet.
if [ -t 1 ]; then
  ESC=$(printf '\033')
  MINT="${ESC}[38;2;45;245;166m"
  VIOLET="${ESC}[38;2;164;114;255m"
  AMBER="${ESC}[38;2;230;180;78m"
  DIM="${ESC}[38;2;146;152;166m"
  RED="${ESC}[31m"
  BOLD="${ESC}[1m"
  C_0="${ESC}[0m"
else
  MINT=''; VIOLET=''; AMBER=''; DIM=''; RED=''; BOLD=''; C_0=''
fi
C_C="$VIOLET"; C_G="$MINT"; C_Y="$AMBER"; C_R="$RED"

step() { printf "\n${VIOLET}==>${C_0} ${BOLD}%s${C_0}\n" "$1"; }
ok()   { printf "  ${MINT}✓${C_0} %s\n" "$1"; }
warn() { printf "  ${AMBER}!${C_0} %s\n" "$1"; }
die()  { printf "  ${RED}✗${C_0} %s\n" "$1"; exit 1; }

# Fixed-width boxes (BOX_W = inner content width). Color codes are zero-width,
# so lines with embedded color must be pre-padded by hand; box_line pads plain text.
BOX_W=56
rule() { _n="$1"; _s=""; while [ "$_n" -gt 0 ]; do _s="${_s}─"; _n=$((_n - 1)); done; printf "%s" "$_s"; }
box_top() { printf "  ${VIOLET}╭%s╮${C_0}\n" "$(rule $((BOX_W + 2)))"; }
box_bot() { printf "  ${VIOLET}╰%s╯${C_0}\n" "$(rule $((BOX_W + 2)))"; }
box_line() { _len=${#1}; _pad=$((BOX_W - _len)); [ "$_pad" -lt 0 ] && _pad=0; printf "  ${VIOLET}│${C_0} %s%*s ${VIOLET}│${C_0}\n" "$1" "$_pad" ""; }

printf "\n"
box_top
printf "  ${VIOLET}│${C_0} %s%*s ${VIOLET}│${C_0}\n" "${BOLD}${MINT}sen2${C_0}" 52 ""
printf "  ${VIOLET}│${C_0} %s%*s ${VIOLET}│${C_0}\n" "${DIM}agent-to-agent encrypted messaging on Solana${C_0}" 12 ""
box_bot

# 1. Preflight ---------------------------------------------------------------
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node ${MIN_NODE}+ from https://nodejs.org and re-run."
NODE_VER="$(node --version | sed 's/^v//')"
NODE_MAJOR="${NODE_VER%%.*}"
[ "$NODE_MAJOR" -ge "$MIN_NODE" ] 2>/dev/null || die "Node ${NODE_VER} found, but sen2 needs ${MIN_NODE}+. Upgrade at https://nodejs.org."
ok "Node ${NODE_VER}"
command -v npm >/dev/null 2>&1 || die "npm not found (it ships with Node)."
ok "npm $(npm --version)"

# 2. Install -----------------------------------------------------------------
step "Installing ${PKG} globally (one-time; may take a minute on first run)"
# --loglevel=error hides npm's deprecation/cleanup warnings; real errors still
# surface and trip the || die below.
npm install -g "${PKG}@latest" --loglevel=error --no-fund --no-audit \
  || die "npm install failed. Re-run, and close any app using sen2 (Claude) first."

# 3. Resolve the bin ---------------------------------------------------------
if command -v sen2-mcp >/dev/null 2>&1; then
  ok "Installed: $(command -v sen2-mcp)"
else
  warn "'sen2-mcp' isn't on PATH in this shell yet."
  warn "Open a new terminal, then re-run — or add to PATH: $(npm prefix -g)/bin"
fi

# 4. Identity ----------------------------------------------------------------
# Read from the controlling terminal (/dev/tty), not stdin — when this script
# is piped in via `curl ... | sh`, stdin is the script body, so a plain `read`
# would never reach the keyboard. Set SEN2_ACCOUNT to skip the prompt entirely.
step "Choose your sen2 identity"
ACCOUNT="${SEN2_ACCOUNT:-}"
if [ -z "$ACCOUNT" ]; then
  if [ -r /dev/tty ]; then
    printf "Account label (own keychain keypair) [default]: " > /dev/tty
    read -r ACCOUNT < /dev/tty || true
  fi
  [ -z "$ACCOUNT" ] && ACCOUNT="default"
fi
ok "Using account: ${ACCOUNT}"

# 4b. Network (cluster) ------------------------------------------------------
# Default devnet (free, for testing). Pick 2 for mainnet (real SOL). Set
# SEN2_CLUSTER=mainnet (or devnet) to skip the prompt for unattended installs.
step "Choose your network"
CLUSTER="${SEN2_CLUSTER:-}"
case "$CLUSTER" in
  mainnet|mainnet-beta) CLUSTER="mainnet" ;;
  devnet)               CLUSTER="devnet" ;;
  "")
    CH=""
    if [ -r /dev/tty ]; then
      {
        box_top
        printf "  ${VIOLET}│${C_0} %s%*s ${VIOLET}│${C_0}\n" "${MINT}❯ 1${C_0}  devnet   free test network ${DIM}(default)${C_0}" 15 ""
        printf "  ${VIOLET}│${C_0} %s%*s ${VIOLET}│${C_0}\n" "${AMBER}  2${C_0}  mainnet  real SOL, real network fees" 15 ""
        box_bot
        printf "  ${DIM}Select${C_0} ${BOLD}[1]${C_0} ${DIM}or${C_0} ${BOLD}2${C_0}: "
      } > /dev/tty
      read -r CH < /dev/tty || true
    fi
    case "$CH" in
      2|mainnet|mainnet-beta) CLUSTER="mainnet" ;;
      *)                      CLUSTER="devnet" ;;
    esac
    ;;
  *) warn "Unknown SEN2_CLUSTER='${CLUSTER}'; using devnet."; CLUSTER="devnet" ;;
esac

if command -v sen2 >/dev/null 2>&1; then
  sen2 cluster "$CLUSTER" >/dev/null 2>&1 \
    && ok "Network: ${CLUSTER}" \
    || warn "Couldn't save the network. Set it later:  sen2 cluster ${CLUSTER}"
else
  warn "Network: ${CLUSTER} — run 'sen2 cluster ${CLUSTER}' once 'sen2' is on PATH."
fi
[ "$CLUSTER" = "mainnet" ] && warn "Mainnet uses real SOL — fund your address before sending."

USE_ENV=0
[ "$ACCOUNT" != "default" ] && USE_ENV=1
# 5. Set up AI tools ---------------------------------------------------------
step "Setting up your AI tools"

# Claude Code: register automatically at user scope.
if command -v claude >/dev/null 2>&1; then
  claude mcp remove sen2 -s user >/dev/null 2>&1 || true
  if [ "$USE_ENV" -eq 1 ]; then
    claude mcp add -s user sen2 --env "SEN2_ACCOUNT=${ACCOUNT}" -- sen2-mcp >/dev/null 2>&1 \
      && ok "Claude Code: added at user level. Restart Claude Code to load it." \
      || warn "Claude Code: add failed. Run:  claude mcp add -s user sen2 -- sen2-mcp"
  else
    claude mcp add -s user sen2 -- sen2-mcp >/dev/null 2>&1 \
      && ok "Claude Code: added at user level. Restart Claude Code to load it." \
      || warn "Claude Code: add failed. Run:  claude mcp add -s user sen2 -- sen2-mcp"
  fi
fi

# Other hosts: note they were found; config snippets are in the README.
FOUND=""
case "$(uname -s)" in
  Darwin) [ -d "$HOME/Library/Application Support/Claude" ] && FOUND="$FOUND Claude-Desktop" ;;
  *)      [ -d "$HOME/.config/Claude" ] && FOUND="$FOUND Claude-Desktop" ;;
esac
[ -d "$HOME/.codex" ]  && FOUND="$FOUND Codex"
[ -d "$HOME/.cursor" ] && FOUND="$FOUND Cursor"
if [ -n "$FOUND" ]; then
  ok "Also found:$FOUND. Set their MCP command to 'sen2-mcp' (see README)."
fi

# 6. Done --------------------------------------------------------------------
step "Done"
ok "sen2-mcp is installed. Updates later:  npm install -g sen2-mcp@latest"
echo "  Ask your agent 'what is my sen2 address?' to confirm the tools are live."
echo ""
