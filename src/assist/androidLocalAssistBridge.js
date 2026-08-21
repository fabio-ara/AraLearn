const ANDROID_ASSIST_CONTRACT = "aralearn.android-local-assist.v1";
const LOCAL_ASSIST_ENDPOINT = "http://127.0.0.1:4183";
const MAX_REQUEST_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 128 * 1024;
const brokers = new WeakMap();

function utf8Size(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

function localAssistRequest(url, init) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return null;
  }
  if (parsed.origin !== LOCAL_ASSIST_ENDPOINT) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      parsed.pathname.includes("..") || !parsed.pathname.startsWith("/")) {
    throw new Error("O endpoint local da assistência é inválido.");
  }
  const method = String(init?.method || "GET").toUpperCase();
  const body = typeof init?.body === "string" ? init.body : "";
  const headers = new Headers(init?.headers || {});
  if (method !== "POST" || !/^application\/json(?:;|$)/iu.test(
    headers.get("content-type") || ""
  ) || headers.has("authorization") || headers.has("x-goog-api-key")) {
    throw new Error("A ponte Android aceita somente POST JSON sem credencial do navegador.");
  }
  if (!body || utf8Size(body) > MAX_REQUEST_BYTES) {
    throw new Error("O pedido para a assistência local excede o limite seguro.");
  }
  return Object.freeze({ path: parsed.pathname, body });
}

function responseLike(status, body) {
  return Object.freeze({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (utf8Size(body) > MAX_RESPONSE_BYTES) {
        throw new Error("A resposta da assistência local excedeu o limite seguro.");
      }
      return JSON.parse(body);
    }
  });
}

function brokerFor(bridge) {
  const existing = brokers.get(bridge);
  if (existing) return existing;
  const pending = new Map();
  const handleMessage = (event) => {
    let message;
    try {
      message = JSON.parse(String(event?.data || ""));
    } catch {
      return;
    }
    if (message?.contract !== ANDROID_ASSIST_CONTRACT ||
        typeof message.requestId !== "string") return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    request.dispose();
    if (message.error) {
      request.reject(new TypeError("Não foi possível alcançar o serviço local de linguagem."));
      return;
    }
    if (!Number.isInteger(message.status) || message.status < 100 || message.status > 599 ||
        typeof message.body !== "string") {
      request.reject(new Error("A ponte Android devolveu uma resposta inválida."));
      return;
    }
    request.resolve(responseLike(message.status, message.body));
  };
  bridge.addEventListener("message", handleMessage);
  const broker = Object.freeze({
    request(payload, signal) {
      if (signal?.aborted) {
        return Promise.reject(new DOMException("O pedido foi cancelado.", "AbortError"));
      }
      const requestId = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const abort = () => {
          const request = pending.get(requestId);
          if (!request) return;
          pending.delete(requestId);
          request.dispose();
          try {
            bridge.postMessage(JSON.stringify({
              contract: ANDROID_ASSIST_CONTRACT,
              operation: "cancel",
              requestId
            }));
          } catch {
            // O cancelamento local já foi efetivado no navegador.
          }
          reject(new DOMException("O pedido foi cancelado.", "AbortError"));
        };
        const dispose = () => signal?.removeEventListener?.("abort", abort);
        pending.set(requestId, { resolve, reject, dispose });
        signal?.addEventListener?.("abort", abort, { once: true });
        try {
          bridge.postMessage(JSON.stringify({
            contract: ANDROID_ASSIST_CONTRACT,
            operation: "request",
            requestId,
            path: payload.path,
            body: payload.body
          }));
        } catch (error) {
          pending.delete(requestId);
          dispose();
          reject(error);
        }
      });
    }
  });
  brokers.set(bridge, broker);
  return broker;
}

export function createAndroidLocalAssistFetch({
  enabled = globalThis.__ARALEARN_ENV__?.nativeAssistBridge === true,
  bridge = globalThis.AraLearnNativeAssist,
  fallbackFetch = globalThis.fetch
} = {}) {
  if (typeof fallbackFetch !== "function") {
    throw new TypeError("Implementação de fetch ausente.");
  }
  if (enabled && (!bridge || typeof bridge.postMessage !== "function" ||
      typeof bridge.addEventListener !== "function")) {
    throw new Error("A ponte segura da assistência local não está disponível neste Android.");
  }
  return async function androidAwareFetch(url, init = {}) {
    if (!enabled) return fallbackFetch(url, init);
    const request = localAssistRequest(url, init);
    if (!request) {
      throw new Error("O Android aceita somente o retransmissor local seguro do AraLearn.");
    }
    return brokerFor(bridge).request(request, init.signal);
  };
}

export const ANDROID_LOCAL_ASSIST_LIMITS = Object.freeze({
  endpoint: LOCAL_ASSIST_ENDPOINT,
  maximumRequestBytes: MAX_REQUEST_BYTES,
  maximumResponseBytes: MAX_RESPONSE_BYTES
});
