import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { reconciledExplanationFixture } from "../helpers/reconciledExplanationFixture.js";
import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
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
import {
  COURSE_AUTHORING_SERVER_INSTRUCTIONS,
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";
import { RESOURCE_PACKAGE_REGISTRY } from
  "../../supabase/functions/_shared/aralearn/runtime/resources/catalog/resourceCatalog.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { createAuthoringActionHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { encodeCourseActionTaskRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import { applyCurricularMapSlice, inspectCurricularMapCompleteness } from
  "../../src/domain/courseCurricularMapSlices.js";

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
  "consultar_acesso", "definir_visibilidade", "alterar_acesso", "definir_acesso_arquivos", "definir_politica_revisao",
  "consultar_repertorio_instrucional", "manter_unidade_analise", "manter_requisito_evidencia",
  "vincular_repertorio_instrucional", "registrar_aplicacoes_instrucionais", "aplicar_configuracao_instrucional",
  "ajustar_orientacao", "ajustar_componentes",
  "alterar_curso", "excluir_curso", "salvar_ramo_curricular", "mover_ramo_curricular",
  "duplicar_ramo_curricular", "remover_ramo_curricular", "reordenar_unidades",
  "consultar_preferencias_autoria", "salvar_preferencias_autoria",
  "copiar_curso", "comparar_cursos", "exportar_autoria",
  "consultar_perfis", "salvar_perfil", "excluir_perfil", "prever_aplicacao_perfil", "aplicar_perfil",
  "retomar_curso",
  "consultar_planejamento",
  "preparar_materializacao",
  "consultar_configuracao",
  "consultar_observacoes",
  "preparar_revisao",
  "consultar_fontes",
  "consultar_componentes",
  "criar_curso",
  "aprovar_mapa_curricular",
  "salvar_mapa_curricular",
  "salvar_parte",
  "materializar_parte",
  "ajustar_configuracao",
  "registrar_observacao",
  "registrar_inspecao",
  "decidir_observacao",
  "editar_observacao",
  "salvar_explicacoes",
  "aplicar_correcoes",
  "retomar_correcao", "declarar_revisao",
  "manter_fonte",
  "incorporar_pdf_como_fonte", "guardar_audio", "consultar_audios"
]);

function adapter(principal = PRINCIPAL) {
  return {
    publicAppUrl: "https://app.example",
    supabaseUrl: "https://project.example",
    async resolvePrincipal() {
      return principal;
    },
    async getAuthoringProcessPreferences() {
      return { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
        updatedAt: null, preferences: defaultAuthoringProcessPreferences() };
    },
    async getCourseDesign({ courseId, scopeKind = "course" }) {
      const course = await this.getCourse({ courseId });
      return courseDesignFixture({ courseId }, { scope: scopeKind, revision: course.revision });
    },
    async listCourseStudyUnits() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async getCourseAnchoredAnnotations() {
      return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null };
    },
    async getCourseSources() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async getCourseContentReview({ courseId, targetKind, targetId }) {
      const course = await this.getCourse({ courseId });
      return { contract: "aralearn.course-content-review.v1", courseId,
        courseRevision: course.revision, targetKind, targetId, entityVersion: 1,
        basisHash: "a".repeat(64), contentReview: { state: "unregistered" }, reviewPolicy: "saved" };
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

// A escrita de Fontes passou a ser um único `apply_source_bundle`; estes acessores
// leem o comando efetivo dentro do pacote sem mudar a expectativa semântica.
function sourceBundleCommands(record) {
  const command = record?.command ?? record;
  return command?.type === "apply_source_bundle" ? command.commands : [command];
}

function sourceBundleCommand(record, type) {
  const found = sourceBundleCommands(record).find((entry) => entry?.type === type);
  assert.ok(found, `o pacote precisa conter ${type}`);
  return found;
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

function curricularMapArguments(artifactId) {
  const artifact = GLOBAL_AUTHORING_FIXTURE.artifacts[artifactId];
  return {
    curso: GLOBAL_AUTHORING_FIXTURE.course.title,
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
          explicacao: { proposito: microsequence.objective,
            pressupostos: [...microsequence.dependsOn], relacoes: [...microsequence.covers], fontesPrevistas: [] },
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
              explanationPlan: { purpose: microsequence.objective,
                prerequisites: [...microsequence.dependsOn], relations: [...microsequence.covers], sourceIds: [] },
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
  const map = artifactId === null ? null : internalCurricularMap(artifactId, approval);
  const modules = (map?.modules ?? []).map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => ({
      ...lesson,
      microsequences: lesson.microsequences.map((microsequence) => {
        const { dependencies, ...projected } = microsequence;
        delete projected.scopeItemIds;
        return { ...projected, dependencyMicrosequenceIds: dependencies };
      })
    }))
  }));
  const curriculumScopeItems = (map?.scopeItems ?? []).map((scopeItem) => ({
    ...scopeItem,
    curriculumTargets: (map?.modules ?? []).flatMap((module) =>
      module.lessons.flatMap((lesson) => {
        const didacticMicrosequenceIds = lesson.microsequences
          .filter((microsequence) => microsequence.scopeItemIds.includes(scopeItem.id))
          .map(({ id }) => id);
        return didacticMicrosequenceIds.length ? [{
          moduleId: module.id,
          lessonId: lesson.id,
          didacticMicrosequenceIds
        }] : [];
      }))
  }));
  return {
    courseId: COURSE_ID,
    courseRevision,
    plan: {
      id: "40000000-0000-4000-8000-000000000004",
      version: planVersion,
      title: GLOBAL_AUTHORING_FIXTURE.course.title,
      objective: GLOBAL_AUTHORING_FIXTURE.course.objective,
      curriculumMapStatus: map?.approval ?? "absent",
      audience: map?.audience ?? null,
      declaredPrerequisites: map?.prerequisites ?? [],
      curriculumScopeItems,
      curriculum: { modules },
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts
    }
  };
}

function internalMapMicrosequences(planRead) {
  return planRead.plan.curriculum.modules.flatMap(({ lessons }) =>
    lessons.flatMap(({ microsequences }) => microsequences));
}

function internalMapEntities(planRead) {
  return planRead.plan.curriculum.modules.flatMap((module) => [
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
  assert.equal(new Set(EXPECTED_NAMES).size, 56);
  const actualHash = createHash("sha256")
    .update(JSON.stringify(COURSE_HUMAN_TASKS))
    .digest("hex");
  assert.equal(COURSE_HUMAN_TASK_CATALOG_HASH, `sha256:${actualHash}`);
  assert.equal(COURSE_HUMAN_TASK_CATALOG_METADATA.version, "11.1.0");
  // Orçamento local de regressão; o servidor aceita 2 MiB por resposta MCP e o
  // payload de chamada mantém o gate próprio. Baseline medida com o contrato de
  // saída só de sucesso: 144.996 B. A união tipada (sucesso + erro) exigida pelo
  // protocolo custa 16.240 B repetidos nas 56 tarefas (161.236 B); a forma compacta
  // equivalente (properties comuns + oneOf de required) mede 157.148 B. O teto de
  // 160 KiB (163.840 B) acomoda a forma compacta com margem; não é a folga de 165k
  // para a forma repetida.
  const catalogBytes = new TextEncoder().encode(JSON.stringify(COURSE_HUMAN_TASKS)).byteLength;
  assert.ok(catalogBytes <= 163_840, `Catálogo: ${catalogBytes} bytes UTF-8.`);
});

test("MCP orienta o chat a reproduzir o link retornado", async () => {
  const response = await mcpHandler()(request("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "chat-de-aceitação", version: "1.0.0" }
  }));
  const payload = await response.json();

  assert.equal(payload.result.instructions, COURSE_AUTHORING_SERVER_INSTRUCTIONS);
  assert.match(
    payload.result.instructions,
    /link exato em Markdown/iu
  );
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

test("mapa salvo é relido e a aprovação referencia a versão persistida", async () => {
  let current = mapPlanRead({ artifactId: null, approval: "absent" });
  const mapWrites = [];
  const approvals = [];
  let partWrites = 0;
  const value = {
    ...adapter(),
    ...globalCourseIdentity(() => current.courseRevision),
    async getCourseInstructionalPlan() {
      return { ...structuredClone(current), mapApprovalReference: `persisted-map-${current.plan.version}` };
    },
    async approveCourseCurricularMap({ reference }) {
      if (reference !== `persisted-map-${current.plan.version}`) throw new AuthoringApiError(409, "stale_course_state", "O mapa mudou.");
      approvals.push(reference);
      current.plan.curriculumMapStatus = "approved";
      return { courseRevision: ++current.courseRevision, deepLink: `https://app.example/#/authoring/courses/${COURSE_ID}` };
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
  const savedProposal = mapWrites[0].curricularMap.modules[0].lessons[0].microsequences[0].explanationPlan;
  const requestedProposal = draftArguments.modulos[0].licoes[0].microssequencias[0].explicacao;
  assert.deepEqual(savedProposal, { purpose: requestedProposal.proposito,
    prerequisites: requestedProposal.pressupostos, relations: requestedProposal.relacoes, sourceIds: [] });
  for (const item of GLOBAL_AUTHORING_FIXTURE.scopeItems) {
    assert.match(serializedDraftWrite, new RegExp(item, "u"));
  }
  for (const microsequence of internalMapMicrosequences(mapPlanRead({
    artifactId: "mapa-global-v1",
    approval: "draft"
  }))) {
    assert.match(serializedDraftWrite, new RegExp(microsequence.title, "u"));
  }

  const uninspectedChange = { ...curricularMapArguments("mapa-global-v1"), aprovado: true };
  uninspectedChange.modulos[0].objetivo = "Uma mudança que não foi apresentada à pessoa autora.";
  await assert.rejects(() => executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: uninspectedChange
  }));
  assert.equal(mapWrites.length, 1);

  const changedSupport = { ...curricularMapArguments("mapa-global-v1"), aprovado: true };
  changedSupport.modulos[0].licoes[0].microssequencias[0].explicacao.proposito =
    "Uma proposta de apoio que ainda não foi apresentada à pessoa autora.";
  await assert.rejects(() => executeHumanCourseTask({
    adapter: value, principal: PRINCIPAL, name: "salvar_mapa_curricular", rawArguments: changedSupport
  }));
  assert.equal(mapWrites.length, 1);

  const revisedArguments = curricularMapArguments("mapa-global-v2", false);
  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_mapa_curricular",
    rawArguments: revisedArguments
  });
  assert.equal(mapWrites.length, 2);

  await assert.rejects(() => executeHumanCourseTask({ adapter: value, principal: PRINCIPAL,
    name: "aprovar_mapa_curricular", rawArguments: { referencia: draft.context.referenciaParaAprovar }
  }), error => error.code === "stale_course_state");

  const approved = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "aprovar_mapa_curricular",
    rawArguments: { referencia: `persisted-map-${current.plan.version}` }
  });
  assert.equal(mapWrites.length, 2);
  assert.equal(approvals.length, 1);
  assert.equal(partWrites, 0);
  assert.match(JSON.stringify(approved.context), /aprovado/iu);
  assert.match(approved.nextDecision, /foco|cadência/iu);
  assert.doesNotMatch(approved.nextDecision, /\?/u);
});

async function completeTaskRead(input) {
  let output = await executeHumanCourseTask(input);
  const first = output;
  if (!output.context.fragmento) return output;
  let literal = "";
  for (let page = 0; page < 100; page++) {
    assert.equal(output.context.fragmento.inicio, literal.length);
    literal += output.context.fragmento.texto;
    if (output.context.fragmento.fim === output.context.fragmento.total) {
      return { ...first, context: JSON.parse(literal) };
    }
    output = await executeHumanCourseTask({ ...input,
      rawArguments: { ...input.rawArguments, continuacao: output.context.continuacao } });
  }
  assert.fail("A leitura precisa terminar.");
}

function incrementalCurricularMapAdapter() {
  const state = { courseRevision: 7, planVersion: 3, approval: "absent", loseNextSliceResponse: false,
    map: { audience: "", prerequisites: [], scopeItems: [], modules: [] } };
  const writes = [], receipts = new Map();
  const persist = (kind, input, map) => {
    writes.push({ kind, input: structuredClone(input) });
    if (receipts.has(input.requestId)) return { ...receipts.get(input.requestId), idempotent: true };
    if (input.expectedCourseRevision !== state.courseRevision || input.expectedPlanVersion !== state.planVersion) {
      throw new AuthoringApiError(409, "stale_course_state", "O mapa mudou.");
    }
    state.map = structuredClone(map);
    state.approval = "draft";
    const receipt = { contract: "aralearn.course-curricular-map-change.v1", courseId: COURSE_ID,
      courseRevision: ++state.courseRevision, planVersion: ++state.planVersion,
      approval: "draft", changed: true, idempotent: false };
    receipts.set(input.requestId, receipt);
    if (kind === "slice" && state.loseNextSliceResponse) {
      state.loseNextSliceResponse = false;
      throw new AuthoringApiError(503, "request_timeout", "A resposta do recorte se perdeu.");
    }
    return receipt;
  };
  return {
    ...adapter(), ...globalCourseIdentity(() => state.courseRevision), state, writes,
    async getCourseInstructionalPlan() {
      const read = mapPlanRead({ artifactId: null, courseRevision: state.courseRevision, planVersion: state.planVersion });
      return { ...read, mapApprovalReference: `persisted-map-${state.planVersion}`, plan: {
        ...read.plan, curriculumMapStatus: state.approval, audience: state.map.audience,
        declaredPrerequisites: structuredClone(state.map.prerequisites),
        curriculumScopeItems: structuredClone(state.map.scopeItems),
        curriculum: { modules: state.map.modules.map(module => ({ ...structuredClone(module), id: module.moduleId,
          lessons: module.lessons.map(lesson => ({ ...structuredClone(lesson), id: lesson.lessonId,
            microsequences: lesson.microsequences.map(micro => ({ ...structuredClone(micro), id: micro.microsequenceId })) })) })) }
      } };
    },
    async getCourseCurricularMap() {
      return { courseId: COURSE_ID, courseRevision: state.courseRevision, planVersion: state.planVersion,
        map: structuredClone(state.map) };
    },
    async saveCourseCurricularMap(input) {
      return persist("map", input, input.curricularMap);
    },
    async saveCourseCurricularMapSlice(input) {
      const map = receipts.has(input.requestId) ? state.map : applyCurricularMapSlice(state.map, input.command);
      return persist("slice", input, map);
    }
  };
}

