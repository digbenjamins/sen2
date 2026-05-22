import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import { ed25519PublicToX25519, ed25519SecretToX25519 } from "./keys.js";

export const MESSAGE_VERSION = 0x01;
export const ENVELOPE_HEADER_BYTES = 1 + 32 + 24;
export const POLY1305_MAC_BYTES = 16;
export const MEMO_MAX_BYTES = 566;
export const MAX_PLAINTEXT_BYTES =
  Math.floor((MEMO_MAX_BYTES * 3) / 4) - ENVELOPE_HEADER_BYTES - POLY1305_MAC_BYTES;

export interface EncryptResult {
  serialized: string;
  timestamp: number;
}

// Wire format: [version:1B][recipientPubKey:32B][nonce:24B][ciphertext:varB]
export function encryptMessage(
  plaintext: string,
  senderEd25519Secret: Uint8Array,
  recipientEd25519Public: Uint8Array,
): EncryptResult {
  const messageBytes = naclUtil.decodeUTF8(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const senderXSecret = ed25519SecretToX25519(senderEd25519Secret);
  const recipientXPublic = ed25519PublicToX25519(recipientEd25519Public);

  const ciphertext = nacl.box(messageBytes, nonce, recipientXPublic, senderXSecret);
  if (!ciphertext) throw new Error("Encryption failed");

  const buf = new Uint8Array(ENVELOPE_HEADER_BYTES + ciphertext.length);
  buf[0] = MESSAGE_VERSION;
  buf.set(recipientEd25519Public, 1);
  buf.set(nonce, 33);
  buf.set(ciphertext, 57);

  return {
    serialized: naclUtil.encodeBase64(buf),
    timestamp: Date.now(),
  };
}

export function extractRecipient(serialized: string): Uint8Array {
  const buf = naclUtil.decodeBase64(serialized);
  if (buf[0] !== MESSAGE_VERSION) {
    throw new Error(`Unsupported envelope version: 0x${buf[0].toString(16)}`);
  }
  return buf.slice(1, 33);
}

// ECDH is symmetric: pass your own secret + the peer's public, regardless
// of whether you sent or received the message.
export function decryptMessage(
  serialized: string,
  myEd25519Secret: Uint8Array,
  peerEd25519Public: Uint8Array,
): string {
  const buf = naclUtil.decodeBase64(serialized);
  if (buf[0] !== MESSAGE_VERSION) {
    throw new Error(`Unsupported envelope version: 0x${buf[0].toString(16)}`);
  }
  const nonce = buf.slice(33, 57);
  const ciphertext = buf.slice(57);

  const myXSecret = ed25519SecretToX25519(myEd25519Secret);
  const peerXPublic = ed25519PublicToX25519(peerEd25519Public);

  const plaintext = nacl.box.open(ciphertext, nonce, peerXPublic, myXSecret);
  if (!plaintext) throw new Error("Decryption failed - wrong key or tampered envelope");

  return naclUtil.encodeUTF8(plaintext);
}
