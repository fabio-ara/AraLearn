import test from "node:test";
import assert from "node:assert/strict";

import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from
  "../../src/domain/courseDesignParameters.js";
import { RESOURCE_PACKAGE_REGISTRY } from
  "../../src/resources/catalog/resourceCatalog.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";
const PART_ID = "40000000-0000-4000-8000-000000000004";
const MATERIALIZATION_ID = "50000000-0000-4000-8000-000000000005";
const STEP_ID = "60000000-0000-4000-8000-000000000006";
const PLAN_ITEM_ID = "70000000-0000-4000-8000-000000000007";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function adapter(fetchImpl, options = {}) {
  return new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example/AraLearn/",
    fetchImpl,
    attempts: 1,
    ...options
  });
}

function componentCatalog() {
  return {
    version: "1-3e5629f8",
    options: RESOURCE_PACKAGE_REGISTRY.listCatalog().map((manifest) => ({
      ref: `${manifest.id}@${manifest.version}`,
      label: manifest.label,
      purpose: manifest.purpose
    }))
  };
}

function defaultComponentPolicy(excludedRefs = []) {
  return {
    catalogVersion: "1-3e5629f8",
    availability: "all",
    allowedRefs: [],
    excludedRefs,
    preferredRefs: []
  };
}

function studyUnitUpsert() {
  return {
    entityType: "study_unit",
    entityId: "unit-a",
    parentType: "microsequence",
    parentId: "micro-a",
    position: 1,
    content: {
      title: "Unidade A",
      role: "theory",
      content: [{
        id: "paragraph-a",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Conteúdo explicado." }
      }],
      response: null,
      feedback: [],
      topics: []
    }
  };
}

function contextParameters() {
  return COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
    parameterId: definition.id,
    value: structuredClone(definition.defaultValue),
    origin: "system_default",
    reason: "Hipótese padrão de produto.",
    sourceScope: null
  }));
}

function designContext({ excludedRefs = [], targets = true, contextSources = [] } = {}) {
  const inheritedPolicy = excludedRefs.length
    ? {
        changeId: "1",
        policy: defaultComponentPolicy(excludedRefs),
        origin: "author",
        reason: "Componente excluído pelo autor.",
        sourceScope: { kind: "course", ref: COURSE_ID }
      }
    : {
        changeId: null,
        policy: defaultComponentPolicy(),
        origin: "system_default",
        reason: "Todos os componentes instalados estão disponíveis por padrão.",
        sourceScope: null
      };
  return {
    contract: "aralearn.course-design-context.v2",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    componentCatalogVersion: "1-3e5629f8",
    instructionalAnalysisUnits: [{
      id: PLAN_ID,
      position: 0,
      statement: "Explicar a relação entre configuração e concessão.",
      version: 1
    }],
    evidenceRequirements: [{
      id: STEP_ID,
      position: 0,
      statement: "Explica a relação em dois casos distintos.",
      version: 1
    }],
    guidanceRevisions: [],
    targets: targets ? [{
      didacticMicrosequenceId: "micro-a",
      instructionalAnalysisUnitIds: [PLAN_ID],
      evidenceRequirementIds: [STEP_ID],
      parameters: contextParameters(),
      guidanceRevisionIds: [],
      componentPolicy: inheritedPolicy,
      sourceAttributions: {
        instructionalAnalysisUnits: [{
          planItemId: PLAN_ID,
          planItemVersion: 1,
          targetHash: "b".repeat(64),
          attributionRevision: 1,
          attributionHash: "c".repeat(64),
          sources: structuredClone(contextSources)
        }],
        evidenceRequirements: [{
          planItemId: STEP_ID,
          planItemVersion: 1,
          targetHash: "d".repeat(64),
          attributionRevision: 1,
          attributionHash: "e".repeat(64),
          sources: []
        }]
      }
    }] : []
  };
}

function runningMaterialization({
  excludedRefs = [],
  stepKind = "didactic_microsequence_materialization",
  contextSources = []
} = {}) {
  const didactic = stepKind === "didactic_microsequence_materialization";
  const step = {
    id: STEP_ID,
    position: 0,
    kind: stepKind,
    targetDidacticMicrosequenceId: didactic ? "micro-a" : null,
    productionPosition: didactic ? 0 : null,
    status: "pending",
    version: 1,
    resultFacts: {},
    updatedAt: "2026-08-17T10:00:00Z",
    completedAt: null
  };
  return {
    contract: "aralearn.course-authoring-part-materialization.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    materialization: {
      id: MATERIALIZATION_ID,
      authoringPartVersion: 2,
      channel: "mcp",
      status: "running",
      version: 1,
      designContext: designContext({ excludedRefs, contextSources }),
      contextHash: "a".repeat(64),
      resultFacts: {},
      startedAt: "2026-08-17T10:00:00Z",
      updatedAt: "2026-08-17T10:00:00Z",
      completedAt: null,
      steps: [step],
      nextPendingStep: step
    }
  };
}

