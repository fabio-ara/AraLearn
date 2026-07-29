import { validateProjectDocument } from "../domain/aralearnProject.js";
import {
  RelationalMappingError,
  groupRows,
  indexRows,
  rowsInPosition
} from "./relationalSchema.js";

function active(rows, collection) {
  return rowsInPosition(Array.isArray(rows?.[collection]) ? rows[collection] : []);
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function decodeCell(row) {
  if (row.valueType === "null") return null;
  if (row.valueType === "number") return Number(row.numberValue);
  if (row.valueType === "boolean") return row.booleanValue === true;
  return text(row.textValue);
}

function assembleGrid(cellRows) {
  const headerRows = cellRows
    .filter((row) => row.rowIndex === -1)
    .sort((left, right) => left.columnIndex - right.columnIndex);
  const columns = headerRows.map(decodeCell);
  const bodyRows = new Map();
  cellRows.filter((row) => row.rowIndex >= 0).forEach((row) => {
    if (!bodyRows.has(row.rowIndex)) bodyRows.set(row.rowIndex, []);
    bodyRows.get(row.rowIndex).push(row);
  });
  const rows = [...bodyRows.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, values]) => values.sort((left, right) => left.columnIndex - right.columnIndex).map(decodeCell));
  const columnMeta = headerRows.length && headerRows.every((row) => row.hasColumnMeta)
    ? headerRows.map((row) => ({
        align: row.columnAlign,
        wrap: row.wrapText === true
      }))
    : null;
  return {
    columns,
    rows,
    ...(columnMeta ? { columnMeta } : {})
  };
}

function createContext(rows) {
  const context = {
    rows,
    courses: active(rows, "courses"),
    modulesByCourse: groupRows(active(rows, "modules"), "courseId"),
    lessonsByModule: groupRows(active(rows, "lessons"), "moduleId"),
    guidesByOwner: new Map(active(rows, "guides").map((row) => [`${row.ownerType}:${row.ownerId}`, row])),
    guideItemsByGuide: groupRows(active(rows, "guideItems"), "guideId"),
    topicsByLesson: groupRows(active(rows, "topics"), "lessonId"),
    topicStatementsByTopic: groupRows(active(rows, "topicStatements"), "topicId"),
    microsequencesByLesson: groupRows(active(rows, "microsequences"), "lessonId"),
    microsequenceStatementsByMicrosequence: groupRows(active(rows, "microsequenceStatements"), "microsequenceId"),
    dependenciesByMicrosequence: groupRows(active(rows, "dependencies"), "microsequenceId"),
    cardsByMicrosequence: groupRows(active(rows, "cards"), "microsequenceId"),
    cardSourcesByCard: groupRows(active(rows, "cardSources"), "cardId"),
    cardTopicsByCard: groupRows(active(rows, "cardTopics"), "cardId"),
    blocksByCard: groupRows(active(rows, "blocks"), "cardId"),
    optionsByBlock: groupRows(active(rows, "options"), "blockId"),
    nodesByBlock: groupRows(active(rows, "nodes"), "blockId"),
    edgesByBlock: groupRows(active(rows, "edges"), "blockId"),
    cellsByBlock: groupRows(active(rows, "cells"), "blockId"),
    matrixItemsByBlock: groupRows(active(rows, "matrixItems"), "blockId"),
    pointsByBlock: groupRows(active(rows, "points"), "blockId"),
    linesByBlock: groupRows(active(rows, "lines"), "blockId"),
    highlightsByBlock: groupRows(active(rows, "highlights"), "blockId"),
    flowNodesByBlock: groupRows(active(rows, "flowNodes"), "blockId"),
    flowCasesByNode: groupRows(active(rows, "flowCases"), "flowNodeId"),
    flowPracticesByOwner: new Map(active(rows, "flowPractices").map((row) => [`${row.ownerType}:${row.ownerId}`, row])),
    flowEntriesByPractice: groupRows(active(rows, "flowPracticeEntries"), "practiceId"),
    flowOptionsByEntry: groupRows(active(rows, "flowPracticeOptions"), "entryId"),
    flowVariantsByEntry: groupRows(active(rows, "flowPracticeVariants"), "entryId"),
    flowShapeOptionsByPractice: groupRows(active(rows, "flowShapeOptions"), "practiceId"),
    topicIndex: indexRows(active(rows, "topics"))
  };
  return context;
}

