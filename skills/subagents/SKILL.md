---
name: subagents
description: Route operator-authorized delegation through native Pi subagents or explicitly requested visible Herdr panes. Use when the user asks to delegate work or use subagents.
---

# Delegate through one owner

Delegate only when the current request or applicable user/project instructions authorize it. Tool availability and task complexity do not authorize delegation. Keep decisions and final acceptance with the parent.

## Choose the runner

- Use native `subagent` for ordinary Pi child tasks, async reviews, and coordinated workflows.
- Use Herdr when the operator requests visible agent panes or a separate persistent project session.
- Keep each run under its chosen runner's lifecycle and controls. Do not silently move a failed native run to Herdr or an external CLI; report the failure and obtain approval first.
- Read the installed pi-subagents skill before native delegation: `npm/node_modules/pi-subagents/skills/pi-subagents/SKILL.md` under the active Pi agent directory (`PI_CODING_AGENT_DIR`, otherwise `~/.pi/agent`). It owns native tool syntax and recovery rules.

## Bound the work

- Give each child one clear objective, an exact cwd and file scope, an edit boundary, acceptance criteria, and a validation/report contract.
- Prefer the smallest useful fan-out. Use configured native concurrency and cumulative launch limits; do not raise them merely to bypass a failed launch.
- Respect configured role models and thinking levels. Use scouts and lightweight delegates for bounded lookups; keep implementation and review on their configured models. Do not copy the parent's maximum thinking level to every child.
- Do not grant recursive delegation. Use one writer per working tree; isolate concurrent writers in separate worktrees.
- Start independent reviewers with fresh context and a self-contained specification plus diff, not the implementation conversation. Fork only when inherited history is necessary and safe to share.
- Require each child to report changes, validation results, and unresolved decisions. Review its evidence before accepting the result.

## Native lifecycle

Call `subagents_enable`, `subagent`, and `subagent_supervisor` directly, not through `codemode` or `ctx.executeTool()`. These tools deliberately use `model-only` exposure, including management actions such as `doctor`, `models`, and `status`. Their absence from `ALL_TOOLS`, `searchTools()`, and `describeTool()` is expected. Do not treat it as stale discovery, reload to fix it, or change exposure to bypass it.

Batch only callable tools in `codemode`. Check optional tools with `ALL_TOOLS` or `describeTool()`; probing a missing `tools.<name>` member can throw even with `typeof`.

1. Enable the native tool if needed, then list executable agent capabilities.
2. Use a direct call for one small task. Compose a coordinated wave in one async workflow.
3. Reuse an eligible retained child for a focused follow-up. Do not create duplicate scouts or reviewers.
4. Continue independent parent work while children run. Use native completion notifications; do not poll or block merely to wait.
5. Treat startup and tooling failures as blockers. Inspect the exact run and working-tree state before a same-protocol retry or an approved runner change.

## Herdr lifecycle

1. Run `herdr_list_agents` before spawning. Reuse suitable agents belonging to this task; do not redirect unrelated sessions.
2. Keep at most two standing Herdr subagents. This is a pane limit, not a native spawn or workflow limit.
3. Spawn standalone agents with a complete brief and recursive spawning disabled. Use fork only when discussion context is necessary.
4. Send follow-ups with `herdr_message_agent` and retrieve results with `herdr_get_agent_result`.
5. Redirect an active child with `herdr_interrupt_agent`, then `herdr_message_agent`. Recover a gone child with `herdr_resume_agent` and an explicit next instruction.
6. Keep one-shot agents autonomous so they exit when finished. Preserve their session and result for inspection.

## Privacy

Do not place secrets in prompts, reports, or child context. Forks copy conversation history into retained child sessions. Share only the evidence required for the task. Do not delete sessions or worktrees as routine cleanup without authorization.
