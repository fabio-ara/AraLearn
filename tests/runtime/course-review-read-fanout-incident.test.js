// Regressão do incidente de leitura (outubro de 2026): a seleção explícita de
// unidades em preparar_revisao precisa respeitar o cap da página lógica
// (12 alvos / 65536 bytes UTF-8) ANTES das leituras caras, conservando ordem,
// identidades, bases correntes da Explicação e retomada por continuação.
// Adaptador sintético em memória; nenhuma chamada hospedada.
import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { defaultAuthoringProcessPreferences } from "../../src/domain/authoringProcessPreferences.js";
import { normalizeMicrosequenceExplanation } from "../../src/domain/courseExplanation.js";

const UNIT_COUNT = 47;
const COURSE = Object.freeze({ id: "1a000000-0000-4000-8000-000000000001", revision: 41 });
const PART = "3a000000-0000-4000-8000-000000000001";
const MS = "ms-protocolos";
const MS_TITLE = "Protocolos e portas";
const TITLE = "Curso sintético do incidente";
const PRINCIPAL = Object.freeze({ actorId: "2a000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"] });
const MAX_PAGE_ITEMS = 12;
const MAX_PAGE_BYTES = 65536;
const encoder = new TextEncoder();

const unitText = (index, size, multibyte = false) => {
  if (multibyte) return "中".repeat(size);
  const base = `Unidade ${index}: α 中 😀 — `;
  const pad = "protocolo serviço porta host ".repeat(Math.ceil(size / 27));
  return (base + pad).slice(0, size);
};

function studyUnit(index, size, multibyte) {
  return { ordinal: index, version: 5,
    curriculumPath: { didacticMicrosequence: { id: MS, title: MS_TITLE } },
    studyUnit: { id: `unit-${index}`, version: 5, title: `Unidade ${index}`, kind: "theory",
      content: [{ id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
        data: { text: unitText(index, size, multibyte) } }],
      response: null, feedback: [] },
    authorship: {} };
}

function explanation() {
  return normalizeMicrosequenceExplanation({ title: "Explicação sintética da prova",
    content: [{ id: "explanation-paragraph-1", package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: "Texto sintético mínimo que define o termo fictício e o relaciona ao objetivo da prova focal." } }] });
}

function microsequence() {
  return { id: MS, title: MS_TITLE, position: 0, goal: "Relacionar protocolos, serviços e portas.",
    explanationPlan: { purpose: "Explicitar a relação.", prerequisites: [], relations: [], sourceIds: [] },
    explanation: explanation(), contentReview: { state: "draft" } };
}

function createAdapter({ unitCount = UNIT_COUNT, unitSize = 1500, multibyte = false } = {}) {
  const units = Array.from({ length: unitCount }, (_, index) => studyUnit(index + 1, unitSize, multibyte));
  const calls = { units: [], reviews: [], inspections: [], annotations: [], sources: [] };
  const adapter = {
    calls, revision: COURSE.revision, publicAppUrl: "https://app.example/",
    reset() { for (const key of Object.keys(calls)) calls[key].length = 0; },
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async listCourses() { return { items: [{ courseId: COURSE.id, title: TITLE }], hasMore: false, nextCursor: null }; },
    async getCourse({ courseId }) { return { courseId, revision: adapter.revision, title: TITLE }; },
    async getCourseInstructionalPlan() { return { courseRevision: adapter.revision, plan: { title: TITLE,
      curriculumMapStatus: "approved", instructionalAnalysisUnits: [], evidenceRequirements: [], curriculumScopeItems: [],
      curriculum: { modules: [{ id: "module-1", title: "Módulo", lessons: [
        { id: "lesson-1", title: "Lição", microsequences: [microsequence()] }] }] },
      parts: [{ id: PART, position: 0, title: "Parte única", intent: "Cobrir protocolos.",
        microsequences: [microsequence()] }] } }; },
    async getAuthoringProcessPreferences() { return { contract: "aralearn.authoring-process-preferences.v1", revision: 0,
      updatedAt: null, preferences: defaultAuthoringProcessPreferences() }; },
    async getCourseContentReview(input) { calls.reviews.push(input);
      return { contract: "aralearn.course-content-review.v1", courseId: input.courseId, courseRevision: adapter.revision,
        targetKind: input.targetKind, targetId: input.targetId, entityVersion: 5, basisHash: "a".repeat(64),
        contentReview: { state: "draft" }, reviewPolicy: "saved" }; },
    async getCourseContentInspection(input) { calls.inspections.push(input);
      return { contract: "aralearn.course-ai-inspection.v1", courseId: input.courseId, courseRevision: adapter.revision,
        targetKind: input.targetKind, targetId: input.targetId, basisHash: "b".repeat(64),
        inspection: { state: "unregistered", basisHash: "b".repeat(64) },
        pedagogicalBasis: { targetKind: input.targetKind, targetId: input.targetId, audience: null,
          microsequence: (() => { const value = microsequence(); delete value.explanation; return value; })(),
          planItems: [], dependencies: [], studyUnits: [], citations: [], additionalContext: {} } }; },
    async getCourseContentInspectionReceipt() { return null; },
    async listCourseStudyUnits(input) { calls.units.push(input);
      const start = input.cursorStudyUnitId === null || input.cursorStudyUnitId === undefined
        ? 0 : Number(String(input.cursorStudyUnitId).split("-").at(-1));
      const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? input.limit : 12;
      const items = units.slice(start, start + limit);
      const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < units.length,
        nextCursor: end < units.length ? { studyUnitId: `unit-${end}` } : null }; },
    async getCourseSources(input) { calls.sources.push(input);
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind, targetId: input.targetId,
        sourceLinks: [] }], nextCursor: null };
      return { items: [], nextCursor: null }; },
    async getCourseAnchoredAnnotations() { calls.annotations.push(true);
      return { items: [], annotationSetVersion: 1, hasMore: false, nextCursor: null }; }
  };
  return { adapter, calls };
}

