import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

type Json = Record<string, unknown>;

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
const EXTENSION_DIR = resolve(HERE, "..");
const PI_BIN = join(REPO, "node_modules/.bin/pi");
const ARTIFACT = join(REPO, "target/e2e/tink-skills.json");
const TINK_BIN =
  process.env.TINK_BIN ?? "/Users/jondev/dev/active/tink/target/debug/tink";
const TINK_ROUTE_SRC =
  process.env.TINK_ROUTE_SRC ?? "/Users/jondev/dev/active/tink-route/src";
const DEADLINE_MS = 1500;
const DEADLINE_SLACK_MS = 1500;
const DIGEST = `sha256:${"ab".repeat(32)}`;
const FRAMING =
  "tink: the skill below was selected for this request. Apply its instructions to the user's request; do not mention this mechanism unless the user asks.";
const HUGE_CONTENT = (() => {
  const unit =
    'HUGE-SKILL line "quoted" <tag> & </tink-skill> \\ back\\slash \t tab é ✓ 🚀\n';
  let text = "";
  while (text.length <= 210_000) text += unit;
  return `${text}HUGE-END`;
})();

const FAKE_HOOK = String.raw`#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
const log = process.env.FAKE_HOOK_LOG;
const hugeFile = process.env.FAKE_HOOK_HUGE;
const args = process.argv.slice(2);
const record = (entry) => appendFileSync(log, JSON.stringify({ pid: process.pid, cwd: process.cwd(), args, ...entry }) + "\n");
if (args[0] !== "route") {
  record({});
  process.stdout.write("fake tink-hook " + args.join(" ") + " ok\n");
  process.exit(0);
}
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const request = JSON.parse(input);
  const mode = (/\[mode:([a-z-]+)\]/.exec(request.prompt) ?? [])[1] ?? "none";
  const tag = (/\b(P\d+)\b/.exec(request.prompt) ?? [])[1] ?? "P?";
  record({ request, mode });
  const inject = (content) => ({ contract_version: 1, action: "inject", skill: "demo-" + tag.toLowerCase(), tree_digest: "${DIGEST}", content, notice: "tink: applied skill demo-" + tag.toLowerCase() + " (disable: TINK_HOOK=off)", reason: null });
  const out = (value) => process.stdout.write(JSON.stringify(value) + "\n", () => process.exit(0));
  const body = "SKILL-" + tag + "-BODY do the thing exactly.";
  switch (mode) {
    case "inject": return out(inject(body));
    case "huge": return out(inject(readFileSync(hugeFile, "utf8")));
    case "none": return out({ contract_version: 1, action: "none", skill: null, tree_digest: null, content: null, notice: null, reason: "no_skill" });
    case "badversion": return out({ ...inject(body), contract_version: 2 });
    case "missing": { const v = inject(body); delete v.tree_digest; return out(v); }
    case "empty": return out(inject(""));
    case "garbage": process.stdout.write("<<<not json " + body + ">>>\n"); process.exit(0);
    case "crash": process.stdout.write('{"contract_version":1,"action":"inject","content":"' + body); process.stderr.write("boom\n"); process.exit(3);
    case "hang": setTimeout(() => out(inject(body)), 60_000); return;
    default: return out({ contract_version: 1, action: "none", skill: null, tree_digest: null, content: null, notice: null, reason: "no_skill" });
  }
});
`;

const HELPER_EXTENSION = `export default function (pi: any) {
  pi.registerCommand("e2e-send", {
    description: "e2e: send an extension-sourced user message",
    handler: async (args: string) => { pi.sendUserMessage(args); },
  });
}
`;

const FAKE_ROUTER = `import json, sys
print(json.dumps({"contract_version": 1, "status": "routed", "winner": "plain", "probability": 0.9,
                  "action": {"type": "inject", "mount_command": "tink mount plain --json --payload"}}))
`;

interface Recorded {
  at: number;
  body: Json;
}

interface StubProvider {
  server: Server;
  port: number;
  requests: Recorded[];
}

interface Results {
  [key: string]: unknown;
}

const results: Results = {
  started_at: new Date().toISOString(),
  pi_version: "",
  deadline_ms: DEADLINE_MS,
  assertions: {} as Record<string, { ok: boolean; detail?: unknown }>,
};

function record(name: string, ok: boolean, detail?: unknown) {
  (results.assertions as Record<string, unknown>)[name] = { ok, detail };
}

