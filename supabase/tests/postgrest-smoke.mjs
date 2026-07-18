import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

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
).replace(/\/$/, "");
const anonKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.ANON_KEY ||
  localStatus.ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  localStatus.SERVICE_ROLE_KEY;

assert(apiUrl, "Defina SUPABASE_URL/API_URL ou inicie o Supabase local.");
assert(anonKey, "Defina SUPABASE_ANON_KEY/ANON_KEY ou inicie o Supabase local.");
assert(
  serviceRoleKey,
  "Defina SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY ou inicie o Supabase local.",
);

async function request(path, { method = "GET", token = anonKey, body } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: token === serviceRoleKey ? serviceRoleKey : anonKey,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
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

async function createConfirmedUser(email, password) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    token: serviceRoleKey,
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
    { method: "DELETE", token: serviceRoleKey },
  );
  assert(
    result.response.ok,
    `Falha ao desativar usuário de smoke: HTTP ${result.response.status}`,
  );
}

const suffix = `${Date.now()}-${process.pid}`;
const password = `AraLearn-smoke-${suffix}-A9!`;
const emailA = `smoke-a-${suffix}@aralearn.local`;
const emailB = `smoke-b-${suffix}@aralearn.local`;
const deviceA = crypto.randomUUID();
const mutationCloneA = crypto.randomUUID();
const mutationCloneB = crypto.randomUUID();
let userA;
let userB;
let tokenA;
let tokenB;
let personalCourseAId;
let personalCourseBId;

