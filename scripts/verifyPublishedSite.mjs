import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUEST_TIMEOUT_MS = 20_000;
const REQUEST_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 8_000;
const MAX_ASSET_COUNT = 5_000;
const MAX_TEXT_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 96 * 1024 * 1024;
const CALLBACK_PARAMETERS = Object.freeze({
  auth_state: "aralearn-publication-check",
  code: "aralearn-publication-check"
});
const REQUIRED_ASSETS = Object.freeze([
  "./index.html",
  "./runtime-config.js",
  "./frame-guard.js",
  "./theme-bootstrap.js",
  "./styles-tokens.css",
  "./styles-shell-baseline.css",
  "./styles.css",
  "./main.js",
  "./service-worker.js",
  "./assets/brand/aralearn-mark.png"
]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".txt", ".xml"]);
const RETRYABLE_HTTP_STATUSES = new Set([404, 408, 425, 429, 500, 502, 503, 504]);
const MIME_TYPES = Object.freeze({
  ".css": ["text/css"],
  ".html": ["text/html"],
  ".js": ["application/javascript", "application/x-javascript", "text/javascript"],
  ".json": ["application/json", "text/json"],
  ".mjs": ["application/javascript", "application/x-javascript", "text/javascript"],
  ".png": ["image/png"],
  ".svg": ["image/svg+xml"]
});

function requiredText(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`Falta informar ${label}.`);
  return normalized;
}

function normalizeSiteUrl(value) {
  const normalized = requiredText(value, "a URL do site");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (error) {
    throw new Error("A URL do site não é válida.", { cause: error });
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("A URL do site deve usar HTTPS e não pode conter credenciais, consulta ou fragmento.");
  }
  if (!parsed.pathname.endsWith("/")) parsed.pathname += "/";
  return parsed;
}

function contentType(response) {
  return String(response.headers?.get?.("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function assertMime(response, assetPath) {
  let pathname = assetPath;
  try {
    pathname = new URL(assetPath).pathname;
  } catch {
    // Rótulos locais, como index.html, não precisam de uma URL absoluta.
  }
  const extension = path.posix.extname(pathname).toLowerCase();
  const accepted = MIME_TYPES[extension];
  if (!accepted) return;
  const actual = contentType(response);
  if (!accepted.includes(actual)) {
    throw new Error(`${assetPath} usa MIME ${actual || "ausente"}; esperado: ${accepted.join(" ou ")}.`);
  }
}

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function retryDelay(attempt) {
  return Math.min(RETRY_BASE_DELAY_MS * (2 ** (attempt - 1)), RETRY_MAX_DELAY_MS);
}

async function request(url, { fetchImpl, redirect = "error", waitImpl = wait } = {}) {
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect,
        headers: { Accept: "*/*" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      if (attempt === REQUEST_ATTEMPTS) {
        throw new Error(`Não foi possível consultar ${new URL(url).pathname}.`, { cause: error });
      }
      await waitImpl(retryDelay(attempt));
      continue;
    }
    if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === REQUEST_ATTEMPTS) {
      return response;
    }
    await waitImpl(retryDelay(attempt));
  }
  throw new Error(`Não foi possível consultar ${new URL(url).pathname}.`);
}

