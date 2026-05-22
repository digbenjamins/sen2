import { createKeyPairSignerFromBytes } from "@solana/kit";
import type { KeyPairSigner } from "@solana/kit";

export async function toSolanaSigner(
  secretKey: Uint8Array,
): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(secretKey);
}
