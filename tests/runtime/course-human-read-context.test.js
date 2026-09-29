import test from "node:test";
import assert from "node:assert/strict";
import {
  openHumanReadContinuation,
  paginateHumanReadContext
} from "../../supabase/functions/_shared/aralearn-authoring/courseHumanReadContext.js";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { shareHumanAuditContext } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanAuditContext.js";
import { projectPedagogicalAudit } from "../../src/domain/coursePedagogicalAudit.js";
import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from "../../src/domain/courseDesignParameters.js";
import { createContentReviewReference, openContentReviewReference } from "../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js";
import { normalizeMicrosequenceExplanation } from "../../src/domain/courseExplanation.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";
import { largeObservationComparison } from "../helpers/largeObservationComparisonFixture.js";
import { bpmnInstance } from "../helpers/bpmnFixture.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import { createAuthoringActionHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseActionServer.js";
import { encodeCourseActionTaskRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseActionBindings.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  COURSE_AUTHORING_DELIVERY_CORE,
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

const COURSE = { id: "10000000-0000-4000-8000-000000000001", revision: 7 };
const OTHER_COURSE = "10000000-0000-4000-8000-000000000002";
const PART = "30000000-0000-4000-8000-000000000001";
const OTHER_PART = "30000000-0000-4000-8000-000000000002";
const TITLE = "Leitura literal";
const PRINCIPAL = { actorId: "20000000-0000-4000-8000-000000000001", scopes: ["authoring:read"] };
const ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://project.example/functions/v1/aralearn-authoring-action";
const MCP_URL = "https://project.example/functions/v1/aralearn-authoring-mcp";
const encodeCursor = value => Buffer.from(JSON.stringify(value)).toString("base64url");
const execute = (adapter, name, args) => executeHumanCourseTask({
  adapter, principal: PRINCIPAL, name, rawArguments: { curso: TITLE, ...args }
});

async function readLogicalPage(adapter, name, args = {}) {
  let continuation = args.continuacao, literal = "", calls = 0;
  while (true) {
    const read = await execute(adapter, name, { ...args,
      ...(continuation ? { continuacao: continuation } : {}) });
    calls++;
    const { fragmento, continuacao, temMais } = read.context;
    assert.ok(JSON.stringify(read.context).length <= 12_000);
    assert.ok(Buffer.byteLength(JSON.stringify(read.context)) <= 16 * 1024);
    if (!fragmento) return { ...read, calls };
    assert.equal(fragmento.inicio, literal.length);
    assert.ok(fragmento.fim > fragmento.inicio);
    literal += fragmento.texto;
    assert.equal(fragmento.fim, literal.length);
    assert.ok(calls <= Math.ceil(fragmento.total / 1000) + 1, "a página lógica termina sem repetir fragmentos");
    if (fragmento.fim === fragmento.total) return { ...read, calls,
      context: { ...JSON.parse(literal), continuacao, temMais } };
    assert.ok(continuacao);
    continuation = continuacao;
  }
}

function resolveAuditUnits(context, audit) {
  if (Object.hasOwn(audit, "units")) return audit.units;
  const focus = context.auditoriasPedagogicas.find(item => item.foco === audit.foco);
  return audit.unidadesParaConfronto.map(position => {
    const unit = focus.unidadesParaConfronto[position - 1];
    assert.ok(unit, "posição resolvida no mesmo foco e página lógica");
    const { declarado, tarefaApresentada, ...rest } = unit.observation;
    return { ...unit, observation: { ...rest, ...declarado, ...tarefaApresentada } };
  });
}

function fixture({ units = [], sources = [], totalUnits = units.length } = {}) {
  const calls = { units: [], sources: [], annotations: [], reviews: [], inspections: [] };
  const adapter = {
    calls, revision: COURSE.revision, publicAppUrl: "https://app.example/",
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async resolveActionPrincipal() { return { ...PRINCIPAL, authenticationKind: "action" }; },
    async listCourses() {
      return { items: [{ courseId: COURSE.id, title: TITLE },
        { courseId: OTHER_COURSE, title: "Outro curso" }], hasMore: false, nextCursor: null };
    },
    async getCourse({ courseId }) {
      return { courseId, revision: adapter.revision, title: courseId === COURSE.id ? TITLE : "Outro curso" };
    },
    async getCourseInstructionalPlan() {
      return { courseRevision: adapter.revision, plan: { title: TITLE, parts: [] } };
    },
    async getAuthoringProcessPreferences() {
      return { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
        updatedAt: null, preferences: defaultAuthoringProcessPreferences() };
    },
    async getCourseDesign({ courseId, scopeKind = "course", scopeRef }) {
      return courseDesignFixture({ courseId, moduleId: "module", lessonId: "lesson",
        microsequenceId: scopeKind === "didactic_microsequence" ? scopeRef : "ms",
        studyUnitId: scopeKind === "study_unit" ? scopeRef : "unit-1"
      }, { scope: scopeKind, revision: adapter.revision });
    },
    async getCourseContentReview(input) {
      calls.reviews.push(input);
      const { courseId, targetKind, targetId } = input;
      const unit = units.find(item => item.studyUnit.id === targetId);
      return { contract: "aralearn.course-content-review.v1", courseId,
        courseRevision: adapter.revision, targetKind, targetId, entityVersion: unit?.version ?? 1,
        basisHash: "a".repeat(64), contentReview: { state: "draft" }, reviewPolicy: "saved" };
    },
    async getCourseContentInspection(input) {
      calls.inspections.push(input);
      const { courseId, targetKind, targetId } = input;
      return { contract: "aralearn.course-ai-inspection.v1", courseId,
        courseRevision: adapter.revision, targetKind, targetId, basisHash: "b".repeat(64),
        inspection: { state: "unregistered", basisHash: "b".repeat(64) } };
    },
    async listCourseStudyUnits(input) {
      calls.units.push(input);
      const start = input.cursorStudyUnitId === null ? 0 : Number(input.cursorStudyUnitId.split("-").at(-1));
      const items = units.slice(start, start + input.limit);
      const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < totalUnits,
        nextCursor: end < totalUnits ? { studyUnitId: `unit-${end}` } : null };
    },
    async getCourseSources(input) {
      calls.sources.push(input);
      const start = input.cursor === null ? 0 : Number(input.cursor.split("-").at(-1));
      const items = sources.slice(start, start + input.limit);
      const end = start + items.length;
      return { items: structuredClone(items), nextCursor: end < sources.length ? `source-${end}` : null };
    },
    async getCourseAnchoredAnnotations(input) {
      calls.annotations.push(input);
      return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null };
    }
  };
  return adapter;
}

function studyUnit(index, text = "O pacote conserva exatamente o texto, a ordem e os identificadores.") {
  return { ordinal: index, version: 4, studyUnit: {
    id: `unit-${index}`, version: 4, title: `Unidade ${index}`, kind: "theory",
    content: [{ id: `sequence-${index}`, package: "aralearn.resource.step_sequence", version: "1.0.0",
      data: { title: "Mudança de estado", steps: [{ id: "state-a", title: "Estado inicial", text },
        { id: "state-b", title: "Estado final", text: "β → 中" }] } },
    { id: `code-${index}`, package: "aralearn.resource.code", version: "1.0.0",
      data: { language: "json", code: JSON.stringify({ payload: { id: "literal-id", version: 2, steps: ["α", "β"] } }) } }],
    response: null, feedback: []
  }, authorship: { payload: { requestId: "literal-json-field", steps: [{ version: 3 }] } } };
}

async function channelCall(channel, adapter, name, args) {
  const handler = channel === "actions"
    ? createAuthoringActionHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
      actionBaseUrl: ACTION_URL, publicAppUrl: adapter.publicAppUrl })
    : createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
      resourceUrl: MCP_URL, authorizationServer: "https://project.example/auth/v1" });
  const action = channel === "actions" ? encodeCourseActionTaskRequest(name, args) : null;
  const body = channel === "actions" ? action.arguments
    : { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } };
  const response = await handler(new Request(channel === "actions" ? `${ACTION_URL}/${action.operationName}` : MCP_URL, {
    method: "POST", headers: { Origin: ORIGIN, Authorization: "Bearer synthetic-local-token",
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION }, body: JSON.stringify(body)
  }));
  const envelope = await response.text();
  const payload = JSON.parse(envelope);
  return { status: response.status, envelope,
    value: channel === "actions" ? payload : payload.result?.structuredContent, payload };
}

