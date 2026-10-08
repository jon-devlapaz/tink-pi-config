import assert from "node:assert/strict";
import test from "node:test";
import { visibleStatuses } from "./status-filter.ts";

test("hide healthy herdr version without changing the status registry", () => {
  const statuses = new Map([
    ["pi-herdr", "herdr 0.9.3"],
    ["subagents", "researcher running"],
  ]);
  assert.deepEqual(
    [...visibleStatuses(statuses)],
    [["subagents", "researcher running"]],
  );
  assert.equal(statuses.get("pi-herdr"), "herdr 0.9.3");
});

test("retain herdr failures and unexpected diagnostic values", () => {
  for (const value of [
    "herdr: not installed — herdr.dev",
    "herdr: version unknown — needs ≥ 0.9.0",
    "herdr: too old (0.8.0 < 0.9.0)",
    "herdr 0.9.3 — disconnected",
  ]) {
    assert.equal(
      visibleStatuses(new Map([["pi-herdr", value]])).get("pi-herdr"),
      value,
    );
  }
});

test("retain unrelated extension activity and warnings", () => {
  const statuses = new Map([
    ["subagents", "reviewer needs attention"],
    ["retry", "retrying request"],
    ["next-prompt", "suggestion unavailable"],
  ]);
  assert.deepEqual([...visibleStatuses(statuses)], [...statuses]);
});
