import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import {
  prepareCourseDocument
} from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import {
  AuthoringApiError
} from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  materializePrivateDocumentStep
} from "../../supabase/functions/_shared/aralearn-authoring/privatePublisher.js";
import {
  validateCreatePrivateIntegrationPayload,
  validateCreateRunPayload,
  validateRotatePrivateIntegrationPayload
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  createAuthoringHandler
} from "../../supabase/functions/_shared/aralearn-authoring/router.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const fixtureUrl = new URL("../fixtures/v3/project-minimal.json", import.meta.url);
const generalOpenApiUrl = new URL(
  "../../docs/openapi/aralearn-authoring-api.yaml",
  import.meta.url
);
const chatGptOpenApiUrls = {
  private: new URL(
    "../../docs/openapi/aralearn-authoring-api-chatgpt-private.yaml",
    import.meta.url
  ),
  editorial: new URL(
    "../../docs/openapi/aralearn-authoring-api-chatgpt-editorial.yaml",
    import.meta.url
  )
};

async function fixture() {
  return JSON.parse(await fs.readFile(fixtureUrl, "utf8"));
}

function operations(document, pathPrefix = "") {
  const result = new Map();
  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    const normalizedPath = pathPrefix && path.startsWith(pathPrefix)
      ? path.slice(pathPrefix.length)
      : path;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]) {
        result.set(`${method.toUpperCase()} ${normalizedPath}`, pathItem[method]);
      }
    }
  }
  return result;
}

test("protocolo aceita criação privada sem coleção e rejeita atualização privada", () => {
  const payload = validateCreateRunPayload({
    requestId: "private-create-0001",
    target: "private",
    title: "Curso pessoal",
    contractKey: "curso-pessoal",
    brief: {},
    publicationIntent: { mode: "create" }
  });
  assert.equal(payload.target, "private");
  assert.equal(payload.collectionId, null);
  assert.throws(() => validateCreateRunPayload({
    ...payload,
    requestId: "private-update-0001",
    publicationIntent: {
      mode: "update",
      existingCourseId: "11111111-1111-4111-8111-111111111111",
      expectedContentHash: "a".repeat(64)
    }
  }), /deve usar a intenção create/);
  assert.throws(() => validateCreateRunPayload({
    ...payload,
    requestId: "private-collection-0001",
    collectionId: "11111111-1111-4111-8111-111111111111"
  }), /não pertencem ao catálogo/);
});

