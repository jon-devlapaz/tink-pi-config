import assert from "node:assert/strict";
import test from "node:test";
import { persistenceApi, replayEntries, SNAPSHOT } from "./index.ts";

test("successful nested todo execution persists a replayable native snapshot", async () => {
  let wrapped: any;
  const entries: any[] = [];
  const api = persistenceApi({
    registerTool: (tool: any) => {
      wrapped = tool;
    },
    appendEntry: (customType: string, data: unknown) =>
      entries.push({
        type: "custom",
        id: "snapshot",
        parentId: null,
        timestamp: new Date().toISOString(),
        customType,
        data,
      }),
  } as any);
  api.registerTool({
    name: "todo",
    execute: async () => ({
      content: [],
      details: {
        tasks: [{ id: 1, status: "pending", subject: "nested" }],
        nextId: 2,
      },
    }),
  } as any);
  await wrapped.execute("nested-call", { action: "create" });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].customType, SNAPSHOT);
  const replayed: any = replayEntries(entries)[0];
  assert.equal(replayed.message.toolName, "todo");
  assert.equal(replayed.message.details.tasks[0].subject, "nested");
  assert.equal(entries[0].type, "custom");
});

test("read-only and rejected todo operations do not append snapshots", async () => {
  let wrapped: any;
  const snapshots: unknown[] = [];
  const api = persistenceApi({
    registerTool: (t: any) => {
      wrapped = t;
    },
    appendEntry: (_: string, data: unknown) => snapshots.push(data),
  } as any);
  api.registerTool({
    name: "todo",
    execute: async (_: string, params: any) => ({
      content: [],
      details: {
        tasks: [],
        nextId: 1,
        ...(params.action === "update" ? { error: "missing task" } : {}),
      },
    }),
  } as any);
  await wrapped.execute("read", { action: "list" });
  await wrapped.execute("bad-update", { action: "update" });
  assert.equal(snapshots.length, 0);
});

test("snapshot write failure rejects instead of reporting persisted success", async () => {
  let wrapped: any;
  const api = persistenceApi({
    registerTool: (t: any) => {
      wrapped = t;
    },
    appendEntry: () => {
      throw new Error("disk fault");
    },
  } as any);
  api.registerTool({
    name: "todo",
    execute: async () => ({ content: [], details: { tasks: [], nextId: 1 } }),
  } as any);
  await assert.rejects(
    wrapped.execute("call", { action: "clear" }),
    /disk fault/,
  );
});

test("unrelated entries remain unchanged and chronological order is preserved", () => {
  const direct: any = {
    type: "message",
    message: {
      role: "toolResult",
      toolName: "todo",
      details: { tasks: [], nextId: 1 },
    },
  };
  const unrelated: any = {
    type: "custom",
    customType: "other",
    data: "untouched",
  };
  assert.deepEqual(replayEntries([direct, unrelated]), [direct, unrelated]);
});
