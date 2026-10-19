// Regressão do incidente de leitura (outubro de 2026): a seleção explícita de
// unidades em preparar_revisao precisa respeitar o cap da página lógica
// (12 alvos / 65536 bytes UTF-8) ANTES das leituras caras, conservando ordem,
// identidades, bases correntes da Explicação e retomada por continuação.
// Adaptador sintético em memória; nenhuma chamada hospedada.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { AuthoringApiError, readDependencyDiagnostic, withDependencyDiagnostic }
  from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
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

function studyUnit(index, size, multibyte, microsequenceId = MS, microsequenceTitle = MS_TITLE) {
  return { ordinal: index, version: 5,
    curriculumPath: { didacticMicrosequence: { id: microsequenceId, title: microsequenceTitle } },
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

function microsequence(id = MS, title = MS_TITLE) {
  return { id, title, position: 0, goal: "Relacionar protocolos, serviços e portas.",
    objective: "Relacionar protocolos, serviços e portas.",
    explanationPlan: { purpose: "Explicitar a relação.", prerequisites: [], relations: [], sourceIds: [] },
    explanation: explanation(), contentReview: { state: "draft" } };
}

function withoutPlanContentReviews(value) {
  const result = structuredClone(value);
  for (const moduleValue of result.plan.curriculum.modules) {
    for (const lesson of moduleValue.lessons) {
      for (const item of lesson.microsequences) delete item.contentReview;
    }
  }
  for (const part of result.plan.parts) {
    for (const item of part.microsequences) delete item.contentReview;
  }
  return result;
}

function leanReviewPlan(value, courseId) {
  const plan = withoutPlanContentReviews(value).plan;
  const curriculumByMicrosequenceId = new Map(plan.curriculum.modules.flatMap(moduleValue =>
    moduleValue.lessons.flatMap(lesson => lesson.microsequences.map(microsequence =>
      [microsequence.id, microsequence]))));
  return {
    contract: "aralearn.course-review-plan.v1",
    courseId,
    courseRevision: value.courseRevision,
    plan: {
      id: plan.id, version: plan.version, title: plan.title, objective: plan.objective,
      audience: plan.audience, curriculumMapStatus: plan.curriculumMapStatus,
      declaredPrerequisites: structuredClone(plan.declaredPrerequisites),
      curriculum: { modules: plan.curriculum.modules.map(moduleValue => ({
        id: moduleValue.id, position: moduleValue.position, title: moduleValue.title, objective: moduleValue.objective,
        lessons: moduleValue.lessons.map(lesson => ({
          id: lesson.id, position: lesson.position, title: lesson.title, objective: lesson.objective,
          microsequences: lesson.microsequences.map(microsequence => ({
            id: microsequence.id, position: microsequence.position, title: microsequence.title,
            objective: microsequence.objective, explanationPlan: structuredClone(microsequence.explanationPlan),
            explanation: structuredClone(microsequence.explanation),
            dependencyMicrosequenceIds: structuredClone(microsequence.dependencyMicrosequenceIds ?? microsequence.dependsOn ?? [])
          }))
        }))
      })) },
      curriculumScopeItems: plan.curriculumScopeItems.map(scopeItem => ({
        id: scopeItem.id, position: scopeItem.position, statement: scopeItem.statement,
        curriculumTargets: structuredClone(scopeItem.curriculumTargets ?? [])
      })),
      parts: plan.parts.map(part => ({
        id: part.id, position: part.position, title: part.title, intent: part.intent,
        progression: structuredClone(part.progression ?? []), version: part.version,
        microsequences: part.microsequences.map(entry => {
          const source = curriculumByMicrosequenceId.get(entry.id);
          return {
            id: entry.id, productionPosition: entry.productionPosition,
            curriculumPath: structuredClone(entry.curriculumPath),
            title: source?.title, goal: source?.objective,
            explanationPlan: structuredClone(source?.explanationPlan),
            explanation: structuredClone(source?.explanation)
          };
        })
      })),
      updatedAt: plan.updatedAt
    }
  };
}

function createAdapter({ unitCount = UNIT_COUNT, unitSize = 1500, multibyte = false,
  reviewProjection = "full" } = {}) {
  const units = Array.from({ length: unitCount }, (_, index) => studyUnit(index + 1, unitSize, multibyte));
  const calls = { courses: [], units: [], unitBodies: [], outlines: [], reviews: [], inspections: [], annotations: [], sources: [], events: [],
    instructionalPlans: [], reviewPlans: [] };
  const totals = { instructionalPlans: 0, reviewPlans: 0 };
  const plan = { courseRevision: COURSE.revision, plan: { id: "plan-review", version: 2,
    title: TITLE, objective: "Objetivo sintético", updatedAt: "2026-10-17T00:00:00Z",
    audience: "Turma sintética", declaredPrerequisites: [], curriculumMapStatus: "approved",
    instructionalAnalysisUnits: [{ id: "analysis-unused", statement: "Proveniência descartada." }],
    evidenceRequirements: [], curriculumScopeItems: [{ id: "scope-1", position: 0,
      statement: "Cobertura preservada", state: "planned", developedIn: [],
      curriculumTargets: [{ moduleId: "module-1", lessonId: "lesson-1", didacticMicrosequenceIds: [MS] }] }],
    curriculum: { modules: [{ id: "module-1", position: 0, title: "Módulo", lessons: [
      { id: "lesson-1", position: 0, title: "Lição", microsequences: [{ ...microsequence(), position: 0, scopeItemIds: ["scope-1"],
        dependencyMicrosequenceIds: [] }] }] }] },
    parts: [{ id: PART, position: 0, title: "Parte única", intent: "Cobrir protocolos.",
      progression: [], version: 1, progress: { state: "planned" },
      microsequences: [{ ...microsequence(), productionPosition: 0, studyUnitCount: 1,
        curriculumPath: { moduleId: "module-1", moduleTitle: "Módulo", lessonId: "lesson-1", lessonTitle: "Lição" } }] }] } };
  const adapter = {
    calls, totals, plan, revision: COURSE.revision, publicAppUrl: "https://app.example/",
    // Versão independente do conjunto de observações: por contrato do banco ela não
    // pertence à revisão do curso e precisa invalidar qualquer reuso por conta própria.
    annotationSetVersion: 1,
    annotationItems: { 1: [] },
    reset() { for (const key of Object.keys(calls)) calls[key].length = 0; },
    async resolvePrincipal() { return { ...PRINCIPAL, authenticationKind: "oauth" }; },
    async listCourses() { return { items: [{ courseId: COURSE.id, title: TITLE }], hasMore: false, nextCursor: null }; },
    async getCourse(input) { calls.courses.push(input);
      return { courseId: input.courseId, revision: adapter.revision, annotationSetVersion: adapter.annotationSetVersion,
        title: TITLE }; },
    async getCourseInstructionalPlan(input) { calls.instructionalPlans.push(input);
      totals.instructionalPlans += 1;
      return { ...structuredClone(plan), courseRevision: adapter.revision }; },
    async getCourseReviewPlan(input) { calls.reviewPlans.push(input); calls.events.push("review-plan");
      totals.reviewPlans += 1;
      const full = withoutPlanContentReviews({ ...plan, courseRevision: adapter.revision });
      const sourceFingerprint = createHash("sha256").update(JSON.stringify(full)).digest("hex");
      if (reviewProjection === "lean") {
        const projected = leanReviewPlan(full, input.courseId);
        const selected = new Set(input.explanationIds ?? []);
        for (const moduleValue of projected.plan.curriculum.modules) for (const lesson of moduleValue.lessons) {
          for (const item of lesson.microsequences) if (!selected.has(item.id)) item.explanation = null;
        }
        return { ...projected, sourceFingerprint };
      }
      return { contract: "aralearn.course-instructional-plan.v3", courseId: input.courseId,
        ...full, sourceFingerprint }; },
    async getCourseInspectionTriageOutline(input) { calls.outlines.push(input); calls.events.push("outline");
      const outlineModules = adapter.plan.plan.curriculum.modules.map(moduleValue => ({ id: moduleValue.id,
        title: moduleValue.title, position: moduleValue.position, lessons: moduleValue.lessons.map(lesson => ({
          id: lesson.id, title: lesson.title, position: lesson.position,
          microsequences: lesson.microsequences.map(item => ({ id: item.id, title: item.title, position: item.position }))
        })) }));
      const outlineParts = adapter.plan.plan.parts.map(part => ({ id: part.id, title: part.title,
        position: part.position, microsequences: part.microsequences.map(item => ({ id: item.id,
          title: item.title, productionPosition: item.productionPosition })) }));
      return { contract: "aralearn.course-inspection-triage-outline.v1", courseId: input.courseId,
        courseRevision: adapter.revision, plan: { title: TITLE,
          curriculum: { modules: outlineModules }, parts: outlineParts,
          studyUnits: units.map((item, index) => ({ id: item.studyUnit.id, title: item.studyUnit.title,
            ordinal: index + 1, curriculumPath: { moduleId: "module-1", lessonId: "lesson-1",
              didacticMicrosequenceId: MS }, authoringPartId: item.ordinal > 2 ? PART : null })) } }; },
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
    async listCourseStudyUnits(input) { calls.units.push(input); calls.events.push("unit-page");
      if (input.anchorStudyUnitId) {
        const item = units.find(unit => unit.studyUnit.id === input.anchorStudyUnitId);
        if (item) calls.unitBodies.push(item.studyUnit.id);
        const index = item ? units.indexOf(item) : -1;
        const canonical = item ? { ...structuredClone(item),
          ordinal: input.scopeKind === "authoring_part" ? index - 1 : index + 1,
          curriculumPath: { module: { id: "module-1" }, lesson: { id: "lesson-1" },
            didacticMicrosequence: { id: MS } },
          authoringPart: index >= 2 ? { id: PART } : null } : null;
        return { courseRevision: adapter.revision, items: canonical ? [canonical] : [], hasMore: false, nextCursor: null };
      }
      const start = input.cursorStudyUnitId === null || input.cursorStudyUnitId === undefined
        ? 0 : Number(String(input.cursorStudyUnitId).split("-").at(-1));
      const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? input.limit : 12;
      const items = units.slice(start, start + limit);
      calls.unitBodies.push(...items.map(item => item.studyUnit.id));
      const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < units.length,
        nextCursor: end < units.length ? { studyUnitId: `unit-${end}` } : null }; },
    async getCourseSources(input) { calls.sources.push(input);
      if (input.mode === "target") return { items: [{ targetKind: input.targetKind, targetId: input.targetId,
        sourceLinks: [] }], nextCursor: null };
      return { items: [], nextCursor: null }; },
    async getCourseAnchoredAnnotations() { calls.annotations.push(true);
      return { items: structuredClone(adapter.annotationItems[adapter.annotationSetVersion] ?? []),
        annotationSetVersion: adapter.annotationSetVersion,
        courseRevision: adapter.revision, hasMore: false, nextCursor: null }; }
  };
  return { adapter, calls, units };
}

function configureReviewPageScope(adapter, units, microsequences, { unitMicrosequenceIds = [], partUnitIds = [] } = {}) {
  const partUnits = new Set(partUnitIds);
  const specsById = new Map(microsequences.map(item => [item.id, item]));
  units.forEach((unit, index) => {
    const selected = specsById.get(unitMicrosequenceIds[index] ?? microsequences[0]?.id);
    assert.ok(selected, `unit-${index + 1} has a configured microsequence`);
    unit.curriculumPath.didacticMicrosequence = { id: selected.id, title: selected.title };
  });
  const moduleValue = adapter.plan.plan.curriculum.modules[0];
  const lesson = moduleValue.lessons[0];
  const microById = new Map(microsequences.map((item, position) => [item.id, {
    ...microsequence(item.id, item.title), position, scopeItemIds: ["scope-1"], dependencyMicrosequenceIds: []
  }]));
  lesson.microsequences = [...microById.values()];
  adapter.plan.plan.parts[0].microsequences = microsequences.map((item, productionPosition) => ({
    ...structuredClone(microById.get(item.id)), productionPosition,
    studyUnitCount: units.filter((unit, index) => unit.curriculumPath.didacticMicrosequence.id === item.id &&
      partUnits.has(unit.studyUnit.id)).length,
    curriculumPath: { moduleId: moduleValue.id, moduleTitle: moduleValue.title,
      lessonId: lesson.id, lessonTitle: lesson.title }
  }));

  const indexedUnits = units.map((unit, index) => {
    const micro = unit.curriculumPath.didacticMicrosequence;
    const inPart = partUnits.has(unit.studyUnit.id);
    return { unit, id: unit.studyUnit.id, microsequenceId: micro.id, microsequenceTitle: micro.title,
      authoringPartId: inPart ? PART : null, globalOrdinal: index + 1 };
  });
  adapter.getCourseInspectionTriageOutline = async input => {
    adapter.calls.outlines.push(input);
    adapter.calls.events.push("outline");
    const outlineModules = adapter.plan.plan.curriculum.modules.map(value => ({ id: value.id,
      title: value.title, position: value.position, lessons: value.lessons.map(current => ({
        id: current.id, title: current.title, position: current.position,
        microsequences: current.microsequences.map(item => ({ id: item.id, title: item.title, position: item.position }))
      })) }));
    const outlineParts = adapter.plan.plan.parts.map(value => ({ id: value.id, title: value.title,
      position: value.position, microsequences: value.microsequences.map(item => ({ id: item.id,
        title: item.title, productionPosition: item.productionPosition })) }));
    return { contract: "aralearn.course-inspection-triage-outline.v1", courseId: COURSE.id,
      courseRevision: adapter.revision, plan: { title: TITLE,
        curriculum: { modules: outlineModules }, parts: outlineParts,
        studyUnits: indexedUnits.map(item => ({ id: item.id, title: item.unit.studyUnit.title,
          ordinal: item.authoringPartId ? indexedUnits.filter(value => value.authoringPartId === item.authoringPartId)
            .findIndex(value => value.id === item.id) + 1 : item.globalOrdinal,
          curriculumPath: { moduleId: moduleValue.id, lessonId: lesson.id,
            didacticMicrosequenceId: item.microsequenceId }, authoringPartId: item.authoringPartId })) } };
  };
  adapter.listCourseStudyUnits = async input => {
    adapter.calls.units.push(input);
    adapter.calls.events.push("unit-page");
    let scoped = indexedUnits;
    if (input.scopeKind === "authoring_part") scoped = scoped.filter(item => item.authoringPartId === input.scopeId);
    if (input.scopeKind === "didactic_microsequence") scoped = scoped.filter(item => item.microsequenceId === input.scopeId);
    if (input.anchorStudyUnitId) {
      const index = scoped.findIndex(item => item.id === input.anchorStudyUnitId);
      const item = index < 0 ? null : scoped[index];
      if (item) adapter.calls.unitBodies.push(item.id);
      return { courseRevision: adapter.revision, items: item ? [{ ...structuredClone(item.unit),
        ordinal: index + 1, curriculumPath: { module: { id: moduleValue.id }, lesson: { id: lesson.id },
          didacticMicrosequence: { id: item.microsequenceId, title: item.microsequenceTitle } },
        authoringPart: item.authoringPartId ? { id: item.authoringPartId } : null }] : [],
        hasMore: false, nextCursor: null };
    }
    const cursorIndex = input.cursorStudyUnitId == null ? -1 : scoped.findIndex(item => item.id === input.cursorStudyUnitId);
    if (input.cursorStudyUnitId != null && cursorIndex < 0) {
      return { courseRevision: adapter.revision, items: [], hasMore: false, nextCursor: null };
    }
    const start = cursorIndex + 1;
    const selected = [];
    let bytes = 0;
    for (let index = start; index < scoped.length; index += 1) {
      const item = scoped[index];
      const canonical = { ...structuredClone(item.unit),
        ordinal: index + 1, curriculumPath: { module: { id: moduleValue.id }, lesson: { id: lesson.id },
          didacticMicrosequence: { id: item.microsequenceId, title: item.microsequenceTitle } },
        authoringPart: item.authoringPartId ? { id: item.authoringPartId } : null };
      const size = Buffer.byteLength(JSON.stringify(canonical));
      if (selected.length && (selected.length >= input.limit || bytes + size > input.maxBytes)) break;
      selected.push({ item, canonical });
      bytes += size;
    }
    adapter.calls.unitBodies.push(...selected.map(value => value.item.id));
    return { courseRevision: adapter.revision, items: selected.map(value => value.canonical),
      hasMore: start + selected.length < scoped.length,
      nextCursor: start + selected.length < scoped.length && selected.length
        ? { studyUnitId: selected.at(-1).item.id } : null };
  };
}

const execute = (adapter, args) => executeHumanCourseTask({ adapter, principal: PRINCIPAL,
  name: "preparar_revisao", rawArguments: { curso: TITLE, auditoria: true, ...args } });

const studyUnitReviews = calls => calls.reviews.filter(review => review.targetKind === "study_unit").length;

const allInspections = calls => calls.inspections.length;

// Leitor resiliente: segue continuações de página e reconstrói fragmentos literais.
async function readAll(adapter, baseArgs) {
  const pages = [];
  const perCallReviews = [];
  const perCallInspections = [];
  const perCallReviewPlans = [];
  const perCallReviewPlanExplanationIds = [];
  const perCallUnitBodies = [];
  const perPageFragments = [];
  let cursor;
  let literal = "";
  let fragments = 0;
  let fragmentsInPage = 0;
  let guard = 0;
  while (true) {
    assert.ok(++guard < 400, "a leitura não pode entrar em laço");
    adapter.reset();
    const response = await execute(adapter, { ...baseArgs, ...(cursor === undefined ? {} : { continuacao: cursor }) });
    perCallReviews.push(studyUnitReviews(adapter.calls));
    perCallInspections.push(allInspections(adapter.calls));
    perCallReviewPlans.push(adapter.calls.reviewPlans.length);
    perCallReviewPlanExplanationIds.push(adapter.calls.reviewPlans[0]?.explanationIds ?? []);
    perCallUnitBodies.push(adapter.calls.unitBodies.slice());
    const page = response.context;
    if (page.fragmento) {
      fragments += 1;
      fragmentsInPage += 1;
      assert.equal(page.fragmento.inicio, literal.length, "fragmento contíguo");
      assert.equal(page.fragmento.formato, "application/json");
      literal += page.fragmento.texto;
      if (page.fragmento.fim < page.fragmento.total) { cursor = page.continuacao; continue; }
      assert.equal(literal.length, page.fragmento.total);
      pages.push(JSON.parse(literal));
      literal = "";
      perPageFragments.push(fragmentsInPage);
      fragmentsInPage = 0;
      cursor = page.continuacao;
      if (cursor === null || cursor === undefined) break;
      continue;
    }
    pages.push(page);
    perPageFragments.push(1);
    cursor = page.continuacao;
    if (!page.temMais) break;
  }
  assert.equal(perPageFragments.length, pages.length, "cada página lógica é contabilizada uma vez");
  return { pages, perCallReviews, perCallInspections, perCallReviewPlans, perCallUnitBodies,
    perCallReviewPlanExplanationIds, perPageFragments, fragments };
}

const pageUnitIds = pages => pages.flatMap(page => (page.studyUnits ?? []).map(entry => entry.studyUnit.id));

function reviewPlanIdsByPage(result) {
  let offset = 0;
  return result.perPageFragments.map(fragmentCount => {
    const calls = result.perCallReviewPlanExplanationIds.slice(offset, offset + fragmentCount);
    offset += fragmentCount;
    assert.ok(calls.length > 0, "cada página materializa um plano de revisão");
    for (const ids of calls.slice(1)) assert.deepEqual(ids, calls[0], "fragmentos da mesma página mantêm o mesmo foco");
    return calls[0];
  });
}

const scopedMicroSpecs = [
  { id: "ms-page-a", title: "Explicação A" },
  { id: "ms-page-b", title: "Explicação B" },
  { id: "ms-empty", title: "Explicação sem unidades" }
];

test("seleção global projeta explicações pela página e inclui vazias só na primeira", async () => {
  const { adapter, units } = createAdapter({ unitCount: 14, unitSize: 1_000 });
  configureReviewPageScope(adapter, units, scopedMicroSpecs, {
    unitMicrosequenceIds: [...Array(13).fill("ms-page-a"), "ms-page-b"]
  });
  const result = await readAll(adapter, {});

  assert.deepEqual(pageUnitIds(result.pages), Array.from({ length: 14 }, (_, index) => `unit-${index + 1}`));
  assert.equal(result.pages.length, 2, "o cap de 12 unidades produz duas páginas lógicas");
  const plans = reviewPlanIdsByPage(result);
  assert.deepEqual(plans, [["ms-page-a", "ms-empty"], ["ms-page-a", "ms-page-b"]]);
  assert.deepEqual([...new Set(plans.flat())].sort(), scopedMicroSpecs.map(item => item.id).sort(),
    "a união das páginas cobre todas as explicações do curso");
  assert.deepEqual(result.pages.map(page => page.explicacoes.map(item => item.microssequencia)),
    [["Explicação A", "Explicação sem unidades"], ["Explicação A", "Explicação B"]]);
});

test("seleção por parte projeta unidades da parte e vazias apenas na primeira página", async () => {
  const { adapter, units } = createAdapter({ unitCount: 15, unitSize: 1_000 });
  configureReviewPageScope(adapter, units, scopedMicroSpecs, {
    unitMicrosequenceIds: [...Array(7).fill("ms-page-a"), ...Array(7).fill("ms-page-b"), "ms-empty"],
    partUnitIds: units.slice(0, 14).map(unit => unit.studyUnit.id)
  });
  const result = await readAll(adapter, { parte: 1 });

  assert.deepEqual(pageUnitIds(result.pages), Array.from({ length: 14 }, (_, index) => `unit-${index + 1}`),
    "unit-15 pertence a outra parte e não torna ms-empty não vazia dentro deste escopo");
  assert.equal(result.pages.length, 2);
  const plans = reviewPlanIdsByPage(result);
  assert.deepEqual(plans, [["ms-page-a", "ms-page-b", "ms-empty"], ["ms-page-b"]]);
  assert.deepEqual([...new Set(plans.flat())].sort(), scopedMicroSpecs.map(item => item.id).sort(),
    "a união das páginas da parte cobre todas as explicações no escopo");
  assert.deepEqual(result.pages.map(page => page.explicacoes.map(item => item.microssequencia)),
    [["Explicação A", "Explicação B", "Explicação sem unidades"], ["Explicação B"]]);
});

test("seleções explícitas e escopos sem unidades preservam os corpos esperados", async () => {
  {
    const { adapter, units } = createAdapter({ unitCount: 2, unitSize: 1_000 });
    configureReviewPageScope(adapter, units, scopedMicroSpecs,
      { unitMicrosequenceIds: ["ms-page-a", "ms-page-b"] });
    await execute(adapter, { microssequencia: "Explicação sem unidades" });
    assert.deepEqual(adapter.calls.reviewPlans[0].explanationIds, ["ms-empty"], "microssequência explícita permanece integral");
  }
  {
    const { adapter, units } = createAdapter({ unitCount: 2, unitSize: 1_000 });
    configureReviewPageScope(adapter, units, scopedMicroSpecs,
      { unitMicrosequenceIds: ["ms-page-a", "ms-page-b"] });
    await execute(adapter, { unidades: [2] });
    assert.deepEqual(adapter.calls.reviewPlans[0].explanationIds, ["ms-page-b"], "unidade explícita mantém foco próprio");
  }
  {
    const { adapter, units } = createAdapter({ unitCount: 0, unitSize: 1_000 });
    configureReviewPageScope(adapter, units, scopedMicroSpecs);
    const result = await readAll(adapter, {});
    assert.equal(result.pages.length, 1);
    assert.deepEqual(reviewPlanIdsByPage(result), [["ms-page-a", "ms-page-b", "ms-empty"]],
      "sem unidades, o escopo global continua cobrindo todas as explicações");
  }
});

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

test("preparar_revisao resolve por índice e hidrata somente os IDs selecionados", async () => {
  const { adapter } = createAdapter({ unitCount: 196 });
  adapter.reset();
  await execute(adapter, { unidades: ["Unidade 46", 44, 45] });
  assert.deepEqual(adapter.calls.unitBodies, ["unit-46", "unit-44", "unit-45"]);
  assert.equal(adapter.calls.units.length, 3, "uma leitura canônica ancorada por ID selecionado");
  assert.equal(adapter.calls.outlines.length, 1, "a identidade vem do índice compacto autenticado");
  assert.equal(adapter.calls.events.indexOf("review-plan") > adapter.calls.events.lastIndexOf("unit-page"), true,
    "o plano só é projetado depois que a página de unidades define o foco");
  assert.deepEqual(adapter.calls.reviewPlans[0].explanationIds, [MS],
    "auditoria de unidades inclui só as explicações consumidas pelo contexto");
  adapter.reset();
  await execute(adapter, { auditoria: false, unidades: [46] });
  assert.deepEqual(adapter.calls.reviewPlans[0].explanationIds, [],
    "foco de unidade sem corpo não pede explicações que explanationReadContext não apresenta");
});

test("ordinais de escopo permanecem locais e títulos continuam resolvidos", async () => {
  const { adapter } = createAdapter({ unitCount: UNIT_COUNT });
  adapter.reset();
  const local = await execute(adapter, { parte: "Parte única", unidades: [1] });
  assert.deepEqual(adapter.calls.unitBodies, ["unit-3"], "ordinal 1 da parte aponta para seu primeiro alvo");
  assert.ok(local.context.fragmento, "a resposta continua usando fragmentação literal");
  adapter.reset();
  await execute(adapter, { unidades: ["Unidade 47"] });
  assert.deepEqual(adapter.calls.unitBodies, ["unit-47"]);
});

test("cursor p fora da seleção é rejeitado com 409 antes de novas leituras", async () => {
  const { adapter } = createAdapter({ unitCount: 6 });
  const first = await execute(adapter, { unidades: [1, 2, 3] });
  const state = JSON.parse(Buffer.from(first.context.continuacao, "base64url").toString("utf8"));
  const tampered = Buffer.from(JSON.stringify({ ...state, p: "unit-999" }), "utf8").toString("base64url");
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1, 2, 3], continuacao: tampered }),
    error => error.code === "human_read_context_changed" && error.status === 409);
  assert.equal(adapter.calls.unitBodies.length, 0, "cursor fora da seleção é rejeitado antes de hidratar corpos");
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
  assert.equal(adapter.calls.unitBodies.length, 0, "revisão divergente não hidrata unidades");
  assert.equal(adapter.calls.reviews.length, 0, "revisão divergente não lê alvos");
  adapter.revision = COURSE.revision;
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1, 2, 3, 4], continuacao: cursor }),
    error => error.status === 409);
  assert.equal(adapter.calls.unitBodies.length, 0, "argumentos divergentes não hidratam unidades");
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
  const { pages, perCallReviews, perPageFragments } = await readAll(adapter, { unidades: [1, 2, 3, 4] });
  assert.deepEqual(pageUnitIds(pages), ["unit-1", "unit-2", "unit-3", "unit-4"]);
  // O cap limita cada chamada; o fanout, porém, pertence à página lógica: cada página
  // lê seus alvos uma vez (na primeira chamada) e os fragmentos seguintes são
  // transporte. O total por página é o que separa as identidades exatas.
  let call = 0;
  for (const pageFragments of perPageFragments) {
    const perCall = perCallReviews.slice(call, call + pageFragments);
    for (const count of perCall) assert.ok(count <= MAX_PAGE_ITEMS);
    assert.ok(perCall[0] >= 1, "a primeira chamada da página lê seus alvos");
    assert.equal(perCall.reduce((total, count) => total + count, 0), perCall[0],
      "a página lógica paga o próprio fanout uma vez, não uma vez por fragmento");
    call += pageFragments;
  }
  assert.equal(call, perCallReviews.length, "todas as chamadas pertencem a uma página");
  const rawItem = item => ({ ordinal: item.ordinal, version: item.version,
    curriculumPath: item.curriculumPath, studyUnit: item.studyUnit, authorship: item.authorship });
  const pair = [rawItem(pages[0].studyUnits[0]), rawItem(pages[1].studyUnits[0])];
  assert.ok(JSON.stringify(pair).length <= MAX_PAGE_BYTES, "a soma em caracteres caberia no cap");
  assert.ok(encoder.encode(JSON.stringify(pair)).byteLength > MAX_PAGE_BYTES,
    "a soma em bytes UTF-8 excede o cap");
  for (const page of pages) assert.ok(page.studyUnits.length < 2,
    `o cap de bytes separa os alvos, veio ${page.studyUnits.length}`);
});

