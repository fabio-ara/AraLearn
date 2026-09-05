function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolvePointer(root, pointer) {
  if (pointer === "#") return root;
  if (!String(pointer || "").startsWith("#/")) return null;
  return pointer.slice(2).split("/").reduce((value, token) => (
    value?.[token.replace(/~1/g, "/").replace(/~0/g, "~")]
  ), root);
}

function validateNode(value, schema, root, path, depth = 0, schemaTrail = []) {
  if (depth > 80) return `${path} excedeu a profundidade dos dados.`;
  if (!schema || typeof schema !== "object") return "";
  // Referências e alternativas descrevem o mesmo valor; não são mais um
  // nível dos dados. O caminho separado impede ciclos sem consumir o limite
  // de uma AST válida a cada passagem por $ref e oneOf.
  if (schemaTrail.length >= 100 || schemaTrail.includes(schema)) {
    return `${path} usa schema cíclico ou excessivamente encadeado.`;
  }
  const nextTrail = [...schemaTrail, schema];
  const referenceRoot = schema.$id ? schema : root;
  if (schema.$ref) {
    const resolved = resolvePointer(referenceRoot, schema.$ref);
    return resolved ? validateNode(value, resolved, referenceRoot, path, depth, nextTrail) : `${path} usa referência inexistente.`;
  }
  if (Object.hasOwn(schema, "const") && !Object.is(value, schema.const)) {
    return `${path} precisa ser ${JSON.stringify(schema.const)}.`;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    return `${path} precisa usar um valor permitido.`;
  }
  for (const keyword of ["allOf"]) {
    if (Array.isArray(schema[keyword])) {
      for (const branch of schema[keyword]) {
        const error = validateNode(value, branch, referenceRoot, path, depth, nextTrail);
        if (error) return error;
      }
    }
  }
  if (Array.isArray(schema.anyOf)) {
    const valid = schema.anyOf.some((branch) => !validateNode(value, branch, referenceRoot, path, depth, nextTrail));
    if (!valid) return `${path} não satisfaz nenhuma forma permitida.`;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((branch) => !validateNode(value, branch, referenceRoot, path, depth, nextTrail)).length;
    if (matches !== 1) return `${path} precisa satisfazer exatamente uma forma.`;
  }
  const expectedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (expectedTypes.length) {
    const actual = valueType(value);
    const compatible = expectedTypes.some((expected) => (
      expected === actual || (expected === "number" && ["number", "integer"].includes(actual))
    ));
    if (!compatible) return `${path} precisa ser ${expectedTypes.join(" ou ")}.`;
  }
  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) return `${path} é curto demais.`;
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) return `${path} é longo demais.`;
    if (schema.pattern && !(new RegExp(schema.pattern, "u")).test(value)) return `${path} possui formato inválido.`;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return `${path} está abaixo do mínimo.`;
    if (typeof schema.maximum === "number" && value > schema.maximum) return `${path} excede o máximo.`;
  }
  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) return `${path} possui itens insuficientes.`;
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) return `${path} possui itens em excesso.`;
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      return `${path} contém itens duplicados.`;
    }
    if (Array.isArray(schema.prefixItems)) {
      for (let index = 0; index < Math.min(value.length, schema.prefixItems.length); index += 1) {
        const error = validateNode(value[index], schema.prefixItems[index], referenceRoot, `${path}[${index}]`, depth + 1);
        if (error) return error;
      }
    }
    if (schema.items && typeof schema.items === "object") {
      for (let index = 0; index < value.length; index += 1) {
        const error = validateNode(value[index], schema.items, referenceRoot, `${path}[${index}]`, depth + 1);
        if (error) return error;
      }
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required)) return `${path}.${required} é obrigatório.`;
    }
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(value).find((key) => !Object.hasOwn(properties, key));
      if (unknown) return `${path}.${unknown} não é permitido.`;
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      const error = validateNode(value[key], childSchema, referenceRoot, `${path}.${key}`, depth + 1);
      if (error) return error;
    }
  }
  return "";
}

export function validatePackageSchema(value, schema) {
  const error = validateNode(value, schema, schema, "$.data");
  return error ? { valid: false, error } : { valid: true, error: "" };
}