function assembleGuide(context, ownerType, ownerId) {
  const guide = context.guidesByOwner.get(`${ownerType}:${ownerId}`);
  if (!guide) throw new RelationalMappingError(`Guide relacional ausente para ${ownerType}:${ownerId}.`);
  const items = context.guideItemsByGuide.get(guide.id) || [];
  const list = (itemType) => items.filter((row) => row.itemType === itemType).map((row) => row.value);
  return {
    goal: guide.goal,
    include: list("include"),
    exclude: list("exclude"),
    notation: list("notation"),
    avoid: list("avoid")
  };
}

function assembleStatements(context, collectionName, parentId, statementType) {
  return (context[collectionName].get(parentId) || [])
    .filter((row) => row.statementType === statementType)
    .map((row) => row.value);
}

function assembleOptions(context, blockId) {
  return (context.optionsByBlock.get(blockId) || []).map((row) => row.optionKind === "code"
    ? {
        id: row.contractKey,
        ...(row.hasKind ? { kind: "code" } : {}),
        language: row.language,
        code: row.code,
        ...(row.hasFeedback ? { feedback: row.feedback } : {}),
        ...(row.hasMisconceptionId ? { misconceptionId: row.misconceptionId } : {})
      }
    : {
        id: row.contractKey,
        ...(row.hasKind ? { kind: "text" } : {}),
        text: row.text,
        ...(row.hasFeedback ? { feedback: row.feedback } : {}),
        ...(row.hasMisconceptionId ? { misconceptionId: row.misconceptionId } : {})
      });
}

function assembleHighlight(context, blockRow, selectionContext, matrixItemId = null) {
  const rows = (context.highlightsByBlock.get(blockRow.id) || []).filter((row) => (row.matrixItemId || null) === (matrixItemId || null));
  if (!rows.length) return blockRow.hasHighlight ? {} : undefined;
  const result = {};
  const values = (type) => rows.filter((row) => row.selectionType === type);
  if (selectionContext === "matrix") {
    const pattern = values("pattern")[0];
    if (pattern) result.pattern = pattern.value;
    if (values("cell").length) result.cells = values("cell").map((row) => [row.rowIndex, row.columnIndex]);
    if (values("row").length) result.rows = values("row").map((row) => row.rowIndex);
    if (values("column").length) result.columns = values("column").map((row) => row.columnIndex);
  } else if (selectionContext === "graph") {
    if (values("vertex").length) result.vertices = values("vertex").map((row) => row.value);
    if (values("edge").length) result.edges = values("edge").map((row) => row.value);
  } else {
    if (values("leftItem").length) result.leftItems = values("leftItem").map((row) => row.value);
    if (values("rightItem").length) result.rightItems = values("rightItem").map((row) => row.value);
    if (values("relation").length) result.relations = values("relation").map((row) => [row.fromContractKey, row.toContractKey]);
  }
  return result;
}

function assembleFlowPracticeEntry(context, entry) {
  if (entry.wasBoolean) return true;
  const result = {};
  if (entry.hasBlank) result.blank = entry.blank === true;
  if (entry.hasMode) result.mode = entry.mode;
  const options = context.flowOptionsByEntry.get(entry.id) || [];
  if (options.length) {
    result.options = options.map((row) => {
      if (row.wasPrimitive) return row.value;
      return {
        ...(row.hasContractKey ? { id: row.contractKey } : {}),
        value: row.value,
        ...(row.hasEnabled ? { enabled: row.enabled === true } : {})
      };
    });
  }
  const variants = context.flowVariantsByEntry.get(entry.id) || [];
  if (variants.length) {
    result.variants = variants.map((row) => {
      if (row.wasPrimitive) return row.value;
      return {
        ...(row.hasContractKey ? { id: row.contractKey } : {}),
        value: row.value
      };
    });
  }
  return result;
}

