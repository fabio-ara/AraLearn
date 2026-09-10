import test from "node:test";
import assert from "node:assert/strict";

import { createCourseStudyApplication } from
  "../../src/study/CourseStudyApplication.js";
import { IDBFactory } from "fake-indexeddb";
import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseStudyBridge } from "../../src/study/CourseStudyBridge.js";
import { CourseStudyRepository } from "../../src/study/CourseStudyRepository.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";

function project() {
  const makeStudyUnit = (id, position) => ({
    id,
    position,
    title: `Unidade ${position}`,
    role: "theory",
    content: [{
      id: `paragraph-${position}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: `Conteúdo ${position}.` }
    }],
    response: null,
    feedback: [],
    topics: []
  });
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: COURSE_ID,
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: { goal: "Guiar.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: { goal: "Ensinar.", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência",
            goal: "Explicar.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [makeStudyUnit("unit-a", 1), makeStudyUnit("unit-b", 2)]
          }]
        }]
      }]
    }]
  };
}

class FakeActionNode {
  constructor() {
    this.listeners = new Map();
    this.dataset = {};
    this.value = "";
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      listener({
        currentTarget: this,
        target: this,
        detail: 1,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
      });
    }
  }

  focus() {}
}

class FakeStudyRoot {
  #html = "";
  #nodes = new Map();

  set innerHTML(value) {
    this.#html = String(value || "");
    this.#nodes.clear();
  }

  get innerHTML() {
    return this.#html;
  }

  querySelector(selector) {
    const match = /^\[data-action='([^']+)'\]$/u.exec(selector);
    if (!match || !this.#html.includes(`data-action="${match[1]}"`)) return null;
    if (!this.#nodes.has(selector)) this.#nodes.set(selector, new FakeActionNode());
    return this.#nodes.get(selector);
  }

  querySelectorAll(selector) {
    if (["[data-action='open-response-input']", "[data-action='toggle-citations']", "[data-action='download-citation-attachment']"].includes(selector)) {
      const node = this.querySelector(selector);
      if (node && selector === "[data-action='download-citation-attachment']") {
        node.dataset = { citationIndex: "0", attachmentIndex: "0" };
      }
      return node ? [node] : [];
    }
    return [];
  }

  setAttribute() {}

  removeAttribute() {}

  dispatchEvent() { return true; }

  click(action) {
    const node = this.querySelector(`[data-action='${action}']`);
    if (!node) throw new Error(`Ação ausente no teste: ${action}`);
    node.dispatch("click");
  }
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function applicationRepository(document, flush) {
  let pending = false;
  return {
    loadProgress() { return { version: 1, lessons: {} }; },
    loadStudyNavigation() { return null; },
    loadCourseSummaries() {
      return [{
        courseId: COURSE_ID,
        title: "Curso",
        revision: 1,
        ownership: "shared",
        canEdit: false,
        moduleCount: 1,
        lessonCount: 1,
        microsequenceCount: 1,
        studyUnitCount: 2,
        completedStudyUnitCount: 0
      }];
    },
    loadRuntimeStatus() { return { pending }; },
    loadReviewItems() { return []; },
    hasMoreReviewItems() { return false; },
    loadAnnotationsForPath() { return []; },
    isStudyUnitMarkedForReview() { return false; },
    loadProject() { return structuredClone(document); },
    async loadCourse() { return structuredClone(document); },
    async setStudyUnitCompleted() {
      pending = true;
      return { pending: true };
    },
    flush() {
      return flush(() => { pending = false; });
    },
    async clearStudyNavigationPosition() { return true; }
  };
}

async function openFirstStudyUnit(app) {
  await app.openEntityPath([
    COURSE_ID,
    "module-a",
    "lesson-a",
    "micro-a",
    "unit-a"
  ]);
}

test("visitante abre projeção revisada pelo Controller e Estudo reais sem expor bases ou unidades ocultas", async (t) => {
  const complete = project();
  const first = complete.courses[0].modules[0].lessons[0].microsequences[0];
  first.explanation = { title: "Base disponível", content: [structuredClone(first.studyUnits[0].content[0])] };
  const restricted = structuredClone(first);
  restricted.id = "micro-restricted";
  restricted.title = "Título protegido da base";
  restricted.goal = "Objetivo protegido da base";
  restricted.explanation.content[0].data.text = "Texto protegido da base";
  restricted.studyUnits.forEach((unit, index) => {
    unit.id = `restricted-parent-unit-${index}`;
    unit.content[0].data.text = index === 0 ? "Unidade revisada com base pendente." : "Unidade protegida.";
  });
  complete.courses[0].modules[0].lessons[0].microsequences.push(restricted);
  const { rows } = flattenCourseDocument(complete);
  // Stub da projeção SQL: revisão de base e unidade é independente.
  const visibleRows = rows.filter(row => row.entityType !== "study_unit" ||
    ["unit-a", "restricted-parent-unit-0"].includes(row.entityId)).map(row => ({
    ...row,
    ...(row.entityType === "microsequence" || row.entityType === "study_unit" ? {
      contentReview: row.entityId === restricted.id ? { state: "draft" }
        : { state: "current", reviewedAt: "2026-09-10T21:30:00Z" }
    } : {}),
    ...(row.entityId === restricted.id ? { content: { title: "Aguardando revisão da autoria" } } : {})
  }));
  const descriptor = {
    courseId: COURSE_ID, title: "Curso", goal: "Aprender.", revision: 20,
    ownership: "public", visibility: "public", publicFileAccess: "restricted",
    canEdit: false, canObserve: false, canCopy: false,
    moduleCount: 1, lessonCount: 1, topicCount: 0, microsequenceCount: 2,
    studyUnitCount: 4, completedStudyUnitCount: 0, updatedAt: "2026-09-10T21:30:00Z"
  };
  const pageCalls = [];
  const api = {
    async listCourses() { return { contract: "aralearn.course-list.v2", items: [descriptor], hasMore: false, nextCursor: null }; },
    async getCourse() { return { ...descriptor, contract: "aralearn.course.v1" }; },
    async getCourseEntities(courseId, { revision, cursor }) {
      assert.equal(courseId, COURSE_ID); assert.equal(revision, 20);
      pageCalls.push(cursor);
      return { contract: "aralearn.course-entities.v1", courseId, revision,
        items: cursor ? visibleRows.slice(3) : visibleRows.slice(0, 3),
        pendingReviewMicrosequenceIds: [restricted.id], hasMore: !cursor,
        nextCursor: cursor ? null : { entityType: visibleRows[2].entityType, entityId: visibleRows[2].entityId } };
    }
  };
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: COURSE_ID });
  const controller = new CourseController({ api, store });
  const repository = new CourseStudyRepository({ bridge: new CourseStudyBridge({ controller }), api,
    cache: store, visitor: true, windowValue: { navigator: { onLine: true } } });
  await repository.initialize();
  const root = new FakeStudyRoot();
  const errors = [];
  root.dispatchEvent = event => { if (event.type === "aralearn:course-load-error") errors.push(event.detail.error); return true; };
  const app = createCourseStudyApplication({ root, repository, initialProject: repository.loadProject(), visitor: true });
  t.after(async () => { app.destroy(); await repository.close(); store.close(); });
  assert.equal(await app.openCourse(COURSE_ID), true, JSON.stringify(errors.map(error => ({ code: error.code, details: error.details }))));
  assert.deepEqual(errors, []);
  assert.equal(pageCalls.length, 2, "A projeção só é composta depois da última página");
  assert.match(root.innerHTML, /Abrir módulo/u);
  const projected = repository.loadProject();
  const [active, pending] = projected.courses[0].modules[0].lessons[0].microsequences;
  assert.deepEqual(active.explanation, first.explanation);
  assert.deepEqual(active.studyUnits, [first.studyUnits[0]]);
  assert.deepEqual(pending, { id: restricted.id, title: "Aguardando revisão da autoria", studyUnits: [restricted.studyUnits[0]] });
  assert.doesNotMatch(JSON.stringify(projected), /Título protegido|Objetivo protegido|Texto protegido|Unidade protegida|"unit-b"/u);
  await openFirstStudyUnit(app);
  assert.match(root.innerHTML, /Conteúdo 1\./u);
  assert.equal(await app.openEntityPath([COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-b"]), false);
  assert.equal(await app.openEntityPath([COURSE_ID, "module-a", "lesson-a", restricted.id, "restricted-parent-unit-0"]), true);
  assert.match(root.innerHTML, /Unidade revisada com base pendente\./u);
  const context = repository.loadExplanationContext([COURSE_ID, "module-a", "lesson-a", restricted.id, "restricted-parent-unit-0"]);
  assert.equal(context.state, "draft"); assert.equal(context.explanation, null);
  assert.equal(controller.ownerOnly, false);
});

test("visitante mantém a leitura e pede conta ao abrir observações, sem abrir edição", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  repository.loadRuntimeStatus = () => ({ localOnly: true });
  const root = new FakeStudyRoot();
  const events = [];
  root.dispatchEvent = (event) => { events.push({ type: event.type, detail: event.detail }); return true; };
  const app = createCourseStudyApplication({ root, repository, initialProject: document, visitor: true,
    onSaveManualEdit: () => { throw new Error("Visitante não pode gravar conteúdo"); } });
  await openFirstStudyUnit(app);
  const position = app.getNavigationPosition();
  assert.deepEqual(position.entityPath, [COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-a"]);
  position.entityPath[0] = "changed-outside";
  assert.equal(app.getNavigationPosition().entityPath[0], COURSE_ID);
  assert.equal(app.getCourseDesignContext(), null);
  assert.match(root.innerHTML, /data-action="next-study-unit"/u);
  assert.match(root.innerHTML, /data-action="toggle-review"/u);
  assert.doesNotMatch(root.innerHTML, /data-action="study-manual-edit"/u);
  assert.match(root.innerHTML, /Entre para enviar observações/u);
  root.click("open-observation");
  await nextTurn();
  assert.deepEqual(events, [{ type: "aralearn:request-auth", detail: {
    entityPath: [COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-a"]
  } }]);
  assert.doesNotMatch(root.innerHTML, /class="study-observation-overlay"/u);
  assert.throws(() => app.previewManualEdit({ targetId: "study_unit", pathValues: {} }), /não está disponível/u);
  app.destroy();
});

test("estudante autenticado não ganha edição por capacidade antiga de derivar cópia", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1, ownership: "shared", canEdit: true, canDerive: true }];
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document,
    onSaveManualEdit: () => { throw new Error("Estudante não pode gravar conteúdo"); } });
  await openFirstStudyUnit(app);
  assert.doesNotMatch(root.innerHTML, /data-action="study-manual-edit"/u);
  assert.match(root.innerHTML, /data-action="open-observation"/u);
  assert.equal(app.getCourseDesignContext(), null);
  assert.throws(() => app.previewManualEdit({ targetId: "study_unit", pathValues: {} }), /não está disponível/u);
  app.destroy();
});

test("entrada de edição da Autoria abre o editor autorizado no alvo exato", async () => {
  const path = [COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-a"];
  for (const length of [1, 4, 5]) for (const owned of [true, false]) {
    const document = project();
    const repository = applicationRepository(document, async () => {});
    repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1,
      ownership: owned ? "owned" : "shared", canEdit: owned }];
    repository.loadStudyUnitCompositionContext = () => ({ studyUnitVersion: 1, courseRevision: 1, didacticMicrosequenceId: "micro-a" });
    const root = new FakeStudyRoot();
    const app = createCourseStudyApplication({ root, repository, initialProject: document,
      onSaveManualEdit: async () => { throw new Error("Esta entrada não deve gravar."); },
      onSaveAssistedStructure: async () => { throw new Error("Esta entrada não deve gravar."); } });
    assert.equal(await app.openEntityPath(path.slice(0, length), { editing: true }), owned);
    assert.equal(app.hasPendingManualEdit(), owned);
    if (owned) assert.match(root.innerHTML, new RegExp(`data-action="${length === 5 ? "study-manual-edit" : "study-level-edit"}"[^>]*aria-pressed="true"`, "u"));
    app.destroy();
  }
});

test("editor contextual mantém Autoria nos cinco níveis e retorna sem gravar percurso de Estudo", async () => {
  const path = [COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-a"];
  const returnRoute = `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=unit-a`;
  for (const length of [1, 2, 3, 4, 5]) for (const exit of ["back", "save", "cancel"]) {
    const document = project();
    const repository = applicationRepository(document, async () => {});
    repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1, ownership: "owned", canEdit: true }];
    repository.loadStudyUnitCompositionContext = () => ({ studyUnitVersion: 1, courseRevision: 1, didacticMicrosequenceId: "micro-a" });
    const navigationWrites = [], returns = [];
    repository.saveStudyNavigation = async (...args) => { navigationWrites.push(args); };
    const root = new FakeStudyRoot();
    const app = createCourseStudyApplication({ root, repository, initialProject: document,
      onAuthoringContextReturn: result => returns.push(result),
      onSaveManualEdit: async () => { throw new Error("Edição intacta não escreve."); },
      onSaveAssistedStructure: async () => { throw new Error("Edição intacta não escreve."); } });
    await openFirstStudyUnit(app);
    const previous = app.getNavigationPosition();
    const writeCount = navigationWrites.length;
    assert.equal(await app.openEntityPath(path.slice(0, length), { editing: true, authoringContext: { returnRoute } }), true);
    assert.match(root.innerHTML, /course-authoring-context-shell/u);
    assert.match(root.innerHTML, /<h1[^>]*>Conteúdo<\/h1>/u);
    assert.match(root.innerHTML, /data-action="authoring-context-back"/u);
    assert.doesNotMatch(root.innerHTML, /data-action="(?:go-home|study-level-view|study-manual-view|next-study-unit|reset-course-progress)"/u);
    if (exit === "back") assert.equal(app.handleBack(), true);
    else root.click(length === 5 ? `study-manual-${exit}` : `${exit}-study-structure`);
    await nextTurn();
    assert.equal(app.hasPendingManualEdit(), false);
    assert.equal(returns.length, 1);
    assert.deepEqual(returns[0], { courseId: COURSE_ID, returnRoute,
      reason: exit === "save" ? "saved" : "cancelled", discardedUnknown: false });
    assert.deepEqual(app.getNavigationPosition(), previous);
    assert.equal(navigationWrites.length, writeCount);
    app.destroy();
  }
});

test("editor contextual recusa contexto estranho, compartilhado e alvo sem escritor mantendo navegação", async () => {
  const document = project(), root = new FakeStudyRoot();
  const repository = applicationRepository(document, async () => {});
  let ownership = "shared";
  repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1, ownership, canEdit: true }];
  const app = createCourseStudyApplication({ root, repository, initialProject: document,
    onAuthoringContextReturn: () => { throw new Error("Entrada recusada não retorna um editor aberto."); } });
  await openFirstStudyUnit(app);
  const previous = app.getNavigationPosition();
  const localContext = { returnRoute: `#/authoring/courses/${COURSE_ID}?section=content` };
  assert.equal(await app.openEntityPath([COURSE_ID], { editing: true, authoringContext: localContext }), false);
  ownership = "owned";
  assert.equal(await app.openEntityPath([COURSE_ID], { editing: true,
    authoringContext: { returnRoute: "#/authoring/courses/20000000-0000-4000-8000-000000000001?section=content" } }), false);
  assert.equal(await app.openEntityPath([COURSE_ID], { authoringContext: localContext }), false);
  assert.equal(await app.openEntityPath([COURSE_ID], { editing: true, authoringContext: localContext }), false);
  assert.deepEqual(app.getNavigationPosition(), previous);
  assert.doesNotMatch(root.innerHTML, /course-authoring-context-shell/u);
  app.destroy();
});

test("contexto dos parâmetros acompanha tela e unidade atuais sem depender do hash", async (context) => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  let owned = true;
  repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1,
    ownership: owned ? "owned" : "shared", canEdit: true }];
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  const oldHash = `#/estudo/${COURSE_ID}/module-a/lesson-a/micro-a/unit-a`;
  Object.defineProperty(globalThis, "location", { configurable: true, value: { hash: oldHash } });
  context.after(() => {
    if (locationDescriptor) Object.defineProperty(globalThis, "location", locationDescriptor);
    else delete globalThis.location;
  });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document });
  context.after(() => app.destroy());
  assert.equal(app.getCourseDesignContext(), null);
  const path = [COURSE_ID, "module-a", "lesson-a", "micro-a", "unit-a"];
  for (const [length, kind, label] of [
    [1, "course", "curso"], [2, "module", "módulo"], [3, "lesson", "lição"],
    [4, "didactic_microsequence", "microssequência"], [5, "study_unit", "unidade de estudo"]
  ]) {
    assert.equal(await app.openEntityPath(path.slice(0, length)), true);
    assert.deepEqual(app.getCourseDesignContext(), { courseId: COURSE_ID,
      scope: { kind, ref: path[length - 1] }, label });
  }
  root.click("next-study-unit");
  await nextTurn();
  assert.equal(app.getCourseDesignContext().scope.ref, "unit-b");
  assert.equal(globalThis.location.hash, oldHash);
  const returned = app.getCourseDesignContext();
  returned.scope.ref = "changed-outside";
  assert.equal(app.getCourseDesignContext().scope.ref, "unit-b");
  owned = false;
  assert.equal(app.getCourseDesignContext(), null);
});

