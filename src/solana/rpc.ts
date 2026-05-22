import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { Connection } from "@solana/web3.js";
import { config } from "../config.js";

export function getRpc(url: string = config.rpc.http) {
  return createSolanaRpc(url);
}

export function getRpcSubscriptions(url: string = config.rpc.wss) {
  return createSolanaRpcSubscriptions(url);
}

// SNS connection — mainnet-beta, independent of the messaging cluster.
// Uses web3.js v1 because @bonfida/spl-name-service is built on it; this is
// the only place in sen2 that touches web3.js.
export function getSnsConnection(url: string = config.rpc.sns): Connection {
  return new Connection(url);
}