function assembleFlowPractice(context, ownerType, ownerId) {
  const practice = context.flowPracticesByOwner.get(`${ownerType}:${ownerId}`);
  if (!practice) return undefined;
  const result = {};
  if (practice.hasBlankShape) result.blankShape = practice.blankShape === true;
  if (practice.hasBlankText) result.blankText = practice.blankText === true;
  if (practice.hasBlankLabel) result.blankLabel = practice.blankLabel === true;
  const shapeOptions = context.flowShapeOptionsByPractice.get(practice.id) || [];
  if (shapeOptions.length) result.shapeOptions = shapeOptions.map((row) => row.value);
  const entries = context.flowEntriesByPractice.get(practice.id) || [];
  const textEntry = entries.find((entry) => entry.entryKind === "text");
  if (textEntry) result.text = assembleFlowPracticeEntry(context, textEntry);
  const labelEntries = entries.filter((entry) => entry.entryKind === "label");
  if (labelEntries.length) {
    result.labels = Object.fromEntries(labelEntries.map((entry) => [entry.labelKey, assembleFlowPracticeEntry(context, entry)]));
  }
  return result;
}

function assembleFlowNode(context, node, nodesByParent, nodesByCase) {
  const result = {
    ...(node.hasContractKey ? { id: node.contractKey } : {}),
    kind: node.nodeKind,
    ...(node.hasComment ? { comment: node.comment } : {})
  };
  const practice = assembleFlowPractice(context, "node", node.id);
  if (practice) result.practice = practice;
  if (node.hasText) result.text = node.text;
  if (node.hasCondition) result.condition = node.condition;
  if (node.hasExpression) result.expression = node.expression;
  if (node.hasInit) result.init = node.init;
  if (node.hasUpdate) result.update = node.update;
  if (node.hasIterator) result.iterator = node.iterator;
  if (node.hasIterable) result.iterable = node.iterable;
  const children = nodesByParent.get(node.id) || [];
  const branch = (name) => children.filter((row) => row.branch === name).map((row) => assembleFlowNode(context, row, nodesByParent, nodesByCase));
  if (node.nodeKind === "sequence" && node.hasItems) result.items = branch("items");
  if (node.nodeKind === "if_then" && node.hasThenBranch) result.thenBranch = branch("thenBranch");
  if (node.nodeKind === "if_then_else") {
    if (node.hasThenBranch) result.thenBranch = branch("thenBranch");
    if (node.hasElseBranch) result.elseBranch = branch("elseBranch");
  }
  if (["while", "do_while", "for"].includes(node.nodeKind) && node.hasBody) result.body = branch("body");
  if (node.nodeKind === "if_chain" || node.nodeKind === "switch_case") {
    const caseRows = (context.flowCasesByNode.get(node.id) || []).filter((caseRow) => caseRow.caseKind !== "if_chain_branch");
    if (node.hasCases) result.cases = caseRows.map((caseRow) => {
      const isSwitch = caseRow.caseKind === "switch";
      const value = {
        ...(caseRow.hasContractKey ? { id: caseRow.contractKey } : {}),
        ...(isSwitch ? { match: caseRow.match } : { condition: caseRow.condition }),
        ...((isSwitch ? caseRow.hasBody : caseRow.hasThenBranch) ? {
          [isSwitch ? "body" : "thenBranch"]: (nodesByCase.get(caseRow.id) || [])
            .filter((child) => child.branch === (isSwitch ? "body" : "thenBranch"))
            .map((child) => assembleFlowNode(context, child, nodesByParent, nodesByCase))
        } : {})
      };
      const casePractice = assembleFlowPractice(context, "case", caseRow.id);
      if (casePractice) value.practice = casePractice;
      return value;
    });
    const chainBranches = (context.flowCasesByNode.get(node.id) || []).filter((caseRow) => caseRow.caseKind === "if_chain_branch");
    if (node.hasBranches || chainBranches.length) {
      result.branches = chainBranches.map((caseRow) => {
        const value = {
          ...(caseRow.hasContractKey ? { id: caseRow.contractKey } : {}),
          condition: caseRow.condition,
          ...(caseRow.hasItems ? {
            items: (nodesByCase.get(caseRow.id) || [])
              .filter((child) => child.branch === "items")
              .map((child) => assembleFlowNode(context, child, nodesByParent, nodesByCase))
          } : {})
        };
        const casePractice = assembleFlowPractice(context, "case", caseRow.id);
        if (casePractice) value.practice = casePractice;
        return value;
      });
    }
    if (node.nodeKind === "if_chain" && node.hasElseBranch) result.elseBranch = branch("elseBranch");
    if (node.nodeKind === "switch_case" && node.hasDefaultBranch) result.defaultBranch = branch("defaultBranch");
  }
  return result;
}

