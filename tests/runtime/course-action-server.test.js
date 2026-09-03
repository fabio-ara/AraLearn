import assert from "node:assert/strict";
import test from "node:test";

import {
  ARALEARN_ACTION_CONTRACT_HEADER,
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  COURSE_HUMAN_TASK_CATALOG_HEADER
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const ORIGIN = "https://chatgpt.com";
const CHAT_OPENAI_ORIGIN = "https://chat.openai.com";
const BASE_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/";
const ACTOR_ID = "10000000-0000-4000-8000-000000000001";

function coursePage(items = [{
  courseId: ACTOR_ID,
  title: "Redes para iniciantes",
  goal: "Explicar serviços em rede.",
  revision: 3,
  updatedAt: "2026-09-02T10:00:00Z",
  deepLink: `${APP_URL}#/authoring/courses/${ACTOR_ID}?section=content`
}]) {
  return { items, hasMore: false, nextCursor: null };
}

function adapterFixture(overrides = {}, scopes = ["authoring:read", "authoring:write"]) {
  return {
    publicAppUrl: APP_URL,
    async resolveActionPrincipal(hash) {
      assert.match(hash, /^[0-9a-f]{64}$/u);
      return { actorId: ACTOR_ID, authenticationKind: "action", scopes };
    },
    async listCourses() {
      return coursePage();
    },
    async getCourse({ courseId }) {
      return {
        courseId,
        title: "Redes para iniciantes",
        revision: 3,
        deepLink: `${APP_URL}#/authoring/courses/${courseId}?section=content`
      };
    },
    async getCourseInstructionalPlan() {
      return {
        courseRevision: 3,
        plan: {
          version: 1,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          parts: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: []
        }
      };
    },
    ...overrides
  };
}

function createHandler(overrides = {}, scopes) {
  return createAuthoringActionHandler({
    adapter: adapterFixture(overrides, scopes),
    allowedOrigins: new Set([ORIGIN, CHAT_OPENAI_ORIGIN, "https://app.example"]),
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

function objectKeys(value) {
  if (Array.isArray(value)) return value.flatMap(objectKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => [key, ...objectKeys(entry)]);
}

test("#272 Action executa a tarefa humana e devolve resultado sem wrapper técnico", async () => {
  const response = await createHandler()(request("retomar_curso", {
    titulo: "Redes para iniciantes"
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(
    response.headers.get("x-aralearn-authoring-contract"),
    COURSE_HUMAN_TASK_CATALOG_HEADER
  );
  const payload = await response.json();
  assert.match(payload.result, /Retomei o Curso “Redes para iniciantes”/u);
  assert.match(payload.deepLink, /section=planning/u);
  assert.equal(payload.nextDecision, "Quer propor a primeira Parte?");
  assert.deepEqual(Object.keys(payload).sort(), ["context", "deepLink", "nextDecision", "result"]);
  assert.doesNotMatch(JSON.stringify({
    result: payload.result,
    context: payload.context
  }), new RegExp(ACTOR_ID, "u"));
  assert.deepEqual(
    objectKeys(payload.context).filter((key) =>
      /^(?:requestId|revision|version|hash|path|resultFacts|cursor)$/u.test(key)
    ),
    []
  );
});

test("#272 preflight, OAuth e erros preservam o catálogo humano", async () => {
  const handler = createHandler();
  for (const origin of [ORIGIN, CHAT_OPENAI_ORIGIN]) {
    const preflight = await handler(new Request(`${BASE_URL}/retomar_curso`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" }
    }));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.equal(preflight.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(ARALEARN_ACTION_CONTRACT_HEADER, COURSE_HUMAN_TASK_CATALOG_HEADER);
    assert.equal(
      preflight.headers.get("x-aralearn-authoring-contract"),
      COURSE_HUMAN_TASK_CATALOG_HEADER
    );
  }

  const rejectedPreflight = await handler(new Request(`${BASE_URL}/retomar_curso`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://actions.example",
      "Access-Control-Request-Method": "POST"
    }
  }));
  assert.equal(rejectedPreflight.status, 403);
  assert.equal(rejectedPreflight.headers.get("access-control-allow-origin"), null);
  assert.equal((await rejectedPreflight.json()).error.code, "origin_not_allowed");

  const oauth = await handler(new Request(`${BASE_URL}/oauth/unknown`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(oauth.status, 404);
  assert.equal(oauth.headers.get("x-aralearn-authoring-contract"), (
    COURSE_HUMAN_TASK_CATALOG_HEADER
  ));

  const unknown = await handler(request("tarefa_inexistente"));
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), {
    error: {
      code: "unknown_human_task",
      message: "Tarefa de autoria inexistente.",
      retryable: false
    },
    nextDecision: null
  });
});

test("OAuth nunca publica invalid_course_command durante autorização ou token", async () => {
  const leakedCourseError = new AuthoringApiError(
    422,
    "invalid_course_command",
    "Os dados do Curso são inválidos."
  );
  const handler = createHandler({
    async createActionOAuthAuthorization() {
      throw leakedCourseError;
    },
    async exchangeActionOAuthCode() {
      throw leakedCourseError;
    }
  });
  const redirectUri = "https://chat.openai.com/aip/g-real-callback/oauth/callback";
  const authorizeUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: ACTOR_ID,
    redirect_uri: redirectUri,
    state: "estado-oauth-actions",
    scope: "openid email"
  }).toString();
  const authorize = await handler(new Request(authorizeUrl, {
    headers: { Origin: ORIGIN }
  }));
  assert.equal(authorize.status, 400);
  assert.deepEqual(await authorize.json(), {
    error: "invalid_request",
    error_description: "A solicitação OAuth é inválida."
  });

  const token = await handler(new Request(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ACTOR_ID,
      client_secret: `ars_${"a".repeat(32)}`,
      code: `arc_${"b".repeat(32)}`,
      redirect_uri: redirectUri
    })
  }));
  assert.equal(token.status, 400);
  assert.deepEqual(await token.json(), {
    error: "invalid_grant",
    error_description: "As credenciais ou a concessão OAuth são inválidas."
  });

  const unavailableHandler = createHandler({
    async createActionOAuthAuthorization() {
      throw new AuthoringApiError(
        503,
        "course_service_unavailable",
        "O serviço de Cursos não concluiu a operação."
      );
    }
  });
  const unavailable = await unavailableHandler(new Request(authorizeUrl, {
    headers: { Origin: ORIGIN }
  }));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    error: "temporarily_unavailable",
    error_description: "O serviço OAuth está temporariamente indisponível."
  });
});

