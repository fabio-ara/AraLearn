export class ProviderCapabilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderCapabilityError";
    this.category = "provider_capability";
  }
}

export class ProviderStructuredOutputError extends Error {
  constructor(message, category = "invalid_structured_output") {
    super(message);
    this.name = "ProviderStructuredOutputError";
    this.category = category;
  }
}

const RECONSTRUCTIBLE_OUTPUT_CATEGORIES = new Set([
  "empty_structured_output",
  "invalid_structured_json",
  "invalid_structured_output",
  "malformed_structured_output"
]);

export function isReconstructibleStructuredOutputError(error) {
  return RECONSTRUCTIBLE_OUTPUT_CATEGORIES.has(String(error?.category || ""));
}

export function parseStructuredJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new ProviderStructuredOutputError(
      "O provider não devolveu conteúdo estruturado.",
      "empty_structured_output"
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderStructuredOutputError(
      "O provider devolveu JSON inválido.",
      "invalid_structured_json"
    );
  }
}

export function structuredResult(value, usage = {}, raw = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderStructuredOutputError("A saída estruturada precisa ser um objeto JSON.");
  }
  return {
    value: structuredClone(value),
    usage: structuredClone(usage || {}),
    raw
  };
}

function nullableSchema(schema) {
  if (
    Array.isArray(schema?.type)
    && schema.type.includes("null")
  ) {
    return schema;
  }
  return {
    anyOf: [
      schema,
      { type: "null" }
    ]
  };
}

function definitionName(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]+/gu, "_")
    .replace(/^_+|_+$/gu, "") || "definition";
}

function rewriteLocalDefinitionReference(reference, scope) {
  if (typeof reference !== "string" || !reference.startsWith("#/$defs/")) {
    return reference;
  }
  const [rawName, ...tail] = reference.slice("#/$defs/".length).split("/");
  const resolvedName = scope.get(rawName);
  if (!resolvedName) return reference;
  return `#/$defs/${resolvedName}${tail.length ? `/${tail.join("/")}` : ""}`;
}

/**
 * Produz um único documento JSON Schema autocontido.
 *
 * Schemas canônicos de recursos são incorporados em cards, blocos e uniões de
 * reparo. Seus `$ref` locais pertencem ao schema incorporado, mas um fragmento
 * `#/$defs/...` sempre aponta para a raiz do documento final. Este passe move
 * cada grupo aninhado de definições para a raiz, dá nomes determinísticos aos
 * grupos incorporados e reescreve os fragmentos antes do envio ao provider.
 */
export function normalizeJsonSchemaDocument(sourceSchema) {
  const source = structuredClone(sourceSchema);
  const hoistedDefinitions = {};
  const usedNames = new Set();
  let embeddedGroupIndex = 0;

  function allocateDefinitionName(rawName, isRootGroup) {
    const baseName = isRootGroup
      ? definitionName(rawName)
      : `embedded_${embeddedGroupIndex}_${definitionName(rawName)}`;
    let candidate = baseName;
    let suffix = 2;
    while (usedNames.has(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
  }

  function visit(value, inheritedScope = new Map(), isRoot = false) {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item, inheritedScope, false));
    }
    if (!value || typeof value !== "object") {
      return structuredClone(value);
    }

    const localDefinitions = value.$defs && typeof value.$defs === "object"
      ? value.$defs
      : null;
    const scope = new Map(inheritedScope);
    let definitionEntries = [];
    if (localDefinitions) {
      if (!isRoot) embeddedGroupIndex += 1;
      definitionEntries = Object.entries(localDefinitions).map(([rawName, definition]) => {
        const normalizedName = allocateDefinitionName(rawName, isRoot);
        scope.set(rawName, normalizedName);
        return [normalizedName, definition];
      });
    }

    const normalized = {};
    Object.entries(value).forEach(([key, item]) => {
      if (key === "$id" || key === "$schema" || key === "$defs") return;
      normalized[key] = key === "$ref"
        ? rewriteLocalDefinitionReference(item, scope)
        : visit(item, scope, false);
    });

    definitionEntries.forEach(([normalizedName, definition]) => {
      hoistedDefinitions[normalizedName] = visit(definition, scope, false);
    });
    return normalized;
  }

  const normalizedRoot = visit(source, new Map(), true);
  return Object.keys(hoistedDefinitions).length
    ? { ...normalizedRoot, $defs: hoistedDefinitions }
    : normalizedRoot;
}

