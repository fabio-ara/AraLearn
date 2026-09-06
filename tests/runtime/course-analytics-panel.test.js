import assert from "node:assert/strict";
import test from "node:test";
import { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";
import { assembleCourseAuthoringExport, buildCourseAuthoringComparison } from "../../src/domain/courseAuthoringComparison.js";

class FakeRoot {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); this.fields = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) { return this.fields.get(selector) || null; }
}
const OTHER_ID = "30000000-0000-4000-8000-000000000003";
const course = { courseId: ANALYTICS_COURSE_ID, revision: 7, ownership: "owned", canEdit: true, title: "Curso" };
function page(options = {}) {
  const value = courseAuthoringAnalyticsFixture({ studyUnits: [{ studyUnitRef: "unit-one", title: "Relação <literal>", declaration: { mode: "expository", introducedInstructionalAnalysisUnitIds: ["analysis-one"], usedInstructionalAnalysisUnitIds: [], explanationApplications: [], practiceApplications: [] } }], ...options });
  value.basis.analysisUnits = [{ ref: "analysis-one", position: 1, statement: "Uma relação.", description: "Definição completa." }];
  value.scope.options.push({ kind: "study_unit", ref: "unit-one", label: "Relação <literal>" });
  return value;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function click(root, action, extra = {}) { root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseAnalyticsAction: action, ...extra } }) } }); await tick(); }
