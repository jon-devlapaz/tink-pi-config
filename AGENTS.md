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

- Delegate only when the current request or applicable instructions authorize it. Direct execution is the default; complexity and tool availability are not authorization.
- Before authorized delegation, read [the subagents skill](skills/subagents/SKILL.md). It owns runner selection, model routing, lifecycle, recovery, and privacy rules.
- Use configured native Pi roles for ordinary delegation and coordinated workflows. Use Herdr when the operator explicitly requests visible panes. Respect configured role models and thinking; resolve overrides through authenticated model discovery rather than hard-coded provider names.
- Keep delegation bounded and non-recursive. Use one writer per working tree and separate worktrees for concurrent writers.
- Start independent reviewers with fresh context and a self-contained specification plus diff. Fork only when inherited history is necessary and safe to share.
- Require each child to report changes, validation results, and unresolved decisions; verify its evidence before accepting the result.
- Keep shell-only long-lived work in background terminals. Preserve retained sessions and worktrees until cleanup is explicitly authorized.


## Correctness

- Existing tests pin behavior: read them as contracts before changing code a report complains about.
- Never delete tests silently; state the reason in the diff.
- At module boundaries, prefer fail-fast errors over silent coercion or fallback values.
- A regression test only counts if verified to fail with its guard reverted.
- Mock-green suites hide real bugs; probe with stub-driven adversarial runs when it matters.