function projectProviderRecursiveSchemas(sourceSchema) {
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return structuredClone(value);
    if (
      value.$id === "urn:aralearn:schema:flowchart-structure:v1"
      && value.$defs?.node?.oneOf?.[0]
    ) {
      return visit({
        ...structuredClone(value.$defs.node.oneOf[0]),
        $defs: structuredClone(value.$defs),
        description: value.description
      });
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, visit(item)])
    );
  }
  return visit(sourceSchema);
}

function inferEnumType(values) {
  if (!Array.isArray(values) || !values.length) return "";
  if (values.every((value) => typeof value === "string")) return "string";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => value === null)) return "null";
  if (values.every((value) => typeof value === "number")) {
    return values.every(Number.isInteger) ? "integer" : "number";
  }
  return "";
}

function inferConstType(value) {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "array";
  if (value && typeof value === "object") return "object";
  return "";
}

function hasProviderShape(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  if (
    typeof schema.$ref === "string"
    || typeof schema.type === "string"
    || Array.isArray(schema.type)
    || Object.hasOwn(schema, "const")
    || Array.isArray(schema.enum)
    || schema.properties && typeof schema.properties === "object"
    || schema.items && typeof schema.items === "object"
  ) {
    return true;
  }
  return ["anyOf", "oneOf"].some((keyword) =>
    Array.isArray(schema[keyword]) && schema[keyword].some(hasProviderShape)
  );
}

