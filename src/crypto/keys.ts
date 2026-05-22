import ed2curve from "ed2curve";

export function ed25519SecretToX25519(ed25519Secret: Uint8Array): Uint8Array {
  const x = ed2curve.convertSecretKey(ed25519Secret);
  if (!x) throw new Error("Failed to convert Ed25519 secret to X25519");
  return x;
}

export function ed25519PublicToX25519(ed25519Public: Uint8Array): Uint8Array {
  const x = ed2curve.convertPublicKey(ed25519Public);
  if (!x) throw new Error("Failed to convert Ed25519 public (invalid point)");
  return x;
}
