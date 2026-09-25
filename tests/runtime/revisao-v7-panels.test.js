import assert from "node:assert/strict";
import test from "node:test";

import { createCourseAudioPanel } from "../../src/ui/CourseAudioPanel.js";
import { createCourseAnalyticsPanel } from "../../src/ui/CourseAnalyticsPanel.js";
import { createCourseObservationsPanel } from "../../src/ui/CourseObservationsPanel.js";
import { assembleCourseAuthoringExport } from "../../src/domain/courseAuthoringComparison.js";
import { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } from "../helpers/courseAuthoringAnalyticsFixture.js";
import { createDefaultCourseAudioConfig, COURSE_MEDIA_COURSE_MAX_BYTES } from "../../src/domain/courseMedia.js";
import { renderStudyUnitObservationComposer, renderStudyUnitObservationSheet } from "../../src/ui/renderStudyUnitObservationSheet.js";
import { renderAuthoringObservationQueue } from "../../src/ui/renderCourseAuthoringObservationQueue.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle() { await tick(); await tick(); }

test("helpers de origem bloqueiam lotes sem seleção elegível e preservam icon-only e perigo", () => {
  const eligible = { annotationId: "pending", targetSetVersion: 1, state: "open", category: "question",
    rawText: "Conferir argumento", targets: [{ kind: "study_unit", id: "unit", state: "pending", path: [] }] };
  const legacy = { ...eligible, annotationId: "legacy", targetSetVersion: null,
    target: { kind: "course", id: "course", currentPath: [] } };
  const scenarios = [
    { items: [], selectedObservationIds: ["stale"], all: true, selected: true },
    { items: [legacy], selectedObservationIds: ["legacy"], all: true, selected: true },
    { items: [eligible, legacy], selectedObservationIds: ["legacy"], all: false, selected: true },
    { items: [eligible], selectedObservationIds: ["pending"], all: false, selected: false },
    { items: [eligible], selectedObservationIds: ["pending"], filters: { category: "suggestion" }, all: true, selected: true },
    { items: [eligible], selectedObservationIds: ["pending"], saving: true, all: true, selected: true }
  ];
  for (const render of [props => renderStudyUnitObservationSheet({ ...props, authoringQueue: true }),
    props => renderAuthoringObservationQueue({ ...props, label: "Contexto preservado", opened: true })]) {
    for (const scenario of scenarios) {
      const html = render(scenario);
      for (const action of ["approve-selected", "cancel-selected", "approve-all", "cancel-all"]) {
        const button = findButton(html, `data-observation-action="${action}"`);
        assert.ok(button, action);
        assert.equal(button.label, "", action);
        assert.equal(/ disabled(?:\s|>)/u.test(button.markup), action.endsWith("-all") ? scenario.all : scenario.selected, action);
        assert.equal(button.markup.includes("is-danger"), action.startsWith("cancel"), action);
        assert.match(button.markup, /aria-label="[^"]+"/u);
      }
    }
  }
});

test("compositor compartilhado deriva validade do texto sem perder rascunho nem estado de gravação", () => {
  for (const rawText of ["", " \n\t ", "Texto válido 😀", "😀".repeat(2001)]) {
    for (const editingId of [null, "annotation"]) {
      for (const saving of [false, true]) {
        const html = renderStudyUnitObservationComposer({ draft: { rawText, category: "question" }, editingId, saving });
        const button = findButton(html, 'data-observation-action="save"');
        assert.equal(button.label, "");
        assert.equal(/ disabled(?:\s|>)/u.test(button.markup), saving || !rawText.trim() || [...rawText].length > 2000);
        assert.ok(html.includes(rawText + "</textarea>"));
        assert.match(html, /value="question" selected/u);
        assert.ok(button.markup.includes(saving ? "Salvando observação" : editingId ? "Salvar edição" : "Enviar observação"));
      }
    }
  }
});

/** Localiza um botão pelo marcador no HTML renderizado e devolve marcação e texto aparente. */
function findButton(html, marker, from = 0) {
  const anchor = html.indexOf(marker, from);
  if (anchor < 0) return null;
  const open = html.lastIndexOf("<button", anchor);
  const close = html.indexOf("</button>", anchor);
  if (open < 0 || close < 0) return null;
  const markup = html.slice(open, close + "</button>".length);
  return { markup, label: markup.replaceAll(/<[^>]*>/gu, "").trim() };
}

