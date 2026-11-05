import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  checkManagedPackages,
  checkPackages,
  createSandbox,
  packagePath,
  pins,
  readJson,
  repo,
} from "./sandbox.mjs";

const settings = () => readJson(path.join(repo, "settings.json"));

test("stock search is enabled without the custom file-search extension", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  for (const root of [repo, agentDir]) {
    const config = readJson(path.join(root, "settings.json"));
    for (const tool of ["grep", "find", "ls"])
      assert(
        config.defaultTools?.includes("+" + tool),
        "stock search tool disabled: " + tool,
      );
    assert.equal(
      fs.lstatSync(path.join(root, "extensions/file-search"), {
        throwIfNoEntry: false,
      }),
      undefined,
    );
    assert(
      !config.packages.some((entry) =>
        /(?:pi-)?file-search/.test(
          typeof entry === "string" ? entry : entry.source,
        ),
      ),
    );
  }
  assert(
    !readJson(path.join(repo, "package.json")).scripts.test.includes(
      "file-search",
    ),
  );
});

test("live settings are separate from the configuration source repo", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const live = path.join(agentDir, "settings.json");
  assert(
    !fs.lstatSync(live).isSymbolicLink(),
    "runtime settings must not be a source-repo symlink",
  );
  assert.notEqual(
    fs.realpathSync(live),
    fs.realpathSync(path.join(repo, "settings.json")),
  );
});

test("published utilities load as upstream packages, not local copies", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  for (const root of [repo, agentDir]) {
    const sources = readJson(path.join(root, "settings.json")).packages.map(
      (entry) => (typeof entry === "string" ? entry : entry.source),
    );
    for (const name of ["copy-all", "git-info"]) {
      assert(sources.includes("git:github.com/jon-devlapaz/pi-" + name));
      assert.equal(
        fs.lstatSync(path.join(root, "extensions", name), {
          throwIfNoEntry: false,
        }),
        undefined,
      );
    }
  }
});

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
    const web = config.packages.find(
      (entry) => source(entry) === "npm:pi-web-access",
    );
    assert(web, "web access must remain configured");
    assert.equal(source(web), "npm:pi-web-access");
    assert.equal(
      web.extensions,
      undefined,
      "web access must use enabled package defaults",
    );
    assert(config.extensions.includes("+builtin:mcp"));
  }
  assert(!pins.packages.some((pin) => pin.name === "pi-mcp-adapter"));
  assert.equal(
    pins.packages.find((pin) => pin.name === "pi-web-access").source,
    "npm:pi-web-access",
  );
  for (const manifest of [template, managed]) {
    assert.equal(manifest.dependencies["pi-mcp-adapter"], undefined);
    assert.equal(typeof manifest.dependencies["pi-web-access"], "string");
  }
  assert.equal(
    fs.existsSync(path.join(agentDir, "npm/node_modules/pi-mcp-adapter")),
    false,
  );
});

test("stock UI and Desktop orchestration stay free of overlapping packages", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const retired = [
    "@narumitw/pi-statusline",
    "pi-subagents",
    "pi-btw",
    "@andrewjacop/pi-herdr",
  ];
  for (const root of [repo, agentDir]) {
    const config = readJson(path.join(root, "settings.json"));
    const sources = config.packages.map((entry) =>
      typeof entry === "string" ? entry : entry.source,
    );
    for (const name of retired)
      assert(!sources.some((source) => source.includes(name)), name);
    assert.equal(config.subagents, undefined);
    assert.equal(config.quietStartup, true);
  }
  for (const name of retired) {
    assert(!pins.packages.some((pin) => pin.name === name));
    for (const file of [
      path.join(repo, "verification/managed-npm.json"),
      path.join(agentDir, "npm/package.json"),
    ])
      assert.equal(readJson(file).dependencies[name], undefined);
  }
});