test("curso vazio oferece parâmetros ao proprietário sem posição completa de leitura", async () => {
  const document = project();
  document.courses[0].modules = [];
  const repository = applicationRepository(document, async () => {});
  repository.loadCourseSummaries = () => [{ courseId: COURSE_ID, revision: 1, ownership: "owned", canEdit: true }];
  const app = createCourseStudyApplication({ root: new FakeStudyRoot(), repository, initialProject: document });
  await app.openCourse(COURSE_ID);
  assert.equal(app.getNavigationPosition(), null);
  assert.deepEqual(app.getCourseDesignContext(), { courseId: COURSE_ID,
    scope: { kind: "course", ref: COURSE_ID }, label: "curso" });
  app.destroy();
});

test("visitante consulta fontes por objeto sem resolver PDF ao abrir o conteúdo", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const reads = []; const downloads = [];
  repository.loadStudyUnitCitations = async reference => {
    reads.push(reference);
    return { contract: "aralearn.course-study-citations.v2", courseRevision: 4,
      bibliographyStyle: "apa7", citations: [] };
  };
  repository.getStudyCitationAttachmentDownload = async reference => downloads.push(reference);
  const root = new FakeStudyRoot();
  const query = root.querySelector.bind(root);
  root.querySelector = selector => selector === ".study-reader-screen" && root.innerHTML.includes("study-reader-screen")
    ? Object.assign(new FakeActionNode(), { querySelectorAll: () => [] }) : query(selector);
  const app = createCourseStudyApplication({ root, repository, initialProject: document, visitor: true });
  await openFirstStudyUnit(app); await nextTurn();
  assert.equal(reads.length, 1);
  assert.equal(reads[0].studyUnitId, "unit-a");
  assert.equal(downloads.length, 0);
  assert.match(root.innerHTML, /data-action="open-explanation"/u);
  assert.doesNotMatch(root.innerHTML, /data-action="toggle-citations"/u);
  app.destroy();
});