function materializationPreparationFixture(blocks = 32) {
  const adapter = fixture();
  const support = normalizeMicrosequenceExplanation({ title: "Explicação sintética de carga", content: Array.from({ length: blocks }, (_, index) => ({
    id: `p-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0", data: {
      text: `Seção ${index + 1}. ` + "Uma interface é um ponto de conexão; um host pode possuir mais de uma interface. ".repeat(48)
    }
  })) });
  const microsequence = { id: "ms", title: "Interfaces", goal: "Relacionar host e interface.", productionPosition: 0,
    explanation: support, explanationPlan: { purpose: "Explicitar a relação.", prerequisites: [], relations: [], sourceIds: [] }, contentReview: { state: "draft" } };
  const plan = { title: TITLE, curriculumMapStatus: "approved", instructionalAnalysisUnits: [], evidenceRequirements: [], curriculumScopeItems: [],
    curriculum: { modules: [{ lessons: [{ microsequences: [microsequence] }] }] },
    parts: [{ id: PART, position: 0, title: "Interfaces", intent: "Relacionar conceitos.", microsequences: [microsequence] }] };
  adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision, plan: structuredClone(plan) });
  return { adapter, support, plan };
}

test("comparação maior que 1 MiB atravessa MCP e Actions por fragmentos literais pequenos", async () => {
  const annotationId = '30000000-0000-4000-8000-000000000001';
  const comparison = largeObservationComparison({ courseId: COURSE.id, courseRevision: COURSE.revision, annotationId });
  const reference = { annotationId, annotationVersion: 2, targetSetVersion: 1, targetKind: 'study_unit', targetId: 'unit-a' };
  for (const channel of ['actions', 'mcp']) {
    const adapter = fixture();
    adapter.getCourseObservationComparison = async () => comparison;
    let continuation; let literal = ''; let pages = 0;
    do {
      const response = await channelCall(channel, adapter, 'preparar_revisao', { curso: TITLE, comparacao: reference,
        ...(continuation ? { continuacao: continuation } : {}) });
      assert.equal(response.status, 200);
      assert.ok(response.envelope.length < 100000);
      assert.equal(response.value.context.fragmento.formato, 'application/json');
      literal += response.value.context.fragmento.texto;
      continuation = response.value.context.continuacao;
      pages++;
      assert.ok(pages < 200);
    } while (continuation);
    assert.ok(pages > 30);
    assert.deepEqual(JSON.parse(literal).comparacaoDeObservacao, comparison);
  }
});

test("planejamento grande tem resumo recuperável, foco local e leitura integral limitada nos dois canais", async () => {
  for (const channel of ["actions", "mcp"]) {
    const { adapter, plan } = materializationPreparationFixture(1);
    Object.assign(plan, { curriculumMapStatus: "draft", audience: "Iniciantes", declaredPrerequisites: [] });
    const lesson = plan.curriculum.modules[0].lessons[0];
    Object.assign(plan.curriculum.modules[0], { title: "Módulo", objective: "Objetivo" });
    Object.assign(lesson, { title: "Lição", objective: "Objetivo" });
    const focal = lesson.microsequences[0];
    focal.objective = "Relacionar interfaces";
    plan.curriculumScopeItems = [{ id: "shared-scope", statement: "Cobertura compartilhada" }];
    focal.scopeItemIds = ["shared-scope"];
    for (let i = 0; i < 160; i++) lesson.microsequences.push({ id: `other-${i}`, title: `Outro ${i}`,
      objective: "Conteúdo alheio ao foco. ".repeat(100), dependencies: [], scopeItemIds: ["shared-scope"] });
    plan.parts.push({ id: OTHER_PART, position: 1, title: "Lote alheio", intent: "Conteúdo alheio ao foco.",
      microsequences: lesson.microsequences.slice(1) });
    adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision,
      mapApprovalReference: `persisted-map-${adapter.revision}`, plan: structuredClone(plan) });
    const summary = await channelCall(channel, adapter, "consultar_planejamento", { curso: TITLE, resumo: true });
    assert.equal(summary.status, 200, summary.envelope);
    assert.ok(summary.envelope.length < 4000);
    assert.equal(summary.value.context.referenciaParaAprovar, "persisted-map-7");
    const readFocus = async (name, args) => {
      let continuation, literal = "";
      for (let page = 0; page < 5; page++) {
        const read = await channelCall(channel, adapter, name, { ...args,
          ...(continuation ? { continuacao: continuation } : {}) });
        assert.equal(read.status, 200, read.envelope);
        assert.ok(read.envelope.length < 16000);
        assert.doesNotMatch(read.envelope, /Conteúdo alheio|Outro 159|Lote alheio/u);
        if (!read.value.context.fragmento) return read.value.context;
        assert.equal(read.value.context.fragmento.inicio, literal.length);
        literal += read.value.context.fragmento.texto;
        continuation = read.value.context.continuacao;
        if (!continuation) return JSON.parse(literal);
      }
      assert.fail("O foco não deve percorrer os outros 160 ramos.");
    };
    for (const name of ["consultar_planejamento", "retomar_curso"]) {
      const args = name === "retomar_curso" ? { titulo: TITLE } : { curso: TITLE };
      const focused = await readFocus(name, { ...args, microssequencia: "Interfaces" });
      assert.deepEqual(focused.cobertura[0].previstaEm.map(item => item.microssequencia), ["Interfaces"]);
      const partRead = await readFocus(name, { ...args, parte: 1 });
      assert.deepEqual(partRead.parteEmFoco.microssequencias.map(item => item.titulo), ["Interfaces"]);
    }
    let continuation, literal = "", calls = 0;
    do {
      const read = await channelCall(channel, adapter, "consultar_planejamento", { curso: TITLE,
        ...(continuation ? { continuacao: continuation } : {}) });
      assert.equal(read.status, 200, read.envelope);
      assert.ok(Buffer.byteLength(read.envelope) < 20000);
      assert.equal(read.value.context.fragmento.inicio, literal.length);
      literal += read.value.context.fragmento.texto;
      continuation = read.value.context.continuacao;
      assert.ok(++calls < 100);
    } while (continuation);
    const restored = JSON.parse(literal);
    assert.equal(restored.mapaCurricular.modulos[0].licoes[0].microssequencias.length, 161);
    assert.equal(restored.mapaCurricular.modulos[0].licoes[0].microssequencias[160].objetivo, lesson.microsequences[160].objective);
  }
});

test("vínculos da Explicação conservam referências humanas e paginação nos dois transportes", async () => {
  const anchors = Array.from({ length: 8 }, (_, index) => ({ anchorId: `private-anchor-${index}`,
    status: "active", humanLocator: `seção ${index + 1}`, verificationExcerpt: "Trecho sintético α. ".repeat(90),
    selector: { kind: "whole_source" }, needsReverification: false }));
  const sources = ["Fonte conceitual", "Fonte de comparação"].map((title, index) => ({
    sourceId: `private-source-${index}`, title, citationText: `${title}. Citação sintética.`, status: "active", anchors
  }));
  const links = Array.from({ length: 32 }, (_, index) => ({ linkId: `private-link-${index}`,
    sourceId: sources[index % 2].sourceId, relation: "quoted_from", roles: ["recommended_reading"],
    anchors: anchors.map(({ anchorId }) => ({ anchorId })), occurrences: [] }));
  const outputs = [];
  for (const channel of ["actions", "mcp"]) {
    const { adapter, support } = materializationPreparationFixture(1);
    adapter.listCourseEntities = async () => ({ items: [{ entityType: "microsequence", entityId: "ms",
      version: 1, content: { title: "Interfaces", explanation: support } }], hasMore: false, nextCursor: null });
    adapter.getCourseSources = async input => ({ items: input.mode === "target"
      ? [{ targetKind: "microsequence_explanation", targetId: "ms", sourceLinks: links }]
      : sources.filter(source => source.sourceId === input.sourceId), nextCursor: null });
    let continuation, literal = "", calls = 0;
    do {
      const response = await channelCall(channel, adapter, "consultar_fontes", { curso: TITLE, explicacao: "Interfaces",
        ...(continuation ? { continuacao: continuation } : {}) });
      assert.equal(response.status, 200, response.envelope);
      assert.ok(response.envelope.length < 99_999);
      assert.equal(response.value.context.fragmento.inicio, literal.length);
      literal += response.value.context.fragmento.texto;
      continuation = response.value.context.continuacao;
      assert.ok(++calls <= links.length * anchors.length);
    } while (continuation);
    assert.ok(calls > 1);
    assert.doesNotMatch(literal, /private-source|private-link|private-anchor|sourceId|linkId|anchorId|requestId/u);
    const output = JSON.parse(literal).sources.items[0].sourceLinks;
    assert.equal(output.length, 32);
    assert.deepEqual(output.map(link => link.posicao), Array.from({ length: 32 }, (_, index) => index + 1));
    assert.equal(output[1].fonte.titulo, "Fonte de comparação");
    assert.equal(output[1].anchors[7].posicao, 8);
    assert.equal(output[1].anchors[7].verificationExcerpt, anchors[7].verificationExcerpt);
    outputs.push(output);
  }
  assert.deepEqual(outputs[0], outputs[1]);
});

function focalCandidate() {
  return {
    microssequencia: "Interfaces",
    posicao: 1,
    conteudo: {
      title: "Introdução focal",
      role: "theory",
      content: [{
        id: "focal-text",
        package: "aralearn.resource.paragraph",
        version: "1.0.0",
        data: { text: "Uma interface é um ponto de conexão de um host." }
      }],
      response: null,
      feedback: [],
      topics: ["interfaces"]
    },
    aplicacaoPedagogica: {
      ideiasIntroduzidas: [],
      ideiasUtilizadas: [],
      explicacoes: [],
      praticas: [],
      cobertura: []
    },
    fontes: []
  };
}

test("preparo focal verifica o candidato sem reexportar apoio ou repertório extenso", async () => {
  for (const channel of ["actions", "mcp"]) {
    const { adapter, support, plan } = materializationPreparationFixture();
    plan.instructionalAnalysisUnits = Array.from({ length: 32 }, (_, index) => ({
      id: `available-${index}`,
      position: index,
      statement: `Ideia disponível ${index + 1}`,
      description: "Descrição extensa alheia ao diagnóstico focal. ".repeat(120),
      introducedAt: null,
      usedBy: [],
      revisitedBy: []
    }));
    const read = await channelCall(channel, adapter, "preparar_materializacao", {
      curso: TITLE,
      unidades: [focalCandidate()]
    });
    assert.equal(read.status, 200, read.envelope);
    assert.ok(read.envelope.length < 20000, `${channel}: o preparo deve permanecer pequeno`);
    assert.equal(Object.hasOwn(read.value.context, "fragmento"), false);
    assert.equal(Object.hasOwn(read.value.context, "continuacao"), false);
    assert.equal(Object.hasOwn(read.value.context, "explicacoes"), false);
    assert.equal(Object.hasOwn(read.value.context.parte, "repertorioDisponivelDoCurso"), false);
    assert.doesNotMatch(read.envelope, new RegExp(support.content.at(-1).data.text.slice(0, 80), "u"));
    assert.doesNotMatch(read.envelope, /Descrição extensa alheia ao diagnóstico focal/u);
  }
});

test("preparo recebe exatamente o mesmo candidato usado pela escrita", async () => {
  for (const channel of ["actions", "mcp"]) {
    const { adapter } = materializationPreparationFixture(1);
    const candidate = focalCandidate();
    const read = await channelCall(channel, adapter, "preparar_materializacao", {
      curso: TITLE,
      unidades: [candidate]
    });
    assert.equal(read.status, 200, read.envelope);
    assert.ok(read.value.context.preflight);
    assert.equal(read.value.context.parte.titulo, "Interfaces");
    assert.equal(Object.hasOwn(read.value.context, "temMais"), false);
  }
});

test("continuação liga tarefa, consulta, curso e revisão; argumentos reordenados conservam a leitura", async () => {
  const args = { curso: TITLE, busca: "IPA" };
  const state = await openHumanReadContinuation({ args, course: COURSE, task: "consultar_fontes" });
  const first = await paginateHumanReadContext({ sources: { items: [] } }, { state, nextPage: "source-24" });
  const reopened = await openHumanReadContinuation({
    args: { busca: "IPA", curso: TITLE, continuacao: first.continuacao }, course: COURSE, task: "consultar_fontes"
  });
  assert.equal(reopened.p, "source-24");
  for (const changed of [
    { course: { ...COURSE, id: OTHER_COURSE } },
    { course: { ...COURSE, revision: 8 } },
    { args: { curso: TITLE, busca: "Outro recorte" } },
    { task: "preparar_revisao" }
  ]) {
    await assert.rejects(() => openHumanReadContinuation({ course: COURSE, task: "consultar_fontes", ...changed,
      args: { ...(changed.args ?? args), continuacao: first.continuacao } }),
    error => error.status === 409 && error.code === "human_read_context_changed");
  }
});

test("continuação conserva consulta com objetos aninhados reordenados, mas rejeita listas ou valores alterados", async () => {
  const args = { curso: TITLE, parte: 1, unidades: [{ titulo: "Prática", resposta: { tipo: "escolha", opcoes: ["A", "B"] } }] };
  const state = await openHumanReadContinuation({ args, course: COURSE, task: "preparar_revisao" });
  const first = await paginateHumanReadContext({ text: "x".repeat(20_000) }, { state });
  const reordered = { curso: TITLE, parte: 1, unidades: [{ resposta: { opcoes: ["A", "B"], tipo: "escolha" }, titulo: "Prática" }] };
  const resumed = await openHumanReadContinuation({ args: { ...reordered, continuacao: first.continuacao },
    course: COURSE, task: "preparar_revisao" });
  assert.equal(resumed.o, first.fragmento.fim);
  for (const changed of [
    { ...reordered, unidades: [{ resposta: { opcoes: ["B", "A"], tipo: "escolha" }, titulo: "Prática" }] },
    { ...reordered, unidades: [{ resposta: { opcoes: ["A", "B"], tipo: "escolha" }, titulo: "Outra prática" }] },
    { curso: TITLE, parte: 1 }
  ]) {
    await assert.rejects(() => openHumanReadContinuation({ args: { ...changed, continuacao: first.continuacao },
      course: COURSE, task: "preparar_revisao" }), { code: "human_read_context_changed" });
  }
});

test("continuações malformadas falham com 422 e mensagem sem conteúdo do cursor", async () => {
  const args = { curso: TITLE };
  const state = await openHumanReadContinuation({ args, course: COURSE, task: "preparar_revisao" });
  for (const cursor of ["", "not-json_PRIVATE_SENTINEL", "a".repeat(4097), encodeCursor([]),
    encodeCursor({ ...state, o: -1 }), encodeCursor({ ...state, p: {} }),
    encodeCursor({ ...state, h: "PRIVATE_SENTINEL" }), encodeCursor({ ...state, extra: true })]) {
    await assert.rejects(() => openHumanReadContinuation({ args: { ...args, continuacao: cursor },
      course: COURSE, task: "preparar_revisao" }), error => {
      assert.equal(error.status, 422);
      assert.equal(error.code, "invalid_read_continuation");
      assert.doesNotMatch(error.message, /PRIVATE_SENTINEL/u);
      return true;
    });
  }
});

test("fragmentos JSON preservam Unicode, aspas, escapes e limites de envelope sem cortar pares substitutos", async () => {
  const content = { studyUnits: [studyUnit(1, '𝄞😀漢字 العربية e\u0301 IPA /ɲ/ Wi\u2011Fi "aspas" \\ caminho\n'.repeat(8000))] };
  const literal = JSON.stringify(content);
  const args = { curso: TITLE };
  let cursor;
  let previousEnd = 0;
  const fragments = [];
  do {
    const state = await openHumanReadContinuation({ args: { ...args, ...(cursor ? { continuacao: cursor } : {}) },
      course: COURSE, task: "preparar_revisao" });
    const page = await paginateHumanReadContext(content, { state });
    const fragment = page.fragmento;
    assert.ok(fragment);
    assert.equal(fragment.formato, "application/json");
    assert.equal(fragment.inicio, previousEnd);
    assert.equal(fragment.total, literal.length);
    assert.equal(fragment.texto, literal.slice(fragment.inicio, fragment.fim));
    assert.equal(fragment.texto.isWellFormed(), true);
    assert.ok(fragment.fim > previousEnd);
    assert.ok(JSON.stringify({ result: "Leitura literal", deepLink: null, nextDecision: null, context: page }).length < 100_000);
    fragments.push(fragment.texto);
    previousEnd = fragment.fim;
    cursor = page.continuacao;
    assert.equal(page.temMais, cursor !== null);
    assert.ok(fragments.length < 100);
  } while (cursor);
  assert.ok(fragments.length > 2);
  assert.equal(fragments.join(""), literal);
  assert.deepEqual(JSON.parse(fragments.join("")), content);
});

test("fragmento pendente rejeita conteúdo alterado e só avança página depois do último trecho", async () => {
  const args = { curso: TITLE };
  const context = { text: "x".repeat(130_000) };
  const initial = await openHumanReadContinuation({ args, course: COURSE, task: "preparar_revisao" });
  const first = await paginateHumanReadContext(context, { state: initial, nextPage: "unit-12" });
  const state = await openHumanReadContinuation({ args: { ...args, continuacao: first.continuacao },
    course: COURSE, task: "preparar_revisao" });
  assert.equal(state.p, null);
  await assert.rejects(() => paginateHumanReadContext({ text: "y".repeat(130_000) }, { state, nextPage: "unit-12" }),
    error => error.status === 409 && error.code === "human_read_context_changed");
  let final = first, current = state, literal = first.fragmento.texto, calls = 1;
  while (final.fragmento.fim < final.fragmento.total) {
    assert.equal(current.p, null, "o cursor de backend não avança antes do último fragmento");
    final = await paginateHumanReadContext(context, { state: current, nextPage: "unit-12" });
    assert.equal(final.fragmento.inicio, literal.length);
    literal += final.fragmento.texto;
    assert.ok(++calls <= Math.ceil(JSON.stringify(context).length / 1000));
    current = await openHumanReadContinuation({ args: { ...args, continuacao: final.continuacao },
      course: COURSE, task: "preparar_revisao" });
  }
  assert.deepEqual(JSON.parse(literal), context);
  assert.equal(final.fragmento.fim, JSON.stringify(context).length);
  const next = await openHumanReadContinuation({ args: { ...args, continuacao: final.continuacao },
    course: COURSE, task: "preparar_revisao" });
  assert.equal(next.p, "unit-12");
  assert.equal(next.o, 0);
  assert.equal(next.h, null);
});

test("busca sem resultado nas primeiras 24 fontes oferece continuação para a fonte 25", async () => {
  const sources = Array.from({ length: 25 }, (_, i) => ({ title: i === 24 ? "Fonética IPA" : `Fonte ${i + 1}` }));
  const adapter = fixture({ sources });
  const first = await execute(adapter, "consultar_fontes", { busca: "IPA" });
  assert.deepEqual(first.context.sources.items, []);
  assert.equal(first.context.temMais, true);
  assert.match(first.result, /neste trecho/u);
  assert.equal(adapter.calls.sources.length, 1);
  const second = await execute(adapter, "consultar_fontes", { busca: "IPA", continuacao: first.context.continuacao });
  assert.deepEqual(second.context.sources.items, [sources[24]]);
  assert.equal(second.context.continuacao, null);
  assert.equal(second.context.temMais, false);
  assert.deepEqual(adapter.calls.sources.map(input => [input.cursor, input.limit, input.expectedRevision]),
    [[null, 24, 7], ["source-24", 24, 7]]);
});

test("lista autorizada revela o curso 13 e recusa a continuação em outra conta antes da consulta", async () => {
  const adapter = fixture();
  const calls = [];
  const courses = Array.from({ length: 13 }, (_, i) => ({ title: `Curso autorizado ${i + 1}` }));
  const nextCursor = { beforeId: "10000000-0000-4000-8000-000000000012", beforeUpdatedAt: "2026-09-05T12:00:00Z" };
  adapter.listCourses = async input => {
    calls.push(input);
    assert.equal(input.principal.actorId, PRINCIPAL.actorId);
    return input.beforeId === null ? { items: courses.slice(0, 12), hasMore: true, nextCursor }
      : { items: courses.slice(12), hasMore: false, nextCursor: null };
  };
  const read = (args, principal = PRINCIPAL) => executeHumanCourseTask({ adapter, principal,
    name: "retomar_curso", rawArguments: args });
  const first = await read({});
  assert.deepEqual(first.context.courses, courses.slice(0, 12));
  assert.equal(first.context.temMais, true);
  await assert.rejects(() => read({ continuacao: first.context.continuacao }, {
    ...PRINCIPAL, actorId: "20000000-0000-4000-8000-000000000002"
  }), error => error.status === 409 && error.code === "human_read_context_changed");
  assert.equal(calls.length, 1, "não consultar os cursos da outra conta com o cursor recebido");
  const second = await read({ continuacao: first.context.continuacao });
  assert.deepEqual(second.context.courses, courses.slice(12));
  assert.equal(second.context.temMais, false);
  assert.equal(second.context.continuacao, null);
  assert.deepEqual(calls.map(({ limit, beforeId, beforeUpdatedAt }) => ({ limit, beforeId, beforeUpdatedAt })),
    [{ limit: 12, beforeId: null, beforeUpdatedAt: null }, { limit: 12, ...nextCursor }]);
});

test("revisão lê uma página de 12, conserva cada studyUnit literal e remove maquinaria dos metadados", async () => {
  const units = Array.from({ length: 24 }, (_, i) => studyUnit(i + 1));
  const adapter = fixture({ units, totalUnits: 1200 });
  const first = await readLogicalPage(adapter, "preparar_revisao", { auditoria: true });
  assert.deepEqual(first.context.studyUnits.map(item => item.studyUnit), units.slice(0, 12).map(item => item.studyUnit));
  for (const item of first.context.studyUnits) {
    const metadata = { ...item };
    delete metadata.studyUnit;
    assert.deepEqual(Object.keys(metadata).sort(), ["authorship", "inspecaoIA", "ordinal", "referenciaInspecao", "referenciaRevisao", "revisao"]);
    assert.deepEqual(metadata.authorship, {});
    assert.equal(metadata.revisao, "Rascunho");
    assert.deepEqual(metadata.inspecaoIA, { state: "unregistered" });
    const inspection = openContentReviewReference(metadata.referenciaInspecao, PRINCIPAL);
    assert.equal(inspection.courseId, COURSE.id);
    assert.equal(inspection.targetKind, "study_unit");
    assert.equal(inspection.targetId, item.studyUnit.id);
    assert.equal(inspection.basisHash, "b".repeat(64));
    assert.match(metadata.referenciaRevisao, /^[A-Za-z0-9_-]+$/u);
    assert.doesNotMatch(JSON.stringify(metadata), /literal-json-field|requestId|payload|steps|version/u);
  }
  assert.equal(adapter.calls.units.length, first.calls, "cada fragmento relê somente a mesma página lógica");
  assert.ok(adapter.calls.units.every(input => input.cursorStudyUnitId === null), "não varrer as cem páginas do curso");
  assert.equal(adapter.calls.units[0].limit, 12);
  assert.equal(adapter.calls.units[0].expectedRevision, 7);
  assert.deepEqual(adapter.calls.annotations.map(input => input.query.hierarchy.target.id),
    Array.from({ length: first.calls }, () => units.slice(0, 12).map(item => item.studyUnit.id)).flat());
  assert.deepEqual(adapter.calls.reviews.map(({ courseId, targetKind, targetId }) => ({ courseId, targetKind, targetId })),
    Array.from({ length: first.calls }, () => units.slice(0, 12).map(item => ({ courseId: COURSE.id,
      targetKind: "study_unit", targetId: item.studyUnit.id }))).flat());
  assert.deepEqual(adapter.calls.inspections, adapter.calls.reviews);
  const second = await readLogicalPage(adapter, "preparar_revisao", { auditoria: true,
    continuacao: first.context.continuacao });
  assert.deepEqual(second.context.studyUnits.map(item => item.studyUnit), units.slice(12).map(item => item.studyUnit));
  assert.ok(second.context.studyUnits.every(item => Object.keys(item.authorship).length === 0));
  assert.deepEqual(adapter.calls.units.map(input => input.cursorStudyUnitId),
    [...Array(first.calls).fill(null), ...Array(second.calls).fill("unit-12")]);
  assert.equal(adapter.calls.annotations.length, (first.calls + second.calls) * 12);
  assert.equal(adapter.calls.reviews.length, (first.calls + second.calls) * 12);
  assert.equal(adapter.calls.inspections.length, (first.calls + second.calls) * 12);
});

test("revisão inclui um apoio literal por microssequência, com proposta e situação separadas", async () => {
  const units = [studyUnit(1), studyUnit(2)].map(unit => ({ ...unit,
    curriculumPath: { didacticMicrosequence: { id: "ms", title: "Um avanço" } } }));
  const adapter = fixture({ units });
  const support = { title: "Relação completa", content: [{ id: "support", package: "aralearn.resource.paragraph",
    version: "1.0.0", data: { text: "Uma explicação compartilhada preserva este texto integral para as duas unidades." } }] };
  adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision, plan: { title: TITLE,
    parts: [{ id: PART, position: 0, title: "Lote", microsequences: [{ id: "ms", title: "Um avanço", position: 0,
      explanationPlan: { purpose: "Explicitar a relação", prerequisites: [], relations: ["Uma relação"], sourceIds: [] },
      explanation: support, contentReview: { state: "draft" } }] }] } });
  const read = await execute(adapter, "preparar_revisao", {});
  assert.equal(read.context.explicacoes.length, 1);
  assert.deepEqual(read.context.explicacoes[0].conteudo, support);
  assert.equal(read.context.explicacoes[0].proposta.proposito, "Explicitar a relação");
  assert.equal(read.context.explicacoes[0].revisao, "Rascunho");
  assert.equal(read.context.studyUnits.length, 2);
  assert.equal(adapter.calls.sources[0].targetKind, "microsequence_explanation");
});

function sourceReviewFixture() {
  const claims = ["A interseção \\(A \\cap B\\) reúne elementos comuns.",
    "Uma relação liga pares do domínio e do contradomínio.", "O próximo estado depende do estado atual."];
  const support = { title: "Relações e estados", content: claims.map((quote, index) => ({
    id: `raw-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
    data: { text: `Definição: ${quote} Confira.` }
  })) };
  const adapter = fixture();
  adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision, plan: { title: TITLE,
    parts: [{ id: PART, position: 0, title: "Lote", microsequences: [{ id: "ms", title: "Relações e estados",
      productionPosition: 0, explanation: support }] }] } });
  const details = [
    { sourceId: "logic", title: "Lógica sintética", citationText: "Autoria sintética. Lógica.",
      url: "https://example.test/logic.pdf", status: "active", anchors: [
        { anchorId: "unused", verificationExcerpt: "PRIVATE_UNSELECTED_EXCERPT" },
        { anchorId: "truth", status: "active", humanLocator: "Seção de tabelas-verdade",
          selector: { kind: "text_quote", exact: "A truth table lists truth values.", prefix: null, suffix: null },
          verificationExcerpt: "A truth table lists truth values.", needsReverification: false }
      ], attachments: [{ storagePath: "PRIVATE_STORAGE_PATH" }] },
    { sourceId: "relations", title: "Relações sintéticas", citationText: "Autoria sintética. Relações.",
      url: "https://example.test/relations.pdf", status: "active", anchors: [
        { anchorId: "page", status: "active", humanLocator: "Página 3", selector: { kind: "page_range", startPage: 3, endPage: 3 },
          verificationExcerpt: null, needsReverification: false }
      ] },
    { sourceId: "states", title: "Estados sintéticos", status: "active", anchors: [] }
  ];
  const links = details.map((source, index) => ({ sourceId: source.sourceId, linkId: `link-${index}`,
    relation: index === 2 ? "needs_verification" : "supported_by", roles: ["technical_conceptual"],
    anchors: index === 2 ? [] : [{ anchorId: index === 0 ? "truth" : "page" }],
    occurrences: [{ occurrenceId: `occurrence-${index}`, slot: "content", resourceId: `raw-${index}`, path: "text",
      quote: claims[index], prefix: "Definição: ", suffix: " Confira." }] }));
  adapter.getCourseSources = async input => {
    adapter.calls.sources.push(input);
    return { items: input.mode === "target" ? [{ targetKind: input.targetKind, targetId: input.targetId, sourceLinks: links }]
      : details.filter(source => source.sourceId === input.sourceId), nextCursor: null };
  };
  return { adapter, support, claims, details, links };
}