function materializationChange({
  operation = "start",
  channel = "mcp",
  stepKind = "context_load",
  version = 1,
  authoringPartVersion = 1,
  completedStepCount = 0,
  failedStepCount = 0,
  status = "running",
  contextSources = []
} = {}) {
  const didactic = stepKind === "didactic_microsequence_materialization";
  const completed = operation === "record_step";
  const nextPendingStep = status === "running" && !completed && failedStepCount === 0
    ? {
        id: STEP_ID,
        position: 0,
        kind: stepKind,
        targetDidacticMicrosequenceId: didactic ? "micro-a" : null,
        productionPosition: didactic ? 0 : null
      }
    : null;
  return {
    contract: "aralearn.course-authoring-materialization-change.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    operation,
    channel,
    changed: true,
    idempotent: false,
    materialization: {
      id: MATERIALIZATION_ID,
      status,
      version,
      authoringPartVersion,
      completedStepCount,
      failedStepCount,
      totalStepCount: 1,
      nextPendingStep,
      updatedAt: "2026-08-17T10:01:00Z",
      completedAt: status === "running" ? null : "2026-08-17T10:01:00Z",
      designContext: designContext({ targets: didactic, contextSources }),
      contextHash: "a".repeat(64)
    },
    step: completed ? {
      id: STEP_ID,
      status: failedStepCount ? "failed" : "completed",
      version: 2
    } : null,
    entities: {
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
      linkedDidacticMicrosequenceId: didactic && completed ? "micro-a" : null
    }
  };
}

function courseDesignRead() {
  return {
    contract: "aralearn.course-design.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    parameterCatalogVersion: "1.0.0",
    scopeContext: {
      current: { kind: "course", ref: COURSE_ID, label: "Curso" },
      ancestors: [],
      children: [],
      childCount: 0,
      hasMoreChildren: false,
      nextChildCursor: null
    },
    targetPlanItems: null,
    definitions: structuredClone(COURSE_DESIGN_PARAMETER_DEFINITIONS),
    parameters: COURSE_DESIGN_PARAMETER_DEFINITIONS.map((definition) => ({
      parameterId: definition.id,
      localAssignment: null,
      effectiveAssignment: {
        changeId: null,
        value: structuredClone(definition.defaultValue),
        origin: "system_default",
        reason: "Hipótese padrão de produto.",
        sourceScope: null,
        inherited: false
      }
    })),
    guidance: { localRevision: null, effectiveRevisions: [] },
    componentCatalog: componentCatalog(),
    componentPolicy: {
      localChange: null,
      effectiveChange: {
        changeId: null,
        policy: defaultComponentPolicy(),
        origin: "system_default",
        reason: "Todos os componentes instalados estão disponíveis por padrão.",
        sourceScope: null,
        inherited: false
      }
    },
    recentApplications: []
  };
}

test("interrompe a leitura quando a resposta do banco excede o teto em bytes", async () => {
  let cancelled = false;
  const encoder = new TextEncoder();
  const value = adapter(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('{"items":["'));
      controller.enqueue(encoder.encode("x".repeat(80)));
      controller.enqueue(encoder.encode('"]}'));
    },
    cancel() {
      cancelled = true;
    }
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  }), { responseLimitBytes: 64 });

  await assert.rejects(
    () => value.listCourses({ principal: { actorId: USER_ID } }),
    (error) => error.status === 413 && error.code === "course_response_too_large"
  );
  assert.equal(cancelled, true);
});

test("autentica sessão do aplicativo sem resolver governança paralela", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, init });
    return json({ id: USER_ID });
  });
  const principal = await value.resolveApplicationPrincipal("session-token");

  assert.deepEqual(principal, {
    actorId: USER_ID,
    authenticationKind: "application",
    scopes: ["authoring:read", "authoring:write"]
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/user$/u);
});

