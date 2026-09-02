import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseCommandLine,
  parsePublicRuntimeConfig,
  validatePublishedCsp,
  verifyPublishedSite
} from "../../scripts/verifyPublishedSite.mjs";
import {
  DEFAULT_ASSIST_ALLOWED_ORIGINS,
  DEVELOPMENT_VENDOR_ASSIST_ORIGINS
} from "../../src/assist/providerRuntimeSecurity.js";
const BASE_URL = "https://site.example.test/AraLearn/";
const ACTIONS_OPENAPI = readFileSync(
  new URL("../../docs/downloads/aralearn-chatgpt-action-openapi.yaml", import.meta.url),
  "utf8"
);
const ACTIONS_OPENAPI_DOCUMENT = JSON.parse(ACTIONS_OPENAPI);
const PROJECT_URL = new URL(ACTIONS_OPENAPI_DOCUMENT.servers[0].url).origin;
const VERSION = ACTIONS_OPENAPI_DOCUMENT.info.version;
const REVISION = "0123456789abcdef0123";
const ASSIST_ORIGINS = [...DEFAULT_ASSIST_ALLOWED_ORIGINS];
const INDEX = `<!doctype html>
<html lang="pt-BR"><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ${PROJECT_URL} ${ASSIST_ORIGINS.join(" ")}; object-src 'none'">
</head><body><div id="app-root"></div></body></html>`;
const RUNTIME_CONFIG = `globalThis.__ARALEARN_ENV__ ??= Object.freeze({
  "supabaseUrl": "${PROJECT_URL}",
  "supabasePublishableKey": "sb_publishable_public-test-value",
  "assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}
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
  "./docs/downloads/aralearn-chatgpt-action-openapi.yaml",
  "./assets/brand/aralearn-mark.png",
  "./src/render/renderPackageStudyUnit.js",
  "./src/resources/kernel/studyUnitEnvelope.js"
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
    ["/AraLearn/asset-manifest.json", {
      body: { version: VERSION, revision: REVISION, assets },
      type: "application/json"
    }],
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
    ["/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml", {
      body: ACTIONS_OPENAPI,
      type: "application/yaml"
    }],
    ["/AraLearn/assets/brand/aralearn-mark.png", { body: "PNG", type: "image/png" }],
    ["/AraLearn/src/render/renderPackageStudyUnit.js", {
      body: 'import "../resources/kernel/studyUnitEnvelope.js";',
      type: "text/javascript"
    }],
    ["/AraLearn/src/resources/kernel/studyUnitEnvelope.js", {
      body: "export const COURSE_CONTRACT = 'aralearn.course.v1';",
      type: "text/javascript"
    }]
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
    version: VERSION,
    artifactRevision: REVISION,
    projectUrl: PROJECT_URL,
    resourcesChecked: 15,
    callbackChecked: true
  });
  assert.ok(calls.length >= ASSETS.length + 2);
  assert.ok(calls.every(({ options }) => options.method === "GET"));
  assert.ok(calls.every(({ options }) => options.cache === "no-store"));
  assert.ok(calls.every(({ options }) => options.headers["Cache-Control"] === "no-cache"));
  assert.ok(calls.every(({ options }) => !("Authorization" in options.headers)));
  assert.ok(calls.some(({ url }) => url.includes("auth_state=aralearn-publication-check")));
  assert.ok(calls.some(({ url }) => url.includes(`aralearn-publication-check=${VERSION}-`)));
  assert.doesNotMatch(JSON.stringify(result), /sb_publishable_/u);
});

test("lê a configuração pública sem executar JavaScript e valida a CSP exata", () => {
  assert.deepEqual(parsePublicRuntimeConfig(RUNTIME_CONFIG), {
    projectOrigin: PROJECT_URL,
    assistAllowedOrigins: ASSIST_ORIGINS
  });
  assert.deepEqual(
    validatePublishedCsp(INDEX, PROJECT_URL, ASSIST_ORIGINS).connectSources,
    ["'self'", PROJECT_URL, ...ASSIST_ORIGINS]
  );
  assert.throws(
    () => validatePublishedCsp(
      INDEX.replace(PROJECT_URL, "https:"),
      PROJECT_URL,
      ASSIST_ORIGINS
    ),
    /ampla/
  );
  assert.throws(
    () => validatePublishedCsp(
      INDEX.replace(PROJECT_URL, `${PROJECT_URL} https://inesperado.example`),
      PROJECT_URL,
      ASSIST_ORIGINS
    ),
    /não consta da configuração pública/
  );
  assert.throws(
    () => validatePublishedCsp(
      INDEX.replace(` ${ASSIST_ORIGINS[0]}`, ""),
      PROJECT_URL,
      ASSIST_ORIGINS
    ),
    /todas as origens autorizadas/u
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace("sb_publishable_public-test-value", "valor-indefinido")),
    /publishable key pública válida/
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace(
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}`,
      '"assistAllowedOrigins": []'
    )),
    /somente as origens oficiais/u
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace(
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}`,
      `"assistAllowedOrigins": ${JSON.stringify([
        ...ASSIST_ORIGINS,
        "https://modelos.example.edu"
      ])}`
    )),
    /somente as origens oficiais/u
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace(
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}`,
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}, "nativeAssistBridge": true`
    )),
    /não pertencem ao artefato Pages: nativeAssistBridge/u
  );
  assert.throws(
    () => parsePublicRuntimeConfig(RUNTIME_CONFIG.replace(
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}`,
      `"assistAllowedOrigins": ${JSON.stringify(ASSIST_ORIGINS)}, "developmentRuntime": true`
    )),
    /não pertencem ao artefato Pages: developmentRuntime/u
  );
});

test("site publicado aceita somente as origens oficiais dos providers", () => {
  const config = RUNTIME_CONFIG.replace(
    JSON.stringify(ASSIST_ORIGINS),
    JSON.stringify(DEVELOPMENT_VENDOR_ASSIST_ORIGINS)
  );
  const index = INDEX.replace(
    ASSIST_ORIGINS.join(" "),
    DEVELOPMENT_VENDOR_ASSIST_ORIGINS.join(" ")
  );
  assert.deepEqual(parsePublicRuntimeConfig(config).assistAllowedOrigins,
    DEVELOPMENT_VENDOR_ASSIST_ORIGINS);
  assert.deepEqual(
    validatePublishedCsp(index, PROJECT_URL, DEVELOPMENT_VENDOR_ASSIST_ORIGINS)
      .connectSources,
    ["'self'", PROJECT_URL, ...DEVELOPMENT_VENDOR_ASSIST_ORIGINS]
  );
});

test("recusa credenciais, connection string e catálogo empacotado", async (context) => {
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

  await context.test("chave de serviço de linguagem", async () => {
    const providerKey = `sk-proj-${"A".repeat(40)}`;
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: {
        "/AraLearn/main.js": {
          body: `const providerKey = "${providerKey}";`,
          type: "text/javascript"
        }
      }
    });
    await assert.rejects(
      () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
      /credencial de serviço de linguagem/u
    );
  });

  await context.test("catálogo JSON", async () => {
    const { fetchImpl } = createPublishedSiteFetch({ assets: [...ASSETS, "./catalog-courses.json"] });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }), /catálogo operacional/);
  });
});

test("recusa recurso ausente ou servido com MIME incorreto", async (context) => {
  await context.test("404 persistente após retries limitados", async () => {
    const { fetchImpl, calls } = createPublishedSiteFetch({
      overrides: { "/AraLearn/main.js": { status: 404, body: "ausente", type: "text/plain" } }
    });
    const delays = [];
    await assert.rejects(
      () => verifyPublishedSite({
        siteUrl: BASE_URL,
        fetchImpl,
        waitImpl: async (delayMs) => delays.push(delayMs)
      }),
      /main\.js.*HTTP 404/
    );
    assert.equal(calls.filter(({ url }) => new URL(url).pathname === "/AraLearn/main.js").length, 5);
    assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000]);
  });

  await context.test("MIME incorreto", async () => {
    const { fetchImpl, calls } = createPublishedSiteFetch({
      overrides: { "/AraLearn/styles.css": { body: "body {}", type: "text/plain" } }
    });
    const delays = [];
    await assert.rejects(
      () => verifyPublishedSite({
        siteUrl: BASE_URL,
        fetchImpl,
        waitImpl: async (delayMs) => delays.push(delayMs)
      }),
      /styles\.css usa MIME text\/plain/
    );
    assert.equal(calls.filter(({ url }) => new URL(url).pathname === "/AraLearn/styles.css").length, 1);
    assert.deepEqual(delays, []);
  });
});

test("recusa OpenAPI de Actions hospedado com versão divergente", async () => {
  const incompatible = JSON.parse(ACTIONS_OPENAPI);
  incompatible.info.version = "0.0.30";
  const { fetchImpl } = createPublishedSiteFetch({
    overrides: {
      "/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml": {
        body: incompatible,
        type: "application/yaml"
      }
    }
  });
  await assert.rejects(
    () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
    /OpenAPI publicado de Actions não corresponde/u
  );
});

test("recusa OpenAPI hospedado sem a tarefa de salvar uma Parte", async () => {
  const incomplete = JSON.parse(ACTIONS_OPENAPI);
  delete incomplete.paths["/salvar_parte"];
  const { fetchImpl } = createPublishedSiteFetch({
    overrides: {
      "/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml": {
        body: `${JSON.stringify(incomplete)}\n`,
        type: "application/yaml"
      }
    }
  });
  await assert.rejects(
    () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
    /não contém a projeção de transporte corrente/u
  );
});

test("recusa OpenAPI de Actions hospedado com fingerprint divergente", async () => {
  const incompatible = JSON.parse(ACTIONS_OPENAPI);
  incompatible.info["x-aralearn-task-catalog-fingerprint"] = `sha256:${"0".repeat(64)}`;
  const { fetchImpl } = createPublishedSiteFetch({
    overrides: {
      "/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml": {
        body: incompatible,
        type: "application/yaml"
      }
    }
  });
  await assert.rejects(
    () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
    /outro catálogo de tarefas humanas/iu
  );
});

test("recusa projeção OpenAPI defasada mesmo com metadata corrente", async () => {
  const staleProjection = JSON.parse(ACTIONS_OPENAPI);
  staleProjection.paths["/salvar_parte"].post.requestBody
    .content["application/json"].schema.properties.microssequencias.maxItems = 31;
  const { fetchImpl } = createPublishedSiteFetch({
    overrides: {
      "/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml": {
        body: `${JSON.stringify(staleProjection, null, 2)}\n`,
        type: "application/yaml"
      }
    }
  });
  await assert.rejects(
    () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
    /não corresponde ao artefato gerado local desta revisão/u
  );
});

test("aceita o OpenAPI gerado com finais de linha normalizados pelo host", async () => {
  const { fetchImpl } = createPublishedSiteFetch({
    overrides: {
      "/AraLearn/docs/downloads/aralearn-chatgpt-action-openapi.yaml": {
        body: ACTIONS_OPENAPI.replace(/\r?\n/gu, "\r\n"),
        type: "application/yaml"
      }
    }
  });
  const result = await verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl });
  assert.equal(result.version, VERSION);
});

test("recusa manifesto cacheado de outra versão ou revisão divergente", async (context) => {
  await context.test("versão anterior", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: {
        "/AraLearn/asset-manifest.json": {
          body: { version: "0.0.26", revision: REVISION, assets: ASSETS },
          type: "application/json"
        }
      }
    });
    await assert.rejects(
      () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
      new RegExp(`versão esperada ${VERSION.replaceAll(".", "\\.")}`, "u")
    );
  });

  await context.test("revisão do service worker divergente", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: {
        "/AraLearn/service-worker.js": {
          body: 'const CACHE_PREFIX = "aralearn-shell-";\nconst CACHE_NAME = `${CACHE_PREFIX}aaaaaaaaaaaaaaaaaaaa`;\n',
          type: "text/javascript"
        }
      }
    });
    await assert.rejects(
      () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl }),
      /revisões diferentes/
    );
  });
});

test("repete somente falhas transitórias da publicação", async (context) => {
  await context.test("HTTP 503 transitório recupera", async () => {
    const publishedSite = createPublishedSiteFetch();
    let indexAttempts = 0;
    const fetchImpl = async (input, options) => {
      const url = new URL(input);
      if (url.pathname === "/AraLearn/" && url.searchParams.has("aralearn-publication-check")) {
        indexAttempts += 1;
        if (indexAttempts === 1) {
          return makeResponse(503, "temporariamente indisponível", "text/plain");
        }
      }
      return publishedSite.fetchImpl(input, options);
    };
    const delays = [];

    const result = await verifyPublishedSite({
      siteUrl: BASE_URL,
      fetchImpl,
      waitImpl: async (delayMs) => delays.push(delayMs)
    });

    assert.equal(result.siteUrl, BASE_URL);
    assert.equal(indexAttempts, 2);
    assert.deepEqual(delays, [1_000]);
  });

  await context.test("timeout de rede transitório recupera", async () => {
    const publishedSite = createPublishedSiteFetch();
    let indexAttempts = 0;
    const fetchImpl = async (input, options) => {
      const url = new URL(input);
      if (url.pathname === "/AraLearn/" && url.searchParams.has("aralearn-publication-check")) {
        indexAttempts += 1;
        if (indexAttempts === 1) {
          throw new DOMException("tempo esgotado", "TimeoutError");
        }
      }
      return publishedSite.fetchImpl(input, options);
    };
    const delays = [];

    const result = await verifyPublishedSite({
      siteUrl: BASE_URL,
      fetchImpl,
      waitImpl: async (delayMs) => delays.push(delayMs)
    });

    assert.equal(result.siteUrl, BASE_URL);
    assert.equal(indexAttempts, 2);
    assert.deepEqual(delays, [1_000]);
  });
});

test("recusa callback inexistente ou redirecionamento que perde PKCE", async (context) => {
  const callbackPath = "/AraLearn/?auth_state=aralearn-publication-check&code=aralearn-publication-check";
  await context.test("página inexistente", async () => {
    const { fetchImpl } = createPublishedSiteFetch({
      overrides: { [callbackPath]: { status: 404, body: "ausente", type: "text/html" } }
    });
    await assert.rejects(
      () => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, waitImpl: async () => {} }),
      /callback.*HTTP 404/
    );
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
