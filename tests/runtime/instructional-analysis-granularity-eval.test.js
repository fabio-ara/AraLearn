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
  assert.equal(fixture.regressionCases.length, 4);
  assert.equal(new Set(fixture.regressionCases.map(({ id }) => id)).size, 4);
  assert.deepEqual(
    fixture.regressionCases.map(({ producerDeclaration }) => producerDeclaration),
    [
      "decompose_before_materialization",
      "accept_as_separately_trackable_change",
      "accept_as_separately_trackable_change",
      "accept_without_length_proxy"
    ]
  );

  const guidance = courseAuthoringGuidanceForCall("lerCurso", {
    view: "instructional_plan"
  });
  const instructions = guidance.instructions.join(" ");
  assert.match(instructions, /tópico agregado.*Decomponha/iu);
  assert.match(instructions, /Conhecimentos já estabelecidos podem ser mobilizados livremente/iu);
  assert.match(instructions, /não palavras, altura, dificuldade ou carga cognitiva/iu);
  assert.match(instructions, /produtor declara.*servidor confere somente/iu);
});