function assembleFlow(context, blockRow) {
  const nodes = context.flowNodesByBlock.get(blockRow.id) || [];
  const nodesByParent = groupRows(nodes.filter((row) => row.parentNodeId), "parentNodeId");
  const nodesByCase = groupRows(nodes.filter((row) => row.parentCaseId), "parentCaseId");
  const root = nodes.find((row) => !row.parentNodeId && !row.parentCaseId && row.branch === "root");
  if (!root) throw new RelationalMappingError(`Raiz de flow ausente no bloco ${blockRow.id}.`);
  return assembleFlowNode(context, root, nodesByParent, nodesByCase);
}

function assembleFormula(context, blockRow) {
  const nodes = (context.nodesByBlock.get(blockRow.id) || [])
    .filter((row) => row.nodeScope === "formula");
  const roots = nodes.filter((row) => row.parentNodeId == null);
  if (roots.length !== 1) {
    throw new RelationalMappingError(`Bloco formula ${blockRow.id} precisa de uma única raiz.`);
  }
  const childrenByParent = groupRows(nodes.filter((row) => row.parentNodeId != null), "parentNodeId");
  const visited = new Set();
  const assembled = new Set();
  const build = (row, depth = 1) => {
    if (depth > 32 || visited.has(row.id)) {
      throw new RelationalMappingError(`AST de formula cíclica ou profunda demais no bloco ${blockRow.id}.`);
    }
    visited.add(row.id);
    assembled.add(row.id);
    const children = childrenByParent.get(row.id) || [];
    const child = (position) => children.find((entry) => entry.position === position);
    const requiredChild = (position) => {
      const entry = child(position);
      if (!entry) throw new RelationalMappingError(`Filho ${position} ausente em ${row.nodeKind} do bloco ${blockRow.id}.`);
      return build(entry, depth + 1);
    };
    let result;
    if (["number", "identifier", "operator", "text"].includes(row.nodeKind)) {
      result = { type: row.nodeKind, value: row.formulaValue };
    } else if (row.nodeKind === "row") {
      result = { type: "row", children: children.map((entry) => build(entry, depth + 1)) };
    } else if (row.nodeKind === "fraction") {
      result = { type: "fraction", numerator: requiredChild(0), denominator: requiredChild(1) };
    } else if (row.nodeKind === "root") {
      result = { type: "root", radicand: requiredChild(0), ...(child(1) ? { index: requiredChild(1) } : {}) };
    } else if (row.nodeKind === "superscript") {
      result = { type: "superscript", base: requiredChild(0), exponent: requiredChild(1) };
    } else if (row.nodeKind === "subscript") {
      result = { type: "subscript", base: requiredChild(0), subscript: requiredChild(1) };
    } else if (row.nodeKind === "subsup") {
      result = {
        type: "subsup",
        base: requiredChild(0),
        subscript: requiredChild(1),
        superscript: requiredChild(2)
      };
    } else if (row.nodeKind === "fenced") {
      result = {
        type: "fenced",
        open: row.fenceOpen,
        close: row.fenceClose,
        content: requiredChild(0)
      };
    } else {
      throw new RelationalMappingError(`Tipo de nó formula desconhecido: ${row.nodeKind}.`);
    }
    visited.delete(row.id);
    return result;
  };
  const expression = build(roots[0]);
  if (assembled.size !== nodes.length) {
    throw new RelationalMappingError(`AST de formula contém nós desconectados no bloco ${blockRow.id}.`);
  }
  return expression;
}

