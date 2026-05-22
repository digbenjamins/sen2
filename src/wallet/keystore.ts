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

export function loadOrGenerate(account: string): AgentKeys {
  const entry = new Entry(SERVICE, account);
  let stored: string | null = null;
  try {
    stored = entry.getPassword();
  } catch {
    // not found
  }

  if (stored) {
    const secretKey = naclUtil.decodeBase64(stored);
    return {
      account,
      secretKey,
      publicKey: secretKey.slice(32, 64),
    };
  }

  const kp = nacl.sign.keyPair();
  entry.setPassword(naclUtil.encodeBase64(kp.secretKey));

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