test("extension sources float without duplicate SDK wiring", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const manifest = readJson(path.join(repo, "package.json"));
  assert.equal(manifest.dependencies["pi-typesafe"], undefined);
  assert.equal(manifest.overrides?.["pi-typesafe"], undefined);
  assert.equal(
    readJson(path.join(agentDir, "npm/package.json")).overrides?.[
      "pi-typesafe"
    ],
    undefined,
  );
  for (const entry of pins.packages) {
    assert.equal(entry.version, undefined);
    assert.equal(entry.commit, undefined);
    assert.equal(
      entry.source,
      entry.kind === "npm" ? `npm:${entry.name}` : `git:${entry.path}`,
    );
  }
  const expected = Object.fromEntries(
    pins.packages
      .filter((entry) => entry.kind === "npm")
      .map((entry) => [entry.name, "latest"]),
  );
  assert.deepEqual(
    readJson(path.join(repo, "verification/managed-npm.json")).dependencies,
    expected,
  );
  for (const manifest of [
    readJson(path.join(repo, "verification/managed-npm.json")),
    readJson(path.join(agentDir, "npm/package.json")),
  ]) {
    checkManagedPackages(manifest);
  }
});

test("retained task list loads upstream directly without a local wrapper", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const pin = pins.packages.find(
    (entry) => entry.name === "@juicesharp/rpiv-todo",
  );
  for (const root of [repo, agentDir]) {
    const config = readJson(path.join(root, "settings.json"));
    const todo = config.packages.find(
      (entry) =>
        (typeof entry === "string" ? entry : entry.source) ===
        "npm:@juicesharp/rpiv-todo",
    );
    assert.equal(todo, pin.source);
    assert.equal(
      fs.lstatSync(path.join(root, "extensions/todo-replay"), {
        throwIfNoEntry: false,
      }),
      undefined,
    );
    assert(
      !config.packages.some((entry) =>
        /pi-subagents|pi-btw/.test(
          typeof entry === "string" ? entry : entry.source,
        ),
      ),
    );
  }
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

test("unconfigured package sources fail before loading extensions", () => {
  const modified = settings();
  modified.packages[0] = "npm:pi-typesafe";
  assert.throws(
    () => checkPackages("/nonexistent", modified),
    /settings and configured package sources disagree/,
  );
});

function installedPackageFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-package-test-"));
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  for (const entry of pins.packages) {
    const target = packagePath(entry, root);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.kind === "git") {
      fs.symlinkSync(packagePath(entry, agentDir), target, "dir");
    } else {
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "package.json"),
        JSON.stringify({ name: entry.name, version: "99.0.0" }),
      );
    }
  }
  return root;
}

test("upstream extension version changes do not require updating verification pins", () => {
  assert.doesNotThrow(() => checkPackages(installedPackageFixture()));
});

function installedGitFixture() {
  const root = installedPackageFixture();
  const entry = pins.packages.find((entry) => entry.kind === "git");
  const target = packagePath(entry, root);
  const source = fs.realpathSync(target);
  fs.unlinkSync(target);
  execFileSync("git", [
    "-c",
    "core.hooksPath=/dev/null",
    "clone",
    "--quiet",
    "--no-hardlinks",
    source,
    target,
  ]);
  execFileSync("git", [
    "-C",
    target,
    "remote",
    "set-url",
    "origin",
    `https://${entry.path}.git`,
  ]);
  return { root, entry, target };
}

test("floating Git sources accept equivalent origin transports without commit pins", () => {
  const { root, entry, target } = installedGitFixture();
  assert.equal(entry.commit, undefined);
  for (const origin of [
    `https://${entry.path}`,
    `https://${entry.path}.git/`,
    `ssh://git@${entry.path}.git`,
    `git@${entry.path.replace("/", ":")}.git`,
    `git://${entry.path}.git`,
  ]) {
    execFileSync("git", ["-C", target, "remote", "set-url", "origin", origin]);
    assert.doesNotThrow(() => checkPackages(root));
  }
});

test("npm lockfile churn is allowed but manifest edits are rejected", () => {
  const { root, target } = installedGitFixture();
  const lock = path.join(target, "package-lock.json");
  fs.writeFileSync(lock, '{"fixture":1}\n');
  execFileSync("git", ["-C", target, "add", "-f", "--", "package-lock.json"]);
  execFileSync("git", [
    "-C",
    target,
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "user.name=fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture lockfile",
  ]);
  fs.writeFileSync(lock, '{"fixture":2}\n');
  assert.doesNotThrow(() => checkPackages(root));
  fs.appendFileSync(path.join(target, "package.json"), "\n");
  assert.throws(() => checkPackages(root), /tracked vendor code was modified/);
});

