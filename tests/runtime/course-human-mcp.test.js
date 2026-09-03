import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_HUMAN_TASK_CATALOG_HASH,
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS,
  courseHumanTaskIsAllowed,
  courseHumanTasksForPrincipal,
  executeHumanCourseTask
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";

const ORIGIN = "https://client.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const GLOBAL_AUTHORING_FIXTURE = JSON.parse(await fs.readFile(new URL(
  "../fixtures/global-authoring-conversation.v1.json",
  import.meta.url
), "utf8"));
const PRINCIPAL = Object.freeze({
  actorId: "30000000-0000-4000-8000-000000000003",
  authenticationKind: "oauth",
  scopes: Object.freeze(["authoring:read", "authoring:write"])
});
const READ_PRINCIPAL = Object.freeze({
  ...PRINCIPAL,
  scopes: Object.freeze(["authoring:read"])
});
const EXPECTED_NAMES = Object.freeze([
  "retomar_curso",
  "consultar_planejamento",
  "preparar_materializacao",
  "consultar_configuracao",
  "consultar_observacoes",
  "preparar_revisao",
  "consultar_fontes",
  "consultar_componentes",
  "criar_curso",
  "salvar_mapa_curricular",
  "salvar_parte",
  "materializar_parte",
  "ajustar_configuracao",
  "registrar_observacao",
  "aplicar_correcoes",
  "manter_fonte",
  "incorporar_pdf_como_fonte"
]);

function adapter(principal = PRINCIPAL) {
  return {
    publicAppUrl: "https://app.example",
    supabaseUrl: "https://project.example",
    async resolvePrincipal() {
      return principal;
    },
    async listCourses({ query }) {
      return {
        items: query && !"Redes para iniciantes".toLocaleLowerCase("pt-BR")
          .includes(String(query).toLocaleLowerCase("pt-BR"))
          ? []
          : [{
              courseId: COURSE_ID,
              title: "Redes para iniciantes",
              revision: 7,
              deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
            }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return {
        courseId: COURSE_ID,
        title: "Redes para iniciantes",
        revision: 7,
        deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
      };
    },
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [{
            id: "50000000-0000-4000-8000-000000000005",
            position: 0,
            statement: "Socket relaciona processo e comunicação."
          }],
          evidenceRequirements: [],
          parts: [{
            id: PART_ID,
            version: 2,
            position: 0,
            title: "Sockets",
            intent: "Relacionar processos e comunicação em rede.",
            microsequences: []
          }]
        }
      };
    }
  };
}

function mcpHandler(principal = PRINCIPAL) {
  return createAuthoringMcpHandler({
    adapter: adapter(principal),
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
}

function request(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

function visit(value, callback, path = "$") {
  if (!value || typeof value !== "object") return;
  callback(value, path);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, callback, `${path}[${index}]`));
  } else {
    Object.entries(value).forEach(([key, entry]) => visit(entry, callback, `${path}.${key}`));
  }
}

