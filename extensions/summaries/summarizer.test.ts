import assert from "node:assert/strict";
import test from "node:test";
import { parseRecapResponse, reasoningOptions } from "./src/summarizer.ts";

test("omits reasoning when configured off", () => {
  assert.deepEqual(reasoningOptions("off"), {});
  assert.deepEqual(reasoningOptions("medium"), { reasoning: "medium" });
});

test("parses strict recap JSON with crux", () => {
  assert.deepEqual(
    parseRecapResponse(
      '{"crux":"Disabling native compaction gave Blackhole full ownership.","recap":"Updated config and ran focused tests.","next":"Review the diff."}',
    ),
    {
      crux: "Disabling native compaction gave Blackhole full ownership.",
      recap: "Updated config and ran focused tests.",
      next: "Review the diff.",
    },
  );
});

test("parses legacy recap JSON without crux", () => {
  assert.deepEqual(
    parseRecapResponse(
      '{"recap":"Updated config and ran focused tests.","next":"Review the diff."}',
    ),
    {
      crux: "",
      recap: "Updated config and ran focused tests.",
      next: "Review the diff.",
    },
  );
});

test("defensively extracts fenced or surrounded JSON and normalizes Next", () => {
  assert.deepEqual(
    parseRecapResponse(
      'Result follows:\n```json\n{"crux":"Added crux support.","recap":"- Added the extension\\n- Tests pass","next":"Next: Reload Pi."}\n```',
    ),
    {
      crux: "Added crux support.",
      recap: "- Added the extension\n- Tests pass",
      next: "Reload Pi.",
    },
  );
});

test("rejects malformed or incomplete output", () => {
  assert.throws(() => parseRecapResponse("not json"), /valid recap JSON/);
  assert.throws(
    () => parseRecapResponse('{"recap":"missing next"}'),
    /valid recap JSON/,
  );
  assert.throws(
    () =>
      parseRecapResponse(
        '{"recap":"done","next":"nothing","extra":"not allowed"}',
      ),
    /valid recap JSON/,
  );
});

test("strips terminal control sequences from recap fields", () => {
  assert.deepEqual(
    parseRecapResponse(
      '{"crux":"Fixed \\u001b[32mroot\\u001b[0m cause.","recap":"Updated \\u001b[31mconfig\\u001b[0m.","next":"Review it.\\u0007"}',
    ),
    { crux: "Fixed root cause.", recap: "Updated config.", next: "Review it." },
  );
});
