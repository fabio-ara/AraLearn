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
  if (!value || typeof value !== "object") {
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

export function toStrictJsonSchema(sourceSchema) {
  function visit(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      return structuredClone(source);
    }
    if (
      source.$id === "urn:aralearn:schema:flowchart-structure:v1"
      && source.$defs?.node?.oneOf?.[0]
    ) {
      return visit({
        ...structuredClone(source.$defs.node.oneOf[0]),
        $defs: structuredClone(source.$defs)
      });
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
    const next = Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => !["$id", "$schema"].includes(key))
        .map(([key, value]) => {
        if (key === "properties" || key === "$defs") return [key, value];
        if (key === "items") return [key, visit(value)];
        if (["anyOf", "oneOf", "allOf"].includes(key)) {
          return [key === "oneOf" ? "anyOf" : key, value.map(visit)];
        }
        return [key, structuredClone(value)];
      })
    );
    if (source.properties && typeof source.properties === "object") {
      const originalRequired = new Set(source.required || []);
      next.properties = Object.fromEntries(
        Object.entries(source.properties).map(([key, value]) => {
          const strictValue = visit(value);
          return [key, originalRequired.has(key) ? strictValue : nullableSchema(strictValue)];
        })
      );
      next.required = Object.keys(source.properties);
      next.additionalProperties = false;
    } else if (source.type === "object") {
      next.additionalProperties = false;
    }
    if (source.$defs && typeof source.$defs === "object") {
      next.$defs = Object.fromEntries(
        Object.entries(source.$defs).map(([key, value]) => [key, visit(value)])
      );
    }
    return next;
  }
  return visit(sourceSchema);
}

export function stripStructuredNulls(value) {
  if (Array.isArray(value)) {
    return value.map(stripStructuredNulls);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, stripStructuredNulls(item)])
  );
}
