import assert from "node:assert/strict";
import { createSandbox } from "./sandbox.mjs";

const sandbox = createSandbox(process.argv[2]);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, sandbox.env);
const { DefaultResourceLoader, SettingsManager } =
  await import("@earendil-works/pi-coding-agent");
const loader = new DefaultResourceLoader({
  cwd: sandbox.cwd,
  agentDir: sandbox.config,
  settingsManager: SettingsManager.create(sandbox.cwd, sandbox.config, {
    projectTrusted: false,
  }),
  noContextFiles: true,
  disabledBuiltinExtensions: ["mcp"],
});
await loader.reload();
const loaded = loader.getExtensions();
assert.equal(loaded.errors.length, 0, JSON.stringify(loaded.errors));
const web = loaded.extensions.find((extension) =>
  extension.path.includes("pi-web-access"),
);
assert(web, "globally enabled research package must load under isolated HOME");
for (const tool of [
  "web_search",
  "fetch_content",
  "source_check",
  "get_search_content",
])
  assert(web.tools.has(tool), "missing registered research tool: " + tool);
assert(
  !loaded.extensions.some((extension) =>
    /pi-subagents|pi-btw/.test(extension.path),
  ),
  "side-agent packages must not load for research",
);
console.log(
  "PASS global research tools load under isolated HOME; no provider requests",
);
