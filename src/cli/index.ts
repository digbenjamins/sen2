#!/usr/bin/env node
// sen2 — human-facing key management CLI.
//
// SEPARATE from the MCP server (src/server.ts) on purpose: key export only
// exists here, never as an MCP tool. A poisoned incoming message must not be
// able to trick the LLM into emitting the secret key. This binary never opens
// the MCP transport and is only ever run by a human in a terminal.
import { parseArgs } from "node:util";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getAddressDecoder, getBase58Decoder, getBase58Encoder } from "@solana/kit";
import nacl from "tweetnacl";

import { config } from "../config.js";
import { accountExists, loadAccount, storeSecretKey } from "../wallet/keystore.js";

const addressDecoder = getAddressDecoder();
const base58Decoder = getBase58Decoder();
const base58Encoder = getBase58Encoder();

const addressOf = (publicKey: Uint8Array): string => addressDecoder.decode(publicKey);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const USAGE = `sen2 — key management for your sen2 agent identity.

Usage:
  sen2 whoami [--account <label>]
  sen2 keygen [--account <label>] [--force]
  sen2 export [--account <label>] [--format id-json|base58] [--out <file>]
  sen2 import <id.json | base58 | file> [--account <label>] [--force]

Identity lives in your OS keychain (service "sen2"). Default account label is
"${config.account}" (override with --account or the SEN2_ACCOUNT env var).

Your secret key is the ONLY way to recover this identity and any funds on it.
Export it and store the backup somewhere safe. The key is emitted here and
nowhere else — never paste it where an AI agent can read it.

Formats:
  id-json   JSON byte array, e.g. [12,34,...] — Solana CLI / solana-keygen format
  base58    base58 string — Phantom/Solflare "import private key" format`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: "string" },
    format: { type: "string" },
    out: { type: "string" },
    force: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const cmd = positionals[0];
const account = values.account ?? config.account;

if (!cmd || values.help || cmd === "help") {
  console.log(USAGE);
  process.exit(0);
}

// Parse a secret key from a file path, a JSON byte array, or a base58 string.
// Accepts a 64-byte secret key or a 32-byte seed (expanded to the full key).
function parseSecretKey(source: string): Uint8Array {
  let text = source.trim();
  if (existsSync(source)) text = readFileSync(source, "utf8").trim();

  let bytes: Uint8Array;
  if (text.startsWith("[")) {
    try {
      bytes = Uint8Array.from(JSON.parse(text) as number[]);
    } catch {
      fail("Could not parse JSON byte array.");
    }
  } else {
    try {
      bytes = new Uint8Array(base58Encoder.encode(text));
    } catch {
      fail("Input is neither a valid JSON byte array nor a base58 string.");
    }
  }

  if (bytes.length === 32) bytes = nacl.sign.keyPair.fromSeed(bytes).secretKey;
  if (bytes.length !== 64) {
    fail(`Imported key must be 32 (seed) or 64 (full) bytes — got ${bytes.length}.`);
  }
  return bytes;
}

switch (cmd) {
  case "whoami": {
    const keys = loadAccount(account);
    if (!keys) {
      fail(`No sen2 identity for account "${account}". Create one with:  sen2 keygen --account ${account}`);
    }
    console.log(`address: ${addressOf(keys.publicKey)}`);
    console.log(`account: ${account}`);
    console.log(`cluster: ${config.cluster}`);
    break;
  }

  case "keygen": {
    if (accountExists(account) && !values.force) {
      fail(`Account "${account}" already exists. Use --force to overwrite (this destroys the old identity).`);
    }
    const kp = nacl.sign.keyPair();
    storeSecretKey(account, kp.secretKey);
    console.log(`Created sen2 identity for account "${account}".`);
    console.log(`address: ${addressOf(kp.publicKey)}`);
    console.error(
      `\n⚠ Back it up now:  sen2 export --account ${account} --out ${account}.json\n` +
        "The key lives only in your OS keychain — if that's lost and you have no backup, the identity is gone for good.",
    );
    break;
  }

  case "export": {
    const keys = loadAccount(account);
    if (!keys) fail(`No sen2 identity for account "${account}".`);
    const format = values.format ?? "id-json";

    let out: string;
    if (format === "id-json") out = JSON.stringify(Array.from(keys.secretKey));
    else if (format === "base58") out = base58Decoder.decode(keys.secretKey);
    else fail(`Unknown --format "${format}". Use id-json or base58.`);

    if (values.out) {
      writeFileSync(values.out, format === "id-json" ? out + "\n" : out, { mode: 0o600 });
      console.error(
        `Wrote ${format} secret key for "${account}" to ${values.out} (address ${addressOf(keys.publicKey)}).\n` +
          "Anyone with this file controls the identity. Store it safely; delete it when no longer needed.",
      );
    } else {
      console.error(`⚠ Secret key for "${account}" (${format}) — anyone with this controls the identity:`);
      console.log(out);
    }
    break;
  }

  case "import": {
    const source = positionals[1];
    if (!source) fail("Usage: sen2 import <id.json | base58 | file> [--account <label>] [--force]");
    if (accountExists(account) && !values.force) {
      fail(`Account "${account}" already exists. Use --force to overwrite.`);
    }
    const secretKey = parseSecretKey(source);
    storeSecretKey(account, secretKey);
    console.log(`Imported key into account "${account}".`);
    console.log(`address: ${addressOf(secretKey.slice(32, 64))}`);
    break;
  }

  default:
    fail(`Unknown command "${cmd}".\n\n${USAGE}`);
}
