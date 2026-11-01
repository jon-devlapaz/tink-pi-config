import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DefaultResourceLoader,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const retired = [
  "extensions/herdr-commands",
  "extensions/herdr-naming",
  "extensions/herdr-agent-state.ts",
  "extensions/workflows",
  "extensions/background-terminals",
  "extensions/statusline",
  "extensions/ui-customization",
  "extensions/model-info",
  "extensions/session-rotation",
  "extensions/todo-replay",
  "extensions/file-search",
  "extensions/copy-all",
  "extensions/git-info",
];
const retiredPackages = [
  "@andrewjacop/pi-herdr",
  "pi-subagents",
  "pi-btw",
  "@narumitw/pi-statusline",
  "pi-blackhole",
  "pi-git-commands",
];

const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));

test("internal orchestration and custom UI packages stay removed from configuration and manifests", () => {
  const settings = read("settings.json");
  for (const name of retiredPackages) {
    assert(
      !settings.packages.some((entry) =>
        (typeof entry === "string" ? entry : entry.source).includes(name),
      ),
      name + " must not be configured",
    );
    assert(
      !read("verification/packages.json").packages.some(
        (entry) => entry.name === name || entry.source.includes(name),
      ),
      name + " must not be pinned",
    );
    assert(
      !(name in read("verification/managed-npm.json").dependencies),
      name + " must not be installed by the managed manifest",
    );
  }
  for (const relative of retired) {
    const entry = `-${relative}${relative.endsWith(".ts") ? "" : "/index.ts"}`;
    assert(settings.extensions.includes(entry), `missing exclusion ${entry}`);
  }
});

test("retired local resources are absent from source and verification inventories", () => {
  const inventory = read("verification/hardening-files.json");
  const verification = fs.readFileSync(
    new URL("./verify-updates.mjs", import.meta.url),
    "utf8",
  );
  for (const relative of [
    ...retired,
    ...[
      "activity-status",
      "context-utilization",
      "child-session",
      "tool-call-timeout",
    ].flatMap((name) => [
      "extensions/shared/" + name + ".ts",
      "extensions/shared/" + name + ".test.ts",
    ]),
  ]) {
    assert.equal(
      fs.lstatSync(new URL(`../${relative}`, import.meta.url), {
        throwIfNoEntry: false,
      }),
      undefined,
      `retired resource reintroduced: ${relative}`,
    );
    assert(!inventory.some((file) => file.startsWith(relative)), relative);
    assert(!verification.includes(`"${path.basename(relative)}"`), relative);
  }
  for (const relative of inventory)
    assert(fs.existsSync(new URL(`../${relative}`, import.meta.url)), relative);
});

test("canonical exclusions block reintroduced retired extensions without hiding generic extensions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-retired-resources-"));
  try {
    const cwd = path.join(root, "workspace");
    const agentDir = path.join(root, "agent");
    fs.mkdirSync(cwd);
    fs.mkdirSync(agentDir);
    const settings = read("settings.json");
    fs.writeFileSync(
      path.join(agentDir, "settings.json"),
      JSON.stringify({
        packages: [],
        extensions: settings.extensions.filter((entry) =>
          retired.some((relative) => entry.startsWith(`-${relative}`)),
        ),
      }),
    );
    for (const relative of [...retired, "extensions/generic/index.ts"]) {
      const file = path.join(
        agentDir,
        relative.endsWith(".ts") ? relative : `${relative}/index.ts`,
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        relative.includes("generic")
          ? 'export default function (pi) { pi.registerCommand("generic-diagnostic", { description: "fixture", handler: async () => {} }); }'
          : 'export default function () { throw new Error("retired extension executed"); }',
      );
    }
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir, {
        projectTrusted: false,
      }),
      noContextFiles: true,
      disabledBuiltinExtensions: ["mcp"],
    });
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, []);
    assert(
      loaded.extensions.some((extension) =>
        extension.path.endsWith("/generic/index.ts"),
      ),
    );
    assert(
      !loaded.extensions.some((extension) =>
        retired.some((relative) => extension.path.includes(relative)),
      ),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