const execute = (adapter, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
  name: "preparar_revisao", rawArguments: { curso: TITLE, auditoria: true, ...args } });

const studyUnitReviews = calls => calls.reviews.filter(review => review.targetKind === "study_unit").length;

// Leitor resiliente: segue continuações de página e reconstrói fragmentos literais.
async function readAll(adapter, baseArgs) {
  const pages = [];
  const perCallReviews = [];
  let cursor;
  let literal = "";
  let fragments = 0;
  let guard = 0;
  while (true) {
    assert.ok(++guard < 400, "a leitura não pode entrar em laço");
    adapter.reset();
    const response = await execute(adapter, { ...baseArgs, ...(cursor === undefined ? {} : { continuacao: cursor }) });
    perCallReviews.push(studyUnitReviews(adapter.calls));
    const page = response.context;
    if (page.fragmento) {
      fragments += 1;
      assert.equal(page.fragmento.inicio, literal.length, "fragmento contíguo");
      assert.equal(page.fragmento.formato, "application/json");
      literal += page.fragmento.texto;
      if (page.fragmento.fim < page.fragmento.total) { cursor = page.continuacao; continue; }
      assert.equal(literal.length, page.fragmento.total);
      pages.push(JSON.parse(literal));
      literal = "";
      cursor = page.continuacao;
      if (cursor === null || cursor === undefined) break;
      continue;
    }
    pages.push(page);
    cursor = page.continuacao;
    if (!page.temMais) break;
  }
  return { pages, perCallReviews, fragments };
}

const pageUnitIds = pages => pages.flatMap(page => (page.studyUnits ?? []).map(entry => entry.studyUnit.id));

test("seleção de 47 unidades limita calls por página e conserva 47 únicas na ordem", async () => {
  const { adapter } = createAdapter();
  const selection = Array.from({ length: UNIT_COUNT }, (_, index) => index + 1);
  const { pages, perCallReviews } = await readAll(adapter, { unidades: selection });
  assert.ok(pages.length >= 4, "47 unidades não cabem em menos de quatro páginas lógicas");
  for (const count of perCallReviews) {
    assert.ok(count <= MAX_PAGE_ITEMS, `cada chamada lê no máximo 12 alvos, veio ${count}`);
  }
  const ids = pageUnitIds(pages);
  assert.equal(ids.length, UNIT_COUNT, "todas as 47 unidades foram lidas uma vez");
  assert.equal(new Set(ids).size, UNIT_COUNT, "nenhuma unidade repetida");
  assert.deepEqual(ids, selection.map(index => `unit-${index}`), "a ordem vigente da seleção é preservada");
  for (const page of pages) {
    const review = page.explicacoes?.[0];
    assert.ok(review, "a Explicação acompanha cada página");
    assert.equal(review.microssequencia, MS_TITLE);
    assert.ok(review.referenciaRevisao, "base de revisão corrente presente");
    assert.ok(review.referenciaInspecao, "base de inspeção corrente presente");
    assert.ok(page.alcanceDaAuditoria, "alcance da auditoria preservado");
  }
});