test("MCP entrega ocorrência e âncora selecionada juntas, inclusive divergência e fonte sem passagem demonstrada", async () => {
  const { adapter, support, claims } = sourceReviewFixture();
  const response = await channelCall("mcp", adapter, "preparar_revisao", { curso: TITLE });
  assert.equal(response.status, 200);
  const explanation = response.value.context.explicacoes[0];
  assert.deepEqual(explanation.conteudo, support, "a prévia não substitui os dados brutos citados");
  const links = explanation.fontes.items[0].sourceLinks;
  assert.deepEqual(links.map(link => link.occurrences[0].quote), claims);
  assert.ok(links.every(link => link.occurrences[0].prefix === "Definição: " && link.occurrences[0].suffix === " Confira."));
  assert.equal(links[0].anchors[0].posicao, 2, "somente a âncora selecionada chega no vínculo");
  assert.equal(links[0].anchors[0].seletor.trechoExato, "A truth table lists truth values.");
  assert.equal(links[0].anchors[0].verificationExcerpt, "A truth table lists truth values.");
  assert.equal(links[0].fonte.url, "https://example.test/logic.pdf");
  assert.deepEqual(links[0].evidencia, { located: true, issues: [] }, "localização estrutural não certifica a afirmação sobre interseção");
  assert.equal(links[1].fonte.titulo, "Relações sintéticas");
  assert.equal(links[1].fonte.url, "https://example.test/relations.pdf");
  assert.deepEqual(links[1].anchors[0].seletor, { tipo: "paginas", paginaInicial: 3, paginaFinal: 3 });
  assert.equal(links[1].anchors[0].verificationExcerpt, null);
  assert.equal(links[2].fonte.localizada, true);
  assert.deepEqual(links[2].anchors, []);
  assert.ok(links[2].evidencia.issues.includes("missing_anchor"));
  assert.ok(adapter.calls.sources.every(input => input.expectedRevision === COURSE.revision));
  assert.equal(adapter.calls.sources.filter(input => input.mode === "source").length, 3);
  assert.doesNotMatch(response.envelope, /PRIVATE_UNSELECTED_EXCERPT|PRIVATE_STORAGE_PATH|storagePath/u);
});

test("enriquecimento das fontes da revisão propaga revisão obsoleta e recusa de acesso", async () => {
  for (const code of ["stale_course_state", "course_revision_conflict", "access_denied"]) {
    const { adapter } = sourceReviewFixture();
    const read = adapter.getCourseSources;
    adapter.getCourseSources = async input => {
      if (input.mode === "source") throw Object.assign(new Error("Leitura recusada"), { code });
      return read(input);
    };
    await assert.rejects(() => execute(adapter, "preparar_revisao", {}), { code });
  }
});

test("revisão de unidade conserva base, citações associadas e orientação, filtrando somente units", async () => {
  const units = [studyUnit(1), studyUnit(2)];
  const adapter = fixture({ units: units.slice(0, 1) });
  const { details, links } = sourceReviewFixture();
  const citations = ["study_unit", "microsequence_explanation"].map((targetKind, index) => ({
    targetKind, targetId: index === 0 ? "unit-1" : "ms", targetTitle: index === 0 ? "Unidade 1" : "Explicação",
    links: [{ relation: links[index].relation, roles: links[index].roles, occurrences: links[index].occurrences,
      source: { title: details[index].title, citationText: details[index].citationText,
        url: details[index].url, status: details[index].status },
      anchors: details[index].anchors.filter(anchor => anchor.anchorId === links[index].anchors[0].anchorId)
        .map(anchor => ({ selector: anchor.selector, humanLocator: anchor.humanLocator,
          verificationExcerpt: anchor.verificationExcerpt, status: anchor.status, needsReverification: anchor.needsReverification })) }]
  }));
  const readInspection = adapter.getCourseContentInspection;
  adapter.getCourseContentInspection = async input => ({ ...await readInspection(input), pedagogicalBasis: {
    targetKind: input.targetKind, targetId: input.targetId,
    microsequence: { id: "ms", title: "Relações", goal: "Relacionar conjuntos e estados", explanation: { title: "Base compartilhada", content: [] } },
    planItems: [], dependencies: [{ title: "Pré-requisito", goal: "Distinguir elementos" }],
    studyUnits: units.map(unit => ({ id: unit.studyUnit.id, content: unit.studyUnit })), citations
  } });
  const response = await channelCall("mcp", adapter, "preparar_revisao", { curso: TITLE, auditoria: true });
  const context = response.value.context;
  const targetAudit = context.studyUnits[0].auditoriaPedagogica;
  assert.equal(context.auditoriasPedagogicas.length, 1);
  const shared = context.auditoriasPedagogicas.find(item => item.foco === targetAudit.foco);
  const audit = { ...targetAudit, instruction: shared.instruction, basis: { ...shared.basis, ...targetAudit.basis } };
  assert.equal(audit.basis.microsequence.goal, "Relacionar conjuntos e estados");
  assert.equal(audit.basis.dependencies[0].title, "Pré-requisito");
  assert.equal(audit.basis.studyUnits.length, 2, "o restante do percurso continua na base");
  assert.deepEqual(resolveAuditUnits(context, audit).map(unit => unit.observation.title), ["Unidade 1"]);
  assert.match(audit.instruction, /leitura crítica/u);
  assert.deepEqual(audit.basis.citations.map(citation => [citation.targetKind, citation.targetTitle]),
    [["study_unit", "Unidade 1"], ["microsequence_explanation", "Explicação"]]);
  assert.equal(audit.basis.citations[0].links[0].occurrences[0].quote, links[0].occurrences[0].quote);
  assert.equal(audit.basis.citations[0].links[0].anchors[0].verificationExcerpt, details[0].anchors[1].verificationExcerpt);
  assert.equal(audit.basis.citations[0].links[0].source.url, details[0].url);
  assert.equal(audit.basis.citations[1].links[0].anchors[0].verificationExcerpt, null);
  assert.deepEqual(adapter.calls.sources, [], "a base já associa as fontes; não pedir consultas para juntar IDs");
});