function stubNode(selector, focused) {
  return { selector, scrollTop: 0, value: "", checked: false, innerHTML: "",
    focus: () => focused.push(selector), addEventListener: () => {}, close: () => {},
    showModal: () => {}, contains: () => false,
    querySelector: () => stubNode(selector, focused), querySelectorAll: () => [] };
}

class AudioRoot {
  constructor() {
    this.innerHTML = "";
    this.listeners = new Map();
    this.focused = [];
    this.ownerDocument = { activeElement: null, createElement: () => stubNode("created", this.focused) };
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) { return stubNode(selector, this.focused); }
  querySelectorAll() { return []; }
  emit(type, event) { return this.listeners.get(type)?.(event); }
}

const AUDIO_COURSE_ID = "e3060000-0000-4000-8000-000000000010";
const SMALL_HASH = "a".repeat(64);
const LARGE_HASH = "b".repeat(64);

function audioFixture() {
  let revision = 1;
  const writes = [];
  return {
    courseId: AUDIO_COURSE_ID,
    writes,
    controller: {
      async loadCourseMedia() {
        return { contract: "aralearn.course-media.v1", courseId: AUDIO_COURSE_ID, courseRevision: revision,
          mode: "catalog", audioConfig: createDefaultCourseAudioConfig(),
          storage: { uniqueBytes: 512, maxUniqueBytes: COURSE_MEDIA_COURSE_MAX_BYTES },
          items: [{ contentHash: SMALL_HASH, byteSize: 48 * 1024, mediaType: "audio/wav", fileName: "Saída curta.wav" },
            { contentHash: LARGE_HASH, byteSize: 1572864, mediaType: "audio/mpeg", fileName: "Aula longa.mp3" }],
          nextCursor: null };
      },
      async mutateCourseMedia(request) {
        writes.push(request);
        const remove = request.command.type === "remove_media";
        return { contract: "aralearn.course-media-change.v1", courseId: AUDIO_COURSE_ID, courseRevision: ++revision,
          requestId: request.requestId, idempotent: false, changed: true,
          operation: remove ? "remove_media" : "set_audio_config",
          media: remove ? { contentHash: request.command.contentHash, byteSize: 48 * 1024, mediaType: "audio/wav" } : null,
          fileName: remove ? "Saída curta.wav" : null };
      }
    }
  };
}

function audioPanel(root, fixture) {
  return createCourseAudioPanel({ root, controller: fixture.controller, courseId: fixture.courseId,
    courseRevision: 1, loadSpeechProvider: async () => ({ GEMINI_SPEECH_VOICES: ["Kore"] }) });
}

function clickAudio(root, action, extra = {}) {
  return root.emit("click", { target: { closest: () => ({ dataset: { audioAction: action, ...extra } }) } });
}

test("tamanho de áudio pequeno não aparece como zero na biblioteca", async () => {
  const root = new AudioRoot();
  const fixture = audioFixture();
  const panel = audioPanel(root, fixture);
  await panel.open();
  assert.match(root.innerHTML, /48 KiB/u);
  assert.match(root.innerHTML, /1\.5 MiB/u);
  assert.doesNotMatch(root.innerHTML, /0\.0 MiB/u);
  clickAudio(root, "section", { section: "upload" });
  assert.match(root.innerHTML, /512 B/u);
  assert.doesNotMatch(root.innerHTML, /0\.0 MiB/u);
  panel.destroy();
});

