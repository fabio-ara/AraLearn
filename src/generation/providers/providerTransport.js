import { ProviderTimeoutError } from "./providerErrors.js";

const DEFAULT_PROVIDER_TIMEOUT_MS = 45000;
const MAX_PROVIDER_TIMEOUT_MS = 300000;

export function resolveProviderTimeoutMs(
  value,
  {
    envName = "",
    fallback = DEFAULT_PROVIDER_TIMEOUT_MS
  } = {}
) {
  const requested = Number(value);
  const fromEnvironment = envName
    ? Number(globalThis.process?.env?.[envName])
    : Number.NaN;
  const resolved = Number.isFinite(requested) && requested > 0
    ? requested
    : Number.isFinite(fromEnvironment) && fromEnvironment > 0
      ? fromEnvironment
      : fallback;
  return Math.min(Math.max(1, Math.round(resolved)), MAX_PROVIDER_TIMEOUT_MS);
}

export async function fetchProviderJsonResponse(
  input,
  init = {},
  {
    provider = "Provider",
    timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS
  } = {}
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal
    });
    let data = null;
    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted || error?.name === "AbortError") throw error;
    }
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted || error?.name === "AbortError") {
      throw new ProviderTimeoutError({ provider, timeoutMs });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
