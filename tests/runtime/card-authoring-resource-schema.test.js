import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  buildCardAssistanceAuthoringCardSchema,
  buildExactAuthoringBlockSchema,
  buildExactAuthoringCardFieldsSchema,
  buildExactAuthoringCardSchema,
  listCardRepresentationCandidates
} from "../../src/generation/engine/cardAuthoringSchema.js";
import {
  listCardMainResourceFieldNames,
  listCardResponseFieldNames
} from "../../src/assist/cardAssistanceScope.js";
import { toStrictJsonSchema } from "../../src/generation/providers/structuredOutput.js";
import {
  CARD_AFTER_BLOCKS_MAX_ITEMS,
  getAuthoringResourceContract,
  getCardResourceDefinition,
  listCompositeBlockTypes,
  listResourceIds
} from "../../src/resources/registry/index.js";

function ajv() {
  const instance = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(instance);
  return instance;
}

function assertConcreteStrictSchema(schema, label) {
  const definitions = schema?.$defs || {};
  const unsupported = new Set([
    "allOf",
    "else",
    "if",
    "not",
    "oneOf",
    "prefixItems",
    "then"
  ]);

  function visit(value, path, container = "") {
    assert.equal(
      Boolean(value) && typeof value === "object" && !Array.isArray(value),
      true,
      `${label}:${path}: nó inválido`
    );
    assert.equal(
      Object.keys(value).length > 0 || ["properties", "$defs"].includes(container),
      true,
      `${label}:${path}: schema vazio`
    );
    if (Object.hasOwn(value, "const")) {
      assert.equal(typeof value.type, "string", `${label}:${path}: const sem type`);
    }
    if (typeof value.$ref === "string") {
      const definition = value.$ref.match(/^#\/\$defs\/([^/]+)$/u)?.[1] || "";
      assert.equal(
        Boolean(definition) && Object.hasOwn(definitions, definition),
        true,
        `${label}:${path}: $ref não resolvido`
      );
    }
    if (value.type === "object") {
      assert.equal(
        Boolean(value.properties)
          && typeof value.properties === "object"
          && !Array.isArray(value.properties),
        true,
        `${label}:${path}: objeto sem properties`
      );
      assert.equal(
        value.additionalProperties,
        false,
        `${label}:${path}: objeto aberto`
      );
      assert.deepEqual(
        [...(value.required || [])].sort(),
        Object.keys(value.properties).sort(),
        `${label}:${path}: required não cobre properties`
      );
    }
    if (value.type === "array") {
      assert.equal(
        Boolean(value.items) && typeof value.items === "object",
        true,
        `${label}:${path}: array sem items`
      );
    }
    if (Array.isArray(value.required) && !value.properties && !value.$ref) {
      assert.fail(`${label}:${path}: required sem properties`);
    }
    Object.entries(value).forEach(([key, item]) => {
      assert.equal(unsupported.has(key), false, `${label}:${path}.${key}`);
      if (["required", "enum"].includes(key)) return;
      if (key === "properties" || key === "$defs") {
        Object.entries(item || {}).forEach(([name, child]) =>
          visit(child, `${path}.${key}.${name}`, key)
        );
        return;
      }
      if (Array.isArray(item)) {
        item.forEach((child, index) => {
          if (child && typeof child === "object") {
            visit(child, `${path}.${key}[${index}]`);
          }
        });
      } else if (item && typeof item === "object") {
        visit(item, `${path}.${key}`);
      }
    });
  }

  visit(schema, "$");
  assert.doesNotThrow(() => ajv().compile(schema), `${label}: Ajv`);
}

function strictResponseEnvelope(fieldName, fieldSchema) {
  return toStrictJsonSchema({
    type: "object",
    additionalProperties: false,
    required: [fieldName],
    properties: {
      [fieldName]: fieldSchema
    }
  });
}

const HIGH_REACH_BLOCKS = Object.freeze({
  chart: {
    id: "chart-1",
    kind: "chart",
    prompt: "Compare as medidas.",
    chartType: "scatter",
    xAxis: { label: "Tempo", unit: "s" },
    yAxis: { label: "Distância", unit: "m" },
    series: [{
      id: "serie-1",
      name: "Medições",
      values: [[0, 0], [1, 2]]
    }],
    highlight: { points: [["serie-1", 1]] },
    languageTag: "pt-BR",
    textDirection: "ltr"
  },
  sequence: {
    id: "sequence-1",
    kind: "sequence",
    prompt: "Acompanhe o ciclo.",
    variant: "cycle",
    items: [
      {
        id: "etapa-1",
        label: "Preparar",
        detail: "Organize os dados.",
        code: "prepare()",
        language: "javascript"
      },
      {
        id: "etapa-2",
        label: "Verificar",
        detail: "Confira o resultado.",
        code: "verify()",
        language: "javascript"
      }
    ],
    highlight: { itemIds: ["etapa-2"] },
    languageTag: "pt-BR",
    textDirection: "ltr"
  },
  annotated_text: {
    id: "annotated-1",
    kind: "annotated_text",
    prompt: "Interprete o trecho.",
    segments: [{ id: "trecho-1", text: "O dado sustenta a conclusão." }],
    annotations: [{
      id: "nota-1",
      targetIds: ["trecho-1"],
      label: "Evidência",
      note: "A afirmação remete ao dado observado."
    }],
    languageTag: "pt-BR",
    textDirection: "ltr"
  },
  linguistic_example: {
    id: "linguistic-1",
    kind: "linguistic_example",
    prompt: "Compare forma, leitura e tradução.",
    languageTag: "zh-Hans",
    textDirection: "ltr",
    writingMode: "horizontal",
    alignment: "word",
    units: [{
      id: "unidade-1",
      form: "学习",
      traditional: "學習",
      simplified: "学习",
      reading: "xuéxí",
      ipa: "ɕɥe˧˥ɕi˧˥",
      gloss: "estudar",
      translation: "aprender"
    }]
  },
  system_map: {
    id: "system-map-1",
    kind: "system_map",
    prompt: "Acompanhe a requisição.",
    groups: [{
      id: "zone-1",
      label: "Zona de aplicação",
      kind: "zone",
      parentId: null
    }],
    nodes: [{
      id: "client-1",
      label: "Cliente",
      kind: "client",
      groupId: null
    }, {
      id: "service-1",
      label: "Serviço",
      kind: "service",
      groupId: "zone-1"
    }],
    links: [{
      id: "request-1",
      from: "client-1",
      to: "service-1",
      label: "requisição",
      directed: true
    }],
    highlight: {
      groupIds: ["zone-1"],
      nodeIds: ["service-1"],
      linkIds: ["request-1"]
    },
    languageTag: "pt-BR",
    textDirection: "ltr"
  },
  reaction: {
    id: "reaction-1",
    kind: "reaction",
    prompt: "Interprete a transformação.",
    reactionType: "reversible",
    reactants: [{
      id: "reactant-1",
      formula: "A",
      name: "espécie A",
      coefficient: 1,
      state: "aq",
      charge: 0
    }],
    products: [{
      id: "product-1",
      formula: "B",
      name: "espécie B",
      coefficient: 1,
      state: "aq",
      charge: 0
    }],
    conditions: ["catalisador"],
    highlight: {
      speciesIds: ["reactant-1"]
    },
    languageTag: "pt-BR",
    textDirection: "ltr"
  }
});

test("blocos semânticos permanecem geráveis em schemas estritos", () => {
  Object.entries(HIGH_REACH_BLOCKS).forEach(([resource, value]) => {
    const sourceSchema = buildExactAuthoringBlockSchema(resource);
    const strictSchema = toStrictJsonSchema(sourceSchema);
    const validateSource = ajv().compile(sourceSchema);
    const validateStrict = ajv().compile(strictSchema);

    assert.equal(
      validateSource(value),
      true,
      `${resource}: ${JSON.stringify(validateSource.errors)}`
    );
    assert.equal(
      validateStrict(value),
      true,
      `${resource} strict: ${JSON.stringify(validateStrict.errors)}`
    );
  });
});

test("objetos aninhados dos blocos semânticos não são fechados vazios", () => {
  const expectedItemFields = {
    chart: ["id", "name", "values"],
    sequence: ["id", "label", "detail", "code", "language"],
    annotated_text: ["id", "text"],
    linguistic_example: [
      "id", "form", "traditional", "simplified", "reading", "ipa", "gloss", "translation"
    ],
    system_map: ["id", "label", "kind", "parentId"],
    reaction: ["id", "formula", "name", "coefficient", "state", "charge"]
  };
  const arrayField = {
    chart: "series",
    sequence: "items",
    annotated_text: "segments",
    linguistic_example: "units",
    system_map: "groups",
    reaction: "reactants"
  };

  Object.entries(expectedItemFields).forEach(([resource, fields]) => {
    const schema = buildExactAuthoringBlockSchema(resource);
    assert.deepEqual(
      Object.keys(schema.properties[arrayField[resource]].items.properties),
      fields
    );
  });
});

test("requiredAlternatives viram formas explícitas e campos obrigatórios em qualquer recurso", () => {
  const candidates = listCardRepresentationCandidates();
  for (const resource of ["matrix", "plane"]) {
    const contract = getAuthoringResourceContract(resource);
    const alternatives = contract.shape.requiredAlternatives;
    const example = {
      ...contract.example,
      id: `card-${resource}`,
      position: 1
    };
    const genericSchema = buildExactAuthoringCardSchema({
      id: example.id,
      position: example.position,
      resource,
      kind: example.kind,
      exercise: example.exercise
    });
    const validateGeneric = ajv().compile(genericSchema);
    const withoutAlternative = structuredClone(example);
    alternatives.flat().forEach((fieldName) => {
      delete withoutAlternative[fieldName];
    });

    assert.equal(validateGeneric(example), true, resource);
    assert.equal(validateGeneric(withoutAlternative), false, resource);
    assert.deepEqual(
      genericSchema.allOf[0].anyOf.map((branch) => branch.required),
      alternatives
    );

    for (const alternative of alternatives) {
      const candidateSuffix = `@${alternative.join("+")}`;
      assert.equal(
        candidates.some((candidate) =>
          candidate.resource === resource
          && candidate.id.endsWith(candidateSuffix)
          && candidate.requiredAlternative.join("+") === alternative.join("+")
        ),
        true,
        `${resource}:${candidateSuffix}`
      );
      const selectedSchema = buildExactAuthoringCardSchema({
        id: example.id,
        position: example.position,
        resource,
        kind: example.kind,
        exercise: example.exercise,
        requiredAlternative: alternative
      });
      assert.equal(
        alternative.every((fieldName) => selectedSchema.required.includes(fieldName)),
        true,
        `${resource}:${candidateSuffix}`
      );
    }
  }
});

test("schema exato da LLM preserva o teto canônico de afterBlocks", () => {
  listResourceIds().forEach((resource) => {
    const afterBlocks = getCardResourceDefinition(resource)
      .cardSchema.properties.afterBlocks;
    assert.equal(afterBlocks.minItems, 1, resource);
    assert.equal(afterBlocks.maxItems, CARD_AFTER_BLOCKS_MAX_ITEMS, resource);
  });

  const schema = buildExactAuthoringCardSchema({
    id: "card-composite",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none"
  });
  assert.equal(schema.properties.afterBlocks.minItems, 1);
  assert.equal(
    schema.properties.afterBlocks.maxItems,
    CARD_AFTER_BLOCKS_MAX_ITEMS
  );
  assert.equal(
    Array.isArray(schema.properties.afterBlocks.items.oneOf),
    true
  );
});

test("schema da construção atômica exclui envelopes preservados e exige a interação escolhida", () => {
  const planeGapSchema = buildCardAssistanceAuthoringCardSchema({
    id: "card-plane",
    position: 2,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    requiredAlternative: ["vector"]
  });
  for (const fieldName of [
    "afterBlocks",
    "sources",
    "topics",
    "languageTag",
    "textDirection",
    "question",
    "selectionMode",
    "selectionCriterion",
    "options",
    "answerIds"
  ]) {
    assert.equal(Object.hasOwn(planeGapSchema.properties, fieldName), false, fieldName);
  }
  assert.equal(planeGapSchema.required.includes("vector"), true);
  assert.equal(planeGapSchema.required.includes("result"), true);
  assert.equal(planeGapSchema.required.includes("gaps"), true);
  assert.equal(Object.hasOwn(planeGapSchema, "$defs"), false);

  const planeChoiceSchema = buildCardAssistanceAuthoringCardSchema({
    id: "card-plane",
    position: 2,
    resource: "plane",
    kind: "exercise",
    exercise: "choice",
    requiredAlternative: ["vector"]
  });
  for (const fieldName of [
    "question",
    "selectionMode",
    "selectionCriterion",
    "options",
    "answerIds"
  ]) {
    assert.equal(planeChoiceSchema.required.includes(fieldName), true, fieldName);
  }
  assert.equal(Object.hasOwn(planeChoiceSchema.properties, "gaps"), false);
});

test("toda fase autoral projeta schemas strict concretos em recursos, exercícios e blocos", () => {
  const candidates = listCardRepresentationCandidates();
  assert.equal(new Set(candidates.map((candidate) => candidate.id)).size, candidates.length);

  candidates.forEach((candidate) => {
    const schema = strictResponseEnvelope(
      "card",
      buildCardAssistanceAuthoringCardSchema({
        ...candidate,
        id: `card-${candidate.resource}`,
        position: 1
      })
    );
    assertConcreteStrictSchema(schema, `build:${candidate.id}`);
  });

  listResourceIds().forEach((resource) => {
    const example = {
      ...structuredClone(getAuthoringResourceContract(resource).example),
      id: `card-${resource}`,
      position: 1
    };
    const mainFields = listCardMainResourceFieldNames(example);
    assert.equal(mainFields.length > 0, true, `repair:${resource}:main`);
    assertConcreteStrictSchema(
      strictResponseEnvelope(
        "value",
        buildExactAuthoringCardFieldsSchema(example, mainFields)
      ),
      `repair:${resource}:main`
    );

    const choiceCard = {
      ...example,
      kind: "exercise",
      exercise: "choice"
    };
    const responseFields = listCardResponseFieldNames(choiceCard);
    if (responseFields.length) {
      assertConcreteStrictSchema(
        strictResponseEnvelope(
          "value",
          buildExactAuthoringCardFieldsSchema(choiceCard, responseFields)
        ),
        `repair:${resource}:response`
      );
    }
  });

  listCompositeBlockTypes().forEach((resource) => {
    assertConcreteStrictSchema(
      strictResponseEnvelope("value", buildExactAuthoringBlockSchema(resource)),
      `repair:block:${resource}`
    );
  });

  assertConcreteStrictSchema(
    strictResponseEnvelope("text", { type: "string", maxLength: 20000 }),
    "repair:after_text"
  );
});
