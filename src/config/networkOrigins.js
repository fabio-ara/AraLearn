const LOCAL_ASSIST_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export const BUILT_IN_ASSIST_ORIGINS = Object.freeze([
  "https://api.deepseek.com",
  "https://api.openai.com",
  "https://generativelanguage.googleapis.com"
]);

export const DEVELOPMENT_ASSIST_ORIGINS = Object.freeze([
  "http://127.0.0.1:4183",
  "http://localhost:4183"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNetworkOrigin(value, { allowLocalHttp = false } = {}) {
  const source = text(value);
  if (!source) return "";
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error(`Origem de assistência inválida: ${source}.`);
  }
  const local = LOCAL_ASSIST_HOSTS.has(parsed.hostname.toLowerCase());
  if (parsed.protocol !== "https:" && !(allowLocalHttp && local && parsed.protocol === "http:")) {
    throw new Error("Origens de assistência devem usar HTTPS; HTTP só é permitido no desenvolvimento local.");
  }
  if (
    parsed.username || parsed.password || parsed.search || parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "")
  ) {
    throw new Error("Informe somente a origem da assistência, sem caminho, credencial, consulta ou fragmento.");
  }
  return parsed.origin;
}

export function parseNetworkOriginList(value, options = {}) {
  const entries = Array.isArray(value)
    ? value
    : text(value).split(/[\s,;]+/u);
  const origins = entries
    .map((entry) => normalizeNetworkOrigin(entry, options))
    .filter(Boolean);
  return [...new Set(origins)].sort((left, right) => left.localeCompare(right));
}

export function buildAssistAllowedOrigins({ configured = "", development = false } = {}) {
  return parseNetworkOriginList([
    ...BUILT_IN_ASSIST_ORIGINS,
    ...(development ? DEVELOPMENT_ASSIST_ORIGINS : []),
    ...parseNetworkOriginList(configured, { allowLocalHttp: development })
  ], { allowLocalHttp: development });
}
