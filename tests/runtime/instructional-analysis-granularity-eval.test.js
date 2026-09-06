import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  courseAuthoringGuidanceForCall
} from "../../supabase/functions/_shared/aralearn-authoring/courseKnowledge.js";

const fixture = JSON.parse(await fs.readFile(new URL(
  "../fixtures/instructional-analysis-granularity.v1.json",
  import.meta.url
), "utf8"));

test("#264 entrega ao produtor a fixture semântica sintética sem criar classificador backend", () => {
  assert.equal(fixture.format, "aralearn.instructional-analysis-granularity-eval.v1");
  assert.equal(
    fixture.epistemicStatus,
    "synthetic_producer_declaration_for_model_and_human_review"
  );
  assert.equal(fixture.courseBrief.plan, undefined);
  assert.equal(fixture.regressionCases.length, 5);
  assert.equal(new Set(fixture.regressionCases.map(({ id }) => id)).size, 5);
  assert.equal(
    fixture.regressionCases.every(({ assumedPriorKnowledge }) => (
      Array.isArray(assumedPriorKnowledge) &&
      new Set(assumedPriorKnowledge).size === assumedPriorKnowledge.length
    )),
    true
  );
  assert.deepEqual(fixture.regressionCases[0].assumedPriorKnowledge, []);
  assert.ok(fixture.regressionCases[1].assumedPriorKnowledge.includes("socket"));
  assert.deepEqual(
    fixture.regressionCases.map(({ producerDeclaration }) => producerDeclaration),
    [
      "decompose_before_materialization",
      "accept_as_separately_trackable_change",
      "accept_as_separately_trackable_change",
      "accept_without_length_proxy",
      "decompose_before_materialization"
    ]
  );
  assert.deepEqual(fixture.regressionCases[4].assumedPriorKnowledge, []);
  assert.match(fixture.regressionCases[4].reason, /fundamentais.*conhecimento prévio/iu);

  const guidance = courseAuthoringGuidanceForCall("consultar_planejamento");
  const instructions = guidance.instructions.join(" ");
  assert.match(instructions, /tópico agregado.*Decomponha/iu);
  assert.match(instructions, /Conhecimentos já estabelecidos podem ser mobilizados livremente/iu);
  assert.match(instructions, /não palavras, altura, dificuldade ou carga cognitiva/iu);
  assert.match(instructions, /produtor declara.*servidor confere somente/iu);

  const materialization = courseAuthoringGuidanceForCall("preparar_materializacao")
    .instructions.join(" ");
  assert.match(materialization, /prática e consolidação considerando pré-requisitos, função e preferências de distribuição e posição/iu);
  assert.match(materialization, /alternância ou blocos não certifica aprendizagem nem autoriza mover prática para antes de seus pré-requisitos/iu);
  assert.match(materialization, /Ensine cada dependência antes do uso/iu);
  assert.match(materialization, /não invente requisito de evidência/iu);
});