test("escrita de mapa grande confirma e recupera referência sem repetir a escrita em MCP e Actions", async () => {
  for (const channel of ["mcp", "actions"]) {
    const value = incrementalCurricularMapAdapter();
    value.resolveActionPrincipal = async () => PRINCIPAL;
    const handler = channel === "mcp" ? createAuthoringMcpHandler({ adapter: value,
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1" }) : createAuthoringActionHandler({ adapter: value,
      allowedOrigins: new Set([ORIGIN]), actionBaseUrl: "https://edge.example/functions/v1/aralearn-authoring-action",
      publicAppUrl: value.publicAppUrl });
    const call = async (name, args) => {
      const binding = encodeCourseActionTaskRequest(name, args);
      const response = await handler(channel === "mcp" ? request("tools/call", { name, arguments: args })
        : new Request(`https://edge.example/functions/v1/aralearn-authoring-action/${binding.operationName}`, {
          method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token", "Content-Type": "application/json" },
          body: JSON.stringify(binding.arguments) }));
      const serialized = await response.text();
      assert.equal(response.status, 200, serialized);
      assert.ok(serialized.length < 4000, "a confirmação independe do tamanho do mapa");
      const body = JSON.parse(serialized);
      assert.notEqual(body.result?.isError, true, serialized);
      return channel === "mcp" ? body.result.structuredContent : body;
    };
    const args = curricularMapArguments("mapa-global-v1");
    args.modulos = [args.modulos[0]];
    args.modulos[0].licoes = [args.modulos[0].licoes[0]];
    const prototype = args.modulos[0].licoes[0].microssequencias[0];
    args.modulos[0].licoes[0].microssequencias = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(prototype),
      titulo: `Microssequência ${i + 1}`, objetivo: "Objetivo com detalhes. ".repeat(60).trim(), dependencias: [],
      cobertura: [...args.itensDeEscopo] }));
    assert.ok(JSON.stringify(args).length > 30000);
    const saved = await call("salvar_mapa_curricular", args);
    const revision = value.state.courseRevision;
    assert.equal(value.writes.length, 1);
    const recovered = await call("consultar_planejamento", { curso: args.curso, resumo: true });
    assert.equal(recovered.context.referenciaParaAprovar, saved.context.referenciaParaAprovar);
    assert.equal(recovered.context.revisaoDoCurso, revision);
    assert.equal(value.writes.length, 1, "resposta perdida é reconciliada por leitura");
    const complete = await completeTaskRead({ adapter: value, principal: PRINCIPAL,
      name: "consultar_planejamento", rawArguments: { curso: args.curso } });
    assert.equal(complete.context.mapaCurricular.modulos[0].licoes[0].microssequencias.length, 20);
    assert.equal(complete.context.mapaCurricular.modulos[0].licoes[0].microssequencias[19].objetivo,
      args.modulos[0].licoes[0].microssequencias[19].objetivo);
  }
});

test("mapa incremental começa pelo contexto e preserva detalhes, cobertura e dependências por ramos", async () => {
  const value = incrementalCurricularMapAdapter();
  const full = { curso: GLOBAL_AUTHORING_FIXTURE.course.title,
    publico: "Pessoas que desejam compreender comunicação em redes a partir de situações concretas.",
    preRequisitos: ["Distinguir processos e mensagens em um computador."],
    itensDeEscopo: ["Origem e destino", "Mensagens e meios", "Portas e serviços", "Comunicação entre processos"],
    modulos: Array.from({ length: 2 }, (_, moduleIndex) => ({
      titulo: `Módulo ${moduleIndex + 1}`, objetivo: `Explicar as relações do módulo ${moduleIndex + 1}.`,
      licoes: [{ titulo: `Lição ${moduleIndex + 1}`, objetivo: `Investigar os casos da lição ${moduleIndex + 1}.`,
        microssequencias: Array.from({ length: 2 }, (_, microIndex) => {
          const index = moduleIndex * 2 + microIndex;
          const detail = `Relação ${index + 1}: compare origem, destino e função no mesmo caso concreto. `.repeat(16).trim();
          return { titulo: `Microssequência ${index + 1}`, objetivo: detail,
            dependencias: index ? [`Microssequência ${index}`] : [],
            cobertura: [["Origem e destino", "Mensagens e meios", "Portas e serviços", "Comunicação entre processos"][index]],
            explicacao: { proposito: detail, pressupostos: [`Pressuposto específico: ${detail}`],
              relacoes: [`Relação a desenvolver: ${detail}`], fontesPrevistas: [] } };
        }) }]
    })) };
  assert.ok(JSON.stringify(full).length > 16000, "o mapa desenvolvido excede o tamanho das chamadas relatadas no incidente");
  const calls = [];
  const run = async (name, rawArguments) => {
    calls.push({ name, rawArguments: structuredClone(rawArguments) });
    return executeHumanCourseTask({ adapter: value, principal: PRINCIPAL, name, rawArguments });
  };
  const started = await run("salvar_mapa_curricular", { ...full, modulos: [] });
  assert.equal(value.state.map.audience, full.publico);
  assert.deepEqual(value.state.map.prerequisites, full.preRequisitos);
  assert.deepEqual(value.state.map.scopeItems.map(item => item.statement), full.itensDeEscopo);
  assert.deepEqual(value.state.map.modules, []);
  assert.match(started.nextDecision, /salvar_ramo_curricular/u);
  assert.doesNotMatch(started.nextDecision, /aprov/iu);
  assert.equal(inspectCurricularMapCompleteness(value.state.map).complete, false);

  for (const module of full.modulos) {
    await run("salvar_ramo_curricular", { curso: full.curso, tipo: "modulo", titulo: module.titulo, objetivo: module.objetivo });
    for (const lesson of module.licoes) {
      const parent = { modulo: module.titulo, licao: lesson.titulo };
      await run("salvar_ramo_curricular", { curso: full.curso, tipo: "licao", destino: { modulo: module.titulo },
        titulo: lesson.titulo, objetivo: lesson.objetivo });
      for (const micro of lesson.microssequencias) {
        if (micro.titulo === "Microssequência 1") value.state.loseNextSliceResponse = true;
        await run("salvar_ramo_curricular", { curso: full.curso, tipo: "microssequencia", destino: parent,
          titulo: micro.titulo, objetivo: micro.objetivo, dependencias: micro.dependencias, cobertura: micro.cobertura,
          explicacao: { proposito: micro.explicacao.proposito, pressupostos: micro.explicacao.pressupostos,
            relacoes: micro.explicacao.relacoes, fontes: [] } });
      }
    }
  }
  assert.ok(calls.every(call => JSON.stringify(call.rawArguments).length < 8000), "o exemplo conserva detalhes em chamadas menores");
  assert.equal(value.writes.filter(write => write.kind === "map").length, 1, "continuar não retransmite a árvore inteira");
  const firstMicroWrites = value.writes.filter(write => write.input.command?.title === "Microssequência 1");
  assert.equal(firstMicroWrites.length, 2);
  assert.deepEqual(firstMicroWrites[0], firstMicroWrites[1], "a resposta perdida conserva a mesma tentativa e identidade");
  assert.equal(inspectCurricularMapCompleteness(value.state.map).complete, true);
  const reread = await completeTaskRead({ adapter: value, principal: PRINCIPAL,
    name: "consultar_planejamento", rawArguments: { curso: full.curso } });
  assert.equal(reread.context.mapaCurricular.modulos.length, full.modulos.length);
  const expectedMicros = full.modulos.flatMap(module => module.licoes.flatMap(lesson => lesson.microssequencias));
  const savedMicros = value.state.map.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.microsequences));
  assert.equal(savedMicros.length, expectedMicros.length);
  for (const [index, micro] of expectedMicros.entries()) {
    const saved = savedMicros[index];
    assert.equal(saved.title, micro.titulo);
    assert.equal(saved.objective, micro.objetivo);
    assert.deepEqual(saved.explanationPlan, { purpose: micro.explicacao.proposito,
      prerequisites: micro.explicacao.pressupostos, relations: micro.explicacao.relacoes, sourceIds: [] });
    assert.deepEqual(saved.dependencyMicrosequenceIds, index ? [savedMicros[index - 1].microsequenceId] : []);
    assert.deepEqual(saved.scopeItemIds, [value.state.map.scopeItems[index].id]);
  }
});

test("mapa incremental recusa reiniciar contexto vazio quando um ramo planejado já existe", async () => {
  const value = incrementalCurricularMapAdapter();
  value.state.map.modules = [{ moduleId: fixtureUuid("6", 0), position: 0,
    title: "Planejamento preservado", objective: "Desenvolver relações úteis.", lessons: [] }];
  value.state.approval = "draft";
  const before = structuredClone(value.state);
  await assert.rejects(executeHumanCourseTask({ adapter: value, principal: PRINCIPAL,
    name: "salvar_mapa_curricular", rawArguments: { ...curricularMapArguments("mapa-global-v1"), modulos: [] }
  }), error => error.code === "curricular_map_bootstrap_conflict");
  assert.equal(value.writes.length, 0);
  assert.deepEqual(value.state, before);
});

test("mapa incremental relê conflito de versão e preserva ramo criado por outra sessão", async () => {
  const value = incrementalCurricularMapAdapter();
  let attempts = 0;
  const concurrentModule = { moduleId: fixtureUuid("6", 0), position: 0,
    title: "Ramo da outra sessão", objective: "Preservar a decisão já salva.", lessons: [] };
  value.saveCourseCurricularMap = async () => {
    attempts += 1;
    assert.equal(attempts, 1, "a releitura deve impedir outra tentativa de substituir o ramo");
    value.state.map.modules = [structuredClone(concurrentModule)];
    value.state.approval = "draft";
    value.state.courseRevision += 1;
    value.state.planVersion += 1;
    throw new AuthoringApiError(409, "stale_course_state", "Outra sessão acrescentou um ramo.");
  };
  await assert.rejects(executeHumanCourseTask({ adapter: value, principal: PRINCIPAL,
    name: "salvar_mapa_curricular", rawArguments: { ...curricularMapArguments("mapa-global-v1"), modulos: [] }
  }), error => error.code === "curricular_map_bootstrap_conflict");
  assert.equal(attempts, 1);
  assert.deepEqual(value.state.map.modules, [concurrentModule]);
  assert.equal(value.state.courseRevision, 8);
  assert.equal(value.state.planVersion, 4);
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
  const mapBefore = structuredClone(current.plan.curriculum);
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

  const firstPart = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: authoringPartArguments("parte-1-v1")
  });
  assert.equal(firstPart.nextDecision, "A parte está pronta para leitura focal e produção.");
  assert.doesNotMatch(firstPart.nextDecision, /\?/u);
  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: authoringPartArguments("parte-1-v2", 1)
  });

  assert.equal(partWrites.length, 2);
  assert.equal(curricularMapWrites, 0);
  assert.deepEqual(current.plan.curriculum, mapBefore);
  const idsByTitle = new Map(internalMapMicrosequences({
    plan: { curriculum: mapBefore }
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

test("salvar_parte pode redefinir lotes sem alterar a arquitetura curricular", async () => {
  const initial = mapPlanRead();
  const mapBefore = structuredClone(initial.plan.curriculum);
  const [firstMicrosequence, secondMicrosequence] = internalMapMicrosequences(initial);
  const existingPart = {
    id: PART_ID,
    version: 1,
    position: 0,
    title: "Lote inicial",
    intent: "Preparar os fundamentos.",
    progression: [firstMicrosequence.title, secondMicrosequence.title],
    microsequences: [firstMicrosequence, secondMicrosequence].map((item, position) => ({
      id: item.id,
      productionPosition: position,
      title: item.title
    }))
  };
  const current = mapPlanRead({ parts: [existingPart] });
  let savedPart = null;
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
    async saveCourseCurricularMap() {
      assert.fail("Redefinir um lote não pode regravar o mapa curricular.");
    },
    async saveCourseAuthoringPart(input) {
      savedPart = structuredClone(input.part);
      return {
        contract: "aralearn.course-authoring-part-change.v1",
        courseId: COURSE_ID,
        courseRevision: current.courseRevision + 1,
        planVersion: current.plan.version + 1,
        authoringPartId: input.part.partId,
        changed: true,
        idempotent: false
      };
    }
  };

  await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: GLOBAL_AUTHORING_FIXTURE.course.title,
      titulo: "Novo limite operacional",
      posicao: 1,
      intencao: "Reagrupar o trabalho sem mudar o currículo.",
      microssequencias: [secondMicrosequence.title],
      progressao: [secondMicrosequence.title]
    }
  });

  assert.ok(savedPart);
  assert.equal(savedPart.position, 0);
  assert.deepEqual(
    savedPart.microsequences.map(({ microsequenceId }) => microsequenceId),
    [secondMicrosequence.id]
  );
  assert.deepEqual(current.plan.curriculum, mapBefore);
});