function focalAuditFixture({ unitCount = 3 } = {}) {
  const units = Array.from({ length: unitCount }, (_, index) => ({ ...studyUnit(index + 1),
    curriculumPath: { didacticMicrosequence: { id: index >= 2 ? "ms-b" : "ms-a", title: "Mesmo título" } } }));
  const adapter = fixture({ units });
  const microsequences = ["ms-a", "ms-b"].map((id, index) => ({ id, title: "Mesmo título", position: index,
    goal: `Objetivo ${index + 1}`, explanationPlan: { purpose: "Explicitar a relação", prerequisites: [], relations: [], sourceIds: [] },
    explanation: { title: "Explicação", content: [{ id: `paragraph-${id}`, package: "aralearn.resource.paragraph",
      version: "1.0.0", data: { text: `Base ${id}. ` + 'Texto literal 😀 α "citado".\n'.repeat(80) } }] },
    contentReview: { state: "draft" } }));
  adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision, plan: { title: TITLE,
    parts: [{ id: PART, position: 0, title: "Foco", microsequences }] } });
  const originalInspection = adapter.getCourseContentInspection;
  const inspections = new Map();
  adapter.getCourseContentInspection = async input => {
    const { targetKind, targetId } = input;
    const ms = microsequences.find(item => item.id === (targetKind === "microsequence_explanation" ? targetId
      : units.find(unit => unit.studyUnit.id === targetId).curriculumPath.didacticMicrosequence.id));
    const read = { ...await originalInspection(input), pedagogicalBasis: {
      targetKind, targetId, audience: null, microsequence: ms, planItems: [], dependencies: [],
      studyUnits: units.filter(unit => unit.curriculumPath.didacticMicrosequence.id === ms.id).map(unit => ({
        id: unit.studyUnit.id, content: unit.studyUnit, application: null,
        design: { parameters: { before_and_after: true, variation: ["case_or_data", "external_representation"] } }
      })),
      citations: [{ targetKind, targetId, targetTitle: targetId, links: [{
        source: { title: targetId, url: `https://example.test/${targetId}` },
        anchors: [{ selector: { kind: "text_quote", exact: `Passagem de ${targetId}.` },
          verificationExcerpt: null, humanLocator: "p. 2" }],
        occurrences: [{ quote: `Afirmação de ${targetId}.`, prefix: "😀", suffix: "\n" }]
      }] }], additionalContext: { literal: "Desconhecido preservado", empty: null }
    } };
    inspections.set(targetId, read);
    return read;
  };
  return { adapter, inspections };
}

test("revisão e retomada focal compartilham por identidade antes da projeção, com fontes próprias e paridade dos canais", async () => {
  for (const name of ["preparar_revisao", "retomar_curso"]) {
    const args = name === "retomar_curso" ? { titulo: TITLE, parte: "Foco" } : { curso: TITLE, auditoria: true };
    const channelPages = [];
    for (const channel of ["mcp", "actions"]) {
      const { adapter, inspections } = focalAuditFixture();
      let cursor, literal = "";
      const pages = [];
      do {
        const response = await channelCall(channel, adapter, name, { ...args, ...(cursor ? { continuacao: cursor } : {}) });
        assert.equal(response.status, 200);
        assert.ok(response.envelope.length < 100_000);
        assert.ok(JSON.stringify(response.value.context).length <= 12_000);
        assert.ok(Buffer.byteLength(JSON.stringify(response.value.context)) <= 16 * 1024);
        pages.push(response.value);
        const fragment = response.value.context.fragmento;
        if (!fragment) {
          assert.equal(name, "retomar_curso", "a inspeção formal atravessa a paginação do contexto compartilhado");
          break;
        }
        assert.equal(fragment.inicio, literal.length);
        literal += fragment.texto;
        cursor = response.value.context.continuacao;
      } while (cursor);
      const context = literal ? JSON.parse(literal) : pages.at(-1).context;
      if (name === "retomar_curso") {
        assert.equal(context.auditoriasPedagogicas, undefined, "a retomada focal não carrega a base de auditoria");
        for (const target of context.explicacoes) {
          assert.equal(Object.hasOwn(target, "auditoriaPedagogica"), false);
          assert.equal(Object.hasOwn(target, "referenciaInspecao"), false);
          assert.equal(Object.hasOwn(target, "conteudo"), true, "a retomada mantém a Explicação literal");
        }
        channelPages.push(pages);
        continue;
      }
      assert.equal(context.auditoriasPedagogicas.length, 2, "mesmo título conserva dois focos internos");
      assert.ok(context.auditoriasPedagogicas.every(item => !Object.hasOwn(item.basis.microsequence, "id")));
      for (const target of [...(context.studyUnits ?? []), ...context.explicacoes]) {
        const ref = openContentReviewReference(target.referenciaInspecao, PRINCIPAL);
        assert.equal(target.referenciaInspecao, await createContentReviewReference({ principal: PRINCIPAL, read: inspections.get(ref.targetId) }),
          "a referência opaca continua derivada da leitura canônica integral");
        assert.match(target.referenciaInspecao, /^[A-Za-z0-9_-]+$/u);
        const review = openContentReviewReference(target.referenciaRevisao, PRINCIPAL);
        assert.equal(review.targetId, ref.targetId);
        assert.equal(review.targetKind, ref.targetKind);
        assert.equal(ref.courseId, COURSE.id);
        const audit = target.auditoriaPedagogica;
        const shared = context.auditoriasPedagogicas.find(item => item.foco === audit.foco);
        assert.ok(shared);
        assert.equal(audit.basis.targetKind, ref.targetKind);
        assert.equal(audit.basis.citations.length, 1);
        assert.equal(audit.basis.citations[0].targetTitle, ref.targetId);
        const link = audit.basis.citations[0].links[0];
        assert.equal(link.source.url, `https://example.test/${ref.targetId}`);
        assert.equal(link.anchors[0].selector.exact, `Passagem de ${ref.targetId}.`);
        assert.equal(link.anchors[0].verificationExcerpt, null);
        assert.equal(link.occurrences[0].quote, `Afirmação de ${ref.targetId}.`);
        assert.equal(link.occurrences[0].suffix, "\n");
        assert.deepEqual(audit.basis.additionalContext, { literal: "Desconhecido preservado", empty: null });
        const expectedMs = ref.targetId === "unit-3" || ref.targetId === "ms-b" ? "ms-b" : "ms-a";
        assert.equal(shared.basis.microsequence.goal, expectedMs === "ms-b" ? "Objetivo 2" : "Objetivo 1");
        assert.equal(shared.basis.studyUnits.length, expectedMs === "ms-b" ? 1 : 2);
        assert.ok(shared.basis.studyUnits.every(unit => unit.application === null && unit.design.parameters.before_and_after === true));
        const expected = projectPedagogicalAudit(inspections.get(ref.targetId).pedagogicalBasis).units
          .filter(unit => ref.targetKind !== "study_unit" || unit.unitId === ref.targetId);
        assert.deepEqual(resolveAuditUnits(context, audit).map(unit => unit.observation), expected.map(unit => unit.observation));
        assert.equal(Object.hasOwn(audit, "units"), false);
        assert.equal(audit.unidadesParaConfronto.length, expected.length);
        assert.equal(shared.unidadesParaConfronto.length, shared.basis.studyUnits.length,
          "explicação e alvos reutilizam cada observação sem duplicar a vizinhança");
        for (const position of audit.unidadesParaConfronto) {
          const observation = shared.unidadesParaConfronto[position - 1].observation;
          assert.ok(Object.hasOwn(observation, "declarado"));
          assert.ok(Object.hasOwn(observation, "tarefaApresentada"));
          assert.equal(Object.hasOwn(observation.tarefaApresentada, "operation"), false);
        }
      }
      assert.ok(pages.length > 1);
      channelPages.push(pages);
    }
    assert.deepEqual(channelPages[0], channelPages[1]);
  }
});

test("MCP e Actions expõem BPMN inconsistente no alvo, preservam a base compartilhada e registram needs_attention", async () => {
  const channelContexts = [];
  for (const channel of ["mcp", "actions"]) {
    const { adapter, inspections } = focalAuditFixture();
    const withDiagram = (content, invalid) => ({ ...content, content: [...content.content, bpmnInstance({ invalid })] });
    const withUnitDiagram = content => ({ id: content.id, title: content.title, role: "theory",
      position: 1, topics: [], response: null, feedback: [], content: [bpmnInstance({ invalid: content.id === "unit-2" })] });
    const originalPlan = adapter.getCourseInstructionalPlan;
    adapter.getCourseInstructionalPlan = async () => {
      const plan = structuredClone(await originalPlan());
      for (const ms of plan.plan.parts[0].microsequences) ms.explanation = withDiagram(ms.explanation, ms.id === "ms-a");
      return plan;
    };
    const originalUnits = adapter.listCourseStudyUnits;
    adapter.listCourseStudyUnits = async input => {
      const page = await originalUnits(input);
      page.items = page.items.map(item => ({ ...item, studyUnit: withUnitDiagram(item.studyUnit) }));
      return page;
    };
    const originalInspection = adapter.getCourseContentInspection;
    adapter.getCourseContentInspection = async input => {
      const read = structuredClone(await originalInspection(input));
      const basis = read.pedagogicalBasis;
      basis.microsequence.explanation = withDiagram(basis.microsequence.explanation, basis.microsequence.id === "ms-a");
      basis.studyUnits = basis.studyUnits.map(unit => ({ ...unit, application: { practiceApplications: [] },
        content: withUnitDiagram(unit.content) }));
      basis.dependencies = [{ title: "Dependência fora do alvo", explanation: withDiagram({ content: [] }, true) }];
      inspections.set(input.targetId, read);
      return read;
    };
    adapter.resolvePrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] });
    adapter.resolveActionPrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "action", scopes: ["authoring:read", "authoring:write"] });
    let writes = 0;
    adapter.getCourseContentInspectionReceipt = async () => null;
    adapter.recordCourseContentInspection = async input => {
      writes++;
      assert.equal(input.expectedBasisHash, "b".repeat(64));
      assert.deepEqual(Object.keys(input).sort(), ["courseId", "deadlineAt", "expectedBasisHash", "principal", "report", "requestId", "targetId", "targetKind"]);
      return { ...inspections.get(input.targetId), inspection: { state: "current", basisHash: input.expectedBasisHash,
        inspectedAt: "2026-09-28T00:00:00Z", report: input.report } };
    };
    let cursor, literal = "", fragments = 0;
    do {
      const read = await channelCall(channel, adapter, "preparar_revisao", { curso: TITLE, auditoria: true, ...(cursor ? { continuacao: cursor } : {}) });
      assert.equal(read.status, 200);
      assert.ok(read.value.context, JSON.stringify(read.value));
      assert.ok(read.envelope.length < 100_000);
      assert.ok(JSON.stringify(read.value.context).length <= 12_000);
      assert.ok(Buffer.byteLength(JSON.stringify(read.value.context)) <= 16 * 1024);
      const fragment = read.value.context.fragmento;
      assert.equal(fragment.inicio, literal.length);
      literal += fragment.texto;
      cursor = read.value.context.continuacao;
      fragments++;
      assert.ok(fragments < 30);
    } while (cursor);
    assert.ok(fragments > 1);
    const context = JSON.parse(literal);
    channelContexts.push(context);
    assert.equal(context.auditoriasPedagogicas.length, 2);
    assert.deepEqual(context.studyUnits.map(target => target.auditoriaPedagogica.representationIssues.length), [0, 1, 0]);
    assert.deepEqual(context.explicacoes.map(target => target.auditoriaPedagogica.representationIssues.length), [2, 0]);
    for (const target of [...context.studyUnits, ...context.explicacoes]) {
      const audit = target.auditoriaPedagogica;
      const shared = context.auditoriasPedagogicas.find(item => item.foco === audit.foco);
      const ref = openContentReviewReference(target.referenciaInspecao, PRINCIPAL);
      const original = inspections.get(ref.targetId);
      assert.equal(target.referenciaInspecao, await createContentReviewReference({ principal: PRINCIPAL, read: original }));
      assert.equal(shared.basis.studyUnits.length, original.pedagogicalBasis.studyUnits.length);
      assert.deepEqual(shared.basis.studyUnits.map(unit => unit.design), original.pedagogicalBasis.studyUnits.map(unit => unit.design));
      assert.deepEqual(shared.basis.studyUnits.map(unit => unit.application), original.pedagogicalBasis.studyUnits.map(unit => unit.application));
      assert.deepEqual(shared.basis.studyUnits.map(unit => unit.content.content), original.pedagogicalBasis.studyUnits.map(unit => unit.content.content));
      assert.deepEqual(shared.basis.microsequence.explanation.content, original.pedagogicalBasis.microsequence.explanation.content);
      assert.deepEqual(shared.basis.studyUnits.map(unit => unit.content.content.at(-1).data.flows.map(flow => [flow.kind, flow.from, flow.to, flow.label])),
        original.pedagogicalBasis.studyUnits.map(unit => unit.content.content.at(-1).data.flows.map(flow => [flow.kind, flow.from, flow.to, flow.label])));
      assert.equal(shared.basis.dependencies[0].title, original.pedagogicalBasis.dependencies[0].title);
      // Only outer metadata is filtered; resource envelopes inside basis stay
      // literal, and complete targets and opaque references are also delivered.
      if (ref.targetKind === "study_unit") {
        assert.deepEqual(target.studyUnit, original.pedagogicalBasis.studyUnits.find(unit => unit.id === ref.targetId).content);
      } else {
        assert.deepEqual(target.conteudo, normalizeMicrosequenceExplanation(original.pedagogicalBasis.microsequence.explanation));
      }
      assert.equal(audit.basis.citations[0].targetTitle, ref.targetId);
      for (const issue of audit.representationIssues) {
        assert.match(issue.message, /entrega/u);
        assert.match(issue.message, /evento final não recebe mensagem/u);
        assert.doesNotMatch(issue.message, /Dependência fora do alvo/u);
      }
    }
    const report = { summary: "Base examinada.", outcome: "consistent", findings: [],
      checks: ["alignment", "evidence", "representation", "feedback", "sufficiency", "configuration"].map(dimension => ({
        dimension, result: "sufficient", reason: "Relação examinada na base salva.", evidence: ["Mesmo título"] })) };
    for (const target of [context.studyUnits[1], context.explicacoes[0]]) {
      const before = writes;
      const args = { referencia: target.referenciaInspecao, parecer: report };
      const rejected = await channelCall(channel, adapter, "registrar_inspecao", args);
      assert.equal(rejected.status, channel === "actions" ? 422 : 200);
      assert.equal(rejected.value.error.code, "pedagogical_audit_contradiction");
      assert.match(rejected.value.error.message, /evento final não recebe mensagem/u);
      assert.match(rejected.value.error.message, /representationIssues/u);
      assert.equal(writes, before, "consistent falha antes da persistência");
      const accepted = await channelCall(channel, adapter, "registrar_inspecao", { ...args, parecer: { ...report,
        outcome: "needs_attention", findings: ["Mensagem chega a um evento final."],
        checks: report.checks.map(check => ({ ...check, result: check.dimension === "representation" ? "insufficient" : "sufficient" })) } });
      assert.equal(accepted.status, 200);
      assert.ok(accepted.value.context, JSON.stringify(accepted.value));
      assert.equal(accepted.value.context.inspecaoIA.report.outcome, "needs_attention");
      assert.equal(writes, before + 1);
    }
    const valid = await channelCall(channel, adapter, "registrar_inspecao", {
      referencia: context.studyUnits[0].referenciaInspecao, parecer: report });
    assert.ok(valid.value.context, JSON.stringify(valid.value));
    assert.equal(valid.value.context.inspecaoIA.report.outcome, "consistent");
    assert.equal(writes, 3);
  }
  assert.deepEqual(channelContexts[0], channelContexts[1]);
});

