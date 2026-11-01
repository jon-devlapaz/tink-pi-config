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
    /pi-pstack|\/model-info\/|\/summaries\/|\/spark-strict-tools\/|\/pi-mcp-adapter\/|\/@narumitw\/pi-statusline\/|\/herdr-commands\/|\/herdr-naming\/|\/herdr-agent-state\.ts$|\/@andrewjacop\/pi-herdr\/|\/pi-subagents\/|\/pi-btw\/|\/workflows\/|\/background-terminals\/|\/statusline\/|\/ui-customization\/|\/session-rotation\/|\/file-search\/|\/pi-blackhole\/|\/pi-git-commands\//.test(
      e.path,
    ),
  ),
  "disabled extension loaded",
);
assert(
  !loader.getSkills().skills.some((s) => s.filePath.includes("pi-pstack")),
  "pstack skills loaded",
);
const web = loaded.extensions.find((extension) =>
  extension.path.includes("/pi-web-access/"),
);
assert(web, "globally enabled web-access extension did not load");
for (const tool of [
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
])
  assert(web.tools.has(tool), "missing globally enabled web tool: " + tool);
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
    assert(
      !names.some((name) =>
        /pstack|poteto|^herdr-|^subagents?$|^workflow|^btw$|^statusline$/.test(
          name,
        ),
      ),
      "Desktop-owned orchestration or custom UI command loaded",
    );
    assert(
      !loaded.extensions.some((extension) =>
        [...extension.tools.keys()].some((name) =>
          /^(herdr_|subagents?(?:_|$)|workflow$|bg_)/.test(name),
        ),
      ),
      "Desktop-owned orchestration tools must not load",
    );
  });
  await check("retained coding and task tools", () => {
    const names = session.getAllTools().map((tool) => tool.name);
    for (const name of [
      "read",
      "bash",
      "edit",
      "write",
      "grep",
      "find",
      "ls",
      "todo",
      "transcribe_file",
      "codemode",
    ])
      assert(names.includes(name), "missing retained tool: " + name);
    for (const name of ["grep", "find", "ls"]) {
      assert(
        session.getActiveToolNames().includes(name),
        "stock tool is inactive: " + name,
      );
      assert(
        !loaded.extensions.some((extension) => extension.tools.has(name)),
        "extension shadows stock tool: " + name,
      );
    }
    assert(
      !names.some((name) => name === "fd" || name === "rg"),
      "custom search tool remains registered",
    );
    assert(
      !names.some((name) =>
        /^(herdr_|subagents?(?:_|$)|workflow$|bg_)/.test(name),
      ),
    );
  });
  await check("coding read write edit bash", async () => {
    const file = path.join(cwd, "coding-probe.txt");
    await issue("write", { path: file, content: "CODING-BEFORE" });
    await issue("edit", {
      path: file,
      edits: [{ oldText: "CODING-BEFORE", newText: "CODING-AFTER" }],
    });
    assert(text(await issue("read", { path: file })).includes("CODING-AFTER"));
    assert(
      text(await issue("bash", { command: "printf CODING-SHELL-OK" })).includes(
        "CODING-SHELL-OK",
      ),
    );
  });
  await check("stock find real binary", async () =>
    assert(
      text(await issue("find", { path: cwd, pattern: "fixture.ts" })).includes(
        "fixture.ts",
      ),
    ),
  );
  await check("stock grep real binary", async () =>
    assert(
      text(
        await issue("grep", {
          path: cwd,
          pattern: "QUIET-PLUMBING-7214",
          literal: true,
        }),
      ).includes("QUIET-PLUMBING-7214"),
    ),
  );
  await check("stock ls directory listing", async () =>
    assert(text(await issue("ls", { path: cwd })).includes("fixture.ts")),
  );
  await check(
    "system search binaries remain available through bash",
    async () => {
      const versions = text(
        await issue("bash", { command: "fd --version && rg --version" }),
      );
      assert.match(versions, /fd \d/);
      assert.match(versions, /ripgrep \d/);
    },
  );
  await check("stock search respects gitignore", async () => {
    fs.writeFileSync(path.join(cwd, ".gitignore"), "ignored-probe.txt\n");
    fs.writeFileSync(
      path.join(cwd, "ignored-probe.txt"),
      "IGNORED-SEARCH-7214\n",
    );
    assert.match(
      text(await issue("find", { path: cwd, pattern: "ignored-probe.txt" })),
      /No files found/i,
    );
    assert.match(
      text(
        await issue("grep", {
          path: cwd,
          pattern: "IGNORED-SEARCH-7214",
          literal: true,
        }),
      ),
      /No matches found/i,
    );
  });
  await check("stock grep literal metacharacters", async () => {
    const file = path.join(cwd, "literal-probe.txt");
    fs.writeFileSync(file, "literal (needle).* end\n");
    assert(
      text(
        await issue("grep", {
          path: file,
          pattern: "(needle).*",
          literal: true,
        }),
      ).includes("literal (needle).* end"),
    );
  });
  await check("no-match is not an error", () =>
    issue("grep", { path: cwd, pattern: "ABSENT-9931", literal: true }),
  );
  await check("invalid search pattern rejects visibly", async () =>
    assert.match(
      text(await issue("grep", { path: cwd, pattern: "[" }, true)),
      /regex|parse error/i,
    ),
  );
  await check("stock search path errors reject visibly", async () => {
    const missing = path.join(cwd, "missing-search-directory");
    await issue("find", { path: missing, pattern: "*.ts" }, true);
    await issue("grep", { path: missing, pattern: "fixture" }, true);
    await issue("ls", { path: missing }, true);
  });
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
            "text(await tools.grep({path:" +
            JSON.stringify(cwd) +
            ',pattern:"QUIET-PLUMBING-7214",literal:true}));',
        }),
      ).includes("QUIET-PLUMBING-7214"),
    ),
  );
  for (const command of ["end-review", "typesafe status"]) {
    await check("command /" + command, () => session.prompt("/" + command));
  }
  await check("fixture prompt lifecycle", async () => {
    await session.prompt("Remember QUIET-PLUMBING-7214");
    assert.equal(session.getLastAssistantText(), "PLUMBING-MODEL-OK");
  });
  await check("native compaction", async () => {
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