function localDefinitionName(reference) {
  return typeof reference === "string"
    ? reference.match(/^#\/\$defs\/([^/]+)$/u)?.[1] || ""
    : "";
}

/**
 * `allOf` não pertence ao subconjunto de Structured Outputs. A maior parte dos
 * usos canônicos apenas acrescenta coerência que será revalidada localmente.
 * O caso que precisa preservar forma é `$ref + objeto` (a raiz limitada de
 * flow). Nesse caso a interseção estrutural é materializada antes da projeção.
 */
function projectProviderAllOfSchemas(sourceDocument) {
  const rootDefinitions = sourceDocument?.$defs || {};

  function dereferenceShape(schema, activeReferences) {
    const referenceName = localDefinitionName(schema?.$ref);
    if (
      !referenceName
      || activeReferences.has(referenceName)
      || !Object.hasOwn(rootDefinitions, referenceName)
    ) {
      return schema;
    }
    return visit(
      rootDefinitions[referenceName],
      new Set([...activeReferences, referenceName])
    );
  }

  function mergeShape(leftSource, rightSource, activeReferences) {
    if (
      typeof leftSource?.$ref === "string"
      && leftSource.$ref === rightSource?.$ref
      && Object.keys(leftSource).length === 1
      && Object.keys(rightSource).length === 1
    ) {
      return structuredClone(leftSource);
    }
    let left = dereferenceShape(leftSource, activeReferences);
    let right = dereferenceShape(rightSource, activeReferences);
    if (!hasProviderShape(left)) return structuredClone(right);
    if (!hasProviderShape(right)) return structuredClone(left);

    const leftUnion = Array.isArray(left.anyOf)
      ? left.anyOf
      : Array.isArray(left.oneOf)
        ? left.oneOf
        : null;
    const rightUnion = Array.isArray(right.anyOf)
      ? right.anyOf
      : Array.isArray(right.oneOf)
        ? right.oneOf
        : null;
    if (leftUnion) {
      return {
        anyOf: leftUnion
          .map((branch) => mergeShape(branch, right, activeReferences))
          .filter(hasProviderShape)
      };
    }
    if (rightUnion) {
      return {
        anyOf: rightUnion
          .map((branch) => mergeShape(left, branch, activeReferences))
          .filter(hasProviderShape)
      };
    }

    const merged = {
      ...structuredClone(left),
      ...structuredClone(right)
    };
    if (
      left.properties && typeof left.properties === "object"
      || right.properties && typeof right.properties === "object"
    ) {
      const leftProperties = left.properties || {};
      const rightProperties = right.properties || {};
      merged.type = "object";
      merged.properties = Object.fromEntries(
        [...new Set([
          ...Object.keys(leftProperties),
          ...Object.keys(rightProperties)
        ])].map((fieldName) => {
          if (!Object.hasOwn(leftProperties, fieldName)) {
            return [fieldName, structuredClone(rightProperties[fieldName])];
          }
          if (!Object.hasOwn(rightProperties, fieldName)) {
            return [fieldName, structuredClone(leftProperties[fieldName])];
          }
          return [
            fieldName,
            mergeShape(
              leftProperties[fieldName],
              rightProperties[fieldName],
              activeReferences
            )
          ];
        })
      );
      merged.required = [...new Set([
        ...(Array.isArray(left.required) ? left.required : []),
        ...(Array.isArray(right.required) ? right.required : [])
      ])];
      merged.additionalProperties =
        left.additionalProperties === false || right.additionalProperties === false
          ? false
          : left.additionalProperties ?? right.additionalProperties;
    } else if (left.type === "array" && right.type === "array") {
      merged.type = "array";
      if (left.items && right.items) {
        merged.items = mergeShape(left.items, right.items, activeReferences);
      }
      if (Number.isFinite(left.minItems) || Number.isFinite(right.minItems)) {
        merged.minItems = Math.max(
          Number.isFinite(left.minItems) ? left.minItems : 0,
          Number.isFinite(right.minItems) ? right.minItems : 0
        );
      }
      if (Number.isFinite(left.maxItems) || Number.isFinite(right.maxItems)) {
        merged.maxItems = Math.min(
          Number.isFinite(left.maxItems) ? left.maxItems : Number.POSITIVE_INFINITY,
          Number.isFinite(right.maxItems) ? right.maxItems : Number.POSITIVE_INFINITY
        );
      }
    }
    delete merged.allOf;
    return merged;
  }

  function visit(value, activeReferences = new Set()) {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item, activeReferences));
    }
    if (!value || typeof value !== "object") {
      return structuredClone(value);
    }
    const base = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "allOf")
        .map(([key, item]) => [key, visit(item, activeReferences)])
    );
    if (!Array.isArray(value.allOf) || !value.allOf.length) return base;

    // Um objeto já autocontido pode descartar apenas as regras de coerência;
    // o schema canônico continua sendo aplicado à resposta do provider.
    if (hasProviderShape(base)) return base;

    const branches = value.allOf
      .map((branch) => visit(branch, activeReferences))
      .filter(hasProviderShape);
    if (!branches.length) {
      throw new ProviderCapabilityError(
        "O schema usa allOf sem uma forma estrutural projetável."
      );
    }
    const merged = branches
      .slice(1)
      .reduce(
        (current, branch) => mergeShape(current, branch, activeReferences),
        branches[0]
      );
    return {
      ...merged,
      ...Object.fromEntries(
        Object.entries(base).filter(([key]) => ["$defs", "description", "title"].includes(key))
      )
    };
  }

  return visit(sourceDocument);
}

function unconstrainedProviderScalarSchema() {
  return {
    anyOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" },
      { type: "null" }
    ]
  };
}

function isAlwaysInvalidSchema(value) {
  return value === false
    || Boolean(
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && value.not
      && typeof value.not === "object"
      && !Array.isArray(value.not)
      && Object.keys(value.not).length === 0
    );
}