async function readSuccessfulText(response, assetPath) {
  if (!response.ok) throw new Error(`${assetPath} não está disponível (HTTP ${response.status}).`);
  assertMime(response, assetPath);
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (declaredLength > MAX_TEXT_ASSET_BYTES) {
    throw new Error(`${assetPath} excede o limite de verificação por arquivo.`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_ASSET_BYTES) {
    throw new Error(`${assetPath} excede o limite de verificação por arquivo.`);
  }
  return text;
}

function decodeJwtPayload(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function findJsonObject(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("runtime-config.js não contém a configuração pública do AraLearn.");
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) throw new Error("runtime-config.js contém uma configuração pública inválida.");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("runtime-config.js contém uma configuração pública incompleta.");
}

export function parsePublicRuntimeConfig(source) {
  let config;
  try {
    config = JSON.parse(findJsonObject(source, "Object.freeze("));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("runtime-config.js")) throw error;
    throw new Error("runtime-config.js contém uma configuração pública inválida.", { cause: error });
  }
  const projectValue = requiredText(config?.supabaseUrl, "a Project URL pública");
  let projectUrl;
  try {
    projectUrl = new URL(projectValue);
  } catch (error) {
    throw new Error("A Project URL pública não é válida.", { cause: error });
  }
  if (
    projectUrl.protocol !== "https:" ||
    projectUrl.username ||
    projectUrl.password ||
    projectUrl.pathname !== "/" ||
    projectUrl.search ||
    projectUrl.hash
  ) {
    throw new Error("A Project URL pública deve ser uma origem HTTPS sem credenciais.");
  }
  const publishableKey = requiredText(config?.supabasePublishableKey, "a publishable key pública");
  const payload = decodeJwtPayload(publishableKey);
  if (
    /^sb_secret_/iu.test(publishableKey) ||
    payload?.role === "service_role" ||
    payload?.role === "supabase_admin"
  ) {
    throw new Error("runtime-config.js contém uma chave administrativa em vez da publishable key.");
  }
  if (!publishableKey.startsWith("sb_publishable_") && payload?.role !== "anon") {
    throw new Error("runtime-config.js não contém uma publishable key pública válida.");
  }
  if (!Array.isArray(config.assistAllowedOrigins)) {
    throw new Error("runtime-config.js contém origens de assistência inválidas.");
  }
  const assistAllowedOrigins = config.assistAllowedOrigins.map((value) => {
    let origin;
    try {
      origin = new URL(value);
    } catch (error) {
      throw new Error("runtime-config.js contém uma origem de assistência inválida.", { cause: error });
    }
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    ) {
      throw new Error("runtime-config.js contém uma origem de assistência que não é uma origem HTTPS exata.");
    }
    return origin.origin;
  });
  return {
    projectOrigin: projectUrl.origin,
    assistAllowedOrigins: [...new Set(assistAllowedOrigins)]
  };
}

function readCsp(indexSource) {
  const meta = indexSource.match(/<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/iu);
  if (!meta) throw new Error("index.html não declara Content-Security-Policy.");
  const content = meta[0].match(/\bcontent\s*=\s*(?:"([^"]+)"|'([^']+)')/iu);
  if (!content) throw new Error("index.html declara Content-Security-Policy sem conteúdo.");
  return content[1] || content[2];
}

export function validatePublishedCsp(indexSource, projectOrigin, assistAllowedOrigins = []) {
  const csp = readCsp(indexSource);
  const connectDirective = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => /^connect-src(?:\s|$)/u.test(directive));
  if (!connectDirective) throw new Error("A CSP não declara connect-src.");
  const sources = connectDirective.split(/\s+/u).slice(1);
  if (sources.includes("https:") || sources.includes("*") || sources.some((item) => item.includes("__ARALEARN_"))) {
    throw new Error("A CSP de connect-src está ampla ou ainda contém marcador de build.");
  }
  if (!sources.includes(projectOrigin)) {
    throw new Error("A CSP não permite a Project URL pública configurada.");
  }
  const missingAssistOrigins = assistAllowedOrigins.filter((origin) => !sources.includes(origin));
  if (missingAssistOrigins.length) {
    throw new Error("A CSP não permite uma origem de assistência declarada no runtime.");
  }
  const expectedSources = new Set(["'self'", projectOrigin, ...assistAllowedOrigins]);
  const unexpectedSources = sources.filter((source) => !expectedSources.has(source));
  if (unexpectedSources.length) {
    throw new Error("A CSP permite uma origem que não consta da configuração pública.");
  }
  return { csp, connectSources: sources };
}

