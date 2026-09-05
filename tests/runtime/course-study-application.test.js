import test from "node:test";
import assert from "node:assert/strict";

import { createCourseStudyApplication } from
  "../../src/study/CourseStudyApplication.js";

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

test("visitante baixa PDF permitido pela citação sem sair da unidade, e falha mantém as fontes", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const attachment = { contentHash: "a".repeat(64), byteSize: 1_024, mediaType: "application/pdf" };
  const calls = [];
  let failure = false;
  let signedUrl = "https://project.example/authorized.pdf?token=sealed";
  repository.loadStudyUnitCitations = async () => ({ courseRevision: 4, citations: [{
    sourceId: "source-a", sourceRevision: 2, title: "Fonte pública", citationText: "Referência.",
    url: null, editionOrVersion: null, anchors: [], attachments: [attachment]
  }] });
  repository.getStudyCitationAttachmentDownload = async (reference, citation) => {
    calls.push({ reference, citation });
    if (failure) throw Object.assign(new Error("private storage details"), { code: "course_revision_changed", status: 409 });
    return { signedUrl };
  };
  const downloads = [];
  const root = new FakeStudyRoot();
  const app = createCourseStudyApplication({ root, repository, initialProject: document, visitor: true,
    downloadCitationPdf: (...values) => downloads.push(values) });
  await openFirstStudyUnit(app);
  root.click("toggle-citations");
  await nextTurn();
  root.click("download-citation-attachment");
  await nextTurn();
  assert.deepEqual(calls[0], { reference: { courseId: COURSE_ID, moduleId: "module-a", lessonId: "lesson-a", microsequenceId: "micro-a", studyUnitId: "unit-a" },
    citation: { courseRevision: 4, sourceId: "source-a", sourceRevision: 2, attachment } });
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0][0], "https://project.example/authorized.pdf?token=sealed");
  assert.match(root.innerHTML, /Conteúdo 1\./u);
  assert.match(root.innerHTML, /Fonte pública/u);
  for (const host of ["127.0.0.1", "localhost", "10.0.2.2"]) {
    signedUrl = `http://${host}:54321/authorized.pdf?token=sealed`;
    root.click("download-citation-attachment");
    await nextTurn();
    assert.equal(downloads.at(-1)[0], signedUrl);
  }
  signedUrl = "http://external.example/unauthorized.pdf";
  root.click("download-citation-attachment");
  await nextTurn();
  assert.equal(downloads.length, 4);
  failure = true;
  root.click("download-citation-attachment");
  await nextTurn();
  assert.equal(downloads.length, 4);
  assert.match(root.innerHTML, /O curso mudou/u);
  assert.match(root.innerHTML, /data-action="download-citation-attachment"/u);
  assert.doesNotMatch(root.innerHTML, /private storage details/u);
  app.destroy();
});

test("rascunho anterior sem destino comprovado fica visível até descarte explícito", async () => {
  const document = project();
  const repository = applicationRepository(document, async () => {});
  const draft = { sourceCourseId: COURSE_ID, requestId: "original-request", targetId: "study_unit",
    studyUnit: structuredClone(document.courses[0].modules[0].lessons[0].microsequences[0].studyUnits[0]) };
  draft.studyUnit.title = "Rascunho preservado <com texto>";
  let clears = 0;
  repository.loadStudyDraftRecovery = async () => structuredClone(draft);
  repository.recoverStudyDraft = async () => ({ status: "unresolved", targetCourseId: null });
  repository.clearStudyDraftRecovery = async (source, request) => {
    assert.equal(source, COURSE_ID); assert.equal(request, draft.requestId); clears += 1; return true;
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
