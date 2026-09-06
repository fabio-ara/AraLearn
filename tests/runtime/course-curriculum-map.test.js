import assert from "node:assert/strict";
import test from "node:test";
import { renderCourseCurriculumMap, bindCourseCurriculumMap } from "../../src/ui/CourseCurriculumMap.js";
import { parseCourseAuthoringRoute } from "../../src/ui/courseAuthoringRoute.js";
import { curriculumMapFixture } from "../fixtures/courseCurriculumMapFixture.js";

test("mapa grande conserva objetivos completos e começa sem expandir módulos, lições ou cobertura", () => {
  const fixture = curriculumMapFixture();
  const html = renderCourseCurriculumMap(fixture);
  assert.equal((html.match(/class="course-curriculum-map-microsequence"/gu) || []).length, 240);
  assert.equal((html.match(/course-curriculum-map-module"/gu) || []).length, 12);
  assert.equal((html.match(/course-curriculum-map-lesson"/gu) || []).length, 48);
  assert.equal((html.match(/<details[^>]*\sopen(?:\s|>)/gu) || []).length, 0);
  assert.match(html, /Última condição do objetivo\./u);
  assert.ok(html.includes(fixture.curriculum.modules[0].objective));
  assert.doesNotMatch(html, /partId|productionPosition|Aprovar módulo/u);
});

test("expansão é seletiva e ignora referências removidas sem alterar o currículo", () => {
  const fixture = curriculumMapFixture();
  const before = structuredClone(fixture);
  const expansion = ["module:module-2", "lesson:lesson-2-1", "objective:module:module-2", "module:removed"];
  const html = renderCourseCurriculumMap({ ...fixture, expansion });
  const opened = [...html.matchAll(/<details[^>]*data-curriculum-expansion="([^"]+)" open>/gu)].map((match) => match[1]);
  assert.deepEqual(opened, ["module:module-2", "objective:module:module-2", "lesson:lesson-2-1"]);
  assert.deepEqual(fixture, before);
});

test("pré-requisitos e cobertura levam aos destinos existentes, inclusive unidade desenvolvida", () => {
  const html = renderCourseCurriculumMap(curriculumMapFixture());
  const destinations = [...html.matchAll(/href="([^"]+)" data-curriculum-navigate/gu)]
    .map((match) => parseCourseAuthoringRoute(match[1].replaceAll("&amp;", "&")));
  assert.ok(destinations.every((route) => route && route.section === "content"));
  for (const kind of ["module", "lesson", "didactic_microsequence", "study_unit"]) {
    assert.ok(destinations.some((route) => route.target?.kind === kind), kind);
  }
  assert.match(html, /data-curriculum-key="dependency:micro-1-1-2:micro-1-1-1"/u);
  assert.ok(destinations.some((route) => route.target?.id === "study-unit-1"));
});

test("títulos, objetivos e enunciados são texto escapado; identidades não viram marcação", () => {
  const fixture = curriculumMapFixture({ moduleCount: 1 });
  fixture.curriculum.modules[0].title = '<img src=x onerror="alert(1)"> العربية 漢字';
  fixture.curriculum.modules[0].objective = '<script>alert(1)</script> & objetivo';
  fixture.curriculumScopeItems[0].statement = '<svg onload="alert(1)">';
  const html = renderCourseCurriculumMap(fixture);
  assert.doesNotMatch(html, /<(?:img|script|svg)\b[^>]*(?:onerror|onload|alert)/u);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; العربية 漢字/u);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; objetivo/u);
});

function bindingFixture() {
  const listeners = new Map();
  const scrollRoot = { scrollTop: 100, scrollLeft: 0, clientHeight: 500, getBoundingClientRect: () => ({ top: 20 }) };
  const control = {
    dataset: { curriculumKey: "microsequence:micro-1" },
    getClientRects: () => [1],
    getBoundingClientRect: () => ({ top: 300 - scrollRoot.scrollTop, bottom: 344 - scrollRoot.scrollTop }),
    getAttribute: () => "#/destination",
    focus(options) { root.ownerDocument.activeElement = control; control.focusOptions = options; }
  };
  const disclosure = { open: true, dataset: { curriculumExpansion: "module:module-1" }, matches: () => true };
  const root = {
    dataset: { curriculumReturn: "#/planning" }, ownerDocument: { activeElement: control },
    querySelectorAll: (selector) => selector.startsWith("details") ? [disclosure] : [control],
    contains: (node) => node === control || node === disclosure,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => { if (listeners.get(type) === handler) listeners.delete(type); }
  };
  const changes = [];
  const navigations = [];
  return { root, scrollRoot, control, disclosure, listeners, changes, navigations,
    options: { scrollRoot, onStateChange: (state) => changes.push(state), onNavigate: (...args) => navigations.push(args) } };
}

test("retorno captura expansão, âncora e foco; restaura posição sem nova navegação", () => {
  const fixture = bindingFixture();
  const binding = bindCourseCurriculumMap(fixture.root, fixture.options);
  const state = binding.captureState();
  assert.deepEqual(state.expansion, ["module:module-1"]);
  assert.equal(state.position.offset, 180);
  fixture.listeners.get("click")({ target: { closest: () => fixture.control }, preventDefault() {} });
  assert.deepEqual(fixture.navigations, [["#/destination", { returnTo: "#/planning" }]]);
  binding.destroy();
  fixture.scrollRoot.scrollTop = 0;
  fixture.root.ownerDocument.activeElement = null;
  const restored = bindCourseCurriculumMap(fixture.root, { ...fixture.options, initialState: state });
  assert.equal(restored.restorePosition(), true);
  assert.equal(fixture.scrollRoot.scrollTop, 100);
  assert.equal(fixture.root.ownerDocument.activeElement, fixture.control);
  assert.deepEqual(fixture.control.focusOptions, { preventScroll: true });
  assert.equal(fixture.navigations.length, 1);
  restored.destroy();
});

test("disclosure notifica estado sem rerender; bind é idempotente e clique modificado conserva comportamento nativo", () => {
  const fixture = bindingFixture();
  const oldBinding = bindCourseCurriculumMap(fixture.root, fixture.options);
  const binding = bindCourseCurriculumMap(fixture.root, fixture.options);
  oldBinding.destroy();
  fixture.disclosure.open = false;
  fixture.listeners.get("toggle")({ target: fixture.disclosure });
  assert.deepEqual(fixture.changes[0].expansion, []);
  fixture.listeners.get("click")({ target: { closest: () => fixture.control }, ctrlKey: true,
    preventDefault() { assert.fail("Não deve capturar a abertura em outra aba."); } });
  assert.equal(fixture.navigations.length, 0);
  binding.destroy();
  assert.equal(fixture.listeners.size, 0);
});
