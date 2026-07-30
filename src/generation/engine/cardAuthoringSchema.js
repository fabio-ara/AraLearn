import {
  COMPOSITE_BLOCK_INPUT_SCHEMA,
  normalizeGeneratedCard,
  validateCard
} from "../../domain/cards.js";
import { compileAuthoringCardGaps } from "../../core/authoringGaps.js";
import {
  getAuthoringResourceContract,
  getCardResourceDefinition,
  listResourceDefinitions
} from "../../resources/registry/index.js";
import {
  normalizeJsonSchemaDocument
} from "../providers/structuredOutput.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function sameFieldList(left = [], right = []) {
  return left.length === right.length
    && left.every((fieldName, index) => fieldName === right[index]);
}

function requiredAlternativesForResource(resource) {
  const definition = getCardResourceDefinition(text(resource));
  const authoring = getAuthoringResourceContract(text(resource));
  const properties = definition?.authoringSchema?.properties || {};
  return (Array.isArray(authoring?.shape?.requiredAlternatives)
    ? authoring.shape.requiredAlternatives
    : [])
    .map((alternative) =>
      (Array.isArray(alternative) ? alternative : [])
        .map(text)
        .filter(Boolean)
    )
    .filter((alternative) =>
      alternative.length > 0
      && alternative.every((fieldName) => Object.hasOwn(properties, fieldName))
    );
}

function normalizeRequiredAlternative(resource, requiredAlternative = []) {
  const selected = (Array.isArray(requiredAlternative) ? requiredAlternative : [])
    .map(text)
    .filter(Boolean);
  if (!selected.length) return [];
  const canonical = requiredAlternativesForResource(resource)
    .find((alternative) => sameFieldList(alternative, selected));
  if (!canonical) {
    throw new Error(
      `Forma autoral inválida para ${text(resource) || "(vazio)"}: ${selected.join("+")}.`
    );
  }
  return clone(canonical);
}

function representationId(resource, kind, exercise, requiredAlternative = []) {
  const base = `${resource}:${kind}:${exercise}`;
  return requiredAlternative.length
    ? `${base}@${requiredAlternative.join("+")}`
    : base;
}

const GAP_DEFINITION_SCHEMA = Object.freeze(clone(
  getCardResourceDefinition("paragraph").authoringSchema.properties.gaps.items
));

function authoringGapsSchema() {
  return {
    type: "array",
    maxItems: 120,
    items: clone(GAP_DEFINITION_SCHEMA)
  };
}

const CARD_BUILD_PRESERVED_FIELDS = new Set([
  "afterBlocks",
  "sources",
  "topics",
  "languageTag",
  "textDirection"
]);

const CARD_BUILD_CHOICE_FIELDS = new Set([
  "question",
  "selectionMode",
  "selectionCriterion",
  "options",
  "answerIds"
]);

function reachableDefinitions(schema, definitions = {}) {
  const names = new Set();
  const pending = [];
  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      const name = value.$ref.match(/^#\/\$defs\/([^/]+)$/u)?.[1] || "";
      if (name && !names.has(name)) {
        names.add(name);
        pending.push(name);
      }
    }
    Object.entries(value).forEach(([key, item]) => {
      if (key !== "$defs") collect(item);
    });
  };
  collect(schema);
  while (pending.length) {
    const name = pending.shift();
    collect(definitions[name]);
  }
  return Object.fromEntries(
    [...names]
      .filter((name) => Object.hasOwn(definitions, name))
      .map((name) => [name, clone(definitions[name])])
  );
}

