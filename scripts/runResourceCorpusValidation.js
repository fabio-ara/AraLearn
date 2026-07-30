import path from "node:path";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { validateCard } from "../src/domain/cards.js";
import {
  buildExactAuthoringCardSchema,
  compileAndValidateAuthoringCard
} from "../src/generation/engine/cardAuthoringSchema.js";
import {
  normalizeJsonSchemaDocument,
  toStrictJsonSchema
} from "../src/generation/providers/structuredOutput.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../src/resources/registry/index.js";

export const CHART_VARIANTS = Object.freeze([
  "bar",
  "line",
  "scatter",
  "histogram",
  "boxplot"
]);

export const SEQUENCE_VARIANTS = Object.freeze([
  "ordered_steps",
  "timeline",
  "lifecycle",
  "cycle",
  "code_blocks"
]);

export const HIGH_REACH_RESOURCES = Object.freeze([
  "chart",
  "sequence",
  "annotated_text",
  "linguistic_example"
]);

export const SPECIALIZED_RESOURCES = Object.freeze([
  "system_map",
  "reaction"
]);

export const SYSTEM_MAP_GROUP_KINDS = Object.freeze([
  "region",
  "zone",
  "network",
  "cluster",
  "namespace",
  "container",
  "stage",
  "boundary"
]);

export const SYSTEM_MAP_NODE_KINDS = Object.freeze([
  "client",
  "service",
  "database",
  "queue",
  "storage",
  "gateway",
  "worker",
  "external"
]);

export const REACTION_TYPES = Object.freeze([
  "forward",
  "reversible",
  "equilibrium"
]);

const LINGUISTIC_CASES = Object.freeze([
  Object.freeze({
    id: "horizontal-ltr",
    languageTag: "zh-Hans",
    textDirection: "ltr",
    writingMode: "horizontal",
    alignment: "word",
    form: "你好",
    reading: "nǐ hǎo",
    gloss: "você bom",
    translation: "olá"
  }),
  Object.freeze({
    id: "vertical-auto",
    languageTag: "ja",
    textDirection: "auto",
    writingMode: "vertical",
    alignment: "word",
    form: "学ぶ",
    reading: "manabu",
    gloss: "aprender",
    translation: "aprender"
  }),
  Object.freeze({
    id: "horizontal-rtl",
    languageTag: "ar",
    textDirection: "rtl",
    writingMode: "horizontal",
    alignment: "morpheme",
    form: "كتاب",
    reading: "kitāb",
    gloss: "livro",
    translation: "livro"
  }),
  Object.freeze({
    id: "vertical-rtl",
    languageTag: "ar",
    textDirection: "rtl",
    writingMode: "vertical",
    alignment: "morpheme",
    form: "علم",
    reading: "ʿilm",
    gloss: "conhecimento",
    translation: "conhecimento"
  })
]);

function clone(value) {
  return structuredClone(value);
}

function strictAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  return ajv;
}

function resolveLocalReference(rootSchema, reference) {
  if (!/^#\//u.test(reference)) {
    throw new Error(`Referência externa não permitida no harness: ${reference}.`);
  }
  return reference
    .slice(2)
    .split("/")
    .map((token) => token.replace(/~1/gu, "/").replace(/~0/gu, "~"))
    .reduce((value, token) => value?.[token], rootSchema);
}

function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (!type) return true;
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number";
  return typeof value === type;
}

