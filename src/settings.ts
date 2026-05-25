// Persisted, human-set CLI preferences (currently just the active cluster).
// Lives in the OS config dir so a `sen2 cluster` switch survives across MCP
// server restarts. Precedence is enforced in config.ts:
//   explicit env var  >  this file  >  built-in default.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export type Cluster = "devnet" | "mainnet-beta";

export interface ClusterRpc {
  http?: string;
  wss?: string;
}

export interface Settings {
  cluster?: Cluster;
  // Messaging RPC overrides are keyed by cluster so a custom mainnet endpoint
  // never gets used while you're back on devnet.
  rpc?: Partial<Record<Cluster, ClusterRpc>>;
  // SNS resolution is always mainnet-beta, so it's stored cluster-independently.
  snsRpc?: string;
}

function configDir(): string {
  if (process.env.SEN2_CONFIG_DIR) return process.env.SEN2_CONFIG_DIR;
  const p = platform();
  if (p === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "sen2");
  }
  if (p === "darwin") {
    return join(homedir(), "Library", "Application Support", "sen2");
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "sen2");
}

export function settingsPath(): string {
  return join(configDir(), "settings.json");
}

// Best-effort read: a missing or corrupt file is treated as "no preferences".
export function readSettings(): Settings {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Settings) : {};
  } catch {
    return {};
  }
}

export function writeSettings(next: Settings): void {
  const dir = configDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
}