test("lista por RPC de Curso e acrescenta deep link fora do banco", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_courses_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-list.v1",
      items: [{ courseId: COURSE_ID, title: "Curso" }],
      hasMore: false,
      nextCursor: null
    });
  });
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    query: "curso",
    limit: 12
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_limit, 12);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`
  );
});

test("não transforma id genérico em identidade ou deep link de Curso", async () => {
  const value = adapter(async () => json({
    contract: "aralearn.course-list.v1",
    items: [{ id: COURSE_ID, title: "Contrato inválido" }],
    hasMore: false,
    nextCursor: null
  }));
  const result = await value.listCourses({
    principal: { actorId: USER_ID },
    limit: 12
  });

  assert.equal(result.items[0].id, COURSE_ID);
  assert.equal(Object.hasOwn(result.items[0], "deepLink"), false);
});

test("lê entidades para o MCP com ator e cerca de versão", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_entities_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({ courseId: COURSE_ID, revision: 7, items: [], hasMore: false });
  });
  const result = await value.listCourseEntities({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    limit: 40,
    afterEntityType: "lesson",
    afterEntityId: "lesson-a"
  });
  assert.equal(result.revision, 7);
  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_expected_revision, 7);
  assert.equal(payload.p_after_entity_id, "lesson-a");
});

test("lê inspeção curricular limitada e acrescenta link exato da Unidade", async () => {
  let payload = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /\/rpc\/list_owned_course_study_units_for_actor_v1$/u);
    payload = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-study-unit-inspection-page.v1",
      courseId: COURSE_ID,
      courseRevision: 7,
      scope: { kind: "authoring_part", id: PART_ID },
      totalCount: 1,
      scopeOptions: {
        authoringParts: [{
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        }],
        unassignedStudyUnitCount: 0
      },
      items: [{
        studyUnit: {
          id: "unit-a",
          position: 1,
          title: "Unidade A",
          role: "theory",
          content: [{
            id: "paragraph-a",
            package: "aralearn.resource.paragraph",
            version: "1.0.0",
            data: { text: "Conteúdo da Unidade A." }
          }],
          response: null,
          feedback: [],
          topics: []
        },
        version: 2,
        updatedAt: "2026-08-17T10:00:00Z",
        ordinal: 1,
        curriculumPath: {
          module: { id: "module-a", position: 0, title: "Módulo A" },
          lesson: { id: "lesson-a", position: 0, title: "Lição A" },
          didacticMicrosequence: { id: "micro-a", position: 0, title: "Micro A" }
        },
        authoringPart: {
          id: PART_ID,
          position: 0,
          title: "Parte A",
          state: "materialized"
        }
      }],
      hasPrevious: false,
      hasMore: false,
      previousCursor: null,
      nextCursor: null,
      pageBytes: 640
    });
  });

  const result = await value.listCourseStudyUnits({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 7,
    scopeKind: "authoring_part",
    scopeId: PART_ID,
    anchorStudyUnitId: "unit-a",
    direction: "backward",
    limit: 12,
    maxBytes: 262144
  });

  assert.equal(payload.p_actor_id, USER_ID);
  assert.equal(payload.p_scope_kind, "authoring_part");
  assert.equal(payload.p_anchor_study_unit_id, "unit-a");
  assert.equal(payload.p_max_bytes, 262144);
  assert.equal(
    result.items[0].deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}` +
      "?section=inspection&studyUnitId=unit-a"
  );
});

