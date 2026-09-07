import assert from "node:assert/strict";
import test from "node:test";
import { renderCourseDesignPanel } from "../../src/ui/CourseDesignPanel.js";
import { normalizeCourseDesign } from "../../src/ui/courseAuthoringViewModel.js";
import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

const selection = { courseId: "10000000-0000-4000-8000-000000000001", moduleId: "module-1",
  lessonId: "lesson-1", microsequenceId: "micro-1", studyUnitId: "unit-1" };
const parameterId = "study_unit_content_word_target";

test("alcance explicita os cinco níveis e mantém nó corrente sem link para si", () => {
  const design = normalizeCourseDesign(courseDesignFixture(selection));
  const before = structuredClone(design);
  const html = renderCourseDesignPanel({ courseDesign: design });
  const path = html.match(/<nav aria-label="Caminho do escopo">([\s\S]*?)<\/nav>/)?.[1];
  for (const label of ["Curso", "Módulo", "Lição", "Microssequência didática", "Unidade de estudo"]) {
    assert.ok(path.includes(`<small>${label}</small>`));
  }
  assert.equal((path.match(/<a /g) || []).length, 4);
  assert.match(path, /<span aria-current="page"><small>Unidade de estudo<\/small><span>study_unit sintético<\/span>/);
  assert.doesNotMatch(path, /studyUnitId=unit-1/);
  assert.match(html, /class="course-design-scope-target"><p id="course-design-scope-title">Aplicar em<\/p><strong>/);
  assert.match(html, /<\/strong><span class="course-design-context-note">Orienta/);
  assert.deepEqual(design, before);
});

test("valor numérico aplicado automaticamente permanece distinto de uma decisão fixa", () => {
  const input = courseDesignFixture(selection);
  const parameter = input.parameters.find((item) => item.parameterId === parameterId);
  parameter.effectiveAssignment = { mode: "automatic", value: 180, origin: "automatic",
    reason: "Valor aplicado por calibração sintética.", sourceScope: { kind: "study_unit", ref: "unit-1" }, inherited: false };
  const design = normalizeCourseDesign(input);
  const before = structuredClone(design);
  const html = renderCourseDesignPanel({ courseDesign: design, designCategory: "editorial" });
  assert.match(html, /<strong>180<\/strong>/);
  assert.match(html, /Valor aplicado · decisão automática/);
  const editor = renderCourseDesignPanel({ courseDesign: design, designCategory: "editorial", designParameterId: parameterId });
  assert.match(editor, /value="automatic" selected>Automático pelo contexto/);
  assert.match(editor, /data-design-values hidden/);
  assert.deepEqual(design, before);
});

test("valor fixo herdado comunica origem sem criar atribuição local ao abrir", () => {
  const input = courseDesignFixture(selection);
  const parameter = input.parameters.find((item) => item.parameterId === parameterId);
  parameter.effectiveAssignment = { mode: "fixed", value: 180, origin: "author", reason: "Condição sintética.",
    sourceScope: { kind: "course", ref: selection.courseId }, inherited: true };
  const design = normalizeCourseDesign(input);
  const before = structuredClone(design);
  const html = renderCourseDesignPanel({ courseDesign: design, designCategory: "editorial" });
  assert.match(html, /Herdado de course sintético/);
  assert.doesNotMatch(html, /Valor aplicado · decisão automática/);
  const editor = renderCourseDesignPanel({ courseDesign: design, designCategory: "editorial", designParameterId: parameterId });
  assert.match(editor, /value="fixed" selected>Fixar valor/);
  assert.match(editor, /aria-label="Restaurar herança" title="Restaurar herança" disabled/);
  assert.deepEqual(design, before);
  assert.equal(design.parameters.find((item) => item.parameterId === parameterId).localAssignment, null);
});

test("automático ainda não calibrado não inventa valor aplicado", () => {
  const design = normalizeCourseDesign(courseDesignFixture(selection));
  const html = renderCourseDesignPanel({ courseDesign: design, designCategory: "editorial" });
  assert.match(html, /<strong>Automático<\/strong>/);
  assert.doesNotMatch(html, /Valor aplicado · decisão automática/);
});