test("envelopes validados ficam literais na base por MCP e Actions, sem liberar metadados de pacotes adulterados", async () => {
  const diagram = bpmnInstance({ invalid: true });
  const code = { id: "literal-code", package: "aralearn.resource.code", version: "1.0.0", data: {
    prompt: "Examine os campos da configuração.", language: "json",
    code: '  {"steps":["α","β"],"duration":2,"path":"/dados/😀","requestId":"exemplo-disciplinar"}\r\n'
  } };
  const response = { id: "literal-gap", package: "aralearn.response.gap", version: "1.0.0", data: {
    prompt: "Complete o caminho.", blanks: [{ id: "path-answer", targetInstanceId: code.id,
      targetPath: "code:path", responseMode: "text", answer: "/dados/😀" }]
  } };
  const feedback = { ...code, id: "literal-feedback" };
  for (const [instance, slot] of [[diagram, "content"], [code, "content"], [response, "response"], [feedback, "feedback"]]) {
    assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, slot).valid, true);
  }
  const privateMetadata = { requestId: "PRIVATE_META_REQUEST", CAS: "PRIVATE_META_CAS", hash: "PRIVATE_META_HASH",
    revision: 99, steps: ["PRIVATE_META_STEPS"], duration: "PRIVATE_META_DURATION", path: "PRIVATE_META_PATH" };
  const forged = [
    { ...code, ...privateMetadata },
    { ...code, data: { ...code.data, ...privateMetadata } },
    { ...code, id: "PRIVATE_META_UNKNOWN_PACKAGE", package: "aralearn.resource.uninstalled" },
    { ...code, id: "PRIVATE_META_UNKNOWN_VERSION", version: "99.0.0" },
    { ...code, id: "PRIVATE_META_INVALID_DATA", data: { ...code.data, prompt: "" } }
  ];
  for (const instance of forged) assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content").valid, false);
  for (const name of ["preparar_revisao", "retomar_curso"]) {
    const channelPages = [];
    for (const channel of ["mcp", "actions"]) {
      const { adapter, inspections } = focalAuditFixture({ unitCount: 2 });
      const original = adapter.getCourseContentInspection;
      adapter.getCourseContentInspection = async input => {
        const read = structuredClone(await original(input));
        const basis = read.pedagogicalBasis;
        basis.microsequence.explanation.content = [diagram, code];
        basis.studyUnits = basis.studyUnits.map(unit => ({ ...unit, ...privateMetadata, content: {
          id: unit.id, title: unit.content.title, position: 1, role: "practice", topics: [],
          content: [diagram, code], response, feedback: [feedback]
        } }));
        basis.additionalContext = { ...basis.additionalContext, ...privateMetadata, forged };
        inspections.set(input.targetId, read);
        return read;
      };
      const args = name === "retomar_curso" ? { titulo: TITLE, parte: "Foco" } : { curso: TITLE, auditoria: true };
      let cursor, literal = "";
      const pages = [];
      do {
        const read = await channelCall(channel, adapter, name, { ...args, ...(cursor ? { continuacao: cursor } : {}) });
        assert.equal(read.status, 200);
        assert.ok(read.value.context, JSON.stringify(read.value));
        assert.ok(read.envelope.length < 100_000);
        assert.ok(JSON.stringify(read.value.context).length <= 12_000);
        assert.ok(Buffer.byteLength(JSON.stringify(read.value.context)) <= 16 * 1024);
        const fragment = read.value.context.fragmento;
        if (!fragment) {
          assert.equal(name, "retomar_curso", "a inspeção formal atravessa a paginação da base auditada");
          pages.push(read.value);
          break;
        }
        assert.equal(fragment.inicio, literal.length);
        literal += fragment.texto;
        cursor = read.value.context.continuacao;
        pages.push(read.value);
        assert.ok(pages.length < 40);
      } while (cursor);
      if (name === "preparar_revisao") assert.ok(pages.length > 1, "a base auditada atravessa a paginação");
      const context = literal ? JSON.parse(literal) : pages.at(-1).context;
      assert.doesNotMatch(JSON.stringify(context), /PRIVATE_META_/u);
      if (name === "retomar_curso") {
        assert.equal(context.auditoriasPedagogicas, undefined, "a retomada focal não carrega a base de auditoria");
        for (const target of [...(context.studyUnits ?? []), ...context.explicacoes]) {
          assert.equal(Object.hasOwn(target, "auditoriaPedagogica"), false);
          assert.equal(Object.hasOwn(target, "referenciaInspecao"), false);
        }
        channelPages.push(pages);
        continue;
      }
      assert.equal(context.auditoriasPedagogicas.length, 2);
      for (const target of [...(context.studyUnits ?? []), ...context.explicacoes]) {
        const ref = openContentReviewReference(target.referenciaInspecao, PRINCIPAL);
        const saved = inspections.get(ref.targetId);
        assert.equal(target.referenciaInspecao, await createContentReviewReference({ principal: PRINCIPAL, read: saved }));
        const shared = context.auditoriasPedagogicas.find(item => item.foco === target.auditoriaPedagogica.foco);
        assert.deepEqual(shared.basis.microsequence.explanation.content, [diagram, code]);
        for (const unit of shared.basis.studyUnits) {
          assert.deepEqual(unit.content.content, [diagram, code]);
          assert.deepEqual(unit.content.response, response);
          assert.deepEqual(unit.content.feedback, [feedback]);
          assert.equal(Object.hasOwn(unit, "studyUnit"), false);
          for (const key of Object.keys(privateMetadata)) assert.equal(Object.hasOwn(unit, key), false);
          const data = unit.content.content[0].data;
          assert.ok(data.flows.every(flow => data.nodes.some(node => node.id === flow.from) && data.nodes.some(node => node.id === flow.to)));
          assert.equal(unit.content.response.data.blanks[0].targetInstanceId, unit.content.content[1].id);
          assert.equal(unit.content.response.data.blanks[0].targetPath, "code:path");
        }
        assert.deepEqual(target.auditoriaPedagogica.basis.additionalContext.forged.map(item => Object.hasOwn(item, "id")),
          [false, false, false, false, false]);
      }
      channelPages.push(pages);
    }
    assert.deepEqual(channelPages[0], channelPages[1]);
  }
});

test("studyUnits da base conserva formato de linha sem inventar studyUnit undefined", async () => {
  const adapter = fixture({ units: [studyUnit(1)] });
  const original = adapter.getCourseContentInspection;
  adapter.getCourseContentInspection = async input => ({ ...await original(input), pedagogicalBasis: {
    targetKind: input.targetKind, targetId: input.targetId, microsequence: { id: "ms", goal: "Ler" },
    planItems: [], dependencies: [], studyUnits: [{ id: input.targetId, content: {
      title: "Unidade", content: [], feedback: [], response: null
    }, application: null }]
  } });
  const read = await execute(adapter, "preparar_revisao", { auditoria: true });
  assert.equal(read.context.fragmento, undefined, "examina o objeto antes de serializar undefined");
  const row = read.context.auditoriasPedagogicas[0].basis.studyUnits[0];
  assert.equal(Object.hasOwn(row, "studyUnit"), false);
  assert.deepEqual(row.content, { title: "Unidade", content: [], feedback: [], response: null });
  assert.deepEqual(read.context.studyUnits[0].studyUnit, studyUnit(1).studyUnit);
});

test("parâmetros recebem definição no foco e fallback local quando a identidade não é mapeável", async () => {
  for (const mappable of [true, false]) {
    const { adapter } = focalAuditFixture({ unitCount: 2 });
    const original = adapter.getCourseContentInspection;
    const parameter = { parameterId: "practice_distribution", value: "interleaved", origin: "automatic", reason: "Contextual.",
      sourceScopeKind: "study_unit", sourceScopeId: "PRIVATE_SCOPE" };
    adapter.getCourseContentInspection = async input => {
      const read = structuredClone(await original(input));
      for (const unit of read.pedagogicalBasis.studyUnits) unit.design.parameters = [parameter];
      if (!mappable) delete read.pedagogicalBasis.microsequence.id;
      return read;
    };
    const originalUnits = adapter.listCourseStudyUnits;
    adapter.listCourseStudyUnits = async input => { const page = await originalUnits(input);
      page.items = page.items.map(item => ({ ...item, designSnapshot: { parameters: [parameter] } })); return page; };
    const read = await readLogicalPage(adapter, "preparar_revisao", { auditoria: true });
    const focus = read.context.auditoriasPedagogicas?.[0];
    const applied = (focus?.basis ?? read.context.studyUnits[0].auditoriaPedagogica.basis).studyUnits[0].design.parameters[0];
    assert.equal(applied.nome, "Distribuição das práticas");
    assert.equal(applied.campo, "distribuicao_da_pratica");
    const meaning = mappable ? focus.definicoesDosParametros[0].definicao : applied.definicao;
    assert.match(meaning.operacionalizacao, /entre exposições/u);
    assert.match(meaning.limites, /contextual/u);
    assert.equal(Object.hasOwn(applied, "definicao"), !mappable);
    assert.equal(applied.value, "interleaved");
    assert.equal(applied.origin, "automatic");
    assert.deepEqual(read.context.studyUnits[0].designSnapshot.parameters[0], applied);
    assert.doesNotMatch(JSON.stringify(read.context), /PRIVATE_SCOPE|parameterId/u);
  }
});

test("MCP e Actions leem parâmetros nomináveis e histórico, gravam seis e só recuperam cinco pelo recibo", async () => {
  for (const channel of ["mcp", "actions"]) {
    const { adapter } = focalAuditFixture({ unitCount: 2 });
    const original = adapter.getCourseContentInspection;
    const checks = ["alignment", "evidence", "representation", "feedback", "sufficiency"].map(dimension => ({
      dimension, result: "sufficient", reason: "Relação examinada.", evidence: ["Mesmo título"] }));
    const old = { summary: "Parecer histórico.", outcome: "consistent", findings: [], checks };
    const parameters = [{ parameterId: "practice_distribution", value: "interleaved", origin: "automatic", reason: "Contextual.", sourceScopeId: "PRIVATE_SCOPE" },
      { parameterId: "practice_position", value: "before_and_after", origin: "research_condition", reason: "Fixação preservada." },
      { parameterId: "historical_parameter", value: 3, origin: "author", reason: null }];
    adapter.resolvePrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] });
    adapter.resolveActionPrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "action", scopes: ["authoring:read", "authoring:write"] });
    adapter.getCourseContentInspection = async input => {
      const read = structuredClone(await original(input));
      for (const unit of read.pedagogicalBasis.studyUnits) {
        unit.design.parameters = parameters;
        unit.application = { practiceApplications: [] };
        unit.content.role = "theory";
        unit.content.response = null;
        unit.content.content = [{ id: "valid-paragraph", package: "aralearn.resource.paragraph", version: "1.0.0",
          data: { text: "Mesmo título: a relação é desenvolvida no conteúdo." } }];
      }
      read.inspection = { state: "current", basisHash: read.basisHash, inspectedAt: "2026-09-28T00:00:00Z", report: old };
      return read;
    };
    let literal = "", continuation, context, fragments = 0;
    do {
      const read = await channelCall(channel, adapter, "preparar_revisao", { curso: TITLE, auditoria: true, ...(continuation ? { continuacao: continuation } : {}) });
      assert.equal(read.status, 200);
      const page = read.value.context;
      assert.ok(JSON.stringify(page).length <= 12_000);
      assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 16 * 1024);
      if (!page.fragmento) { context = page; break; }
      assert.equal(page.fragmento.inicio, literal.length);
      literal += page.fragmento.texto; fragments++;
      if (page.fragmento.fim === page.fragmento.total) { context = JSON.parse(literal); break; }
      continuation = page.continuacao;
      assert.ok(continuation);
    } while (continuation);
    assert.ok(fragments > 1);
    const applied = context.auditoriasPedagogicas[0].basis.studyUnits[0].design.parameters;
    assert.equal(applied[0].nome, "Distribuição das práticas");
    assert.match(context.auditoriasPedagogicas[0].definicoesDosParametros[0].definicao.operacionalizacao, /entre exposições/u);
    assert.equal(applied[1].origin, "research_condition");
    assert.equal(applied[1].value, "before_and_after");
    assert.equal(applied[2].nome, "historical_parameter", "identidade semântica desconhecida não some");
    assert.equal(applied[2].reason, null);
    assert.doesNotMatch(JSON.stringify(context), /PRIVATE_SCOPE|parameterId/u);
    const target = context.studyUnits[0];
    assert.equal(target.inspecaoIA.state, "current");
    assert.equal(target.inspecaoIA.dimensoesAtuaisCompletas, false);
    assert.deepEqual(target.inspecaoIA.report, old);
    assert.match(target.inspecaoIA.orientacao, /configuração ainda não foi avaliada/u);
    let writes = 0, receipt = null;
    adapter.getCourseContentInspectionReceipt = async () => receipt;
    adapter.recordCourseContentInspection = async input => {
      writes++;
      const before = await adapter.getCourseContentInspection(input);
      return { ...before, contract: "aralearn.course-ai-inspection-change.v1", changed: true, idempotent: false,
        inspection: { ...before.inspection, report: input.report } };
    };
    const rejected = await channelCall(channel, adapter, "registrar_inspecao", { referencia: target.referenciaInspecao, parecer: old });
    assert.equal(rejected.value.error.code, "pedagogical_audit_configuration_required");
    assert.equal(writes, 0);
    const six = { ...old, checks: [...checks, { dimension: "configuration", result: "sufficient",
      reason: "A realização foi julgada no contexto do percurso, preservando a condição de pesquisa.", evidence: ["Mesmo título"] }] };
    const accepted = await channelCall(channel, adapter, "registrar_inspecao", { referencia: target.referenciaInspecao, parecer: six });
    assert.equal(accepted.status, 200);
    assert.ok(accepted.value.context, JSON.stringify(accepted.value));
    assert.equal(accepted.value.context.inspecaoIA.dimensoesAtuaisCompletas, true);
    assert.equal(writes, 1);
    receipt = { inspection: { state: "current", basisHash: "b".repeat(64), inspectedAt: "2026-09-28T00:00:00Z", report: old } };
    adapter.getCourseContentInspection = async () => { throw new Error("A recuperação não relê a base posterior"); };
    const replay = await channelCall(channel, adapter, "registrar_inspecao", { referencia: target.referenciaInspecao, parecer: old });
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.value.context.inspecaoIA.report, old);
    assert.equal(replay.value.context.inspecaoIA.dimensoesAtuaisCompletas, false);
    assert.equal(writes, 1);
  }
});

