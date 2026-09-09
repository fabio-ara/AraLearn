import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { authoringObservationQuery } from "../../src/ui/courseAuthoringObservationQueue.js";

// Fetch exchanges are real Request/Response serialization. Database decisions,
// authentication and persistence below are explicit fixtures, not RLS/SQL proof.
const actorId = "10000000-0000-4000-8000-000000000001";
const courseId = "20000000-0000-4000-8000-000000000001";
const otherCourseId = "20000000-0000-4000-8000-000000000002";
const annotationId = "30000000-0000-4000-8000-000000000001";
const targetKind = "microsequence_explanation";
const targetId = "base-a";
const requestId = "observation-transport-1";
const basisHash = "a".repeat(64);
const effectHash = "b".repeat(64);
const origin = "https://app.example";
const principal = { actorId, authenticationKind: "application", scopes: ["authoring:read", "authoring:write"] };
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" }
});
const rejected = error => error.status === 503 && error.code === "course_service_unavailable";
const reference = { annotationId, annotationVersion: 4, targetKind, targetId };
const confirmation = { annotationId, annotationVersion: 4, effectHash };
const reviewCommand = { courseId, targetKind, targetId, expectedBasisHash: basisHash, reviewed: true, requestId };
function review(overrides = {}) {
  return { contract: "aralearn.course-content-review.v1", courseId, courseRevision: 7,
    targetKind, targetId, entityVersion: 3, basisHash, contentReview: { state: "draft" },
    reviewPolicy: "saved", ...overrides };
}
function reviewChange(overrides = {}) {
  return review({ contract: "aralearn.course-content-review-change.v1", courseRevision: 8,
    contentReview: { state: "current", reviewedAt: "2026-09-09T10:00:00Z" },
    changed: true, idempotent: false, ...overrides });
}
function receipt(overrides = {}) {
  return { contract: "aralearn.course-observation-correction.v1", status: "persisted", courseId,
    requestId, revision: 8, idempotent: false,
    observations: [{ ...reference, effectHash, currentEffectHash: effectHash, changed: true, confirmed: false }],
    ...overrides };
}
const absent = () => ({ contract: "aralearn.course-observation-correction.v1", status: "absent", courseId, requestId });
function adapterHarness(respond, { actor = principal } = {}) {
  const calls = [];
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://database.example", publicAppUrl: origin,
    serverApiKey: "synthetic-service", publishableKey: "synthetic-public", attempts: 3,
    fetchImpl: async (url, init) => {
      assert.equal(init.method, "POST");
      const headers = new Headers(init.headers);
      assert.equal(headers.get("apikey"), "synthetic-service");
      const call = { rpc: new URL(url).pathname.split("/").at(-1), input: JSON.parse(init.body) };
      calls.push(call);
      return respond(call, calls);
    } });
  adapter.resolveApplicationPrincipal = async () => actor;
  return { adapter, calls };
}
function directClient(respond, { visitor = false, retryReads = false } = {}) {
  const calls = [];
  const client = new CourseApiClient({ projectUrl: "https://database.example", publishableKey: "synthetic-public",
    visitor, retryReads, authClient: { getAccessToken: async () => "synthetic-owner-session" },
    fetchImpl: async (url, init) => {
      assert.equal(init.method, "POST");
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer synthetic-owner-session");
      const call = { rpc: new URL(url).pathname.split("/").at(-1), input: JSON.parse(init.body) };
      calls.push(call);
      assert.equal(Object.hasOwn(call.input, "p_actor_id"), false);
      return respond(call, calls);
    } });
  return { client, calls };
}
function routedClient(adapter) {
  const handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([origin]) });
  return new CourseApiClient({ projectUrl: "https://database.example", publishableKey: "synthetic-public",
    authClient: { getAccessToken: async () => "synthetic-owner-session" }, fetchImpl: (url, init) => {
      const headers = new Headers(init.headers); headers.set("Origin", origin);
      return handler(new Request(url, { ...init, headers }));
    } });
}
function commit(adapter, overrides = {}) {
  return adapter.commitCourseObservationCorrections({ principal, courseId, requestId, expectedRevision: 7,
    expectedStudyUnitVersion: 3, upserts: [{ entityType: "microsequence", entityId: targetId,
      parentType: "lesson", parentId: "lesson-a", position: 0, content: { title: "Base" } }],
    observations: [reference], ...overrides });
}