function assembleBlock(context, blockRow, includeKind = true) {
  const result = includeKind
    ? { id: blockRow.contractKey, kind: blockRow.blockType }
    : {};
  const put = (flag, name, value = blockRow[name]) => {
    if (blockRow[flag]) result[name] = value;
  };
  put("hasValue", "value");
  put("hasPrompt", "prompt");
  put("hasQuestion", "question");
  put("hasLanguage", "language");
  put("hasCode", "code");
  put("hasLanguageTag", "languageTag");
  put("hasTextDirection", "textDirection");
  if (blockRow.semanticPayload && typeof blockRow.semanticPayload === "object") {
    Object.assign(result, structuredClone(blockRow.semanticPayload));
  }
  if (blockRow.blockType === "formula") {
    result.notation = blockRow.notation;
    result.accessibleText = blockRow.accessibleText;
    result.expression = assembleFormula(context, blockRow);
  }
  const options = assembleOptions(context, blockRow.id);
  if (options.length) {
    result.selectionMode = blockRow.selectionMode;
    result.selectionCriterion = blockRow.selectionCriterion;
    result.options = options;
    result.answerIds = (context.optionsByBlock.get(blockRow.id) || [])
      .filter((row) => row.isCorrect)
      .map((row) => row.contractKey);
  }
  const cells = context.cellsByBlock.get(blockRow.id) || [];
  if (blockRow.blockType === "table") {
    const grid = assembleGrid(cells.filter((row) => row.cellKind === "table"));
    result.columns = grid.columns;
    result.rows = grid.rows;
    if (blockRow.layoutPreset) result.layout = blockRow.layoutPreset;
    if (grid.columnMeta) result.columnMeta = grid.columnMeta;
  }
  if (blockRow.blockType === "flow") result.structure = assembleFlow(context, blockRow);
  if (blockRow.blockType === "tree") {
    result.variant = blockRow.treeVariant;
    result.nodes = (context.nodesByBlock.get(blockRow.id) || []).filter((row) => row.nodeScope === "tree").map((row) => ({
      id: row.contractKey,
      label: row.label,
      parentId: row.parentContractKey,
      ...(row.nodeKind ? { entryType: row.nodeKind } : {})
    }));
  }
  if (blockRow.blockType === "graph") {
    if (blockRow.layoutPreset) result.layout = blockRow.layoutPreset;
    result.vertices = (context.nodesByBlock.get(blockRow.id) || []).filter((row) => row.nodeScope === "graph").map((row) => ({
      id: row.contractKey,
      label: row.label
    }));
    result.edges = (context.edgesByBlock.get(blockRow.id) || []).filter((row) => row.edgeScope === "graph").map((row) => ({
      id: row.contractKey,
      from: row.fromContractKey,
      to: row.toContractKey,
      ...(row.hasLabel ? { label: row.label } : {}),
      ...(row.hasWeight ? { weight: row.weight } : {}),
      ...(row.hasDirected ? { directed: row.directed === true } : {})
    }));
    const highlight = assembleHighlight(context, blockRow, "graph");
    if (highlight !== undefined) result.highlight = highlight;
  }
  if (blockRow.blockType === "relation_map") {
    const nodes = context.nodesByBlock.get(blockRow.id) || [];
    result.leftSet = {
      label: blockRow.leftSetLabel,
      items: nodes.filter((row) => row.nodeScope === "relation_left").map((row) => ({ id: row.contractKey, label: row.label }))
    };
    result.rightSet = {
      label: blockRow.rightSetLabel,
      items: nodes.filter((row) => row.nodeScope === "relation_right").map((row) => ({ id: row.contractKey, label: row.label }))
    };
    result.relations = (context.edgesByBlock.get(blockRow.id) || []).filter((row) => row.edgeScope === "relation").map((row) => ({
      from: row.fromContractKey,
      to: row.toContractKey,
      ...(row.hasLabel ? { label: row.label } : {})
    }));
    if (blockRow.hasPairList) result.pairList = cells.filter((row) => row.cellKind === "pair_list").map(decodeCell);
    if (blockRow.hasRelationTable) result.relationTable = assembleGrid(cells.filter((row) => row.cellKind === "relation_table"));
    const highlight = assembleHighlight(context, blockRow, "relation");
    if (highlight !== undefined) result.highlight = highlight;
  }
  if (blockRow.blockType === "matrix") {
    const items = context.matrixItemsByBlock.get(blockRow.id) || [];
    const buildItem = (item) => {
      const grid = assembleGrid(cells.filter((row) => row.cellKind === "matrix" && row.matrixItemId === item.id));
      const value = {
        ...(item.hasName ? { name: item.name } : {}),
        ...(item.hasConnector ? { connector: item.connector } : {}),
        values: grid.rows
      };
      const highlight = assembleHighlight(context, { ...blockRow, hasHighlight: item.hasHighlight }, "matrix", item.id);
      if (highlight !== undefined) value.highlight = highlight;
      return value;
    };
    const main = items.find((item) => !item.isSequence);
    if (main) {
      const item = buildItem(main);
      if (main.hasName) result.name = main.name;
      result.values = item.values;
      if (item.highlight !== undefined) result.highlight = item.highlight;
    }
    const sequence = items.filter((item) => item.isSequence);
    if (sequence.length || blockRow.hasSequence) result.sequence = sequence.map(buildItem);
    if (blockRow.hasDividerAfterColumn) result.dividerAfterColumn = blockRow.dividerAfterColumn;
  }
  if (blockRow.blockType === "plane") {
    const points = context.pointsByBlock.get(blockRow.id) || [];
    const pairs = (role) => points.filter((row) => row.pointRole === role).map((row) => [row.x, row.y]);
    if (blockRow.hasXRange) result.x = structuredClone(blockRow.xRange);
    if (blockRow.hasYRange) result.y = structuredClone(blockRow.yRange);
    if (pairs("vector").length) result.vector = pairs("vector")[0];
    if (pairs("vectors").length) result.vectors = pairs("vectors");
    if (pairs("sum").length) result.sum = pairs("sum");
    if (blockRow.hasScale) result.scale = { k: blockRow.scaleK, vector: pairs("scale")[0] };
    if (pairs("distance").length) result.distance = pairs("distance");
    if (blockRow.hasResult) result.result = blockRow.resultText != null ? blockRow.resultText : pairs("result")[0];
  }
  return result;
}

