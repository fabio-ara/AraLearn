import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

import {
  resolveSupabaseAdministrativeEnvironment,
  supabaseServerHeaders,
} from "../functions/_shared/aralearn-authoring/supabaseEnvironment.js";
import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const APPLICATION_ORIGIN = "http://127.0.0.1:4182";

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
const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || localStatus.API_URL || "",
).replace(/\/+$/u, "");
const publishableKey = String(
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.ANON_KEY ||
  localStatus.ANON_KEY ||
  "",
).trim();
assert(projectUrl, "Defina SUPABASE_URL/API_URL ou inicie o Supabase local.");
assert(
  new Set(["127.0.0.1", "localhost"]).has(new URL(projectUrl).hostname),
  "Este smoke altera somente a stack Supabase local.",
);
assert(publishableKey, "A chave publicável da stack local está ausente.");

const { serverApiKey } = resolveSupabaseAdministrativeEnvironment({
  ...process.env,
  SUPABASE_URL: projectUrl,
  SUPABASE_SERVICE_ROLE_KEY:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    localStatus.SERVICE_ROLE_KEY,
});

async function payload(response) {
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function request(path, {
  method = "GET",
  token = publishableKey,
  body,
  origin = null,
} = {}) {
  const contentType = body !== undefined;
  const headers = token === serverApiKey
    ? supabaseServerHeaders(serverApiKey, { contentType })
    : {
        apikey: publishableKey,
        ...(token && token !== publishableKey
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(contentType ? { "Content-Type": "application/json" } : {}),
      };
  if (origin) headers.Origin = origin;
  const response = await fetch(`${projectUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await payload(response) };
}

function failureMessage(label, result) {
  return `${label}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`;
}

function assertDenied(result, label) {
  assert(
    [400, 401, 403, 404].includes(result.response.status),
    failureMessage(label, result),
  );
}

async function rpc(name, body, token, expectedStatus = 200) {
  const result = await request(`/rest/v1/rpc/${name}`, {
    method: "POST",
    token,
    body,
  });
  assert.equal(result.response.status, expectedStatus, failureMessage(name, result));
  return result.payload;
}

async function courseAction(name, body, token, expectedStatus = 200) {
  const result = await request(
    `/functions/v1/aralearn-course-api/app/${encodeURIComponent(name)}`,
    {
      method: "POST",
      token,
      body,
      origin: APPLICATION_ORIGIN,
    },
  );
  assert.equal(
    result.response.status,
    expectedStatus,
    failureMessage(`Course API/${name}`, result),
  );
  return result.payload;
}

async function createConfirmedUser(email, password) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    token: serverApiKey,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { test: "course-runtime-local-smoke" },
    },
  });
  assert.equal(result.response.status, 200, failureMessage("criar usuário", result));
  return result.payload;
}

async function signIn(email, password) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  assert.equal(result.response.status, 200, failureMessage("login", result));
  assert.match(String(result.payload?.access_token || ""), /^[^.]+\.[^.]+\.[^.]+$/u);
  return result.payload.access_token;
}

async function removeLocalUser(userId) {
  if (!userId) return;
  const result = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    token: serverApiKey,
  });
  assert(
    [200, 204, 404].includes(result.response.status),
    failureMessage("limpar usuário local", result),
  );
}

function itemForCourse(list, courseId) {
  return list?.items?.find((item) => item.courseId === courseId) || null;
}

const suffix = `${Date.now()}-${process.pid}`;
const password = `AraLearn-course-smoke-${suffix}-A9!`;
const ownerEmail = `course-owner-${suffix}@aralearn.local`;
const learnerEmail = `course-learner-${suffix}@aralearn.local`;
let owner = null;
let learner = null;

try {
  owner = await createConfirmedUser(ownerEmail, password);
  learner = await createConfirmedUser(learnerEmail, password);
  const ownerToken = await signIn(ownerEmail, password);
  const learnerToken = await signIn(learnerEmail, password);

  for (const [name, body] of [
    ["list_courses_v1", { p_query: null, p_limit: 1, p_before_updated_at: null, p_before_id: null }],
    ["list_owned_courses_v1", { p_query: null, p_limit: 1, p_before_updated_at: null, p_before_id: null }],
    ["get_course_v1", { p_course_id: crypto.randomUUID() }],
    ["load_course_personal_state_v1", { p_course_id: crypto.randomUUID() }],
  ]) {
    assertDenied(
      await request(`/rest/v1/rpc/${name}`, { method: "POST", body }),
      `anon não pode executar ${name}`,
    );
  }
  assertDenied(
    await request("/functions/v1/aralearn-course-api/app/listarCursos", {
      method: "POST",
      body: {},
      origin: APPLICATION_ORIGIN,
    }),
    "Course API exige sessão",
  );

  for (const table of ["courses", "course_access", "course_personal_states"]) {
    assertDenied(
      await request(`/rest/v1/${table}?select=*&limit=1`, { token: ownerToken }),
      `authenticated não consulta diretamente ${table}`,
    );
  }

  const ownerCannotSeeLearnerProfile = await request(
    `/rest/v1/person_profiles?select=user_id,display_name&user_id=eq.${learner.id}`,
    { token: ownerToken },
  );
  assert.equal(
    ownerCannotSeeLearnerProfile.response.status,
    200,
    failureMessage("RLS inicial de perfil", ownerCannotSeeLearnerProfile),
  );
  assert.deepEqual(ownerCannotSeeLearnerProfile.payload, []);

  const createRequestId = crypto.randomUUID();
  const createArguments = {
    requestId: createRequestId,
    title: "Curso de smoke canônico",
    objective: "Validar a identidade viva de Curso",
  };
  const created = await courseAction("criarCurso", createArguments, ownerToken);
  const replayedCreate = await courseAction("criarCurso", createArguments, ownerToken);
  const courseId = created.data.courseId;
  assert.match(courseId, /^[0-9a-f-]{36}$/iu);
  assert.equal(created.data.revision, 1);
  assert.equal(created.data.ownership, "owned");
  assert.equal(replayedCreate.data.courseId, courseId);
  assert.equal(replayedCreate.data.idempotent, true);

  const updatedProfile = await courseAction("gerirPessoas", {
    operation: "update_profile",
    displayName: "Pessoa autora do smoke",
  }, ownerToken);
  assert.equal(updatedProfile.data.userId, owner.id);
  assert.equal(updatedProfile.data.displayName, "Pessoa autora do smoke");

  const metadataRequestId = crypto.randomUUID();
  const metadataArguments = {
    requestId: metadataRequestId,
    courseId,
    expectedRevision: 1,
    expectedPlanVersion: 1,
    operation: "update_instructional_plan",
    planCommand: {
      type: "update_plan",
      title: "Curso vivo de smoke",
      authoringGuidance: "Contexto privado do autor.",
    },
  };
  const metadata = await courseAction("alterarCurso", metadataArguments, ownerToken);
  const metadataReplay = await courseAction("alterarCurso", metadataArguments, ownerToken);
  assert.equal(metadata.data.courseRevision, 2);
  assert.equal(metadata.data.planVersion, 2);
  assert.equal(metadataReplay.data.courseRevision, 2);
  assert.equal(metadataReplay.data.idempotent, true);

  const authoringPartId = crypto.randomUUID();
  const partChange = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 2,
    expectedPlanVersion: 2,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_part",
      id: authoringPartId,
      position: 0,
      title: "Parte canônica",
      intent: "Produzir e validar uma microssequência.",
    },
  }, ownerToken);
  assert.equal(partChange.data.courseRevision, 3);
  assert.equal(partChange.data.planVersion, 3);

  const compositionRows = flattenCourseDocument({
    contract: "aralearn.library.v1",
    courses: [{
      id: courseId,
      title: "Curso vivo de smoke",
      goal: "Validar a identidade viva de Curso",
      modules: [{
        id: "module-smoke",
        title: "Módulo canônico",
        guide: {
          goal: "Validar o módulo.", include: ["Curso"], exclude: [], notation: [], avoid: [],
        },
        lessons: [{
          id: "lesson-smoke",
          title: "Lição canônica",
          guide: {
            goal: "Validar a lição.", include: ["Curso"], exclude: [], notation: [], avoid: [],
          },
          topics: [],
          microsequences: [{
            id: "microsequence-smoke",
            title: "Microssequência canônica",
            goal: "Validar a composição.",
            role: "explain",
            dependsOn: [], covers: [], checks: [], errors: [],
            cards: [{
              id: "study-unit-smoke",
              position: 1,
              title: "Unidade canônica",
              role: "theory",
              content: [{
                id: "content-smoke",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Conteúdo validado pela jornada local." },
              }],
              response: null,
              feedback: [], topics: [], sources: [],
            }],
          }],
        }],
      }],
    }],
  }).rows;
  const composition = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 3,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: [],
  }, ownerToken);
  assert.equal(composition.data.revision, 4);
  assert.equal(composition.data.upsertedCount, 4);

  const assignment = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 4,
    expectedPlanVersion: 3,
    operation: "update_instructional_plan",
    planCommand: {
      type: "assign_microsequence",
      partId: authoringPartId,
      microsequenceId: "microsequence-smoke",
      position: 0,
    },
  }, ownerToken);
  assert.equal(assignment.data.courseRevision, 5);
  assert.equal(assignment.data.planVersion, 4);

  const materializationId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const startedMaterialization = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 5,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "start",
      authoringPartId,
      materializationId,
      expectedMaterializationVersion: 0,
      authoringPartVersion: 2,
      designContext: { purpose: "smoke local" },
      steps: [{
        id: stepId,
        position: 0,
        kind: "context_load",
        targetDidacticMicrosequenceId: null,
        productionPosition: null,
      }],
    },
  }, ownerToken);
  assert.equal(startedMaterialization.data.courseRevision, 6);
  assert.equal(startedMaterialization.data.materialization.version, 1);

  const resumable = await courseAction("lerCurso", {
    courseId,
    view: "part_materialization",
    authoringPartId,
    materializationId,
  }, ownerToken);
  assert.equal(resumable.data.materialization.nextPendingStep.id, stepId);
  assert.equal(resumable.data.materialization.steps.length, 1);

  const recordedStep = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 6,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "record_step",
      authoringPartId,
      materializationId,
      expectedMaterializationVersion: 1,
      stepId,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: { contextLoaded: true },
      entityChanges: { upserts: [], deletes: [] },
    },
  }, ownerToken);
  assert.equal(recordedStep.data.courseRevision, 7);
  assert.equal(recordedStep.data.materialization.version, 2);

  const finishedMaterialization = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 7,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "finish",
      authoringPartId,
      materializationId,
      expectedMaterializationVersion: 2,
      status: "completed",
      resultFacts: { validated: true },
    },
  }, ownerToken);
  assert.equal(finishedMaterialization.data.courseRevision, 8);
  assert.equal(finishedMaterialization.data.materialization.status, "completed");

  const ownerCourses = await rpc("list_owned_courses_v1", {
    p_query: "Curso vivo",
    p_limit: 24,
    p_before_updated_at: null,
    p_before_id: null,
  }, ownerToken);
  assert.equal(itemForCourse(ownerCourses, courseId)?.ownership, "owned");
  const ownerCourse = await rpc("get_owned_course_v1", {
    p_course_id: courseId,
  }, ownerToken);
  assert.equal(ownerCourse.courseId, courseId);
  assert.equal(Object.hasOwn(ownerCourse, "authoringState"), false);
  const ownerPlan = await courseAction("lerCurso", {
    courseId,
    view: "instructional_plan",
  }, ownerToken);
  assert.equal(ownerPlan.data.plan.parts[0].id, authoringPartId);
  assert.equal(ownerPlan.data.plan.parts[0].progress.state, "materialized");

  const learnerBeforeGrant = await rpc("list_courses_v1", {
    p_query: null,
    p_limit: 24,
    p_before_updated_at: null,
    p_before_id: null,
  }, learnerToken);
  assert.equal(itemForCourse(learnerBeforeGrant, courseId), null);

  const grant = await courseAction("gerirPessoas", {
    operation: "grant_access",
    requestId: crypto.randomUUID(),
    courseId,
    email: learnerEmail,
    confirmed: true,
  }, ownerToken);
  assert.equal(grant.data.changed, true);
  assert.equal(grant.data.person.userId, learner.id);

  const ownerSeesLearnerProfile = await request(
    `/rest/v1/person_profiles?select=user_id,display_name&user_id=eq.${learner.id}`,
    { token: ownerToken },
  );
  assert.equal(ownerSeesLearnerProfile.response.status, 200);
  assert.equal(ownerSeesLearnerProfile.payload[0]?.user_id, learner.id);

  const learnerStudyCourses = await rpc("list_courses_v1", {
    p_query: null,
    p_limit: 24,
    p_before_updated_at: null,
    p_before_id: null,
  }, learnerToken);
  assert.equal(itemForCourse(learnerStudyCourses, courseId)?.ownership, "shared");
  const learnerAuthoringCourses = await rpc("list_owned_courses_v1", {
    p_query: null,
    p_limit: 24,
    p_before_updated_at: null,
    p_before_id: null,
  }, learnerToken);
  assert.equal(itemForCourse(learnerAuthoringCourses, courseId), null);

  const sharedCourse = await rpc("get_course_v1", {
    p_course_id: courseId,
  }, learnerToken);
  assert.equal(sharedCourse.courseId, courseId);
  assert.equal(sharedCourse.ownership, "shared");
  assert.equal(sharedCourse.canEdit, false);
  assert.equal(Object.hasOwn(sharedCourse, "brief"), false);
  assert.equal(Object.hasOwn(sharedCourse, "authoringState"), false);
  const sharedEntities = await rpc("list_course_entities_v1", {
    p_course_id: courseId,
    p_expected_revision: 8,
    p_limit: 100,
    p_after_entity_type: null,
    p_after_entity_id: null,
  }, learnerToken);
  assert.equal(sharedEntities.items[0]?.entityId, "module-smoke");

  const learnerApiList = await courseAction("listarCursos", {}, learnerToken);
  assert.equal(itemForCourse(learnerApiList.data, courseId), null);
  assertDenied(
    await request("/functions/v1/aralearn-course-api/app/lerCurso", {
      method: "POST",
      token: learnerToken,
      body: { courseId },
      origin: APPLICATION_ORIGIN,
    }),
    "Curso compartilhado não entra na Autoria",
  );

  const personalRequestId = crypto.randomUUID();
  const personalArguments = {
    p_course_id: courseId,
    p_expected_revision: 0,
    p_operations: [{
      kind: "set",
      collection: "reviewMarks",
      path: "module-smoke",
      value: "2026-08-17T12:00:00Z",
    }],
    p_request_id: personalRequestId,
  };
  const learnerState = await rpc(
    "mutate_course_personal_state_v1",
    personalArguments,
    learnerToken,
  );
  const replayedLearnerState = await rpc(
    "mutate_course_personal_state_v1",
    personalArguments,
    learnerToken,
  );
  assert.equal(learnerState.revision, 1);
  assert.equal(learnerState.idempotent, false);
  assert.equal(replayedLearnerState.idempotent, true);
  assert.equal(
    await rpc("load_course_personal_state_v1", { p_course_id: courseId }, ownerToken),
    null,
  );
  const loadedLearnerState = await rpc(
    "load_course_personal_state_v1",
    { p_course_id: courseId },
    learnerToken,
  );
  assert.equal(
    loadedLearnerState.state.reviewMarks["module-smoke"],
    "2026-08-17T12:00:00Z",
  );

  const revoked = await courseAction("gerirPessoas", {
    operation: "revoke_access",
    requestId: crypto.randomUUID(),
    courseId,
    userId: learner.id,
    confirmed: true,
  }, ownerToken);
  assert.equal(revoked.data.changed, true);
  const afterRevoke = await rpc("list_courses_v1", {
    p_query: null,
    p_limit: 24,
    p_before_updated_at: null,
    p_before_id: null,
  }, learnerToken);
  assert.equal(itemForCourse(afterRevoke, courseId), null);
  assertDenied(
    await request("/rest/v1/rpc/load_course_personal_state_v1", {
      method: "POST",
      token: learnerToken,
      body: { p_course_id: courseId },
    }),
    "revogação retira acesso sem misturar o estado pessoal",
  );

  console.log(
    "Smoke local de Curso: Course API, PostgREST, RLS, acesso direto e estado pessoal aprovados.",
  );
} finally {
  await removeLocalUser(learner?.id);
  await removeLocalUser(owner?.id);
}