test("preparo focal não transforma a parte operacional em dependência pedagógica", async () => {
  const microA = "micro-definicao";
  const microB = "micro-mecanismo";
  const analysisA = "50000000-0000-4000-8000-000000000005";
  const analysisB = "50000000-0000-4000-8000-000000000006";
  const evidenceA = "60000000-0000-4000-8000-000000000001";
  const evidenceB = "60000000-0000-4000-8000-000000000002";
  const existingStudyUnitId = "70000000-0000-4000-8000-000000000001";
  const reads = [];
  const design = (scopeRef, targetAnalysis, targetEvidence) => {
    const current = courseDesignFixture({ courseId: COURSE_ID, microsequenceId: scopeRef }, { revision: 7 });
    current.targetPlanItems = {
      instructionalAnalysisUnitIds: targetAnalysis,
      evidenceRequirementIds: targetEvidence
    };
    return current;
  };
  const value = {
    ...adapter(),
    async getCourseInstructionalPlan() {
      return {
        courseId: COURSE_ID,
        courseRevision: 7,
        plan: {
          version: 3,
          title: "Redes para iniciantes",
          curriculumMapStatus: "approved",
          curriculum: { modules: [{ lessons: [{ microsequences: [
            { id: microA, position: 0, title: "Definição",
              explanation: reconciledExplanationFixture([{ text: "Um socket liga o processo ao serviço de transporte.", role: "support" }]) },
            { id: microB, position: 1, title: "Mecanismo" }
          ] }] }] },
          curriculumScopeItems: [],
          instructionalAnalysisUnits: [
            { id: analysisA, position: 0, statement: "Socket liga processo e transporte.",
              introducedAt: null, usedBy: [], revisitedBy: [] },
            { id: analysisB, position: 1, statement: "Endereço localiza uma ponta da comunicação.",
              introducedAt: null, usedBy: [], revisitedBy: [] }
          ],
          evidenceRequirements: [
            { id: evidenceA, position: 0, statement: "Distinguir processo e socket." },
            { id: evidenceB, position: 1, statement: "Relacionar endereço e comunicação." }
          ],
          parts: [{
            id: PART_ID,
            version: 2,
            position: 1,
            title: "Sockets",
            intent: "Construir o modelo em duas etapas.",
            microsequences: [
              { id: microA, productionPosition: 0, title: "Definição", goal: "Definir socket." },
              { id: microB, productionPosition: 1, title: "Mecanismo", goal: "Explicar o endereço." }
            ]
          }]
        }
      };
    },
    async listCourseStudyUnits() {
      return {
        items: [{
          studyUnit: { id: existingStudyUnitId, position: 1, title: "Definição legada" },
          curriculumPath: { didacticMicrosequence: { id: microA, title: "Definição" } }
        }],
        hasMore: false,
        nextCursor: null
      };
    },
    async getCourseSources({ mode }) {
      return mode === "target" ? { items: [{ sourceLinks: [] }] } : { items: [] };
    },
    async getCourseDesign({ scopeKind, scopeRef }) {
      reads.push({ scopeKind, scopeRef });
      if (scopeKind === "course") return adapter().getCourseDesign({ courseId: COURSE_ID, scopeKind });
      if (scopeRef === microB) assert.fail("o desenho da microssequência fora do alvo não deve ser lido");
      return design(microA, [analysisA], [evidenceA]);
    }
  };
  const candidate = {
    microssequencia: "Definição",
    posicao: 2,
    conteudo: {
      title: "Definição focal",
      role: "theory",
      content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Um socket liga o processo ao serviço de transporte." } }],
      response: null,
      feedback: [],
      topics: ["socket"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [],
      ideiasUtilizadas: [],
      explicacoes: [],
      praticas: [],
      cobertura: []
    },
    fontes: [],
    configuracao: {
      motivo: "A unidade focal é expositiva, curta e não contém prática; escolhas calibradas para esse contexto.",
      parametros: {
        maximo_ideias_novas_por_unidade: 1,
        formas_de_explicacao: ["plain_definition"],
        oportunidades_distintas_por_requisito: 1,
        dimensoes_de_variacao_da_pratica: ["case_or_data"],
        alvo_palavras_conversa: 80,
        alvo_palavras_unidade: 160,
        distribuicao_da_pratica: "clustered",
        posicao_da_pratica: "after_explanation",
        alvo_microssequencias_por_parte: 2,
        alvo_partes_por_lote: 1,
        frequencia_de_pausa: "each_part",
        preferencia_da_conversa: "concise"
      }
    }
  };
  const output = await executeHumanCourseTask({
    adapter: value,
    principal: PRINCIPAL,
    name: "preparar_materializacao",
    rawArguments: { curso: "Redes para iniciantes", unidades: [candidate] }
  });

  assert.equal(output.result, "A produção solicitada está coerente com o percurso e pode ser salva.");
  assert.equal(output.context.preflight.state, "ready");
  assert.deepEqual(output.context.preflight.blockers, []);
  assert.deepEqual(output.context.parte, {
    posicao: 2,
    titulo: "Sockets",
    intencao: "Construir o modelo em duas etapas."
  });
  assert.ok(reads.some(read => read.scopeKind === "didactic_microsequence" && read.scopeRef === microA));
  assert.equal(reads.some(read => read.scopeRef === microB), false);
});
test("#272 schemas, descrições e annotations distinguem leitura de escrita", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const forbidden = /^(?:id|ids|courseId|revision|version|hash|path|requestId|expectedRevision|expectedPlanVersion|cursor)$/iu;
  const forbiddenPublicCopy = /\b(?:StudyUnit|AnalysisUnit|Units?|schema|CAS|requestId|expectedRevision|expectedPlanVersion)\b/iu;
  const artificiallyCapitalized = /\b(?:Curso|Parte|Fonte|Âncora|Microssequência|Unidade de estudo|Observações)\b/u;
  const authorAsStudent = /\b(?:você (?:está começando|é iniciante|já sabe)|seu conhecimento prévio)\b/iu;
  for (const task of COURSE_HUMAN_TASKS) {
    assert.doesNotThrow(() => ajv.compile(task.inputSchema), task.name);
    assert.ok(typeof task.description === 'string' && task.description.trim().length > 0 &&
      task.description.length <= 300, task.name);
    assert.equal(task.annotations.openWorldHint, false, task.name);
    assert.equal(
      task.annotations.destructiveHint,
      ["manter_fonte", "excluir_perfil", "excluir_curso", "remover_ramo_curricular"].includes(task.name),
      task.name
    );
    assert.equal(typeof task.annotations.readOnlyHint, "boolean", task.name);
    for (const copy of [
      task.title,
      task.description,
      ...Object.values(task.inputSchema.properties || {}).map(({ description }) => description)
    ].filter(Boolean)) {
      assert.doesNotMatch(copy, forbiddenPublicCopy, `${task.name}: ${copy}`);
      assert.doesNotMatch(copy, authorAsStudent, `${task.name}: ${copy}`);
      assert.doesNotMatch(
        copy.replace(/^\P{L}*\p{L}+\b/u, ""),
        artificiallyCapitalized,
        `${task.name}: ${copy}`
      );
    }
    for (const [name, property] of Object.entries(task.inputSchema.properties || {})) {
      assert.doesNotMatch(name, forbidden, `${task.name}.${name}`);
      assert.ok(property.description?.trim().length > 0 && property.description.length <= 700, `${task.name}.${name}`);
    }
    visit(task.inputSchema, (entry, path) => {
      for (const name of Object.keys(entry.properties || {})) {
        if (name === "file_id") continue;
        const localComponentIdentity = ["id", "version"].includes(name) &&
          /\.properties\.conteudo\.properties\.(?:content\.items|response\.anyOf\[1\]|feedback\.items)$/u
            .test(path);
        if (localComponentIdentity) continue;
        if (task.name === "retomar_correcao" && path === "$.properties.recuperacao" &&
            ["courseId", "requestId"].includes(name)) continue;
        if (task.name === "decidir_observacao" && name === "id" &&
            path === "$.properties.referencia.properties.targets.items") continue;
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
    microssequencia: 1,
    explicacoes: [{ microssequencia: 1,
      conteudo: { title: "Processo e socket", content: structuredClone(content.content) }, fontes: [] }],
    unidades: [{
      microssequencia: 1,
      posicao: 1,
      conteudo: content,
      configuracao: {
    motivo: "Escolha contextual sintética deste teste.",
        parametros: {
          maximo_ideias_novas_por_unidade: 1,
          formas_de_explicacao: ["plain_definition"],
          oportunidades_distintas_por_requisito: 1,
          dimensoes_de_variacao_da_pratica: ["case_or_data"],
          alvo_palavras_conversa: 90,
          alvo_palavras_unidade: 180
        }
      },
      aplicacaoPedagogica: {
        ideiasIntroduzidas: [1],
        ideiasUtilizadas: [],
        explicacoes: [{ ideia: 1, formas: ["plain_definition"] }],
        praticas: [],
        cobertura: []
      }
    }]
  };
  assert.equal(config({ curso: "Redes" }), false);
  assert.equal(source({ curso: "Redes" }), false);
  assert.equal(components({}), true);
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
  assert.equal(corrections({
    curso: "Redes",
    correcoes: [{ unidade: 1, conteudo: content }]
  }), true, JSON.stringify(corrections.errors));
  assert.equal(corrections({
    curso: "Redes",
    correcoes: [{ unidade: 1, conteudo: { ...content, id: "unit-technical" } }]
  }), false);
});

test("materializar_parte descreve integralmente a calibração própria de uma unidade nova", () => {
  const task = COURSE_HUMAN_TASKS.find(({ name }) => name === "materializar_parte");
  const schema = task.inputSchema.properties.unidades.items.properties.configuracao;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), [
    "direcaoEditorial", "motivo", "parametros"
  ]);
  assert.deepEqual(Object.keys(schema.properties.parametros.properties).sort(),
    COURSE_DESIGN_PARAMETER_DEFINITIONS.map(({ humanField }) => humanField).sort());

  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const complete = {
    motivo: "Escolha contextual explícita e sintética.",
    parametros: {
      maximo_ideias_novas_por_unidade: 2,
      formas_de_explicacao: ["plain_definition", "mechanism"],
      oportunidades_distintas_por_requisito: 3,
      dimensoes_de_variacao_da_pratica: ["context", "support_level"],
      alvo_palavras_conversa: 80,
      alvo_palavras_unidade: 180
    },
    direcaoEditorial: "Preserve uma situação concreta ao longo da sequência."
  };
  assert.equal(validate(complete), true, JSON.stringify(validate.errors));
  for (const invalid of [
    { ...complete, mecanismoInterno: true },
    { parametros: { parametroInterno: 2 } },
    { parametros: { maximo_ideias_novas_por_unidade: 0 } },
    { parametros: { formas_de_explicacao: ["forma_inexistente"] } },
    { parametros: { oportunidades_distintas_por_requisito: 65 } },
    { parametros: { dimensoes_de_variacao_da_pratica: ["aparencia"] } },
    { parametros: { alvo_palavras_conversa: 19 } },
    { parametros: { alvo_palavras_unidade: 1001 } },
    { direcaoEditorial: null }
  ]) {
    assert.equal(validate(invalid), false, JSON.stringify(invalid));
  }
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
  for (const internal of ["score", "matched", "missing", "primaryFamilyId", "reason"]) {
    assert.equal(Object.hasOwn(discovered.context.components.candidates[0], internal), false,
      `a descoberta humana não devolve ${internal}`);
  }
  assert.equal(typeof discovered.context.components.candidates[0].finalidade, "string");
  assert.equal(Object.hasOwn(discovered.context.components.candidates[0], "limitacoes"), false,
    `as limitações integrais pertencem ao contrato selecionado`);
  assert.ok(discovered.context.components.candidates[0].avoidWhen.length > 0);
  assert.deepEqual(discovered.context.orientacao.instructions,
    courseAuthoringGuidanceForCall("consultar_componentes").instructions,
    "a consulta de componentes leva a orientação do próprio canal");

  const inspected = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: { componente: "aralearn.resource.plane@1.0.0" }
  });
  const contract = inspected.context.componentAuthoringContract;
  assert.equal(inspected.result, "Li os detalhes de uso do componente escolhido.");
  assert.equal(contract.referencia, "aralearn.resource.plane@1.0.0");
  assert.equal(contract.modeloDeInstancia.package, "plane");
  assert.equal(Object.hasOwn(contract.modeloDeInstancia, "version"), false);
  assert.equal(Object.hasOwn(contract.modeloDeInstancia, "id"), false);
  assert.equal(Object.hasOwn(contract.contrato, "example"), false,
    "o exemplo preenchido aparece uma única vez, em modeloDeInstancia.data");
  assert.deepEqual(contract.modeloDeInstancia.data,
    RESOURCE_PACKAGE_REGISTRY
      .getAuthoringContract("aralearn.resource.plane", "1.0.0").contract.example,
    "o contrato interno do registro continua completo");
  assert.deepEqual(contract.slots, ["conteudo", "feedback"]);
  assert.deepEqual(contract.compatibilidadeDeResposta, ["Escolha"]);
  assert.equal(Object.hasOwn(inspected.context, "orientacao"), false,
    "a resposta de contrato não reinjeta o guia de busca");
  assert.ok(contract.limitacoes.length > 0, "as limitações integrais ficam no contrato");
  assert.equal(contract.schema.properties.groups.items.properties.id.type, "string");
  assert.deepEqual(contract.contrato.required, ["xAxis", "yAxis"]);
  assert.match(contract.contrato.rules.join(" "), /indicativa, não exclusiva/u);
  assert.match(inspected.nextDecision, /título, função didática, recursos, resposta quando aplicável, feedback e tópicos/u);
  assert.match(inspected.nextDecision, /retorno das alternativas não substitui/u);

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

  const open = await executeHumanCourseTask({
    adapter: adapter(),
    principal: PRINCIPAL,
    name: "consultar_componentes",
    rawArguments: {
      funcao: "Pedir que a pessoa explique o mecanismo com palavras próprias, sem alternativas.",
      papel: "pratica",
      lugar: "resposta"
    }
  });
  assert.equal(open.context.components.candidates.some(item => item.referencia === "aralearn.response.open@1.0.0"), false,
    "a busca de nova autoria exclui o componente removido");
  const removed = await executeHumanCourseTask({
    adapter: adapter(), principal: PRINCIPAL, name: "consultar_componentes",
    rawArguments: { componente: "aralearn.response.open@1.0.0" }
  });
  assert.equal(removed.context.componentAuthoringContract, undefined);

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
  assert.equal(courseHumanTasksForPrincipal(READ_PRINCIPAL).length, 16);
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
  assert.equal(read.result.tools.length, 16);
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

test("#272 outputSchema tem raiz objeto e o envelope tools/list segue o protocolo MCP", async () => {
  const response = await mcpHandler()(request("tools/list"));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.id, 1, "o envelope ecoa o id JSON-RPC");
  assert.equal(Object.hasOwn(payload, "error"), false);
  assert.ok(Array.isArray(payload.result.tools) && payload.result.tools.length > 0);
  assert.equal(Object.hasOwn(payload.result, "nextCursor"), false,
    "a lista de ferramentas não usa paginação");
  assert.equal(response.headers.get("MCP-Protocol-Version"), ARALEARN_MCP_PROTOCOL_VERSION);
  const discoveryBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  assert.equal(payload.result.tools.length, 56, "contagem de tarefas na descoberta");
  assert.ok(discoveryBytes < 2 * 1024 * 1024,
    `tools/list: ${discoveryBytes} bytes, abaixo do limite de 2 MiB por resposta MCP`);
  assert.doesNotMatch(JSON.stringify(payload.result.tools),
    /rawSnapshot|PRIVATE_SENTINEL|storagePath|contentHash|actorId|Bearer|access_token|signedUrl/iu,
    "a descoberta não publica corpo privado nem credencial");

  // Spec MCP 2025-11-25: o outputSchema anunciado precisa ter raiz `type: "object"`.
  for (const tool of payload.result.tools) {
    assert.equal(tool.outputSchema?.type, "object",
      `${tool.name}: outputSchema sem type object na raiz`);
  }
  // O gerador de Actions exige o mesmo contrato de saída compartilhado pelas tarefas.
  assert.equal(
    new Set(payload.result.tools.map((tool) => JSON.stringify(tool.outputSchema))).size,
    1,
    "as tarefas compartilham o mesmo contrato de saída"
  );
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
    "Releia as fontes antes de decidir se ainda precisa incorporar o PDF."
  );
});

test("MCP apresenta falha de calibração sem narrar a maquinaria", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new AuthoringApiError(
          409,
          "human_materialization_contextual_calibration_required",
          "Uma unidade nova ainda está sem calibração contextual."
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
  const payload = await response.json();
  assert.equal(payload.result.isError, true);
  // Cliente que lê apenas o bloco textual recebe a mesma projeção pública analisável.
  assert.deepEqual(JSON.parse(payload.result.content[0].text), payload.result.structuredContent);
  assert.equal(payload.result.structuredContent.error.message,
    "Ainda há uma dependência a resolver antes desta produção.");
  assert.match(
    payload.result.structuredContent.nextDecision,
    /Resolva autonomamente.*percurso de aprendizagem/iu
  );
  // A prosa pública não narra a maquinaria; apenas o `code` público a identifica.
  const prose = [
    payload.result.structuredContent.error.message,
    ...(payload.result.structuredContent.error.recovery?.steps ?? []),
    payload.result.structuredContent.nextDecision
  ].join(" ");
  assert.doesNotMatch(
    prose,
    /human_materialization|calibra[cç][aã]o|ferramenta|campo|schema|contrato|servidor|aprovad/iu
  );
});