function assertNoSecrets(source, assetPath) {
  if (/sb_secret_[A-Za-z0-9_-]{8,}/iu.test(source)) {
    throw new Error(`${assetPath} contém uma chave administrativa Supabase.`);
  }
  if (/postgres(?:ql)?:\/\/[^\s"'<>]+/iu.test(source)) {
    throw new Error(`${assetPath} contém uma connection string PostgreSQL.`);
  }
  if (/SUPABASE_(?:SERVICE_ROLE_KEY|DB_PASSWORD)\s*[=:]\s*["']?[A-Za-z0-9._-]{12,}/iu.test(source)) {
    throw new Error(`${assetPath} contém uma credencial administrativa.`);
  }
  const jwtCandidates = source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu) || [];
  if (jwtCandidates.some((candidate) => decodeJwtPayload(candidate)?.role === "service_role")) {
    throw new Error(`${assetPath} contém um JWT de service role.`);
  }
}

function assertVersionedServiceWorker(source) {
  if (
    source.includes("__ARALEARN_CACHE_REVISION__") ||
    !/const CACHE_NAME = `\$\{CACHE_PREFIX\}[a-f0-9]{20}`;/u.test(source)
  ) {
    throw new Error("service-worker.js não contém uma revisão de cache derivada do artefato.");
  }
}

function normalizeManifestAsset(siteUrl, value) {
  const asset = requiredText(value, "Um caminho de asset-manifest.json").replaceAll("\\", "/");
  if (!asset.startsWith("./") || asset.includes("\0") || asset.split("/").includes("..")) {
    throw new Error(`asset-manifest.json contém caminho inseguro: ${asset}.`);
  }
  const url = new URL(asset, siteUrl);
  if (url.origin !== siteUrl.origin || !url.pathname.startsWith(siteUrl.pathname)) {
    throw new Error(`asset-manifest.json aponta para fora do site: ${asset}.`);
  }
  return { asset, url };
}

function validateAssetManifest(source, siteUrl) {
  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    throw new Error("asset-manifest.json não contém JSON válido.");
  }
  if (!Array.isArray(manifest?.assets) || manifest.assets.length > MAX_ASSET_COUNT) {
    throw new Error("asset-manifest.json não contém uma lista de recursos válida.");
  }
  const assets = manifest.assets.map((asset) => normalizeManifestAsset(siteUrl, asset));
  const names = new Set(assets.map(({ asset }) => asset));
  const missing = REQUIRED_ASSETS.filter((asset) => !names.has(asset));
  if (missing.length) throw new Error(`asset-manifest.json não contém: ${missing.join(", ")}.`);
  const catalogFiles = assets
    .map(({ asset }) => asset)
    .filter((asset) => /(?:^|\/)(?:fixtures?|embedded-courses?|seed-course)(?:\/|$)|(?:seed-)?courses?(?:[.-][^/]*)?\.json$|catalog.*\.json$/iu.test(asset));
  if (catalogFiles.length) {
    throw new Error(`O site contém curso, fixture ou catálogo operacional: ${catalogFiles[0]}.`);
  }
  return assets;
}

async function verifyCallback(siteUrl, fetchImpl, waitImpl) {
  const callbackUrl = new URL(siteUrl);
  for (const [key, value] of Object.entries(CALLBACK_PARAMETERS)) callbackUrl.searchParams.set(key, value);
  let currentUrl = callbackUrl;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await request(currentUrl, { fetchImpl, redirect: "manual", waitImpl });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location) throw new Error("O callback de autenticação redireciona sem informar o destino.");
      const target = new URL(location, currentUrl);
      if (target.origin !== siteUrl.origin || !target.pathname.startsWith(siteUrl.pathname)) {
        throw new Error("O callback de autenticação redireciona para fora do site.");
      }
      if (Object.entries(CALLBACK_PARAMETERS).some(([key, value]) => target.searchParams.get(key) !== value)) {
        throw new Error("O callback de autenticação perde os parâmetros necessários durante o redirecionamento.");
      }
      currentUrl = target;
      continue;
    }
    if (contentType(response) !== "text/html") {
      throw new Error("O callback de autenticação não devolve HTML.");
    }
    const source = await readSuccessfulText(response, "callback de autenticação");
    if (!/<div\s+id=["']app-root["']/iu.test(source)) {
      throw new Error("O callback de autenticação não devolve o shell do AraLearn.");
    }
    return;
  }
  throw new Error("O callback de autenticação excede o limite de redirecionamentos.");
}

