import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { type Injection, resolveHookBin, route, runHook } from "./src/hook.ts";
import { applyInjection } from "./src/inject.ts";

const COMMAND_DEADLINE_MS = 10_000;
const SUBCOMMANDS: Record<string, string> = {
  status: "status",
  on: "enable",
  off: "disable",
};

interface RunState {
  injection: Injection;
  anchorTimestamp?: number;
}

function notify(
  ctx: ExtensionContext,
  message: string,
  type: "info" | "warning" | "error" = "info",
) {
  try {
    if (ctx.hasUI) ctx.ui.notify(message, type);
  } catch {}
}

export default function tinkSkills(pi: ExtensionAPI) {
  let skipNextPrompt = false;
  let run: RunState | null = null;
  let generation = 0;

  const clear = () => {
    generation += 1;
    run = null;
  };

  pi.on("input", (event) => {
    if (event.streamingBehavior) return;
    skipNextPrompt =
      event.source === "extension" || event.text.trimStart().startsWith("/");
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const skip = skipNextPrompt;
    skipNextPrompt = false;
    clear();
    if (skip || !event.prompt.trim()) return;
    const current = generation;
    try {
      const decision = await route({
        prompt: event.prompt,
        sessionId: ctx.sessionManager.getSessionId(),
        cwd: ctx.cwd,
      });
      if (!decision || current !== generation) return;
      if (decision.injection) run = { injection: decision.injection };
      if (decision.notice) notify(ctx, decision.notice);
    } catch {}
  });

  pi.on("context", (event) => {
    const state = run;
    if (!state) return;
    try {
      if (state.anchorTimestamp === undefined) {
        for (let i = event.messages.length - 1; i >= 0; i--) {
          const message = event.messages[i];
          if (message.role === "user") {
            state.anchorTimestamp = message.timestamp;
            break;
          }
        }
      }
      const messages = applyInjection(
        event.messages,
        state.injection,
        state.anchorTimestamp,
      );
      return messages ? { messages } : undefined;
    } catch {
      return undefined;
    }
  });

  pi.on("agent_settled", clear);
  pi.on("session_shutdown", () => {
    clear();
    skipNextPrompt = false;
  });

  pi.registerCommand("tink-skills", {
    description: "tink ambient skills for this project: status | on | off",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = Object.keys(SUBCOMMANDS)
        .filter((name) => name.startsWith(prefix.trim()))
        .map((name) => ({ value: name, label: name }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const name = args.trim() || "status";
      const subcommand = SUBCOMMANDS[name];
      if (!subcommand) {
        notify(ctx, "usage: /tink-skills status|on|off", "warning");
        return;
      }
      const bin = resolveHookBin();
      const result = await runHook(bin, [subcommand], {
        cwd: ctx.cwd,
        deadlineMs: COMMAND_DEADLINE_MS,
      });
      const output = (result.stdout.trim() || result.stderr.trim()).slice(
        0,
        4000,
      );
      if (result.failed || result.code !== 0) {
        const why = result.timedOut
          ? "timed out"
          : output || `could not run ${bin}`;
        notify(ctx, `tink-hook ${subcommand} failed: ${why}`, "error");
        return;
      }
      notify(ctx, output || `tink-hook ${subcommand} ok`);
    },
  });
}
