// Regressões do incidente de integração Codex/outubro de 2026, exercitadas
// localmente contra o executor humano e o handler MCP, com fixture sintética
// de 47 unidades, uma Explicação extensa e 32 fontes. Nenhuma dependência ou
// chamada hospedada participa destas provas: a aceitação ponta a ponta no
// serviço implantado permanece pendente de ambiente próprio.
import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { ARALEARN_MCP_PROTOCOL_VERSION, createAuthoringMcpHandler } from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { openContentReviewReference } from "../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js";
import { PEDAGOGICAL_AUDIT_DIMENSIONS } from "../../src/domain/coursePedagogicalAudit.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { normalizeMicrosequenceExplanation } from "../../src/domain/courseExplanation.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

const UNIT_COUNT = 47;
const SOURCE_COUNT = 32;
const COURSE = Object.freeze({ id: "1a000000-0000-4000-8000-000000000001", revision: 41 });
const PART = "3a000000-0000-4000-8000-000000000001";
const MS = "ms-protocolos";
const MS_TITLE = "Protocolos e portas";
const TITLE = "Curso sintético do incidente";
const PRINCIPAL = Object.freeze({ actorId: "2a000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"] });
const SOURCE_IDS = Array.from({ length: SOURCE_COUNT }, (_, index) => `source-${String(index + 1).padStart(2, "0")}`);
const ORIGIN = "https://chatgpt.com";
const MCP_URL = "https://project.example/functions/v1/aralearn-authoring-mcp";
const SUPPLEMENTARY = "\u{1D518}";
const unitIds = () => Array.from({ length: UNIT_COUNT }, (_, index) => `unit-${index + 1}`);
const unitLiteral = (index, repeat = 1) => `Marcador literal U${index}: ${SUPPLEMENTARY} α 中 😀 "citado" — quebra\nlinha.`.repeat(repeat);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const unavailable = () => new AuthoringApiError(503, "course_service_unavailable",
  "Prova local injetou indisponibilidade antes de entregar a resposta.");

function studyUnit(index, repeat = 1) {
  return { ordinal: index, version: 5,
    curriculumPath: { didacticMicrosequence: { id: MS, title: MS_TITLE } },
    studyUnit: { id: `unit-${index}`, version: 5, title: `Unidade ${index}`, kind: "theory",
      content: [{ id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: unitLiteral(index, repeat) } }],
      response: null, feedback: [] },
    authorship: {} };
}

function explanation(blocks = 10, repeat = 4) {
  return normalizeMicrosequenceExplanation({ title: "Explicação extensa do incidente",
    content: Array.from({ length: blocks }, (_, index) => ({
      id: `explanation-paragraph-${index + 1}`, package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: `Seção ${index + 1}. ${SUPPLEMENTARY} Protocolos, serviços e portas organizam a comunicação. `
        + "Um host pode oferecer vários serviços; cada serviço escuta em uma porta associada a um protocolo. "
        + "Texto sintético 😀 repetido para forçar a fragmentação literal da base. ".repeat(repeat) } })) });
}

function microsequence(blocks = 10, repeat = 4) {
  return { id: MS, title: MS_TITLE, position: 0, goal: "Relacionar protocolos, serviços e portas.",
    explanationPlan: { purpose: "Explicitar a relação entre protocolo, serviço e porta.",
      prerequisites: [], relations: ["TCP sobre IP"], sourceIds: [] },
    explanation: explanation(blocks, repeat), contentReview: { state: "draft" } };
}

function source(index) {
  const exact = `Passagem sintética ${index}.`;
  return { sourceId: SOURCE_IDS[index - 1], revision: 1, title: `Fonte sintética ${index}`,
    url: `https://example.test/source/${index}`, citationText: `Citação sintética ${index}`, status: "active",
    anchors: [{ anchorId: `anchor-${String(index).padStart(2, "0")}`, status: "active",
      humanLocator: `Seção ${index}`, verificationExcerpt: null,
      selector: { kind: "text_quote", exact }, needsReverification: false }] };
}

function citationLink(entry, index) {
  return { sourceId: entry.sourceId, relation: "informed_by", roles: ["technical_conceptual"],
    anchors: [{ anchorId: entry.anchors[0].anchorId, selector: { kind: "text_quote",
      exact: `Passagem sintética ${index}.` }, verificationExcerpt: null, humanLocator: `Seção ${index}` }],
    occurrences: [{ quote: `Afirmação sintética ${index}.`, prefix: "", suffix: "\n" }] };
}

