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

function inspectionState({ applied = null, currentValue = 240, currentMode = "fixed" } = {}) {
  const input = courseDesignFixture(selection);
  const parameter = input.parameters.find(item => item.parameterId === parameterId);
  parameter.effectiveAssignment = { mode: currentMode, value: currentValue,
    origin: currentMode === "automatic" ? "automatic" : "author", reason: "Adequar o recorte ao público.",
    sourceScope: { kind: "course", ref: selection.courseId }, inherited: true };
  return { courseDesign: normalizeCourseDesign(input), designCategory: "editorial",
    designParameterId: parameterId, designAppliedParameters: applied };
}
const appliedParameter = (value = 180, reason = "Escolha feita para a primeira produção.") => ({
  parameterId, value, reason, origin: "automatic", sourceScope: { kind: "study_unit", ref: selection.studyUnitId }
});

test("inspeção separa ajuste herdado vigente do valor registrado na produção", () => {
  const state = inspectionState({ applied: [appliedParameter()] });
  const before = structuredClone(state);
  const html = renderCourseDesignPanel(state);
  assert.match(html, /Configuração atual:<\/strong> Fixo: 240/u);
  assert.match(html, /Aplicado nesta produção:<\/strong> 180/u);
  assert.match(html, /Herdado de course sintético/u);
  assert.match(html, /Motivo registrado:<\/strong> Escolha feita para a primeira produção/u);
  assert.match(html, /O valor aplicado difere da configuração atual/u);
  assert.match(html, /Onde se aplica:<\/strong> Unidade de estudo: study_unit sintético/u);
  assert.match(html, /não reescreve as unidades nem a explicação/u);
  assert.ok(html.indexOf("Definição e origem") < html.indexOf("data-course-design-parameter "));
  assert.deepEqual(state, before);
});

test("automático conserva escolha histórica sem tratá-la como fixação futura", () => {
  const html = renderCourseDesignPanel(inspectionState({ applied: [appliedParameter()], currentMode: "automatic", currentValue: 180 }));
  assert.match(html, /Configuração atual:<\/strong> Automático: escolher e justificar/u);
  assert.match(html, /modo automático permite uma nova escolha contextual/u);
  assert.doesNotMatch(html, /Configuração atual:<\/strong> Fixo/u);
});

test("mesmo valor não certifica adequação e motivo histórico ausente não é inventado", () => {
  const html = renderCourseDesignPanel(inspectionState({ applied: [appliedParameter(240, null)] }));
  assert.match(html, /O valor coincide com a configuração atual/u);
  assert.match(html, /não comprova que o conteúdo a realiza adequadamente/u);
  assert.match(html, /Não há justificativa registrada para esta produção/u);
});

test("registro ausente, consulta pendente e erro não se confundem", () => {
  const missing = renderCourseDesignPanel(inspectionState());
  assert.match(missing, /Não há valor aplicado registrado/u);
  const state = inspectionState(); delete state.designAppliedParameters;
  assert.match(renderCourseDesignPanel(state), /Consultando o registro desta produção/u);
  state.designAppliedFailure = "Serviço temporariamente indisponível.";
  const failed = renderCourseDesignPanel(state);
  assert.match(failed, /Não foi possível consultar o registro desta produção/u);
  assert.match(failed, /Serviço temporariamente indisponível/u);
  assert.doesNotMatch(failed, /Não há valor aplicado registrado/u);
});

test("ancestral não herda o snapshot da unidade como configuração do curso", () => {
  const state = inspectionState({ applied: [appliedParameter()] });
  state.courseDesign = normalizeCourseDesign(courseDesignFixture(selection, { scope: "course" }));
  const html = renderCourseDesignPanel(state);
  assert.match(html, /registro de produção é inspecionado em cada Unidade de estudo/u);
  assert.doesNotMatch(html, /Aplicado nesta produção:<\/strong> 180/u);
});

test("cadência restrita ao curso continua inspecionável sem editor local na unidade", () => {
  const state = inspectionState(); state.designParameterId = "authoring_part_microsequence_target";
  state.designCategory = "cadence";
  const html = renderCourseDesignPanel(state);
  assert.match(html, /Ajuste disponível em: Curso/u);
  assert.match(html, /configuração e o registro de produção continuam inspecionáveis/u);
  assert.doesNotMatch(html, /data-course-design-parameter data-design-value-owner/u);
});