test("hidratação interrompe no cap UTF-8 com um lookahead e retoma sem ler o resto da seleção", async () => {
  const { adapter } = createAdapter({ unitCount: 12, unitSize: 12_000, multibyte: true });
  const selection = Array.from({ length: 12 }, (_, index) => index + 1);
  const { pages, perCallUnitBodies, perPageFragments } = await readAll(adapter, { unidades: selection });
  assert.equal(pages.length, 12, "cada unidade grande inicia a próxima página lógica");
  assert.deepEqual(pageUnitIds(pages), selection.map(index => `unit-${index}`), "o cursor mantém a ordem completa");
  assert.ok(perPageFragments.some(count => count > 1), "o corpo ainda é recomposto por fragmentos");
  assert.ok(perCallUnitBodies.length > 12, "a prova exercita continuações de fragmento e página");
  for (const ids of perCallUnitBodies) {
    assert.ok(ids.length <= 2, `uma página de um alvo aceita no máximo o alvo e um lookahead, leu ${ids.length}`);
  }
  assert.deepEqual(perCallUnitBodies[0], ["unit-1", "unit-2"], "o segundo corpo só mede a fronteira");
  assert.ok(perCallUnitBodies.slice(1).some(ids => ids[0] === "unit-2"),
    "o lookahead não avança o cursor e volta como primeiro alvo da próxima página");
});

