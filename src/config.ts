// Single source of truth for runtime/deployment config.
// All process.env reads happen here. Protocol constants (MESSAGE_VERSION,
// MEMO_PROGRAM_ID, etc.) stay with the code that owns them.
import { z } from "zod";
import pkg from "../package.json" with { type: "json" };
import { readSettings } from "./settings.js";
import { resolveCluster, resolveRpc } from "./config-resolve.js";

const Schema = z.object({
  SEN2_ACCOUNT:  z.string().min(1).default("default"),
  SEN2_CLUSTER:  z.enum(["devnet", "mainnet-beta"]).optional(),
  SEN2_RPC_HTTP: z.string().url().optional(),
  SEN2_RPC_WSS:  z.string().url().optional(),
  SEN2_SNS_RPC:  z.string().url().optional(),
});

const env = Schema.parse(process.env);
const settings = readSettings();

const cluster = resolveCluster(env.SEN2_CLUSTER, settings);
const rpc = resolveRpc(
  cluster,
  { http: env.SEN2_RPC_HTTP, wss: env.SEN2_RPC_WSS, sns: env.SEN2_SNS_RPC },
  settings,
);

export const config = Object.freeze({
  version: pkg.version,
  account: env.SEN2_ACCOUNT,
  keychainService: "sen2",
  cluster,
  rpc: { ...rpc },
  inbox:        { defaultLimit: 25, maxLimit: 100 },
  conversation: { defaultLimit: 50, maxLimit: 200 },
});

// Note: no logging here on purpose — config is imported by both the MCP server
// and the `sen2` CLI, and only the server should print the startup banner.
