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

function lessonProgressOperation({ lessonId, cursorCardId, completedCardIds }) {
  return {
    kind: "set",
    collection: "progress.lessons",
    path: lessonId,
    value: { cursorCardId, completedCardIds },
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
let trailItemId;
let selectionAId;
let selectionBId;
let selectionAActive = false;
let selectionBActive = false;

try {
  userA = await createConfirmedUser(emailA, password);
  userB = await createConfirmedUser(emailB, password);
  tokenA = await signIn(emailA, password);
  tokenB = await signIn(emailB, password);

  for (const [rpcName, body] of [
    ["list_catalog_collections", { p_query: "" }],
    ["select_catalog_course", { p_course_id: crypto.randomUUID(), p_mutation_id: crypto.randomUUID() }],
    ["list_trail_items_v1", { p_limit: 1, p_after_id: null }],
    ["load_trail_personal_state_v1", { p_trail_item_id: crypto.randomUUID() }],
    ["mutate_trail_personal_state_v1", {
      p_trail_item_id: crypto.randomUUID(),
      p_expected_revision: 0,
      p_operations: [lessonProgressOperation({
        lessonId: "lesson-anon",
        cursorCardId: "card-anon",
        completedCardIds: ["card-anon"],
      })],
      p_mutation_id: crypto.randomUUID(),
    }],
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
    "study_path_items",
    "trail_personal_states",
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
  selectionAActive = true;
  selectionBActive = true;

  assert.equal(selectedA.courseId, officialCourseId);
  assert.equal(selectedB.courseId, officialCourseId);
  assert.notEqual(selectionAId, selectionBId, "cada conta deve ter sua seleção leve");
  assert.equal(replayedA.idempotent, true, "seleção repetida deve ser idempotente");
  assert.equal(replayedA.selectionId, selectionAId);
  assert.equal(selectedA.row.userId, userA.id, "auth.uid() deve vincular a seleção a A");
  assert.equal(selectedB.row.userId, userB.id, "auth.uid() deve vincular a seleção a B");

  const trailsA = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenA,
  );
  const trailsB = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenB,
  );
  const trailA = trailsA.items.find(({ courseId }) => courseId === officialCourseId);
  const trailB = trailsB.items.find(({ courseId }) => courseId === officialCourseId);
  assert(trailA, "o curso selecionado deve aparecer em Trilhas para A");
  assert(trailB, "o curso selecionado deve aparecer em Trilhas para B");
  trailItemId = trailA.trailItemId;
  assert.equal(
    trailB.trailItemId,
    trailItemId,
    "a publicação compartilhada deve possuir uma única identidade em Trilhas",
  );
  assert.equal(trailA.completedCardCount, 0);
  assert.equal(trailB.completedCardCount, 0);
  assert.equal(
    await rpc(
      "load_trail_personal_state_v1",
      { p_trail_item_id: trailItemId },
      tokenA,
    ),
    null,
    "o estado pessoal nasce somente na primeira mutação",
  );
  assert.equal(
    await rpc(
      "load_trail_personal_state_v1",
      { p_trail_item_id: trailItemId },
      tokenB,
    ),
    null,
    "B não pode observar o estado pessoal de A",
  );

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

  const lessonId = "lesson-smoke";
  const cardsA = ["card-a-1", "card-a-2", "card-a-3", "card-a-4"];
  const operationA1 = lessonProgressOperation({
    lessonId,
    cursorCardId: cardsA[0],
    completedCardIds: cardsA.slice(0, 1),
  });
  const operationA2 = lessonProgressOperation({
    lessonId,
    cursorCardId: cardsA.at(-1),
    completedCardIds: cardsA,
  });
  const mutationA1 = crypto.randomUUID();
  const savedA = await rpc(
    "mutate_trail_personal_state_v1",
    {
      p_trail_item_id: trailItemId,
      p_expected_revision: 0,
      p_operations: [operationA1],
      p_mutation_id: mutationA1,
    },
    tokenA,
  );
  assert.equal(savedA.revision, 1);
  assert.equal(savedA.idempotent, false);

  const replayedStateA = await rpc(
    "mutate_trail_personal_state_v1",
    {
      p_trail_item_id: trailItemId,
      p_expected_revision: 0,
      p_operations: [operationA1],
      p_mutation_id: mutationA1,
    },
    tokenA,
  );
  assert.equal(replayedStateA.revision, 1);
  assert.equal(replayedStateA.idempotent, true);
  const stateA1 = await rpc(
    "load_trail_personal_state_v1",
    { p_trail_item_id: trailItemId },
    tokenA,
  );
  assert.equal(stateA1.revision, 1);
  assert.deepEqual(stateA1.state.progress.lessons[lessonId], {
    cursorCardId: cardsA[0],
    completedCardIds: cardsA.slice(0, 1),
  });

  const staleStateA = await request(
    "/rest/v1/rpc/mutate_trail_personal_state_v1",
    {
      method: "POST",
      token: tokenA,
      body: {
        p_trail_item_id: trailItemId,
        p_expected_revision: 0,
        p_operations: [operationA2],
        p_mutation_id: crypto.randomUUID(),
      },
    },
  );
  assert.equal(staleStateA.response.ok, false, "CAS deve rejeitar revisão defasada");
  assert.equal(staleStateA.payload?.code, "40001");

  const savedA2 = await rpc(
    "mutate_trail_personal_state_v1",
    {
      p_trail_item_id: trailItemId,
      p_expected_revision: 1,
      p_operations: [operationA2],
      p_mutation_id: crypto.randomUUID(),
    },
    tokenA,
  );
  assert.equal(savedA2.revision, 2);
  assert.equal(savedA2.idempotent, false);

  assert.equal(
    await rpc(
      "load_trail_personal_state_v1",
      { p_trail_item_id: trailItemId },
      tokenB,
    ),
    null,
    "a criação do estado de A não pode criar estado para B",
  );
  const cardsB = ["card-b-1", "card-b-2"];
  const savedB = await rpc(
    "mutate_trail_personal_state_v1",
    {
      p_trail_item_id: trailItemId,
      p_expected_revision: 0,
      p_operations: [lessonProgressOperation({
        lessonId,
        cursorCardId: cardsB.at(-1),
        completedCardIds: cardsB,
      })],
      p_mutation_id: crypto.randomUUID(),
    },
    tokenB,
  );
  assert.equal(savedB.revision, 1);
  assert.equal(savedB.idempotent, false);

  const afterProgressA = await rpc(
    "load_trail_personal_state_v1",
    { p_trail_item_id: trailItemId },
    tokenA,
  );
  const afterProgressB = await rpc(
    "load_trail_personal_state_v1",
    { p_trail_item_id: trailItemId },
    tokenB,
  );
  assert.equal(afterProgressA.revision, 2);
  assert.equal(afterProgressB.revision, 1);
  assert.equal(afterProgressA.state.progress.version, 3);
  assert.equal(afterProgressB.state.progress.version, 3);
  assert.deepEqual(afterProgressA.state.progress.lessons[lessonId], {
    cursorCardId: cardsA.at(-1),
    completedCardIds: cardsA,
  });
  assert.deepEqual(afterProgressB.state.progress.lessons[lessonId], {
    cursorCardId: cardsB.at(-1),
    completedCardIds: cardsB,
  });

  const projectedTrailsA = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenA,
  );
  const projectedTrailsB = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenB,
  );
  assert.equal(
    projectedTrailsA.items.find(({ trailItemId: id }) => id === trailItemId)
      ?.completedCardCount,
    cardsA.length,
  );
  assert.equal(
    projectedTrailsB.items.find(({ trailItemId: id }) => id === trailItemId)
      ?.completedCardCount,
    cardsB.length,
  );

  const bootstrapAfterProgressA = await rpc(
    "bootstrap_replica",
    { p_device_id: deviceA },
    tokenA,
  );
  const bootstrapAfterProgressB = await rpc(
    "bootstrap_replica",
    { p_device_id: deviceB },
    tokenB,
  );
  for (const bootstrap of [bootstrapAfterProgressA, bootstrapAfterProgressB]) {
    assert.deepEqual(
      Object.keys(bootstrap.snapshot),
      ["courseSelections"],
      "bootstrap relacional não pode reincorporar estado pessoal de estudo",
    );
  }

  const pullA = await pullAllChanges(tokenA, deviceA);
  const pullB = await pullAllChanges(tokenB, deviceB);
  assert.equal(
    [...pullA, ...pullB].every(({ entityType }) => entityType === "courseSelections"),
    true,
    "o feed genérico deve conservar somente seleções leves",
  );
  assert.equal(
    pullA.some(({ entityId }) => entityId === selectionBId),
    false,
    "feed de A não pode conter a seleção de B",
  );
  assert.equal(
    pullB.some(({ entityId }) => entityId === selectionAId),
    false,
    "feed de B não pode conter a seleção de A",
  );

  const unselectMutationA = crypto.randomUUID();
  const removedA = await rpc(
    "unselect_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: unselectMutationA },
    tokenA,
  );
  selectionAActive = false;
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
  assert.equal(Object.hasOwn(bootstrapWithoutA.snapshot, "lessonProgress"), false);
  assert.equal(bootstrapWithB.snapshot.courseSelections.length, 1);
  assert.equal(Object.hasOwn(bootstrapWithB.snapshot, "lessonProgress"), false);

  const inaccessibleStateA = await request(
    "/rest/v1/rpc/load_trail_personal_state_v1",
    {
      method: "POST",
      token: tokenA,
      body: { p_trail_item_id: trailItemId },
    },
  );
  assert.equal(
    inaccessibleStateA.response.status,
    403,
    `estado de A sem acesso: ${JSON.stringify(inaccessibleStateA.payload)}`,
  );
  assert.equal(inaccessibleStateA.payload?.code, "42501");
  const retainedStateB = await rpc(
    "load_trail_personal_state_v1",
    { p_trail_item_id: trailItemId },
    tokenB,
  );
  assert.deepEqual(retainedStateB.state.progress.lessons[lessonId], {
    cursorCardId: cardsB.at(-1),
    completedCardIds: cardsB,
  });
  const trailsWithoutA = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenA,
  );
  const trailsWithB = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenB,
  );
  assert.equal(
    trailsWithoutA.items.some(({ trailItemId: id }) => id === trailItemId),
    false,
  );
  assert.equal(
    trailsWithB.items.find(({ trailItemId: id }) => id === trailItemId)
      ?.completedCardCount,
    cardsB.length,
  );

  const reselectedA = await rpc(
    "select_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
    tokenA,
  );
  selectionAActive = true;
  selectionAId = reselectedA.selectionId;
  const trailsReselectedA = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenA,
  );
  const reselectedTrailA = trailsReselectedA.items.find(
    ({ courseId }) => courseId === officialCourseId,
  );
  assert(reselectedTrailA, "o curso re-selecionado deve reaparecer em Trilhas");
  assert.equal(
    reselectedTrailA.trailItemId,
    trailItemId,
    "re-selecionar deve recuperar a mesma identidade de Trilhas",
  );
  assert.equal(
    reselectedTrailA.completedCardCount,
    0,
    "o progresso removido não pode reaparecer após nova seleção",
  );
  assert.equal(
    await rpc(
      "load_trail_personal_state_v1",
      { p_trail_item_id: trailItemId },
      tokenA,
    ),
    null,
    "re-selecionar deve comprovar que o estado pessoal anterior foi apagado",
  );
  await rpc(
    "unselect_catalog_course",
    { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
    tokenA,
  );
  selectionAActive = false;

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

  const trailsWithoutB = await rpc(
    "list_trail_items_v1",
    { p_limit: 50, p_after_id: null },
    tokenB,
  );
  assert.equal(
    trailsWithoutB.items.some(({ trailItemId: id }) => id === trailItemId),
    false,
    "retirar a última seleção deve remover o curso das Trilhas de B",
  );

  console.log(
    "Smoke PostgREST/Auth/RLS: aprovado (artefato compartilhado, estado v3 isolado e bootstrap leve).",
  );
} finally {
  if (selectionAActive && tokenA && officialCourseId) {
    try {
      await rpc(
        "unselect_catalog_course",
        { p_course_id: officialCourseId, p_mutation_id: crypto.randomUUID() },
        tokenA,
      );
    } catch {
      // A exclusão da conta abaixo ainda remove toda seleção temporária.
    }
  }
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
