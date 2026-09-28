import assert from "node:assert/strict";
import test from "node:test";
import { reconciledExplanationFixture } from "../helpers/reconciledExplanationFixture.js";

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
const OTHER_COURSE_ID = "10000000-0000-4000-8000-000000000002";
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
            explanation: reconciledExplanationFixture([{ text: "Um socket relaciona processo e transporte.", role: "support" }]),
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

function autonomousPartAdapter(plan, { reviewPoints = defaultAuthoringProcessPreferences().reviewPoints, mutateDesign = null } = {}) {
  const state = { plan: structuredClone(plan), courseRevision: plan.courseRevision };
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
  const globalPreferenceWrites = [];
  const approvals = [];
  const course = () => ({ courseId: COURSE_ID, title: "Curso autônomo", revision: state.courseRevision,
    deepLink: "https://app.example/#/authoring/courses/test" });
  const mapEntities = () => state.plan.plan.curriculum.modules.flatMap(module => [
    { entityType: "module", entityId: module.id, parentId: null, content: { title: module.title, goal: module.objective } },
    ...module.lessons.flatMap(lesson => [
      { entityType: "lesson", entityId: lesson.id, parentId: module.id, content: { title: lesson.title, goal: lesson.objective } },
      ...lesson.microsequences.map(microsequence => ({
        entityType: "microsequence", entityId: microsequence.id, parentId: lesson.id,
        content: { title: microsequence.title, goal: microsequence.objective }
      }))
    ])
  ]);
  return {
    saved, globalPreferenceWrites, approvals, processo,
    async listCourses() {
      return { items: [{ ...course() }], hasMore: false, nextCursor: null };
    },
    async getCourse() { return course(); },
    async getCourseInstructionalPlan() { return { ...structuredClone(state.plan), courseRevision: state.courseRevision }; },
    async getAuthoringProcessPreferences() { return structuredClone(account); },
    async saveAuthoringProcessPreferences(input) { globalPreferenceWrites.push(structuredClone(input)); },
    async approveCourseCurricularMap(input) {
      approvals.push(structuredClone(input));
      return { idempotent: false, courseId: COURSE_ID, courseRevision: state.courseRevision };
    },
    async getCourseDesign({ scopeKind = "course" } = {}) {
      const result = courseDesignFixture({ courseId: COURSE_ID,
        moduleId: "60000000-0000-4000-8000-000000000001",
        lessonId: "70000000-0000-4000-8000-000000000001", microsequenceId: MICROSEQUENCE_ID },
        { scope: scopeKind, revision: state.courseRevision });
      result.parameters = structuredClone(design.parameters);
      return result;
    },
    async listCourseEntities() {
      return { revision: state.courseRevision, items: mapEntities(), hasMore: false, nextCursor: null };
    },
    async listCourseStudyUnits() {
      return { items: [], hasMore: false, nextCursor: null };
    },
    async getCourseAnchoredAnnotations() {
      return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null };
    },
    async getCourseSources({ mode } = {}) {
      return { items: mode === "target" ? [{ sourceLinks: [] }] : [], hasMore: false, nextCursor: null };
    },
    async getCourseContentReview({ courseId, targetKind, targetId }) {
      return { contract: "aralearn.course-content-review.v1", courseId, courseRevision: state.courseRevision,
        targetKind, targetId, entityVersion: 1, basisHash: "a".repeat(64),
        contentReview: { state: "unregistered" }, reviewPolicy: "saved" };
    },
    async saveCourseAuthoringPart(request) {
      saved.push(structuredClone(request));
      const part = request.part;
      const titles = new Map(mapEntities().filter(item => item.entityType === "microsequence")
        .map(item => [item.entityId, item.content.title]));
      state.plan.plan.parts = [{ id: part.partId, version: 1, position: part.position, title: part.title,
        intent: part.intent, progression: part.progression,
        microsequences: part.microsequences.map(item => ({ id: item.microsequenceId,
          productionPosition: item.position, title: titles.get(item.microsequenceId) })) }];
      state.courseRevision += 1;
      return { changed: true, courseRevision: state.courseRevision, planVersion: state.plan.plan.version + 1 };
    }
  };
}

