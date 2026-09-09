import test from "node:test";
import assert from "node:assert/strict";
import { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { normalizeCourseAuthoringAnalyticsPage } from "../../src/domain/courseAuthoringAnalytics.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";
import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { buildCourseAuthoringComparison, normalizeCourseAuthoringComparison, normalizeCourseAuthoringComparisonRequest, assembleCourseAuthoringExport, normalizeCourseAuthoringExport } from "../../src/domain/courseAuthoringComparison.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";
import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";

const OTHER_ID = "20000000-0000-4000-8000-000000000003";
const ACTOR_ID = "20000000-0000-4000-8000-000000000004";
const principal = { actorId: ACTOR_ID };
const selection = (courseId = ANALYTICS_COURSE_ID, expectedRevision = 7) => ({ courseId, expectedRevision, scope: { kind: "course", ref: null } });
const declaration = (mode = "expository") => ({ mode, introducedInstructionalAnalysisUnitIds: [], usedInstructionalAnalysisUnitIds: [], explanationApplications: [], practiceApplications: [] });
function source(sourceRef = "source-one") {
  return { sourceRef, revision: 1, document: { kind: "book", defaultRoles: ["technical_conceptual"], title: "Referência literal", authors: [{ literal: "Instituição" }], publicationDate: "2026", identifier: null, language: "pt-BR", citationMode: "generated", citationText: null, bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: "https://example.test/reference", editionOrVersion: null, origin: "author_provided", availability: "open_access", verificationStatus: "unverified", studyVisibility: "hidden" }, attachments: [], anchors: [] };
}
function pair() {
  const left = courseAuthoringAnalyticsFixture({ studyUnits: [{ studyUnitRef: "u1", title: "Relação", declaration: declaration() }, { studyUnitRef: "u2", declaration: declaration("practice") }, { studyUnitRef: "u3" }] });
  left.basis.analysisUnits = [{ ref: "analysis-a", position: 1, statement: "A implica B.", description: "" }, { ref: "analysis-b", position: 2, statement: "C depende de D.", description: "Definição literal." }];
  left.basis.evidenceRequirements = [{ ref: "evidence-a", position: 1, statement: "Aplicar a relação.", description: "" }];
  left.basis.studyUnits[0].declaration.introducedInstructionalAnalysisUnitIds = ["analysis-a"];
  left.basis.studyUnits[0].declaration.usedInstructionalAnalysisUnitIds = ["analysis-a", "analysis-b"];
  left.basis.studyUnits[0].declaration.explanationApplications = [{ instructionalAnalysisUnitId: "analysis-a", developedForms: ["plain_definition", "mechanism"], notApplicable: [] }, { instructionalAnalysisUnitId: "analysis-b", developedForms: ["concrete_example"], notApplicable: [] }];
  left.basis.studyUnits[1].declaration.practiceApplications = [{ evidenceRequirementId: "evidence-a", opportunityId: "occasion-a", invariantTaskOperation: "Aplicar a relação.", variedDimensions: ["case_or_data"] }];
  left.basis.studyUnits[0].wordCount = 150;
  left.basis.studyUnits[0].components = [{ componentRef: "aralearn.resource.paragraph@1.0.0", instanceRef: "p", slot: "content" }];
  const right = structuredClone(left); right.course.id = OTHER_ID;
  return { left, right };
}

function sharedExplanationExportFixture() {
  const analytics = courseAuthoringAnalyticsFixture();
  analytics.basis.sources = [source()];
  const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
  const guide = { goal: "Compreender relações.", include: [], exclude: [], notation: [], avoid: [] };
  const support = { title: "Processo e comunicação", content: [paragraph("support-body", "Cada processo usa um socket para comunicar. 日本語 & <texto>")] };
  const microsequence = { id: "micro-a", title: "Processos", goal: "Relacionar processo e comunicação.", role: "explain",
    dependsOn: [], covers: [], checks: [], errors: [], explanation: support,
    studyUnits: [1, 2].map(position => ({ id: `unit-${position}`, position, title: `Relação ${position}`, role: "theory",
      content: [paragraph(`unit-body-${position}`, "Um socket liga o processo ao transporte.")], response: null, feedback: [], topics: [] })) };
  const document = { contract: "aralearn.course.v1", courses: [{ id: ANALYTICS_COURSE_ID, title: "Curso", goal: "Objetivo",
    modules: [{ id: "module-a", title: "Módulo", guide,
      lessons: [{ id: "lesson-a", title: "Lição", guide, topics: [], microsequences: [microsequence] }] }] }] };
  const explanationSources = [{ contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025",
    courseId: ANALYTICS_COURSE_ID, courseRevision: 7, mode: "target",
    query: { sourceId: null, targetKind: "microsequence_explanation", targetId: "micro-a" },
    pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, nextCursor: null,
    items: [{ targetKind: "microsequence_explanation", targetId: "micro-a", targetVersion: 2,
      sourceLinks: [{ linkId: "support-source", sourceId: "source-one", relation: "supported_by",
        roles: ["technical_conceptual"], anchors: [], occurrences: [{ occurrenceId: "support-occurrence", slot: "content",
          resourceId: "support-body", path: "text", quote: "Cada processo", prefix: null, suffix: null }] }],
      createdAt: "2026-09-07T12:00:00Z" }] }];
  return { analytics, document, explanationSources };
}

test("exportação conserva uma Explicação compartilhada e sua proveniência literal para várias unidades", () => {
  const fixture = sharedExplanationExportFixture();
  const result = normalizeCourseAuthoringExport(assembleCourseAuthoringExport(fixture));
  assert.deepEqual(result.artifact.document, fixture.document);
  assert.deepEqual(result.artifact.explanationSources, fixture.explanationSources);
  const microsequence = result.artifact.document.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.studyUnits.length, 2);
  assert.equal(microsequence.studyUnits.some(unit => Object.hasOwn(unit, "explanation")), false);
  assert.equal(JSON.stringify(result.artifact.document).split('"explanation":').length - 1, 1);
  assert.deepEqual(result.analytics.basis.sources, fixture.analytics.basis.sources);
});