test("Actions pessoais e editoriais expõem somente a autoria permitida", async () => {
  const [general, privateAction, editorialAction] = await Promise.all([
    fs.readFile(generalOpenApiUrl, "utf8").then(parseYaml),
    fs.readFile(chatGptOpenApiUrls.private, "utf8").then(parseYaml),
    fs.readFile(chatGptOpenApiUrls.editorial, "utf8").then(parseYaml)
  ]);
  const generalOperations = operations(general);
  const managementOperations = [
    "GET /v1/integrations",
    "POST /v1/integrations",
    "POST /v1/integrations/{clientId}/rotate",
    "DELETE /v1/integrations/{clientId}"
  ];
  const catalogAdministrationOperations = [
    "GET /v1/catalog/collections",
    "POST /v1/catalog/collections",
    "PUT /v1/catalog/collections/order",
    "PATCH /v1/catalog/collections/{collectionId}",
    "POST /v1/catalog/collections/{collectionId}/retire",
    "GET /v1/catalog/collections/{collectionId}/courses",
    "PUT /v1/catalog/collections/{collectionId}/courses/order",
    "GET /v1/catalog/courses/{courseId}",
    "GET /v1/catalog/courses/{courseId}/structure",
    "PATCH /v1/catalog/courses/{courseId}",
    "PUT /v1/catalog/courses/{courseId}/placement"
  ];
  const personalLibraryOperations = [
    "GET /v1/library/courses",
    "PATCH /v1/library/courses/{courseId}",
    "GET /v1/library/courses/{courseId}/structure",
    "GET /v1/library/paths",
    "POST /v1/library/paths",
    "PATCH /v1/library/paths/{pathId}",
    "DELETE /v1/library/paths/{pathId}",
    "PUT /v1/library/selections/{selectionId}/path"
  ];
  const revisionActionOperationIds = new Map(
    ["catalog", "library"].flatMap((target) => [
      [`POST /v1/${target}/revisions`, "abrirCorrecaoPontual"],
      [
        `GET /v1/${target}/revisions/{revisionId}`,
        "consultarEstadoDaCorrecaoPontual"
      ],
      [
        `GET /v1/${target}/revisions/{revisionId}/fragment`,
        "consultarFragmentoDaCorrecaoPontual"
      ],
      [
        `PUT /v1/${target}/revisions/{revisionId}/patch`,
        "gravarCorrecaoPontual"
      ],
      [
        `POST /v1/${target}/revisions/{revisionId}/apply`,
        "aplicarCorrecaoPontual"
      ]
    ])
  );
  const revisionOperations = [...revisionActionOperationIds.keys()];
  const commonActionOperations = [...generalOperations.entries()]
    .filter(([operation]) => !managementOperations.includes(operation))
    .filter(([operation]) => !catalogAdministrationOperations.includes(operation))
    .filter(([operation]) => !personalLibraryOperations.includes(operation))
    .filter(([operation]) => !revisionOperations.includes(operation))
    .filter(([operation]) => operation !== "POST /v1/imports");
  for (const [profile, document] of Object.entries({
    private: privateAction,
    editorial: editorialAction
  })) {
    const actionOperations = operations(document, "/functions/v1/aralearn-authoring-api");
    for (const operation of managementOperations) {
      assert.equal(generalOperations.has(operation), true, `${operation} ausente do OpenAPI geral.`);
      assert.deepEqual(generalOperations.get(operation).security, [{ SupabaseBearer: [] }]);
      assert.equal(actionOperations.has(operation), false, `${operation} vazou para a Action ${profile}.`);
    }
    for (const operation of catalogAdministrationOperations) {
      assert.equal(generalOperations.has(operation), true, `${operation} ausente do OpenAPI geral.`);
      assert.equal(
        actionOperations.has(operation),
        profile === "editorial",
        `${operation} tem exposição incorreta no perfil ${profile}.`
      );
    }
    for (const operation of personalLibraryOperations) {
      assert.equal(generalOperations.has(operation), true, `${operation} ausente do OpenAPI geral.`);
      assert.equal(
        actionOperations.has(operation),
        profile === "private",
        `${operation} tem exposição incorreta no perfil ${profile}.`
      );
    }
    const revisionTarget = profile === "editorial" ? "catalog" : "library";
    const profileRevisionOperations = revisionOperations.filter(
      (operation) => operation.includes(`/v1/${revisionTarget}/revisions`)
    );
    for (const operation of revisionOperations) {
      assert.equal(
        generalOperations.has(operation),
        true,
        `${operation} ausente do OpenAPI geral.`
      );
      assert.equal(
        actionOperations.has(operation),
        profileRevisionOperations.includes(operation),
        `${operation} tem exposição incorreta no perfil ${profile}.`
      );
    }
    const expectedActionOperationDefinitions = new Map([
      ...commonActionOperations,
      ...(profile === "editorial"
        ? catalogAdministrationOperations
        : personalLibraryOperations
      ).map((operation) => [operation, generalOperations.get(operation)]),
      ...profileRevisionOperations.map(
        (operation) => [operation, generalOperations.get(operation)]
      )
    ]);
    const expectedActionOperations = [
      ...expectedActionOperationDefinitions.keys()
    ].sort();
    assert.deepEqual([...actionOperations.keys()].sort(), expectedActionOperations);
    for (const operation of expectedActionOperations) {
      const expectedOperationId = revisionActionOperationIds.get(operation)
        || (
          profile === "private"
          && operation === "POST /v1/runs/{runId}/publish"
          ? "concluirCursoPessoal"
          : expectedActionOperationDefinitions.get(operation).operationId
        );
      assert.equal(
        actionOperations.get(operation).operationId,
        expectedOperationId,
        `operationId divergente no perfil ${profile} em ${operation}.`
      );
    }
  }
});

