import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { resolveCli } from "./resolve-cli.mjs";
import { repo, pins } from "./sandbox.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cli-selection-"));
  const local = path.join(root, "project/node_modules/.bin");
  const global = path.join(root, "global-bin");
  for (const directory of [local, global])
    fs.mkdirSync(directory, { recursive: true });
  for (const [directory, version] of [
    [local, pins.hostVersion],
    [global, "0.0.0-global-drift"],
  ]) {
    fs.writeFileSync(
      path.join(directory, "pi"),
      `#!/bin/sh\nprintf '%s\\n' '${version}'\n`,
      { mode: 0o700 },
    );
  }
  return { root, local, global, PATH: [local, global].join(path.delimiter) };
}

test("default selection skips npm-injected SDK CLI and returns an absolute global executable", () => {
  const f = fixture();
  assert.equal(resolveCli({ PATH: f.PATH }), path.join(f.global, "pi"));
  assert.equal(
    resolveCli({ PATH: "project/node_modules/.bin:global-bin" }, f.root),
    path.join(f.global, "pi"),
  );
  assert.throws(
    () => resolveCli({ PATH: f.local }),
    /Global Pi executable not found/,
  );
});

test("explicit target is respected, resolved absolutely, and never falls back silently", () => {
  const f = fixture();
  assert.equal(
    resolveCli({ PATH: f.PATH, PI_VERIFY_CLI: "pi" }),
    path.join(f.local, "pi"),
  );
  assert.equal(
    resolveCli({ PATH: f.PATH, PI_VERIFY_CLI: "global-bin/pi" }, f.root),
    path.join(f.global, "pi"),
  );
  assert.throws(
    () => resolveCli({ PATH: f.PATH, PI_VERIFY_CLI: "missing-pi" }),
    /PI_VERIFY_CLI executable not found/,
  );
  assert.throws(
    () => resolveCli({ PATH: f.PATH, PI_VERIFY_CLI: "" }),
    /must not be empty/,
  );
});

test("direct verifier rejects global version drift despite a matching npm-local SDK CLI", () => {
  const f = fixture();
  const result = spawnSync(
    process.execPath,
    [path.join(repo, "verification/verify-updates.mjs")],
    {
      cwd: repo,
      encoding: "utf8",
      env: {
        PATH: f.PATH + path.delimiter + process.env.PATH,
        PI_VERIFY_AGENT_DIR: path.join(f.root, "no-live-settings"),
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert(result.stdout.includes(path.join(f.global, "pi")));
  assert(
    result.stderr.includes("installed Pi differs from tested version"),
    result.stderr,
  );
});

test("doctor freezes the global CLI before npm runs and preserves verification exit status", () => {
  const f = fixture();
  fs.writeFileSync(
    path.join(f.global, "npm"),
    '#!/bin/sh\nprintf "%s\\n" "$PI_VERIFY_CLI"\nexit 37\n',
    { mode: 0o700 },
  );
  const invoke = (extra = {}) =>
    spawnSync("/bin/sh", [path.join(repo, "bin/pi-doctor")], {
      cwd: f.root,
      encoding: "utf8",
      env: { PATH: f.PATH + path.delimiter + process.env.PATH, ...extra },
    });
  const result = invoke();
  assert.equal(result.status, 37, result.stderr);
  assert.equal(result.stdout.trim(), path.join(f.global, "pi"));
  const explicit = invoke({ PI_VERIFY_CLI: path.join(f.local, "pi") });
  assert.equal(explicit.status, 37, explicit.stderr);
  assert.equal(explicit.stdout.trim(), path.join(f.local, "pi"));
  const missing = invoke({ PI_VERIFY_CLI: path.join(f.root, "missing") });
  assert.notEqual(missing.status, 0);
  assert(!missing.stdout.includes(f.global));
});
