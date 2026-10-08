import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repo = fileURLToPath(new URL("../", import.meta.url));
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
export const pins = readJson(path.join(repo, "verification/packages.json"));

export function packagePath(pin, agentDir) {
  return pin.kind === "npm"
    ? path.join(agentDir, "npm/node_modules", pin.name)
    : path.join(agentDir, "git", pin.path);
}

export function checkPackages(
  agentDir,
  settings = readJson(path.join(repo, "settings.json")),
) {
  const sources = settings.packages.map((entry) =>
    typeof entry === "string" ? entry : entry.source,
  );
  assert.deepEqual(
    sources,
    pins.packages.map((pin) => pin.source),
    "settings and tested package pins disagree",
  );
  assert(
    !sources.some((source) => source.includes("pi-pstack")),
    "pstack must remain removed",
  );
  for (const pin of pins.packages) {
    const location = packagePath(pin, agentDir);
    if (pin.kind === "npm") {
      assert.equal(
        readJson(path.join(location, "package.json")).version,
        pin.version,
        `${pin.name}: installed version differs from tested pin`,
      );
    } else {
      assert.equal(
        execFileSync("git", ["-C", location, "rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        pin.commit,
        `${pin.path}: installed commit differs from tested pin`,
      );
      assert.equal(
        execFileSync("git", ["-C", location, "diff", "--stat", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        "",
        `${pin.path}: tracked vendor code was modified`,
      );
    }
  }
}

export function createSandbox(agentDir) {
  checkPackages(agentDir);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-config-verify-"));
  const home = path.join(root, "home");
  const config = path.join(home, ".pi/agent");
  const cwd = path.join(root, "workspace");
  fs.mkdirSync(config, { recursive: true });
  fs.mkdirSync(cwd);
  const settings = readJson(path.join(repo, "settings.json"));
  settings.packages = settings.packages.map((entry, index) => {
    const source = packagePath(pins.packages[index], agentDir);
    return typeof entry === "string" ? source : { ...entry, source };
  });
  settings.extensions = settings.extensions.filter(
    (entry) => !entry.includes("builtin:mcp"),
  );
  settings.defaultTools = ["+codemode", "+tool_search"];
  settings.defaultProjectTrust = "never";
  settings.cacheWarming = { enabled: false };
  settings.retry = { enabled: false };
  fs.writeFileSync(
    path.join(config, "settings.json"),
    JSON.stringify(settings, null, 2),
  );
  fs.mkdirSync(path.join(config, "extensions"));
  for (const entry of fs.readdirSync(path.join(repo, "extensions"), {
    withFileTypes: true,
  })) {
    fs.symlinkSync(
      path.join(repo, "extensions", entry.name),
      path.join(config, "extensions", entry.name),
      entry.isDirectory() ? "dir" : "file",
    );
  }
  for (const folder of ["npm", "bin"]) {
    const source = path.join(agentDir, folder);
    if (fs.existsSync(source))
      fs.symlinkSync(source, path.join(config, folder), "dir");
  }
  fs.symlinkSync(
    path.join(repo, "node_modules"),
    path.join(config, "node_modules"),
    "dir",
  );
  if (fs.existsSync(path.join(repo, "themes")))
    fs.symlinkSync(
      path.join(repo, "themes"),
      path.join(config, "themes"),
      "dir",
    );
  for (const relative of [
    "next-prompt.json",
    "pi-blackhole/pi-blackhole-config.json",
  ]) {
    const target = path.join(config, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repo, relative), target);
  }
  fs.writeFileSync(
    path.join(cwd, "fixture.ts"),
    'export const PLUMBING_FIXTURE = "QUIET-PLUMBING-7214";\n',
  );
  execFileSync("git", ["init", "-q", "-b", "config-verify", cwd]);
  const env = {};
  for (const key of [
    "PATH",
    "LANG",
    "LC_ALL",
    "TERM",
    "COLORTERM",
    "TMPDIR",
    "SYSTEMROOT",
    "WINDIR",
    "TZ",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.TERM ??= "xterm-256color";
  Object.assign(env, {
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    PI_CODING_AGENT_DIR: config,
    HERDR_ENV: "0",
    PI_TYPESAFE_ENABLED: "0",
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
    PI_SKIP_VERSION_CHECK: "1",
    PATH: path.join(agentDir, "bin") + path.delimiter + (env.PATH ?? ""),
  });
  return { root, home, config, cwd, env };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const agentDir = process.argv[2];
  assert(agentDir, "agent directory is required");
  console.log(JSON.stringify(createSandbox(agentDir)));
}
