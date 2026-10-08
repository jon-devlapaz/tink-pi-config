---
description: Run a fresh-context, read-only subagent code review
argument-hint: "[focus / specific files or commit]"
---
Review the requested changes through the configured subagent runner.

1. **Scope**:
   - Inspect `git status --short`, then the staged or unstaged diff. Apply specific commit or file arguments from `${@}`.
   - If there is no repository or relevant diff, report "No changes found to review" and stop.
   - Read the available `subagents` skill and its installed native pi-subagents reference. This review request authorizes one bounded reviewer, not recursive delegation.

2. **Review**:
   - Use a native Pi review role by default. Discover executable agent capabilities and use its configured authenticated model and thinking level. If no suitable read-only role is available, report the blocker; do not invent a provider/model or silently switch runners.
   - Use Herdr only when visible panes are explicitly requested. Follow the subagents skill's reuse, isolation, and recovery rules.
   - Give the reviewer fresh context: repository/cwd, exact file scope, relevant diff, acceptance criteria, and review focus from `${@}`. Exclude secrets and the implementation conversation.
   - Require read-only work and no recursive delegation. Ask for correctness, security, maintainability, and missing regression coverage, with file/line evidence and severity. If a requested review skill is unavailable, report it rather than claiming it was applied.

3. **Acceptance**:
   - Retrieve the exact completed result through the owning runner. Check findings against the source and tests; distinguish verified defects from hypotheses.
   - Report actionable findings and remaining coverage gaps. Make no edits unless separately requested.