test("UUIDs privados são estáveis na execução e distintos entre autores independentes", async () => {
  const document = await fixture();
  const first = await prepareCourseDocument(document, {
    requireReady: true,
    identityNamespace: "run-a"
  });
  const repeated = await prepareCourseDocument(document, {
    requireReady: true,
    identityNamespace: "run-a"
  });
  const independent = await prepareCourseDocument(document, {
    requireReady: true,
    identityNamespace: "run-b"
  });
  assert.deepEqual(first.rows, repeated.rows);
  assert.notEqual(first.rows.courses[0].id, independent.rows.courses[0].id);
  assert.equal(first.contentHash, independent.contentHash);
});

test("materialização privada usa apenas staging privado e leva identidade em todos os lotes", async () => {
  const calls = [];
  const result = await materializePrivateDocumentStep(await fixture(), {
    runId: "11111111-1111-4111-8111-111111111111",
    actorId: "22222222-2222-4222-8222-222222222222",
    clientId: "33333333-3333-4333-8333-333333333333",
    maxOperations: 100,
    deferFinalize: true,
    rpc: async (functionName, payload) => {
      calls.push({ functionName, payload });
      return { status: functionName.includes("begin") ? "staging" : "applied" };
    }
  });
  assert.equal(result.status, "finalizing");
  assert.equal(
    result.finalizeOperation.functionName,
    "finalize_authoring_private_course_import"
  );
  assert.ok(calls.length > 1);
  assert.ok(calls.every(({ functionName }) => functionName.includes("authoring_private")));
  assert.ok(calls.every(({ payload }) =>
    payload.p_run_id === "11111111-1111-4111-8111-111111111111"
    && payload.p_actor_id === "22222222-2222-4222-8222-222222222222"
    && payload.p_client_id === "33333333-3333-4333-8333-333333333333"
  ));
});