function unionBranchScore(schema, value, rootSchema) {
  const resolved = schema?.$ref
    ? resolveLocalReference(rootSchema, schema.$ref)
    : schema;
  if (!resolved || !typeMatches(resolved.type, value)) return Number.NEGATIVE_INFINITY;
  if (Object.hasOwn(resolved, "const") && resolved.const !== value) {
    return Number.NEGATIVE_INFINITY;
  }
  if (Array.isArray(resolved.enum) && !resolved.enum.includes(value)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return 1;
  let score = 1;
  Object.entries(resolved.properties || {}).forEach(([fieldName, fieldSchema]) => {
    if (!Object.hasOwn(value, fieldName)) return;
    score += 2;
    if (Object.hasOwn(fieldSchema, "const")) {
      score += fieldSchema.const === value[fieldName] ? 20 : -100;
    }
    if (Array.isArray(fieldSchema.enum)) {
      score += fieldSchema.enum.includes(value[fieldName]) ? 10 : -100;
    }
  });
  Object.keys(value).forEach((fieldName) => {
    if (!Object.hasOwn(resolved.properties || {}, fieldName)) score -= 4;
  });
  return score;
}

export function materializeStrictValue(schema, value, rootSchema = schema) {
  if (schema?.$ref) {
    return materializeStrictValue(
      resolveLocalReference(rootSchema, schema.$ref),
      value,
      rootSchema
    );
  }
  if (Array.isArray(schema?.anyOf)) {
    const nullBranch = schema.anyOf.find((branch) => branch?.type === "null");
    if (value === undefined && nullBranch) return null;
    const candidates = schema.anyOf.filter((branch) => branch !== nullBranch);
    const selected = candidates
      .map((branch) => ({
        branch,
        score: unionBranchScore(branch, value, rootSchema)
      }))
      .sort((left, right) => right.score - left.score)[0]?.branch;
    return materializeStrictValue(selected, value, rootSchema);
  }
  if (
    schema?.type === "object" ||
    (schema?.properties && typeof schema.properties === "object")
  ) {
    const source = value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
    return Object.fromEntries(
      Object.entries(schema.properties || {}).map(([fieldName, fieldSchema]) => [
        fieldName,
        materializeStrictValue(
          fieldSchema,
          Object.hasOwn(source, fieldName) ? source[fieldName] : undefined,
          rootSchema
        )
      ])
    );
  }
  if (schema?.type === "array" && Array.isArray(value)) {
    return value.map((item) => materializeStrictValue(schema.items, item, rootSchema));
  }
  return value;
}

function validationMessage(validate) {
  return JSON.stringify(validate.errors || []);
}

export function assertProviderStrictValue(schema, value, label = "schema") {
  const normalizedSchema = normalizeJsonSchemaDocument(schema);
  let originalValidate;
  try {
    originalValidate = strictAjv().compile(normalizedSchema);
  } catch (error) {
    throw new Error(
      `${label}: contrato de origem não compilou: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  if (!originalValidate(value)) {
    throw new Error(
      `${label}: valor fora do contrato de origem: ${validationMessage(originalValidate)}`
    );
  }
  const providerSchema = toStrictJsonSchema(normalizedSchema);
  let strictValidate;
  try {
    strictValidate = strictAjv().compile(providerSchema);
  } catch (error) {
    throw new Error(
      `${label}: projeção strict não compilou: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error }
    );
  }
  const strictValue = materializeStrictValue(providerSchema, value);
  if (!strictValidate(strictValue)) {
    throw new Error(
      `${label}: valor fora da projeção strict: ${validationMessage(strictValidate)}`
    );
  }
  return {
    providerSchema,
    strictValue
  };
}

function chartValues(chartType) {
  if (chartType === "scatter") return [[0, 2], [1, 4], [3, 7]];
  if (chartType === "histogram") return [[1, 2], [2, 5], [3, 3]];
  if (chartType === "boxplot") {
    return [["Grupo A", 2], ["Grupo A", 4], ["Grupo A", 6], ["Grupo A", 8]];
  }
  return [["Jan", 2], ["Fev", 4], ["Mar", 7]];
}

function chartCase(chartType, position) {
  const values = chartValues(chartType);
  return {
    id: `high-reach-chart-${chartType}`,
    group: "high-reach-chart-variants",
    resource: "chart",
    variant: chartType,
    card: {
      id: `card-chart-${chartType}`,
      position,
      resource: "chart",
      kind: "theory",
      exercise: "none",
      title: `Gráfico ${chartType}`,
      prompt: `Interprete o gráfico do tipo ${chartType}.`,
      chartType,
      xAxis: { label: chartType === "scatter" ? "Tempo" : "Categoria" },
      yAxis: { label: "Valor", unit: "u" },
      series: [{
        id: "series-a",
        name: "Série A",
        values
      }],
      highlight: { points: [["series-a", values.at(-1)[0]]] },
      after: ""
    }
  };
}