test("revisão usa RPC autenticada direta, hash e identidade estáveis sem aceitar identidade no corpo", async () => {
  const { client, calls } = directClient(call => json(call.rpc.startsWith("get_") ? review() : reviewChange()));
  assert.equal((await client.getContentReview(courseId, targetKind, targetId)).basisHash, basisHash);
  assert.equal((await client.setContentReview(reviewCommand)).contentReview.state, "current");
  assert.deepEqual(calls, [
    { rpc: "get_course_content_review_v1", input: { p_course_id: courseId, p_target_kind: targetKind, p_target_id: targetId } },
    { rpc: "set_course_content_review_v1", input: { p_course_id: courseId, p_target_kind: targetKind,
      p_target_id: targetId, p_expected_basis_hash: basisHash, p_reviewed: true, p_request_id: requestId } }
  ]);
  for (const delta of [{ actorId }, { expectedBasisHash: "invalid" }, { reviewed: "true" }, { requestId: "short" }]) {
    await assert.rejects(client.setContentReview({ ...reviewCommand, ...delta }), TypeError);
  }
  assert.equal(calls.length, 2);
});

test("cliente rejeita revisão de outro objeto, schema extra, versão inválida e confirmação de hash divergente", async () => {
  for (const delta of [{ courseId: otherCourseId }, { targetKind: "study_unit" }, { targetId: "base-b" },
    { entityVersion: 0 }, { basisHash: "invalid" }, { approvedBy: actorId },
    { contentReview: { state: "current", reviewedAt: "invalid" } }]) {
    const { client } = directClient(() => json(review(delta)));
    await assert.rejects(client.getContentReview(courseId, targetKind, targetId), TypeError);
  }
  for (const delta of [{ basisHash: effectHash }, { contentReview: { state: "draft" } }, { idempotent: "false" }]) {
    const { client } = directClient(() => json(reviewChange(delta)));
    await assert.rejects(client.setContentReview(reviewCommand), TypeError);
  }
});

test("revisão preserva erro de acesso e escrita incerta não repete mesmo com recuperação de leitura ligada", async () => {
  const visitor = directClient(() => assert.fail("Visitante não envia revisão"), { visitor: true });
  await assert.rejects(visitor.client.getContentReview(courseId, targetKind, targetId), error => error.status === 401);
  await assert.rejects(visitor.client.setContentReview(reviewCommand), error => error.status === 401);
  assert.equal(visitor.calls.length, 0);
  for (const [code, status] of [["42501", 403], ["PT409", 409]]) {
    const { client } = directClient(() => json({ code, message: "Decisão sintética do banco" }, status));
    await assert.rejects(client.setContentReview(reviewCommand), error => error.status === status && error.code === code);
  }
  let stored = review();
  const { client, calls } = directClient(call => {
    if (call.rpc.startsWith("set_")) { stored = review({ contentReview: reviewChange().contentReview }); throw new TypeError("Resposta perdida"); }
    return json(stored);
  }, { retryReads: true });
  await assert.rejects(client.setContentReview(reviewCommand));
  assert.equal(calls.length, 1);
  assert.equal((await client.getContentReview(courseId, targetKind, targetId)).contentReview.state, "current");
  assert.equal(calls.filter(call => call.rpc.startsWith("set_")).length, 1);
});

test("adapter transmite revisão ao ator resolvido e rejeita metadado privado ou decisão divergente", async () => {
  const { adapter, calls } = adapterHarness(call => json(call.rpc.startsWith("get_") ? review() : reviewChange()));
  assert.equal((await adapter.getCourseContentReview({ principal, courseId, targetKind, targetId })).entityVersion, 3);
  assert.equal((await adapter.setCourseContentReview({ principal, ...reviewCommand })).basisHash, basisHash);
  assert.deepEqual(calls.map(call => call.rpc), ["get_course_content_review_for_actor_v1", "set_course_content_review_for_actor_v1"]);
  assert.ok(calls.every(call => call.input.p_actor_id === actorId));
  assert.equal(calls[1].input.p_request_id, requestId);
  assert.equal(calls[1].input.p_expected_basis_hash, basisHash);
  for (const delta of [{ courseId: otherCourseId }, { entityVersion: 0 },
    { contentReview: { state: "current", reviewedAt: "2026-09-09T10:00:00Z", reviewedBy: actorId } }]) {
    const f = adapterHarness(() => json(review(delta)));
    await assert.rejects(f.adapter.getCourseContentReview({ principal, courseId, targetKind, targetId }), rejected);
  }
  const invalid = adapterHarness(() => json(reviewChange({ basisHash: effectHash })));
  await assert.rejects(invalid.adapter.setCourseContentReview({ principal, ...reviewCommand }), rejected);
  const lost = adapterHarness(() => { throw new TypeError("Resposta perdida"); });
  await assert.rejects(lost.adapter.setCourseContentReview({ principal, ...reviewCommand }), rejected);
  assert.equal(lost.calls.length, 1);
});

