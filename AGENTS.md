# Global instructions

## Environment

- macOS, Apple Silicon, zsh, Homebrew at /opt/homebrew.
- `fd` is at ~/.pi/agent/bin/fd. Prefer ripgrep/fd over find/grep when available.
- Keep shell commands non-interactive; never assume sudo.

## Style

- Be terse and code-first: diffs and commands first, prose only for what is non-obvious.
- No preamble, no summaries of what was just done unless asked.
- Ask instead of guessing when a request is ambiguous and cheap to clarify.

## Git

- Never stage, commit, push, or amend unless explicitly asked in this session.
- When asked to commit: inspect the diff first, stage only relevant files, match the repo's commit style.
- In long sessions, fetch/pull before pushing; the remote may have moved under you.

## Verification

- After changing code, detect and run the project's lint/typecheck/tests (check package.json / Makefile / README) and report results.
- If no check exists, say so in one line instead of inventing one.

## Boundaries

- No code comments unless I ask.
- Do not create README/docs/markdown files unless asked.
- Confirm before destructive operations (rm -rf, dropping data, force-push).

## Subagents & Delegation

- **Session mode:** default `standalone` with a self-contained prompt. Use `fork: true` only when the task needs discussion context — fork replays the whole conversation into the child (context-copy tax, grows with session size).
- **Model tiering:** workers default cheap (`freellmapi/auto:fast` or equivalent); escalate to `meta/muse-spark-1.3-contributor` + `max` only with cause (hard reasoning, code changes). Supervisor keeps the frontier model.
- **No recursive delegation:** workers must not spawn their own workers. One level only; fan-out needed → ask supervisor.
- **Herdr for standing visual agents:** standing roles or tasks needing interactive monitoring run in visible split panes via `herdr_spawn_agent` (model/thinking per tiering above).
- **Reuse existing panes:** Check `herdr_list_agents` before spawning. Steer an existing idle agent (`herdr_message_agent` -> `herdr_get_agent_result`) instead of creating sibling panes. Redirect a working agent with `herdr_interrupt_agent` then `herdr_message_agent`; recover a gone one with `herdr_resume_agent`.
- **No pane accumulation:** Maintain at most two standing subagents (e.g. `worker` and `reviewer`). Spawned agents are autonomous by default (auto-exit on settle, pane closes, session retained) — that is the one-shot hygiene; keep panes only for standing roles.
- **Plane decision tree:** standing/visible roles → Herdr panes; bounded parallel fan-out → `workflow` (`agent()` never throws, always check `.ok`); shell-only long-lived commands → background-terminals (not agents); playbooks → pstack. Parallel writers sharing a cwd → `isolated: true` worktrees.
- **Completion contract:** every worker final message states what changed, validation output, and open decisions. Never finish empty — an empty finish strands the supervisor.
- **Fresh-context review:** code-change reviewers spawn standalone with spec + diff only, never forked history (a forked reviewer inherits the author's blind spots).
- **Session hygiene:** no secrets in chat — fork replicates history into every worker session file under `~/.pi/agent/sessions/`, retained indefinitely. Prune `sessions/` and `workflows/` artifacts periodically.


## Correctness

- Existing tests pin behavior: read them as contracts before changing code a report complains about.
- Never delete tests silently; state the reason in the diff.
- At module boundaries, prefer fail-fast errors over silent coercion or fallback values.
- A regression test only counts if verified to fail with its guard reverted.
- Mock-green suites hide real bugs; probe with stub-driven adversarial runs when it matters.