// Fixture única deste arquivo: um curso sintético completo em memória.
function createAdapter(options = {}) {
  const { unitRepeat = 1, explanationBlocks = 10, explanationRepeat = 4,
    fullBasis = false, citationCount = 2 } = options;
  const units = Array.from({ length: UNIT_COUNT }, (_, index) => studyUnit(index + 1, unitRepeat));
  const sources = Array.from({ length: SOURCE_COUNT }, (_, index) => source(index + 1));
  const microsequenceFixture = () => microsequence(explanationBlocks, explanationRepeat);
  // A base de auditoria descreve a microssequência sem repetir o texto extenso
  // da Explicação, que já chega pelo plano; isso mantém a base compartilhada
  // integral sem reprocessar o volume a cada fragmento.
  const slimMicrosequence = () => { const value = microsequenceFixture(); delete value.explanation; return value; };
  const calls = { units: [], sources: [], reviews: [], inspections: [] };
  const reports = new Map();
  const state = { basisHash: "b".repeat(64), writes: 0, lastTarget: null };
  const pedagogicalBasis = (targetKind, targetId) => {
    const selected = targetKind === "study_unit"
      ? units.filter(unit => unit.studyUnit.id === targetId)
      : (fullBasis ? units : units.slice(0, 3)); // base representativa reduzida; a prova grande usa as 47
    return { targetKind, targetId, audience: null, microsequence: slimMicrosequence(), planItems: [], dependencies: [],
      studyUnits: selected.map(unit => ({ id: unit.studyUnit.id, content: structuredClone(unit.studyUnit),
        application: { practiceApplications: [] },
        design: { parameters: { before_and_after: true, variation: ["case_or_data", "external_representation"] } } })),
      citations: [{ targetKind, targetId, targetTitle: targetId,
        links: sources.slice(0, targetKind === "microsequence_explanation" ? citationCount : 1)
          .map((entry, index) => citationLink(entry, index + 1)) }],
      additionalContext: { literal: "Contexto sintético preservado", empty: null } };
  };
  const adapter = {
    calls, state, revision: COURSE.revision, publicAppUrl: "https://app.example/",
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async resolveActionPrincipal() { return { ...PRINCIPAL, authenticationKind: "action" }; },
    async listCourses() { return { items: [{ courseId: COURSE.id, title: TITLE }], hasMore: false, nextCursor: null }; },
    async getCourse({ courseId }) { return { courseId, revision: adapter.revision, title: TITLE }; },
    async getCourseInstructionalPlan() { return { courseRevision: adapter.revision, plan: { title: TITLE,
      curriculumMapStatus: "approved", instructionalAnalysisUnits: [], evidenceRequirements: [], curriculumScopeItems: [],
      curriculum: { modules: [{ id: "module-1", title: "Módulo", lessons: [
        { id: "lesson-1", title: "Lição", microsequences: [microsequenceFixture()] }] }] },
      parts: [{ id: PART, position: 0, title: "Parte única", intent: "Cobrir protocolos.",
        microsequences: [microsequenceFixture()] }] } }; },
    async getAuthoringProcessPreferences() { return { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
      updatedAt: null, preferences: defaultAuthoringProcessPreferences() }; },
    async getCourseDesign(input) { return courseDesignFixture({ courseId: input.courseId, moduleId: "module-1",
      lessonId: "lesson-1", microsequenceId: MS, studyUnitId: "unit-1" },
      { scope: input.scopeKind ?? "course", revision: adapter.revision }); },
    async getCourseContentReview(input) { calls.reviews.push(input);
      return { contract: "aralearn.course-content-review.v1", courseId: input.courseId, courseRevision: adapter.revision,
        targetKind: input.targetKind, targetId: input.targetId, entityVersion: 5, basisHash: "a".repeat(64),
        contentReview: { state: "draft" }, reviewPolicy: "saved" }; },
    async getCourseContentInspection(input) { calls.inspections.push(input);
      const report = reports.get(input.targetId) ?? null;
      return { contract: "aralearn.course-ai-inspection.v1", courseId: input.courseId, courseRevision: adapter.revision,
        targetKind: input.targetKind, targetId: input.targetId, basisHash: state.basisHash,
        inspection: { state: report ? "current" : "unregistered", basisHash: state.basisHash,
          ...(report ? { inspectedAt: "2026-10-05T00:00:00Z", report } : {}) },
        pedagogicalBasis: pedagogicalBasis(input.targetKind, input.targetId) }; },
    async getCourseContentInspectionReceipt() { return null; },
    async recordCourseContentInspection(input) { state.writes += 1; state.lastTarget = input.targetId;
      reports.set(input.targetId, structuredClone(input.report));
      return { contract: "aralearn.course-ai-inspection-change.v1", changed: true, idempotent: false,
        courseId: COURSE.id, courseRevision: adapter.revision, targetKind: input.targetKind, targetId: input.targetId,
        basisHash: state.basisHash, inspection: { state: "current", basisHash: state.basisHash,
          inspectedAt: "2026-10-05T00:00:00Z", report: structuredClone(input.report) } }; },
    async listCourseStudyUnits(input) { calls.units.push(input);
      const start = input.cursorStudyUnitId === null ? 0 : Number(String(input.cursorStudyUnitId).split("-").at(-1));
      const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? input.limit : 12;
      const items = units.slice(start, start + limit);
      const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < units.length,
        nextCursor: end < units.length ? { studyUnitId: `unit-${end}` } : null }; },
    async getCourseSources(input) { calls.sources.push(input);
      if (input.mode === "source") { const item = sources.find(entry => entry.sourceId === input.sourceId);
        return { items: item ? [structuredClone(item)] : [], nextCursor: null }; }
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind, targetId: input.targetId,
        sourceLinks: sources.map((entry, index) => citationLink(entry, index + 1)) }], nextCursor: null };
      const start = input.cursor === null || input.cursor === undefined ? 0
        : Number(String(input.cursor).split("-").at(-1));
      const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? input.limit : 24;
      const items = sources.slice(start, start + limit);
      const end = start + items.length;
      return { items: structuredClone(items), nextCursor: end < sources.length ? `source-${end}` : null }; },
    async getCourseAnchoredAnnotations() { return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null }; }
  };
  return { adapter, state };
}

