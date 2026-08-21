const LOCAL_ASSIST_HOSTS = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);
const LOCAL_ASSIST_PORT = "4183";

export const DEFAULT_ASSIST_ALLOWED_ORIGINS = Object.freeze([
  `http://127.0.0.1:${LOCAL_ASSIST_PORT}`,
  `http://localhost:${LOCAL_ASSIST_PORT}`,
  `http://10.0.2.2:${LOCAL_ASSIST_PORT}`
]);

export const DEVELOPMENT_VENDOR_ASSIST_ORIGINS = Object.freeze([
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com",
  "https://api.deepseek.com"
]);

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
  const local = LOCAL_ASSIST_HOSTS.has(parsed.hostname);
  if (parsed.protocol === "http:" && (!local || parsed.port !== LOCAL_ASSIST_PORT)) {
    throw new Error(`HTTP na assistência só é aceito no dispositivo local, na porta ${LOCAL_ASSIST_PORT}.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("A origem autorizada para assistência deve usar HTTPS ou o serviço HTTP local.");
  }
  return parsed.origin;
}

export function buildAssistAllowedOrigins(
  source = "",
  { includeDirectVendors = false, includeConfiguredOrigins = false } = {}
) {
  return Object.freeze([...new Set([
    ...DEFAULT_ASSIST_ALLOWED_ORIGINS,
    ...(includeDirectVendors ? DEVELOPMENT_VENDOR_ASSIST_ORIGINS : []),
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
