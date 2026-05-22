import { resolve, getMultipleFavoriteDomains } from "@bonfida/spl-name-service";
import { address as toAddress, type Address } from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";
import { getSnsConnection } from "../solana/rpc.js";

// SNS lives on mainnet and uses @bonfida/spl-name-service, which is built on
// @solana/web3.js v1. The rest of sen2 is on @solana/kit. This file is the
// only boundary between the two SDKs — we convert at the wire (PublicKey ↔
// Address) so callers stay kit-only.
const sns: Connection = getSnsConnection();

export function isSolName(input: string): boolean {
  return input.toLowerCase().endsWith(".sol");
}

// Forward cache: name (stripped, lowercased) → Address.
// Only positive resolutions are cached. We don't cache misses — a failed
// SDK call could be a transient rate-limit / network blip rather than a
// genuine "name doesn't exist", and we'd rather pay one RPC on retry than
// permanently mark a real domain as unresolvable.
const forwardResolutionCache = new Map<string, Address>();

// Resolve a .sol name to its owner's Solana address. Returns null on any
// failure (name not found, network error, etc.) — callers surface a clean
// error to the user rather than leaking SDK internals.
export async function resolveSol(name: string): Promise<Address | null> {
  const stripped = name.toLowerCase().replace(/\.sol$/, "");
  if (!stripped) return null;

  const cached = forwardResolutionCache.get(stripped);
  if (cached) return cached;

  try {
    const owner = await resolve(sns, stripped);
    const addr = toAddress(owner.toBase58());
    forwardResolutionCache.set(stripped, addr);
    return addr;
  } catch {
    return null;
  }
}

// Per-process cache: address → primary .sol name (null = checked, none set).
// Persists for the lifetime of the MCP server. SNS records change infrequently
// so this is fine for M4.2; M5+ will swap to a TTL'd / persistent cache.
const primaryDomainCache = new Map<Address, string | null>();

// Batch-look-up the primary .sol name for a list of wallet addresses using
// the SNS `getMultipleFavoriteDomains` helper (one RPC for the whole batch
// via getMultipleAccounts under the hood). Silently no-ops on RPC failure
// so message rendering never breaks.
export async function lookupPrimaryDomains(
  addresses: Address[],
): Promise<Map<Address, string | null>> {
  const unique = Array.from(new Set(addresses));
  const uncached = unique.filter((a) => !primaryDomainCache.has(a));

  if (uncached.length > 0) {
    try {
      const pubkeys = uncached.map((a) => new PublicKey(a));
      const results = await getMultipleFavoriteDomains(sns, pubkeys);
      uncached.forEach((addr, i) => {
        primaryDomainCache.set(addr, results[i] ?? null);
      });
    } catch {
      // Cache nothing on failure — retry on next call.
    }
  }

  const out = new Map<Address, string | null>();
  for (const addr of unique) {
    out.set(addr, primaryDomainCache.get(addr) ?? null);
  }
  return out;
}
