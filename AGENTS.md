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

- When delegating tasks or running subagents, use Herdr (`herdr_delegate` or `herdr_start_agent`) so agents run in visible split panes.


## Correctness

- Existing tests pin behavior: read them as contracts before changing code a report complains about.
- Never delete tests silently; state the reason in the diff.
- At module boundaries, prefer fail-fast errors over silent coercion or fallback values.
- A regression test only counts if verified to fail with its guard reverted.
- Mock-green suites hide real bugs; probe with stub-driven adversarial runs when it matters.