function sequenceItems(variant) {
  if (variant === "code_blocks") {
    return [
      {
        id: "read",
        label: "Ler entrada",
        detail: "Obter o valor inicial.",
        code: "const value = input;",
        language: "javascript"
      },
      {
        id: "transform",
        label: "Transformar",
        detail: "Aplicar uma operação pura.",
        code: "const result = transform(value);",
        language: "javascript"
      }
    ];
  }
  return [
    { id: "first", label: "Primeira etapa", detail: "Preparar." },
    { id: "second", label: "Segunda etapa", detail: "Executar." },
    { id: "third", label: "Terceira etapa", detail: "Verificar." }
  ];
}

function sequenceCase(variant, position) {
  const items = sequenceItems(variant);
  return {
    id: `high-reach-sequence-${variant}`,
    group: "high-reach-sequence-variants",
    resource: "sequence",
    variant,
    card: {
      id: `card-sequence-${variant}`,
      position,
      resource: "sequence",
      kind: "theory",
      exercise: "none",
      title: `Sequência ${variant}`,
      prompt: `Acompanhe a sequência do tipo ${variant}.`,
      variant,
      items,
      highlight: { itemIds: [items[1].id] },
      after: ""
    }
  };
}

function annotatedTextCase(position) {
  return {
    id: "high-reach-annotated-text",
    group: "high-reach-resource",
    resource: "annotated_text",
    card: {
      id: "card-annotated-text",
      position,
      resource: "annotated_text",
      kind: "theory",
      exercise: "none",
      title: "Obrigação jurídica",
      prompt: "Relacione o trecho à anotação.",
      segments: [
        { id: "segment-a", text: "O controlador deverá comunicar o incidente." },
        { id: "segment-b", text: "A comunicação deve ocorrer em prazo razoável." }
      ],
      annotations: [{
        id: "annotation-a",
        targetIds: ["segment-a"],
        label: "dever jurídico",
        note: "A forma verbal estabelece obrigação."
      }],
      after: ""
    }
  };
}

function linguisticCase(configuration, position) {
  return {
    id: `high-reach-linguistic-${configuration.id}`,
    group: "high-reach-linguistic-matrix",
    resource: "linguistic_example",
    writingMode: configuration.writingMode,
    textDirection: configuration.textDirection,
    card: {
      id: `card-linguistic-${configuration.id}`,
      position,
      resource: "linguistic_example",
      kind: "theory",
      exercise: "none",
      title: `Exemplo linguístico ${configuration.id}`,
      prompt: "Compare forma, leitura, glosa e tradução.",
      languageTag: configuration.languageTag,
      textDirection: configuration.textDirection,
      writingMode: configuration.writingMode,
      alignment: configuration.alignment,
      units: [{
        id: "unit-a",
        form: configuration.form,
        reading: configuration.reading,
        gloss: configuration.gloss,
        translation: configuration.translation
      }],
      after: ""
    }
  };
}

function systemMapCase(groupKind, nodeKind, position) {
  return {
    id: `specialized-system-map-${groupKind}`,
    group: "specialized-system-map-kinds",
    resource: "system_map",
    groupKind,
    nodeKind,
    card: {
      id: `card-system-map-${groupKind}`,
      position,
      resource: "system_map",
      kind: "theory",
      exercise: "none",
      title: `Limite ${groupKind}`,
      prompt: "Localize o componente destacado dentro do limite semântico.",
      groups: [{
        id: `group-${groupKind}`,
        label: `Grupo ${groupKind}`,
        kind: groupKind,
        parentId: null
      }],
      nodes: [{
        id: `component-${nodeKind}`,
        label: `Componente ${nodeKind}`,
        kind: nodeKind,
        groupId: `group-${groupKind}`
      }, {
        id: "outside-component",
        label: "Componente externo",
        kind: "external",
        groupId: null
      }],
      links: [{
        id: `link-${groupKind}`,
        from: "outside-component",
        to: `component-${nodeKind}`,
        label: "conexão",
        directed: true
      }],
      highlight: {
        groupIds: [`group-${groupKind}`],
        nodeIds: [`component-${nodeKind}`],
        linkIds: [`link-${groupKind}`]
      },
      after: ""
    }
  };
}