test("correção mantém versões exatas, canal, hash e request entre commit, releitura e confirmação", async () => {
  let saved = absent();
  const { adapter, calls } = adapterHarness(call => {
    assert.equal(call.input.p_actor_id, actorId);
    assert.equal(call.input.p_course_id, courseId);
    assert.equal(call.input.p_request_id, requestId);
    if (call.rpc.startsWith("commit_")) saved = receipt();
    if (call.rpc.startsWith("confirm_")) saved.observations[0].confirmed = true;
    return json(saved);
  });
  assert.equal((await adapter.getCourseObservationCorrection({ principal, courseId, requestId })).status, "absent");
  await commit(adapter);
  assert.deepEqual(calls[1].input.p_observations, [reference]);
  assert.equal(calls[1].input.p_expected_revision, 7);
  assert.equal(calls[1].input.p_expected_study_unit_version, 3);
  assert.equal(calls[1].input.p_channel, "application");
  assert.deepEqual(calls[1].input.p_source_attribution_applications, []);
  const persisted = await adapter.getCourseObservationCorrection({ principal, courseId, requestId });
  assert.equal(persisted.observations[0].currentEffectHash, effectHash);
  assert.equal(persisted.observations[0].confirmed, false);
  const confirmed = await adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations: [confirmation] });
  assert.equal(confirmed.observations[0].confirmed, true);
  assert.deepEqual(calls[3].input.p_confirmations, [confirmation]);
  const oauth = adapterHarness(() => json(receipt()));
  await commit(oauth.adapter, { principal: { ...principal, authenticationKind: "oauth" } });
  assert.equal(oauth.calls[0].input.p_channel, "mcp");
});

test("commit e confirmação perdidos só são reconciliados por leitura, com três tentativas configuradas", async () => {
  let saved = absent();
  const { adapter, calls } = adapterHarness(call => {
    if (call.rpc.startsWith("commit_")) { saved = receipt(); throw new TypeError("Commit persistido, resposta perdida"); }
    if (call.rpc.startsWith("confirm_")) { saved.observations[0].confirmed = true; throw new TypeError("Consumo persistido, resposta perdida"); }
    return json(saved);
  });
  await assert.rejects(commit(adapter), rejected);
  assert.equal((await adapter.getCourseObservationCorrection({ principal, courseId, requestId })).status, "persisted");
  await assert.rejects(adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations: [confirmation] }), rejected);
  assert.equal((await adapter.getCourseObservationCorrection({ principal, courseId, requestId })).observations[0].confirmed, true);
  assert.deepEqual(calls.map(call => call.rpc), ["commit_course_observation_corrections_for_actor_v1",
    "get_course_observation_correction_for_actor_v1", "confirm_course_observation_correction_for_actor_v1",
    "get_course_observation_correction_for_actor_v1"]);
});