// O custo do recorte é por PÁGINA LÓGICA, não por fragmento: consumir todos os
// fragmentos do mesmo cursor não pode reexecutar o fanout (plano, fontes,
// observações, alvos) uma vez por fragmento. O recorte de 12_000 caracteres é o
// transporte; ele não define quanto trabalho de leitura a página exige.
test("consumir todos os fragmentos não repete a revisão global por fragmento", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const { pages, perCallReviews, perCallInspections, perCallReviewPlans, fragments } = await readAll(adapter, { unidades: [1] });
  assert.ok(fragments > 1, `a página lógica precisa de mais de um fragmento, veio ${fragments}`);
  assert.equal(pages.length, 1);
  // Um fanout lê cada alvo da página uma vez: a unidade selecionada e a
  // Explicação de sua microssequência. O total por página lógica é o da primeira
  // chamada; multiplicá-lo pelo número de fragmentos é a regressão do incidente.
  const alvosPorPagina = perCallReviews[0];
  assert.ok(alvosPorPagina >= 1 && alvosPorPagina <= MAX_PAGE_ITEMS, `fanout por página = ${alvosPorPagina}`);
  const totalReviews = perCallReviews.reduce((total, count) => total + count, 0);
  const totalInspections = perCallInspections.reduce((total, count) => total + count, 0);
  assert.equal(totalReviews, perCallReviews[0],
    `o fanout de revisão ocorre uma vez por página lógica; veio ${totalReviews} em ${fragments} fragmentos`);
  assert.equal(totalInspections, perCallInspections[0],
    `o fanout de inspeção ocorre uma vez por página lógica; veio ${totalInspections} em ${fragments} fragmentos`);
  assert.ok(perCallInspections[0] >= 2, "a página audita a unidade e a Explicação da microssequência");
  assert.equal(adapter.totals.instructionalPlans, 0,
    "as continuações não chamam o plano integral com avaliação global de revisão");
  assert.equal(perCallReviewPlans.reduce((total, count) => total + count, 0), fragments,
    "cada fragmento relê somente a projeção estrutural necessária ao digest");
  assert.equal(pageUnitIds(pages).join(","), "unit-1");
});