const execute = (adapter, name, args) => executeHumanCourseTask({
  adapter, principal: PRINCIPAL, name, rawArguments: { curso: TITLE, ...args } });
const registerInspection = (adapter, referencia, parecer) => executeHumanCourseTask({
  adapter, principal: PRINCIPAL, name: "registrar_inspecao", rawArguments: { referencia, parecer } });

function mcpRequest(adapter, name, args) {
  const handler = createAuthoringMcpHandler({ adapter, allowedOrigins: new Set([ORIGIN]),
    resourceUrl: MCP_URL, authorizationServer: "https://project.example/auth/v1" });
  return handler(new Request(MCP_URL, { method: "POST", headers: { Origin: ORIGIN,
    Authorization: "Bearer synthetic-local-token", "Content-Type": "application/json",
    Accept: "application/json, text/event-stream", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }));
}
function createMcpCall(adapter) {
  return async (name, args) => {
    const payload = JSON.parse(await (await mcpRequest(adapter, name, { curso: TITLE, ...args })).text());
    if (payload.result?.isError) {
      const error = new Error(payload.result.structuredContent?.error?.message ?? "falha MCP");
      error.errorCode = payload.result.structuredContent?.error?.code;
      throw error;
    }
    return payload.result.structuredContent;
  };
}

// Leitor de cliente que só persiste o ponto de continuação depois de uma resposta
// entregue: é a guarda de leitura completa; falha não avança cursor nem remonta
// conteúdo parcial.
function createReader(call, seed = null) {
  return { cursor: seed?.cursor, literal: seed?.literal ?? "", pages: seed?.pages ?? [],
    fragments: seed?.fragments ?? 0,
    async advance(name, baseArgs) {
      const response = await call(name, { ...baseArgs, ...(this.cursor ? { continuacao: this.cursor } : {}) });
      const page = response.context;
      assert.ok(JSON.stringify(page).length <= 12_000, "envelope da página lógica");
      if (!page.fragmento) { this.pages.push(page); this.cursor = page.continuacao;
        return { done: !page.continuacao && page.temMais !== true }; }
      assert.equal(page.fragmento.inicio, this.literal.length);
      assert.ok(page.fragmento.fim > page.fragmento.inicio);
      this.literal += page.fragmento.texto;
      this.fragments += 1;
      assert.equal(page.fragmento.fim, this.literal.length);
      if (page.fragmento.fim < page.fragmento.total) {
        assert.equal(page.temMais, true); assert.ok(page.continuacao);
        this.cursor = page.continuacao; return { done: false };
      }
      this.pages.push(JSON.parse(this.literal)); this.literal = ""; this.cursor = page.continuacao;
      return { done: !page.continuacao };
    } };
}

async function readResilient(reader, name, baseArgs, tolerate = 8) {
  let failures = 0;
  while (true) {
    let result;
    try { result = await reader.advance(name, baseArgs); }
    catch (error) { failures += 1; if (failures > tolerate) throw error; continue; }
    if (result.done) return failures;
  }
}

const summarize = pages => ({
  unitIds: [...new Set(pages.flatMap(page => (page.studyUnits ?? []).map(entry => entry.studyUnit.id)))].sort(),
  explanationTitles: [...new Set(pages.flatMap(page => (page.explicacoes ?? []).map(entry => entry.microssequencia)))].sort() });

test("leitura formal completa alcança as 47 unidades e a Explicação com união exata de identificadores", async () => {
  const { adapter } = createAdapter();
  const reader = createReader((name, args) => execute(adapter, name, args));
  assert.equal(await readResilient(reader, "preparar_revisao", { auditoria: true }), 0);
  const summary = summarize(reader.pages);
  assert.equal(summary.unitIds.length, UNIT_COUNT);
  assert.deepEqual(summary.unitIds, unitIds().sort());
  assert.deepEqual(summary.explanationTitles, [MS_TITLE], "a Explicação repetida por página não vira alvo novo");
  assert.ok(reader.pages.length >= 4, "47 unidades não cabem em menos de quatro páginas lógicas");
  assert.ok(reader.fragments > reader.pages.length, "a base grande exige fragmentos literais contíguos");
  for (const page of reader.pages) {
    assert.equal(page.alcanceDaAuditoria.escopo, "curso");
    assert.ok(page.alcanceDaAuditoria.alvosLidos > 0);
  }
  assert.ok(JSON.stringify(reader.pages).includes(SUPPLEMENTARY), "par substituto reconstruído sem perda");
});

test("recortes explícitos 1–7, 8–27 e 28–47 compõem a união sem renovar os alvos omitidos", async () => {
  const { adapter } = createAdapter();
  const seen = new Set();
  for (const unidades of [range(1, 7), range(8, 27), range(28, 47)]) {
    const reader = createReader((name, args) => execute(adapter, name, args));
    await readResilient(reader, "preparar_revisao", { auditoria: true, unidades });
    const summary = summarize(reader.pages);
    assert.equal(summary.unitIds.length, unidades.length, "o recorte lê exatamente as posições pedidas");
    for (const id of summary.unitIds) { assert.ok(!seen.has(id), `alvo ${id} repetido entre recortes`); seen.add(id); }
  }
  assert.deepEqual([...seen].sort(), unitIds().sort());
  const single = createReader((name, args) => execute(adapter, name, args));
  await readResilient(single, "preparar_revisao", { auditoria: true, unidades: [4] });
  assert.deepEqual(summarize(single.pages).unitIds, ["unit-4"], "consultar U4 não devolve os demais alvos");
});

test("falha antes e depois da montagem não avança o cursor e a retomada sobrevive ao reinício", async () => {
  const reference = { unitIds: unitIds().sort(), explanationTitles: [MS_TITLE] };
  const expectedPages = 4;
  const { adapter } = createAdapter();
  const originalUnits = adapter.listCourseStudyUnits;
  const originalReview = adapter.getCourseContentReview;
  let unitCalls = 0, reviewCalls = 0;
  adapter.listCourseStudyUnits = async (...args) => {
    unitCalls += 1; if (unitCalls === 2) throw unavailable(); // falha antes de montar a página
    return originalUnits.apply(adapter, args); };
  adapter.getCourseContentReview = async (...args) => {
    reviewCalls += 1; if (reviewCalls === 3) throw unavailable(); // falha depois de obter a página
    return originalReview.apply(adapter, args); };
  const call = (name, args) => execute(adapter, name, args);
  const reader = createReader(call);
  let failures = 0;
  while (failures < 2 || reader.pages.length < 1) {
    const before = reader.pages.length;
    try {
      const result = await reader.advance("preparar_revisao", { auditoria: true });
      if (result.done) break;
    } catch {
      assert.equal(reader.pages.length, before, "falha não altera o último ponto válido");
      failures += 1;
    }
  }
  assert.ok(failures >= 2, "as duas falhas injetadas ocorreram");
  assert.equal(reader.pages.length, 1);
  assert.ok(reader.cursor, "checkpoint intermediário preserva a continuação");

  // Reinício do cliente: novo leitor parte do checkpoint já persistido.
  const checkpoint = { cursor: reader.cursor, literal: reader.literal,
    pages: structuredClone(reader.pages), fragments: reader.fragments };
  const restarted = createReader(call, checkpoint);
  assert.equal(await readResilient(restarted, "preparar_revisao", { auditoria: true }), 0);
  assert.deepEqual(summarize(restarted.pages), reference);
  assert.equal(restarted.pages.length, expectedPages, "sem página saltada ou duplicada");
});

test("fragmentos preservam Unicode, fecham temMais na transição e rejeitam mistura e cursor repetido", async () => {
  const { adapter } = createAdapter();
  let cursor, literal = "", fragments = 0, sawEndWithNextPage = false;
  do {
    const page = (await execute(adapter, "preparar_revisao",
      { auditoria: true, ...(cursor ? { continuacao: cursor } : {}) })).context;
    if (!page.fragmento) break;
    const { texto, inicio, fim, total } = page.fragmento;
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u.test(texto), "sem par substituto alto órfão");
    assert.ok(!/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(texto), "sem par substituto baixo órfão");
    assert.equal(inicio, literal.length);
    literal += texto;
    assert.equal(fim, literal.length);
    fragments += 1;
    cursor = page.continuacao;
    if (fim === total) {
      assert.ok(JSON.parse(literal), "fragmentos contíguos reconstroem JSON válido");
      assert.equal(page.temMais, Boolean(cursor), "fim==total encerra o texto; a próxima página depende da continuação");
      if (cursor) sawEndWithNextPage = true;
      literal = "";
    }
  } while (cursor);
  assert.ok(fragments > 4);
  assert.ok(sawEndWithNextPage, "uma página terminou em fim==total com temMais:true");

  // Cursor repetido pelo backend não devolve página duplicada.
  const repeated = createAdapter();
  const base = repeated.adapter.listCourseStudyUnits;
  repeated.adapter.listCourseStudyUnits = async input => {
    const page = await base.call(repeated.adapter, input);
    return input.cursorStudyUnitId === "unit-12"
      ? { items: page.items, hasMore: true, nextCursor: { studyUnitId: "unit-12" } } : page; };
  const reader = createReader((name, args) => execute(repeated.adapter, name, args));
  while (reader.pages.length < 1) { const result = await reader.advance("preparar_revisao", { auditoria: true }); if (result.done) break; }
  assert.equal(reader.pages.length, 1);
  await assert.rejects(() => reader.advance("preparar_revisao", { auditoria: true }),
    { code: "course_service_unavailable" });

  // Continuação não pode ser combinada com outros argumentos (lacuna/mistura).
  const mixed = createAdapter();
  const opened = await execute(mixed.adapter, "preparar_revisao", { auditoria: true });
  await assert.rejects(() => execute(mixed.adapter, "preparar_revisao",
    { auditoria: true, unidades: [1], continuacao: opened.context.continuacao }), error => error.status === 409);
});