test("entrada mostra uma dimensão e distribuição; formulários e inventário ficam revelados", async () => {
  const root = new FakeRoot(); const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: async () => page() } });
  await panel.open();
  assert.match(root.innerHTML, /Novidade declarada/u); assert.match(root.innerHTML, /Distribuição por unidade/u);
  assert.doesNotMatch(root.innerHTML, /<select|<dialog|Configuração aplicada/u);
  await click(root, "configuration");
  assert.match(root.innerHTML, /<dialog/u); assert.match(root.innerHTML, /Dimensão e escopo/u);
  assert.match(root.innerHTML, /Posição da prática/u); assert.match(root.innerHTML, /Relação &lt;literal&gt;/u);
  panel.destroy(); assert.equal(root.listeners.size, 0);
});
test("distribuição abre títulos e destinos das unidades sem IDs como rótulos", async () => {
  const root = new FakeRoot(); const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: async () => page() } });
  await panel.open(); await click(root, "drill", { side: "current", group: "0" });
  assert.match(root.innerHTML, /Unidades desta distribuição/u); assert.match(root.innerHTML, /studyUnitId=unit-one/u);
  assert.match(root.innerHTML, />Relação &lt;literal&gt;<\/a>/u); assert.doesNotMatch(root.innerHTML, />unit-one</u);
});
test("dimensão muda localmente; escopo relê a mesma revisão e recusa revisão retornada distinta", async () => {
  const root = new FakeRoot(); const requests = [];
  const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: async (id, options) => { requests.push({ id, options }); const value = page(); if (requests.length > 1) { value.course.revision = 8; value.scope.selected = value.scope.options[1]; } return value; } } });
  await panel.open(); await click(root, "configuration");
  root.fields.set("[name='dimension']", { value: "extent" }); root.fields.set("[name='scope']", { value: "0" });
  await click(root, "apply-configuration"); assert.equal(requests.length, 1); assert.match(root.innerHTML, /Extensão textual/u);
  await click(root, "configuration"); root.fields.set("[name='scope']", { value: "1" }); await click(root, "apply-configuration");
  assert.equal(requests[1].options.expectedCourseRevision, 7); assert.match(root.innerHTML, /role="alert"/u); assert.doesNotMatch(root.innerHTML, /edição 8/u);
});
test("dados revelados preservam solicitado, aplicado e intervenções sem inferir prática das respostas", async () => {
  const root = new FakeRoot(); const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: async () => page() } });
  await panel.open(); await click(root, "details");
  assert.match(root.innerHTML, /Configuração solicitada/u); assert.match(root.innerHTML, /Configuração aplicada/u);
  assert.match(root.innerHTML, /Escolha automática ainda não aplicada/u); assert.match(root.innerHTML, /Intervenções por origem/u);
  assert.match(root.innerHTML, /Oportunidades declaradas por exigência/u);
});
test("comparação limita escolhas a cursos próprios, cerca ambas revisões e revela diferenças", async () => {
  const root = new FakeRoot(); const reads = []; let comparisonRequest;
  const controller = { listCourses: async () => ({ items: [course, { ...course, courseId: OTHER_ID, title: "Outro curso" }, { ...course, courseId: "not-owned", title: "Compartilhado", ownership: "shared", canEdit: false }], hasMore: false, nextCursor: null }), loadCourseAuthoringAnalytics: async (id, options) => { reads.push(options); return page({ courseId: id }); }, loadCourseAuthoringComparison: async (request) => { comparisonRequest = request; return buildCourseAuthoringComparison({ left: page(), right: page({ courseId: OTHER_ID }) }); } };
  const panel = createCourseAnalyticsPanel({ root, course, controller }); await panel.open(); await click(root, "compare");
  assert.doesNotMatch(root.innerHTML, /Compartilhado/u);
  root.listeners.get("change")({ target: { name: "comparisonCourse", value: "1" } }); await tick();
  await click(root, "apply-comparison");
  assert.equal(comparisonRequest.left.expectedRevision, 7); assert.equal(comparisonRequest.right.expectedRevision, 7);
  assert.equal(reads.at(-1).expectedCourseRevision, 7); assert.match(root.innerHTML, /Inventário planejado/u);
  assert.match(root.innerHTML, /Configuração solicitada/u); assert.match(root.innerHTML, /Configuração aplicada/u);
  await click(root, "close-sheet"); assert.match(root.innerHTML, /course-analytics-comparison/u);
});
test("exportação explícita busca o artefato completo do servidor e recusa resultado de outra edição", async () => {
  const root = new FakeRoot(); const downloads = []; let requested; let revision = 7;
  const controller = { loadCourseAuthoringAnalytics: async () => page(), exportCourseAuthoring: async (request) => { requested = request; return assembleCourseAuthoringExport({ analytics: page({ revision }), document: { contract: "aralearn.course.v1", courses: [{ id: ANALYTICS_COURSE_ID, title: "Curso", goal: "Objetivo integral 日本語", modules: [] }] } }); } };
  const panel = createCourseAnalyticsPanel({ root, course, controller, download: (value) => downloads.push(value) });
  await panel.open(); assert.equal(downloads.length, 0); await click(root, "export");
  assert.match(root.innerHTML, /conteúdo integral/u); await click(root, "export-json");
  assert.equal(requested.expectedRevision, 7); assert.equal(JSON.parse(downloads[0].content).artifact.document.courses[0].goal, "Objetivo integral 日本語");
  revision = 8; await click(root, "export-json"); assert.equal(downloads.length, 1); assert.match(root.innerHTML, /role="alert"/u);
});
test("resposta tardia não substitui nova revisão ou repopula painel destruído", async () => {
  const root = new FakeRoot(); const pending = [];
  const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: () => new Promise((resolve) => pending.push(resolve)) } });
  const first = panel.open(); const second = panel.refresh(8); pending[1](page({ revision: 8 })); await second; pending[0](page()); await first;
  assert.match(root.innerHTML, /edição 8/u);
  const third = panel.refresh(9); panel.destroy(); pending[2](page({ revision: 9 })); await third; assert.equal(root.innerHTML, "");
});
test("revogação retira leitura antiga da tela", async () => {
  const root = new FakeRoot(); let forbidden = false;
  const panel = createCourseAnalyticsPanel({ root, course, controller: { loadCourseAuthoringAnalytics: async () => { if (forbidden) throw Object.assign(new Error("Negado"), { status: 404 }); return page(); } } });
  await panel.open(); forbidden = true; await panel.refresh();
  assert.doesNotMatch(root.innerHTML, /Distribuição por unidade/u); assert.match(root.innerHTML, /Atualizar leitura/u);
});