test("mudança de revisão no meio da página falha a continuação sem novas leituras de alvo", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  assert.ok(cursor, "a página grande precisa de continuação");
  adapter.revision = COURSE.revision + 1;
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1], continuacao: cursor }),
    error => error.status === 409);
  assert.equal(adapter.calls.reviews.length, 0, "revisão divergente não lê alvos");
});

test("a versão do conjunto de observações invalida o reuso sem alterar o recorte", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  // Mesma página, mesma revisão: o fragmento seguinte é transporte, não nova leitura.
  adapter.reset();
  const reused = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.equal(adapter.calls.reviews.length, 0, "o fragmento da mesma página não relê os alvos");
  // As observações têm versão própria e NÃO pertencem à revisão do curso: mudar só a
  // versão precisa invalidar o reuso e recompor o literal do zero.
  adapter.reset();
  adapter.annotationSetVersion += 1;
  const recomposed = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(adapter.calls.reviews.length > 0, "a versão do conjunto de observações invalida o reuso");
  assert.deepEqual(recomposed.context, reused.context,
    "sem mudança de conteúdo, o recorte recomposto é exatamente o mesmo recorte");
});

test("fragmento quente valida ACL e versão por getCourse sem acionar a lista de observações", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  adapter.reset();
  const reused = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(reused.context.fragmento, "o fragmento solicitado é entregue");
  assert.equal(adapter.calls.courses.length, 2,
    "a resolução normal e a nova confirmação de carimbo leem o Curso separadamente");
  assert.deepEqual({ ...adapter.calls.courses[1], deadlineAt: null }, {
    principal: PRINCIPAL, courseId: COURSE.id, includeOutline: false, deadlineAt: null
  }, "o carimbo ocorre pela leitura focal fresca após os digests");
  assert.ok(Number.isSafeInteger(adapter.calls.courses[1].deadlineAt), "o prazo da requisição é propagado");
  assert.equal(adapter.calls.annotations.length, 0,
    "o fragmento quente não invoca a lista que executa cleanup_course_anchored_annotations_v1");
  assert.equal(adapter.calls.reviews.length, 0, "a revisão já materializada é reutilizada");
  assert.equal(adapter.calls.inspections.length, 0, "a inspeção já materializada é reutilizada");
});

