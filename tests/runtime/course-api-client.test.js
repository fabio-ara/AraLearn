import test from "node:test";
import assert from "node:assert/strict";

import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const AVATAR_ID = "30000000-0000-4000-8000-000000000003";

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
      payload: { authoringPartVersion: 1, designContext: {}, steps: [] }
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

test("exclusão da conta remove avatares próprios antes do RPC destrutivo", async () => {
  const calls = [];
  const { client } = clientWithFetch(async (url, init) => {
    const body = init.body == null ? null : JSON.parse(init.body);
    calls.push({ url, body });
    if (url.includes("/storage/v1/object/list/person-avatars")) {
      return jsonResponse([{ name: `${AVATAR_ID}.webp` }]);
    }
    if (url.endsWith("/storage/v1/object/person-avatars")) return jsonResponse({});
    if (url.endsWith("/rest/v1/rpc/delete_my_account_v1")) {
      return jsonResponse({ contract: "aralearn.account-deletion.v1", deleted: true });
    }
    assert.fail(`Requisição inesperada: ${url}`);
  });

  await assert.rejects(
    () => client.deleteMyAccount({ confirmation: "excluir" }),
    /confirmação/u
  );
  const result = await client.deleteMyAccount({ confirmation: "EXCLUIR MINHA CONTA" });
  assert.equal(result.deleted, true);
  assert.deepEqual(calls.map(({ url }) => url.split("/").slice(-2).join("/")), [
    "list/person-avatars", "object/person-avatars", "rpc/delete_my_account_v1"
  ]);
  assert.deepEqual(calls[1].body, {
    prefixes: [`${USER_ID}/${AVATAR_ID}.webp`]
  });
  assert.deepEqual(calls[2].body, { p_confirmation: "EXCLUIR MINHA CONTA" });
});
