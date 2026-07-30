const LOCAL_SUPABASE_HOSTS = new Set([
  "127.0.0.1",
  "0.0.0.0",
  "10.0.2.2",
  "host.docker.internal",
  "kong",
  "localhost"
]);
const SERVER_ENVIRONMENT_VARIABLES = Object.freeze([
  "SUPABASE_URL",
  "ARALEARN_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEYS",
  "ARALEARN_SUPABASE_SECRET_KEY_NAME",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEYS",
  "ARALEARN_SUPABASE_PUBLISHABLE_KEY_NAME",
  "SUPABASE_ANON_KEY",
  "ANON_KEY"
]);

function text(value) {
  return String(value || "").trim();
}

function required(value, label) {
  const normalized = text(value);
  if (!normalized) throw new Error(`${label} ausente no servidor.`);
  return normalized;
}

function parseNamedKeys(source, variableName) {
  if (!text(source)) return null;
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${variableName} não contém um objeto JSON válido.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${variableName} deve conter um objeto JSON nomeado.`);
  }
  const entries = Object.entries(parsed)
    .map(([name, value]) => [text(name), text(value)])
    .filter(([name, value]) => name && value);
  if (!entries.length) throw new Error(`${variableName} não contém uma chave utilizável.`);
  return Object.fromEntries(entries);
}

function namedKey(environment, {
  directVariable,
  dictionaryVariable,
  nameVariable,
  label
}) {
  const direct = text(environment?.[directVariable]);
  if (direct) return direct;
  const dictionary = parseNamedKeys(environment?.[dictionaryVariable], dictionaryVariable);
  if (!dictionary) return "";
  const requestedName = text(environment?.[nameVariable]) || "default";
  if (dictionary[requestedName]) return dictionary[requestedName];
  const availableNames = Object.keys(dictionary);
  if (!text(environment?.[nameVariable]) && availableNames.length === 1) {
    return dictionary[availableNames[0]];
  }
  throw new Error(`${label} '${requestedName}' não existe em ${dictionaryVariable}.`);
}

export function isLocalSupabaseUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "http:") return false;
    if (LOCAL_SUPABASE_HOSTS.has(parsed.hostname)) return true;
    if (/^supabase_kong_[a-z0-9_-]+$/u.test(parsed.hostname)) return true;
    return /^127(?:\.\d{1,3}){3}$/u.test(parsed.hostname);
  } catch {
    return false;
  }
}

export function isLegacySupabaseJwt(value) {
  const normalized = text(value);
  return /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(normalized);
}

function legacyJwtRole(value) {
  if (!isLegacySupabaseJwt(value)) return "";
  try {
    const payloadSegment = String(value).split(".")[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/");
    const payload = JSON.parse(atob(payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=")));
    return text(payload?.role);
  } catch {
    return "";
  }
}

export function supabaseServerHeaders(serverApiKey, { contentType = true } = {}) {
  const key = required(serverApiKey, "A chave administrativa do Supabase");
  return {
    apikey: key,
    ...(isLegacySupabaseJwt(key) ? { Authorization: `Bearer ${key}` } : {}),
    ...(contentType ? { "Content-Type": "application/json" } : {})
  };
}

export function resolveSupabaseAdministrativeEnvironment(environment = {}) {
  const supabaseUrl = required(environment.SUPABASE_URL || environment.ARALEARN_SUPABASE_URL, "SUPABASE_URL")
    .replace(/\/+$/u, "");
  const local = isLocalSupabaseUrl(supabaseUrl);
  const secretKey = namedKey(environment, {
    directVariable: "SUPABASE_SECRET_KEY",
    dictionaryVariable: "SUPABASE_SECRET_KEYS",
    nameVariable: "ARALEARN_SUPABASE_SECRET_KEY_NAME",
    label: "A chave secreta do Supabase"
  });
  const legacyServiceRoleKey = text(environment.SUPABASE_SERVICE_ROLE_KEY || environment.SERVICE_ROLE_KEY);
  const serverApiKey = secretKey || (local ? legacyServiceRoleKey : "");
  if (!serverApiKey) {
    throw new Error(
      local
        ? "SUPABASE_SECRET_KEY ou SUPABASE_SERVICE_ROLE_KEY local ausente no servidor."
        : "SUPABASE_SECRET_KEYS ou SUPABASE_SECRET_KEY ausente no servidor hospedado."
    );
  }
  if (!local && isLegacySupabaseJwt(serverApiKey)) {
    throw new Error("O servidor MCP hospedado exige uma credencial administrativa sb_secret_; a service_role JWT é aceita somente no stack local.");
  }
  if (!local && !serverApiKey.startsWith("sb_secret_")) {
    throw new Error("A chave administrativa hospedada não usa o formato sb_secret_.");
  }
  if (local && isLegacySupabaseJwt(serverApiKey) && legacyJwtRole(serverApiKey) !== "service_role") {
    throw new Error("A chave JWT administrativa local não possui o papel service_role.");
  }
  if (local && !secretKey && !isLegacySupabaseJwt(serverApiKey)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY local não contém uma JWT service_role válida.");
  }

  return { supabaseUrl, serverApiKey, local };
}

export function resolveSupabaseServerEnvironment(environment = {}) {
  const { supabaseUrl, serverApiKey, local } = resolveSupabaseAdministrativeEnvironment(environment);

  const publishableKey = namedKey(environment, {
    directVariable: "SUPABASE_PUBLISHABLE_KEY",
    dictionaryVariable: "SUPABASE_PUBLISHABLE_KEYS",
    nameVariable: "ARALEARN_SUPABASE_PUBLISHABLE_KEY_NAME",
    label: "A chave publicável do Supabase"
  }) || (local ? text(environment.SUPABASE_ANON_KEY || environment.ANON_KEY) : "");
  if (!publishableKey) {
    throw new Error(
      local
        ? "SUPABASE_PUBLISHABLE_KEY ou SUPABASE_ANON_KEY local ausente no servidor."
        : "SUPABASE_PUBLISHABLE_KEYS ou SUPABASE_PUBLISHABLE_KEY ausente no servidor hospedado."
    );
  }
  if (!local && !publishableKey.startsWith("sb_publishable_")) {
    throw new Error("A chave pública hospedada não usa o formato sb_publishable_.");
  }
  if (!local && publishableKey === serverApiKey) {
    throw new Error("A chave pública hospedada não pode reutilizar a chave administrativa.");
  }

  return {
    supabaseUrl,
    serverApiKey,
    publishableKey,
    local
  };
}

export function readSupabaseServerEnvironment(getValue) {
  if (typeof getValue !== "function") throw new TypeError("O leitor de variáveis do servidor é obrigatório.");
  const environment = Object.fromEntries(
    SERVER_ENVIRONMENT_VARIABLES.map((name) => [name, getValue(name)])
  );
  return resolveSupabaseServerEnvironment(environment);
}