test("parecer de IA exige seis dimensões com evidência literal, vincula o alvo e mantém a revisão humana separada", async () => {
  const { adapter, state } = createAdapter();
  const reader = createReader((name, args) => execute(adapter, name, args));
  await readResilient(reader, "preparar_revisao", { auditoria: true, unidades: [1] });
  const target = reader.pages.flatMap(page => page.studyUnits ?? []).find(entry => entry.studyUnit.id === "unit-1");
  const reference = target.referenciaInspecao;
  const opened = openContentReviewReference(reference, PRINCIPAL);
  assert.equal(opened.targetKind, "study_unit");
  assert.equal(opened.targetId, "unit-1", "a identidade do alvo vem da referência, não de suposição do cliente");
  const literal = "Marcador literal U1";
  const checks = (dimensions, evidence) => dimensions.map(dimension => ({ dimension, result: "sufficient",
    reason: "Julgamento sintético da base lida.", evidence }));
  const parecer = entries => ({ summary: "Inspeção sintética da base.", outcome: "needs_attention",
    findings: ["Ajustar a relação entre protocolo, serviço e porta."], checks: entries });

  await assert.rejects(() => registerInspection(adapter, reference,
    parecer(checks(PEDAGOGICAL_AUDIT_DIMENSIONS.slice(0, 5), [literal]))),
  { code: "pedagogical_audit_configuration_required" });
  assert.equal(state.writes, 0, "cinco dimensões não gravam nada");
  await assert.rejects(() => registerInspection(adapter, reference,
    parecer(checks(PEDAGOGICAL_AUDIT_DIMENSIONS, ["Trecho que não existe na base inspecionada."]))),
  { code: "invalid_pedagogical_audit" });
  assert.equal(state.writes, 0, "evidência inventada não grava nada");

  const valid = parecer(checks(PEDAGOGICAL_AUDIT_DIMENSIONS, [literal]));
  const accepted = await registerInspection(adapter, reference, valid);
  assert.equal(accepted.context.inspecaoIA.state, "current");
  assert.equal(state.writes, 1);
  assert.equal(state.lastTarget, "unit-1", "a escrita usa somente o alvo da referência");
  const review = await adapter.getCourseContentReview({ courseId: COURSE.id,
    targetKind: "study_unit", targetId: "unit-1" });
  assert.equal(review.contentReview.state, "draft", "inspeção de IA não vira revisão humana");

  state.basisHash = "c".repeat(64);
  await assert.rejects(() => registerInspection(adapter, reference, valid),
    { code: "course_ai_inspection_conflict" });
  assert.equal(state.writes, 1, "referência obsoleta não grava nem reavalia a base atual");
});

