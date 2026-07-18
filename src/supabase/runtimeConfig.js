const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeJwtPayload(token) {
  const parts = text(token).split(".");
  if (parts.length !== 3) return null;
  try {
    const source = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padding = "=".repeat((4 - (source.length % 4)) % 4);
    if (typeof globalThis.atob !== "function") return null;
    const decoded = globalThis.atob(source + padding);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function normalizeProjectUrl(value) {
  const source = text(value).replace(/\/+$/, "");
  if (!source) return "";
  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    throw new Error("ARALEARN_SUPABASE_URL deve ser uma URL válida.");
  }
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) {
    throw new Error("O Supabase exige HTTPS; HTTP só é aceito no desenvolvimento local.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function assertPublicKey(value) {
  const key = text(value);
  if (!key) return "";
  const payload = decodeJwtPayload(key);
  if (payload?.role === "service_role" || /service[_-]?role/i.test(key) || /^sb_secret_/i.test(key)) {
    throw new Error("A configuração pública não pode conter uma service role key.");
  }
  return key;
}

export function readSupabaseRuntimeConfig(source = globalThis.__ARALEARN_ENV__ || {}) {
  const projectUrl = normalizeProjectUrl(source.supabaseUrl || source.projectUrl || "");
  const publishableKey = assertPublicKey(
    source.supabasePublishableKey || source.publishableKey || source.supabaseAnonKey || ""
  );
  return Object.freeze({
    projectUrl,
    publishableKey,
    configured: !!projectUrl && !!publishableKey
  });
}

export function buildAuthRedirectUrl(locationValue = globalThis.location) {
  if (globalThis.AndroidHost) {
    return "aralearn://auth/callback";
  }
  if (!locationValue?.origin || !locationValue?.pathname) return "";
  return `${locationValue.origin}${locationValue.pathname}`;
}
