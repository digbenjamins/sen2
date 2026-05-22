declare module "ed2curve" {
  interface Ed2Curve {
    convertPublicKey(pk: Uint8Array): Uint8Array | null;
    convertSecretKey(sk: Uint8Array): Uint8Array;
    convertKeyPair(kp: {
      publicKey: Uint8Array;
      secretKey: Uint8Array;
    }): { publicKey: Uint8Array; secretKey: Uint8Array } | null;
  }
  const ed2curve: Ed2Curve;
  export default ed2curve;
}
