import test from "node:test";
import assert from "node:assert/strict";

import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { courseVariantComparisonFixture } from
  "../support/courseVariantComparisonFixture.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const AVATAR_ID = "30000000-0000-4000-8000-000000000003";

function editableStudyUnit(title = "Unidade revista") {
  return {
    id: "unit-a",
    position: 1,
    title,
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo curricular revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function clientWithFetch(fetchImpl, { accessToken = "token", userId = USER_ID } = {}) {
  const events = [];
  let cleared = false;
  return {
    events,
    get cleared() { return cleared; },
    client: new CourseApiClient({
      projectUrl: "https://project.invalid",
      publishableKey: "publishable",
      fetchImpl,
      authClient: {
        getSession() { return { user: { id: userId } }; },
        async getAccessToken() { return accessToken; },
        async clearSession() { cleared = true; },
        emit(event) { events.push(event); }
      }
    })
  };
}

test("lista Cursos com cursor completo e sem expor recipiente indireto", async () => {
  let request = null;
  const fixture = {
    contract: "aralearn.course-list.v1",
    items: [{ courseId: COURSE_ID, title: "Curso", revision: 2 }],
    hasMore: false,
    nextCursor: null
  };
  const { client } = clientWithFetch(async (url, init) => {
    request = { url, init, body: JSON.parse(init.body) };
    return jsonResponse(fixture);
  });

  const result = await client.listCourses({
    query: "curso",
    limit: 12,
    cursor: {
      beforeUpdatedAt: "2026-08-17T10:30:00Z",
      beforeId: COURSE_ID
    }
  });

  assert.deepEqual(result, fixture);
  assert.match(request.url, /\/rest\/v1\/rpc\/list_courses_v1$/u);
  assert.deepEqual(request.body, {
    p_query: "curso",
    p_limit: 12,
    p_before_updated_at: "2026-08-17T10:30:00Z",
    p_before_id: COURSE_ID
  });
  assert.equal(request.init.headers.get("Authorization"), "Bearer token");
});

test("transporta uma página de entidades sem assumir a composição do Curso", async () => {
  let request = null;
  const fixture = {
    contract: "aralearn.course-entities.v1",
    courseId: COURSE_ID,
    revision: 3,
    items: [],
    hasMore: false,
    nextCursor: null
  };
  const { client } = clientWithFetch(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return jsonResponse(fixture);
  });

  const result = await client.getCourseEntities(COURSE_ID, {
    revision: 3,
    limit: 1,
    cursor: { entityType: "module", entityId: "module-a" }
  });

  assert.deepEqual(result, fixture);
  assert.match(request.url, /\/rest\/v1\/rpc\/list_course_entities_v1$/u);
  assert.deepEqual(request.body, {
    p_course_id: COURSE_ID,
    p_expected_revision: 3,
    p_limit: 1,
    p_after_entity_type: "module",
    p_after_entity_id: "module-a"
  });
});

test("edição contextual usa somente a Edge, preserva proveniência e normaliza o receipt", async () => {
  let request = null;
  const updatedAt = "2026-08-20T22:45:00.000Z";
  const sourceLinks = [{
    sourceId: "fonte retirada",
    sourceRevision: 1,
    relation: "legacy_reference",
    anchors: []
  }, {
    sourceId: "fonte retirada",
    sourceRevision: 1,
    relation: "legacy_reference",
    anchors: []
  }];
  const { client } = clientWithFetch(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return jsonResponse({ ok: true, data: {
      courseId: COURSE_ID,
      revision: 5,
      operation: "commit_course_composition",
      createdCount: 0,
      updatedCount: 1,
      upsertedCount: 1,
      deletedCount: 0,
      idempotent: false,
      updatedAt,
      channel: "application",
      applicationOrigin: "manual",
      expectedStudyUnitVersion: 2,
      deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
    } });
  });

  const result = await client.commitCourseComposition({
    requestId: "request-manual-edit-0001",
    courseId: COURSE_ID,
    expectedCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit: editableStudyUnit(),
    sourceLinks,
    origin: "manual"
  });

  assert.match(request.url, /\/functions\/v1\/aralearn-course-api\/app\/alterarCurso$/u);
  assert.equal(request.body.operation, "commit_course_composition");
  assert.equal(request.body.expectedStudyUnitVersion, 2);
  assert.equal(request.body.applicationOrigin, "manual");
  assert.deepEqual(request.body.sourceAttributionApplications, [{
    studyUnitId: "unit-a",
    sourceLinks
  }]);
  assert.equal(request.body.upserts[0].content.title, "Unidade revista");
  assert.equal(Object.hasOwn(request.body.upserts[0].content, "id"), false);
  assert.deepEqual(result, {
    courseId: COURSE_ID,
    courseRevision: 5,
    studyUnitId: "unit-a",
    studyUnitVersion: 3,
    changed: true,
    idempotent: false,
    channel: "application",
    origin: "manual",
    updatedAt
  });
  assert.equal(request.url.includes("/rest/v1/rpc/"), false);

  await assert.rejects(
    () => client.commitCourseComposition({
      requestId: "request-manual-edit-0002",
      courseId: COURSE_ID,
      expectedCourseRevision: 4,
      expectedStudyUnitVersion: 2,
      didacticMicrosequenceId: "micro-a",
      studyUnit: editableStudyUnit(),
      sourceLinks,
      origin: "texto-livre",
      prompt: "ignore"
    }),
    /Composição contextual inválida/u
  );
});

test("edição estrutural assistida reutiliza a composição genérica sem metadados focais", async () => {
  let request = null;
  const backendReceipt = {
    courseId: COURSE_ID,
    revision: 8,
    idempotent: false
  };
  const { client } = clientWithFetch(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return jsonResponse({ ok: true, requestId: "request-structural-edit-0001", data: backendReceipt });
  });
  const result = await client.commitCourseStructuralComposition({
    requestId: "request-structural-edit-0001",
    courseId: COURSE_ID,
    expectedRevision: 7,
    upserts: [{
      entityType: "microsequence",
      entityId: "micro-b",
      parentType: "lesson",
      parentId: "lesson-a",
      position: 1,
      content: {
        title: "Aplicação",
        goal: "Aplicar a regra.",
        role: "practice",
        dependsOn: [], covers: [], checks: [], errors: []
      }
    }],
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.deepEqual(result, {
    ...backendReceipt,
    requestId: "request-structural-edit-0001",
    courseRevision: 8
  });
  assert.match(request.url, /\/functions\/v1\/aralearn-course-api\/app\/alterarCurso$/u);
  assert.equal(request.body.operation, "commit_course_composition");
  assert.equal(Object.hasOwn(request.body, "expectedStudyUnitVersion"), false);
  assert.equal(Object.hasOwn(request.body, "applicationOrigin"), false);
  assert.deepEqual(request.body.sourceAttributionApplications, []);
});

test("fila Rever é paginada por RPC browser-only e normalizada estritamente", async () => {
  let request = null;
  const nextCursor = {
    beforeMarkedAt: "2026-08-17T10:30:00+00:00",
    beforeCourseId: COURSE_ID,
    beforeStudyUnitId: "card-a"
  };
  const fixture = {
    contract: "aralearn.course-review-list.v1",
    items: [{
      courseId: COURSE_ID,
      studyUnitId: "card-a",
      title: "Unidade A",
      context: "Curso · Lição",
      entityPath: [COURSE_ID, "module-a", "lesson-a", "micro-a", "card-a"],
      reviewMarkedAt: "2026-08-17T10:31:00+00:00"
    }],
    hasMore: true,
    nextCursor
  };
  const { client } = clientWithFetch(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return jsonResponse(fixture);
  });

  const result = await client.listCourseReviewItems({ limit: 100, cursor: nextCursor });
  assert.deepEqual(result, fixture);
  assert.match(request.url, /\/rest\/v1\/rpc\/list_course_review_items_v1$/u);
  assert.deepEqual(request.body, {
    p_limit: 100,
    p_before_marked_at: nextCursor.beforeMarkedAt,
    p_before_course_id: COURSE_ID,
    p_before_study_unit_id: "card-a"
  });

  const invalid = clientWithFetch(async () => jsonResponse({
    ...fixture,
    items: [{ ...fixture.items[0], entityPath: [COURSE_ID, "card-a"] }]
  }));
  await assert.rejects(
    () => invalid.client.listCourseReviewItems(),
    /fila Rever inválid[oa]/u
  );
  await assert.rejects(
    () => client.listCourseReviewItems({
      cursor: { beforeMarkedAt: nextCursor.beforeMarkedAt, beforeCourseId: COURSE_ID }
    }),
    /Cursor da fila Rever inválido/u
  );
});

