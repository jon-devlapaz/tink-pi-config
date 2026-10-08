import { basename } from "node:path";
import { homedir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
  GIT_INFO_CHANNEL,
  REFRESH_CHANNEL,
  isGitInfoState,
  type GitInfoState,
} from "../shared/dashboard-state.ts";
import { AgentRuns } from "./agent-runs.ts";
import {
  plainLabel,
  modelNotice,
  pressure,
  prioritized,
  statusNotices,
  type Notice,
} from "./quiet-state.ts";

export default function quietStatusline(pi: ExtensionAPI) {
  let context: ExtensionContext | undefined;
  let git: GitInfoState | undefined;
  let refresh = () => {};
  let busy = false;
  let waiting: string | undefined;
  let toolFailure: Notice | undefined;
  let modelFailure: Notice | undefined;
  const tools = new Map<string, string>();
  const agents = new AgentRuns();

  const listeners = [
    pi.events.on(GIT_INFO_CHANNEL, (value) => {
      if (!context || !isGitInfoState(value)) return;
      git = value;
      refresh();
    }),
    pi.events.on("subagent:async-started", (value) => {
      if (context) agents.started(value, context.sessionManager.getSessionId());
      refresh();
    }),
    pi.events.on("subagent:async-complete", (value) => {
      agents.completed(value);
      refresh();
    }),
    pi.events.on("subagent:control-event", (value) => {
      agents.control(value);
      refresh();
    }),
  ];

  function reset(ctx: ExtensionContext) {
    context = ctx;
    git = undefined;
    busy = false;
    waiting = undefined;
    toolFailure = undefined;
    modelFailure = undefined;
    tools.clear();
    agents.reset();
  }

  function install(ctx: ExtensionContext) {
    reset(ctx);
    if (ctx.mode !== "tui") return;
    ctx.ui.setFooter((tui, theme, footerData) => {
      const requestRender = () => tui.requestRender();
      refresh = requestRender;
      const unsubscribe = footerData.onBranchChange(() => {
        git = undefined;
        pi.events.emit(REFRESH_CHANNEL, undefined);
        requestRender();
      });
      return {
        invalidate() {},
        dispose() {
          unsubscribe();
          if (refresh === requestRender) refresh = () => {};
        },
        render(width) {
          if (width < 1) return [];
          const directory = plainLabel(
            ctx.cwd === homedir() ? "~" : basename(ctx.cwd),
          );
          const branch = plainLabel(
            git?.isRepository
              ? (git.branch ?? footerData.getGitBranch() ?? "")
              : (footerData.getGitBranch() ?? ""),
          );
          const changes =
            git?.isRepository && git.changedFiles > 0
              ? ` +${git.changedFiles}`
              : "";
          const left = `${directory}${branch ? ` · ${branch}${changes}` : ""}`;
          const model = plainLabel(ctx.model?.id ?? "no model").replace(
            /^gpt[- ]/,
            "",
          );
          const right = `${model}${ctx.model?.reasoning ? ` · ${pi.getThinkingLevel()}` : ""}`;
          const fittedRight = truncateToWidth(right, width);
          const room = width - visibleWidth(fittedRight) - 2;
          const baseline =
            room > 0
              ? `${truncateToWidth(left, room)}${" ".repeat(Math.max(2, width - visibleWidth(truncateToWidth(left, room)) - visibleWidth(fittedRight)))}${fittedRight}`
              : fittedRight;
          const notices = [
            ...statusNotices(footerData.getExtensionStatuses()),
            ...agents.notices(),
          ];
          if (toolFailure) notices.push(toolFailure);
          if (modelFailure) notices.push(modelFailure);
          if (waiting)
            notices.push({ text: `WAIT ${waiting}`, kind: "warning" });
          else if (tools.size) {
            const names = [...new Set(tools.values())].map(plainLabel);
            notices.push({
              text: `${names.join(", ")}${tools.size > 1 ? ` (${tools.size} tools)` : ""}`,
              kind: "activity",
            });
          } else if (busy)
            notices.push({ text: "generating", kind: "activity" });
          const measured = pressure(ctx.getContextUsage()?.percent);
          if (measured) notices.push(measured);
          if (git?.checks && git.checks.fail > 0)
            notices.push({
              text: `FAIL ${git.checks.fail} PR checks`,
              kind: "error",
            });
          const ordered = prioritized(notices);
          const lines = [theme.fg("dim", baseline)];
          if (ordered.length) {
            const text = ordered
              .map((n) =>
                theme.fg(
                  n.kind === "error"
                    ? "error"
                    : n.kind === "warning"
                      ? "warning"
                      : "accent",
                  n.text,
                ),
              )
              .join(theme.fg("dim", " · "));
            lines.push(truncateToWidth(text, width));
          }
          return lines;
        },
      };
    });
    pi.events.emit(REFRESH_CHANNEL, undefined);
  }

  pi.on("session_start", (_event, ctx) => install(ctx));
  pi.on("session_tree", (_event, ctx) => install(ctx));
  pi.on("agent_start", () => {
    busy = true;
    toolFailure = undefined;
    modelFailure = undefined;
    refresh();
  });
  pi.on("agent_settled", () => {
    busy = false;
    tools.clear();
    refresh();
  });
  pi.on("tool_execution_start", (event) => {
    tools.set(event.toolCallId, event.toolName);
    refresh();
  });
  pi.on("tool_execution_end", (event) => {
    tools.delete(event.toolCallId);
    if (event.isError)
      toolFailure = {
        text: `FAIL ${plainLabel(event.toolName)}`,
        kind: "error",
      };
    refresh();
  });
  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason !== "aborted") {
      modelFailure = modelNotice(
        event.message.stopReason,
        event.message.errorMessage,
      );
    }
    refresh();
  });
  pi.on("ui_prompt_start", (event) => {
    waiting = plainLabel(event.title || event.kind);
    refresh();
  });
  pi.on("ui_prompt_end", () => {
    waiting = undefined;
    refresh();
  });
  pi.on("model_select", () => refresh());
  pi.on("thinking_level_select", () => refresh());
  pi.on("session_compact", () => refresh());
  pi.on("session_shutdown", (_event, ctx) => {
    for (const unsubscribe of listeners) unsubscribe();
    reset(ctx);
    context = undefined;
    if (ctx.mode === "tui") ctx.ui.setFooter(undefined);
  });
  pi.registerCommand("statusline", {
    description:
      "Quiet footer information; use /statusline ack to dismiss reported notices",
    handler: async (args, ctx) => {
      if (args.trim() === "ack") {
        agents.acknowledge();
        toolFailure = undefined;
        modelFailure = undefined;
        refresh();
        return;
      }
      ctx.ui.notify(
        "Quiet footer: location/branch and model/thinking. Activity and reported attention appear on row two; context warns at 70% and becomes urgent at 90%. /statusline ack dismisses agent/tool notices, not ongoing work or pressure.",
        "info",
      );
    },
  });
}