test("chave privada cria execução privada, mas não inicia autoria de catálogo", async () => {
  let commandCount = 0;
  const adapter = {
    receiptSecret: "private-authoring-test-secret-32-bytes",
    async resolvePrincipal() {
      return {
        actorId: "private-user",
        clientId: "private-client",
        authenticationKind: "api_key",
        scopes: [
          "authoring:private:read",
          "authoring:private:write",
          "authoring:private:audit"
        ]
      };
    },
    async command({ payload }) {
      commandCount += 1;
      return { status: "planning", publicationTarget: payload.publicationTarget };
    }
  };
  const handler = createAuthoringHandler({
    adapter,
    allowedOrigins: new Set(["https://example.test"])
  });
  const request = (target, requestId) => new Request("https://api.test/v1/runs", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "X-AraLearn-API-Key": `arl_${"P".repeat(24)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": requestId
    },
    body: JSON.stringify({
      requestId,
      target,
      title: "Curso",
      contractKey: `curso-${target}`,
      brief: {},
      publicationIntent: { mode: "create" }
    })
  });
  const privateResponse = await handler(request("private", "private-route-0001"));
  assert.equal(privateResponse.status, 200);
  assert.equal(commandCount, 1);
  const catalogResponse = await handler(request("catalog", "catalog-route-0001"));
  assert.equal(catalogResponse.status, 403);
  assert.equal(commandCount, 1);
});

test("router autoriza a família da execução antes de validar operações existentes", async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  const partKey = "parte-1";
  const operations = [
    ["PUT", `/v1/runs/${runId}/plan`],
    ["PUT", `/v1/runs/${runId}/ledger/sources/0`],
    ["POST", `/v1/runs/${runId}/plan/finalize`],
    ["PUT", `/v1/runs/${runId}/parts/${partKey}/specification`],
    ["PUT", `/v1/runs/${runId}/parts/${partKey}`],
    ["POST", `/v1/runs/${runId}/parts/${partKey}/audit`],
    ["POST", `/v1/runs/${runId}/parts/${partKey}/reopen`],
    ["POST", `/v1/runs/${runId}/validate`],
    ["POST", `/v1/runs/${runId}/publish`],
    ["POST", `/v1/runs/${runId}/block`],
    ["POST", `/v1/runs/${runId}/resume`],
    ["POST", `/v1/runs/${runId}/cancel`]
  ];
  for (const testCase of [
    {
      name: "credencial pessoal em execução editorial",
      target: "catalog",
      scopes: [
        "authoring:private:read",
        "authoring:private:write",
        "authoring:private:audit"
      ]
    },
    {
      name: "credencial editorial em execução pessoal",
      target: "private",
      scopes: [
        "authoring:read",
        "authoring:write",
        "authoring:audit",
        "catalog:publish"
      ]
    }
  ]) {
    let authorizationReads = 0;
    let replays = 0;
    const handler = createAuthoringHandler({
      allowedOrigins: new Set(["https://example.test"]),
      adapter: {
        async resolvePrincipal() {
          return {
            actorId: "actor-scope-matrix",
            clientId: "client-scope-matrix",
            authenticationKind: "api_key",
            scopes: testCase.scopes
          };
        },
        async getRunAuthorizationSummary() {
          authorizationReads += 1;
          return {
            runId,
            publicationTarget: testCase.target,
            contractKey: "curso-teste"
          };
        },
        async replayCommand() {
          replays += 1;
          throw new Error("A autorização do alvo deve preceder o replay.");
        }
      }
    });
    for (const [method, path] of operations) {
      const response = await handler(new Request(`https://api.test${path}`, {
        method,
        headers: {
          Origin: "https://example.test",
          "X-AraLearn-API-Key": `arl_${"S".repeat(32)}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          campoInvalido: "não deve ser interpretado antes da autorização"
        })
      }));
      const body = await response.json();
      assert.equal(response.status, 403, `${testCase.name}: ${method} ${path}`);
      assert.equal(body.error.code, "insufficient_scope", `${testCase.name}: ${method} ${path}`);
      assert.equal(
        Object.hasOwn(body.error, "details"),
        false,
        `${testCase.name}: ${method} ${path}`
      );
    }
    assert.equal(authorizationReads, operations.length, testCase.name);
    assert.equal(replays, 0, testCase.name);
  }
});

test("autorização precoce preserva replay depois da limpeza da execução", async () => {
  const runId = "11111111-1111-4111-8111-111111111111";
  let replayCalls = 0;
  let commandCalls = 0;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      async resolvePrincipal() {
        return {
          actorId: "private-user",
          clientId: "private-client",
          authenticationKind: "api_key",
          scopes: ["authoring:private:write"]
        };
      },
      async getRunAuthorizationSummary() {
        throw new AuthoringApiError(404, "run_not_found", "Execução já removida.");
      },
      async replayCommand(options) {
        replayCalls += 1;
        assert.equal(options.requiredScope, "authoring:write");
        return {
          runId,
          status: "cancelled",
          idempotent: true
        };
      },
      async command() {
        commandCalls += 1;
        throw new Error("O replay retido não pode repetir o comando.");
      }
    }
  });
  const response = await handler(new Request(
    `https://api.test/v1/runs/${runId}/cancel`,
    {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "X-AraLearn-API-Key": `arl_${"R".repeat(32)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "retained-replay-cancel"
      },
      body: JSON.stringify({
        requestId: "retained-replay-cancel",
        reason: "Cancelamento já confirmado."
      })
    }
  ));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.idempotent, true);
  assert.equal(body.data.status, "cancelled");

  const planResponse = await handler(new Request(
    `https://api.test/v1/runs/${runId}/plan`,
    {
      method: "PUT",
      headers: {
        Origin: "https://example.test",
        "X-AraLearn-API-Key": `arl_${"R".repeat(32)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "retained-replay-plan"
      },
      body: JSON.stringify({ requestId: "retained-replay-plan" })
    }
  ));
  const planBody = await planResponse.json();
  assert.equal(planResponse.status, 200);
  assert.equal(planBody.data.idempotent, true);
  assert.equal(replayCalls, 2);
  assert.equal(commandCalls, 0);
});

test("sessão comum não importa para o catálogo mesmo com o escopo de leitura do arquivo", async () => {
  let imports = 0;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      receiptSecret: "private-import-test-secret-with-32-bytes",
      async resolvePrincipal() {
        return {
          actorId: "11111111-1111-4111-8111-111111111111",
          clientId: null,
          authenticationKind: "jwt",
          scopes: [
            "course:import",
            "authoring:private:read",
            "authoring:private:write",
            "authoring:private:audit"
          ]
        };
      },
      async importDocument() {
        imports += 1;
        return { status: "validated" };
      }
    }
  });
  const response = await handler(new Request("https://api.test/v1/imports", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      Authorization: "Bearer session",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({})
  }));
  assert.equal(response.status, 403);
  assert.equal(imports, 0);
  assert.equal((await response.json()).error.code, "insufficient_scope");
});

test("adaptador usa somente os RPCs alvo-aware para comando e replay", async () => {
  const urls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const principal = {
    actorId: "11111111-1111-4111-8111-111111111111",
    clientId: null,
    scopes: ["authoring:private:read", "authoring:private:write"]
  };
  await adapter.command({
    principal,
    runId: "22222222-2222-4222-8222-222222222222",
    requestId: "private-command-0001",
    command: "set_plan",
    payload: {}
  });
  const authorizationSummary = await adapter.getRunAuthorizationSummary({
    principal,
    runId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(authorizationSummary.status, "ok");
  adapter.getRunSummary = async () => ({ publicationTarget: "private" });
  await adapter.getPartSubmission({
    principal,
    runId: "22222222-2222-4222-8222-222222222222",
    partKey: "parte-1"
  });
  await adapter.replayCommand({
    principal,
    requestId: "private-command-0001",
    apiRequestHash: "a".repeat(64),
    requiredScope: "authoring:write"
  });
  assert.match(urls[0], /\/rpc\/dispatch_authoring_command_v2$/);
  assert.match(urls[1], /\/rpc\/get_authoring_run_summary$/);
  assert.match(urls[2], /\/rpc\/get_authoring_part_submission_v2$/);
  assert.match(urls[3], /\/rpc\/replay_authoring_command_dispatch$/);
});

test("adaptador preserva o destino privado ao carregar a próxima parte", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "server-secret",
    publishableKey: "public-key",
    attempts: 1,
    fetchImpl: async (url) => {
      calls.push(String(url));
      const target = String(url).endsWith("/get_authoring_run")
        ? { publicationTarget: "private" }
        : { runId: "22222222-2222-4222-8222-222222222222", status: "building", nextPart: null };
      return new Response(JSON.stringify(target), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const result = await adapter.getNextPart({
    principal: {
      actorId: "11111111-1111-4111-8111-111111111111",
      clientId: "33333333-3333-4333-8333-333333333333",
      scopes: ["authoring:private:read"]
    },
    runId: "22222222-2222-4222-8222-222222222222"
  });
  assert.equal(result.publicationTarget, "private");
  assert.match(calls[0], /\/rpc\/get_authoring_run$/);
  assert.match(calls[1], /\/rpc\/get_next_authoring_part$/);
});

test("protocolo de integrações limita nome, validade e campos aceitos", () => {
  assert.deepEqual(validateCreatePrivateIntegrationPayload({
    requestId: "integration-create-0001",
    name: "Meu agente",
    expiresInDays: 120
  }), {
    requestId: "integration-create-0001",
    name: "Meu agente",
    expiresInDays: 120
  });
  assert.deepEqual(validateRotatePrivateIntegrationPayload({
    requestId: "integration-rotate-0001"
  }), {
    requestId: "integration-rotate-0001",
    expiresInDays: 90
  });
  assert.throws(() => validateCreatePrivateIntegrationPayload({
    requestId: "integration-create-0002",
    name: "Agente",
    scopes: ["catalog:publish"]
  }), /Campo desconhecido: scopes/);
  assert.throws(() => validateRotatePrivateIntegrationPayload({
    requestId: "integration-rotate-0002",
    expiresInDays: 366
  }), /entre 1 e 365/);
});

test("somente a sessão autenticada gerencia integrações pessoais", async () => {
  const calls = [];
  let authenticationKind = "api_key";
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      receiptSecret: "private-integration-handler-secret-32-bytes",
      async resolvePrincipal() {
        return {
          actorId: "11111111-1111-4111-8111-111111111111",
          clientId: authenticationKind === "api_key" ? "client" : null,
          authenticationKind,
          scopes: [
            "authoring:private:read",
            "authoring:private:write",
            "authoring:private:audit"
          ]
        };
      },
      async createPrivateIntegration(options) {
        calls.push(["create", options]);
        return { clientId: "22222222-2222-4222-8222-222222222222", apiKey: "arl_once" };
      },
      async listPrivateIntegrations(options) {
        calls.push(["list", options]);
        return { items: [], activeCount: 0, activeLimit: 5 };
      },
      async rotatePrivateIntegration(options) {
        calls.push(["rotate", options]);
        return { clientId: "33333333-3333-4333-8333-333333333333", apiKey: "arl_rotated" };
      },
      async revokePrivateIntegration(options) {
        calls.push(["revoke", options]);
        return { clientId: options.clientId, active: false };
      }
    }
  });
  const createRequest = () => {
    const headers = {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      "Idempotency-Key": "integration-create-0003"
    };
    if (authenticationKind === "jwt") headers.Authorization = "Bearer session";
    else headers["X-AraLearn-API-Key"] = `arl_${"I".repeat(24)}`;
    return new Request("https://api.test/v1/integrations", {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: "integration-create-0003",
        name: "Agente externo",
        expiresInDays: 90
      })
    });
  };
  const forbidden = await handler(createRequest());
  assert.equal(forbidden.status, 403);
  assert.equal(calls.length, 0);

  authenticationKind = "jwt";
  const created = await handler(createRequest());
  assert.equal(created.status, 200);
  assert.equal(calls[0][0], "create");
  const listed = await handler(new Request("https://api.test/v1/integrations", {
    headers: { Origin: "https://example.test", Authorization: "Bearer session" }
  }));
  assert.equal(listed.status, 200);
  const rotated = await handler(new Request(
    "https://api.test/v1/integrations/22222222-2222-4222-8222-222222222222/rotate",
    {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        Authorization: "Bearer session",
        "Content-Type": "application/json",
        "Idempotency-Key": "integration-rotate-0003"
      },
      body: JSON.stringify({ requestId: "integration-rotate-0003", expiresInDays: 180 })
    }
  ));
  assert.equal(rotated.status, 200);
  const revoked = await handler(new Request(
    "https://api.test/v1/integrations/33333333-3333-4333-8333-333333333333",
    {
      method: "DELETE",
      headers: { Origin: "https://example.test", Authorization: "Bearer session" }
    }
  ));
  assert.equal(revoked.status, 200);
  assert.deepEqual(calls.map(([operation]) => operation), ["create", "list", "rotate", "revoke"]);
});

test("adaptador expõe a chave pessoal somente na primeira resposta e persiste apenas hash", async () => {
  const calls = [];
  let idempotent = false;
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "server-api-key-with-at-least-32-bytes",
    publishableKey: "public-key",
    integrationKeySecret: "dedicated-integration-secret-with-32-bytes",
    attempts: 1,
    fetchImpl: async (url, init) => {
      const functionName = String(url).split("/").at(-1);
      const payload = JSON.parse(init.body);
      calls.push({ functionName, payload });
      if (functionName === "create_private_authoring_integration") {
        return new Response(JSON.stringify({
          clientId: "22222222-2222-4222-8222-222222222222",
          keyPrefix: payload.p_key_prefix,
          scopes: [
            "authoring:private:audit",
            "authoring:private:read",
            "authoring:private:write"
          ],
          idempotent
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ items: [], activeLimit: 5 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const principal = {
    actorId: "11111111-1111-4111-8111-111111111111",
    clientId: null,
    authenticationKind: "jwt",
    scopes: ["authoring:private:write"]
  };
  const first = await adapter.createPrivateIntegration({
    principal,
    requestId: "integration-adapter-0001",
    name: "Agente",
    expiresInDays: 90
  });
  assert.match(first.apiKey, /^arl_[A-Za-z0-9_-]{43}$/);
  assert.equal(first.secretAvailable, true);
  assert.equal(calls[0].payload.p_api_key_hash.length, 64);
  assert.equal(calls[0].payload.p_api_key_hash.includes(first.apiKey), false);
  assert.equal(JSON.stringify(calls[0].payload).includes(first.apiKey), false);

  idempotent = true;
  const repeated = await adapter.createPrivateIntegration({
    principal,
    requestId: "integration-adapter-0001",
    name: "Agente",
    expiresInDays: 90
  });
  assert.equal(Object.hasOwn(repeated, "apiKey"), false);
  assert.equal(repeated.secretAvailable, false);
  const listed = await adapter.listPrivateIntegrations({ principal });
  assert.deepEqual(listed, { items: [], activeLimit: 5 });
});