test("estado pessoal usa somente os RPCs e o envelope v2", async () => {
  const calls = [];
  const state = {
    contract: "aralearn.course-personal-state.v2",
    courseId: COURSE_ID,
    revision: 1,
    state: {
      version: 2,
      progress: { version: 3, lessons: {} },
      reviewMarks: {}
    },
    updatedAt: "2026-08-17T12:00:00.000Z"
  };
  let legacy = false;
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return url.endsWith("/load_course_personal_state_v2")
      ? jsonResponse(legacy
          ? {
              ...state,
              contract: "aralearn.course-personal-state.v1",
              state: { ...state.state, version: 1, observations: {} }
            }
          : state)
      : jsonResponse({
          courseId: COURSE_ID,
          revision: 2,
          updatedAt: "2026-08-17T12:01:00.000Z",
          idempotent: false
        });
  });

  assert.deepEqual(await client.loadPersonalState(COURSE_ID), state);
  await client.mutatePersonalState({
    courseId: COURSE_ID,
    expectedRevision: 1,
    requestId: "40000000-0000-4000-8000-000000000004",
    operations: [{
      kind: "set",
      collection: "reviewMarks",
      path: "module-a",
      value: "2026-08-17T12:00:00.000Z"
    }]
  });
  assert.deepEqual(calls.map(({ url }) => url.split("/").at(-1)), [
    "load_course_personal_state_v2",
    "mutate_course_personal_state_v2"
  ]);
  assert.equal(JSON.stringify(calls).includes("personal_state_v1"), false);
  const astralPath = "😀".repeat(240);
  await client.mutatePersonalState({
    courseId: COURSE_ID,
    expectedRevision: 1,
    requestId: "60000000-0000-4000-8000-000000000006",
    operations: [{
      kind: "delete",
      collection: "reviewMarks",
      path: astralPath
    }]
  });
  assert.equal(calls.at(-1).body.p_operations[0].path, astralPath);
  const callCount = calls.length;
  await assert.rejects(
    () => client.mutatePersonalState({
      courseId: COURSE_ID,
      expectedRevision: 1,
      requestId: "70000000-0000-4000-8000-000000000007",
      operations: [{
        kind: "delete",
        collection: "reviewMarks",
        path: "😀".repeat(241)
      }]
    }),
    /Operações do estado pessoal inválidas/u
  );
  assert.equal(calls.length, callCount);
  legacy = true;
  await assert.rejects(
    () => client.loadPersonalState(COURSE_ID),
    /Estado pessoal remoto inválido/u
  );
  await assert.rejects(
    () => client.mutatePersonalState({
      courseId: COURSE_ID,
      expectedRevision: 1,
      requestId: "50000000-0000-4000-8000-000000000005",
      operations: [{
        kind: "set",
        collection: "observations",
        path: "unit-a",
        value: { text: "alias legado" }
      }]
    }),
    /Operações do estado pessoal inválidas/u
  );
});

test("invalida a sessão somente diante de falha de autenticação", async () => {
  const authFailure = clientWithFetch(async () => jsonResponse({
    code: "PGRST301",
    message: "JWT expired"
  }, 401));

  await assert.rejects(() => authFailure.client.getCourse(COURSE_ID));
  assert.equal(authFailure.cleared, true);
  assert.deepEqual(authFailure.events, ["SESSION_INVALID"]);

  const validationFailure = clientWithFetch(async () => jsonResponse({
    code: "22023",
    message: "Parâmetro inválido"
  }, 400));
  await assert.rejects(() => validationFailure.client.getCourse(COURSE_ID));
  assert.equal(validationFailure.cleared, false);
  assert.deepEqual(validationFailure.events, []);
});

test("Autoria usa RPCs owner-only sem mudar a leitura compartilhada do Estudo", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ items: [], hasMore: false, nextCursor: null });
  });

  await client.listCourses({ ownerOnly: true });
  await client.getCourse(COURSE_ID, { ownerOnly: true });
  await client.getCourseEntities(COURSE_ID, { revision: 2, ownerOnly: true });

  assert.deepEqual(calls.map(({ url }) => url.split("/").at(-1)), [
    "list_owned_courses_v1",
    "get_owned_course_v1",
    "list_owned_course_entities_v1"
  ]);
});

test("plano instrucional e materialização usam a mesma operação Edge do MCP", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ ok: true, data: { changed: true } });
  });

  await client.createCourse({
    requestId: AVATAR_ID,
    title: "Curso novo",
    objective: "Aprender com evidência"
  });
  await client.loadAuthoringPlan(COURSE_ID);
  await client.loadPartMaterialization(COURSE_ID, AVATAR_ID, USER_ID);
  await client.mutateAuthoringPlan({
    requestId: AVATAR_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    expectedPlanVersion: 2,
    planCommand: { type: "update_plan", audience: "Docentes" }
  });
  await client.advanceAuthoringPartMaterialization({
    requestId: AVATAR_ID,
    courseId: COURSE_ID,
    expectedRevision: 5,
    materializationCommand: {
      authoringPartId: AVATAR_ID,
      materializationId: USER_ID,
      expectedMaterializationVersion: 0,
      operation: "start",
      authoringPartVersion: 1,
      steps: [{
        id: COURSE_ID,
        position: 0,
        kind: "context_load",
        targetDidacticMicrosequenceId: null,
        productionPosition: null
      }]
    }
  });

  assert.deepEqual(calls.map(({ url }) => url.split("/").at(-1)), [
    "criarCurso", "lerCurso", "lerCurso", "alterarCurso", "alterarCurso"
  ]);
  assert.deepEqual(calls.map(({ body }) => body.operation || body.view), [
    undefined, "instructional_plan", "part_materialization",
    "update_instructional_plan", "advance_part_materialization"
  ]);
  assert.deepEqual(calls[0].body, {
    requestId: AVATAR_ID,
    title: "Curso novo",
    objective: "Aprender com evidência"
  });
  assert.deepEqual(calls[2].body, {
    courseId: COURSE_ID,
    view: "part_materialization",
    authoringPartId: AVATAR_ID,
    materializationId: USER_ID
  });
  assert.equal(calls[3].body.expectedPlanVersion, 2);
  assert.deepEqual(calls[3].body.planCommand, {
    type: "update_plan",
    audience: "Docentes"
  });
  assert.equal(calls[4].body.materializationCommand.operation, "start");
  assert.throws(
    () => client.advanceAuthoringPartMaterialization({
      courseId: COURSE_ID,
      expectedRevision: 5,
      materializationCommand: {
        authoringPartId: AVATAR_ID,
        materializationId: USER_ID,
        expectedMaterializationVersion: 0,
        operation: "start",
        authoringPartVersion: 1,
        designContext: {},
        steps: [{
          id: COURSE_ID,
          position: 0,
          kind: "context_load",
          targetDidacticMicrosequenceId: null,
          productionPosition: null
        }]
      }
    }),
    /Comando de materialização inválido/u
  );
});