test("saída MCP local não carrega o error_code do conector e expõe a forma observável do erro", async () => {
  const { adapter } = createAdapter();
  adapter.getCourse = async () => { throw unavailable(); };
  const payload = JSON.parse(await (await mcpRequest(adapter, "consultar_planejamento",
    { curso: TITLE, resumo: true })).text());
  assert.equal(payload.result.isError, true);
  const { structuredContent } = payload.result;
  assert.equal(structuredContent.error.code, "temporarily_unavailable");
  assert.equal(structuredContent.error.retryable, true);
  assert.equal(Object.hasOwn(structuredContent, "error_code"), false);
  assert.equal(Object.hasOwn(structuredContent.error, "error_code"), false);
  assert.doesNotMatch(JSON.stringify(payload.result), /error_code/u,
    "o campo error_code é do conector, não desta saída local");
  assert.deepEqual(Object.keys(structuredContent).sort(), ["error", "nextDecision"],
    "forma observada no caminho de erro local (sem result/deepLink)");
});

test("T20 local: três passagens serializadas pelo handler MCP completam 47+1 após interrupção e reinício", async () => {
  const reference = { unitIds: unitIds().sort(), explanationTitles: [MS_TITLE] };
  const cleanPass = async () => {
    const { adapter } = createAdapter();
    const reader = createReader(createMcpCall(adapter));
    assert.equal(await readResilient(reader, "preparar_revisao", { auditoria: true }), 0);
    return { summary: summarize(reader.pages), pages: reader.pages.length }; };
  const interruptedPass = async () => {
    const { adapter } = createAdapter();
    const originalUnits = adapter.listCourseStudyUnits;
    const originalReview = adapter.getCourseContentReview;
    let unitCalls = 0, reviewCalls = 0;
    adapter.listCourseStudyUnits = async (...args) => { unitCalls += 1; if (unitCalls === 2) throw unavailable();
      return originalUnits.apply(adapter, args); };
    adapter.getCourseContentReview = async (...args) => { reviewCalls += 1; if (reviewCalls === 4) throw unavailable();
      return originalReview.apply(adapter, args); };
    const reader = createReader(createMcpCall(adapter));
    const failures = await readResilient(reader, "preparar_revisao", { auditoria: true });
    assert.ok(failures >= 2);
    return { summary: summarize(reader.pages), pages: reader.pages.length }; };
  const restartedPass = async () => {
    const { adapter } = createAdapter();
    const call = createMcpCall(adapter);
    const first = createReader(call);
    await first.advance("preparar_revisao", { auditoria: true });
    await first.advance("preparar_revisao", { auditoria: true });
    const checkpoint = { cursor: first.cursor, literal: first.literal,
      pages: structuredClone(first.pages), fragments: first.fragments };
    const restarted = createReader(call, checkpoint);
    assert.equal(await readResilient(restarted, "preparar_revisao", { auditoria: true }), 0);
    return { summary: summarize(restarted.pages), pages: restarted.pages.length }; };

  const clean = await cleanPass();
  const interrupted = await interruptedPass();
  const restarted = await restartedPass();
  for (const [label, result] of [["interrompida", interrupted], ["reiniciada", restarted]]) {
    assert.deepEqual(result.summary, clean.summary, `passagem ${label} difere do conjunto completo`);
    assert.equal(result.pages, clean.pages, `passagem ${label} não salta nem duplica página`);
  }
  assert.deepEqual(clean.summary, reference);
  assert.equal(clean.summary.unitIds.length, UNIT_COUNT);
});