test("exportação de rascunho mantém Explicação sem unidades e dependências ainda pendentes", () => {
  const fixture = sharedExplanationExportFixture();
  const microsequence = fixture.document.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.studyUnits = [];
  microsequence.dependsOn = ["microsequence-por-criar"];
  const result = normalizeCourseAuthoringExport(assembleCourseAuthoringExport(fixture));
  assert.deepEqual(result.artifact.document, fixture.document);
  assert.deepEqual(result.artifact.explanationSources, fixture.explanationSources);
  assert.throws(() => flattenCourseDocument(result.artifact.document), { code: "invalid_course_document" });
});

test("exportação rejeita proveniência ausente, repetida ou de outro alvo/revisão e aprovação fabricada", () => {
  const fixture = sharedExplanationExportFixture();
  assert.throws(() => assembleCourseAuthoringExport({ ...fixture, explanationSources: [] }), /proveniência/u);
  assert.throws(() => assembleCourseAuthoringExport({ ...fixture,
    explanationSources: [...fixture.explanationSources, ...fixture.explanationSources] }), /proveniência/u);
  for (const mutate of [
    read => { read.courseRevision = 8; },
    read => { read.courseId = OTHER_ID; },
    read => { read.query.targetId = "micro-b"; },
    read => { read.items[0].targetId = "micro-b"; },
    read => { read.items.push(structuredClone(read.items[0])); }
  ]) {
    const input = structuredClone(fixture); mutate(input.explanationSources[0]);
    assert.throws(() => assembleCourseAuthoringExport(input), /proveniência/u);
  }
  const exported = assembleCourseAuthoringExport(fixture);
  const missing = structuredClone(exported); delete missing.artifact.explanationSources;
  assert.throws(() => normalizeCourseAuthoringExport(missing));
  const forged = structuredClone(exported);
  forged.artifact.document.courses[0].modules[0].lessons[0].microsequences[0].contentReview =
    { state: "current", approvedAt: "2026-09-07T12:00:00Z" };
  assert.throws(() => normalizeCourseAuthoringExport(forged));
});
test("comparação distingue declaração, observação, ausências e não aplicabilidade com referências", () => {
  const { left, right } = pair();
  const result = normalizeCourseAuthoringComparison(buildCourseAuthoringComparison({ left, right }), { expectedRequest: { left: selection(), right: selection(OTHER_ID) } });
  const dimensions = new Map(result.dimensions.map((entry) => [entry.id, entry]));
  assert.deepEqual(dimensions.get("novelty").left, { value: 1, denominator: 1, missingCount: 1, notApplicableCount: 1, distribution: [{ value: 1, label: "1", count: 1, studyUnitRefs: ["u1"] }] });
  assert.equal(dimensions.get("reuse").left.value, 2);
  assert.equal(dimensions.get("revisits").left.value, 1);
  assert.equal(dimensions.get("explanations").left.value, 3);
  assert.equal(dimensions.get("practice").left.value, 1);
  assert.equal(dimensions.get("extent").left.value, 150);
  assert.equal(dimensions.get("representations").left.denominator, 3);
  assert.equal(dimensions.get("practice_position").delta, null);
  assert.equal(result.semanticVerification.status, "not_performed");
});
test("inventário literal inclui itens não aplicados, ignora identidade e preserva multiplicidade", () => {
  const { left, right } = pair();
  right.basis.analysisUnits.push({ ref: "analysis-extra", position: 3, statement: "C depende de D.", description: "Definição literal." });
  right.basis.analysisUnits[1].ref = "analysis-renamed";
  right.basis.studyUnits[0].declaration.usedInstructionalAnalysisUnitIds[1] = "analysis-renamed";
  right.basis.studyUnits[0].declaration.explanationApplications[1].instructionalAnalysisUnitId = "analysis-renamed";
  const result = buildCourseAuthoringComparison({ left, right });
  assert.deepEqual(result.inventory.analysisUnits.onlyRight, [{ value: { statement: "C depende de D.", description: "Definição literal." }, count: 1, refs: ["analysis-extra"] }]);
  right.basis.analysisUnits.pop();
  assert.equal(buildCourseAuthoringComparison({ left, right }).inventory.analysisUnits.equal, true);
  right.basis.analysisUnits[1].description = "Definição modificada.";
  assert.equal(buildCourseAuthoringComparison({ left, right }).inventory.analysisUnits.equal, false);
});
test("solicitado delegado e aplicado histórico permanecem separados, sem completar motivos ou parâmetros", () => {
  const { left, right } = pair();
  left.basis.studyUnits[0].appliedParameters = [{ parameterId: "study_unit_content_word_target", value: 180, origin: "automatic", reason: null, sourceScope: { kind: "study_unit", ref: null } }];
  right.basis.studyUnits[0].requestedParameters.find(({ parameterId }) => parameterId === "study_unit_content_word_target").mode = "fixed";
  right.basis.studyUnits[0].requestedParameters.find(({ parameterId }) => parameterId === "study_unit_content_word_target").value = 200;
  const result = buildCourseAuthoringComparison({ left, right });
  const applied = result.appliedParameters.find(({ parameterId }) => parameterId === "study_unit_content_word_target");
  assert.equal(applied.left.values[0].reason, null);
  assert.equal(applied.left.missingCount, 2);
  assert.equal(applied.right.missingCount, 3);
  assert.equal(result.requestedParameters.find(({ parameterId }) => parameterId === applied.parameterId).equal, false);
});
test("curso sem declaração não converte novidade ausente em zero", () => {
  const page = courseAuthoringAnalyticsFixture({ studyUnits: [{ studyUnitRef: "u" }] });
  const result = buildCourseAuthoringComparison({ left: page, right: page });
  assert.equal(result.dimensions[0].left.value, null);
  assert.equal(result.dimensions[0].delta, null);
  assert.equal(result.dimensions.find(({ id }) => id === "extent").left.value, 0);
});
test("exportação preserva literalmente a operação-alvo das oportunidades retornadas pelo writer", () => {
  const { left } = pair();
  const operation = "Aplicar a relação em contextos distintos, preservando a operação-alvo. ".repeat(5);
  left.basis.evidenceRequirements[0].statement = operation;
  const practices = [
    { evidenceRequirementId: "evidence-a", opportunityId: "case-a", invariantTaskOperation: operation, variedDimensions: ["case_or_data", "context"] },
    { evidenceRequirementId: "evidence-a", opportunityId: "case-b", invariantTaskOperation: operation, variedDimensions: ["case_or_data", "context"] }
  ];
  left.basis.studyUnits[1].declaration.practiceApplications = practices;
  const before = structuredClone(left);
  const analytics = normalizeCourseAuthoringAnalyticsPage(left);
  assert.deepEqual(analytics.basis.studyUnits[1].declaration.practiceApplications, practices);
  const document = { contract: "aralearn.course.v1", courses: [{ id: ANALYTICS_COURSE_ID, title: "Curso", goal: "Objetivo", modules: [] }] };
  const exported = normalizeCourseAuthoringExport(assembleCourseAuthoringExport({ analytics, document }), { expectedSelection: selection() });
  assert.deepEqual(exported.analytics.basis.studyUnits[1].declaration.practiceApplications, practices);
  assert.deepEqual(left, before);
});
test("operação-alvo da prática exige o campo atual, texto não vazio e limite de 2000 caracteres", () => {
  const { left } = pair();
  const current = left.basis.studyUnits[1].declaration.practiceApplications[0];
  current.invariantTaskOperation = "🔎".repeat(2000);
  assert.equal(normalizeCourseAuthoringAnalyticsPage(left).basis.studyUnits[1].declaration.practiceApplications[0].invariantTaskOperation, current.invariantTaskOperation);
  for (const invalid of [undefined, null, 7, {}, "", " \t\n", "🔎".repeat(2001)]) {
    const bad = structuredClone(left);
    const practice = bad.basis.studyUnits[1].declaration.practiceApplications[0];
    if (invalid === undefined) delete practice.invariantTaskOperation;
    else practice.invariantTaskOperation = invalid;
    assert.throws(() => normalizeCourseAuthoringAnalyticsPage(bad), { code: "invalid_course_authoring_basis" });
  }
  const extra = structuredClone(left);
  extra.basis.studyUnits[1].declaration.practiceApplications[0].unexpected = true;
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(extra), { code: "invalid_course_authoring_basis" });
});
test("Fontes são comparadas por metadados e anexos lógicos, sem depender dos IDs", () => {
  const { left, right } = pair(); left.basis.sources = [source()]; right.basis.sources = [source("source-copy")];
  assert.equal(buildCourseAuthoringComparison({ left, right }).inventory.sources.equal, true);
  right.basis.sources[0].document.title = "Outra referência";
  const result = buildCourseAuthoringComparison({ left, right });
  assert.equal(result.inventory.sources.equal, false);
  assert.equal(normalizeCourseAuthoringComparison(result).inventory.sources.onlyRight[0].value.document.title, "Outra referência");
});
test("fronteira recusa campos internos, distribuições falsificadas e curso/revisão/escopo trocados", () => {
  const { left, right } = pair(); const result = buildCourseAuthoringComparison({ left, right });
  assert.throws(() => normalizeCourseAuthoringComparisonRequest({ left: { ...selection(), actorId: ACTOR_ID }, right: selection(OTHER_ID) }));
  assert.throws(() => normalizeCourseAuthoringComparison(result, { expectedRequest: { left: selection(OTHER_ID), right: selection(OTHER_ID) } }));
  assert.throws(() => normalizeCourseAuthoringComparison(result, { expectedRequest: { left: selection(undefined, 8), right: selection(OTHER_ID) } }));
  const bad = structuredClone(result); bad.dimensions[0].left.value = 9; bad.dimensions[0].delta = -8;
  assert.throws(() => normalizeCourseAuthoringComparison(bad));
  const internal = structuredClone(result); internal.requestedParameters[0].left.values[0].actorId = ACTOR_ID;
  assert.throws(() => normalizeCourseAuthoringComparison(internal));
  const raw = structuredClone(left); raw.basis.studyUnits[0].payload = { secret: true };
  assert.throws(() => normalizeCourseAuthoringAnalyticsPage(raw));
});
test("exportação recompõe artefato integral e cerca curso/revisão sem snapshots ou atores", () => {
  const analytics = courseAuthoringAnalyticsFixture();
  const guide = { goal: "Preservar o percurso.", include: [], exclude: [], notation: [], avoid: [] };
  const document = { contract: "aralearn.course.v1", courses: [{ id: ANALYTICS_COURSE_ID, title: "Curso", goal: "Objetivo literal: 日本語 & <texto>",
    modules: [{ id: "module-a", title: "Módulo", guide, lessons: [{ id: "lesson-a", title: "Lição", guide, topics: [],
      microsequences: [{ id: "micro-a", title: "Microssequência", goal: "Preservar a cobertura.", role: "explain", dependsOn: [],
        scopeItemIds: ["11111111-1111-4111-8111-111111111111"], covers: ["Objetivo literal"], checks: [], errors: [], studyUnits: [] }] }] }] }] };
  const result = assembleCourseAuthoringExport({ analytics, document });
  assert.deepEqual(normalizeCourseAuthoringExport(result, { expectedSelection: selection() }), result);
  assert.deepEqual(result.artifact.document, document);
  assert.equal(result.artifact.document.courses[0].goal, document.courses[0].goal);
  assert.throws(() => normalizeCourseAuthoringExport({ ...result, course: { ...result.course, revision: 8 } }));
  assert.throws(() => normalizeCourseAuthoringExport({ ...result, actorId: ACTOR_ID }));
  assert.equal(JSON.stringify(result).includes("design_snapshot"), false);
});
function adapterFixture() { return new CourseSupabaseAdapter({ supabaseUrl: "https://project.example", serverApiKey: "sb_secret_test", publishableKey: "sb_publishable_test", publicAppUrl: "https://app.example/", fetchImpl: () => { throw new Error("Unexpected network"); }, attempts: 1 }); }
test("Adapter compara dois readers CAS e recusa mudança posterior de qualquer curso", async () => {
  const adapter = adapterFixture(); const reads = [];
  adapter.getCourseAuthoringAnalytics = async (request) => { reads.push(request); return courseAuthoringAnalyticsFixture({ courseId: request.courseId }); };
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: 7 });
  const result = await adapter.compareCourseAuthoring({ principal, left: selection(), right: selection(OTHER_ID) });
  assert.equal(result.contract, "aralearn.course-authoring-comparison.v1");
  assert.deepEqual(reads.map(({ principal: actor, expectedCourseRevision }) => [actor.actorId, expectedCourseRevision]), [[ACTOR_ID, 7], [ACTOR_ID, 7]]);
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: courseId === ANALYTICS_COURSE_ID ? 8 : 7 });
  await assert.rejects(adapter.compareCourseAuthoring({ principal, left: selection(), right: selection(OTHER_ID) }), (error) => error.status === 409);
});
test("Adapter não retorna comparação parcial quando um owner reader nega acesso", async () => {
  const adapter = adapterFixture();
  adapter.getCourseAuthoringAnalytics = async ({ courseId }) => { if (courseId === OTHER_ID) throw Object.assign(new Error("Negado"), { status: 404 }); return courseAuthoringAnalyticsFixture(); };
  await assert.rejects(adapter.compareCourseAuthoring({ principal, left: selection(), right: selection(OTHER_ID) }), (error) => error.status === 404);
});
test("Adapter exporta somente após todas páginas CAS e revisão final, sem usar cache", async () => {
  const adapter = adapterFixture(); const calls = [];
  adapter.getCourseAuthoringAnalytics = async () => courseAuthoringAnalyticsFixture();
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: 7, title: "Curso", goal: "Objetivo" });
  adapter.listCourseEntities = async (request) => { calls.push(request); return { contract: "aralearn.course-entities.v1", courseId: ANALYTICS_COURSE_ID, revision: 7, items: [], hasMore: false, nextCursor: null }; };
  const result = await adapter.getCourseAuthoringExport({ principal, ...selection() });
  assert.equal(result.artifact.document.courses[0].goal, "Objetivo");
  assert.equal(calls[0].expectedRevision, 7);
  adapter.listCourseEntities = async () => ({ contract: "aralearn.course-entities.v1", courseId: OTHER_ID, revision: 7, items: [], hasMore: false, nextCursor: null });
  await assert.rejects(adapter.getCourseAuthoringExport({ principal, ...selection() }), (error) => error.status === 503);
});

