import assert from "node:assert/strict";
import test from "node:test";

const { ProgramStatusReporter } = await import(
  new URL(
    "./modes/interactive/program-status-reporter.js",
    import.meta.resolve("@earendil-works/pi-coding-agent"),
  )
);

function fixture() {
  const reports = [];
  let name = "Desktop fixture";
  const reporter = new ProgramStatusReporter(
    () => ({ setProgramStatus: (status) => reports.push(status) }),
    () => name,
  );
  return {
    reporter,
    reports,
    state: () => reports.at(-1),
    rename(value) {
      name = value;
      reporter.handleEvent({ type: "session_info_changed" });
    },
  };
}

const assistant = (stopReason, errorMessage) => ({
  type: "message_end",
  message: { role: "assistant", stopReason, errorMessage },
});

test("native Pi reports working, blocked and settled states without a Herdr extension", () => {
  const { reporter, state } = fixture();
  reporter.reset();
  assert.deepEqual(state(), { state: "idle", app: "pi" });
  reporter.handleEvent({ type: "agent_start" });
  assert.deepEqual(state(), {
    state: "working",
    message: "Desktop fixture",
    app: "pi",
  });
  reporter.setBlocked("dialog", { message: "Approval required" });
  assert.equal(state().state, "blocked");
  assert.equal(state().message, "Approval required");
  reporter.setBlocked("dialog", undefined);
  assert.equal(state().state, "working");
  reporter.handleEvent(assistant("stop"));
  assert.equal(state().state, "working");
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.equal(state().state, "done");
});

test("provider errors report only their first line and cancellation returns to idle", () => {
  const { reporter, state } = fixture();
  reporter.handleEvent({ type: "agent_start" });
  reporter.handleEvent(
    assistant("error", "Fixture failure\nprivate diagnostic"),
  );
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.deepEqual(state(), {
    state: "error",
    message: "Fixture failure",
    app: "pi",
  });
  reporter.handleEvent({ type: "agent_start" });
  reporter.handleEvent({ type: "agent_settled", aborted: true });
  assert.deepEqual(state(), { state: "idle", app: "pi" });
});

test("a successful retry clears errors and session replacement resets stale outcomes", () => {
  const { reporter, state } = fixture();
  reporter.handleEvent({ type: "agent_start" });
  reporter.handleEvent(assistant("error", "Transient failure"));
  reporter.handleEvent(assistant("stop"));
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.equal(state().state, "done");
  reporter.reset();
  assert.equal(state().state, "idle");
});

test("native session-name status updates are deduplicated", () => {
  const { reporter, reports, state, rename } = fixture();
  reporter.handleEvent({ type: "agent_start" });
  rename("Renamed fixture");
  assert.equal(state().message, "Renamed fixture");
  const count = reports.length;
  reporter.report();
  assert.equal(
    reports.length,
    count,
    "identical status must not be emitted twice",
  );
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.equal(state().message, "Renamed fixture");
});

test("nested approvals and compaction retain truthful status precedence", () => {
  const { reporter, state } = fixture();
  reporter.handleEvent({ type: "agent_start" });
  reporter.handleEvent({ type: "compaction_start" });
  assert.equal(state().message, "Compacting context");
  reporter.setBlocked("outer", { message: "Outer approval" });
  reporter.setBlocked("inner", { message: "Inner approval" });
  assert.equal(state().message, "Inner approval");
  reporter.setBlocked("inner", undefined);
  assert.equal(state().message, "Outer approval");
  reporter.setBlocked("outer", undefined);
  assert.equal(state().message, "Compacting context");
  reporter.handleEvent({ type: "compaction_end", reason: "manual" });
  reporter.handleEvent({ type: "agent_settled", aborted: false });
  assert.equal(state().state, "done");
});