function withStructuredResourceSchemas(resource, properties = {}) {
  const next = clone(properties);
  if (next.afterBlocks) {
    next.afterBlocks = {
      ...next.afterBlocks,
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  if (resource === "composite") {
    next.blocks = {
      type: "array",
      minItems: getCardResourceDefinition("composite").semanticLimits.minBlocks,
      maxItems: getCardResourceDefinition("composite").semanticLimits.maxBlocks,
      items: clone(COMPOSITE_BLOCK_INPUT_SCHEMA)
    };
  }
  return next;
}

export function buildExactAuthoringCardSchema({
  id,
  position,
  resource,
  kind,
  exercise,
  requiredAlternative = []
} = {}) {
  const definition = getCardResourceDefinition(text(resource));
  if (!definition) {
    throw new Error(`Recurso ausente no registro canônico: ${text(resource) || "(vazio)"}.`);
  }
  const alternatives = requiredAlternativesForResource(definition.id);
  const selectedAlternative = normalizeRequiredAlternative(
    definition.id,
    requiredAlternative
  );
  const source = clone(definition.authoringSchema);
  const properties = withStructuredResourceSchemas(definition.id, source.properties || {});
  properties.id = { const: text(id) };
  properties.position = { const: Number(position) };
  properties.resource = { const: definition.id };
  properties.kind = { const: text(kind) };
  properties.exercise = { const: text(exercise) };
  if (text(exercise) === "gap") {
    properties.gaps = authoringGapsSchema();
  } else {
    delete properties.gaps;
  }
  const required = new Set([
    ...(source.required || []),
    "id",
    "position",
    "resource",
    "kind",
    "exercise",
    ...selectedAlternative,
    ...(text(exercise) === "gap" ? ["gaps"] : [])
  ]);
  return normalizeJsonSchemaDocument({
    type: "object",
    additionalProperties: false,
    required: [...required],
    properties,
    ...(!selectedAlternative.length && alternatives.length
      ? {
          allOf: [
            {
              anyOf: alternatives.map((alternative) => ({
                required: clone(alternative)
              }))
            },
            ...clone(source.allOf || [])
          ]
        }
      : source.allOf
        ? { allOf: clone(source.allOf) }
        : {}),
    ...(source.$defs ? { $defs: clone(source.$defs) } : {})
  });
}

export function buildCardAssistanceAuthoringCardSchema(plan = {}) {
  const fullSchema = buildExactAuthoringCardSchema(plan);
  const definition = getCardResourceDefinition(text(plan.resource));
  const required = new Set(fullSchema.required || []);
  const exercise = text(plan.exercise);
  if (exercise === "choice") {
    CARD_BUILD_CHOICE_FIELDS.forEach((fieldName) => {
      if (Object.hasOwn(fullSchema.properties || {}, fieldName)) required.add(fieldName);
    });
  }
  if (exercise === "gap") {
    (definition?.gapTargets || []).forEach((targetPath) => {
      const topLevelField = text(targetPath).split(".")[0];
      if (Object.hasOwn(fullSchema.properties || {}, topLevelField)) {
        required.add(topLevelField);
      }
    });
  }
  const properties = Object.fromEntries(
    Object.entries(fullSchema.properties || {})
      .filter(([fieldName]) => (
        !CARD_BUILD_PRESERVED_FIELDS.has(fieldName) || required.has(fieldName)
      ))
      .filter(([fieldName]) => (
        !CARD_BUILD_CHOICE_FIELDS.has(fieldName) || exercise === "choice"
      ))
      .map(([fieldName, fieldSchema]) => [fieldName, clone(fieldSchema)])
  );
  const compactSchema = {
    type: "object",
    additionalProperties: false,
    required: [...required].filter((fieldName) => Object.hasOwn(properties, fieldName)),
    properties,
    ...(fullSchema.allOf ? { allOf: clone(fullSchema.allOf) } : {})
  };
  const definitions = reachableDefinitions(compactSchema, fullSchema.$defs || {});
  return normalizeJsonSchemaDocument({
    ...compactSchema,
    ...(Object.keys(definitions).length ? { $defs: definitions } : {})
  });
}

export function buildExactAuthoringBlockSchema(resource) {
  const normalized = text(resource);
  const branch = (COMPOSITE_BLOCK_INPUT_SCHEMA.oneOf || []).find(
    (candidate) => candidate?.properties?.kind?.const === normalized
  );
  if (!branch) {
    throw new Error(`Bloco ausente no registro canônico: ${normalized || "(vazio)"}.`);
  }
  const definitions = reachableDefinitions(
    branch,
    COMPOSITE_BLOCK_INPUT_SCHEMA.$defs || {}
  );
  return normalizeJsonSchemaDocument({
    ...clone(branch),
    ...(Object.keys(definitions).length
      ? { $defs: definitions }
      : {})
  });
}

export function buildExactAuthoringCardFieldsSchema(card = {}, fieldNames = []) {
  const requiredAlternative = requiredAlternativesForResource(card.resource)
    .find((alternative) =>
      alternative.every((fieldName) =>
        card?.[fieldName] !== null && card?.[fieldName] !== undefined
      )
    ) || [];
  const fullSchema = buildExactAuthoringCardSchema({
    id: card.id,
    position: card.position,
    resource: card.resource,
    kind: card.kind,
    exercise: card.exercise,
    requiredAlternative
  });
  const allowedFields = new Set(fieldNames.map(text).filter(Boolean));
  const properties = Object.fromEntries(
    Object.entries(fullSchema.properties || {})
      .filter(([fieldName]) => allowedFields.has(fieldName))
      .map(([fieldName, fieldSchema]) => [fieldName, clone(fieldSchema)])
  );
  if (!Object.keys(properties).length) {
    throw new Error(`O recurso ${text(card.resource) || "(vazio)"} não possui campos reparáveis.`);
  }
  const structuralSchema = {
    type: "object",
    additionalProperties: false,
    required: (fullSchema.required || []).filter((fieldName) =>
      Object.hasOwn(properties, fieldName)
    ),
    properties
  };
  const definitions = reachableDefinitions(
    structuralSchema,
    fullSchema.$defs || {}
  );
  return normalizeJsonSchemaDocument({
    ...structuralSchema,
    ...(Object.keys(definitions).length ? { $defs: definitions } : {})
  });
}

export function listCardRepresentationCandidates() {
  return listResourceDefinitions().flatMap((definition) => {
    const alternatives = requiredAlternativesForResource(definition.id);
    const authoringShapes = alternatives.length ? alternatives : [[]];
    return (definition.interactionCapabilities?.exercises || []).flatMap((exercise) => {
      const kind = exercise === "none" ? "theory" : "exercise";
      return authoringShapes.map((requiredAlternative) => ({
        id: representationId(definition.id, kind, exercise, requiredAlternative),
        resource: definition.id,
        kind,
        exercise,
        requiredAlternative: clone(requiredAlternative)
      }));
    });
  });
}

export function buildCardRepresentationCatalog() {
  return listResourceDefinitions().map((definition) => {
    const authoring = getAuthoringResourceContract(definition.id) || {};
    const selection = authoring.selection || {};
    return {
      id: definition.id,
      label: definition.label,
      purpose: text(authoring.purpose || definition.shortDescription),
      useWhen: clone(selection.useWhen || []).slice(0, 3),
      avoidWhen: clone(selection.avoidWhen || []).slice(0, 2),
      exercises: clone(definition.interactionCapabilities?.exercises || []),
      requiredAlternatives: clone(authoring.shape?.requiredAlternatives || []),
      semanticLimits: clone(definition.semanticLimits || {})
    };
  });
}

export function parseCardRepresentation(value, candidates = listCardRepresentationCandidates()) {
  const selected = text(value?.representation);
  const candidate = candidates.find((item) => item.id === selected);
  if (!candidate) {
    throw new Error("O provider escolheu uma representação fora do registro autorizado.");
  }
  return clone(candidate);
}

export function compileAndValidateAuthoringCard(value, path = "$.card") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A resposta não contém um card estruturado.");
  }
  const authoringCard = clone(value);
  if (Array.isArray(authoringCard.gaps) && authoringCard.gaps.length === 0) {
    delete authoringCard.gaps;
  }
  const compiled = Object.hasOwn(authoringCard, "gaps")
    ? compileAuthoringCardGaps(authoringCard, path)
    : authoringCard;
  const normalized = normalizeGeneratedCard(compiled, path);
  const validation = validateCard(normalized, path);
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new Error(
      `O card produzido é inválido${issue?.path ? ` em ${issue.path}` : ""}${issue?.message ? `: ${issue.message}` : "."}`
    );
  }
  return normalized;
}

export const cardAuthoringSchemas = Object.freeze({
  gapDefinition: GAP_DEFINITION_SCHEMA
});
