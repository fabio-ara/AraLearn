import {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  getAuthoringResourceContract as getAuthoringMetadata,
  getCardResourceDefinition,
  listAuthoringResourceContracts
} from "../resources/registry/index.js";

export {
  AUTHORING_RESOURCE_CONTRACT_VERSION,
  listAuthoringResourceContracts
};

export function getAuthoringResourceContract(resource) {
  const authoring = getAuthoringMetadata(resource);
  const definition = getCardResourceDefinition(String(resource || "").trim());
  if (!authoring || !definition) return null;
  return {
    ...structuredClone(authoring),
    authoringSchema: structuredClone(definition.authoringSchema),
    semanticLimits: structuredClone(definition.semanticLimits || {}),
    schemaRole:
      "JSON Schema estrutural de entrada autoral; a aceitação final inclui validação semântica do domínio."
  };
}

function replaceDepthReferences(value, prefix, replacement) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      replaceDepthReferences(item, prefix, replacement)
    );
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "$ref"
        && typeof item === "string"
        && item.startsWith(`#/$defs/${prefix}`)) {
      return [key, `#/$defs/${replacement}`];
    }
    return [key, replaceDepthReferences(item, prefix, replacement)];
  }));
}

function compactRecursiveDefinition(schema, prefix, replacement) {
  const definitions = schema.$defs || {};
  const source = definitions[`${prefix}1`];
  if (!source) return;
  schema.$defs = {
    ...Object.fromEntries(
      Object.entries(definitions)
        .filter(([key]) => !key.startsWith(prefix))
    ),
    [replacement]: replaceDepthReferences(source, prefix, replacement)
  };
  const compacted = replaceDepthReferences(schema, prefix, replacement);
  Object.assign(schema, compacted);
}

function pruneUnreachableDefinitions(schema) {
  const definitions = schema.$defs || {};
  const reachable = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string" && value.$ref.startsWith("#/$defs/")) {
      const name = value.$ref.slice("#/$defs/".length);
      if (!reachable.has(name) && definitions[name]) {
        reachable.add(name);
        visit(definitions[name]);
      }
    }
    Object.entries(value).forEach(([key, child]) => {
      if (key !== "$defs") visit(child);
    });
  };
  visit(schema);
  if (reachable.size) {
    schema.$defs = Object.fromEntries(
      Object.entries(definitions).filter(([name]) => reachable.has(name))
    );
  } else {
    delete schema.$defs;
  }
}

function compactAuthoringSchema(source) {
  const schema = structuredClone(source);
  delete schema.properties?.afterBlocks;
  compactRecursiveDefinition(schema, "flowBoundsDepth", "flowBounds");
  compactRecursiveDefinition(schema, "formulaNodeDepth", "formulaNode");
  pruneUnreachableDefinitions(schema);
  return schema;
}

export function getTransportAuthoringResourceContract(
  resource,
  { detail = "compact" } = {}
) {
  const definition = getAuthoringResourceContract(resource);
  if (!definition) return null;
  if (detail === "full") {
    return {
      ...definition,
      contractDetail: "full"
    };
  }
  return {
    ...definition,
    authoringSchema: compactAuthoringSchema(definition.authoringSchema),
    contractDetail: "compact",
    omittedOptionalFields: ["afterBlocks"],
    schemaRole:
      "Schema MCP compacto; o backend aplica o contrato canônico completo e a validação semântica."
  };
}