test("T19: leitura formal de escala preserva a base compartilhada integral e equivale aos recortes estáveis", async (t) => {
  // 9 recursos (equivalentes à MS8). O contrato do parágrafo limita cada texto a
  // 12.000 caracteres, então o repeat fica no teto do contrato e o volume da
  // prova vem da base integral de 47 unidades, sem alterar o produto.
  const { adapter } = createAdapter({ explanationBlocks: 9, explanationRepeat: 160, unitRepeat: 45,
    fullBasis: true, citationCount: 32 });

  // Um único percurso medido: memória, latência por chamada e bytes serializados.
  const readScope = async (extra = {}) => {
    const baseline = process.memoryUsage();
    let peakRss = baseline.rss;
    let peakHeap = baseline.heapUsed;
    const latencies = [];
    const callBytes = [];
    const pages = [];
    const pageChars = [];
    const pageBytes = [];
    let cursor;
    let literal = "";
    let fragments = 0;
    do {
      const before = process.hrtime.bigint();
      const page = (await execute(adapter, "preparar_revisao",
        { auditoria: true, ...extra, ...(cursor ? { continuacao: cursor } : {}) })).context;
      latencies.push(Number(process.hrtime.bigint() - before) / 1e6);
      const memory = process.memoryUsage();
      peakRss = Math.max(peakRss, memory.rss);
      peakHeap = Math.max(peakHeap, memory.heapUsed);
      callBytes.push(Buffer.byteLength(JSON.stringify(page)));
      if (!page.fragmento) {
        pages.push(page);
        pageChars.push(JSON.stringify(page).length);
        pageBytes.push(Buffer.byteLength(JSON.stringify(page)));
        break;
      }
      assert.equal(page.fragmento.inicio, literal.length);
      if (page.fragmento.inicio === 0) pageChars.push(page.fragmento.total);
      literal += page.fragmento.texto;
      fragments += 1;
      cursor = page.continuacao;
      if (page.fragmento.fim === page.fragmento.total) {
        pages.push(JSON.parse(literal));
        pageBytes.push(Buffer.byteLength(literal));
        literal = "";
      }
    } while (cursor);
    return { pages, fragments, pageChars, pageBytes, callBytes, latencies,
      baselineRss: baseline.rss, peakRss, baselineHeap: baseline.heapUsed, peakHeap };
  };

  const full = await readScope();
  const volumeChars = full.pageChars.reduce((total, value) => total + value, 0);
  const volumeBytes = full.pageBytes.reduce((total, value) => total + value, 0);
  t.diagnostic(JSON.stringify({ escopo: "curso completo", volumeChars, volumeBytes,
    pages: full.pages.length, fragments: full.fragments, calls: full.latencies.length,
    latencyMinMs: Math.min(...full.latencies), latencyMaxMs: Math.max(...full.latencies),
    latencyTotalMs: full.latencies.reduce((total, value) => total + value, 0),
    rssBaselineBytes: full.baselineRss, rssPeakBytes: full.peakRss,
    heapBaselineBytes: full.baselineHeap, heapPeakBytes: full.peakHeap,
    callBytesMin: Math.min(...full.callBytes), callBytesMax: Math.max(...full.callBytes),
    pageBytes: full.pageBytes }));

  const summary = summarize(full.pages);
  assert.deepEqual(summary.unitIds, unitIds().sort());
  assert.deepEqual(summary.explanationTitles, [MS_TITLE]);
  assert.ok(volumeChars > 740_782, "volume lógico acima do recorte histórico incompleto");
  assert.ok(volumeChars >= 1_240_000, "volume lógico na faixa do controle histórico de auditoria");
  assert.ok(full.callBytes.every(bytes => bytes <= 16 * 1024), "cada chamada respeita o envelope de 16 KiB");
  assert.ok(full.peakRss >= full.baselineRss && full.peakHeap >= full.baselineHeap,
    "o pico de memória observado não é inferior à linha de base");

  for (const page of full.pages) {
    const focus = (page.auditoriasPedagogicas ?? []).find(group => group.basis.studyUnits?.length === UNIT_COUNT);
    assert.ok(focus, "a base compartilhada integral das 47 unidades pertence ao foco da Explicação");
    const covered = [...new Set(focus.basis.studyUnits.map(unit => {
      const match = /Marcador literal U(\d+)/u.exec(JSON.stringify(unit));
      return match ? Number(match[1]) : null;
    }))].sort((left, right) => left - right);
    assert.deepEqual(covered, Array.from({ length: UNIT_COUNT }, (_, index) => index + 1),
      "a base compartilhada cobre as 47 unidades");
    const explanation = (page.explicacoes ?? [])[0];
    assert.ok(explanation, "a Explicação integra a página formal");
    const sharedFocus = page.auditoriasPedagogicas[explanation.auditoriaPedagogica.foco - 1];
    const explanationCitations = explanation.auditoriaPedagogica.citacoesDoFoco
      .map(position => sharedFocus.citacoes[position - 1]);
    assert.equal(explanationCitations[0].links.length, SOURCE_COUNT,
      "as 32 fontes pertencem à base da Explicação");
    assert.equal(Object.hasOwn(explanation.auditoriaPedagogica.basis, "studyUnits"), false,
      "a base das unidades permanece compartilhada, não duplicada no alvo");
    const resolved = explanation.auditoriaPedagogica.unidadesParaConfronto
      .map(position => sharedFocus.unidadesParaConfronto[position - 1]);
    assert.equal(resolved.length, UNIT_COUNT, "o foco da Explicação cobre as 47 unidades");
    assert.ok(resolved.every(entry => entry && entry.observation && typeof entry.observation === "object"),
      "cada posição resolve observação própria, não apenas um índice");
    assert.ok(resolved.every(entry => Object.hasOwn(entry.observation, "declarado")),
      "a observação traz o conteúdo declarado, não só o comprimento");
  }

  // Equivalência semântica com recortes estáveis na mesma fixture. A comparação
  // usa o corpo visível, a configuração projetada, a base própria do alvo
  // (resolvida pelo foco da página), as citações visíveis e as observações
  // resolvidas; referências opacas servem de identidade. Índices de foco e
  // posição são normalizados.
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") {
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        if (key === "foco" || key === "unidadesParaConfronto") continue;
        out[key] = normalize(entry);
      }
      return out;
    }
    return value;
  };
  const resolveTarget = (page, target) => {
    const audit = target.auditoriaPedagogica ?? {};
    const focus = (page.auditoriasPedagogicas ?? [])[audit.foco - 1] ?? null;
    const observations = (audit.unidadesParaConfronto ?? [])
      .map(position => focus?.unidadesParaConfronto?.[position - 1] ?? null);
    // Citações vivem no foco; a base local do alvo é resolvida pelas posições.
    const localBasis = { ...audit.basis };
    if (Array.isArray(audit.citacoesDoFoco)) localBasis.citations = audit.citacoesDoFoco
      .map(position => focus?.citacoes?.[position - 1] ?? null);
    return {
      reference: target.referenciaInspecao,
      reviewReference: target.referenciaRevisao,
      content: normalize(target.studyUnit),
      localBasis: normalize(localBasis),
      inspecao: normalize(target.inspecaoIA ?? null),
      focusBasis: normalize(focus?.basis ?? null),
      focusInstruction: normalize(focus?.instruction ?? null),
      focusDefinitions: normalize(focus?.definicoesDosParametros ?? null),
      observations: normalize(observations)
    };
  };
  const collectTargets = pages => {
    const map = new Map();
    for (const page of pages) {
      for (const target of page.studyUnits ?? []) map.set(target.studyUnit.id, resolveTarget(page, target));
      for (const target of page.explicacoes ?? []) map.set(target.microssequencia, resolveTarget(page, target));
    }
    return map;
  };
  const fullTargets = collectTargets(full.pages);
  const sample = fullTargets.get("unit-1");
  assert.ok(sample.reference, "a identidade do alvo é a referência opaca");
  assert.ok(sample.localBasis.citations.length > 0, "a base local do alvo traz citações visíveis");
  assert.equal(sample.localBasis.citations[0].links.length, 1, "o alvo de unidade tem uma citação própria");
  for (const link of sample.localBasis.citations[0].links) {
    assert.equal(Object.hasOwn(link, "sourceId"), false, "a citação visível não expõe identidade técnica");
    const roles = link.papeis ?? link.roles;
    assert.ok(link.relation && Array.isArray(roles) && roles.length > 0, "relação e papéis preservados");
    assert.ok(Array.isArray(link.anchors) && link.anchors.length > 0, "âncora visível preservada");
    assert.ok(Array.isArray(link.occurrences), "ocorrências visíveis preservadas");
  }
  assert.ok(sample.observations.length > 0 && sample.observations.every(Boolean),
    "as observações do alvo resolvem na base compartilhada, sem posição solta");
  const focusUnits = sample.focusBasis?.studyUnits ?? [];
  assert.ok(focusUnits.length > 0 && focusUnits.every(unit => unit.design && unit.design.parameters &&
    (Array.isArray(unit.design.parameters)
      ? unit.design.parameters.length > 0
      : Object.keys(unit.design.parameters).length > 0)),
    "a base própria do foco projeta a configuração aplicada por unidade");
  assert.ok(sample.focusInstruction && JSON.stringify(sample.focusBasis).length > 100,
    "a base própria do foco é comparável, não vazia");

  for (const unidades of [range(1, 7), range(8, 27), range(28, 47)]) {
    const slice = await readScope({ unidades });
    const sliceTargets = collectTargets(slice.pages);
    const sliceUnits = [...sliceTargets.keys()].filter(key => key.startsWith("unit-"));
    assert.equal(sliceUnits.length, unidades.length, "o recorte lê exatamente as posições pedidas");
    for (const id of sliceUnits) {
      const reference = fullTargets.get(id);
      assert.ok(reference, "alvo do recorte existe na leitura completa");
      assert.deepEqual(sliceTargets.get(id), reference,
        "corpo, configuração, base própria, citações e observações estáveis por alvo");
    }
    const sliceExplanation = sliceTargets.get(MS_TITLE);
    const fullExplanation = fullTargets.get(MS_TITLE);
    assert.ok(sliceExplanation && fullExplanation, "a Explicação integra a leitura e o recorte");
    assert.deepEqual(sliceExplanation, fullExplanation, "a Explicação do recorte equivale à leitura completa");
    t.diagnostic(JSON.stringify({ escopo: "unidades " + unidades[0] + "-" + unidades[unidades.length - 1],
      pages: slice.pages.length, fragments: slice.fragments,
      latencyTotalMs: slice.latencies.reduce((total, value) => total + value, 0),
      volumeChars: slice.pageChars.reduce((total, value) => total + value, 0) }));
  }
});