test("repete uma vez a operação idempotente quando a Edge reinicia", async () => {
  const requests = [];
  const { client } = clientWithFetch(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    if (requests.length === 1) {
      return jsonResponse({ message: "An invalid response was received from the upstream server" }, 502);
    }
    return jsonResponse({ ok: true, data: { changed: true } });
  });

  assert.deepEqual(await client.executeCourseAction("alterarCurso", {
    requestId: "request-course-edge-retry-1"
  }), { changed: true });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
});

test("não repete alteração sem identidade diante de resposta ambígua", async () => {
  let requestCount = 0;
  const { client } = clientWithFetch(async () => {
    requestCount += 1;
    return jsonResponse({ message: "An invalid response was received from the upstream server" }, 502);
  });

  await assert.rejects(
    client.executeCourseAction("gerirPessoas", { operation: "update_profile" }),
    (error) => error.status === 502
  );
  assert.equal(requestCount, 1);
});

test("não repete resposta transitória que contém erro de aplicação", async () => {
  let requestCount = 0;
  const { client } = clientWithFetch(async () => {
    requestCount += 1;
    return jsonResponse({
      error: {
        code: "course_service_unavailable",
        message: "O Curso não está disponível."
      }
    }, 503);
  });

  await assert.rejects(
    client.executeCourseAction("alterarCurso", {
      requestId: "request-course-no-application-retry-1"
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
  assert.equal(requestCount, 1);
});

test("parâmetros usam a mesma operação Edge do MCP com escopo concreto e CAS", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ ok: true, data: { changed: true } });
  });

  await client.loadCourseDesign(COURSE_ID, {
    scope: { kind: "lesson", ref: "lesson-a" },
    limit: 16,
    cursor: "lesson-child-a"
  });
  await client.mutateCourseDesign({
    requestId: "request-course-design-client",
    courseId: COURSE_ID,
    expectedRevision: 4,
    designCommand: {
      type: "set_parameter",
      scope: { kind: "lesson", ref: "lesson-a" },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 3,
      origin: "author",
      reason: "Adequar a granularidade ao público."
    }
  });

  assert.deepEqual(calls[0].body, {
    courseId: COURSE_ID,
    view: "course_design",
    scope: { kind: "lesson", ref: "lesson-a" },
    limit: 16,
    cursor: "lesson-child-a"
  });
  assert.equal(calls[1].body.operation, "update_course_design");
  assert.equal(calls[1].body.requestId, "request-course-design-client");
  assert.equal(calls[1].body.expectedRevision, 4);
  assert.equal(calls[1].body.designCommand.origin, "author");
  assert.throws(
    () => client.mutateCourseDesign({
      courseId: COURSE_ID,
      expectedRevision: 4,
      designCommand: {
        type: "set_parameter",
        scope: { kind: "module", ref: "module-a" },
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        value: 3,
        origin: "author",
        reason: "Escopo inválido."
      }
    }),
    (error) => error.code === "invalid_course_design_scope"
  );
  assert.throws(
    () => client.loadCourseDesign(COURSE_ID, { scope: null, page: 2 }),
    /Leitura do desenho inválido/u
  );
  assert.throws(
    () => client.mutateCourseDesign({
      courseId: COURSE_ID,
      expectedRevision: 4,
      designCommand: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } },
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    /Alteração do desenho inválido/u
  );
});

