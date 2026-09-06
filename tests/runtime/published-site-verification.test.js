import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

function responseBytes(body) {
  return Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
}

function makeResponse(status, body, type, { location = "" } = {}) {
  const headers = new Headers();
  if (type) headers.set("content-type", type);
  if (location) headers.set("location", location);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    async text() {
      return responseBytes(body).toString("utf8");
    },
    async arrayBuffer() {
      return Uint8Array.from(responseBytes(body)).buffer;
    }
  };
}

function createPublishedSiteFetch({
  index = INDEX,
  runtimeConfig = RUNTIME_CONFIG,
  assets = ASSETS,
  additionalFiles = {},
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
    ["/AraLearn/assets/brand/aralearn-mark.png", { body: Buffer.from([137, 80, 78, 71, 255, 254]), type: "image/png" }],
    ["/AraLearn/src/render/renderPackageStudyUnit.js", {
      body: 'import "../resources/kernel/studyUnitEnvelope.js";',
      type: "text/javascript"
    }],
    ["/AraLearn/src/resources/kernel/studyUnitEnvelope.js", {
      body: "export const COURSE_CONTRACT = 'aralearn.course.v1';",
      type: "text/javascript"
    }]
  ]);
  for (const [name, entry] of Object.entries(additionalFiles)) bodies.set(name, entry);
  const candidateManifest = {
    schemaVersion: 1,
    version: VERSION,
    artifacts: {
      pages: {
        files: [...bodies].filter(([name]) => name !== "/AraLearn/")
          .map(([name, entry]) => {
            const bytes = responseBytes(entry.body);
            return {
              path: name.slice("/AraLearn/".length),
              sha256: createHash("sha256").update(bytes).digest("hex"),
              size: bytes.length
            };
          }).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      }
    }
  };

  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url: url.href, options });
    const override = overrides[url.pathname + url.search] || overrides[url.pathname];
    if (override) return makeResponse(override.status ?? 200, override.body ?? "", override.type, override);
    const entry = bodies.get(url.pathname);
    if (!entry) return makeResponse(404, "ausente", "text/plain");
    return makeResponse(200, entry.body, entry.type);
  };
  return { fetchImpl, calls, candidateManifest };
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

test("confere todos os bytes da candidata, incluindo binário e mapa omitido do manifesto runtime", async () => {
  const { fetchImpl, calls, candidateManifest } = createPublishedSiteFetch({
    additionalFiles: { "/AraLearn/main.js.map": { body: "{}", type: "application/json" } }
  });
  const result = await verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest });
  assert.equal(result.candidateManifestChecked, true);
  assert.equal(result.candidateFilesChecked, candidateManifest.artifacts.pages.files.length);
  assert.ok(calls.some(({ url }) => new URL(url).pathname === "/AraLearn/main.js.map"));
  assert.equal(result.callbackChecked, true);
});

test("recusa manifesto de candidata inválido antes de consultar o host", async (context) => {
  const invalidManifests = [
    ["null", () => null],
    ["schema desconhecido", (manifest) => { manifest.schemaVersion = 2; }],
    ["versão inválida", (manifest) => { manifest.version = "01.0.0"; }],
    ["versão diferente", (manifest) => { manifest.version = "9.9.9"; }],
    ["arquivos ausentes", (manifest) => { delete manifest.artifacts.pages.files; }],
    ["lista vazia", (manifest) => { manifest.artifacts.pages.files = []; }],
    ["lista excessiva", (manifest) => { manifest.artifacts.pages.files = Array(5001).fill({}); }],
    ["manifesto runtime não aprovado", (manifest) => {
      manifest.artifacts.pages.files = manifest.artifacts.pages.files.filter((file) => file.path !== "asset-manifest.json");
    }],
    ["arquivo obrigatório ausente", (manifest) => {
      manifest.artifacts.pages.files = manifest.artifacts.pages.files.filter((file) => file.path !== "index.html");
    }],
    ["SHA inválido", (manifest) => { manifest.artifacts.pages.files[0].sha256 = "abc"; }],
    ["SHA não textual", (manifest) => {
      manifest.artifacts.pages.files[0].sha256 = [manifest.artifacts.pages.files[0].sha256];
    }],
    ["tamanho negativo", (manifest) => { manifest.artifacts.pages.files[0].size = -1; }],
    ["tamanho fracionário", (manifest) => { manifest.artifacts.pages.files[0].size = 1.5; }],
    ["tamanho fora da precisão", (manifest) => { manifest.artifacts.pages.files[0].size = Number.MAX_SAFE_INTEGER + 1; }],
    ["ordem divergente", (manifest) => { manifest.artifacts.pages.files.reverse(); }],
    ["arquivo duplicado", (manifest) => { manifest.artifacts.pages.files.splice(1, 0, manifest.artifacts.pages.files[0]); }],
    ...["../fora.js", "/fora.js", "a/../fora.js", "a/./b.js", "a//b.js", "a/", "a\\b.js", "a?b.js", "a#b.js", "%2e%2e/fora.js", "https://example.test/a", "a\0b.js"]
      .map((unsafePath) => [`caminho ${JSON.stringify(unsafePath)}`, (manifest) => {
        manifest.artifacts.pages.files[0].path = unsafePath;
      }])
  ];
  for (const [name, invalidate] of invalidManifests) {
    await context.test(name, async () => {
      const site = createPublishedSiteFetch();
      const modified = invalidate(site.candidateManifest);
      await assert.rejects(() => verifyPublishedSite({
        siteUrl: BASE_URL,
        fetchImpl: site.fetchImpl,
        candidateManifest: modified === null ? null : site.candidateManifest
      }), /manifesto da candidata/u);
      assert.equal(site.calls.length, 0);
    });
  }
});

