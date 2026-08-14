import { sanitizeProviderMessage } from "./providerErrors.js";

export const CODEX_LOCAL_MODEL_ID = "codex-cli-local";
export const DEFAULT_CODEX_LOCAL_ENDPOINT = "http://127.0.0.1:4183/assist";
export const DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT = "http://127.0.0.1:4183/health";

function text(value) {
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

export function isCodexLocalModel(model) {
  return text(model) === CODEX_LOCAL_MODEL_ID;
}

export function resolveCodexLocalEndpoint(endpoint) {
  const raw = text(endpoint) || DEFAULT_CODEX_LOCAL_ENDPOINT;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("O endpoint do serviço HTTP local do Codex CLI é inválido.");
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    throw new Error("O endpoint do serviço HTTP local do Codex CLI deve usar HTTP ou HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("O endpoint do serviço HTTP local do Codex CLI não pode conter credenciais, consulta nem fragmento.");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (parsed.protocol === "http:" && !localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("HTTP só é permitido para o serviço do Codex CLI executado no próprio dispositivo.");
  }

  let normalized = parsed.toString().replace(/\/+$/, "");
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
        error: sanitizeProviderMessage(data?.error || `Falha HTTP ${response.status}.`, [token]),
        status: response.status
      };
    }
    if (data?.ok === true) {
      return { ok: true, data };
    }
    return {
      ok: false,
      error: sanitizeProviderMessage(data?.error || "O serviço local respondeu sem sinal de saúde válido.", [token]),
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: sanitizeProviderMessage(text(error?.message), [token]) || "Não foi possível conectar ao serviço local do Codex CLI.",
      status: 0
    };
  } finally {
    cancel();
  }
}
