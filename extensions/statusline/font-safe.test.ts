import assert from "node:assert/strict";
import test from "node:test";
import { fontSafeLines } from "./font-safe.ts";

test("replace Powerline transitions and internal separators with ASCII pipes", () => {
  assert.deepEqual(fontSafeLines(["model\ue0b4 cwd\ue0b1 branch\ue0b4"]), [
    "model| cwd| branch|",
  ]);
});

test("preserve colors, emoji, row boundaries and ordinary text", () => {
  const lines = ["\x1b[34m🤖 sol\ue0b4\x1b[0m", "reviewer running"];
  assert.deepEqual(fontSafeLines(lines), [
    "\x1b[34m🤖 sol|\x1b[0m",
    "reviewer running",
  ]);
  assert.equal(lines[0], "\x1b[34m🤖 sol\ue0b4\x1b[0m");
  assert.deepEqual(fontSafeLines([]), []);
});
