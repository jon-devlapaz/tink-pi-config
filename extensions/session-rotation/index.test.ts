import assert from "node:assert/strict";
import test from "node:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import register from "./index.ts";

test("failed rotation emits an error status and does not write a daily marker", () => {
  const root = mkdtempSync(join(tmpdir(), "rotation-marker-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  try {
    const scope = join(root, "sessions", "scope");
    mkdirSync(scope, { recursive: true });
    const name = "blocked.jsonl";
    const source = join(scope, name);
    writeFileSync(source, "fixture");
    const old = new Date(Date.now() - 45 * 86400000);
    utimesSync(source, old, old);
    const archive = join(root, "sessions-archive");
    mkdirSync(
      join(
        archive,
        new Date().toISOString().slice(0, 10).replaceAll("-", ""),
        name,
      ),
      { recursive: true },
    );
    const handlers = new Map<string, any>();
    const statuses: unknown[] = [];
    register({
      on: (name: string, handler: unknown) => handlers.set(name, handler),
    } as any);
    assert.throws(() =>
      handlers.get("session_start")(
        {},
        {
          mode: "tui",
          sessionManager: { getSessionId: () => "active" },
          ui: {
            setStatus: (_: string, status: unknown) => statuses.push(status),
          },
        },
      ),
    );
    assert.equal(existsSync(join(archive, ".last-rotation")), false);
    assert.equal(existsSync(source), true);
    assert.ok(statuses.includes("session rotation failed"));
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  }
});
