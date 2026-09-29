import { spawn } from "node:child_process";

export const CONTRACT_VERSION = 1;
export const DEFAULT_DEADLINE_MS = 4000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const DECISION_KEYS = [
  "contract_version",
  "action",
  "skill",
  "tree_digest",
  "content",
  "notice",
  "reason",
] as const;

export interface Injection {
  skill: string;
  treeDigest: string;
  content: string;
}

export interface Decision {
  injection: Injection | null;
  notice: string | null;
}

export interface HookRun {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  failed: boolean;
}

export function resolveHookBin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.TINK_HOOK_BIN?.trim();
  return configured ? configured : "tink-hook";
}

export function resolveDeadlineMs(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TINK_SKILLS_DEADLINE_MS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_DEADLINE_MS;
  const value = Number(raw);
  return value > 0 ? value : DEFAULT_DEADLINE_MS;
}

export function runHook(
  bin: string,
  args: string[],
  options: {
    cwd: string;
    input?: string;
    deadlineMs: number;
    firstLine?: boolean;
  },
): Promise<HookRun> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let bytes = 0;
    let resolved = false;
    let exited = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (run: Omit<HookRun, "stdout" | "stderr">) => {
      if (resolved) return;
      resolved = true;
      timer?.unref();
      resolve({ ...run, stdout, stderr });
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, {
        cwd: options.cwd,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      finish({ code: null, timedOut: false, failed: true });
      return;
    }

    const kill = () => {
      if (exited || child.pid === undefined) return;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    };

    timer = setTimeout(() => {
      kill();
      finish({ code: null, timedOut: true, failed: true });
    }, options.deadlineMs);

    child.on("error", () => {
      exited = true;
      clearTimeout(timer);
      finish({ code: null, timedOut: false, failed: true });
    });
    child.on("close", (code) => {
      exited = true;
      clearTimeout(timer);
      finish({ code, timedOut: false, failed: code === null });
    });
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT_BYTES) {
        kill();
        finish({ code: null, timedOut: false, failed: true });
        return;
      }
      stdout += chunk;
      if (options.firstLine && stdout.includes("\n")) {
        finish({ code: 0, timedOut: false, failed: false });
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < 64 * 1024) stderr += chunk;
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input ?? "");
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDecision(stdout: string): Decision | null {
  const line = stdout.split("\n", 1)[0]?.trim();
  if (!line) return null;
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isObject(value) || value.contract_version !== CONTRACT_VERSION) {
    return null;
  }
  if (!DECISION_KEYS.every((key) => Object.hasOwn(value, key))) return null;
  const notice =
    typeof value.notice === "string" && value.notice.length > 0
      ? value.notice
      : null;
  if (value.action === "none") return { injection: null, notice };
  if (value.action !== "inject") return null;
  const { skill, tree_digest: treeDigest, content } = value;
  if (
    typeof skill !== "string" ||
    skill.length === 0 ||
    typeof treeDigest !== "string" ||
    !DIGEST_RE.test(treeDigest) ||
    typeof content !== "string" ||
    content.length === 0
  ) {
    return null;
  }
  return { injection: { skill, treeDigest, content }, notice };
}

export async function route(request: {
  prompt: string;
  sessionId: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<Decision | null> {
  const env = request.env ?? process.env;
  try {
    const run = await runHook(resolveHookBin(env), ["route"], {
      cwd: request.cwd,
      deadlineMs: resolveDeadlineMs(env),
      firstLine: true,
      input: `${JSON.stringify({
        prompt: request.prompt,
        session_id: request.sessionId,
        cwd: request.cwd,
      })}\n`,
    });
    if (run.failed || run.code !== 0) return null;
    return parseDecision(run.stdout);
  } catch {
    return null;
  }
}
