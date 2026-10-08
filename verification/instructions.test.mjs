import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { repo } from "./sandbox.mjs";

const agentDir = process.env.PI_VERIFY_AGENT_DIR ?? getAgentDir();
const documents = [
  "AGENTS.md",
  "skills/subagents/SKILL.md",
  "prompts/subagent-code-review.md",
];

function checkCurrent(text, file) {
  assert(
    !/pstack|meta\/muse-spark|freellmapi\/auto:fast|\/Users\/jondev\//.test(
      text,
    ),
    file + ": retired routing or personal path remains",
  );
}

test("delegation instructions use configured native routing rather than retired tools and models", () => {
  for (const relative of documents)
    checkCurrent(fs.readFileSync(path.join(repo, relative), "utf8"), relative);
  const skill = fs.readFileSync(
    path.join(repo, "skills/subagents/SKILL.md"),
    "utf8",
  );
  assert(skill.includes("Use native `subagent`"));
  assert(skill.includes("model-only"));
  assert(skill.includes("Do not grant recursive delegation"));
  const prompt = fs.readFileSync(
    path.join(repo, "prompts/subagent-code-review.md"),
    "utf8",
  );
  assert(prompt.includes("fresh context"));
  assert(prompt.includes("read-only"));
});

test("retired routing and personal-path regressions are rejected", () => {
  for (const text of [
    "playbooks → pstack",
    "meta/muse-spark-1.3-contributor",
    "freellmapi/auto:fast",
    "/Users/jondev/.pi/agent/skills/review",
  ]) {
    assert.throws(
      () => checkCurrent(text, "synthetic instruction"),
      /retired routing or personal path/,
    );
  }
});

test("live delegation skill and review prompt match the canonical instructions", () => {
  for (const relative of documents.slice(1)) {
    assert.equal(
      fs.readFileSync(path.join(agentDir, relative), "utf8"),
      fs.readFileSync(path.join(repo, relative), "utf8"),
      relative + ": live instructions differ",
    );
  }
  assert(
    fs.existsSync(
      path.join(
        agentDir,
        "npm/node_modules/pi-subagents/skills/pi-subagents/SKILL.md",
      ),
    ),
  );
});