test("remoção de áudio oferece cancelar explícito icon-only e retorno próprio", async () => {
  const root = new AudioRoot();
  const fixture = audioFixture();
  const panel = audioPanel(root, fixture);
  await panel.open();
  clickAudio(root, "remove", { mediaHash: SMALL_HASH });
  const cancel = findButton(root.innerHTML, 'data-audio-action="cancel-remove"');
  const confirm = findButton(root.innerHTML, 'data-audio-action="confirm-remove"');
  assert.ok(cancel, "a confirmação precisa do caminho seguro");
  assert.ok(confirm, "a remoção continua disponível");
  assert.equal(cancel.label, "");
  assert.equal(confirm.label, "");
  assert.match(cancel.markup, /aria-label="Cancelar remoção do áudio" title="Cancelar remoção do áudio"/u);
  assert.equal(root.focused.at(-1), "[data-audio-action='cancel-remove']");

  clickAudio(root, "cancel-remove");
  assert.equal(findButton(root.innerHTML, 'data-audio-action="confirm-remove"'), null);
  assert.equal(fixture.writes.length, 0);
  assert.equal(root.focused.at(-1), "[data-audio-action='remove'][data-media-hash='" + SMALL_HASH + "']");
  assert.match(root.innerHTML, /Saída curta\.wav/u);

  clickAudio(root, "remove", { mediaHash: SMALL_HASH });
  clickAudio(root, "confirm-remove");
  await settle();
  assert.equal(fixture.writes.length, 1);
  assert.deepEqual(fixture.writes[0].command, { type: "remove_media", contentHash: SMALL_HASH });
  assert.match(root.innerHTML, /Arquivo de áudio removido\./u);
  assert.doesNotMatch(root.innerHTML, /Áudio atualizado\./u);
  panel.destroy();
});

test("retorno de áudio identifica a operação concluída na configuração", async () => {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
    has(name) { return Object.hasOwn(this.fields, name); }
  };
  try {
    const root = new AudioRoot();
    const fixture = audioFixture();
    const panel = audioPanel(root, fixture);
    await panel.open();
    root.emit("submit", { preventDefault() {}, target: {
      fields: { locale: "pt-BR", rate: "1", nativeVoiceURI: "" },
      matches: (selector) => selector.includes("data-audio-config")
    } });
    await settle();
    assert.equal(fixture.writes.length, 1);
    assert.equal(fixture.writes[0].command.type, "set_audio_config");
    assert.match(root.innerHTML, /Configuração de áudio salva\./u);
    assert.doesNotMatch(root.innerHTML, /Áudio atualizado\./u);
    panel.destroy();
  } finally { globalThis.FormData = NativeFormData; }
});

class PanelRoot {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); this.fields = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) { return this.fields.get(selector) || null; }
}
const course = { courseId: ANALYTICS_COURSE_ID, revision: 7, ownership: "owned", canEdit: true, title: "Curso" };
function analyticsPage(options = {}) {
  const value = courseAuthoringAnalyticsFixture({ studyUnits: [{
    studyUnitRef: "unit-one", title: "Unidade", declaration: { mode: "expository",
      introducedInstructionalAnalysisUnitIds: ["analysis-one"], usedInstructionalAnalysisUnitIds: [],
      explanationApplications: [], practiceApplications: [] } }], ...options });
  value.basis.analysisUnits = [{ ref: "analysis-one", position: 1, statement: "Uma relação.", description: "Definição completa." }];
  value.scope.options.push({ kind: "study_unit", ref: "unit-one", label: "Unidade" });
  return value;
}
async function click(root, action, extra = {}) {
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { courseAnalyticsAction: action, ...extra } }) } });
  await tick();
}

test("exportação confirma o arquivo preparado na própria interface e não anuncia sucesso falso", async () => {
  const root = new PanelRoot();
  const downloads = [];
  let revision = 7;
  const controller = {
    loadCourseAuthoringAnalytics: async () => analyticsPage(),
    exportCourseAuthoring: async () => assembleCourseAuthoringExport({ analytics: analyticsPage({ revision }),
      document: { contract: "aralearn.course.v1", courses: [{ id: ANALYTICS_COURSE_ID, title: "Curso", goal: "Objetivo integral", modules: [] }] } })
  };
  const panel = createCourseAnalyticsPanel({ root, course, controller,
    download: (value) => { downloads.push(value); return value; } });
  await panel.open();
  await click(root, "export");
  assert.doesNotMatch(root.innerHTML, /Arquivo preparado para download/u);
  await click(root, "export-json");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "aralearn-curso-e-analise-edicao-7.json");
  assert.match(root.innerHTML, /role="status">Arquivo preparado para download: aralearn-curso-e-analise-edicao-7\.json\.</u);
  await click(root, "close-sheet");
  assert.match(root.innerHTML, /Arquivo preparado para download/u);
  await click(root, "details");
  assert.doesNotMatch(root.innerHTML, /Arquivo preparado para download/u);

  revision = 8;
  await click(root, "export");
  await click(root, "export-json");
  assert.equal(downloads.length, 1);
  assert.match(root.innerHTML, /role="alert"/u);
  assert.doesNotMatch(root.innerHTML, /Arquivo preparado para download/u);
  panel.destroy();
});

