import test from "node:test";
import assert from "node:assert/strict";

import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { CourseSupabaseAdapter } from
  "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const ORIGIN = "https://app.example";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";
const MCP_RESOURCE =
  "https://project.example/functions/v1/aralearn-authoring-mcp";

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "assinatura-de-teste"
  ].join(".");
}

function request(path, {
  method = "POST",
  body = {},
  token = "session",
  headers = {}
} = {}) {
  return new Request(`https://edge.example/functions/v1/aralearn-course-api${path}`, {
    method,
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...headers
    },
    ...(!new Set(["GET", "HEAD", "OPTIONS"]).has(method) ? { body: JSON.stringify(body) } : {})
  });
}

function pdfIngestionRequest({
  sourceId = "fonte-pdf",
  file = new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" }),
  requestId = "request-pdf-ingestion-0001",
  token = "session",
  extra = null
} = {}) {
  const body = new FormData();
  body.set("requestId", requestId);
  body.set("courseId", COURSE_ID);
  body.set("expectedRevision", "4");
  body.set("sourceId", sourceId);
  body.set("sourceRevision", "2");
  body.set("file", file, "fonte.pdf");
  if (extra) body.set(extra.name, extra.value);
  return new Request(
    "https://edge.example/functions/v1/aralearn-course-api/app/ingerirPdfDaFonte",
    {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Authorization: `Bearer ${token}`
      },
      body
    }
  );
}

test("expõe as duas versões da inspeção por rotas explícitas", async () => {
  const versions = [];
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read"] };
      },
      async listCourseStudyUnits({ inspectionVersion, courseId, expectedRevision }) {
        versions.push(inspectionVersion);
        return {
          contract: `aralearn.course-study-unit-inspection-page.v${inspectionVersion}`,
          courseId,
          courseRevision: expectedRevision,
          items: []
        };
      }
    }
  });
  const query = `?expectedRevision=7`;
  assert.equal((await handler(request(`/v1/courses/${COURSE_ID}/study-units${query}`, {
    method: "GET"
  }))).status, 200);
  assert.equal((await handler(request(`/v2/courses/${COURSE_ID}/study-units${query}`, {
    method: "GET"
  }))).status, 200);
  assert.deepEqual(versions, [1, 2]);
});

test("expõe exclusão de conta somente na rota interna autenticada do aplicativo", async () => {
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        assert.fail("A operação interna autentica o JWT no RPC de exclusão.");
      },
      async deleteMyAccount(value) {
        call = value;
        return { contract: "aralearn.account-deletion.v1", status: "deleted" };
      }
    }
  });

  const response = await handler(request("/app/excluirMinhaConta", {
    body: { confirmation: "EXCLUIR MINHA CONTA" },
    token: "session-delete"
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    requestId: null,
    data: { contract: "aralearn.account-deletion.v1", status: "deleted" }
  });
  assert.equal(call.accessToken, "session-delete");
  assert.equal(call.confirmation, "EXCLUIR MINHA CONTA");
  assert.ok(Number.isFinite(call.deadlineAt));
});

test("rota interna recusa confirmação ambígua antes da operação destrutiva", async () => {
  let calls = 0;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async deleteMyAccount() { calls += 1; }
    }
  });
  for (const body of [
    { confirmation: "excluir" },
    { confirmation: "EXCLUIR MINHA CONTA", requestId: "campo-indevido" }
  ]) {
    const response = await handler(request("/app/excluirMinhaConta", { body }));
    const payload = await response.json();
    assert.equal(response.status, 422);
    assert.equal(payload.error.code, "invalid_account_deletion");
  }
  assert.equal(calls, 0);
});

