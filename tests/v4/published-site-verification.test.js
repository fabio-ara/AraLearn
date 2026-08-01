import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCommandLine,
  parsePublicRuntimeConfig,
  validatePublishedCsp,
  verifyPublishedSite
} from "../../scripts/verifyPublishedSite.mjs";

const BASE_URL = "https://site.example.test/AraLearn/";
const PROJECT_URL = "https://project.example.supabase.co";
const INDEX = `<!doctype html>
<html lang="pt-BR"><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ${PROJECT_URL}; object-src 'none'">
</head><body><div id="app-root"></div></body></html>`;
const RUNTIME_CONFIG = `globalThis.__ARALEARN_ENV__ ??= Object.freeze({
  "supabaseUrl": "${PROJECT_URL}",
  "supabasePublishableKey": "sb_publishable_public-test-value",
  "assistAllowedOrigins": [],
  "androidRuntime": false
});\n`;
const ASSETS = [
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
];

function makeResponse(status, body, type, { location = "" } = {}) {
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  if (location) headers.set("location", location);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    }
  };
}

function createPublishedSiteFetch({
  index = INDEX,
  runtimeConfig = RUNTIME_CONFIG,
  assets = ASSETS,
  overrides = {}
} = {}) {
  const calls = [];
  const bodies = new Map([
    ["/AraLearn/", { body: index, type: "text/html; charset=utf-8" }],
    ["/AraLearn/index.html", { body: index, type: "text/html; charset=utf-8" }],
    ["/AraLearn/runtime-config.js", { body: runtimeConfig, type: "text/javascript" }],
    ["/AraLearn/asset-manifest.json", { body: { assets }, type: "application/json" }],
    ["/AraLearn/frame-guard.js", { body: "globalThis.frameGuard = true;", type: "text/javascript" }],
    ["/AraLearn/theme-bootstrap.js", { body: "globalThis.AraLearnTheme = {};", type: "text/javascript" }],
    ["/AraLearn/styles-tokens.css", { body: ":root { color-scheme: light; }", type: "text/css" }],
    ["/AraLearn/styles-shell-baseline.css", { body: "#app-root { display: flex; }", type: "text/css" }],
    ["/AraLearn/styles.css", { body: "#app-root { display: block; }", type: "text/css" }],
    ["/AraLearn/main.js", { body: "globalThis.aralearnStarted = true;", type: "application/javascript" }],
    ["/AraLearn/service-worker.js", {
      body: 'const CACHE_PREFIX = "aralearn-shell-";\nconst CACHE_NAME = `${CACHE_PREFIX}0123456789abcdef0123`;\nself.addEventListener("fetch", () => {});',
      type: "text/javascript"
    }],
    ["/AraLearn/assets/brand/aralearn-mark.png", { body: "PNG", type: "image/png" }]
  ]);

  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url: url.href, options });
    const override = overrides[url.pathname + url.search] || overrides[url.pathname];
    if (override) return makeResponse(override.status ?? 200, override.body ?? "", override.type, override);
    const entry = bodies.get(url.pathname);
    if (!entry) return makeResponse(404, "ausente", "text/plain");
    return makeResponse(200, entry.body, entry.type);
  };
  return { fetchImpl, calls };
}

test("verifica integralmente um site publicado usando somente GET", async () => {
  const { fetchImpl, calls } = createPublishedSiteFetch();
  const result = await verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl });

  assert.deepEqual(result, {
    siteUrl: BASE_URL,
    projectUrl: PROJECT_URL,
    resourcesChecked: 12,
    callbackChecked: true
  });
  assert.ok(calls.length >= ASSETS.length + 2);
  assert.ok(calls.every(({ options }) => options.method === "GET"));
  assert.ok(calls.every(({ options }) => !("Authorization" in options.headers)));
  assert.ok(calls.some(({ url }) => url.includes("auth_state=aralearn-publication-check")));
  assert.doesNotMatch(JSON.stringify(result), /sb_publishable_/u);
});

test("lê a configuração pública sem executar JavaScript e valida a CSP exata", () => {
  assert.deepEqual(parsePublicRuntimeConfig(RUNTIME_CONFIG), {
    projectOrigin: PROJECT_URL,
    assistAllowedOrigins: []
  });
  assert.deepEqual(validatePublishedCsp(INDEX, PROJECT_URL).connectSources, ["'self'", PROJECT_URL]);
  assert.throws(
    () => validatePublishedCsp(INDEX.replace(PROJECT_URL, "https:"), PROJECT_URL),
    /ampla/
  );
  assert.throws(
    () => validatePublishedCsp(INDEX.replace(PROJECT_URL, `${PROJECT_URL} https://inesperado.example`), PROJECT_URL),
    /não consta da configuração pública/
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace("sb_publishable_public-test-value", "valor-indefinido")),
    /publishable key pública válida/
  );
});

test("recusa chave administrativa, connection string e catálogo empacotado", async (context) => {
  await context.test("chave administrativa", async () => {
    const payload = Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url");
    const secretRuntime = RUNTIME_CONFIG.replace(
      "sb_publishable_public-test-value",
      `eyJhbGciOiJIUzI1NiJ9.${payload}.assinatura`
    );
    const { fetchImpl } = createPublishedSiteFetch({ runtimeConfig: secretRuntime });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /service role|chave administrativa/);
  });

  await context.test("connection string", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: {
        "/AraLearn/main.js": {
          body: "const database = 'postgresql://admin:secret@example.test/db';",
          type: "text/javascript"
        }
      }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /connection string/);
  });

  await context.test("catálogo JSON", async () => {
    const { fetchImpl } = createPublishedSiteFetch({ assets: [...ASSETS, "./catalog-courses.json"] });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /catálogo operacional/);
  });
});

test("recusa recurso ausente ou servido com MIME incorreto", async (context) => {
  await context.test("recurso ausente", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: { "/AraLearn/main.js": { status: 404, body: "ausente", type: "text/plain" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /main\.js.*HTTP 404/);
  });

  await context.test("MIME incorreto", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: { "/AraLearn/styles.css": { body: "body {}", type: "text/plain" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /styles\.css usa MIME text\/plain/);
  });
});

test("recusa callback inexistente ou redirecionamento que perde PKCE", async (context) => {
  const callbackPath = "/AraLearn/?auth_state=aralearn-publication-check&code=aralearn-publication-check";
  await context.test("página inexistente", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: { [callbackPath]: { status: 404, body: "ausente", type: "text/html" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /callback.*HTTP 404/);
  });

  await context.test("parâmetros descartados", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: { [callbackPath]: { status: 302, location: "/AraLearn/", type: "text/html" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /perde os parâmetros/);
  });
});

test("linha de comando aceita URL explícita ou variável de ambiente", () => {
  assert.deepEqual(parseCommandLine(["--url", BASE_URL, "--json"], {}), {
    siteUrl: BASE_URL,
    json: true
  });
  assert.deepEqual(parseCommandLine([], { ARALEARN_SITE_URL: BASE_URL }), {
    siteUrl: BASE_URL,
    json: false
  });
  assert.throws(() => parseCommandLine(["--desconhecido"], {}), /argumento desconhecido/);
});
