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
  nodes: ["blockId", "nodeScope", "parentNodeId"],
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

const FORMULA_FENCE_PAIRS = new Map([
  ["(", ")"], ["[", "]"], ["{", "}"], ["|", "|"], ["‖", "‖"], ["⟨", "⟩"]
]);
const FORMULA_MARKUP_PATTERN = /<\/?[A-Za-z][^>]*>/u;
const CONSERVATIVE_BCP47_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?(?:-(?:[A-Za-z0-9]{5,8}|\d[A-Za-z0-9]{3}))*$/u;
const TEXT_DIRECTIONS = new Set(["auto", "ltr", "rtl"]);

function containsForbiddenFormulaControl(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 8 || codePoint === 11 || codePoint === 12 ||
      (codePoint >= 14 && codePoint <= 31) || codePoint === 127;
  });
}

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
    if (typeof row.directed !== "boolean") {
      error(errors, rowPath("edges", index, "directed"), "directed deve ser booleano.", "shape");
    }
    if (typeof row.hasDirected !== "boolean") {
      error(errors, rowPath("edges", index, "hasDirected"), "hasDirected deve ser booleano.", "shape");
    } else if (row.hasDirected && row.edgeScope !== "graph") {
      error(errors, rowPath("edges", index, "hasDirected"), "Somente arestas de grafo podem declarar directed.", "scope");
    }
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

function validateTextMetadataRows(rows, errors) {
  ["cards", "blocks"].forEach((collection) => {
    active(rows[collection]).forEach((row, index) => {
      if (typeof row.hasLanguageTag !== "boolean") {
        error(errors, rowPath(collection, index, "hasLanguageTag"), "hasLanguageTag deve ser booleano.", "shape");
      } else if (row.hasLanguageTag !== (row.languageTag != null)) {
        error(
          errors,
          rowPath(collection, index, "hasLanguageTag"),
          "hasLanguageTag deve preservar a presença de languageTag.",
          "presence"
        );
      }
      if (row.languageTag != null && (
        typeof row.languageTag !== "string"
        || row.languageTag !== row.languageTag.trim()
        || row.languageTag.length > 63
        || !CONSERVATIVE_BCP47_PATTERN.test(row.languageTag)
      )) {
        error(errors, rowPath(collection, index, "languageTag"), "languageTag relacional inválido.", "language_tag");
      }
      if (typeof row.hasTextDirection !== "boolean") {
        error(errors, rowPath(collection, index, "hasTextDirection"), "hasTextDirection deve ser booleano.", "shape");
      } else if (row.hasTextDirection !== (row.textDirection != null)) {
        error(
          errors,
          rowPath(collection, index, "hasTextDirection"),
          "hasTextDirection deve preservar a presença de textDirection.",
          "presence"
        );
      }
      if (row.textDirection != null && !TEXT_DIRECTIONS.has(row.textDirection)) {
        error(errors, rowPath(collection, index, "textDirection"), "textDirection relacional inválido.", "text_direction");
      }
    });
  });
}

