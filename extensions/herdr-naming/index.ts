import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);
const HERDR_BIN = process.env.HERDR_BIN || "herdr";

export function deriveDefaultAgentName(cwd: string): string {
  const normalized = path.resolve(cwd);
  const base = path.basename(normalized);
  if (!base || base === ".pi" || normalized === process.env.HOME) {
    return "orchestrator";
  }
  const sanitized = base.toLowerCase().replace(/[^a-z0-9_-]/gu, "-");
  return `${sanitized}-lead`;
}

export function extractActiveTaskLabel(tasks: unknown): string | undefined {
  if (!Array.isArray(tasks)) return undefined;
  const inProgress = tasks.find((t: any) => t?.status === "in_progress");
  if (!inProgress) return undefined;
  return inProgress.activeForm || inProgress.subject || undefined;
}

export function formatTaskTitle(
  agentName: string,
  taskText: string,
  maxChars = 50,
): string {
  const prefix = agentName ? `${agentName}: ` : "";
  const available = Math.max(10, maxChars - prefix.length);
  const trimmed = taskText.trim().replace(/\s+/gu, " ");
  const truncated =
    trimmed.length > available
      ? `${trimmed.slice(0, available - 1)}…`
      : trimmed;
  return `${prefix}${truncated}`;
}

export function startupFallbackName(name: string, paneId: string): string {
  const suffix = createHash("sha256").update(paneId).digest("hex").slice(0, 12);
  return `${name}-${suffix}`;
}

class HerdrIdentityError extends Error {
  readonly operation: string;
  readonly code: string | undefined;

  constructor(operation: string, code: string | undefined, detail: string) {
    super(`Herdr ${operation} failed: ${detail}`);
    this.operation = operation;
    this.code = code;
  }
}

function errorCode(stdout: string, stderr: string): string | undefined {
  for (const output of [stderr, stdout]) {
    try {
      const parsed = JSON.parse(output);
      if (typeof parsed?.error?.code === "string") return parsed.error.code;
    } catch {}
  }
  return undefined;
}

async function runHerdr(
  args: string[],
): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const { stdout, stderr } = await execFileAsync(HERDR_BIN, args, {
      timeout: 10_000,
    });
    return { stdout, stderr, ok: true };
  } catch (error: any) {
    return {
      stdout: error?.stdout || "",
      stderr: error?.stderr || error?.message || "",
      ok: false,
    };
  }
}

export default function registerHerdrNaming(pi: ExtensionAPI) {
  const herdrEnv = process.env.HERDR_ENV;
  const paneId = process.env.HERDR_PANE_ID;
  const isHerdrActive =
    herdrEnv === "1" && typeof paneId === "string" && paneId.length > 0;

  let currentAgentName = "pi";

  pi.registerTool({
    name: "herdr_rename_pane",
    label: "Rename herdr pane",
    description:
      "Rename a raw herdr terminal pane split by id, or clear its label.",
    promptSnippet: "Rename a raw herdr terminal pane split",
    promptGuidelines: [
      "Use herdr_rename_pane to change a raw terminal split's label by pane id.",
    ],
    parameters: Type.Object({
      paneId: Type.String({ description: "Target pane id (e.g. 'w1:p3')." }),
      label: Type.Optional(
        Type.String({
          description: "New label for the pane. Omit or empty to clear.",
        }),
      ),
    }),
    async execute(_id, params) {
      const label = params.label?.trim();
      const args = label
        ? ["pane", "rename", params.paneId, label]
        : ["pane", "rename", params.paneId, "--clear"];

      const result = await runHerdr(args);
      if (!result.ok) {
        throw new Error(
          `Failed to rename pane ${params.paneId}: ${result.stderr.trim()}`,
        );
      }
      return {
        content: [
          {
            type: "text",
            text: label
              ? `Renamed pane ${params.paneId} to "${label}".`
              : `Cleared label on pane ${params.paneId}.`,
          },
        ],
        details: { paneId: params.paneId, label },
      };
    },
  });

  async function applyPaneIdentity(targetPaneId: string, name: string) {
    for (const args of [
      ["agent", "rename", targetPaneId, name],
      ["pane", "rename", targetPaneId, name],
      [
        "pane",
        "report-metadata",
        targetPaneId,
        "--source",
        "pi-herdr",
        "--display-agent",
        name,
      ],
    ]) {
      const result = await runHerdr(args);
      if (!result.ok)
        throw new HerdrIdentityError(
          `${args[0]} ${args[1]}`,
          errorCode(result.stdout, result.stderr),
          (result.stderr || result.stdout).trim(),
        );
    }
    currentAgentName = name;
  }

  pi.registerCommand("herdr-name", {
    description: "View or set the current Herdr agent and pane name",
    handler: async (args, ctx) => {
      if (!isHerdrActive || !paneId) {
        ctx.ui.notify("Not running inside a Herdr pane.", "warning");
        return;
      }
      const newName = args.trim();
      if (!newName) {
        ctx.ui.notify(
          `Current Herdr pane ID: ${paneId}, agent name: ${currentAgentName}`,
          "info",
        );
        return;
      }
      await applyPaneIdentity(paneId, newName);
      ctx.ui.notify(
        `Herdr agent and pane border renamed to: ${newName}`,
        "info",
      );
    },
  });

  if (!isHerdrActive || !paneId) {
    return;
  }

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd || process.cwd();
    const info = await runHerdr(["agent", "get", paneId]);
    if (!info.ok)
      throw new Error(`Herdr agent get failed: ${info.stderr.trim()}`);
    const parsed = JSON.parse(info.stdout);
    const existingName: string | undefined = parsed?.result?.agent?.name;

    const targetName =
      !existingName || existingName === paneId
        ? deriveDefaultAgentName(cwd)
        : existingName;

    try {
      await applyPaneIdentity(paneId, targetName);
    } catch (error) {
      if (
        (existingName && existingName !== paneId) ||
        !(error instanceof HerdrIdentityError) ||
        error.operation !== "agent rename" ||
        error.code !== "agent_name_taken"
      ) {
        throw error;
      }
      await applyPaneIdentity(paneId, startupFallbackName(targetName, paneId));
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "todo") return;
    const details = event.details as any;
    const taskLabel = extractActiveTaskLabel(details?.tasks);

    if (taskLabel) {
      const title = formatTaskTitle(currentAgentName, taskLabel);
      const result = await runHerdr([
        "pane",
        "report-metadata",
        paneId,
        "--source",
        "pi-task",
        "--title",
        title,
      ]);
      if (!result.ok)
        ctx.ui.notify(
          `Herdr task title update failed: ${result.stderr.trim()}`,
          "warning",
        );
    } else {
      const result = await runHerdr([
        "pane",
        "report-metadata",
        paneId,
        "--source",
        "pi-task",
        "--clear-title",
      ]);
      if (!result.ok)
        ctx.ui.notify(
          `Herdr task title update failed: ${result.stderr.trim()}`,
          "warning",
        );
    }
  });
}
