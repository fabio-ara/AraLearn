import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import {
  normalizeAuthoringProfile, normalizeAuthoringProfileList, normalizeAuthoringProfilePreferences,
  normalizeAuthoringProfileExceptionPolicy, normalizeCourseAuthoringProfilePreview
} from "../../src/domain/authoringProfiles.js";

const USER = "10000000-0000-4000-8000-000000000001";
const COURSE = "20000000-0000-4000-8000-000000000002";
const PROFILE = "30000000-0000-4000-8000-000000000003";
const OTHER = "40000000-0000-4000-8000-000000000004";
const PARAMETER = "study_unit_content_word_target";
const ORIGIN = "https://app.example";
const preferences = () => [{ parameterId: PARAMETER, mode: "fixed", value: 240 }];
const profile = (changes = {}) => ({ profileId: PROFILE, revision: 1, name: "Explicar e praticar",
  preferences: preferences(), createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z", ...changes });
const preview = (changes = {}) => ({ contract: "aralearn.course-authoring-profile-preview.v1", courseId: COURSE,
  courseRevision: 5, profile: profile(), assignments: preferences().map((value) => ({ ...value,
    origin: "author", reason: "Preferências copiadas do perfil." })), exceptions: [], conflicts: [], ...changes });
const save = (changes = {}) => ({ profileId: PROFILE, expectedRevision: 0, name: "Explicar e praticar",
  preferences: preferences(), requestId: "profile-save-request-1", ...changes });
const apply = (changes = {}) => ({ courseId: COURSE, expectedCourseRevision: 5, profileId: PROFILE,
  profileRevision: 1, exceptionPolicy: { mode: "preserve", exceptions: [] }, requestId: "profile-apply-request-1", ...changes });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function harness({ readonly = false, visitor = false, loseFirstSaveResponse = false, rpcOverride = null } = {}) {
  const calls = [];
  const requests = [];
  const receipts = new Map();
  let stored = null;
  let courseRevision = 5;
  let applied = null;
  let lost = false;
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://database.example", publicAppUrl: ORIGIN,
    publishableKey: "synthetic-public", serverApiKey: "synthetic-service", attempts: 1,
    fetchImpl: async (url, init) => {
      const name = new URL(url).pathname.split("/").at(-1);
      const input = JSON.parse(init.body);
      calls.push({ name, input });
      assert.equal(input.p_actor_id, USER);
      if (rpcOverride) return rpcOverride(name, input);
      if (name === "list_authoring_profiles_for_actor_v1") return json({ contract: "aralearn.authoring-profiles.v1", profiles: stored ? [stored] : [] });
      if (name === "preview_course_authoring_profile_for_actor_v1") {
        assert.equal(input.p_expected_course_revision, courseRevision);
        return json(preview({ courseRevision, profile: stored,
          assignments: stored.preferences.map((value) => ({ ...value, origin: "author", reason: "Preferências copiadas do perfil." })) }));
      }
      assert.match(input.p_request_hash, /^[0-9a-f]{64}$/u);
      if (receipts.has(input.p_request_id)) {
        const previous = receipts.get(input.p_request_id);
        assert.equal(previous.hash, input.p_request_hash);
        return json({ ...previous.result, idempotent: true });
      }
      let result;
      if (name === "save_authoring_profile_for_actor_v1") {
        const current = stored?.revision || 0;
        if (input.p_expected_revision !== current) return json({ code: "PT409", message: "Detalhe interno que não deve sair." }, 409);
        const changed = !stored || stored.name !== input.p_name || JSON.stringify(stored.preferences) !== JSON.stringify(input.p_preferences);
        stored = profile({ revision: current + (changed ? 1 : 0), name: input.p_name, preferences: input.p_preferences });
        result = { contract: "aralearn.authoring-profile-change.v1", profileId: PROFILE, revision: stored.revision,
          requestId: input.p_request_id, idempotent: false, changed, deleted: false, profile: stored };
      } else if (name === "delete_authoring_profile_for_actor_v1") {
        result = { contract: "aralearn.authoring-profile-change.v1", profileId: PROFILE, revision: stored.revision + 1,
          requestId: input.p_request_id, idempotent: false, changed: true, deleted: true, profile: null };
        stored = null;
      } else if (name === "apply_course_authoring_profile_for_actor_v1") {
        assert.equal(input.p_expected_course_revision, courseRevision);
        const changed = JSON.stringify(applied) !== JSON.stringify(stored.preferences);
        applied = structuredClone(stored.preferences);
        courseRevision += changed ? 1 : 0;
        result = { contract: "aralearn.course-design-change.v3", courseId: COURSE, courseRevision,
          requestId: input.p_request_id, idempotent: false, changed,
          change: changed ? { type: "apply_profile", scope: { kind: "course", ref: COURSE }, parameterId: null } : null };
      } else throw new Error(`RPC inesperada: ${name}`);
      receipts.set(input.p_request_id, { hash: input.p_request_hash, result: structuredClone(result) });
      return json(result);
    } });
  adapter.resolveApplicationPrincipal = async () => ({ actorId: USER, authenticationKind: "application",
    scopes: readonly ? ["authoring:read"] : ["authoring:read", "authoring:write"] });
  const handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([ORIGIN]) });
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body });
    const headers = new Headers(init.headers);
    headers.set("Origin", ORIGIN);
    const response = await handler(new Request(url, { ...init, headers }));
    if (loseFirstSaveResponse && !lost && init.method === "POST" && url.endsWith("/authoring-profiles")) {
      lost = true;
      assert.equal(response.status, 200);
      return new Response("gateway temporarily unavailable", { status: 502 });
    }
    return response;
  };
  const client = new CourseApiClient({ projectUrl: "https://database.example", publishableKey: "synthetic-public",
    authClient: { getAccessToken: async () => visitor ? null : "synthetic-session" }, visitor, fetchImpl });
  return { client, adapter, handler, calls, requests, get stored() { return stored; }, get applied() { return applied; } };
}

