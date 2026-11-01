import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getAgentDir, VERSION } from "@earendil-works/pi-coding-agent";
import { resolveCli } from "./resolve-cli.mjs";
import {
  checkManagedPackages,
  checkPackages,
  pins,
  readJson,
  repo,
} from "./sandbox.mjs";

const agentDir = path.resolve(process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir());
const cli = resolveCli();
console.log("Verifying Pi executable:", cli);

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
const template = readJson(path.join(repo, "settings.json"));
const live = readJson(path.join(agentDir, "settings.json"));
for (const key of [
  "packages",
  "extensions",
  "defaultTools",
  "defaultProjectTrust",
])
  assert.deepEqual(
    live[key],
    template[key],
    key + ": live infrastructure settings differ",
  );
checkPackages(agentDir, live);
const managed = readJson(path.join(agentDir, "npm/package.json"));
checkManagedPackages(managed);
assert.equal(
  managed.overrides,
  undefined,
  "installed extensions must use upstream dependencies without local overrides",
);
for (const relative of ["next-prompt.json", "web-search.json"]) {
  assert.deepEqual(
    readJson(path.join(agentDir, relative)),
    readJson(path.join(repo, relative)),
    relative + ": live defaults differ from canonical copy",
  );
}
console.log(
  "PASS host version, floating upstream packages, and infrastructure settings",
);
run(path.join(repo, "node_modules/.bin/prettier"), [
  "--check",
  ...readJson(path.join(repo, "verification/hardening-files.json")),
]);
run("npm", ["run", "check"]);
run("npm", ["test"]);
run("python3", ["verification/probe-cleanup.test.py"]);
run("python3", ["verification/hc-smoke.py"], 90000);
run(process.execPath, ["verification/mcp.mjs", agentDir]);
run(process.execPath, ["verification/research-paths.mjs", agentDir]);
run(process.execPath, ["verification/profile.mjs", agentDir]);
run("python3", ["verification/tui.py", agentDir, cli]);
run("python3", ["verification/startup-errors.py", agentDir, cli]);
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
