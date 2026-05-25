import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readSettings, writeSettings, settingsPath, type Settings } from "./settings.js";

// Point the config dir at a throwaway temp dir so the real OS config dir is
// never touched. settings.ts reads SEN2_CONFIG_DIR on each call, so setting it
// in before() takes effect even though the module is already imported.
let dir: string;
const previous = process.env.SEN2_CONFIG_DIR;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "sen2-settings-"));
  process.env.SEN2_CONFIG_DIR = dir;
});

after(() => {
  if (previous === undefined) delete process.env.SEN2_CONFIG_DIR;
  else process.env.SEN2_CONFIG_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

test("settingsPath honors SEN2_CONFIG_DIR", () => {
  assert.equal(settingsPath(), join(dir, "settings.json"));
});

test("readSettings returns {} when the file does not exist", () => {
  assert.deepEqual(readSettings(), {});
});

test("writeSettings then readSettings round-trips (creating the dir as needed)", () => {
  const value: Settings = {
    cluster: "mainnet-beta",
    rpc: { "mainnet-beta": { http: "https://x", wss: "wss://x" } },
    snsRpc: "https://sns",
  };
  writeSettings(value);
  assert.deepEqual(readSettings(), value);
});

test("readSettings returns {} on a corrupt file rather than throwing", () => {
  writeFileSync(settingsPath(), "{ not valid json");
  assert.deepEqual(readSettings(), {});
});
