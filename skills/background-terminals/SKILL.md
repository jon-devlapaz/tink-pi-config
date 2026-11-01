---
name: background-terminals
description: Manage persistent shell jobs with herdr-core. Use for dev servers, watchers, streaming builds, and commands that must keep running while work continues.
---

# Persistent programs

Read `hc --skill` before running long-lived programs. Use ordinary `bash` for quick commands.

1. Inspect task-owned terminals with `hc ls` to avoid duplicate jobs.
2. Start noninteractive jobs with `hc run --bg --name <useful-name> --cwd <directory> <program> <args...>`. A single quoted command is a shell command; prefer separate argv when shell syntax is unnecessary.
3. Continue other work. Use `hc wait <terminal> --output <ready-marker>` for readiness or `hc wait <terminal>` for completion, then `hc read <terminal>` for actual output. A timeout leaves the job running; use its returned address rather than launching another copy.
4. Show a job with `herdr-app` only when visibility is requested; read `herdr-app --skill` and use explicit returned IDs. Unlabeled jobs remain outside the window.
5. After results are accepted, stop/remove only task-owned jobs with `hc kill` and `hc rm`. Preserve requested logs and artifacts. Never stop the user's core or unrelated terminals.

A window closing does not end core terminals. Parent-child lifetime is separate: use `--outlive-parent` only when the user explicitly requests independence from the launching agent. Use interactive Pi for agent workers, following the subagents skill; shell jobs are not agent delegation.
