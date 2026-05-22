import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isSolName, resolveSol, lookupPrimaryDomains } from "./resolve.js";
import { address as toAddress } from "@solana/kit";

// A well-known mainnet .sol domain that should remain registered indefinitely.
const KNOWN_DOMAIN = "bonfida";
// A randomly generated address that almost certainly has no primary domain.
const ADDR_WITHOUT_PRIMARY = toAddress("11111111111111111111111111111112");

describe("isSolName", () => {
  it("recognizes a basic .sol name", () => {
    assert.equal(isSolName("alice.sol"), true);
  });

  it("recognizes uppercase variants", () => {
    assert.equal(isSolName("ALICE.SOL"), true);
    assert.equal(isSolName("Alice.Sol"), true);
  });

  it("rejects names without the .sol suffix", () => {
    assert.equal(isSolName("alice"), false);
    assert.equal(isSolName("alice.eth"), false);
    assert.equal(isSolName(""), false);
  });

  it("rejects strings that contain '.sol' but don't end with it", () => {
    assert.equal(isSolName(".sol something"), false);
    assert.equal(isSolName("alice.sol.foo"), false);
  });
});

// Network-dependent tests below. They hit mainnet SNS via the configured
// SEN2_SNS_RPC (default: api.mainnet-beta.solana.com). Public RPC can
// rate-limit — set SEN2_SNS_RPC to a private endpoint if these flake.
describe("resolveSol (forward, mainnet SNS)", () => {
  it(`resolves ${KNOWN_DOMAIN}.sol to a non-null address`, async () => {
    const addr = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    assert.ok(addr, `expected ${KNOWN_DOMAIN}.sol to resolve, got null`);
    assert.equal(typeof addr, "string");
    assert.ok(addr.length > 30, `expected base58 address (32-44 chars), got "${addr}"`);
  });

  it("accepts the domain with or without the .sol suffix", async () => {
    const withSuffix = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    const withoutSuffix = await resolveSol(KNOWN_DOMAIN);
    assert.equal(withoutSuffix, withSuffix);
  });

  it("is case-insensitive on the name", async () => {
    const lower = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    const upper = await resolveSol(`${KNOWN_DOMAIN.toUpperCase()}.SOL`);
    assert.equal(upper, lower);
  });

  it("returns null for a name that almost certainly isn't registered", async () => {
    const addr = await resolveSol("xxxx-this-name-should-not-exist-987654321.sol");
    assert.equal(addr, null);
  });

  it("returns null for an empty name", async () => {
    const addr = await resolveSol(".sol");
    assert.equal(addr, null);
  });

  it("returns the cached value on the second call (no network)", async () => {
    const first = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    const start = performance.now();
    const second = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    const elapsed = performance.now() - start;
    assert.equal(second, first);
    assert.ok(elapsed < 5, `expected cached lookup < 5ms, took ${elapsed.toFixed(2)}ms`);
  });
});

describe("lookupPrimaryDomains (batch reverse, mainnet SNS)", () => {
  it("returns a Map covering every requested address", async () => {
    const bonfidaAddr = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    assert.ok(bonfidaAddr, "precondition: forward resolution should succeed");

    const result = await lookupPrimaryDomains([bonfidaAddr, ADDR_WITHOUT_PRIMARY]);
    assert.ok(result.has(bonfidaAddr));
    assert.ok(result.has(ADDR_WITHOUT_PRIMARY));
  });

  it("returns null (not undefined) for addresses with no primary set", async () => {
    const result = await lookupPrimaryDomains([ADDR_WITHOUT_PRIMARY]);
    assert.equal(result.get(ADDR_WITHOUT_PRIMARY), null);
  });

  it("returns either a string or null for any resolved address (no throws)", async () => {
    const bonfidaAddr = await resolveSol(`${KNOWN_DOMAIN}.sol`);
    assert.ok(bonfidaAddr, "precondition: forward resolution should succeed");

    const result = await lookupPrimaryDomains([bonfidaAddr]);
    const value = result.get(bonfidaAddr);
    // Value can be a string (primary domain set) or null (no primary set).
    // Both are valid; what we're guarding against is a throw / undefined.
    assert.ok(value === null || (typeof value === "string" && value.length > 0), `expected string or null, got ${value}`);
  });

  it("dedupes the input — same address requested twice = one cache entry", async () => {
    const result = await lookupPrimaryDomains([ADDR_WITHOUT_PRIMARY, ADDR_WITHOUT_PRIMARY, ADDR_WITHOUT_PRIMARY]);
    assert.equal(result.size, 1);
  });

  it("warm cache: second call is effectively instant", async () => {
    // Prime the cache
    await lookupPrimaryDomains([ADDR_WITHOUT_PRIMARY]);

    const start = performance.now();
    await lookupPrimaryDomains([ADDR_WITHOUT_PRIMARY]);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 5, `expected cached lookup < 5ms, took ${elapsed.toFixed(2)}ms`);
  });
});
