import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

import {
  resolveSupabaseAdministrativeEnvironment,
  supabaseServerHeaders,
} from "../functions/_shared/aralearn-authoring/supabaseEnvironment.js";

function readLocalSupabaseStatus() {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  try {
    const output = execFileSync(
      executable,
      ["--yes", "supabase@2.109.1", "status", "-o", "json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const objectStart = output.indexOf("{");
    return objectStart >= 0 ? JSON.parse(output.slice(objectStart)) : {};
  } catch {
    return {};
  }
}

const localStatus = readLocalSupabaseStatus();
const apiUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || localStatus.API_URL || "",
).replace(/\/$/u, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.ANON_KEY ||
  localStatus.ANON_KEY;
assert(apiUrl, "Defina SUPABASE_URL/API_URL ou inicie o Supabase local.");
assert(anonKey, "Defina SUPABASE_ANON_KEY/ANON_KEY ou inicie o Supabase local.");
const { serverApiKey } = resolveSupabaseAdministrativeEnvironment({
  ...process.env,
  SUPABASE_URL: apiUrl,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    localStatus.SERVICE_ROLE_KEY,
});
const OFFICIAL_FIXTURE_CONTRACT_KEY =
  "course-fundamentos-ia-analise-dados";

function requireOfficialFixture(items, label) {
  assert(Array.isArray(items), `${label}: catálogo inválido`);
  const course = items.find(
    (item) => item?.contract_key === OFFICIAL_FIXTURE_CONTRACT_KEY,
  );
  assert(
    course,
    `${label}: fixture oficial ${OFFICIAL_FIXTURE_CONTRACT_KEY} ausente`,
  );
  return course;
}

async function request(path, { method = "GET", token = anonKey, body } = {}) {
  const contentType = body !== undefined;
  const headers = token === serverApiKey
    ? supabaseServerHeaders(serverApiKey, { contentType })
    : {
        apikey: anonKey,
        ...(token && token !== anonKey ? { Authorization: `Bearer ${token}` } : {}),
        ...(contentType ? { "Content-Type": "application/json" } : {}),
      };
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, payload };
}

async function rpc(name, body, token, expectedStatus = 200) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    token,
    body,
  });
  assert.equal(
    result.response.status,
    expectedStatus,
    `${name}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`,
  );
  return result.payload;
}

function assertDenied(result, message) {
  assert(
    [400, 401, 403, 404].includes(result.response.status),
    `${message}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`,
  );
}

async function createConfirmedUser(email, password) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    token: serverApiKey,
    body: { email, password, email_confirm: true },
  });
  assert.equal(
    result.response.status,
    200,
    `Falha ao criar usuário de smoke: ${JSON.stringify(result.payload)}`,
  );
  return result.payload;
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(
    result.response.status,
    200,
    `Falha no login de smoke: ${JSON.stringify(result.payload)}`,
  );
  return result.payload.access_token;
}

async function softDeleteUser(userId) {
  if (!userId) return;
  const result = await request(
    `/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=true`,
    { method: "DELETE", token: serverApiKey },
  );
  if (!result.response.ok) {
    console.warn(
      `Teardown não desativou usuário temporário (HTTP ${result.response.status}); ` +
      "descarte o stack local com supabase stop --no-backup ou db reset.",
    );
  }
}

async function deleteOwnSmokeAccount(token) {
  if (!token) return false;
  const result = await request("/rest/v1/rpc/delete_own_account", {
    method: "POST",
    token,
    body: { p_confirmation: "EXCLUIR" },
  });
  return result.response.ok && result.payload?.status === "deleted";
}

function progressMutation({
  mutationId = crypto.randomUUID(),
  sequence,
  entityId,
  courseId,
  selectionId,
  lessonId,
  cursor,
  activityAt,
}) {
  return {
    mutationId,
    sequence,
    entityType: "lessonProgress",
    entityId,
    courseId,
    operation: "upsert",
    changedFields: [
      "selectionId", "lessonId", "cursor", "firstViewedAt", "completedAt", "lastActivityAt",
    ],
    payload: {
      selectionId,
      lessonId,
      cursor,
      firstViewedAt: activityAt,
      completedAt: null,
      lastActivityAt: activityAt,
    },
  };
}

