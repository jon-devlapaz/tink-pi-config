import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDefaultAgentName,
  extractActiveTaskLabel,
  formatTaskTitle,
} from "./index.ts";

test("deriveDefaultAgentName handles home directory and .pi as orchestrator", () => {
  assert.equal(deriveDefaultAgentName("/Users/jondev/.pi"), "orchestrator");
  assert.equal(
    deriveDefaultAgentName(process.env.HOME || "/Users/jondev"),
    "orchestrator",
  );
});

test("deriveDefaultAgentName derives lead name for projects", () => {
  assert.equal(
    deriveDefaultAgentName("/Users/jondev/dev/active/tink"),
    "tink-lead",
  );
  assert.equal(
    deriveDefaultAgentName("/Users/jondev/dev/active/tink-skills"),
    "tink-skills-lead",
  );
  assert.equal(
    deriveDefaultAgentName("/Users/jondev/dev/active/ai-native-sdlc"),
    "ai-native-sdlc-lead",
  );
});

test("formatTaskTitle formats role and active task with truncation", () => {
  assert.equal(
    formatTaskTitle("orchestrator", "running test suite"),
    "orchestrator: running test suite",
  );

  const longTask =
    "investigating across multiple repositories for quick wins in the tink ecosystem";
  const formatted = formatTaskTitle("worker", longTask, 40);
  assert.ok(formatted.length <= 40);
  assert.ok(formatted.startsWith("worker: "));
  assert.ok(formatted.endsWith("…"));
});

test("extractActiveTaskLabel returns in_progress activeForm or subject", () => {
  const tasks = [
    { id: 1, subject: "Initial task", status: "completed" },
    {
      id: 2,
      subject: "Active task",
      status: "in_progress",
      activeForm: "compiling code",
    },
    { id: 3, subject: "Pending task", status: "pending" },
  ];
  assert.equal(extractActiveTaskLabel(tasks), "compiling code");

  const tasksWithoutForm = [
    { id: 1, subject: "Active task no form", status: "in_progress" },
  ];
  assert.equal(extractActiveTaskLabel(tasksWithoutForm), "Active task no form");

  assert.equal(extractActiveTaskLabel([]), undefined);
  assert.equal(
    extractActiveTaskLabel([{ id: 1, status: "completed" }]),
    undefined,
  );
  assert.equal(extractActiveTaskLabel(null), undefined);
});