test("perfil aceita apenas preferências tipadas e delegação sem valor fixo", () => {
  assert.deepEqual(normalizeAuthoringProfilePreferences([{ parameterId: PARAMETER, mode: "automatic", value: null }]),
    [{ parameterId: PARAMETER, mode: "automatic", value: null }]);
  for (const value of [
    [{ parameterId: PARAMETER, mode: "automatic", value: 2 }],
    [{ parameterId: PARAMETER, mode: "fixed", value: "240" }],
    [{ ...preferences()[0], origin: "research_condition" }],
    [{ parameterId: "synchronizationMode", mode: "fixed", value: "automatic" }],
    [...preferences(), ...preferences()]
  ]) assert.throws(() => normalizeAuthoringProfilePreferences(value));
  assert.throws(() => normalizeAuthoringProfile({ ...profile(), apiKey: "forbidden" }));
  assert.throws(() => normalizeAuthoringProfileList({ contract: "aralearn.authoring-profiles.v1", profiles: [profile(), profile()] }));
});

test("prévia e política vinculam valores, identidades e exceções escolhidas", () => {
  const request = { courseId: COURSE, expectedCourseRevision: 5, profileId: PROFILE, profileRevision: 1 };
  assert.equal(normalizeCourseAuthoringProfilePreview(preview(), request).courseRevision, 5);
  for (const change of [{ courseId: OTHER }, { courseRevision: 6 }, { profile: profile({ revision: 2 }) },
    { assignments: [{ ...preferences()[0], origin: "research_condition", reason: "Preferências copiadas do perfil." }] }]) {
    assert.throws(() => normalizeCourseAuthoringProfilePreview(preview(change), request));
  }
  const selected = { parameterId: PARAMETER, scope: { kind: "study_unit", ref: "unit-a" } };
  assert.deepEqual(normalizeAuthoringProfileExceptionPolicy({ mode: "remove_selected", exceptions: [selected] }).exceptions, [selected]);
  assert.throws(() => normalizeAuthoringProfileExceptionPolicy({ mode: "preserve", exceptions: [selected] }));
  assert.throws(() => normalizeAuthoringProfileExceptionPolicy({ mode: "remove_selected", exceptions: [selected, selected] }));
  assert.throws(() => normalizeAuthoringProfileExceptionPolicy({ mode: "remove_selected", exceptions: [{ ...selected, scope: { kind: "course", ref: COURSE } }] }));
});

