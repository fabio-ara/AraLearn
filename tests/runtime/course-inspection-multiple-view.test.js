import assert from "node:assert/strict";
import test from "node:test";
import { createCourseInspectionSequence } from "../../src/ui/CourseInspectionSequence.js";
import { createUxUi328Fixture } from "../fixtures/uxUi328Fixture.js";

class Root {
  innerHTML = "";
  listeners = new Map();
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute() {}
}
const turn = () => new Promise((resolve) => setImmediate(resolve));
const unit = (ordinal) => `ux328-unit-${String(ordinal).padStart(2, "0")}`;
const cards = (root) => (root.innerHTML.match(/data-inspection-study-unit=/g) || []).length;
function mount(fixture, overrides = {}) {
  const root = new Root();
  const sequence = createCourseInspectionSequence({ root, controller: fixture.controller, course: fixture.course,
    windowValue: null, documentValue: null, onSaveManualEdit: async () => { assert.fail("Abrir edição não grava."); }, ...overrides });
  const click = (selector, dataset) => root.listeners.get("click")({ preventDefault() {},
    target: { closest(value) { return value === selector ? { dataset } : null; } } });
  return { root, sequence, click,
    view: (ordinal) => click("[data-inspection-view-action]", { inspectionViewAction: "toggle-multiple", studyUnitId: unit(ordinal) }),
    select: (ordinal) => click("[data-inspection-selection-action]", { inspectionSelectionAction: "toggle-unit", studyUnitId: unit(ordinal) }),
    preview: (ordinal) => click("[data-inspection-unit-mode]", { inspectionUnitMode: "view", studyUnitId: unit(ordinal) }),
    edit: (ordinal) => click("[data-inspection-unit-mode]", { inspectionUnitMode: "edit", studyUnitId: unit(ordinal) }) };
}

test("prévia mantém rascunho pendente, bloqueia outro alvo e permite retomar e salvar explicitamente", async () => {
  const writes = [];
  const app = mount(createUxUi328Fixture(), { onSaveManualEdit: async (value) => { writes.push(value); } });
  try {
    await app.sequence.open(); await app.edit(1);
    await app.root.listeners.get("input")({ target: { textContent: "Título em prévia",
      matches: (selector) => selector === "[data-inspection-manual-title]" } });
    assert.equal(await app.preview(1), true);
    assert.match(app.root.innerHTML, /<h3[^>]*>Título em prévia<\/h3>/);
    assert.doesNotMatch(app.root.innerHTML, /data-inspection-manual-title/);
    assert.equal(app.sequence.hasPendingDraft(), true);
    await app.view(1);
    assert.equal(await app.preview(2), false);
    assert.match(app.root.innerHTML, /Retomar edição/);
    await app.click("[data-inspection-pending-action]", { inspectionPendingAction: "resume" });
    assert.equal(cards(app.root), 1);
    assert.equal(app.sequence.snapshot().studyUnitId, unit(1));
    assert.match(app.root.innerHTML, /data-inspection-manual-title[^>]*>Título em prévia<\/h3>/);
    assert.equal(writes.length, 0);
    await app.preview(1);
    assert.equal(await app.click("[data-inspection-manual-action]", { inspectionManualAction: "save" }), true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].studyUnit.title, "Título em prévia");
    assert.equal(app.sequence.hasPendingDraft(), false);
    assert.match(app.root.innerHTML, /<h3[^>]*>Título em prévia<\/h3>/);
  } finally { app.sequence.destroy(); }
});

test("prévia inválida preserva texto incompleto na edição até cancelar explicitamente", async () => {
  const app = mount(createUxUi328Fixture());
  try {
    await app.sequence.open(); await app.edit(1);
    await app.root.listeners.get("input")({ target: { textContent: "",
      matches: (selector) => selector === "[data-inspection-manual-title]" } });
    assert.equal(await app.preview(1), false);
    assert.match(app.root.innerHTML, /data-inspection-manual-title[^>]*><\/h3>/);
    assert.match(app.root.innerHTML, /incompleta ou inválida/);
    assert.equal(app.sequence.hasPendingDraft(), true);
    await app.click("[data-inspection-manual-action]", { inspectionManualAction: "cancel" });
    assert.equal(app.sequence.hasPendingDraft(), false);
    assert.doesNotMatch(app.root.innerHTML, /data-inspection-manual-title/);
  } finally { app.sequence.destroy(); }
});

