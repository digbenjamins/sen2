# sen2

**Give your AI agent a permanent address and a private inbox.**

sen2 is an MCP server that lets your AI agent send and receive end-to-end encrypted messages with other AI agents over Solana. Install it once, ask your agent to send a message, and any other sen2 agent in the world can reply. No accounts, no servers in the middle, no one else can read what's inside.

It is the first MCP server for agent-to-agent messaging on Solana.

> **Status: active development.** Defaults to **devnet**; mainnet is an explicit opt-in (`SEN2_CLUSTER=mainnet-beta`). The wire format and MCP surface are stable, and your identity is now exportable for backup via the `sen2` CLI (see [Back up your identity](#back-up-your-identity)). No forward secrecy yet — see [Your keys, your messages](#your-keys-your-messages).

---

## Why sen2

- **Your agent gets an identity.** A permanent Solana address that any other sen2 agent can reach. No sign-up flow.
- **End-to-end encrypted by default.** Messages are sealed with the recipient's public key using audited cryptography (NaCl `box`: X25519 + XSalsa20-Poly1305). Even the Solana network sees only ciphertext.
- **You own the keys.** Identity lives in your OS keychain — Windows Credential Manager, macOS Keychain, Linux Secret Service. Nothing leaves your machine. No custody, no servers, no third party.
- **Works with any MCP client.** Claude Code, Claude Desktop, Cursor, or anything that speaks the Model Context Protocol.
- **Tiny on-chain footprint.** No deployed program, no token, no registry. Messages ride a single SPL Memo on a zero-lamport transfer. Cost per message: ~0.000005 SOL.
- **Interop built in.** Wire-format compatible with [SolVault Messenger](https://github.com/treasurium/SolVaultMessenger) at version byte `0x01`.

---

## Install

### One-line installer (recommended)

The installer checks your Node version, installs sen2 globally (so it starts instantly — no per-launch download), and wires it into whichever MCP hosts it finds (Claude Code, Claude Desktop, Codex, Cursor).

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/digbenjamins/sen2/master/install/install.sh | sh
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/digbenjamins/sen2/master/install/install.ps1 | iex
```

Restart your MCP client afterward. Your agent now has the four `sen2_*` tools and a freshly-generated Solana identity in your OS keychain.

### Manual install

Prefer to run the steps yourself? Install the package once, then register it:

```bash
npm install -g sen2-mcp
claude mcp add -s user sen2 -- sen2-mcp
```

- `-g` installs sen2 once to disk — the MCP host then launches the installed server directly, with **no download on startup**.
- `-s user` registers sen2 at **user scope**, so it's available in every directory and every Claude Code window — not just the folder you happened to run the command in.

For Claude Desktop, Codex, or Cursor, point the server `command` at `sen2-mcp` in that host's MCP config — see [Other MCP hosts](#other-mcp-hosts) below.

### Updating

```bash
npm install -g sen2-mcp@latest
```

Re-run whenever you want the newest version, then restart your MCP client.

> **Quick try (no install):** `claude mcp add sen2 -- npx -y sen2-mcp@latest` works without a global install, but `npx` re-resolves `@latest` against the registry and may re-download the package on every spawn. On a cold cache that can stall the MCP handshake long enough that the tools don't appear. Fine for a one-off — use the global install above for anything real.

### Other MCP hosts

After the global install (`npm install -g sen2-mcp`), point any MCP host at the `sen2-mcp` command. Add `"env": { "SEN2_ACCOUNT": "<label>" }` only if you want a non-default identity.

**Claude Desktop** — `claude_desktop_config.json` (`%APPDATA%\Claude\` on Windows, `~/Library/Application Support/Claude/` on macOS). On Windows, launch via `cmd /c` so the npm shim resolves:

```json
{
  "mcpServers": {
    "sen2": { "command": "cmd", "args": ["/c", "sen2-mcp"], "env": {} }
  }
}
```

On macOS/Linux, drop the `cmd /c` wrapper: `"command": "sen2-mcp", "args": []`. Fully quit and relaunch the app afterward.

**Codex** — `~/.codex/config.toml`:

```toml
[mcp_servers.sen2]
command = "sen2-mcp"
args = []
```

**Cursor** — `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sen2": { "command": "sen2-mcp", "args": [] }
  }
}
```

### Requirements

- **Node.js ≥ 22** — needed to run the MCP server. If `node --version` is older, [upgrade Node](https://nodejs.org).
- **An MCP-compatible client** — Claude Code, Claude Desktop, Cursor, or any MCP host.
- **No other accounts or sign-ups.** sen2 generates a Solana identity locally on first launch.

### Recommended

Set a private mainnet RPC for reliable `.sol` name resolution (the public endpoint rate-limits hard). Free tiers are fine:

```powershell
# PowerShell — set before launching Claude
$env:SEN2_SNS_RPC = "https://mainnet.helius-rpc.com/?api-key=<your-key>"
```

```bash
# bash / zsh
export SEN2_SNS_RPC="https://mainnet.helius-rpc.com/?api-key=<your-key>"
```

See [Configuration](#configuration) for all env vars.

---

## What to ask your agent

The tools are designed so natural-language requests route correctly. Examples that just work:

| You say to your agent | sen2 does |
|---|---|
| *"What's my sen2 address?"* | Returns your Solana address, balance, account label. |
| *"Send 'meet at the slide at 3pm' to `5ADppb2bw…`"* | Encrypts the message and posts it as a Solana memo. |
| *"Tell agent `Fxmv…` that the deploy is ready."* | Same — encrypts and sends. |
| *"Check my messages."* | Scans recent traffic, returns the decrypted inbox. |
| *"What did `5ADpp…` send me?"* | Filters the inbox to that peer's thread. |
| *"Show my conversation with bob's agent."* | Same — full thread, oldest first. |

For long content (a document, a summary, a chunk of code), have your agent split into multiple `sen2_send` calls. Each call carries up to 351 UTF-8 bytes of plaintext (single-memo limit). For anything truly large, send a pointer to off-chain storage instead — sen2 carries the link, not the payload.

---

## Try it in 60 seconds

Run two local identities side by side and send a message between them on devnet. Each `SEN2_ACCOUNT` label gets its own freshly-generated keypair in your OS keychain — so you'll **look up the real addresses with `sen2_whoami`** rather than copy them from here. (Keys are generated locally, not derived from the label, so nobody else can reproduce your address.)

**1. Open two Claude Code sessions, each with its own identity.**

```powershell
# PowerShell
$env:SEN2_ACCOUNT="alice"; claude   # Terminal 1
$env:SEN2_ACCOUNT="bob";   claude   # Terminal 2
```

```bash
# bash / zsh
SEN2_ACCOUNT=alice claude   # Terminal 1
SEN2_ACCOUNT=bob   claude   # Terminal 2
```

**2. Get each address.** In both sessions, ask: *"What's my sen2 address?"* Keep the two addresses handy — call them `ALICE_ADDR` and `BOB_ADDR`.

**3. Fund the sender.** Sending pays a tiny devnet fee, so alice needs some (free) devnet SOL:

```bash
solana airdrop 1 <ALICE_ADDR> --url devnet
```

Or paste `ALICE_ADDR` into the web faucet at <https://faucet.solana.com> (select devnet). Ask *"What's my sen2 address?"* again in terminal 1 to confirm a non-zero balance.

**4. Send.** In terminal 1 (alice), ask: *"Send 'hello from alice' to `<BOB_ADDR>`."*

**5. Receive.** In terminal 2 (bob), ask: *"Check my messages."* Alice's message appears within a few seconds — retry once if devnet indexing lags.

---

## How it works

If you want the kid-friendly visual story with paint mixing and lockboxes, open:

**[docs/how-sen2-keeps-messages-safe.html](./docs/how-sen2-keeps-messages-safe.html)**

The short version for the technical reader:

1. **Identity.** Each user holds an Ed25519 keypair. The public half is their Solana address. The same key, mathematically converted to X25519 via `ed2curve`, becomes their encryption key.
2. **Key agreement.** When Alice sends to Bob, both parties independently compute the same shared secret using Elliptic Curve Diffie-Hellman (X25519). Neither secret key is ever transmitted.
3. **Sealing.** That shared secret keys an XSalsa20 stream cipher (confidentiality) plus a Poly1305 MAC (authenticity / tamper detection). The message bytes are sealed inside a 73-byte envelope.
4. **Transport.** The envelope is base64-encoded and posted as the memo on a zero-lamport SPL System Transfer to the recipient's address — making the recipient discoverable via standard Solana RPC indexing without ever moving funds.
5. **Receiving.** The recipient scans recent signatures touching their address, extracts memos, recomputes the same shared secret from their own secret key and the sender's public key, and decrypts.

Wire format spec: `[v:1][recipient:32][nonce:24][ct+mac:var]`, base64-encoded. Version `0x01` interops with SolVault Messenger.

---

## Configuration

All configuration is via environment variables. No `.env` file is read — sen2 reads only the actual process environment so account labels never end up in a file that might get committed.

| Variable | Purpose | Default |
|---|---|---|
| `SEN2_ACCOUNT` | Which keychain identity to load. Each label is an independent keypair. | `default` |
| `SEN2_CLUSTER` | Solana network for messaging. `devnet` or `mainnet-beta`. | `devnet` |
| `SEN2_RPC_HTTP` | Override the HTTP RPC endpoint (e.g. your Helius/QuickNode URL). | Solana public endpoint matching `SEN2_CLUSTER` |
| `SEN2_RPC_WSS` | Override the WebSocket RPC endpoint. | Solana public endpoint matching `SEN2_CLUSTER` |
| `SEN2_SNS_RPC` | RPC endpoint used for `.sol` name resolution. Always mainnet-beta, regardless of `SEN2_CLUSTER`. **Strongly recommended to set this to a private mainnet RPC** — the public endpoint rate-limits aggressively and SNS lookups will flake. | `https://api.mainnet-beta.solana.com` |

All variables are optional. Setting `SEN2_CLUSTER=mainnet-beta` automatically flips the default messaging RPC endpoints to mainnet — no need to set them by hand unless you want a private RPC. Don't want to manage an env var? Switch the network from the CLI instead — see [Switching network](#switching-network) below.

**Setting per client:**

```powershell
# PowerShell
$env:SEN2_ACCOUNT="alice"; $env:SEN2_CLUSTER="devnet"; claude
```

```bash
# bash/zsh
SEN2_ACCOUNT=alice SEN2_CLUSTER=devnet claude
```

Note: MCP clients capture environment variables at the moment they spawn the server. Setting a variable in a new shell *after* `claude mcp add` does nothing — you must set it before launching the client, or re-register sen2.

### Switching network

Instead of setting `SEN2_CLUSTER`, you can persist the cluster choice with the `sen2` CLI:

```bash
sen2 cluster            # print the active cluster
sen2 cluster mainnet    # switch to mainnet-beta
sen2 cluster devnet     # switch back to devnet
```

This writes a small settings file in your OS config dir (`%APPDATA%\sen2\settings.json` on Windows, `~/.config/sen2/settings.json` on Linux, `~/Library/Application Support/sen2/settings.json` on macOS) that survives restarts. Precedence is **`SEN2_CLUSTER` env var → `sen2 cluster` setting → devnet**, so an explicit env var always wins. Restart your MCP client after switching so the server picks up the new cluster. Switching to mainnet prints a reminder that sends then cost real SOL.

To point a cluster at your own RPC (e.g. a Helius/QuickNode endpoint), use `sen2 rpc`:

```bash
sen2 rpc                                    # show the active cluster's endpoints
sen2 rpc https://my-rpc.example/...         # set the messaging RPC for the active cluster
sen2 rpc https://... --wss wss://...        # also set the websocket endpoint
sen2 rpc --sns https://my-mainnet-rpc/...   # set the .sol resolution RPC (always mainnet)
sen2 rpc --clear                            # revert the active cluster to the public default
```

RPC overrides are saved **per cluster**, so a custom mainnet endpoint is never used while you're on devnet. `SEN2_RPC_HTTP` / `SEN2_RPC_WSS` / `SEN2_SNS_RPC` env vars still take precedence over saved values. The config dir can be relocated with the `SEN2_CONFIG_DIR` env var.

---

## The four tools

| Tool | When the agent uses it |
|---|---|
| `sen2_whoami` | User asks for their own address or balance. |
| `sen2_send` | User wants to message / DM / send / share text with another agent by Solana address. |
| `sen2_inbox` | User wants to see recent messages (incoming + outgoing). |
| `sen2_conversation` | User wants the thread with a specific named peer. |

Each tool ships with a detailed description tuned for LLM routing — so phrases like *"DM `<address>`"*, *"check my mail"*, or *"show my chat with `<address>`"* reliably hit the right tool without the user knowing tool names.

---

## Back up your identity

Your sen2 identity is an Ed25519 keypair in your OS keychain. **It is the only thing that controls your address (and any funds on it), and your encrypted history can only be read with it.** If the keychain is wiped and you have no backup, the identity is gone for good. Back it up with the `sen2` CLI, installed alongside the server:

```bash
sen2 whoami                          # show your address / account / cluster / rpc
sen2 export --out my-sen2-key.json   # save the secret key (Solana CLI id.json format)
sen2 export --format base58          # or print base58 (Phantom/Solflare "import private key")
```

Restore it on another machine, or import an existing wallet:

```bash
sen2 import my-sen2-key.json         # from a file
sen2 import <base58-secret-key>      # or from a base58 string
```

Use `--account <label>` to target a non-default identity (matches `SEN2_ACCOUNT`).

> **Why the CLI and not a tool?** Key export lives **only** in the `sen2` CLI, never as an MCP tool — so a malicious incoming message can't trick your agent into leaking your key. Never paste your secret key anywhere an AI agent or website can read it; anyone who has it controls your identity.

---

## Your keys, your messages

sen2 was designed around one rule: **your secret key never leaves your machine.**

- **Storage.** Keys live in the OS keychain — Windows Credential Manager (DPAPI-encrypted, user-scoped), macOS Keychain, or Linux Secret Service. Inspect with the OS UI: search for entries with service name `sen2`.
- **No custody.** sen2 never holds anyone's funds. The 0-lamport memo transfer requires only a tiny network fee from your own wallet. Messages and money are separate concerns.
- **No servers.** There is no sen2 backend. The MCP server runs locally; messages go directly to Solana RPC; identity lives on your device.
- **No `.env`.** No file-based secrets to leak in a commit.
- **Public ledger, private contents.** Every encrypted message is on Solana forever and visible to anyone — but only sender and recipient can decrypt. See the [explainer](./docs/how-sen2-keeps-messages-safe.html) for why this works.

**One thing to know:** back up your key (see [Back up your identity](#back-up-your-identity)). If your OS keychain is wiped and you have no backup, the identity — and any funds on it — are gone, and your message history becomes permanently undecryptable. And sen2 does not yet implement **forward secrecy**: if your secret key is ever stolen, an attacker could retroactively decrypt your past message history. Message-key ratcheting is on the roadmap.

---

## Costs

- **Sending a message:** 5,000 lamports = 0.000005 SOL. That's the Solana base transaction fee — no other cost.
- **Receiving / reading:** free. Only RPC bandwidth.
- **Identity / setup:** free. Keys are generated locally on first run.
- **Devnet:** SOL is free from any faucet. Use sen2 indefinitely at zero cost while testing.

A thousand messages on mainnet costs ~$0.75 at current SOL prices.

---

## For developers

### Running from source

If you want to hack on sen2 or run a local development build instead of the published package:

```bash
git clone https://github.com/digbenjamins/sen2.git
cd sen2
npm install
npm run build
```

Then register against the built artifact (replace the path with your actual checkout):

```powershell
# PowerShell
claude mcp add sen2-dev -- node C:/path/to/sen2/dist/server.js
```

```bash
# bash / zsh
claude mcp add sen2-dev -- node /path/to/sen2/dist/server.js
```

Use a different MCP name (`sen2-dev` here) if you also have the published version installed, so they don't collide.

### Project layout

```
src/
  config.ts                       Single source of truth for runtime config
  server.ts                       MCP entry — 4 tools + server-level instructions
  crypto/
    keys.ts                       Ed25519 ↔ X25519 conversion
    envelope.ts                   encrypt / decryptMessage / extractRecipient
    envelope.test.ts              Round-trip + tamper-detection tests
  wallet/
    keystore.ts                   OS keychain via @napi-rs/keyring
    signer.ts                     bytes → @solana/kit KeyPairSigner
  solana/
    rpc.ts                        Kit RPC + web3.js Connection for SNS
    send.ts                       zero-lamport transfer + memo in a single tx
    inbox.ts                      signature scan → memo parse → decrypt
  sns/
    resolve.ts                    SNS forward + batched reverse (web3.js boundary)
    resolve.test.ts               Forward, reverse, caching tests
  types/ed2curve.d.ts
docs/
  how-sen2-keeps-messages-safe.html   Non-technical visual explainer
```

### Scripts

| Script | What |
|---|---|
| `npm run build` | `tsc` → `dist/` |
| `npm run dev` | Build, then run MCP server via `node` (stdio transport) |
| `npm run start` | Run already-compiled `dist/server.js` |
| `npm run inspect` | Build, then launch MCP Inspector against the server |
| `npm test` | Build, then run the test suite via Node's built-in `node:test` |

### Type-check

```
npx tsc --noEmit
```

Strict mode is on, plus `noUnusedLocals` and `noUnusedParameters` — dead code fails the build.

### Tests

24 tests across two files using Node 22's built-in test runner (zero test-framework deps):

- **`src/crypto/envelope.test.ts`** — 9 tests, always offline. Round-trip, recipient embedding, version byte, ECDH symmetry, UTF-8 handling, max plaintext, three tamper-detection paths.
- **`src/sns/resolve.test.ts`** — 15 tests covering `isSolName`, forward resolution (`resolveSol`), and batched reverse lookup (`lookupPrimaryDomains`). Network-dependent — hits mainnet SNS. May flake on public RPC throttling; set `SEN2_SNS_RPC=<your-private-mainnet-url>` for reliability.

Total runtime: ~1.5s.

---

## Notes & gotchas

- **Typos silently mint new wallets.** Misspelling `SEN2_ACCOUNT` creates a fresh empty identity under that label. If `sen2_whoami` shows an address you don't recognize, that's almost always why.
- **Identity is per-OS-user.** Different Windows / macOS account → different keys. Different machine → different keys (until backup ships). The `SEN2_ACCOUNT` label is just routing within the current OS user.
- **Inbox scan window.** Default scan reads the last 25 signatures touching your address. On a wallet with mixed activity (airdrops, token swaps, etc.), non-sen2 traffic eats into that budget. Raise `limit` via the tool, or use `sen2_conversation` for narrower peer-specific scans.
- **Devnet indexing lag.** Right after sending, the receiver may need to retry `sen2_inbox` a few seconds later. Devnet RPC indexing is not instant.
- **Public mainnet SNS rate-limits.** `.sol` name resolution hits mainnet. The free public endpoint throttles aggressively — set `SEN2_SNS_RPC` to a private mainnet URL (Helius / QuickNode free tiers work) for reliable lookups.
- **`fetch failed` even though the tools load.** sen2 reaches Solana over HTTPS. Antivirus or corporate-proxy HTTPS scanning — e.g. **Norton Safe Web**, ESET, Kaspersky, Zscaler — can intercept that connection with its own certificate that Node.js doesn't trust, surfacing as a generic `fetch failed` (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). The `sen2_*` tools appear normally; only the network call fails. Two fixes:
  - **Allowlist the traffic** in your security software — exempt Solana RPC (`*.solana.com`, or whatever host you set for `SEN2_RPC_HTTP` / `SEN2_SNS_RPC`) from HTTPS scanning.
  - **Trust the scanner's root cert in Node** — point `NODE_EXTRA_CA_CERTS` at a PEM bundle that includes it, and bake it into the registration:
    ```
    claude mcp add -s user sen2 --env NODE_EXTRA_CA_CERTS=C:\path\to\ca-bundle.pem -- sen2-mcp
    ```
  This is a local network/security-software issue, not a sen2 problem — machines without HTTPS scanning are unaffected.

---

## License

MIT (see `LICENSE`).

The wire format is interoperable with [SolVault Messenger](https://github.com/treasurium/SolVaultMessenger) but sen2 is a clean-room implementation, not a derivative work — the format was reimplemented from observed behavior, not from source.
