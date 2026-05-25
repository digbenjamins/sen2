import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCluster, resolveRpc, DEFAULT_RPC, DEFAULT_SNS_RPC } from "./config-resolve.js";
import type { Settings } from "./settings.js";

test("resolveCluster: env var wins over saved and default", () => {
  assert.equal(resolveCluster("mainnet-beta", { cluster: "devnet" }), "mainnet-beta");
});

test("resolveCluster: saved setting used when no env var", () => {
  assert.equal(resolveCluster(undefined, { cluster: "mainnet-beta" }), "mainnet-beta");
});

test("resolveCluster: defaults to devnet", () => {
  assert.equal(resolveCluster(undefined, {}), "devnet");
});

test("resolveRpc: public defaults per cluster when nothing set", () => {
  const r = resolveRpc("devnet", {}, {});
  assert.equal(r.http, DEFAULT_RPC.devnet.http);
  assert.equal(r.wss, DEFAULT_RPC.devnet.wss);
  assert.equal(r.sns, DEFAULT_SNS_RPC);
});

test("resolveRpc: env vars win over saved values", () => {
  const settings: Settings = {
    rpc: { "mainnet-beta": { http: "https://saved", wss: "wss://saved" } },
    snsRpc: "https://saved-sns",
  };
  const r = resolveRpc(
    "mainnet-beta",
    { http: "https://env", wss: "wss://env", sns: "https://env-sns" },
    settings,
  );
  assert.equal(r.http, "https://env");
  assert.equal(r.wss, "wss://env");
  assert.equal(r.sns, "https://env-sns");
});

test("resolveRpc: saved values used when no env var, per endpoint", () => {
  const settings: Settings = { rpc: { "mainnet-beta": { http: "https://saved" } } };
  const r = resolveRpc("mainnet-beta", {}, settings);
  assert.equal(r.http, "https://saved");
  // wss was not saved → falls back to the public default, not undefined
  assert.equal(r.wss, DEFAULT_RPC["mainnet-beta"].wss);
});

test("resolveRpc: a saved RPC is per-cluster and never leaks across clusters", () => {
  const settings: Settings = { rpc: { "mainnet-beta": { http: "https://main-only" } } };
  const r = resolveRpc("devnet", {}, settings);
  assert.equal(r.http, DEFAULT_RPC.devnet.http);
});

test("resolveRpc: saved snsRpc is cluster-independent", () => {
  const settings: Settings = { snsRpc: "https://my-sns" };
  assert.equal(resolveRpc("devnet", {}, settings).sns, "https://my-sns");
  assert.equal(resolveRpc("mainnet-beta", {}, settings).sns, "https://my-sns");
});
