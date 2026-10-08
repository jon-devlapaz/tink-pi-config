import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";
import {
  checkPackages,
  packagePath,
  pins,
  readJson,
  repo,
} from "./sandbox.mjs";

const agentDir = path.resolve(process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir());
const cli = process.env.PI_VERIFY_CLI ?? "pi";
const overrides = readJson(
  path.join(repo, "verification/managed-npm.json"),
).overrides;
const ownedFolders = [
  "git-info",
  "herdr-commands",
  "herdr-naming",
  "session-rotation",
  "statusline",
  "todo-replay",
  "ui-customization",
];

export function files(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return files(file);
    return /\.(ts|cjs)$/.test(entry.name) || entry.name === "tsconfig.json"
      ? [file]
      : [];
  });
}

function run(program, args, timeout = 180000) {
  console.log("\n>", program, ...args);
  const env = { ...process.env };
  delete env.npm_config_allow_scripts;
  delete env.NPM_CONFIG_ALLOW_SCRIPTS;
  execFileSync(program, args, { cwd: repo, stdio: "inherit", timeout, env });
}

assert.equal(
  VERSION,
  pins.hostVersion,
  "development SDK differs from tested Pi version",
);
assert.equal(
  execFileSync(cli, ["--version"], { encoding: "utf8", timeout: 10000 }).trim(),
  pins.hostVersion,
  "installed Pi differs from tested version; align SDK and update verification/packages.json after testing",
);
for (const name of [
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-tui",
]) {
  assert.equal(
    readJson(path.join(repo, "package.json")).dependencies[name],
    pins.hostVersion,
    "development packages must remain aligned and pinned",
  );
}
assert.deepEqual(
  readJson(path.join(agentDir, "settings.json")),
  readJson(path.join(repo, "settings.json")),
  "live settings differ from canonical configuration",
);
checkPackages(agentDir);
const managed = readJson(path.join(agentDir, "npm/package.json"));
for (const [name, version] of Object.entries(overrides)) {
  assert.equal(
    managed.overrides?.[name],
    version,
    "restore managed security overrides from verification/managed-npm.json before reinstalling plugins",
  );
  assert.equal(
    readJson(path.join(agentDir, "npm/node_modules", name, "package.json"))
      .version,
    version,
    name + ": installed security override mismatch",
  );
}
for (const pin of pins.packages.filter((pin) => pin.kind === "npm")) {
  assert.equal(
    managed.dependencies[pin.name],
    pin.version,
    pin.name + ": managed manifest must preserve tested pin",
  );
  assert(fs.existsSync(packagePath(pin, agentDir)));
}
for (const folder of ownedFolders) {
  const source = path.join(repo, "extensions", folder);
  for (const file of files(source)) {
    const relative = path.relative(repo, file);
    assert.equal(
      fs.readFileSync(path.join(agentDir, relative), "utf8"),
      fs.readFileSync(file, "utf8"),
      relative + ": live code differs from canonical copy",
    );
  }
}
for (const relative of [
  "next-prompt.json",
  "pi-blackhole/pi-blackhole-config.json",
]) {
  assert.deepEqual(
    readJson(path.join(agentDir, relative)),
    readJson(path.join(repo, relative)),
    relative + ": live defaults differ from canonical copy",
  );
}
console.log(
  "PASS installed version pins, source parity, and managed security overrides",
);
run(path.join(repo, "node_modules/.bin/prettier"), [
  "--check",
  ...readJson(path.join(repo, "verification/hardening-files.json")),
]);
run("npm", ["run", "check"]);
run("npm", ["test"]);
run(process.execPath, ["--test", "verification/sandbox.test.mjs"]);
run(process.execPath, ["verification/mcp.mjs", agentDir]);
run(process.execPath, ["verification/research-paths.mjs", agentDir]);
run(process.execPath, ["verification/profile.mjs", agentDir]);
run("python3", ["verification/tui.py", agentDir, cli]);
run("npm", ["audit", "--audit-level=moderate"]);
run("npm", [
  "--prefix",
  path.join(agentDir, "npm"),
  "audit",
  "--audit-level=moderate",
]);
console.log(
  "\nPASS post-update verification; no paid model calls or real user sessions exercised",
);
