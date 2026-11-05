import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { repo } from "./sandbox.mjs";

const syncedFiles = ["AGENTS.md", "APPEND_SYSTEM.md", "next-prompt.json"];
const syncedDirs = ["prompts", "skills", "themes"];
const runtimeSettings = [
  "deviceId",
  "lastChangelogVersion",
  "extensionChangelogVersions",
];

function listFiles(root, relative) {
  const dir = path.join(root, relative);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".DS_Store") return [];
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? listFiles(root, child) : [child];
  });
}

function comparable(root) {
  const settings = JSON.parse(
    fs.readFileSync(path.join(root, "settings.json"), "utf8"),
  );
  for (const key of runtimeSettings) delete settings[key];
  return settings;
}

function findDrift(source, live) {
  const drift = [];
  const files = new Set(syncedFiles);
  for (const dir of syncedDirs)
    for (const root of [source, live])
      for (const file of listFiles(root, dir)) files.add(file);
  for (const file of [...files].sort()) {
    const [a, b] = [source, live].map((root) => path.join(root, file));
    if (!fs.existsSync(a)) drift.push(file + ": only in live");
    else if (!fs.existsSync(b)) drift.push(file + ": missing from live");
    else if (!fs.readFileSync(a).equals(fs.readFileSync(b)))
      drift.push(file + ": content differs");
  }
  try {
    assert.deepEqual(comparable(live), comparable(source));
  } catch {
    drift.push("settings.json: differs beyond Pi runtime keys");
  }
  return drift;
}

test("live configuration matches the repository", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const drift = findDrift(repo, agentDir);
  assert.deepEqual(drift, [], "live drift:\n" + drift.join("\n"));
});
