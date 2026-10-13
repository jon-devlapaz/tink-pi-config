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

test("synchronization preserves globally enabled web access and removes the MCP adapter", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const canonical = settings();
  const live = readJson(path.join(agentDir, "settings.json"));
  const template = readJson(path.join(repo, "verification/managed-npm.json"));
  const managed = readJson(path.join(agentDir, "npm/package.json"));
  for (const config of [canonical, live]) {
    const source = (entry) =>
      typeof entry === "string" ? entry : entry.source;
    assert(
      !config.packages.some((entry) =>
        source(entry).includes("pi-mcp-adapter"),
      ),
    );
    const web = config.packages.find((entry) =>
      source(entry).startsWith("npm:pi-web-access@"),
    );
    assert(web, "web access must remain configured");
    assert.equal(source(web), "npm:pi-web-access@0.40.0");
    assert.equal(
      web.extensions,
      undefined,
      "web access must use enabled package defaults",
    );
    assert(config.extensions.includes("+builtin:mcp"));
  }
  assert(!pins.packages.some((pin) => pin.name === "pi-mcp-adapter"));
  assert.equal(
    pins.packages.find((pin) => pin.name === "pi-web-access").version,
    "0.40.0",
  );
  for (const manifest of [template, managed]) {
    assert.equal(manifest.dependencies["pi-mcp-adapter"], undefined);
    assert.equal(manifest.dependencies["pi-web-access"], "0.40.0");
  }
  assert.equal(
    fs.existsSync(path.join(agentDir, "npm/node_modules/pi-mcp-adapter")),
    false,
  );
});

test("synchronization keeps the custom statusline without the upstream package", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const name = "@narumitw/pi-statusline";
  for (const root of [repo, agentDir]) {
    assert(
      !readJson(path.join(root, "settings.json")).packages.some((entry) =>
        (typeof entry === "string" ? entry : entry.source).includes(name),
      ),
    );
    assert(fs.existsSync(path.join(root, "extensions/statusline/index.ts")));
  }
  assert(!pins.packages.some((pin) => pin.name === name));
  for (const file of [
    path.join(repo, "verification/managed-npm.json"),
    path.join(agentDir, "npm/package.json"),
  ])
    assert.equal(readJson(file).dependencies[name], undefined);
  assert.equal(
    fs.existsSync(path.join(agentDir, "npm/node_modules", name)),
    false,
  );
});

test("web safety defaults are credential-free and match the live configuration", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const canonical = readJson(path.join(repo, "web-search.json"));
  assert.deepEqual(readJson(path.join(agentDir, "web-search.json")), canonical);
  assert.deepEqual(canonical.searchRouting.providers, ["exa", "duckduckgo"]);
  assert.equal(canonical.searchRouting.useCurrentModel, false);
  assert.deepEqual(canonical.webSearch.allowedProviders, ["exa", "duckduckgo"]);
  assert.deepEqual(canonical.fetchRouting.providers, ["http"]);
  assert.equal(canonical.fetchRouting.allowRemoteHostedProviders, false);
  assert.deepEqual(canonical.fetch.allowedModes, ["readable", "raw"]);
  assert.equal(canonical.workflow, "none");
  assert.equal(canonical.allowBrowserCookies, false);
  assert.equal(canonical.autoOpenBrowser, false);
  for (const feature of ["githubClone", "youtube", "video", "image"])
    assert.equal(canonical[feature].enabled, false);
  const checkKeys = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert(
        !/api.?key|secret|password|token|credential|auth/i.test(key),
        "credential setting must not be stored in canonical web defaults: " +
          key,
      );
      checkKeys(child);
    }
  };
  checkKeys(canonical);
});

test("setup instructions match the tested host and global web defaults", () => {
  const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8");
  const versions = [...readme.matchAll(/Pi (\d+\.\d+\.\d+)/g)].map(
    (match) => match[1],
  );
  assert(versions.length > 0);
  assert(versions.every((version) => version === pins.hostVersion));
  assert(readme.includes("Web tools load globally"));
  assert(readme.includes("[web-search.json](web-search.json)"));
  assert(!readme.includes("Research providers load only"));
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

test("sandbox copies safe web defaults without credentials, histories, or model configuration", () => {
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
    assert.deepEqual(
      readJson(path.join(sandbox.config, "web-search.json")),
      readJson(path.join(repo, "web-search.json")),
    );
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