test("MCP preserva requisito e microssequência no blocker de prática insuficiente", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new AuthoringApiError(
          422,
          "human_materialization_preflight_blocked",
          "Resolva os bloqueios antes de produzir.",
          { preflight: {
            state: "blocked", referencia: null, completion: "complete",
            blockers: [{
              code: "human_materialization_insufficient_practice",
              message: "A prática não cumpre o mínimo para o requisito “Classificar casos de rede.”: 1 oportunidade distinta declarada; mínimo efetivo 2; faltam as dimensões de variação exigidas: Contexto.",
              microsequence: "DNS",
              requirement: "Classificar casos de rede.",
              rawSnapshot: "PRIVATE_SENTINEL"
            }]
          } }
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
  const payload = await response.json();
  const blocker = payload.result.structuredContent.error.details.preflight.blockers[0];
  assert.deepEqual(blocker, {
    code: "human_materialization_insufficient_practice",
    message: "A prática não cumpre o mínimo para o requisito “Classificar casos de rede.”: 1 oportunidade distinta declarada; mínimo efetivo 2; faltam as dimensões de variação exigidas: Contexto.",
    microsequence: "DNS",
    requirement: "Classificar casos de rede."
  });
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_SENTINEL/u);
});

test("MCP expõe bloqueadores da reconciliação inválida no SC e no texto, sem segredos", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: { ...adapter(), async listCourses() {
      throw new AuthoringApiError(422, "invalid_explanation_reconciliation",
        "A descrição pedagógica precisa corresponder integralmente à base que será salva.",
        { blockers: [{ code: "explanation_reconciliation_missing_idea",
          message: "A passagem de papel “introduced” precisa citar ao menos uma ideia do repertório.",
          entry: 1, rawSnapshot: "PRIVATE_SENTINEL" }] });
    } },
    allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
  const payload = await (await handler(request("tools/call", {
    name: "retomar_curso", arguments: { titulo: "Redes para iniciantes" }
  }))).json();
  const projection = payload.result.structuredContent;
  assert.equal(payload.result.isError, true);
  assert.equal(projection.error.code, "invalid_explanation_reconciliation");
  assert.equal(projection.error.retryable, false);
  assert.deepEqual(projection.error.details.blockers, [{ code: "explanation_reconciliation_missing_idea",
    message: "A passagem de papel “introduced” precisa citar ao menos uma ideia do repertório.", entry: 1 }]);
  // Cliente que lê apenas o texto recebe a mesma projeção analisável.
  assert.deepEqual(JSON.parse(payload.result.content[0].text), projection);
  assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_SENTINEL|rawSnapshot/u);
});

