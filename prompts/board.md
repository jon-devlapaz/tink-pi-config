---
description: Debate a hard question with a two-vendor panel in Herdr Desktop
argument-hint: "<question>"
---
Convene a read-only board on: ${@}

1. If the question is empty or ambiguous, ask for it and stop. This request authorizes exactly two read-only panel members, not recursive delegation or edits.
2. Read the `subagents` skill, `hc --skill`, and `herdr-app --skill`. Create a fresh report directory with `mktemp -d`. Launch one interactive Pi member per vendor with the two commands in the skill's reviewer routing (Anthropic Opus and Codex Astra), each with an explicit cwd and a name such as `board-opus` and `board-astra`. Make both visible in the current Desktop space.
3. Round 1: give both members the same self-contained brief: the question, relevant context and files, constraints, and what a good answer decides. Exclude secrets and this conversation. Each member answers independently, with reasoning, assumptions, risks, and confidence, in `<dir>/<name>-1.md`. Wait for both with `hc wait`.
4. Round 2: send each member the other's round-1 report path. Each writes `<dir>/<name>-2.md`: points accepted, points disputed with evidence, and its revised answer. Wait for both.
5. Read all four reports yourself. Check factual claims against sources where possible and mark unverified ones. Report the consensus, remaining disagreements with each side's strongest argument, your recommendation, and the decision the operator needs to make.
6. Keep the members open for follow-ups. Clean up the two board terminals with `hc kill` and `hc rm` only after the operator accepts the result; keep the reports unless told otherwise.
