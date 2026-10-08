import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { applyRotation, planRotation } from "./retention.ts";

const STATUS_KEY = "session-rotation";
const MARKER = ".last-rotation";

function todayStamp(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export default function sessionRotation(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setStatus(STATUS_KEY, undefined);
    const agentDir = getAgentDir();
    try {
      const archiveRoot = join(agentDir, "sessions-archive");
      const marker = join(archiveRoot, MARKER);
      const today = todayStamp(Date.now());
      if (existsSync(marker) && readFileSync(marker, "utf-8").trim() === today)
        return;
      const activeId = ctx.sessionManager.getSessionId();
      const plan = planRotation(
        join(agentDir, "sessions"),
        archiveRoot,
        Date.now(),
        activeId,
      );
      if (plan.moves.length === 0 && plan.deleteDirs.length === 0) return;
      const { archived } = applyRotation(plan);
      writeFileSync(marker, today + "\n");
      if (archived > 0 && ctx.mode === "tui") {
        ctx.ui.setStatus(
          STATUS_KEY,
          ctx.ui.theme.fg("muted", `archived ${archived} old sessions`),
        );
      }
    } catch (error) {
      ctx.ui.setStatus(STATUS_KEY, "session rotation failed");
      throw error;
    }
  });

  pi.on("session_shutdown", (_event, ctx) => {
    try {
      ctx.ui.setStatus(STATUS_KEY, undefined);
    } catch {
      /* ignore */
    }
  });
}
