import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract,
  listAuthoringResourceContracts
} from "../../src/core/authoringResourceContract.js";
import {
  getCardResourceDefinition,
  listCompositeBlockTypes
} from "../../src/resources/registry/index.js";
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
    assert.deepEqual(
      contract.authoringSchema,
      getCardResourceDefinition(resource).authoringSchema,
      `${resource}: schema autoral divergiu do registro canônico`
    );
    const source = structuredClone(contract.example);
    assert.ok(source.id, `${resource}: exemplo sem id`);
    assert.equal(source.position, 1, `${resource}: exemplo sem position`);
    assert.ok(source.after, `${resource}: exemplo sem after`);
    const validateAuthoring = new Ajv2020({
      allErrors: true,
      strict: true,
      strictRequired: false,
      allowUnionTypes: true
    }).compile(contract.authoringSchema);
    assert.equal(
      validateAuthoring(source),
      true,
      `${resource}: ${JSON.stringify(validateAuthoring.errors)}`
    );
    const card = Object.hasOwn(source, "gaps")
      ? compileAuthoringCardGaps(source)
      : source;
    const validation = validateCard(card, `$.${resource}`);
    assert.equal(validation.ok, true, `${resource}: ${JSON.stringify(validation.errors)}`);
  });
});

test("composite deriva schema e metadados da mesma enumeração canônica", () => {
  const blockTypes = listCompositeBlockTypes();
  const contract = getAuthoringResourceContract("composite");
  const schemaTypes = contract.authoringSchema
    .properties.blocks.items.properties.kind.enum;
  assert.deepEqual(schemaTypes, blockTypes);
  assert.deepEqual(contract.shape.variants.block, blockTypes);
  assert.deepEqual(
    blockTypes,
    ["heading", ...listSupportedResourceTypes().filter((resource) => resource !== "composite")]
  );
});

test("contrato detalhado expõe integralmente os schemas aninhados dos recursos", () => {
  const tree = getAuthoringResourceContract("tree").authoringSchema;
  assert.deepEqual(tree.properties.variant.enum, [
    "filesystem",
    "hierarchy",
    "taxonomy",
    "phylogeny",
    "syntax",
    "organization"
  ]);

  const chartSeries = getAuthoringResourceContract("chart")
    .authoringSchema.properties.series.items;
  assert.deepEqual(chartSeries.required, ["id", "name", "values"]);
  assert.deepEqual(
    Object.keys(chartSeries.properties),
    ["id", "name", "values"]
  );
  assert.equal(chartSeries.properties.values.items.prefixItems.length, 2);

  const sequenceItem = getAuthoringResourceContract("sequence")
    .authoringSchema.properties.items.items;
  assert.deepEqual(sequenceItem.required, ["id", "label"]);
  assert.deepEqual(
    Object.keys(sequenceItem.properties),
    ["id", "label", "detail", "code", "language"]
  );

  const annotated = getAuthoringResourceContract("annotated_text").authoringSchema;
  assert.deepEqual(
    Object.keys(annotated.properties.segments.items.properties),
    ["id", "text"]
  );
  assert.deepEqual(
    Object.keys(annotated.properties.annotations.items.properties),
    ["id", "targetIds", "label", "note"]
  );

  const linguisticUnit = getAuthoringResourceContract("linguistic_example")
    .authoringSchema.properties.units.items;
  assert.deepEqual(linguisticUnit.required, ["id", "form", "translation"]);
  assert.deepEqual(
    Object.keys(linguisticUnit.properties),
    [
      "id",
      "form",
      "traditional",
      "simplified",
      "reading",
      "ipa",
      "gloss",
      "translation"
    ]
  );
});

test("schema autoral fecha identidade, campos extras e coerência kind/exercise", () => {
  const contract = getAuthoringResourceContract("paragraph");
  const validate = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  }).compile(contract.authoringSchema);

  const invalid = {
    ...structuredClone(contract.example),
    kind: "theory",
    exercise: "gap",
    campoInventado: true
  };
  assert.equal(validate(invalid), false);
  assert.ok(validate.errors.some((error) => error.keyword === "additionalProperties"));
  assert.ok(validate.errors.some((error) => ["const", "if"].includes(error.keyword)));
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