test("transporte recusa recibo estranho e versão/hash divergentes sem converter pendência ou ausência em consumo", async () => {
  for (const delta of [{ courseId: otherCourseId }, { requestId: "another-request-1" }, { revision: 0 }, { privateActor: actorId }]) {
    const { adapter } = adapterHarness(() => json(receipt(delta)));
    await assert.rejects(adapter.getCourseObservationCorrection({ principal, courseId, requestId }), rejected);
  }
  const reordered = adapterHarness(() => json(receipt({ observations: [{ ...receipt().observations[0], annotationVersion: 5 }] })));
  await assert.rejects(commit(reordered.adapter), rejected);
  for (const delta of [{ annotationVersion: 5 }, { effectHash: basisHash }]) {
    const { adapter } = adapterHarness(() => json(receipt({ observations: [{ ...receipt().observations[0], ...delta }] })));
    await assert.rejects(adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations: [confirmation] }), rejected);
  }
  for (const result of [absent(), receipt({ observations: [{ ...receipt().observations[0], changed: false }] }),
    receipt({ observations: [{ ...receipt().observations[0], currentEffectHash: basisHash }] })]) {
    const { adapter } = adapterHarness(() => json(result));
    assert.deepEqual(await adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations: [confirmation] }), result);
  }
  const untouched = adapterHarness(() => assert.fail("Entrada inválida não chega ao banco"));
  await assert.rejects(commit(untouched.adapter, { observations: [] }), error => error.status === 422);
  await assert.rejects(commit(untouched.adapter, { observations: [{ ...reference, annotationVersion: 0 }] }), error => error.status === 422);
  await assert.rejects(untouched.adapter.confirmCourseObservationCorrection({ principal, courseId, requestId,
    confirmations: [{ ...confirmation, effectHash: "invalid" }] }), error => error.status === 422);
  assert.equal(untouched.calls.length, 0);
});

test("erros de dono, revisão e versão vindos do banco não vazam detalhe privado nem iniciam nova escrita", async () => {
  for (const [code, httpStatus, expectedStatus] of [["42501", 403, 403], ["PT404", 404, 404],
    ["40001", 400, 409], ["PT409", 409, 409]]) {
    const { adapter, calls } = adapterHarness(() => json({ code, message: "private-owner@example.test" }, httpStatus));
    const check = error => error.status === expectedStatus && !error.message.includes("private-owner");
    await assert.rejects(commit(adapter), check);
    await assert.rejects(adapter.getCourseObservationCorrection({ principal, courseId, requestId }), check);
    await assert.rejects(adapter.confirmCourseObservationCorrection({ principal, courseId, requestId, confirmations: [confirmation] }), check);
    assert.equal(calls.length, 3);
  }
});

test("fila percorre cliente, roteador e adapter com alvo novo e CAS; escopo read-only barra edição", async () => {
  const query = authoringObservationQuery(targetKind, targetId);
  const page = { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: 7,
    annotationSetVersion: 4, query, summary: { matchingTotal: 0, byOrigin: {}, byChannel: {}, byState: {}, unclassifiedTotal: 0 },
    items: [], hasMore: false, nextCursor: null };
  const { adapter, calls } = adapterHarness(call => call.rpc.startsWith("get_") ? json(page) :
    json({ code: "PT409", message: "Outra versão já foi salva" }, 409));
  const client = routedClient(adapter);
  assert.deepEqual(await client.loadCourseAnchoredAnnotations(courseId, { expectedCourseRevision: 7,
    annotationSetVersion: 4, query, cursor: null, limit: 12 }), page);
  assert.equal(calls[0].rpc, "get_owned_course_anchored_annotations_for_actor_v1");
  assert.equal(calls[0].input.p_target_kind, targetKind);
  assert.equal(calls[0].input.p_target_id, targetId);
  assert.equal(calls[0].input.p_actor_id, actorId);
  assert.deepEqual(calls[0].input.p_states, ["open", "considered"]);
  assert.deepEqual(calls[0].input.p_origins, ["author"]);
  const mutation = { courseId, requestId, expectedCourseRevision: null, command: {
    type: "revise_anchored_annotation", annotationId, expectedAnnotationVersion: 4,
    rawText: "Esclarecer a relação.", category: null, briefSummary: null } };
  await assert.rejects(client.mutateCourseAnchoredAnnotations(mutation), error => error.status === 409);
  assert.equal(calls[1].input.p_command.expectedAnnotationVersion, 4);
  assert.equal(calls[1].input.p_request_id, requestId);
  const readonly = adapterHarness(() => assert.fail("Rota deve bloquear antes do banco"), {
    actor: { ...principal, scopes: ["authoring:read"] } });
  await assert.rejects(routedClient(readonly.adapter).mutateCourseAnchoredAnnotations(mutation), error => error.status === 403);
  assert.equal(readonly.calls.length, 0);
  const denied = adapterHarness(() => json({ code: "42501", message: "private-owner@example.test" }, 403));
  await assert.rejects(routedClient(denied.adapter).loadCourseAnchoredAnnotations(courseId, {
    expectedCourseRevision: 7, annotationSetVersion: 4, query, cursor: null, limit: 12
  }), error => error.status === 403 && !error.message.includes("private-owner"));
});