const OBSERVATIONS_COURSE_ID = "10000000-0000-4000-8000-000000000001";

class InboxRoot {
  constructor() { this.innerHTML = ""; this.listeners = new Map(); this.focused = []; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector(selector) { return { focus: () => this.focused.push(selector) }; }
}
class InboxDocument {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}
function observationsOutline(revision = 7) {
  return {
    contract: "aralearn.course.v1", courseId: OBSERVATIONS_COURSE_ID, title: "Curso", goal: "Compreender o tema.",
    revision, ownership: "owned", canEdit: true,
    counts: { moduleCount: 1, lessonCount: 1, topicCount: 2, microsequenceCount: 1, studyUnitCount: 1 },
    createdAt: "2026-08-17T09:00:00.000Z", updatedAt: "2026-08-17T10:00:00.000Z",
    outline: { courseId: OBSERVATIONS_COURSE_ID, title: "Curso", goal: "Compreender o tema.", modules: [{
      id: "module-a", title: "Módulo", lessons: [{ id: "lesson-a", title: "Lição contextual",
        topics: [{ id: "topic-a", title: "Conceito central", summary: null },
          { id: "topic-b", title: "Assunto secundário", summary: null }],
        microsequences: [{ id: "micro-a", title: "Microssequência", studyUnitCount: 1 }] }] }] },
    deepLink: "#/authoring/courses/" + OBSERVATIONS_COURSE_ID + "?section=content"
  };
}

test("filtro de observações sem correspondências preserva coleção, contadores e retorno", async () => {
  const NativeFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(target) { this.fields = target.fields; }
    get(name) { return this.fields[name] ?? null; }
    has(name) { return Object.hasOwn(this.fields, name); }
    getAll(name) { return this.fields[name] ?? []; }
  };
  try {
    const root = new InboxRoot();
    const queries = [];
    const panel = createCourseObservationsPanel({ root, documentValue: new InboxDocument(),
      course: { courseId: OBSERVATIONS_COURSE_ID, revision: 7 },
      controller: {
        async loadAuthoringOutline() { return observationsOutline(); },
        async loadCourseAnchoredAnnotations(_courseId, options) {
          queries.push(options.query);
          return { contract: "aralearn.course-anchored-annotation-page.v1", courseId: OBSERVATIONS_COURSE_ID,
            courseRevision: 7, annotationSetVersion: 4, query: structuredClone(options.query),
            summary: { matchingTotal: 0, byOrigin: {}, byChannel: {}, byState: {}, unclassifiedTotal: 0 },
            items: [], hasMore: false, nextCursor: null };
        },
        async mutateCourseAnchoredAnnotations() { throw new Error("Não deve alterar."); }
      } });
    await panel.open();
    assert.match(root.innerHTML, /Nenhuma observação\./u);
    assert.doesNotMatch(root.innerHTML, /course-observations-summary/u);

    root.listeners.get("submit")({ preventDefault() {},
      target: { matches: (selector) => selector === "[data-course-observations-filters]",
        fields: { origin: "learner", channel: "", state: "", category: "", subject: "", hierarchy: "",
          uncategorized: "on", descendants: "" } } });
    await settle();
    assert.equal(queries.length, 2);
    assert.deepEqual(queries[1].origins, ["learner"]);
    assert.equal(queries[1].includeUncategorized, true);
    assert.match(root.innerHTML, /<details class="course-observations-filters" open>/u);
    assert.match(root.innerHTML, /course-observations-summary/u);
    assert.match(root.innerHTML, /Correspondentes<\/dt><dd>0/u);
    assert.match(root.innerHTML, /Por origem/u);
    assert.match(root.innerHTML, /Nenhuma observação corresponde aos filtros aplicados; a coleção continua disponível\./u);
    const clear = findButton(root.innerHTML, 'data-observations-action="clear-filters"',
      root.innerHTML.indexOf('class="course-observations-empty"'));
    assert.ok(clear, "o estado vazio filtrado precisa de retorno explícito");
    assert.equal(clear.label, "");
    assert.match(clear.markup, /aria-label="Limpar filtros" title="Limpar filtros"/u);

    root.listeners.get("click")({ preventDefault() {},
      target: { closest: () => ({ dataset: { observationsAction: "clear-filters" } }) } });
    await settle();
    assert.equal(queries.length, 3);
    assert.deepEqual(queries[2].origins, []);
    assert.doesNotMatch(root.innerHTML, /course-observations-summary/u);
    assert.doesNotMatch(root.innerHTML, /corresponde aos filtros/u);
    assert.match(root.innerHTML, /Nenhuma observação\./u);
    panel.destroy();
  } finally { globalThis.FormData = NativeFormData; }
});