test("Fontes e citações usam contratos estritos, redigidos e vinculados ao pedido", async () => {
  const calls = [];
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  const read = {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    mode: "target",
    query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [],
    nextCursor: null
  };
  const changed = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    requestId: "request-source-client-1",
    idempotent: false,
    changed: true,
    change: { type: "set_target_sources", subjectId: "unit-a", revision: 2 }
  };
  const citations = {
    contract: "aralearn.course-study-citations.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    studyUnitId: "unit-a",
    citations: [{
      sourceId: legacySourceId,
      sourceRevision: 1,
      title: "Fonte A",
      citationText: "Fonte A, 2026.",
      url: "https://example.test/fonte-a",
      editionOrVersion: null,
      anchors: [{
        anchorId: "anchor-a",
        anchorRevision: 1,
        selector: { kind: "page_range", startPage: 3, endPage: 4 }
      }]
    }]
  };
  const { client } = clientWithFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith("/rpc/get_course_study_citations_v1")) return jsonResponse(citations);
    if (body.view === "course_sources") return jsonResponse({ ok: true, data: read });
    if (body.operation === "update_course_sources") {
      return jsonResponse({ ok: true, data: changed });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  assert.deepEqual(await client.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null
  }), read);
  const sourceCommand = {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "unit-a",
    expectedTargetVersion: 1,
    sourceLinks: [{
      sourceId: legacySourceId,
      sourceRevision: 1,
      relation: "quoted_from",
      anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
    }]
  };
  assert.deepEqual(await client.mutateCourseSources({
    requestId: "request-source-client-1",
    courseId: COURSE_ID,
    expectedRevision: 4,
    sourceCommand
  }), changed);
  assert.deepEqual(await client.getStudyUnitCitations(
    COURSE_ID,
    "unit-a",
    { expectedRevision: 4 }
  ), citations);
  assert.deepEqual(calls[0].body, {
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "target",
    sourceId: null,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 10
  });
  assert.equal(calls[1].body.operation, "update_course_sources");
  assert.deepEqual(calls[1].body.sourceCommand, sourceCommand);
  assert.deepEqual(calls[2].body, {
    p_course_id: COURSE_ID,
    p_expected_revision: 4,
    p_study_unit_id: "unit-a"
  });

  const staleCitations = clientWithFetch(async () => jsonResponse({
    code: "40001",
    message: "Revisão base desatualizada."
  }, 500)).client;
  await assert.rejects(
    () => staleCitations.getStudyUnitCitations(
      COURSE_ID,
      "unit-a",
      { expectedRevision: 4 }
    ),
    (error) => error.code === "course_revision_changed" &&
      error.status === 409 && error.cause?.code === "40001" &&
      !(error instanceof TypeError)
  );

  const astralSourceId = "🔎".repeat(1_500);
  let contextualRequest = null;
  const contextualRead = {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    mode: "source",
    query: {
      sourceId: astralSourceId,
      targetKind: "study_unit",
      targetId: "unit-a"
    },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [],
    nextCursor: null
  };
  const contextualClient = clientWithFetch(async (url, init) => {
    contextualRequest = { url, body: JSON.parse(init.body) };
    return jsonResponse({ ok: true, data: contextualRead });
  }).client;
  assert.deepEqual(await contextualClient.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "source",
    sourceId: astralSourceId,
    targetKind: "study_unit",
    targetId: "unit-a"
  }), contextualRead);
  assert.deepEqual(contextualRequest.body, {
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "source",
    sourceId: astralSourceId,
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: null,
    limit: 10
  });
  await assert.rejects(
    () => contextualClient.loadCourseSources(COURSE_ID, {
      expectedRevision: 4,
      mode: "source",
      sourceId: "界".repeat(2_049)
    }),
    /Identidade da Fonte inválida/u
  );

  const astralTargetId = "🔎".repeat(240);
  const astralTargetRead = {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    mode: "target",
    query: { sourceId: null, targetKind: "study_unit", targetId: astralTargetId },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 },
    items: [],
    nextCursor: null
  };
  const astralTargetClient = clientWithFetch(async () =>
    jsonResponse({ ok: true, data: astralTargetRead })).client;
  assert.deepEqual(await astralTargetClient.loadCourseSources(COURSE_ID, {
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: astralTargetId
  }), astralTargetRead);
  await assert.rejects(
    () => astralTargetClient.loadCourseSources(COURSE_ID, {
      expectedRevision: 4,
      mode: "target",
      targetKind: "study_unit",
      targetId: "🔎".repeat(241)
    }),
    /Identidade do alvo inválida/u
  );

  const astralCitationRead = {
    contract: "aralearn.course-study-citations.v1",
    courseId: COURSE_ID,
    courseRevision: 4,
    studyUnitId: astralTargetId,
    citations: []
  };
  const astralCitationClient = clientWithFetch(async () =>
    jsonResponse(astralCitationRead)).client;
  assert.deepEqual(await astralCitationClient.getStudyUnitCitations(
    COURSE_ID,
    astralTargetId,
    { expectedRevision: 4 }
  ), astralCitationRead);
  await assert.rejects(
    () => astralCitationClient.getStudyUnitCitations(
      COURSE_ID,
      "🔎".repeat(241),
      { expectedRevision: 4 }
    ),
    /Identidade da Unidade de estudo inválida/u
  );

  await assert.rejects(
    () => client.loadCourseSources(COURSE_ID, {
      expectedRevision: 4,
      mode: "source",
      sourceId: "source-a",
      targetKind: "study_unit"
    }),
    /Leitura de Fontes inválida/u
  );
  await assert.rejects(
    () => client.mutateCourseSources({
      requestId: "request-source-client-2",
      courseId: COURSE_ID,
      expectedRevision: 4,
      sourceCommand: { ...sourceCommand, actorId: USER_ID }
    }),
    (error) => error.code === "invalid_course_source_command"
  );
  await assert.rejects(
    () => client.mutateCourseSources({
      requestId: "request-source-client-3",
      courseId: COURSE_ID,
      expectedRevision: 4,
      sourceCommand: {
        type: "save_source",
        sourceId: "source-a",
        expectedSourceRevision: 0,
        source: {
          kind: "web_page",
          title: "Fonte A",
          authorship: "Autoria",
          publicationDate: "2026",
          identifier: null,
          language: "pt-BR",
          citationText: "Fonte A, 2026.",
          url: "http://example.test/fonte-a",
          editionOrVersion: null,
          origin: "external",
          availability: "open_access",
          verificationStatus: "author_verified",
          studyVisibility: "citation"
        }
      }
    }),
    (error) => error.code === "invalid_course_source"
  );

  const leakedCitations = clientWithFetch(async () => jsonResponse({
    ...citations,
    citations: [{ ...citations.citations[0], studyVisibility: "hidden" }]
  })).client;
  await assert.rejects(
    () => leakedCitations.getStudyUnitCitations(
      COURSE_ID,
      "unit-a",
      { expectedRevision: 4 }
    ),
    (error) => error.code === "invalid_course_study_citations"
  );
  const driftedRead = clientWithFetch(async () => jsonResponse({
    ok: true,
    data: { ...read, courseId: USER_ID }
  })).client;
  await assert.rejects(
    () => driftedRead.loadCourseSources(COURSE_ID, {
      expectedRevision: 4,
      mode: "target",
      targetKind: "study_unit",
      targetId: "unit-a"
    }),
    /não corresponde ao pedido/u
  );
});

