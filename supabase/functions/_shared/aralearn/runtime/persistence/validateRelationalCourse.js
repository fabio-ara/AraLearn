import { validateProjectDocument } from "../domain/aralearnProject.js";
import { relationalRowsToContract } from "./relationalRowsToContract.js";
import {
  RELATIONAL_ROW_COLLECTIONS,
  RelationalMappingError,
  UUID_PATTERN
} from "./relationalSchema.js";

const DIRECT_RELATIONSHIPS = Object.freeze([
  ["courses", "projectId", "projectMeta"],
  ["modules", "courseId", "courses"],
  ["guideItems", "guideId", "guides"],
  ["lessons", "moduleId", "modules"],
  ["topics", "lessonId", "lessons"],
  ["topicStatements", "topicId", "topics"],
  ["microsequences", "lessonId", "lessons"],
  ["microsequenceStatements", "microsequenceId", "microsequences"],
  ["dependencies", "lessonId", "lessons"],
  ["dependencies", "microsequenceId", "microsequences"],
  ["dependencies", "dependsOnMicrosequenceId", "microsequences"],
  ["cards", "lessonId", "lessons"],
  ["cards", "microsequenceId", "microsequences"],
  ["cardSources", "cardId", "cards"],
  ["cardTopics", "cardId", "cards"],
  ["cardTopics", "topicId", "topics", true],
  ["blocks", "cardId", "cards"],
  ["options", "blockId", "blocks"],
  ["nodes", "blockId", "blocks"],
  ["edges", "blockId", "blocks"],
  ["cells", "blockId", "blocks"],
  ["cells", "matrixItemId", "matrixItems", true],
  ["matrixItems", "blockId", "blocks"],
  ["points", "blockId", "blocks"],
  ["lines", "blockId", "blocks"],
  ["lines", "fromPointId", "points"],
  ["lines", "toPointId", "points"],
  ["highlights", "blockId", "blocks"],
  ["highlights", "matrixItemId", "matrixItems", true],
  ["flowNodes", "blockId", "blocks"],
  ["flowNodes", "parentNodeId", "flowNodes", true],
  ["flowNodes", "parentCaseId", "flowCases", true],
  ["flowCases", "flowNodeId", "flowNodes"],
  ["flowPracticeEntries", "practiceId", "flowPractices"],
  ["flowPracticeOptions", "entryId", "flowPracticeEntries"],
  ["flowPracticeVariants", "entryId", "flowPracticeEntries"],
  ["flowShapeOptions", "practiceId", "flowPractices"]
]);

const POSITION_SCOPES = Object.freeze({
  courses: ["projectId"],
  modules: ["courseId"],
  guideItems: ["guideId", "itemType"],
  lessons: ["moduleId"],
  topics: ["lessonId"],
  topicStatements: ["topicId", "statementType"],
  microsequences: ["lessonId"],
  microsequenceStatements: ["microsequenceId", "statementType"],
  dependencies: ["microsequenceId"],
  cards: ["microsequenceId"],
  cardSources: ["cardId"],
  cardTopics: ["cardId"],
  blocks: ["cardId", "region"],
  options: ["blockId"],
  nodes: ["blockId", "nodeScope"],
  edges: ["blockId", "edgeScope"],
  matrixItems: ["blockId", "isSequence"],
  points: ["blockId", "pointRole"],
  lines: ["blockId", "lineRole"],
  highlights: ["blockId", "matrixItemId", "selectionType"],
  flowCases: ["flowNodeId"],
  flowPracticeEntries: ["practiceId", "entryKind"],
  flowPracticeOptions: ["entryId"],
  flowPracticeVariants: ["entryId"],
  flowShapeOptions: ["practiceId"]
});

function active(collection) {
  return collection.filter((row) => row && row.deletedAt == null);
}

function indexById(rows) {
  return new Map(active(rows).map((row) => [row.id, row]));
}

function error(errors, path, message, code = "invalid") {
  errors.push({ path, message, code });
}

function rowPath(collection, index, field = "") {
  return `$.${collection}[${index}]${field ? `.${field}` : ""}`;
}

function parentCourseId(collection, row, indexes) {
  if (collection === "courses") return row.id;
  if (collection === "projectMeta") return null;
  const candidates = DIRECT_RELATIONSHIPS.filter(([source]) => source === collection);
  for (const [, field, target] of candidates) {
    const parent = indexes[target]?.get(row[field]);
    if (parent) return target === "courses" ? parent.id : parent.courseId;
  }
  return null;
}

