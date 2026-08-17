import test from "node:test";
import assert from "node:assert/strict";

import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";
const PLAN_ID = "30000000-0000-4000-8000-000000000003";
const PART_ID = "40000000-0000-4000-8000-000000000004";
const MATERIALIZATION_ID = "50000000-0000-4000-8000-000000000005";
const STEP_ID = "60000000-0000-4000-8000-000000000006";

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
});

test("replay idempotente chega ao receipt mesmo após a revisão avançar", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/rpc/get_owned_course_for_actor_v1")) {
      return json({
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender",
        revision: 3,
        ownership: "owned",
        canEdit: true
      });
    }
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
    "get_owned_course_for_actor_v1",
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
          authoringGuidance: "",
          preferredPartCount: { minimum: 7, maximum: 12, origin: "automatic" },
          intendedLearningOutcomes: [],
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
          authoringGuidance: "",
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
      designContext: { audience: "Docentes" },
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
});

test("avanço de materialização encaminha somente a operação delimitada", async () => {
  let request = null;
  const value = adapter(async (url, init) => {
    assert.match(url, /advance_course_authoring_part_materialization_for_actor_v1$/u);
    request = JSON.parse(init.body);
    return json({
      contract: "aralearn.course-authoring-materialization-change.v1",
      courseId: COURSE_ID,
      courseRevision: 5,
      authoringPartId: PART_ID,
      operation: "start",
      changed: true
    });
  });
  const payload = {
    authoringPartVersion: 1,
    designContext: { catalogVersion: "v1" },
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
  assert.equal(request.p_channel, "mcp");
  assert.equal(request.p_authoring_part_id, PART_ID);
  assert.deepEqual(request.p_payload, payload);
});

test("recusa composição que quebraria o contrato do Estudo antes da escrita", async () => {
  const calls = [];
  const value = adapter(async (url) => {
    calls.push(url);
    if (url.endsWith("/rpc/get_owned_course_for_actor_v1")) {
      return json({
        courseId: COURSE_ID,
        title: "Curso",
        goal: "Aprender",
        revision: 2,
        ownership: "owned",
        canEdit: true
      });
    }
    if (url.endsWith("/rpc/list_owned_course_entities_for_actor_v1")) {
      return json({
        courseId: COURSE_ID,
        revision: 2,
        items: [],
        hasMore: false,
        nextCursor: null
      });
    }
    assert.fail("A escrita não pode ser chamada para uma composição inválida.");
  });
  await assert.rejects(
    () => value.commitCourseComposition({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-change-invalid-0001",
      expectedRevision: 2,
      upserts: [{
        entityType: "card",
        entityId: "unit-a",
        parentType: "microsequence",
        parentId: "missing",
        position: 1,
        content: {}
      }],
      deletes: []
    }),
    (error) => error.code === "invalid_course_contract"
  );
  assert.equal(calls.length, 2);
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