test("lê e altera parâmetros por RPC owner-only com catálogo validado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v1")) {
      return json(courseDesignRead());
    }
    if (url.endsWith("/rpc/apply_course_design_command_for_actor_v1")) {
      return json({
        contract: "aralearn.course-design-change.v1",
        courseId: COURSE_ID,
        courseRevision: 6,
        requestId: "request-design-0001",
        idempotent: false,
        changed: true,
        change: {
          changeId: "1",
          type: "clear_guidance",
          scope: { kind: "course", ref: COURSE_ID }
        }
      });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "course",
    scopeRef: COURSE_ID,
    childLimit: 16,
    childCursor: null
  });
  assert.equal(read.componentCatalog.options.length, 32);
  assert.equal(Object.hasOwn(read, "deepLink"), false);

  const changed = await value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-design-0001",
    expectedCourseRevision: 5,
    command: {
      type: "clear_guidance",
      scope: { kind: "course", ref: COURSE_ID }
    }
  });
  assert.equal(changed.changed, true);
  assert.equal(Object.hasOwn(changed, "deepLink"), false);
  assert.deepEqual(calls.map(({ name }) => name), [
    "get_owned_course_design_for_actor_v1",
    "apply_course_design_command_for_actor_v1"
  ]);
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_scope_kind: "course",
    p_scope_ref: COURSE_ID,
    p_child_limit: 16,
    p_child_cursor: null
  });
  assert.equal(calls[1].payload.p_channel, "application");
  assert.equal(calls[1].payload.p_expected_course_revision, 5);

  const drifted = courseDesignRead();
  drifted.componentCatalog.options[0].purpose = "Contrato divergente";
  const invalid = adapter(async () => json(drifted));
  await assert.rejects(
    () => invalid.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  const oversized = adapter(async () => json({
    code: "54000",
    message: "Leitura de desenho excede 256 KiB."
  }, 400));
  await assert.rejects(
    () => oversized.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.status === 413 && error.code === "course_design_response_too_large"
  );

  const reordered = courseDesignRead();
  [reordered.componentCatalog.options[0], reordered.componentCatalog.options[1]] =
    [reordered.componentCatalog.options[1], reordered.componentCatalog.options[0]];
  const wrongOrder = adapter(async () => json(reordered));
  await assert.rejects(
    () => wrongOrder.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "component_catalog_drift"
  );

  const wrongScope = courseDesignRead();
  wrongScope.scopeContext.current = { kind: "lesson", ref: "lesson-a", label: "Lição A" };
  const mismatchedRead = adapter(async () => json(wrongScope));
  await assert.rejects(
    () => mismatchedRead.getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "course",
      scopeRef: COURSE_ID
    }),
    (error) => error.code === "course_service_unavailable"
  );

  const mismatchedChange = adapter(async () => json({
    contract: "aralearn.course-design-change.v1",
    courseId: "10000000-0000-4000-8000-000000000099",
    courseRevision: 6,
    requestId: "request-design-other",
    idempotent: false,
    changed: true,
    change: {
      changeId: "1",
      type: "clear_guidance",
      scope: { kind: "course", ref: "10000000-0000-4000-8000-000000000099" }
    }
  }));
  await assert.rejects(
    () => mismatchedChange.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-0001",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("Fontes usam RPC owner-only, DTO exato, bind de consulta e teto de 256 KiB", async () => {
  const calls = [];
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  const readResult = {
    contract: "aralearn.course-sources.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    mode: "catalog",
    query: { sourceId: null, targetId: null, targetKind: null },
    items: [{
      sourceId: "source-a",
      revision: 1,
      status: "active",
      kind: "web_page",
      title: "Fonte A",
      citationText: "Fonte A, 2026.",
      url: "https://example.test/fonte-a",
      editionOrVersion: null,
      studyVisibility: "citation_and_link",
      anchorCount: 0,
      createdAt: "2026-08-17T10:00:00Z"
    }],
    nextCursor: null
  };
  const changeResult = {
    contract: "aralearn.course-source-change.v1",
    courseId: COURSE_ID,
    courseRevision: 6,
    requestId: "request-source-0001",
    idempotent: false,
    changed: true,
    change: { type: "retire_source", subjectId: legacySourceId, revision: 2 }
  };
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/get_owned_course_sources_for_actor_v1")) return json(readResult);
    if (url.endsWith("/execute_course_source_command_for_actor_v1")) {
      return json(changeResult);
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const read = await value.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "catalog"
  });
  assert.equal(read.items[0].sourceId, "source-a");
  assert.deepEqual(calls[0].payload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "catalog",
    p_source_id: null,
    p_target_kind: null,
    p_target_id: null,
    p_cursor: null,
    p_limit: 10
  });

  let contextualPayload = null;
  const contextualResult = {
    ...readResult,
    mode: "source",
    query: {
      sourceId: legacySourceId,
      targetKind: "study_unit",
      targetId: "unit-a"
    },
    items: [],
    nextCursor: null
  };
  const contextualValue = adapter(async (_url, init) => {
    contextualPayload = JSON.parse(init.body);
    return json(contextualResult);
  });
  assert.deepEqual(await contextualValue.getCourseSources({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    expectedRevision: 5,
    mode: "source",
    sourceId: legacySourceId,
    targetKind: "study_unit",
    targetId: "unit-a"
  }), contextualResult);
  assert.deepEqual(contextualPayload, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_expected_revision: 5,
    p_mode: "source",
    p_source_id: legacySourceId,
    p_target_kind: "study_unit",
    p_target_id: "unit-a",
    p_cursor: null,
    p_limit: 10
  });

  const changed = await value.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-source-0001",
    expectedCourseRevision: 5,
    command: {
      type: "retire_source",
      sourceId: legacySourceId,
      expectedSourceRevision: 1
    }
  });
  assert.equal(changed.courseRevision, 6);
  assert.equal(calls[1].payload.p_channel, "mcp");
  assert.deepEqual(calls[1].payload.p_command, {
    type: "retire_source",
    sourceId: legacySourceId,
    expectedSourceRevision: 1
  });

  let linkedPayload = null;
  const linkedValue = adapter(async (_url, init) => {
    linkedPayload = JSON.parse(init.body);
    return json({
      ...changeResult,
      requestId: "request-source-links-1",
      change: { type: "set_target_sources", subjectId: "unit-a", revision: 3 }
    });
  });
  const legacyLinks = [{
    sourceId: legacySourceId,
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }];
  await linkedValue.executeCourseSourceCommand({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-source-links-1",
    expectedCourseRevision: 5,
    command: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: legacyLinks
    }
  });
  assert.deepEqual(linkedPayload.p_command.sourceLinks, legacyLinks);

  for (const spoofed of [
    { ...readResult, courseId: USER_ID },
    { ...readResult, query: { sourceId: "source-a", targetKind: null, targetId: null } },
    { ...readResult, items: [{ ...readResult.items[0], actorId: USER_ID }] },
    { ...readResult, nextCursor: "source:cursor" }
  ]) {
    const invalid = adapter(async () => json(spoofed));
    await assert.rejects(
      () => invalid.getCourseSources({
        principal: { actorId: USER_ID },
        courseId: COURSE_ID,
        expectedRevision: 5,
        mode: "catalog"
      }),
      (error) => error.status === 503 && error.code === "course_service_unavailable"
    );
  }

  const oversized = adapter(async () => json({ payload: "x".repeat(270_000) }));
  await assert.rejects(
    () => oversized.getCourseSources({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      expectedRevision: 5,
      mode: "catalog"
    }),
    (error) => error.status === 413 && error.code === "course_sources_response_too_large"
  );

  await assert.rejects(
    () => value.executeCourseSourceCommand({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-source-bad-1",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: "source-a",
        expectedSourceRevision: 1,
        actorId: USER_ID
      }
    }),
    (error) => error.status === 422 && error.code === "invalid_course_source_command"
  );

  const spoofedChange = adapter(async () => json({
    ...changeResult,
    change: { ...changeResult.change, subjectId: "source-other" }
  }));
  await assert.rejects(
    () => spoofedChange.executeCourseSourceCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-source-0001",
      expectedCourseRevision: 5,
      command: {
        type: "retire_source",
        sourceId: legacySourceId,
        expectedSourceRevision: 1
      }
    }),
    (error) => error.status === 503 && error.code === "course_service_unavailable"
  );
});

