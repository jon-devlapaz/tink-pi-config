import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { repo } from "./sandbox.mjs";

const gitConfig = (key) => {
  try {
    return execFileSync("git", ["config", "--local", "--get", key], {
      cwd: repo,
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
};

test("settings.json clean filter is defined as documented in the README", () => {
  assert.match(
    fs.readFileSync(path.join(repo, ".gitattributes"), "utf8"),
    /^settings\.json filter=strip-pi-runtime$/m,
  );
  const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8");
  const documented = Object.fromEntries(
    [
      ...readme.matchAll(/^git config (filter\.strip-pi-runtime\.\w+) (.+)$/gm),
    ].map(([, key, value]) => [key, value.replace(/^"(.*)"$/, "$1")]),
  );
  assert.deepEqual(Object.keys(documented).sort(), [
    "filter.strip-pi-runtime.clean",
    "filter.strip-pi-runtime.smudge",
  ]);
  for (const [key, value] of Object.entries(documented))
    assert.equal(
      gitConfig(key),
      value,
      `${key} is not set as documented; run: git config ${key} "${value}"`,
    );

  const cleaned = JSON.parse(
    execSync(documented["filter.strip-pi-runtime.clean"], {
      cwd: repo,
      input: JSON.stringify({
        deviceId: "device",
        lastChangelogVersion: "1.0.0",
        enabledModels: ["provider/model"],
        theme: "system",
      }),
      encoding: "utf8",
    }),
  );
  assert.deepEqual(cleaned, {
    enabledModels: ["provider/model"],
    theme: "system",
  });
});
