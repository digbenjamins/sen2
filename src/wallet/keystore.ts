import { Entry } from "@napi-rs/keyring";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { config } from "../config.js";

const SERVICE = config.keychainService;

export interface AgentKeys {
  account: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

// Read an identity from the keychain without creating one. Returns null if the
// account has never been initialized.
export function loadAccount(account: string): AgentKeys | null {
  const entry = new Entry(SERVICE, account);
  let stored: string | null = null;
  try {
    stored = entry.getPassword();
  } catch {
    // not found
  }
  if (!stored) return null;

  const secretKey = naclUtil.decodeBase64(stored);
  return { account, secretKey, publicKey: secretKey.slice(32, 64) };
}

export function accountExists(account: string): boolean {
  return loadAccount(account) !== null;
}

// Store a raw 64-byte Ed25519 secret key (seed + public key), overwriting any
// existing entry for this account. Used by the CLI on keygen / import.
export function storeSecretKey(account: string, secretKey: Uint8Array): void {
  if (secretKey.length !== 64) {
    throw new Error(`secret key must be 64 bytes (got ${secretKey.length})`);
  }
  new Entry(SERVICE, account).setPassword(naclUtil.encodeBase64(secretKey));
}

export function loadOrGenerate(account: string): AgentKeys {
  const existing = loadAccount(account);
  if (existing) return existing;

  const kp = nacl.sign.keyPair();
  storeSecretKey(account, kp.secretKey);
  return { account, secretKey: kp.secretKey, publicKey: kp.publicKey };
}

export function deleteAccount(account: string): boolean {
  const entry = new Entry(SERVICE, account);
  try {
    return entry.deletePassword();
  } catch {
    return false;
  }
}