test("prévia preserva motivo, rótulo humano e valores automáticos já aplicados às exceções", () => {
  const exception = { parameterId: PARAMETER, scope: { kind: "study_unit", ref: "unit-a" },
    scopeLabel: "Primeiro caso", assignment: { mode: "automatic", value: 300,
      origin: "automatic", reason: "A explicação demanda um exemplo desenvolvido." } };
  const result = normalizeCourseAuthoringProfilePreview(preview({ exceptions: [exception] }));
  assert.deepEqual(result.exceptions, [exception]);
  assert.equal(normalizeCourseAuthoringProfilePreview(preview({ exceptions: [{ ...exception,
    assignment: { ...exception.assignment, mode: "fixed", origin: "migration" } }] })).exceptions[0].assignment.origin, "migration");
  for (const exceptions of [[{ ...exception, scopeLabel: "" }], [exception, exception],
    [{ ...exception, assignment: { ...exception.assignment, origin: "research_condition" } }],
    [{ ...exception, parameterId: "authoring_chat_response_word_target" }]]) {
    assert.throws(() => normalizeCourseAuthoringProfilePreview(preview({ exceptions })));
  }
});

test("cliente, roteador e adaptador compartilham CRUD, prévia CAS e aplicação por cópia", async () => {
  const value = harness();
  assert.deepEqual((await value.client.listAuthoringProfiles()).profiles, []);
  assert.equal((await value.client.mutateAuthoringProfile(save())).revision, 1);
  assert.equal((await value.client.listAuthoringProfiles()).profiles[0].profileId, PROFILE);
  const command = apply();
  const read = { courseId: command.courseId, expectedCourseRevision: command.expectedCourseRevision,
    profileId: command.profileId, profileRevision: command.profileRevision };
  assert.equal((await value.client.previewCourseAuthoringProfile(read)).courseRevision, 5);
  assert.equal((await value.client.applyCourseAuthoringProfile(command)).courseRevision, 6);
  assert.equal((await value.client.applyCourseAuthoringProfile(apply({ expectedCourseRevision: 6, requestId: "profile-apply-equivalent-2" }))).changed, false);
  await value.client.mutateAuthoringProfile(save({ expectedRevision: 1, name: "Perfil alterado", requestId: "profile-save-request-2" }));
  assert.deepEqual(value.applied, preferences());
  await value.client.deleteAuthoringProfile({ profileId: PROFILE, expectedRevision: 2, requestId: "profile-delete-request-3" });
  assert.equal(value.stored, null);
  assert.deepEqual(value.applied, preferences());
  assert.deepEqual(value.requests.map(({ method }) => method), ["GET", "POST", "GET", "POST", "POST", "POST", "PATCH", "DELETE"]);
});

test("resposta perdida repete exatamente requestId, conteúdo e hash sem duplicar perfil", async () => {
  const value = harness({ loseFirstSaveResponse: true });
  const result = await value.client.mutateAuthoringProfile(save());
  assert.equal(result.idempotent, true);
  assert.equal(value.calls.length, 2);
  assert.deepEqual(value.calls[0], value.calls[1]);
  assert.equal(value.stored.revision, 1);
  assert.equal(value.requests[0].body, value.requests[1].body);
});

test("perfil divergente recusa CAS e não vaza erro interno", async () => {
  const value = harness();
  await value.client.mutateAuthoringProfile(save());
  await assert.rejects(value.client.mutateAuthoringProfile(save({ expectedRevision: 9, requestId: "profile-invalid-revision" })),
    (error) => error.status === 409 && error.code === "stale_authoring_profile" && !error.message.includes("interno"));
  assert.equal(value.stored.revision, 1);
});

test("ownership, condição de pesquisa e nome ocupado preservam as recusas do banco sem detalhes internos", async () => {
  for (const [code, status, expectedCode] of [
    ["42501", 403, "not_authorized"],
    ["PD409", 409, "course_design_research_conflict"],
    ["PN409", 409, "authoring_profile_name_unavailable"]
  ]) {
    const value = harness({ rpcOverride: () => json({ code, message: "segredo interno do banco" }, 400) });
    await assert.rejects(code === "PN409" ? value.client.mutateAuthoringProfile(save()) :
      value.client.applyCourseAuthoringProfile(apply()), (error) =>
      error.status === status && error.code === expectedCode && !error.message.includes("interno"));
    assert.equal(value.calls.length, 1);
  }
});

