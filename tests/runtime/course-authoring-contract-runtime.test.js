import test from "node:test";
import assert from "node:assert/strict";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { projectHumanWriteRecovery } from "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";
import { encodeCourseActionTaskRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";

import {
  COURSE_HUMAN_TASK_CATALOG_HEADER
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  ARALEARN_ACTION_CONTRACT_HEADER,
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import {
  ARALEARN_AUTHORING_CONTRACT_HEADER,
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const ORIGIN = "https://client.example";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const EXPECTED_HEADER = COURSE_HUMAN_TASK_CATALOG_HEADER;
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PRINCIPAL = { actorId: "20000000-0000-4000-8000-000000000001",
  authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };

function channelClient(channel, adapter) {
  const shared = { adapter: { publicAppUrl: "https://app.example/", ...adapter,
    resolvePrincipal: async () => PRINCIPAL, resolveActionPrincipal: async () => PRINCIPAL },
    allowedOrigins: new Set([ORIGIN]) };
  const handler = channel === "MCP"
    ? createAuthoringMcpHandler({ ...shared, resourceUrl: MCP_URL, authorizationServer: AUTHORIZATION_SERVER })
    : createAuthoringActionHandler({ ...shared, actionBaseUrl: ACTION_URL, publicAppUrl: "https://app.example/" });
  return async (name, args) => {
    const action = channel === "MCP" ? null : encodeCourseActionTaskRequest(name, args);
    const response = await handler(new Request(channel === "MCP" ? MCP_URL : `${ACTION_URL}/${action.operationName}`, {
      method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        ...(channel === "MCP" ? { "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION } : {}) },
      body: JSON.stringify(channel === "MCP"
        ? { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } : action.arguments)
    }));
    const payload = await response.json();
    return { response, payload, result: channel === "MCP" ? payload.result?.structuredContent : payload };
  };
}

for (const channel of ["MCP", "Actions"]) {
  test(`${channel} preserva a retomada estrutural após perda e renomeação com o mesmo pedido original`, async () => {
    let title = "Curso original";
    let revision = 1;
    let loseResponse = true;
    let receipt = null;
    let listCalls = 0;
    const events = [];
    const writes = [];
    const client = channelClient(channel, {
      async listCourses() {
        listCalls += 1;
        return { items: [{ courseId: COURSE_ID, title }], hasMore: false };
      },
      async getCourse({ courseId }) {
        events.push("read"); assert.equal(courseId, COURSE_ID);
        return { courseId, title, revision, goal: "Objetivo preservado." };
      },
      async commitCourseComposition({ principal, deadlineAt, ...request }) {
        assert.equal(principal.actorId, PRINCIPAL.actorId);
        assert.equal(Number.isFinite(deadlineAt), true);
        events.push("commit"); writes.push(structuredClone(request));
        if (!receipt) {
          title = request.courseMetadata.title;
          revision += 1;
          receipt = { courseRevision: revision, idempotent: false };
        }
        if (loseResponse) throw new AuthoringApiError(503, "network_error", "Resposta perdida após salvar.");
        return { ...receipt, idempotent: true };
      }
    });
    const args = { curso: "Curso original", titulo: "Título novo" };
    const first = await client("alterar_curso", args);
    assert.equal(first.result.error.code, "course_write_uncertain");
    assert.equal(first.result.error.retryable, false);
    const recovery = first.result.error.recovery;
    assert.equal(recovery.requestId, writes[0].requestId);
    assert.equal(recovery.operation, "alterar_curso");
    assert.equal(recovery.courseId, COURSE_ID);
    assert.match(recovery.retomada, /^[A-Za-z0-9_-]+$/u);
    assert.deepEqual(writes[1], writes[0]);
    assert.deepEqual(events.slice(events.indexOf("commit")), ["commit", "read", "commit"]);
    assert.equal(title, "Título novo");
    loseResponse = false;
    const resumed = await client("alterar_curso", { ...args, retomada: recovery.retomada });
    assert.equal(resumed.response.status, 200);
    assert.match(resumed.result.result, /Recuperei/iu);
    assert.equal(resumed.result.context.retomada, recovery.retomada);
    assert.equal(listCalls, 1, "a retomada preserva o curso renomeado sem resolver seu título anterior");
    assert.equal(writes.length, 3);
    assert.deepEqual(writes[2], writes[0]);
    assert.equal(revision, 2, "o replay do recibo não salva o efeito novamente");
    const altered = await client("alterar_curso", { ...args, titulo: "Outra intenção", retomada: recovery.retomada });
    assert.equal(altered.result.error.code, "invalid_human_structure_operation");
    const decoded = JSON.parse(Buffer.from(recovery.retomada, "base64url").toString("utf8"));
    decoded.actor = "20000000-0000-4000-8000-000000000002";
    const foreign = await client("alterar_curso", { ...args, retomada: Buffer.from(JSON.stringify(decoded)).toString("base64url") });
    assert.equal(foreign.result.error.code, "invalid_human_structure_operation");
    assert.equal(writes.length, 3);
  });

  test(`${channel} entrega a tentativa perdida e a reconcilia por releitura sem reaplicar conteúdo`, async () => {
    const reference = { annotationId: "30000000-0000-4000-8000-000000000001", annotationVersion: 2,
      targetKind: "study_unit", targetId: "unit" };
    const other = { ...reference, annotationId: "30000000-0000-4000-8000-000000000002", annotationVersion: 1 };
    const content = text => ({ title: "Unidade", role: "theory", topics: [], response: null, feedback: [],
      content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }] });
    let saved = content("Texto original.");
    let revision = 1;
    let receipt = null;
    let visible = false;
    let queue = [reference, other].map(value => ({ annotationId: value.annotationId,
      annotationVersion: value.annotationVersion, provenance: { origin: "author" },
      target: { kind: value.targetKind, id: value.targetId }, state: "open", rawText: "Esclarecer a relação causal." }));
    const events = [];
    const commits = [];
    const receipts = [];
    const confirmations = [];
    const client = channelClient(channel, {
      async listCourses() {
        assert.equal(visible, false, "a recuperação por referência não resolve novamente o título antigo");
        return { items: [{ courseId: COURSE_ID, title: "Curso" }], hasMore: false };
      },
      async getCourse({ courseId }) {
        assert.equal(courseId, COURSE_ID);
        return { courseId: COURSE_ID, revision, title: visible ? "Curso renomeado" : "Curso" };
      },
      async listCourseStudyUnits() { return { items: [{ ordinal: 1, version: revision,
        curriculumPath: { didacticMicrosequence: { id: "micro" } }, studyUnit: { ...saved, id: "unit", position: 1 } }], hasMore: false }; },
      async listCourseEntities() { events.push("content"); return { items: [{ entityType: "study_unit", entityId: "unit", content: saved }], hasMore: false }; },
      async getCourseSources() { events.push("sources"); return { items: [{ sourceLinks: [] }] }; },
      async getCourseAnchoredAnnotations() { events.push("queue"); return { items: structuredClone(queue), annotationSetVersion: revision, hasMore: false }; },
      async commitCourseObservationCorrections(request) {
        events.push("commit"); commits.push(structuredClone(request));
        saved = request.upserts[0].content;
        revision += 1;
        receipt = { contract: "aralearn.course-observation-correction.v1", status: "persisted", courseId: COURSE_ID,
          requestId: request.requestId, revision, idempotent: false,
          observations: request.observations.map(value => ({ ...value, changed: true, confirmed: false,
            effectHash: "a".repeat(64), currentEffectHash: "a".repeat(64) })) };
        throw new AuthoringApiError(503, "network_error", "Resposta sintética perdida.");
      },
      async getCourseObservationCorrection(request) {
        events.push("receipt"); receipts.push(request.requestId);
        return visible ? { ...structuredClone(receipt), idempotent: true }
          : { contract: "aralearn.course-observation-correction.v1", status: "absent", courseId: COURSE_ID, requestId: request.requestId };
      },
      async confirmCourseObservationCorrection(request) {
        events.push("confirm"); confirmations.push(structuredClone(request));
        assert.deepEqual(request.confirmations, [{ annotationId: reference.annotationId,
          annotationVersion: reference.annotationVersion, effectHash: "a".repeat(64) }]);
        receipt.observations[0].confirmed = true;
        queue = queue.filter(entry => entry.annotationId !== reference.annotationId);
        return structuredClone(receipt);
      },
      async commitCourseComposition() { assert.fail("A correção da fila não usa a gravação genérica."); }
    });
    const first = await client("aplicar_correcoes", { curso: "Curso",
      correcoes: [{ unidade: 1, conteudo: content("Relação causal esclarecida.") }], observacoesTratadas: [reference] });
    assert.equal(first.response.status, channel === "MCP" ? 200 : 409);
    assert.equal(first.result.error.code, "course_write_uncertain");
    assert.equal(first.result.error.retryable, false);
    assert.match(first.result.nextDecision, /mesma tentativa.*reler/iu);
    const recovery = first.result.error.recovery;
    assert.deepEqual(recovery, { requestId: commits[0].requestId,
      operation: "course_observation_correction", courseId: COURSE_ID });
    assert.equal(commits.length, 1);
    assert.equal(queue.length, 2);
    const retry = await client("retomar_correcao", { curso: "Curso", tentativa: recovery.requestId });
    assert.deepEqual(retry.result.error.recovery, recovery, "a ausência temporária conserva a mesma tentativa");
    assert.equal(commits.length, 1);
    assert.equal(confirmations.length, 0);
    visible = true;
    const boundary = events.length;
    const resumed = await client("retomar_correcao", { recuperacao: recovery });
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.result.context.confirmedObservationCount, 1);
    assert.deepEqual(events.slice(boundary), ["receipt", "content", "sources", "queue", "receipt", "confirm"]);
    assert.equal(confirmations[0].requestId, recovery.requestId);
    assert.equal(receipts.every(value => value === recovery.requestId), true);
    assert.equal(commits.length, 1);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].annotationId, other.annotationId);
    assert.equal(saved.content[0].data.text, "Relação causal esclarecida.");
    await client("retomar_correcao", { recuperacao: recovery });
    assert.equal(commits.length, 1);
    assert.equal(confirmations.length, 1, "a segunda releitura não confirma duas vezes a mesma versão");
  });

  test(`${channel} limita a referência de recuperação e não publica erro bruto ou detalhes não autorizados`, async () => {
    const valid = { requestId: "original-attempt-1", operation: "course_observation_correction", targetCourseId: COURSE_ID };
    const details = [valid, { requestId: "12345678", operation: "a" },
      { requestId: "a".repeat(128), operation: "a".repeat(96), targetCourseId: COURSE_ID.toUpperCase() },
      { ...valid, requestId: "short" }, { ...valid, requestId: "a".repeat(129) },
      { ...valid, operation: "a".repeat(97) }, { ...valid, operation: "https://secret.example" },
      { ...valid, targetCourseId: "not-a-course" }, { ...valid, requestId: "user input with spaces" },
      { ...valid, operation: "" }];
    for (const code of ["course_write_uncertain", "course_source_pdf_write_uncertain", "course_media_write_uncertain"]) {
      for (const [index, detail] of details.entries()) {
        const client = channelClient(channel, { async listCourses() {
          throw new AuthoringApiError(409, code, "secret-fixture https://secret.example/private", {
            ...detail, downloadUrl: "https://secret.example/private", body: { token: "secret-fixture" }, sql: "secret-fixture"
          });
        } });
        const { payload, result } = await client("retomar_curso", { titulo: "Curso" });
        assert.equal(result.error.code, code);
        assert.equal(result.error.retryable, false);
        if (code === "course_media_write_uncertain") {
          assert.match(result.nextDecision, /Consulte os áudios/u);
          assert.doesNotMatch(result.nextDecision, /pendências/u);
        } else if (code === "course_source_pdf_write_uncertain") {
          assert.match(result.nextDecision, /Releia as fontes.*PDF/u);
          assert.doesNotMatch(result.nextDecision, /pendências/u);
        } else assert.match(result.nextDecision, /conteúdo e suas pendências/u);
        assert.doesNotMatch(JSON.stringify(payload), /secret-fixture|secret\.example|downloadUrl|\bsql\b|\btoken\b/u);
        if (index < 3) {
          assert.deepEqual(result.error.recovery, { requestId: detail.requestId, operation: detail.operation,
            ...(detail.targetCourseId ? { courseId: detail.targetCourseId.toLowerCase() } : {}) });
          assert.match(result.nextDecision, /mesma tentativa/iu);
        } else assert.equal(Object.hasOwn(result.error, "recovery"), false);
      }
    }
    const unrelated = channelClient(channel, { async listCourses() {
      throw new AuthoringApiError(409, "stale_course_state", "O curso mudou.", valid);
    } });
    assert.equal(Object.hasOwn((await unrelated("retomar_curso", { titulo: "Curso" })).result.error, "recovery"), false);
  });
}

