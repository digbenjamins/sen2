import { describe, it } from "node:test";
import assert from "node:assert/strict";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";

import {
  MESSAGE_VERSION,
  MAX_PLAINTEXT_BYTES,
  encryptMessage,
  decryptMessage,
  extractRecipient,
} from "./envelope.js";

function freshKeypair() {
  return nacl.sign.keyPair();
}

describe("envelope round-trip", () => {
  it("encrypts and decrypts a basic message", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const plaintext = "hello bob, this is alice";

    const sealed = encryptMessage(plaintext, alice.secretKey, bob.publicKey);
    const decrypted = decryptMessage(sealed.serialized, bob.secretKey, alice.publicKey);

    assert.equal(decrypted, plaintext);
  });

  it("embeds the recipient public key in the envelope header", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const sealed = encryptMessage("payload", alice.secretKey, bob.publicKey);

    const embedded = extractRecipient(sealed.serialized);
    assert.deepEqual(Array.from(embedded), Array.from(bob.publicKey));
  });

  it("uses version byte 0x01 (SolVault interop)", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const sealed = encryptMessage("v", alice.secretKey, bob.publicKey);
    const buf = naclUtil.decodeBase64(sealed.serialized);
    assert.equal(buf[0], MESSAGE_VERSION);
    assert.equal(MESSAGE_VERSION, 0x01);
  });

  it("decryption is symmetric — sender can decrypt their own outgoing", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const plaintext = "outgoing-from-alice";

    const sealed = encryptMessage(plaintext, alice.secretKey, bob.publicKey);
    // Alice decrypts her own message using her secret + bob's public
    const decrypted = decryptMessage(sealed.serialized, alice.secretKey, bob.publicKey);
    assert.equal(decrypted, plaintext);
  });

  it("handles non-ASCII UTF-8 (emoji, multi-byte)", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const plaintext = "café 日本語 🚀";

    const sealed = encryptMessage(plaintext, alice.secretKey, bob.publicKey);
    const decrypted = decryptMessage(sealed.serialized, bob.secretKey, alice.publicKey);
    assert.equal(decrypted, plaintext);
  });

  it("encrypts max-size plaintext successfully", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const plaintext = "x".repeat(MAX_PLAINTEXT_BYTES);

    const sealed = encryptMessage(plaintext, alice.secretKey, bob.publicKey);
    const decrypted = decryptMessage(sealed.serialized, bob.secretKey, alice.publicKey);
    assert.equal(decrypted, plaintext);
  });
});

describe("envelope tamper detection", () => {
  it("rejects an envelope with the wrong version byte", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const sealed = encryptMessage("hi", alice.secretKey, bob.publicKey);

    const buf = naclUtil.decodeBase64(sealed.serialized);
    buf[0] = 0xff;
    const tampered = naclUtil.encodeBase64(buf);

    assert.throws(() => decryptMessage(tampered, bob.secretKey, alice.publicKey), /Unsupported envelope version/);
  });

  it("rejects an envelope when the ciphertext has been modified", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const sealed = encryptMessage("hi", alice.secretKey, bob.publicKey);

    const buf = naclUtil.decodeBase64(sealed.serialized);
    // Flip a byte in the ciphertext region (header is 57 bytes)
    buf[buf.length - 1] ^= 0x01;
    const tampered = naclUtil.encodeBase64(buf);

    assert.throws(() => decryptMessage(tampered, bob.secretKey, alice.publicKey), /Decryption failed/);
  });

  it("rejects an envelope decrypted with the wrong peer key", () => {
    const alice = freshKeypair();
    const bob = freshKeypair();
    const eve = freshKeypair();

    const sealed = encryptMessage("secret", alice.secretKey, bob.publicKey);
    // Bob's secret is correct, but Eve's public is the wrong peer — should fail
    assert.throws(() => decryptMessage(sealed.serialized, bob.secretKey, eve.publicKey), /Decryption failed/);
  });
});
