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
    !/pstack|meta\/muse-spark|freellmapi\/auto:fast|\/Users\/jondev\/|Use native `subagent`|Use `workflow`|Use `bg_start`|\/btw\b/.test(
      text,
    ),
    file + ": retired routing or personal path remains",
  );
}

test("delegation instructions route directly through Desktop rather than internal agents", () => {
  for (const relative of documents)
    checkCurrent(fs.readFileSync(path.join(repo, relative), "utf8"), relative);
  const skill = fs.readFileSync(path.join(repo, documents[1]), "utf8");
  for (const command of [
    "hc --skill",
    "hc run --bg",
    "hc send",
    "hc wait",
    "herdr-app --skill",
  ])
    assert(skill.includes(command), "missing Desktop instruction: " + command);
  assert(skill.includes("non-recursive"));
  assert(skill.includes("isolated worktrees"));
  assert(skill.includes("not part of this configuration"));
  const prompt = fs.readFileSync(path.join(repo, documents[2]), "utf8");
  assert(prompt.includes("fresh context"));
  assert(prompt.includes("read-only"));
  assert(prompt.includes("hc --skill"));
  assert(prompt.includes("Desktop"));
});

test("Herdr orchestration disables overlapping resources in canonical and deployed settings", () => {
  for (const root of [repo, agentDir]) {
    const settings = JSON.parse(
      fs.readFileSync(path.join(root, "settings.json"), "utf8"),
    );
    assert(
      !settings.packages.some((entry) =>
        /pi-herdr|pi-subagents|pi-btw/.test(
          typeof entry === "string" ? entry : entry.source,
        ),
      ),
      "internal orchestration package must remain removed",
    );
    assert.equal(settings.subagents, undefined);
    for (const relative of [
      "herdr-commands/index.ts",
      "herdr-naming/index.ts",
      "herdr-agent-state.ts",
      "workflows/index.ts",
      "background-terminals/index.ts",
      "statusline/index.ts",
      "ui-customization/index.ts",
      "model-info/index.ts",
      "session-rotation/index.ts",
    ])
      assert(
        settings.extensions.includes("-extensions/" + relative),
        "missing exclusion " + relative,
      );
    const skill = fs.readFileSync(path.join(root, documents[1]), "utf8");
    checkCurrent(skill, root);
    assert(skill.includes("hc --skill"));
    assert(skill.includes("herdr-app --skill"));
    assert(
      !/herdr_(list|spawn|message|get|interrupt|resume)_agent/.test(skill),
    );
  }
  const instructions = fs.readFileSync(
    path.join(agentDir, "AGENTS.md"),
    "utf8",
  );
  assert(instructions.includes("Desktop"));
  assert(instructions.includes("`hc`"));
});

test("retired routing and personal-path regressions are rejected", () => {
  for (const text of [
    "playbooks → pstack",
    "meta/muse-spark-1.3-contributor",
    "freellmapi/auto:fast",
    "/Users/jondev/.pi/agent/skills/review",
    "Use native `subagent`",
    "Use `workflow`",
    "Use `bg_start`",
    "Run /btw",
  ]) {
    assert.throws(
      () => checkCurrent(text, "synthetic instruction"),
      /retired routing or personal path/,
    );
  }
});

test("stock search instructions distinguish built-in tools from shell binaries", () => {
  for (const root of [repo, agentDir]) {
    const instructions = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    for (const tool of ["find", "grep", "ls"])
      assert(
        instructions.includes("\`" + tool + "\`"),
        "missing stock search instruction: " + tool,
      );
    assert(instructions.includes("through \`bash\`"));
    assert(!instructions.includes("~/.pi/agent/bin/fd"));
  }
});

test("Pi infrastructure changes require explicit permission", () => {
  for (const root of [repo, agentDir]) {
    const text = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
    for (const requirement of [
      "explicit permission for that scope",
      "project work is not permission",
      "shims",
      "approved nightly upstream update",
      "not permission for agent-initiated infrastructure edits",
    ])
      assert(
        text.includes(requirement),
        "missing Pi permission rule: " + requirement,
      );
  }
});

test("live delegation skill and review prompt match canonical Desktop instructions", () => {
  for (const relative of documents.slice(1))
    assert.equal(
      fs.readFileSync(path.join(agentDir, relative), "utf8"),
      fs.readFileSync(path.join(repo, relative), "utf8"),
      relative + ": live instructions differ",
    );
});