function globalCourseIdentity(revision = 7) {
  const currentRevision = () => typeof revision === "function" ? revision() : revision;
  return {
    async listCourses({ query }) {
      const title = GLOBAL_AUTHORING_FIXTURE.course.title;
      const matches = !query || title.toLocaleLowerCase("pt-BR")
        .includes(String(query).toLocaleLowerCase("pt-BR"));
      return {
        items: matches ? [{
          courseId: COURSE_ID,
          title,
          revision: currentRevision(),
          deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
        }] : [],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return {
        courseId: COURSE_ID,
        title: GLOBAL_AUTHORING_FIXTURE.course.title,
        revision: currentRevision(),
        deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}`
      };
    }
  };
}

function curricularMapArguments(artifactId, approved) {
  const artifact = GLOBAL_AUTHORING_FIXTURE.artifacts[artifactId];
  return {
    curso: GLOBAL_AUTHORING_FIXTURE.course.title,
    aprovado: approved,
    publico: GLOBAL_AUTHORING_FIXTURE.course.audience,
    preRequisitos: GLOBAL_AUTHORING_FIXTURE.course.prerequisites,
    itensDeEscopo: GLOBAL_AUTHORING_FIXTURE.scopeItems,
    modulos: artifact.modules.map((module) => ({
      titulo: module.title,
      objetivo: module.objective,
      licoes: module.lessons.map((lesson) => ({
        titulo: lesson.title,
        objetivo: lesson.objective,
        microssequencias: lesson.microsequences.map((microsequence) => ({
          titulo: microsequence.title,
          objetivo: microsequence.objective,
          dependencias: microsequence.dependsOn,
          cobertura: microsequence.covers
        }))
      }))
    }))
  };
}

function authoringPartArguments(artifactId, part = undefined) {
  const artifact = GLOBAL_AUTHORING_FIXTURE.artifacts[artifactId];
  return {
    curso: GLOBAL_AUTHORING_FIXTURE.course.title,
    ...(part === undefined ? {} : { parte: part }),
    titulo: artifact.title,
    intencao: artifact.intent,
    microssequencias: artifact.microsequences,
    progressao: artifact.progression
  };
}

function fixtureUuid(group, position) {
  return `${group}0000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`;
}

function internalCurricularMap(artifactId, approval) {
  const artifact = GLOBAL_AUTHORING_FIXTURE.artifacts[artifactId];
  const scopeItems = GLOBAL_AUTHORING_FIXTURE.scopeItems.map((statement, position) => ({
    id: fixtureUuid("5", position),
    position,
    statement
  }));
  const scopeIds = new Map(scopeItems.map(({ id, statement }) => [statement, id]));
  let lessonPosition = 0;
  let microsequencePosition = 0;
  return {
    approval,
    audience: GLOBAL_AUTHORING_FIXTURE.course.audience,
    prerequisites: GLOBAL_AUTHORING_FIXTURE.course.prerequisites,
    scopeItems,
    modules: artifact.modules.map((module, modulePosition) => ({
      id: fixtureUuid("6", modulePosition),
      position: modulePosition,
      title: module.title,
      objective: module.objective,
      lessons: module.lessons.map((lesson) => {
        const currentLessonPosition = lessonPosition;
        lessonPosition += 1;
        return {
          id: fixtureUuid("7", currentLessonPosition),
          position: currentLessonPosition,
          title: lesson.title,
          objective: lesson.objective,
          microsequences: lesson.microsequences.map((microsequence) => {
            const currentMicrosequencePosition = microsequencePosition;
            microsequencePosition += 1;
            return {
              id: fixtureUuid("8", currentMicrosequencePosition),
              position: currentMicrosequencePosition,
              title: microsequence.title,
              objective: microsequence.objective,
              dependencies: [...microsequence.dependsOn],
              scopeItemIds: microsequence.covers.map((item) => scopeIds.get(item))
            };
          })
        };
      })
    }))
  };
}

function mapPlanRead({
  artifactId = "mapa-global-v2",
  approval = "approved",
  courseRevision = 7,
  planVersion = 3,
  parts = []
} = {}) {
  return {
    courseId: COURSE_ID,
    courseRevision,
    plan: {
      id: "40000000-0000-4000-8000-000000000004",
      version: planVersion,
      title: GLOBAL_AUTHORING_FIXTURE.course.title,
      objective: GLOBAL_AUTHORING_FIXTURE.course.objective,
      curricularMap: artifactId === null ? null : internalCurricularMap(artifactId, approval),
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts
    }
  };
}

function internalMapMicrosequences(planRead) {
  return planRead.plan.curricularMap.modules.flatMap(({ lessons }) =>
    lessons.flatMap(({ microsequences }) => microsequences));
}

function internalMapEntities(planRead) {
  return planRead.plan.curricularMap.modules.flatMap((module) => [
    {
      entityType: "module",
      entityId: module.id,
      parentId: null,
      content: { title: module.title, goal: module.objective }
    },
    ...module.lessons.flatMap((lesson) => [
      {
        entityType: "lesson",
        entityId: lesson.id,
        parentId: module.id,
        content: { title: lesson.title, goal: lesson.objective }
      },
      ...lesson.microsequences.map((microsequence) => ({
        entityType: "microsequence",
        entityId: microsequence.id,
        parentId: lesson.id,
        content: { title: microsequence.title, goal: microsequence.objective }
      }))
    ])
  ]);
}

test("catálogo MCP publica somente as tarefas humanas correntes", () => {
  assert.deepEqual(COURSE_HUMAN_TASKS.map(({ name }) => name), EXPECTED_NAMES);
  assert.equal(new Set(EXPECTED_NAMES).size, 17);
  const actualHash = createHash("sha256")
    .update(JSON.stringify(COURSE_HUMAN_TASKS))
    .digest("hex");
  assert.equal(COURSE_HUMAN_TASK_CATALOG_HASH, `sha256:${actualHash}`);
  assert.notEqual(COURSE_HUMAN_TASK_CATALOG_METADATA.version, "2.0.5");
  assert.ok(JSON.stringify(COURSE_HUMAN_TASKS).length < 32_000);
});

test("consultar_planejamento projeta mapa e cobertura humanos sem identidades técnicas", async () => {
  const current = mapPlanRead();
  const value = {
    ...adapter(),
    ...globalCourseIdentity(current.courseRevision),
    async getCourseInstructionalPlan() {
      return structuredClone(current);
    }
  };

  const output = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "consultar_planejamento",
    rawArguments: { curso: GLOBAL_AUTHORING_FIXTURE.course.title }
  });

  const serialized = JSON.stringify(output.context);
  assert.match(serialized, /cobertura/iu);
  assert.match(serialized, /Pessoas iniciantes em redes/u);
  for (const prerequisite of GLOBAL_AUTHORING_FIXTURE.course.prerequisites) {
    assert.match(serialized, new RegExp(prerequisite, "u"));
  }
  for (const item of GLOBAL_AUTHORING_FIXTURE.scopeItems) {
    assert.match(serialized, new RegExp(item, "u"));
  }
  for (const module of GLOBAL_AUTHORING_FIXTURE.artifacts["mapa-global-v2"].modules) {
    assert.match(serialized, new RegExp(module.title, "u"));
    for (const lesson of module.lessons) {
      assert.match(serialized, new RegExp(lesson.title, "u"));
      for (const microsequence of lesson.microsequences) {
        assert.match(serialized, new RegExp(microsequence.title, "u"));
      }
    }
  }
  assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
  assert.doesNotMatch(
    serialized,
    /courseId|planId|moduleId|lessonId|microsequenceId|requestId|revision|version/iu
  );
  assert.doesNotMatch(serialized, /AnalysisUnit|StudyUnit|evidenceRequirements/iu);
});

test("salvar_mapa_curricular grava rascunho completo e aprova somente o mesmo mapa", async () => {
  let current = mapPlanRead({ artifactId: null, approval: "absent" });
  const mapWrites = [];
  let partWrites = 0;
  const value = {
    ...adapter(),
    ...globalCourseIdentity(() => current.courseRevision),
    async getCourseInstructionalPlan() {
      return structuredClone(current);
    },
    async saveCourseCurricularMap(input) {
      mapWrites.push(structuredClone(input));
      const approved = input.approved === true || input.curricularMap?.approval === "approved";
      current = mapPlanRead({
        artifactId: mapWrites.length === 1 ? "mapa-global-v1" : "mapa-global-v2",
        approval: approved ? "approved" : "draft",
        courseRevision: current.courseRevision + 1,
        planVersion: current.plan.version + 1
      });
      return {
        contract: "aralearn.course-curricular-map-change.v1",
        courseId: COURSE_ID,
        courseRevision: current.courseRevision,
        planVersion: current.plan.version,
        approval: approved ? "approved" : "draft",
        changed: true,
        idempotent: false
      };
    },
    async saveCourseAuthoringPart() {
      partWrites += 1;
      assert.fail("Salvar o mapa não pode criar lote de produção.");
    }
  };
  const draftArguments = curricularMapArguments("mapa-global-v1", false);
  const draft = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: draftArguments
  });

  assert.equal(mapWrites.length, 1);
  assert.equal(partWrites, 0);
  assert.match(JSON.stringify(draft.context), /rascunho|proposto/iu);
  assert.match(draft.nextDecision, /aprova|mudar/iu);
  const serializedDraftWrite = JSON.stringify(mapWrites[0]);
  assert.match(serializedDraftWrite, /Pessoas iniciantes em redes/u);
  assert.match(serializedDraftWrite, /pre.?requisitos|prerequisites/iu);
  for (const item of GLOBAL_AUTHORING_FIXTURE.scopeItems) {
    assert.match(serializedDraftWrite, new RegExp(item, "u"));
  }
  for (const microsequence of internalMapMicrosequences(mapPlanRead({
    artifactId: "mapa-global-v1",
    approval: "draft"
  }))) {
    assert.match(serializedDraftWrite, new RegExp(microsequence.title, "u"));
  }

  const uninspectedChange = curricularMapArguments("mapa-global-v1", true);
  uninspectedChange.modulos[0].objetivo = "Uma mudança que não foi apresentada à pessoa autora.";
  await assert.rejects(() => executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: uninspectedChange
  }), (error) => error.code === "curricular_map_draft_mismatch");
  assert.equal(mapWrites.length, 1);

  const revisedArguments = curricularMapArguments("mapa-global-v2", false);
  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: revisedArguments
  });
  assert.equal(mapWrites.length, 2);

  const approved = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: { ...revisedArguments, aprovado: true }
  });
  assert.equal(mapWrites.length, 3);
  assert.equal(partWrites, 0);
  assert.match(JSON.stringify(approved.context), /aprovado/iu);
  assert.match(approved.nextDecision, /primeira parte/iu);
});

test("salvar_parte permanece bloqueada enquanto o mapa curricular é rascunho", async () => {
  let partWrites = 0;
  const current = mapPlanRead({ artifactId: "mapa-global-v2", approval: "draft" });
  const value = {
    ...adapter(),
    ...globalCourseIdentity(current.courseRevision),
    async getCourseInstructionalPlan() {
      return structuredClone(current);
    },
    async listCourseEntities() {
      return {
        revision: current.courseRevision,
        items: internalMapEntities(current),
        hasMore: false,
        nextCursor: null
      };
    },
    async saveCourseAuthoringPart() {
      partWrites += 1;
      assert.fail("Um rascunho curricular não autoriza criar lote.");
    }
  };

  await assert.rejects(() => executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: authoringPartArguments("parte-1-v1")
  }), (error) => error.code === "curricular_map_not_approved");
  assert.equal(partWrites, 0);
});

test("salvar_parte agrupa microssequências existentes sem recriar o mapa curricular", async () => {
  let current = mapPlanRead();
  const mapBefore = structuredClone(current.plan.curricularMap);
  const partWrites = [];
  let curricularMapWrites = 0;
  const value = {
    ...adapter(),
    ...globalCourseIdentity(() => current.courseRevision),
    async getCourseInstructionalPlan() {
      return structuredClone(current);
    },
    async listCourseEntities() {
      return {
        revision: current.courseRevision,
        items: internalMapEntities(current),
        hasMore: false,
        nextCursor: null
      };
    },
    async saveCourseCurricularMap() {
      curricularMapWrites += 1;
      assert.fail("Alterar o limite do lote não pode regravar o mapa curricular.");
    },
    async saveCourseAuthoringPart(input) {
      partWrites.push(structuredClone(input));
      const stored = input.part;
      current = mapPlanRead({
        courseRevision: current.courseRevision + 1,
        planVersion: current.plan.version + 1,
        parts: [{
          id: stored.partId,
          version: partWrites.length,
          position: 0,
          title: stored.title,
          intent: stored.intent,
          progression: stored.progression,
          microsequences: stored.microsequences.map((item, position) => ({
            id: item.microsequenceId,
            productionPosition: position,
            title: internalMapMicrosequences(current)
              .find(({ id }) => id === item.microsequenceId)?.title
          }))
        }]
      });
      return {
        contract: "aralearn.course-authoring-part-change.v1",
        courseId: COURSE_ID,
        courseRevision: current.courseRevision,
        planVersion: current.plan.version,
        authoringPartId: stored.partId,
        changed: true,
        idempotent: false
      };
    }
  };

  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: authoringPartArguments("parte-1-v1")
  });
  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: authoringPartArguments("parte-1-v2", 1)
  });

  assert.equal(partWrites.length, 2);
  assert.equal(curricularMapWrites, 0);
  assert.deepEqual(current.plan.curricularMap, mapBefore);
  const idsByTitle = new Map(internalMapMicrosequences({
    plan: { curricularMap: mapBefore }
  }).map(({ id, title }) => [title, id]));
  const expectedIds = (artifactId) => GLOBAL_AUTHORING_FIXTURE.artifacts[artifactId]
    .microsequences.map((title) => idsByTitle.get(title));
  assert.deepEqual(
    partWrites[0].part.microsequences.map(({ microsequenceId }) => microsequenceId),
    expectedIds("parte-1-v1")
  );
  assert.deepEqual(
    partWrites[1].part.microsequences.map(({ microsequenceId }) => microsequenceId),
    expectedIds("parte-1-v2")
  );
  assert.deepEqual(
    partWrites[1].part.progression,
    GLOBAL_AUTHORING_FIXTURE.artifacts["parte-1-v2"].progression
  );
  assert.doesNotMatch(
    JSON.stringify(partWrites),
    /moduleTitle|moduleGoal|lessonTitle|lessonGoal|analysisUnits|evidenceRequirements/iu
  );
});

test("preparar_materializacao separa o inventário focal de duas Microssequências", async () => {
  const analysisEstablished = "50000000-0000-4000-8000-000000000004";
  const analysisA = "50000000-0000-4000-8000-000000000005";
  const analysisB = "50000000-0000-4000-8000-000000000006";
  const analysisOutsidePart = "50000000-0000-4000-8000-000000000007";
  const evidenceA = "60000000-0000-4000-8000-000000000001";
  const evidenceB = "60000000-0000-4000-8000-000000000002";
  const microA = "micro-definicao";
  const microB = "micro-mecanismo";
  const existingStudyUnitId = "70000000-0000-4000-8000-000000000001";
  const parameterDefinitions = [
    ["new_analysis_unit_ceiling_per_expository_study_unit", "Novas unidades de análise"],
    ["required_explanation_forms", "Formas de explicação"],
    ["minimum_distinct_practice_opportunities_per_evidence_requirement", "Práticas"],
    ["required_practice_variation_dimensions", "Variação da prática"]
  ];
  const design = (scopeRef, targetAnalysis, targetEvidence, ceiling) => ({
    scopeContext: { current: { label: scopeRef === microA ? "Definição" : "Mecanismo" } },
    definitions: parameterDefinitions.map(([id, label]) => ({ id, label })),
    parameters: parameterDefinitions.map(([parameterId], index) => ({
      parameterId,
      localAssignment: null,
      effectiveAssignment: {
        value: index === 0 ? ceiling : index === 1 ? ["plain_definition"] :
          index === 2 ? 2 : ["case_or_data"],
        inherited: true,
        origin: "automatic",
        reason: "Calibração focal.",
        sourceScope: { kind: "course" }
      }
    })),
    guidance: { localAssignment: null, effectiveAssignments: [] },
    targetPlanItems: {
      instructionalAnalysisUnitIds: targetAnalysis,
      evidenceRequirementIds: targetEvidence
    },
    componentPolicy: {
      effectiveAssignment: {
        policy: {
          catalogVersion: "fixture",
          availability: "all",
          allowedRefs: [],
          excludedRefs: [],
          preferredRefs: []
        },
        inherited: false,
        origin: "system_default",
        reason: "Política padrão.",
        sourceScope: null
      }
    }
  });
  const value = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [{
            id: analysisEstablished,
            position: 0,
            statement: "Processos trocam dados por serviços de transporte.",
            introduced: true,
            introducedPartPosition: 0
          }, {
            id: analysisA,
            position: 1,
            statement: "Socket liga processo e transporte.",
            introduced: false,
            introducedPartPosition: null
          }, {
            id: analysisB,
            position: 2,
            statement: "Endereço localiza uma ponta da comunicação.",
            introduced: false,
            introducedPartPosition: null
          }, {
            id: analysisOutsidePart,
            position: 3,
            statement: "Novidade de outra Parte.",
            introduced: true,
            introducedPartPosition: 2
          }],
          evidenceRequirements: [{
            id: evidenceA, position: 0, statement: "Distinguir processo e socket."
          }, {
            id: evidenceB, position: 1, statement: "Relacionar endereço e comunicação."
          }],
          parts: [{
            id: "20000000-0000-4000-8000-000000000001",
            version: 1,
            position: 0,
            title: "Processos",
            intent: "Estabelecer o conhecimento anterior.",
            microsequences: []
          }, {
            id: PART_ID,
            version: 2,
            position: 1,
            title: "Sockets",
            intent: "Construir o modelo em duas etapas.",
            microsequences: [{
              id: microA,
              productionPosition: 0,
              title: "Definição",
              goal: "Definir socket e sua relação com o processo.",
              role: "explain",
              curriculumPath: { moduleTitle: "Comunicação", lessonTitle: "Sockets" }
            }, {
              id: microB,
              productionPosition: 1,
              title: "Mecanismo",
              goal: "Explicar como o endereço participa da comunicação.",
              role: "explain",
              curriculumPath: { moduleTitle: "Comunicação", lessonTitle: "Sockets" }
            }]
          }]
        }
      };
    },
    async listCourseStudyUnits() {
      return {
        items: [{
          studyUnit: {
            id: existingStudyUnitId,
            position: 1,
            title: "Definição já produzida"
          },
          curriculumPath: {
            didacticMicrosequence: { id: microA, title: "Definição", position: 0 }
          }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseDesign({ scopeKind, scopeRef }) {
      if (scopeKind === "study_unit") {
        assert.equal(scopeRef, existingStudyUnitId);
        const current = design(microA, [analysisA], [evidenceA], 2);
        current.parameters[0].effectiveAssignment = {
          value: 2,
          inherited: false,
          origin: "research_condition",
          reason: "Comparação deliberada.",
          sourceScope: { kind: "study_unit", ref: existingStudyUnitId }
        };
        return current;
      }
      return scopeRef === microA
        ? design(scopeRef, [analysisA], [evidenceA], 1)
        : design(scopeRef, [analysisB], [evidenceB], 2);
    }
  };

  const output = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "preparar_materializacao",
    rawArguments: { curso: "Redes para iniciantes", parte: 2 }
  });

  assert.equal(output.result, "Preparei o recorte focal da parte 2: Sockets.");
  assert.doesNotMatch(JSON.stringify(output.context), /StudyUnit|AnalysisUnit|evidenceRequirements/iu);
  assert.deepEqual(output.context.parte.ideiasEstabelecidas, [{
    posicao: 1,
    ideia: "Processos trocam dados por serviços de transporte."
  }]);
  assert.equal(output.context.parte.microssequencias.length, 2);
  assert.deepEqual(output.context.parte.microssequencias.map((microsequence) => ({
    title: microsequence.titulo,
    analysis: microsequence.ideiasPlanejadas,
    evidence: microsequence.requisitosDeEvidencia,
    objective: microsequence.objetivo,
    function: microsequence.funcao,
    ceiling: microsequence.configuracao.parametros[0].valorEfetivo
  })), [{
    title: "Definição",
    analysis: [{ posicao: 2, ideia: "Socket liga processo e transporte." }],
    evidence: [{ posicao: 1, ideia: "Distinguir processo e socket." }],
    objective: "Definir socket e sua relação com o processo.",
    function: "explicar",
    ceiling: 1
  }, {
    title: "Mecanismo",
    analysis: [{ posicao: 3, ideia: "Endereço localiza uma ponta da comunicação." }],
    evidence: [{ posicao: 2, ideia: "Relacionar endereço e comunicação." }],
    objective: "Explicar como o endereço participa da comunicação.",
    function: "explicar",
    ceiling: 2
  }]);
  assert.equal(output.context.parte.microssequencias.every((microsequence) =>
    !Object.hasOwn(microsequence.configuracao, "alvos")), true);
  assert.deepEqual(
    output.context.parte.microssequencias[0].ajustesExistentesDasUnidades.map((unit) => ({
      position: unit.posicao,
      title: unit.titulo,
      ceiling: unit.configuracao.parametros[0].valorEfetivo,
      sourceScope: unit.configuracao.parametros[0].escopoDeOrigem
    })),
    [{
      position: 1,
      title: "Definição já produzida",
      ceiling: 2,
      sourceScope: "unidade de estudo"
    }]
  );
  assert.deepEqual(
    output.context.parte.microssequencias[1].ajustesExistentesDasUnidades,
    []
  );
  assert.doesNotMatch(JSON.stringify(output.context.parte), /Novidade de outra Parte/u);
  assert.doesNotMatch(JSON.stringify(output.context.parte), /[0-9a-f]{8}-[0-9a-f-]{27,}/iu);
});

test("#272 schemas, descrições e annotations distinguem leitura de escrita", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const forbidden = /^(?:id|ids|courseId|revision|version|hash|path|requestId|expectedRevision|expectedPlanVersion|cursor)$/iu;
  for (const task of COURSE_HUMAN_TASKS) {
    assert.doesNotThrow(() => ajv.compile(task.inputSchema), task.name);
    assert.match(task.description, /^Use\b/u, task.name);
    assert.match(task.description, /\bNão\b/iu, task.name);
    assert.equal(task.annotations.openWorldHint, false, task.name);
    assert.equal(
      task.annotations.destructiveHint,
      task.name === "manter_fonte",
      task.name
    );
    assert.equal(typeof task.annotations.readOnlyHint, "boolean", task.name);
    for (const [name, property] of Object.entries(task.inputSchema.properties || {})) {
      assert.doesNotMatch(name, forbidden, `${task.name}.${name}`);
      assert.ok(property.description?.length >= 12, `${task.name}.${name}`);
    }
    visit(task.inputSchema, (entry, path) => {
      for (const name of Object.keys(entry.properties || {})) {
        if (name === "file_id") continue;
        const localComponentIdentity = ["id", "version"].includes(name) &&
          /\.properties\.conteudo\.properties\.(?:content\.items|response\.anyOf\[1\]|feedback\.items)$/u
            .test(path);
        if (localComponentIdentity) continue;
        assert.doesNotMatch(name, forbidden, `${task.name}:${path}.${name}`);
      }
    });
  }
  const config = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "ajustar_configuracao"
  )).inputSchema);
  const source = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "manter_fonte"
  )).inputSchema);
  const components = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "consultar_componentes"
  )).inputSchema);
  const materialization = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "materializar_parte"
  )).inputSchema);
  const corrections = ajv.compile(COURSE_HUMAN_TASKS.find(({ name }) => (
    name === "aplicar_correcoes"
  )).inputSchema);
  const content = {
    title: "O que é um socket",
    role: "theory",
    content: [{
      id: "body",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Um socket liga o processo ao transporte." }
    }],
    response: null,
    feedback: [],
    topics: ["socket"]
  };
  const materializationArguments = {
    curso: "Redes",
    parte: 1,
    unidades: [{
      microssequencia: 1,
      posicao: 1,
      conteudo: content,
      aplicacaoPedagogica: {
        modo: "expositiva",
        ideiasIntroduzidas: [1],
        ideiasUtilizadas: [],
        explicacoes: [{ ideia: 1, formas: ["plain_definition"] }],
        praticas: []
      }
    }]
  };
  assert.equal(config({ curso: "Redes" }), false);
  assert.equal(source({ curso: "Redes" }), false);
  assert.equal(components({}), false);
  assert.equal(materialization(materializationArguments), true,
    JSON.stringify(materialization.errors));
  assert.equal(materialization({
    ...materializationArguments,
    unidades: [{ ...materializationArguments.unidades[0], conteudo: {} }]
  }), false);
  assert.equal(materialization({
    ...materializationArguments,
    unidades: [{
      ...materializationArguments.unidades[0],
      conteudo: { ...content, content: [], response: content.content[0] }
    }]
  }), false);
  assert.equal(materialization({
    ...materializationArguments,
    unidades: [{
      ...materializationArguments.unidades[0],
      conteudo: { ...content, role: "practice", response: null }
    }]
  }), false);
  assert.equal(materialization({
    ...materializationArguments,
    unidades: [{
      ...materializationArguments.unidades[0],
      aplicacaoPedagogica: {
        modo: "pratica",
        ideiasIntroduzidas: [],
        ideiasUtilizadas: [],
        explicacoes: [],
        praticas: []
      }
    }]
  }), false);
  assert.equal(corrections({
    curso: "Redes",
    correcoes: [{ unidade: 1, conteudo: content }]
  }), true, JSON.stringify(corrections.errors));
  assert.equal(corrections({
    curso: "Redes",
    correcoes: [{ unidade: 1, conteudo: { ...content, id: "unit-technical" } }]
  }), false);
});

test("#275 consultar_componentes separa descoberta do contrato exato", async () => {
  const discovered = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { busca: "plano cartesiano" }
  });
  assert.equal(
    discovered.context.components.candidates[0].referencia,
    "aralearn.resource.plane@1.0.0"
  );
  assert.equal(Object.hasOwn(discovered.context.components.candidates[0], "packageId"), false);

  const inspected = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { componente: "aralearn.resource.plane@1.0.0" }
  });
  const contract = inspected.context.componentAuthoringContract;
  assert.equal(inspected.result, "Li o contrato exato do componente escolhido.");
  assert.equal(contract.referencia, "aralearn.resource.plane@1.0.0");
  assert.equal(contract.modeloDeInstancia.package, "aralearn.resource.plane");
  assert.equal(contract.modeloDeInstancia.version, "1.0.0");
  assert.equal(contract.schema.properties.groups.items.properties.id.type, "string");
  assert.deepEqual(contract.contrato.required, ["xAxis", "yAxis"]);

  const practice = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: {
      funcao: "Pedir que a pessoa ordene etapas de leitura de um gráfico.",
      papel: "pratica",
      lugar: "resposta"
    }
  });
  assert.equal(practice.context.components.candidates.every(({ referencia }) => (
    referencia.startsWith("aralearn.response.")
  )), true);
  assert.equal(practice.context.components.candidates.some(({ referencia }) => (
    referencia === "aralearn.response.ordering@3.0.0"
  )), true);

  const table = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { componente: "aralearn.resource.table@1.0.0" }
  });
  assert.ok(table.context.componentAuthoringContract.practiceTargets.length > 0);
  assert.equal(
    table.context.componentAuthoringContract.practiceTargets[0].path,
    "rows[0][0]"
  );

  await assert.rejects(() => executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { papel: "laboratorio" }
  }), (error) => error.code === "invalid_human_task_argument");
});

test("#275 consultar_componentes faz filtros estruturados regerem a função instrucional", async () => {
  const cases = [{
    args: {
      funcao: "Pedir que a pessoa reconstrua a ordem das etapas de um procedimento.",
      operacao: "ordenar",
      papel: "pratica",
      lugar: "resposta"
    },
    expected: "aralearn.response.ordering@3.0.0"
  }, {
    args: {
      funcao: "Pedir recuperação ativa de um termo sem oferecer alternativas.",
      operacao: "recuperar",
      papel: "pratica",
      lugar: "resposta"
    },
    expected: "aralearn.response.gap@1.0.0"
  }, {
    args: {
      funcao: "Explicar uma sequência linear de passos sem decisão.",
      estrutura: "texto",
      papel: "teoria",
      lugar: "conteudo"
    },
    expected: "aralearn.resource.paragraph@1.0.0"
  }, {
    args: {
      funcao: "Comparar os mesmos atributos entre casos.",
      estrutura: "tabela",
      operacao: "comparar",
      papel: "teoria",
      lugar: "conteudo"
    },
    expected: "aralearn.resource.table@1.0.0"
  }, {
    args: {
      funcao: "Acompanhar um processo com decisão.",
      estrutura: "processo",
      operacao: "acompanhar",
      papel: "teoria",
      lugar: "conteudo"
    },
    expected: "aralearn.resource.flow@1.0.0"
  }];
  for (const scenario of cases) {
    const discovered = await executeHumanCourseTask({
      adapter: adapter(),
      principal: PRINCIPAL,
      name: "consultar_componentes",
      rawArguments: scenario.args
    });
    assert.equal(discovered.context.components.coverage.status, "canonical");
    assert.equal(
      discovered.context.components.candidates[0].referencia,
      scenario.expected,
      scenario.args.funcao
    );
  }

  await assert.rejects(() => executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { operacao: "decorar a tela" }
  }), (error) => error.code === "invalid_human_task_argument");
});

test("#272 autorização filtra writes e recusa input mecânico antes do domínio", async () => {
  assert.equal(courseHumanTaskIsAllowed("retomar_curso", READ_PRINCIPAL), true);
  assert.equal(courseHumanTaskIsAllowed("criar_curso", READ_PRINCIPAL), false);
  assert.equal(courseHumanTasksForPrincipal(READ_PRINCIPAL).length, 8);
  assert.equal(courseHumanTasksForPrincipal({ actorId: PRINCIPAL.actorId, scopes: [] }).length, 0);
  await assert.rejects(
    () => executeHumanCourseTask({
      adapter: adapter(),
      principal: PRINCIPAL,
      name: "retomar_curso",
      rawArguments: { titulo: "Redes", courseId: COURSE_ID }
    }),
    (error) => error.status === 422 && error.code === "unknown_human_task_argument"
  );
  await assert.rejects(
    () => executeHumanCourseTask({
      adapter: adapter(READ_PRINCIPAL),
      principal: READ_PRINCIPAL,
      name: "criar_curso",
      rawArguments: { titulo: "Novo", objetivo: "Objetivo" }
    }),
    (error) => error.status === 403 && error.code === "insufficient_scope"
  );
});

test("#272 tools/list expõe catálogo focal sem alias e respeita o escopo OAuth", async () => {
  const fullResponse = await mcpHandler()(request("tools/list", {
    _meta: { progressToken: "human-catalog" }
  }));
  const full = await fullResponse.json();
  assert.deepEqual(full.result.tools.map(({ name }) => name), EXPECTED_NAMES);
  assert.deepEqual(full.result._meta.humanTaskCatalog, COURSE_HUMAN_TASK_CATALOG_METADATA);
  assert.equal(fullResponse.headers.get("X-AraLearn-Authoring-Projection"), null);
  assert.match(
    fullResponse.headers.get("X-AraLearn-Authoring-Mcp-Catalog"),
    /aralearn\.human-authoring-tasks/u
  );
  for (const tool of full.result.tools) {
    assert.deepEqual(tool.securitySchemes, [{ type: "oauth2", scopes: ["offline_access"] }]);
  }
  const pdfTool = full.result.tools.find(({ name }) => name === "incorporar_pdf_como_fonte");
  assert.deepEqual(pdfTool._meta["openai/fileParams"], ["pdf"]);
  assert.deepEqual(pdfTool.inputSchema.properties.pdf.required, ["download_url", "file_id"]);
  assert.deepEqual(Object.keys(pdfTool.inputSchema.properties.pdf.properties), [
    "download_url", "file_id", "file_name", "mime_type"
  ]);

  const readResponse = await mcpHandler(READ_PRINCIPAL)(request("tools/list"));
  const read = await readResponse.json();
  assert.equal(read.result.tools.length, 8);
  assert.equal(read.result.tools.every(({ annotations }) => annotations.readOnlyHint), true);

  const invalidResponse = await mcpHandler()(request("tools/list", { cursor: "legacy" }));
  const invalid = await invalidResponse.json();
  assert.equal(invalid.error.code, -32602);

  const deniedResponse = await mcpHandler(READ_PRINCIPAL)(request("tools/call", {
    name: "criar_curso",
    arguments: { titulo: "Novo", objetivo: "Objetivo" }
  }));
  const denied = await deniedResponse.json();
  assert.equal(denied.result.isError, true);
  assert.equal(denied.result.structuredContent.error.code, "insufficient_scope");
  assert.equal(Object.hasOwn(denied.result.structuredContent, "requestId"), false);
  assert.equal(Object.hasOwn(denied.result.structuredContent.error, "recovery"), false);
});

test("MCP não manda repetir incorporação de PDF com escrita incerta", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new AuthoringApiError(
          409,
          "course_source_pdf_write_uncertain",
          "A confirmação da ingestão do PDF ficou inconclusiva."
        );
      }
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
  const response = await handler(request("tools/call", {
    name: "retomar_curso",
    arguments: { titulo: "Redes para iniciantes" }
  }));

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  assert.equal(
    payload.result.structuredContent.error.code,
    "course_source_pdf_write_uncertain"
  );
  assert.equal(payload.result.structuredContent.error.retryable, false);
  assert.equal(
    payload.result.structuredContent.nextDecision,
    "Releia as Fontes antes de decidir se ainda precisa incorporar o PDF."
  );
});

test("#272 chamada MCP retorna coordenação curta e contexto sem estado técnico", async () => {
  const response = await mcpHandler()(request("tools/call", {
    name: "retomar_curso",
    arguments: { titulo: "Redes para iniciantes" }
  }));
  const payload = await response.json();
  assert.equal(payload.result.isError, false);
  assert.equal(payload.result.structuredContent.result, "Retomei o curso “Redes para iniciantes”.");
  assert.equal(Object.hasOwn(payload.result.structuredContent, "ok"), false);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "requestId"), false);
  assert.equal(Object.hasOwn(payload.result.structuredContent, "data"), false);
  assert.doesNotMatch(payload.result.content[0].text, /https?:\/\//u);
  assert.match(payload.result.content[0].text, /Abrir no AraLearn\./u);
  const serializedContext = JSON.stringify(payload.result.structuredContent.context);
  assert.doesNotMatch(serializedContext, /courseId|requestId|revision|version|hash|path|resultFacts/iu);

});

test("#272 corpus de seleção MCP cobre cada objetivo e negativas sem ferramenta", async () => {
  const golden = JSON.parse(await fs.readFile(new URL(
    "../fixtures/human-authoring-golden-prompts.v2.json",
    import.meta.url
  ), "utf8"));
  const names = new Set(EXPECTED_NAMES);
  const positive = golden.cases.filter(({ expectedTool }) => expectedTool !== null);
  const negative = golden.cases.filter(({ expectedTool }) => expectedTool === null);
  for (const name of names) {
    assert.equal(positive.filter(({ expectedTool }) => expectedTool === name).length, 2, name);
  }
  assert.equal(negative.length, 8);
  assert.equal(negative.every(({ class: className }) => className === "negative"), true);
});

test("#272 manter_fonte relê criação por identidade interna e preserva outros vínculos", async () => {
  const sources = [{
    sourceId: "source-existing-a",
    revision: 2,
    title: "Manual duplicado",
    kind: "document",
    authorship: null,
    publicationDate: null,
    identifier: null,
    language: null,
    citationText: null,
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "unknown",
    verificationStatus: "unverified",
    studyVisibility: "hidden",
    anchors: [{
      anchorId: "anchor-existing-a",
      revision: 1,
      humanLocator: "Seção 4.2",
      verificationExcerpt: "Trecho A"
    }]
  }, {
    sourceId: "source-other",
    revision: 3,
    title: "Outra Fonte",
    anchors: [{
      anchorId: "anchor-other",
      revision: 2,
      humanLocator: "Página 2",
      verificationExcerpt: "Trecho B"
    }]
  }];
  const sourceCommands = [];
  const sourceAdapter = {
    ...adapter(),
    async listCourseStudyUnits() {
      return {
        items: [{
          ordinal: 1,
          version: 4,
          studyUnit: { id: "unit-one", title: "Unidade um", version: 4 }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseSources(options) {
      if (options.mode === "source") {
        const source = sources.find(({ sourceId }) => sourceId === options.sourceId);
        return { source, items: source ? [source] : [], nextCursor: null };
      }
      if (options.mode === "target") {
        return {
          items: [{
            sourceLinks: [{
              sourceId: "source-other",
              relation: "supported_by",
              anchors: [{ anchorId: "anchor-other" }]
            }]
          }],
          nextCursor: null
        };
      }
      return { items: sources, nextCursor: null };
    },
    async executeCourseSourceCommand(value) {
      sourceCommands.push(structuredClone(value.command));
      if (value.command.type === "save_source" &&
          !sources.some(({ sourceId }) => sourceId === value.command.sourceId)) {
        sources.push({
          sourceId: value.command.sourceId,
          revision: 1,
          ...structuredClone(value.command.source),
          anchors: []
        });
      }
      return { changed: true };
    }
  };

  const created = await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      metadados: { tipo: "document", titulo: "Manual duplicado" }
    }
  });
  assert.match(created.result, /Atualizei a fonte/u);
  assert.equal(sourceCommands[0].type, "save_source");
  assert.notEqual(sourceCommands[0].sourceId, "source-existing-a");

  await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: 1,
      vinculos: [{
        unidade: "Unidade um",
        relacao: "informed_by",
        ancoras: ["Seção 4.2"]
      }]
    }
  });
  const binding = sourceCommands.at(-1);
  assert.equal(binding.type, "set_target_sources");
  assert.deepEqual(binding.sourceLinks.map(({ sourceId }) => sourceId), [
    "source-other", "source-existing-a"
  ]);
  assert.deepEqual(binding.sourceLinks[0].anchors, [{
    anchorId: "anchor-other"
  }]);
});

test("manter_fonte expõe e executa retirada humana de PDFs e da Fonte", async () => {
  const definition = COURSE_HUMAN_TASKS.find(({ name }) => name === "manter_fonte");
  const validate = new Ajv2020({ strict: false }).compile(definition.inputSchema);
  assert.equal(validate({
    curso: "Redes para iniciantes",
    fonte: "Edital descartável",
    retirar: "fonte"
  }), true);
  assert.equal(validate({
    curso: "Redes para iniciantes",
    retirar: "fonte"
  }), false);
  assert.equal(validate({
    curso: "Redes para iniciantes",
    fonte: "Edital descartável",
    retirar: "pdfs",
    metadados: { titulo: "Não combinar" }
  }), false);
  assert.equal(definition.annotations.destructiveHint, true);

  let courseRevision = 7;
  const source = {
    sourceId: "source-disposable",
    revision: 2,
    status: "active",
    title: "Edital descartável",
    citationText: null,
    attachments: [
      { contentHash: "a".repeat(64) },
      { contentHash: "b".repeat(64) }
    ]
  };
  const commands = [];
  const resumedDeletes = [];
  const sourceAdapter = {
    ...adapter(),
    async listCourses() {
      return {
        items: [{ courseId: COURSE_ID, title: "Redes para iniciantes", revision: courseRevision }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return { courseId: COURSE_ID, title: "Redes para iniciantes", revision: courseRevision };
    },
    async getCourseSources({ mode, sourceId }) {
      if (mode === "source") {
        return { items: sourceId === source.sourceId ? [structuredClone(source)] : [], nextCursor: null };
      }
      return { items: [structuredClone(source)], nextCursor: null };
    },
    async executeCourseSourceCommand({ expectedCourseRevision, command }) {
      assert.equal(expectedCourseRevision, courseRevision);
      commands.push(structuredClone(command));
      if (command.type === "remove_pdf") {
        source.attachments = source.attachments.filter(({ contentHash }) =>
          contentHash !== command.contentHash);
      } else if (command.type === "retire_source") {
        source.status = "retired";
        source.revision += 1;
      } else {
        assert.fail(`Comando inesperado: ${command.type}`);
      }
      courseRevision += 1;
      return { changed: true };
    },
    async resumeCourseSourcePdfDeletes(value) {
      resumedDeletes.push(structuredClone(value));
      return { deleted: 0 };
    }
  };

  const pdfOutput = await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Edital descartável",
      retirar: "pdfs"
    }
  });
  assert.match(pdfOutput.result, /Retirei os PDFs/u);
  assert.deepEqual(commands.map(({ type }) => type), ["remove_pdf", "remove_pdf"]);
  assert.equal(source.attachments.length, 0);
  assert.equal(source.status, "active");
  assert.deepEqual(resumedDeletes.map(({ courseId, sourceId }) => ({ courseId, sourceId })), [{
    courseId: COURSE_ID,
    sourceId: source.sourceId
  }]);

  source.attachments = [{ contentHash: "c".repeat(64) }];
  const output = await executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Edital descartável",
      retirar: "fonte"
    }
  });
  assert.match(output.result, /Retirei a fonte/u);
  assert.deepEqual(commands.map(({ type }) => type), [
    "remove_pdf", "remove_pdf", "remove_pdf", "retire_source"
  ]);
  assert.deepEqual(commands.slice(0, 3).map(({ contentHash }) => contentHash), [
    "a".repeat(64), "b".repeat(64), "c".repeat(64)
  ]);
  assert.equal(source.attachments.length, 0);
  assert.equal(source.status, "retired");
  assert.equal(resumedDeletes.length, 2);

  await assert.rejects(() => executeHumanCourseTask({
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Edital descartável",
      retirar: "pdfs",
      metadados: { titulo: "Não combinar" }
    }
  }), (error) => error.code === "invalid_human_task_arguments");
});

test("nova retirada retoma delete físico pendente antes de declarar sucesso", async () => {
  let courseRevision = 7;
  let activeAttachments = [{ contentHash: "d".repeat(64) }];
  let removeAttempts = 0;
  let resumed = 0;
  const sourceAdapter = {
    ...adapter(),
    async listCourses() {
      return {
        items: [{ courseId: COURSE_ID, title: "Redes para iniciantes", revision: courseRevision }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourse() {
      return { courseId: COURSE_ID, title: "Redes para iniciantes", revision: courseRevision };
    },
    async getCourseSources({ mode }) {
      const source = {
        sourceId: "source-pending-delete",
        revision: 2,
        status: "active",
        title: "PDF com limpeza pendente",
        citationText: null,
        attachments: structuredClone(activeAttachments)
      };
      return { items: mode === "source" || mode === "catalog" ? [source] : [], nextCursor: null };
    },
    async executeCourseSourceCommand({ command }) {
      assert.equal(command.type, "remove_pdf");
      removeAttempts += 1;
      activeAttachments = [];
      if (removeAttempts === 1) courseRevision += 1;
      throw new AuthoringApiError(
        503,
        "course_storage_unavailable",
        "O objeto ainda não pôde ser removido."
      );
    },
    async resumeCourseSourcePdfDeletes() {
      resumed += 1;
      return { deleted: 1 };
    }
  };
  const input = {
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "PDF com limpeza pendente",
      retirar: "pdfs"
    }
  };

  await assert.rejects(() => executeHumanCourseTask(input),
    (error) => error.code === "course_storage_unavailable");
  assert.equal(removeAttempts, 2, "o replay interno conserva a mesma retirada");
  assert.equal(resumed, 0);

  const output = await executeHumanCourseTask(input);
  assert.match(output.result, /Retirei os PDFs/u);
  assert.equal(resumed, 1);
  assert.equal(removeAttempts, 2, "a retomada não cria outro comando remove_pdf");
});

test("retirada da Fonte só ocorre depois de concluir limpeza física pendente", async () => {
  let resumeAttempts = 0;
  const commands = [];
  const sourceAdapter = {
    ...adapter(),
    async getCourseSources() {
      return {
        items: [{
          sourceId: "source-pending-retire",
          revision: 2,
          status: "active",
          title: "Fonte aguardando limpeza",
          citationText: null,
          attachments: []
        }],
        nextCursor: null
      };
    },
    async resumeCourseSourcePdfDeletes() {
      resumeAttempts += 1;
      if (resumeAttempts === 1) {
        throw new AuthoringApiError(
          503,
          "course_storage_unavailable",
          "A limpeza física continua pendente."
        );
      }
      return { deleted: 1 };
    },
    async executeCourseSourceCommand({ command }) {
      commands.push(structuredClone(command));
      return { changed: true };
    }
  };
  const input = {
    adapter: sourceAdapter,
    principal: PRINCIPAL,
    name: "manter_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Fonte aguardando limpeza",
      retirar: "fonte"
    }
  };

  await assert.rejects(() => executeHumanCourseTask(input),
    (error) => error.code === "course_storage_unavailable");
  assert.deepEqual(commands, []);

  const output = await executeHumanCourseTask(input);
  assert.match(output.result, /Retirei a fonte/u);
  assert.deepEqual(commands.map(({ type }) => type), ["retire_source"]);
});

test("MCP anuncia o descritor oficial completo do arquivo PDF", () => {
  const pdfTask = COURSE_HUMAN_TASKS.find(({ name }) => name === "incorporar_pdf_como_fonte");
  assert.deepEqual(pdfTask._meta, { "openai/fileParams": ["pdf"] });
  assert.deepEqual(pdfTask.inputSchema.oneOf, [
    { required: ["fonte"] },
    { required: ["titulo"] }
  ]);
  assert.match(pdfTask.description, /anexa ou reanexa/u);
  assert.match(pdfTask.inputSchema.properties.fonte.description, /Fonte existente/u);
  assert.equal(pdfTask.inputSchema.properties.titulo.description, "Nova fonte a criar.");
  assert.deepEqual(pdfTask.inputSchema.properties.pdf, {
    type: "object",
    additionalProperties: false,
    required: ["download_url", "file_id"],
    properties: {
      download_url: { type: "string", minLength: 1, maxLength: 8192 },
      file_id: { type: "string", minLength: 1, maxLength: 512 },
      file_name: { type: "string", minLength: 1, maxLength: 512 },
      mime_type: { type: "string", const: "application/pdf" }
    },
    description: "PDF temporário."
  });
});

test("MCP rejeita caminho textual no lugar do descritor oficial sem efeitos", async () => {
  let reads = 0;
  const pdfAdapter = {
    ...adapter(),
    async getCourse() {
      reads += 1;
      return await adapter().getCourse();
    }
  };
  await assert.rejects(() => executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Manual do proxy",
      intencao: "Manter o documento entre as Fontes.",
      pdf: "/mnt/data/manual.pdf"
    }
  }), (error) => {
    assert.equal(error.code, "invalid_human_task_arguments");
    assert.match(error.message, /pdf precisa ser um objeto/u);
    return true;
  });
  assert.equal(reads, 0);
});

test("MCP exige Fonte existente ou título novo antes de consultar o Curso", async () => {
  const pdfTask = COURSE_HUMAN_TASKS.find(({ name }) => name === "incorporar_pdf_como_fonte");
  const validatePdfTask = new Ajv2020({ strict: false }).compile(pdfTask.inputSchema);
  const rawArguments = {
    curso: "Redes para iniciantes",
    intencao: "Manter o documento entre as Fontes.",
    pdf: {
      file_id: "file-123",
      download_url: "https://files.oaiusercontent.com/manual.pdf?token=temporary"
    }
  };
  assert.equal(validatePdfTask(rawArguments), false);

  let reads = 0;
  const pdfAdapter = {
    ...adapter(),
    async getCourse() {
      reads += 1;
      return await adapter().getCourse();
    }
  };
  await assert.rejects(() => executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments
  }), (error) => error.code === "invalid_human_task_arguments" &&
      error.details?.fields?.join(",") === "fonte,titulo");
  assert.equal(reads, 0);
});

test("MCP rejeita Fonte existente e título novo juntos antes de qualquer efeito", async () => {
  const pdfTask = COURSE_HUMAN_TASKS.find(({ name }) => name === "incorporar_pdf_como_fonte");
  const validatePdfTask = new Ajv2020({ strict: false }).compile(pdfTask.inputSchema);
  const rawArguments = {
    curso: "Redes para iniciantes",
    fonte: "Manual existente",
    titulo: "Manual duplicado",
    intencao: "Anexar o documento.",
    pdf: {
      file_id: "file-123",
      download_url: "https://files.oaiusercontent.com/manual.pdf?token=temporary"
    }
  };
  assert.equal(validatePdfTask(rawArguments), false);

  let reads = 0;
  let downloads = 0;
  const pdfAdapter = {
    ...adapter(),
    async getCourse() {
      reads += 1;
      return await adapter().getCourse();
    },
    async fetchImpl() {
      downloads += 1;
      return new Response();
    }
  };
  await assert.rejects(() => executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments
  }), (error) => error.code === "invalid_human_task_arguments" &&
      error.details?.fields?.join(",") === "fonte,titulo");
  assert.equal(reads, 0);
  assert.equal(downloads, 0);
});

test("MCP recebe o descritor oficial e mantém o download_url fora do envelope", async () => {
  const sources = [];
  const ingestions = [];
  const temporaryUrl = "https://files.oaiusercontent.com/manual.pdf?token=temporary";
  const pdfAdapter = {
    ...adapter(),
    async getCourseSources() {
      return { items: sources, nextCursor: null };
    },
    async getCourseSourcePdfIngestionReceipt() {
      return null;
    },
    async fetchImpl(url) {
      assert.equal(String(url), temporaryUrl);
      return new Response(new TextEncoder().encode("%PDF-1.4\n%%EOF"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      ingestions.push(value);
      sources.push({
        sourceId: value.sourceIntent.sourceId,
        revision: 1,
        title: value.sourceIntent.source.title
      });
      return { stored: true };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Manual do proxy",
      intencao: "Manter o documento entre as Fontes.",
      pdf: {
        file_id: "file-123",
        file_name: "manual.pdf",
        mime_type: "application/pdf",
        download_url: temporaryUrl
      }
    }
  });
  assert.equal(output.result, "Mantive o PDF entre as fontes do curso.");
  assert.doesNotMatch(JSON.stringify(output), /token=temporary/u);
  assert.equal(ingestions.length, 1);
  assert.equal(ingestions[0].fileIdentity.fileId, "file-123");
});

test("PDF em nova Fonte homônima relê a escrita pela identidade interna", async () => {
  const existing = {
    sourceId: "source-existing-same-title",
    revision: 2,
    status: "active",
    title: "Manual do proxy",
    citationText: null,
    attachments: []
  };
  const sources = [existing];
  const ingestions = [];
  const sourceReads = [];
  const pdfAdapter = {
    ...adapter(),
    async getCourseSources({ mode, sourceId }) {
      if (mode === "source") {
        sourceReads.push(sourceId);
        const source = sources.find((candidate) => candidate.sourceId === sourceId);
        return { items: source ? [structuredClone(source)] : [], nextCursor: null };
      }
      return { items: structuredClone(sources), nextCursor: null };
    },
    async getCourseSourcePdfIngestionReceipt() {
      return null;
    },
    async fetchImpl() {
      return new Response(new TextEncoder().encode("%PDF-1.4\n%%EOF"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" }
      });
    },
    async ingestCourseSourcePdf(value) {
      ingestions.push(structuredClone(value));
      sources.push({
        sourceId: value.sourceIntent.sourceId,
        revision: 1,
        status: "active",
        title: value.sourceIntent.source.title,
        citationText: null,
        attachments: [{ contentHash: "c".repeat(64) }]
      });
      return { stored: true };
    }
  };

  const output = await executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      titulo: "Manual do proxy",
      intencao: "Manter outro documento como nova Fonte homônima.",
      pdf: {
        file_id: "file-homonymous",
        mime_type: "application/pdf",
        download_url: "https://files.oaiusercontent.com/homonymous.pdf?token=temporary"
      }
    }
  });

  assert.equal(ingestions.length, 1);
  assert.equal(sources.length, 2);
  assert.notEqual(ingestions[0].sourceIntent.sourceId, existing.sourceId);
  assert.deepEqual(sourceReads, [ingestions[0].sourceIntent.sourceId]);
  assert.equal(Object.hasOwn(output.context.source, "sourceId"), false);
  assert.equal(output.context.source.title, "Manual do proxy");
});

test("#272 PDF anexado a Fonte existente relê a Fonte solicitada após o commit", async () => {
  const existing = {
    sourceId: "source-existing",
    revision: 2,
    title: "Manual existente",
    citationText: "Manual existente"
  };
  const pdfAdapter = {
    ...adapter(),
    async ingestCourseSourcePdf() {
      assert.fail("O recibo existente deve impedir nova ingestão.");
    },
    async getCourseSources({ mode, sourceId }) {
      if (mode === "catalog") return { items: [existing], nextCursor: null };
      return {
        source: sourceId === existing.sourceId ? existing : null,
        items: sourceId === existing.sourceId ? [existing] : [],
        nextCursor: null
      };
    },
    async getCourseSourcePdfIngestionReceipt() {
      return { stored: true };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: pdfAdapter,
    principal: PRINCIPAL,
    name: "incorporar_pdf_como_fonte",
    rawArguments: {
      curso: "Redes para iniciantes",
      fonte: "Manual existente",
      intencao: "Anexar o PDF à Fonte já escolhida.",
      pdf: {
        file_id: "file-existing",
        mime_type: "application/pdf",
        download_url: "https://files.oaiusercontent.com/existing.pdf?token=temporary"
      }
    }
  });
  assert.equal(output.result, "Mantive o PDF entre as fontes do curso.");
});

test("resultado final remove maquinaria técnica e não anexa manual de operação", async () => {
  const output = await executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async getCourseSources() {
        return {
          items: [{
            title: "Fonte legível",
            steps: [{ payload: { requestId: "internal" } }],
            runs: [{ duration: 12 }],
            materialization: { hash: "a".repeat(64) }
          }],
          nextCursor: null
        };
      }
    },
    principal: PRINCIPAL,
    name: "consultar_fontes",
    rawArguments: { curso: "Redes para iniciantes" }
  });
  const serialized = JSON.stringify(output.context);
  assert.doesNotMatch(serialized, /steps|payload|requestId|runs|duration|materialization|hash/iu);
  assert.doesNotMatch(serialized, /guidance|authoring-guidance|instructions/iu);
});

test("o limite continua valendo para todo o envelope humano", async () => {
  await assert.rejects(() => executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async getCourseSources() {
        return {
          items: [{ title: "Fonte extensa", excerpt: "x".repeat(522_000) }],
          nextCursor: null
        };
      }
    },
    principal: PRINCIPAL,
    name: "consultar_fontes",
    rawArguments: { curso: "Redes para iniciantes" }
  }), (error) => error.status === 413 && error.code === "human_task_result_too_large");
});

test("#272 Observações de uma Parte paginam todas as Units e excluem outros alvos", async () => {
  let unitPages = 0;
  const scopedAdapter = {
    ...adapter(),
    async listCourseStudyUnits({ cursorStudyUnitId }) {
      unitPages += 1;
      return cursorStudyUnitId === null
        ? {
            items: [{ ordinal: 1, studyUnit: { id: "unit-part-a", title: "Unit A" } }],
            hasMore: true,
            nextCursor: { studyUnitId: "unit-part-a" }
          }
        : {
            items: [{ ordinal: 2, studyUnit: { id: "unit-part-b", title: "Unit B" } }],
            hasMore: false,
            nextCursor: null
          };
    },
    async getCourseAnchoredAnnotations() {
      return {
        items: [{
          annotationId: "annotation-part",
          target: { kind: "study_unit", id: "unit-part-b" },
          rawText: "Observação da Parte."
        }, {
          annotationId: "annotation-outside",
          target: { kind: "study_unit", id: "unit-outside" },
          rawText: "Observação de outra Parte."
        }],
        nextCursor: null
      };
    }
  };
  const output = await executeHumanCourseTask({
    adapter: scopedAdapter,
    principal: PRINCIPAL,
    name: "consultar_observacoes",
    rawArguments: { curso: "Redes para iniciantes", parte: 1 }
  });
  assert.equal(output.result, "1 observação encontrada.");
  assert.equal(unitPages, 2);
  assert.match(JSON.stringify(output.context), /Observação da Parte/u);
  assert.doesNotMatch(JSON.stringify(output.context), /outra Parte/u);
});

test("#272 configuração invalida todo o pedido antes da primeira escrita", async () => {
  let writes = 0;
  await assert.rejects(() => executeHumanCourseTask({
    adapter: {
      ...adapter(),
      async applyCourseDesignCommand() {
        writes += 1;
        return { changed: true };
      }
    },
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      parametrosPedagogicos: {
        tetoNovasUnidadesDeAnalise: 2,
        formasDeExplicacao: ["forma-inexistente"]
      }
    }
  }), (error) => typeof error.code === "string");
  assert.equal(writes, 0);
});

test("configuração default calibra o foco, condição de pesquisa prevalece e Observações são focais", async () => {
  const designCommands = [];
  const observationBatches = [];
  const writeAdapter = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          id: "40000000-0000-4000-8000-000000000004",
          version: 3,
          title: "Redes para iniciantes",
          objective: "Explicar serviços em rede.",
          instructionalAnalysisUnits: [],
          evidenceRequirements: [],
          parts: [{
            id: PART_ID,
            version: 2,
            position: 0,
            title: "Sockets",
            intent: "Relacionar processos e comunicação.",
            microsequences: [{
              id: "micro-sockets",
              productionPosition: 0,
              title: "Sockets",
              goal: "Relacionar processos e comunicação.",
              role: "explain"
            }]
          }]
        }
      };
    },
    async getCourseDesign() {
      const currentParameter = designCommands
        .filter(({ type }) => type === "set_parameter")
        .at(-1);
      return {
        definitions: [{
          id: "new_analysis_unit_ceiling_per_expository_study_unit",
          label: "Novas unidades de análise"
        }],
        parameters: [{
          parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
          localAssignment: { value: currentParameter?.value ?? 1 },
          effectiveAssignment: {
            value: currentParameter?.value ?? 1,
            inherited: false,
            origin: currentParameter?.origin ?? "author",
            reason: currentParameter?.reason ?? "Condição anterior.",
            sourceScope: currentParameter?.scope ?? { kind: "course" }
          }
        }],
        guidance: { localAssignment: null, effectiveAssignments: [] },
        targetPlanItems: null
      };
    },
    async applyCourseDesignCommand(value) {
      designCommands.push(structuredClone(value.command));
      return { changed: true };
    },
    async listCourseStudyUnits() {
      return {
        items: [{
          ordinal: 1,
          version: 2,
          studyUnit: { id: "unit-one", title: "Unidade um", version: 2 }
        }, {
          ordinal: 2,
          version: 3,
          studyUnit: { id: "unit-two", title: "Unidade dois", version: 3 }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async createCourseAnchoredAnnotations(value) {
      observationBatches.push(structuredClone(value));
      return { changed: true, createdCount: value.commands.length };
    }
  };
  const configured = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 1 },
      direcaoEditorial: "Use títulos informativos; crie mais unidades se necessário."
    }
  });
  assert.deepEqual(designCommands.map(({ type }) => type), [
    "set_parameter", "set_guidance"
  ]);
  assert.equal(designCommands.every(({ origin }) => origin === "automatic"), true);
  assert.doesNotMatch(JSON.stringify(configured.context), /definitions|componentCatalog|recentApplications/u);

  const calibratedMicrosequence = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      microssequencia: "Sockets",
      parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 2 }
    }
  });
  assert.deepEqual(designCommands.at(-1), {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-sockets" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    origin: "automatic",
    reason: "Valor calibrado automaticamente para o contexto corrente."
  });
  assert.ok(JSON.stringify(calibratedMicrosequence.context).length < 2500);
  assert.doesNotMatch(
    JSON.stringify(calibratedMicrosequence.context),
    /StudyUnit|AnalysisUnit|requestId|revision|authoring-guidance/iu
  );
  assert.deepEqual(
    calibratedMicrosequence.context.configuracao.parametros[0],
    {
      nome: "Novas unidades de análise",
      valorLocal: 2,
      valorEfetivo: 2,
      herdado: false,
      origem: "calibração contextual",
      motivo: "Valor calibrado automaticamente para o contexto corrente.",
      escopoDeOrigem: "microssequência"
    }
  );

  const fixedForResearch = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      unidade: "Unidade um",
      condicao: "pesquisa",
      parametrosPedagogicos: { tetoNovasUnidadesDeAnalise: 2 }
    }
  });
  assert.deepEqual(designCommands.at(-1), {
    type: "set_parameter",
    scope: { kind: "study_unit", ref: "unit-one" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    origin: "research_condition",
    reason: "Condição de pesquisa fixada explicitamente."
  });
  assert.equal(
    fixedForResearch.context.configuracao.parametros[0].origem,
    "condição de pesquisa"
  );
  assert.equal(
    fixedForResearch.context.configuracao.parametros[0].escopoDeOrigem,
    "unidade de estudo"
  );

  const observed = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "registrar_observacao",
    rawArguments: {
      curso: "Redes para iniciantes",
      unidades: [1, 2],
      texto: "A transição precisa ser revista.",
      categoria: "suggestion"
    }
  });
  assert.equal(observationBatches.length, 1);
  assert.deepEqual(observationBatches[0].commands.map(({ target }) => target.id), [
    "unit-one", "unit-two"
  ]);
  assert.equal(new Set(observationBatches[0].commands.map(({ annotationId }) =>
    annotationId)).size, 2);
  assert.equal(new Set(observationBatches[0].commands.map(({ capturedAt }) =>
    capturedAt)).size, 1);
  assert.match(observed.result, /separadamente em 2 unidades/u);
});
