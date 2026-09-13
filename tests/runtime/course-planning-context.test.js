import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCourseAuthoringPlan, projectPersistedCurricularMap } from "../../src/ui/courseAuthoringViewModel.js";
import { renderCourseCurriculumMap } from "../../src/ui/CourseCurriculumMap.js";
import { renderCourseDesignPanel } from "../../src/ui/CourseDesignPanel.js";
import { coursePlanningContextFixture } from "../helpers/coursePlanningContextFixture.js";

test("rascunho preserva dependência ausente e expõe a pendência sem quebrar o mapa", () => {
  const fixture = coursePlanningContextFixture({ incomplete: true });
  const plan = normalizeCourseAuthoringPlan(fixture.plan);
  const projection = projectPersistedCurricularMap(fixture.read, plan);
  assert.equal(projection.completeness.complete, false);
  const html = renderCourseCurriculumMap({ courseId: fixture.courseId, ...projection, curriculumMapStatus: "draft", contextual: true });
  assert.match(html, /Referência ainda não localizada/u);
  assert.match(html, /data-curriculum-context="explanation"/u);
  fixture.plan.plan.curriculumMapStatus = "approved";
  assert.throws(() => normalizeCourseAuthoringPlan(fixture.plan), /pré-requisito|dependência|curricular/iu);
});

test("árvore inspecionada vem do mapa persistido e só associa produção da mesma versão", () => {
  const fixture = coursePlanningContextFixture();
  const plan = normalizeCourseAuthoringPlan(fixture.plan);
  fixture.read.map.modules[0].title = "Título persistido a inspecionar";
  const projection = projectPersistedCurricularMap(fixture.read, plan);
  assert.equal(projection.curriculum.modules[0].title, "Título persistido a inspecionar");
  assert.deepEqual(projection.curriculumScopeItems[0].curriculumTargets[0].didacticMicrosequenceIds, ["micro-context"]);
  assert.equal(projectPersistedCurricularMap(fixture.read, { ...plan, courseRevision: 9 }).curriculum.modules[0].lessons[0].microsequences[0].role, null);
});

test("aprovação apresenta a decisão humana sem expor versões e preserva seus inputs", () => {
  const fixture = coursePlanningContextFixture();
  const input = { courseId: fixture.courseId, courseRevision: 38,
    ...projectPersistedCurricularMap(fixture.read, normalizeCourseAuthoringPlan(fixture.plan)),
    approval: { planVersion: 34, inspected: false }, contextual: true };
  const before = structuredClone(input);
  const html = renderCourseCurriculumMap(input);
  assert.match(html, /<h4>Aprovação do mapa<\/h4>/u);
  assert.match(html, /Revise o mapa completo antes de aprovar\./u);
  assert.match(html, /Inspecionei esta versão do mapa completo\./u);
  assert.match(html, /data-curriculum-approve[^>]* disabled/u);
  assert.doesNotMatch(html, /Mapa salvo|revisão do curso|ramos recolhidos|resultados fora da busca|versão 34/u);
  assert.deepEqual(input, before);
});

test("base sem unidades distingue intenção corrente, inventário e aplicação não registrada", () => {
  const fixture = coursePlanningContextFixture();
  const html = renderCourseDesignPanel({ courseDesign: fixture.designs.didactic_microsequence, designCategory: "instruction",
    designInstructionalContext: { entity: fixture.entity, review: fixture.review.contentReview, basis: fixture.analytics.basis, errors: [] } });
  assert.match(html, /Há uma base explicativa salva/u);
  assert.match(html, /Previsto na intenção corrente desta microssequência/u);
  assert.match(html, /vínculo aplicado não registrado/u);
  assert.match(html, /Ainda não há unidades neste recorte/u);
  const unavailable = renderCourseDesignPanel({ courseDesign: fixture.designs.didactic_microsequence, designCategory: "instruction",
    designInstructionalContext: { errors: ["Leitura indisponível."] } });
  assert.match(unavailable, /O estado da base não pôde ser confirmado/u);
  assert.doesNotMatch(unavailable, /ainda não tem base explicativa salva/u);
});