test("MCP e Actions preservam as mensagens de contradição outcome/findings/checks sem escrever", async () => {
  const messages = [];
  for (const channel of ["mcp", "actions"]) {
    const adapter = fixture();
    adapter.resolvePrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] });
    adapter.resolveActionPrincipal = async () => ({ ...PRINCIPAL, authenticationKind: "action", scopes: ["authoring:read", "authoring:write"] });
    const read = await adapter.getCourseContentInspection({ courseId: COURSE.id, targetKind: "study_unit", targetId: "unit-1" });
    const reference = await createContentReviewReference({ principal: PRINCIPAL, read });
    let backendCalls = 0;
    adapter.getCourseContentInspectionReceipt = adapter.getCourseContentInspection = adapter.recordCourseContentInspection = async () => { backendCalls++; };
    const five = ["alignment", "evidence", "representation", "feedback", "sufficiency"].map(dimension => ({
      dimension, result: "sufficient", reason: "Base examinada.", evidence: ["Relação"] }));
    const channelMessages = [];
    for (const checks of [five, [...five, { ...five[0], dimension: "configuration" }]]) {
      const report = { summary: "Base examinada.", outcome: "consistent", findings: [], checks };
      const candidates = [
        [{ ...report, findings: ["Dados disponíveis.", "Resposta completa.", "Feedback explicativo."] }, /findings.*pendências.*consistent.*\[\].*summary.*checks.*reason/u],
        [{ ...report, outcome: "needs_attention" }, /needs_attention.*pendência.*findings/u],
        [{ ...report, checks: checks.map((check, index) => index ? check : { ...check, result: "insufficient" }) }, /insufficient.*needs_attention.*findings/u]
      ];
      for (const [candidate, message] of candidates) {
        const original = structuredClone(candidate);
        const response = await channelCall(channel, adapter, "registrar_inspecao", { referencia: reference, parecer: candidate });
        assert.equal(response.status, channel === "actions" ? 422 : 200);
        assert.equal(response.value.error.code, "invalid_course_ai_inspection");
        assert.match(response.value.error.message, message);
        assert.deepEqual(candidate, original);
        channelMessages.push(response.value.error.message);
      }
    }
    assert.equal(backendCalls, 0, "contradição de contrato não consulta recibo nem grava parecer");
    messages.push(channelMessages);
  }
  assert.deepEqual(messages[0], messages[1]);
});

test("definições e valores se reconstroem por foco e página lógica nos dois canais", async () => {
  const parametersFor = id => [
    { parameterId: "practice_distribution", value: id === "ms-a" ? "interleaved" : "blocked", origin: "automatic", reason: `Contexto ${id}.` },
    { parameterId: "practice_position", value: "before_and_after", origin: "research_condition", reason: "Condição fixa.", sourceScopeKind: "course" },
    { parameterId: "historical_unknown", value: null, origin: "author", reason: null, annotation: { literal: "α\n😀", empty: null } }
  ];
  const meaningsFor = parameters => parameters.flatMap(({ parameterId }) => {
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(item => item.id === parameterId);
    return definition ? [{ nome: definition.label, campo: definition.humanField, definicao: {
      construto: definition.construct, operacionalizacao: definition.operationalization, limites: definition.limitations
    } }] : [];
  });
  const completeParameters = parameters => parameters.map(({ parameterId, ...parameter }) => ({ ...parameter,
    ...(meaningsFor([{ parameterId }])[0] ?? { nome: parameterId, campo: parameterId }) }));
  for (const name of ["preparar_revisao", "retomar_curso"]) {
    const channelPages = [];
    for (const channel of ["mcp", "actions"]) {
      const { adapter, inspections } = focalAuditFixture({ unitCount: 14 });
      const original = adapter.getCourseContentInspection;
      adapter.getCourseContentInspection = async input => {
        const read = structuredClone(await original(input));
        const basis = read.pedagogicalBasis;
        for (const unit of basis.studyUnits) {
          unit.design.parameters = parametersFor(basis.microsequence.id);
          unit.content.content = [bpmnInstance({ invalid: false }), {
            id: "literal-code", package: "aralearn.resource.code", version: "1.0.0", data: {
              prompt: "Leia a configuração.", language: "json",
              code: '  {"steps":["α","β"],"duration":2,"path":"/dados/😀"}\r\n'
            }
          }];
          for (const instance of unit.content.content) assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "content").valid, true);
        }
        inspections.set(input.targetId, read);
        return read;
      };
      const originalUnits = adapter.listCourseStudyUnits;
      adapter.listCourseStudyUnits = async input => {
        const page = await originalUnits(input);
        page.items = page.items.map(item => ({ ...item,
          designSnapshot: { parameters: parametersFor(item.curriculumPath.didacticMicrosequence.id) } }));
        return page;
      };
      let continuation;
      const pages = [];
      const logicalPages = name === "preparar_revisao" ? 2 : 1;
      for (let logicalPage = 0; logicalPage < logicalPages; logicalPage++) {
        let literal = "", context, fragments = 0;
        do {
          const args = name === "retomar_curso" ? { titulo: TITLE, parte: "Foco" } : { curso: TITLE, auditoria: true };
          const read = await channelCall(channel, adapter, name, { ...args, ...(continuation ? { continuacao: continuation } : {}) });
          assert.equal(read.status, 200);
          assert.ok(read.envelope.length < 100_000);
          const page = read.value.context;
          assert.ok(JSON.stringify(page).length <= 12_000);
          assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 16 * 1024);
          const fragment = page.fragmento;
          if (!fragment) {
            assert.equal(name, "retomar_curso", "a inspeção formal atravessa a paginação da base auditada");
            continuation = page.continuacao;
            context = page;
            break;
          }
          assert.equal(fragment.inicio, literal.length);
          literal += fragment.texto;
          continuation = page.continuacao;
          fragments++;
          if (fragment.fim === fragment.total) { context = JSON.parse(literal); break; }
          assert.ok(continuation);
          assert.ok(fragments < 120);
        } while (continuation);
        if (name === "preparar_revisao") assert.ok(fragments > 1, "a base auditada atravessa a paginação");
        if (name === "retomar_curso") {
          assert.equal(context.auditoriasPedagogicas, undefined, "a retomada focal não carrega a base de auditoria");
          for (const target of context.explicacoes) {
            assert.equal(Object.hasOwn(target, "auditoriaPedagogica"), false);
            assert.equal(Object.hasOwn(target, "referenciaInspecao"), false);
          }
          assert.equal(Boolean(continuation), false, "a retomada comum entrega a página focal integral");
          pages.push(context);
          continue;
        }
        assert.equal(context.auditoriasPedagogicas.length, 2, "dois focos de mesmo título, independentes em cada página");
        for (const target of [...(context.studyUnits ?? []), ...context.explicacoes]) {
          const ref = openContentReviewReference(target.referenciaInspecao, PRINCIPAL);
          const canonical = inspections.get(ref.targetId);
          const basis = canonical.pedagogicalBasis;
          const focus = context.auditoriasPedagogicas.find(item => item.foco === target.auditoriaPedagogica.foco);
          const parameters = parametersFor(basis.microsequence.id);
          assert.deepEqual(focus.definicoesDosParametros, meaningsFor(parameters));
          assert.equal(focus.definicoesDosParametros.length, 2, "histórico desconhecido não recebe definição inventada");
          const resolve = rows => rows.map(parameter => ({ ...parameter,
            ...(focus.definicoesDosParametros.find(item => item.campo === parameter.campo) ?? {}) }));
          for (const [index, unit] of focus.basis.studyUnits.entries()) {
            assert.ok(unit.design.parameters.every(parameter => !Object.hasOwn(parameter, "definicao")));
            assert.deepEqual(resolve(unit.design.parameters), completeParameters(parameters));
            assert.deepEqual(unit.content.content, basis.studyUnits[index].content.content, "recursos literais, inclusive BPMN e steps/código");
            assert.deepEqual(basis.studyUnits[index].design.parameters, parameters, "a base canônica não foi modificada");
          }
          if (target.designSnapshot) assert.deepEqual(resolve(target.designSnapshot.parameters), completeParameters(parameters));
          assert.equal(target.referenciaInspecao, await createContentReviewReference({ principal: PRINCIPAL, read: canonical }));
          assert.equal(target.auditoriaPedagogica.basis.citations[0].links[0].source.url, `https://example.test/${ref.targetId}`);
          assert.equal(target.auditoriaPedagogica.basis.citations[0].links[0].anchors[0].selector.exact, `Passagem de ${ref.targetId}.`);
          const expected = projectPedagogicalAudit(basis).units
            .filter(unit => ref.targetKind !== "study_unit" || unit.unitId === ref.targetId);
          assert.deepEqual(resolveAuditUnits(context, target.auditoriaPedagogica).map(unit => unit.observation),
            expected.map(unit => unit.observation), "a tarefa se reconstitui junto de parâmetros históricos e condição de pesquisa");
        }
        assert.equal(Boolean(continuation), logicalPage + 1 < logicalPages);
        pages.push(context);
      }
      if (logicalPages === 2) assert.deepEqual(pages[1].studyUnits.map(target => target.studyUnit.id), ["unit-13", "unit-14"]);
      channelPages.push(pages);
    }
    assert.deepEqual(channelPages[0], channelPages[1]);
  }
});

test("compartilhamento decide pela base exata antes de nomear parâmetros, sem unir bases distintas", () => {
  const parameter = { parameterId: "practice_distribution", value: "interleaved", origin: "automatic", reason: null };
  const basis = { microsequence: { id: "same-ms", title: "Mesmo título" }, studyUnits: [{ id: "same-unit", design: { parameters: [parameter] } }] };
  const target = { auditoriaPedagogica: { basis, instruction: "Leia o foco." }, designSnapshot: { parameters: [parameter] } };
  const changed = structuredClone(target);
  changed.auditoriaPedagogica.basis.studyUnits[0].design.parameters[0].value = "blocked";
  const context = { studyUnits: [target, structuredClone(target), changed] };
  const original = structuredClone(context);
  const projected = shareHumanAuditContext(context, COURSE);
  assert.deepEqual(context, original);
  assert.deepEqual(projected.studyUnits.map(item => item.auditoriaPedagogica.foco), [1, 1, 2]);
  assert.equal(projected.auditoriasPedagogicas.length, 2);
  assert.ok(projected.auditoriasPedagogicas.every(item => item.definicoesDosParametros.length === 1));
  assert.equal(projected.auditoriasPedagogicas[1].basis.studyUnits[0].design.parameters[0].value, "blocked");
});

test("segunda página lógica entrega sua base completa com foco local, sem depender da primeira", async () => {
  const { adapter } = focalAuditFixture({ unitCount: 14 });
  const first = await readLogicalPage(adapter, "preparar_revisao", { auditoria: true });
  assert.equal(first.context.auditoriasPedagogicas.length, 2);
  assert.equal(first.context.temMais, true);
  const second = await readLogicalPage(adapter, "preparar_revisao", { auditoria: true,
    continuacao: first.context.continuacao });
  assert.equal(second.context.auditoriasPedagogicas.length, 2, "a leitura sem filtro mantém as explicações do planejamento nesta página");
  assert.equal(second.context.auditoriasPedagogicas[0].foco, 1);
  assert.equal(second.context.auditoriasPedagogicas[0].basis.microsequence.goal, "Objetivo 2");
  assert.equal(second.context.auditoriasPedagogicas[0].basis.studyUnits.length, 12, "a base contém a MS inteira, não só os alvos da página");
  assert.deepEqual(second.context.studyUnits.map(item => item.studyUnit.id), ["unit-13", "unit-14"]);
  assert.ok(second.context.studyUnits.every(item => item.auditoriaPedagogica.foco === 1));
  assert.deepEqual(second.context.explicacoes.map(item => item.auditoriaPedagogica.foco), [2, 1]);
  assert.equal(second.context.temMais, false);
  assert.equal(second.context.continuacao, null);
});

test("curso, busca ou revisão trocados recusam continuação antes de ler outra página", async () => {
  for (const change of [{ curso: "Outro curso" }, { busca: "Outro recorte" }, { revision: 8 }]) {
    const adapter = fixture({ sources: Array.from({ length: 25 }, (_, i) => ({ title: `Fonte ${i}` })) });
    const initial = await execute(adapter, "consultar_fontes", { busca: "Fonte" });
    if (change.revision) adapter.revision = change.revision;
    await assert.rejects(() => execute(adapter, "consultar_fontes", {
      busca: "Fonte", ...(change.revision ? {} : change), continuacao: initial.context.continuacao
    }), error => {
      assert.equal(error.status, 409);
      assert.equal(error.code, "human_read_context_changed");
      assert.doesNotMatch(JSON.stringify(error), /10000000|Fonte 24/u);
      return true;
    });
    assert.equal(adapter.calls.sources.length, 1);
  }
});

test("backend que repete cursor de fontes ou unidades falha sem devolver página duplicada", async () => {
  for (const name of ["consultar_fontes", "preparar_revisao"]) {
    const adapter = fixture({ sources: Array.from({ length: 25 }, (_, i) => ({ title: `Fonte ${i}` })),
      units: Array.from({ length: 24 }, (_, i) => studyUnit(i + 1)) });
    const first = await readLogicalPage(adapter, name);
    if (name === "consultar_fontes") {
      adapter.getCourseSources = async ({ cursor }) => ({ items: [{ title: "PRIVATE_DUPLICATE" }], nextCursor: cursor });
    } else {
      adapter.listCourseStudyUnits = async ({ cursorStudyUnitId }) => ({ items: [studyUnit(13, "PRIVATE_DUPLICATE")],
        hasMore: true, nextCursor: { studyUnitId: cursorStudyUnitId } });
    }
    await assert.rejects(() => execute(adapter, name, { continuacao: first.context.continuacao }), error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, "course_service_unavailable");
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE_DUPLICATE/u);
      return true;
    });
  }
});

test("MCP e Actions devolvem o mesmo JSON literal da revisão pelo nome corrente", async () => {
  const units = [studyUnit(1)];
  const direct = await execute(fixture({ units }), "preparar_revisao", {});
  for (const channel of ["actions", "mcp"]) {
    const response = await channelCall(channel, fixture({ units }), "preparar_revisao", { curso: TITLE });
    assert.equal(response.status, 200);
    assert.deepEqual(response.value, direct);
    assert.deepEqual(response.value.context.studyUnits.map(item => item.studyUnit), units.map(item => item.studyUnit));
    assert.doesNotMatch(response.envelope, /literal-json-field|requestId/u);
    assert.deepEqual(response.value.context.studyUnits[0].authorship, {});
    if (channel === "actions") assert.ok(response.envelope.length < 100_000);
  }
});

