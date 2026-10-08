import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "herdr-startup-"));
const binary = join(root, "herdr");
const stateFile = join(root, "state.json");
writeFileSync(
  binary,
  `#!/usr/bin/env node
const fs = require('node:fs');
const file = process.env.HERDR_FIXTURE_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
fs.writeFileSync(file, JSON.stringify(state));
if (args[0] === 'agent' && args[1] === 'get') {
  console.log(JSON.stringify({result:{agent:{name:state.name ?? args[2]}}}));
} else {
  const operation = args.slice(0,2).join(' ');
  const code = operation === state.failOperation ? state.failCode : (operation === 'agent rename' && args[3] === 'orchestrator' ? 'agent_name_taken' : undefined);
  if (code) {
    const output = JSON.stringify({error:{code,message:'synthetic Herdr rejection'}});
    if (state.stdoutError) console.log(output); else console.error(output);
    process.exit(9);
  }
  if (operation === 'agent rename') {state.name = args[3]; fs.writeFileSync(file,JSON.stringify(state));}
  console.log('{}');
}
`,
  { mode: 0o700 },
);

test("automatic startup collisions are isolated from explicit names and real failures", async () => {
  const keys = [
    "HERDR_BIN",
    "HERDR_ENV",
    "HERDR_PANE_ID",
    "HERDR_FIXTURE_STATE",
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    process.env.HERDR_BIN = binary;
    process.env.HERDR_ENV = "1";
    process.env.HERDR_FIXTURE_STATE = stateFile;
    const { default: register, startupFallbackName } = await import(
      new URL("./index.ts", import.meta.url).href + "?startup-collision"
    );
    const ctx = { cwd: "/fixture/.pi", ui: { notify: () => {} } };
    const fixture = (paneId: string, state: Record<string, unknown> = {}) => {
      process.env.HERDR_PANE_ID = paneId;
      writeFileSync(stateFile, JSON.stringify({ calls: [], ...state }));
      const handlers = new Map<string, any>();
      const commands = new Map<string, any>();
      register({
        registerTool: () => {},
        registerCommand: (name: string, command: any) =>
          commands.set(name, command),
        on: (name: string, handler: any) => handlers.set(name, handler),
      });
      return { handlers, commands };
    };
    const state = () => JSON.parse(readFileSync(stateFile, "utf8"));

    for (const stdoutError of [false, true]) {
      const f = fixture("workspace:p2", { stdoutError });
      await f.handlers.get("session_start")({}, ctx);
      const fallback = startupFallbackName("orchestrator", "workspace:p2");
      assert.notEqual(
        fallback,
        startupFallbackName("orchestrator", "workspace:p3"),
      );
      assert.match(fallback, /^orchestrator-[a-f0-9]{12}$/);
      assert.deepEqual(
        state()
          .calls.filter(
            (args: string[]) => args[0] === "agent" && args[1] === "rename",
          )
          .map((args: string[]) => args[3]),
        ["orchestrator", fallback],
      );
      assert.equal(state().name, fallback);
      await f.handlers.get("session_start")({}, ctx);
      assert.equal(state().name, fallback);
      assert.equal(
        state().calls.filter((args: string[]) => args[3] === "orchestrator")
          .length,
        1,
      );
      const notices: string[] = [];
      await f.commands.get("herdr-name").handler("", {
        ui: { notify: (message: string) => notices.push(message) },
      });
      assert(notices[0].endsWith(fallback));
    }

    for (const [failOperation, failCode] of [
      ["agent rename", "transport_unavailable"],
      ["pane rename", "agent_name_taken"],
      ["pane report-metadata", "transport_unavailable"],
    ]) {
      const f = fixture("workspace:p2", {
        name: "existing-role",
        failOperation,
        failCode,
      });
      await assert.rejects(
        f.handlers.get("session_start")({}, ctx),
        new RegExp(failCode),
      );
      assert.equal(
        state().calls.filter(
          (args: string[]) => args[0] === "agent" && args[1] === "rename",
        ).length,
        1,
      );
    }
    const transport = fixture("workspace:p2", {
      failOperation: "agent rename",
      failCode: "transport_unavailable",
    });
    await assert.rejects(
      transport.handlers.get("session_start")({}, ctx),
      /transport_unavailable/,
    );
    assert.equal(
      state().calls.filter((args: string[]) => args[1] === "rename").length,
      1,
    );
    const existing = fixture("workspace:p2", { name: "worker-role" });
    await existing.handlers.get("session_start")({}, ctx);
    assert.equal(state().name, "worker-role");
    const explicit = fixture("workspace:p2");
    await assert.rejects(
      explicit.commands.get("herdr-name").handler("orchestrator", ctx),
      /agent_name_taken/,
    );
    assert.equal(state().calls.length, 1);
    const retryFails = fixture("workspace:p2", {
      failOperation: "agent rename",
      failCode: "agent_name_taken",
    });
    await assert.rejects(
      retryFails.handlers.get("session_start")({}, ctx),
      /agent_name_taken/,
    );
    assert.equal(
      state().calls.filter((args: string[]) => args[1] === "rename").length,
      2,
    );
  } finally {
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
