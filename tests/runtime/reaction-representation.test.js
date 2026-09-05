import assert from "node:assert/strict";
import test from "node:test";

import { reactionPackage } from "../../src/resources/packages/reaction/index.js";
import { renderPackageStudyUnitBlocks } from "../../src/render/renderPackageStudyUnit.js";

const data = { ...structuredClone(reactionPackage.authoringContract.example), conditions: ["ignição"] };

test("condição da reação tem um alvo de resposta e continua editável", () => {
  const studyUnit = {
    id: "reaction-condition", position: 1, title: "Condição da reação", role: "practice",
    content: [{ id: "reaction", package: reactionPackage.manifest.id, version: "1.0.0", data }],
    response: {
      id: "condition-answer", package: "aralearn.response.gap", version: "1.0.0",
      data: { blanks: [{ id: "condition", targetInstanceId: "reaction", targetPath: "conditions[0]", responseMode: "choice", answer: "ignição", distractors: ["resfriamento"] }] }
    },
    feedback: [], topics: []
  };
  const html = renderPackageStudyUnitBlocks(studyUnit);
  assert.equal([...html.matchAll(/class="runtime-text-gap-blank\b/gu)].length, 1);
  assert.doesNotMatch(html, /package-reaction-conditions/u);
  assert.ok(reactionPackage.editableTargets(data).some(({ path }) => path === "conditions[0]"));
  assert.ok(reactionPackage.practiceTargets(data).some(({ path }) => path === "conditions[0]"));
});

test("alternativa acessível preserva condição, tipo da seta e carga declarada", () => {
  assert.match(reactionPackage.accessibleText(data), /produz.+Condições: ignição\./u);
  assert.match(reactionPackage.accessibleText({ ...data, reactionType: "equilibrium" }), /está em equilíbrio com/u);
  assert.match(reactionPackage.accessibleText({ ...data, reactionType: "reversible" }), /transforma-se reversivelmente em/u);
  assert.match(reactionPackage.accessibleText({
    reactionType: "forward",
    reactants: [{ id: "silver", name: "íon prata", formula: "Ag", charge: 1 }, { id: "electron", name: "elétron", formula: "e", charge: -1 }],
    products: [{ id: "metal", name: "prata", formula: "Ag" }]
  }), /carga 1/u);
  assert.doesNotMatch(reactionPackage.accessibleText(reactionPackage.authoringContract.example), /Condições:/u);
});