test("normaliza targetPlanItems e encaminha a atribuição multi-alvo sem aliases", async () => {
  const readFixture = courseDesignRead();
  readFixture.scopeContext = {
    current: { kind: "didactic_microsequence", ref: "micro-a", label: "Micro A" },
    ancestors: [
      { kind: "course", ref: COURSE_ID, label: "Curso" },
      { kind: "module", ref: "module-a", label: "Módulo A" },
      { kind: "lesson", ref: "lesson-a", label: "Lição A" }
    ],
    children: [],
    childCount: 0,
    hasMoreChildren: false,
    nextChildCursor: null
  };
  readFixture.targetPlanItems = {
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  const calls = [];
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (url.endsWith("/rpc/get_owned_course_design_for_actor_v1")) return json(readFixture);
    return json({
      contract: "aralearn.course-design-change.v1",
      courseId: COURSE_ID,
      courseRevision: 6,
      requestId: "request-target-items-0001",
      idempotent: false,
      changed: true,
      change: {
        changeId: "2",
        type: "set_target_plan_items",
        scope: { kind: "didactic_microsequence", ref: "micro-a" }
      }
    });
  });
  const read = await value.getCourseDesign({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    scopeKind: "didactic_microsequence",
    scopeRef: "micro-a"
  });
  assert.deepEqual(read.targetPlanItems, readFixture.targetPlanItems);

  const command = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PLAN_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  await value.applyCourseDesignCommand({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-target-items-0001",
    expectedCourseRevision: 5,
    command
  });
  assert.deepEqual(calls[1].p_command, command);
  assert.equal(calls[1].p_channel, "mcp");

  const invalid = structuredClone(readFixture);
  invalid.targetPlanItems.instructionalAnalysisUnitIds.push(PLAN_ID);
  await assert.rejects(
    () => adapter(async () => json(invalid)).getCourseDesign({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      scopeKind: "didactic_microsequence",
      scopeRef: "micro-a"
    }),
    (error) => error.code === "course_service_unavailable"
  );
});

test("traduz concorrência do banco sem expor detalhes internos", async () => {
  const value = adapter(async () => json({ code: "40001", message: "private.secret" }, 400));
  await assert.rejects(
    () => value.commitCourseComposition({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-change-0001",
      expectedRevision: 2,
      upserts: [],
      deletes: []
    }),
    (error) => error.status === 409 &&
      error.code === "stale_course_state" &&
      !error.message.includes("private.secret")
  );

  const requestConflict = adapter(async () => json({
    code: "23514",
    message: "requestId reutilizado com comando incompatível."
  }, 400));
  await assert.rejects(
    () => requestConflict.applyCourseDesignCommand({
      principal: { actorId: USER_ID, authenticationKind: "application" },
      courseId: COURSE_ID,
      requestId: "request-design-conflict",
      expectedCourseRevision: 5,
      command: { type: "clear_guidance", scope: { kind: "course", ref: COURSE_ID } }
    }),
    (error) => error.status === 409 && error.code === "request_id_conflict"
  );
});

test("replay idempotente chega ao receipt mesmo após a revisão avançar", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/rpc/commit_course_composition_for_actor_v1")) {
      return json({ courseId: COURSE_ID, revision: 3, idempotent: true });
    }
    assert.fail("Replay não deve reler as entidades da revisão anterior.");
  });
  const result = await value.commitCourseComposition({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    requestId: "request-replay-0001",
    expectedRevision: 2,
    upserts: [{
      entityType: "module",
      entityId: "module-a",
      parentType: null,
      parentId: null,
      position: 0,
      content: { title: "Módulo A" }
    }],
    deletes: []
  });
  assert.equal(result.idempotent, true);
  assert.deepEqual(calls.map((url) => url.split("/").at(-1)), [
    "commit_course_composition_for_actor_v1"
  ]);
});