function assertStrictProviderSchema(schema) {
  const definitions = schema?.$defs || {};

  function visit(value, path, container = "") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ProviderCapabilityError(`Schema strict inválido em ${path}.`);
    }
    const keys = Object.keys(value);
    if (!keys.length && !["properties", "$defs"].includes(container)) {
      throw new ProviderCapabilityError(`Schema strict estruturalmente vazio em ${path}.`);
    }
    if (Object.hasOwn(value, "const") && typeof value.type !== "string") {
      throw new ProviderCapabilityError(`Schema strict com const sem type em ${path}.`);
    }
    if (
      Array.isArray(value.enum)
      && typeof value.type !== "string"
      && !Array.isArray(value.type)
    ) {
      throw new ProviderCapabilityError(`Schema strict com enum sem type em ${path}.`);
    }
    if (typeof value.$ref === "string") {
      const name = localDefinitionName(value.$ref);
      if (!name || !Object.hasOwn(definitions, name)) {
        throw new ProviderCapabilityError(
          `Schema strict contém referência não resolvida em ${path}: ${value.$ref}.`
        );
      }
    }
    if (value.type === "object") {
      if (
        !value.properties
        || typeof value.properties !== "object"
        || Array.isArray(value.properties)
      ) {
        throw new ProviderCapabilityError(
          `Objeto strict sem properties explícitas em ${path}.`
        );
      }
      const propertyNames = Object.keys(value.properties);
      if (
        value.additionalProperties !== false
        || !Array.isArray(value.required)
        || value.required.length !== propertyNames.length
        || propertyNames.some((fieldName) => !value.required.includes(fieldName))
      ) {
        throw new ProviderCapabilityError(
          `Objeto strict não fecha ou não exige todas as propriedades em ${path}.`
        );
      }
    }
    if (value.type === "array" && (!value.items || typeof value.items !== "object")) {
      throw new ProviderCapabilityError(`Array strict sem items em ${path}.`);
    }
    if (Array.isArray(value.required) && !value.properties && !value.$ref) {
      throw new ProviderCapabilityError(
        `Schema strict contém required sem properties em ${path}.`
      );
    }
    if (Array.isArray(value.anyOf) && !value.anyOf.length) {
      throw new ProviderCapabilityError(`Schema strict contém anyOf vazio em ${path}.`);
    }
    Object.entries(value).forEach(([key, item]) => {
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
        return;
      }
      if (item && typeof item === "object") {
        visit(item, `${path}.${key}`);
      }
    });
  }

  visit(schema, "$");
  return schema;
}

const OPENAI_SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$defs",
  "$ref",
  "additionalProperties",
  "anyOf",
  "const",
  "description",
  "enum",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "items",
  "maximum",
  "maxItems",
  "minimum",
  "minItems",
  "multipleOf",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "title",
  "type"
]);

export function toStrictJsonSchema(sourceSchema) {
  const normalizedDocument = projectProviderAllOfSchemas(
    normalizeJsonSchemaDocument(
      projectProviderRecursiveSchemas(sourceSchema)
    )
  );

  function visit(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return structuredClone(source);
    }
    if (
      source.type === "object"
      && !source.properties
      && (Array.isArray(source.anyOf) || Array.isArray(source.oneOf))
    ) {
      return visit({
        anyOf: structuredClone(source.anyOf || source.oneOf)
      });
    }
    if (!Object.keys(source).length) {
      return unconstrainedProviderScalarSchema();
    }
    const next = Object.fromEntries(
      Object.entries(source)
        .filter(([key, value]) =>
          OPENAI_SUPPORTED_SCHEMA_KEYWORDS.has(key) &&
          !(key === "items" && typeof value === "boolean") &&
          !(
            ["anyOf", "oneOf"].includes(key)
            && hasProviderShape(source)
            && value.every((branch) => !hasProviderShape(branch))
          )
        )
        .map(([key, value]) => {
        if (key === "properties" || key === "$defs") return [key, value];
        if (key === "items") return [key, visit(value)];
        if (["anyOf", "oneOf"].includes(key)) {
          return [key === "oneOf" ? "anyOf" : key, value.map(visit)];
        }
        return [key, structuredClone(value)];
      })
    );
    if (Array.isArray(source.prefixItems) && source.prefixItems.length) {
      const tupleBranches = source.prefixItems.map((item) => visit(item));
      next.items = tupleBranches.length === 1
        ? tupleBranches[0]
        : { anyOf: tupleBranches };
      if (source.items === false && !Number.isFinite(next.maxItems)) {
        next.maxItems = source.prefixItems.length;
      }
    } else if (source.items === false && !Number.isFinite(next.maxItems)) {
      next.maxItems = 0;
    }
    if (
      source.type === "array"
      && isAlwaysInvalidSchema(source.items)
      && !Array.isArray(source.prefixItems)
    ) {
      next.maxItems = 0;
    }
    if (Array.isArray(next.enum) && !next.type) {
      const inferredType = inferEnumType(next.enum);
      if (inferredType) next.type = inferredType;
    }
    if (Object.hasOwn(next, "const") && !next.type) {
      const inferredType = inferConstType(next.const);
      if (inferredType) next.type = inferredType;
    }
    if (source.properties && typeof source.properties === "object") {
      const originalRequired = new Set(source.required || []);
      next.type = "object";
      next.properties = Object.fromEntries(
        Object.entries(source.properties).map(([key, value]) => {
          const strictValue = visit(value);
          return [key, originalRequired.has(key) ? strictValue : nullableSchema(strictValue)];
        })
      );
      next.required = Object.keys(source.properties);
      next.additionalProperties = false;
    } else if (source.type === "object") {
      next.properties = {};
      next.required = [];
      next.additionalProperties = false;
    }
    if (source.type === "array" && (!next.items || typeof next.items !== "object")) {
      next.items = unconstrainedProviderScalarSchema();
    }
    if (source.$defs && typeof source.$defs === "object") {
      next.$defs = Object.fromEntries(
        Object.entries(source.$defs).map(([key, value]) => [key, visit(value)])
      );
    }
    return next;
  }
  return assertStrictProviderSchema(visit(normalizedDocument));
}