function validateDynamicOwners(rows, indexes, errors) {
  active(rows.guides).forEach((row, index) => {
    const target = row.ownerType === "module" ? "modules" : row.ownerType === "lesson" ? "lessons" : null;
    if (!target || !indexes[target].has(row.ownerId)) {
      error(errors, rowPath("guides", index, "ownerId"), "Proprietário do guide não existe.", "foreign_key");
    } else if (indexes[target].get(row.ownerId).courseId !== row.courseId) {
      error(errors, rowPath("guides", index, "courseId"), "Guide pertence a curso diferente de seu proprietário.", "course_scope");
    }
  });
  active(rows.flowPractices).forEach((row, index) => {
    const target = row.ownerType === "node" ? "flowNodes" : row.ownerType === "case" ? "flowCases" : null;
    if (!target || !indexes[target].has(row.ownerId)) {
      error(errors, rowPath("flowPractices", index, "ownerId"), "Proprietário da prática de flow não existe.", "foreign_key");
    } else if (indexes[target].get(row.ownerId).courseId !== row.courseId) {
      error(errors, rowPath("flowPractices", index, "courseId"), "Prática de flow pertence a curso diferente de seu proprietário.", "course_scope");
    }
  });
}

function validatePositions(rows, errors) {
  Object.entries(POSITION_SCOPES).forEach(([collection, scopeFields]) => {
    const seen = new Map();
    active(rows[collection]).forEach((row, index) => {
      if (!Number.isInteger(row.position) || row.position < 0) {
        error(errors, rowPath(collection, index, "position"), "position deve ser inteiro não negativo.", "position");
        return;
      }
      const scope = scopeFields.map((field) => String(row[field] ?? "null")).join("|");
      const key = `${scope}|${row.position}`;
      if (seen.has(key)) {
        error(errors, rowPath(collection, index, "position"), `position duplicada no mesmo escopo (também em ${seen.get(key)}).`, "position");
      } else {
        seen.set(key, rowPath(collection, index));
      }
    });
  });
}

function validateContractKeys(rows, errors) {
  const scopes = {
    courses: [],
    modules: ["courseId"],
    lessons: ["moduleId"],
    topics: ["lessonId"],
    microsequences: ["lessonId"],
    cards: ["lessonId"],
    options: ["blockId"],
    nodes: ["blockId", "nodeScope"]
  };
  Object.entries(scopes).forEach(([collection, fields]) => {
    const seen = new Map();
    active(rows[collection]).forEach((row, index) => {
      if (typeof row.contractKey !== "string" || !row.contractKey.trim()) {
        if (collection !== "nodes" || row.hasContractKey !== false) {
          error(errors, rowPath(collection, index, "contractKey"), "contractKey textual é obrigatório.", "contract_key");
        }
        return;
      }
      const key = [...fields.map((field) => row[field]), row.contractKey].join("|");
      if (seen.has(key)) {
        error(errors, rowPath(collection, index, "contractKey"), `contractKey duplicado no escopo (também em ${seen.get(key)}).`, "contract_key");
      } else {
        seen.set(key, rowPath(collection, index));
      }
    });
  });
}

function validateGraphReferences(rows, indexes, errors) {
  active(rows.edges).forEach((row, index) => {
    if (!indexes.nodes.has(row.fromNodeId) || !indexes.nodes.has(row.toNodeId)) {
      error(errors, rowPath("edges", index), "Aresta aponta para nó ausente.", "foreign_key");
      return;
    }
    const from = indexes.nodes.get(row.fromNodeId);
    const to = indexes.nodes.get(row.toNodeId);
    if (from.blockId !== row.blockId || to.blockId !== row.blockId) {
      error(errors, rowPath("edges", index), "Aresta não pode atravessar blocos.", "scope");
    }
  });
  active(rows.lines).forEach((row, index) => {
    const from = indexes.points.get(row.fromPointId);
    const to = indexes.points.get(row.toPointId);
    if (from && to && (from.blockId !== row.blockId || to.blockId !== row.blockId)) {
      error(errors, rowPath("lines", index), "Linha não pode atravessar blocos.", "scope");
    }
  });
  active(rows.nodes).forEach((row, index) => {
    if (row.parentNodeId != null) {
      const parent = indexes.nodes.get(row.parentNodeId);
      if (!parent || parent.blockId !== row.blockId) {
        error(errors, rowPath("nodes", index, "parentNodeId"), "Pai da árvore está ausente ou pertence a outro bloco.", "foreign_key");
      }
    }
  });
}

function validateDependencies(rows, indexes, errors) {
  active(rows.microsequences).forEach((row, index) => {
    if (row.branchOfId != null) {
      const target = indexes.microsequences.get(row.branchOfId);
      if (!target || target.lessonId !== row.lessonId || target.id === row.id) {
        error(errors, rowPath("microsequences", index, "branchOfId"), "branchOf deve apontar para outra microssequência da mesma lição.", "foreign_key");
      }
    }
  });
  active(rows.dependencies).forEach((row, index) => {
    const source = indexes.microsequences.get(row.microsequenceId);
    const target = indexes.microsequences.get(row.dependsOnMicrosequenceId);
    if (!source || !target || source.lessonId !== target.lessonId || source.id === target.id) {
      error(errors, rowPath("dependencies", index), "Dependência deve apontar para outra microssequência da mesma lição.", "foreign_key");
    }
  });
}

