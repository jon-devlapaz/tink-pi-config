import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("public defaults ask before trusting executable project resources", () => {
  assert.equal(read("settings.json").defaultProjectTrust, "ask");
});

test("managed install contains only configured npm packages", () => {
  const configured = Object.fromEntries(
    read("verification/packages.json")
      .packages.filter((entry) => entry.kind === "npm")
      .map((entry) => [entry.name, "latest"]),
  );
  assert.deepEqual(
    read("verification/managed-npm.json").dependencies,
    configured,
  );
});

test("upstream package dependencies are not overridden locally", () => {
  assert.equal(read("verification/managed-npm.json").overrides, undefined);
});

test("repository security overrides are scoped floating ranges, not hard pins", () => {
  const overrides = read("package.json").overrides ?? {};
  assert.deepEqual(Object.keys(overrides).sort(), ["minimatch", "undici"]);
  for (const range of Object.values(overrides)) {
    assert.match(range, /^\^\d+\.\d+\.\d+$/);
  }
});

test("private configuration and runtime artifacts stay outside commits", () => {
  const privateFiles = [
    "auth.json",
    "models.json",
    "mcp.json",
    "mcp-project-approvals.json",
    "backups/probe.json",
    "extension-backups/probe.ts",
    "sessions/probe.jsonl",
    "sessions-archive/probe.jsonl",
    "worktrees/probe.txt",
    "run-history.jsonl",
  ];
  const ignored = new Set(
    execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: repo,
      input: privateFiles.join("\n") + "\n",
      encoding: "utf8",
    })
      .trim()
      .split("\n"),
  );
  for (const file of privateFiles)
    assert(ignored.has(file), `${file} is publishable`);
  for (const file of [
    "settings.json",
    "models.json.example",
    "web-search.json",
  ]) {
    const result = spawnSync("git", ["check-ignore", "--no-index", file], {
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, `${file}: ${result.stderr}`);
  }
});

test("model template contains no private network endpoints or literal credentials", () => {
  for (const [name, provider] of Object.entries(
    read("models.json.example").providers,
  )) {
    if (provider.apiKey)
      assert(provider.apiKey.startsWith("$"), `${name}: literal key`);
    if (!provider.baseUrl) continue;
    const url = new URL(provider.baseUrl);
    assert(!url.username && !url.password, `${name}: URL credentials`);
    const octets = url.hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part)))
      continue;
    const [a, b] = octets;
    assert(
      !(
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127)
      ),
      `${name}: private network endpoint`,
    );
  }
});
