import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSandbox } from "./sandbox.mjs";

const sandbox = createSandbox(process.argv[2]);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, sandbox.env);
const { root, cwd, config } = sandbox;
const {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  createCodemodeExtension,
  createToolSearchExtension,
} = await import("@earendil-works/pi-coding-agent");
const { createAssistantMessageEventStream } =
  await import("@earendil-works/pi-ai");
const model = {
  id: "fixture",
  name: "Local fixture",
  provider: "config-fixture",
  api: "config-test-api",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200000,
  maxTokens: 4096,
};
let pendingCall;
let callNumber = 0;
const fixture = (pi) =>
  pi.registerProvider(model.provider, {
    baseUrl: "http://127.0.0.1:1",
    apiKey: "synthetic-only",
    api: model.api,
    models: [model],
    streamSimple: (selected) => {
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        const call = pendingCall;
        pendingCall = undefined;
        const message = {
          role: "assistant",
          content: call
            ? [
                {
                  type: "toolCall",
                  id: "fixture-" + ++callNumber,
                  name: call.name,
                  arguments: call.args,
                },
              ]
            : [{ type: "text", text: "PLUMBING-MODEL-OK" }],
          api: selected.api,
          provider: selected.provider,
          model: selected.id,
          usage: {
            input: 100,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 105,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            },
          },
          stopReason: call ? "toolUse" : "stop",
          timestamp: Date.now(),
        };
        stream.push({ type: "start", partial: message });
        stream.push({ type: "done", reason: message.stopReason, message });
        stream.end();
      });
      return stream;
    },
  });
