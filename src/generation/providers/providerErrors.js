function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readStatusCode(error) {
  const status = Number(error?.statusCode ?? error?.status ?? error?.response?.status ?? 0);
  return Number.isFinite(status) ? status : 0;
}

function readProviderMessage(error) {
  return (
    text(error?.providerMessage) ||
    text(error?.payload?.error?.message) ||
    text(error?.responseBody?.error?.message) ||
    text(error?.message) ||
    "Falha no provedor."
  );
}

export class ProviderHttpError extends Error {
  constructor({ statusCode = 0, message = "", payload = null } = {}) {
    super(message || `Falha HTTP ${statusCode}.`);
    this.name = "ProviderHttpError";
    this.statusCode = statusCode;
    this.payload = payload;
    this.providerMessage = message || "";
  }
}

export class ProviderOperationError extends Error {
  constructor({ phase, modelId, details, attempts = 1 } = {}) {
    const message = details?.message || "Falha ao chamar o provedor.";
    super(message);
    this.name = "ProviderOperationError";
    this.phase = phase;
    this.modelId = modelId;
    this.details = details;
    this.attempts = attempts;
  }
}

export function createValidationFailedError(message) {
  const error = new Error(message || "Validação local falhou.");
  error.category = "validation_failed";
  return error;
}

export function classifyProviderError(error) {
  const statusCode = readStatusCode(error);
  const message = readProviderMessage(error);
  const lower = message.toLowerCase();
  const name = text(error?.name).toLowerCase();
  const code = text(error?.code).toLowerCase();

  if (error?.category === "validation_failed") {
    return { retryable: false, category: "validation_failed", statusCode, message };
  }
  if (name === "aborterror" || code === "abort_err" || code === "etimedout" || /timeout|timed out|abort/.test(lower)) {
    return { retryable: true, category: "timeout", statusCode, message };
  }
  if (statusCode === 429) {
    if (/quota|exceeded|exhausted|billing/.test(lower)) {
      return { retryable: false, category: "quota_exceeded", statusCode, message };
    }
    return { retryable: true, category: "rate_limited", statusCode, message };
  }
  if (statusCode === 502 || statusCode === 503) {
    return { retryable: true, category: "service_unavailable", statusCode, message };
  }
  if (statusCode === 400) {
    return { retryable: false, category: "invalid_request", statusCode, message };
  }
  if (statusCode === 413 || /payload too large|request too large|context length|token limit|input too large/.test(lower)) {
    return { retryable: false, category: "payload_too_large", statusCode, message };
  }
  if (statusCode === 401 || statusCode === 403) {
    return { retryable: false, category: "auth_error", statusCode, message };
  }

  return { retryable: false, category: "unknown", statusCode, message };
}