test("carimbo ausente, de curso divergente ou malformado vira cache miss", async () => {
  for (const malformed of [
    { courseId: "outro-curso", revision: COURSE.revision, annotationSetVersion: 1 },
    { courseId: COURSE.id, revision: COURSE.revision + 1, annotationSetVersion: 1 },
    { courseId: COURSE.id, revision: COURSE.revision, annotationSetVersion: -1 },
    { courseId: COURSE.id, revision: COURSE.revision, annotationSetVersion: 1.5 },
    { courseId: COURSE.id, revision: COURSE.revision }
  ]) {
    const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
    const first = await execute(adapter, { unidades: [1] });
    const cursor = first.context.continuacao;
    const original = adapter.getCourse;
    let reads = 0;
    adapter.getCourse = async input => {
      reads += 1;
      if (reads === 2) return malformed;
      return original(input);
    };
    adapter.reset();
    await execute(adapter, { unidades: [1], continuacao: cursor });
    assert.ok(adapter.calls.reviews.length > 0, "carimbo inválido recompõe a página");
    assert.ok(adapter.calls.annotations.length > 0, "só a recomposição lê observações");
  }
});

test("indisponibilidade tipada do carimbo interrompe sem iniciar o fanout", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  assert.ok(cursor, "a página precisa de continuação");
  const dependency = { rpc: "get_owned_course_for_actor_v1", reason: "attempt_abort",
    attemptsStarted: 3, attemptsAllowed: 3, elapsedMs: 24_000, remainingMs: 8_000 };
  const failure = withDependencyDiagnostic(new AuthoringApiError(
    503, "service_timeout", "A dependência não respondeu dentro do orçamento."
  ), dependency);
  const original = adapter.getCourse;
  let stampCalls = 0;
  adapter.getCourse = async (input) => {
    stampCalls += 1;
    if (stampCalls === 2) throw failure;
    return original(input);
  };
  adapter.reset();
  let thrown = null;
  try { await execute(adapter, { unidades: [1], continuacao: cursor }); }
  catch (error) { thrown = error; }
  assert.equal(thrown, failure, `o erro tipado deve propagar sem recomposição; carimbos lidos: ${stampCalls}`);
  assert.equal(thrown.status, 503);
  assert.equal(thrown.code, "service_timeout");
  assert.deepEqual(readDependencyDiagnostic(thrown), dependency,
    "o diagnóstico e o orçamento restante continuam disponíveis");
  assert.equal(stampCalls, 2, "há uma leitura de resolução e uma única confirmação de carimbo");
  assert.equal(adapter.calls.annotations.length, 0, "o carimbo não chama a lista que executa limpeza");
  assert.equal(adapter.calls.reviews.length, 0, "nenhum alvo é relido");
  assert.equal(adapter.calls.inspections.length, 0, "nenhuma inspeção é reexecutada");
  assert.equal(adapter.calls.sources.length, 0, "nenhuma fonte é relida");

  // A falha não descarta o recorte: restabelecida a dependência, a mesma
  // continuação retoma do cursor e reutiliza o material já materializado.
  const offset = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")).o;
  adapter.reset();
  const retried = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.equal(retried.context.fragmento.inicio, offset, "o cursor permanece no mesmo ponto");
  assert.equal(adapter.calls.reviews.length, 0, "a nova tentativa reutiliza o cache");
  assert.equal(adapter.calls.inspections.length, 0, "a nova tentativa não refaz a inspeção");
});