test("rota recusa filtro de conta, revisão ausente e campos de autoridade fora do contrato antes do RPC", async () => {
  const value = harness();
  for (const [method, path, body] of [
    ["GET", "/v1/authoring-profiles?ownerId=foreign", null],
    ["POST", "/v1/authoring-profiles", { ...save(), ownerId: OTHER }],
    ["POST", `/v1/courses/${COURSE}/authoring-profile/preview`, { profileId: PROFILE, profileRevision: 1 }],
    ["PATCH", `/v1/authoring-profiles/${PROFILE}`, { ...save(), expectedRevision: 0 }]
  ]) {
    const response = await value.handler(new Request(`https://database.example${path}`, {
      method, headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-session", "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    assert.equal(response.status, 422);
  }
  assert.equal(value.calls.length, 0);
});

test("apply transmite a seleção exata e recusa confirmação de outro curso ou pedido", async () => {
  const command = apply({ exceptionPolicy: { mode: "remove_selected", exceptions: [
    { parameterId: PARAMETER, scope: { kind: "study_unit", ref: "unit-a" } }
  ] } });
  for (const mismatch of [{ courseId: OTHER }, { requestId: "another-apply-request" }, { courseRevision: 7 }]) {
    const value = harness({ rpcOverride: () => json({ contract: "aralearn.course-design-change.v3", courseId: COURSE,
      courseRevision: 6, requestId: command.requestId, changed: true, idempotent: false,
      change: { type: "apply_profile", scope: { kind: "course", ref: COURSE }, parameterId: null }, ...mismatch }) });
    await assert.rejects(value.client.applyCourseAuthoringProfile(command), { status: 503 });
    assert.deepEqual(value.calls[0].input.p_exception_policy, command.exceptionPolicy);
    assert.equal(value.calls[0].input.p_expected_course_revision, 5);
    assert.equal(value.calls[0].input.p_profile_revision, 1);
  }
});

test("visitante e sessão sem escrita não alcançam os writers de perfis", async () => {
  const visitor = harness({ visitor: true });
  await assert.rejects(visitor.client.listAuthoringProfiles(), { status: 401 });
  assert.equal(visitor.requests.length, 0);
  const readonly = harness({ readonly: true });
  await assert.rejects(readonly.client.mutateAuthoringProfile(save()), { status: 403 });
  await assert.rejects(readonly.client.applyCourseAuthoringProfile(apply()), { status: 403 });
  assert.equal(readonly.calls.length, 0);
});

test("recibos ou prévias malformados falham fechados no adaptador", async () => {
  for (const override of [
    () => json({ contract: "aralearn.authoring-profiles.v1", profiles: [profile({ ownerId: OTHER })] }),
    () => json({ contract: "aralearn.authoring-profiles.v1", profiles: [profile({ preferences: [{ parameterId: "apiKey", mode: "fixed", value: "forbidden" }] })] })
  ]) {
    const value = harness({ rpcOverride: override });
    await assert.rejects(value.client.listAuthoringProfiles(), (error) => error.status === 503 && !error.message.includes("forbidden"));
  }
  const value = harness({ rpcOverride: () => json(preview({ courseId: OTHER })) });
  await assert.rejects(value.client.previewCourseAuthoringProfile({ courseId: COURSE, expectedCourseRevision: 5,
    profileId: PROFILE, profileRevision: 1 }), { status: 503 });
});

test("controller não altera caches de cursos ao editar perfil e invalida desenho apenas após apply confirmado", async () => {
  const value = harness();
  const cleared = [];
  const controller = new CourseController({ api: value.client, store: {
    async getCache() { return null; }, async putCache() {}, async deleteCachePrefix(prefix) { cleared.push(prefix); }
  } });
  await controller.mutateAuthoringProfile(save());
  assert.deepEqual(cleared, []);
  await controller.applyCourseAuthoringProfile(apply());
  assert.ok(cleared.some((key) => key.includes(`course-design:${COURSE}`)));
  const count = cleared.length;
  value.client.applyCourseAuthoringProfile = async () => ({ contract: "aralearn.course-design-change.v3", courseId: OTHER,
    courseRevision: 7, requestId: "profile-invalid-ack", idempotent: false, changed: true,
    change: { type: "apply_profile", scope: { kind: "course", ref: OTHER }, parameterId: null } });
  await assert.rejects(controller.applyCourseAuthoringProfile(apply({ expectedCourseRevision: 6, requestId: "profile-invalid-ack" })));
  assert.equal(cleared.length, count);
});
