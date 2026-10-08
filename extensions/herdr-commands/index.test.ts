import assert from "node:assert/strict";
import test from "node:test";
import { commandApi } from "./index.ts";

test("Herdr menu does not compete with native /subagents", () => {
  const registered = new Map<string, unknown>();
  const definition = { description: "Herdr controls", handler: async () => {} };
  const api = commandApi({
    registerCommand: (name: string, command: unknown) =>
      registered.set(name, command),
  } as any);
  api.registerCommand("subagents", definition);
  assert.equal(registered.get("herdr-config"), definition);
  assert.equal(registered.has("subagents"), false);
});

test("other commands and APIs pass through unchanged", () => {
  const names: string[] = [];
  const events = {};
  const api = commandApi({
    registerCommand: (name: string) => names.push(name),
    events,
  } as any);
  api.registerCommand("other", {
    description: "other",
    handler: async () => {},
  });
  assert.deepEqual(names, ["other"]);
  assert.equal(api.events, events);
});