test("rascunho anterior sem destino comprovado fica visível até descarte explícito", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const draft = { recoveryId: "draft-1", sourceCourseId: COURSE_ID, requestId: "original-request", targetId: "study_unit",
    studyUnit: structuredClone(document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[0]) };
  draft.studyUnit.title = "Rascunho preservado <com texto>";
  let clears = 0;
  repository.loadStudyDraftRecovery = async () => clears ? null : structuredClone(draft);
  repository.recoverStudyDraft = async () => ({ status: "unresolved", targetCourseId: null });
  repository.clearStudyDraftRecovery = async (source, request, recoveryId) => {
    assert.equal(source, COURSE_ID); assert.equal(request, draft.requestId);
    assert.equal(recoveryId, draft.recoveryId); clears += 1; return true;
  };
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document });
  await app.resumePendingManualEdit();
  assert.equal(clears, 0);
  assert.match(root.innerHTML, /Rascunho preservado &lt;com texto&gt;/u);
  assert.doesNotMatch(root.innerHTML, /data-action="study-manual-save"/u);
  root.click("discard-study-draft-recovery");
  await nextTurn();
  assert.equal(clears, 1);
  assert.doesNotMatch(root.innerHTML, /class="study-draft-recovery /u);
  app.destroy();
});

test("recuperação exporta snapshot integral e cada descarte revela a próxima intenção do mesmo curso", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const originals = [
    { sourceCourseId: COURSE_ID, requestId: "same-request", extra: { useful: "Metadados íntegros" } },
    { unknown: ["Outro rascunho", { data: "Preservar tudo" }] }
  ];
  const entries = originals.map((originalSnapshot, index) => ({ recoveryId: `draft-${index + 1}`,
    sourceCourseId: index === 0 ? COURSE_ID : null, requestId: index === 0 ? "same-request" : null,
    studyUnit: null, command: null, originalSnapshot }));
  const recoveryCalls = [];
  const downloads = [];
  repository.loadStudyDraftRecovery = async () => structuredClone(entries[0] ?? null);
  repository.recoverStudyDraft = async (sourceCourseId, recoveryId) => {
    recoveryCalls.push({ sourceCourseId, recoveryId }); return { status: "unresolved" };
  };
  repository.clearStudyDraftRecovery = async (source, request, recoveryId) => {
    assert.equal(source, entries[0].sourceCourseId);
    assert.equal(request, entries[0].requestId);
    assert.equal(recoveryId, entries[0].recoveryId);
    entries.shift(); return true;
  };
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document,
    downloadRecovery: (file) => downloads.push(file) });
  await app.resumePendingManualEdit();
  root.click("export-study-draft-recovery");
  await nextTurn();
  assert.deepEqual(JSON.parse(downloads[0].content), originals[0]);
  assert.equal(entries.length, 2);
  root.click("discard-study-draft-recovery");
  await nextTurn();
  assert.match(root.innerHTML, /Outro rascunho/u);
  root.click("export-study-draft-recovery");
  await nextTurn();
  assert.deepEqual(JSON.parse(downloads[1].content), originals[1]);
  assert.deepEqual(recoveryCalls, [{ sourceCourseId: COURSE_ID, recoveryId: "draft-1" },
    { sourceCourseId: null, recoveryId: "draft-2" }]);
  root.click("discard-study-draft-recovery");
  await nextTurn();
  assert.doesNotMatch(root.innerHTML, /class="study-draft-recovery /u);
  assert.equal(entries.length, 0);
  app.destroy();
});