test("fontes extensas atravessam ambos os transportes em envelopes Actions abaixo de 100 mil caracteres", async () => {
  const sources = Array.from({ length: 24 }, (_, i) => ({ title: `Fonte ${i + 1}`,
    citationText: '😀 IPA /ɲ/ العربية 漢字 "\\\n'.repeat(60),
    authors: Array.from({ length: 10 }, (_, n) => ({ literal: `${n}: ${"Nome fornecido 漢字 ".repeat(24)}` })) }));
  const allPages = [];
  for (const channel of ["actions", "mcp"]) {
    const adapter = fixture({ sources });
    const pages = [];
    let cursor;
    do {
      const response = await channelCall(channel, adapter, "consultar_fontes", {
        curso: TITLE, ...(cursor ? { continuacao: cursor } : {})
      });
      assert.equal(response.status, 200);
      assert.ok(response.value?.context?.fragmento, response.envelope.slice(0,500));
      if (channel === "actions") assert.ok(response.envelope.length < 100_000);
      pages.push(response.value);
      cursor = response.value.context.continuacao;
      assert.ok(pages.length <= sources.length * 4);
    } while (cursor);
    assert.ok(pages.length > 1);
    assert.deepEqual(JSON.parse(pages.map(page => page.context.fragmento.texto).join("")),
      { sources: { items: sources, nextCursor: null } });
    allPages.push(pages);
  }
  assert.deepEqual(allPages[0], allPages[1]);
});


test("critérios de entrega chegam uma vez na retomada, no planejamento e no preparo", async () => {
  const encoder = new TextEncoder();
  const coreBytes = encoder.encode(JSON.stringify(COURSE_AUTHORING_DELIVERY_CORE)).byteLength;
  assert.equal(COURSE_AUTHORING_DELIVERY_CORE.length, 6, "o núcleo canônico tem seis linhas");
  assert.ok(coreBytes <= 1_000, "o núcleo canônico precisa caber em 1000 bytes");
  for (const task of ["consultar_planejamento", "preparar_materializacao"]) {
    const guide = courseAuthoringGuidanceForCall(task);
    for (const line of COURSE_AUTHORING_DELIVERY_CORE) {
      assert.ok(guide.instructions.includes(line), task + " reutiliza o núcleo de entrega");
    }
  }

  for (const channel of ["actions", "mcp"]) {
    const adapter = fixture();
    const list = await channelCall(channel, adapter, "retomar_curso", {});
    assert.equal(list.status, 200, list.envelope);
    assert.equal(Object.hasOwn(list.value.context, "criteriosDeEntrega"), false,
      channel + ": a listagem sem alvo não carrega os critérios");
    assert.match(list.envelope, /cursos para retomar/u);

    const resumed = await channelCall(channel, adapter, "retomar_curso", { titulo: TITLE });
    assert.equal(resumed.status, 200, resumed.envelope);
    assert.deepEqual(resumed.value.context.criteriosDeEntrega, [...COURSE_AUTHORING_DELIVERY_CORE],
      channel + ": a retomada com curso entrega o núcleo canônico");

    const { adapter: preparation } = materializationPreparationFixture(1);
    const prepared = await channelCall(channel, preparation, "preparar_materializacao",
      { curso: TITLE, unidades: [focalCandidate()] });
    assert.equal(prepared.status, 200, prepared.envelope);
    assert.deepEqual(prepared.value.context.criteriosDeEntrega, [...COURSE_AUTHORING_DELIVERY_CORE],
      channel + ": o preparo entrega o núcleo antes de salvar");
    assert.ok(prepared.envelope.length < 20_000,
      channel + ": o preparo usa o orçamento próprio, sem paginador");

    const paged = fixture();
    paged.getCourseInstructionalPlan = async () => ({ courseRevision: paged.revision, plan: {
      title: TITLE, version: 1, curriculumMapStatus: "draft", parts: [], audience: "Iniciantes",
      declaredPrerequisites: [], curriculumScopeItems: [],
      curriculum: { modules: Array.from({ length: 12 }, (_, moduleIndex) => ({
        id: "module-" + moduleIndex, position: moduleIndex, title: "Módulo " + (moduleIndex + 1),
        objective: "Objetivo do módulo. ".repeat(20),
        lessons: [{ id: "lesson-" + moduleIndex, position: 0, title: "Lição " + (moduleIndex + 1),
          objective: "Objetivo da lição. ".repeat(20),
          microsequences: Array.from({ length: 3 }, (_, microIndex) => ({
            id: "ms-" + moduleIndex + "-" + microIndex, position: microIndex,
            title: "Microssequência " + (moduleIndex + 1) + "." + (microIndex + 1) + " do percurso de redes",
            goal: "Relacionar conceitos e procedimentos. ".repeat(12) })) }]
      })) }
    } });
    let continuation = undefined, literal = "", pages = 0, total = null, expectedStart = 0;
    let firstPageHasCore = false, laterPageHasCore = false;
    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      const page = await channelCall(channel, paged, "consultar_planejamento",
        { curso: TITLE, ...(continuation === undefined ? {} : { continuacao: continuation }) });
      assert.equal(page.status, 200, page.envelope);
      const context = page.value.context;
      assert.equal(typeof context.fragmento?.texto, "string",
        channel + ": o mapa de prova precisa paginar em fragmentos JSON");
      assert.equal(context.fragmento.inicio, expectedStart, channel + ": offsets contíguos entre páginas");
      expectedStart = context.fragmento.fim;
      if (total === null) total = context.fragmento.total;
      assert.equal(context.fragmento.total, total, channel + ": o total do recorte é estável");
      assert.ok(encoder.encode(JSON.stringify(context)).byteLength <= 16 * 1024,
        channel + ": cada página cabe em 16 KiB");
      assert.ok(JSON.stringify(context).length <= 12_000, channel + ": cada página cabe em 12000 caracteres");
      if (pageIndex === 0) firstPageHasCore = context.fragmento.texto.includes("criteriosDeEntrega");
      else if (context.fragmento.texto.includes("criteriosDeEntrega")) laterPageHasCore = true;
      literal += context.fragmento.texto;
      pages += 1;
      if (context.temMais !== true) break;
      continuation = context.continuacao;
    }
    assert.ok(pages >= 2 && pages <= 5, channel + ": o recorte precisa de 2 a 5 páginas determinísticas");
    assert.equal(literal.length, total, channel + ": os fragmentos remontam o recorte literal");
    assert.ok(firstPageHasCore, channel + ": o núcleo entra na primeira página");
    assert.equal(laterPageHasCore, false, channel + ": a continuação não repete o núcleo");
    assert.equal(literal.split("criteriosDeEntrega").length - 1, 1,
      channel + ": o núcleo aparece uma única vez no recorte remontado");
    assert.deepEqual(JSON.parse(literal).criteriosDeEntrega, [...COURSE_AUTHORING_DELIVERY_CORE]);
  }
});

async function readChannelContext(channel, adapter, name, args) {
  let continuation, literal = "", pages = 0, single = null;
  const decisions = [];
  for (;;) {
    const response = await channelCall(channel, adapter, name, { ...args,
      ...(continuation ? { continuacao: continuation } : {}) });
    assert.equal(response.status, 200, response.envelope);
    const context = response.value.context;
    decisions.push({ temMais: context.temMais === true, decision: response.value.nextDecision ?? null });
    assert.ok(JSON.stringify(context).length <= 12_000);
    assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 16 * 1024);
    pages += 1;
    if (!context.fragmento) { single = context; break; }
    assert.equal(context.fragmento.inicio, literal.length);
    literal += context.fragmento.texto;
    if (context.fragmento.fim === context.fragmento.total) break;
    continuation = context.continuacao;
    assert.ok(continuation, "a página lógica continua enquanto faltarem trechos");
    assert.ok(pages < 120);
  }
  return { context: single ?? JSON.parse(literal), pages,
    nextDecision: decisions[0].decision, finalDecision: decisions.at(-1).decision, decisions };
}

test("leitura comum da revisão não busca a inspeção e auditoria: true devolve a base nos dois canais", async () => {
  const measurements = [];
  for (const channel of ["actions", "mcp"]) {
    const sizes = {};
    for (const mode of ["comum", false, true]) {
      const { adapter } = focalAuditFixture();
      const args = mode === "comum" ? { curso: TITLE } : { curso: TITLE, auditoria: mode };
      const { context, pages, nextDecision, finalDecision, decisions } = await readChannelContext(
        channel, adapter, "preparar_revisao", args);
      const json = JSON.stringify(context);
      const key = mode === "comum" ? "default" : String(mode);
      sizes[key] = { chars: json.length, bytes: Buffer.byteLength(json),
        inspections: adapter.calls.inspections.length };
      const targets = [...context.studyUnits, ...context.explicacoes];
      assert.ok(targets.length > 0);
      assert.equal(context.studyUnits[0].revisao, "Rascunho", "a leitura comum preserva o estado de revisão");
      assert.match(context.studyUnits[0].referenciaRevisao, /^[A-Za-z0-9_-]+$/u);
      if (mode !== true) {
        assert.equal(adapter.calls.inspections.length, 0, "a leitura comum não busca getCourseContentInspection");
        assert.equal(context.auditoriasPedagogicas, undefined);
        assert.match(nextDecision, /auditoria: true/u, "a leitura comum orienta a auditoria explícita");
        assert.doesNotMatch(finalDecision, /^Registre o parecer/u, "sem base, não instrui registrar o parecer");
        assert.ok(decisions.every(({ decision }) => !/^Registre o parecer/u.test(decision ?? "")),
          "nenhuma página comum instrui registrar o parecer");
        for (const target of targets) {
          assert.equal(Object.hasOwn(target, "auditoriaPedagogica"), false);
          assert.equal(Object.hasOwn(target, "referenciaInspecao"), false);
          assert.equal(Object.hasOwn(target, "inspecaoIA"), false,
            "não consultar a inspeção não pode inventar indisponibilidade");
        }
      } else {
        assert.equal(adapter.calls.inspections.length, targets.length * pages,
          "cada reexecução da página lógica inspeciona seus próprios alvos");
        assert.ok(context.auditoriasPedagogicas.length >= 1);
        assert.match(finalDecision, /^Registre o parecer das seis dimensões/u,
          "com a base devolvida, a decisão seguinte registra o parecer");
        assert.ok(targets.every(target => target.referenciaInspecao && target.auditoriaPedagogica));
        assert.ok(targets.every(target => target.inspecaoIA && target.inspecaoIA.state === "unregistered"));
      }
      assert.ok(decisions.filter(({ temMais }) => temMais)
        .every(({ decision }) => /^Continue lendo as continuações/u.test(decision ?? "")),
      "toda página aberta orienta terminar a leitura antes de registrar");
      if (mode === false) assert.deepEqual(sizes.false, sizes.default, "omitir auditoria equivale a auditoria: false");
    }
    assert.ok(sizes.true.chars > sizes.default.chars, "a auditoria devolve mais caracteres que a leitura comum");
    assert.ok(sizes.true.bytes > sizes.default.bytes);
    assert.equal(sizes.default.inspections, 0);
    assert.ok(sizes.true.inspections > 0);
    measurements.push({ channel, ...sizes });
  }
  assert.deepEqual(measurements[0].default, measurements[1].default, "a leitura comum é idêntica nos dois canais");
  assert.deepEqual(measurements[0].true, measurements[1].true, "a auditoria é idêntica nos dois canais");
});

test("auditoria sem serviço de inspeção mantém o estado unavailable de antes", async () => {
  const adapter = fixture({ units: [studyUnit(1)] });
  delete adapter.getCourseContentInspection;
  const read = await execute(adapter, "preparar_revisao", { auditoria: true });
  assert.ok(read.context.studyUnits.length > 0);
  for (const target of read.context.studyUnits) {
    assert.deepEqual(target.inspecaoIA, { state: "unavailable" }, "a inspeção pedida sem adapter continua unavailable");
    assert.equal(Object.hasOwn(target, "referenciaInspecao"), false);
    assert.equal(Object.hasOwn(target, "auditoriaPedagogica"), false);
  }
  const common = fixture({ units: [studyUnit(1)] });
  delete common.getCourseContentInspection;
  const plain = await execute(common, "preparar_revisao", {});
  assert.equal(Object.hasOwn(plain.context.studyUnits[0], "inspecaoIA"), false,
    "a leitura comum omite o estado mesmo sem serviço");
  assert.equal(Object.hasOwn(plain.context, "alcanceDaAuditoria"), false);
  assert.equal(read.context.alcanceDaAuditoria.estadosObtidos, 0);
  assert.equal(read.context.alcanceDaAuditoria.indisponiveis.length, 1);
  assert.match(read.nextDecision, /indisponível.*antes de concluir/u);
  assert.doesNotMatch(read.nextDecision, /Registre o parecer/u);
});

function reviewCoverageFixture({ count = 10, text, legacy = false, currentUnitIds = ["unit-4", "unit-5"] } = {}) {
  const units = Array.from({ length: count }, (_, index) => ({ ...studyUnit(index + 1, text),
    curriculumPath: { didacticMicrosequence: { id: "ms", title: "Um avanço" } } }));
  const adapter = fixture({ units });
  const plan = sharedExplanationFixture().adapter.getCourseInstructionalPlan;
  adapter.getCourseInstructionalPlan = plan;
  const inspect = adapter.getCourseContentInspection;
  adapter.getCourseContentInspection = async input => {
    const read = await inspect(input);
    const current = input.targetKind === "microsequence_explanation" || currentUnitIds.includes(input.targetId);
    const attention = input.targetId === "unit-5";
    read.inspection = current ? { state: "current", basisHash: read.basisHash,
      inspectedAt: "2026-09-05T12:00:00Z", report: {
        summary: "Parecer sintético vigente.", outcome: attention ? "needs_attention" : "consistent",
        findings: attention ? ["Rever o exemplo da unidade 5."] : [],
        checks: ["alignment", "evidence", "representation", "feedback", "sufficiency",
          ...(!legacy ? ["configuration"] : [])].map(dimension => ({ dimension,
          result: attention && dimension === "sufficiency" ? "insufficient" : "sufficient",
          reason: "Julgamento da base sintética.", evidence: ["Conteúdo da base sintética."] }))
      } } : { state: "pending", basisHash: read.basisHash };
    return read;
  };
  return adapter;
}