async function pullAllChanges(token, deviceId) {
  const changes = [];
  let cursor = 0;
  for (let page = 0; page < 50; page += 1) {
    const result = await rpc(
      "pull_sync_changes",
      { p_after_sequence: cursor, p_limit: 2, p_device_id: deviceId },
      token,
    );
    changes.push(...result.changes);
    if (!result.hasMore) return changes;
    assert(
      result.nextSequence > cursor,
      "pull paginado precisa avançar mesmo quando há mudanças globais invisíveis",
    );
    cursor = result.nextSequence;
  }
  assert.fail("pull paginado não terminou em 50 páginas");
}

const suffix = `${Date.now()}-${process.pid}`;
const password = `AraLearn-smoke-${suffix}-A9!`;
const emailA = `smoke-a-${suffix}@aralearn.local`;
const emailB = `smoke-b-${suffix}@aralearn.local`;
const deviceA = crypto.randomUUID();
const deviceB = crypto.randomUUID();
let userA;
let userB;
let tokenA;
let tokenB;
let officialCourseId;
let selectionAId;
let selectionBId;
let selectionBActive = false;

try {
  userA = await createConfirmedUser(emailA, password);
  userB = await createConfirmedUser(emailB, password);
  tokenA = await signIn(emailA, password);
  tokenB = await signIn(emailB, password);

  for (const [rpcName, body] of [
    ["list_catalog_collections", { p_query: "" }],
    ["select_catalog_course", { p_course_id: crypto.randomUUID(), p_mutation_id: crypto.randomUUID() }],
    ["bootstrap_replica", { p_device_id: crypto.randomUUID() }],
    ["apply_sync_batch", { p_device_id: crypto.randomUUID(), p_mutations: [] }],
    ["pull_sync_changes", { p_after_sequence: 0, p_limit: 1, p_device_id: crypto.randomUUID() }],
  ]) {
    const result = await request(`/rest/v1/rpc/${rpcName}`, { method: "POST", body });
    assertDenied(result, `anon não pode executar ${rpcName}`);
  }

  for (const table of [
    "user_course_selections",
    "lesson_progress",
    "card_progress",
    "card_comments",
    "study_paths",
    "study_path_courses",
    "sync_devices",
    "sync_changes",
    "sync_idempotency",
  ]) {
    const result = await request(`/rest/v1/${table}?select=*&limit=1`, { token: tokenA });
    assertDenied(result, `authenticated não pode consultar diretamente ${table}`);
  }

  const catalogA = await rpc("list_catalog_collections", { p_query: "" }, tokenA);
  const catalogB = await rpc("list_catalog_collections", { p_query: "" }, tokenB);
  const officialA = requireOfficialFixture(catalogA, "conta A");
  const officialB = requireOfficialFixture(catalogB, "conta B");
  officialCourseId = officialA.course_id;
  assert.equal(officialB.course_id, officialCourseId, "A e B devem ver a mesma publicação oficial");
  assert.match(officialA.content_hash, /^[0-9a-f]{64}$/u);
  assert.equal(
    officialB.content_hash,
    officialA.content_hash,
    "A e B devem receber o mesmo hash do artefato oficial",
  );
  assert(officialA.module_count > 0 && officialA.lesson_count > 0);

  const directAdminTree = await request("/rest/v1/modules?select=id&limit=1", { token: serverApiKey });
  assertDenied(directAdminTree, "a árvore relacional removida não pode ser consultada");

  const selectMutationA = crypto.randomUUID();
  const selectedA = await rpc(
    "select_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: selectMutationA },
    tokenA,
  );
  const replayedA = await rpc(
    "select_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: selectMutationA },
    tokenA,
  );
  const selectedB = await rpc(
    "select_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
    tokenB,
  );
  selectionAId = selectedA.selectionId;
  selectionBId = selectedB.selectionId;
  selectionBActive = true;

  assert.equal(selectedA.courseId, officialCourseId);
  assert.equal(selectedB.courseId, officialCourseId);
  assert.notEqual(selectionAId, selectionBId, "cada conta deve ter sua seleção leve");
  assert.equal(replayedA.idempotent, true, "seleção repetida deve ser idempotente");
  assert.equal(replayedA.selectionId, selectionAId);
  assert.equal(selectedA.row.userId, userA.id, "auth.uid() deve vincular a seleção a A");
  assert.equal(selectedB.row.userId, userB.id, "auth.uid() deve vincular a seleção a B");

  const bootstrapA = await rpc("bootstrap_replica", { p_device_id: deviceA }, tokenA);
  const bootstrapB = await rpc("bootstrap_replica", { p_device_id: deviceB }, tokenB);
  assert.equal(bootstrapA.snapshot.courseSelections.length, 1);
  assert.equal(bootstrapB.snapshot.courseSelections.length, 1);
  assert.equal(bootstrapA.selectedCourses[0].courseId, officialCourseId);
  assert.equal(bootstrapB.selectedCourses[0].courseId, officialCourseId);
  assert.equal(bootstrapA.selectedCourses[0].contentHash, officialA.content_hash);
  assert.equal(bootstrapB.selectedCourses[0].contentHash, officialA.content_hash);
  for (const forbiddenTreeKey of ["modules", "lessons", "microsequences", "cards", "blocks"]) {
    assert.equal(
      Object.hasOwn(bootstrapA.snapshot, forbiddenTreeKey),
      false,
      `bootstrap leve não deve agregar ${forbiddenTreeKey}`,
    );
  }
  assert.equal(typeof bootstrapA.highWaterSequence, "number");

  const lessonId = crypto.randomUUID();
  const progressAId = crypto.randomUUID();
  const firstMutationA = progressMutation({
    sequence: 1,
    entityId: progressAId,
    courseId: officialCourseId,
    selectionId: selectionAId,
    lessonId,
    cursor: 1,
    activityAt: "2026-07-19T12:00:00.000Z",
  });
  const lastMutationA = progressMutation({
    sequence: 2,
    entityId: progressAId,
    courseId: officialCourseId,
    selectionId: selectionAId,
    lessonId,
    cursor: 4,
    activityAt: "2026-07-19T12:05:00.000Z",
  });
  const lwwA = await rpc(
    "apply_sync_batch",
    { p_device_id: deviceA, p_mutations: [firstMutationA, lastMutationA] },
    tokenA,
  );
  assert(lwwA.results.every(({ status }) => status === "applied"));
  assert.equal(lwwA.results[1].row.cursor, 4, "a última mutação válida deve vencer");

  const replayLwwA = await rpc(
    "apply_sync_batch",
    { p_device_id: deviceA, p_mutations: [lastMutationA] },
    tokenA,
  );
  assert.equal(replayLwwA.results[0].idempotent, true);
  assert.equal(replayLwwA.results[0].row.cursor, 4);

  const unauthorizedB = progressMutation({
    sequence: 1,
    entityId: progressAId,
    courseId: officialCourseId,
    selectionId: selectionAId,
    lessonId,
    cursor: 99,
    activityAt: "2026-07-19T12:10:00.000Z",
  });
  const rejectedB = await rpc(
    "apply_sync_batch",
    { p_device_id: deviceB, p_mutations: [unauthorizedB] },
    tokenB,
  );
  assert.equal(rejectedB.results[0].status, "rejected", "B não pode usar a seleção de A");
  assert.equal(rejectedB.results[0].code, "42501");

  const progressBId = crypto.randomUUID();
  const ownMutationB = progressMutation({
    sequence: 2,
    entityId: progressBId,
    courseId: officialCourseId,
    selectionId: selectionBId,
    lessonId,
    cursor: 2,
    activityAt: "2026-07-19T12:08:00.000Z",
  });
  const appliedB = await rpc(
    "apply_sync_batch",
    { p_device_id: deviceB, p_mutations: [ownMutationB] },
    tokenB,
  );
  assert.equal(appliedB.results[0].status, "applied");

  const afterProgressA = await rpc("bootstrap_replica", { p_device_id: deviceA }, tokenA);
  const afterProgressB = await rpc("bootstrap_replica", { p_device_id: deviceB }, tokenB);
  assert.deepEqual(
    afterProgressA.snapshot.lessonProgress.map(({ id, cursor }) => [id, cursor]),
    [[progressAId, 4]],
  );
  assert.deepEqual(
    afterProgressB.snapshot.lessonProgress.map(({ id, cursor }) => [id, cursor]),
    [[progressBId, 2]],
  );

  const pullA = await pullAllChanges(tokenA, deviceA);
  const pullB = await pullAllChanges(tokenB, deviceB);
  assert.equal(
    pullA.some(({ entityId }) => entityId === progressBId),
    false,
    "feed de A não pode conter progresso de B",
  );
  assert.equal(
    pullB.some(({ entityId }) => entityId === progressAId),
    false,
    "feed de B não pode conter progresso de A",
  );

  const unselectMutationA = crypto.randomUUID();
  const removedA = await rpc(
    "unselect_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: unselectMutationA },
    tokenA,
  );
  const replayedRemovalA = await rpc(
    "unselect_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: unselectMutationA },
    tokenA,
  );
  assert.equal(removedA.status, "applied");
  assert.equal(replayedRemovalA.idempotent, true);

  const bootstrapWithoutA = await rpc("bootstrap_replica", { p_device_id: deviceA }, tokenA);
  const bootstrapWithB = await rpc("bootstrap_replica", { p_device_id: deviceB }, tokenB);
  assert.equal(bootstrapWithoutA.snapshot.courseSelections.length, 0);
  assert.equal(bootstrapWithoutA.snapshot.lessonProgress.length, 0);
  assert.equal(bootstrapWithB.snapshot.courseSelections.length, 1);
  assert.equal(bootstrapWithB.snapshot.lessonProgress[0].id, progressBId);

  const catalogAfterUnselectA = await rpc("list_catalog_collections", { p_query: "" }, tokenA);
  const catalogAfterUnselectB = await rpc("list_catalog_collections", { p_query: "" }, tokenB);
  const officialAfterUnselectA = requireOfficialFixture(
    catalogAfterUnselectA,
    "conta A após retirada",
  );
  const officialAfterUnselectB = requireOfficialFixture(
    catalogAfterUnselectB,
    "conta B após retirada",
  );
  assert.equal(officialAfterUnselectA.is_selected, false);
  assert.equal(officialAfterUnselectB.is_selected, true);
  assert.equal(
    officialAfterUnselectB.content_hash,
    officialA.content_hash,
    "selecionar ou remover não pode regravar o artefato oficial",
  );

  await rpc(
    "unselect_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
    tokenB,
  );
  selectionBActive = false;

  console.log(
    "Smoke PostgREST/Auth/RLS: aprovado (artefato compartilhado, A/B isolados, LWW e bootstrap leve).",
  );
} finally {
  if (selectionBActive && tokenB && officialCourseId) {
    try {
      await rpc(
        "unselect_catalog_course",
        { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
        tokenB,
      );
    } catch {
      // O teardown administrativo abaixo continua sendo a última salvaguarda.
    }
  }
  if (!await deleteOwnSmokeAccount(tokenB)) await softDeleteUser(userB?.id);
  if (!await deleteOwnSmokeAccount(tokenA)) await softDeleteUser(userA?.id);
}