test("MCP espelha a projeção pública no content.text para o cliente que só lê o texto", async () => {
  const scenarios = [
    { label: "transitório 503 com correlação", name: "retomar_curso", args: { titulo: "Redes para iniciantes" },
      makeError: () => new AuthoringApiError(503, "network_error", "Falha transitória de conexão ao ler o curso no servidor."),
      check: projection => {
        assert.equal(projection.error.code, "temporarily_unavailable");
        assert.equal(projection.error.retryable, true);
        assert.equal(projection.error.diagnostico?.status, 503);
        assert.equal(projection.error.diagnostico?.fase, "execucao");
        assert.ok(projection.error.diagnostico?.requestId);
      } },
    { label: "preflight bloqueado com blocker real e orientação", name: "retomar_curso", args: { titulo: "Redes para iniciantes" },
      makeError: () => new AuthoringApiError(422, "human_materialization_preflight_blocked",
        "Resolva os bloqueios antes de produzir.", { preflight: { state: "blocked", referencia: null, completion: "complete",
          blockers: [{ code: "human_materialization_insufficient_practice",
            message: "A prática não cumpre o mínimo para o requisito “Classificar casos de rede.”: 1 oportunidade distinta declarada; mínimo efetivo 2.",
            microsequence: "DNS", requirement: "Classificar casos de rede.", rawSnapshot: "PRIVATE_SENTINEL" }] } }),
      check: projection => {
        assert.equal(projection.error.code, "human_materialization_preflight_blocked");
        assert.deepEqual(projection.error.details.preflight.blockers[0], {
          code: "human_materialization_insufficient_practice",
          message: "A prática não cumpre o mínimo para o requisito “Classificar casos de rede.”: 1 oportunidade distinta declarada; mínimo efetivo 2.",
          microsequence: "DNS", requirement: "Classificar casos de rede." });
        assert.match(projection.error.details.preflight.orientacao ?? "", /pendências de percurso/iu);
      } },
    { label: "escrita incerta não reaplica", name: "retomar_curso", args: { titulo: "Redes para iniciantes" },
      makeError: () => new AuthoringApiError(503, "course_write_uncertain", "A escrita pode ter ficado incerta."),
      check: projection => {
        assert.equal(projection.error.code, "course_write_uncertain");
        assert.equal(projection.error.retryable, false);
        assert.doesNotMatch(projection.nextDecision ?? "", /refaça|tente novamente/iu);
      } },
    { label: "desafio de auth preservado", name: "retomar_curso", args: { titulo: "Redes para iniciantes" },
      makeError: () => new AuthoringApiError(403, "insufficient_scope", "Escopo insuficiente."),
      challenged: true,
      check: projection => assert.equal(projection.error.code, "insufficient_scope") }
  ];
  for (const scenario of scenarios) {
    const handler = createAuthoringMcpHandler({
      adapter: { ...adapter(), async listCourses() { throw scenario.makeError(); } },
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const payload = await (await handler(request("tools/call", { name: scenario.name, arguments: scenario.args }))).json();
    const projection = payload.result.structuredContent;
    assert.deepEqual(JSON.parse(payload.result.content[0].text), projection, scenario.label);
    scenario.check(projection);
    assert.equal(Boolean(payload.result._meta?.["mcp/www_authenticate"]), Boolean(scenario.challenged), scenario.label);
    assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_SENTINEL|rawSnapshot|network_error|conexão ao servidor/iu, scenario.label);
  }
});

test("MCP compacta o texto quando o espelho excederia o limite, sem truncar o structuredContent", async () => {
  const makeBlockers = count => Array.from({ length: count }, (_, index) => ({
    code: "invalid_human_materialization",
    message: "Pendência sintética de limite.",
    microsequence: `MS-${index}`,
    passages: Array.from({ length: 12 }, () => "x".repeat(4000))
  }));
  const runWith = async count => {
    const handler = createAuthoringMcpHandler({
      adapter: { ...adapter(), async listCourses() {
        throw new AuthoringApiError(422, "human_materialization_preflight_blocked",
          "Resolva os bloqueios antes de produzir.", { preflight: {
            state: "blocked", referencia: null, completion: "complete", blockers: makeBlockers(count) } });
      } },
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const response = await handler(request("tools/call", { name: "retomar_curso", arguments: { titulo: "Redes para iniciantes" } }));
    const raw = await response.text();
    return { status: response.status, raw, body: JSON.parse(raw), bytes: new TextEncoder().encode(raw).byteLength };
  };

  // Espaço insuficiente para o espelho, mas ainda suficiente para o compacto.
  const delivered = await runWith(30);
  assert.equal(delivered.status, 200);
  const projection = delivered.body.result.structuredContent;
  const text = JSON.parse(delivered.body.result.content[0].text);
  assert.equal(delivered.body.result.isError, true);
  assert.deepEqual(Object.keys(text).sort(), ["aviso", "error", "nextDecision"]);
  assert.equal(text.error.code, projection.error.code);
  assert.equal(text.error.message, projection.error.message);
  assert.equal(text.error.retryable, projection.error.retryable);
  assert.deepEqual(text.error.diagnostico, projection.error.diagnostico);
  assert.equal(text.nextDecision, projection.nextDecision);
  assert.match(text.aviso, /limite/iu);
  assert.doesNotMatch(delivered.body.result.content[0].text, /PRIVATE_SENTINEL|rawSnapshot/u);
  // StructuredContent permanece íntegro: nenhum bloqueador truncado em silêncio.
  assert.equal(projection.error.details.preflight.blockers.length, 30);
  assert.equal(projection.error.details.preflight.blockers[0].passages.length, 12);
  assert.equal(projection.error.details.preflight.blockers[0].passages[0].length, 4000);
  // Bytes realmente entregues, com o envelope JSON-RPC, abaixo do limite do handler.
  assert.ok(delivered.bytes <= 2 * 1024 * 1024);

  // Nem o compacto cabe: o limite fica explícito, sem promessa de recuperação textual.
  const oversized = await runWith(46);
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error.data.code, "mcp_response_too_large");
  assert.equal(oversized.body.error.data.retryable, false);
  assert.equal(Object.hasOwn(oversized.body, "result"), false);
  assert.doesNotMatch(oversized.raw, /aviso|projeção completa/iu);
  assert.ok(oversized.bytes <= 2 * 1024 * 1024);
});

test("MCP mede o envelope JSON-RPC: id longo ainda recebe o texto compacto", async () => {
  const LIMIT = 2 * 1024 * 1024;
  const ENVELOPE_PREFIX = '{"jsonrpc":"2.0","id":';
  const id = "req-" + "x".repeat(5000);
  const idJson = JSON.stringify(id);
  const fullBlockers = count => Array.from({ length: count }, (_, index) => ({
    code: "invalid_human_materialization", message: "Pendência sintética de limite.",
    microsequence: `MS-${index}`, passages: Array.from({ length: 12 }, () => "x".repeat(4000))
  }));
  const run = async tunerLen => {
    const blockers = fullBlockers(21);
    if (tunerLen > 0) {
      const passages = Array.from({ length: Math.floor(tunerLen / 4000) }, () => "x".repeat(4000));
      const rest = tunerLen % 4000;
      if (rest > 0) passages.push("x".repeat(rest));
      blockers.push({ code: "invalid_human_materialization", message: "Ajuste de limite.",
        microsequence: "MS-tuner", passages });
    }
    const handler = createAuthoringMcpHandler({
      adapter: { ...adapter(), async listCourses() {
        throw new AuthoringApiError(422, "human_materialization_preflight_blocked",
          "Resolva os bloqueios antes de produzir.", { preflight: {
            state: "blocked", referencia: null, completion: "complete", blockers } });
      } },
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const body = JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call",
      params: { name: "retomar_curso", arguments: { titulo: "Redes para iniciantes" } } });
    const response = await handler(new Request(RESOURCE_URL, { method: "POST", headers: {
      Origin: ORIGIN, Authorization: "Bearer token", Accept: "application/json, text/event-stream",
      "Content-Type": "application/json", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION }, body }));
    const raw = await response.text();
    return { status: response.status, raw, payload: JSON.parse(raw) };
  };
  // Tamanhos exatamente como o produto os serializa, a partir do structuredContent íntegro.
  const projectedSize = sc => {
    const mirror = JSON.stringify({ content: [{ type: "text", text: JSON.stringify(sc) }],
      structuredContent: sc, isError: true });
    const envelope = ENVELOPE_PREFIX + idJson + ',"result":' + mirror + "}";
    return { resultBytes: new TextEncoder().encode(mirror).byteLength,
      envelopeBytes: new TextEncoder().encode(envelope).byteLength };
  };

  const probe = await run(1);
  assert.equal(probe.status, 200);
  const base = projectedSize(probe.payload.result.structuredContent);
  const delta = Math.max(0, Math.ceil((LIMIT + 200 - base.envelopeBytes) / 2));
  const tuned = await run(1 + delta);
  const sc = tuned.payload.result.structuredContent;
  const sizes = projectedSize(sc);
  assert.ok(sizes.resultBytes <= LIMIT, "o espelho sozinho caberia no limite");
  assert.ok(sizes.envelopeBytes > LIMIT, "apenas o envelope JSON-RPC excede o limite");
  assert.equal(tuned.status, 200, "a guarda mede o envelope e compacta em vez de recusar");
  assert.equal(tuned.payload.id, id, "o id longo é preservado");
  assert.equal(tuned.payload.error, undefined, "não houve falha de transporte");
  const text = JSON.parse(tuned.payload.result.content[0].text);
  assert.deepEqual(Object.keys(text).sort(), ["aviso", "error", "nextDecision"]);
  assert.equal(text.error.code, sc.error.code);
  assert.equal(text.error.retryable, sc.error.retryable);
  assert.deepEqual(text.error.diagnostico, sc.error.diagnostico);
  assert.equal(text.nextDecision, sc.nextDecision);
  assert.match(text.aviso, /limite/iu);
  assert.equal(sc.error.details.preflight.blockers.length, 22);
  assert.ok(new TextEncoder().encode(tuned.raw).byteLength <= LIMIT, "bytes entregues sob o limite");
});

test("MCP distingue recusa de acesso da autenticação e do escopo OAuth", async () => {
  for (const [status, code, challenged] of [
    [403, "not_authorized", false],
    [403, "origin_not_allowed", false],
    [403, "insufficient_scope", true],
    [401, "authentication_required", true]
  ]) {
    const handler = createAuthoringMcpHandler({
      adapter: { ...adapter(), async listCourses() {
        throw new AuthoringApiError(status, code, "Recusa sintética.");
      } },
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const response = await handler(request("tools/call", {
      name: "copiar_curso", arguments: { curso: "Redes para iniciantes", titulo: "Cópia sintética" }
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error.code, code);
    assert.equal(Boolean(payload.result._meta?.["mcp/www_authenticate"]), challenged, code);
  }
});

test("MCP reduz falha transitória de leitura a impacto e retomada sem expor transporte", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new AuthoringApiError(
          503,
          "network_error",
          "Falha transitória de conexão ao ler o curso no servidor."
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
  const payload = await response.json();
  const publicText = [
    payload.result.content[0].text,
    payload.result.structuredContent.error.message,
    payload.result.structuredContent.nextDecision
  ].join(" ");
  const completeProjection = JSON.stringify(payload.result);

  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.error.retryable, true);
  assert.equal(payload.result.structuredContent.error.code, "temporarily_unavailable");
  assert.equal(payload.result.structuredContent.error.message, "Não consegui concluir esta etapa.");
  assert.deepEqual(JSON.parse(payload.result.content[0].text), payload.result.structuredContent);
  assert.match(publicText, /Refaça a mesma etapa em silêncio, sem mudar a intenção/iu);
  assert.doesNotMatch(
    completeProjection,
    /network_error|conexão|escrita|confirmação|servidor|ferramenta|schema|contrato/iu
  );
  // A correlação pública é deliberada e limitada: só identificador, fase e status.
  assert.deepEqual(
    Object.keys(payload.result.structuredContent.error.diagnostico).sort(),
    ["fase", "requestId", "status"]
  );
  assert.match(
    payload.result.structuredContent.error.diagnostico.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
  );
  assert.equal(payload.result.structuredContent.error.diagnostico.fase, "execucao");
  assert.equal(payload.result.structuredContent.error.diagnostico.status, 503);
});

test("MCP sanitiza também a falha transitória que sai pelo transporte HTTP", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new AuthoringApiError(
          429,
          "rate_limit_transport",
          "Falha transitória de conexão ao ler o curso no servidor."
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
  const payload = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(payload.error.message, "Não consegui concluir esta etapa.");
  assert.equal(payload.error.data.code, "temporarily_unavailable");
  assert.equal(
    payload.error.data.nextDecision,
    "Refaça a mesma etapa em silêncio, sem mudar a intenção."
  );
  assert.doesNotMatch(
    JSON.stringify(payload),
    /rate_limit_transport|network_error|conexão|escrita|confirmação|servidor|ferramenta|schema|contrato/iu
  );
  assert.deepEqual(
    Object.keys(payload.error.data).sort(),
    ["code", "fase", "nextDecision", "requestId", "retryable", "status"],
    "o envelope de transporte expõe só a correlação pública"
  );
  assert.equal(payload.id, 1, "o id JSON-RPC é preservado na falha de transporte");
  assert.equal(payload.error.data.retryable, true, "429 é repetível");
});

test("falha transitória do JWKS na resolução do principal vira erro de ferramenta com id e correlação", async () => {
  let toolDispatches = 0;
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        toolDispatches += 1;
        throw new Error("a ferramenta não deveria executar");
      },
      async resolvePrincipal() {
        throw new AuthoringApiError(
          503,
          "oauth_verification_unavailable",
          "Não foi possível verificar o access token OAuth."
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
  const payload = await response.json();

  assert.equal(response.status, 200, "dependência transitória devolve envelope de ferramenta");
  assert.equal(payload.jsonrpc, "2.0");
  assert.equal(payload.id, 1, "o id JSON-RPC sobrevive à falha da dependência");
  assert.equal(payload.result.isError, true);
  const publicError = payload.result.structuredContent.error;
  assert.equal(publicError.code, "temporarily_unavailable");
  assert.equal(publicError.message, "Não consegui concluir esta etapa.");
  assert.equal(publicError.retryable, true, "503 transitório é repetível");
  assert.deepEqual(
    Object.keys(publicError.diagnostico).sort(),
    ["fase", "requestId", "status"],
    "o diagnóstico público expõe só a correlação"
  );
  assert.equal(publicError.diagnostico.fase, "autenticacao", "o rótulo de fase permanece o de diagnóstico");
  assert.equal(publicError.diagnostico.status, 503);
  assert.equal(
    response.headers.get("X-AraLearn-Request-Id"),
    publicError.diagnostico.requestId,
    "o cabeçalho ecoa a correlação devolvida no corpo"
  );
  const mirrored = JSON.parse(payload.result.content[0].text);
  assert.equal(mirrored.error.code, "temporarily_unavailable", "o texto espelha o erro público");
  assert.equal(toolDispatches, 0, "nenhuma ferramenta é executada");
  assert.doesNotMatch(JSON.stringify(payload), /Bearer|token OAuth|\.well-known|JWKS/iu);
});

test("verificador real com JWKS abortado ou 5xx vira erro de ferramenta sem executar a tarefa", async () => {
  const { SupabaseOAuthJwtVerifier } = await import(
    "../../supabase/functions/_shared/aralearn-authoring/oauthJwtVerifier.js");
  const segment = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${segment({ alg: "ES256", typ: "JWT", kid: "kid-jwks-test" })}.` +
    `${segment({ sub: "pairwise-subject-test", iat: 1, exp: 9_999_999_999 })}.${"A".repeat(86)}`;
  const hangingJwks = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  const stubs = [hangingJwks, async () => new Response("", { status: 500 })];
  for (const [index, fetchImpl] of stubs.entries()) {
    const verifier = new SupabaseOAuthJwtVerifier({
      issuer: "https://project.example/auth/v1", fetchImpl, requestTimeoutMs: 20,
      maxAttempts: 3, retryBackoffMs: 0, sleep: () => Promise.resolve()
    });
    let principalCalls = 0;
    let toolDispatches = 0;
    const handler = createAuthoringMcpHandler({
      adapter: {
        async resolvePrincipal(authentication, options) {
          principalCalls += 1;
          return verifier.verify(authentication.credential, options);
        },
        async listCourses() {
          toolDispatches += 1;
          throw new Error("a ferramenta não deveria executar");
        }
      },
      allowedOrigins: new Set([ORIGIN]),
      resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const logs = [];
    const original = console.error;
    console.error = (line) => { logs.push(String(line)); };
    let response;
    try {
      response = await handler(new Request(RESOURCE_URL, {
        method: "POST",
        headers: {
          Origin: ORIGIN, Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream", "Content-Type": "application/json",
          "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: index === 0 ? 0 : "s-id",
          method: "tools/call", params: { name: "retomar_curso", arguments: { titulo: "Redes" } } })
      }));
    } finally { console.error = original; }
    const payload = await response.json();
    assert.equal(response.status, 200, `stub ${index}: erro de ferramenta`);
    assert.equal(payload.id, index === 0 ? 0 : "s-id", `stub ${index}: id preservado`);
    assert.equal(payload.error, undefined, `stub ${index}: sem envelope de transporte`);
    assert.equal(payload.result.isError, true);
    const publicError = payload.result.structuredContent.error;
    assert.equal(publicError.code, "temporarily_unavailable");
    assert.equal(publicError.diagnostico.fase, "autenticacao");
    assert.equal(publicError.diagnostico.status, 503);
    assert.equal(principalCalls, 1, `stub ${index}: principal tentado uma vez`);
    assert.equal(toolDispatches, 0, `stub ${index}: ferramenta não executada`);
    const joined = logs.join("\n");
    assert.match(joined, /oauth_verification_unavailable/u);
    assert.doesNotMatch(joined, /Bearer|\.well-known|jwks/iu, `stub ${index}: log sem URL/credencial`);
  }
});

test("recupera na chamada seguinte com JWKS e JWT válidos sem reutilizar chave inválida", async () => {
  const { SupabaseOAuthJwtVerifier } = await import(
    "../../supabase/functions/_shared/aralearn-authoring/oauthJwtVerifier.js");
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = { ...publicKey.export({ format: "jwk" }), alg: "ES256", kid: "key-ok",
    key_ops: ["verify"], use: "sig" };
  const base64urlJson = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${base64urlJson({ alg: "ES256", kid: "key-ok", typ: "JWT" })}.` +
    `${base64urlJson({ iss: "https://project.example/auth/v1", sub: "10000000-0000-4000-8000-000000000001" })}`;
  const signer = createSign("SHA256");
  signer.update(input);
  signer.end();
  const token = `${input}.${signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;

  let jwksState = "abort";
  let jwksCalls = 0;
  const verifier = new SupabaseOAuthJwtVerifier({
    issuer: "https://project.example/auth/v1",
    fetchImpl: (_url, init) => {
      jwksCalls += 1;
      if (jwksState === "abort") {
        return new Promise((_resolve, reject) => init.signal.addEventListener("abort",
          () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      }
      return new Response(JSON.stringify({ keys: [jwk] }),
        { status: 200, headers: { "Content-Type": "application/json" } });
    },
    requestTimeoutMs: 20, maxAttempts: 3, retryBackoffMs: 0, sleep: () => Promise.resolve()
  });
  const baseAdapter = adapter();
  const originalListCourses = baseAdapter.listCourses.bind(baseAdapter);
  let toolDispatches = 0;
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...baseAdapter,
      async resolvePrincipal(authentication, options) {
        const claims = await verifier.verify(authentication.credential, options);
        return { actorId: claims.sub, authenticationKind: "oauth",
          scopes: ["authoring:read", "authoring:write"] };
      },
      async listCourses(args) {
        toolDispatches += 1;
        return originalListCourses(args);
      }
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
  const call = (id) => handler(new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN, Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream", "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call",
      params: { name: "retomar_curso", arguments: { titulo: "Redes para iniciantes" } } })
  }));

  const failed = await call(21);
  const failedPayload = await failed.json();
  assert.equal(failed.status, 200, "a falha transitória vira erro de ferramenta");
  assert.equal(failedPayload.result.isError, true);
  assert.equal(failedPayload.result.structuredContent.error.code, "temporarily_unavailable");
  assert.equal(failedPayload.result.structuredContent.error.diagnostico.fase, "autenticacao");
  assert.equal(toolDispatches, 0, "a tarefa não executa na falha");
  const callsAfterFailure = jwksCalls;

  jwksState = "ok";
  const recovered = await call(22);
  const recoveredPayload = await recovered.json();
  assert.equal(recovered.status, 200);
  assert.equal(recoveredPayload.id, 22);
  assert.equal(recoveredPayload.error, undefined, "a recuperação devolve resultado de domínio");
  assert.notEqual(recoveredPayload.result?.isError, true);
  assert.equal(toolDispatches, 1, "a tarefa executa exatamente uma vez");
  assert.ok(jwksCalls > callsAfterFailure, "o JWKS é relido em vez de reutilizar chave inválida");
});

test("JWKS transitório fora do envelope válido mantém o contrato de transporte", async () => {
  const base = {
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  };
  const cases = [
    ["protocolo divergente", "tools/call", { name: "retomar_curso", arguments: { titulo: "Redes" } }, { "MCP-Protocol-Version": "1999-01-01" }, 9, 503, -32000, "temporarily_unavailable"],
    ["arguments não é objeto", "tools/call", { name: "retomar_curso", arguments: 3 }, {}, 9, 503, -32000, "temporarily_unavailable"],
    ["fora do catálogo", "tools/call", { name: "nao_existe", arguments: {} }, {}, 9, 503, -32000, "temporarily_unavailable"],
    ["método tools/list", "tools/list", {}, {}, 9, 503, -32000, "temporarily_unavailable"],
    ["método initialize", "initialize", {}, {}, 9, 503, -32000, "temporarily_unavailable"],
    ["id nulo é recusado antes do principal", "tools/call", { name: "retomar_curso", arguments: { titulo: "Redes" } }, {}, null, 400, -32600, "invalid_json_rpc"]
  ];
  for (const [label, method, params, extraHeaders, id, status, rpcCode, dataCode] of cases) {
    const handler = createAuthoringMcpHandler({
      adapter: {
        ...adapter(),
        async resolvePrincipal() {
          throw new AuthoringApiError(503, "oauth_verification_unavailable", "JWKS indisponível.");
        }
      },
      ...base
    });
    const response = await handler(new Request(RESOURCE_URL, {
      method: "POST",
      headers: {
        Origin: ORIGIN, Authorization: "Bearer token", Accept: "application/json, text/event-stream",
        "Content-Type": "application/json", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
        ...extraHeaders
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
    }));
    const payload = await response.json();
    assert.equal(response.status, status, label);
    assert.equal(payload.id, id, label);
    assert.equal(payload.error.code, rpcCode, label);
    assert.equal(payload.result, undefined, `${label}: sem envelope de ferramenta`);
    assert.equal(payload.error.data.code, dataCode, label);
  }
});

test("transporte MCP distingue parse, requisição inválida, autorização e indisponibilidade", async () => {
  const base = {
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  };
  const post = (body, headers = {}) => new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN, Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
      ...headers
    },
    body
  });

  const parseResponse = await mcpHandler()(post("{não é json"));
  const parsePayload = await parseResponse.json();
  assert.equal(parseResponse.status, 400);
  assert.equal(parsePayload.error.code, -32700, "parse inválido é -32700");
  assert.equal(parsePayload.error.data.code, "parse_error");
  assert.equal(parsePayload.error.data.retryable, false, "parse inválido não é repetível");
  assert.equal(Object.hasOwn(parsePayload.error.data, "nextDecision"), false);

  const invalidResponse = await mcpHandler()(post(JSON.stringify({
    jsonrpc: "1.0", id: 1, method: "tools/list"
  })));
  const invalidPayload = await invalidResponse.json();
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidPayload.error.code, -32600, "requisição inválida é -32600");
  assert.equal(invalidPayload.error.data.code, "invalid_json_rpc");
  assert.equal(invalidPayload.error.data.retryable, false, "entrada inválida não é repetível");
  assert.equal(Object.hasOwn(invalidPayload.error.data, "nextDecision"), false,
    "requisição inválida não recebe orientação de repetição");

  const protocolResponse = await mcpHandler()(post(JSON.stringify({
    jsonrpc: "2.0", id: 2, method: "tools/list", params: {}
  }), { "MCP-Protocol-Version": "1999-01-01" }));
  const protocolPayload = await protocolResponse.json();
  assert.equal(protocolResponse.status, 400);
  assert.equal(protocolPayload.error.code, -32600, "protocolo inválido é -32600");
  assert.equal(protocolPayload.error.data.code, "unsupported_protocol_version");
  assert.equal(protocolPayload.error.data.retryable, false, "protocolo inválido não é repetível");

  const denied = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async resolvePrincipal() {
        throw new AuthoringApiError(401, "invalid_oauth_token", "O access token OAuth é inválido.");
      }
    },
    ...base
  });
  const deniedResponse = await denied(post(JSON.stringify({
    jsonrpc: "2.0", id: 3, method: "tools/list", params: {}
  })));
  const deniedPayload = await deniedResponse.json();
  assert.equal(deniedResponse.status, 401);
  assert.equal(deniedPayload.error.code, -32001, "recusa de autorização tem código próprio");
  assert.equal(deniedPayload.error.data.code, "invalid_oauth_token");
  assert.equal(deniedPayload.error.data.retryable, false, "recusa de autorização não é repetível");
  assert.match(deniedResponse.headers.get("WWW-Authenticate") ?? "", /^Bearer /u);
  assert.equal(Object.hasOwn(deniedPayload.error.data, "nextDecision"), false);

  const unavailable = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async resolvePrincipal() {
        throw new AuthoringApiError(503, "oauth_verification_unavailable", "JWKS indisponível.");
      }
    },
    ...base
  });
  const unavailableResponse = await unavailable(post(JSON.stringify({
    jsonrpc: "2.0", id: 4, method: "tools/list", params: {}
  })));
  const unavailablePayload = await unavailableResponse.json();
  assert.equal(unavailableResponse.status, 503);
  assert.equal(unavailablePayload.error.code, -32000, "indisponibilidade é -32000, não -32603");
  assert.equal(unavailablePayload.error.data.code, "temporarily_unavailable");
  assert.equal(unavailablePayload.error.data.retryable, true, "indisponibilidade transitória é repetível");
  assert.equal(unavailablePayload.error.data.status, 503);
  assert.match(unavailablePayload.error.data.nextDecision ?? "", /Refaça a mesma etapa/iu);
});

test("log interno não expõe o id JSON-RPC nem credenciais", async () => {
  const secretId = "id-secreto-8f2c1a4e-nao-logar";
  const logs = [];
  const original = console.error;
  console.error = (line) => { logs.push(String(line)); };
  try {
    const handler = createAuthoringMcpHandler({
      adapter: {
        ...adapter(),
        async resolvePrincipal() {
          throw new AuthoringApiError(503, "oauth_verification_unavailable", "JWKS indisponível.");
        }
      },
      allowedOrigins: new Set([ORIGIN]),
      resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    });
    const response = await handler(new Request(RESOURCE_URL, {
      method: "POST",
      headers: {
        Origin: ORIGIN, Authorization: "Bearer token-sintetico",
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: secretId, method: "tools/call",
        params: { name: "retomar_curso", arguments: { titulo: "Redes para iniciantes" } }
      })
    }));
    const payload = await response.json();

    assert.equal(payload.id, secretId, "a resposta ecoa o id recebido");
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error.code, "temporarily_unavailable");
    assert.ok(logs.length > 0, "a falha transitória precisa aparecer no log");
    const joined = logs.join("\n");
    assert.match(joined, /aralearn\.authoring\.error/u);
    assert.match(joined, /oauth_verification_unavailable/u, "o log carrega o código interno específico");
    assert.doesNotMatch(joined, /id-secreto-8f2c1a4e|nao-logar/u, "o id bruto não vai ao log");
    assert.doesNotMatch(joined, /token-sintetico|Bearer/u, "a credencial não vai ao log");
  } finally {
    console.error = original;
  }
});

test("log interno aceita somente valores do vocabulário fechado", async () => {
  const logs = [];
  const original = console.error;
  console.error = (line) => { logs.push(String(line)); };
  try {
    const handler = createAuthoringMcpHandler({
      adapter: {
        ...adapter(),
        async listCourses() {
          throw new AuthoringApiError(503, "SEGREDO-CODIGO-999", "Falha sintética.");
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
    const payload = await response.json();

    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error.retryable, true);
    assert.equal(logs.length, 1, "uma falha transitória gera um único evento");
    const record = JSON.parse(logs[0]);
    assert.deepEqual(Object.keys(record).sort(), [
      "classe", "code", "duracaoMs", "event", "fase", "requestId", "status", "tool"
    ], "o evento expõe somente os campos fechados");
    assert.equal(record.event, "aralearn.authoring.error");
    assert.equal(record.code, "unclassified", "código fora do vocabulário vira literal fixo");
    assert.equal(record.classe, "transitorio");
    assert.equal(record.fase, "execucao");
    assert.equal(record.status, 503);
    assert.equal(record.tool, "retomar_curso", "a ferramenta é o nome do catálogo");
    assert.match(record.requestId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.doesNotMatch(logs[0], /SEGREDO|Falha sintética|Redes para iniciantes|Bearer/iu,
      "entrada do cliente e mensagem não são refletidas");

    logs.length = 0;
    const unknown = await mcpHandler()(request("tools/call", {
      name: "retomar_curso-SEGREDO", arguments: { titulo: "Redes para iniciantes" }
    }));
    const unknownPayload = await unknown.json();
    assert.equal(unknownPayload.error.code, -32602);
    assert.equal(logs.length, 0, "nome fora do catálogo não chega ao sink");
  } finally {
    console.error = original;
  }
});

test("falha interna inesperada não vira indisponibilidade temporária", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async listCourses() {
        throw new Error("defeito sintético interno");
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
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.error.code, "internal_error");
  assert.equal(payload.result.structuredContent.error.retryable, false);
  assert.equal(payload.result.structuredContent.nextDecision, null);
  assert.doesNotMatch(JSON.stringify(payload), /defeito sintético|temporarily_unavailable/iu);
});

test("falha interna antes do dispatch mantém 500 e não se apresenta como temporária", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      ...adapter(),
      async resolvePrincipal() {
        throw new Error("defeito sintético de vínculo");
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
  const payload = await response.json();

  assert.equal(response.status, 500);
  assert.equal(payload.id, 1);
  assert.equal(payload.error.data.code, "internal_error");
  assert.equal(Object.hasOwn(payload.error.data, "nextDecision"), false);
  assert.equal(payload.error.data.retryable, false, "falha interna não é automaticamente temporária");
  assert.equal(payload.error.data.fase, "resolucao_principal");
  assert.equal(payload.error.data.status, 500);
  assert.doesNotMatch(JSON.stringify(payload), /defeito sintético/iu);
});

test("chamada MCP bem-sucedida ecoa o identificador de correlação no cabeçalho", async () => {
  const response = await mcpHandler()(request("tools/call", {
    name: "retomar_curso",
    arguments: { titulo: "Redes para iniciantes" }
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, false);
  assert.match(
    response.headers.get("X-AraLearn-Request-Id"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
  );
  assert.equal(Object.hasOwn(payload.result.structuredContent, "diagnostico"), false,
    "o envelope de sucesso não ganha diagnóstico");
});

test("#272 structuredContent de sucesso e de erro conforma o outputSchema anunciado", async () => {
  const toolName = "retomar_curso";
  const listed = await (await mcpHandler()(request("tools/list"))).json();
  const announced = listed.result.tools.find(({ name }) => name === toolName);
  assert.ok(announced?.outputSchema, "tools/list precisa anunciar outputSchema");
  assert.deepEqual(
    announced.outputSchema,
    COURSE_HUMAN_TASKS.find(({ name }) => name === toolName).outputSchema,
    "o schema anunciado é o mesmo do catálogo humano"
  );
  const validate = new Ajv2020({ allErrors: true, strict: false })
    .compile(announced.outputSchema);

  const cases = [
    ["sucesso", null],
    ["entrada", new AuthoringApiError(422, "invalid_human_task_arguments", "Argumento inválido.")],
    ["transitorio", new AuthoringApiError(503, "network_error", "Falha transitória de conexão.")],
    ["conflito", new AuthoringApiError(409, "human_read_context_changed", "A base mudou.")],
    ["interno", new Error("defeito sintético")]
  ];
  for (const [label, thrown] of cases) {
    const handler = thrown == null
      ? mcpHandler()
      : createAuthoringMcpHandler({
        adapter: { ...adapter(), async listCourses() { throw thrown; } },
        allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
        authorizationServer: "https://project.example/auth/v1"
      });
    const response = await handler(request("tools/call", {
      name: toolName, arguments: { titulo: "Redes para iniciantes" }
    }));
    const payload = await response.json();
    assert.equal(payload.result.isError, thrown != null, label);
    assert.equal(
      validate(payload.result.structuredContent),
      true,
      `${label}: structuredContent fora do outputSchema: ${JSON.stringify(validate.errors)}`
    );
  }
  assert.equal(
    validate({ error: { code: "sem_nextDecision" } }),
    false,
    "o validador precisa recusar um envelope de erro incompleto (controle negativo)"
  );
  assert.equal(
    validate({ result: "ok", deepLink: null, nextDecision: null,
      error: { code: "x", message: "y", retryable: true } }),
    false,
    "o contrato recusa um envelope que satisfaz sucesso e erro ao mesmo tempo"
  );
});

test("MCP conserva a tentativa de criação incerta e não recomenda outra escrita", async () => {
  const writes = [];
  const handler = createAuthoringMcpHandler({
    adapter: { ...adapter(), async createCourse(input) {
      writes.push(structuredClone(input));
      throw new AuthoringApiError(503, "network_error", "Resposta de gravação perdida.");
    } },
    allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
    authorizationServer: "https://project.example/auth/v1"
  });
  const response = await handler(request("tools/call", {
    name: "criar_curso", arguments: { titulo: "Novo curso", objetivo: "Ensinar redes." }
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.error.code, "course_write_uncertain");
  assert.equal(payload.result.structuredContent.error.retryable, false);
  assert.match(payload.result.structuredContent.error.message, /mesma tentativa/iu);
  assert.doesNotMatch(payload.result.structuredContent.nextDecision ?? "", /refaça|tente novamente/iu);
  assert.equal(writes.length, 2, "a recuperação transacional é limitada ao replay suportado");
  assert.deepEqual(writes[1], writes[0], "o replay não cria uma nova identidade ou intenção");
});

test("chamada MCP entrega o deep link como link Markdown sem expor estado técnico", async () => {
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
  assert.match(payload.result.structuredContent.deepLink, new RegExp(
    `^https://app\\.example/#/authoring/courses/${COURSE_ID}\\?section=planning`,
    "u"
  ));
  assert.ok(
    payload.result.content[0].text.includes(
      `[Abrir no AraLearn](${payload.result.structuredContent.deepLink})`
    )
  );
  const serializedContext = JSON.stringify(payload.result.structuredContent.context);
  assert.doesNotMatch(serializedContext, /courseId|requestId|revision|version|hash|path|resultFacts/iu);
  assert.equal(payload.result.structuredContent.context.preferenciasPessoais.foco, "full_cycle");
  assert.equal(payload.result.structuredContent.context.processoCorrente.cadencia, "part");
  assert.equal(typeof payload.result.structuredContent.context.referenciaProcesso, "string");
  assert.equal(Object.hasOwn(payload.result.structuredContent.context, "observations"), false);

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
    authors: [],
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
          studyUnit: { id: "unit-one", title: "Unidade um", version: 4,
            content: [{ id: "source-p", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Trecho A" } }] }
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
              linkId: "link-other",
              sourceId: "source-other",
              relation: "supported_by",
              roles: ["technical_conceptual"],
              occurrences: [],
              anchors: [{ anchorId: "anchor-other" }]
            }]
          }],
          nextCursor: null
        };
      }
      return { items: sources, nextCursor: null };
    },
    async executeCourseSourceCommand(value) {
      const batch = structuredClone(value.command.type === "apply_source_bundle"
        ? value.command.commands : [value.command]);
      sourceCommands.push(...batch);
      for (const entry of batch) {
        if (entry.type === "save_source" &&
            !sources.some(({ sourceId }) => sourceId === entry.sourceId)) {
          sources.push({
            sourceId: entry.sourceId,
            revision: 1,
            ...structuredClone(entry.source),
            anchors: []
          });
        }
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
      metadados: {
        tipo: "document",
        titulo: "Manual duplicado",
        papeisSugeridos: ["tecnica_conceitual"]
      }
    }
  });
  assert.match(created.result, /Atualizei a fonte/u);
  assert.equal(sourceCommands[0].type, "save_source");
  assert.notEqual(sourceCommands[0].sourceId, "source-existing-a");
  assert.equal(sourceCommands[0].source.verificationStatus, "unverified");
  assert.equal(sourceCommands[0].source.origin, "external");

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
        papeis: ["tecnica_conceitual"],
        ancoras: ["Seção 4.2"],
        ocorrencias: [{ lugar: "conteudo", recurso: 1, trecho: "Trecho A" }]
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
  const removeRequests = [];
  const recoveryOrder = [];
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
      if (removeAttempts > 0) recoveryOrder.push("read");
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
    async executeCourseSourceCommand(input) {
      const { command } = input;
      assert.equal(command.type, "remove_pdf");
      removeRequests.push(structuredClone(input));
      recoveryOrder.push("commit");
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
    (error) => error.code === "course_write_uncertain" &&
      error.details.requestId === removeRequests[0].requestId);
  assert.equal(removeAttempts, 2, "o replay interno conserva a mesma retirada");
  assert.deepEqual(removeRequests[1], removeRequests[0], "o replay preserva identidade, versão e arquivo");
  assert.ok(recoveryOrder.slice(1, -1).includes("read"), "o replay ocorre depois da releitura");
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
  // Exatamente uma ramificação, expressa por implicações na raiz legível.
  assert.equal(pdfTask.inputSchema.oneOf, undefined);
  assert.deepEqual(pdfTask.inputSchema.allOf, [
    { if: { required: ["fonte"] }, then: { not: { required: ["titulo", "papeisSugeridos"] } } },
    { if: { not: { required: ["fonte"] } }, then: { required: ["titulo", "papeisSugeridos"] } }
  ]);
  assert.deepEqual(pdfTask.inputSchema.properties.papeisSugeridos.items.enum, [
    "escopo_curricular", "evidencia_de_avaliacao", "tecnica_conceitual", "leitura_complementar"
  ]);
  assert.match(pdfTask.description, /guardar PDF/u);
  assert.match(pdfTask.inputSchema.properties.fonte.description, /fonte existente/u);
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
    papeisSugeridos: ["tecnica_conceitual"],
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
      papeisSugeridos: ["tecnica_conceitual"],
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
  assert.equal(ingestions[0].sourceIntent.source.origin, "author_provided");
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
      papeisSugeridos: ["tecnica_conceitual"],
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
            defaultRoles: ["technical_conceptual"],
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
  assert.match(serialized, /"papeisSugeridos":\["tecnica_conceitual"\]/u);
  assert.doesNotMatch(serialized, /defaultRoles|technical_conceptual/u);
  assert.doesNotMatch(serialized, /steps|payload|requestId|runs|duration|materialization|hash/iu);
  assert.doesNotMatch(serialized, /guidance|authoring-guidance|instructions/iu);
});