function autonomousCandidate() {
  return {
    microssequencia: "Sockets",
    posicao: 1,
    conteudo: {
      title: "Socket em uma situação concreta",
      role: "theory",
      content: [{ package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: "Um socket relaciona o processo ao serviço de transporte." } }],
      response: null, feedback: [], topics: ["socket"]
    },
    aplicacaoPedagogica: { ideiasIntroduzidas: [], ideiasUtilizadas: [], explicacoes: [], praticas: [], cobertura: [] },
    fontes: [],
    configuracao: { motivo: "A unidade focal é expositiva e curta.", parametros: {
      maximo_ideias_novas_por_unidade: 1, formas_de_explicacao: ["plain_definition"],
      oportunidades_distintas_por_requisito: 1, dimensoes_de_variacao_da_pratica: ["case_or_data"],
      alvo_palavras_conversa: 80, alvo_palavras_unidade: 160, distribuicao_da_pratica: "clustered",
      posicao_da_pratica: "after_explanation", alvo_microssequencias_por_parte: 2,
      alvo_partes_por_lote: 1, frequencia_de_pausa: "each_part", preferencia_da_conversa: "concise"
    } }
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
  const adapter = autonomousPartAdapter(plan, { reviewPoints: [] });
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

test("retomada autônoma emite snapshot local e atravessa salvar_parte e preparo de rascunho", async () => {
  const adapter = autonomousPartAdapter(autonomousDraftPlan());
  const resumed = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "retomar_curso",
    rawArguments: { titulo: "Curso autônomo", autonomo: true } });
  assert.deepEqual(resumed.context.processoCorrente.pontosDeRevisao, []);
  assert.equal(typeof resumed.context.referenciaProcesso, "string");
  assert.equal(resumed.context.temMais, false);
  assert.equal(resumed.context.mapaCurricular.situacao, "rascunho");
  assert.equal(Object.hasOwn(resumed.context, "observations"), false);
  assert.equal(Object.hasOwn(resumed.context, "referenciaParaAprovar"), false);
  assert.equal(adapter.globalPreferenceWrites.length, 0);
  assert.deepEqual(resumed.context.preferenciasPessoais.pontosDeRevisao,
    defaultAuthoringProcessPreferences().reviewPoints);
  const processo = resumed.context.referenciaProcesso;
  const saved = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "salvar_parte",
    rawArguments: { curso: "Curso autônomo", titulo: "Lote inicial", intencao: "Relacionar processo e transporte.",
      microssequencias: ["Sockets"], progressao: ["Explicar a relação."], processo } });
  assert.equal(saved.context.processoCorrente.pontosDeRevisao.includes("curricular_map"), false);
  assert.equal(adapter.saved[0].approved, undefined);
  const prepared = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "preparar_materializacao",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()], processo } });
  assert.equal(prepared.context.preflight.state, "ready");
  assert.equal(prepared.context.preflight.blockers.some(({ code }) => code === "human_materialization_map_approval_required"), false);
  assert.equal((await adapter.getCourseContentReview({ courseId: COURSE_ID,
    targetKind: "microsequence_explanation", targetId: MICROSEQUENCE_ID })).contentReview.state, "unregistered");
  assert.equal(adapter.globalPreferenceWrites.length, 0);
});

test("autonomia explícita rejeita processo simultâneo e continuações preservam o booleano", async () => {
  const plan = autonomousDraftPlan();
  plan.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation = reconciledExplanationFixture([
    ...Array.from({ length: 10 }, (_, index) => ({
      text: `${index + 1}. ${"Explicação operacional sobre sockets e transporte. ".repeat(45)}`,
      role: "support"
    }))
  ]);
  const adapter = autonomousPartAdapter(plan);
  const first = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "retomar_curso",
    rawArguments: { titulo: "Curso autônomo", autonomo: true, microssequencia: "Sockets" } });
  assert.equal(first.context.temMais, true);
  assert.equal(typeof first.context.continuacao, "string");
  const fragments = [first.context.fragmento.texto];
  let page = first;
  let pages = 1;
  while (page.context.temMais) {
    page = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "retomar_curso",
      rawArguments: { titulo: "Curso autônomo", autonomo: true, microssequencia: "Sockets",
        continuacao: page.context.continuacao } });
    pages += 1;
    fragments.push(page.context.fragmento.texto);
  }
  assert.ok(pages > 1);
  const context = JSON.parse(fragments.join(""));
  assert.deepEqual(context.observations.items, []);
  assert.deepEqual(context.preferenciasPessoais.pontosDeRevisao,
    defaultAuthoringProcessPreferences().reviewPoints);
  assert.deepEqual(context.processoCorrente.pontosDeRevisao, []);
  assert.equal(typeof context.referenciaProcesso, "string");
  assert.equal(context.preferenciasMudaram, false);
  await assert.rejects(() => executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "retomar_curso",
    rawArguments: { titulo: "Curso autônomo", autonomo: true, microssequencia: "Sockets",
      processo: context.referenciaProcesso } }), error => error.code === "invalid_human_task_argument");

  const otherAdapter = autonomousPartAdapter(autonomousDraftPlan());
  otherAdapter.listCourses = async () => ({ items: [{ courseId: OTHER_COURSE_ID, title: "Outro curso", revision: 7 }],
    hasMore: false, nextCursor: null });
  otherAdapter.getCourse = async () => ({ courseId: OTHER_COURSE_ID, title: "Outro curso", revision: 7 });
  await assert.rejects(() => executeHumanCourseTask({ adapter: otherAdapter, principal: PRINCIPAL, name: "salvar_parte",
    rawArguments: { curso: "Outro curso", titulo: "Lote fora do escopo", intencao: "Teste de escopo.",
      microssequencias: ["Sockets"], progressao: ["Explicar"], processo: context.referenciaProcesso } }),
  error => error.code === "invalid_authoring_process_reference");
});

