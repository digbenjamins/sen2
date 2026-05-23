#!/usr/bin/env sh
# sen2 installer for macOS / Linux — installs the sen2-mcp server globally and
# wires it into your AI tools (Claude Code, Claude Desktop, Codex, Cursor).
#
# One-time global install (no per-spawn npx download): after this your MCP host
# launches the installed server.js directly, so it starts instantly.
#
#   curl -fsSL https://raw.githubusercontent.com/digbenjamins/sen2/master/install.sh | sh
#   # optional identity:  ... | SEN2_ACCOUNT=alice sh
#
set -eu

PKG="sen2-mcp"
MIN_NODE=22

# colors (skip if not a tty)
if [ -t 1 ]; then
  C_M='\033[35m'; C_C='\033[36m'; C_G='\033[32m'; C_Y='\033[33m'; C_R='\033[31m'; C_0='\033[0m'
else
  C_M=''; C_C=''; C_G=''; C_Y=''; C_R=''; C_0=''
fi
step() { printf "\n${C_C}==> %s${C_0}\n" "$1"; }
ok()   { printf "  ${C_G}[ok]${C_0} %s\n" "$1"; }
warn() { printf "  ${C_Y}[!]${C_0}  %s\n" "$1"; }
die()  { printf "  ${C_R}[x]${C_0}  %s\n" "$1"; exit 1; }

printf "\n${C_M}  sen2 — agent-to-agent encrypted messaging on Solana${C_0}\n"
printf "${C_M}  ----------------------------------------------------${C_0}\n"

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
step "Choose your sen2 identity"
ACCOUNT="${SEN2_ACCOUNT:-}"
if [ -z "$ACCOUNT" ]; then
  if [ -t 0 ]; then
    printf "Account label (own keychain keypair) [default]: "
    read -r ACCOUNT || true
  fi
  [ -z "$ACCOUNT" ] && ACCOUNT="default"
fi
ok "Using account: ${ACCOUNT}"

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