test("falha de autorização no carimbo não vira cache miss", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  const failure = new AuthoringApiError(403, "not_authorized", "O acesso não foi autorizado.");
  const original = adapter.getCourse;
  let stampCalls = 0;
  adapter.getCourse = async (input) => {
    stampCalls += 1;
    if (stampCalls === 2) throw failure;
    return original(input);
  };
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1], continuacao: cursor }), error => {
    assert.equal(error, failure);
    assert.equal(error.status, 403);
    assert.equal(error.code, "not_authorized");
    return true;
  });
  assert.equal(stampCalls, 2, "há uma leitura de resolução e uma única confirmação de carimbo");
  assert.equal(adapter.calls.annotations.length, 0, "o carimbo não chama a lista que executa limpeza");
  assert.equal(adapter.calls.reviews.length, 0, "nenhum alvo é relido");
  assert.equal(adapter.calls.inspections.length, 0, "nenhuma inspeção é reexecutada");
});

test("revisão divergente no carimbo ainda permite a recomposição legítima", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  const original = adapter.getCourse;
  let courseReads = 0;
  adapter.getCourse = async (input) => {
    courseReads += 1;
    if (courseReads === 2) return { courseId: input.courseId, revision: COURSE.revision + 1,
      annotationSetVersion: adapter.annotationSetVersion, title: TITLE };
    return original(input);
  };
  adapter.reset();
  const recomposed = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(recomposed.context.fragmento, "o fragmento continua sendo entregue");
  assert.ok(adapter.calls.reviews.length > 0, "a divergência legítima recompõe os alvos");
  assert.ok(adapter.calls.inspections.length > 0, "a recomposição revalida a inspeção");
  assert.ok(adapter.calls.annotations.length > 0, "a recomposição lê observações pelo caminho normal");
});

test("stale_course_state tipado no getCourse fresco vira miss e recompõe", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  const original = adapter.getCourse;
  let reads = 0;
  adapter.getCourse = async input => {
    reads += 1;
    if (reads === 2) throw new AuthoringApiError(409, "stale_course_state", "O Curso avançou.");
    return original(input);
  };
  adapter.reset();
  const recomposed = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(recomposed.context.fragmento, "a leitura reconstituída mantém o cursor");
  assert.ok(adapter.calls.reviews.length > 0, "a revisão é recomposta após o stamp stale");
  assert.ok(adapter.calls.inspections.length > 0, "a inspeção também é revalidada");
  assert.ok(adapter.calls.annotations.length > 0, "as observações voltam a ser lidas no caminho completo");
});

test("o recorte materializado não atravessa atores", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  const outro = { actorId: "2a000000-0000-4000-8000-000000000002",
    scopes: ["authoring:read", "authoring:write"] };
  adapter.reset();
  await assert.rejects(() => executeHumanCourseTask({ adapter, principal: outro,
    name: "preparar_revisao", rawArguments: { curso: TITLE, auditoria: true, unidades: [1], continuacao: cursor } }),
    error => error.status === 409);
});

// Observação do autor que entra na fila durante a leitura: ela muda o literal do recorte.
const annotationItem = () => ({ annotationId: "5a000000-0000-4000-8000-000000000001", state: "open",
  provenance: { origin: "author" }, targets: [{ kind: "study_unit", id: "unit-1", state: "pending" }],
  rawText: "Observação sintética da prova focal.", annotationVersion: 1, targetSetVersion: 1,
  createdAt: "2026-10-15T10:00:00.000Z" });

test("observação nova no meio da página recusa a continuação com 409", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const first = await execute(adapter, { unidades: [1] });
  const cursor = first.context.continuacao;
  adapter.annotationSetVersion += 1;
  adapter.annotationItems[adapter.annotationSetVersion] = [annotationItem()];
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1], continuacao: cursor }),
    error => error.status === 409 && error.code === "human_read_context_changed");
  assert.ok(adapter.calls.reviews.length > 0, "sem reuso, o recorte é recomposto antes de recusar");
});

