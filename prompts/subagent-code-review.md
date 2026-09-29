---
description: Run a subagent review using the thermo-nuclear-code-quality-review skill
argument-hint: "[focus / specific files or commit]"
---
Delegate a code review to a subagent running in a visible Herdr split pane with `meta/muse-spark-1.3-contributor`.

1. **Context & Diff**:
   - Inspect git status and diff (`git status --short`, then `git diff --cached` or `git diff`).
   - If specific commit or file arguments were provided in `${@}`, target those.
   - If there is no active diff or repository, report "No changes found to review" and stop.

2. **Herdr Delegation**:
   - Check `herdr_list_agents` first. If an agent named `reviewer` (or an idle review pane) already exists, steer it via `herdr_message_agent` and read the verdict with `herdr_get_agent_result`.
   - If no reviewer exists, launch one with:
     - `herdr_spawn_agent` with `name`: `"reviewer"`, `model`: `"meta/muse-spark-1.3-contributor"`, `thinking`: `"max"` (read-only review — instruct no edits in the prompt)
     - then steer with `herdr_message_agent(target: "reviewer", text: ...)`
   - Prompt format:
     ```
     You are performing a read-only code quality review. Make no edits.

     MANDATORY FIRST STEP:
     Use your `read` tool to read the skill at:
     /Users/jondev/.pi/agent/skills/thermo-nuclear-code-quality-review/SKILL.md

     Follow that skill completely. Apply its Core Prompt, Non-Negotiable Standards (0 through 7), Primary Review Questions, Aggressive Flags, and Review Tone to the changes below.

     Target files and diff:
     [Insert resolved git status and git diff here]

     Review focus:
     ${@:-Full thermo-nuclear code quality audit}

     Structure your final report according to the skill's instructions.
     ```

3. **Synthesis**:
   - Summarize the subagent's verdict and key structural findings back in this conversation.
