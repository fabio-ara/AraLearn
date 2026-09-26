import assert from "node:assert/strict";
import test from "node:test";

import { RESOURCE_CATALOG } from "../../src/resources/catalog/resourceCatalog.js";
import {
  COURSE_HUMAN_TASKS,
  executeHumanCourseTask
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { defaultAuthoringProcessPreferences, resolveAuthoringProcessPreferences } from
  "../../src/domain/authoringProcessPreferences.js";
import { createAuthoringProcessReference } from
  "../../supabase/functions/_shared/aralearn-authoring/courseAuthoringProcessReference.js";

const PRINCIPAL = Object.freeze({
  actorId: "40000000-0000-4000-8000-000000000001",
  scopes: Object.freeze(["authoring:read", "authoring:write"])
});
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const MICROSEQUENCE_ID = "20000000-0000-4000-8000-000000000001";

function autonomousDraftPlan() {
  return {
    courseId: COURSE_ID,
    courseRevision: 7,
    plan: {
      id: "30000000-0000-4000-8000-000000000001",
      version: 1,
      title: "Curso autônomo",
      objective: "Explicar uma relação de rede.",
      curriculumMapStatus: "draft",
      audience: "Iniciantes",
      declaredPrerequisites: [],
      curriculumScopeItems: [{
        id: "50000000-0000-4000-8000-000000000001",
        position: 0,
        statement: "Relacionar processo e comunicação",
        curriculumTargets: [{ moduleId: "60000000-0000-4000-8000-000000000001",
          lessonId: "70000000-0000-4000-8000-000000000001", didacticMicrosequenceIds: [MICROSEQUENCE_ID] }]
      }],
      curriculum: { modules: [{
        id: "60000000-0000-4000-8000-000000000001",
        position: 0,
        title: "Fundamentos",
        objective: "Compreender a comunicação.",
        lessons: [{
          id: "70000000-0000-4000-8000-000000000001",
          position: 0,
          title: "Processos",
          objective: "Relacionar processo e comunicação.",
          microsequences: [{
            id: MICROSEQUENCE_ID,
            position: 0,
            title: "Sockets",
            objective: "Relacionar processo e comunicação.",
            explanationPlan: { purpose: "Explicar a relação.", prerequisites: [], relations: [], sourceIds: [] },
            dependencyMicrosequenceIds: [],
            scopeItemIds: ["50000000-0000-4000-8000-000000000001"]
          }]
        }]
      }] },
      instructionalAnalysisUnits: [],
      evidenceRequirements: [],
      parts: []
    }
  };
}

function autonomousPartAdapter(plan, { reviewPoints = [], mutateDesign = null } = {}) {
  const account = {
    contract: "aralearn.authoring-process-preferences.v1",
    revision: 4,
    updatedAt: "2026-09-26T00:00:00Z",
    preferences: { ...defaultAuthoringProcessPreferences(), reviewPoints }
  };
  const design = courseDesignFixture({ courseId: COURSE_ID }, { scope: "course", revision: 7 });
  const resolution = resolveAuthoringProcessPreferences({ account, courseDesign: design });
  const processo = createAuthoringProcessReference(PRINCIPAL, resolution);
  mutateDesign?.(design);
  const saved = [];
  return {
    saved,
    processo,
    async listCourses() {
      return { items: [{ courseId: COURSE_ID, title: "Curso autônomo", revision: 7 }], hasMore: false, nextCursor: null };
    },
    async getCourse() {
      return { courseId: COURSE_ID, title: "Curso autônomo", revision: 7, deepLink: "https://app.example/#/authoring/courses/test" };
    },
    async getCourseInstructionalPlan() { return structuredClone(plan); },
    async getAuthoringProcessPreferences() { return structuredClone(account); },
    async getCourseDesign() { return structuredClone(design); },
    async listCourseEntities() {
      return { revision: 7, items: [{ entityType: "microsequence", entityId: MICROSEQUENCE_ID }], hasMore: false, nextCursor: null };
    },
    async saveCourseAuthoringPart(request) {
      saved.push(structuredClone(request));
      return { changed: true, courseRevision: 8 };
    }
  };
}

test("a descoberta do catálogo informa total e pagina sem reduzir o repertório", () => {
  const first = RESOURCE_CATALOG.search({ query: "", limit: 8 });
  assert.equal(first.candidates.length, 8);
  assert.ok(first.total > first.candidates.length);
  assert.equal(first.hasMore, true);
  assert.equal(typeof first.nextCursor, "number");

  const second = RESOURCE_CATALOG.search({
    query: "",
    limit: 8,
    cursor: first.nextCursor
  });
  assert.equal(second.total, first.total);
  assert.equal(second.candidates.length, 8);
  const firstReferences = new Set(first.candidates.map(({ packageId, version }) => `${packageId}@${version}`));
  assert.equal(second.candidates.some(({ packageId, version }) => firstReferences.has(`${packageId}@${version}`)), false);
});

test("consultar_componentes expõe continuação sem transportar estado técnico", () => {
  const task = COURSE_HUMAN_TASKS.find(({ name }) => name === "consultar_componentes");
  assert.ok(task);
  assert.equal(task.inputSchema.minProperties, undefined);
  assert.equal(task.inputSchema.properties.continuacao.maxLength, 4096);
  assert.equal(Object.hasOwn(task.inputSchema.properties, "cursor"), false);
  assert.equal(Object.hasOwn(task.inputSchema.properties, "catalogVersion"), false);
  assert.match(task.description, /contrato|componente/iu);
});

test("executor real percorre o catálogo completo mantendo consulta, curso e revisão", async () => {
  let continuacao;
  const references = [];
  let pages = 0;
  for (; pages < 8;) {
    const output = await executeHumanCourseTask({
      adapter: {},
      principal: { actorId: PRINCIPAL.actorId, scopes: ["authoring:read"] },
      name: "consultar_componentes",
      rawArguments: continuacao ? { continuacao } : {}
    });
    pages += 1;
    assert.equal(output.context.components.total, 34);
    references.push(...output.context.components.candidates.map(candidate => candidate.referencia));
    if (!output.context.temMais) {
      continuacao = null;
      break;
    }
    continuacao = output.context.continuacao;
    assert.equal(typeof continuacao, "string");
  }
  assert.equal(continuacao, null);
  assert.equal(pages, 5);
  assert.equal(references.length, 34);
  assert.equal(new Set(references).size, 34);
});

test("executor rejeita continuação inválida ou recorte alterado", async () => {
  const base = {
    adapter: {},
    principal: { actorId: PRINCIPAL.actorId, scopes: ["authoring:read"] },
    name: "consultar_componentes"
  };
  await assert.rejects(() => executeHumanCourseTask({ ...base,
    rawArguments: { busca: "a", continuacao: "token-adulterado" }
  }), error => error.code === "invalid_read_continuation");
  const first = await executeHumanCourseTask({ ...base, rawArguments: {} });
  if (first.context.continuacao) {
    await assert.rejects(() => executeHumanCourseTask({ ...base,
      rawArguments: { busca: "foco alterado", continuacao: first.context.continuacao }
    }), error => error.code === "human_read_context_changed");
  }
});

test("mandato automático planeja lote em mapa rascunho sem fabricar aprovação humana", async () => {
  const plan = autonomousDraftPlan();
  const adapter = autonomousPartAdapter(plan);
  const output = await executeHumanCourseTask({
    adapter,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: "Curso autônomo",
      titulo: "Lote inicial",
      intencao: "Desenvolver a relação entre processo e comunicação.",
      microssequencias: ["Sockets"],
      progressao: ["Explicar a relação", "Praticar a aplicação"],
      processo: adapter.processo
    }
  });
  assert.equal(output.context.mapaCurricular, undefined);
  assert.equal(output.context.processoCorrente.pontosDeRevisao.includes("curricular_map"), false);
  assert.equal(adapter.saved.length, 1);
  assert.equal(adapter.saved[0].approved, undefined);
});

