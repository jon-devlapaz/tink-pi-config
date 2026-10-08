export interface Notice {
  text: string;
  kind: "activity" | "warning" | "error";
}

export function plainLabel(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\x00-\x1f\x7f-\x9f\ue000-\uf8ff\u2800-\u28ff]/g, "")
    .replace(
      /[\p{Extended_Pictographic}\p{Emoji_Presentation}\ufe0f\u200d]/gu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function pressure(
  percent: number | null | undefined,
): Notice | undefined {
  if (percent == null || !Number.isFinite(percent) || percent < 70) return;
  return {
    text: `context ${Math.round(percent)}%`,
    kind: percent >= 90 ? "error" : "warning",
  };
}

export function statusNotices(statuses: ReadonlyMap<string, string>): Notice[] {
  const notices: Notice[] = [];
  for (const [key, value] of statuses) {
    const text = plainLabel(value);
    if (
      !text ||
      /^herdr \d+\.\d+\.\d+$/.test(text) ||
      /^0 (running|active|agents?)$/i.test(text)
    )
      continue;
    if (
      /\b(fail(?:ed|ure|ing)?|error|unavailable|not installed|too old|disconnected|conflicts?)\b/i.test(
        text,
      )
    ) {
      notices.push({ text: `FAIL ${text}`, kind: "error" });
    } else if (
      /\b(blocked|waiting|version unknown|needs? (attention|input|decision)|quota|rate.limit|throttl\w*)\b/i.test(
        text,
      )
    ) {
      notices.push({ text: `ATTN ${text}`, kind: "warning" });
    } else if (
      /subagent|agent/i.test(key) &&
      /\b(running|active|tools?|researching|reviewing|testing)\b/i.test(text)
    ) {
      notices.push({ text, kind: "activity" });
    } else if (/\bretrying\b/i.test(text)) {
      notices.push({ text, kind: "activity" });
    }
  }
  return notices;
}

export function modelNotice(reason: string, message = ""): Notice | undefined {
  if (reason !== "error") return;
  return /quota|rate.?limit/i.test(message)
    ? { text: "ATTN provider limit", kind: "warning" }
    : { text: "FAIL model request", kind: "error" };
}

export function prioritized(notices: Notice[]): Notice[] {
  const rank = { error: 0, warning: 1, activity: 2 };
  const seen = new Set<string>();
  return notices
    .filter(({ text }) => {
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .sort((a, b) => rank[a.kind] - rank[b.kind]);
}
