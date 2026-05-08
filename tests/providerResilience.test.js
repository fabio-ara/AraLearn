import test from "node:test";
import assert from "node:assert/strict";

import { callModelWithRetry } from "../src/generation/providers/callModelWithRetry.js";
import { ProviderHttpError, classifyProviderError } from "../src/generation/providers/providerErrors.js";

test("classifyProviderError classifica 429 transitório como retryable", () => {
  const result = classifyProviderError(new ProviderHttpError({ statusCode: 429, message: "Too many requests, try again later." }));

  assert.equal(result.category, "rate_limited");
  assert.equal(result.retryable, true);
  assert.equal(result.statusCode, 429);
});

test("classifyProviderError classifica 429 de cota como não retryable", () => {
  const result = classifyProviderError(new ProviderHttpError({ statusCode: 429, message: "Quota exceeded." }));

  assert.equal(result.category, "quota_exceeded");
  assert.equal(result.retryable, false);
});

test("classifyProviderError classifica 503 e timeout como retryable", () => {
  const unavailable = classifyProviderError(new ProviderHttpError({ statusCode: 503, message: "High demand." }));
  const timeout = classifyProviderError(Object.assign(new Error("The operation timed out."), { name: "AbortError" }));

  assert.equal(unavailable.category, "service_unavailable");
  assert.equal(unavailable.retryable, true);
  assert.equal(timeout.category, "timeout");
  assert.equal(timeout.retryable, true);
});

test("classifyProviderError classifica 400, 401 e 403 como não retryable", () => {
  const invalid = classifyProviderError(new ProviderHttpError({ statusCode: 400, message: "Bad request." }));
  const unauthorized = classifyProviderError(new ProviderHttpError({ statusCode: 401, message: "Unauthorized." }));
  const forbidden = classifyProviderError(new ProviderHttpError({ statusCode: 403, message: "Forbidden." }));

  assert.equal(invalid.category, "invalid_request");
  assert.equal(invalid.retryable, false);
  assert.equal(unauthorized.category, "auth_error");
  assert.equal(unauthorized.retryable, false);
  assert.equal(forbidden.category, "auth_error");
  assert.equal(forbidden.retryable, false);
});

test("callModelWithRetry tenta novamente em 503 e usa delay injetável", async () => {
  const delays = [];
  let calls = 0;
  const result = await callModelWithRetry({
    request: { ok: true },
    phase: "generation",
    modelId: "gemini-2.5-flash",
    maxAttempts: 3,
    baseDelayMs: 100,
    jitterRatio: 0,
    delay: async (ms) => delays.push(ms),
    callModel: async () => {
      calls += 1;
      if (calls < 3) {
        throw new ProviderHttpError({ statusCode: 503, message: "High demand." });
      }
      return { cards: [] };
    }
  });

  assert.equal(calls, 3);
  assert.deepEqual(delays, [100, 200]);
  assert.equal(result.value.cards.length, 0);
});

test("callModelWithRetry respeita maxAttempts", async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      callModelWithRetry({
        request: {},
        phase: "planning",
        modelId: "gemini-2.5-flash",
        maxAttempts: 2,
        jitterRatio: 0,
        delay: async () => null,
        callModel: async () => {
          calls += 1;
          throw new ProviderHttpError({ statusCode: 503, message: "High demand." });
        }
      }),
    (error) => {
      assert.equal(error.details.category, "service_unavailable");
      assert.equal(error.attempts, 2);
      return true;
    }
  );

  assert.equal(calls, 2);
});

test("callModelWithRetry não tenta novamente em invalid_request", async () => {
  let calls = 0;

  await assert.rejects(
    () =>
      callModelWithRetry({
        request: {},
        phase: "planning",
        modelId: "gemini-2.5-flash",
        maxAttempts: 3,
        delay: async () => {
          throw new Error("delay não deveria ser chamado");
        },
        callModel: async () => {
          calls += 1;
          throw new ProviderHttpError({ statusCode: 400, message: "Bad request." });
        }
      }),
    /Bad request/
  );

  assert.equal(calls, 1);
});

test("callModelWithRetry faz fallback apenas quando configurado e permitido", async () => {
  const models = [];
  const result = await callModelWithRetry({
    request: {},
    phase: "generation",
    modelId: "gemini-2.5-flash",
    fallbackEnabled: true,
    fallbackModelId: "gemini-2.5-flash-lite",
    maxAttempts: 1,
    delay: async () => null,
    callModel: async ({ modelId }) => {
      models.push(modelId);
      if (modelId === "gemini-2.5-flash") {
        throw new ProviderHttpError({ statusCode: 503, message: "High demand." });
      }
      return { ok: true };
    }
  });

  assert.deepEqual(models, ["gemini-2.5-flash", "gemini-2.5-flash-lite"]);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.modelId, "gemini-2.5-flash-lite");
});

test("callModelWithRetry não faz fallback em auth_error", async () => {
  const models = [];

  await assert.rejects(
    () =>
      callModelWithRetry({
        request: {},
        phase: "generation",
        modelId: "gemini-2.5-flash",
        fallbackEnabled: true,
        fallbackModelId: "gemini-2.5-flash-lite",
        maxAttempts: 1,
        callModel: async ({ modelId }) => {
          models.push(modelId);
          throw new ProviderHttpError({ statusCode: 403, message: "Forbidden." });
        }
      }),
    (error) => {
      assert.equal(error.details.category, "auth_error");
      return true;
    }
  );

  assert.deepEqual(models, ["gemini-2.5-flash"]);
});