test("recuperação estrutural só projeta tokens opacos limitados nas operações que os consomem", () => {
  const details = { requestId: "original-attempt-1", targetCourseId: COURSE_ID };
  for (const operation of ["alterar_curso", "salvar_ramo_curricular", "mover_ramo_curricular",
    "duplicar_ramo_curricular", "remover_ramo_curricular", "reordenar_unidades"]) {
    for (const retomada of ["a", "a".repeat(480000)]) {
      assert.equal(projectHumanWriteRecovery(new AuthoringApiError(409, "course_write_uncertain", "Incerta.",
        { ...details, operation, retomada })).retomada, retomada);
    }
    for (const retomada of ["", "a".repeat(480001), "https://secret.example", "a=", "texto livre", { body: "livre" }]) {
      assert.equal(Object.hasOwn(projectHumanWriteRecovery(new AuthoringApiError(409, "course_write_uncertain", "Incerta.",
        { ...details, operation, retomada })), "retomada"), false);
    }
  }
  for (const operation of ["excluir_curso", "course_observation_correction", "course_write"]) {
    assert.equal(Object.hasOwn(projectHumanWriteRecovery(new AuthoringApiError(409, "course_write_uncertain", "Incerta.",
      { ...details, operation, retomada: "opaque" })), "retomada"), false);
  }
});