test("descarte da entrada recompõe a página com o mesmo literal e sem leitura duplicada", async () => {
  const { adapter } = createAdapter({ unitCount: 8, unitSize: 80_000 });
  const pages = [];
  for (let index = 1; index <= 7; index += 1) {
    const page = await execute(adapter, { unidades: [index] });
    assert.ok(page.context.fragmento, `a página de unit-${index} precisa de fragmentos`);
    pages.push(page.context);
  }
  // Sete páginas fragmentadas excedem o teto de entradas do reuso: a primeira foi despejada.
  const cursor = pages[0].continuacao;
  const token = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  adapter.reset();
  const evicted = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(adapter.calls.reviews.length > 0, "entrada descartada recompõe o material por alvo");
  assert.equal(studyUnitReviews(adapter.calls), 1, "a página lê cada alvo uma vez, sem repetir I/O");
  assert.equal(adapter.calls.units.length, 1, "a página de unidades é lida uma vez por chamada");
  assert.equal(evicted.context.fragmento.inicio, token.o, "o fragmento continua exatamente de onde parou");
  assert.equal(evicted.context.fragmento.total, pages[0].fragmento.total, "o recorte recomposto tem o mesmo tamanho");
  const keptToken = JSON.parse(Buffer.from(pages[6].continuacao, "base64url").toString("utf8"));
  adapter.reset();
  const kept = await execute(adapter, { unidades: [7], continuacao: pages[6].continuacao });
  assert.equal(adapter.calls.reviews.length, 0, "a entrada mais recente continua aproveitada");
  assert.equal(kept.context.fragmento.inicio, keptToken.o,
    "a entrada aproveitada entrega o fragmento seguinte do mesmo literal");
});

test("o reuso não atravessa adapters distintos", async () => {
  const owner = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const other = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const warm = await execute(owner.adapter, { unidades: [1] });
  const cursor = warm.context.continuacao;
  other.adapter.reset();
  const recomposed = await execute(other.adapter, { unidades: [1], continuacao: cursor });
  assert.ok(other.adapter.calls.reviews.length > 0, "outro adapter materializa o próprio recorte");
  owner.adapter.reset();
  const reused = await execute(owner.adapter, { unidades: [1], continuacao: cursor });
  assert.equal(owner.adapter.calls.reviews.length, 0, "o adapter dono do material segue reutilizando");
  assert.deepEqual(recomposed.context, reused.context,
    "sem reuso, o literal recomposto é exatamente o mesmo recorte do fragmento seguinte");
});

test("reuso não é servido quando o acesso ao curso é revogado", async () => {
  const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000 });
  const warm = await execute(adapter, { unidades: [1] });
  const cursor = warm.context.continuacao;
  adapter.listCourses = async () => ({ items: [], hasMore: false, nextCursor: null });
  adapter.reset();
  await assert.rejects(() => execute(adapter, { unidades: [1], continuacao: cursor }),
    error => error.status === 404 || error.status === 422);
  assert.equal(adapter.calls.reviews.length, 0, "acesso revogado não lê alvos nem serve o material guardado");
  adapter.listCourses = async () => ({ items: [{ courseId: COURSE.id, title: TITLE }],
    hasMore: false, nextCursor: null });
  const recovered = await execute(adapter, { unidades: [1], continuacao: cursor });
  assert.ok(recovered.context.fragmento, "a leitura autorizada volta a entregar o recorte materializado");
});

test("projeção estrutural entrega o mesmo contexto nos quatro seletores sem plano integral", async () => {
  const cases = [
    { name: "curso", args: {} },
    { name: "parte", args: { parte: 1 } },
    { name: "microssequência", args: { microssequencia: MS_TITLE } },
    { name: "unidades", args: { unidades: [1] } }
  ];
  for (const current of cases) {
    const optimized = createAdapter({ reviewProjection: "lean" });
    const full = createAdapter();
    delete full.adapter.getCourseReviewPlan;
    const projected = await execute(optimized.adapter, current.args);
    const complete = await execute(full.adapter, current.args);
    assert.deepEqual(projected.context, complete.context, `${current.name}: contexto idêntico`);
    assert.equal(optimized.adapter.totals.instructionalPlans, 0,
      `${current.name}: não chama o plano com revisão global`);
    assert.equal(optimized.adapter.totals.reviewPlans, 1,
      `${current.name}: uma projeção estrutural por requisição`);
    assert.deepEqual(optimized.adapter.calls.reviewPlans[0].explanationIds, [MS],
      `${current.name}: somente IDs do foco são solicitados ao plano`);
    assert.equal(full.adapter.totals.instructionalPlans, 1,
      `${current.name}: o controle negativo exercita o caminho integral`);
  }
});

test("projeção lean e plano integral entregam o mesmo contexto final nos seletores ricos", async () => {
  const cases = [
    { name: "curso", args: {} },
    { name: "parte", args: { parte: 1 } },
    { name: "microssequência", args: { microssequencia: MS_TITLE } },
    { name: "unidades", args: { unidades: [2, 1, 3] } }
  ];
  for (const current of cases) {
    const full = createAdapter({ unitCount: 3, unitSize: 1_500, reviewProjection: "full" });
    const lean = createAdapter({ unitCount: 3, unitSize: 1_500, reviewProjection: "lean" });
    const complete = await execute(full.adapter, current.args);
    const projected = await execute(lean.adapter, current.args);
    assert.deepEqual(projected.context, complete.context,
      `${current.name}: o contexto final independe dos campos descartados`);
    assert.equal(full.adapter.totals.instructionalPlans, 0, `${current.name}: nenhum plano v5`);
    assert.equal(lean.adapter.totals.instructionalPlans, 0, `${current.name}: nenhum plano v5`);
  }
});

function arrangePartOrderDifferentFromCurriculum(adapter) {
  const moduleValue = adapter.plan.plan.curriculum.modules[0];
  const lesson = moduleValue.lessons[0];
  const lessonTwo = { ...structuredClone(lesson), id: "lesson-2", title: "Lição 2", position: 1 };
  const first = { ...microsequence(), id: "ms-first", title: "Primeira da parte", position: 0 };
  const second = { ...microsequence(), id: "ms-second", title: "Segunda da parte", position: 1 };
  const selected = { ...microsequence(), position: 0 };
  lesson.microsequences = [first, second];
  moduleValue.lessons = [lesson, { ...lessonTwo, microsequences: [selected] }];
  adapter.plan.plan.parts[0].microsequences = [
    { ...structuredClone(adapter.plan.plan.parts[0].microsequences[0]), id: first.id,
      title: first.title, productionPosition: 0,
      curriculumPath: { moduleId: moduleValue.id, moduleTitle: moduleValue.title,
        lessonId: lesson.id, lessonTitle: lesson.title } },
    { ...structuredClone(adapter.plan.plan.parts[0].microsequences[0]), id: second.id,
      title: second.title, productionPosition: 1,
      curriculumPath: { moduleId: moduleValue.id, moduleTitle: moduleValue.title,
        lessonId: lesson.id, lessonTitle: lesson.title } },
    { ...structuredClone(adapter.plan.plan.parts[0].microsequences[0]), id: selected.id,
      title: selected.title, productionPosition: 2,
      curriculumPath: { moduleId: moduleValue.id, moduleTitle: moduleValue.title,
        lessonId: lessonTwo.id, lessonTitle: lessonTwo.title } }
  ];
}

