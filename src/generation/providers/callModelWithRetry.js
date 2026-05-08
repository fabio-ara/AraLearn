import { classifyProviderError as defaultClassifyProviderError, ProviderOperationError } from "./providerErrors.js";

const DEFAULT_ALLOW_FALLBACK_ON = ["rate_limited", "service_unavailable", "timeout"];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAttempts(value) {
  const attempts = Number(value);
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 3;
}

function computeDelayMs({ attemptIndex, baseDelayMs, maxDelayMs, jitterRatio, random }) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attemptIndex - 1));
  const jitter = exponential * Math.max(0, jitterRatio) * (typeof random === "function" ? random() : Math.random());
  return Math.min(maxDelayMs, Math.round(exponential + jitter));
}

async function tryModelWithRetry({
  callModel,
  request,
  phase,
  modelId,
  maxAttempts,
  baseDelayMs,
  maxDelayMs,
  jitterRatio,
  classifyProviderError,
  delay,
  random,
  fallbackUsed,
  fallbackModelId
}) {
  let lastDetails = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const value = await callModel({ request, phase, modelId, attempt, fallbackUsed });
      return { ok: true, value, attempts: attempt, modelId, fallbackUsed, fallbackModelId };
    } catch (error) {
      lastDetails = classifyProviderError(error);
      if (!lastDetails.retryable || attempt >= maxAttempts) {
        return {
          ok: false,
          error,
          details: lastDetails,
          attempts: attempt,
          modelId,
          fallbackUsed,
          fallbackModelId
        };
      }
      await delay(
        computeDelayMs({
          attemptIndex: attempt,
          baseDelayMs,
          maxDelayMs,
          jitterRatio,
          random
        })
      );
    }
  }

  return { ok: false, details: lastDetails, attempts: maxAttempts, modelId, fallbackUsed, fallbackModelId };
}

export async function callModelWithRetry({
  callModel,
  request,
  phase,
  modelId,
  maxAttempts = 3,
  baseDelayMs = 750,
  maxDelayMs = 8000,
  jitterRatio = 0.25,
  classifyProviderError = defaultClassifyProviderError,
  delay = wait,
  random = Math.random,
  fallbackEnabled = false,
  fallbackModelId = "",
  allowFallbackOn = DEFAULT_ALLOW_FALLBACK_ON
}) {
  const attempts = normalizeAttempts(maxAttempts);
  const first = await tryModelWithRetry({
    callModel,
    request,
    phase,
    modelId,
    maxAttempts: attempts,
    baseDelayMs,
    maxDelayMs,
    jitterRatio,
    classifyProviderError,
    delay,
    random,
    fallbackUsed: false,
    fallbackModelId: ""
  });
  if (first.ok) {
    return first;
  }

  const canFallback =
    fallbackEnabled &&
    fallbackModelId &&
    fallbackModelId !== modelId &&
    allowFallbackOn.includes(first.details?.category);

  if (canFallback) {
    const fallback = await tryModelWithRetry({
      callModel,
      request,
      phase,
      modelId: fallbackModelId,
      maxAttempts: attempts,
      baseDelayMs,
      maxDelayMs,
      jitterRatio,
      classifyProviderError,
      delay,
      random,
      fallbackUsed: true,
      fallbackModelId
    });
    if (fallback.ok) {
      return fallback;
    }
    throw new ProviderOperationError({
      phase,
      modelId: fallback.modelId,
      details: fallback.details,
      attempts: first.attempts + fallback.attempts,
      fallbackUsed: true,
      fallbackModelId
    });
  }

  throw new ProviderOperationError({
    phase,
    modelId,
    details: first.details,
    attempts: first.attempts,
    fallbackUsed: false,
    fallbackModelId: ""
  });
}