test("mandato padrão mantém aprovação curricular obrigatória e conflito da referência bloqueia", async () => {
  const plan = autonomousDraftPlan();
  const defaultAdapter = autonomousPartAdapter(plan, {
    reviewPoints: defaultAuthoringProcessPreferences().reviewPoints
  });
  const draftError = await executeHumanCourseTask({
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
  }).then(() => null, error => error);
  assert.equal(draftError.code, "curricular_map_not_approved");
  assert.match(draftError.message, /rascunho/u);
  assert.match(draftError.message, /autonomia explícita/u,
    "o rascunho sem mandato nomeia a autonomia expressa sem exigir aprovação incondicional");
  assert.doesNotMatch(draftError.message, /aprovado pela pessoa/u);
  assert.equal(defaultAdapter.saved.length, 0);

  const absentPlan = autonomousDraftPlan();
  absentPlan.plan.curriculumMapStatus = "absent";
  const absentAdapter = autonomousPartAdapter(absentPlan);
  const absentError = await executeHumanCourseTask({ adapter: absentAdapter, principal: PRINCIPAL, name: "salvar_parte",
    rawArguments: { curso: "Curso autônomo", titulo: "Lote sem mapa", intencao: "Relacionar processo e transporte.",
      microssequencias: ["Sockets"], progressao: ["Explicar a relação."] } }).then(() => null, error => error);
  assert.equal(absentError.code, "curricular_map_not_approved");
  assert.match(absentError.message, /construa e salve o mapa/u,
    "sem mapa, a recuperação manda construir e salvar antes de produzir");
  assert.doesNotMatch(absentError.message, /aprove/iu);
  assert.equal(absentAdapter.saved.length, 0);

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

test("autonomia explícita na produção dispensa a referência sem aprovar o mapa", async () => {
  const adapter = autonomousPartAdapter(autonomousDraftPlan());
  const saved = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "salvar_parte",
    rawArguments: { curso: "Curso autônomo", titulo: "Lote autônomo", intencao: "Relacionar processo e transporte.",
      microssequencias: ["Sockets"], progressao: ["Explicar a relação."], autonomo: true } });
  assert.deepEqual(saved.context.processoCorrente.pontosDeRevisao, []);
  assert.equal(typeof saved.context.referenciaProcesso, "string");
  assert.equal(adapter.saved.length, 1);
  assert.equal(adapter.saved[0].allowDraftMap, true);
  assert.equal(adapter.saved[0].approved, undefined);
  const prepared = await executeHumanCourseTask({ adapter, principal: PRINCIPAL, name: "preparar_materializacao",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()], autonomo: true } });
  assert.equal(prepared.context.preflight.state, "ready", JSON.stringify(prepared.context.preflight.blockers));
  assert.equal(prepared.context.preflight.blockers.some(({ code }) => code === "human_materialization_map_approval_required"), false);
  assert.equal(adapter.approvals.length, 0, "autonomia não registra aprovação humana");
  assert.equal(adapter.globalPreferenceWrites.length, 0, "autonomia não altera as preferências da conta");
  assert.deepEqual((await adapter.getAuthoringProcessPreferences()).preferences.reviewPoints,
    defaultAuthoringProcessPreferences().reviewPoints);
});