const manager = SettingsManager.create(cwd, config, { projectTrusted: false });
const loader = new DefaultResourceLoader({
  cwd,
  agentDir: config,
  settingsManager: manager,
  noContextFiles: true,
  extensionFactories: [
    fixture,
    createCodemodeExtension({ mode: "on" }),
    createToolSearchExtension(),
  ],
  disabledBuiltinExtensions: ["mcp"],
});
await loader.reload();
const loaded = loader.getExtensions();
assert.equal(loaded.errors.length, 0, JSON.stringify(loaded.errors));
assert(
  !loaded.extensions.some((e) =>
    /pi-pstack|\/model-info\/|\/summaries\/|\/spark-strict-tools\/|\/pi-mcp-adapter\/|\/@narumitw\/pi-statusline\/|\/pi-web-access\//.test(
      e.path,
    ),
  ),
  "disabled extension loaded",
);
assert(
  !loader.getSkills().skills.some((s) => s.filePath.includes("pi-pstack")),
  "pstack skills loaded",
);
const checks = [];
const errors = [];
const notifications = [];
const { session } = await createAgentSession({
  cwd,
  resourceLoader: loader,
  settingsManager: manager,
  sessionManager: SessionManager.create(cwd, path.join(config, "sessions")),
  model,
  thinkingLevel: "off",
});
const ui = new Proxy(session.extensionRunner.getUIContext(), {
  get(target, key) {
    if (key === "notify")
      return (message, type) => notifications.push({ message, type });
    if (["select", "input", "editor"].includes(key))
      return async () => undefined;
    if (key === "confirm") return async () => false;
    return Reflect.get(target, key);
  },
});
const text = (r) =>
  (r.content ?? r.result?.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log("PASS", name);
  } catch (error) {
    checks.push({ name, ok: false, error: error.message });
    console.error("FAIL", name, error.message);
  }
}
async function issue(name, args, expectError = false) {
  const start = session.messages.length;
  pendingCall = { name, args };
  await session.prompt("Execute synthetic fixture: " + name);
  const results = session.messages
    .slice(start)
    .filter((m) => m.role === "toolResult" && m.toolName === name);
  assert.equal(results.length, 1, "expected one tool result: " + name);
  assert.equal(Boolean(results[0].isError), expectError, text(results[0]));
  return results[0];
}
try {
  await session.bindExtensions({
    mode: "print",
    uiContext: ui,
    onError: (error) => errors.push(error),
  });
  await check("session_start handlers", () =>
    assert.equal(errors.length, 0, JSON.stringify(errors)),
  );
  await check("command ownership", () => {
    const runner = session.extensionRunner;
    assert.equal(
      runner.getCommandDiagnostics().length,
      0,
      JSON.stringify(runner.getCommandDiagnostics()),
    );
    const names = runner.getRegisteredCommands().map((c) => c.invocationName);
    assert(names.includes("subagents"));
    assert(names.includes("herdr-config"));
    assert(!names.some((name) => /pstack|poteto/.test(name)));
  });
  await check("fd real binary", async () =>
    assert(
      text(
        await issue("fd", { path: cwd, pattern: "fixture.ts", glob: true }),
      ).includes("fixture.ts"),
    ),
  );
  await check("rg real binary", async () =>
    assert(
      text(
        await issue("rg", {
          path: cwd,
          pattern: "QUIET-PLUMBING-7214",
          fixed_strings: true,
        }),
      ).includes("QUIET-PLUMBING-7214"),
    ),
  );
  await check("no-match is not an error", () =>
    issue("rg", { path: cwd, pattern: "ABSENT-9931", fixed_strings: true }),
  );
  await check("invalid schema rejects visibly", async () =>
    assert(
      text(await issue("fd", { path: cwd, max_depth: 0 }, true)).includes(
        "max_depth",
      ),
    ),
  );
  await check("missing file rejects visibly", () =>
    issue("read", { path: path.join(cwd, "absent.txt") }, true),
  );
  await check("todo lifecycle", async () => {
    const result = await issue("todo", {
      action: "create",
      subject: "Synthetic plumbing task",
    });
    const id = result.details?.task?.id ?? result.details?.tasks?.at(-1)?.id;
    assert(id);
    await issue("todo", {
      action: "update",
      id,
      status: "in_progress",
      activeForm: "testing plumbing",
    });
    await issue("todo", { action: "update", id, status: "completed" });
    assert(text(await issue("todo", { action: "list" })).includes("completed"));
  });
  await check("codemode nested invocation", async () =>
    assert(
      text(
        await issue("codemode", {
          code:
            "text(await tools.rg({path:" +
            JSON.stringify(cwd) +
            ',pattern:"QUIET-PLUMBING-7214",fixed_strings:true}));',
        }),
      ).includes("QUIET-PLUMBING-7214"),
    ),
  );
  for (const command of [
    "statusline",
    "herdr-name",
    "git-tag list",
    "end-review",
    "typesafe status",
  ]) {
    await check("command /" + command, () => session.prompt("/" + command));
  }
  await check("fixture prompt lifecycle", async () => {
    await session.prompt("Remember QUIET-PLUMBING-7214");
    assert.equal(session.getLastAssistantText(), "PLUMBING-MODEL-OK");
  });
  await check("recall synthetic session", async () =>
    assert(
      text(await issue("recall", { query: "QUIET-PLUMBING-7214" })).includes(
        "QUIET-PLUMBING-7214",
      ),
    ),
  );
  await check("native compaction and recall", async () => {
    manager.applyOverrides({
      compaction: { enabled: true, keepRecentTokens: 512, reserveTokens: 1024 },
    });
    await session.prompt(
      "COMPACT-PLUMBING-8891 " + "synthetic context ".repeat(2000),
    );
    await session.prompt("Keep this recent turn");
    const result = await session.compact();
    assert(result.summary.includes("PLUMBING-MODEL-OK"));
    assert(
      session.sessionManager.getBranch().some((e) => e.type === "compaction"),
    );
    assert(
      text(await issue("recall", { query: "COMPACT-PLUMBING-8891" })).includes(
        "COMPACT-PLUMBING-8891",
      ),
    );
  });
  await check("nested todo survives tree replay", async () => {
    await issue("codemode", {
      code: 'text(await tools.todo({action:"create",subject:"Nested replay probe"}));',
    });
    await session.extensionRunner.emit({ type: "session_tree" });
    assert(
      text(await issue("todo", { action: "list" })).includes(
        "Nested replay probe",
      ),
    );
  });
  await check("transcription missing file rejects", () =>
    issue("transcribe_file", { path: path.join(cwd, "absent.wav") }, true),
  );
  await check("session_shutdown handlers", async () => {
    await session.extensionRunner.emit({
      type: "session_shutdown",
      reason: "quit",
    });
    assert.equal(errors.length, 0, JSON.stringify(errors));
  });
} finally {
  session.dispose();
  fs.writeFileSync(
    path.join(root, "profile-results.json"),
    JSON.stringify({ checks, errors, notifications }, null, 2),
  );
}
console.log("Runtime evidence:", root);
assert.equal(
  checks.filter((c) => !c.ok).length + errors.length,
  0,
  "runtime verification failed",
);