test("gravação incerta na prévia volta à edição e conserva o mesmo pedido até confirmação", async () => {
  const writes = [];
  const app = mount(createUxUi328Fixture(), { onSaveManualEdit: async (value) => {
    writes.push(value);
    if (writes.length === 1) throw Object.assign(new Error("Resposta indisponível"), { status: 503 });
  } });
  try {
    await app.sequence.open(); await app.edit(1);
    await app.root.listeners.get("input")({ target: { textContent: "Título com gravação incerta",
      matches: (selector) => selector === "[data-inspection-manual-title]" } });
    await app.preview(1);
    assert.equal(await app.click("[data-inspection-manual-action]", { inspectionManualAction: "save" }), false);
    assert.match(app.root.innerHTML, /data-inspection-manual-title[^>]*>Título com gravação incerta<\/h3>/);
    assert.equal(await app.preview(1), false);
    assert.match(app.root.innerHTML, /Confirme a mesma gravação/);
    assert.equal(app.sequence.hasPendingDraft(), true);
    await app.click("[data-inspection-manual-action]", { inspectionManualAction: "cancel" });
    assert.match(app.root.innerHTML, /Descartar rascunho com resultado incerto/);
    assert.equal(app.sequence.hasPendingDraft(), true);
    await app.click("[data-inspection-manual-action]", { inspectionManualAction: "keep-unknown" });
    assert.equal(await app.click("[data-inspection-manual-action]", { inspectionManualAction: "save" }), true);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1], writes[0]);
    assert.equal(app.sequence.hasPendingDraft(), false);
  } finally { app.sequence.destroy(); }
});

test("mostrar várias não seleciona; marcar, desmarcar e limpar não recolhem visão", async () => {
  const fixture = createUxUi328Fixture();
  const app = mount(fixture);
  try {
    await app.sequence.open();
    assert.equal(cards(app.root), 1);
    assert.equal(await app.view(1), true);
    assert.equal(cards(app.root), 12);
    assert.doesNotMatch(app.root.innerHTML, /aria-checked="true"/);
    await app.select(1); await app.select(2); await app.select(1);
    assert.equal(cards(app.root), 12);
    assert.equal((app.root.innerHTML.match(/aria-checked="true"/g) || []).length, 1);
    await app.click("[data-inspection-selection-action]", { inspectionSelectionAction: "clear" });
    assert.equal(cards(app.root), 12);
    assert.doesNotMatch(app.root.innerHTML, /aria-checked="true"/);
    await app.view(1);
    assert.equal(cards(app.root), 1);
    assert.equal(app.sequence.snapshot().studyUnitId, unit(1));
    assert.match(app.root.innerHTML, /aria-label="Mostrar várias unidades"/);
  } finally { app.sequence.destroy(); }
});

test("rascunho manual de A impede editar B com motivo e retomada locais, sem descartar texto", async () => {
  const fixture = createUxUi328Fixture();
  const app = mount(fixture);
  const focused = [];
  app.root.querySelector = (selector) => {
    if (selector.startsWith("[data-inspection-study-unit=")) return { getBoundingClientRect: () => ({ top: 0 }) };
    if (selector === `[data-inspection-control-key="pending:${unit(2)}"]`) {
      return { focus: () => focused.push(`pending:${unit(2)}`) };
    }
    return null;
  };
  try {
    await app.sequence.open();
    assert.equal(await app.edit(1), true);
    await app.root.listeners.get("input")({ target: { textContent: "Título em rascunho preservado",
      matches: (selector) => selector === "[data-inspection-manual-title]" } });
    await app.view(1);
    assert.equal(await app.edit(2), false);
    await turn();
    assert.equal(cards(app.root), 12);
    assert.match(app.root.innerHTML, /course-inspection-mode-block[^>]*role="alert"/);
    assert.match(app.root.innerHTML, /Retomar edição/);
    assert.equal(focused.at(-1), `pending:${unit(2)}`);
    assert.equal(app.sequence.hasPendingDraft(), true);
    await app.click("[data-inspection-pending-action]", { inspectionPendingAction: "resume" });
    assert.equal(cards(app.root), 1);
    assert.equal(app.sequence.snapshot().studyUnitId, unit(1));
    assert.match(app.root.innerHTML, /Título em rascunho preservado/);
    assert.equal(app.sequence.hasPendingDraft(), true);
    assert.equal(fixture.requests.some(({ kind }) => kind === "annotation-mutation"), false);
  } finally { app.sequence.destroy(); }
});

test("editar A novamente na múltipla recolhe para A mantendo rascunho já modificado", async () => {
  const app = mount(createUxUi328Fixture());
  try {
    await app.sequence.open(); await app.edit(1);
    await app.root.listeners.get("input")({ target: { textContent: "Título mantido",
      matches: (selector) => selector === "[data-inspection-manual-title]" } });
    await app.view(1);
    assert.equal(await app.edit(1), true);
    assert.equal(cards(app.root), 1);
    assert.match(app.root.innerHTML, /Título mantido/);
    assert.equal(app.sequence.hasPendingDraft(), true);
  } finally { app.sequence.destroy(); }
});

