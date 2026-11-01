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
- Herdr Desktop is the home for visible, persistent agents. Use `hc` for all authorized agent/program orchestration and `herdr-app` for window control; read their `--skill` manuals first. Use configured templates or authenticated Pi defaults rather than inventing model flags.
- Keep delegation bounded and non-recursive. Use one writer per working tree and separate worktrees for concurrent writers.
- Start independent reviewers with fresh context and a self-contained specification plus diff. Fork only when inherited history is necessary and safe to share.
- Require each child to report changes, validation results, and unresolved decisions; verify its evidence before accepting the result.
- Keep long-lived programs in `hc` terminals. Pi owns ordinary coding tools and native status/title reporting; Desktop owns orchestration and visibility. Preserve retained sessions and worktrees until cleanup is explicitly authorized.


## Correctness

- Existing tests pin behavior: read them as contracts before changing code a report complains about.
- Never delete tests silently; state the reason in the diff.
- At module boundaries, prefer fail-fast errors over silent coercion or fallback values.
- A regression test only counts if verified to fail with its guard reverted.
- Mock-green suites hide real bugs; probe with stub-driven adversarial runs when it matters.