test("seleção por parte preserva productionPosition quando diverge da posição curricular", async () => {
  const full = createAdapter({ unitCount: 3, unitSize: 1_500, reviewProjection: "full" });
  const lean = createAdapter({ unitCount: 3, unitSize: 1_500, reviewProjection: "lean" });
  arrangePartOrderDifferentFromCurriculum(full.adapter);
  arrangePartOrderDifferentFromCurriculum(lean.adapter);
  const args = { parte: 1, microssequencia: 3 };
  const complete = await readAll(full.adapter, args);
  const projected = await readAll(lean.adapter, args);
  assert.deepEqual(projected.pages, complete.pages,
    "a projeção mantém o mesmo literal mesmo quando a terceira da parte é a primeira da segunda lição");
  assert.equal(lean.adapter.calls.units[0].scopeKind, "didactic_microsequence");
  assert.equal(lean.adapter.calls.units[0].scopeId, MS,
    "a página continua vinculada à microssequência escolhida pela ordem da parte");
  assert.deepEqual(projected.pages[0].plan.parteEmFoco.microssequencias,
    [{ posicao: 3, titulo: MS_TITLE }], "a ordem de produção da parte é preservada no contexto final");
  assert.equal(projected.pages[0].plan.mapaCurricular.modulos[0].licoes[0].titulo, "Lição 2",
    "o caminho curricular original da microssequência permanece preservado");
});

test("drift do conjunto de partes durante resolução é recusado sem bump de revisão", async () => {
  const { adapter } = createAdapter({ unitCount: 3, unitSize: 1_500, reviewProjection: "lean" });
  const readPlan = adapter.getCourseReviewPlan.bind(adapter);
  adapter.getCourseReviewPlan = async input => {
    adapter.plan.plan.parts.push({ id: "part-added-during-read", position: 1,
      title: "Parte surgida durante a leitura", intent: "", progression: [], version: 1,
      microsequences: [] });
    return await readPlan(input);
  };
  await assert.rejects(() => execute(adapter, { parte: 1 }),
    error => error.status === 409 && error.code === "course_revision_conflict");
  assert.equal(adapter.calls.outlines.length, 1, "o primeiro conjunto foi resolvido pelo outline");
  assert.equal(adapter.calls.reviews.length, 0, "o drift é detectado antes da leitura de pareceres por alvo");
  assert.equal(adapter.calls.inspections.length, 0, "o drift é detectado antes de reler inspeções");
});

test("corpo, plano ou dependência da Explicação muda sem revision e invalida o reuso", async () => {
  const mutations = [
    {
      name: "corpo",
      dependency: false,
      invalidates: true,
      mutate: (plan) => {
        plan.plan.curriculum.modules[0].lessons[0].microsequences[0].explanation.content[0].data.text =
          "Corpo focal materialmente alterado sem nova revisão do curso.";
      }
    },
    {
      name: "corpo fora do foco",
      invalidates: true,
      cacheMissOnly: true,
      mutate: (plan) => {
        plan.plan.curriculum.modules[0].lessons[0].microsequences[1].explanation.content[0].data.text =
          "Corpo não projetado alterado sem bump da revisão.";
      }
    },
    {
      name: "dependência",
      dependency: true,
      invalidates: true,
      mutate: (plan) => {
        plan.plan.curriculum.modules[0].lessons[0].microsequences[0].dependencyMicrosequenceIds = ["ms-base"];
        plan.plan.parts[0].microsequences[0].dependencyMicrosequenceIds = ["ms-base"];
      }
    },
    {
      name: "plano de explicação",
      invalidates: true,
      mutate: (plan) => {
        plan.plan.curriculum.modules[0].lessons[0].microsequences[0].explanationPlan.purpose =
          "Propósito apresentado materialmente alterado.";
      }
    },
    {
      name: "campo descartado",
      invalidates: true,
      cacheMissOnly: true,
      mutate: (plan) => {
        plan.plan.instructionalAnalysisUnits.push({ id: "analysis-new", statement: "Não apresentado." });
        plan.plan.parts[0].progress = { state: "materialized" };
      }
    }
  ];
  for (const current of mutations) {
    const { adapter } = createAdapter({ unitCount: 1, unitSize: 80_000, reviewProjection: "lean" });
    const base = microsequence();
    base.id = "ms-base";
    base.title = "Base necessária";
    base.position = 1;
    adapter.plan.plan.curriculum.modules[0].lessons[0].microsequences.push(base);
    const first = await execute(adapter, { unidades: [1] });
    const cursor = first.context.continuacao;
    adapter.reset();
    const reused = await execute(adapter, { unidades: [1], continuacao: cursor });
    assert.equal(adapter.calls.reviews.length, 0, "sem mudança, o material da página é reutilizado");
    assert.equal(reused.context.fragmento.inicio, first.context.fragmento.fim);

    const planRequest = { courseId: COURSE.id, expectedRevision: adapter.revision, explanationIds: [MS] };
    const projectedBefore = await adapter.getCourseReviewPlan(planRequest);
    current.mutate(adapter.plan);
    assert.equal(adapter.revision, COURSE.revision, "o discriminante não incrementa a revisão do curso");
    adapter.reset();
    const projectedAfter = await adapter.getCourseReviewPlan(planRequest);
    assert.notEqual(projectedAfter.sourceFingerprint, projectedBefore.sourceFingerprint,
      "o carimbo interno detecta mudança de qualquer fonte, inclusive fora da projeção");
    if (current.name === "corpo fora do foco") {
      const outside = projectedAfter.plan.curriculum.modules[0].lessons[0].microsequences[1];
      assert.equal(outside.explanation, null, "o corpo alterado fora do foco segue omitido no transporte projetado");
    }
    if (current.cacheMissOnly) {
      adapter.reset();
      const recomposed = await execute(adapter, { unidades: [1], continuacao: cursor });
      assert.ok(adapter.calls.reviews.length > 0, "fingerprint novo invalida reuso e recompõe mesmo sem mudar o literal apresentado");
      assert.ok(recomposed.context.fragmento, "a continuação continua válida quando o conteúdo visível não mudou");
      continue;
    }
    await assert.rejects(() => execute(adapter, { unidades: [1], continuacao: cursor }),
      error => error.status === 409 && error.code === "human_read_context_changed");
    assert.ok(adapter.calls.reviews.length > 0, "o digest invalidado força recompor o recorte");
    assert.equal(adapter.totals.instructionalPlans, 0,
      "a invalidação usa a projeção estrutural, não a avaliação global");
    if (current.dependency) {
      const after = await readAll(adapter, { unidades: [1] });
      assert.match(JSON.stringify(after.pages[0].plan), /Base necessária/u,
        "a dependência alterada sem revisão aparece no plano focal recomposto");
    }
  }
});