function validateFormulaRows(rows, indexes, errors) {
  const nodesByBlock = new Map();
  active(rows.nodes).forEach((row, index) => {
    if (row.nodeScope !== "formula") return;
    if (!nodesByBlock.has(row.blockId)) nodesByBlock.set(row.blockId, []);
    nodesByBlock.get(row.blockId).push({ row, index });
    const block = indexes.blocks.get(row.blockId);
    if (!block || block.blockType !== "formula") {
      error(errors, rowPath("nodes", index, "nodeScope"), "Nó formula precisa pertencer a bloco formula.", "formula_scope");
    }
    if (row.parentNodeId != null) {
      const parent = indexes.nodes.get(row.parentNodeId);
      if (parent?.nodeScope !== "formula") {
        error(errors, rowPath("nodes", index, "parentNodeId"), "Pai de nó formula precisa estar na mesma AST.", "formula_scope");
      }
    }
  });

  active(rows.blocks).forEach((block, blockIndex) => {
    if (block.blockType !== "formula") return;
    if (!["mathematics", "chemistry"].includes(block.notation)) {
      error(errors, rowPath("blocks", blockIndex, "notation"), "Notação de formula inválida.", "formula_shape");
    }
    if (typeof block.accessibleText !== "string" || !block.accessibleText.trim()) {
      error(errors, rowPath("blocks", blockIndex, "accessibleText"), "Texto acessível da formula é obrigatório.", "formula_shape");
    }
    const entries = nodesByBlock.get(block.id) || [];
    if (entries.length > 512) {
      error(errors, rowPath("blocks", blockIndex), "AST de formula excede 512 nós.", "formula_shape");
    }
    const roots = entries.filter(({ row }) => row.parentNodeId == null);
    if (roots.length !== 1) {
      error(errors, rowPath("blocks", blockIndex), "Bloco formula precisa de uma única raiz.", "formula_shape");
    }
    const childrenByParent = new Map();
    entries.forEach(({ row }) => {
      if (row.parentNodeId == null) return;
      if (!childrenByParent.has(row.parentNodeId)) childrenByParent.set(row.parentNodeId, []);
      childrenByParent.get(row.parentNodeId).push(row);
    });
    entries.forEach(({ row, index }) => {
      const children = (childrenByParent.get(row.id) || []).sort((left, right) => left.position - right.position);
      const positions = children.map((child) => child.position);
      const contiguous = positions.every((position, childIndex) => position === childIndex);
      const expected = {
        number: [0, 0], identifier: [0, 0], operator: [0, 0], text: [0, 0],
        row: [1, 64], fraction: [2, 2], root: [1, 2], superscript: [2, 2],
        subscript: [2, 2], subsup: [3, 3], fenced: [1, 1]
      }[row.nodeKind];
      if (!expected || children.length < expected[0] || children.length > expected[1] || !contiguous) {
        error(errors, rowPath("nodes", index), "Quantidade ou posição de filhos inválida na AST de formula.", "formula_shape");
      }
      const isLeaf = ["number", "identifier", "operator", "text"].includes(row.nodeKind);
      const hasValidLeafValue = typeof row.formulaValue === "string" && Boolean(row.formulaValue.trim()) &&
        [...row.formulaValue].length <= 256 && !FORMULA_MARKUP_PATTERN.test(row.formulaValue) &&
        !containsForbiddenFormulaControl(row.formulaValue);
      if ((isLeaf && !hasValidLeafValue) || (!isLeaf && row.formulaValue != null)) {
        error(errors, rowPath("nodes", index, "formulaValue"), "Valor textual incompatível com o tipo do nó formula.", "formula_shape");
      }
      const isFenced = row.nodeKind === "fenced";
      const hasValidFence = FORMULA_FENCE_PAIRS.has(row.fenceOpen) && FORMULA_FENCE_PAIRS.get(row.fenceOpen) === row.fenceClose;
      if ((isFenced && !hasValidFence) || (!isFenced && (row.fenceOpen != null || row.fenceClose != null))) {
        error(errors, rowPath("nodes", index), "Delimitadores incompatíveis com o nó fenced.", "formula_shape");
      }
    });

    if (roots.length === 1) {
      const visited = new Set();
      const path = new Set();
      let invalidTree = false;
      const visit = (nodeId, depth) => {
        if (depth > 32 || path.has(nodeId)) {
          invalidTree = true;
          return;
        }
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        path.add(nodeId);
        (childrenByParent.get(nodeId) || []).forEach((child) => visit(child.id, depth + 1));
        path.delete(nodeId);
      };
      visit(roots[0].row.id, 1);
      if (invalidTree || visited.size !== entries.length) {
        error(
          errors,
          rowPath("blocks", blockIndex),
          "AST de formula está cíclica, desconectada ou profunda demais.",
          "formula_shape"
        );
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
  validateTextMetadataRows(rows, errors);
  validateCourseScopes(rows, indexes, errors);
  validateGraphReferences(rows, indexes, errors);
  validateFormulaRows(rows, indexes, errors);
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