test("observação fechada em A bloqueia troca para B com retomada do alvo e texto corretos", async () => {
  const fixture = createUxUi328Fixture();
  const app = mount(fixture);
  try {
    await app.sequence.open();
    await app.click("[data-inspection-observations]", { studyUnitId: unit(1) });
    await app.root.listeners.get("input")({ target: { value: "Observação em rascunho",
      matches: (selector) => selector === "[data-field='study-unit-observation']", closest: () => null } });
    await app.click("[data-observation-action]", { observationAction: "close" });
    await app.view(1);
    assert.equal(await app.view(2), false);
    assert.match(app.root.innerHTML, /Retomar observação/);
    await app.click("[data-inspection-pending-action]", { inspectionPendingAction: "resume" });
    assert.match(app.root.innerHTML, /data-observation-composer data-study-unit-id="ux328-unit-01"/);
    assert.match(app.root.innerHTML, />Observação em rascunho<\/textarea>/);
    assert.equal(app.sequence.hasPendingDraft(), true);
  } finally { app.sequence.destroy(); }
});

test("rascunho em lote fechado mantém alvos e texto ao bloquear foco e retomar", async () => {
  const app = mount(createUxUi328Fixture());
  try {
    await app.sequence.open(); await app.view(1); await app.select(1); await app.select(2);
    await app.click("[data-inspection-selection-action]", { inspectionSelectionAction: "observe-selected" });
    await app.root.listeners.get("input")({ target: { value: "Rascunho do conjunto preservado",
      matches: (selector) => selector === "[data-field='study-unit-observation']", closest: () => null } });
    await app.click("[data-observation-action]", { observationAction: "close" });
    assert.equal(await app.view(2), false);
    assert.equal(await app.select(3), false);
    await app.click("[data-inspection-pending-action]", { inspectionPendingAction: "resume" });
    assert.match(app.root.innerHTML, /Observação em 2 unidades/);
    assert.match(app.root.innerHTML, />Rascunho do conjunto preservado<\/textarea>/);
    assert.equal((app.root.innerHTML.match(/aria-checked="true"/g) || []).length, 2);
    assert.equal(cards(app.root), 12);
  } finally { app.sequence.destroy(); }
});

test("observação sendo enviada não fecha nem perde texto quando se tenta focalizar outra unidade", async () => {
  const fixture = createUxUi328Fixture();
  let finish;
  const mutation = fixture.controller.mutateCourseAnchoredAnnotations;
  const app = mount(fixture, { controller: { ...fixture.controller,
    mutateCourseAnchoredAnnotations: (input) => new Promise((resolve) => {
      finish = async () => resolve(await mutation(input));
    }) } });
  try {
    await app.sequence.open();
    await app.click("[data-inspection-observations]", { studyUnitId: unit(1) });
    await app.root.listeners.get("input")({ target: { value: "Texto do envio pendente",
      matches: (selector) => selector === "[data-field='study-unit-observation']", closest: () => null } });
    app.root.listeners.get("submit")({ preventDefault() {},
      target: { matches: (selector) => selector === "[data-observation-composer]" } });
    await turn();
    await app.click("[data-observation-action]", { observationAction: "close" });
    assert.match(app.root.innerHTML, /Conclua o envio pendente antes de fechar/);
    assert.match(app.root.innerHTML, />Texto do envio pendente<\/textarea>/);
    await app.view(1);
    assert.equal(await app.view(2), false);
    await finish(); await turn();
    assert.equal(fixture.requests.filter(({ kind }) => kind === "annotation-mutation").length, 1);
  } finally { app.sequence.destroy(); }
});

test("paginação pendente não substitui alvo focalizado depois", async () => {
  const fixture = createUxUi328Fixture();
  const read = fixture.controller.loadAuthoringStudyUnits;
  let resolvePage, calls = 0;
  let pendingOptions;
  const app = mount(fixture, { controller: { ...fixture.controller,
    async loadAuthoringStudyUnits(courseId, options) {
      if (++calls === 1) return read(courseId, options);
      pendingOptions = options;
      return new Promise((resolve) => { resolvePage = resolve; });
    }
  } });
  try {
    await app.sequence.open(); await app.view(1);
    const paging = app.sequence.loadMore();
    await turn();
    await app.view(6);
    resolvePage(await read(fixture.course.courseId, pendingOptions));
    assert.equal(await paging, false);
    assert.equal(cards(app.root), 1);
    assert.equal(app.sequence.snapshot().studyUnitId, unit(6));
  } finally { app.sequence.destroy(); }
});

test("observador pode alternar visão sem obter edição manual", async () => {
  const fixture = createUxUi328Fixture();
  const app = mount(fixture, { course: { ...fixture.course, ownership: "shared", canEdit: false } });
  try {
    await app.sequence.open(); await app.view(1);
    assert.equal(await app.edit(2), false);
    assert.doesNotMatch(app.root.innerHTML, /data-inspection-unit-mode="edit"/);
    assert.equal(await app.view(2), true);
    assert.equal(app.sequence.snapshot().studyUnitId, unit(2));
  } finally { app.sequence.destroy(); }
});