function reactionData(reactionType) {
  if (reactionType === "reversible") {
    return {
      title: "Decomposição reversível do carbonato",
      reactants: [{
        id: "calcium-carbonate",
        formula: "CaCO3",
        name: "carbonato de cálcio",
        coefficient: 1,
        state: "s"
      }],
      products: [{
        id: "calcium-oxide",
        formula: "CaO",
        name: "óxido de cálcio",
        coefficient: 1,
        state: "s"
      }, {
        id: "carbon-dioxide",
        formula: "CO2",
        name: "dióxido de carbono",
        coefficient: 1,
        state: "g"
      }],
      conditions: ["aquecimento"],
      highlight: { speciesIds: ["carbon-dioxide"] }
    };
  }
  if (reactionType === "equilibrium") {
    return {
      title: "Ionização do ácido acético",
      reactants: [{
        id: "acetic-acid",
        formula: "CH3COOH",
        name: "ácido acético",
        coefficient: 1,
        state: "aq"
      }],
      products: [{
        id: "hydrogen-ion",
        formula: "H",
        name: "íon hidrogênio",
        coefficient: 1,
        state: "aq",
        charge: 1
      }, {
        id: "acetate-ion",
        formula: "CH3COO",
        name: "íon acetato",
        coefficient: 1,
        state: "aq",
        charge: -1
      }],
      conditions: [],
      highlight: { speciesIds: ["hydrogen-ion", "acetate-ion"] }
    };
  }
  return {
    title: "Formação de água",
    reactants: [{
      id: "hydrogen",
      formula: "H2",
      name: "hidrogênio",
      coefficient: 2,
      state: "g"
    }, {
      id: "oxygen",
      formula: "O2",
      name: "oxigênio",
      coefficient: 1,
      state: "g"
    }],
    products: [{
      id: "water",
      formula: "H2O",
      name: "água",
      coefficient: 2,
      state: "l"
    }],
    conditions: ["ignição"],
    highlight: { speciesIds: ["water"] }
  };
}

function reactionCase(reactionType, position) {
  const reaction = reactionData(reactionType);
  return {
    id: `specialized-reaction-${reactionType}`,
    group: "specialized-reaction-types",
    resource: "reaction",
    reactionType,
    card: {
      id: `card-reaction-${reactionType}`,
      position,
      resource: "reaction",
      kind: "theory",
      exercise: "none",
      title: reaction.title,
      prompt: "Interprete espécies, estados, coeficientes e direção da reação.",
      reactionType,
      reactants: reaction.reactants,
      products: reaction.products,
      conditions: reaction.conditions,
      highlight: reaction.highlight,
      after: ""
    }
  };
}

export function buildHighReachValidationCases() {
  let position = 1;
  return [
    ...CHART_VARIANTS.map((variant) => chartCase(variant, position++)),
    ...SEQUENCE_VARIANTS.map((variant) => sequenceCase(variant, position++)),
    annotatedTextCase(position++),
    ...LINGUISTIC_CASES.map((configuration) =>
      linguisticCase(configuration, position++)
    )
  ];
}

export function buildSpecializedValidationCases() {
  let position = 1;
  return [
    ...SYSTEM_MAP_GROUP_KINDS.map((groupKind, index) =>
      systemMapCase(groupKind, SYSTEM_MAP_NODE_KINDS[index], position++)
    ),
    ...REACTION_TYPES.map((reactionType) =>
      reactionCase(reactionType, position++)
    )
  ];
}

export function buildCanonicalResourceCases() {
  return listResourceIds().map((resource, index) => {
    const contract = getAuthoringResourceContract(resource);
    if (!contract?.example) {
      throw new Error(`Recurso ${resource} não possui exemplo autoral canônico.`);
    }
    return {
      id: `canonical-${resource}`,
      group: "canonical-resource-example",
      resource,
      card: {
        ...clone(contract.example),
        id: `canonical-card-${resource}`,
        position: index + 1
      }
    };
  });
}

export function buildResourceValidationCases() {
  return [
    ...buildCanonicalResourceCases(),
    ...buildHighReachValidationCases(),
    ...buildSpecializedValidationCases()
  ];
}

