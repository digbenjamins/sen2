# Forward secrecy — design note (future feature, not scheduled)

Status: **idea / not implemented.** Captured 2026-05-24 for a future v2. A
forward-secret envelope would be a new wire version in the reserved `0x10+`
range (see `SEN2_EXTENSION_VERSION_MIN` in `src/crypto/envelope.ts`); the
current `0x01` static format keeps working alongside it.

## Why there's no forward secrecy today

sen2 uses **static–static ECDH**: each user has one long-lived X25519 key
(derived from their Ed25519 identity). Every message between Alice and Bob is
sealed with the *same* shared secret `ECDH(Alice_static, Bob_static)`, forever.

Consequence: if Bob's long-term secret key ever leaks, an attacker who scraped
the public, permanent on-chain ciphertext can decrypt **every message Bob ever
sent or received — past and future.**

## What forward secrecy buys

FS = *compromising a long-term key does not reveal past messages.* You get it by
encrypting each message with an **ephemeral key that is deleted right after
use**, so there's nothing left to recompute the old message key from, even with
the long-term key in hand.

## The hard part: sen2 is asynchronous

Real FS normally needs *both* sides to contribute fresh ephemeral keys. But Bob
is usually offline when Alice posts a memo, so he can't hand her a fresh key per
message. This is the problem Signal solved for async chat, in three layers:

1. **Prekeys.** Bob pre-generates a batch of ephemeral keys, keeps the secrets
   locally, and publishes the public halves somewhere discoverable — for sen2
   that's the `sen2.app` registry or an on-chain account. Alice grabs one to
   start a conversation.
2. **X3DH handshake.** Alice combines several DH operations (her identity +
   ephemeral against Bob's identity + signed prekey + a one-time prekey) into an
   initial root key. Bob **consumes and deletes** the one-time prekey secret
   after first use — that deletion is the FS source for the opening message.
3. **Double Ratchet.** From the root key both sides run a KDF chain that
   advances one step per message (deleting the previous step's key) and
   periodically injects a fresh DH exchange. Per-message deletion → forward
   secrecy; the fresh DH → *post-compromise security* (self-healing after a
   leak).

## Why it's a v2, not a patch — cost to sen2

- **State.** sen2 is stateless today: scan the chain on demand, decrypt anything
  with the static key. A ratchet needs **persistent per-conversation state**
  (root/chain/ratchet keys, skipped-message keys) in local storage, and messages
  must be replayed in order exactly once. That's the opposite of the current
  "scan + decrypt any message in isolation" model.
- **Prekey distribution & consumption.** Need a place to publish prekeys and,
  ideally, to mark one-time keys used — awkward on a serverless public chain
  where two senders could grab the same prekey (Signal tolerates this with
  weaker FS for that one message).
- **Out-of-order / multi-device.** Memos arrive batched and out of order; the
  ratchet tolerates this only within bounds (skipped-key caches), and
  multi-device needs state sync.
- **Version byte.** A forward-secret envelope is a new format → use the reserved
  `0x10+` range so `0x01` static messages are never misparsed.

## Lighter middle grounds (honest tradeoffs)

- **Per-message ephemeral *sender* key (ECIES / sealed-box style):** cheap, but
  only protects the sender's key — decryption still uses the recipient's static
  key, so a recipient-key leak still exposes everything. **Not real FS.**
- **Symmetric hash-ratchet only:** derive a chain from an initial secret, delete
  each step. Gives FS but **no** post-compromise security (a leaked current
  chain key exposes all future messages until a manual re-key). Still needs
  per-peer state + strict ordering.
- **Key rotation:** periodically rotate identity keys and delete old ones — not
  FS, but bounds the exposure window. Easy, partial.

## Bottom line

True FS = Signal's prekeys + X3DH + Double Ratchet, which turns sen2 from a
stateless chain-scanner into a stateful per-conversation client with a prekey
directory — a meaningful v2 at envelope version `0x10+`.

One thing FS can **never** fix: on-chain **metadata** (who messaged whom, when)
stays public regardless. FS protects message *contents* only; hiding the social
graph would need a mixnet or a zero-knowledge layer.