test("uma fonte extensa continua recuperável por fragmentos literais limitados", async () => {
  const output = await executeHumanCourseTask({
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
  });
  assert.equal(output.context.fragmento.formato, 'application/json');
  assert.ok(output.context.fragmento.total > 522_000);
  assert.ok(JSON.stringify(output).length < 100_000);
  assert.equal(output.context.temMais, true);
  assert.equal(typeof output.context.continuacao, 'string');
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
      condicao: "automatica",
      parametros: {
        maximo_ideias_novas_por_unidade: 2,
        formas_de_explicacao: ["forma-inexistente"]
      }
    }
  }), (error) => typeof error.code === "string");
  assert.equal(writes, 0);
});

test("fixação explícita configura o foco, condição de pesquisa prevalece e Observações são focais", async () => {
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
        .filter(({ type, parameterId }) => type === "set_parameter" &&
          parameterId === "new_analysis_unit_ceiling_per_expository_study_unit")
        .at(-1);
      return {
        definitions: [{
          id: "new_analysis_unit_ceiling_per_expository_study_unit",
          label: "Novas unidades de análise",
          humanField: "maximo_ideias_novas_por_unidade", unitLabel: "ideias novas por unidade"
        }],
        parameters: [{
          parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
          localAssignment: currentParameter ? {
            mode: "fixed",
            value: currentParameter.value,
            origin: currentParameter.origin,
            reason: currentParameter.reason
          } : null,
          effectiveAssignment: {
            mode: currentParameter ? "fixed" : "automatic",
            value: currentParameter?.value ?? null,
            inherited: false,
            origin: currentParameter?.origin ?? "system_default",
            reason: currentParameter?.reason ?? "Ainda sem calibração contextual.",
            sourceScope: currentParameter?.scope ?? null
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
      condicao: "fixada_pelo_autor",
      parametros: { maximo_ideias_novas_por_unidade: 1,
        alvo_palavras_conversa: 75,
        alvo_palavras_unidade: 190
      },
      direcaoEditorial: "Use títulos informativos; crie mais unidades se necessário."
    }
  });
  assert.deepEqual(designCommands.map(({ type }) => type), [
    "set_parameter", "set_parameter", "set_parameter", "set_guidance"
  ]);
  assert.equal(designCommands.every(({ origin }) => origin === "author"), true);
  assert.deepEqual(designCommands.slice(1, 3).map(({ parameterId, value }) => ({
    parameterId,
    value
  })), [{
    parameterId: "authoring_chat_response_word_target",
    value: 75
  }, {
    parameterId: "study_unit_content_word_target",
    value: 190
  }]);
  assert.doesNotMatch(JSON.stringify(configured.context), /definitions|componentCatalog|recentApplications/u);

  const calibratedMicrosequence = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      microssequencia: "Sockets",
      condicao: "fixada_pelo_autor",
      parametros: { maximo_ideias_novas_por_unidade: 2 }
    }
  });
  assert.deepEqual(designCommands.at(-1), {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-sockets" },
    parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
    value: 2,
    origin: "author",
    reason: "Condição fixada explicitamente pela pessoa autora."
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
      campo: "maximo_ideias_novas_por_unidade", unidade: "ideias novas por unidade",
      valorLocal: 2,
      valorEfetivo: 2,
      herdado: false,
      modo: "fixed",
      origem: "definida pela pessoa autora",
      motivo: "Condição fixada explicitamente pela pessoa autora.",
      conflitos: [],
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
      parametros: { maximo_ideias_novas_por_unidade: 2 }
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
  assert.match(fixedForResearch.deepLink, /section=parameters/u);
  assert.match(fixedForResearch.nextDecision, /futuras produções/iu);
  assert.match(fixedForResearch.nextDecision, /conteúdo existente.*alteração autoral própria/iu);

  const commandCountBeforeAutomaticRetry = designCommands.length;
  const preservedResearchCondition = await executeHumanCourseTask({
    adapter: writeAdapter,
    principal: PRINCIPAL,
    name: "ajustar_configuracao",
    rawArguments: {
      curso: "Redes para iniciantes",
      unidade: "Unidade um",
      condicao: "automatica",
      parametros: { maximo_ideias_novas_por_unidade: null }
    }
  });
  assert.equal(designCommands.length, commandCountBeforeAutomaticRetry);
  assert.match(preservedResearchCondition.result, /Mantive a condição de pesquisa/u);
  assert.equal(preservedResearchCondition.deepLink, null);
  assert.equal(preservedResearchCondition.nextDecision, null);
  assert.equal(
    preservedResearchCondition.context.configuracao.parametros[0].origem,
    "condição de pesquisa"
  );
  for (const result of [configured, calibratedMicrosequence]) {
    assert.match(result.deepLink, /section=parameters/u);
    assert.match(result.nextDecision, /futuras produções/iu);
    assert.match(result.nextDecision, /conteúdo existente.*alteração autoral própria/iu);
    assert.ok(result.context.configuracao);
  }

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
  assert.equal(observationBatches[0].commands.length, 1);
  assert.deepEqual(observationBatches[0].commands[0].targets.map(({ id }) => id), [
    "unit-one", "unit-two"
  ]);
  assert.equal(new Set(observationBatches[0].commands.map(({ annotationId }) =>
    annotationId)).size, 1);
  assert.equal(new Set(observationBatches[0].commands.map(({ capturedAt }) =>
    capturedAt)).size, 1);
  assert.match(observed.result, /uma observação com todos os alvos/u);
  assert.deepEqual(observed.context, { observationCount: 1, targetCount: 2 });
});


