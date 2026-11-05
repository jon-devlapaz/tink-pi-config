---
description: Run a fresh-context, read-only review in Herdr Desktop
argument-hint: "[focus / specific files or commit]"
---
Review the requested changes with one visible, persistent Desktop reviewer.

1. Inspect `git status --short` and the requested staged, unstaged, file or commit diff from `$@`. If there is no repository or relevant diff, report "No changes found to review" and stop.
2. Read the `subagents` skill and `hc --skill`. This request authorizes one read-only reviewer, not recursive delegation. Reuse a task-owned reviewer terminal only if its history is independent of the implementation; otherwise launch a fresh interactive Pi reviewer on a different model vendor than the author, following the subagents skill's reviewer routing. Make it visible with an explicit name through `herdr-app` after reading its skill.
3. Give the reviewer fresh context: repository/cwd, exact file scope, relevant diff, acceptance criteria and review focus from `$@`. Exclude secrets and the implementation conversation. Require read-only work, no recursive delegation, and correctness/security/maintainability findings with file/line evidence and severity.
4. Retrieve the completed result with `hc read` or a child-written report. Check findings against source and tests; distinguish verified defects from hypotheses. Report actionable findings and remaining coverage gaps. Make no edits unless separately requested.
