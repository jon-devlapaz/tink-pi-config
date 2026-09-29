import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVE_AFTER_DAYS = 30;
export const DELETE_ARCHIVE_AFTER_DAYS = 90;
export const ARCHIVE_SIZE_CAP_BYTES = 1024 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RotationPlan {
  moves: { from: string; to: string }[];
  deleteDirs: string[];
}

function idOfSessionFile(basename: string): string {
  const stem = basename.endsWith(".jsonl") ? basename.slice(0, -6) : basename;
  const i = stem.lastIndexOf("_");
  return i >= 0 ? stem.slice(i + 1) : stem;
}

export function planRotation(
  sessionsDir: string,
  archiveRoot: string,
  nowMs: number,
  activeId: string | undefined,
): RotationPlan {
  const moves: RotationPlan["moves"] = [];
  const deleteDirs: RotationPlan["deleteDirs"] = [];
  if (!existsSync(sessionsDir)) return { moves, deleteDirs };

  const today = new Date(nowMs).toISOString().slice(0, 10).replaceAll("-", "");
  const archiveToday = join(archiveRoot, today);

  for (const scope of readdirSync(sessionsDir)) {
    const scopeDir = join(sessionsDir, scope);
    let entries: string[];
    try {
      if (!statSync(scopeDir).isDirectory()) continue;
      entries = readdirSync(scopeDir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith(".jsonl")) continue;
      const from = join(scopeDir, file);
      let mtime: number;
      try {
        mtime = statSync(from).mtimeMs;
      } catch {
        continue;
      }
      if (nowMs - mtime < ARCHIVE_AFTER_DAYS * DAY_MS) continue;
      if (activeId && idOfSessionFile(file) === activeId) continue;
      const stem = file.slice(0, -6);
      moves.push({ from, to: join(archiveToday, file) });
      for (const sibling of entries) {
        if (sibling !== file && sibling.startsWith(stem) && !sibling.endsWith(".jsonl")) {
          moves.push({ from: join(scopeDir, sibling), to: join(archiveToday, sibling) });
        }
      }
    }
  }

  if (existsSync(archiveRoot)) {
    let total = 0;
    const dated: { dir: string; day: string; size: number }[] = [];
    for (const name of readdirSync(archiveRoot)) {
      if (!/^\d{8}$/.test(name)) continue;
      const dir = join(archiveRoot, name);
      let size = 0;
      try {
        if (!statSync(dir).isDirectory()) continue;
        for (const f of readdirSync(dir)) {
          try {
            size += statSync(join(dir, f)).size;
          } catch { /* ignore */ }
        }
      } catch {
        continue;
      }
      const ageDays = (nowMs - Date.parse(`${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}T00:00:00Z`)) / DAY_MS;
      if (ageDays >= DELETE_ARCHIVE_AFTER_DAYS) deleteDirs.push(dir);
      else {
        total += size;
        dated.push({ dir, day: name, size });
      }
    }
    if (total > ARCHIVE_SIZE_CAP_BYTES) {
      dated.sort((a, b) => (a.day < b.day ? -1 : 1));
      for (const d of dated) {
        if (total <= ARCHIVE_SIZE_CAP_BYTES) break;
        total -= d.size;
        deleteDirs.push(d.dir);
      }
    }
  }
  return { moves, deleteDirs };
}

export function applyRotation(plan: RotationPlan): { archived: number; deleted: number } {
  let archived = 0;
  for (const m of plan.moves) {
    try {
      mkdirSync(m.to.slice(0, m.to.lastIndexOf("/")), { recursive: true });
      renameSync(m.from, m.to);
      archived++;
    } catch { /* best effort */ }
  }
  let deleted = 0;
  for (const dir of plan.deleteDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
      deleted++;
    } catch { /* best effort */ }
  }
  return { archived, deleted };
}
