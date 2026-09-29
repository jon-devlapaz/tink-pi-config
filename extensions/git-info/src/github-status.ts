export interface ChecksSummary {
  pass: number;
  fail: number;
  pending: number;
}

export function parseAheadBehind(stdout: string): {
  ahead: number;
  behind: number;
} | null {
  const parts = stdout.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const ahead = Number(parts[0]);
  const behind = Number(parts[1]);
  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) return null;
  if (ahead < 0 || behind < 0) return null;
  return { ahead, behind };
}

function bucketize(bucket: unknown, state: unknown): keyof ChecksSummary {
  const text = `${bucket ?? ""} ${state ?? ""}`.toLowerCase();
  if (text.includes("fail")) return "fail";
  if (/(pass|success|skip|cancel|neutral)/.test(text)) return "pass";
  return "pending";
}

export function parseChecksJson(stdout: string): ChecksSummary | null {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const summary: ChecksSummary = { pass: 0, fail: 0, pending: 0 };
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;
    summary[bucketize(record.bucket, record.state)] += 1;
  }
  return summary;
}

export function formatSyncStatus(
  ahead: number | null,
  behind: number | null,
): string {
  if (ahead === null || behind === null) return "";
  if (ahead === 0 && behind === 0) return "";
  const up = ahead > 0 ? `↑${ahead}` : "";
  const down = behind > 0 ? `↓${behind}` : "";
  return ` ${up}${down}`;
}

export function formatChecks(summary: ChecksSummary | null): string {
  if (!summary) return "";
  if (summary.fail > 0) return ` ✗${summary.fail}`;
  if (summary.pending > 0) return ` …${summary.pending}`;
  if (summary.pass > 0) return " ✓";
  return "";
}
