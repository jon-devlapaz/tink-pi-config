import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "herdr-failure-"));
const binary = join(root, "herdr");
writeFileSync(
  binary,
  '#!/bin/sh\nif [ "$1 $2" = "$HERDR_FAIL" ]; then echo "synthetic rejection" >&2; exit 9; fi\nprintf \'%s\\n\' \'{"result":{"agent":{"name":"fixture"}}}\'\n',
  { mode: 0o700 },
);

test("Herdr commands reject any failed identity step without claiming success", async () => {
  const saved = {
    bin: process.env.HERDR_BIN,
    active: process.env.HERDR_ENV,
    pane: process.env.HERDR_PANE_ID,
    fail: process.env.HERDR_FAIL,
  };
  try {
    process.env.HERDR_BIN = binary;
    process.env.HERDR_ENV = "1";
    process.env.HERDR_PANE_ID = "fixture:p1";
    const { default: register } = await import(
      new URL("./index.ts", import.meta.url).href + "?identity-fault"
    );
    for (const fail of [
      "agent rename",
      "pane rename",
      "pane report-metadata",
      "",
    ]) {
      process.env.HERDR_FAIL = fail;
      const commands = new Map<string, any>();
      const notices: { message: string; type: string }[] = [];
      register({
        registerCommand: (n: string, c: unknown) => commands.set(n, c),
        registerTool: () => {},
        on: () => {},
      });
      const ctx = {
        ui: {
          notify: (message: string, type: string) =>
            notices.push({ message, type }),
        },
      };
      if (fail) {
        await assert.rejects(
          commands.get("herdr-name").handler("new-name", ctx),
          /synthetic rejection/,
        );
        assert.equal(notices.length, 0);
        await commands.get("herdr-name").handler("", ctx);
        assert.match(notices[0].message, /agent name: pi$/);
      } else {
        await commands.get("herdr-name").handler("new-name", ctx);
        assert.match(notices[0].message, /renamed to: new-name/);
      }
    }
  } finally {
    for (const [key, value] of Object.entries({
      HERDR_BIN: saved.bin,
      HERDR_ENV: saved.active,
      HERDR_PANE_ID: saved.pane,
      HERDR_FAIL: saved.fail,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
