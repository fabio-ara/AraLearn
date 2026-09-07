import assert from "node:assert/strict";
import test from "node:test";
import { createCourseInspectionSequence } from "../../src/ui/CourseInspectionSequence.js";
import { createCourseAuthoringSurface } from "../../src/ui/CourseAuthoringSurface.js";
import { createUxUi328Fixture } from "../fixtures/uxUi328Fixture.js";

class Root {
  innerHTML = "";
  listeners = new Map();
  attributes = new Map();
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
}
function mount(fixture, overrides = {}) {
  const root = new Root();
  const sequence = createCourseInspectionSequence({ root, controller: fixture.controller,
    course: fixture.course, windowValue: null, documentValue: null, ...overrides });
  return { root, sequence };
}
const changed = () => Object.assign(new Error("Revisão mudou"), { code: "course_revision_changed", status: 409 });
const turn = () => new Promise((resolve) => setImmediate(resolve));

test("409 persistente encerra após uma releitura do cabeçalho e oferece repetição", async () => {
  const fixture = createUxUi328Fixture();
  let pages = 0, headers = 0;
  const { root, sequence } = mount(fixture, { controller: { ...fixture.controller,
    async getCourse() { headers++; return fixture.course; },
    async loadAuthoringStudyUnits() { pages++; throw changed(); }
  } });
  try {
    assert.equal(await sequence.open(), false);
    assert.equal(pages, 2);
    assert.equal(headers, 1);
    assert.equal(root.attributes.get("aria-busy"), "false");
    assert.match(root.innerHTML, /Tentar novamente/);
    assert.doesNotMatch(root.innerHTML, /Nenhuma unidade de estudo/);
  } finally { sequence.destroy(); }
});

test("409 durante paginação descarta cursor antigo e relê contexto mantendo âncora", async () => {
  const fixture = createUxUi328Fixture();
  const read = fixture.controller.loadAuthoringStudyUnits;
  const calls = [];
  const { sequence } = mount(fixture, { routeTarget: { kind: "study_unit", id: "ux328-unit-06" },
    controller: { ...fixture.controller,
      async loadAuthoringStudyUnits(courseId, options) {
        calls.push(options);
        if (options.expectedRevision !== fixture.course.revision) throw changed();
        return read(courseId, options);
      }
    }
  });
  try {
    assert.equal(await sequence.open(), true);
    fixture.course.revision++;
    assert.equal(await sequence.loadMore(), true);
    assert.equal(sequence.snapshot().courseRevision, 6);
    assert.equal(sequence.snapshot().studyUnitId, "ux328-unit-06");
    assert.equal(calls.at(-1).cursor, null);
    assert.equal(calls.at(-1).expectedRevision, 6);
    assert.equal(calls.length, 4);
  } finally { sequence.destroy(); }
});

test("reconciliação não usa cabeçalho de cópia local como revisão corrente", async () => {
  const fixture = createUxUi328Fixture();
  let calls = 0;
  const { root, sequence } = mount(fixture, { controller: { ...fixture.controller,
    async getCourse() { return { ...fixture.course, stale: true }; },
    async loadAuthoringStudyUnits() { calls++; throw changed(); }
  } });
  try {
    assert.equal(await sequence.open(), false);
    assert.equal(calls, 1);
    assert.match(root.innerHTML, /Tentar novamente/);
  } finally { sequence.destroy(); }
});

test("cópia local após erro de serviço permanece distinta de desconexão e leitura em andamento", async () => {
  const fixture = createUxUi328Fixture();
  const read = fixture.controller.loadAuthoringStudyUnits;
  const { root, sequence } = mount(fixture, { controller: { ...fixture.controller,
    async loadAuthoringStudyUnits(...args) { return { ...await read(...args), offline: false,
      stale: true, readFailure: { status: 503, code: "service_unavailable" } }; }
  } });
  try {
    assert.equal(await sequence.open(), true);
    assert.match(root.innerHTML, /Cópia local; atualização pendente/);
    assert.doesNotMatch(root.innerHTML, /Sem sincronização com a nuvem|Atualizando conteúdo|Lendo conteúdo/);
  } finally { sequence.destroy(); }
});

test("consulta de Observações sobrevive ao refresh e apenas texto modificado marca dirty", async () => {
  const fixture = createUxUi328Fixture();
  const { root, sequence } = mount(fixture);
  try {
    await sequence.open();
    root.listeners.get("click")({ preventDefault() {}, target: { closest(selector) {
      return selector === "[data-inspection-observations]" ? { dataset: { studyUnitId: "ux328-unit-01" } } : null;
    } } });
    await turn();
    assert.match(root.innerHTML, /data-course-authoring-draft-managed/);
    assert.equal(sequence.hasPendingDraft(), false);
    fixture.course.revision++;
    assert.equal(await sequence.refresh(6), true);
    assert.match(root.innerHTML, /Observações da unidade/);
    assert.match(root.innerHTML, /Conferir a relação entre o endereço/);
    root.listeners.get("input")({ target: {
      matches(selector) { return selector === "[data-field='study-unit-observation']"; },
      value: "Rascunho preservado", closest() { return { dataset: { studyUnitId: "ux328-unit-01" } }; }
    } });
    assert.equal(sequence.hasPendingDraft(), true);
    assert.match(root.innerHTML, /Observações da unidade/);
  } finally { sequence.destroy(); }
});

test("revogação na leitura de unidades oculta o conteúdo anterior e encerra loading", async () => {
  const fixture = createUxUi328Fixture();
  const { root, sequence } = mount(fixture);
  try {
    await sequence.open();
    fixture.controller.loadAuthoringStudyUnits = async () => { throw Object.assign(new Error("Revogado"), { status: 403 }); };
    assert.equal(await sequence.refresh(), false);
    assert.doesNotMatch(root.innerHTML, /data-inspection-study-unit=/);
    assert.match(root.innerHTML, /Você não tem acesso/);
    assert.equal(root.attributes.get("aria-busy"), "false");
  } finally { sequence.destroy(); }
});

test("lifecycle informa leitura pendente e encerra o indicador global ao desmontar", async () => {
  const fixture = createUxUi328Fixture();
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const states = [];
  const { sequence } = mount(fixture, { onReadState: (state) => states.push(state),
    controller: { ...fixture.controller, loadAuthoringStudyUnits: () => pending }
  });
  const opened = sequence.open();
  await turn();
  assert.equal(states.at(-1).syncing, true);
  sequence.destroy();
  assert.equal(states.at(-1).syncing, false);
  reject(Object.assign(new Error("Cancelado"), { name: "AbortError" }));
  await opened;
  assert.equal(states.at(-1).syncing, false);
});

test("nuvem e repetição da Autoria executam releitura pelo evento real da ação", async () => {
  const fixture = createUxUi328Fixture();
  const root = new Root();
  let reads = 0;
  const surface = createCourseAuthoringSurface({ root,
    controller: { ...fixture.controller, async getCourse() { reads++; return fixture.course; } },
    locationValue: { pathname: "/", search: "", hash:
      `#/authoring/courses/${fixture.course.courseId}?section=content` },
    windowValue: null, documentValue: null, navigatorValue: { onLine: true }
  });
  try {
    await surface.open();
    assert.equal(reads, 1);
    await root.listeners.get("click")({ target: { closest(selector) {
      return selector === '[data-action="synchronize-study"]'
        ? { dataset: { action: "synchronize-study" } } : null;
    } } });
    assert.equal(reads, 2);
    assert.doesNotMatch(root.innerHTML, /Sincronizando/);
  } finally { surface.destroy(); }
});