test("PDF de Fonte é hasheado, enviado sem sobrescrever e confirmado no mesmo comando", async () => {
  const sourceId = "source-pdf";
  const contentHash = "f581fc87f30296eff11777c3ce1b9a8b7077071ad8abedfcba317fef0c807224";
  const storagePath = `${COURSE_ID}/${contentHash}.pdf`;
  const pdf = new Blob(["%PDF-1.7\nfixture"], { type: "application/pdf" });
  const calls = [];
  let revision = 4;
  let linked = false;
  const { client } = clientWithFetch(async (url, init) => {
    if (init.body === pdf) {
      calls.push({ kind: "upload", url, init });
      assert.equal(init.method, "POST");
      assert.equal(init.headers.get("x-upsert"), "false");
      assert.equal(init.headers.get("Authorization"), "Bearer token");
      assert.equal(init.headers.get("apikey"), "publishable");
      assert.equal(init.headers.get("Content-Type"), "application/pdf");
      assert.equal(init.headers.get("cache-control"), "3600");
      assert.match(url, new RegExp(
        `/storage/v1/object/course-source-pdfs/${COURSE_ID}/${contentHash}\\.pdf$`,
        "u"
      ));
      assert.equal(init.body.size, pdf.size);
      return new Response("{}", { status: 200 });
    }
    const body = JSON.parse(init.body);
    calls.push({ kind: "edge", url, body });
    if (body.view === "course_source_attachment") {
      assert.deepEqual(body, {
        courseId: COURSE_ID,
        view: "course_source_attachment",
        attachmentOperation: "prepare_upload",
        expectedRevision: revision,
        sourceId,
        sourceRevision: 1,
        contentHash,
        byteSize: pdf.size,
        mediaType: "application/pdf"
      });
      return jsonResponse({ ok: true, data: {
        contract: "aralearn.course-source-attachment-access.v2",
        courseId: COURSE_ID,
        courseRevision: revision,
        operation: "prepare_upload",
        sourceId,
        sourceRevision: 1,
        storageOriginCourseId: COURSE_ID,
        attachment: { contentHash, byteSize: pdf.size, mediaType: "application/pdf", storagePath },
        uploadRequired: !linked,
        alreadyLinked: linked,
        signedUrl: null,
        expiresAt: null
      }});
    }
    if (body.operation === "update_course_sources") {
      assert.equal(body.sourceCommand.type, "attach_pdf");
      assert.deepEqual(body.sourceCommand.attachment, {
        contentHash,
        byteSize: pdf.size,
        mediaType: "application/pdf",
        storagePath
      });
      const changed = !linked;
      linked = true;
      if (changed) revision += 1;
      return jsonResponse({ ok: true, data: {
        contract: "aralearn.course-source-change.v1",
        courseId: COURSE_ID,
        courseRevision: revision,
        requestId: body.requestId,
        idempotent: !changed,
        changed,
        change: changed ? { type: "attach_pdf", subjectId: sourceId, revision: 1 } : null
      }});
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  const first = await client.uploadCourseSourcePdf({
    requestId: "request-pdf-client-1",
    courseId: COURSE_ID,
    expectedRevision: 4,
    sourceId,
    sourceRevision: 1,
    file: pdf
  });
  assert.equal(first.changed, true);
  const second = await client.uploadCourseSourcePdf({
    requestId: "request-pdf-client-2",
    courseId: COURSE_ID,
    expectedRevision: 5,
    sourceId,
    sourceRevision: 1,
    file: pdf
  });
  assert.equal(second.changed, false);
  assert.equal(calls.filter(({ kind }) => kind === "upload").length, 1);

  let downloadBody = null;
  const downloadClient = clientWithFetch(async (url, init) => {
    downloadBody = JSON.parse(init.body);
    return jsonResponse({ ok: true, data: {
      contract: "aralearn.course-source-attachment-access.v1",
      courseId: COURSE_ID,
      courseRevision: 5,
      operation: "download",
      sourceId,
      sourceRevision: 1,
      storageOriginCourseId: COURSE_ID,
      attachment: { contentHash, byteSize: pdf.size, mediaType: "application/pdf", storagePath },
      uploadRequired: false,
      alreadyLinked: true,
      signedUrl: "https://project.invalid/storage/v1/object/sign/path?token=download-token",
      expiresAt: "2026-08-20T12:01:00.000Z"
    }});
  }).client;
  const download = await downloadClient.getCourseSourceAttachmentDownload({
    courseId: COURSE_ID,
    expectedRevision: 5,
    sourceId,
    sourceRevision: 1,
    contentHash
  });
  assert.equal(download.operation, "download");
  assert.equal(download.contract, "aralearn.course-source-attachment-access.v1");
  assert.deepEqual(downloadBody, {
    courseId: COURSE_ID,
    view: "course_source_attachment",
    attachmentOperation: "download",
    expectedRevision: 5,
    sourceId,
    sourceRevision: 1,
    contentHash
  });

  const invalid = clientWithFetch(async () => assert.fail("Não deve abrir a rede.")).client;
  await assert.rejects(() => invalid.uploadCourseSourcePdf({
    courseId: COURSE_ID,
    expectedRevision: 4,
    sourceId,
    sourceRevision: 1,
    file: new Blob(["not a pdf"], { type: "application/pdf" })
  }), /não contém um PDF válido/u);
});

test("cliente usa o DTO factual de variantes e o nome canônico ao desvincular", async () => {
  const comparisonSetId = "81000000-0000-4000-8000-000000000008";
  const memberCourseId = "82000000-0000-4000-8000-000000000009";
  const expected = courseVariantComparisonFixture({
    sourceCourseId: COURSE_ID,
    comparisonSetId,
    memberCourseId,
    courseRevision: 7
  });
  const calls = [];
  const { client } = clientWithFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.view === "variant_comparison") {
      return jsonResponse({ ok: true, data: expected });
    }
    if (body.operation === "update_course_variants") {
      return jsonResponse({ ok: true, data: {
        contract: "aralearn.course-variant-comparison-change.v1",
        comparisonSetId,
        sourceCourseId: COURSE_ID,
        courseId: memberCourseId,
        detachedAt: "2026-08-20T15:00:00.000Z",
        changed: true,
        idempotent: false
      }});
    }
    assert.fail("Operação de variante inesperada.");
  });

  assert.deepEqual(await client.loadCourseVariantComparison(COURSE_ID, {
    comparisonSetId,
    expectedCourseRevision: 7
  }), expected);
  const detached = await client.mutateCourseVariants({
    requestId: "request-variant-client-1",
    courseId: COURSE_ID,
    command: {
      type: "detach_comparison_variant",
      comparisonSetId,
      courseId: memberCourseId
    }
  });
  assert.equal(detached.courseId, memberCourseId);
  assert.deepEqual(calls[1].variantCommand, {
    type: "detach_comparison_variant",
    comparisonSetId,
    courseId: memberCourseId
  });
  assert.equal(Object.hasOwn(calls[1], "expectedRevision"), false);
});

test("inspeção envia escopo, âncora e cursor canônicos à operação Edge", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ ok: true, data: { items: [] } });
  });

  await client.loadAuthoringOutline(COURSE_ID);
  await client.loadAuthoringStudyUnits(COURSE_ID, {
    expectedRevision: 9,
    scope: { kind: "module", id: "module-a" },
    anchorStudyUnitId: "unit-a",
    direction: "backward",
    limit: 12,
    maxBytes: 262144
  });

  assert.deepEqual(calls.map(({ body }) => body.view), ["outline", "study_units"]);
  assert.deepEqual(calls[1].body, {
    courseId: COURSE_ID,
    view: "study_units",
    expectedRevision: 9,
    scope: { kind: "module", id: "module-a" },
    anchorStudyUnitId: "unit-a",
    cursor: null,
    direction: "backward",
    limit: 12,
    maxBytes: 262144
  });
  assert.throws(
    () => client.loadAuthoringStudyUnits(COURSE_ID, {
      expectedRevision: 9,
      anchorStudyUnitId: "unit-a",
      cursor: { studyUnitId: "unit-b" }
    }),
    /Paginação da inspeção inválida/u
  );
});

test("cliente bloqueia controles no cabeçalho antes de abrir a rede", () => {
  let calls = 0;
  const { client } = clientWithFetch(async () => {
    calls += 1;
    return jsonResponse({ ok: true, data: {} });
  });
  assert.throws(
    () => client.createCourse({
      requestId: AVATAR_ID,
      title: "Curso\u0001inválido",
      objective: "Objetivo válido"
    }),
    /Título do Curso inválido/u
  );
  assert.throws(
    () => client.createCourse({
      requestId: AVATAR_ID,
      title: "Curso válido",
      objective: "Objetivo\u007finválido"
    }),
    /Objetivo do Curso inválido/u
  );
  assert.throws(
    () => client.createCourse({
      requestId: AVATAR_ID,
      title: "Curso\u0085inválido",
      objective: "Objetivo válido"
    }),
    /Título do Curso inválido/u
  );
  assert.equal(calls, 0);
});

test("perfil e acesso direto usam a mesma operação Edge do MCP", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ ok: true, data: { contract: "aralearn.person.v1" } });
  });

  await client.getPersonProfile();
  await client.updatePersonProfile({ displayName: "Pesquisadora", avatarObjectKey: null });
  await client.listCourseAccess(COURSE_ID);
  await client.grantCourseAccess({
    courseId: COURSE_ID,
    email: "Pessoa@Example.com",
    confirmed: true,
    requestId: AVATAR_ID
  });
  await client.revokeCourseAccess({
    courseId: COURSE_ID,
    userId: USER_ID,
    confirmed: true,
    requestId: AVATAR_ID
  });

  assert.equal(calls.every(({ url }) =>
    url.endsWith("/functions/v1/aralearn-course-api/app/gerirPessoas")), true);
  assert.deepEqual(calls.map(({ body }) => body.operation), [
    "read_profile", "update_profile", "list_access", "grant_access", "revoke_access"
  ]);
  assert.equal(calls[3].body.email, "pessoa@example.com");
  assert.equal(calls[3].body.confirmed, true);
  assert.equal(calls[4].body.confirmed, true);
  assert.throws(
    () => client.grantCourseAccess({
      courseId: COURSE_ID,
      email: "pessoa@example.com",
      confirmed: false
    }),
    /inválida/u
  );
});

