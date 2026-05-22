import {
  address as toAddress,
  getAddressDecoder,
  getAddressEncoder,
  type Address,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
} from "@solana/kit";
import { decryptMessage, extractRecipient } from "../crypto/envelope.js";

export const MEMO_PROGRAM_ID = toAddress(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export interface InboxMessage {
  signature: Signature;
  blockTime: number | null;
  sender: Address;
  recipient: Address;
  plaintext: string;
  direction: "incoming" | "outgoing";
}

export interface ScanOptions {
  limit?: number;
  until?: Signature;
}

export async function scanInbox(
  rpc: Rpc<SolanaRpcApi>,
  myAddress: Address,
  mySecretKey: Uint8Array,
  myPublicKey: Uint8Array,
  options: ScanOptions = {},
): Promise<InboxMessage[]> {
  const limit = options.limit ?? 25;

  const signatures = await rpc
    .getSignaturesForAddress(myAddress, {
      limit,
      ...(options.until ? { until: options.until } : {}),
    })
    .send();

  const out: InboxMessage[] = [];
  const addressEncoder = getAddressEncoder();
  const addressDecoder = getAddressDecoder();
  const myPubKeyB58 = addressDecoder.decode(myPublicKey);

  // Process oldest first so output reads chronologically.
  for (const sig of [...signatures].reverse()) {
    if (sig.err) continue;

    const tx = await rpc
      .getTransaction(sig.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
        encoding: "jsonParsed",
      })
      .send();
    if (!tx) continue;

    const memo = extractMemo(tx);
    if (!memo) continue;
    if (memo.length < 1 || memo.charCodeAt(0) === 0) continue;

    let embeddedRecipient: Uint8Array;
    try {
      embeddedRecipient = extractRecipient(memo);
    } catch {
      continue;
    }
    const embeddedAddr = addressDecoder.decode(embeddedRecipient);

    const senderAddr = getFeePayerAddress(tx);
    if (!senderAddr) continue;

    let direction: "incoming" | "outgoing";
    let peerPublic: Uint8Array;
    let peerAddress: Address;

    if (embeddedAddr === myPubKeyB58 && senderAddr !== myPubKeyB58) {
      direction = "incoming";
      peerAddress = senderAddr;
      peerPublic = new Uint8Array(addressEncoder.encode(senderAddr));
    } else if (senderAddr === myPubKeyB58 && embeddedAddr !== myPubKeyB58) {
      direction = "outgoing";
      peerAddress = embeddedAddr;
      peerPublic = new Uint8Array(addressEncoder.encode(embeddedAddr));
    } else {
      continue;
    }

    let plaintext: string;
    try {
      plaintext = decryptMessage(memo, mySecretKey, peerPublic);
    } catch {
      continue;
    }

    out.push({
      signature: sig.signature,
      blockTime: tx.blockTime != null ? Number(tx.blockTime) : null,
      sender: senderAddr,
      recipient: direction === "incoming" ? myAddress : peerAddress,
      plaintext,
      direction,
    });
  }

  return out;
}

function extractMemo(tx: any): string | null {
  const instructions = tx?.transaction?.message?.instructions ?? [];
  for (const ix of instructions) {
    if (ix.programId === MEMO_PROGRAM_ID || ix.program === "spl-memo") {
      if (typeof ix.parsed === "string") return ix.parsed;
      if (typeof ix.data === "string") {
        try {
          return Buffer.from(ix.data, "base64").toString("utf-8");
        } catch {
          // fall through
        }
      }
    }
  }
  const logs: string[] = tx?.meta?.logMessages ?? [];
  for (const log of logs) {
    const m = log.match(/^Program log: Memo \(len \d+\): "(.+)"$/);
    if (m) return m[1];
  }
  return null;
}

function getFeePayerAddress(tx: any): Address | null {
  const keys = tx?.transaction?.message?.accountKeys ?? [];
  if (keys.length === 0) return null;
  const k = keys[0];
  if (typeof k === "string") return toAddress(k);
  if (typeof k?.pubkey === "string") return toAddress(k.pubkey);
  return null;
}
