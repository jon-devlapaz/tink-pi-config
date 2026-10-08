import assert from "node:assert/strict";
import test from "node:test";
import { AgentRuns } from "./agent-runs.ts";

test("count observed runs, not future workflow agents or foreign sessions", () => {
  const runs = new AgentRuns();
  runs.started(
    { id: "foreign", sessionId: "other", agent: "reviewer" },
    "current",
  );
  assert.deepEqual(runs.notices(), []);
  runs.started(
    {
      id: "a",
      sessionId: "current",
      agent: "reviewer",
      agents: ["reviewer", "writer"],
    },
    "current",
  );
  assert.equal(runs.notices()[0].text, "1 agent run active");
});

test("attention is a reported notice, cleared by completion or acknowledgment", () => {
  const runs = new AgentRuns();
  runs.started({ id: "a", sessionId: "s", agent: "reviewer" }, "s");
  runs.control({
    event: { runId: "a", type: "needs_attention", agent: "reviewer" },
  });
  assert.equal(runs.notices()[0].text, "ATTN reviewer requested attention");
  runs.acknowledge();
  assert.equal(runs.notices().length, 1);
  runs.completed({ runId: "a", results: [{ status: "complete" }] });
  assert.deepEqual(runs.notices(), []);
});

test("failed runs remain actionable; reset does not leak old session state", () => {
  const runs = new AgentRuns();
  runs.started({ id: "a", sessionId: "s", agent: "reviewer" }, "s");
  runs.completed({ runId: "a", results: [{ status: "error" }] });
  assert.deepEqual(runs.notices(), [
    { text: "FAIL reviewer run", kind: "error" },
  ]);
  runs.reset();
  assert.deepEqual(runs.notices(), []);
});