function startStubProvider(): Promise<StubProvider> {
  const requests: Recorded[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      let body: Json = {};
      try {
        body = JSON.parse(raw) as Json;
      } catch {}
      requests.push({ at: Date.now(), body });
      const messages = (body.messages ?? []) as Json[];
      const last = messages[messages.length - 1];
      const wantsTool =
        last?.role === "user" && messageText(last).includes("[tool]");
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const chunk = (delta: Json, finish: string | null) =>
        `data: ${JSON.stringify({
          id: "stub",
          object: "chat.completion.chunk",
          created: 0,
          model: "stub-model",
          choices: [{ index: 0, delta, finish_reason: finish }],
        })}\n\n`;
      if (wantsTool) {
        res.write(
          chunk(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_${requests.length}`,
                  type: "function",
                  function: {
                    name: "read",
                    arguments: JSON.stringify({ path: "hello.txt" }),
                  },
                },
              ],
            },
            null,
          ),
        );
        res.write(chunk({}, "tool_calls"));
      } else {
        res.write(chunk({ role: "assistant", content: "stub answer" }, null));
        res.write(chunk({}, "stop"));
      }
      res.write(
        `data: ${JSON.stringify({
          id: "stub",
          object: "chat.completion.chunk",
          created: 0,
          model: "stub-model",
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        })}\n\n`,
      );
      res.end("data: [DONE]\n\n");
    });
  });
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      resolvePromise({
        server,
        port: (server.address() as AddressInfo).port,
        requests,
      });
    });
  });
}

function messageText(message: Json | undefined): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      typeof part === "object" && part && "text" in part
        ? String((part as Json).text)
        : "",
    )
    .join("\n");
}

function userMessages(body: Json): Json[] {
  return ((body.messages ?? []) as Json[]).filter((m) => m.role === "user");
}

function lastUserText(body: Json): string {
  const users = userMessages(body);
  return messageText(users[users.length - 1]);
}

function systemText(body: Json): string {
  const first = ((body.messages ?? []) as Json[])[0];
  assert.ok(
    first && (first.role === "system" || first.role === "developer"),
    "first provider message is the system prompt",
  );
  return messageText(first);
}

function requestsFor(stub: StubProvider, tag: string): Recorded[] {
  const re = new RegExp(`\\b${tag}\\b`);
  return stub.requests.filter((r) => re.test(lastUserText(r.body)));
}

function extractSkill(text: string): { attrs: string; content: string } | null {
  const open = text.lastIndexOf("<tink-skill ");
  if (open < 0) return null;
  const headerEnd = text.indexOf(">\n", open);
  const close = text.lastIndexOf("\n</tink-skill>");
  if (headerEnd < 0 || close < headerEnd) return null;
  return {
    attrs: text.slice(open, headerEnd + 1),
    content: text.slice(headerEnd + 2, close),
  };
}

class RpcPi {
  child: ChildProcess;
  events: Json[] = [];
  stderr = "";
  private buffer = "";
  private waiters: Array<() => void> = [];

  constructor(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
    this.child = spawn(PI_BIN, ["--mode", "rpc", ...args], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout!.setEncoding("utf8");
    this.child.stdout!.on("data", (chunk: string) => {
      this.buffer += chunk;
      let index: number;
      while ((index = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, index).replace(/\r$/, "");
        this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          this.events.push(JSON.parse(line) as Json);
        } catch {
          this.events.push({ type: "unparsed", line });
        }
        for (const wake of this.waiters.splice(0)) wake();
      }
    });
    this.child.stderr!.setEncoding("utf8");
    this.child.stderr!.on("data", (chunk: string) => (this.stderr += chunk));
  }

  async waitFor(
    predicate: (event: Json, index: number) => boolean,
    from: number,
    timeoutMs = 20_000,
  ): Promise<Json> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      for (let i = from; i < this.events.length; i++) {
        if (predicate(this.events[i], i)) return this.events[i];
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0 || this.child.exitCode !== null) {
        throw new Error(
          `timed out waiting for rpc event; stderr=${this.stderr.slice(-2000)} events=${JSON.stringify(this.events.slice(from)).slice(-2000)}`,
        );
      }
      await new Promise<void>((wake) => {
        const timer = setTimeout(wake, Math.min(remaining, 250));
        this.waiters.push(() => {
          clearTimeout(timer);
          wake();
        });
      });
    }
  }

  async prompt(
    message: string,
    options: { expectRun: boolean },
  ): Promise<{ from: number; sentAt: number }> {
    const from = this.events.length;
    const id = `req-${from}-${Math.random().toString(36).slice(2)}`;
    const sentAt = Date.now();
    this.child.stdin!.write(
      `${JSON.stringify({ id, type: "prompt", message })}\n`,
    );
    const response = await this.waitFor(
      (e) => e.type === "response" && e.id === id,
      from,
    );
    assert.equal(
      response.success,
      true,
      `prompt rejected: ${JSON.stringify(response)}`,
    );
    if (options.expectRun) {
      await this.waitFor((e) => e.type === "agent_settled", from, 30_000);
    }
    return { from, sentAt };
  }

  notifications(from: number): string[] {
    return this.events
      .slice(from)
      .filter((e) => e.type === "extension_ui_request" && e.method === "notify")
      .map((e) => String(e.message));
  }

  async stop() {
    if (this.child.exitCode !== null) return;
    this.child.stdin!.end();
    const exited = new Promise((r) => this.child.once("exit", r));
    const timer = setTimeout(() => this.child.kill("SIGKILL"), 5_000);
    this.child.kill("SIGTERM");
    await exited;
    clearTimeout(timer);
  }
}

function makeAgentDir(root: string, port: number): string {
  const agentDir = join(root, "agent");
  mkdirSync(join(agentDir, "extensions"), { recursive: true });
  mkdirSync(join(agentDir, "prompts"), { recursive: true });
  symlinkSync(EXTENSION_DIR, join(agentDir, "extensions", "tink-skills"));
  writeFileSync(
    join(agentDir, "extensions", "e2e-helper.ts"),
    HELPER_EXTENSION,
  );
  writeFileSync(
    join(agentDir, "prompts", "greet.md"),
    "---\ndescription: e2e template\n---\nP90 [mode:inject] greet the user from a template\n",
  );
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        stub: {
          baseUrl: `http://127.0.0.1:${port}/v1`,
          api: "openai-completions",
          apiKey: "stub-key-not-real",
          compat: {
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
          },
          models: [{ id: "stub-model", reasoning: false }],
        },
      },
    }),
  );
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      defaultProvider: "stub",
      defaultModel: "stub-model",
      quietStartup: true,
      compaction: { enabled: false },
      retry: { enabled: false },
    }),
  );
  return agentDir;
}

