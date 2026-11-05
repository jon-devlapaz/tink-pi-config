import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { repo } from "./sandbox.mjs";

const sdk = path.dirname(
  fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),
);
const { expandPromptTemplate, loadPromptTemplates } = await import(
  pathToFileURL(path.join(sdk, "core/prompt-templates.js")).href
);

export function checkArguments(promptDir) {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "pi-prompts-"));
  const { templates } = loadPromptTemplates({
    cwd: empty,
    agentDir: empty,
    promptPaths: [promptDir],
    includeDefaults: false,
  });
  const accepting = templates.filter((template) => template.argumentHint);
  assert(accepting.length > 0, "no prompt templates accept arguments");
  for (const template of accepting) {
    const expanded = expandPromptTemplate(
      `/${template.name} sentinel-argument here`,
      templates,
    );
    assert(
      expanded.includes("sentinel-argument here"),
      template.name + ": arguments are dropped",
    );
    assert(
      !expanded.includes("${@}"),
      template.name + ": unexpanded ${@} placeholder",
    );
  }
}

test("prompt templates that take arguments receive them", () => {
  checkArguments(path.join(repo, "prompts"));
});