test("mandato padrão mantém aprovação curricular obrigatória e conflito da referência bloqueia", async () => {
  const plan = autonomousDraftPlan();
  const defaultAdapter = autonomousPartAdapter(plan, {
    reviewPoints: defaultAuthoringProcessPreferences().reviewPoints
  });
  await assert.rejects(() => executeHumanCourseTask({
    adapter: defaultAdapter,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: "Curso autônomo",
      titulo: "Lote bloqueado",
      intencao: "Desenvolver a relação entre processo e comunicação.",
      microssequencias: ["Sockets"],
      progressao: ["Explicar a relação", "Praticar a aplicação"]
    }
  }), error => error.code === "curricular_map_not_approved");
  assert.equal(defaultAdapter.saved.length, 0);

  const adapter = autonomousPartAdapter(plan, {
    reviewPoints: defaultAuthoringProcessPreferences().reviewPoints,
    mutateDesign: design => {
      const parameter = design.parameters.find(({ parameterId }) => parameterId === "authoring_part_microsequence_target");
      parameter.effectiveAssignment = {
        mode: "fixed",
        value: 2,
        origin: "author",
        reason: "Condição corrente alterada no recorte.",
        sourceScope: { kind: "course", ref: COURSE_ID },
        inherited: false
      };
    }
  });
  await assert.rejects(() => executeHumanCourseTask({
    adapter,
    principal: PRINCIPAL,
    name: "salvar_parte",
    rawArguments: {
      curso: "Curso autônomo",
      titulo: "Lote bloqueado",
      intencao: "Desenvolver a relação entre processo e comunicação.",
      microssequencias: ["Sockets"],
      progressao: ["Explicar a relação", "Praticar a aplicação"],
      processo: adapter.processo
    }
  }), error => error.code === "authoring_process_conflict");
  assert.equal(adapter.saved.length, 0);
});
