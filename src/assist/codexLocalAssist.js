export const CODEX_LOCAL_MODEL_ID = "codex-cli-local";
export const DEFAULT_CODEX_LOCAL_ENDPOINT = "http://127.0.0.1:4183/assist";
export const DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT = "http://127.0.0.1:4183/health";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createAbortController(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cancel() {
      clearTimeout(timer);
    }
  };
}

function isSerializableBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function sanitizeJsonValue(value, seen = new WeakSet()) {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }
  if (valueType === "function" || valueType === "symbol" || valueType === "undefined" || valueType === "bigint") {
    return undefined;
  }
  if (isSerializableBlob(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, seen)).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      const sanitized = sanitizeJsonValue(entry, seen);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    });
    seen.delete(value);
    return result;
  }
  return undefined;
}

export function isCodexLocalModel(model) {
  return normalizeText(model) === CODEX_LOCAL_MODEL_ID;
}

export function resolveCodexLocalEndpoint(endpoint) {
  const raw = normalizeText(endpoint) || DEFAULT_CODEX_LOCAL_ENDPOINT;
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("O endpoint Codex local deve usar http:// ou https://.");
  }

  let normalized = raw.replace(/\/+$/, "");
  if (/\/health$/i.test(normalized)) {
    normalized = normalized.replace(/\/health$/i, "/assist");
  } else if (!/\/assist$/i.test(normalized)) {
    normalized += "/assist";
  }

  return normalized || DEFAULT_CODEX_LOCAL_ENDPOINT;
}

export function resolveCodexLocalHealthEndpoint(endpoint) {
  return resolveCodexLocalEndpoint(endpoint).replace(/\/assist$/i, "/health");
}

export async function checkCodexLocalHealth({ endpoint, token, timeoutMs = 3000 } = {}) {
  const target = resolveCodexLocalHealthEndpoint(endpoint);
  const { controller, cancel } = createAbortController(timeoutMs);

  try {
    const response = await fetch(target, {
      method: "GET",
      headers: token ? { "x-aralearn-token": token } : {},
      signal: controller.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || `Falha HTTP ${response.status}.`,
        status: response.status
      };
    }
    if (data?.ok === true) {
      return { ok: true, data };
    }
    return {
      ok: false,
      error: data?.error || "O bridge local respondeu sem sinal de saúde válido.",
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: normalizeText(error?.message) || "Não foi possível conectar ao bridge local.",
      status: 0
    };
  } finally {
    cancel();
  }
}

export async function runCodexLocalAssist({ endpoint, token, mode, context, promptText, ...rest } = {}) {
  const target = resolveCodexLocalEndpoint(endpoint);
  const request = sanitizeJsonValue(rest) || {};
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-aralearn-token": token } : {})
    },
    body: JSON.stringify({
      provider: CODEX_LOCAL_MODEL_ID,
      mode,
      context: sanitizeJsonValue(context) || {},
      promptText: normalizeText(promptText),
      request
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Falha HTTP ${response.status}.`);
  }
  if (!data || data.ok !== true) {
    throw new Error(data?.error || "Falha no Codex local.");
  }
  return data.result;
}