test("delegação humana não inventa valor e rejeita ajuste automático numérico", async () => {
  const commands = [];
  const writer = { ...adapter(),
    getCourseDesign: async () => ({ definitions: [], parameters: [], guidance: { effectiveAssignments: [] } }),
    applyCourseDesignCommand: async ({ command }) => { commands.push(command); return { changed: true }; } };
  await executeHumanCourseTask({ adapter: writer, principal: PRINCIPAL, name: "ajustar_configuracao",
    rawArguments: { curso: "Redes para iniciantes", condicao: "automatica", automaticos: ["distribuicao_da_pratica"] } });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].type, "delegate_parameter");
  assert.equal(commands[0].parameterId, "practice_distribution");
  assert.equal(Object.hasOwn(commands[0], "value"), false);
  assert.match(commands[0].reason, /delegou/u);
  await assert.rejects(() => executeHumanCourseTask({ adapter: writer, principal: PRINCIPAL, name: "ajustar_configuracao",
    rawArguments: { curso: "Redes para iniciantes", condicao: "automatica", parametros: { maximo_ideias_novas_por_unidade: 2 } } }),
  (error) => error.code === "invalid_human_task_argument");
  assert.equal(commands.length, 1);
});

function contextualSourceAdapter() {
  const source = {
    sourceId: 'source-context', revision: 3, title: 'Referência contextual', kind: 'article',
    defaultRoles: ['technical_conceptual'], authors: [{literal:'Instituição fornecida'}],
    publicationDate: null, identifier: null, language: null, citationMode:'manual', citationText:'Referência redigida deliberadamente.',
    url: null, editionOrVersion: null, bibliographic:createEmptyCourseSourceBibliographicMetadata(),
    origin:'external', availability:'unknown', verificationStatus:'unverified', studyVisibility:'citation',
    anchors:[{anchorId:'anchor-context',revision:2,humanLocator:'Seção 2',verificationExcerpt:'Trecho da fonte',contentHash:null}]
  };
  const occurrence = {occurrenceId:'occurrence-kept',slot:'content',resourceId:'paragraph-context',path:'text',quote:'literal',prefix:null,suffix:null};
  const links = [
    {linkId:'link-first',sourceId:source.sourceId,relation:'informed_by',roles:['curricular_scope'],anchors:[],occurrences:[occurrence]},
    {linkId:'link-second',sourceId:source.sourceId,relation:'supported_by',roles:['technical_conceptual'],anchors:[],occurrences:[]}
  ];
  const commands=[];
  const value = {
    ...adapter(),source,links,commands,
    async listCourseStudyUnits() {
      return {items:[{ordinal:1,version:4,studyUnit:{id:'unit-context',title:'Unidade contextual',version:4,
        content:[{id:'paragraph-context',package:'aralearn.resource.paragraph',version:'1.0.0',data:{text:'Texto literal do curso.'}}],response:null,feedback:[]}}],hasMore:false,nextCursor:null};
    },
    async getCourseSources({mode}) {
      return {items: mode==='target'?[{sourceLinks:structuredClone(links)}]:[structuredClone(source)],nextCursor:null};
    },
    async executeCourseSourceCommand(request) {commands.push(structuredClone(request));return {changed:true};}
  };
  return value;
}

const sourceTask = (sourceAdapter, args) => executeHumanCourseTask({adapter:sourceAdapter,principal:PRINCIPAL,name:'manter_fonte',
  rawArguments:{curso:'Redes para iniciantes',...args}});

test("Actions e MCP recusam sustentação vazia e expõem âncoras reutilizáveis com o mesmo diagnóstico", async () => {
  for (const channel of ["mcp", "actions"]) {
    const value = contextualSourceAdapter();
    value.resolveActionPrincipal = async () => PRINCIPAL;
    const handler = channel === "mcp" ? createAuthoringMcpHandler({ adapter: value,
      allowedOrigins: new Set([ORIGIN]), resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1" }) : createAuthoringActionHandler({ adapter: value,
      allowedOrigins: new Set([ORIGIN]), actionBaseUrl: "https://edge.example/functions/v1/aralearn-authoring-action",
      publicAppUrl: value.publicAppUrl });
    const call = async (name, args) => {
      const binding = encodeCourseActionTaskRequest(name, args);
      const response = await handler(channel === "mcp" ? request("tools/call", { name, arguments: args })
        : new Request(`https://edge.example/functions/v1/aralearn-authoring-action/${binding.operationName}`, {
          method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-token", "Content-Type": "application/json" },
          body: JSON.stringify(binding.arguments) }));
      const body = await response.json();
      return channel === "mcp" ? body.result.structuredContent : body;
    };
    const args = { curso: "Redes para iniciantes", fonte: 1 };
    const source = await call("consultar_fontes", args);
    assert.equal(source.context.sources.items[0].anchors[0].posicao, 1);
    const target = await call("consultar_fontes", { curso: args.curso, unidade: 1 });
    assert.equal(target.context.sources.items[0].sourceLinks[1].evidencia.located, false);
    assert.deepEqual(target.context.sources.items[0].sourceLinks[1].evidencia.issues, ["missing_occurrence", "missing_anchor"]);
    const invalid = await call("manter_fonte", { ...args, vinculos: [{ unidade: 1,
      relacao: "supported_by", papeis: ["tecnica_conceitual"] }] });
    assert.equal(invalid.error.code, "incomplete_course_source_evidence", channel);
    assert.match(invalid.error.message, /ocorrência.*âncora/u);
    assert.equal(value.commands.length, 0);
    await call("manter_fonte", { ...args, vinculos: [{ unidade: 1, relacao: "supported_by",
      papeis: ["tecnica_conceitual"], ancoras: [source.context.sources.items[0].anchors[0].posicao],
      ocorrencias: [{ lugar: "conteudo", recurso: 1, trecho: "literal" }] }] });
    assert.deepEqual(
      sourceBundleCommand(value.commands[0], "set_target_sources").sourceLinks.at(-1).anchors,
      [{ anchorId: "anchor-context" }]
    );
  }
});

test('#302 fonte permite metadados estruturados e estilo sem reinterpretar referência manual', async () => {
  const value=contextualSourceAdapter();
  await sourceTask(value,{fonte:1,metadados:{titulo:null,modoCitacao:'gerada',papeisSugeridos:['leitura_complementar'],
    autores:[{sobrenome:'Silva',nomes:'Ana'},{literal:'Organização informada'}],
    bibliografia:{editora:'Editora fornecida',localizacaoEletronica:'e12345',editores:[{literal:'Equipe editora'}]}}});
  const stored=sourceBundleCommand(value.commands[0],'save_source').source;
  assert.equal(stored.title,null);
  assert.equal(stored.citationMode,'generated');
  assert.equal(stored.citationText,value.source.citationText);
  assert.equal(stored.origin,'external');
  assert.deepEqual(stored.defaultRoles,['recommended_reading']);
  assert.deepEqual(stored.authors,[{family:'Silva',given:'Ana'},{literal:'Organização informada'}]);
  assert.equal(stored.bibliographic.articleNumber,'e12345');
  assert.deepEqual(stored.bibliographic.editors,[{literal:'Equipe editora'}]);
  assert.equal(value.commands[0].expectedCourseRevision,7);
  assert.equal(sourceBundleCommand(value.commands[0],'save_source').expectedSourceRevision,3);
  const result=await sourceTask(value,{estilo:'apa7'});
  assert.deepEqual(sourceBundleCommands(value.commands.at(-1)),[{type:'set_bibliography_style',style:'apa7'}]);
  assert.match(result.result,/estilo das referências/u);
  for(const metadados of [{autoria:'Não decompor automaticamente'},{autores:[{literal:'Nome',sobrenome:'Mistura'}]},
    {bibliografia:{campoInventado:'Não aceitar'}},{modoCitacao:'silencioso'}]) {
    const before=value.commands.length;
    await assert.rejects(()=>sourceTask(value,{fonte:1,metadados}));
    assert.equal(value.commands.length,before);
  }
});

test('#302 fonte conserva vínculos distintos e ocorrências; novo vínculo recebe papéis explícitos', async () => {
  const value=contextualSourceAdapter();
  const original=structuredClone(value.links);
  await sourceTask(value,{fonte:1,vinculos:[{unidade:1,vinculo:1,relacao:'supported_by',papeis:['leitura_complementar'],ancoras:[1]}]});
  const edited=sourceBundleCommand(value.commands.at(-1),'set_target_sources').sourceLinks;
  assert.equal(edited.length,2);
  assert.deepEqual(edited[1],original[1]);
  assert.equal(edited[0].linkId,original[0].linkId);
  assert.deepEqual(edited[0].occurrences,original[0].occurrences);
  await sourceTask(value,{fonte:1,vinculos:[{unidade:1,relacao:'informed_by',papeis:['evidencia_de_avaliacao'],
    ocorrencias:[{lugar:'conteudo',recurso:1,trecho:'literal',prefixo:'Texto ',sufixo:' do curso.'}]}]});
  const appended=sourceBundleCommand(value.commands.at(-1),'set_target_sources').sourceLinks;
  assert.deepEqual(appended.slice(0,2),original);
  assert.equal(appended.length,3);
  assert(!original.some(link=>link.linkId===appended[2].linkId));
  assert.deepEqual(appended[2].roles,['assessment_evidence']);
  assert.equal(appended[2].occurrences[0].resourceId,'paragraph-context');
  assert.equal(appended[2].occurrences[0].quote,'literal');
  assert.equal(Object.hasOwn(appended[2].occurrences[0],'status'),false);
  assert.equal(sourceBundleCommand(value.commands.at(-1),'set_target_sources').expectedTargetVersion,4);
  for(const invalid of [
    {unidade:1,relacao:'informed_by'},
    {unidade:1,vinculo:3,relacao:'informed_by',papeis:['tecnica_conceitual']},
    {unidade:1,relacao:'quoted_from',papeis:['tecnica_conceitual']},
    {unidade:1,relacao:'informed_by',papeis:['tecnica_conceitual'],ocorrencias:[{lugar:'conteudo',recurso:2,trecho:'literal'}]}
  ]) {
    const before=value.commands.length;
    await assert.rejects(()=>sourceTask(value,{fonte:1,vinculos:[invalid]}));
    assert.equal(value.commands.length,before);
  }
});

test('#302 fonte retenta escrita incerta com mesmas identidades de vínculo e ocorrência', async () => {
  const value=contextualSourceAdapter();
  const attempts=[];
  value.executeCourseSourceCommand=async request=>{
    attempts.push(structuredClone(request));
    if(attempts.length===1) throw new AuthoringApiError(503,'course_service_unavailable','Resposta perdida.');
    return {changed:true,idempotent:true};
  };
  await sourceTask(value,{fonte:1,vinculos:[{unidade:1,relacao:'informed_by',papeis:['tecnica_conceitual'],
    ancoras:[1],
    ocorrencias:[{lugar:'conteudo',recurso:1,trecho:'literal'}]}]});
  assert.equal(attempts.length,2);
  assert.deepEqual(attempts[1],attempts[0]);
});

test('#302 âncora associa PDF apenas por hash explícito e preserva associação ao editar', async () => {
  const value=contextualSourceAdapter();
  const contentHash='a'.repeat(64);
  await sourceTask(value,{fonte:1,ancoras:[{seletor:{tipo:'paginas',paginaInicial:2,paginaFinal:3},hashDoPdf:contentHash}]});
  assert.equal(sourceBundleCommand(value.commands.at(-1),'save_anchor').contentHash,contentHash);
  value.source.anchors[0].contentHash=contentHash;
  await sourceTask(value,{fonte:1,ancoras:[{ancora:1,seletor:{tipo:'paginas',paginaInicial:3,paginaFinal:3}}]});
  assert.equal(sourceBundleCommand(value.commands.at(-1),'save_anchor').contentHash,contentHash);
  assert.equal(sourceBundleCommand(value.commands.at(-1),'save_anchor').expectedAnchorRevision,2);
  await sourceTask(value,{fonte:1,ancoras:[{ancora:1,seletor:{tipo:'paginas',paginaInicial:3,paginaFinal:3},hashDoPdf:null}]});
  assert.equal(sourceBundleCommand(value.commands.at(-1),'save_anchor').contentHash,null);
  const before=value.commands.length;
  await assert.rejects(()=>sourceTask(value,{fonte:1,ancoras:[{ancora:2,seletor:{tipo:'paginas',paginaInicial:1,paginaFinal:1}}]}),
    error=>error.code==='human_reference_not_found');
  assert.equal(value.commands.length,before);
  for (const invalid of [{ancoras:[]},{ancoras:Array(9).fill({seletor:{tipo:'paginas',paginaInicial:1,paginaFinal:1}})},
    {vinculos:[]},{vinculos:Array(65).fill({unidade:1,relacao:'informed_by',papeis:['tecnica_conceitual']})}]) {
    await assert.rejects(()=>sourceTask(value,{fonte:1,...invalid}),error=>error.code==='invalid_human_task_argument');
    assert.equal(value.commands.length,before);
  }
});