const GEMINI_SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$anchor",
  "$defs",
  "$ref",
  "additionalProperties",
  "anyOf",
  "description",
  "enum",
  "format",
  "items",
  "maximum",
  "maxItems",
  "minimum",
  "minItems",
  "oneOf",
  "prefixItems",
  "properties",
  "required",
  "title",
  "type"
]);

function genericGeminiRecursiveTerminal() {
  return {
    type: "object",
    additionalProperties: true
  };
}

export function toGeminiJsonSchema(sourceSchema) {
  const normalizedDocument = normalizeJsonSchemaDocument(
    projectProviderRecursiveSchemas(sourceSchema)
  );

  function visit(source, activeDefinition = "") {
    if (Array.isArray(source)) {
      return source.map((item) => visit(item, activeDefinition));
    }
    if (!source || typeof source !== "object") {
      return structuredClone(source);
    }
    if (typeof source.$ref === "string") {
      const referencedDefinition = source.$ref.match(/^#\/\$defs\/([^/]+)$/u)?.[1] || "";
      if (referencedDefinition && referencedDefinition === activeDefinition) {
        return genericGeminiRecursiveTerminal();
      }
      return { $ref: source.$ref };
    }

    const next = {};
    Object.entries(source).forEach(([key, value]) => {
      if (key === "const") {
        if (typeof value === "string") {
          next.type = "string";
          next.enum = [structuredClone(value)];
        } else if (typeof value === "number") {
          next.type = Number.isInteger(value) ? "integer" : "number";
          next.enum = [structuredClone(value)];
        } else if (typeof value === "boolean") {
          next.type = "boolean";
        } else if (value === null) {
          next.type = "null";
        }
        return;
      }
      if (!GEMINI_SUPPORTED_SCHEMA_KEYWORDS.has(key)) return;
      if (key === "oneOf" || key === "anyOf") {
        next.anyOf = value.map((item) => visit(item, activeDefinition));
        return;
      }
      if (key === "properties") {
        next.properties = Object.fromEntries(
          Object.entries(value || {}).map(([fieldName, fieldSchema]) => [
            fieldName,
            visit(fieldSchema, activeDefinition)
          ])
        );
        return;
      }
      if (key === "$defs") {
        next.$defs = Object.fromEntries(
          Object.entries(value || {}).map(([definition, definitionSchema]) => [
            definition,
            visit(definitionSchema, definition)
          ])
        );
        return;
      }
      if (key === "items" || key === "additionalProperties") {
        if (key === "items" && typeof value === "boolean") {
          if (value === false && !Array.isArray(source.prefixItems)) {
            next.maxItems = 0;
          }
          return;
        }
        next[key] = value && typeof value === "object"
          ? visit(value, activeDefinition)
          : structuredClone(value);
        return;
      }
      if (key === "prefixItems") {
        next.prefixItems = value.map((item) => visit(item, activeDefinition));
        return;
      }
      next[key] = structuredClone(value);
    });
    if (Array.isArray(next.enum) && !next.type) {
      const inferredType = inferEnumType(next.enum);
      if (inferredType) next.type = inferredType;
    }
    if (next.properties && typeof next.properties === "object") {
      next.type = "object";
      if (Array.isArray(next.required)) {
        next.required = next.required.filter((fieldName) =>
          Object.hasOwn(next.properties, fieldName)
        );
      }
    }
    return next;
  }

  return visit(normalizedDocument);
}

export function stripStructuredNulls(value, canonicalSchema = null) {
  const rootSchema =
    canonicalSchema
    && typeof canonicalSchema === "object"
    && !Array.isArray(canonicalSchema)
      ? canonicalSchema
      : null;

  function dereference(schema, activeReferences = new Set()) {
    const referenceName = localDefinitionName(schema?.$ref);
    if (
      !rootSchema
      || !referenceName
      || activeReferences.has(referenceName)
      || !rootSchema.$defs
      || !Object.hasOwn(rootSchema.$defs, referenceName)
    ) {
      return schema;
    }
    return dereference(
      rootSchema.$defs[referenceName],
      new Set([...activeReferences, referenceName])
    );
  }

  function typeMatches(item, type) {
    if (type === "null") return item === null;
    if (type === "array") return Array.isArray(item);
    if (type === "object") {
      return Boolean(item) && typeof item === "object" && !Array.isArray(item);
    }
    if (type === "integer") return Number.isInteger(item);
    if (type === "number") return typeof item === "number" && Number.isFinite(item);
    return typeof item === type;
  }

  function branchMatches(item, branch) {
    const schema = dereference(branch);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
    const types = Array.isArray(schema.type)
      ? schema.type
      : typeof schema.type === "string"
        ? [schema.type]
        : [];
    if (types.length && !types.some((type) => typeMatches(item, type))) return false;
    if (
      item
      && typeof item === "object"
      && !Array.isArray(item)
      && schema.properties
      && typeof schema.properties === "object"
    ) {
      return Object.entries(schema.properties).every(([fieldName, fieldSchema]) => {
        if (!Object.hasOwn(item, fieldName)) return true;
        if (Object.hasOwn(fieldSchema || {}, "const")) {
          return Object.is(item[fieldName], fieldSchema.const);
        }
        if (Array.isArray(fieldSchema?.enum)) {
          return fieldSchema.enum.some((candidate) => Object.is(candidate, item[fieldName]));
        }
        return true;
      });
    }
    return true;
  }

  function applicableSchemas(item, schema) {
    const resolved = dereference(schema);
    if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) return [];
    const applicable = [resolved];
    for (const keyword of ["allOf", "anyOf", "oneOf"]) {
      const branches = Array.isArray(resolved[keyword]) ? resolved[keyword] : [];
      branches
        .filter((branch) => keyword === "allOf" || branchMatches(item, branch))
        .forEach((branch) => {
          applicable.push(...applicableSchemas(item, branch));
        });
    }
    return applicable;
  }

  function visit(item, schema) {
    const schemas = applicableSchemas(item, schema);
    if (Array.isArray(item)) {
      return item.map((child, index) => {
        const childSchemas = schemas.flatMap((candidate) => {
          if (Array.isArray(candidate.prefixItems) && candidate.prefixItems[index]) {
            return [candidate.prefixItems[index]];
          }
          return candidate.items && typeof candidate.items === "object"
            ? [candidate.items]
            : [];
        });
        return visit(child, childSchemas[0] || null);
      });
    }
    if (!item || typeof item !== "object") return item;

    return Object.fromEntries(
      Object.entries(item).flatMap(([fieldName, child]) => {
        const required = schemas.some((candidate) =>
          Array.isArray(candidate.required) && candidate.required.includes(fieldName)
        );
        if (child === null && !required) return [];
        const childSchema = schemas
          .map((candidate) => candidate.properties?.[fieldName])
          .find((candidate) => candidate && typeof candidate === "object");
        return [[fieldName, visit(child, childSchema || null)]];
      })
    );
  }

  return visit(value, rootSchema);
}
