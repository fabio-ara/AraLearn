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

const AUDIT_CRITERIA = Object.freeze({
  pedagogical_quality: Object.freeze({
    code: "pedagogical_alignment",
    version: "1",
    statement: "A Unidade concretiza a intenção pedagógica declarada.",
  }),
  factual_quality: Object.freeze({
    code: "claim_support",
    version: "1",
    statement: "As afirmações factuais possuem suporte exato em Fonte e Âncora ativas.",
  }),
  editorial_quality: Object.freeze({
    code: "editorial_clarity",
    version: "1",
    statement: "A formulação é clara, precisa e adequada ao contexto da Unidade.",
  }),
});

function auditCheck(dimension, result, {
  checkId = crypto.randomUUID(),
  sourceLinks = [],
} = {}) {
  const adequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed",
  }[result];
  assert(adequacy, `Resultado de auditoria desconhecido: ${result}`);
  return {
    checkId,
    dimension,
    criterion: AUDIT_CRITERIA[dimension],
    result,
    publicEvidence: result === "not_checked"
      ? "Dimensão não reavaliada nesta rodada focal."
      : `Resultado público da dimensão ${dimension} no smoke local.`,
    adequacy,
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks,
  };
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
    ["load_course_personal_state_v2", { p_course_id: crypto.randomUUID() }],
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
              feedback: [], topics: [],
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
              feedback: [], topics: [],
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
              feedback: [], topics: [],
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
    sourceAttributionApplications: [
      "study-unit-smoke",
      "study-unit-smoke-2",
      "study-unit-smoke-3",
    ].map((studyUnitId) => ({ studyUnitId, sourceLinks: [] })),
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
        sourceLinks: [],
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

  const sourceId = "source-smoke-verified";
  const anchorId = "anchor-smoke-verified";
  const savedSource = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: targetPlanItems.data.courseRevision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "save_source",
      sourceId,
      expectedSourceRevision: 0,
      source: {
        kind: "web_page",
        title: "Referência verificada do smoke",
        citationText: "AraLearn. Referência verificada do smoke, 2026.",
        url: "https://example.test/aralearn/source-smoke",
        editionOrVersion: "2026-08-17",
        studyVisibility: "citation_and_link",
      },
    },
  }, ownerToken);
  assert.equal(savedSource.data.courseRevision, 10);
  assert.deepEqual(savedSource.data.change, {
    type: "save_source",
    subjectId: sourceId,
    revision: 1,
  });

  const savedAnchor = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: savedSource.data.courseRevision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "save_anchor",
      anchorId,
      sourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: {
        kind: "text_quote",
        exact: "Conteúdo factual materializado",
        prefix: "Trecho anterior",
        suffix: "Trecho posterior",
      },
      verificationExcerpt: "Trecho privado usado somente para verificação autoral.",
    },
  }, ownerToken);
  assert.equal(savedAnchor.data.courseRevision, 11);
  assert.deepEqual(savedAnchor.data.change, {
    type: "save_anchor",
    subjectId: anchorId,
    revision: 1,
  });

  const sourceLink = {
    sourceId,
    sourceRevision: 1,
    relation: "supported_by",
    anchors: [{ anchorId, anchorRevision: 1 }],
  };
  const sourceDetail = await courseAction("lerCurso", {
    courseId,
    view: "course_sources",
    expectedRevision: savedAnchor.data.courseRevision,
    mode: "source",
    sourceId,
    limit: 10,
  }, ownerToken);
  assert.equal(sourceDetail.data.contract, "aralearn.course-sources.v1");
  assert.deepEqual(sourceDetail.data.query, {
    sourceId,
    targetKind: null,
    targetId: null,
  });
  assert.equal(sourceDetail.data.items[0].status, "active");
  assert.equal(sourceDetail.data.items[0].anchors[0].anchorId, anchorId);
  assert.equal(
    sourceDetail.data.items[0].anchors[0].verificationExcerpt,
    "Trecho privado usado somente para verificação autoral.",
  );

  const rejectedSourceAttribution = await request(
    "/functions/v1/aralearn-course-api/app/alterarCurso",
    {
      method: "POST",
      token: ownerToken,
      origin: APPLICATION_ORIGIN,
      body: {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: savedAnchor.data.courseRevision,
        operation: "update_course_sources",
        sourceCommand: {
          type: "set_target_sources",
          targetKind: "plan_item",
          targetId: assignedAnalysisUnitId,
          expectedTargetVersion: 1,
          sourceLinks: [{
            sourceId: "source-smoke-inexistente",
            sourceRevision: 1,
            relation: "supported_by",
            anchors: [{
              anchorId: "anchor-smoke-inexistente",
              anchorRevision: 1,
            }],
          }],
        },
      },
    },
  );
  assert.equal(
    rejectedSourceAttribution.response.status,
    422,
    failureMessage("atribuição com Fonte e Âncora inexistentes", rejectedSourceAttribution),
  );
  const afterRejectedSourceAttribution = await courseAction("lerCurso", {
    courseId,
    view: "course_sources",
    expectedRevision: savedAnchor.data.courseRevision,
    mode: "catalog",
    limit: 10,
  }, ownerToken);
  assert.equal(afterRejectedSourceAttribution.data.courseRevision, 11);
  assert.deepEqual(
    afterRejectedSourceAttribution.data.items.map(({ sourceId: itemSourceId }) => itemSourceId),
    [sourceId],
  );

  const attributedPlanItem = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: savedAnchor.data.courseRevision,
    operation: "update_course_sources",
    sourceCommand: {
      type: "set_target_sources",
      targetKind: "plan_item",
      targetId: assignedAnalysisUnitId,
      expectedTargetVersion: 1,
      sourceLinks: [sourceLink],
    },
  }, ownerToken);
  assert.equal(attributedPlanItem.data.courseRevision, 12);
  assert.equal(attributedPlanItem.data.change.type, "set_target_sources");
  const planItemSources = await courseAction("lerCurso", {
    courseId,
    view: "course_sources",
    expectedRevision: attributedPlanItem.data.courseRevision,
    mode: "target",
    targetKind: "plan_item",
    targetId: assignedAnalysisUnitId,
    limit: 10,
  }, ownerToken);
  assert.equal(planItemSources.data.items[0].effective, true);
  assert.deepEqual(planItemSources.data.items[0].sourceLinks, [sourceLink]);
  const contextualSourceDetail = await courseAction("lerCurso", {
    courseId,
    view: "course_sources",
    expectedRevision: attributedPlanItem.data.courseRevision,
    mode: "source",
    sourceId,
    targetKind: "plan_item",
    targetId: assignedAnalysisUnitId,
    limit: 1,
  }, ownerToken);
  assert.deepEqual(contextualSourceDetail.data.query, {
    sourceId,
    targetKind: "plan_item",
    targetId: assignedAnalysisUnitId,
  });
  assert.equal(contextualSourceDetail.data.nextCursor, null);
  assert.equal(contextualSourceDetail.data.items.length, 1);
  assert.equal(contextualSourceDetail.data.items[0].revision, sourceLink.sourceRevision);
  assert.equal(
    contextualSourceDetail.data.items[0].anchors[0].revision,
    sourceLink.anchors[0].anchorRevision,
  );

  const policyChange = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: attributedPlanItem.data.courseRevision,
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
  assert.equal(policyChange.data.courseRevision, 13);

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
  assert.equal(startedMaterialization.data.courseRevision, 14);
  assert.equal(startedMaterialization.data.materialization.version, 1);
  const { contextHash, designContext } = startedMaterialization.data.materialization;
  assert.match(contextHash, /^[a-f0-9]{64}$/u);
  assert.equal(designContext.contract, "aralearn.course-design-context.v2");
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
  const sealedTarget = designContext.targets[0];
  assert.equal(
    sealedTarget.sourceAttributions.instructionalAnalysisUnits[0].planItemId,
    assignedAnalysisUnitId,
  );
  assert.deepEqual(
    sealedTarget.sourceAttributions.instructionalAnalysisUnits[0].sources.map((source) => ({
      sourceId: source.sourceId,
      sourceRevision: source.sourceRevision,
      relation: source.relation,
      anchors: source.anchors.map(({ anchorId: sealedAnchorId, anchorRevision }) => ({
        anchorId: sealedAnchorId,
        anchorRevision,
      })),
    })),
    [sourceLink],
  );
  assert.doesNotMatch(
    JSON.stringify(sealedTarget.sourceAttributions),
    /citationText|verificationExcerpt|studyVisibility|actorId|channel|history|excerpt/iu,
  );

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
        title: index === 1
          ? "Texto explicado materializado 2"
          : `Unidade materializada ${index + 1}`,
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
  const sourceAttributionApplication = {
    contract: "aralearn.course-source-attribution-application.v1",
    contextHash,
    didacticMicrosequenceId: "microsequence-smoke",
    studyUnits: [{
      studyUnitId: "study-unit-smoke",
      sourceLinks: [sourceLink],
    }, {
      studyUnitId: "study-unit-smoke-2",
      sourceLinks: [],
    }, {
      studyUnitId: "study-unit-smoke-3",
      sourceLinks: [],
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
        expectedRevision: 14,
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
          sourceAttributionApplication,
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
  assert.equal(afterRejectedStep.data.courseRevision, 14);
  assert.equal(afterRejectedStep.data.materialization.version, 1);
  assert.equal(afterRejectedStep.data.materialization.steps[0].status, "pending");
  assert.equal(afterRejectedStep.data.materialization.steps[0].version, 1);

  const recordedStep = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 14,
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
      sourceAttributionApplication,
    },
  }, ownerToken);
  assert.equal(recordedStep.data.courseRevision, 15);
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
    expectedRevision: 15,
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
  assert.equal(finishedMaterialization.data.courseRevision, 16);
  assert.equal(finishedMaterialization.data.materialization.status, "completed");

  const initialDesign = await courseAction("lerCurso", {
    courseId,
    view: "course_design",
    scope: { kind: "course", ref: courseId },
    limit: 32,
  }, ownerToken);
  assert.equal(initialDesign.data.contract, "aralearn.course-design.v1");
  assert.equal(initialDesign.data.courseRevision, 16);
  assert.equal(initialDesign.data.targetPlanItems, null);
  assert.equal(initialDesign.data.definitions.length, 4);
  assert.equal(initialDesign.data.componentCatalog.options.length, 32);
  assert.deepEqual(initialDesign.data.guidance.effectiveRevisions, []);

  const designRequestId = crypto.randomUUID();
  const designArguments = {
    requestId: designRequestId,
    courseId,
    expectedRevision: 16,
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
  assert.equal(designChange.data.courseRevision, 17);
  assert.equal(designChange.data.change.type, "set_parameter");
  assert.equal(replayedDesignChange.data.courseRevision, 17);
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
  assert.equal(resolvedDesign.data.courseRevision, 17);
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
    expectedRevision: 17,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536,
  }, ownerToken);
  assert.equal(
    firstInspectionPage.data.contract,
    "aralearn.course-study-unit-inspection-page.v1",
  );
  assert.equal(firstInspectionPage.data.courseRevision, 17);
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
    expectedRevision: 17,
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
        expectedRevision: 17,
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
    p_expected_revision: 17,
    p_limit: 100,
    p_after_entity_type: null,
    p_after_entity_id: null,
  }, learnerToken);
  assert.equal(sharedEntities.items[0]?.entityId, "module-smoke");

  const sharedCitations = await rpc("get_course_study_citations_v1", {
    p_course_id: courseId,
    p_expected_revision: 17,
    p_study_unit_id: "study-unit-smoke",
  }, learnerToken);
  assert.deepEqual(Object.keys(sharedCitations).sort(), [
    "citations", "contract", "courseId", "courseRevision", "studyUnitId",
  ]);
  assert.equal(sharedCitations.contract, "aralearn.course-study-citations.v1");
  assert.equal(sharedCitations.courseId, courseId);
  assert.equal(sharedCitations.courseRevision, 17);
  assert.equal(sharedCitations.studyUnitId, "study-unit-smoke");
  assert.equal(sharedCitations.citations.length, 1);
  assert.deepEqual(Object.keys(sharedCitations.citations[0]).sort(), [
    "anchors", "citationText", "editionOrVersion", "sourceId",
    "sourceRevision", "title", "url",
  ]);
  assert.equal(sharedCitations.citations[0].sourceId, sourceId);
  assert.equal(sharedCitations.citations[0].url, "https://example.test/aralearn/source-smoke");
  assert.deepEqual(Object.keys(sharedCitations.citations[0].anchors[0]).sort(), [
    "anchorId", "anchorRevision", "selector",
  ]);
  assert.equal(sharedCitations.citations[0].anchors[0].anchorId, anchorId);
  assert.doesNotMatch(
    JSON.stringify(sharedCitations),
    /verificationExcerpt|studyVisibility|actorId|channel|history|excerpt/iu,
  );

  const removedStudyUnit = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: 17,
    operation: "commit_course_composition",
    upserts: [],
    deletes: [{ entityType: "study_unit", entityId: "study-unit-smoke" }],
    sourceAttributionApplications: [],
  }, ownerToken);
  assert.equal(removedStudyUnit.data.revision, 18);
  const staleRemovedStudyUnitCitations = await request(
    "/rest/v1/rpc/get_course_study_citations_v1",
    {
      method: "POST",
      token: learnerToken,
      body: {
        p_course_id: courseId,
        p_expected_revision: 17,
        p_study_unit_id: "study-unit-smoke",
      },
    },
  );
  assert(
    [409, 500].includes(staleRemovedStudyUnitCitations.response.status),
    failureMessage("conflito de citações stale", staleRemovedStudyUnitCitations),
  );
  assert.equal(staleRemovedStudyUnitCitations.payload?.code, "40001");

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
    "mutate_course_personal_state_v2",
    personalArguments,
    learnerToken,
  );
  const replayedLearnerState = await rpc(
    "mutate_course_personal_state_v2",
    personalArguments,
    learnerToken,
  );
  assert.equal(learnerState.revision, 1);
  assert.equal(learnerState.idempotent, false);
  assert.equal(replayedLearnerState.idempotent, true);
  assert.equal(
    await rpc("load_course_personal_state_v2", { p_course_id: courseId }, ownerToken),
    null,
  );
  const loadedLearnerState = await rpc(
    "load_course_personal_state_v2",
    { p_course_id: courseId },
    learnerToken,
  );
  assert.equal(loadedLearnerState.contract, "aralearn.course-personal-state.v2");
  assert.equal(loadedLearnerState.state.version, 2);
  assert.equal(Object.hasOwn(loadedLearnerState.state, "observations"), false);
  assert.equal(
    loadedLearnerState.state.reviewMarks["module-smoke"],
    "2026-08-17T12:00:00Z",
  );

  const learnerAnnotationId = crypto.randomUUID();
  const learnerAnnotationRequestId = crypto.randomUUID();
  const learnerAnnotation = await rpc(
    "execute_my_course_anchored_annotation_command_v1",
    {
      p_course_id: courseId,
      p_expected_course_revision: removedStudyUnit.data.revision,
      p_command: {
        type: "create_anchored_annotation",
        annotationId: learnerAnnotationId,
        target: { kind: "study_unit", id: "study-unit-smoke-2" },
        rawText: "A formulação desta Unidade parece ambígua.",
        category: "confusing",
        capturedAt: null,
        briefSummary: null,
      },
      p_request_id: learnerAnnotationRequestId,
    },
    learnerToken,
  );
  assert.equal(learnerAnnotation.annotation.annotationId, learnerAnnotationId);
  assert.equal(learnerAnnotation.annotation.provenance.origin, "learner");
  assert.equal(learnerAnnotation.annotation.provenance.channel, "study_interface");

  const ownerAnnotations = await courseAction("lerCurso", {
    courseId,
    view: "anchored_annotations",
    expectedRevision: removedStudyUnit.data.revision,
    annotationSetVersion: null,
    mode: "target",
    states: ["open"],
    targetKind: "study_unit",
    targetId: "study-unit-smoke-2",
    includeDescendants: false,
    cursor: null,
    limit: 12,
  }, ownerToken);
  assert.equal(
    ownerAnnotations.data.contract,
    "aralearn.course-anchored-annotation-page.v1",
  );
  const protectedLearnerAnnotation = ownerAnnotations.data.items.find(
    ({ annotationId }) => annotationId === learnerAnnotationId,
  );
  assert.equal(protectedLearnerAnnotation.contributor.kind, "protected_person");
  assert.match(protectedLearnerAnnotation.contributor.ref, /^person-[0-9a-f]{16}$/u);
  assert.equal(protectedLearnerAnnotation.contributor.ref.includes(learner.id), false);
  assert.equal("email" in protectedLearnerAnnotation.contributor, false);
  assert.equal(protectedLearnerAnnotation.rawText, learnerAnnotation.annotation.rawText);

  const answeredAnnotation = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "respond_to_anchored_annotation",
      annotationId: learnerAnnotationId,
      expectedAnnotationVersion: protectedLearnerAnnotation.annotationVersion,
      ownerResponse: "Revisei a formulação e registrei a explicação.",
    },
  }, ownerToken);
  assert.equal(answeredAnnotation.data.annotation.ownerResponse.text,
    "Revisei a formulação e registrei a explicação.");

  const authorAnnotationId = crypto.randomUUID();
  const authorAnnotation = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    expectedRevision: removedStudyUnit.data.revision,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "create_anchored_annotation",
      annotationId: authorAnnotationId,
      target: { kind: "study_unit", id: "study-unit-smoke-2" },
      rawText: "Verificar esta passagem na próxima revisão.",
      category: "suggestion",
      capturedAt: null,
      briefSummary: null,
    },
  }, ownerToken);
  assert.equal(authorAnnotation.data.annotation.provenance.origin, "author");
  assert.equal(
    authorAnnotation.data.annotation.provenance.channel,
    "authoring_interface",
  );

  const foreignAnnotationProbes = [];
  for (const [annotationId, expectedAnnotationVersion] of [
    [crypto.randomUUID(), 1],
    [authorAnnotationId, 999],
    [authorAnnotationId, authorAnnotation.data.annotation.annotationVersion],
  ]) {
    foreignAnnotationProbes.push(await request(
      "/rest/v1/rpc/execute_my_course_anchored_annotation_command_v1",
      {
        method: "POST",
        token: learnerToken,
        body: {
          p_course_id: courseId,
          p_expected_course_revision: null,
          p_command: {
            type: "revise_anchored_annotation",
            annotationId,
            expectedAnnotationVersion,
            rawText: "Tentativa sem autoridade.",
            category: null,
            briefSummary: null,
          },
          p_request_id: crypto.randomUUID(),
        },
      },
    ));
  }
  assert.deepEqual(
    foreignAnnotationProbes.map(({ response }) => response.status),
    [404, 404, 404],
  );
  assert.deepEqual(
    foreignAnnotationProbes.map(({ payload: value }) => value),
    [
      foreignAnnotationProbes[0].payload,
      foreignAnnotationProbes[0].payload,
      foreignAnnotationProbes[0].payload,
    ],
  );
  assert.equal(
    foreignAnnotationProbes[0].payload?.code,
    "course_anchored_annotation_not_found",
  );
  const unchangedAuthorAnnotation = await courseAction("lerCurso", {
    courseId,
    view: "anchored_annotations",
    expectedRevision: removedStudyUnit.data.revision,
    annotationSetVersion: null,
    mode: "detail",
    annotationId: authorAnnotationId,
    limit: 1,
  }, ownerToken);
  assert.equal(
    unchangedAuthorAnnotation.data.items[0].annotationVersion,
    authorAnnotation.data.annotation.annotationVersion,
  );

  let auditCourseRevision = removedStudyUnit.data.revision;
  const auditTargetStudyUnitId = "study-unit-smoke-2";
  const loadAuditContext = async (annotationIds = [learnerAnnotationId]) => (await courseAction("lerCurso", {
    courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "context",
    targetStudyUnitId: auditTargetStudyUnitId,
    annotationIds,
    limit: 1,
  }, ownerToken)).data;
  const loadAuditDetail = async (findingId, correctionId = null) => {
    const result = await courseAction("lerCurso", {
      courseId,
      view: "audit_cycle",
      expectedRevision: auditCourseRevision,
      auditSetVersion: null,
      mode: "detail",
      findingId,
      ...(correctionId === null ? {} : { correctionId }),
      limit: 1,
    }, ownerToken);
    return result.data;
  };
  const mutateAudit = async (auditCommand, {
    requestId = crypto.randomUUID(),
    expectedRevision = auditCourseRevision,
  } = {}) => (await courseAction("alterarCurso", {
    requestId,
    courseId,
    expectedRevision,
    operation: "update_audit_cycle",
    auditCommand,
  }, ownerToken)).data;

  const initialAuditContextPage = await loadAuditContext();
  assert.equal(
    initialAuditContextPage.contract,
    "aralearn.course-audit-cycle-page.v1",
  );
  assert.equal(
    initialAuditContextPage.context.contract,
    "aralearn.course-audit-context.v1",
  );
  assert.equal(
    initialAuditContextPage.context.target.studyUnitId,
    auditTargetStudyUnitId,
  );
  assert.deepEqual(initialAuditContextPage.context.target.sourceLinks, []);
  const linkedAuditAnnotation = initialAuditContextPage.context.annotations.find(
    ({ annotationId }) => annotationId === learnerAnnotationId,
  );
  assert.equal(linkedAuditAnnotation.state, "considered");
  assert.equal(
    linkedAuditAnnotation.annotationVersion,
    answeredAnnotation.data.annotation.annotationVersion,
  );

  const originAuditRunId = crypto.randomUUID();
  const factualCheckId = crypto.randomUUID();
  const editorialCheckId = crypto.randomUUID();
  const factualFindingId = crypto.randomUUID();
  const editorialFindingId = crypto.randomUUID();
  const recordAuditCommand = {
    type: "record_audit",
    auditRunId: originAuditRunId,
    targetStudyUnitId: auditTargetStudyUnitId,
    contextHash: initialAuditContextPage.context.contextHash,
    origin: "human_audit",
    method: { id: "aralearn-local-smoke-review", version: "1" },
    checks: [
      auditCheck("pedagogical_quality", "not_checked"),
      auditCheck("factual_quality", "failed", { checkId: factualCheckId }),
      auditCheck("editorial_quality", "failed", { checkId: editorialCheckId }),
    ],
    findings: [{
      findingId: factualFindingId,
      checkId: factualCheckId,
      code: "missing_source_anchor",
      severity: "high",
      annotationRefs: [{
        annotationId: learnerAnnotationId,
        annotationVersion: linkedAuditAnnotation.annotationVersion,
      }],
    }, {
      findingId: editorialFindingId,
      checkId: editorialCheckId,
      code: "ambiguous_formulation",
      severity: "medium",
      annotationRefs: [{
        annotationId: learnerAnnotationId,
        annotationVersion: linkedAuditAnnotation.annotationVersion,
      }],
    }],
  };
  const recordAuditRequestId = crypto.randomUUID();
  const recordedAudit = await mutateAudit(recordAuditCommand, {
    requestId: recordAuditRequestId,
  });
  assert.equal(recordedAudit.courseRevision, auditCourseRevision);
  assert.equal(recordedAudit.idempotent, false);
  assert.equal(recordedAudit.change.type, "record_audit");
  assert.equal(recordedAudit.change.auditRunId, originAuditRunId);
  assert.deepEqual(
    recordedAudit.change.findingRefs.map(({ findingId }) => findingId).sort(),
    [factualFindingId, editorialFindingId].sort(),
  );
  const replayedAudit = await mutateAudit(recordAuditCommand, {
    requestId: recordAuditRequestId,
  });
  assert.equal(replayedAudit.idempotent, true);
  assert.equal(replayedAudit.courseRevision, recordedAudit.courseRevision);
  assert.equal(replayedAudit.auditSetVersion, recordedAudit.auditSetVersion);
  assert.deepEqual(replayedAudit.change, recordedAudit.change);

  const cleanAuditContextPage = await loadAuditContext([]);
  const cleanAuditRunId = crypto.randomUUID();
  const cleanAudit = await mutateAudit({
    type: "record_audit",
    auditRunId: cleanAuditRunId,
    targetStudyUnitId: auditTargetStudyUnitId,
    contextHash: cleanAuditContextPage.context.contextHash,
    origin: "human_audit",
    method: { id: "aralearn-local-smoke-clean-review", version: "1" },
    checks: [
      auditCheck("pedagogical_quality", "not_checked"),
      auditCheck("factual_quality", "not_checked"),
      auditCheck("editorial_quality", "not_checked"),
    ],
    findings: [],
  });
  assert.equal(cleanAudit.change.auditRunId, cleanAuditRunId);
  const auditRunsPage = (await courseAction("lerCurso", {
    courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "runs",
    targetStudyUnitId: auditTargetStudyUnitId,
    limit: 24,
  }, ownerToken)).data;
  const cleanAuditSummary = auditRunsPage.runs.find(
    ({ auditRunId }) => auditRunId === cleanAuditRunId,
  );
  assert.equal(cleanAuditSummary.findingsCreated, 0);
  assert.match(cleanAuditSummary.deepLink, new RegExp(`auditRunId=${cleanAuditRunId}$`, "u"));
  const cleanAuditDetail = (await courseAction("lerCurso", {
    courseId,
    view: "audit_cycle",
    expectedRevision: auditCourseRevision,
    auditSetVersion: null,
    mode: "detail",
    auditRunId: cleanAuditRunId,
    limit: 1,
  }, ownerToken)).data;
  assert.equal(cleanAuditDetail.runDetail.auditRunId, cleanAuditRunId);
  assert.equal(cleanAuditDetail.runDetail.metrics.findingsCreated, 0);
  assert.equal(cleanAuditDetail.runDetail.target.path.at(-1).id, auditTargetStudyUnitId);

  const initialEditorialDetail = await loadAuditDetail(editorialFindingId);
  assert.equal(initialEditorialDetail.detail.finding.status, "open");
  assert.equal(
    initialEditorialDetail.detail.finding.annotationRefs[0].annotationId,
    learnerAnnotationId,
  );
  const rejectedCorrectionId = crypto.randomUUID();
  const rejectedAfterContent = structuredClone(
    initialAuditContextPage.context.target.content,
  );
  rejectedAfterContent.title = "Formulação descartada pelo smoke";
  const proposedForRejection = await mutateAudit({
    type: "propose_authoring_correction",
    correctionId: rejectedCorrectionId,
    findingId: editorialFindingId,
    expectedFindingVersion:
      initialEditorialDetail.detail.finding.findingVersion,
    expectedCorrectionVersion: 0,
    afterContent: rejectedAfterContent,
    afterSourceLinks: initialAuditContextPage.context.target.sourceLinks,
    rationale: "Exercitar a rejeição explícita sem alterar o Curso.",
  });
  assert.equal(proposedForRejection.correction.status, "proposed");
  assert.deepEqual(
    proposedForRejection.correction.checkpoint.after.content.topics,
    initialAuditContextPage.context.target.content.topics,
  );
  assert.deepEqual(
    proposedForRejection.correction.checkpoint.after.sourceLinks,
    initialAuditContextPage.context.target.sourceLinks,
  );
  const rejectedCorrection = await mutateAudit({
    type: "reject_authoring_correction",
    findingId: editorialFindingId,
    expectedFindingVersion: proposedForRejection.finding.findingVersion,
    correctionId: rejectedCorrectionId,
    expectedCorrectionVersion:
      proposedForRejection.correction.correctionVersion,
  });
  assert.equal(rejectedCorrection.courseRevision, auditCourseRevision);
  assert.equal(rejectedCorrection.finding.status, "open");
  assert.equal(rejectedCorrection.correction.status, "rejected");
  const contextAfterRejection = await loadAuditContext();
  assert.deepEqual(
    contextAfterRejection.context.target.content,
    initialAuditContextPage.context.target.content,
  );
  assert.deepEqual(
    contextAfterRejection.context.target.sourceLinks,
    initialAuditContextPage.context.target.sourceLinks,
  );

  const editorialCorrectionId = crypto.randomUUID();
  const editorialAfterContent = structuredClone(
    initialAuditContextPage.context.target.content,
  );
  editorialAfterContent.title = "Segunda Unidade editorialmente clara";
  const proposedEditorialCorrection = await mutateAudit({
    type: "propose_authoring_correction",
    correctionId: editorialCorrectionId,
    findingId: editorialFindingId,
    expectedFindingVersion: rejectedCorrection.finding.findingVersion,
    expectedCorrectionVersion: 0,
    afterContent: editorialAfterContent,
    afterSourceLinks: initialAuditContextPage.context.target.sourceLinks,
    rationale: "Aplicar a correção editorial focal e verificá-la.",
  });
  assert.deepEqual(
    proposedEditorialCorrection.correction.checkpoint.before.content.topics,
    proposedEditorialCorrection.correction.checkpoint.after.content.topics,
  );
  assert.deepEqual(
    proposedEditorialCorrection.correction.checkpoint.before.sourceLinks,
    proposedEditorialCorrection.correction.checkpoint.after.sourceLinks,
  );

  const applyEditorialCommand = {
    type: "apply_authoring_correction",
    findingId: editorialFindingId,
    expectedFindingVersion:
      proposedEditorialCorrection.finding.findingVersion,
    correctionId: editorialCorrectionId,
    expectedCorrectionVersion:
      proposedEditorialCorrection.correction.correctionVersion,
  };
  const applyEditorialRequestId = crypto.randomUUID();
  const appliedEditorialCorrection = await mutateAudit(applyEditorialCommand, {
    requestId: applyEditorialRequestId,
  });
  assert.equal(appliedEditorialCorrection.courseRevision, auditCourseRevision + 1);
  assert.equal(appliedEditorialCorrection.finding.status, "awaiting_verification");
  assert.equal(appliedEditorialCorrection.correction.status, "applied");
  assert.equal(
    appliedEditorialCorrection.correction.application.courseRevision,
    appliedEditorialCorrection.courseRevision,
  );
  const replayedEditorialApplication = await mutateAudit(applyEditorialCommand, {
    requestId: applyEditorialRequestId,
    expectedRevision: auditCourseRevision,
  });
  assert.equal(replayedEditorialApplication.idempotent, true);
  assert.equal(
    replayedEditorialApplication.courseRevision,
    appliedEditorialCorrection.courseRevision,
  );
  assert.equal(
    replayedEditorialApplication.correction.correctionVersion,
    appliedEditorialCorrection.correction.correctionVersion,
  );
  const staleEditorialApplication = await request(
    "/functions/v1/aralearn-course-api/app/alterarCurso",
    {
      method: "POST",
      token: ownerToken,
      origin: APPLICATION_ORIGIN,
      body: {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: auditCourseRevision,
        operation: "update_audit_cycle",
        auditCommand: applyEditorialCommand,
      },
    },
  );
  assert.equal(
    staleEditorialApplication.response.status,
    409,
    failureMessage("CAS stale da aplicação editorial", staleEditorialApplication),
  );
  assert.equal(staleEditorialApplication.payload?.error?.code, "stale_course_state");
  auditCourseRevision = appliedEditorialCorrection.courseRevision;

  const editorialVerificationContext = await loadAuditContext();
  assert.equal(
    editorialVerificationContext.context.target.content.title,
    editorialAfterContent.title,
  );
  const verifiedEditorialStillOpen = await mutateAudit({
    type: "verify_finding",
    auditRunId: crypto.randomUUID(),
    findingId: editorialFindingId,
    expectedFindingVersion: appliedEditorialCorrection.finding.findingVersion,
    correctionId: editorialCorrectionId,
    expectedCorrectionVersion:
      appliedEditorialCorrection.correction.correctionVersion,
    contextHash: editorialVerificationContext.context.contextHash,
    origin: "human_audit",
    method: { id: "aralearn-local-smoke-verification", version: "1" },
    checks: [
      auditCheck("pedagogical_quality", "not_checked"),
      auditCheck("factual_quality", "not_checked"),
      auditCheck("editorial_quality", "failed"),
    ],
    outcome: "still_open",
  });
  assert.equal(verifiedEditorialStillOpen.courseRevision, auditCourseRevision);
  assert.equal(verifiedEditorialStillOpen.finding.status, "open");
  assert.equal(verifiedEditorialStillOpen.correction.status, "verified");
  assert.equal(
    verifiedEditorialStillOpen.correction.verification.outcome,
    "still_open",
  );
  assert.deepEqual(verifiedEditorialStillOpen.suggestedAnnotationActions, [{
    annotationId: learnerAnnotationId,
    annotationVersion: linkedAuditAnnotation.annotationVersion,
    action: "reopen",
  }]);
  const annotationAfterStillOpen = await courseAction("lerCurso", {
    courseId,
    view: "anchored_annotations",
    expectedRevision: auditCourseRevision,
    annotationSetVersion: null,
    mode: "detail",
    annotationId: learnerAnnotationId,
    limit: 1,
  }, ownerToken);
  assert.equal(annotationAfterStillOpen.data.items[0].state, "considered");
  assert.equal(
    annotationAfterStillOpen.data.items[0].annotationVersion,
    linkedAuditAnnotation.annotationVersion,
  );

  const factualContextBeforeCorrection = await loadAuditContext();
  const factualDetail = await loadAuditDetail(factualFindingId);
  const factualCorrectionId = crypto.randomUUID();
  const factualAfterContent = structuredClone(
    factualContextBeforeCorrection.context.target.content,
  );
  factualAfterContent.content[0].data.text =
    "Conteúdo factual corrigido e sustentado pela Fonte exata do smoke.";
  const proposedFactualCorrection = await mutateAudit({
    type: "propose_authoring_correction",
    correctionId: factualCorrectionId,
    findingId: factualFindingId,
    expectedFindingVersion: factualDetail.detail.finding.findingVersion,
    expectedCorrectionVersion: 0,
    afterContent: factualAfterContent,
    afterSourceLinks: [sourceLink],
    rationale: "Corrigir a afirmação e registrar suporte factual exato.",
  });
  assert.deepEqual(
    proposedFactualCorrection.correction.checkpoint.before.content.topics,
    proposedFactualCorrection.correction.checkpoint.after.content.topics,
  );
  assert.deepEqual(
    proposedFactualCorrection.correction.checkpoint.before.sourceLinks,
    factualContextBeforeCorrection.context.target.sourceLinks,
  );
  assert.deepEqual(
    proposedFactualCorrection.correction.checkpoint.after.sourceLinks,
    [sourceLink],
  );
  const appliedFactualCorrection = await mutateAudit({
    type: "apply_authoring_correction",
    findingId: factualFindingId,
    expectedFindingVersion: proposedFactualCorrection.finding.findingVersion,
    correctionId: factualCorrectionId,
    expectedCorrectionVersion:
      proposedFactualCorrection.correction.correctionVersion,
  });
  assert.equal(appliedFactualCorrection.courseRevision, auditCourseRevision + 1);
  assert.equal(appliedFactualCorrection.finding.status, "awaiting_verification");
  auditCourseRevision = appliedFactualCorrection.courseRevision;

  const factualVerificationContext = await loadAuditContext();
  assert.deepEqual(
    factualVerificationContext.context.target.content,
    proposedFactualCorrection.correction.checkpoint.after.content,
  );
  assert.deepEqual(factualVerificationContext.context.target.sourceLinks, [sourceLink]);
  const verifiedFactualCorrection = await mutateAudit({
    type: "verify_finding",
    auditRunId: crypto.randomUUID(),
    findingId: factualFindingId,
    expectedFindingVersion: appliedFactualCorrection.finding.findingVersion,
    correctionId: factualCorrectionId,
    expectedCorrectionVersion:
      appliedFactualCorrection.correction.correctionVersion,
    contextHash: factualVerificationContext.context.contextHash,
    origin: "human_audit",
    method: { id: "aralearn-local-smoke-verification", version: "1" },
    checks: [
      auditCheck("pedagogical_quality", "not_checked"),
      auditCheck("factual_quality", "passed", { sourceLinks: [sourceLink] }),
      auditCheck("editorial_quality", "not_checked"),
    ],
    outcome: "resolved",
  });
  assert.equal(verifiedFactualCorrection.finding.status, "resolved");
  assert.equal(verifiedFactualCorrection.correction.status, "verified");
  assert.equal(
    verifiedFactualCorrection.correction.verification.outcome,
    "resolved",
  );
  assert.deepEqual(verifiedFactualCorrection.suggestedAnnotationActions, [{
    annotationId: learnerAnnotationId,
    annotationVersion: linkedAuditAnnotation.annotationVersion,
    action: "resolve",
  }]);
  const annotationBeforeExplicitResolution = await courseAction("lerCurso", {
    courseId,
    view: "anchored_annotations",
    expectedRevision: auditCourseRevision,
    annotationSetVersion: null,
    mode: "detail",
    annotationId: learnerAnnotationId,
    limit: 1,
  }, ownerToken);
  assert.equal(annotationBeforeExplicitResolution.data.items[0].state, "considered");
  const explicitlyResolvedAnnotation = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "resolve_anchored_annotation",
      annotationId: learnerAnnotationId,
      expectedAnnotationVersion:
        annotationBeforeExplicitResolution.data.items[0].annotationVersion,
    },
  }, ownerToken);
  assert.equal(explicitlyResolvedAnnotation.data.courseRevision, auditCourseRevision);
  assert.equal(explicitlyResolvedAnnotation.data.annotation.state, "resolved");

  const rollbackFactualCommand = {
    type: "rollback_authoring_correction",
    findingId: factualFindingId,
    expectedFindingVersion: verifiedFactualCorrection.finding.findingVersion,
    correctionId: factualCorrectionId,
    expectedCorrectionVersion:
      verifiedFactualCorrection.correction.correctionVersion,
  };
  const rollbackFactualRequestId = crypto.randomUUID();
  const rolledBackFactualCorrection = await mutateAudit(
    rollbackFactualCommand,
    { requestId: rollbackFactualRequestId },
  );
  assert.equal(
    rolledBackFactualCorrection.courseRevision,
    auditCourseRevision + 1,
  );
  assert.equal(rolledBackFactualCorrection.finding.status, "open");
  assert.equal(rolledBackFactualCorrection.correction.status, "rolled_back");
  assert.equal(
    rolledBackFactualCorrection.correction.rollback.courseRevision,
    rolledBackFactualCorrection.courseRevision,
  );
  assert.deepEqual(
    rolledBackFactualCorrection.suggestedAnnotationActions,
    [{
      annotationId: learnerAnnotationId,
      annotationVersion:
        explicitlyResolvedAnnotation.data.annotation.annotationVersion,
      action: "reopen",
    }],
    "A sugestão precisa usar a versão corrente da observação.",
  );
  const replayedFactualRollback = await mutateAudit(rollbackFactualCommand, {
    requestId: rollbackFactualRequestId,
    expectedRevision: auditCourseRevision,
  });
  assert.equal(replayedFactualRollback.idempotent, true);
  assert.equal(
    replayedFactualRollback.courseRevision,
    rolledBackFactualCorrection.courseRevision,
  );
  const staleFactualRollback = await request(
    "/functions/v1/aralearn-course-api/app/alterarCurso",
    {
      method: "POST",
      token: ownerToken,
      origin: APPLICATION_ORIGIN,
      body: {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: auditCourseRevision,
        operation: "update_audit_cycle",
        auditCommand: rollbackFactualCommand,
      },
    },
  );
  assert.equal(
    staleFactualRollback.response.status,
    409,
    failureMessage("CAS stale do rollback factual", staleFactualRollback),
  );
  assert.equal(staleFactualRollback.payload?.error?.code, "stale_course_state");
  auditCourseRevision = rolledBackFactualCorrection.courseRevision;

  const contextAfterRollback = await loadAuditContext();
  assert.deepEqual(
    contextAfterRollback.context.target.content,
    proposedFactualCorrection.correction.checkpoint.before.content,
  );
  assert.deepEqual(
    contextAfterRollback.context.target.sourceLinks,
    proposedFactualCorrection.correction.checkpoint.before.sourceLinks,
  );
  const annotationAfterRollback = await courseAction("lerCurso", {
    courseId,
    view: "anchored_annotations",
    expectedRevision: auditCourseRevision,
    annotationSetVersion: null,
    mode: "detail",
    annotationId: learnerAnnotationId,
    limit: 1,
  }, ownerToken);
  assert.equal(annotationAfterRollback.data.items[0].state, "resolved");
  assert.equal(
    annotationAfterRollback.data.items[0].annotationVersion,
    explicitlyResolvedAnnotation.data.annotation.annotationVersion,
  );
  const explicitlyReopenedAnnotation = await courseAction("alterarCurso", {
    requestId: crypto.randomUUID(),
    courseId,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "reopen_anchored_annotation",
      annotationId: learnerAnnotationId,
      expectedAnnotationVersion:
        annotationAfterRollback.data.items[0].annotationVersion,
    },
  }, ownerToken);
  assert.equal(explicitlyReopenedAnnotation.data.annotation.state, "open");

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
  const revokedCitations = await request(
    "/rest/v1/rpc/get_course_study_citations_v1",
    {
      method: "POST",
      token: learnerToken,
      body: {
        p_course_id: courseId,
        p_expected_revision: auditCourseRevision,
        p_study_unit_id: "study-unit-smoke-2",
      },
    },
  );
  assert.equal(
    revokedCitations.response.status,
    404,
    failureMessage("citações após revogação", revokedCitations),
  );
  assert.equal(revokedCitations.payload?.code, "PT404");
  assertDenied(
    await request("/rest/v1/rpc/load_course_personal_state_v2", {
      method: "POST",
      token: learnerToken,
      body: { p_course_id: courseId },
    }),
    "revogação retira acesso sem misturar o estado pessoal",
  );
  const revokedAnnotations = await request(
    "/rest/v1/rpc/get_my_course_anchored_annotations_v1",
    {
      method: "POST",
      token: learnerToken,
      body: {
        p_course_id: courseId,
        p_expected_course_revision: auditCourseRevision,
        p_annotation_set_version: null,
        p_target_kind: "study_unit",
        p_target_id: "study-unit-smoke-2",
        p_cursor: null,
        p_limit: 12,
      },
    },
  );
  assertDenied(revokedAnnotations, "revogação retira leitura de observações");
  assert.equal(revokedAnnotations.payload?.code, "PT404");

  console.log(
    "Smoke local de Curso: Fontes, observações situadas, citações, RLS e estado pessoal aprovados.",
  );
} finally {
  await removeLocalUser(learner?.id);
  await removeLocalUser(owner?.id);
}
