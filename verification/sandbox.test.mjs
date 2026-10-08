import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  checkPackages,
  createSandbox,
  packagePath,
  pins,
  readJson,
  repo,
} from "./sandbox.mjs";

const settings = () => readJson(path.join(repo, "settings.json"));

test("retired extensions stay absent from canonical and live setup", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  for (const root of [repo, agentDir]) {
    for (const name of ["spark-strict-tools", "summaries"]) {
      assert.equal(fs.existsSync(path.join(root, "extensions", name)), false);
    }
  }
});

test("unpinned settings fail before loading extensions", () => {
  const modified = settings();
  modified.packages[0] = "npm:pi-blackhole";
  assert.throws(
    () => checkPackages("/nonexistent", modified),
    /settings and tested package pins disagree/,
  );
});

test("unexpected installed vendor version is rejected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-pin-test-"));
  const pin = pins.packages[0];
  assert.equal(pin.kind, "npm");
  fs.mkdirSync(packagePath(pin, root), { recursive: true });
  fs.writeFileSync(
    path.join(packagePath(pin, root), "package.json"),
    JSON.stringify({ version: "0.0.0-unexpected" }),
  );
  assert.throws(
    () => checkPackages(root),
    /installed version differs from tested pin/,
  );
});

test("sandbox does not inherit credentials, user histories, or provider configuration", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const previous = process.env.UNLISTED_CONFIG_SECRET;
  process.env.UNLISTED_CONFIG_SECRET = "synthetic-fixture-only";
  try {
    const sandbox = createSandbox(agentDir);
    assert.equal(sandbox.env.UNLISTED_CONFIG_SECRET, undefined);
    assert.equal(sandbox.env.PI_TYPESAFE_ENABLED, "0");
    assert.equal(sandbox.env.PI_OFFLINE, "1");
    assert.notEqual(sandbox.env.HOME, process.env.HOME);
    for (const file of ["auth.json", "models.json", "sessions", "trust.json"]) {
      assert.equal(fs.existsSync(path.join(sandbox.config, file)), false);
    }
    assert.equal(
      readJson(path.join(sandbox.config, "settings.json")).defaultProjectTrust,
      "never",
    );
    assert.equal(
      fs.realpathSync(path.join(sandbox.config, "extensions/statusline")),
      path.join(repo, "extensions/statusline"),
    );
  } finally {
    if (previous === undefined) delete process.env.UNLISTED_CONFIG_SECRET;
    else process.env.UNLISTED_CONFIG_SECRET = previous;
  }
});
