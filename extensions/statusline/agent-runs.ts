import { plainLabel, type Notice } from "./quiet-state.ts";

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

export class AgentRuns {
  private runs = new Map<string, string>();
  private alerts = new Map<string, Notice>();

  reset() {
    this.runs.clear();
    this.alerts.clear();
  }
  acknowledge() {
    this.alerts.clear();
  }

  started(value: unknown, sessionId: string) {
    const data = record(value);
    if (!data || data.sessionId !== sessionId || typeof data.id !== "string")
      return;
    this.runs.set(
      data.id,
      plainLabel(typeof data.agent === "string" ? data.agent : "agent run"),
    );
  }

  control(value: unknown) {
    const event = record(record(value)?.event);
    if (
      !event ||
      typeof event.runId !== "string" ||
      !this.runs.has(event.runId)
    )
      return;
    if (event.type === "needs_attention") {
      this.alerts.set(event.runId, {
        text: `ATTN ${plainLabel(typeof event.agent === "string" ? event.agent : this.runs.get(event.runId)!)} requested attention`,
        kind: "warning",
      });
    }
  }

  completed(value: unknown) {
    const data = record(value);
    if (!data || typeof data.runId !== "string" || !this.runs.has(data.runId))
      return;
    const label = this.runs.get(data.runId)!;
    this.runs.delete(data.runId);
    this.alerts.delete(data.runId);
    const results = Array.isArray(data.results) ? data.results.map(record) : [];
    if (
      data.status === "failed" ||
      data.status === "error" ||
      results.some(
        (r) =>
          r?.status === "failed" ||
          r?.status === "error" ||
          r?.isError === true,
      )
    ) {
      this.alerts.set(data.runId, { text: `FAIL ${label} run`, kind: "error" });
    }
  }

  notices(): Notice[] {
    const activity: Notice[] = this.runs.size
      ? [
          {
            text: `${this.runs.size} agent run${this.runs.size === 1 ? "" : "s"} active`,
            kind: "activity",
          },
        ]
      : [];
    return [...this.alerts.values(), ...activity];
  }
}