test("falha de exportação não descarta a entrada e conserva saída local acionável", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const originalSnapshot = { unknown: "Trabalho preservado" };
  repository.loadStudyDraftRecovery = async () => ({ recoveryId: "draft-1", sourceCourseId: null,
    requestId: null, studyUnit: null, originalSnapshot });
  let clears = 0;
  repository.clearStudyDraftRecovery = async () => { clears += 1; return true; };
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document,
    downloadRecovery: () => { throw new Error("file picker unavailable"); } });
  await app.resumePendingManualEdit();
  root.click("export-study-draft-recovery");
  await nextTurn();
  assert.match(root.innerHTML, /continua guardado; tente novamente/u);
  assert.match(root.innerHTML, /Trabalho preservado/u);
  assert.equal(clears, 0);
  app.destroy();
});

test("reconexão confirmada mostra pendência em Manual sem trocar leitura ou enviar trabalho", async () => {
  const document = project();
  let flushes = 0;
  const repository = applicationRepository(document, async () => { flushes += 1; });
  const status = { synchronizationMode: "manual", offline: true, stale: true,
    readOnly: true, pending: true };
  repository.loadRuntimeStatus = () => ({ ...status });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document });
  await openFirstStudyUnit(app);
  const position = app.getNavigationPosition();
  const priorFlushes = flushes;
  app.setOfflineStatus(true);
  assert.match(root.innerHTML, /aria-label="Sem conexão"/u);

  // The browser's online event alone does not prove the service can be reached.
  app.setOfflineStatus(false);
  assert.match(root.innerHTML, /aria-label="Sem conexão"/u);
  status.offline = false;
  app.refreshRuntimeStatus();

  assert.match(root.innerHTML, /aria-label="Sincronização pendente"/u);
  assert.doesNotMatch(root.innerHTML, /aria-label="Sem conexão"|aria-label="Sincronizado"/u);
  assert.match(root.innerHTML, /Conteúdo 1/u);
  assert.deepEqual(app.getNavigationPosition(), position);
  assert.equal(flushes, priorFlushes);
  app.destroy();
});