function assembleCard(context, cardRow) {
  const card = {
    id: cardRow.contractKey,
    position: cardRow.position,
    resource: cardRow.resource,
    kind: cardRow.cardKind,
    exercise: cardRow.exercise,
    title: cardRow.title,
    ...(cardRow.hasLanguageTag ? { languageTag: cardRow.languageTag } : {}),
    ...(cardRow.hasTextDirection ? { textDirection: cardRow.textDirection } : {})
  };
  const blocks = context.blocksByCard.get(cardRow.id) || [];
  if (cardRow.resource === "composite") {
    card.blocks = blocks.filter((row) => row.region === "content").map((row) => assembleBlock(context, row, true));
  } else {
    const primary = blocks.find((row) => row.region === "primary");
    if (!primary) throw new RelationalMappingError(`Bloco primário ausente no card ${cardRow.id}.`);
    const fields = assembleBlock(context, primary, false);
    if (cardRow.resource === "paragraph") card.text = fields.value;
    else Object.assign(card, fields);
  }
  if (cardRow.hasAfter) card.after = cardRow.after;
  const afterBlocks = blocks.filter((row) => row.region === "after");
  if (afterBlocks.length) card.afterBlocks = afterBlocks.map((row) => assembleBlock(context, row, true));
  const sources = context.cardSourcesByCard.get(cardRow.id) || [];
  if (sources.length) card.sources = sources.map((row) => row.value);
  const topics = context.cardTopicsByCard.get(cardRow.id) || [];
  if (topics.length) card.topics = topics.map((row) => row.topicContractKey || context.topicIndex.get(row.topicId)?.contractKey || "");
  return card;
}