function validateOptions(rows, indexes, errors) {
  const byBlock = new Map();
  active(rows.options).forEach((row) => {
    if (!byBlock.has(row.blockId)) byBlock.set(row.blockId, []);
    byBlock.get(row.blockId).push(row);
  });
  active(rows.blocks).forEach((block, index) => {
    const options = byBlock.get(block.id) || [];
    if (block.hasAnswer && options.filter((option) => option.isCorrect).length !== 1) {
      error(errors, rowPath("blocks", index), "Bloco com resposta deve ter exatamente uma alternativa correta.", "answer");
    }
    options.forEach((option) => {
      if (option.isCorrect && option.contractKey !== block.answerContractKey) {
        error(errors, `$.options[id=${option.id}]`, "Alternativa correta diverge de answerContractKey.", "answer");
      }
      if (option.optionKind !== "text" && option.optionKind !== "code") {
        error(errors, `$.options[id=${option.id}].optionKind`, "Tipo de alternativa inválido.", "option_kind");
      }
    });
  });
  void indexes;
}

function validateCourseScopes(rows, indexes, errors) {
  RELATIONAL_ROW_COLLECTIONS.forEach((collection) => {
    active(rows[collection]).forEach((row, index) => {
      if (collection === "projectMeta") return;
      if (!UUID_PATTERN.test(String(row.courseId || ""))) {
        error(errors, rowPath(collection, index, "courseId"), "courseId UUID é obrigatório nas entidades do curso.", "course_scope");
        return;
      }
      if (!indexes.courses.has(row.courseId)) {
        error(errors, rowPath(collection, index, "courseId"), "courseId não aponta para curso ativo.", "foreign_key");
        return;
      }
      const inferred = parentCourseId(collection, row, indexes);
      if (inferred && inferred !== row.courseId) {
        error(errors, rowPath(collection, index, "courseId"), "courseId diverge do curso da entidade pai.", "course_scope");
      }
    });
  });
}

export function validateRelationalCourse(rows, { assemble = true } = {}) {
  const errors = [];
  if (!rows || typeof rows !== "object" || Array.isArray(rows)) {
    return { ok: false, errors: [{ path: "$", message: "Coleções relacionais devem formar um objeto.", code: "shape" }] };
  }
  RELATIONAL_ROW_COLLECTIONS.forEach((collection) => {
    if (!Array.isArray(rows[collection])) {
      error(errors, `$.${collection}`, "Coleção relacional ausente ou inválida.", "shape");
    }
  });
  if (errors.length) return { ok: false, errors };

  const indexes = Object.fromEntries(RELATIONAL_ROW_COLLECTIONS.map((collection) => [collection, indexById(rows[collection])]));
  const allIds = new Map();
  RELATIONAL_ROW_COLLECTIONS.forEach((collection) => {
    active(rows[collection]).forEach((row, index) => {
      if (!UUID_PATTERN.test(String(row.id || ""))) {
        error(errors, rowPath(collection, index, "id"), "Identidade persistida deve ser UUID.", "uuid");
      } else if (allIds.has(row.id)) {
        error(errors, rowPath(collection, index, "id"), `UUID duplicado (também em ${allIds.get(row.id)}).`, "uuid");
      } else {
        allIds.set(row.id, rowPath(collection, index));
      }
    });
  });

  DIRECT_RELATIONSHIPS.forEach(([collection, field, target, nullable = false]) => {
    active(rows[collection]).forEach((row, index) => {
      const value = row[field];
      if (nullable && value == null) return;
      if (!indexes[target].has(value)) {
        error(errors, rowPath(collection, index, field), `${field} não aponta para ${target} ativo.`, "foreign_key");
      }
    });
  });
  validateDynamicOwners(rows, indexes, errors);
  validatePositions(rows, errors);
  validateContractKeys(rows, errors);
  validateCourseScopes(rows, indexes, errors);
  validateGraphReferences(rows, indexes, errors);
  validateDependencies(rows, indexes, errors);
  validateOptions(rows, indexes, errors);

  let document;
  if (assemble) {
    try {
      document = relationalRowsToContract(rows, { validate: false });
      const contractValidation = validateProjectDocument(document);
      if (!contractValidation.ok) {
        contractValidation.errors.forEach((entry) => error(errors, entry.path, entry.message, "contract"));
      }
    } catch (caught) {
      error(errors, "$", `Falha ao remontar contrato: ${caught?.message || caught}`, "assembly");
    }
  }
  return { ok: errors.length === 0, errors, ...(document ? { document } : {}) };
}

export function assertValidRelationalCourse(rows, options = {}) {
  const result = validateRelationalCourse(rows, options);
  if (!result.ok) {
    throw new RelationalMappingError("Curso relacional inválido.", result.errors);
  }
  return result.document;
}