test("alcance da auditoria conta somente alvos lidos e distingue MS inteira de seleção nos dois canais", async () => {
  const outputs = [];
  for (const channel of ["mcp", "actions"]) {
    for (const selected of [false, true]) {
      const adapter = reviewCoverageFixture();
      const args = { curso: TITLE, microssequencia: "Um avanço", auditoria: true,
        ...(selected ? { unidades: [4, 5] } : {}) };
      const read = await readChannelContext(channel, adapter, "preparar_revisao", args);
      const summary = read.context.alcanceDaAuditoria;
      assert.equal(summary.escopo, selected ? "unidades_selecionadas" : "microssequencia");
      assert.deepEqual(summary.paginaLogica, { temAnterior: false, temProxima: false });
      assert.equal(summary.alvosLidos, selected ? 3 : 11);
      assert.equal(summary.estadosObtidos, summary.alvosLidos);
      assert.deepEqual(summary.estados, { current: 3, pending: selected ? 0 : 8, unregistered: 0, unavailable: 0 });
      assert.equal(summary.atuaisComSeisDimensoes, 3);
      assert.equal(summary.atuaisIncompletos, 0);
      assert.deepEqual(summary.resultadosComSeisDimensoes, { consistent: 2, needs_attention: 1, human_preference_retained: 0 });
      assert.deepEqual(summary.aInspecionar.map(target => target.titulo), selected ? []
        : [1, 2, 3, 6, 7, 8, 9, 10].map(index => `Unidade ${index}`));
      assert.deepEqual(summary.comRessalvas, [{ tipo: "unidade", posicao: selected ? 2 : 5,
        titulo: "Unidade 5", resultado: "needs_attention" }]);
      for (const target of summary.aInspecionar) {
        assert.equal(read.context.studyUnits[target.posicao - 1].studyUnit.title, target.titulo);
        assert.ok(read.context.studyUnits[target.posicao - 1].referenciaInspecao);
      }
      assert.equal(adapter.calls.inspections.length, summary.alvosLidos * read.pages,
        "o resumo usa as inspeções já lidas, inclusive ao remontar fragmentos");
      assert.equal(adapter.calls.reviews.length, adapter.calls.inspections.length);
      assert.ok(read.decisions.filter(value => value.temMais).every(value =>
        /^Continue lendo as continuações/u.test(value.decision) && !/Registre o parecer/u.test(value.decision)));
      assert.match(read.finalDecision, /ressalvas.*preserve os pareceres válidos/u);
      assert.match(read.finalDecision, /não certificam aprendizagem nem revisão humana/u);
      if (selected) {
        assert.match(summary.limite, /seleção não certifica a microssequência inteira/u);
        assert.doesNotMatch(read.finalDecision, /Registre o parecer/u);
        assert.match(read.finalDecision, /somente a seleção/u);
      } else {
        assert.match(read.finalDecision, /somente para os alvos aInspecionar/u);
        assert.ok(read.pages > 1, "fragmentar não duplica os onze alvos do resumo");
      }
      outputs.push(summary);
    }
  }
  assert.deepEqual(outputs.slice(0, 2), outputs.slice(2), "MCP e Actions preservam o mesmo alcance");
});

test("alcance da auditoria é local a cada página lógica, inclusive a última e seus fragmentos", async () => {
  for (const [channel, finalPageCurrent] of [["mcp", false], ["actions", false], ["mcp", true], ["actions", true]]) {
    const adapter = reviewCoverageFixture({ count: 14, text: "Conteúdo literal da página. ".repeat(90),
      ...(finalPageCurrent ? { currentUnitIds: ["unit-4", "unit-5", "unit-13", "unit-14"] } : {}) });
    const args = { curso: TITLE, microssequencia: "Um avanço", auditoria: true };
    let continuation, literal = "", fragmentCount = 0, finalDecision;
    const summaries = [];
    do {
      const response = await channelCall(channel, adapter, "preparar_revisao", { ...args,
        ...(continuation ? { continuacao: continuation } : {}) });
      assert.equal(response.status, 200, response.envelope);
      const page = response.value.context;
      assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 16 * 1024);
      assert.ok(JSON.stringify(page).length <= 12_000);
      if (page.temMais) {
        assert.match(response.value.nextDecision, /^Continue lendo as continuações/u);
        assert.doesNotMatch(response.value.nextDecision, /Registre o parecer/u);
      }
      if (page.fragmento) {
        assert.equal(page.fragmento.inicio, literal.length);
        literal += page.fragmento.texto;
        fragmentCount += 1;
        assert.ok(fragmentCount < 90);
        if (page.fragmento.fim === page.fragmento.total) {
          summaries.push(JSON.parse(literal).alcanceDaAuditoria); literal = "";
        }
      } else summaries.push(page.alcanceDaAuditoria);
      continuation = page.continuacao;
      finalDecision = response.value.nextDecision;
    } while (continuation);
    assert.equal(summaries.length, 2);
    assert.ok(fragmentCount > 2);
    assert.deepEqual(summaries.map(value => value.paginaLogica), [
      { temAnterior: false, temProxima: true }, { temAnterior: true, temProxima: false }
    ]);
    assert.deepEqual(summaries.map(value => value.alvosLidos), [13, 3], "a Explicação é relida em cada página");
    assert.deepEqual(summaries.map(value => value.estados.pending), [10, finalPageCurrent ? 0 : 2]);
    assert.match(finalDecision, /última página não resume as anteriores/u);
    assert.match(finalDecision, /trate as pendências e ressalvas de cada uma/u);
    if (finalPageCurrent) assert.match(finalDecision, /pareceres desta página estão atuais/u);
    assert.ok(summaries.every(value => !Object.hasOwn(value, "totalGlobal") && !Object.hasOwn(value, "coberturaCompleta")));
    assert.match(summaries[1].limite, /não são um total global/u);
  }
});

test("parecer current legado exige completar dimensões e current com preferência não vira consistent", async () => {
  const legacy = await readLogicalPage(reviewCoverageFixture({ legacy: true }), "preparar_revisao",
    { microssequencia: "Um avanço", unidades: [4, 5], auditoria: true });
  const summary = legacy.context.alcanceDaAuditoria;
  assert.equal(summary.estados.current, 3);
  assert.equal(summary.atuaisComSeisDimensoes, 0);
  assert.equal(summary.atuaisIncompletos, 3);
  assert.equal(summary.resultadosComSeisDimensoes.consistent, 0);
  assert.equal(summary.aInspecionar.length, 3);
  assert.equal(summary.comRessalvas[0].titulo, "Unidade 5", "o parecer legado também conserva sua ressalva");
  assert.match(legacy.nextDecision, /Registre o parecer das seis dimensões/u);
  assert.match(legacy.nextDecision, /Relate as ressalvas/u);

  for (const outcome of ["consistent", "human_preference_retained"]) {
    const adapter = reviewCoverageFixture();
    const inspect = adapter.getCourseContentInspection;
    adapter.getCourseContentInspection = async input => {
      const read = await inspect(input);
      read.inspection.report.outcome = outcome;
      return read;
    };
    const read = await readLogicalPage(adapter, "preparar_revisao", { unidades: [4], auditoria: true });
    assert.equal(read.context.alcanceDaAuditoria.aInspecionar.length, 0);
    assert.equal(read.context.alcanceDaAuditoria.resultadosComSeisDimensoes[outcome], 2);
    assert.doesNotMatch(read.nextDecision, /Registre o parecer/u);
    assert.match(read.nextDecision, outcome === "consistent" ? /atuais nas seis dimensões/u : /Relate as ressalvas/u);
  }
});

test("falha ou revisão concorrente da inspeção não se convertem em zero pendências", async () => {
  for (const channel of ["mcp", "actions"]) {
    for (const failure of ["access_denied", "request_timeout", "course_revision_conflict"]) {
      const adapter = reviewCoverageFixture();
      const inspect = adapter.getCourseContentInspection;
      adapter.getCourseContentInspection = async input => {
        if (failure !== "course_revision_conflict") throw Object.assign(new Error("Leitura recusada"),
          { status: failure === "access_denied" ? 403 : 504, code: failure });
        const read = await inspect(input); read.courseRevision += 1; return read;
      };
      const response = await channelCall(channel, adapter, "preparar_revisao", { curso: TITLE, auditoria: true });
      assert.equal(response.value?.context?.alcanceDaAuditoria, undefined);
      assert.ok(response.payload.error || response.payload.result?.isError, response.envelope);
    }
  }
});

test("continuação da revisão liga o modo de auditoria aos argumentos", async () => {
  const units = Array.from({ length: 24 }, (_, index) => studyUnit(index + 1,
    "Conteúdo literal extenso da unidade. ".repeat(60)));
  const audited = fixture({ units, totalUnits: 1200 });
  const auditRead = await execute(audited, "preparar_revisao", { auditoria: true });
  assert.ok(auditRead.context.continuacao, "a auditoria devolve continuação para a página seguinte");
  await assert.rejects(() => execute(audited, "preparar_revisao", { auditoria: false,
    continuacao: auditRead.context.continuacao
  }), error => error.status === 409 && error.code === "human_read_context_changed");
  const omitting = fixture({ units, totalUnits: 1200 });
  const commonRead = await execute(omitting, "preparar_revisao", {});
  assert.ok(commonRead.context.continuacao, "a leitura comum também pagina no recorte extenso");
  await assert.rejects(() => execute(omitting, "preparar_revisao", { auditoria: true,
    continuacao: commonRead.context.continuacao
  }), error => error.status === 409 && error.code === "human_read_context_changed");
  const same = await execute(omitting, "preparar_revisao", { continuacao: commonRead.context.continuacao });
  assert.ok(same.context.fragmento, "a mesma consulta continua a leitura comum");
});

test("continuação da revisão orienta ler até o fim antes de registrar nos dois modos", async () => {
  for (const channel of ["actions", "mcp"]) {
    for (const mode of ["comum", true]) {
      const units = Array.from({ length: 12 }, (_, index) => studyUnit(index + 1,
        "Conteúdo literal extenso da unidade. ".repeat(60)));
      const adapter = fixture({ units });
      const args = mode === true ? { curso: TITLE, auditoria: true } : { curso: TITLE };
      let continuation, pages = 0, decisionFinal;
      for (;;) {
        const response = await channelCall(channel, adapter, "preparar_revisao", { ...args,
          ...(continuation ? { continuacao: continuation } : {}) });
        assert.equal(response.status, 200, response.envelope);
        const page = response.value.context;
        assert.ok(JSON.stringify(page).length <= 12_000, "cada página respeita 12.000 caracteres");
        assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 16 * 1024, "cada página respeita 16 KiB");
        pages += 1;
        const decision = response.value.nextDecision;
        if (page.temMais !== true) { decisionFinal = decision; break; }
        assert.match(decision, /Continue lendo as continuações/u,
          channel + "/" + mode + ": página aberta orienta terminar a leitura");
        assert.doesNotMatch(decision, /Registre o parecer/u,
          channel + "/" + mode + ": não orienta registrar entre trechos");
        assert.ok(page.fragmento, "página aberta entrega fragmento");
        continuation = page.continuacao;
        assert.ok(continuation, "há continuação enquanto a leitura está aberta");
        assert.ok(pages < 60, "a leitura termina sem repetir fragmentos");
      }
      assert.ok(pages > 1, channel + "/" + mode + ": o recorte fraciona");
      if (mode === true) {
        assert.match(decisionFinal, /^Registre o parecer das seis dimensões/u,
          "no fim, a auditoria orienta registrar o parecer");
        assert.match(decisionFinal, /referenciaInspecao/u,
          "a orientação final usa a referência de inspeção já devolvida por alvo");
        assert.match(decisionFinal, /não altera a base/u,
          "registrar a inspeção não obriga reler a base");
      } else {
        assert.match(decisionFinal, /auditoria: true/u, "no fim, a leitura comum indica a auditoria");
        assert.doesNotMatch(decisionFinal, /^Registre o parecer/u,
          "a leitura comum não orienta registrar sem base");
      }
      assert.ok(adapter.calls.units.every(input => input.cursorStudyUnitId === null),
        "cada fragmento relê a mesma página lógica, com os mesmos argumentos");
    }
  }
});

function sharedExplanationFixture({ sourceIds = [] } = {}) {
  const units = [studyUnit(1), studyUnit(2)].map(unit => ({ ...unit,
    curriculumPath: { didacticMicrosequence: { id: "ms", title: "Um avanço" } } }));
  const adapter = fixture({ units });
  const support = { title: "Relação completa", content: [{ id: "support", package: "aralearn.resource.paragraph",
    version: "1.0.0", data: { text: "Uma explicação compartilhada preserva este texto integral para as duas unidades." } }] };
  adapter.getCourseInstructionalPlan = async () => ({ courseRevision: adapter.revision, plan: { title: TITLE,
    parts: [{ id: PART, position: 0, title: "Lote", microsequences: [{ id: "ms", title: "Um avanço", position: 0,
      explanationPlan: { purpose: "Explicitar a relação", prerequisites: [], relations: ["Uma relação"], sourceIds },
      explanation: support, contentReview: { state: "draft" } }] }] } });
  return { adapter, support, units };
}

test("unidades selecionadas recebem a Explicação compartilhada só como referência e título", async () => {
  const selected = sharedExplanationFixture();
  const read = await execute(selected.adapter, "preparar_revisao", { unidades: [1] });
  const explanation = read.context.explicacoes[0];
  assert.equal(explanation.microssequencia, "Um avanço");
  assert.equal(Object.hasOwn(explanation, "conteudo"), false, "a Explicação compartilhada não repete o conteúdo");
  assert.equal(Object.hasOwn(explanation, "fontes"), false);
  assert.equal(Object.hasOwn(explanation, "proposta"), false);
  assert.match(explanation.referenciaRevisao, /^[A-Za-z0-9_-]+$/u);
  assert.equal(read.context.studyUnits.length, 1);
  assert.deepEqual(read.context.studyUnits[0].studyUnit, selected.units[0].studyUnit,
    "a unidade selecionada continua literal");
  assert.equal(selected.adapter.calls.inspections.length, 0);

  const withoutSelection = sharedExplanationFixture();
  const whole = await execute(withoutSelection.adapter, "preparar_revisao", { microssequencia: "Um avanço" });
  assert.deepEqual(whole.context.explicacoes[0].conteudo, withoutSelection.support,
    "a microssequência sem seleção de unidades mantém a Explicação literal");
  assert.equal(whole.context.studyUnits.length, 2);
});

test("unidades selecionadas não buscam fontes da Explicação compartilhada", async () => {
  const selected = sharedExplanationFixture({ sourceIds: ["fonte-da-explicacao"] });
  selected.adapter.getCourseSources = async () => {
    throw Object.assign(new Error("Leitura recusada"), { code: "access_denied" });
  };
  const read = await execute(selected.adapter, "preparar_revisao", { unidades: [1] });
  assert.deepEqual(read.context.studyUnits[0].studyUnit, selected.units[0].studyUnit,
    "a unidade selecionada continua literal mesmo com a fonte da Explicação recusada");
  const explanation = read.context.explicacoes[0];
  assert.equal(explanation.microssequencia, "Um avanço");
  assert.equal(Object.hasOwn(explanation, "fontes"), false);
  assert.equal(Object.hasOwn(explanation, "conteudo"), false);
  assert.equal(Object.hasOwn(explanation, "proposta"), false);
  assert.equal(selected.adapter.calls.sources.length, 0,
    "nem fontes previstas nem vínculos do alvo são buscados para a Explicação descartada");
  assert.equal(selected.adapter.calls.inspections.length, 0);
  assert.equal(selected.adapter.calls.reviews.length,
    read.context.studyUnits.length + read.context.explicacoes.length,
    "a guarda de revisão continua rodando para cada alvo entregue");
});

