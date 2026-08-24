import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";

const ORIGIN = "https://chatgpt.com";
const BASE_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/";
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";

function createHandler(overrides = {}) {
  return createAuthoringActionHandler({
    adapter: {
      async resolveActionPrincipal(accessTokenHash) {
        assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
        return {
          actorId: ACTOR_ID,
          authenticationKind: "action",
          scopes: ["authoring:read", "authoring:write"]
        };
      },
      async listCourses() {
        return {
          contract: "aralearn.course-list.v1",
          items: [{
            courseId: ACTOR_ID,
            title: "Curso corrente",
            goal: "Objetivo",
            revision: 3,
            updatedAt: "2026-08-24T12:00:00Z",
            deepLink: "https://app.example/#/authoring"
          }],
          hasMore: false,
          nextCursor: null
        };
      },
      ...overrides
    },
    allowedOrigins: new Set([ORIGIN, "https://app.example"]),
    actionBaseUrl: BASE_URL,
    publicAppUrl: APP_URL
  });
}

function request(path, body = {}, headers = {}) {
  return new Request(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer action-token",
      "Content-Type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test("Actions lista Cursos pelo canal HTTP e pelo principal opaco próprio", async () => {
  let resolved = 0;
  const response = await createHandler({
    async resolveActionPrincipal(hash) {
      resolved += 1;
      assert.match(hash, /^[0-9a-f]{64}$/u);
      return {
        actorId: ACTOR_ID,
        authenticationKind: "action",
        scopes: ["authoring:read", "authoring:write"]
      };
    }
  })(request("listarCursos"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.data.items[0].title, "Curso corrente");
  assert.equal(resolved, 1);
});

test("Actions não aceita o bearer sem passar pelo resolvedor específico", async () => {
  const response = await createHandler()(new Request(`${BASE_URL}/listarCursos`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{}"
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
  assert.equal((await response.json()).error.code, "authentication_required");
});

test("Actions limita origem, rota e corpo sem abrir transporte genérico", async () => {
  const forbiddenOrigin = await createHandler()(request(
    "listarCursos",
    {},
    { Origin: "https://untrusted.example" }
  ));
  assert.equal(forbiddenOrigin.status, 403);

  const unknown = await createHandler()(request("operarQualquerCoisa"));
  assert.equal(unknown.status, 404);

  const oversized = await createHandler()(request("listarCursos", {
    query: "x".repeat(97 * 1024)
  }));
  assert.equal(oversized.status, 413);
});

test("Actions preserva as cinco operações correntes e rejeita Workspace", async () => {
  const openApi = JSON.parse(await readFile(
    new URL(
      "../../docs/downloads/authoring/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    ),
    "utf8"
  ));
  assert.equal(openApi.openapi, "3.1.0");
  assert.deepEqual(Object.keys(openApi.paths), [
    "/listarCursos",
    "/lerCurso",
    "/criarCurso",
    "/alterarCurso",
    "/consultarComponentesDidaticos"
  ]);
  assert.equal(JSON.stringify(openApi).includes("Workspace"), false);
  const oauth = openApi.components.securitySchemes.AraLearnOAuth;
  assert.match(oauth.flows.authorizationCode.authorizationUrl, /authoring-action\/oauth\/authorize$/u);
  assert.doesNotMatch(oauth.flows.authorizationCode.authorizationUrl, /authoring-mcp/u);
});

test("OAuth de Actions cadastra credencial confidencial sem expor seu hash", async () => {
  let registration = null;
  const response = await createHandler({
    async resolveApplicationUser() {
      return { id: ACTOR_ID };
    },
    async createActionOAuthClientSetup(value) {
      registration = value;
      return { clientId: "40000000-0000-4000-8000-000000000004" };
    }
  })(request("oauth/clients/register", {}));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.match(payload.client_secret, /^ars_[A-Za-z0-9_-]{40,}$/u);
  assert.match(registration.clientSecretHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(payload.client_secret, registration.clientSecretHash);
  assert.equal(payload.token_endpoint_auth_method, "client_secret_post");
});

test("OpenAPI de Actions permanece derivado do catálogo corrente e compacto", async () => {
  const file = await readFile(
    new URL(
      "../../docs/downloads/authoring/aralearn-chatgpt-action-openapi.yaml",
      import.meta.url
    )
  );
  assert.ok(file.byteLength < 96 * 1024);
});