test("expõe leitura autenticada do plano instrucional no aplicativo", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal(token) {
        assert.equal(token, "session");
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async getCourseInstructionalPlan({ courseId }) {
        return {
          contract: "aralearn.course-instructional-plan.v1",
          courseId,
          courseRevision: 1,
          plan: { version: 1, parts: [] },
          recentActivity: []
        };
      }
    }
  });
  const response = await handler(request(`/v1/courses/${COURSE_ID}/instructional-plan`, {
    method: "GET"
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(payload.data.courseId, COURSE_ID);
  assert.equal(payload.data.plan.version, 1);
});

test("rota interna aceita sessão comum e recusa o token OAuth destinado ao MCP", async () => {
  const applicationToken = jwt({
    aud: "authenticated",
    exp: 2_000_000_000,
    iat: 1_700_000_000,
    iss: "https://project.example/auth/v1",
    role: "authenticated",
    sub: COURSE_ID
  });
  const mcpToken = jwt({
    aud: MCP_RESOURCE,
    client_id: "40000000-0000-4000-8000-000000000004",
    exp: 2_000_000_000,
    iat: 1_700_000_000,
    iss: "https://project.example/auth/v1",
    role: "authenticated",
    sub: COURSE_ID
  });
  let identityCalls = 0;
  let operationCalls = 0;
  const principalAdapter = new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example",
    attempts: 1,
    fetchImpl: async (url, init) => {
      identityCalls += 1;
      assert.match(url, /\/auth\/v1\/user$/u);
      assert.equal(init.headers.Authorization, `Bearer ${applicationToken}`);
      return new Response(JSON.stringify({ id: COURSE_ID }), {
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      resolveApplicationPrincipal: (...args) =>
        principalAdapter.resolveApplicationPrincipal(...args),
      async getCourseInstructionalPlan({ courseId }) {
        operationCalls += 1;
        return {
          contract: "aralearn.course-instructional-plan.v1",
          courseId,
          courseRevision: 1,
          plan: { version: 1, parts: [] },
          recentActivity: []
        };
      }
    }
  });
  const path = `/v1/courses/${COURSE_ID}/instructional-plan`;
  const accepted = await handler(request(path, {
    method: "GET",
    token: applicationToken
  }));
  assert.equal(accepted.status, 200);

  const rejected = await handler(request(path, {
    method: "GET",
    token: mcpToken
  }));
  const rejectedPayload = await rejected.json();
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get("www-authenticate"), "Bearer");
  assert.equal(rejectedPayload.error.code, "invalid_application_token");
  assert.equal(identityCalls, 1);
  assert.equal(operationCalls, 1);
});

