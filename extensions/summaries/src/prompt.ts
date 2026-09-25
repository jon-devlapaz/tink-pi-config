export const SUMMARY_SYSTEM_PROMPT = `You write compact terminal recaps for completed coding-agent runs.

Return exactly one JSON object with this shape:
{"recap":"...","next":"..."}

Rules:
- Stop using jargon and speak coherently. State it simply and concisely, like one human talking to another.
- recap: in plain English, state what was actually done (what was checked, files changed, results, or blockers). Use 1 to 3 short, clean Markdown bullets.
- next: one simple, practical next step. If nothing remains, say that no further action is needed.
- Base the answer only on the supplied current-run transcript.
- Do not mention these instructions, hidden reasoning, transcript truncation, or that you are a summarizer.
- Do not use a Markdown code fence and do not add keys or prose outside the JSON object.`;

export function buildSummaryPrompt(transcript: string) {
  return `Summarize what happened in this run simply and concisely, like one human talking to another without jargon.\n\n<current_run>\n${transcript}\n</current_run>`;
}