test("avatar privado é enviado diretamente, imutável e limitado a 512 KiB", async () => {
  const calls = [];
  const avatar = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
  const downloaded = new Blob([new Uint8Array([4, 5])], { type: "image/webp" });
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/authenticated/")) return new Response(downloaded);
    return jsonResponse({});
  });

  const uploaded = await client.uploadAvatar(avatar, { objectId: AVATAR_ID });
  assert.equal(uploaded.objectKey, `${USER_ID}/${AVATAR_ID}.webp`);
  assert.match(calls[0].url, new RegExp(
    `/storage/v1/object/person-avatars/${USER_ID}/${AVATAR_ID}\\.webp$`, "u"
  ));
  assert.equal(calls[0].init.body, avatar);
  assert.equal(calls[0].init.headers.get("Content-Type"), "image/webp");
  assert.equal(calls[0].init.headers.get("x-upsert"), "false");

  const loaded = await client.loadAvatar(uploaded.objectKey);
  assert.equal(loaded.type, "image/webp");
  assert.equal(loaded.size, 2);
  await client.deleteOwnAvatar(uploaded.objectKey);
  assert.deepEqual(JSON.parse(calls[2].init.body), {
    prefixes: [`${USER_ID}/${AVATAR_ID}.webp`]
  });

  await assert.rejects(
    () => client.uploadAvatar(new Blob([
      new Uint8Array(512 * 1024 + 1)
    ], { type: "image/png" })),
    /512 KiB/u
  );
  await assert.rejects(
    () => client.deleteOwnAvatar(`${COURSE_ID}/${AVATAR_ID}.webp`),
    /próprio avatar/u
  );
});

test("exclusão da conta delega toda a limpeza à rota autenticada do aplicativo", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, body, headers: init.headers });
    return jsonResponse({
      ok: true,
      requestId: null,
      data: { contract: "aralearn.account-deletion.v1", status: "deleted" }
    });
  });

  await assert.rejects(
    () => client.deleteMyAccount({ confirmation: "excluir" }),
    /confirmação/u
  );
  const result = await client.deleteMyAccount({ confirmation: "EXCLUIR MINHA CONTA" });
  assert.deepEqual(result, {
    contract: "aralearn.account-deletion.v1",
    status: "deleted"
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/functions\/v1\/aralearn-course-api\/app\/excluirMinhaConta$/u);
  assert.deepEqual(calls[0].body, { confirmation: "EXCLUIR MINHA CONTA" });
  assert.equal(calls[0].headers.get("Authorization"), "Bearer token");
});

test("exclusão classifica perda de transporte como retomável sem apagar dados locais", async () => {
  for (const transportFailure of [
    () => { throw new TypeError("fetch failed"); },
    () => jsonResponse({ message: "upstream indisponível" }, 502)
  ]) {
    let calls = 0;
    const { client } = clientWithFetch(async () => {
      calls += 1;
      return transportFailure();
    });
    await assert.rejects(
      () => client.deleteMyAccount({ confirmation: "EXCLUIR MINHA CONTA" }),
      (error) => error.status === 503 &&
        error.code === "account_deletion_in_progress" &&
        /confirmar ou concluir/u.test(error.message)
    );
    assert.equal(calls, 1, "o navegador não repete automaticamente uma exclusão ambígua");
  }
});

test("exclusão com resposta 2xx inválida preserva o replay explícito", async () => {
  const { client } = clientWithFetch(async () => jsonResponse({ ok: true, data: null }));
  await assert.rejects(
    () => client.deleteMyAccount({ confirmation: "EXCLUIR MINHA CONTA" }),
    (error) => error.code === "account_deletion_in_progress" && error.cause instanceof TypeError
  );
});

function anchoredAnnotationFixture({
  annotationId = "60000000-0000-4000-8000-000000000006",
  origin = "author",
  channel = "authoring_interface",
  contributorKind = "self",
  contributorLabel = "Você",
  rawText = "Possível erro na Unidade",
  targetId = "unit-a"
} = {}) {
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId,
    annotationVersion: 1,
    courseId: COURSE_ID,
    provenance: { origin, channel },
    contributor: {
      kind: contributorKind,
      role: origin,
      ref: contributorKind === "self" ? "self" : null,
      label: contributorLabel
    },
    target: {
      kind: "study_unit",
      id: targetId,
      observedPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
        { kind: "study_unit", id: targetId, label: "Unidade", version: 2 }
      ],
      currentAvailable: true,
      currentPath: [
        { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
        { kind: "study_unit", id: targetId, label: "Unidade", version: 2 }
      ],
      deepLink: "https://app.invalid/#/literal-target"
    },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 2 },
    rawText,
    category: "possible_error",
    briefSummary: null,
    subjectClassification: {
      status: "unclassified",
      automatic: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      effective: {
        method: "target_scope_unclassified",
        methodVersion: 1,
        taxonomyRevision: 7,
        subjects: []
      },
      correctedAt: null
    },
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: "2026-08-17T12:00:00.000Z",
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:00:00.000Z",
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: {
      canRevise: true,
      canWithdraw: true,
      canConsider: origin === "author",
      canRespond: origin === "learner",
      canResolve: true,
      canReopen: false,
      canCorrectSubjects: true
    },
    deepLink: "https://app.invalid/#/literal-annotation"
  };
}

function anchoredAnnotationPage(query, item) {
  return {
    contract: "aralearn.course-anchored-annotation-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    annotationSetVersion: 4,
    query,
    summary: {
      matchingTotal: 1,
      byOrigin: { [item.provenance.origin]: 1 },
      byChannel: { [item.provenance.channel]: 1 },
      byState: { open: 1 },
      unclassifiedTotal: 1
    },
    items: [item],
    hasMore: false,
    nextCursor: null
  };
}

