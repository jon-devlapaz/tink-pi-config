import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";

const read = (file) =>
  JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const preferences = [
  ["openai-codex", "gpt-5.6-luna", "Cheap - GPT-5.6 Luna", "medium"],
  ["openai-codex", "gpt-6.1-sol", "Daily - GPT-6.1 Sol", "high"],
  ["openai-codex", "gpt-6-astra", "Smart - GPT-6 Astra", "max"],
  ["anthropic", "claude-opus-5-5", "Review - Claude Opus 5.5", "high"],
];
const customPreferences = [
  ["freellmapi", "fusion", "Free - FreeLLMAPI Fusion", "off"],
];

function checkAlignment(settings, models) {
  assert.equal(settings.defaultProvider, "openai-codex");
  for (const [provider, id, name, level] of preferences) {
    assert(
      getBuiltinModels(provider).some((model) => model.id === id),
      `unknown ${provider} model ${id}`,
    );
    assert(settings.enabledModels.includes(`${provider}/${id}`));
    assert.equal(settings.modelThinkingLevels[`${provider}/${id}`], level);
    assert.equal(models.providers[provider]?.modelOverrides?.[id]?.name, name);
  }
  for (const [provider, id, name, level] of customPreferences) {
    assert(settings.enabledModels.includes(`${provider}/${id}`));
    assert.equal(settings.modelThinkingLevels[`${provider}/${id}`], level);
    assert.equal(
      models.providers[provider]?.models?.find((model) => model.id === id)
        ?.name,
      name,
    );
  }
  assert(
    !Object.keys(settings.modelThinkingLevels).some((key) =>
      key.startsWith("openai/"),
    ),
  );
  assert.equal(models.providers.openai?.modelOverrides, undefined);
}

test("friendly names and reasoning preferences target the configured models", () => {
  checkAlignment(read("settings.json"), read("models.json.example"));
});

test("the former provider and Luna ID mismatches are rejected", () => {
  const settings = read("settings.json");
  const models = read("models.json.example");
  const oldSettings = structuredClone(settings);
  oldSettings.modelThinkingLevels["openai/gpt-6.1-sol"] = "high";
  delete oldSettings.modelThinkingLevels["openai-codex/gpt-6.1-sol"];
  assert.throws(() => checkAlignment(oldSettings, models));

  const oldProvider = structuredClone(models);
  oldProvider.providers.openai = oldProvider.providers["openai-codex"];
  delete oldProvider.providers["openai-codex"];
  assert.throws(() => checkAlignment(settings, oldProvider));

  const oldLuna = structuredClone(models);
  const overrides = oldLuna.providers["openai-codex"].modelOverrides;
  overrides["gpt-6-luna"] = overrides["gpt-5.6-luna"];
  delete overrides["gpt-5.6-luna"];
  assert.throws(() => checkAlignment(settings, oldLuna));
});
