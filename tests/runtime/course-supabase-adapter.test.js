import test from "node:test";
import assert from "node:assert/strict";

import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const COURSE_ID = "20000000-0000-4000-8000-000000000002";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function adapter(fetchImpl) {
  return new CourseSupabaseAdapter({
    supabaseUrl: "https://project.example",
    serverApiKey: "sb_secret_test",
    publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.example/AraLearn/",
    fetchImpl,
    attempts: 1
  });
}

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
    `https://app.example/AraLearn/#/authoring/courses/${COURSE_ID}?section=structure`
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
    () => value.commitCourseChanges({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-change-0001",
      expectedRevision: 2,
      operation: "update_metadata",
      title: "Novo"
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
    if (url.endsWith("/rpc/commit_course_changes_for_actor_v1")) {
      return json({ courseId: COURSE_ID, revision: 3, idempotent: true });
    }
    assert.fail("Replay não deve reler as entidades da revisão anterior.");
  });
  const result = await value.commitCourseChanges({
    principal: { actorId: USER_ID },
    courseId: COURSE_ID,
    requestId: "request-replay-0001",
    expectedRevision: 2,
    operation: "commit_entities",
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
    "commit_course_changes_for_actor_v1"
  ]);
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
    () => value.commitCourseChanges({
      principal: { actorId: USER_ID },
      courseId: COURSE_ID,
      requestId: "request-change-invalid-0001",
      expectedRevision: 2,
      operation: "commit_entities",
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
