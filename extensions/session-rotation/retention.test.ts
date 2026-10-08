import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRotation, planRotation } from "./retention.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-29T12:00:00Z");

function fixture(): { sessions: string; archive: string; scope: string } {
  const root = mkdtempSync(join(tmpdir(), "rotation-"));
  const sessions = join(root, "sessions");
  const scope = join(sessions, "scope");
  mkdirSync(scope, { recursive: true });
  return { sessions, archive: join(root, "sessions-archive"), scope };
}

function agedFile(dir: string, name: string, daysOld: number): void {
  const p = join(dir, name);
  writeFileSync(p, "x");
  const t = new Date(NOW - daysOld * DAY);
  utimesSync(p, t, t);
}

function stillExists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

test("moves old sessions with sidecars, skips recent and active", () => {
  const { sessions, archive, scope } = fixture();
  agedFile(scope, "2026-01-01T00-00-00-000Z_aaa.jsonl", 60);
  writeFileSync(join(scope, "2026-01-01T00-00-00-000Z_aaa.jsonl.exit"), "x");
  writeFileSync(join(scope, "2026-01-01T00-00-00-000Z_aaa.jsonl.task.md"), "x");
  agedFile(scope, "2026-01-02T00-00-00-000Z_bbb.jsonl", 60);
  agedFile(scope, "recent.jsonl", 5);

  const plan = planRotation(sessions, archive, NOW, "bbb");
  const froms = plan.moves.map((m) => m.from);
  assert.ok(froms.some((f) => f.endsWith("aaa.jsonl")));
  assert.ok(froms.some((f) => f.endsWith("aaa.jsonl.exit")));
  assert.ok(froms.some((f) => f.endsWith("aaa.jsonl.task.md")));
  assert.ok(!froms.some((f) => f.endsWith("bbb.jsonl")));
  assert.ok(!froms.some((f) => f.endsWith("recent.jsonl")));

  assert.equal(applyRotation(plan).archived, 3);
  assert.ok(plan.moves.every((m) => !stillExists(m.from)));

  assert.equal(planRotation(sessions, archive, NOW, "bbb").moves.length, 0);
});

test("archive move failures are propagated and preserve the source", () => {
  const { sessions, archive, scope } = fixture();
  agedFile(scope, "blocked.jsonl", 60);
  const plan = planRotation(sessions, archive, NOW, undefined);
  mkdirSync(plan.moves[0].to, { recursive: true });
  assert.throws(() => applyRotation(plan));
  assert.equal(readFileSync(plan.moves[0].from, "utf8"), "x");
});

test("archive failures outside destination collisions are propagated", () => {
  const { scope } = fixture();
  assert.throws(() =>
    applyRotation({
      moves: [
        {
          from: join(scope, "missing.jsonl"),
          to: join(scope, "archive", "missing.jsonl"),
        },
      ],
      deleteDirs: [],
    }),
  );
});

test("existing archives are never overwritten", () => {
  const { sessions, archive, scope } = fixture();
  agedFile(scope, "same.jsonl", 60);
  const plan = planRotation(sessions, archive, NOW, undefined);
  const destination = plan.moves[0].to;
  mkdirSync(destination.slice(0, destination.lastIndexOf("/")), {
    recursive: true,
  });
  writeFileSync(destination, "existing archive");
  assert.throws(() => applyRotation(plan), /already exists/);
  assert.equal(readFileSync(destination, "utf8"), "existing archive");
  assert.equal(readFileSync(plan.moves[0].from, "utf8"), "x");
});

test("deletes archives past retention", () => {
  const { sessions, archive } = fixture();
  mkdirSync(join(archive, "20200101"), { recursive: true });
  writeFileSync(join(archive, "20200101", "old.jsonl"), "x");
  const plan = planRotation(sessions, archive, NOW, undefined);
  assert.deepEqual(plan.deleteDirs, [join(archive, "20200101")]);
  applyRotation(plan);
});