test("flush em background atualiza pendente para sincronizado sem nova interação", async () => {
  const document = project();
  let releaseFlush;
  let signalFlushStarted;
  const flushStarted = new Promise((resolve) => { signalFlushStarted = resolve; });
  const flushGate = new Promise((resolve) => { releaseFlush = resolve; });
  const repository = applicationRepository(document, async (markSynced) => {
    signalFlushStarted();
    await flushGate;
    markSynced();
  });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: document
  });

  await openFirstStudyUnit(app);
  root.click("next-study-unit");
  await flushStarted;
  assert.match(root.innerHTML, /aria-label="Sincronização pendente"/u);

  releaseFlush();
  await nextTurn();
  assert.match(root.innerHTML, /aria-label="Sincronizado"/u);
  assert.doesNotMatch(root.innerHTML, /aria-label="Sincronização pendente"/u);
  app.destroy();
});

test("falha do flush em background mantém a sincronização pendente", async () => {
  const document = project();
  let rejectFlush;
  let signalFlushStarted;
  const flushStarted = new Promise((resolve) => { signalFlushStarted = resolve; });
  const flushGate = new Promise((_, reject) => { rejectFlush = reject; });
  const repository = applicationRepository(document, async () => {
    signalFlushStarted();
    await flushGate;
  });
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({
    root,
    repository,
    initialProject: document
  });

  await openFirstStudyUnit(app);
  root.click("next-study-unit");
  await flushStarted;
  rejectFlush(new TypeError("Failed to fetch"));
  await nextTurn();

  assert.match(root.innerHTML, /aria-label="Sincronização pendente"/u);
  assert.doesNotMatch(root.innerHTML, /aria-label="Sincronizado"/u);
  app.destroy();
});