function baseEnv(root: string, agentDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "TMPDIR", "LANG", "TERM"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  return {
    ...env,
    HOME: home,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
  };
}

function readJsonl(path: string): Json[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Json);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sessionFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, {
    withFileTypes: true,
    recursive: true,
  })) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(join(entry.parentPath, entry.name));
    }
  }
  return out;
}

const stubPromise = startStubProvider();
const roots: string[] = [];

test.after(async () => {
  const stub = await stubPromise;
  stub.server.close();
  results.finished_at = new Date().toISOString();
  results.provider_requests = stub.requests.length;
  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(results, null, 2)}\n`);
  if (!process.env.TINK_SKILLS_E2E_KEEP) {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  } else {
    results.kept_roots = roots;
  }
});

test("tink-skills in a real headless Pi with a fake tink-hook", async () => {
  const stub = await stubPromise;
  const root = mkdtempSync(join(tmpdir(), "tink-skills-e2e-"));
  roots.push(root);
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "hello.txt"), "hello from the project\n");
  const agentDir = makeAgentDir(root, stub.port);
  const sessionDir = join(root, "sessions");
  const hook = join(root, "fake-tink-hook.mjs");
  writeFileSync(hook, FAKE_HOOK);
  chmodSync(hook, 0o755);
  const hookLog = join(root, "hook.jsonl");
  const hugeFile = join(root, "huge.txt");
  writeFileSync(hugeFile, HUGE_CONTENT);

  results.pi_version = spawnSync(PI_BIN, ["--version"], {
    encoding: "utf8",
  }).stdout.trim();

  const pi = new RpcPi(
    project,
    {
      ...baseEnv(root, agentDir),
      TINK_HOOK_BIN: hook,
      TINK_SKILLS_DEADLINE_MS: String(DEADLINE_MS),
      FAKE_HOOK_LOG: hookLog,
      FAKE_HOOK_HUGE: hugeFile,
    },
    ["--session-dir", sessionDir],
  );

  try {
    const expectedBlock = (tag: string, content: string) =>
      `${FRAMING}\n<tink-skill name="demo-${tag.toLowerCase()}" digest="${DIGEST}">\n${content}\n</tink-skill>`;

    const p1 = await pi.prompt(
      "P1 [mode:inject] [tool] read hello.txt and summarize it",
      {
        expectRun: true,
      },
    );
    const p1Requests = requestsFor(stub, "P1");
    const p1Body = "SKILL-P1-BODY do the thing exactly.";
    const everyCall = p1Requests.every((r) =>
      lastUserText(r.body).endsWith(expectedBlock("P1", p1Body)),
    );
    const hadToolTurn = p1Requests.some((r) =>
      ((r.body.messages ?? []) as Json[]).some((m) => m.role === "tool"),
    );
    record(
      "a_inject_every_llm_call",
      p1Requests.length >= 2 && everyCall && hadToolTurn,
      {
        llm_calls: p1Requests.length,
        had_tool_turn: hadToolTurn,
      },
    );
    assert.ok(
      p1Requests.length >= 2,
      `expected a multi-call tool run, got ${p1Requests.length}`,
    );
    assert.ok(hadToolTurn, "second call carries the tool result");
    assert.ok(
      everyCall,
      "every LLM call of the run carries the skill in the last user message",
    );
    const p1Notices = pi.notifications(p1.from);
    record(
      "a_notice_shown",
      p1Notices.includes(
        "tink: applied skill demo-p1 (disable: TINK_HOOK=off)",
      ),
      p1Notices,
    );
    assert.ok(
      p1Notices.includes(
        "tink: applied skill demo-p1 (disable: TINK_HOOK=off)",
      ),
      `notice shown: ${JSON.stringify(p1Notices)}`,
    );

    await pi.prompt("P2 [mode:none] just answer plainly please", {
      expectRun: true,
    });
    const p2Requests = requestsFor(stub, "P2");
    assert.equal(p2Requests.length, 1);
    const p2Body = p2Requests[0].body;
    const p2Clean =
      !JSON.stringify(p2Body).includes("<tink-skill") &&
      !JSON.stringify(p2Body).includes("SKILL-P1-BODY");
    record("e_second_prompt_routes_afresh_and_history_clean", p2Clean, {
      p2_user_messages: userMessages(p2Body).map(messageText),
    });
    assert.ok(
      p2Clean,
      "second prompt has no skill, and the earlier prompt in history carries none",
    );
    const sysInjected = systemText(p1Requests[0].body);
    const sysPlain = systemText(p2Body);
    record("c_system_prompt_byte_identical", sysInjected === sysPlain, {
      length: sysPlain.length,
    });
    assert.equal(
      sysInjected,
      sysPlain,
      "system prompt is identical with and without injection",
    );
    const p1FirstUserInP2 = messageText(userMessages(p2Body)[0]);
    assert.equal(
      p1FirstUserInP2,
      "P1 [mode:inject] [tool] read hello.txt and summarize it",
    );

    const failOpen: Record<string, unknown> = {};
    for (const [tag, mode] of [
      ["P3", "badversion"],
      ["P4", "garbage"],
      ["P5", "missing"],
      ["P6", "empty"],
      ["P7", "crash"],
    ] as const) {
      await pi.prompt(`${tag} [mode:${mode}] answer plainly please`, {
        expectRun: true,
      });
      const reqs = requestsFor(stub, tag);
      const clean =
        reqs.length === 1 &&
        !lastUserText(reqs[0].body).includes("<tink-skill");
      failOpen[mode] = { llm_calls: reqs.length, injected: !clean };
      assert.ok(clean, `${mode}: prompt proceeds without injection`);
    }
    record("d_fail_open_variants", true, failOpen);

    const hang = await pi.prompt("P8 [mode:hang] answer plainly please", {
      expectRun: true,
    });
    const p8Requests = requestsFor(stub, "P8");
    assert.equal(p8Requests.length, 1);
    const latency = p8Requests[0].at - hang.sentAt;
    const hangEntry = readJsonl(hookLog).find((e) => e.mode === "hang");
    assert.ok(hangEntry, "hang hook invoked");
    const hangPid = Number(hangEntry.pid);
    const killed = !processAlive(hangPid);
    const hangOk =
      latency >= DEADLINE_MS - 100 &&
      latency <= DEADLINE_MS + DEADLINE_SLACK_MS &&
      killed &&
      !lastUserText(p8Requests[0].body).includes("<tink-skill");
    record("d_hang_killed_at_deadline", hangOk, {
      latency_ms: latency,
      killed,
      pid: hangPid,
    });
    assert.ok(killed, "hanging hook process was killed");
    assert.ok(
      latency <= DEADLINE_MS + DEADLINE_SLACK_MS,
      `prompt proceeded within deadline+slack (${latency}ms)`,
    );
    assert.ok(latency >= DEADLINE_MS - 100, `deadline honored (${latency}ms)`);

    await pi.prompt("P9 [mode:huge] apply the huge skill please", {
      expectRun: true,
    });
    const p9Requests = requestsFor(stub, "P9");
    assert.equal(p9Requests.length, 1);
    const extracted = extractSkill(lastUserText(p9Requests[0].body));
    const exact = extracted?.content === HUGE_CONTENT;
    record("d_huge_round_trips_byte_exact", exact, {
      chars: HUGE_CONTENT.length,
    });
    assert.ok(exact, "huge content round-trips byte-exact");

    const hookCallsBeforeSlash = readJsonl(hookLog).length;
    await pi.prompt("/greet", { expectRun: true });
    const p90 = requestsFor(stub, "P90");
    const slashNotRouted =
      readJsonl(hookLog).length === hookCallsBeforeSlash &&
      p90.length === 1 &&
      !lastUserText(p90[0].body).includes("<tink-skill");
    record("f_slash_template_not_routed", slashNotRouted, {
      llm_calls: p90.length,
    });
    assert.ok(slashNotRouted, "slash-command prompt is not routed");

    await pi.prompt(
      "/e2e-send P91 [mode:inject] extension sourced message here",
      {
        expectRun: true,
      },
    );
    const p91 = requestsFor(stub, "P91");
    const extensionNotRouted =
      readJsonl(hookLog).length === hookCallsBeforeSlash &&
      p91.length === 1 &&
      !lastUserText(p91[0].body).includes("<tink-skill");
    record("f_extension_sourced_not_routed", extensionNotRouted, {
      llm_calls: p91.length,
    });
    assert.ok(extensionNotRouted, "extension-sourced prompt is not routed");

    await pi.prompt("P10 [mode:inject] one more after the skips", {
      expectRun: true,
    });
    const p10 = requestsFor(stub, "P10");
    assert.equal(p10.length, 1);
    assert.ok(
      lastUserText(p10[0].body).endsWith(
        expectedBlock("P10", "SKILL-P10-BODY do the thing exactly."),
      ),
      "routing resumes after skipped prompts",
    );

    const routeCalls = readJsonl(hookLog).filter(
      (e) => (e.args as string[])[0] === "route",
    );
    const routeCallOk = routeCalls.every((e) => {
      const request = e.request as Json;
      return (
        Object.keys(request).sort().join(",") === "cwd,prompt,session_id" &&
        typeof request.session_id === "string" &&
        request.session_id.length > 0 &&
        request.cwd === realpath(project)
      );
    });
    record("router_request_shape", routeCallOk, routeCalls[0]?.request);
    assert.ok(
      routeCallOk,
      "route requests carry prompt, session_id and cwd only",
    );

    const commandResults: Record<string, unknown> = {};
    for (const [arg, hookArg] of [
      ["status", "status"],
      ["on", "enable"],
      ["off", "disable"],
    ] as const) {
      const before = readJsonl(hookLog).length;
      const sent = await pi.prompt(`/tink-skills ${arg}`, { expectRun: false });
      await pi.waitFor(
        (e) => e.type === "extension_ui_request" && e.method === "notify",
        sent.from,
      );
      const call = readJsonl(hookLog).slice(before)[0];
      commandResults[arg] = { call, notices: pi.notifications(sent.from) };
      assert.deepEqual(call?.args, [hookArg]);
      assert.equal(call?.cwd, realpath(project));
      assert.ok(
        pi
          .notifications(sent.from)
          .some((m) => m.includes(`fake tink-hook ${hookArg} ok`)),
      );
    }
    record("command_tink_skills", true, commandResults);

    await pi.stop();
    const files = sessionFiles(sessionDir);
    assert.equal(files.length, 1, "one persisted session");
    const persisted = readFileSync(files[0], "utf8");
    const leaked = [
      "<tink-skill",
      "SKILL-P1-BODY",
      "SKILL-P10-BODY",
      "HUGE-SKILL",
      FRAMING,
    ].filter((needle) => persisted.includes(needle));
    const hasPrompts =
      persisted.includes("P1 [mode:inject]") &&
      persisted.includes("P9 [mode:huge]");
    record("b_session_jsonl_has_no_skill", leaked.length === 0 && hasPrompts, {
      session_file_bytes: persisted.length,
      leaked,
    });
    assert.ok(hasPrompts, "session persisted the prompts");
    assert.deepEqual(leaked, [], "skill content never persisted");
  } finally {
    await pi.stop();
  }
});

function realpath(path: string): string {
  return realpathSync(path);
}

test("tink-skills against the real tink-hook and tink binary", async (t) => {
  if (
    !existsSync(TINK_BIN) ||
    !existsSync(join(TINK_ROUTE_SRC, "tink_route", "hook.py"))
  ) {
    record(
      "integration_real_tink_hook",
      false,
      "skipped: tink or tink-route not found",
    );
    t.skip("tink binary or tink-route source not found");
    return;
  }
  const stub = await stubPromise;
  const root = mkdtempSync(join(tmpdir(), "tink-skills-int-"));
  roots.push(root);
  const project = join(root, "project");
  const tinkHome = join(root, "tinkhome");
  const bin = join(root, "bin");
  for (const dir of [project, tinkHome, bin])
    mkdirSync(dir, { recursive: true });
  symlinkSync(TINK_BIN, join(bin, "tink"));
  const hookBin = join(bin, "tink-hook");
  writeFileSync(
    hookBin,
    `#!/bin/sh\nPYTHONPATH=${JSON.stringify(TINK_ROUTE_SRC)} exec python3 -m tink_route.hook "$@"\n`,
  );
  chmodSync(hookBin, 0o755);
  const fakeRouter = join(root, "fake_router.py");
  writeFileSync(fakeRouter, FAKE_ROUTER);
  const agentDir = makeAgentDir(root, stub.port);
  const env: NodeJS.ProcessEnv = {
    ...baseEnv(root, agentDir),
    TINK_HOME: tinkHome,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    TINK_HOOK_BIN: hookBin,
    TINK_SKILLS_DEADLINE_MS: "10000",
  };
  const run = (cmd: string, args: string[]) => {
    const r = spawnSync(cmd, args, { cwd: project, env, encoding: "utf8" });
    assert.equal(r.status, 0, `${cmd} ${args.join(" ")} failed: ${r.stderr}`);
    return r;
  };
  run("git", ["init", "-q", "."]);
  run("git", ["config", "user.email", "e2e@example.invalid"]);
  run("git", ["config", "user.name", "e2e"]);
  run("tink", ["init", "--no-tink-skills", "--no-manage-tink", "--no-sdlc"]);
  run("git", ["add", "-A"]);
  run("git", ["commit", "-q", "-m", "init"]);
  const skillDir = join(tinkHome, "skills", "plain");
  mkdirSync(skillDir, { recursive: true });
  const skillMd =
    "---\nname: plain\ndescription: Fixture skill plain for the Pi e2e.\n---\n# plain\n\nREAL-TINK-SKILL-BODY answer in exactly three words.\n";
  writeFileSync(join(skillDir, "SKILL.md"), skillMd);
  run("tink", ["library", "approve", "--all"]);

  const pi = new RpcPi(project, env, ["--session-dir", join(root, "sessions")]);
  try {
    const on = await pi.prompt("/tink-skills on", { expectRun: false });
    await pi.waitFor(
      (e) => e.type === "extension_ui_request" && e.method === "notify",
      on.from,
    );
    const configPath = join(tinkHome, "hook.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as Json;
    assert.deepEqual(config.projects, [realpath(project)]);
    writeFileSync(
      configPath,
      JSON.stringify({ ...config, router_cmd: ["python3", fakeRouter] }),
    );

    const sent = await pi.prompt("P100 please explain this repository simply", {
      expectRun: true,
    });
    const reqs = requestsFor(stub, "P100");
    assert.equal(reqs.length, 1);
    const extracted = extractSkill(lastUserText(reqs[0].body));
    const ok =
      extracted !== null &&
      extracted.content === skillMd &&
      /^<tink-skill name="plain" digest="sha256:[0-9a-f]{64}">$/.test(
        extracted.attrs,
      );
    const notices = pi.notifications(sent.from);
    record("integration_real_tink_hook", ok, {
      attrs: extracted?.attrs,
      notices,
      latency_ms: reqs[0].at - sent.sentAt,
    });
    assert.ok(
      ok,
      `real tink-hook skill reached the provider: ${extracted?.attrs}`,
    );
    assert.ok(
      notices.includes("tink: applied skill plain (disable: TINK_HOOK=off)"),
    );
  } finally {
    await pi.stop();
  }
});
