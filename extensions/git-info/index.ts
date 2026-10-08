import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Effect, Fiber, Schedule } from "effect";
import {
  emptyGitInfoState,
  GIT_INFO_CHANNEL,
  REFRESH_CHANNEL,
  type PullRequestInfo,
} from "../shared/dashboard-state.ts";
import {
  loadChangedFiles,
  showChangedFiles,
} from "./src/changed-files-view.ts";
import {
  formatChecks,
  formatSyncStatus,
  parseAheadBehind,
  parseChecksJson,
} from "./src/github-status.ts";
import { runCommand, type CommandRunner } from "./src/process.ts";
import { makeRefreshCoordinator } from "./src/refresh-coordinator.ts";
import {
  createRuntime,
  runEffect,
  type GitInfoRuntime,
} from "./src/runtime.ts";

const POLL_INTERVAL_MS = 3_000;
const GIT_TIMEOUT_MS = 3_000;
const GH_TIMEOUT_MS = 10_000;

function countChangedFiles(status: string) {
  if (!status.trim()) return 0;
  return status.split("\n").filter(Boolean).length;
}

function parsePullRequest(value: unknown) {
  if (typeof value !== "object" || value === null) return null;
  if (!("number" in value) || typeof value.number !== "number") return null;
  if (!("url" in value) || typeof value.url !== "string") return null;
  if (!("state" in value) || value.state !== "OPEN") return null;

  return {
    number: value.number,
    url: value.url,
    isDraft: "isDraft" in value && value.isDraft === true,
  } satisfies PullRequestInfo;
}

export function parsePullRequestJson(value: string, code = 0, stderr = "") {
  if (code !== 0)
    throw new Error(
      `GitHub PR lookup failed: ${stderr.trim() || `exit ${code}`}`,
    );
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed))
    throw new Error("GitHub returned an invalid PR list");
  if (parsed.length === 0) return null;
  const pr = parsePullRequest(parsed[0]);
  if (!pr) throw new Error("GitHub returned invalid PR metadata");
  return pr;
}

