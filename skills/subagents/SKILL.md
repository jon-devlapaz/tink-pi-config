---
name: subagents
description: Coordinate authorized visible, persistent agents in Herdr Desktop. Use when the user requests delegation, parallel agent work, or a persistent agent session.
---

# Desktop-owned agents

Herdr Desktop owns agent terminals and orchestration. Pi supplies coding tools and native OSC 7501 status/title reporting.

1. Confirm delegation is authorized by the current request or applicable instructions. Complexity alone is not authorization.
2. Read `hc --skill`, inspect `hc ls`, and discover roles with `hc templates`. Use `herdr-app --skill` before changing the window. Reuse suitable task-owned terminals; preserve unrelated sessions.
3. Keep at most two standing helpers. Launch interactive agents with `hc run --bg`, an explicit cwd, useful name, and complete first task. Use configured templates when available; otherwise use the authenticated Pi defaults. Never use print mode for agent workers.
4. Give each helper one objective, file scope, edit boundary, acceptance criteria, and reporting address. For parallel writers, use isolated worktrees. Keep delegation non-recursive. Give independent reviewers fresh specifications and diffs rather than implementation conversations. Reuse a reviewer session only if its existing history is independent of the implementation; otherwise launch a fresh reviewer.
5. Make requested agents visible in the intended Desktop space with explicit names. Use IDs returned by `hc` and `herdr-app`; `$HC_TERMINAL_ID` is a terminal address, not a pane ID. Check task delivery and readiness before sending follow-ups.
6. Continue useful work while helpers run. Use `hc send` for follow-ups, `hc wait` for completion, and `hc read` or a child-written report for evidence. Treat blocked states as permission/decision requests; ask the operator rather than forcing input. Report failures before retrying.
7. Review changes and run the applicable checks yourself. Distinguish observed lifecycle status from screen text. Keep helpers available for follow-ups until work is accepted, then clean up only task-owned terminals with `hc kill` and `hc rm`. Preserve results and worktrees unless cleanup is authorized.

Use `hc` for persistent programs too; the background-terminals skill covers shell jobs. Pi's internal subagent, workflow, side-agent and inspector layers are not part of this configuration. The legacy `herdr` CLI and `herdr_*` tools target a different server; never substitute `hc` through `HERDR_BIN`. Do not reload, migrate, or stop unrelated sessions or the user's core/app.

Keep secrets out of helper prompts, reports, and shared context. Share only the evidence each helper needs.
