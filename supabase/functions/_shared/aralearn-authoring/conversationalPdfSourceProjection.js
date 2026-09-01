const CREATION_BIBLIOGRAPHIC_FIELDS = Object.freeze([
  "title",
  "authorship",
  "publicationDate",
  "identifier",
  "language",
  "citationText",
  "url",
  "editionOrVersion"
]);

export const AUTHORING_CONVERSATIONAL_PROJECTION_ID =
  "aralearn.authoring-conversational-projection.v1";
export const AUTHORING_CONVERSATIONAL_PROJECTION_VERSION = "1.1.0";
export const AUTHORING_CONVERSATIONAL_PROJECTION_HASH =
  "sha256:903a35aec96d5136f6b1a94fb9c0ec62adf343d139ec1210e8ece800f116f79d";
export const AUTHORING_CONVERSATIONAL_PROJECTION_METADATA = Object.freeze({
  id: AUTHORING_CONVERSATIONAL_PROJECTION_ID,
  version: AUTHORING_CONVERSATIONAL_PROJECTION_VERSION,
  hash: AUTHORING_CONVERSATIONAL_PROJECTION_HASH
});
export const AUTHORING_CONVERSATIONAL_PROJECTION_HEADER = [
  AUTHORING_CONVERSATIONAL_PROJECTION_ID,
  `version=${AUTHORING_CONVERSATIONAL_PROJECTION_VERSION}`,
  `hash=${AUTHORING_CONVERSATIONAL_PROJECTION_HASH}`
].join("; ");

const COMPLETE_SOURCE_FIELDS = Object.freeze([
  "kind",
  ...CREATION_BIBLIOGRAPHIC_FIELDS,
  "origin",
  "availability",
  "verificationStatus",
  "studyVisibility"
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return structuredClone(value);
}

function variant(sourceIntent, mode) {
  const matches = (sourceIntent?.oneOf || []).filter((branch) =>
    branch?.properties?.mode?.const === mode
  );
  if (matches.length !== 1) {
    throw new TypeError(`A intenção de PDF perdeu a variante ${mode}.`);
  }
  return matches[0];
}

function stringAlternative(schema) {
  if (schema?.type === "string") return schema;
  const matches = (schema?.anyOf || []).filter((candidate) => candidate?.type === "string");
  if (matches.length !== 1) {
    throw new TypeError("A intenção de PDF perdeu a identidade textual da Fonte.");
  }
  return matches[0];
}

function selectedProperties(properties, names) {
  return Object.fromEntries(names.map((name) => {
    if (!object(properties?.[name])) {
      throw new TypeError(`A Fonte do PDF perdeu o campo bibliográfico ${name}.`);
    }
    return [name, clone(properties[name])];
  }));
}

function objectSchema(properties, required) {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required
  };
}

function exactFields(value, names) {
  return object(value) &&
    Object.keys(value).length === names.length &&
    names.every((name) => Object.hasOwn(value, name));
}

function fieldsBelongTo(value, names, required = []) {
  if (!object(value)) return false;
  const allowed = new Set(names);
  return Object.keys(value).every((name) => allowed.has(name)) &&
    required.every((name) => Object.hasOwn(value, name));
}

/**
 * Converte somente as duas formas novas e exatas da superfície conversacional.
 * Chamadas 1.x com mode=save atravessam intactas, inclusive em retries já
 * armazenados por clientes antigos. Formas ambíguas ficam para o normalizador
 * canônico rejeitar, em vez de perder campos silenciosamente.
 */
export function normalizeConversationalPdfSourceIntent(value) {
  if (value?.mode === "create" && exactFields(value, ["mode", "newSource"]) &&
      fieldsBelongTo(value.newSource, CREATION_BIBLIOGRAPHIC_FIELDS, ["title"])) {
    return {
      mode: "save",
      sourceId: null,
      expectedSourceRevision: 0,
      source: value.newSource
    };
  }
  if (value?.mode === "revise" && exactFields(value, [
    "mode", "sourceId", "expectedSourceRevision", "revisedSource"
  ]) && typeof value.sourceId === "string" && value.sourceId.trim() &&
      Number.isInteger(value.expectedSourceRevision) && value.expectedSourceRevision >= 1 &&
      fieldsBelongTo(value.revisedSource, COMPLETE_SOURCE_FIELDS, COMPLETE_SOURCE_FIELDS)) {
    return {
      mode: "save",
      sourceId: value.sourceId,
      expectedSourceRevision: value.expectedSourceRevision,
      source: value.revisedSource
    };
  }
  return value;
}

/**
 * Especializa somente o contrato entregue a agentes conversacionais. O runtime
 * canônico continua aceitando a forma 1.x para que retries antigos conservem o
 * mesmo fingerprint; novas criações não oferecem estados geridos pelo backend.
 */
export function projectConversationalPdfSourceTool(toolDefinition) {
  const tool = clone(toolDefinition);
  if (tool.name !== "incorporarPdfComoFonte") return tool;

  const sourceIntent = tool.inputSchema?.properties?.sourceIntent;
  const existing = variant(sourceIntent, "existing");
  const save = variant(sourceIntent, "save");
  const source = save.properties?.source;
  if (!object(source?.properties)) {
    throw new TypeError("A incorporação de PDF perdeu o documento da Fonte.");
  }

  const creationSource = objectSchema(
    selectedProperties(source.properties, CREATION_BIBLIOGRAPHIC_FIELDS),
    ["title"]
  );
  creationSource.description =
    "Informe só o título e metadados bibliográficos confirmados no PDF; o AraLearn define os demais estados.";

  const revisionSource = clone(source);
  revisionSource.required = [...COMPLETE_SOURCE_FIELDS];
  revisionSource.oneOf = [{
    properties: { studyVisibility: { type: "string", const: "hidden" } },
    required: ["studyVisibility"]
  }, {
    properties: {
      studyVisibility: {
        type: "string",
        enum: ["citation", "citation_and_link"]
      },
      citationText: clone(stringAlternative(source.properties.citationText))
    },
    required: ["studyVisibility", "citationText"]
  }];
  revisionSource.description =
    "Na revisão, envie o documento completo lido da Fonte.";

  const saveProperties = save.properties;
  const create = objectSchema({
    mode: { type: "string", const: "create" },
    newSource: creationSource
  }, ["mode", "newSource"]);
  const revise = objectSchema({
    mode: { type: "string", const: "revise" },
    sourceId: clone(stringAlternative(saveProperties.sourceId)),
    expectedSourceRevision: { type: "integer", minimum: 1 },
    revisedSource: revisionSource
  }, ["mode", "sourceId", "expectedSourceRevision", "revisedSource"]);

  tool.inputSchema.properties.sourceIntent = {
    oneOf: [clone(existing), create, revise],
    description:
      "Use existing para uma Fonte lida, create para criar e revise para revisar."
  };
  return tool;
}
