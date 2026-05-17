import test from "node:test";
import assert from "node:assert/strict";

import {
  CODEX_LOCAL_MODEL_ID,
  GEMINI_ASSIST_PROVIDER_ID,
  resolveAssistProviderDescriptor,
  resolveAssistProviderId
} from "../src/assist/assistProviderRegistry.js";

test("assistProviderRegistry resolve Codex local e Gemini por model id", () => {
  assert.equal(resolveAssistProviderId("codex-cli-local"), CODEX_LOCAL_MODEL_ID);
  assert.equal(resolveAssistProviderId("gemini-2.5-flash"), GEMINI_ASSIST_PROVIDER_ID);
});

test("assistProviderRegistry devolve descriptor executável para cada provider", () => {
  const local = resolveAssistProviderDescriptor("codex-cli-local");
  const api = resolveAssistProviderDescriptor("gemini-2.5-flash");

  assert.equal(local.providerId, CODEX_LOCAL_MODEL_ID);
  assert.equal(typeof local.run, "function");
  assert.equal(api.providerId, GEMINI_ASSIST_PROVIDER_ID);
  assert.equal(typeof api.run, "function");
});
