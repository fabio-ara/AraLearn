import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultProviderRegistry } from "../src/generation/providers/providerRegistry.js";

test("registry expõe providers mínimos", () => {
  const registry = createDefaultProviderRegistry();
  const providerIds = registry.list().map((provider) => provider.id).sort();
  assert.deepEqual(providerIds, ["codex-cli", "fake", "gemini", "openai-compatible"]);
});

