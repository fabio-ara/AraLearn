import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";
import {
  AuthoringApiError
} from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  buildMicrotheoryReview,
  buildWorkspaceOutline
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";

const ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/aralearn/";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION_ID = "22222222-2222-4222-8222-222222222222";
const ACTION_RESPONSE_LIMIT = 96 * 1024;

function principal() {
  return {
    actorId: "33333333-3333-4333-8333-333333333333",
    oauthClientId: "chatbot-client",
    authenticationKind: "oauth",
    scopes: ["authoring:private:read", "authoring:private:write"]
  };
}

function adapter(overrides = {}) {
  return {
    async resolveActionPrincipal(accessTokenHash) {
      assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
      return principal();
    },
    ...overrides
  };
}

function handler(adapterValue = adapter()) {
  return createAuthoringActionHandler({
    adapter: adapterValue,
    allowedOrigins: new Set([ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: APP_URL
  });
}

function request(name, body = {}, { authenticated = true, origin = ORIGIN } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Origin: origin
  };
  if (authenticated) headers.Authorization = "Bearer oauth-token";
  return new Request(`${ACTION_URL}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

async function catalogProject(fileName) {
  return JSON.parse(await readFile(
    new URL(`../../supabase/fixtures/catalog/${fileName}`, import.meta.url),
    "utf8"
  ));
}

function workspaceRead(project, view, entityPath) {
  return {
    workspaceId: WORKSPACE_ID,
    title: project.courses[0].title,
    revision: 1,
    currentRevision: 1,
    entityCount: flattenWorkspaceDocument(project).length,
    sourceCourseId: null,
    sourceRevisionHash: null,
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    idempotent: false,
    brief: "",
    view,
    content: view === "microtheories"
      ? buildMicrotheoryReview(project, entityPath)
      : buildWorkspaceOutline(project)
  };
}

test("Action exige OAuth e uma origem autorizada quando Origin está presente", async () => {
  const unauthenticated = await handler()(request(
    "prepararAutoriaAraLearn",
    { intent: "inspect" },
    { authenticated: false }
  ));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("www-authenticate"), "Bearer");
  const unauthenticatedPayload = await unauthenticated.json();
  assert.equal(unauthenticatedPayload.error.code, "authentication_required");
  assert.equal(unauthenticatedPayload.error.recovery.strategy, "reconnect");
  assert.equal(unauthenticatedPayload.error.recovery.retryable, true);

  const foreign = await handler()(request(
    "prepararAutoriaAraLearn",
    { intent: "inspect" },
    { origin: "https://malicious.example" }
  ));
  assert.equal(foreign.status, 403);
  const foreignPayload = await foreign.json();
  assert.equal(foreignPayload.error.code, "origin_not_allowed");
  assert.equal(foreignPayload.error.recovery.strategy, "stop");
  assert.equal(foreignPayload.error.recovery.retryable, false);
});

test("sessão do aplicativo usa somente a autoria contextual permitida", async () => {
  let resolvedToken = null;
  let received = null;
  let receivedMutation = null;
  let receivedDeletion = null;
  const appHandler = handler(adapter({
    async resolveApplicationPrincipal(token) {
      resolvedToken = token;
      return {
        ...principal(),
        authenticationKind: "application"
      };
    },
    async createWorkspace(options) {
      received = options;
      return {
        workspaceId: WORKSPACE_ID,
        title: options.title,
        revision: 1,
        currentRevision: 1,
        entityCount: 1,
        createdAt: "2026-08-02T12:00:00.000Z",
        updatedAt: "2026-08-02T12:00:00.000Z",
        idempotent: false
      };
    },
    async mutateWorkspace(options) {
      receivedMutation = options;
      return {
        workspaceId: WORKSPACE_ID,
        title: "Reparo contextual",
        revision: 2,
        currentRevision: 2,
        entityCount: 0,
        createdAt: "2026-08-02T12:00:00.000Z",
        updatedAt: "2026-08-02T12:01:00.000Z",
        idempotent: false
      };
    },
    async deleteWorkspace(options) {
      receivedDeletion = options;
      return {
        workspaceId: WORKSPACE_ID,
        deleted: true,
        idempotent: false
      };
    }
  }));
  const created = await appHandler(new Request(`${ACTION_URL}/app/criarWorkspaceDeAutoria`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({
      requestId: "app-contextual-workspace-0001",
      title: "Reparo contextual",
      sourceCourseId: "44444444-4444-4444-8444-444444444444"
    })
  }));
  assert.equal(created.status, 200);
  assert.equal((await created.json()).data.revision, 1);
  assert.equal(resolvedToken, "app-session");
  assert.equal(received.principal.authenticationKind, "application");

  const removed = await appHandler(new Request(`${ACTION_URL}/app/excluirDoWorkspace`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({
      operation: "delete_entity",
      requestId: "app-contextual-delete-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      entityType: "microsequence",
      entityPath: ["course", "module", "lesson", "microsequence"]
    })
  }));
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).data.revision, 2);
  assert.equal(receivedMutation.operation, "delete_entity");
  assert.deepEqual(receivedMutation.arguments.entityPath, [
    "course", "module", "lesson", "microsequence"
  ]);
  assert.equal(receivedMutation.principal.authenticationKind, "application");

  const deleted = await appHandler(new Request(`${ACTION_URL}/app/excluirDoWorkspace`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({
      operation: "delete_workspace",
      requestId: "app-contextual-workspace-delete-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 2
    })
  }));
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).data.deleted, true);
  assert.equal(receivedDeletion.expectedRevision, 2);
  assert.equal(receivedDeletion.principal.authenticationKind, "application");

  const forbidden = await appHandler(new Request(`${ACTION_URL}/app/editarCatalogo`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({})
  }));
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "insufficient_scope");
});

test("Action orienta correção, releitura e repetição sem ocultar o erro", async () => {
  const invalid = await handler()(request("salvarCardsNaMicrossequencia", {
    requestId: "action-invalid-cards-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    microsequencePath: ["course", "module", "lesson", "microsequence"],
    mode: "replace",
    status: "generated",
    cardsJson: "{não é JSON"
  }));
  const invalidPayload = await invalid.json();
  assert.equal(invalid.status, 422);
  assert.equal(invalidPayload.error.code, "invalid_tool_arguments");
  assert.equal(invalidPayload.error.recovery.strategy, "correct_and_retry");
  assert.equal(invalidPayload.error.recovery.requestIdMode, "new");
  assert.equal(invalidPayload.error.recovery.retryable, true);
  assert.ok(invalidPayload.error.issues.length >= 1);

  const mutation = {
    operation: "rename_entity",
    requestId: "action-recovery-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso revisto"
  };
  const stale = await handler(adapter({
    async mutateWorkspace() {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou.",
        { expectedRevision: 7, currentRevision: 8 }
      );
    }
  }))(request("reorganizarWorkspace", mutation));
  const stalePayload = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(stalePayload.error.recovery.strategy, "reread_and_retry");
  assert.equal(stalePayload.error.recovery.requestIdMode, "new");

  const transient = await handler(adapter({
    async mutateWorkspace() {
      throw new AuthoringApiError(429, "rate_limited", "Tente novamente.");
    }
  }))(request("reorganizarWorkspace", mutation));
  const transientPayload = await transient.json();
  assert.equal(transient.status, 429);
  assert.equal(transientPayload.error.recovery.strategy, "repeat_identical");
  assert.equal(transientPayload.error.recovery.requestIdMode, "same");

  const undeclaredSource = await handler(adapter({
    async mutateWorkspace() {
      throw new AuthoringApiError(
        422,
        "workspace_source_unauthorized",
        "Fonte não declarada.",
        {
          errors: [{
            path: "cards[0].sources[0]",
            message: "A fonte não foi declarada.",
            reason: "source_not_declared",
            rule: "authorized_workspace_source"
          }]
        }
      );
    }
  }))(request("reorganizarWorkspace", mutation));
  const sourcePayload = await undeclaredSource.json();
  assert.equal(sourcePayload.error.recovery.strategy, "declare_source_and_retry");
  assert.equal(sourcePayload.error.recovery.requestIdMode, "new");
  assert.ok(
    sourcePayload.error.recovery.steps.some(
      (step) => step.includes("[source:id]")
    )
  );
});

test("Action recupera conhecimento pelo mesmo contrato da ferramenta MCP", async () => {
  const response = await handler()(request("prepararAutoriaAraLearn", {
    intent: "restructure",
    targetEntity: "module",
    context: "Mover um módulo para outro curso e revisar dependências."
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.requestId, null);
  assert.equal(payload.data.intent, "restructure");
  assert.ok(payload.data.guidance.some(({ id }) => id === "structural-editing"));
});

test("Action atravessa o executor compartilhado e preserva expectedRevision", async () => {
  let received = null;
  const response = await handler(adapter({
    async mutateWorkspace(options) {
      received = options;
      return {
        workspaceId: WORKSPACE_ID,
        revision: 8,
        currentRevision: 8
      };
    }
  }))(request("reorganizarWorkspace", {
    operation: "rename_entity",
    requestId: "action-rename-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso revisto"
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.requestId, "action-rename-0001");
  assert.equal(received.expectedRevision, 7);
  assert.equal(received.operation, "rename_entity");
});

test("Action cria curso e módulo por parts, rejeita kwargs antigos e não pede revision na leitura", async () => {
  const calls = [];
  const fixtureHandler = handler(adapter({
    async mutateWorkspace(options) {
      calls.push(options);
      return {
        workspaceId: WORKSPACE_ID,
        title: "Dataprev: Teste",
        revision: 2,
        currentRevision: 2,
        entityCount: 2,
        createdAt: "2026-07-31T12:00:00.000Z",
        updatedAt: "2026-07-31T12:01:00.000Z",
        idempotent: false
      };
    }
  }));
  const payload = {
    requestId: "action-structure-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    parts: [
      {
        entityType: "course",
        id: "dataprev-teste",
        title: "Dataprev: Teste",
        goal: "Preparar para a prova da FGV."
      },
      {
        entityType: "module",
        parentPath: ["dataprev-teste"],
        id: "computacao-nuvem-virtualizacao",
        title: "Computação em Nuvem e Virtualização",
        goal: "Cobrir integralmente a ementa."
      }
    ]
  };

  const first = await fixtureHandler(request("criarEstruturaNoWorkspace", payload));
  const firstBody = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstBody.data.revision, 2);
  assert.equal(calls[0].expectedRevision, 1);
  assert.equal(calls[0].operation, "create_structure");
  assert.deepEqual(Object.keys(calls[0].arguments), ["parts"]);

  const oldShape = await fixtureHandler(request("criarEstruturaNoWorkspace", {
    ...payload,
    entity: payload.parts[0]
  }));
  const oldShapeBody = await oldShape.json();
  assert.equal(oldShape.status, 422);
  assert.equal(oldShapeBody.error.code, "invalid_tool_arguments");
  assert.equal(oldShapeBody.error.issues[0].path, "arguments.entity");
  assert.doesNotMatch(JSON.stringify(oldShapeBody), /UnrecognizedKwargsError/u);

  const revisionOnRead = await fixtureHandler(request("lerWorkspaceDeAutoria", {
    workspaceId: WORKSPACE_ID,
    revision: 2
  }));
  const revisionOnReadBody = await revisionOnRead.json();
  assert.equal(revisionOnRead.status, 422);
  assert.equal(revisionOnReadBody.error.code, "invalid_tool_arguments");
  assert.equal(revisionOnReadBody.error.issues[0].path, "arguments.revision");
});

test("Action e MCP compartilham a retirada atômica de curso em Trilhas", async () => {
  const selectionId = "44444444-4444-4444-8444-444444444444";
  const courseId = "55555555-5555-4555-8555-555555555555";
  let received = null;
  const response = await handler(adapter({
    async removePersonalLibraryCourse(options) {
      received = options;
      return {
        status: "removed",
        selectionId,
        courseId,
        kind: "personal",
        courseArchived: true,
        idempotent: false
      };
    }
  }))(request("retirarCursoDasTrilhas", {
    requestId: "action-remove-0001",
    selectionId,
    courseId,
    expectedContentHash: "a".repeat(64)
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.requestId, "action-remove-0001");
  assert.equal(payload.data.courseArchived, true);
  assert.equal(received.selectionId, selectionId);
  assert.equal(received.courseId, courseId);
  assert.equal(received.expectedContentHash, "a".repeat(64));
});

test("Action limita payload e não aceita operação fora do registro canônico", async () => {
  const unknown = await handler()(request("executarQualquerCoisa", {}));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, "unknown_action");

  const oversized = await handler()(request("prepararAutoriaAraLearn", {
    intent: "create",
    context: "x".repeat(100_000)
  }));
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "action_payload_too_large");
});

test("Action mantém outlines e revisões por lição das fixtures reais abaixo de 96 KiB", async () => {
  const fixtures = [
    {
      fileName: "dataprev-analista-processamento-seed-course.json",
      reviewPath: [
        "course-dataprev-2026-analista-processamento-seguranca-informacao",
        "module-seguranca-informacao",
        "lesson-seguranca-informacao-04"
      ]
    },
    {
      fileName: "fundamentos-ia-analise-dados-seed-course.json",
      reviewPath: [
        "course-fundamentos-ia-analise-dados",
        "module-aula06-visualizacao-dados",
        "lesson-aula06-graficos-escolha-visual-interpretacao"
      ]
    }
  ];
  for (const { fileName, reviewPath } of fixtures) {
    const project = await catalogProject(fileName);
    const fixtureHandler = handler(adapter({
      async getWorkspace({ view, entityPath }) {
        return workspaceRead(project, view, entityPath);
      }
    }));
    const outlineResponse = await fixtureHandler(request("lerWorkspaceDeAutoria", {
      workspaceId: WORKSPACE_ID,
      view: "outline"
    }));
    const outlineSource = await outlineResponse.text();
    assert.equal(outlineResponse.status, 200, `${fileName}: ${outlineSource}`);
    assert.ok(
      Buffer.byteLength(outlineSource, "utf8") < ACTION_RESPONSE_LIMIT,
      `${fileName}: outline excedeu 96 KiB.`
    );
    const outline = JSON.parse(outlineSource).data.content;
    for (const course of outline.courses) {
      for (const moduleValue of course.modules) {
        for (const lesson of moduleValue.lessons) {
          for (const microsequence of lesson.microsequences) {
            assert.equal(Object.hasOwn(microsequence, "cards"), false);
            assert.equal(Number.isInteger(microsequence.cardCount), true);
          }
        }
      }
    }

    const reviewResponse = await fixtureHandler(request(
      "revisarMicroteoriasDoWorkspace",
      { workspaceId: WORKSPACE_ID, entityPath: reviewPath }
    ));
    const reviewSource = await reviewResponse.text();
    assert.equal(
      reviewResponse.status,
      200,
      `${fileName}:${reviewPath.join("/")}: ${reviewSource}`
    );
    assert.ok(
      Buffer.byteLength(reviewSource, "utf8") < ACTION_RESPONSE_LIMIT,
      `${fileName}:${reviewPath.join("/")} excedeu 96 KiB.`
    );
  }
});

test("cadastro OAuth da Action antecede o salvamento do GPT e devolve o segredo somente na resposta", async () => {
  let registered = null;
  const response = await handler(adapter({
    async resolveApplicationUser(token) {
      assert.equal(token, "app-session");
      return { id: "33333333-3333-4333-8333-333333333333", email: "autor@example.com" };
    },
    async createActionOAuthClientSetup(options) {
      registered = options;
      return { clientId: "44444444-4444-4444-8444-444444444444" };
    }
  }))(new Request(`${ACTION_URL}/oauth/clients/register`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({})
  }));
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.client_id, "44444444-4444-4444-8444-444444444444");
  assert.match(payload.client_secret, /^ars_[A-Za-z0-9_-]+$/u);
  assert.equal(
    payload.authorization_url,
    `${ACTION_URL}/oauth/authorize`
  );
  assert.match(registered.clientSecretHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(registered.clientSecretHash, payload.client_secret);
  assert.equal(registered.creatorUserId, "33333333-3333-4333-8333-333333333333");
  assert.equal(registered.clientName, "AraLearn Chatbot");
  assert.equal("gptId" in registered, false);
  assert.equal("redirectUris" in registered, false);
});

test("vínculo OAuth associa o GPT salvo ao cliente criado pela mesma conta", async () => {
  let linked = null;
  const response = await handler(adapter({
    async resolveApplicationUser(token) {
      assert.equal(token, "app-session");
      return { id: "33333333-3333-4333-8333-333333333333" };
    },
    async linkActionOAuthClient(options) {
      linked = options;
      return { clientId: options.clientId, gptId: options.gptId, linked: true };
    }
  }))(new Request(`${ACTION_URL}/oauth/clients/44444444-4444-4444-8444-444444444444/link`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({ gptId: "g-abcdef123456" })
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    client_id: "44444444-4444-4444-8444-444444444444",
    gpt_id: "g-abcdef123456",
    linked: true
  });
  assert.deepEqual(linked, {
    creatorUserId: "33333333-3333-4333-8333-333333333333",
    clientId: "44444444-4444-4444-8444-444444444444",
    gptId: "g-abcdef123456"
  });
});

test("OAuth da Action cria consentimento, aprova com state e troca código uma única vez", async () => {
  const calls = [];
  const oauthAdapter = adapter({
    async createActionOAuthAuthorization(options) {
      calls.push(["authorize", options]);
      return { authorizationId: AUTHORIZATION_ID };
    },
    async resolveApplicationUser(token) {
      assert.equal(token, "app-session");
      return { id: "33333333-3333-4333-8333-333333333333", email: "autor@example.com" };
    },
    async getActionOAuthAuthorization(options) {
      calls.push(["details", options]);
      return {
        authorization_id: AUTHORIZATION_ID,
        client: { id: "44444444-4444-4444-8444-444444444444", name: "AraLearn Chatbot" },
        user: { id: options.userId, email: "autor@example.com" },
        scope: "openid email"
      };
    },
    async decideActionOAuthAuthorization(options) {
      calls.push(["decide", options]);
      return {
        redirectUri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback",
        state: "state-seguro-123"
      };
    },
    async exchangeActionOAuthCode(options) {
      calls.push(["exchange", options]);
      return { expiresIn: 3600, scope: "openid email" };
    }
  });
  const authorizeUrl = new URL(`${ACTION_URL}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: "44444444-4444-4444-8444-444444444444",
    redirect_uri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback",
    scope: "openid email",
    state: "state-seguro-123"
  });
  const authorize = await handler(oauthAdapter)(new Request(authorizeUrl, {
    headers: { Origin: ORIGIN }
  }));
  assert.equal(authorize.status, 302);
  assert.equal(
    authorize.headers.get("location"),
    `${APP_URL}?action_authorization_id=${AUTHORIZATION_ID}`
  );

  const details = await handler(oauthAdapter)(new Request(
    `${ACTION_URL}/oauth/authorizations/${AUTHORIZATION_ID}`,
    {
      headers: {
        Authorization: "Bearer app-session",
        Origin: ORIGIN
      }
    }
  ));
  assert.equal(details.status, 200);
  assert.equal((await details.json()).authorization_id, AUTHORIZATION_ID);

  const approval = await handler(oauthAdapter)(new Request(
    `${ACTION_URL}/oauth/authorizations/${AUTHORIZATION_ID}`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer app-session",
        "Content-Type": "application/json",
        Origin: ORIGIN
      },
      body: JSON.stringify({ action: "approve" })
    }
  ));
  const approvalPayload = await approval.json();
  const callback = new URL(approvalPayload.redirect_url);
  assert.equal(callback.searchParams.get("state"), "state-seguro-123");
  assert.match(callback.searchParams.get("code"), /^arc_[A-Za-z0-9_-]+$/u);

  const token = await handler(oauthAdapter)(new Request(`${ACTION_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "44444444-4444-4444-8444-444444444444",
      client_secret: "ars_client-secret-value-123456",
      code: callback.searchParams.get("code"),
      redirect_uri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback"
    })
  }));
  const tokenPayload = await token.json();
  assert.equal(token.status, 200);
  assert.match(tokenPayload.access_token, /^ara_[A-Za-z0-9_-]+$/u);
  assert.match(tokenPayload.refresh_token, /^arr_[A-Za-z0-9_-]+$/u);
  assert.equal(tokenPayload.expires_in, 3600);
  assert.ok(calls.some(([name]) => name === "authorize"));
  assert.ok(calls.some(([name]) => name === "details"));
  assert.ok(calls.some(([name]) => name === "decide"));
  assert.ok(calls.some(([name]) => name === "exchange"));
});

test("token endpoint rotaciona o refresh token sem reutilizar o valor recebido", async () => {
  let refreshed = null;
  const response = await handler(adapter({
    async exchangeActionOAuthRefresh(options) {
      refreshed = options;
      return { expiresIn: 3600, scope: "openid email" };
    }
  }))(new Request(`${ACTION_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "44444444-4444-4444-8444-444444444444",
      client_secret: "ars_client-secret-value-123456",
      refresh_token: "arr_previous-refresh-token-value"
    })
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(payload.access_token, /^ara_[A-Za-z0-9_-]+$/u);
  assert.match(payload.refresh_token, /^arr_[A-Za-z0-9_-]+$/u);
  assert.notEqual(payload.refresh_token, "arr_previous-refresh-token-value");
  assert.match(refreshed.refreshTokenHash, /^[0-9a-f]{64}$/u);
  assert.match(refreshed.newRefreshTokenHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(refreshed.refreshTokenHash, refreshed.newRefreshTokenHash);
});
