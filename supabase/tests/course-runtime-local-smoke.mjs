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
  const windows = process.platform === "win32";
  try {
    const output = execFileSync(
      windows ? (process.env.ComSpec || "cmd.exe") : "npx",
      windows
        ? ["/d", "/s", "/c", "npx --yes supabase@2.109.1 status -o json"]
        : ["--yes", "supabase@2.109.1", "status", "-o", "json"],
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
    contract: "aralearn.course.v1",
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
            studyUnits: [{
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
            }, {
              id: "study-unit-smoke-2",
              position: 2,
              title: "Segunda Unidade canônica",
              role: "theory",
              content: [{
                id: "content-smoke-2",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Segunda página validada sem recompor o Curso." },
              }],
              response: null,
              feedback: [], topics: [], sources: [],
            }, {
              id: "study-unit-smoke-3",
              position: 3,
              title: "Terceira Unidade canônica",
              role: "theory",
              content: [{
                id: "content-smoke-3",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Terceira página validada pela materialização." },
              }],
              response: null,
              feedback: [], topics: [], sources: [],
            }],
          }],
        }],
      }],
    }],
  }).rows;
  assert.equal(
    compositionRows.some(({ entityType }) => entityType === "study_unit"),
    true,
  );
  const composition = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 3,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: [],
  }, ownerToken);
  assert.equal(composition.data.revision, 4);
  assert.equal(composition.data.upsertedCount, 6);

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

  const assignedAnalysisUnitId = crypto.randomUUID();
  const unassignedAnalysisUnitId = crypto.randomUUID();
  const evidenceRequirementId = crypto.randomUUID();
  let planCourseRevision = assignment.data.courseRevision;
  let planVersion = assignment.data.planVersion;
  for (const [kind, id, statement] of [
    [
      "instructional_analysis_unit",
      assignedAnalysisUnitId,
      "Distinguir a configuração DNS da concessão DHCP.",
    ],
    [
      "instructional_analysis_unit",
      unassignedAnalysisUnitId,
      "Relacionar uma reserva DHCP a outro caso de uso.",
    ],
    [
      "evidence_requirement",
      evidenceRequirementId,
      "Explicar a relação DNS–DHCP em dois casos distintos.",
    ],
  ]) {
    const planItemChange = await courseAction("alterarCurso", {
      requestId: crypto.randomUUID(),
      courseId,
      expectedRevision: planCourseRevision,
      expectedPlanVersion: planVersion,
      operation: "update_instructional_plan",
      planCommand: {
        type: "add_plan_item",
        kind,
        id,
        position: kind === "instructional_analysis_unit"
          ? Number(id === unassignedAnalysisUnitId)
          : 0,
        statement,
      },
    }, ownerToken);
    planCourseRevision = planItemChange.data.courseRevision;
    planVersion = planItemChange.data.planVersion;
  }
  assert.equal(planCourseRevision, 8);
  assert.equal(planVersion, 7);

  const designBeforeMapping = await courseAction("lerCurso", {
    courseId,
    view: "course_design",
    scope: { kind: "didactic_microsequence", ref: "microsequence-smoke" },
    limit: 32,
  }, ownerToken);
  assert.deepEqual(designBeforeMapping.data.targetPlanItems, {
    instructionalAnalysisUnitIds: [],
    evidenceRequirementIds: [],
  });
  const paragraphComponentRef = "aralearn.resource.paragraph@1.0.0";
  const targetPlanItems = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: planCourseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_target_plan_items",
      scope: { kind: "didactic_microsequence", ref: "microsequence-smoke" },
      instructionalAnalysisUnitIds: [assignedAnalysisUnitId],
      evidenceRequirementIds: [evidenceRequirementId],
    },
  }, ownerToken);
  assert.equal(targetPlanItems.data.courseRevision, 9);
  assert.equal(targetPlanItems.data.change.type, "set_target_plan_items");

  const policyChange = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: targetPlanItems.data.courseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_component_policy",
      scope: { kind: "didactic_microsequence", ref: "microsequence-smoke" },
      policy: {
        catalogVersion: designBeforeMapping.data.componentCatalog.version,
        availability: "allow_only",
        allowedRefs: [paragraphComponentRef],
        excludedRefs: [],
        preferredRefs: [paragraphComponentRef],
      },
      origin: "author",
      reason: "A materialização do smoke usa somente prosa corrente.",
    },
  }, ownerToken);
  assert.equal(policyChange.data.courseRevision, 10);

  const materializationId = crypto.randomUUID();
  const stepId = crypto.randomUUID();
  const startedMaterialization = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: policyChange.data.courseRevision,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "start",
      authoringPartId,
      materializationId,
      expectedMaterializationVersion: 0,
      authoringPartVersion: 2,
      steps: [{
        id: stepId,
        position: 0,
        kind: "didactic_microsequence_materialization",
        targetDidacticMicrosequenceId: "microsequence-smoke",
        productionPosition: 0,
      }],
    },
  }, ownerToken);
  assert.equal(startedMaterialization.data.courseRevision, 11);
  assert.equal(startedMaterialization.data.materialization.version, 1);
  const { contextHash, designContext } = startedMaterialization.data.materialization;
  assert.match(contextHash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(
    designContext.instructionalAnalysisUnits.map(({ id }) => id),
    [assignedAnalysisUnitId],
  );
  assert.deepEqual(
    Object.keys(designContext.instructionalAnalysisUnits[0]).sort(),
    ["id", "position", "statement", "version"],
  );
  assert.deepEqual(
    designContext.evidenceRequirements.map(({ id }) => id),
    [evidenceRequirementId],
  );
  assert.deepEqual(designContext.targets.map((target) => ({
    id: target.didacticMicrosequenceId,
    analysis: target.instructionalAnalysisUnitIds,
    evidence: target.evidenceRequirementIds,
  })), [{
    id: "microsequence-smoke",
    analysis: [assignedAnalysisUnitId],
    evidence: [evidenceRequirementId],
  }]);

  const resumable = await courseAction("lerCurso", {
    courseId,
    view: "part_materialization",
    authoringPartId,
    materializationId,
  }, ownerToken);
  assert.equal(resumable.data.materialization.nextPendingStep.id, stepId);
  assert.equal(resumable.data.materialization.steps.length, 1);
  assert.equal(resumable.data.materialization.steps[0].status, "pending");

  const materializedStudyUnits = compositionRows
    .filter(({ entityType }) => entityType === "study_unit")
    .map((change, index) => ({
      ...change,
      content: {
        ...change.content,
        title: `Unidade materializada ${index + 1}`,
        content: change.content.content.map((component) => ({
          ...component,
          data: {
            ...component.data,
            text: `Conteúdo factual materializado ${index + 1}.`,
          },
        })),
      },
    }));
  const explanationApplication = {
    instructionalAnalysisUnitId: assignedAnalysisUnitId,
    developedForms: [
      "plain_definition",
      "concrete_example",
      "mechanism",
      "contrast",
    ],
    notApplicable: [],
  };
  const practiceApplication = (opportunityId) => ({
    evidenceRequirementId,
    opportunityId,
    invariantTaskOperation: "explicar a relação entre configuração DNS e concessão DHCP",
    variedDimensions: ["case_or_data"],
  });
  const designApplication = {
    contextHash,
    didacticMicrosequenceId: "microsequence-smoke",
    studyUnits: [{
      studyUnitId: "study-unit-smoke",
      mode: "expository",
      introducedInstructionalAnalysisUnitIds: [assignedAnalysisUnitId],
      explanationApplications: [explanationApplication],
      practiceApplications: [],
      componentRefs: [paragraphComponentRef],
    }, {
      studyUnitId: "study-unit-smoke-2",
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [practiceApplication("dns-dhcp-case-a")],
      componentRefs: [paragraphComponentRef],
    }, {
      studyUnitId: "study-unit-smoke-3",
      mode: "practice",
      introducedInstructionalAnalysisUnitIds: [],
      explanationApplications: [],
      practiceApplications: [practiceApplication("dns-dhcp-case-b")],
      componentRefs: [paragraphComponentRef],
    }],
  };
  const unassignedApplication = structuredClone(designApplication);
  unassignedApplication.studyUnits[0].introducedInstructionalAnalysisUnitIds.push(
    unassignedAnalysisUnitId,
  );
  unassignedApplication.studyUnits[0].explanationApplications.push({
    ...explanationApplication,
    instructionalAnalysisUnitId: unassignedAnalysisUnitId,
  });
  const rejectedStep = await request(
    "/functions/v1/aralearn-course-api/app/alterarCurso",
    {
      method: "POST",
      token: ownerToken,
      origin: APPLICATION_ORIGIN,
      body: {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: 11,
        operation: "advance_part_materialization",
        materializationCommand: {
          operation: "record_step",
          authoringPartId,
          materializationId,
          expectedMaterializationVersion: 1,
          stepId,
          expectedStepVersion: 1,
          status: "completed",
          resultFacts: { audit: "unassigned_plan_item" },
          entityChanges: { upserts: materializedStudyUnits, deletes: [] },
          designApplication: unassignedApplication,
        },
      },
    },
  );
  assert.equal(
    rejectedStep.response.status,
    422,
    failureMessage("materialização com item não atribuído", rejectedStep),
  );
  const afterRejectedStep = await courseAction("lerCurso", {
    courseId,
    view: "part_materialization",
    authoringPartId,
    materializationId,
  }, ownerToken);
  assert.equal(afterRejectedStep.data.courseRevision, 11);
  assert.equal(afterRejectedStep.data.materialization.version, 1);
  assert.equal(afterRejectedStep.data.materialization.steps[0].status, "pending");
  assert.equal(afterRejectedStep.data.materialization.steps[0].version, 1);

  const recordedStep = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 11,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "record_step",
      authoringPartId,
      materializationId,
      expectedMaterializationVersion: 1,
      stepId,
      expectedStepVersion: 1,
      status: "completed",
      resultFacts: { audit: "target_specific_design" },
      entityChanges: { upserts: materializedStudyUnits, deletes: [] },
      designApplication,
    },
  }, ownerToken);
  assert.equal(recordedStep.data.courseRevision, 12);
  assert.equal(recordedStep.data.materialization.version, 2);
  assert.equal(recordedStep.data.step.status, "completed");
  assert.equal(recordedStep.data.entities.updatedCount, 3);
  assert.equal(
    recordedStep.data.entities.linkedDidacticMicrosequenceId,
    "microsequence-smoke",
  );

  const finishedMaterialization = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 12,
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
  assert.equal(finishedMaterialization.data.courseRevision, 13);
  assert.equal(finishedMaterialization.data.materialization.status, "completed");

  const initialDesign = await courseAction("lerCurso", {
    courseId,
    view: "course_design",
    scope: { kind: "course", ref: courseId },
    limit: 32,
  }, ownerToken);
  assert.equal(initialDesign.data.contract, "aralearn.course-design.v1");
  assert.equal(initialDesign.data.courseRevision, 13);
  assert.equal(initialDesign.data.targetPlanItems, null);
  assert.equal(initialDesign.data.definitions.length, 4);
  assert.equal(initialDesign.data.componentCatalog.options.length, 32);
  assert.deepEqual(initialDesign.data.guidance.effectiveRevisions, []);

  const designRequestId = crypto.randomUUID();
  const designArguments = {
    requestId: designRequestId,
    courseId,
    expectedRevision: 13,
    operation: "update_course_design",
    designCommand: {
      type: "set_parameter",
      scope: { kind: "course", ref: courseId },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 3,
      origin: "author",
      reason: "Exercitar a resolução explícita no smoke local.",
    },
  };
  const designChange = await courseAction("alterarCurso", designArguments, ownerToken);
  const replayedDesignChange = await courseAction("alterarCurso", designArguments, ownerToken);
  assert.equal(designChange.data.courseRevision, 14);
  assert.equal(designChange.data.change.type, "set_parameter");
  assert.equal(replayedDesignChange.data.courseRevision, 14);
  assert.equal(replayedDesignChange.data.idempotent, true);

  const resolvedDesign = await courseAction("lerCurso", {
    courseId,
    view: "course_design",
    scope: { kind: "course", ref: courseId },
    limit: 32,
  }, ownerToken);
  const resolvedCeiling = resolvedDesign.data.parameters.find(
    ({ parameterId }) => parameterId
      === "new_analysis_unit_ceiling_per_expository_study_unit",
  );
  assert.equal(resolvedDesign.data.courseRevision, 14);
  assert.equal(resolvedCeiling.effectiveAssignment.value, 3);
  assert.equal(resolvedCeiling.effectiveAssignment.origin, "author");

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

  const firstInspectionPage = await courseAction("lerCurso", {
    courseId,
    view: "study_units",
    expectedRevision: 14,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536,
  }, ownerToken);
  assert.equal(
    firstInspectionPage.data.contract,
    "aralearn.course-study-unit-inspection-page.v1",
  );
  assert.equal(firstInspectionPage.data.courseRevision, 14);
  assert.equal(firstInspectionPage.data.totalCount, 3);
  assert.equal(firstInspectionPage.data.items.length, 1);
  assert.equal(
    firstInspectionPage.data.items[0].studyUnit.id,
    "study-unit-smoke",
  );
  assert.equal(
    firstInspectionPage.data.items[0].studyUnit.title,
    "Unidade materializada 1",
  );
  assert.deepEqual(firstInspectionPage.data.nextCursor, {
    studyUnitId: "study-unit-smoke",
  });
  assert.equal(firstInspectionPage.data.hasMore, true);
  assert.ok(firstInspectionPage.data.pageBytes <= 65_536);

  const secondInspectionPage = await courseAction("lerCurso", {
    courseId,
    view: "study_units",
    expectedRevision: 14,
    scope: { kind: "course" },
    cursor: firstInspectionPage.data.nextCursor,
    direction: "forward",
    limit: 2,
    maxBytes: 65_536,
  }, ownerToken);
  assert.deepEqual(
    secondInspectionPage.data.items.map(({ studyUnit }) => studyUnit.id),
    ["study-unit-smoke-2", "study-unit-smoke-3"],
  );
  assert.equal(secondInspectionPage.data.hasPrevious, true);
  assert.equal(secondInspectionPage.data.hasMore, false);

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
  assertDenied(
    await request("/functions/v1/aralearn-course-api/app/lerCurso", {
      method: "POST",
      token: learnerToken,
      body: {
        courseId,
        view: "study_units",
        expectedRevision: 14,
        limit: 1,
        maxBytes: 65_536,
      },
      origin: APPLICATION_ORIGIN,
    }),
    "Curso compartilhado não entra na Inspeção autoral",
  );

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
    p_expected_revision: 14,
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
