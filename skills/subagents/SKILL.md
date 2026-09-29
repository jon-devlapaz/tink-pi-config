---
name: subagents
description: invoke this skill when the user asks to use subagents, delegate tasks, or spawn background agents
---

# Visible Subagents with Herdr

All subagents and delegations run inside visible Herdr terminal panes so the user can watch them execute, intervene, or inspect output directly in real time.

## Lifecycle & Fleet Rules

1. **Check first:** Always run `herdr_list_agents` before spawning.
2. **Reuse existing agents:** If an agent pane of the needed kind/role already exists, steer it with `herdr_message_agent` and read with `herdr_get_agent_result` instead of creating sibling panes.
3. **Limit pane count:** Keep at most two standing subagents (e.g. `worker` and `reviewer`).
4. **Session mode:** Spawn `standalone` (default) with a self-contained prompt. Use `fork` only when the child needs discussion context — fork replays the whole conversation (context-copy tax).
5. **Model tiering:** Default workers to a cheap model; escalate to frontier/max reasoning only with cause. Supervisor keeps the strong model.
6. **No recursive delegation:** Workers must not spawn their own workers. One level only.
7. **Clean up:** Spawned agents are autonomous by default (auto-exit on settle, pane closes, session retained) — no close step needed for one-shots. Redirect working agents with `herdr_interrupt_agent` then `herdr_message_agent`; recover gone ones with `herdr_resume_agent`.
8. **Completion contract:** Every worker's final message states what changed, validation output, and open decisions. Never finish empty.

## Multi-Turn & Role Reuse (Recommended)

When working with ongoing roles (e.g. implementer, reviewer):
1. Check `herdr_list_agents`. If a suitable pane exists, proceed to step 3.
2. If none exists, launch one with `herdr_spawn_agent` (e.g. `name: "reviewer"`).
3. `herdr_message_agent`: Send prompt to `target`.
4. `herdr_get_agent_result`: Wait for and read the response text (supports `wait`).
5. Repeat 3–4 for the role's lifetime; autonomous agents auto-exit when done.

## Ephemeral One-Shot Delegation

Use `herdr_spawn_agent` with a concise prompt for isolated, throwaway one-off tasks. There is no `closeOnSuccess` param — default autonomous stance already closes the pane on success:

```
prompt: "Inspect the src/ directory and summarize test coverage."
```

## Reviewers Stay Fresh

Code-change reviewers spawn `standalone` with spec + diff only, never forked history — a forked reviewer inherits the author's blind spots.

## Session Hygiene

No secrets in prompts or chat: forks replicate history into every worker session file under `~/.pi/agent/sessions/`, retained indefinitely. Prune `sessions/` and `workflows/` artifacts periodically.

## Fleet Status

- `herdr_list_agents`: View all currently active agent panes and their statuses (`working`, `idle`, `blocked`, `done`, `gone`).
