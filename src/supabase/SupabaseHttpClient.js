export class SupabaseHttpError extends Error {
  constructor(message, { status = 0, code = "", details = null, response = null } = {}) {
    super(message);
    this.name = "SupabaseHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.response = response;
  }
}

function joinUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

async function readResponseBody(response) {
  if (response.status === 204) return null;
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

function errorMessage(body, status) {
  if (body && typeof body === "object") {
    return body.msg || body.message || body.error_description || body.error || `Supabase respondeu com HTTP ${status}.`;
  }
  return typeof body === "string" && body.trim() ? body.trim() : `Supabase respondeu com HTTP ${status}.`;
}

export class SupabaseHttpClient {
  constructor({
    projectUrl,
    publishableKey,
    fetchImpl = globalThis.fetch,
    accessToken = null,
    timeoutMs = 15_000
  } = {}) {
    if (!projectUrl || !publishableKey) throw new Error("Configuração pública do Supabase incompleta.");
    if (typeof fetchImpl !== "function") throw new TypeError("fetch não está disponível.");
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs deve ser um número positivo.");
    }
    this.projectUrl = projectUrl;
    this.publishableKey = publishableKey;
    this.fetchImpl = fetchImpl;
    this.accessToken = accessToken;
    this.timeoutMs = timeoutMs;
  }

  setAccessToken(accessToken) {
    this.accessToken = accessToken || null;
  }

  async request(path, {
    method = "GET",
    body,
    headers = {},
    accessToken = this.accessToken,
    signal,
    prefer,
    timeoutMs = this.timeoutMs
  } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError("timeoutMs deve ser um número positivo.");
    }
    const requestHeaders = new Headers(headers);
    requestHeaders.set("apikey", this.publishableKey);
    if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    if (body !== undefined && !requestHeaders.has("Content-Type")) {
      requestHeaders.set("Content-Type", "application/json");
    }
    if (prefer) requestHeaders.set("Prefer", prefer);

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    let timeoutId = null;
    let detachExternalSignal = null;
    if (controller) {
      if (signal?.aborted) {
        controller.abort(signal.reason);
      } else if (signal) {
        const abortFromCaller = () => controller.abort(signal.reason);
        signal.addEventListener("abort", abortFromCaller, { once: true });
        detachExternalSignal = () => signal.removeEventListener("abort", abortFromCaller);
      }
      timeoutId = globalThis.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    let response;
    try {
      response = await this.fetchImpl.call(globalThis, joinUrl(this.projectUrl, path), {
        method,
        headers: requestHeaders,
        cache: "no-store",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        ...((controller?.signal || signal) ? { signal: controller?.signal || signal } : {})
      });
    } catch (error) {
      if (timedOut) {
        throw new SupabaseHttpError("A comunicação com o Supabase excedeu o tempo limite.", {
          status: 0,
          code: "request_timeout"
        });
      }
      throw error;
    } finally {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      detachExternalSignal?.();
    }
    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new SupabaseHttpError(errorMessage(responseBody, response.status), {
        status: response.status,
        code: responseBody?.code || responseBody?.error_code || "",
        details: responseBody?.details || null,
        response: responseBody
      });
    }
    return responseBody;
  }

  rpc(functionName, parameters = {}, options = {}) {
    return this.request(`/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
      method: "POST",
      body: parameters,
      ...options
    });
  }
}