test("#272 autenticação e autorização são aplicadas pelo servidor, não pelo modelo", async () => {
  const anonymous = await createHandler()(new Request(`${BASE_URL}/retomar_curso`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ titulo: "Redes para iniciantes" })
  }));
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get("www-authenticate"), "Bearer");

  const forbidden = await createHandler({}, ["authoring:read"])(request("criar_curso", {
    titulo: "Novo Curso",
    objetivo: "Objetivo do Curso."
  }));
  assert.equal(forbidden.status, 403);
  const payload = await forbidden.json();
  assert.equal(payload.error.code, "insufficient_scope");
  assert.equal(payload.error.retryable, false);
  assert.equal(payload.nextDecision, null);
});

test("#272 referência ambígua e indisponibilidade devolvem retomadas diferentes", async () => {
  const duplicate = {
    courseId: "20000000-0000-4000-8000-000000000002",
    title: "Redes para iniciantes",
    revision: 2,
    updatedAt: "2026-09-01T10:00:00Z"
  };
  const ambiguous = await createHandler({
    async listCourses() {
      return coursePage([...coursePage().items, duplicate]);
    }
  })(request("retomar_curso", { titulo: "Redes para iniciantes" }));
  assert.equal(ambiguous.status, 409);
  const ambiguousPayload = await ambiguous.json();
  assert.equal(ambiguousPayload.error.code, "ambiguous_human_reference");
  assert.equal(ambiguousPayload.error.retryable, false);
  assert.match(ambiguousPayload.nextDecision, /título mais específico ou a posição/iu);

  const unavailable = await createHandler({
    async listCourses() {
      throw new AuthoringApiError(503, "course_service_unavailable", "Cursos indisponíveis.");
    }
  })(request("retomar_curso", { titulo: "Redes para iniciantes" }));
  assert.equal(unavailable.status, 503);
  const unavailablePayload = await unavailable.json();
  assert.equal(unavailablePayload.error.retryable, true);
  assert.match(unavailablePayload.nextDecision, /Tente novamente sem mudar a intenção/iu);
});

