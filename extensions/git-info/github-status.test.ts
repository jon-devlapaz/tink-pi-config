import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChecks,
  formatSyncStatus,
  parseAheadBehind,
  parseChecksJson,
} from "./src/github-status.ts";

test("only an explicitly empty GitHub PR list means no open PR", async () => {
  const { parsePullRequestJson } = await import("./index.ts");
  assert.equal(parsePullRequestJson("[]"), null);
  assert.throws(
    () => parsePullRequestJson("[]", 1, "synthetic auth failure"),
    /synthetic auth failure/,
  );
  assert.deepEqual(
    parsePullRequestJson(
      '[{"number":7,"url":"https://example.test/7","state":"OPEN","isDraft":false}]',
    ),
    { number: 7, url: "https://example.test/7", isDraft: false },
  );
  assert.throws(() => parsePullRequestJson("authentication failure"));
  assert.throws(() => parsePullRequestJson("{}"), /invalid PR list/);
  assert.throws(() => parsePullRequestJson("[{}]"), /invalid PR metadata/);
});

test("parses tab-separated ahead/behind counts", () => {
  assert.deepEqual(parseAheadBehind("0\t0\n"), { ahead: 0, behind: 0 });
  assert.deepEqual(parseAheadBehind("2\t1"), { ahead: 2, behind: 1 });
});

test("rejects malformed ahead/behind output", () => {
  assert.equal(parseAheadBehind(""), null);
  assert.equal(parseAheadBehind("3"), null);
  assert.equal(parseAheadBehind("a\tb"), null);
  assert.equal(parseAheadBehind("-1\t0"), null);
  assert.equal(parseAheadBehind("1\t2\t3"), null);
});

test("buckets gh pr checks output by status", () => {
  assert.deepEqual(
    parseChecksJson(
      '[{"bucket":"pass","name":"a"},{"bucket":"fail","name":"b"},{"bucket":"pending","name":"c"}]',
    ),
    { pass: 1, fail: 1, pending: 1 },
  );
  assert.deepEqual(parseChecksJson("[]"), { pass: 0, fail: 0, pending: 0 });
});

test("falls back to state field and tolerates gh synonyms", () => {
  assert.deepEqual(parseChecksJson('[{"state":"SUCCESS"}]'), {
    pass: 1,
    fail: 0,
    pending: 0,
  });
  assert.deepEqual(parseChecksJson('[{"bucket":"skipping"}]'), {
    pass: 1,
    fail: 0,
    pending: 0,
  });
  assert.deepEqual(parseChecksJson('[{"bucket":"canceled"}]'), {
    pass: 1,
    fail: 0,
    pending: 0,
  });
});

test("rejects malformed checks output", () => {
  assert.equal(parseChecksJson(""), null);
  assert.equal(parseChecksJson("not json"), null);
  assert.equal(parseChecksJson('{"bucket":"pass"}'), null);
  assert.equal(parseChecksJson("[42]"), null);
});

test("formats sync status arrows", () => {
  assert.equal(formatSyncStatus(null, null), "");
  assert.equal(formatSyncStatus(0, 0), "");
  assert.equal(formatSyncStatus(2, 0), " ↑2");
  assert.equal(formatSyncStatus(0, 1), " ↓1");
  assert.equal(formatSyncStatus(2, 1), " ↑2↓1");
});

test("prioritizes failing checks in the summary glyph", () => {
  assert.equal(formatChecks(null), "");
  assert.equal(formatChecks({ pass: 0, fail: 0, pending: 0 }), "");
  assert.equal(formatChecks({ pass: 3, fail: 0, pending: 0 }), " ✓");
  assert.equal(formatChecks({ pass: 2, fail: 1, pending: 3 }), " ✗1");
  assert.equal(formatChecks({ pass: 2, fail: 0, pending: 1 }), " …1");
});