test("recusa bytes publicados divergentes mesmo quando a versão permanece igual", async (context) => {
  const cases = [
    ["binário de mesmo tamanho", "/AraLearn/assets/brand/aralearn-mark.png", Buffer.from([137, 80, 78, 71, 254, 255]), "image/png", /SHA-256/u],
    ["binário truncado", "/AraLearn/assets/brand/aralearn-mark.png", Buffer.from([137, 80]), "image/png", /tamanho/u],
    ["texto de mesmo tamanho", "/AraLearn/main.js", "globalThis.aralearnStarted = null;", "application/javascript", /SHA-256/u],
    ["shell raiz divergente", "/AraLearn/", INDEX.replace("pt-BR", "en-US"), "text/html", /SHA-256/u],
    ["shell index divergente", "/AraLearn/index.html", INDEX.replace("pt-BR", "en-US"), "text/html", /SHA-256/u],
    ["configuração divergente", "/AraLearn/runtime-config.js", RUNTIME_CONFIG.replace("public-test-value", "public-next-value"), "text/javascript", /SHA-256/u],
    ["manifesto reserializado", "/AraLearn/asset-manifest.json", JSON.stringify({ version: VERSION, revision: REVISION, assets: ASSETS }, null, 2), "application/json", /tamanho/u],
    ["callback de outra candidata", "/AraLearn/?auth_state=aralearn-publication-check&code=aralearn-publication-check", INDEX.replace("pt-BR", "en-US"), "text/html", /SHA-256/u]
  ];
  for (const [name, pathname, body, type, expectedError] of cases) {
    await context.test(name, async () => {
      const { fetchImpl, candidateManifest } = createPublishedSiteFetch({
        overrides: { [pathname]: { body, type } }
      });
      await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), expectedError);
    });
  }
});

test("candidata exige lista runtime coerente com todos os arquivos aprovados", async (context) => {
  await context.test("runtime anuncia arquivo não aprovado", async () => {
    const { fetchImpl, calls, candidateManifest } = createPublishedSiteFetch({ assets: [...ASSETS, "./nao-aprovado.js"] });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /fora da candidata aprovada/u);
    assert.ok(calls.every(({ url }) => !url.includes("nao-aprovado.js")));
  });
  await context.test("runtime omite arquivo aprovado", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({
      additionalFiles: { "/AraLearn/extra.js": { body: "export {};", type: "text/javascript" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /omite arquivo da candidata aprovada/u);
  });
  await context.test("runtime duplica arquivo aprovado", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({ assets: [...ASSETS, "./main.js"] });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /recursos duplicados/u);
  });
  await context.test("mapa aprovado ausente no host", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({
      additionalFiles: { "/AraLearn/main.js.map": { body: "{}", type: "application/json" } },
      overrides: { "/AraLearn/main.js.map": { status: 404, body: "ausente", type: "text/plain" } }
    });
    await assert.rejects(() => verifyPublishedSite({
      siteUrl: BASE_URL, fetchImpl, candidateManifest, waitImpl: async () => {}
    }), /main\.js\.map.*HTTP 404/u);
  });
});

test("a identidade da candidata preserva as verificações de MIME, CSP e credenciais", async (context) => {
  await context.test("MIME errado apesar dos bytes corretos", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({
      overrides: { "/AraLearn/main.js": { body: "globalThis.aralearnStarted = true;", type: "text/plain" } }
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /usa MIME/u);
  });
  await context.test("CSP ampla nos bytes aprovados", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({ index: INDEX.replace(PROJECT_URL, "https:") });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /ampla/u);
  });
  await context.test("credencial nos bytes aprovados", async () => {
    const { fetchImpl, candidateManifest } = createPublishedSiteFetch({
      runtimeConfig: RUNTIME_CONFIG.replace("sb_publishable_public-test-value", "sb_secret_invalid-public-artifact")
    });
    await assert.rejects(() => verifyPublishedSite({ siteUrl: BASE_URL, fetchImpl, candidateManifest }), /chave administrativa/u);
  });
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
  assert.deepEqual(parseCommandLine(["--url", BASE_URL, "--candidate-manifest", "candidate.json", "--json"], {}), {
    siteUrl: BASE_URL,
    candidateManifestPath: "candidate.json",
    json: true
  });
  assert.throws(() => parseCommandLine(["--url", BASE_URL, "--candidate-manifest"], {}), /caminho do manifesto/u);
  assert.throws(() => parseCommandLine(["--url", BASE_URL, "--candidate-manifest", "--json"], {}), /caminho do manifesto/u);
});