test("comando do plano é aplicado sobre a leitura cercada e enviado com o canal", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    const payload = JSON.parse(init.body);
    calls.push({ name: url.split("/").at(-1), payload });
    if (url.endsWith("/rpc/get_owned_course_instructional_plan_for_actor_v1")) {
      return json({
        contract: "aralearn.course-instructional-plan.v1",
        courseId: COURSE_ID,
        courseRevision: 4,
        plan: {
          id: PLAN_ID,
          version: 2,
          title: "Curso",
          objective: "Aprender",
          audience: "",
          scope: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [{
            id: PLAN_ITEM_ID,
            position: 0,
            statement: "Explicar a evidência.",
            sourceLinks: [{
              sourceId: "source-a",
              sourceRevision: 2,
              relation: "supported_by",
              anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
            }]
          }],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        },
        recentActivity: []
      });
    }
    if (url.endsWith("/rpc/commit_course_instructional_plan_for_actor_v1")) {
      return json({ courseId: COURSE_ID, courseRevision: 5, changed: true });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });

  const result = await value.commitCourseInstructionalPlan({
    principal: { actorId: USER_ID, authenticationKind: "application" },
    courseId: COURSE_ID,
    requestId: "request-plan-0001",
    expectedCourseRevision: 4,
    expectedPlanVersion: 2,
    command: { type: "update_plan", audience: "Docentes" }
  });

  assert.equal(result.deepLink,
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=planning`);
  assert.deepEqual(calls.map(({ name }) => name), [
    "get_owned_course_instructional_plan_for_actor_v1",
    "commit_course_instructional_plan_for_actor_v1"
  ]);
  assert.equal(calls[1].payload.p_channel, "application");
  assert.equal(calls[1].payload.p_plan.audience, "Docentes");
  assert.deepEqual(calls[1].payload.p_plan.intendedLearningOutcomes[0].sourceLinks, [{
    sourceId: "source-a",
    sourceRevision: 2,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
  }]);
  assert.deepEqual(calls[1].payload.p_command, {
    type: "update_plan",
    audience: "Docentes"
  });
});

test("replay do plano chega ao receipt depois de outra revisão sem reaplicar o comando", async () => {
  let committed = null;
  const value = adapter(async (url, init) => {
    if (url.endsWith("/rpc/get_owned_course_instructional_plan_for_actor_v1")) {
      return json({
        courseId: COURSE_ID,
        courseRevision: 9,
        plan: {
          id: PLAN_ID,
          version: 5,
          title: "Curso corrente",
          objective: "Objetivo corrente",
          audience: "Público corrente",
          scope: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [],
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: []
        }
      });
    }
    committed = JSON.parse(init.body);
    return json({ courseId: COURSE_ID, courseRevision: 4, idempotent: true });
  });

  const result = await value.commitCourseInstructionalPlan({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    requestId: "request-plan-replay-0001",
    expectedCourseRevision: 3,
    expectedPlanVersion: 1,
    command: { type: "update_plan", audience: "Público antigo" }
  });

  assert.equal(result.idempotent, true);
  assert.equal(committed.p_plan.audience, "Público corrente");
  assert.equal(committed.p_command.audience, "Público antigo");
  assert.equal(committed.p_channel, "mcp");
});

test("leitura retomável usa RPC owner-only e rejeita campos fora do DTO", async () => {
  let request = null;
  const step = {
    id: STEP_ID,
    position: 0,
    kind: "context_load",
    targetDidacticMicrosequenceId: null,
    productionPosition: null,
    status: "pending",
    version: 1,
    resultFacts: {},
    updatedAt: "2026-08-17T10:00:00Z",
    completedAt: null
  };
  const fixture = {
    contract: "aralearn.course-authoring-part-materialization.v1",
    courseId: COURSE_ID,
    courseRevision: 5,
    authoringPartId: PART_ID,
    materialization: {
      id: MATERIALIZATION_ID,
      authoringPartVersion: 2,
      channel: "mcp",
      status: "running",
      version: 1,
      designContext: designContext({ targets: false }),
      contextHash: "a".repeat(64),
      resultFacts: {},
      startedAt: "2026-08-17T10:00:00Z",
      updatedAt: "2026-08-17T10:00:00Z",
      completedAt: null,
      steps: [step],
      nextPendingStep: step
    }
  };
  const value = adapter(async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return json(fixture);
  });

  const result = await value.getCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID
  });

  assert.deepEqual(result, fixture);
  assert.match(request.url,
    /get_owned_course_authoring_part_materialization_for_actor_v1$/u);
  assert.deepEqual(request.body, {
    p_actor_id: USER_ID,
    p_course_id: COURSE_ID,
    p_authoring_part_id: PART_ID,
    p_materialization_id: MATERIALIZATION_ID
  });

  const invalid = adapter(async () => json({ ...fixture, actorId: USER_ID }));
  await assert.rejects(
    () => invalid.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );

  const invalidPolicy = runningMaterialization();
  invalidPolicy.materialization.designContext.targets[0].componentPolicy = {
    ...invalidPolicy.materialization.designContext.targets[0].componentPolicy,
    origin: "author",
    sourceScope: { kind: "course", ref: COURSE_ID }
  };
  const invalidPolicyAdapter = adapter(async () => json(invalidPolicy));
  await assert.rejects(
    () => invalidPolicyAdapter.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );

  const overlappingPolicy = runningMaterialization();
  const overlappingRef = componentCatalog().options[0].ref;
  overlappingPolicy.materialization.designContext.targets[0].componentPolicy.policy = {
    catalogVersion: "1-3e5629f8",
    availability: "allow_only",
    allowedRefs: [overlappingRef],
    excludedRefs: [overlappingRef],
    preferredRefs: []
  };
  const overlappingPolicyAdapter = adapter(async () => json(overlappingPolicy));
  await assert.rejects(
    () => overlappingPolicyAdapter.getCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    /leitura da materialização/u
  );
});

test("avanço de materialização encaminha somente a operação delimitada", async () => {
  let request = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /advance_course_authoring_part_materialization_for_actor_v1$/u);
    request = JSON.parse(init.body);
    return json(materializationChange());
  });
  const payload = {
    authoringPartVersion: 1,
    steps: [{
      id: PLAN_ID,
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  };

  const result = await value.advanceCourseAuthoringPartMaterialization({
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-0001",
    expectedCourseRevision: 4,
    expectedMaterializationVersion: 0,
    operation: "start",
    payload
  });

  assert.equal(result.operation, "start");
  assert.equal(result.materialization.designContext.contract, "aralearn.course-design-context.v2");
  assert.equal(result.materialization.contextHash, "a".repeat(64));
  assert.equal(request.p_channel, "mcp");
  assert.equal(request.p_authoring_part_id, PART_ID);
  assert.deepEqual(request.p_payload, payload);

  const invalid = adapter(async () => json({
    ...materializationChange(),
    materialization: { id: MATERIALIZATION_ID }
  }));
  await assert.rejects(
    () => invalid.advanceCourseAuthoringPartMaterialization({
      principal: { actorId: USER_ID, authenticationKind: "oauth" },
      courseId: COURSE_ID,
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID,
      requestId: "request-materialization-0001",
      expectedCourseRevision: 4,
      expectedMaterializationVersion: 0,
      operation: "start",
      payload
    }),
    /leitura da materialização/u
  );
});

test("record_step confere hash e policy selados antes da escrita", async () => {
  const calls = [];
  let excludedRefs = [];
  const contextSources = [{
    sourceId: "source-a",
    sourceRevision: 1,
    relation: "quoted_from",
    sourceHash: "f".repeat(64),
    anchors: [{
      anchorId: "anchor-a",
      anchorRevision: 1,
      anchorHash: "9".repeat(64)
    }]
  }];
  const value = adapter(async (url) => {
    calls.push(url.split("/").at(-1));
    if (url.endsWith("/get_owned_course_authoring_part_materialization_for_actor_v1")) {
      return json(runningMaterialization({ excludedRefs, contextSources }));
    }
    if (url.endsWith("/advance_course_authoring_part_materialization_for_actor_v1")) {
      return json(materializationChange({
        operation: "record_step",
        stepKind: "didactic_microsequence_materialization",
        version: 2,
        authoringPartVersion: 2,
        completedStepCount: 1,
        contextSources
      }));
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const paragraphRef = "aralearn.resource.paragraph@1.0.0";
  const payload = {
    stepId: STEP_ID,
    expectedStepVersion: 1,
    status: "completed",
    resultFacts: {},
    entityChanges: { upserts: [studyUnitUpsert()], deletes: [] },
    designApplication: {
      contextHash: "a".repeat(64),
      didacticMicrosequenceId: "micro-a",
      studyUnits: [{
        studyUnitId: "unit-a",
        mode: "expository",
        introducedInstructionalAnalysisUnitIds: [],
        explanationApplications: [],
        practiceApplications: [],
        componentRefs: [paragraphRef]
      }]
    },
    sourceAttributionApplication: {
      contract: "aralearn.course-source-attribution-application.v1",
      contextHash: "a".repeat(64),
      didacticMicrosequenceId: "micro-a",
      studyUnits: [{
        studyUnitId: "unit-a",
        sourceLinks: [{
          sourceId: "source-a",
          sourceRevision: 1,
          relation: "quoted_from",
          anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
        }]
      }]
    }
  };
  const command = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-step-0001",
    expectedCourseRevision: 5,
    expectedMaterializationVersion: 1,
    operation: "record_step",
    payload
  };

  const result = await value.advanceCourseAuthoringPartMaterialization(command);
  assert.equal(result.operation, "record_step");
  assert.deepEqual(calls, [
    "get_owned_course_authoring_part_materialization_for_actor_v1",
    "advance_course_authoring_part_materialization_for_actor_v1"
  ]);

  calls.length = 0;
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization({
      ...command,
      payload: {
        ...payload,
        designApplication: { ...payload.designApplication, contextHash: "b".repeat(64) }
      }
    }),
    (error) => error.code === "design_context_mismatch"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);

  calls.length = 0;
  const spoofedSourceApplication = structuredClone(payload.sourceAttributionApplication);
  spoofedSourceApplication.studyUnits[0].sourceLinks[0].anchors[0].anchorRevision = 2;
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization({
      ...command,
      payload: { ...payload, sourceAttributionApplication: spoofedSourceApplication }
    }),
    (error) => error.code === "source_not_allowed_by_context"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);

  calls.length = 0;
  excludedRefs = [paragraphRef];
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization(command),
    (error) => error.code === "component_disallowed_by_policy"
  );
  assert.deepEqual(calls, ["get_owned_course_authoring_part_materialization_for_actor_v1"]);
});

test("record_step exige ambas as aplicações somente na conclusão didática", async () => {
  let stepKind = "context_load";
  let writes = 0;
  const value = adapter(async (url) => {
    if (url.endsWith("/get_owned_course_authoring_part_materialization_for_actor_v1")) {
      return json(runningMaterialization({ stepKind }));
    }
    if (url.endsWith("/advance_course_authoring_part_materialization_for_actor_v1")) {
      writes += 1;
      return json(materializationChange({
        operation: "record_step",
        stepKind,
        version: 2,
        authoringPartVersion: 2,
        completedStepCount: 1
      }));
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const command = {
    principal: { actorId: USER_ID, authenticationKind: "oauth" },
    courseId: COURSE_ID,
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    requestId: "request-materialization-context-step",
    expectedCourseRevision: 5,
    expectedMaterializationVersion: 1,
    operation: "record_step",
    payload: {
      stepId: STEP_ID,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: {},
      entityChanges: { upserts: [], deletes: [] },
      designApplication: null,
      sourceAttributionApplication: null
    }
  };

  await value.advanceCourseAuthoringPartMaterialization(command);
  assert.equal(writes, 1);

  stepKind = "didactic_microsequence_materialization";
  await assert.rejects(
    () => value.advanceCourseAuthoringPartMaterialization(command),
    (error) => error.code === "materialization_application_requirement_mismatch"
  );
  assert.equal(writes, 1);

  await value.advanceCourseAuthoringPartMaterialization({
    ...command,
    payload: { ...command.payload, status: "failed" }
  });
  assert.equal(writes, 2);
});

test("encaminha somente o segmento alterado sem reler a composição integral", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    assert.match(url, /commit_course_composition_for_actor_v1$/u);
    return json({ courseId: COURSE_ID, courseRevision: 3, changed: true });
  });
  const upserts = [{
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "Módulo A" }
  }];
  await value.commitCourseComposition({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    requestId: "request-change-segment-0001",
    expectedRevision: 2,
    upserts,
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.p_upserts, upserts);
  assert.deepEqual(calls[0].body.p_source_attribution_applications, []);
});

test("perfil e acesso usam somente os RPCs canônicos para o ator autenticado", async () => {
  const calls = [];
  const value = adapter(async (url, init) => {
    calls.push({ name: url.split("/").at(-1), payload: JSON.parse(init.body) });
    if (url.endsWith("/get_person_profile_for_actor_v1")) {
      return json({ userId: USER_ID, displayName: null });
    }
    if (url.endsWith("/update_person_profile_for_actor_v1")) {
      return json({ userId: USER_ID, displayName: "Pesquisadora" });
    }
    if (url.endsWith("/list_course_access_for_actor_v1")) {
      return json({ courseId: COURSE_ID, items: [] });
    }
    if (url.endsWith("/manage_course_access_for_actor_v1")) {
      return json({ courseId: COURSE_ID, changed: true });
    }
    assert.fail(`RPC inesperado: ${url}`);
  });
  const principal = { actorId: USER_ID };

  await value.getPersonProfile({ principal });
  await value.updatePersonProfile({ principal, patch: { displayName: "Pesquisadora" } });
  await value.listCourseAccess({ principal, courseId: COURSE_ID });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "grant_access",
    email: "pessoa@example.com",
    confirmed: true,
    requestId: "request-access-0001"
  });
  await value.manageCourseAccess({
    principal,
    courseId: COURSE_ID,
    operation: "revoke_access",
    targetUserId: USER_ID,
    confirmed: true,
    requestId: "request-access-0002"
  });

  assert.deepEqual(calls.map(({ name }) => name), [
    "get_person_profile_for_actor_v1",
    "update_person_profile_for_actor_v1",
    "list_course_access_for_actor_v1",
    "manage_course_access_for_actor_v1",
    "manage_course_access_for_actor_v1"
  ]);
  assert.equal(calls.every(({ payload }) => payload.p_actor_id === USER_ID), true);
  assert.equal(calls[3].payload.p_target_email, "pessoa@example.com");
  assert.equal(calls[4].payload.p_target_user_id, USER_ID);
});
