import {
  INSTRUCTIONAL_DESIGN_CONTRACTS
} from "./instructionalDesignContracts.js";

export const INSTRUCTIONAL_DESIGN_RECORD_KINDS = Object.freeze([
  "instructionalAnalysis",
  "designParameterDefinition",
  "designParameterAssignment",
  "effectiveDesignSnapshot",
  "materializationManifest",
  "resourceSet"
]);

const FORBIDDEN_PERSISTENT_FIELDS = new Set([
  "chainofthought",
  "chainofthoughts",
  "cot",
  "internalmonologue",
  "reasoning",
  "reasoningcontent",
  "reasoningtrace",
  "hiddenreasoning",
  "privatereasoning",
  "prompt",
  "prompts",
  "rawprompt",
  "systemprompt",
  "developerprompt",
  "userprompt",
  "rawrequest",
  "rawresponse",
  "completion",
  "conversation",
  "messages",
  "chatmessages",
  "conversationmessages"
]);

function normalizedFieldName(value) {
  return String(value || "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]/gu, "");
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scalarFingerprint(value) {
  if (value === null) return "null";
  return `${typeof value}:${JSON.stringify(value)}`;
}

function stableFingerprint(value) {
  if (Array.isArray(value)) return `[${value.map(stableFingerprint).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableFingerprint(value[key])}`
    )).join(",")}}`;
  }
  return scalarFingerprint(value);
}

function deepEqual(left, right) {
  return stableFingerprint(left) === stableFingerprint(right);
}

function pushError(errors, path, message, code = "invalid_contract") {
  errors.push({ path, message, code });
}

function resolveLocalRef(rootSchema, reference) {
  if (typeof reference !== "string" || !reference.startsWith("#/")) return null;
  return reference.slice(2).split("/").reduce((current, segment) => {
    const key = segment.replace(/~1/gu, "/").replace(/~0/gu, "~");
    return current && Object.hasOwn(current, key) ? current[key] : null;
  }, rootSchema);
}

function hasType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validationErrors(schema, value, path, rootSchema) {
  const errors = [];
  validateSchemaNode(schema, value, path, rootSchema, errors);
  return errors;
}

function validateSchemaNode(schema, value, path, rootSchema, errors) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    const referenced = resolveLocalRef(rootSchema, schema.$ref);
    if (!referenced) pushError(errors, path, `Referência de schema indisponível: ${schema.$ref}.`);
    else validateSchemaNode(referenced, value, path, rootSchema, errors);
    return;
  }
  if (Object.hasOwn(schema, "const") && !deepEqual(value, schema.const)) {
    pushError(errors, path, `Valor esperado: ${JSON.stringify(schema.const)}.`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => deepEqual(entry, value))) {
    pushError(errors, path, `Valor fora da enumeração: ${JSON.stringify(value)}.`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => (
      validationErrors(candidate, value, path, rootSchema).length === 0
    ));
    if (matches.length !== 1) {
      pushError(errors, path, "Valor não corresponde exatamente a uma alternativa do contrato.");
    }
    return;
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((candidate) => validateSchemaNode(candidate, value, path, rootSchema, errors));
  }
  if (schema.not && validationErrors(schema.not, value, path, rootSchema).length === 0) {
    pushError(errors, path, "Valor proibido pelo contrato.");
  }
  if (schema.if) {
    const branch = validationErrors(schema.if, value, path, rootSchema).length === 0
      ? schema.then
      : schema.else;
    if (branch) validateSchemaNode(branch, value, path, rootSchema, errors);
  }
  if (schema.type && !hasType(value, schema.type)) {
    pushError(errors, path, `Tipo esperado: ${schema.type}.`);
    return;
  }
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      pushError(errors, path, `Texto precisa ter ao menos ${schema.minLength} caractere(s).`);
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      pushError(errors, path, `Texto não corresponde ao padrão ${schema.pattern}.`);
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      pushError(errors, path, `Valor precisa ser maior ou igual a ${schema.minimum}.`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      pushError(errors, path, `Valor precisa ser menor ou igual a ${schema.maximum}.`);
    }
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      pushError(errors, path, `Lista precisa ter ao menos ${schema.minItems} item(ns).`);
    }
    if (schema.uniqueItems) {
      const fingerprints = value.map(stableFingerprint);
      if (new Set(fingerprints).size !== fingerprints.length) {
        pushError(errors, path, "Lista precisa conter itens únicos.");
      }
    }
    if (schema.items) {
      value.forEach((entry, index) => {
        validateSchemaNode(schema.items, entry, `${path}[${index}]`, rootSchema, errors);
      });
    }
  }
  if (isPlainObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    required.forEach((key) => {
      if (!Object.hasOwn(value, key)) pushError(errors, `${path}.${key}`, "Campo obrigatório ausente.");
    });
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      Object.keys(value).filter((key) => !Object.hasOwn(properties, key)).forEach((key) => {
        pushError(errors, `${path}.${key}`, "Campo desconhecido.");
      });
    }
    Object.entries(properties).forEach(([key, propertySchema]) => {
      if (Object.hasOwn(value, key)) {
        validateSchemaNode(propertySchema, value[key], `${path}.${key}`, rootSchema, errors);
      }
    });
  }
}

function scanForbiddenFields(value, path, errors, seen) {
  if (value === undefined || typeof value === "function" || typeof value === "bigint" || typeof value === "symbol") {
    pushError(errors, path, "Valor não serializável em JSON.", "non_json_value");
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    pushError(errors, path, "Número precisa ser finito.", "non_json_value");
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) {
    pushError(errors, path, "Referência circular não pode ser persistida.", "non_json_value");
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbiddenFields(entry, `${path}[${index}]`, errors, seen));
    seen.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    pushError(errors, path, "Somente objetos JSON simples podem ser persistidos.", "non_json_value");
    seen.delete(value);
    return;
  }
  Object.entries(value).forEach(([key, entry]) => {
    if (FORBIDDEN_PERSISTENT_FIELDS.has(normalizedFieldName(key))) {
      pushError(
        errors,
        `${path}.${key}`,
        "Prompt, mensagens ou raciocínio privado não podem integrar o estado persistente.",
        "forbidden_persistent_field"
      );
    }
    scanForbiddenFields(entry, `${path}.${key}`, errors, seen);
  });
  seen.delete(value);
}

function requireUniqueSemanticKeys(errors, entries, keyForEntry, path) {
  if (!Array.isArray(entries)) return;
  const seen = new Set();
  entries.forEach((entry, index) => {
    const key = keyForEntry(entry);
    if (typeof key !== "string" || !key) return;
    if (seen.has(key)) {
      pushError(
        errors,
        `${path}[${index}]`,
        `Referência semântica duplicada: ${key}.`,
        "duplicate_semantic_key"
      );
    }
    seen.add(key);
  });
}

function validateSemanticUniqueness(kind, raw, errors) {
  if (kind === "designParameterDefinition" && raw?.constraints?.setItemPattern) {
    try {
      new RegExp(raw.constraints.setItemPattern, "u");
    } catch {
      pushError(
        errors,
        "$.constraints.setItemPattern",
        "A expressão regular do conjunto é inválida.",
        "invalid_parameter_set_pattern"
      );
    }
  }
  if (kind === "instructionalAnalysis") {
    [
      "units",
      "relations",
      "coordinationRequirements",
      "explanationRequirements",
      "evidenceRequirements",
      "fidelityRequirements",
      "practiceVariationRequirements",
      "representationRequirements"
    ].forEach((key) => requireUniqueSemanticKeys(errors, raw?.[key], (entry) => entry?.id, `$.${key}`));
  }
  if (kind === "effectiveDesignSnapshot") {
    requireUniqueSemanticKeys(errors, raw?.resolvedValues, (entry) => (
      stableFingerprint([entry?.definitionRef?.id || "", entry?.definitionRef?.version || ""])
    ), "$.resolvedValues");
    (Array.isArray(raw?.resolvedValues) ? raw.resolvedValues : []).forEach((entry, index) => {
      if (entry?.value?.kind === "vector") {
        requireUniqueSemanticKeys(
          errors,
          entry.value.components,
          (component) => component?.dimension,
          `$.resolvedValues[${index}].value.components`
        );
      }
      if (entry?.value?.kind === "relation") {
        validateRelationValue(errors, entry.value, `$.resolvedValues[${index}].value`);
      }
    });
  }
  if (kind === "designParameterAssignment" && raw?.value?.kind === "vector") {
    requireUniqueSemanticKeys(
      errors,
      raw.value.components,
      (component) => component?.dimension,
      "$.value.components"
    );
  }
  if (kind === "designParameterAssignment" && raw?.value?.kind === "relation") {
    validateRelationValue(errors, raw.value, "$.value");
  }
  if (kind === "materializationManifest") {
    [
      ["plannedSteps", "stepRef"],
      ["materializedSteps", "stepRef"],
      ["explanationCoverage", "requirementRef"],
      ["evidenceCoverage", "requirementRef"],
      ["practiceOpportunities", "id"],
      ["resourceSelections", "id"],
      ["materializedResources", "id"],
      ["derivedMetrics", "id"]
    ].forEach(([listKey, semanticKey]) => requireUniqueSemanticKeys(
      errors,
      raw?.[listKey],
      (entry) => entry?.[semanticKey],
      `$.${listKey}`
    ));
  }
  if (kind === "resourceSet") {
    requireUniqueSemanticKeys(errors, raw?.packages, (entry) => (
      stableFingerprint([entry?.packageId || "", entry?.version || ""])
    ), "$.packages");
  }
}

function validateRelationValue(errors, value, path) {
  const nodes = new Set(Array.isArray(value?.nodes) ? value.nodes : []);
  requireUniqueSemanticKeys(
    errors,
    value?.edges,
    (edge) => stableFingerprint([edge?.from, edge?.to, edge?.kind]),
    `${path}.edges`
  );
  (Array.isArray(value?.edges) ? value.edges : []).forEach((edge, index) => {
    if (!nodes.has(edge?.from) || !nodes.has(edge?.to)) {
      pushError(
        errors,
        `${path}.edges[${index}]`,
        "A relação referencia endpoint ausente de nodes.",
        "invalid_parameter_relation_endpoint"
      );
    }
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => (
    scalarFingerprint(left).localeCompare(scalarFingerprint(right), "en")
  ));
}

function canonicalizeParameterValue(value) {
  if (!isPlainObject(value)) return value;
  if (value.kind === "set") value.values = sortedUnique(value.values || []);
  if (value.kind === "relation") {
    value.nodes = sortedUnique(value.nodes || []);
    value.edges = [...(value.edges || [])].sort((left, right) => (
      stableFingerprint([left.from, left.to, left.kind]).localeCompare(
        stableFingerprint([right.from, right.to, right.kind]),
        "en"
      )
    ));
  }
  if (value.kind === "vector") {
    value.components = [...(value.components || [])].sort((left, right) => (
      String(left.dimension).localeCompare(String(right.dimension), "en")
    ));
  }
  return value;
}

function canonicalize(kind, raw) {
  const value = structuredClone(raw);
  if (kind === "designParameterAssignment") canonicalizeParameterValue(value.value);
  if (kind === "effectiveDesignSnapshot") {
    value.resolvedValues.forEach((entry) => canonicalizeParameterValue(entry.value));
    value.resolvedValues.sort((left, right) => (
      stableFingerprint([left.definitionRef.id, left.definitionRef.version]).localeCompare(
        stableFingerprint([right.definitionRef.id, right.definitionRef.version]),
        "en"
      )
    ));
    value.resourceSetRefs.sort((left, right) => (
      stableFingerprint([left.id, left.version]).localeCompare(
        stableFingerprint([right.id, right.version]),
        "en"
      )
    ));
  }
  if (kind === "resourceSet") {
    value.packages.sort((left, right) => (
      stableFingerprint([left.packageId, left.version]).localeCompare(
        stableFingerprint([right.packageId, right.version]),
        "en"
      )
    ));
    [
      "families",
      "disciplines",
      "structures",
      "taskOperations",
      "practiceModalities"
    ].forEach((key) => {
      value.facetBasis[key] = sortedUnique(value.facetBasis[key]);
    });
    value.selectionConstraints.allowedFits = sortedUnique(
      value.selectionConstraints.allowedFits
    );
  }
  if (kind === "materializationManifest") {
    value.resourceSetRefs.sort((left, right) => (
      stableFingerprint([left.id, left.version]).localeCompare(
        stableFingerprint([right.id, right.version]),
        "en"
      )
    ));
  }
  return value;
}

export function deepFreezeInstructionalDesignValue(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.values(value).forEach((entry) => deepFreezeInstructionalDesignValue(entry, seen));
  return Object.freeze(value);
}

export class InstructionalDesignValidationError extends Error {
  constructor(kind, errors) {
    super(`Contrato ${kind} inválido: ${errors.map(({ path, message }) => `${path} ${message}`).join(" ")}`);
    this.name = "InstructionalDesignValidationError";
    this.code = "INVALID_INSTRUCTIONAL_DESIGN_CONTRACT";
    this.kind = kind;
    this.errors = errors;
  }
}

export function validatePromotedInstructionalDesignContract(kind, raw) {
  if (!INSTRUCTIONAL_DESIGN_RECORD_KINDS.includes(kind)) {
    return {
      ok: false,
      errors: [{
        path: "$",
        message: `Tipo de contrato desconhecido: ${kind}.`,
        code: "unknown_contract_kind"
      }]
    };
  }
  const errors = [];
  scanForbiddenFields(raw, "$", errors, new WeakSet());
  validateSchemaNode(
    INSTRUCTIONAL_DESIGN_CONTRACTS[kind],
    raw,
    "$",
    INSTRUCTIONAL_DESIGN_CONTRACTS[kind],
    errors
  );
  validateSemanticUniqueness(kind, raw, errors);
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function validateInstructionalDesignPersistenceSafety(raw) {
  const errors = [];
  scanForbiddenFields(raw, "$", errors, new WeakSet());
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function assertInstructionalDesignPersistenceSafety(raw) {
  const result = validateInstructionalDesignPersistenceSafety(raw);
  if (!result.ok) throw new InstructionalDesignValidationError("persistentState", result.errors);
  return true;
}

export function normalizePromotedInstructionalDesignContract(kind, raw, { freeze = false } = {}) {
  const result = validatePromotedInstructionalDesignContract(kind, raw);
  if (!result.ok) throw new InstructionalDesignValidationError(kind, result.errors);
  const normalized = canonicalize(kind, raw);
  return freeze ? deepFreezeInstructionalDesignValue(normalized) : normalized;
}

export function normalizeInstructionalAnalysis(raw) {
  return normalizePromotedInstructionalDesignContract("instructionalAnalysis", raw);
}

export function normalizeDesignParameterDefinition(raw) {
  return normalizePromotedInstructionalDesignContract("designParameterDefinition", raw, {
    freeze: true
  });
}

export function normalizeDesignParameterAssignment(raw) {
  return normalizePromotedInstructionalDesignContract("designParameterAssignment", raw, {
    freeze: true
  });
}

export function normalizeEffectiveDesignSnapshot(raw) {
  return normalizePromotedInstructionalDesignContract("effectiveDesignSnapshot", raw, {
    freeze: true
  });
}

export function normalizeMaterializationManifest(raw) {
  return normalizePromotedInstructionalDesignContract("materializationManifest", raw, {
    freeze: true
  });
}

export function normalizeResourceSet(raw) {
  return normalizePromotedInstructionalDesignContract("resourceSet", raw, {
    freeze: true
  });
}
