import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { repo } from "./sandbox.mjs";

const syncedFiles = [
  "AGENTS.md",
  "APPEND_SYSTEM.md",
  "next-prompt.json",
  "slye.json",
];
const syncedDirs = ["prompts", "skills", "themes"];
const runtimeSettings = [
  "deviceId",
  "lastChangelogVersion",
  "extensionChangelogVersions",
];
const generatedMarkers = new Set([
  ".DS_Store",
  ".flywheel-installed-by-pi-mono",
]);

function listFiles(root, relative) {
  const dir = path.join(root, relative);
  if (!fs.existsSync(dir)) return [];
  const piMonoSkills =
    relative === "skills" &&
    fs.existsSync(path.join(dir, ".flywheel-installed-by-pi-mono"));
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (generatedMarkers.has(entry.name)) return [];
    if (
      piMonoSkills &&
      entry.isDirectory() &&
      entry.name.startsWith("flywheel")
    )
      return [];
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

test("Pi Mono-owned Flywheel skills stay outside this repository inventory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-config-live-drift-"));
  const skills = path.join(root, "skills");
  try {
    fs.mkdirSync(path.join(skills, "flywheel-auto"), { recursive: true });
    fs.mkdirSync(path.join(skills, "operator-skill"));
    fs.writeFileSync(path.join(skills, ".flywheel-installed-by-pi-mono"), "");
    fs.writeFileSync(path.join(skills, "flywheel-auto/SKILL.md"), "external\n");
    fs.writeFileSync(path.join(skills, "operator-skill/SKILL.md"), "managed\n");
    assert.deepEqual(listFiles(root, "skills"), [
      "skills/operator-skill/SKILL.md",
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("live configuration matches the repository", () => {
  const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
  const drift = findDrift(repo, agentDir);
  assert.deepEqual(drift, [], "live drift:\n" + drift.join("\n"));
});
