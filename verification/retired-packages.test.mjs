import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("pi-herdr stays removed from configuration and install manifests", () => {
  const settings = read("settings.json");
  for (const entry of settings.packages) {
    const source = typeof entry === "string" ? entry : entry.source;
    assert(!source.includes("pi-herdr"), "pi-herdr must not be configured");
  }
  assert(
    !read("verification/packages.json").packages.some(
      (entry) => entry.name === "@andrewjacop/pi-herdr",
    ),
    "pi-herdr must not be pinned",
  );
  assert(
    !(
      "@andrewjacop/pi-herdr" in
      read("verification/managed-npm.json").dependencies
    ),
    "pi-herdr must not be installed by the managed manifest",
  );
  for (const entry of [
    "-extensions/herdr-commands/index.ts",
    "-extensions/herdr-naming/index.ts",
    "-extensions/herdr-agent-state.ts",
  ]) {
    assert(settings.extensions.includes(entry), `missing exclusion ${entry}`);
  }
});