test("retirada de observação mantém perigo na solicitação e na confirmação", async () => {
  const annotationId = "81000000-0000-4000-8000-000000000081";
  const unitId = "study-unit-v7";
  const path = [
    { kind: "course", id: OBSERVATIONS_COURSE_ID, label: "Curso", version: null },
    { kind: "study_unit", id: unitId, label: "Unidade", version: 1 }
  ];
  const item = {
    contract: "aralearn.course-anchored-annotation.v1", annotationId, annotationVersion: 1,
    courseId: OBSERVATIONS_COURSE_ID,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: { kind: "protected_person", role: "learner", ref: "person-0123456789abcdef", label: "Estudante" },
    target: { kind: "study_unit", id: unitId, observedPath: path, currentAvailable: true, currentPath: path,
      deepLink: `#/authoring/courses/${OBSERVATIONS_COURSE_ID}?section=content&studyUnitId=${unitId}` },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 1 },
    rawText: "Texto da observação.", category: "confusing", briefSummary: null,
    subjectClassification: {
      status: "unclassified",
      automatic: { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: 5, subjects: [] },
      effective: { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: 5, subjects: [] },
      correctedAt: null
    },
    state: "open", ownerResponse: null,
    timestamps: { capturedAt: "2026-09-24T12:00:00.000Z", createdAt: "2026-09-24T12:00:00.000Z",
      updatedAt: "2026-09-24T12:00:00.000Z", firstConsideredAt: null, respondedAt: null, resolvedAt: null, withdrawnAt: null },
    capabilities: { canRevise: false, canWithdraw: true, canConsider: true, canRespond: false,
      canResolve: false, canReopen: false, canCorrectSubjects: false },
    deepLink: `#/authoring/courses/${OBSERVATIONS_COURSE_ID}?section=review&annotationId=${annotationId}`
  };
  const root = new InboxRoot();
  const panel = createCourseObservationsPanel({ root, documentValue: new InboxDocument(),
    course: { courseId: OBSERVATIONS_COURSE_ID, revision: 7 }, routeTarget: { kind: "anchored_annotation", id: annotationId },
    controller: {
      async loadAuthoringOutline() { return observationsOutline(); },
      async loadCourseAnchoredAnnotations(_courseId, options) {
        return { contract: "aralearn.course-anchored-annotation-page.v1", courseId: OBSERVATIONS_COURSE_ID,
          courseRevision: 7, annotationSetVersion: 4, query: structuredClone(options.query),
          summary: { matchingTotal: 1, byOrigin: { learner: 1 }, byChannel: { study_interface: 1 }, byState: { open: 1 }, unclassifiedTotal: 1 },
          items: [structuredClone(item)], hasMore: false, nextCursor: null };
      },
      async mutateCourseAnchoredAnnotations() { throw new Error("A prova não confirma a retirada."); }
    } });
  await panel.open();
  const request = findButton(root.innerHTML, 'data-observations-action="withdraw"');
  assert.ok(request);
  assert.match(request.markup, /class="course-authoring-icon-action is-danger"/u);
  root.listeners.get("click")({ target: { closest: () => ({ dataset: { observationsAction: "withdraw" } }) } });
  const confirmation = findButton(root.innerHTML, 'data-observations-action="confirm-withdraw"');
  assert.ok(confirmation);
  assert.match(confirmation.markup, /class="course-authoring-icon-action is-danger"/u);
  panel.destroy();
});