test("autonomia explícita recusa processo simultâneo nas operações de produção", async () => {
  const adapter = autonomousPartAdapter(autonomousDraftPlan());
  const cases = [
    ["salvar_parte", { curso: "Curso autônomo", titulo: "Lote", intencao: "Relacionar.",
      microssequencias: ["Sockets"], progressao: ["Explicar."] }],
    ["preparar_materializacao", { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()] }],
    ["materializar_parte", { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()] }]
  ];
  for (const [name, rawArguments] of cases) {
    await assert.rejects(() => executeHumanCourseTask({ adapter, principal: PRINCIPAL, name,
      rawArguments: { ...rawArguments, autonomo: true, processo: adapter.processo } }),
    error => error.code === "invalid_human_task_argument");
  }
  assert.equal(adapter.saved.length, 0);
  assert.equal(adapter.approvals.length, 0);
});

test("autonomia explícita preserva condição fixada e ainda exige conciliação de conflito", async () => {
  const fixed = autonomousPartAdapter(autonomousDraftPlan(), { mutateDesign: design => {
    const parameter = design.parameters.find(({ parameterId }) => parameterId === "authoring_part_microsequence_target");
    parameter.effectiveAssignment = { mode: "fixed", value: 2, origin: "author",
      reason: "Condição fixada pela autoria.", sourceScope: { kind: "course", ref: COURSE_ID }, inherited: false };
  } });
  const saved = await executeHumanCourseTask({ adapter: fixed, principal: PRINCIPAL, name: "salvar_parte",
    rawArguments: { curso: "Curso autônomo", titulo: "Lote condicionado", intencao: "Relacionar.",
      microssequencias: ["Sockets"], progressao: ["Explicar."], autonomo: true } });
  const parameter = saved.context.processoCorrente.parametros
    .find(({ campo }) => campo === "alvo_microssequencias_por_parte");
  assert.equal(parameter.modo, "fixed");
  assert.equal(parameter.valor, 2);
  assert.equal(saved.context.exigeConciliacao, false);
  assert.equal(fixed.saved.length, 1);

  const conflicted = autonomousPartAdapter(autonomousDraftPlan(), { mutateDesign: design => {
    design.parameters.find(({ parameterId }) => parameterId === "authoring_part_microsequence_target")
      .conflicts = [{
        fixedScope: { kind: "course", ref: COURSE_ID },
        fixedValue: 2,
        exceptionScope: { kind: "lesson", ref: "70000000-0000-4000-8000-000000000001" },
        exceptionValue: 3
      }];
  } });
  const blocked = await executeHumanCourseTask({ adapter: conflicted, principal: PRINCIPAL, name: "preparar_materializacao",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()], autonomo: true } });
  assert.equal(blocked.context.preflight.state, "blocked");
  assert.ok(blocked.context.preflight.blockers.some(({ code }) => code === "authoring_process_conflict"),
    "autonomia não concilia condições incompatíveis do recorte");
  await assert.rejects(() => executeHumanCourseTask({ adapter: conflicted, principal: PRINCIPAL, name: "materializar_parte",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()], autonomo: true } }),
  error => error.code === "authoring_process_conflict");
  assert.equal(conflicted.saved.length, 0);
  assert.equal(conflicted.approvals.length, 0);
});

test("bloqueio da primeira Parte discrimina mapa ausente de rascunho sem exigir aprovação incondicional", async () => {
  const draft = autonomousPartAdapter(autonomousDraftPlan());
  const draftError = await executeHumanCourseTask({ adapter: draft, principal: PRINCIPAL, name: "materializar_parte",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()] } })
    .then(() => null, error => error);
  assert.equal(draftError.code, "curricular_map_not_approved");
  assert.match(draftError.message, /rascunho/u);
  assert.match(draftError.message, /autonomia explícita/u);
  assert.doesNotMatch(draftError.message, /aprovado pela pessoa/u);
  assert.equal(draft.saved.length, 0);

  const absentPlan = autonomousDraftPlan();
  absentPlan.plan.curriculumMapStatus = "absent";
  const absent = autonomousPartAdapter(absentPlan);
  const absentError = await executeHumanCourseTask({ adapter: absent, principal: PRINCIPAL, name: "materializar_parte",
    rawArguments: { curso: "Curso autônomo", microssequencia: "Sockets", unidades: [autonomousCandidate()] } })
    .then(() => null, error => error);
  assert.equal(absentError.code, "curricular_map_not_approved");
  assert.match(absentError.message, /construa e salve o mapa/u);
  assert.doesNotMatch(absentError.message, /aprove/iu);
  assert.equal(absent.saved.length, 0);
});