// Motivo opcional de `ajustar_configuracao`: rótulo curto declarado pela pessoa,
// preservado no campo `reason` existente (parâmetro, direção editorial e
// delegação). Sem novo ID, entidade ou campo obrigatório. Limite alinhado ao
// `reason` persistido (1000).
function configurationWriter({ protectedParameterOrigin = null } = {}) {
  const commands = [];
  return {
    commands,
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
      return {
        definitions: [],
        parameters: protectedParameterOrigin === null ? [] : [{
          parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
          localAssignment: {
            mode: "fixed",
            value: 2,
            origin: protectedParameterOrigin,
            reason: "Condição fixada antes desta chamada."
          },
          effectiveAssignment: {
            mode: "fixed",
            value: 2,
            inherited: false,
            origin: protectedParameterOrigin,
            reason: "Condição fixada antes desta chamada.",
            sourceScope: { kind: "course", ref: COURSE_ID }
          },
          conflicts: []
        }],
        guidance: { localAssignment: null, effectiveAssignments: [] }
      };
    },
    async applyCourseDesignCommand({ command }) {
      commands.push(structuredClone(command));
      return { changed: true };
    }
  };
}

const configure = (writer, rawArguments) => executeHumanCourseTask({
  adapter: writer, principal: PRINCIPAL, name: "ajustar_configuracao",
  rawArguments: { curso: "Redes para iniciantes", ...rawArguments }
});

test("motivo declarado distingue duas condições de mesmo valor em escopos distintos", async () => {
  const writer = configurationWriter();
  await configure(writer, {
    condicao: "pesquisa",
    parametros: { maximo_ideias_novas_por_unidade: 2 },
    motivo: "Condição A: teto dois com leitura de comparação."
  });
  await configure(writer, {
    microssequencia: "Sockets",
    condicao: "pesquisa",
    parametros: { maximo_ideias_novas_por_unidade: 2 },
    motivo: "Condição B: teto dois com outra ordem de casos."
  });
  assert.equal(writer.commands.length, 2);
  assert.deepEqual(writer.commands.map(({ type }) => type),
    ["set_parameter", "set_parameter"]);
  assert.deepEqual(writer.commands.map(({ scope }) => scope.kind),
    ["course", "didactic_microsequence"]);
  assert.deepEqual(writer.commands.map(({ parameterId }) => parameterId),
    ["new_analysis_unit_ceiling_per_expository_study_unit",
      "new_analysis_unit_ceiling_per_expository_study_unit"]);
  assert.deepEqual(writer.commands.map(({ value }) => value), [2, 2]);
  assert.deepEqual(writer.commands.map(({ origin }) => origin),
    ["research_condition", "research_condition"]);
  assert.deepEqual(writer.commands.map(({ reason }) => reason), [
    "Condição A: teto dois com leitura de comparação.",
    "Condição B: teto dois com outra ordem de casos."
  ]);
});

test("motivo preserva o padrão atual quando omitido e acompanha delegação e direção", async () => {
  const writer = configurationWriter();
  await configure(writer, { condicao: "pesquisa",
    parametros: { maximo_ideias_novas_por_unidade: 2 } });
  await configure(writer, { condicao: "fixada_pelo_autor",
    parametros: { maximo_ideias_novas_por_unidade: 2 } });
  await configure(writer, { condicao: "automatica",
    automaticos: ["distribuicao_da_pratica"] });
  assert.deepEqual(writer.commands.slice(0, 3).map(({ reason }) => reason), [
    "Condição de pesquisa fixada explicitamente.",
    "Condição fixada explicitamente pela pessoa autora.",
    "A pessoa autora delegou a escolha ao contexto de produção."
  ]);

  const withMotivo = configurationWriter();
  await configure(withMotivo, { condicao: "pesquisa",
    automaticos: ["distribuicao_da_pratica"],
    motivo: "Condição C: delegação rotulada." });
  await configure(withMotivo, { condicao: "pesquisa",
    direcaoEditorial: "Prefira exemplos com dados observados.",
    motivo: "Condição C: direção rotulada." });
  assert.deepEqual(withMotivo.commands.map(({ type }) => type),
    ["delegate_parameter", "set_guidance"]);
  assert.deepEqual(withMotivo.commands.map(({ reason }) => reason), [
    "Condição C: delegação rotulada.",
    "Condição C: direção rotulada."
  ]);
});

test("motivo vazio ou acima do limite é recusado sem escrita", async () => {
  const writer = configurationWriter();
  const before = writer.commands.length;
  for (const motivo of ["", "   ", "x".repeat(1001), 7, {}]) {
    await assert.rejects(() => configure(writer, { condicao: "pesquisa",
      parametros: { maximo_ideias_novas_por_unidade: 2 }, motivo }),
    error => error.code === "invalid_human_task_argument");
    assert.equal(writer.commands.length, before);
  }
  await assert.rejects(() => configure(writer, { condicao: "pesquisa",
    motivo: "Condição sem alvo." }), error => error.code === "missing_human_task_argument");
  assert.equal(writer.commands.length, before);
});

test("motivo não substitui autoridade de condição fixada ou de pesquisa", async () => {
  const writer = configurationWriter({ protectedParameterOrigin: "research_condition" });
  const preserved = await configure(writer, {
    condicao: "automatica",
    parametros: { maximo_ideias_novas_por_unidade: null },
    motivo: "Condição D: tentativa automática rotulada."
  });
  assert.equal(writer.commands.length, 0);
  assert.match(preserved.result, /Mantive a condição de pesquisa/u);
  assert.equal(preserved.deepLink, null);
  assert.equal(preserved.nextDecision, null);
});

// --- Falha transitória antes do despacho (resolvePrincipal) -------------------
// Durante a resolução do principal a chamada já é válida (envelope com id e
// ferramenta do catálogo), mas nenhuma ferramenta foi executada. A falha
// transitória da dependência precisa alcançar o cliente como falha da própria
// ferramenta (result.isError) em HTTP 200: clientes MCP descartam o corpo de
// respostas não-2xx e degradam o erro para -32603, perdendo code, retryable e
// diagnostico. Nada é executado e nenhum principal é autorizado nesta rota.

function handlerWithResolveFailure(error) {
  const calls = [];
  const value = adapter(PRINCIPAL);
  value.resolvePrincipal = async () => {
    throw error;
  };
  const spied = new Proxy(value, {
    get(target, field) {
      const member = target[field];
      if (typeof member !== "function") return member;
      return (...args) => {
        calls.push(String(field));
        return member.apply(target, args);
      };
    }
  });
  return {
    calls,
    handler: createAuthoringMcpHandler({
      adapter: spied,
      allowedOrigins: new Set([ORIGIN]),
      resourceUrl: RESOURCE_URL,
      authorizationServer: "https://project.example/auth/v1"
    })
  };
}

function retryableDependencyFailure() {
  return new AuthoringApiError(503, "service_timeout", "A dependência não respondeu a tempo.");
}

function notification(method, params = {}) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params })
  });
}

test("falha transitória ao resolver o principal vira falha da ferramenta em HTTP 200", async () => {
  const { calls, handler } = handlerWithResolveFailure(retryableDependencyFailure());
  const response = await handler(request("tools/call", {
    name: "preparar_revisao",
    arguments: { curso: "Redes para iniciantes", microssequencia: "Sockets", unidades: [1] }
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.isError, true);
  const structured = body.result.structuredContent;
  assert.equal(structured.error.code, "temporarily_unavailable");
  assert.equal(structured.error.retryable, true);
  assert.equal(structured.error.diagnostico.fase, "resolucao_principal");
  assert.equal(structured.error.diagnostico.status, 503);
  assert.match(
    structured.error.diagnostico.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
  );
  assert.equal(typeof structured.nextDecision, "string");
  assert.deepEqual(JSON.parse(body.result.content[0].text), structured);
  assert.equal(
    response.headers.get("x-aralearn-request-id"),
    structured.error.diagnostico.requestId
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("www-authenticate"), null);
  assert.equal(response.headers.get("retry-after"), null);
  assert.deepEqual(calls, ["resolvePrincipal"]);
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, new RegExp(PRINCIPAL.actorId, "u"));
  assert.doesNotMatch(serialized, /Bearer/u);
  assert.doesNotMatch(serialized, /não respondeu a tempo/u);
});

test("métodos que não são tools/call mantém o contrato de transporte atual", async () => {
  const { handler } = handlerWithResolveFailure(retryableDependencyFailure());
  const response = await handler(request("tools/list", {}));
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.id, 1);
  assert.equal(body.result, undefined);
  assert.equal(body.error.code, -32000);
  assert.equal(body.error.data.code, "temporarily_unavailable");
  assert.equal(body.error.data.retryable, true);
  assert.equal(body.error.data.fase, "resolucao_principal");
  assert.equal(body.error.data.status, 503);
});

test("autenticação, autorização, limite de taxa e falha interna preservam o transporte", async () => {
  const unauthorized = handlerWithResolveFailure(
    new AuthoringApiError(401, "authentication_required", "Sessão ausente ou expirada.")
  );
  const unauthorizedResponse = await unauthorized.handler(
    request("tools/call", { name: "preparar_revisao", arguments: {} })
  );
  assert.equal(unauthorizedResponse.status, 401);
  assert.match(unauthorizedResponse.headers.get("www-authenticate"), /resource_metadata=/u);

  const forbidden = handlerWithResolveFailure(
    new AuthoringApiError(403, "insufficient_scope", "A sessão não permite esta operação.")
  );
  const forbiddenResponse = await forbidden.handler(
    request("tools/call", { name: "preparar_revisao", arguments: {} })
  );
  assert.equal(forbiddenResponse.status, 403);
  assert.equal(forbiddenResponse.headers.get("www-authenticate"), null);

  const limited = handlerWithResolveFailure(
    new AuthoringApiError(429, "rate_limited", "Limite temporário de uso.")
  );
  const limitedResponse = await limited.handler(
    request("tools/call", { name: "preparar_revisao", arguments: {} })
  );
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get("retry-after"), "60");

  const internal = handlerWithResolveFailure(
    new AuthoringApiError(500, "internal_error", "A operação não pôde ser concluída.")
  );
  const internalResponse = await internal.handler(
    request("tools/call", { name: "preparar_revisao", arguments: {} })
  );
  assert.equal(internalResponse.status, 500);

  // A falha transitória do JWKS não é recusa de credencial: ela sai do transporte e
  // vira falha da ferramenta, coberta pelos testes dedicados acima.
});

test("chamada inválida ou notificação sem id não entra na rota de falha da ferramenta", async () => {
  const unknownTool = handlerWithResolveFailure(retryableDependencyFailure());
  const unknownResponse = await unknownTool.handler(
    request("tools/call", { name: "ferramenta_inexistente", arguments: {} })
  );
  assert.equal(unknownResponse.status, 503);

  const withoutName = handlerWithResolveFailure(retryableDependencyFailure());
  const withoutNameResponse = await withoutName.handler(request("tools/call", {}));
  assert.equal(withoutNameResponse.status, 503);

  const silent = handlerWithResolveFailure(retryableDependencyFailure());
  const silentResponse = await silent.handler(notification("notifications/initialized"));
  assert.equal(silentResponse.status, 503);
  const silentBody = await silentResponse.json();
  assert.equal(silentBody.id, null);
});

function rawToolCall({
  id = 1,
  name = "preparar_revisao",
  args = {},
  protocolVersion = ARALEARN_MCP_PROTOCOL_VERSION,
  includeProtocol = true
} = {}) {
  const headers = {
    Origin: ORIGIN,
    Authorization: "Bearer token",
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json"
  };
  if (includeProtocol) headers["MCP-Protocol-Version"] = protocolVersion;
  const params = { name };
  if (args !== undefined) params.arguments = args;
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params })
  });
}

test("forma inválida da chamada não entra na rota de falha da ferramenta", async () => {
  for (const args of [42, [], "", false]) {
    const { handler } = handlerWithResolveFailure(retryableDependencyFailure());
    const response = await handler(rawToolCall({ args }));
    assert.equal(response.status, 503, "arguments " + JSON.stringify(args));
    const payload = await response.json();
    assert.equal(payload.result, undefined);
    assert.equal(payload.error.data.code, "temporarily_unavailable");
  }

  const withoutProtocol = handlerWithResolveFailure(retryableDependencyFailure());
  const withoutProtocolResponse = await withoutProtocol.handler(
    rawToolCall({ includeProtocol: false })
  );
  assert.equal(withoutProtocolResponse.status, 503);
  assert.equal((await withoutProtocolResponse.json()).result, undefined);

  const staleProtocol = handlerWithResolveFailure(retryableDependencyFailure());
  const staleProtocolResponse = await staleProtocol.handler(
    rawToolCall({ protocolVersion: "2024-11-05" })
  );
  assert.equal(staleProtocolResponse.status, 503);
  assert.equal((await staleProtocolResponse.json()).result, undefined);
});

test("chamada saudável preserva a recusa normal de forma", async () => {
  const handler = mcpHandler();

  const badArguments = await handler(rawToolCall({ args: 42 }));
  assert.equal(badArguments.status, 200);
  assert.equal((await badArguments.json()).error.code, -32602);

  const missingProtocol = await handler(rawToolCall({ includeProtocol: false }));
  assert.equal(missingProtocol.status, 400);
  const missingProtocolPayload = await missingProtocol.json();
  assert.equal(missingProtocolPayload.error.code, -32600);
  assert.equal(missingProtocolPayload.error.data.code, "unsupported_protocol_version");

  const staleProtocol = await handler(rawToolCall({ protocolVersion: "2024-11-05" }));
  assert.equal(staleProtocol.status, 400);
  assert.equal((await staleProtocol.json()).error.code, -32600);
});

test("id 0 e id textual sobrevivem à rota de falha transitória", async () => {
  for (const id of [0, "chamada-alfa"]) {
    const { handler } = handlerWithResolveFailure(retryableDependencyFailure());
    const response = await handler(rawToolCall({ id }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.id, id);
    assert.equal(payload.result.isError, true);
    assert.equal(payload.result.structuredContent.error.retryable, true);
  }
});