export async function verifyPublishedSite({
  siteUrl,
  fetchImpl = globalThis.fetch,
  waitImpl = wait
}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch indisponível neste ambiente.");
  const baseUrl = normalizeSiteUrl(siteUrl);
  const indexResponse = await request(baseUrl, { fetchImpl, waitImpl });
  const indexSource = await readSuccessfulText(indexResponse, "index.html");
  assertNoSecrets(indexSource, "index.html");
  if (!/<div\s+id=["']app-root["']/iu.test(indexSource)) {
    throw new Error("index.html não contém o ponto de montagem do AraLearn.");
  }

  const runtimeUrl = new URL("./runtime-config.js", baseUrl);
  const runtimeResponse = await request(runtimeUrl, { fetchImpl, waitImpl });
  const runtimeSource = await readSuccessfulText(runtimeResponse, "runtime-config.js");
  assertNoSecrets(runtimeSource, "runtime-config.js");
  const runtimeConfig = parsePublicRuntimeConfig(runtimeSource);
  validatePublishedCsp(indexSource, runtimeConfig.projectOrigin, runtimeConfig.assistAllowedOrigins);

  const manifestUrl = new URL("./asset-manifest.json", baseUrl);
  const manifestResponse = await request(manifestUrl, { fetchImpl, waitImpl });
  const manifestSource = await readSuccessfulText(manifestResponse, "asset-manifest.json");
  assertNoSecrets(manifestSource, "asset-manifest.json");
  const assets = validateAssetManifest(manifestSource, baseUrl);

  let totalTextBytes = Buffer.byteLength(indexSource, "utf8") + Buffer.byteLength(runtimeSource, "utf8") + Buffer.byteLength(manifestSource, "utf8");
  let checkedResources = 3;
  for (const { asset, url } of assets) {
    if (asset === "./runtime-config.js") continue;
    const response = await request(url, { fetchImpl, waitImpl });
    if (!response.ok) throw new Error(`${asset} não está disponível (HTTP ${response.status}).`);
    assertMime(response, asset);
    checkedResources += 1;
    if (!TEXT_EXTENSIONS.has(path.posix.extname(url.pathname).toLowerCase())) continue;
    const source = await readSuccessfulText(response, asset);
    totalTextBytes += Buffer.byteLength(source, "utf8");
    if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
      throw new Error("Os recursos textuais excedem o limite total de verificação.");
    }
    assertNoSecrets(source, asset);
    if (asset === "./service-worker.js") assertVersionedServiceWorker(source);
  }

  await verifyCallback(baseUrl, fetchImpl, waitImpl);
  return {
    siteUrl: baseUrl.href,
    projectUrl: runtimeConfig.projectOrigin,
    resourcesChecked: checkedResources,
    callbackChecked: true
  };
}

export function parseCommandLine(argv, env = process.env) {
  const options = { siteUrl: String(env.ARALEARN_SITE_URL || "").trim(), json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--url") {
      options.siteUrl = String(argv[index + 1] || "").trim();
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else {
      throw new Error("A linha de comando contém um argumento desconhecido.");
    }
  }
  requiredText(options.siteUrl, "a URL do site (--url ou ARALEARN_SITE_URL)");
  return options;
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2));
  const result = await verifyPublishedSite({ siteUrl: options.siteUrl });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      `Site publicado aprovado: ${result.siteUrl} (${result.resourcesChecked} recursos verificados).\n`
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