test("expõe a mesma leitura retomável da materialização ao aplicativo", async () => {
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read"] };
      },
      async getCourseAuthoringPartMaterialization(value) {
        call = value;
        return {
          contract: "aralearn.course-authoring-part-materialization.v1",
          courseId: COURSE_ID,
          courseRevision: 2,
          authoringPartId: PART_ID,
          materialization: { id: MATERIALIZATION_ID, steps: [] }
        };
      }
    }
  });
  const response = await handler(request(
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}/materializations/${MATERIALIZATION_ID}`,
    { method: "GET" }
  ));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.materialization.id, MATERIALIZATION_ID);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.authoringPartId, PART_ID);
  assert.equal(call.materializationId, MATERIALIZATION_ID);
});

test("não conserva endpoints OAuth ou de Workspace", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {}
  });
  const oauth = await handler(request("/oauth/token"));
  const workspace = await handler(request("/app/listarWorkspacesDeAutoria"));

  assert.equal(oauth.status, 404);
  assert.equal(workspace.status, 404);
});

test("rejeita origem não autorizada antes de executar", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {}
  });
  const value = request(`/v1/courses/${COURSE_ID}`, { method: "GET" });
  value.headers.set("Origin", "https://evil.example");
  const response = await handler(value);
  assert.equal(response.status, 403);
});

test("autentica antes de ler o corpo e interrompe payload acima de 512 KiB", async () => {
  let authenticationCalls = 0;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        authenticationCalls += 1;
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan() {
        assert.fail("Um payload excedente não pode alcançar a operação.");
      }
    }
  });
  const planPath = `/v1/courses/${COURSE_ID}/instructional-plan/changes`;
  const unauthenticated = request(planPath, {
    body: { padding: "x".repeat(513 * 1024) },
    token: ""
  });
  unauthenticated.headers.delete("Authorization");
  const unauthorizedResponse = await handler(unauthenticated);
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(authenticationCalls, 0);

  const oversized = request(planPath, {
    body: { padding: "x".repeat(513 * 1024) }
  });
  oversized.headers.delete("content-length");
  const oversizedResponse = await handler(oversized);
  assert.equal(oversizedResponse.status, 413);
  assert.equal(authenticationCalls, 1);
});

test("ingere PDF multipart autenticado sem reduzir a identidade Unicode da Fonte", async () => {
  const sourceId = "😀".repeat(2_048);
  let call = null;
  let authenticationDeadlineAt = null;
  const principal = {
    actorId: COURSE_ID,
    authenticationKind: "application",
    scopes: ["authoring:read", "authoring:write"]
  };
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal(token, { deadlineAt }) {
        assert.equal(token, "session");
        authenticationDeadlineAt = deadlineAt;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return principal;
      },
      async ingestCourseSourcePdf(value) {
        call = value;
        return { contract: "fixture.pdf-ingestion.v1", stored: true };
      }
    }
  });

  const response = await handler(pdfIngestionRequest({ sourceId }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.requestId, "request-pdf-ingestion-0001");
  assert.deepEqual(payload.data, { contract: "fixture.pdf-ingestion.v1", stored: true });
  assert.equal(call.principal, principal);
  assert.equal(call.courseId, COURSE_ID);
  assert.equal(call.expectedCourseRevision, 4);
  assert.equal(call.requestId, "request-pdf-ingestion-0001");
  assert.deepEqual(call.sourceIntent, {
    mode: "existing",
    sourceId,
    sourceRevision: 2
  });
  assert.equal(call.mediaType, "application/pdf");
  assert.equal(new TextDecoder().decode(call.bytes), "%PDF-1.7\nfixture");
  assert.ok(Number.isFinite(call.deadlineAt));
  assert.ok(
    call.deadlineAt >= authenticationDeadlineAt + 10,
    "o processamento recebe orçamento próprio depois da autenticação e do multipart"
  );
});

test("ingestão autentica antes do stream e limita multipart acima de 20 MiB + 64 KiB", async () => {
  let pulls = 0;
  let authenticationCalls = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new Uint8Array(1024 * 1024));
    }
  });
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        authenticationCalls += 1;
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async ingestCourseSourcePdf() {
        assert.fail("Um multipart excedente não pode alcançar a ingestão.");
      }
    }
  });
  const unauthenticated = new Request(
    "https://edge.example/functions/v1/aralearn-course-api/app/ingerirPdfDaFonte",
    {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "multipart/form-data; boundary=fixture"
      },
      body: stream,
      duplex: "half"
    }
  );
  const unauthorized = await handler(unauthenticated);
  assert.equal(unauthorized.status, 401);
  assert.equal(authenticationCalls, 0);
  assert.equal(unauthenticated.bodyUsed, false);
  assert.ok(pulls <= 1, "o runtime pode antecipar um chunk sem entregar o stream ao handler");

  let oversizedPulls = 0;
  const oversizedStream = new ReadableStream({
    pull(controller) {
      oversizedPulls += 1;
      controller.enqueue(new Uint8Array(1024 * 1024));
    }
  });
  const oversized = new Request(
    "https://edge.example/functions/v1/aralearn-course-api/app/ingerirPdfDaFonte",
    {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        Authorization: "Bearer session",
        "Content-Type": "multipart/form-data; boundary=fixture"
      },
      body: oversizedStream,
      duplex: "half"
    }
  );
  const rejected = await handler(oversized);
  assert.equal(rejected.status, 413);
  assert.equal(authenticationCalls, 1);
  assert.equal(oversized.bodyUsed, true);
  assert.ok(oversizedPulls >= 21 && oversizedPulls <= 22);
});

test("ingestão exige seis campos exatos e um único Blob PDF", async () => {
  let ingestionCalls = 0;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async ingestCourseSourcePdf() {
        ingestionCalls += 1;
      }
    }
  });
  const wrongMedia = await handler(pdfIngestionRequest({
    file: new Blob(["texto"], { type: "text/plain" })
  }));
  assert.equal(wrongMedia.status, 422);
  assert.equal((await wrongMedia.json()).error.code, "invalid_pdf");

  const extraField = await handler(pdfIngestionRequest({
    extra: { name: "contentHash", value: "inventado-no-cliente" }
  }));
  assert.equal(extraField.status, 422);
  assert.equal((await extraField.json()).error.code, "invalid_pdf_ingestion");
  assert.equal(ingestionCalls, 0);
});

test("preserva o envelope CAS do plano até o adaptador", async () => {
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan(value) {
        call = value;
        return {
          contract: "aralearn.course-instructional-plan-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          planId: "20000000-0000-4000-8000-000000000002",
          planVersion: 4
        };
      }
    }
  });
  const response = await handler(request(`/v1/courses/${COURSE_ID}/instructional-plan/changes`, {
    body: {
      requestId: "request-course-plan-0001",
      expectedCourseRevision: 5,
      expectedPlanVersion: 3,
      command: { type: "update_plan", audience: "Docentes" }
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.data.planVersion, 4);
  assert.equal(call.expectedCourseRevision, 5);
  assert.equal(call.expectedPlanVersion, 3);
  assert.deepEqual(call.command, { type: "update_plan", audience: "Docentes" });
});

test("expõe criação da cópia pessoal somente como ação autenticada do aplicativo", async () => {
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  let call = null;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return {
          actorId: COURSE_ID,
          authenticationKind: "application",
          scopes: ["authoring:write"]
        };
      },
      async commitPersonalCourseCopyEdit(value) {
        call = value;
        return {
          contract: "aralearn.personal-course-copy-edit.v1",
          targetCourseId: PART_ID,
          changed: true
        };
      }
    }
  });
  const body = {
    requestId: "request-personal-copy-0001",
    sourceCourseId: COURSE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "manual"
  };
  const personalCopyPath = `/v1/courses/${COURSE_ID}/personal-copy/composition`;
  const response = await handler(request(personalCopyPath, { body }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.requestId, body.requestId);
  assert.equal(payload.data.targetCourseId, PART_ID);
  assert.equal(call.principal.actorId, COURSE_ID);
  assert.equal(call.sourceCourseId, COURSE_ID);
  assert.equal(call.studyUnit.id, "unit-a");
  assert.equal(Object.hasOwn(call, "actorId"), false);

  const conflictHandler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return {
          actorId: COURSE_ID,
          authenticationKind: "application",
          scopes: ["authoring:write"]
        };
      },
      async commitPersonalCourseCopyEdit() {
        throw new AuthoringApiError(
          409,
          "personal_copy_exists",
          "Você já possui uma cópia pessoal deste Curso.",
          { targetCourseId: PART_ID }
        );
      }
    }
  });
  const conflictResponse = await conflictHandler(
    request(personalCopyPath, { body })
  );
  const conflictPayload = await conflictResponse.json();
  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictPayload.error.code, "personal_copy_exists");
  assert.equal(conflictPayload.error.details.targetCourseId, PART_ID);
});

test("aplicativo usa a mesma leitura e mudança de parâmetros do MCP", async () => {
  const calls = [];
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async getCourseDesign(value) {
        calls.push(["read", value]);
        return { contract: "aralearn.course-design.v1", courseId: COURSE_ID };
      },
      async applyCourseDesignCommand(value) {
        calls.push(["write", value]);
        return { contract: "aralearn.course-design-change.v1", changed: true };
      }
    }
  });
  const designPath = `/v1/courses/${COURSE_ID}/course-design`;
  const readResponse = await handler(request(
    `${designPath}?scopeKind=course&scopeRef=${COURSE_ID}&limit=16`,
    { method: "GET" }
  ));
  assert.equal(readResponse.status, 200);

  const writeResponse = await handler(request(`${designPath}/changes`, {
    body: {
      requestId: "request-course-design-0001",
      expectedCourseRevision: 5,
      command: {
        type: "clear_guidance",
        scope: { kind: "course", ref: COURSE_ID }
      }
    }
  }));
  assert.equal(writeResponse.status, 200);
  assert.equal(calls[0][1].scopeKind, "course");
  assert.equal(calls[0][1].scopeRef, COURSE_ID);
  assert.equal(calls[1][1].expectedCourseRevision, 5);
  assert.equal(calls[1][1].command.type, "clear_guidance");
});

test("aplicativo alcança audit_cycle pelas mesmas duas tools do MCP", async () => {
  const calls = [];
  const findingId = "60000000-0000-5000-8000-000000000006";
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async getCourseAuditCycle(value) {
        calls.push(["read", value]);
        return { contract: "audit-read-ok" };
      },
      async executeCourseAuditCycleCommand(value) {
        calls.push(["write", value]);
        return { contract: "audit-write-ok" };
      }
    }
  });
  const auditPath = `/v1/courses/${COURSE_ID}/audit-cycle`;
  const readResponse = await handler(request(
    `${auditPath}?expectedRevision=7&mode=context&targetStudyUnitId=unit-a&limit=1`,
    { method: "GET" }
  ));
  assert.equal(readResponse.status, 200);
  assert.equal((await readResponse.json()).data.contract, "audit-read-ok");
  assert.deepEqual(calls[0][1].query, {
    mode: "context",
    targetStudyUnitId: "unit-a",
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  });

  const writeResponse = await handler(request(`${auditPath}/changes`, {
    body: {
      requestId: "request-audit-api-0001",
      expectedCourseRevision: 7,
      command: {
        type: "decide_finding",
        findingId,
        expectedFindingVersion: 2,
        decision: "dismiss"
      }
    }
  }));
  assert.equal(writeResponse.status, 200);
  assert.equal((await writeResponse.json()).data.contract, "audit-write-ok");
  assert.equal(calls[1][1].expectedCourseRevision, 7);
  assert.deepEqual(calls[1][1].command, {
    type: "decide_finding",
    findingId,
    expectedFindingVersion: 2,
    decision: "dismiss"
  });
});

test("aplicativo usa o mesmo contrato de Fontes do MCP", async () => {
  const calls = [];
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read", "authoring:write"] };
      },
      async getCourseSources(value) {
        calls.push(["read", value]);
        return {
          contract: "aralearn.course-sources.v1",
          courseId: COURSE_ID,
          courseRevision: 5,
          mode: "target",
          query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
          pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
          items: [],
          nextCursor: null
        };
      },
      async executeCourseSourceCommand(value) {
        calls.push(["write", value]);
        return {
          contract: "aralearn.course-source-change.v1",
          courseId: COURSE_ID,
          courseRevision: 6,
          requestId: "request-course-source-0001",
          idempotent: false,
          changed: true,
          change: { type: "retire_source", subjectId: legacySourceId, revision: 2 }
        };
      }
    }
  });
  const sourcesPath = `/v1/courses/${COURSE_ID}/sources`;
  const readResponse = await handler(request(
    `${sourcesPath}?expectedRevision=5&mode=target&targetKind=study_unit&targetId=unit-a&limit=12`,
    { method: "GET" }
  ));
  assert.equal(readResponse.status, 200);

  const writeResponse = await handler(request(`${sourcesPath}/changes`, {
    body: {
      requestId: "request-course-source-0001",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: legacySourceId,
        expectedSourceRevision: 1
      }
    }
  }));
  assert.equal(writeResponse.status, 200);
  assert.equal(calls[0][1].expectedRevision, 5);
  assert.equal(calls[0][1].targetId, "unit-a");
  assert.equal(calls[1][1].expectedCourseRevision, 5);
  assert.deepEqual(calls[1][1].command, {
    type: "retire_source",
    sourceId: legacySourceId,
    expectedSourceRevision: 1
  });

  const spoofed = await handler(request(`${sourcesPath}/changes`, {
    body: {
      requestId: "request-course-source-0002",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: "source-a",
        expectedSourceRevision: 1,
        actorId: COURSE_ID
      }
    }
  }));
  assert.equal(spoofed.status, 422);
});

test("aplicativo expõe observações sem confirmação MCP nem campos de autoridade", async () => {
  const calls = [];
  const annotationId = "60000000-0000-4000-8000-000000000006";
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:read", "authoring:write"] };
      },
      async getCourseAnchoredAnnotations(value) {
        calls.push(["read", value]);
        return { contract: "read-ok" };
      },
      async executeCourseAnchoredAnnotationCommand(value) {
        calls.push(["write", value]);
        return { contract: "write-ok" };
      }
    }
  });

  const annotationPath = `/v1/courses/${COURSE_ID}/anchored-annotations`;
  const read = await handler(request(
    `${annotationPath}?expectedRevision=7&mode=target&state=open&` +
      "targetKind=study_unit&targetId=unit-a&includeDescendants=false&limit=12",
    { method: "GET" }
  ));
  assert.equal(read.status, 200);
  assert.deepEqual(calls[0][1].query.hierarchy, {
    target: { kind: "study_unit", id: "unit-a" },
    includeDescendants: false
  });
  assert.equal(calls[0][1].annotationSetVersion, null);

  const createBody = {
    requestId: "request-annotation-app-1",
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Texto bruto exato.",
      category: null,
      capturedAt: null,
      briefSummary: null
    }
  };
  const create = await handler(request(`${annotationPath}/changes`, { body: createBody }));
  assert.equal(create.status, 200);
  assert.equal(calls[1][1].expectedCourseRevision, 7);
  assert.equal(Object.hasOwn(calls[1][1].command, "confirmed"), false);

  const revise = await handler(request(`${annotationPath}/changes`, {
    body: {
      requestId: "request-annotation-app-2",
      expectedCourseRevision: null,
      command: {
        type: "revise_anchored_annotation",
        annotationId,
        expectedAnnotationVersion: 1,
        rawText: "Texto revisto.",
        category: "confusing",
        briefSummary: null
      }
    }
  }));
  assert.equal(revise.status, 200);
  assert.equal(calls[2][1].expectedCourseRevision, null);

  const spoofed = await handler(request(`${annotationPath}/changes`, {
    body: {
      ...createBody,
      requestId: "request-annotation-app-3",
      command: { ...createBody.command, channel: "authoring_chat" }
    }
  }));
  assert.equal(spoofed.status, 422);
});

test("orienta reler o Curso e usar novo requestId após conflito de versão", async () => {
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async commitCourseInstructionalPlan() {
        throw new AuthoringApiError(
          409,
          "stale_course_state",
          "A versão de estado do Curso mudou."
        );
      }
    }
  });
  const response = await handler(request(`/v1/courses/${COURSE_ID}/instructional-plan/changes`, {
    body: {
      requestId: " request-course-stale-0001 ",
      expectedCourseRevision: 1,
      expectedPlanVersion: 1,
      command: { type: "update_plan", title: "Curso revisto" }
    }
  }));
  const payload = await response.json();

  assert.equal(response.status, 409);
  assert.equal(payload.requestId, null);
  assert.equal(payload.error.code, "stale_course_state");
  assert.deepEqual(payload.error.recovery, {
    strategy: "reread_and_retry",
    retryable: true,
    requestIdMode: "new",
    steps: [
      "Releia o Curso e sua versão de estado corrente.",
      "Reaplique somente a intenção ainda pertinente com novo requestId."
    ]
  });
  assert.doesNotMatch(JSON.stringify(payload), /workspace|trilha|salvarCards/iu);
});

test("Edge da aplicação nunca reflete requestId hostil rejeitado pela rota", async () => {
  const hostileRequestId = "Bearer token-that-must-not-leak";
  let createCalls = 0;
  const handler = createCourseApiHandler({
    allowedOrigins: new Set([ORIGIN]),
    adapter: {
      async resolveApplicationPrincipal() {
        return { actorId: COURSE_ID, scopes: ["authoring:write"] };
      },
      async createCourse() {
        createCalls += 1;
      }
    }
  });
  const response = await handler(request("/v1/courses", {
    body: {
      requestId: hostileRequestId,
      title: "Curso seguro",
      objective: "Não refletir entrada hostil."
    }
  }));
  const payload = await response.json();
  const serialized = JSON.stringify(payload);

  assert.equal(response.status, 422);
  assert.equal(createCalls, 0);
  assert.equal(payload.requestId, null);
  assert.equal(payload.error.code, "invalid_request_id");
  assert.equal(payload.error.recovery.requestIdMode, "none");
  assert.equal(serialized.includes(hostileRequestId), false);
  assert.equal(serialized.includes("token-that-must-not-leak"), false);
});