test("Actions não manda repetir incorporação de PDF com escrita incerta", async () => {
  const response = await createHandler({
    async listCourses() {
      throw new AuthoringApiError(
        409,
        "course_source_pdf_write_uncertain",
        "A confirmação da ingestão do PDF ficou inconclusiva."
      );
    }
  })(request("retomar_curso", { titulo: "Redes para iniciantes" }));

  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.error.code, "course_source_pdf_write_uncertain");
  assert.equal(payload.error.retryable, false);
  assert.equal(
    payload.nextDecision,
    "Releia as Fontes antes de decidir se ainda precisa incorporar o PDF."
  );
});

test("#272 transporte de PDF exige o objeto oficial e rejeita origem não confiável", async () => {
  const invalid = await createHandler()(request("incorporar_pdf_como_fonte", {
    curso: "Redes para iniciantes",
    titulo: "Manual do proxy",
    intencao: "Manter o PDF como Fonte.",
    openaiFileIdRefs: [{
      id: "file-untrusted",
      name: "manual.pdf",
      mime_type: "application/pdf",
      download_link: "https://files.example.test/manual.pdf"
    }]
  }));
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error.code, "invalid_openai_file");
});

test("#272 transporte de PDF aceita as origens oficiais sem expor a URL", async () => {
  for (const downloadLink of [
    "https://files.oaiusercontent.com/manual.pdf?token=temporary",
    "https://oaisdmntprbrazilsouth.blob.core.windows.net/manual.pdf?token=temporary"
  ]) {
    let receiptInput = null;
    const response = await createHandler({
      async ingestCourseSourcePdf() {
        throw new Error("O recibo existente deve impedir nova ingestão.");
      },
      async getCourseSourcePdfIngestionReceipt(value) {
        receiptInput = value;
        return { stored: true, sourceId: "source-manual", sourceRevision: 1 };
      },
      async getCourseSources() {
        return {
          items: [{
            sourceId: "source-manual",
            revision: 1,
            title: "Manual do proxy",
            citationText: "Manual do proxy"
          }],
          nextCursor: null
        };
      }
    })(request("incorporar_pdf_como_fonte", {
      curso: "Redes para iniciantes",
      titulo: "Manual do proxy",
      intencao: "Manter o PDF como Fonte.",
      openaiFileIdRefs: [{
        id: "file-official",
        name: "manual.pdf",
        mime_type: "application/pdf",
        download_link: downloadLink
      }]
    }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(receiptInput.fileIdentity.fileId, "file-official");
    const serialized = JSON.stringify(await response.json());
    assert.doesNotMatch(serialized, /oaiusercontent|blob\.core|file-official|token=temporary/iu);
  }
});

test("#272 payload e método inválidos falham antes da tarefa", async () => {
  const wrongMethod = await createHandler()(new Request(`${BASE_URL}/retomar_curso`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST, OPTIONS");

  const wrongType = await createHandler()(new Request(`${BASE_URL}/retomar_curso`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer action-token",
      "Content-Type": "text/plain"
    },
    body: "Redes para iniciantes"
  }));
  assert.equal(wrongType.status, 415);

  const oversized = await createHandler()(request("retomar_curso", {
    titulo: "x".repeat(513 * 1024)
  }));
  assert.equal(oversized.status, 413);
  const payload = await oversized.json();
  assert.equal(payload.error.retryable, false);
  assert.match(payload.nextDecision, /Divida a tarefa/iu);
});