test("resposta aberta exige texto, preserva produção livre e não simula correção", async () => {
  const document = project();
  const units = document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits;
  units[0] = {
    id: "unit-a",
    position: 1,
    title: "Explique a decisão do switch",
    role: "practice",
    content: [{
      id: "contexto",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "A tabela MAC está vazia quando um quadro chega à porta 1." }
    }],
    response: {
      id: "resposta",
      package: "aralearn.response.open",
      version: "1.0.0",
      data: { prompt: "Explique o que o switch aprende e como decide o encaminhamento." }
    },
    feedback: [{
      id: "retorno",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "A origem serve à aprendizagem; o destino serve à decisão de saída." }
    }],
    topics: ["switch"]
  };
  const repository = applicationRepository(document, async (markSynced) => markSynced());
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document });

  await openFirstStudyUnit(app);
  root.click("next-study-unit");
  assert.match(root.innerHTML, /Escreva uma resposta antes de continuar\./u);
  assert.match(root.innerHTML, /Explique a decisão do switch/u);

  const input = root.querySelector("[data-action='open-response-input']");
  input.value = "O switch aprende o MAC de origem na porta 1.\nDepois procura o destino.";
  input.dispatch("input");
  root.click("next-study-unit");
  await nextTurn();

  assert.match(root.innerHTML, /Resposta preenchida\./u);
  assert.match(root.innerHTML, /A origem serve à aprendizagem/u);
  assert.doesNotMatch(root.innerHTML, /Correto|Incorreto/iu);
  root.click("continue-feedback");
  await nextTurn();
  assert.match(root.innerHTML, /Unidade 2/u);
  app.destroy();
});
