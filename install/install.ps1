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
  [string]$Account = "",  # sen2 identity / keychain label. Empty => prompt (default: "default")
  [string]$Cluster = ""   # devnet | mainnet. Empty => prompt (default: devnet). Or set $env:SEN2_CLUSTER.
)

$ErrorActionPreference = 'Stop'
$PKG = 'sen2-mcp'
$MIN_NODE = 22

# UTF-8 so the box-drawing characters render in the console.
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new() } catch {}

function Say   ($m){ Write-Host $m }
function Step  ($m){ Write-Host ""; Write-Host "==> " -ForegroundColor Magenta -NoNewline; Write-Host $m }
function Ok    ($m){ Write-Host "  " -NoNewline; Write-Host "OK" -ForegroundColor Green  -NoNewline; Write-Host " $m" }
function Warn  ($m){ Write-Host "  " -NoNewline; Write-Host "!"  -ForegroundColor Yellow -NoNewline; Write-Host "  $m" }
function Die   ($m){ Write-Host "  " -NoNewline; Write-Host "x"  -ForegroundColor Red    -NoNewline; Write-Host "  $m"; exit 1 }

# Fixed-width boxes. Magenta border (≈violet), Green text (≈mint).
$BOXW = 56
function Rule  ([int]$n){ '─' * $n }
function BoxTop(){ Write-Host ("  ╭" + (Rule ($BOXW + 2)) + "╮") -ForegroundColor Magenta }
function BoxBot(){ Write-Host ("  ╰" + (Rule ($BOXW + 2)) + "╯") -ForegroundColor Magenta }
function BoxLine([string]$text, [string]$color = 'Gray'){
  Write-Host "  │ " -ForegroundColor Magenta -NoNewline
  Write-Host $text.PadRight($BOXW) -ForegroundColor $color -NoNewline
  Write-Host " │" -ForegroundColor Magenta
}

Write-Host ""
BoxTop
BoxLine "sen2" Green
BoxLine "agent-to-agent encrypted messaging on Solana" DarkGray
BoxBot

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

# 4b. Network (cluster) ------------------------------------------------------
# Default devnet (free, for testing). Pick 2 for mainnet (real SOL). Pass
# -Cluster or set $env:SEN2_CLUSTER to skip the prompt for unattended installs.
Step "Choose your network"
if ([string]::IsNullOrWhiteSpace($Cluster)) { $Cluster = $env:SEN2_CLUSTER }
if ([string]::IsNullOrWhiteSpace($Cluster)) {
  BoxTop
  BoxLine "> 1  devnet   free test network (default)" Green
  BoxLine "  2  mainnet  real SOL, real network fees" Yellow
  BoxBot
  $sel = Read-Host "  Select [1]"
  if ($sel -eq '2') { $Cluster = 'mainnet' } else { $Cluster = 'devnet' }
}
switch -Regex ($Cluster) {
  '^(2|mainnet|mainnet-beta)$' { $Cluster = 'mainnet' }
  '^(1|devnet)$'               { $Cluster = 'devnet' }
  default { Warn "Unknown cluster '$Cluster'; using devnet."; $Cluster = 'devnet' }
}
if (Get-Command sen2 -ErrorAction SilentlyContinue) {
  & sen2 cluster $Cluster *> $null
  if ($LASTEXITCODE -eq 0) { Ok "Network: $Cluster" }
  else { Warn "Couldn't save the network. Set it later:  sen2 cluster $Cluster" }
} else {
  Warn "Network: $Cluster - run 'sen2 cluster $Cluster' once 'sen2' is on PATH."
}
if ($Cluster -eq 'mainnet') { Warn "Mainnet uses real SOL - fund your address before sending." }

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
