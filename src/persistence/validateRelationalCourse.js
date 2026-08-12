import { validateProjectDocument } from "../domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../resources/packages/index.js";
import { relationalRowsToContract } from "./relationalRowsToContract.js";
import { RELATIONAL_ROW_COLLECTIONS, UUID_PATTERN } from "./relationalSchema.js";

const RELATIONSHIPS = Object.freeze([
  ["courses", "projectId", "projectMeta"],
  ["modules", "courseId", "courses"],
  ["lessons", "moduleId", "modules"],
  ["topics", "lessonId", "lessons"],
  ["topicStatements", "topicId", "topics"],
  ["microsequences", "lessonId", "lessons"],
  ["microsequenceStatements", "microsequenceId", "microsequences"],
  ["dependencies", "microsequenceId", "microsequences"],
  ["dependencies", "dependsOnMicrosequenceId", "microsequences"],
  ["cards", "lessonId", "lessons"],
  ["cards", "microsequenceId", "microsequences"],
  ["cardSources", "cardId", "cards"],
  ["cardTopics", "cardId", "cards"],
  ["cardTopics", "topicId", "topics", true],
  ["packageInstances", "cardId", "cards"]
]);

function active(rows) {
  return rows.filter((row) => row && row.deletedAt == null);
}

function add(errors, path, message, code = "invalid") {
  errors.push({ path, message, code });
}

export function validateRelationalCourse(rows, { validateContract = true } = {}) {
  const errors = [];
  const indexes = {};
  for (const collection of RELATIONAL_ROW_COLLECTIONS) {
    if (!Array.isArray(rows?.[collection])) {
      add(errors, `$.${collection}`, "Coleção relacional obrigatória ausente.", "collection");
      indexes[collection] = new Map();
      continue;
    }
    indexes[collection] = new Map();
    active(rows[collection]).forEach((row, index) => {
      if (!UUID_PATTERN.test(String(row.id || ""))) add(errors, `$.${collection}[${index}].id`, "UUID inválido.", "uuid");
      if (indexes[collection].has(row.id)) add(errors, `$.${collection}[${index}].id`, "Identificador duplicado.", "duplicate");
      indexes[collection].set(row.id, row);
    });
  }
  for (const [source, field, target, optional] of RELATIONSHIPS) {
    active(rows?.[source] || []).forEach((row, index) => {
      if (optional && row[field] == null) return;
      if (!indexes[target]?.has(row[field])) add(errors, `$.${source}[${index}].${field}`, `Referência ausente em ${target}.`, "foreign_key");
    });
  }
  active(rows?.packageInstances || []).forEach((row, index) => {
    const slot = row.slot;
    const value = { id: row.contractKey, package: row.packageId, version: row.packageVersion, data: row.packageData };
    const result = RESOURCE_PACKAGE_REGISTRY.validateInstance(value, slot);
    if (!result.valid) result.errors.forEach((message) => add(errors, `$.packageInstances[${index}]`, message, "package"));
  });
  if (!errors.length && validateContract) {
    try {
      const contract = relationalRowsToContract(rows, { validate: false });
      const result = validateProjectDocument(contract);
      if (!result.ok) errors.push(...result.errors.map((error) => ({ ...error, code: "contract" })));
    } catch (error) {
      add(errors, "$", error.message, "assembly");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertValidRelationalCourse(rows, options = {}) {
  const result = validateRelationalCourse(rows, options);
  if (!result.ok) {
    const error = new TypeError("Estado relacional inválido.");
    error.details = result.errors;
    throw error;
  }
  return rows;
}