test("observações owner e Study usam contratos ligados e não aceitam spoof de canal", async () => {
  const ownerQuery = {
    mode: "inbox",
    origins: ["author"],
    channels: ["authoring_interface"],
    states: ["open"],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: null,
    annotationId: null
  };
  const studyQuery = {
    mode: "target",
    origins: [],
    channels: [],
    states: [],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: {
      target: { kind: "study_unit", id: "unit-a" },
      includeDescendants: false
    },
    annotationId: null
  };
  const ownerItem = anchoredAnnotationFixture();
  const studyItem = anchoredAnnotationFixture({
    origin: "learner",
    channel: "study_interface"
  });
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith("/app/lerCurso")) {
      return jsonResponse({ ok: true, data: anchoredAnnotationPage(
        Object.fromEntries(Object.entries(ownerQuery).reverse()),
        ownerItem
      ) });
    }
    if (url.endsWith("/app/alterarCurso")) {
      return jsonResponse({ ok: true, data: {
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: COURSE_ID,
        courseRevision: 8,
        annotationSetVersion: 5,
        requestId: "request-annotation-owner-1",
        idempotent: false,
        changed: true,
        annotation: { ...ownerItem, annotationVersion: 2, rawText: "Texto revisto" }
      } });
    }
    if (url.endsWith("/rpc/get_my_course_anchored_annotations_v1")) {
      return jsonResponse(anchoredAnnotationPage(studyQuery, studyItem));
    }
    if (url.endsWith("/rpc/execute_my_course_anchored_annotation_command_v1")) {
      return jsonResponse({
        contract: "aralearn.course-anchored-annotation-change.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        annotationSetVersion: 5,
        requestId: "request-annotation-study-1",
        idempotent: false,
        changed: true,
        annotation: studyItem
      });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  assert.deepEqual(await client.loadCourseAnchoredAnnotations(COURSE_ID, {
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query: ownerQuery,
    cursor: null,
    limit: 12
  }), anchoredAnnotationPage(ownerQuery, ownerItem));
  assert.equal(calls[0].body.annotationSetVersion, null);
  assert.equal(calls[0].body.view, "anchored_annotations");

  const revised = await client.mutateCourseAnchoredAnnotations({
    requestId: "request-annotation-owner-1",
    courseId: COURSE_ID,
    expectedCourseRevision: null,
    command: {
      type: "revise_anchored_annotation",
      annotationId: ownerItem.annotationId,
      expectedAnnotationVersion: 1,
      rawText: "Texto revisto",
      category: "possible_error",
      briefSummary: null
    }
  });
  assert.equal(revised.courseRevision, 8);
  assert.equal(Object.hasOwn(calls[1].body, "expectedRevision"), false);
  assert.equal(calls[1].body.annotationCommand.rawText, "Texto revisto");

  assert.deepEqual(await client.getMyCourseAnchoredAnnotations(COURSE_ID, {
    expectedCourseRevision: 7,
    annotationSetVersion: null,
    query: studyQuery,
    cursor: null,
    limit: 12
  }), anchoredAnnotationPage(studyQuery, studyItem));
  assert.deepEqual(calls[2].body, {
    p_course_id: COURSE_ID,
    p_expected_course_revision: 7,
    p_annotation_set_version: null,
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_cursor: null,
    p_limit: 12
  });

  await client.executeMyCourseAnchoredAnnotationCommand({
    requestId: "request-annotation-study-1",
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId: studyItem.annotationId,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro na Unidade",
      category: "possible_error",
      capturedAt: null,
      briefSummary: null
    }
  });
  assert.equal(Object.hasOwn(calls[3].body, "origin"), false);
  assert.equal(Object.hasOwn(calls[3].body, "channel"), false);
  assert.equal(calls[3].body.p_expected_course_revision, 7);
  await assert.rejects(
    () => client.executeMyCourseAnchoredAnnotationCommand({
      requestId: "request-annotation-study-2",
      courseId: COURSE_ID,
      expectedCourseRevision: 7,
      command: {
        type: "create_anchored_annotation",
        annotationId: studyItem.annotationId,
        target: { kind: "study_unit", id: "unit-a" },
        rawText: "Texto",
        category: null,
        capturedAt: null,
        briefSummary: null
      },
      channel: "authoring_chat"
    }),
    /Alteração de observação inválid/u
  );
});