function validateCorpusCase(scenario) {
  const schema = buildExactAuthoringCardSchema({
    id: scenario.card.id,
    position: scenario.card.position,
    resource: scenario.card.resource,
    kind: scenario.card.kind,
    exercise: scenario.card.exercise
  });
  assertProviderStrictValue(schema, scenario.card, scenario.id);
  const compiled = compileAndValidateAuthoringCard(
    scenario.card,
    `$.resourceCorpus.${scenario.id}`
  );
  const validation = validateCard(compiled, `$.resourceCorpus.${scenario.id}`);
  if (!validation.ok) {
    throw new Error(JSON.stringify(validation.errors || []));
  }
  return {
    id: scenario.id,
    group: scenario.group,
    resource: scenario.resource,
    ...(scenario.variant ? { variant: scenario.variant } : {}),
    ...(scenario.writingMode ? { writingMode: scenario.writingMode } : {}),
    ...(scenario.textDirection ? { textDirection: scenario.textDirection } : {}),
    ...(scenario.groupKind ? { groupKind: scenario.groupKind } : {}),
    ...(scenario.nodeKind ? { nodeKind: scenario.nodeKind } : {}),
    ...(scenario.reactionType ? { reactionType: scenario.reactionType } : {}),
    ok: true
  };
}

function validatedValues(results, fieldName, group) {
  return [...new Set(
    results
      .filter((result) => result.ok && result.group === group)
      .map((result) => result[fieldName])
      .filter(Boolean)
  )];
}

export function runResourceCorpusValidation() {
  const scenarios = buildResourceValidationCases();
  const results = scenarios.map((scenario) => {
    try {
      return validateCorpusCase(scenario);
    } catch (error) {
      return {
        id: scenario.id,
        group: scenario.group,
        resource: scenario.resource,
        ...(scenario.variant ? { variant: scenario.variant } : {}),
        ...(scenario.writingMode ? { writingMode: scenario.writingMode } : {}),
        ...(scenario.textDirection ? { textDirection: scenario.textDirection } : {}),
        ...(scenario.groupKind ? { groupKind: scenario.groupKind } : {}),
        ...(scenario.nodeKind ? { nodeKind: scenario.nodeKind } : {}),
        ...(scenario.reactionType ? { reactionType: scenario.reactionType } : {}),
        ok: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  });
  const canonicalExpected = listResourceIds();
  const canonicalValidated = results
    .filter((result) => result.ok && result.group === "canonical-resource-example")
    .map((result) => result.resource);
  const passed = results.filter((result) => result.ok).length;

  return {
    contract: "aralearn.resource-corpus-validation.v2",
    source:
      "registro canônico de resources e matrizes explícitas de alto alcance e especialização",
    ok: passed === results.length,
    totals: {
      cases: results.length,
      passed,
      failed: results.length - passed
    },
    coverage: {
      canonicalResources: {
        expected: canonicalExpected,
        validated: canonicalValidated
      },
      specializedResources: {
        expected: [...SPECIALIZED_RESOURCES],
        validated: [...new Set(
          results
            .filter((result) =>
              result.ok && result.group.startsWith("specialized-"))
            .map((result) => result.resource)
        )]
      },
      systemMapGroupKinds: {
        expected: [...SYSTEM_MAP_GROUP_KINDS],
        validated: validatedValues(
          results,
          "groupKind",
          "specialized-system-map-kinds"
        )
      },
      systemMapNodeKinds: {
        expected: [...SYSTEM_MAP_NODE_KINDS],
        validated: validatedValues(
          results,
          "nodeKind",
          "specialized-system-map-kinds"
        )
      },
      reactionTypes: {
        expected: [...REACTION_TYPES],
        validated: validatedValues(
          results,
          "reactionType",
          "specialized-reaction-types"
        )
      },
      chartVariants: {
        expected: [...CHART_VARIANTS],
        validated: validatedValues(
          results,
          "variant",
          "high-reach-chart-variants"
        )
      },
      sequenceVariants: {
        expected: [...SEQUENCE_VARIANTS],
        validated: validatedValues(
          results,
          "variant",
          "high-reach-sequence-variants"
        )
      },
      linguisticWritingModes: {
        expected: ["horizontal", "vertical"],
        validated: validatedValues(
          results,
          "writingMode",
          "high-reach-linguistic-matrix"
        )
      },
      linguisticTextDirections: {
        expected: ["auto", "ltr", "rtl"],
        validated: validatedValues(
          results,
          "textDirection",
          "high-reach-linguistic-matrix"
        )
      }
    },
    cases: results
  };
}

export function main() {
  const report = runResourceCorpusValidation();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return report;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (entryPoint === import.meta.url) main();