export function assembleMicrosequenceRow(context, row) {
  const result = {
    id: row.contractKey,
    title: row.title,
    goal: row.goal,
    role: row.role,
    status: row.status,
    ...(row.hasBranchOf ? { branchOf: row.branchOfContractKey } : {}),
    dependsOn: (context.dependenciesByMicrosequence.get(row.id) || []).map((dependency) => dependency.dependsOnContractKey),
    covers: assembleStatements(context, "microsequenceStatementsByMicrosequence", row.id, "cover"),
    checks: assembleStatements(context, "microsequenceStatementsByMicrosequence", row.id, "check"),
    ...(row.hasErrors ? { errors: assembleStatements(context, "microsequenceStatementsByMicrosequence", row.id, "error") } : {}),
    cards: (context.cardsByMicrosequence.get(row.id) || []).map((card) => assembleCard(context, card))
  };
  return result;
}

function assembleLesson(context, row) {
  return {
    id: row.contractKey,
    title: row.title,
    guide: assembleGuide(context, "lesson", row.id),
    topics: (context.topicsByLesson.get(row.id) || []).map((topic) => ({
      id: topic.contractKey,
      label: topic.label,
      kind: topic.topicKind,
      checks: assembleStatements(context, "topicStatementsByTopic", topic.id, "check"),
      errors: assembleStatements(context, "topicStatementsByTopic", topic.id, "error")
    })),
    microsequences: (context.microsequencesByLesson.get(row.id) || []).map((microsequence) => assembleMicrosequenceRow(context, microsequence))
  };
}

function assembleProject(rows) {
  const context = createContext(rows);
  const meta = active(rows, "projectMeta")[0] || null;
  const courseScopes = new Set(context.courses.map((course) => course.contractScope ?? null));
  if (!meta && courseScopes.size > 1) {
    throw new RelationalMappingError(
      "Os cursos persistidos possuem scopes de contrato incompatíveis."
    );
  }
  const persistedScope = meta?.hasScope
    ? meta.scope
    : courseScopes.size === 1
      ? [...courseScopes][0]
      : null;
  return {
    contract: meta?.contract || "aralearn.contract",
    version: meta?.version || 4,
    kind: meta?.kind || "project",
    ...(persistedScope != null ? { scope: persistedScope } : {}),
    courses: context.courses.map((course) => ({
      id: course.contractKey,
      title: course.title,
      goal: course.goal,
      modules: (context.modulesByCourse.get(course.id) || []).map((moduleValue) => ({
        id: moduleValue.contractKey,
        title: moduleValue.title,
        guide: assembleGuide(context, "module", moduleValue.id),
        lessons: (context.lessonsByModule.get(moduleValue.id) || []).map((lesson) => assembleLesson(context, lesson))
      }))
    }))
  };
}

export function relationalRowsToContract(rows, { validate = true } = {}) {
  const document = assembleProject(rows);
  if (validate) {
    const result = validateProjectDocument(document);
    if (!result.ok) {
      throw new RelationalMappingError("Documento remontado a partir das linhas é inválido.", result.errors);
    }
  }
  return document;
}

export function relationalRowsToMicrosequenceFragment(rows, microsequenceIdentity = null, { validate = true } = {}) {
  const context = createContext(rows);
  const candidates = active(rows, "microsequences");
  const row = microsequenceIdentity
    ? candidates.find((entry) => entry.id === microsequenceIdentity || entry.contractKey === microsequenceIdentity)
    : candidates[0];
  if (!row) throw new RelationalMappingError("Microssequência relacional não encontrada.");
  const fragment = assembleMicrosequenceRow(context, row);
  if (validate) {
    const wrapper = {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [{
        id: "fragment-course",
        title: "Fragmento",
        goal: "Validar fragmento.",
        modules: [{
          id: "fragment-module",
          title: "Fragmento",
          guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
          lessons: [{
            id: "fragment-lesson",
            title: "Fragmento",
            guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
            topics: [],
            microsequences: [fragment]
          }]
        }]
      }]
    };
    const result = validateProjectDocument(wrapper);
    if (!result.ok) throw new RelationalMappingError("Fragmento de microssequência remontado é inválido.", result.errors);
  }
  return fragment;
}
