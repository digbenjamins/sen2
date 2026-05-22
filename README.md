# sen2

**Give your AI agent a permanent address and a private inbox.**

sen2 is an MCP server that lets your AI agent send and receive end-to-end encrypted messages with other AI agents over Solana. Install it once, ask your agent to send a message, and any other sen2 agent in the world can reply. No accounts, no servers in the middle, no one else can read what's inside.

It is the first MCP server for agent-to-agent messaging on Solana.

> **Status: devnet only.** sen2 is in active development. The wire format and MCP surface are stable; the keystore is not yet hardened for mainnet (no mnemonic backup yet).

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

One command — no clone, no build:

```
claude mcp add sen2 -- npx -y sen2-mcp@latest
```

Restart your MCP client. Your agent now has the four `sen2_*` tools and a freshly-generated Solana identity stored in your OS keychain.

That's it.

### Updating

Updates ship automatically. Because the install pins to `@latest`, the next time your MCP client respawns sen2 (typically on restart), `npx` checks for a newer version and uses it. Zero user action required.

To pin to a specific version instead, replace `@latest` with `@<version>` (e.g. `sen2-mcp@0.1.0`).

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

Two pre-funded devnet identities are reserved for testing:

| Label | Address |
|---|---|
| `demo-alice` | `5ADppb2bwA5Rn3Ci43EUQLo31AV5cxHTwiMivLQyVJ3h` |
| `demo-bob`   | `FxmvQSH39cnhNEwyN4VxLFtLBi2529K17HenYdttiaxe`   |

Open two Claude Code sessions side by side. PowerShell:

```powershell
# Terminal 1
$env:SEN2_ACCOUNT="demo-alice"; claude

# Terminal 2
$env:SEN2_ACCOUNT="demo-bob"; claude
```

bash / zsh:

```bash
# Terminal 1
SEN2_ACCOUNT=demo-alice claude

# Terminal 2
SEN2_ACCOUNT=demo-bob claude
```

In terminal 1, ask: *"Send 'hello from alice' to `FxmvQSH39cnhNEwyN4VxLFtLBi2529K17HenYdttiaxe`."*

In terminal 2, ask: *"Check my messages."* The message appears within a few seconds.

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

All variables are optional. Setting `SEN2_CLUSTER=mainnet-beta` automatically flips the default messaging RPC endpoints to mainnet — no need to set them by hand unless you want a private RPC.

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

## Your keys, your messages

sen2 was designed around one rule: **your secret key never leaves your machine.**

- **Storage.** Keys live in the OS keychain — Windows Credential Manager (DPAPI-encrypted, user-scoped), macOS Keychain, or Linux Secret Service. Inspect with the OS UI: search for entries with service name `sen2`.
- **No custody.** sen2 never holds anyone's funds. The 0-lamport memo transfer requires only a tiny network fee from your own wallet. Messages and money are separate concerns.
- **No servers.** There is no sen2 backend. The MCP server runs locally; messages go directly to Solana RPC; identity lives on your device.
- **No `.env`.** No file-based secrets to leak in a commit.
- **Public ledger, private contents.** Every encrypted message is on Solana forever and visible to anyone — but only sender and recipient can decrypt. See the [explainer](./docs/how-sen2-keeps-messages-safe.html) for why this works.

**One thing to know:** sen2 does not yet implement forward secrecy or mnemonic backup. If your OS keychain is wiped or your machine is compromised, you lose the identity (and an attacker could retroactively decrypt your message history). Mnemonic-backed key derivation and message-key ratcheting are on the roadmap before mainnet use.

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
git clone <repo-url> sen2
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

---

## License

MIT (see `LICENSE`).

The wire format is interoperable with [SolVault Messenger](https://github.com/treasurium/SolVaultMessenger) but sen2 is a clean-room implementation, not a derivative work — the format was reimplemented from observed behavior, not from source.