test("MCP identifica o contrato canônico em preflight e descoberta OAuth", async () => {
  const handle = createAuthoringMcpHandler({
    adapter: {},
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: MCP_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });

  const preflight = await handle(new Request(MCP_URL, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(preflight.status, 204);
  assert.equal(ARALEARN_AUTHORING_CONTRACT_HEADER, EXPECTED_HEADER);
  assert.equal(preflight.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const metadata = await handle(new Request(
    `${MCP_URL}/.well-known/oauth-protected-resource`,
    { method: "GET" }
  ));
  assert.equal(metadata.status, 200);
  assert.equal(metadata.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);
});

test("Action identifica o contrato canônico em preflight, erro e rota OAuth", async () => {
  const handle = createAuthoringActionHandler({
    adapter: {},
    allowedOrigins: new Set([ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: "https://app.example/"
  });

  const preflight = await handle(new Request(`${ACTION_URL}/retomar_curso`, {
    method: "OPTIONS",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(preflight.status, 204);
  assert.equal(ARALEARN_ACTION_CONTRACT_HEADER, EXPECTED_HEADER);
  assert.equal(preflight.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const methodError = await handle(new Request(`${ACTION_URL}/retomar_curso`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(methodError.status, 405);
  assert.equal(methodError.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);

  const oauthError = await handle(new Request(`${ACTION_URL}/oauth/unknown`, {
    method: "GET",
    headers: { Origin: ORIGIN }
  }));
  assert.equal(oauthError.status, 404);
  assert.equal(oauthError.headers.get("X-AraLearn-Authoring-Contract"), EXPECTED_HEADER);
});
