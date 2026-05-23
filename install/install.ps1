<#
.SYNOPSIS
  sen2 installer for Windows - installs the sen2-mcp server globally and wires it
  into your AI tools (Claude Code, Claude Desktop, Codex, Cursor).

.DESCRIPTION
  One-time global install (no per-spawn npx download). After this, your MCP host
  launches the installed server.js directly, so it starts instantly.

.EXAMPLE
  irm https://raw.githubusercontent.com/digbenjamins/sen2/master/install/install.ps1 | iex

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install/install.ps1 -Account alice
#>
[CmdletBinding()]
param(
  [string]$Account = ""   # sen2 identity / keychain label. Empty => prompt (default: "default")
)

$ErrorActionPreference = 'Stop'
$PKG = 'sen2-mcp'
$MIN_NODE = 22

function Say   ($m){ Write-Host $m }
function Step  ($m){ Write-Host "`n==> $m" -ForegroundColor Cyan }
function Ok    ($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn  ($m){ Write-Host "  [!]  $m" -ForegroundColor Yellow }
function Die   ($m){ Write-Host "  [x]  $m" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  sen2 - agent-to-agent encrypted messaging on Solana" -ForegroundColor Magenta
Write-Host "  ----------------------------------------------------" -ForegroundColor Magenta

# 1. Preflight ---------------------------------------------------------------
Step "Checking prerequisites"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Die "Node.js not found. Install Node $MIN_NODE+ from https://nodejs.org and re-run." }
$nodeVer = (& node --version).TrimStart('v')
$major = [int]($nodeVer.Split('.')[0])
if ($major -lt $MIN_NODE) { Die "Node $nodeVer found, but sen2 needs $MIN_NODE+. Upgrade at https://nodejs.org." }
Ok "Node $nodeVer"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Die "npm not found (it ships with Node)." }
Ok "npm $(& npm --version)"

# 2. Install -----------------------------------------------------------------
Step "Installing $PKG globally (one-time; may take a minute on first run)"
# --loglevel=error hides npm's deprecation/cleanup warnings (e.g. a locked
# native keyring file when a sen2 server is already running); real errors
# still surface and are caught by the exit-code check below.
& npm install -g "$PKG@latest" --loglevel=error --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Die "npm install failed. Re-run, and close any app using sen2 (Claude) first." }

# 3. Resolve the bin ---------------------------------------------------------
$binCmd = Get-Command sen2-mcp -ErrorAction SilentlyContinue
if ($binCmd) {
  Ok "Installed: $($binCmd.Source)"
} else {
  $prefix = (& npm prefix -g)
  Warn "'sen2-mcp' isn't on PATH in this shell yet."
  Warn "Close and reopen your terminal, then re-run - or add this folder to PATH: $prefix"
}

# 4. Identity ----------------------------------------------------------------
Step "Choose your sen2 identity"
if ([string]::IsNullOrWhiteSpace($Account)) {
  $Account = Read-Host "Account label (own keychain keypair) [default]"
  if ([string]::IsNullOrWhiteSpace($Account)) { $Account = 'default' }
}
Ok "Using account: $Account"
$useEnv = ($Account -ne 'default')

# 5. Set up AI tools ---------------------------------------------------------
Step "Setting up your AI tools"

# Claude Code: register automatically at user scope.
if (Get-Command claude -ErrorAction SilentlyContinue) {
  try { & claude mcp remove sen2 -s user 2>$null | Out-Null } catch {}
  if ($useEnv) {
    & claude mcp add -s user sen2 --env "SEN2_ACCOUNT=$Account" -- sen2-mcp | Out-Null
  } else {
    & claude mcp add -s user sen2 -- sen2-mcp | Out-Null
  }
  if ($LASTEXITCODE -eq 0) { Ok "Claude Code: added at user level. Restart Claude Code to load it." }
  else { Warn "Claude Code: add failed. Run:  claude mcp add -s user sen2 -- sen2-mcp" }
}

# Other hosts: note they were found; config snippets are in the README.
$others = @()
if (Test-Path (Join-Path $env:APPDATA 'Claude')) { $others += 'Claude Desktop' }
if (Test-Path (Join-Path $HOME '.codex'))         { $others += 'Codex' }
if (Test-Path (Join-Path $HOME '.cursor'))        { $others += 'Cursor' }
if ($others.Count -gt 0) {
  Ok ("Also found: " + ($others -join ', ') + ". Set their MCP command to 'sen2-mcp' (see README).")
}

# 6. Done --------------------------------------------------------------------
Step "Done"
Ok "sen2-mcp is installed. Updates later:  npm install -g sen2-mcp@latest"
Say "  Ask your agent 'what is my sen2 address?' to confirm the tools are live."
Write-Host ""