try {
  userA = await createConfirmedUser(emailA, password);
  userB = await createConfirmedUser(emailB, password);
  tokenA = await signIn(emailA, password);
  tokenB = await signIn(emailB, password);

  const anonymousBootstrap = await request("/rest/v1/rpc/bootstrap_replica", {
    method: "POST",
    body: { p_device_id: crypto.randomUUID() },
  });
  assert(
    anonymousBootstrap.response.status === 401 ||
      anonymousBootstrap.response.status === 403,
    "anon não pode executar bootstrap_replica",
  );

  const anonymousCatalog = await request("/rest/v1/rpc/list_catalog_courses", {
    method: "POST",
    body: {},
  });
  assert(
    anonymousCatalog.response.status === 401 || anonymousCatalog.response.status === 403,
    "anon não pode executar RPCs de dados",
  );

  for (const [rpcName, body] of [
    [
      "clone_catalog_course",
      { p_source_course_id: crypto.randomUUID(), p_mutation_id: crypto.randomUUID() },
    ],
    ["apply_sync_batch", { p_device_id: crypto.randomUUID(), p_mutations: [] }],
    [
      "pull_sync_changes",
      { p_after_sequence: 0, p_limit: 1, p_device_id: crypto.randomUUID() },
    ],
  ]) {
    const anonymousSensitiveRpc = await request(`/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      body,
    });
    assert(
      anonymousSensitiveRpc.response.status === 401 ||
        anonymousSensitiveRpc.response.status === 403,
      `anon não pode executar ${rpcName}`,
    );
  }

  for (const table of ["sync_devices", "sync_mutations", "sync_changes"]) {
    const direct = await request(`/rest/v1/${table}?select=*&limit=1`, { token: tokenA });
    assert(
      direct.response.status === 401 || direct.response.status === 403,
      `authenticated não pode consultar diretamente ${table}`,
    );
  }

  const catalog = await rpc("list_catalog_courses", {}, tokenA);
  assert(Array.isArray(catalog) && catalog.length > 0, "seed deve publicar curso oficial");
  const officialCourseId = catalog[0].course_id;
  assert(officialCourseId, "catálogo deve retornar course_id");

  personalCourseAId = await rpc(
    "clone_catalog_course",
    { p_source_course_id: officialCourseId, p_mutation_id: mutationCloneA },
    tokenA,
  );
  personalCourseBId = await rpc(
    "clone_catalog_course",
    { p_source_course_id: officialCourseId, p_mutation_id: mutationCloneB },
    tokenB,
  );
  assert.match(personalCourseAId, /^[0-9a-f-]{36}$/i, "clone de A deve retornar UUID pessoal");
  assert.match(personalCourseBId, /^[0-9a-f-]{36}$/i, "clone de B deve retornar UUID pessoal");
  assert.notEqual(personalCourseAId, personalCourseBId, "cada usuário deve receber sua própria cópia");

  const graphA = await rpc(
    "get_personal_course_graph",
    { p_course_id: personalCourseAId },
    tokenA,
  );
  const graphB = await rpc(
    "get_personal_course_graph",
    { p_course_id: personalCourseBId },
    tokenB,
  );
  assert.equal(graphA.courses.length, 1, "usuário A deve ler a própria cópia");
  assert.equal(graphB.courses.length, 1, "usuário B deve ler a própria cópia");
  assert.equal(
    await rpc("user_owns_course", { p_course_id: personalCourseAId }, tokenA),
    true,
    "auth.uid() deve identificar A dentro da RPC",
  );

  const bootstrapA = await rpc(
    "bootstrap_replica",
    { p_device_id: deviceA },
    tokenA,
  );
  assert.equal(bootstrapA.status, "applied");
  assert.equal(
    bootstrapA.snapshot.courses.filter((course) => course.courseId === personalCourseAId).length,
    1,
    "snapshot de A deve conter sua árvore uma única vez",
  );
  assert.equal(
    bootstrapA.snapshot.courses.some((course) => course.courseId === personalCourseBId),
    false,
    "snapshot de A não pode conter curso pessoal de B",
  );

  const graphOfBAsA = await request("/rest/v1/rpc/get_personal_course_graph", {
    method: "POST",
    token: tokenA,
    body: { p_course_id: personalCourseBId },
  });
  assert(
    graphOfBAsA.response.status === 400 || graphOfBAsA.response.status === 401 ||
      graphOfBAsA.response.status === 403,
    "usuário A não pode ler curso pessoal de B",
  );
  assert.equal(
    await rpc("user_owns_course", { p_course_id: personalCourseBId }, tokenA),
    false,
    "auth.uid() não pode confundir A com B",
  );

  const rejectedWrite = await rpc(
    "apply_sync_batch",
    {
      p_device_id: deviceA,
      p_mutations: [
        {
          mutationId: crypto.randomUUID(),
          courseId: personalCourseBId,
          entityType: "courses",
          entityId: personalCourseBId,
          operation: "update",
          baseRevision: graphB.courses[0].revision,
          changedFields: ["title"],
          payload: { title: "Tentativa indevida de A" },
        },
      ],
    },
    tokenA,
  );
  assert.equal(rejectedWrite.results[0].status, "rejected");
  assert.equal(rejectedWrite.results[0].code, "42501");

  const refreshBAsA = await request("/rest/v1/rpc/refresh_personal_course_from_source", {
    method: "POST",
    token: tokenA,
    body: { p_personal_course_id: personalCourseBId, p_mutation_id: crypto.randomUUID() },
  });
  assert(
    refreshBAsA.response.status === 400 || refreshBAsA.response.status === 401 ||
      refreshBAsA.response.status === 403,
    "usuário A não pode atualizar por RPC o curso pessoal de B",
  );

  const deleteBAsA = await request("/rest/v1/rpc/delete_personal_course", {
    method: "POST",
    token: tokenA,
    body: {
      p_course_id: personalCourseBId,
      p_base_revision: graphB.courses[0].revision,
      p_mutation_id: crypto.randomUUID(),
    },
  });
  assert(
    deleteBAsA.response.status === 400 || deleteBAsA.response.status === 401 ||
      deleteBAsA.response.status === 403,
    "usuário A não pode remover por RPC o curso pessoal de B",
  );

  const pullA = await rpc(
    "pull_sync_changes",
    { p_after_sequence: 0, p_limit: 500, p_device_id: deviceA },
    tokenA,
  );
  assert(
    pullA.changes.every((change) => change.courseId !== personalCourseBId),
    "feed de A não pode conter curso de B",
  );

  const invalidClone = await request("/rest/v1/rpc/clone_catalog_course", {
    method: "POST",
    token: tokenA,
    body: { p_source_course_id: personalCourseBId, p_mutation_id: crypto.randomUUID() },
  });
  assert(
    invalidClone.response.status === 400 || invalidClone.response.status === 403,
    "curso pessoal não pode ser clonado como catálogo oficial",
  );

  const deleteAResult = await rpc(
    "delete_personal_course",
    {
      p_course_id: personalCourseAId,
      p_base_revision: graphA.courses[0].revision,
      p_mutation_id: crypto.randomUUID(),
    },
    tokenA,
  );
  assert.equal(deleteAResult.status, "applied", "teardown deve remover a cópia operacional de A");
  const deleteBResult = await rpc(
    "delete_personal_course",
    {
      p_course_id: personalCourseBId,
      p_base_revision: graphB.courses[0].revision,
      p_mutation_id: crypto.randomUUID(),
    },
    tokenB,
  );
  assert.equal(deleteBResult.status, "applied", "teardown deve remover a cópia operacional de B");

  console.log("Smoke PostgREST/Auth/RLS: aprovado (anon, usuários A/B, RPCs e feed isolados).");
} finally {
  await softDeleteUser(userB?.id);
  await softDeleteUser(userA?.id);
}
