export const DEFAULT_ASSIST_ALLOWED_ORIGINS = Object.freeze([
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com",
  "https://api.deepseek.com"
]);

export const DEVELOPMENT_VENDOR_ASSIST_ORIGINS = DEFAULT_ASSIST_ALLOWED_ORIGINS;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function values(source) {
  if (Array.isArray(source)) return source;
  return text(source).split(",");
}

export function normalizeAssistProviderOrigin(value) {
  if (text(value).includes("*")) {
    throw new Error("A origem autorizada para assistência não pode conter curinga.");
  }
  let parsed;
  try {
    parsed = new URL(text(value));
  } catch {
    throw new Error("A origem autorizada para assistência por API é inválida.");
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("A origem autorizada para assistência deve conter somente protocolo, host e porta.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("A origem autorizada para assistência deve usar HTTPS; o dispositivo local não é um provider de produção.");
  }
  return parsed.origin;
}

export function buildAssistAllowedOrigins(
  source = "",
  { includeConfiguredOrigins = false } = {}
) {
  return Object.freeze([...new Set([
    ...DEFAULT_ASSIST_ALLOWED_ORIGINS,
    ...(includeConfiguredOrigins
      ? values(source).map(text).filter(Boolean).map(normalizeAssistProviderOrigin)
      : [])
  ])]);
}

export function readAssistAllowedOrigins(source = globalThis.__ARALEARN_ENV__ || {}) {
  if (!Array.isArray(source?.assistAllowedOrigins)) return Object.freeze([]);
  return Object.freeze([...new Set(
    source.assistAllowedOrigins.map(normalizeAssistProviderOrigin)
  )]);
}

export function assertAssistProviderEndpointAllowed(
  endpoint,
  source = globalThis.__ARALEARN_ENV__ || {}
) {
  let parsed;
  try {
    parsed = new URL(text(endpoint));
  } catch {
    throw new Error("O endpoint da assistência por API é inválido.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("O endpoint da assistência não pode conter credenciais, consulta nem fragmento.");
  }
  const origin = normalizeAssistProviderOrigin(parsed.origin);
  if (!readAssistAllowedOrigins(source).includes(origin)) {
    throw new Error(
      `A origem ${origin} não está autorizada nesta instalação do AraLearn.`
    );
  }
  return parsed.toString();
}
