import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract,
  listAuthoringResourceContracts
} from "../../src/core/authoringResourceContract.js";
import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import { validateCard } from "../../src/domain/cards.js";
import { listSupportedResourceTypes } from "../../src/domain/resources.js";

test("catálogo autoral cobre exatamente os recursos aceitos pelo runtime", () => {
  const listed = listAuthoringResourceContracts();
  assert.equal(AUTHORING_RESOURCE_CONTRACT_VERSION, "aralearn.authoring-resources.v4");
  assert.deepEqual(
    listed.map((item) => item.resource),
    listSupportedResourceTypes()
  );
  listed.forEach((item) => {
    assert.ok(item.label);
    assert.ok(item.purpose);
    assert.ok(item.operations.length);
    assert.ok(item.exercises.length);
    assert.ok(item.selection.useWhen.length);
    assert.ok(item.selection.avoidWhen.length);
    assert.ok(item.selection.variationAxes.length);
  });
});

test("cada exemplo autoral de recurso compila e passa pelo contrato canônico", () => {
  listSupportedResourceTypes().forEach((resource) => {
    const contract = getAuthoringResourceContract(resource);
    assert.equal(contract.resource, resource);
    const source = structuredClone(contract.example);
    assert.ok(source.id, `${resource}: exemplo sem id`);
    assert.equal(source.position, 1, `${resource}: exemplo sem position`);
    assert.ok(source.after, `${resource}: exemplo sem after`);
    const card = Object.hasOwn(source, "gaps")
      ? compileAuthoringCardGaps(source)
      : source;
    const validation = validateCard(card, `$.${resource}`);
    assert.equal(validation.ok, true, `${resource}: ${JSON.stringify(validation.errors)}`);
  });
});

test("contrato detalhado descreve forma e alvo formal sem depender de instrução em prosa", () => {
  const table = getAuthoringResourceContract("table");
  assert.deepEqual(
    table.shape.commonRequired,
    ["id", "position", "resource", "kind", "exercise", "title", "after"]
  );
  assert.deepEqual(table.shape.required, ["columns", "rows"]);
  assert.ok(table.selection.useWhen.some((rule) => /linha e coluna/u.test(rule)));
  assert.equal(table.gapLanguage.marker, "{gap:id}");
  assert.match(table.gapLanguage.targetRule, /marcador identifica o alvo/u);
  assert.deepEqual(table.gapLanguage.definition.response, ["choice", "text"]);

  const flow = getAuthoringResourceContract("flow");
  assert.equal(flow.shape.variants.root.kind, "sequence");
  assert.deepEqual(
    flow.shape.variants.branch.if_then_else,
    ["id", "kind", "condition", "thenBranch", "elseBranch"]
  );
  assert.ok(flow.shape.variants.branch.for.includes("iterator"));
  assert.deepEqual(
    flow.shape.variants.switchCase,
    ["id", "match", "body", "practice"]
  );
  assert.deepEqual(
    flow.shape.variants.practice.textOrLabelEntry.option,
    ["id", "value", "enabled"]
  );
  assert.deepEqual(flow.gapTargets, [
    "structure.*.text",
    "structure.*.condition",
    "structure.*.cases[].condition"
  ]);
  assert.deepEqual(
    flow.structuredPracticeTargets.shape,
    {
      target: "structure.*.practice",
      response: "choice",
      fields: ["blankShape", "shapeOptions"],
      expectedValue: "derived_from_node_kind",
      rule: "blankShape deve ser true; shapeOptions declara somente alternativas de forma."
    }
  );
  assert.deepEqual(
    flow.structuredPracticeTargets.edgeLabel.labelKeys,
    ["yes", "no", "match", "default"]
  );
  assert.deepEqual(
    flow.structuredPracticeTargets.edgeLabel.response,
    ["choice", "text"]
  );
  const flowPracticeCard = {
    id: "card-flow-formal-practice",
    position: 1,
    resource: "flow",
    kind: "exercise",
    exercise: "gap",
    title: "Forma e rótulo",
    prompt: "Complete a representação.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [structuredClone(flow.formalPracticeExample)]
    },
    after: "A forma e os rótulos expressam a função de cada ramo."
  };
  assert.deepEqual(
    compileAuthoringCardGaps(flowPracticeCard),
    flowPracticeCard
  );
  assert.equal(
    validateCard(flowPracticeCard, "$.flowPractice").ok,
    true
  );

  const formula = getAuthoringResourceContract("formula");
  assert.ok(formula.shape.variants.expressionContainer.includes("fraction"));
  assert.deepEqual(
    formula.shape.variants.expressionShape.fraction,
    ["type", "numerator", "denominator"]
  );
  assert.deepEqual(
    formula.shape.variants.expressionShape.fenced,
    ["type", "open", "close", "content"]
  );
  assert.ok(formula.shape.rules.some((rule) => /AST/u.test(rule)));
});

test("espelho da Edge mantém o mesmo catálogo autoral", () => {
  const canonical = readFileSync(
    new URL("../../src/core/authoringResourceContract.js", import.meta.url),
    "utf8"
  );
  const edge = readFileSync(
    new URL(
      "../../supabase/functions/_shared/aralearn/runtime/core/authoringResourceContract.js",
      import.meta.url
    ),
    "utf8"
  );
  assert.equal(edge, canonical);
});
