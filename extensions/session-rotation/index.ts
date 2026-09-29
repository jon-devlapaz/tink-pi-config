import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyRotation, planRotation } from "./retention.ts";

const STATUS_KEY = "session-rotation";
const MARKER = ".last-rotation";

function todayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export default function sessionRotation(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    let agentDir: string;
    try {
      agentDir = getAgentDir();
    } catch {
      return;
    }
    const archiveRoot = join(agentDir, "sessions-archive");
    const marker = join(archiveRoot, MARKER);
    const today = todayStamp(Date.now());
    try {
      if (existsSync(marker) && readFileSync(marker, "utf-8").trim() === today) return;
    } catch { /* fall through and run */ }
    let activeId: string | undefined;
    try {
      activeId = ctx.sessionManager.getSessionId();
    } catch { /* mtime guard still applies */ }
    let archived = 0;
    try {
      const plan = planRotation(join(agentDir, "sessions"), archiveRoot, Date.now(), activeId);
      if (plan.moves.length === 0 && plan.deleteDirs.length === 0) return;
      archived = applyRotation(plan).archived;
    } catch {
      return;
    }
    try {
      writeFileSync(marker, today + "\n");
    } catch { /* non-fatal */ }
    if (archived > 0 && ctx.mode === "tui") {
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("muted", `archived ${archived} old sessions`));
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    try {
      ctx.ui.setStatus(STATUS_KEY, undefined);
    } catch { /* ignore */ }
  });
}
