import {
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type FullySignedTransaction,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type Signature,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
  type TransactionWithBlockhashLifetime,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { getAddMemoInstruction } from "@solana-program/memo";

export async function sendEncryptedMemoTx(
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  sender: KeyPairSigner,
  recipient: Address,
  serializedEnvelope: string,
): Promise<Signature> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const transferIx = getTransferSolInstruction({
    source: sender,
    destination: recipient,
    amount: 0n,
  });

  const memoIx = getAddMemoInstruction({
    memo: serializedEnvelope,
    signers: [sender],
  });

  const txMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(sender, m),
    (m) => appendTransactionMessageInstructions([transferIx, memoIx], m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
  );

  const signedTx = await signTransactionMessageWithSigners(txMessage);
  // We built the message with `setTransactionMessageLifetimeUsingBlockhash`,
  // so the lifetime IS a blockhash one. Kit 6's type chain loses that
  // narrowing through `signTransactionMessageWithSigners` when the RPC isn't
  // cluster-typed; assert it back for `send()` which requires the narrow type.
  assertIsTransactionWithinSizeLimit(signedTx);
  const blockhashSignedTx = signedTx as typeof signedTx &
    FullySignedTransaction &
    TransactionWithBlockhashLifetime;

  const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await send(blockhashSignedTx, { commitment: "confirmed" });

  return getSignatureFromTransaction(blockhashSignedTx);
}
