# Global instructions

## Pi infrastructure changes

- Get the user's explicit permission for that scope before changing `tink-pi-config`, live Pi configuration, or any installed Pi/extension code. General project work is not permission.
- Use unmodified upstream packages. Creating, patching, or introducing extensions, shims, wrappers, provider/workflow glue, or dependency overrides also requires explicit permission. Report upstream limitations and ask instead of adding workarounds.
- Normal Pi preference/session writes and the approved nightly upstream update are expected runtime operations, not permission for agent-initiated infrastructure edits or changes to the approved package list.

## Environment

- macOS, Apple Silicon, zsh, Homebrew at /opt/homebrew.
- Use Pi’s built-in `find`, `grep`, and `ls`; use system `fd`/`rg` through `bash` for advanced shell searches.
- Keep shell commands non-interactive; never assume sudo.

## Style

- Be terse and code-first: diffs and commands first, prose only for what is non-obvious.
- No preamble, no summaries of what was just done unless asked.
- Ask instead of guessing when a consequential requirement is ambiguous.

## Safety and Git

- Never stage, commit, push, or amend unless explicitly asked in this session.
- When asked to commit: inspect the diff first, stage only relevant files, match the repo's commit style.
- In long sessions, fetch/pull before pushing; the remote may have moved under you.
- Confirm before destructive operations such as recursive deletion, dropping data, or force-pushing.
- Do not expose secrets in chat or copy them into agent sessions.

## Engineering

- Read relevant tests before changing behavior; treat them as contracts.
- After code changes, detect and run the project's applicable tests, lint, and type checks (check package.json / Makefile / README). Report failures; don't claim completion with unresolved blockers.
- If no check exists, say so in one line instead of inventing one.
- At module boundaries, prefer explicit errors over silent coercion or fallback behavior.
- Do not remove tests without explaining why in the diff. A regression test only counts if verified to fail with its guard reverted.
- Mock-green suites hide real bugs; probe with stub-driven adversarial runs when it matters.
- No code comments unless asked. Do not create README/docs/markdown files unless asked.

## Herdr Desktop-only orchestration

- Use `hc` (herdr-core) for Herdr agent/program orchestration and `herdr-app` for Desktop window control. Read `hc --skill` before orchestration and `herdr-app --skill` before window changes.
- Herdr Desktop is the home for visible, persistent agents and programs. Route all authorized delegation through interactive `hc` terminals, using configured templates or authenticated Pi defaults rather than inventing model flags. Pi supplies coding tools and native status/title reporting, not internal subagent/workflow/side-agent orchestration.
- The legacy `herdr` CLI, `herdr_*` tools, and native Herdr TUI inspector target a separate server, not Desktop. Do not use them for new work, including from cmux or an inherited TUI environment. Never substitute `hc` through `HERDR_BIN`; the command APIs differ.
- Start interactive Pi inside Desktop for automatic OSC 7501 status reporting. Preserve existing TUI/cmux agents; do not migrate, reload, stop, or message unrelated sessions.
- Keep long-lived programs in `hc` terminals. Preserve retained sessions and worktrees until cleanup is explicitly authorized.

## Delegation

- Delegate only when the current request or applicable instructions authorize it. Direct execution is the default; complexity and tool availability are not authorization.
- Before authorized delegation, read [the subagents skill](skills/subagents/SKILL.md). It owns runner selection, model routing, lifecycle, recovery, and privacy rules.
- Keep delegation bounded and non-recursive. Use one writer per working tree and isolated worktrees for concurrent writers.
- Start independent reviewers with fresh context and a self-contained specification plus diff, not the implementation conversation. Fork only when inherited history is necessary and safe to share.
- Require each child to report changes, validation results, and unresolved decisions; review delegated changes and validate them yourself before reporting completion.