test("Adapter exporta fonte, aplicação e revisão do objeto fora do documento importável", async () => {
  const fixture = sharedExplanationExportFixture();
  const { rows } = flattenCourseDocument(fixture.document);
  const calls = [];
  const adapter = adapterFixture();
  adapter.getCourseAuthoringAnalytics = async () => fixture.analytics;
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: 7, title: "Curso", goal: "Objetivo" });
  adapter.listCourseEntities = async () => ({ contract: "aralearn.course-entities.v1", courseId: ANALYTICS_COURSE_ID,
    revision: 7, hasMore: false, nextCursor: null, items: rows.map(row => ({ ...row,
      contentReview: row.entityType === "microsequence" ? { state: "current", reviewedAt: "2026-09-07T12:00:00Z" } : null,
      appliedExplanationBasis: row.entityType === "study_unit" ? {
        contract: "aralearn.applied-explanation-basis.v1", microsequenceId: "micro-a", basisHash: "a".repeat(64), entityVersion: 2
      } : null })) });
  adapter.getCourseSources = async request => { calls.push(request); return fixture.explanationSources[0]; };
  const result = await adapter.getCourseAuthoringExport({ principal, ...selection() });
  assert.deepEqual(result.artifact.document, fixture.document);
  assert.deepEqual(result.artifact.explanationSources, fixture.explanationSources);
  assert.equal(calls.length, 1, "Duas unidades compartilham o mesmo apoio e a mesma leitura de fontes.");
  assert.deepEqual({ targetKind: calls[0].targetKind, targetId: calls[0].targetId, revision: calls[0].expectedRevision },
    { targetKind: "microsequence_explanation", targetId: "micro-a", revision: 7 });
  assert.equal(JSON.stringify(result.artifact.document).includes("contentReview"), false);
  assert.deepEqual(result.artifact.contentReviews, [{ targetKind: "microsequence_explanation", targetId: "micro-a",
    contentReview: { state: "current", reviewedAt: "2026-09-07T12:00:00Z" } }]);
  assert.equal(result.artifact.appliedExplanationBases.length, rows.filter(row => row.entityType === "study_unit").length);
  assert.ok(result.artifact.appliedExplanationBases.every(entry => entry.basis.sourceCourseId === ANALYTICS_COURSE_ID));
  assert.deepEqual(normalizeCourseAuthoringExport(result), result);
  adapter.getCourseSources = async () => ({ ...fixture.explanationSources[0], courseRevision: 8 });
  await assert.rejects(adapter.getCourseAuthoringExport({ principal, ...selection() }), { status: 503 });
  adapter.getCourseSources = async () => { throw Object.assign(new Error("Revisão mudou"), { status: 409 }); };
  await assert.rejects(adapter.getCourseAuthoringExport({ principal, ...selection() }), { status: 409 });
});
test("exportação falha fechada quando cursor se repete ou a revisão muda ao terminar", async () => {
  const adapter = adapterFixture(); let calls = 0;
  adapter.getCourseAuthoringAnalytics = async () => courseAuthoringAnalyticsFixture();
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: 7, title: "Curso", goal: "Objetivo" });
  adapter.listCourseEntities = async () => { calls += 1; return { contract: "aralearn.course-entities.v1", courseId: ANALYTICS_COURSE_ID, revision: 7, items: [{ entityType: "module", entityId: "m", parentType: null, parentId: null, position: 0, content: { title: "Módulo" } }], hasMore: true, nextCursor: { entityType: "module", entityId: "m" } }; };
  await assert.rejects(adapter.getCourseAuthoringExport({ principal, ...selection() }), (error) => error.status === 503);
  assert.equal(calls, 2);
  let metadataReads = 0;
  adapter.getCourse = async ({ courseId }) => ({ courseId, revision: ++metadataReads === 1 ? 7 : 8, title: "Curso", goal: "Objetivo" });
  adapter.listCourseEntities = async () => ({ contract: "aralearn.course-entities.v1", courseId: ANALYTICS_COURSE_ID, revision: 7, items: [], hasMore: false, nextCursor: null });
  await assert.rejects(adapter.getCourseAuthoringExport({ principal, ...selection() }), (error) => error.status === 409);
});
test("rotas comparação/export usam somente seleção normalizada e ator da sessão", async () => {
  const calls = []; const adapter = { compareCourseAuthoring: async (value) => { calls.push(value); return { ok: true }; }, getCourseAuthoringExport: async (value) => { calls.push(value); return { ok: true }; } };
  const actor = { ...principal, scopes: ["authoring:write"] };
  const request = new Request("https://app.example/v1/authoring-comparison", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ left: selection(), right: selection(OTHER_ID) }) });
  await executeCourseRoute({ request, route: routeCourseRequest(request.method, new URL(request.url).pathname), principal: actor, adapter });
  const exportRequest = new Request(`https://app.example/v1/courses/${ANALYTICS_COURSE_ID}/authoring-export?expectedRevision=7&scopeKind=course`);
  await executeCourseRoute({ request: exportRequest, route: routeCourseRequest(exportRequest.method, new URL(exportRequest.url).pathname), principal: actor, adapter });
  assert.equal(calls[0].principal.actorId, ACTOR_ID); assert.deepEqual(calls[0].left, selection());
  assert.equal(calls[1].expectedRevision, 7); assert.deepEqual(calls[1].scope, { kind: "course", ref: null });
  const bad = new Request("https://app.example/v1/authoring-comparison", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ left: selection(), right: selection(OTHER_ID), actorId: ACTOR_ID }) });
  await assert.rejects(executeCourseRoute({ request: bad, route: routeCourseRequest(bad.method, new URL(bad.url).pathname), principal: actor, adapter }), (error) => error.status === 422);
  assert.equal(calls.length, 2);
});