test("seleção não monotônica preserva a ordem vigente e não ordena por identificador", async () => {
  const { adapter } = createAdapter({ unitCount: 6 });
  const { pages } = await readAll(adapter, { unidades: [3, 1, 5, 2] });
  assert.deepEqual(pageUnitIds(pages), ["unit-3", "unit-1", "unit-5", "unit-2"]);
});

test("cursor p fora da seleção é rejeitado com 409 antes de novas leituras", async () => {
  const { adapter } = createAdapter({ unitCount: 6 });
  const first = await execute(adapter, { unidades: [1, 2, 3] });
  const state = JSON.parse(Buffer.from(first.context.continuacao, "base64url").toString("utf8"));
  const tampered = Buffer.from(JSON.stringify({ ...state, p: "unit-999" }), "utf8").toString("base64url");
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1, 2, 3], continuacao: tampered }),
    error => error.code === "human_read_context_changed" && error.status === 409);
  assert.equal(adapter.calls.reviews.length, 0, "nenhum alvo foi lido antes de rejeitar");
});

test("mudança de revisão ou de argumentos é rejeitada com 409 antes das leituras", async () => {
  const { adapter } = createAdapter({ unitCount: 6 });
  const first = await execute(adapter, { unidades: [1, 2, 3] });
  const cursor = first.context.continuacao;
  adapter.reset();
  adapter.revision = COURSE.revision + 1;
  await assert.rejects(() => execute(adapter, { unidades: [1, 2, 3], continuacao: cursor }),
    error => error.status === 409);
  assert.equal(adapter.calls.reviews.length, 0, "revisão divergente não lê alvos");
  adapter.revision = COURSE.revision;
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1, 2, 3, 4], continuacao: cursor }),
    error => error.status === 409);
  assert.equal(adapter.calls.reviews.length, 0, "argumentos divergentes não leem alvos");
});

test("mesmo cursor persistido devolve a mesma página (replay offline)", async () => {
  const { adapter } = createAdapter({ unitCount: 6 });
  const first = await execute(adapter, { unidades: [1, 2, 3, 4, 5, 6] });
  const cursor = first.context.continuacao;
  const replayA = await execute(adapter, { unidades: [1, 2, 3, 4, 5, 6], continuacao: cursor });
  const replayB = await execute(adapter, { unidades: [1, 2, 3, 4, 5, 6], continuacao: cursor });
  assert.deepEqual(replayA.context, replayB.context, "a retomada é determinística");
  assert.deepEqual(pageUnitIds([replayA.context]), pageUnitIds([replayB.context]));
});

test("um alvo acima de 64 KiB ainda devolve a página com um alvo e fragmentos", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const { pages, fragments } = await readAll(adapter, { unidades: [1] });
  assert.equal(pages.length, 1);
  assert.equal(pages[0].studyUnits.length, 1, "o primeiro alvo entra mesmo acima do cap de bytes");
  assert.ok(fragments > 0, "o volume acima do cap é recuperado por fragmentos literais");
  assert.equal(pageUnitIds(pages)[0], "unit-1");
});

test("o cap de bytes conta UTF-8 e separa identidades exatas", async () => {
  // Cada alvo tem 12000 caracteres UTF-16 (中) mas ~36000 bytes UTF-8. Dois alvos
  // caberiam no cap por caracteres, mas estouram o cap de bytes: um cap por
  // caracteres encaixaria os dois e seria falso positivo.
  const { adapter } = createAdapter({ unitCount: 4, unitSize: 12_000, multibyte: true });
  const { pages, perCallReviews } = await readAll(adapter, { unidades: [1, 2, 3, 4] });
  assert.deepEqual(pageUnitIds(pages), ["unit-1", "unit-2", "unit-3", "unit-4"]);
  for (const count of perCallReviews) assert.ok(count >= 1 && count <= MAX_PAGE_ITEMS);
  const rawItem = item => ({ ordinal: item.ordinal, version: item.version,
    curriculumPath: item.curriculumPath, studyUnit: item.studyUnit, authorship: item.authorship });
  const pair = [rawItem(pages[0].studyUnits[0]), rawItem(pages[1].studyUnits[0])];
  assert.ok(JSON.stringify(pair).length <= MAX_PAGE_BYTES, "a soma em caracteres caberia no cap");
  assert.ok(encoder.encode(JSON.stringify(pair)).byteLength > MAX_PAGE_BYTES,
    "a soma em bytes UTF-8 excede o cap");
  for (const page of pages) assert.ok(page.studyUnits.length < 2,
    `o cap de bytes separa os alvos, veio ${page.studyUnits.length}`);
});