export default function gitInfo(pi: ExtensionAPI) {
  let state = emptyGitInfoState();
  let runtime: GitInfoRuntime | undefined;
  let pollingFiber: Fiber.Fiber<void> | undefined;
  let currentContext: ExtensionContext | undefined;
  let generation = 0;
  let queriedPrBranch: string | null = null;
  const refreshCoordinator = makeRefreshCoordinator();

  const getRuntime = () => (runtime ??= createRuntime());
  const publish = () => pi.events.emit(GIT_INFO_CHANNEL, { ...state });
  const run = (
    command: string,
    args: string[],
    ctx: ExtensionContext,
    timeout: number,
  ) => runCommand(command, args, ctx.cwd, timeout);

  const lookupPullRequest = (ctx: ExtensionContext, branch: string) =>
    Effect.gen(function* () {
      const result = yield* run(
        "gh",
        [
          "pr",
          "list",
          "--head",
          branch,
          "--state",
          "open",
          "--limit",
          "1",
          "--json",
          "number,url,state,isDraft",
        ],
        ctx,
        GH_TIMEOUT_MS,
      );
      return parsePullRequestJson(result.stdout, result.code, result.stderr);
    });

  const lookupSyncStatus = (ctx: ExtensionContext) =>
    Effect.gen(function* () {
      const result = yield* run(
        "git",
        ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        ctx,
        GIT_TIMEOUT_MS,
      );
      if (result.code !== 0) return null;
      return parseAheadBehind(result.stdout);
    });

  const lookupChecks = (ctx: ExtensionContext, branch: string) =>
    Effect.gen(function* () {
      const result = yield* run(
        "gh",
        ["pr", "checks", branch, "--json", "bucket,name"],
        ctx,
        GH_TIMEOUT_MS,
      );
      // gh uses 1 for failing checks and 8 for pending checks, not transport errors.
      if (result.code !== 0 && result.code !== 1 && result.code !== 8)
        throw new Error(
          `GitHub checks lookup failed: ${result.stderr.trim() || `exit ${result.code}`}`,
        );
      const checks = parseChecksJson(result.stdout);
      if (
        !checks ||
        (result.code === 1 && checks.fail === 0) ||
        (result.code === 8 && checks.pending === 0)
      )
        throw new Error(
          `GitHub checks lookup failed: ${result.stderr.trim() || "invalid checks response"}`,
        );
      return checks;
    });

  const refreshEffect = (
    ctx: ExtensionContext,
    forcePullRequest: boolean,
    refreshGeneration: number,
  ) =>
    Effect.suspend(() => {
      if (refreshGeneration !== generation) return Effect.void;
      currentContext = ctx;

      return Effect.gen(function* () {
        const repo = yield* run(
          "git",
          ["rev-parse", "--is-inside-work-tree"],
          ctx,
          GIT_TIMEOUT_MS,
        );
        if (refreshGeneration !== generation) return;

        if (repo.code !== 0 || repo.stdout.trim() !== "true") {
          queriedPrBranch = null;
          state = emptyGitInfoState();
          ctx.ui.setStatus("git-info", undefined);
          reportedDefect = "";
          publish();
          return;
        }

        const [branchResult, headResult, statusResult, syncResult] =
          yield* Effect.all(
            [
              run("git", ["branch", "--show-current"], ctx, GIT_TIMEOUT_MS),
              run("git", ["rev-parse", "--short", "HEAD"], ctx, GIT_TIMEOUT_MS),
              run(
                "git",
                ["status", "--porcelain=v1", "--untracked-files=all"],
                ctx,
                GIT_TIMEOUT_MS,
              ),
              lookupSyncStatus(ctx),
            ],
            { concurrency: "unbounded" },
          );
        if (refreshGeneration !== generation) return;

        const branchName = branchResult.stdout.trim();
        const shortHead = headResult.stdout.trim();
        const branch =
          branchName || (shortHead ? `detached@${shortHead}` : "detached");
        const branchChanged = branchName !== queriedPrBranch;

        state = {
          ...state,
          isRepository: true,
          branch,
          changedFiles:
            statusResult.code === 0
              ? countChangedFiles(statusResult.stdout)
              : 0,
          ahead: syncResult?.ahead ?? null,
          behind: syncResult?.behind ?? null,
          pullRequest: branchChanged ? null : state.pullRequest,
          checks: branchChanged ? null : state.checks,
        };
        publish();

        if (!branchName) {
          // queriedPrBranch is never "", so branchChanged already cleared pullRequest.
          queriedPrBranch = null;
          return;
        }

        if (forcePullRequest || branchChanged) {
          const remotes = yield* run("git", ["remote"], ctx, GIT_TIMEOUT_MS);
          if (remotes.code !== 0)
            throw new Error(
              `Git remote lookup failed: ${remotes.stderr.trim()}`,
            );
          if (!remotes.stdout.trim()) {
            queriedPrBranch = branchName;
            ctx.ui.setStatus("git-info", undefined);
            return;
          }
          queriedPrBranch = branchName;
          const pullRequest = yield* lookupPullRequest(ctx, branchName);
          if (refreshGeneration !== generation) return;
          const checks = pullRequest
            ? yield* lookupChecks(ctx, branchName)
            : null;
          if (refreshGeneration !== generation) return;
          queriedPrBranch = branchName;
          state = { ...state, pullRequest, checks };
          ctx.ui.setStatus("git-info", undefined);
          reportedDefect = "";
          publish();
        }
      });
    });

  const refresh = (ctx: ExtensionContext, forcePullRequest = false) =>
    refreshCoordinator.run(refreshEffect(ctx, forcePullRequest, generation));

  const refreshIfIdle = (ctx: ExtensionContext) =>
    refreshCoordinator.runIfIdle(refreshEffect(ctx, false, generation));

  let reportedDefect = "";
  const reportBackgroundDefect = (defect: unknown) =>
    Effect.sync(() => {
      const message = defect instanceof Error ? defect.message : String(defect);
      currentContext?.ui.setStatus("git-info", "GitHub metadata unavailable");
      if (message !== reportedDefect) {
        currentContext?.ui.notify(message, "warning");
        reportedDefect = message;
      }
    });

  const poll = () =>
    Effect.suspend(() =>
      currentContext ? refreshIfIdle(currentContext) : Effect.void,
    ).pipe(
      Effect.catchDefect(reportBackgroundDefect),
      Effect.repeat(Schedule.fixed(POLL_INTERVAL_MS)),
      Effect.delay(POLL_INTERVAL_MS),
      Effect.asVoid,
    );

  const forkBackground = (effect: Effect.Effect<void, never, CommandRunner>) =>
    getRuntime().runFork(
      effect.pipe(Effect.catchDefect(reportBackgroundDefect)),
    );

  const refreshInBackground = (ctx: ExtensionContext) => {
    forkBackground(refreshIfIdle(ctx));
  };

  const stopRefreshListener = pi.events.on(REFRESH_CHANNEL, () => {
    if (currentContext) refreshInBackground(currentContext);
  });

  pi.on("session_start", async (_event, ctx) => {
    generation += 1;
    queriedPrBranch = null;

    const previousPollingFiber = pollingFiber;
    pollingFiber = undefined;
    if (previousPollingFiber) {
      await getRuntime().runPromise(Fiber.interrupt(previousPollingFiber));
    }

    // Do not block Pi startup on GitHub/network I/O. The initial refresh publishes
    // state when it completes; polling continues to keep it current afterwards.
    refreshInBackground(ctx);
    pollingFiber = forkBackground(poll());
  });

  pi.on("input", (_event, ctx) => {
    refreshInBackground(ctx);
    return { action: "continue" };
  });

  pi.on("tool_execution_end", (_event, ctx) => {
    refreshInBackground(ctx);
  });

  pi.on("session_shutdown", async () => {
    stopRefreshListener();
    generation += 1;
    currentContext = undefined;
    pollingFiber = undefined;
    const closing = runtime;
    runtime = undefined;
    await closing?.dispose();
  });

  pi.registerCommand("lg", {
    description: "Browse changed files and their diffs",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify(
          "The local changes viewer requires the interactive TUI",
          "warning",
        );
        return;
      }

      const files = await runEffect(getRuntime(), loadChangedFiles(ctx.cwd), {
        signal: ctx.signal,
        interruptMessage: "Loading changed files was cancelled.",
      });
      if (files === null) {
        ctx.ui.notify("Not a git repository", "warning");
        return;
      }
      if (files.length === 0) {
        ctx.ui.notify("Working tree is clean", "info");
        return;
      }

      await showChangedFiles(ctx, files);
    },
  });

  pi.registerCommand("pr", {
    description: "Refresh git and pull request information",
    handler: async (_args, ctx) => {
      try {
        await runEffect(getRuntime(), refresh(ctx, true), {
          signal: ctx.signal,
          interruptMessage: "Git and pull request refresh was cancelled.",
        });
      } catch (error) {
        ctx.ui.setStatus("git-info", "GitHub metadata unavailable");
        throw error;
      }
      if (!state.isRepository) {
        ctx.ui.notify("Not a git repository", "warning");
      } else if (state.pullRequest) {
        const draft = state.pullRequest.isDraft ? " (draft)" : "";
        const sync = formatSyncStatus(state.ahead, state.behind);
        const checksSummary = formatChecks(state.checks);
        const checks = checksSummary ? ` checks${checksSummary}` : "";
        ctx.ui.notify(
          `PR #${state.pullRequest.number}${draft}${sync}${checks}: ${state.pullRequest.url}`,
          "info",
        );
      } else {
        ctx.ui.notify(`No open PR found for ${state.branch}`, "info");
      }
    },
  });
}
