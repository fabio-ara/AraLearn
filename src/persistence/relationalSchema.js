export const RELATIONAL_ROW_COLLECTIONS = Object.freeze([
  "projectMeta",
  "courses",
  "modules",
  "guides",
  "guideItems",
  "lessons",
  "topics",
  "topicStatements",
  "microsequences",
  "microsequenceStatements",
  "dependencies",
  "cards",
  "cardSources",
  "cardTopics",
  "blocks",
  "options",
  "nodes",
  "edges",
  "cells",
  "matrixItems",
  "points",
  "lines",
  "highlights",
  "flowNodes",
  "flowCases",
  "flowPractices",
  "flowPracticeEntries",
  "flowPracticeOptions",
  "flowPracticeVariants",
  "flowShapeOptions"
]);

export const CARD_RESOURCES = Object.freeze([
  "paragraph",
  "choice",
  "composite",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane",
  "formula",
  "chart",
  "sequence",
  "annotated_text",
  "linguistic_example"
]);

export const COMPOSITE_BLOCK_KINDS = Object.freeze([
  "heading",
  "paragraph",
  "choice",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane",
  "formula",
  "chart",
  "sequence",
  "annotated_text",
  "linguistic_example"
]);

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class RelationalMappingError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "RelationalMappingError";
    this.details = Array.isArray(details) ? details : [];
  }
}

export function createEmptyRelationalRows() {
  return Object.fromEntries(RELATIONAL_ROW_COLLECTIONS.map((name) => [name, []]));
}

export function defaultUuidFactory() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
  }
  throw new Error("A geração de UUID exige Web Crypto.");
}

export function makeRelationalRow(uuidFactory, values = {}) {
  return {
    id: uuidFactory(values.identityKey),
    updatedAt: null,
    deletedAt: null,
    ...values
  };
}

export function createIdentityAllocator({ uuidFactory = defaultUuidFactory, identityMap = new Map() } = {}) {
  const read = (key) => identityMap instanceof Map ? identityMap.get(key) : identityMap?.[key];
  const write = (key, value) => {
    if (identityMap instanceof Map) {
      identityMap.set(key, value);
    } else if (identityMap && typeof identityMap === "object") {
      identityMap[key] = value;
    }
  };
  return {
    identityMap,
    row(identityKey, values = {}) {
      const existing = read(identityKey);
      const hasValidExistingId = UUID_PATTERN.test(String(existing || ""));
      const id = hasValidExistingId ? existing : uuidFactory(identityKey);
      if (!hasValidExistingId) {
        write(identityKey, id);
      }
      return {
        id,
        identityKey,
        updatedAt: null,
        deletedAt: null,
        ...values
      };
    }
  };
}

export function assertPlainObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RelationalMappingError(`${path} deve ser objeto.`);
  }
}

export function assertAllowedFields(value, allowedFields, path) {
  assertPlainObject(value, path);
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(value).filter((fieldName) => !allowed.has(fieldName));
  if (unknown.length) {
    throw new RelationalMappingError(
      `${path} contém campos sem mapeamento relacional: ${unknown.join(", ")}.`,
      unknown.map((fieldName) => ({ path: `${path}.${fieldName}`, message: "Campo não mapeado." }))
    );
  }
}

export function rowsInPosition(rows = []) {
  return [...rows].filter((row) => row?.deletedAt == null).sort((left, right) => {
    const positionDelta = Number(left?.position || 0) - Number(right?.position || 0);
    return positionDelta || String(left?.id || "").localeCompare(String(right?.id || ""));
  });
}

export function groupRows(rows = [], keyName) {
  const grouped = new Map();
  rowsInPosition(rows).forEach((row) => {
    const key = row?.[keyName] ?? null;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  });
  return grouped;
}

export function indexRows(rows = []) {
  return new Map(rows.filter((row) => row?.deletedAt == null).map((row) => [row.id, row]));
}

export function mergeRelationalRows(target, source) {
  RELATIONAL_ROW_COLLECTIONS.forEach((name) => {
    target[name].push(...(Array.isArray(source?.[name]) ? source[name] : []));
  });
  return target;
}
