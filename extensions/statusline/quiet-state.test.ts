import assert from "node:assert/strict";
import test from "node:test";
import {
  plainLabel,
  modelNotice,
  pressure,
  prioritized,
  statusNotices,
} from "./quiet-state.ts";

test("idle status badges do not create a second row", () => {
  assert.deepEqual(
    statusNotices(
      new Map([
        ["pi-herdr", "herdr 0.9.3"],
        ["blackhole", "bh X 44%"],
        ["other", "enabled"],
        ["subagents", "0 running"],
      ]),
    ),
    [],
  );
});

test("context is absent until pressure is measured", () => {
  for (const value of [undefined, null, NaN, 0, 55.8, 69.9])
    assert.equal(pressure(value), undefined);
  assert.deepEqual(pressure(70), { text: "context 70%", kind: "warning" });
  assert.deepEqual(pressure(90), { text: "context 90%", kind: "error" });
});

test("attention comes before routine activity with explicit labels", () => {
  const items = statusNotices(
    new Map([
      ["subagents", "👥 reviewer running"],
      ["another-agent", "reviewer needs input"],
      ["pi-herdr", "herdr: not installed — herdr.dev"],
      ["provider", "rate limit reached"],
    ]),
  );
  assert.equal(prioritized(items)[0].kind, "error");
  assert.equal(prioritized(items)[1].kind, "warning");
  assert.equal(prioritized(items).at(-1)?.text, "reviewer running");
  assert(items.some((x) => x.text === "ATTN rate limit reached"));
});

test("diagnostics are not mistaken for healthy extension badges", () => {
  const notices = statusNotices(
    new Map([
      ["blackhole", "recall unavailable"],
      ["pi-herdr", "herdr: version unknown — needs ≥ 0.9.0"],
      ["tests", "tests failing"],
    ]),
  );
  assert.deepEqual(
    notices.map((x) => x.kind),
    ["error", "warning", "error"],
  );
});

test("labels cannot emit colors, controls, emoji or Powerline glyphs", () => {
  assert.equal(plainLabel("\x1b[41m🤖 sol\ue0b4\x1b[0m\nmedium"), "sol medium");
  assert.equal(plainLabel("\x1b]52;c;payload\x07testing"), "testing");
});

test("provider limits are reported only from actual request errors", () => {
  assert.equal(modelNotice("stop", "rate limit"), undefined);
  assert.deepEqual(modelNotice("error", "rate limit exceeded"), {
    text: "ATTN provider limit",
    kind: "warning",
  });
  assert.deepEqual(modelNotice("error", "private error payload"), {
    text: "FAIL model request",
    kind: "error",
  });
});

test("repeated notices are shown once", () => {
  assert.equal(
    prioritized([
      { text: "testing", kind: "activity" },
      { text: "testing", kind: "activity" },
    ]).length,
    1,
  );
});