test("cliente owner lê e altera audit_cycle sem cache, alias ou autoridade estrutural", async () => {
  const calls = [];
  const findingId = "60000000-0000-5000-8000-000000000006";
  const auditRunId = "50000000-0000-5000-8000-000000000005";
  const query = {
    mode: "findings",
    targetStudyUnitId: "unit-a",
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: ["open"],
    dimensions: ["factual_quality"],
    severities: ["high"],
    annotationIds: []
  };
  const page = {
    contract: "aralearn.course-audit-cycle-page.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    auditSetVersion: 4,
    query,
    summary: {
      matchingTotal: 0,
      byState: { open: 0, awaiting_verification: 0, resolved: 0, dismissed: 0 },
      byDimension: {
        structural_conformance: 0,
        pedagogical_quality: 0,
        factual_quality: 0,
        editorial_quality: 0
      },
      bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
    },
    context: null,
    items: [],
    runs: [],
    detail: null,
    runDetail: null,
    hasMore: false,
    nextCursor: null
  };
  const requestId = "request-audit-client-0001";
  const { client } = clientWithFetch(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url.endsWith("/app/lerCurso")) {
      if (body.mode === "detail" && body.auditRunId === auditRunId) {
        const check = (dimension, result, index) => ({
          checkId: `50000000-0000-5000-8000-${String(index).padStart(12, "0")}`,
          dimension,
          criterion: {
            code: `${dimension}.review`,
            version: "1",
            statement: `Critério público de ${dimension}.`
          },
          result,
          publicEvidence: `Evidência pública de ${dimension}.`,
          adequacy: result === "passed" ? "sufficient" : "not_assessed",
          planItemRefs: [],
          parameterRefs: [],
          sourceLinks: []
        });
        const checks = [
          check("structural_conformance", "passed", 1),
          check("pedagogical_quality", "not_checked", 2),
          check("factual_quality", "not_checked", 3),
          check("editorial_quality", "not_checked", 4)
        ];
        return jsonResponse({ ok: true, data: {
          ...page,
          query: {
            mode: "detail",
            targetStudyUnitId: null,
            findingId: null,
            correctionId: null,
            auditRunId,
            states: [],
            dimensions: [],
            severities: [],
            annotationIds: []
          },
          runDetail: {
            contract: "aralearn.course-instructional-audit-run.v1",
            auditRunId,
            runKind: "audit",
            origin: "human_audit",
            method: { id: "manual-review", version: "1" },
            courseRevision: 7,
            contextHash: "b".repeat(64),
            target: {
              studyUnitId: "unit-a",
              version: 2,
              hash: "a".repeat(64),
              path: [
                { kind: "course", id: COURSE_ID, label: "Curso", version: 7 },
                { kind: "module", id: "module-a", label: "Módulo", version: 1 },
                { kind: "lesson", id: "lesson-a", label: "Lição", version: 1 },
                { kind: "didactic_microsequence", id: "micro-a", label: "Micro", version: 1 },
                { kind: "study_unit", id: "unit-a", label: "Unidade", version: 2 }
              ]
            },
            checks,
            metrics: {
              checksTotal: 4,
              byResult: {
                passed: 1, failed: 0, uncertain: 0, not_applicable: 0, not_checked: 3
              },
              findingsCreated: 0
            },
            createdAt: "2026-08-17T12:00:00.000Z"
          }
        } });
      }
      if (body.mode === "runs") {
        return jsonResponse({ ok: true, data: {
          ...page,
          query: {
            mode: "runs",
            targetStudyUnitId: "unit-a",
            findingId: null,
            correctionId: null,
            auditRunId: null,
            states: [],
            dimensions: [],
            severities: [],
            annotationIds: []
          },
          runs: [{
            auditRunId,
            runKind: "audit",
            origin: "human_audit",
            method: { id: "manual-review", version: "1" },
            courseRevision: 7,
            target: { studyUnitId: "unit-a", version: 2, hash: "a".repeat(64) },
            resultCounts: {
              passed: 1, failed: 0, uncertain: 0, not_applicable: 0, not_checked: 3
            },
            findingsCreated: 0,
            createdAt: "2026-08-17T12:00:00.000Z",
            deepLink: "https://app.example/#/authoring/courses/" + COURSE_ID +
              `?section=observations&auditRunId=${auditRunId}`
          }]
        } });
      }
      return jsonResponse({ ok: true, data: page });
    }
    if (url.endsWith("/app/alterarCurso")) {
      return jsonResponse({ ok: true, data: {
        contract: "aralearn.course-audit-cycle-change.v1",
        courseId: COURSE_ID,
        courseRevision: 7,
        auditSetVersion: 5,
        requestId,
        idempotent: false,
        changed: false,
        change: null,
        finding: null,
        correction: null,
        suggestedAnnotationActions: []
      } });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  assert.deepEqual(await client.loadCourseAuditCycle(COURSE_ID, {
    expectedCourseRevision: 7,
    auditSetVersion: 4,
    query,
    cursor: "YWZ0ZXI=",
    limit: 12
  }), page);
  assert.deepEqual(calls[0].body, {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    auditSetVersion: 4,
    mode: "findings",
    limit: 12,
    targetStudyUnitId: "unit-a",
    states: ["open"],
    dimensions: ["factual_quality"],
    severities: ["high"],
    cursor: "YWZ0ZXI="
  });

  const changed = await client.mutateCourseAuditCycle({
    requestId,
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    command: {
      type: "decide_finding",
      findingId,
      expectedFindingVersion: 2,
      decision: "dismiss"
    }
  });
  assert.equal(changed.changed, false);
  assert.deepEqual(calls[1].body, {
    requestId,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: {
      type: "decide_finding",
      findingId,
      expectedFindingVersion: 2,
      decision: "dismiss"
    }
  });

  const runs = await client.loadCourseAuditCycle(COURSE_ID, {
    expectedCourseRevision: 7,
    auditSetVersion: 4,
    query: {
      mode: "runs",
      targetStudyUnitId: "unit-a",
      findingId: null,
      correctionId: null,
      auditRunId: null,
      states: [],
      dimensions: [],
      severities: [],
      annotationIds: []
    },
    cursor: "cnVuLTI=",
    limit: 6
  });
  assert.equal(runs.runs[0].findingsCreated, 0);
  assert.deepEqual(calls[2].body, {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    auditSetVersion: 4,
    mode: "runs",
    limit: 6,
    targetStudyUnitId: "unit-a",
    cursor: "cnVuLTI="
  });

  const runDetail = await client.loadCourseAuditCycle(COURSE_ID, {
    expectedCourseRevision: 7,
    auditSetVersion: 4,
    query: {
      mode: "detail",
      targetStudyUnitId: null,
      findingId: null,
      correctionId: null,
      auditRunId,
      states: [],
      dimensions: [],
      severities: [],
      annotationIds: []
    },
    cursor: null,
    limit: 1
  });
  assert.equal(runDetail.runDetail.target.path.at(-1).id, "unit-a");
  assert.deepEqual(calls[3].body, {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    auditSetVersion: 4,
    mode: "detail",
    limit: 1,
    auditRunId
  });

  await assert.rejects(() => client.mutateCourseAuditCycle({
    requestId: "request-audit-client-0002",
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    command: {
      type: "record_audit",
      auditRunId: "70000000-0000-5000-8000-000000000007",
      targetStudyUnitId: "unit-a",
      contextHash: "a".repeat(64),
      origin: "human_audit",
      method: { id: "manual-review", version: "1" },
      checks: [],
      findings: []
    }
  }), /checks/u);
  assert.equal(calls.length, 4);
});

test("cliente owner lê o recorte de Pesquisa pelo mesmo lerCurso", async () => {
  const calls = [];
  const query = {
    datasets: ["design"],
    channels: [],
    origins: [],
    states: [],
    from: null,
    to: null,
    limit: 25,
    cursor: null
  };
  const page = {
    contract: "aralearn.course-authoring-analytics.v1",
    dictionaryVersion: "aralearn.course-authoring-analytics-dictionary.v1",
    courseId: COURSE_ID,
    courseRevision: 7,
    generatedAt: "2026-08-20T09:00:00.000Z",
    query,
    metrics: [{
      id: "facts_by_kind",
      version: 1,
      label: "Fatos por tipo e estado",
      question: "Quais fatos e estados aparecem no conjunto selecionado?",
      definition: "Conta cada fato uma vez.",
      unit: "count",
      denominator: "Todos os fatos do recorte.",
      missingData: "A ausência permanece indicada.",
      prohibitedInferences: ["Não mede aprendizagem."]
    }],
    overview: {
      metricId: "facts_by_kind",
      title: "Fatos por tipo e estado",
      question: "Quais fatos e estados aparecem no conjunto selecionado?",
      series: [{
        key: "no_facts",
        label: "Nenhum fato",
        value: 0,
        unit: "count",
        denominator: 0,
        missing: false
      }]
    },
    facts: [],
    nextCursor: null,
    limitations: ["Não mede aprendizagem."],
    deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}?section=research`
  };
  const { client } = clientWithFetch(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return jsonResponse({ ok: true, data: page });
  });

  assert.deepEqual(await client.loadCourseAuthoringAnalytics(COURSE_ID, {
    expectedCourseRevision: 7,
    query
  }), page);
  assert.match(calls[0].url, /\/app\/lerCurso$/u);
  assert.deepEqual(calls[0].body, {
    courseId: COURSE_ID,
    view: "research",
    expectedRevision: 7,
    datasets: ["design"],
    channels: [],
    origins: [],
    states: [],
    from: null,
    to: null,
    limit: 25,
    cursor: null
  });
});

test("retry após resposta perdida aceita receipt idempotente na revisão corrente", async () => {
  const calls = [];
  let attempt = 0;
  let targetId = "unit-a";
  let courseRevision = 9;
  const { client } = clientWithFetch(async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    attempt += 1;
    if (attempt === 1) throw new TypeError("Failed to fetch");
    return jsonResponse({ ok: true, data: {
      contract: "aralearn.course-anchored-annotation-change.v1",
      courseId: COURSE_ID,
      courseRevision,
      annotationSetVersion: 6,
      requestId: body.requestId,
      idempotent: true,
      changed: false,
      annotation: anchoredAnnotationFixture({
        rawText: "Possível erro na Unidade",
        targetId
      })
    } });
  });
  const mutation = {
    requestId: "request-annotation-replay-1",
    courseId: COURSE_ID,
    expectedCourseRevision: 7,
    command: {
      type: "create_anchored_annotation",
      annotationId: "60000000-0000-4000-8000-000000000006",
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro na Unidade",
      category: "possible_error",
      capturedAt: null,
      briefSummary: null
    }
  };

  await assert.rejects(
    () => client.mutateCourseAnchoredAnnotations(mutation),
    /Failed to fetch/u
  );
  const replay = await client.mutateCourseAnchoredAnnotations(mutation);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.courseRevision, 9);
  assert.deepEqual(calls[0], calls[1]);

  targetId = "unit-b";
  await assert.rejects(
    () => client.mutateCourseAnchoredAnnotations({
      ...mutation,
      requestId: "request-annotation-replay-2"
    }),
    /não corresponde ao comando/u
  );

  targetId = "unit-a";
  courseRevision = 6;
  await assert.rejects(
    () => client.mutateCourseAnchoredAnnotations({
      ...mutation,
      requestId: "request-annotation-replay-3"
    }),
    /não corresponde ao comando/u
  );
});
