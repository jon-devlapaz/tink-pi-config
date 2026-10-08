import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSandbox, readJson } from "./sandbox.mjs";

const sandbox = createSandbox(process.argv[2]);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, sandbox.env);
const { DefaultResourceLoader, SettingsManager } =
  await import("@earendil-works/pi-coding-agent");
const overrides = readJson(path.join(sandbox.config, "settings.json")).subagents
  .agentOverrides;
const empty = path.join(sandbox.root, "research-agent");
fs.mkdirSync(empty);
for (const name of ["researcher", "evidence-auditor"]) {
  const paths = overrides[name].subagentOnlyExtensions;
  assert.deepEqual(
    paths,
    ["~/.pi/agent/npm/node_modules/pi-web-access/dist/index.js"],
    "research paths must not contain a personal home directory",
  );
  const loader = new DefaultResourceLoader({
    cwd: sandbox.cwd,
    agentDir: empty,
    settingsManager: SettingsManager.inMemory({
      packages: [],
      extensions: paths,
    }),
    noContextFiles: true,
    noSkills: true,
    noPromptTemplates: true,
    disabledBuiltinExtensions: ["mcp"],
  });
  await loader.reload();
  const loaded = loader.getExtensions();
  assert.equal(loaded.errors.length, 0, JSON.stringify(loaded.errors));
  const web = loaded.extensions.find((extension) =>
    extension.path.includes("pi-web-access"),
  );
  assert(web, "Pi did not expand the portable child-extension path");
  for (const tool of [
    "web_search",
    "fetch_content",
    "source_check",
    "get_search_content",
  ])
    assert(web.tools.has(tool), "missing registered research tool: " + tool);
  console.log(
    "PASS",
    name,
    "portable research path loads under an isolated HOME; no provider requests",
  );
}
