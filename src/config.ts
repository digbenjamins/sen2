// Single source of truth for runtime/deployment config.
// All process.env reads happen here. Protocol constants (MESSAGE_VERSION,
// MEMO_PROGRAM_ID, etc.) stay with the code that owns them.
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };

const Schema = z.object({
  SEN2_ACCOUNT:  z.string().min(1).default("default"),
  SEN2_CLUSTER:  z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SEN2_RPC_HTTP: z.string().url().optional(),
  SEN2_RPC_WSS:  z.string().url().optional(),
  SEN2_SNS_RPC:  z.string().url().optional(),
});

const env = Schema.parse(process.env);

const DEFAULT_RPC = {
  "devnet":       { http: "https://api.devnet.solana.com",       wss: "wss://api.devnet.solana.com" },
  "mainnet-beta": { http: "https://api.mainnet-beta.solana.com", wss: "wss://api.mainnet-beta.solana.com" },
} as const;

// SNS records live on mainnet-beta regardless of which cluster we send messages on.
const DEFAULT_SNS_RPC = "https://api.mainnet-beta.solana.com";

export const config = Object.freeze({
  version: pkg.version,
  account: env.SEN2_ACCOUNT,
  keychainService: "sen2",
  cluster: env.SEN2_CLUSTER,
  rpc: {
    http: env.SEN2_RPC_HTTP ?? DEFAULT_RPC[env.SEN2_CLUSTER].http,
    wss:  env.SEN2_RPC_WSS  ?? DEFAULT_RPC[env.SEN2_CLUSTER].wss,
    sns:  env.SEN2_SNS_RPC  ?? DEFAULT_SNS_RPC,
  },
  inbox:        { defaultLimit: 25, maxLimit: 100 },
  conversation: { defaultLimit: 50, maxLimit: 200 },
});

// Note: no logging here on purpose — config is imported by both the MCP server
// and the `sen2` CLI, and only the server should print the startup banner.
