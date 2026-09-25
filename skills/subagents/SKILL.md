---
name: subagents
description: invoke this skill when the user asks you to use subagents, delegate tasks, or spawn background agents
---

# Visible Subagents with Herdr

All subagents and delegations run inside visible Herdr terminal panes so the user can watch them execute, intervene, or inspect output directly in real time.

## One-Shot Delegation (Preferred)

Use `herdr_delegate` to spawn an agent in a split pane, send it a self-contained prompt, wait for it to complete, and retrieve its response in a single call.

```json
{
  "agent": "pi",
  "prompt": "Inspect the src/ directory and summarize test coverage.",
  "closeOnSuccess": false
}
```

- **`agent`**: Agent kind (`pi`, `claude`, `codex`, `cursor`, `opencode`). Default: `pi`.
- **`closeOnSuccess`**: Default `false` (keeps the split pane open so the user can see what happened). Set `true` if the user requests cleanup.
- **`prompt`**: Must be completely self-contained. Include exact file paths, constraints, and the expected output format.

## Manual Multi-Turn Control

When you need an interactive or multi-step subagent:
1. `herdr_start_agent`: Opens a new split pane (`split: "right"` or `"down"`).
2. `herdr_send_prompt`: Types and submits the prompt to that agent pane.
3. `herdr_wait_agent`: Waits until the agent status switches to `idle`.
4. `herdr_read_agent`: Reads recent output from the agent pane.
5. `herdr_stop_agent`: Closes the pane when completely finished.

## Fleet Status

- `herdr_list_agents`: View all currently active agent panes and their statuses (`working`, `idle`, `blocked`).
