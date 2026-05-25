// Pure resolution of cluster + RPC endpoints from (env, saved settings).
// No process.env reads and no fs here on purpose — config.ts owns those and
// passes the values in, which keeps this layer unit-testable in isolation.
import type { Cluster, Settings } from "./settings.js";

export const DEFAULT_RPC = {
  "devnet":       { http: "https://api.devnet.solana.com",       wss: "wss://api.devnet.solana.com" },
  "mainnet-beta": { http: "https://api.mainnet-beta.solana.com", wss: "wss://api.mainnet-beta.solana.com" },
} as const;

// SNS records live on mainnet-beta regardless of which cluster we send messages on.
export const DEFAULT_SNS_RPC = "https://api.mainnet-beta.solana.com";

// Precedence: explicit env var > persisted `sen2 cluster` setting > devnet.
export function resolveCluster(envCluster: Cluster | undefined, settings: Settings): Cluster {
  return envCluster ?? settings.cluster ?? "devnet";
}

export interface RpcEnv {
  http?: string;
  wss?: string;
  sns?: string;
}

export interface ResolvedRpc {
  http: string;
  wss: string;
  sns: string;
}

// Precedence per endpoint: env var > saved (`sen2 rpc`) > public default.
// Messaging RPC is keyed by cluster; SNS is cluster-independent.
export function resolveRpc(cluster: Cluster, env: RpcEnv, settings: Settings): ResolvedRpc {
  const saved = settings.rpc?.[cluster] ?? {};
  return {
    http: env.http ?? saved.http ?? DEFAULT_RPC[cluster].http,
    wss:  env.wss  ?? saved.wss  ?? DEFAULT_RPC[cluster].wss,
    sns:  env.sns  ?? settings.snsRpc ?? DEFAULT_SNS_RPC,
  };
}