test("wrong clean Git upstream identity is rejected", () => {
  const { root, target } = installedGitFixture();
  execFileSync("git", [
    "-C",
    target,
    "remote",
    "set-url",
    "origin",
    "https://github.com/earendil-works/pi-voice.git",
  ]);
  assert.throws(() => checkPackages(root), /Git upstream identity mismatch/);
});

test("missing Git origin and local-path origins are rejected", () => {
  const { root, target } = installedGitFixture();
  execFileSync("git", ["-C", target, "remote", "remove", "origin"]);
  assert.throws(() => checkPackages(root), /Git origin is unavailable/);
  execFileSync("git", [
    "-C",
    target,
    "remote",
    "add",
    "origin",
    "/tmp/unrelated-repository",
  ]);
  assert.throws(() => checkPackages(root), /Git repository URL is invalid/);
});

test("all Git fetch URLs must match the configured upstream", () => {
  const { root, target } = installedGitFixture();
  execFileSync("git", [
    "-C",
    target,
    "remote",
    "set-url",
    "--add",
    "origin",
    "https://github.com/unrelated/package.git",
  ]);
  assert.throws(() => checkPackages(root), /Git upstream identity mismatch/);
});

test("Git origin identity rejects lookalike hosts and URL suffixes", () => {
  const { root, entry, target } = installedGitFixture();
  for (const origin of [
    `https://${entry.path.replace("github.com", "github.com.example.invalid")}.git`,
    `https://${entry.path}.git?repository=other`,
    `https://${entry.path}.git#other`,
  ]) {
    execFileSync("git", ["-C", target, "remote", "set-url", "origin", origin]);
    assert.throws(
      () => checkPackages(root),
      /Git upstream identity mismatch|Git repository URL is invalid/,
    );
  }
});

test("wrong installed package identity is rejected", () => {
  const root = installedPackageFixture();
  const entry = pins.packages.find((entry) => entry.kind === "npm");
  fs.writeFileSync(
    path.join(packagePath(entry, root), "package.json"),
    JSON.stringify({ name: "unexpected-package", version: "99.0.0" }),
  );
  assert.throws(
    () => checkPackages(root),
    /installed package identity mismatch/,
  );
});

test("missing installed version metadata is rejected", () => {
  const root = installedPackageFixture();
  const entry = pins.packages.find((entry) => entry.kind === "npm");
  fs.writeFileSync(
    path.join(packagePath(entry, root), "package.json"),
    JSON.stringify({ name: entry.name }),
  );
  assert.throws(
    () => checkPackages(root),
    /installed version metadata is missing/,
  );
});

test("managed installs allow npm-generated ranges but reject extra dependencies", () => {
  const manifest = readJson(path.join(repo, "verification/managed-npm.json"));
  const name = Object.keys(manifest.dependencies)[0];
  manifest.dependencies[name] = "^99.0.0";
  assert.doesNotThrow(() => checkManagedPackages(manifest));
  manifest.dependencies["unexpected-package"] = "latest";
  assert.throws(
    () => checkManagedPackages(manifest),
    /managed package identities disagree/,
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
      readJson(path.join(sandbox.config, "settings.json")).lastChangelogVersion,
      pins.hostVersion,
      "sandbox must not show the changelog for the tested Pi version",
    );
    assert.equal(
      fs.existsSync(path.join(sandbox.config, "extensions/todo-replay")),
      false,
    );
    const todo = pins.packages.find(
      (entry) => entry.name === "@juicesharp/rpiv-todo",
    );
    assert(
      readJson(path.join(sandbox.config, "settings.json")).packages.includes(
        packagePath(todo, agentDir),
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.UNLISTED_CONFIG_SECRET;
    else process.env.UNLISTED_CONFIG_SECRET = previous;
  }
});
