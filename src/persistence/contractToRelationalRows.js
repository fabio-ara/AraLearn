import { validateProjectDocument } from "../domain/aralearnProject.js";
import {
  CARD_RESOURCES,
  COMPOSITE_BLOCK_KINDS,
  RelationalMappingError,
  assertAllowedFields,
  assertPlainObject,
  createEmptyRelationalRows,
  createIdentityAllocator,
  defaultUuidFactory
} from "./relationalSchema.js";

const ROOT_FIELDS = ["contract", "version", "kind", "scope", "courses"];
const COURSE_FIELDS = ["id", "title", "goal", "modules"];
const MODULE_FIELDS = ["id", "title", "guide", "lessons"];
const LESSON_FIELDS = ["id", "title", "guide", "topics", "microsequences"];
const GUIDE_FIELDS = ["goal", "include", "exclude", "notation", "avoid"];
const TOPIC_FIELDS = ["id", "label", "kind", "checks", "errors"];
const MICROSEQUENCE_FIELDS = [
  "id", "title", "goal", "role", "status", "branchOf", "dependsOn", "covers", "checks", "errors", "cards"
];
const COMMON_CARD_FIELDS = [
  "id", "position", "resource", "kind", "exercise", "title", "after", "afterBlocks", "sources", "topics",
  "languageTag", "textDirection"
];
const CHOICE_FIELDS = ["question", "selectionMode", "selectionCriterion", "options", "answerIds"];
const CARD_FIELDS = Object.freeze({
  paragraph: [...COMMON_CARD_FIELDS, "text"],
  choice: [...COMMON_CARD_FIELDS, ...CHOICE_FIELDS],
  composite: [...COMMON_CARD_FIELDS, "blocks"],
  code: [...COMMON_CARD_FIELDS, "prompt", "language", "code", ...CHOICE_FIELDS],
  table: [...COMMON_CARD_FIELDS, "layout", "columnMeta", "columns", "rows", ...CHOICE_FIELDS],
  flow: [...COMMON_CARD_FIELDS, "prompt", "structure", ...CHOICE_FIELDS],
  tree: [...COMMON_CARD_FIELDS, "prompt", "variant", "nodes", ...CHOICE_FIELDS],
  graph: [...COMMON_CARD_FIELDS, "prompt", "layout", "vertices", "edges", "highlight", ...CHOICE_FIELDS],
  relation_map: [...COMMON_CARD_FIELDS, "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight", ...CHOICE_FIELDS],
  matrix: [...COMMON_CARD_FIELDS, "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence", ...CHOICE_FIELDS],
  plane: [...COMMON_CARD_FIELDS, "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result", ...CHOICE_FIELDS],
  formula: [...COMMON_CARD_FIELDS, "prompt", "notation", "accessibleText", "expression", ...CHOICE_FIELDS],
  chart: [...COMMON_CARD_FIELDS, "prompt", "chartType", "xAxis", "yAxis", "series", "highlight", ...CHOICE_FIELDS],
  sequence: [...COMMON_CARD_FIELDS, "prompt", "variant", "items", "highlight", ...CHOICE_FIELDS],
  annotated_text: [...COMMON_CARD_FIELDS, "prompt", "segments", "annotations", ...CHOICE_FIELDS],
  linguistic_example: [...COMMON_CARD_FIELDS, "prompt", "writingMode", "alignment", "units", ...CHOICE_FIELDS],
  system_map: [...COMMON_CARD_FIELDS, "prompt", "groups", "nodes", "links", "highlight", ...CHOICE_FIELDS],
  reaction: [
    ...COMMON_CARD_FIELDS,
    "prompt",
    "reactionType",
    "reactants",
    "products",
    "conditions",
    "highlight",
    ...CHOICE_FIELDS
  ]
});
const BLOCK_FIELDS = Object.freeze({
  heading: ["id", "kind", "value", "languageTag", "textDirection"],
  paragraph: ["id", "kind", "value", "languageTag", "textDirection"],
  choice: ["id", "kind", ...CHOICE_FIELDS, "languageTag", "textDirection"],
  code: ["id", "kind", "prompt", "language", "code", "languageTag", "textDirection"],
  table: ["id", "kind", "layout", "columnMeta", "columns", "rows", "languageTag", "textDirection"],
  flow: ["id", "kind", "prompt", "structure", "languageTag", "textDirection"],
  tree: ["id", "kind", "prompt", "variant", "nodes", "languageTag", "textDirection"],
  graph: ["id", "kind", "prompt", "layout", "vertices", "edges", "highlight", "languageTag", "textDirection"],
  relation_map: ["id", "kind", "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight", "languageTag", "textDirection"],
  matrix: ["id", "kind", "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence", "languageTag", "textDirection"],
  plane: ["id", "kind", "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result", "languageTag", "textDirection"],
  formula: ["id", "kind", "prompt", "notation", "accessibleText", "expression", "languageTag", "textDirection"],
  chart: ["id", "kind", "prompt", "chartType", "xAxis", "yAxis", "series", "highlight", "languageTag", "textDirection"],
  sequence: ["id", "kind", "prompt", "variant", "items", "highlight", "languageTag", "textDirection"],
  annotated_text: ["id", "kind", "prompt", "segments", "annotations", "languageTag", "textDirection"],
  linguistic_example: ["id", "kind", "prompt", "writingMode", "alignment", "units", "languageTag", "textDirection"],
  system_map: ["id", "kind", "prompt", "groups", "nodes", "links", "highlight", "languageTag", "textDirection"],
  reaction: [
    "id",
    "kind",
    "prompt",
    "reactionType",
    "reactants",
    "products",
    "conditions",
    "highlight",
    "languageTag",
    "textDirection"
  ]
});

const SEMANTIC_PAYLOAD_FIELDS = Object.freeze({
  chart: ["chartType", "xAxis", "yAxis", "series", "highlight"],
  sequence: ["variant", "items", "highlight"],
  annotated_text: ["segments", "annotations"],
  linguistic_example: ["writingMode", "alignment", "units"],
  system_map: ["groups", "nodes", "links", "highlight"],
  reaction: ["reactionType", "reactants", "products", "conditions", "highlight"]
});

function text(value) {
  return typeof value === "string" ? value : "";
}

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value, fieldName);
}

function requireArray(value, fieldName, path) {
  if (!Array.isArray(value?.[fieldName])) {
    throw new RelationalMappingError(`${path}.${fieldName} deve ser array.`);
  }
  return value[fieldName];
}

function assertStringFields(value, fieldNames, path) {
  fieldNames.forEach((fieldName) => {
    if (hasOwn(value, fieldName) && typeof value[fieldName] !== "string") {
      throw new RelationalMappingError(`${path}.${fieldName} deve ser string.`);
    }
  });
}

function validationError(result) {
  return new RelationalMappingError(
    "Documento AraLearn v4 inválido.",
    (result?.errors || []).map((entry) => ({ path: entry.path, message: entry.message }))
  );
}

function createState(options = {}) {
  const rows = createEmptyRelationalRows();
  const allocator = createIdentityAllocator({
    uuidFactory: options.uuidFactory || defaultUuidFactory,
    identityMap: options.identityMap || new Map()
  });
  return {
    rows,
    allocator,
    add(collection, identityKey, values) {
      const row = allocator.row(identityKey, values);
      rows[collection].push(row);
      return row;
    }
  };
}

function addGuide(state, { courseId, ownerType, ownerId, guide, identityPath, jsonPath }) {
  assertAllowedFields(guide, GUIDE_FIELDS, jsonPath);
  const guideRow = state.add("guides", `${identityPath}/guide`, {
    courseId,
    ownerType,
    ownerId,
    goal: text(guide.goal)
  });
  ["include", "exclude", "notation", "avoid"].forEach((itemType) => {
    requireArray(guide, itemType, jsonPath).forEach((value, position) => {
      state.add("guideItems", `${identityPath}/guide/${itemType}:${position}`, {
        courseId,
        guideId: guideRow.id,
        itemType,
        position,
        value: text(value)
      });
    });
  });
  return guideRow;
}

function addStatementRows(state, collection, { courseId, parentField, parentId, statementType, values, identityPath }) {
  (Array.isArray(values) ? values : []).forEach((value, position) => {
    state.add(collection, `${identityPath}/${statementType}:${position}`, {
      courseId,
      [parentField]: parentId,
      statementType,
      position,
      value: text(value)
    });
  });
}

function encodeScalar(value) {
  if (value === null) return { valueType: "null", textValue: null, numberValue: null, booleanValue: null };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { valueType: "number", textValue: null, numberValue: value, booleanValue: null };
  }
  if (typeof value === "boolean") {
    return { valueType: "boolean", textValue: null, numberValue: null, booleanValue: value };
  }
  if (typeof value === "string") {
    return { valueType: "string", textValue: value, numberValue: null, booleanValue: null };
  }
  throw new RelationalMappingError("Célula relacional aceita somente escalares JSON.");
}

function addCell(state, identityKey, values, value) {
  return state.add("cells", identityKey, { ...values, ...encodeScalar(value) });
}

function addOptions(state, blockRow, options, answerIds, identityPath, jsonPath) {
  const expectedIds = new Set(
    (Array.isArray(answerIds) ? answerIds : []).map((answerId) => text(answerId))
  );
  requireArray({ options }, "options", jsonPath).forEach((option, position) => {
    assertPlainObject(option, `${jsonPath}.options[${position}]`);
    const isCode = option.kind === "code" || hasOwn(option, "code") || hasOwn(option, "language");
    assertAllowedFields(
      option,
      isCode
        ? ["id", "kind", "language", "code", "feedback", "misconceptionId"]
        : ["id", "kind", "text", "feedback", "misconceptionId"],
      `${jsonPath}.options[${position}]`
    );
    const contractKey = text(option.id) || `option-${position + 1}`;
    state.add("options", `${identityPath}/option:${contractKey}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      contractKey,
      position,
      optionKind: isCode ? "code" : "text",
      hasKind: hasOwn(option, "kind"),
      text: isCode ? null : text(option.text),
      language: isCode ? text(option.language) : null,
      code: isCode ? text(option.code).replace(/\r\n/g, "\n") : null,
      feedback: hasOwn(option, "feedback") ? text(option.feedback) : null,
      misconceptionId: hasOwn(option, "misconceptionId") ? text(option.misconceptionId) : null,
      hasFeedback: hasOwn(option, "feedback"),
      hasMisconceptionId: hasOwn(option, "misconceptionId"),
      isCorrect: expectedIds.has(contractKey)
    });
  });
}

function addHighlights(state, blockRow, highlight, identityPath, context, matrixItemId = null) {
  if (highlight === undefined) return;
  assertPlainObject(highlight, `${identityPath}.highlight`);
  const allowed = context === "matrix"
    ? ["pattern", "cells", "rows", "columns"]
    : context === "graph"
      ? ["vertices", "edges"]
      : ["leftItems", "rightItems", "relations"];
  assertAllowedFields(highlight, allowed, `${identityPath}.highlight`);
  const add = (selectionType, position, values = {}) => state.add(
    "highlights",
    `${identityPath}/highlight:${selectionType}:${position}`,
    { courseId: blockRow.courseId, blockId: blockRow.id, matrixItemId, selectionType, position, ...values }
  );
  if (hasOwn(highlight, "pattern")) add("pattern", 0, { value: text(highlight.pattern) });
  (highlight.cells || []).forEach((pair, position) => add("cell", position, { rowIndex: Number(pair?.[0]), columnIndex: Number(pair?.[1]) }));
  (highlight.rows || []).forEach((value, position) => add("row", position, { rowIndex: Number(value) }));
  (highlight.columns || []).forEach((value, position) => add("column", position, { columnIndex: Number(value) }));
  (highlight.vertices || []).forEach((value, position) => add("vertex", position, { value: text(value) }));
  (highlight.edges || []).forEach((value, position) => add("edge", position, { value: text(value) }));
  (highlight.leftItems || []).forEach((value, position) => add("leftItem", position, { value: text(value) }));
  (highlight.rightItems || []).forEach((value, position) => add("rightItem", position, { value: text(value) }));
  (highlight.relations || []).forEach((pair, position) => add("relation", position, { fromContractKey: text(pair?.[0]), toContractKey: text(pair?.[1]) }));
}

function addTabularCells(
  state,
  blockRow,
  columns,
  rows,
  identityPath,
  cellKind,
  matrixItemId = null,
  columnMeta = []
) {
  (Array.isArray(columns) ? columns : []).forEach((value, columnIndex) => {
    const meta = Array.isArray(columnMeta) ? columnMeta[columnIndex] : null;
    addCell(state, `${identityPath}/${cellKind}:header:${columnIndex}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      matrixItemId,
      cellKind,
      rowIndex: -1,
      columnIndex,
      position: columnIndex,
      columnAlign: meta?.align || null,
      wrapText: typeof meta?.wrap === "boolean" ? meta.wrap : null,
      hasColumnMeta: Boolean(meta)
    }, value);
  });
  (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    (Array.isArray(row) ? row : []).forEach((value, columnIndex) => {
      addCell(state, `${identityPath}/${cellKind}:${rowIndex}:${columnIndex}`, {
        courseId: blockRow.courseId,
        blockId: blockRow.id,
        matrixItemId,
        cellKind,
        rowIndex,
        columnIndex,
        position: rowIndex * 1000 + columnIndex
      }, value);
    });
  });
}

function addGraph(state, blockRow, source, identityPath, jsonPath) {
  const nodeIds = new Map();
  requireArray(source, "vertices", jsonPath).forEach((vertex, position) => {
    assertAllowedFields(vertex, ["id", "label"], `${jsonPath}.vertices[${position}]`);
    const contractKey = text(vertex.id);
    const row = state.add("nodes", `${identityPath}/graph-node:${contractKey}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      nodeScope: "graph",
      contractKey,
      position,
      label: text(vertex.label),
      nodeKind: "vertex",
      parentNodeId: null,
      parentContractKey: null
    });
    nodeIds.set(contractKey, row.id);
  });
  requireArray(source, "edges", jsonPath).forEach((edge, position) => {
    assertAllowedFields(edge, ["id", "from", "to", "label", "weight", "directed"], `${jsonPath}.edges[${position}]`);
    const contractKey = text(edge.id);
    state.add("edges", `${identityPath}/graph-edge:${contractKey}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      edgeScope: "graph",
      contractKey,
      position,
      fromNodeId: nodeIds.get(text(edge.from)) || null,
      toNodeId: nodeIds.get(text(edge.to)) || null,
      fromContractKey: text(edge.from),
      toContractKey: text(edge.to),
      label: hasOwn(edge, "label") ? text(edge.label) : null,
      weight: hasOwn(edge, "weight") ? text(edge.weight) : null,
      hasLabel: hasOwn(edge, "label"),
      hasWeight: hasOwn(edge, "weight"),
      directed: edge?.directed === true,
      hasDirected: hasOwn(edge, "directed")
    });
  });
  addHighlights(state, blockRow, source.highlight, identityPath, "graph");
}

function addTree(state, blockRow, source, identityPath, jsonPath) {
  const rowsByKey = new Map();
  requireArray(source, "nodes", jsonPath).forEach((node, position) => {
    assertAllowedFields(node, ["id", "label", "entryType", "parentId"], `${jsonPath}.nodes[${position}]`);
    const contractKey = text(node.id);
    const row = state.add("nodes", `${identityPath}/tree-node:${contractKey}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      nodeScope: "tree",
      contractKey,
      position,
      label: text(node.label),
      nodeKind: hasOwn(node, "entryType") ? text(node.entryType) : null,
      parentNodeId: null,
      parentContractKey: node.parentId == null ? null : text(node.parentId),
      x: null,
      y: null,
      hasX: false,
      hasY: false
    });
    rowsByKey.set(contractKey, row);
  });
  rowsByKey.forEach((row) => {
    row.parentNodeId = row.parentContractKey == null ? null : rowsByKey.get(row.parentContractKey)?.id || null;
  });
}

function addFormulaExpression(state, blockRow, expression, identityPath) {
  let sequence = 0;
  const addNode = (node, parent = null, position = 0, nodePath = "root") => {
    const contractKey = `formula-node-${sequence++}`;
    const row = state.add("nodes", `${identityPath}/formula:${nodePath}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      nodeScope: "formula",
      contractKey,
      position,
      label: null,
      nodeKind: text(node?.type),
      parentNodeId: parent?.id || null,
      parentContractKey: parent?.contractKey || null,
      formulaValue: hasOwn(node || {}, "value") ? text(node.value) : null,
      fenceOpen: hasOwn(node || {}, "open") ? text(node.open) : null,
      fenceClose: hasOwn(node || {}, "close") ? text(node.close) : null,
      x: null,
      y: null,
      hasX: false,
      hasY: false
    });
    const children = (() => {
      switch (node?.type) {
        case "row": return node.children || [];
        case "fraction": return [node.numerator, node.denominator];
        case "root": return node.index === undefined ? [node.radicand] : [node.radicand, node.index];
        case "superscript": return [node.base, node.exponent];
        case "subscript": return [node.base, node.subscript];
        case "subsup": return [node.base, node.subscript, node.superscript];
        case "fenced": return [node.content];
        default: return [];
      }
    })();
    children.forEach((child, childPosition) => addNode(
      child,
      row,
      childPosition,
      `${nodePath}.${childPosition}`
    ));
    return row;
  };
  addNode(expression);
}

function addRelationMap(state, blockRow, source, identityPath, jsonPath) {
  const sideMaps = { left: new Map(), right: new Map() };
  [["left", source.leftSet], ["right", source.rightSet]].forEach(([side, setValue]) => {
    assertAllowedFields(setValue, ["label", "items"], `${jsonPath}.${side}Set`);
    requireArray(setValue, "items", `${jsonPath}.${side}Set`).forEach((item, position) => {
      assertAllowedFields(item, ["id", "label"], `${jsonPath}.${side}Set.items[${position}]`);
      const contractKey = text(item.id);
      const row = state.add("nodes", `${identityPath}/relation-${side}:${contractKey}`, {
        courseId: blockRow.courseId,
        blockId: blockRow.id,
        nodeScope: `relation_${side}`,
        contractKey,
        position,
        label: text(item.label),
        nodeKind: "set_item",
        parentNodeId: null,
        parentContractKey: null,
        x: null,
        y: null,
        hasX: false,
        hasY: false
      });
      sideMaps[side].set(contractKey, row.id);
    });
  });
  requireArray(source, "relations", jsonPath).forEach((relation, position) => {
    assertAllowedFields(relation, ["from", "to", "label"], `${jsonPath}.relations[${position}]`);
    state.add("edges", `${identityPath}/relation:${position}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      edgeScope: "relation",
      position,
      fromNodeId: sideMaps.left.get(text(relation.from)) || null,
      toNodeId: sideMaps.right.get(text(relation.to)) || null,
      fromContractKey: text(relation.from),
      toContractKey: text(relation.to),
      label: hasOwn(relation, "label") ? text(relation.label) : null,
      weight: null,
      hasLabel: hasOwn(relation, "label"),
      hasWeight: false,
      directed: false,
      hasDirected: false
    });
  });
  if (hasOwn(source, "pairList")) {
    requireArray(source, "pairList", jsonPath).forEach((value, position) => {
      addCell(state, `${identityPath}/pair-list:${position}`, {
        courseId: blockRow.courseId,
        blockId: blockRow.id,
        matrixItemId: null,
        cellKind: "pair_list",
        rowIndex: position,
        columnIndex: 0,
        position
      }, value);
    });
  }
  if (hasOwn(source, "relationTable")) {
    assertAllowedFields(source.relationTable, ["columns", "rows"], `${jsonPath}.relationTable`);
    addTabularCells(state, blockRow, source.relationTable.columns, source.relationTable.rows, `${identityPath}/relation-table`, "relation_table");
  }
  addHighlights(state, blockRow, source.highlight, identityPath, "relation");
}

function addMatrix(state, blockRow, source, identityPath, jsonPath) {
  const addItem = (item, position, isSequence) => {
    assertAllowedFields(item, ["name", "connector", "values", "highlight"], `${jsonPath}.${isSequence ? `sequence[${position}]` : "values"}`);
    const matrixRow = state.add("matrixItems", `${identityPath}/matrix:${isSequence ? position : "main"}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      position,
      isSequence,
      name: hasOwn(item, "name") ? text(item.name) : null,
      connector: hasOwn(item, "connector") ? text(item.connector) : null,
      hasName: hasOwn(item, "name"),
      hasConnector: hasOwn(item, "connector"),
      hasHighlight: hasOwn(item, "highlight")
    });
    addTabularCells(state, blockRow, [], item.values, `${identityPath}/matrix:${isSequence ? position : "main"}`, "matrix", matrixRow.id);
    addHighlights(state, blockRow, item.highlight, `${identityPath}/matrix:${isSequence ? position : "main"}`, "matrix", matrixRow.id);
  };
  if (hasOwn(source, "values")) {
    addItem({
      ...(hasOwn(source, "name") ? { name: source.name } : {}),
      values: source.values,
      ...(hasOwn(source, "highlight") ? { highlight: source.highlight } : {})
    }, 0, false);
  }
  if (hasOwn(source, "sequence")) {
    requireArray(source, "sequence", jsonPath).forEach((item, position) => addItem(item, position, true));
  }
}

function addPlanePoint(state, blockRow, identityPath, pointRole, position, pair) {
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new RelationalMappingError(`${identityPath}.${pointRole}[${position}] precisa ser [x, y].`);
  }
  return state.add("points", `${identityPath}/point:${pointRole}:${position}`, {
    courseId: blockRow.courseId,
    blockId: blockRow.id,
    pointRole,
    position,
    x: Number(pair[0]),
    y: Number(pair[1]),
    label: null
  });
}

function addPlane(state, blockRow, source, identityPath) {
  const origin = addPlanePoint(state, blockRow, identityPath, "origin", 0, [0, 0]);
  const addVectorFamily = (fieldName) => {
    const pairs = fieldName === "vector" || fieldName === "scale" ? [fieldName === "scale" ? source.scale.vector : source.vector] : source[fieldName];
    (pairs || []).forEach((pair, position) => {
      const point = addPlanePoint(state, blockRow, identityPath, fieldName, position, pair);
      state.add("lines", `${identityPath}/line:${fieldName}:${position}`, {
        courseId: blockRow.courseId,
        blockId: blockRow.id,
        lineRole: fieldName,
        position,
        fromPointId: origin.id,
        toPointId: point.id,
        x1: 0,
        y1: 0,
        x2: point.x,
        y2: point.y,
        label: null
      });
    });
  };
  if (hasOwn(source, "vector")) addVectorFamily("vector");
  if (hasOwn(source, "vectors")) addVectorFamily("vectors");
  if (hasOwn(source, "sum")) addVectorFamily("sum");
  if (hasOwn(source, "scale")) {
    assertAllowedFields(source.scale, ["k", "vector"], `${identityPath}.scale`);
    addVectorFamily("scale");
  }
  if (hasOwn(source, "distance")) {
    const points = source.distance.map((pair, position) => addPlanePoint(state, blockRow, identityPath, "distance", position, pair));
    if (points.length === 2) {
      state.add("lines", `${identityPath}/line:distance:0`, {
        courseId: blockRow.courseId,
        blockId: blockRow.id,
        lineRole: "distance",
        position: 0,
        fromPointId: points[0].id,
        toPointId: points[1].id,
        x1: points[0].x,
        y1: points[0].y,
        x2: points[1].x,
        y2: points[1].y,
        label: null
      });
    }
  }
  if (hasOwn(source, "result") && Array.isArray(source.result)) {
    addPlanePoint(state, blockRow, identityPath, "result", 0, source.result);
  }
}

const FLOW_COMMON_FIELDS = ["id", "kind", "comment", "practice"];
const FLOW_FIELDS = Object.freeze({
  sequence: [...FLOW_COMMON_FIELDS, "items"],
  start: [...FLOW_COMMON_FIELDS, "text"],
  end: [...FLOW_COMMON_FIELDS, "text"],
  input: [...FLOW_COMMON_FIELDS, "text"],
  output: [...FLOW_COMMON_FIELDS, "text"],
  process: [...FLOW_COMMON_FIELDS, "text"],
  if_then: [...FLOW_COMMON_FIELDS, "condition", "thenBranch"],
  if_then_else: [...FLOW_COMMON_FIELDS, "condition", "thenBranch", "elseBranch"],
  while: [...FLOW_COMMON_FIELDS, "condition", "body"],
  do_while: [...FLOW_COMMON_FIELDS, "condition", "body"],
  for: [...FLOW_COMMON_FIELDS, "init", "condition", "update", "iterator", "iterable", "body"],
  if_chain: [...FLOW_COMMON_FIELDS, "cases", "branches", "elseBranch"],
  switch_case: [...FLOW_COMMON_FIELDS, "expression", "cases", "defaultBranch"]
});

function addFlowPracticeEntry(state, practiceRow, entryKind, labelKey, raw, identityPath, position) {
  const entryPath = `${identityPath}/${entryKind}:${labelKey ?? position}`;
  if (raw === true) {
    return state.add("flowPracticeEntries", entryPath, {
      courseId: practiceRow.courseId,
      practiceId: practiceRow.id,
      entryKind,
      labelKey,
      position,
      wasBoolean: true,
      hasBlank: false,
      blank: true,
      hasMode: false,
      mode: null
    });
  }
  assertAllowedFields(raw, ["blank", "mode", "options", "variants"], entryPath);
  const entryRow = state.add("flowPracticeEntries", entryPath, {
    courseId: practiceRow.courseId,
    practiceId: practiceRow.id,
    entryKind,
    labelKey,
    position,
    wasBoolean: false,
    hasBlank: hasOwn(raw, "blank"),
    blank: raw.blank === true,
    hasMode: hasOwn(raw, "mode"),
    mode: hasOwn(raw, "mode") ? text(raw.mode) : null
  });
  (raw.options || []).forEach((option, optionPosition) => {
    const wasPrimitive = !option || typeof option !== "object" || Array.isArray(option);
    const source = wasPrimitive ? { value: option } : option;
    if (!wasPrimitive) assertAllowedFields(source, ["id", "value", "enabled"], `${entryPath}.options[${optionPosition}]`);
    state.add("flowPracticeOptions", `${entryPath}/option:${optionPosition}`, {
      courseId: practiceRow.courseId,
      entryId: entryRow.id,
      position: optionPosition,
      wasPrimitive,
      contractKey: hasOwn(source, "id") ? text(source.id) : null,
      hasContractKey: hasOwn(source, "id"),
      value: text(source.value),
      enabled: source.enabled !== false,
      hasEnabled: hasOwn(source, "enabled")
    });
  });
  (raw.variants || []).forEach((variant, variantPosition) => {
    const wasPrimitive = !variant || typeof variant !== "object" || Array.isArray(variant);
    const source = wasPrimitive ? { value: variant } : variant;
    if (!wasPrimitive) assertAllowedFields(source, ["id", "value"], `${entryPath}.variants[${variantPosition}]`);
    state.add("flowPracticeVariants", `${entryPath}/variant:${variantPosition}`, {
      courseId: practiceRow.courseId,
      entryId: entryRow.id,
      position: variantPosition,
      wasPrimitive,
      contractKey: hasOwn(source, "id") ? text(source.id) : null,
      hasContractKey: hasOwn(source, "id"),
      value: text(source.value)
    });
  });
  return entryRow;
}

function addFlowPractice(state, owner, raw, identityPath) {
  if (!raw) return null;
  assertAllowedFields(raw, ["blankShape", "shapeOptions", "text", "labels", "blankText", "blankLabel"], `${identityPath}.practice`);
  const practiceRow = state.add("flowPractices", `${identityPath}/practice`, {
    courseId: owner.courseId,
    ownerType: owner.ownerType,
    ownerId: owner.id,
    hasBlankShape: hasOwn(raw, "blankShape"),
    blankShape: raw.blankShape === true,
    hasBlankText: hasOwn(raw, "blankText"),
    blankText: raw.blankText === true,
    hasBlankLabel: hasOwn(raw, "blankLabel"),
    blankLabel: raw.blankLabel === true
  });
  (raw.shapeOptions || []).forEach((value, position) => {
    state.add("flowShapeOptions", `${identityPath}/practice/shape:${position}`, {
      courseId: owner.courseId,
      practiceId: practiceRow.id,
      position,
      value: text(value)
    });
  });
  if (hasOwn(raw, "text")) addFlowPracticeEntry(state, practiceRow, "text", null, raw.text, `${identityPath}/practice`, 0);
  if (hasOwn(raw, "labels")) {
    assertPlainObject(raw.labels, `${identityPath}.practice.labels`);
    Object.entries(raw.labels).forEach(([labelKey, entry], position) => {
      addFlowPracticeEntry(state, practiceRow, "label", labelKey, entry, `${identityPath}/practice`, position);
    });
  }
  return practiceRow;
}

function addFlowNode(state, blockRow, raw, identityPath, jsonPath, parent = {}) {
  assertPlainObject(raw, jsonPath);
  const kind = text(raw.kind);
  if (!FLOW_FIELDS[kind]) throw new RelationalMappingError(`${jsonPath}.kind não possui mapeamento relacional: ${kind}.`);
  assertAllowedFields(raw, FLOW_FIELDS[kind], jsonPath);
  assertStringFields(
    raw,
    ["id", "kind", "text", "condition", "expression", "init", "update", "iterator", "iterable", "comment"],
    jsonPath
  );
  const row = state.add("flowNodes", identityPath, {
    courseId: blockRow.courseId,
    blockId: blockRow.id,
    parentNodeId: parent.parentNodeId || null,
    parentCaseId: parent.parentCaseId || null,
    branch: parent.branch || "root",
    position: parent.position || 0,
    contractKey: hasOwn(raw, "id") ? text(raw.id) : null,
    hasContractKey: hasOwn(raw, "id"),
    nodeKind: kind,
    text: hasOwn(raw, "text") ? text(raw.text) : null,
    condition: hasOwn(raw, "condition") ? text(raw.condition) : null,
    expression: hasOwn(raw, "expression") ? text(raw.expression) : null,
    init: hasOwn(raw, "init") ? text(raw.init) : null,
    update: hasOwn(raw, "update") ? text(raw.update) : null,
    iterator: hasOwn(raw, "iterator") ? text(raw.iterator) : null,
    iterable: hasOwn(raw, "iterable") ? text(raw.iterable) : null,
    comment: hasOwn(raw, "comment") ? text(raw.comment) : null,
    hasText: hasOwn(raw, "text"),
    hasCondition: hasOwn(raw, "condition"),
    hasExpression: hasOwn(raw, "expression"),
    hasInit: hasOwn(raw, "init"),
    hasUpdate: hasOwn(raw, "update"),
    hasIterator: hasOwn(raw, "iterator"),
    hasIterable: hasOwn(raw, "iterable"),
    hasCases: hasOwn(raw, "cases"),
    hasBranches: hasOwn(raw, "branches"),
    hasItems: hasOwn(raw, "items"),
    hasThenBranch: hasOwn(raw, "thenBranch"),
    hasElseBranch: hasOwn(raw, "elseBranch"),
    hasBody: hasOwn(raw, "body"),
    hasDefaultBranch: hasOwn(raw, "defaultBranch"),
    hasComment: hasOwn(raw, "comment")
  });
  if (hasOwn(raw, "practice")) addFlowPractice(state, { ...row, ownerType: "node" }, raw.practice, identityPath);
  const addBranch = (branchName) => {
    (raw[branchName] || []).forEach((child, position) => addFlowNode(
      state,
      blockRow,
      child,
      `${identityPath}/${branchName}:${position}`,
      `${jsonPath}.${branchName}[${position}]`,
      { parentNodeId: row.id, branch: branchName, position }
    ));
  };
  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((branchName) => {
    if (hasOwn(raw, branchName)) addBranch(branchName);
  });
  (raw.cases || []).forEach((caseValue, position) => {
    const isSwitch = kind === "switch_case";
    const fields = isSwitch ? ["id", "match", "body", "practice"] : ["id", "condition", "thenBranch", "practice"];
    assertAllowedFields(caseValue, fields, `${jsonPath}.cases[${position}]`);
    assertStringFields(caseValue, ["id", "condition", "match"], `${jsonPath}.cases[${position}]`);
    const caseRow = state.add("flowCases", `${identityPath}/case:${position}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      flowNodeId: row.id,
      position,
      caseKind: isSwitch ? "switch" : "if_chain",
      contractKey: hasOwn(caseValue, "id") ? text(caseValue.id) : null,
      hasContractKey: hasOwn(caseValue, "id"),
      condition: hasOwn(caseValue, "condition") ? text(caseValue.condition) : null,
      match: hasOwn(caseValue, "match") ? text(caseValue.match) : null,
      hasThenBranch: hasOwn(caseValue, "thenBranch"),
      hasBody: hasOwn(caseValue, "body")
    });
    if (hasOwn(caseValue, "practice")) addFlowPractice(state, { ...caseRow, ownerType: "case" }, caseValue.practice, `${identityPath}/case:${position}`);
    const branchName = isSwitch ? "body" : "thenBranch";
    (caseValue[branchName] || []).forEach((child, childPosition) => addFlowNode(
      state,
      blockRow,
      child,
      `${identityPath}/case:${position}/${branchName}:${childPosition}`,
      `${jsonPath}.cases[${position}].${branchName}[${childPosition}]`,
      { parentCaseId: caseRow.id, branch: branchName, position: childPosition }
    ));
  });
  (raw.branches || []).forEach((caseValue, position) => {
    assertAllowedFields(caseValue, ["id", "condition", "items", "practice"], `${jsonPath}.branches[${position}]`);
    assertStringFields(caseValue, ["id", "condition"], `${jsonPath}.branches[${position}]`);
    const caseRow = state.add("flowCases", `${identityPath}/branch:${position}`, {
      courseId: blockRow.courseId,
      blockId: blockRow.id,
      flowNodeId: row.id,
      position,
      caseKind: "if_chain_branch",
      contractKey: hasOwn(caseValue, "id") ? text(caseValue.id) : null,
      hasContractKey: hasOwn(caseValue, "id"),
      condition: hasOwn(caseValue, "condition") ? text(caseValue.condition) : null,
      match: null,
      hasItems: hasOwn(caseValue, "items")
    });
    if (hasOwn(caseValue, "practice")) {
      addFlowPractice(state, { ...caseRow, ownerType: "case" }, caseValue.practice, `${identityPath}/branch:${position}`);
    }
    (caseValue.items || []).forEach((child, childPosition) => addFlowNode(
      state,
      blockRow,
      child,
      `${identityPath}/branch:${position}/items:${childPosition}`,
      `${jsonPath}.branches[${position}].items[${childPosition}]`,
      { parentCaseId: caseRow.id, branch: "items", position: childPosition }
    ));
  });
  return row;
}

function addBlock(state, { cardRow, source, region, position, identityPath, jsonPath, isPrimary = false }) {
  const kind = isPrimary ? cardRow.resource : text(source.kind);
  if (!COMPOSITE_BLOCK_KINDS.includes(kind)) {
    throw new RelationalMappingError(`${jsonPath}.kind inválido: ${kind}.`);
  }
  if (!isPrimary) assertAllowedFields(source, BLOCK_FIELDS[kind], jsonPath);
  const semanticPayloadFields = SEMANTIC_PAYLOAD_FIELDS[kind] || [];
  const blockRow = state.add("blocks", identityPath, {
    courseId: cardRow.courseId,
    cardId: cardRow.id,
    region,
    position,
    blockType: kind,
    isPrimary,
    contractKey: isPrimary ? null : text(source.id),
    value: hasOwn(source, "value") ? text(source.value) : null,
    prompt: hasOwn(source, "prompt") ? text(source.prompt) : null,
    notation: hasOwn(source, "notation") ? text(source.notation) : null,
    accessibleText: hasOwn(source, "accessibleText") ? text(source.accessibleText) : null,
    question: hasOwn(source, "question") ? text(source.question) : null,
    selectionMode: hasOwn(source, "selectionMode") ? text(source.selectionMode) : null,
    selectionCriterion: hasOwn(source, "selectionCriterion") ? text(source.selectionCriterion) : null,
    language: hasOwn(source, "language") ? text(source.language) : null,
    code: hasOwn(source, "code") ? text(source.code).replace(/\r\n/g, "\n") : null,
    name: hasOwn(source, "name") ? text(source.name) : null,
    dividerAfterColumn: hasOwn(source, "dividerAfterColumn") ? Number(source.dividerAfterColumn) : null,
    leftSetLabel: hasOwn(source, "leftSet") ? text(source.leftSet?.label) : null,
    rightSetLabel: hasOwn(source, "rightSet") ? text(source.rightSet?.label) : null,
    hasValue: hasOwn(source, "value"),
    hasPrompt: hasOwn(source, "prompt"),
    hasQuestion: hasOwn(source, "question"),
    hasLanguage: hasOwn(source, "language"),
    hasCode: hasOwn(source, "code"),
    hasName: hasOwn(source, "name"),
    hasDividerAfterColumn: hasOwn(source, "dividerAfterColumn"),
    hasPairList: hasOwn(source, "pairList"),
    hasRelationTable: hasOwn(source, "relationTable"),
    hasHighlight: hasOwn(source, "highlight"),
    hasValues: hasOwn(source, "values"),
    hasSequence: hasOwn(source, "sequence"),
    xRange: hasOwn(source, "x") ? structuredClone(source.x) : null,
    yRange: hasOwn(source, "y") ? structuredClone(source.y) : null,
    hasXRange: hasOwn(source, "x"),
    hasYRange: hasOwn(source, "y"),
    scaleK: hasOwn(source, "scale") ? Number(source.scale?.k) : null,
    hasScale: hasOwn(source, "scale"),
    resultText: hasOwn(source, "result") && typeof source.result === "string" ? source.result : null,
    hasResult: hasOwn(source, "result"),
    languageTag: !isPrimary && hasOwn(source, "languageTag") ? source.languageTag : null,
    textDirection: !isPrimary && hasOwn(source, "textDirection") ? source.textDirection : null,
    hasLanguageTag: !isPrimary && hasOwn(source, "languageTag"),
    hasTextDirection: !isPrimary && hasOwn(source, "textDirection"),
    layoutPreset: hasOwn(source, "layout") ? text(source.layout) : null,
    treeVariant: hasOwn(source, "variant") ? text(source.variant) : null,
    semanticPayload: semanticPayloadFields.length
      ? Object.fromEntries(
          semanticPayloadFields
            .filter((fieldName) => hasOwn(source, fieldName))
            .map((fieldName) => [fieldName, structuredClone(source[fieldName])])
        )
      : null
  });
  if (kind === "paragraph" && isPrimary) blockRow.value = text(source.text);
  if (kind === "choice" || (isPrimary && hasOwn(source, "options"))) {
    addOptions(state, blockRow, source.options, source.answerIds, identityPath, jsonPath);
  }
  if (kind === "table") {
    addTabularCells(
      state,
      blockRow,
      source.columns,
      source.rows,
      identityPath,
      "table",
      null,
      source.columnMeta
    );
  }
  if (kind === "flow") addFlowNode(state, blockRow, source.structure, `${identityPath}/flow:root`, `${jsonPath}.structure`);
  if (kind === "tree") addTree(state, blockRow, source, identityPath, jsonPath);
  if (kind === "graph") addGraph(state, blockRow, source, identityPath, jsonPath);
  if (kind === "relation_map") addRelationMap(state, blockRow, source, identityPath, jsonPath);
  if (kind === "matrix") addMatrix(state, blockRow, source, identityPath, jsonPath);
  if (kind === "plane") addPlane(state, blockRow, source, identityPath);
  if (kind === "formula") addFormulaExpression(state, blockRow, source.expression, identityPath);
  return blockRow;
}

function addCard(state, card, context) {
  const { courseId, lessonId, microsequenceId, identityPath, jsonPath, topicIds } = context;
  const resource = text(card.resource);
  if (!CARD_RESOURCES.includes(resource)) throw new RelationalMappingError(`${jsonPath}.resource inválido: ${resource}.`);
  assertAllowedFields(card, CARD_FIELDS[resource], jsonPath);
  const cardRow = state.add("cards", identityPath, {
    courseId,
    lessonId,
    microsequenceId,
    contractKey: text(card.id),
    position: Number(card.position),
    resource,
    cardKind: text(card.kind),
    exercise: text(card.exercise),
    title: text(card.title),
    after: hasOwn(card, "after") ? text(card.after) : "",
    hasAfter: hasOwn(card, "after"),
    languageTag: hasOwn(card, "languageTag") ? card.languageTag : null,
    textDirection: hasOwn(card, "textDirection") ? card.textDirection : null,
    hasLanguageTag: hasOwn(card, "languageTag"),
    hasTextDirection: hasOwn(card, "textDirection")
  });
  (card.sources || []).forEach((value, position) => state.add("cardSources", `${identityPath}/source:${position}`, {
    courseId, cardId: cardRow.id, position, value: text(value)
  }));
  const seenTopicKeys = new Set();
  (card.topics || []).forEach((contractKey, position) => {
    const normalizedTopicKey = text(contractKey);
    if (!normalizedTopicKey || seenTopicKeys.has(normalizedTopicKey)) {
      throw new RelationalMappingError(`${jsonPath}.topics[${position}] deve referenciar um tópico único e não vazio.`);
    }
    // O contrato também usa `card.topics` como tag textual livre. Quando a
    // chave pertence aos tópicos estruturados da lição, mantemos a FK; caso
    // contrário, `topicContractKey` preserva integralmente a referência.
    const topicId = topicIds.get(normalizedTopicKey) || null;
    seenTopicKeys.add(normalizedTopicKey);
    state.add("cardTopics", `${identityPath}/topic:${position}`, {
      courseId,
      cardId: cardRow.id,
      topicId,
      topicContractKey: normalizedTopicKey,
      position
    });
  });
  if (resource === "composite") {
    requireArray(card, "blocks", jsonPath).forEach((block, position) => addBlock(state, {
      cardRow,
      source: block,
      region: "content",
      position,
      identityPath: `${identityPath}/block:content:${position}`,
      jsonPath: `${jsonPath}.blocks[${position}]`
    }));
  } else {
    const source = resource === "paragraph" ? { ...card, value: card.text } : card;
    addBlock(state, {
      cardRow,
      source,
      region: "primary",
      position: 0,
      identityPath: `${identityPath}/block:primary`,
      jsonPath,
      isPrimary: true
    });
  }
  if (hasOwn(card, "afterBlocks")) {
    requireArray(card, "afterBlocks", jsonPath).forEach((block, position) => addBlock(state, {
      cardRow,
      source: block,
      region: "after",
      position,
      identityPath: `${identityPath}/block:after:${position}`,
      jsonPath: `${jsonPath}.afterBlocks[${position}]`
    }));
  }
  return cardRow;
}

function addLesson(state, lesson, context) {
  const { courseId, moduleId, identityPath, jsonPath } = context;
  assertAllowedFields(lesson, LESSON_FIELDS, jsonPath);
  const lessonRow = state.add("lessons", identityPath, {
    courseId,
    moduleId,
    contractKey: text(lesson.id),
    position: context.position,
    title: text(lesson.title)
  });
  addGuide(state, { courseId, ownerType: "lesson", ownerId: lessonRow.id, guide: lesson.guide, identityPath, jsonPath: `${jsonPath}.guide` });
  const topicIds = new Map();
  requireArray(lesson, "topics", jsonPath).forEach((topic, position) => {
    assertAllowedFields(topic, TOPIC_FIELDS, `${jsonPath}.topics[${position}]`);
    const topicPath = `${identityPath}/topic:${text(topic.id)}`;
    const topicRow = state.add("topics", topicPath, {
      courseId,
      lessonId: lessonRow.id,
      contractKey: text(topic.id),
      position,
      label: text(topic.label),
      topicKind: text(topic.kind)
    });
    topicIds.set(topicRow.contractKey, topicRow.id);
    addStatementRows(state, "topicStatements", { courseId, parentField: "topicId", parentId: topicRow.id, statementType: "check", values: topic.checks, identityPath: topicPath });
    addStatementRows(state, "topicStatements", { courseId, parentField: "topicId", parentId: topicRow.id, statementType: "error", values: topic.errors, identityPath: topicPath });
  });
  const microInputs = requireArray(lesson, "microsequences", jsonPath);
  const microIds = new Map();
  const microRows = microInputs.map((microsequence, position) => {
    assertAllowedFields(microsequence, MICROSEQUENCE_FIELDS, `${jsonPath}.microsequences[${position}]`);
    const microPath = `${identityPath}/micro:${text(microsequence.id)}`;
    const row = state.add("microsequences", microPath, {
      courseId,
      lessonId: lessonRow.id,
      contractKey: text(microsequence.id),
      position,
      title: text(microsequence.title),
      goal: text(microsequence.goal),
      role: text(microsequence.role),
      status: text(microsequence.status),
      branchOfId: null,
      branchOfContractKey: hasOwn(microsequence, "branchOf") && microsequence.branchOf != null ? text(microsequence.branchOf) : null,
      hasBranchOf: hasOwn(microsequence, "branchOf"),
      hasErrors: hasOwn(microsequence, "errors")
    });
    microIds.set(row.contractKey, row.id);
    return { row, microsequence, microPath, position };
  });
  microRows.forEach(({ row, microsequence, microPath, position }) => {
    row.branchOfId = row.branchOfContractKey ? microIds.get(row.branchOfContractKey) || null : null;
    addStatementRows(state, "microsequenceStatements", { courseId, parentField: "microsequenceId", parentId: row.id, statementType: "cover", values: microsequence.covers, identityPath: microPath });
    addStatementRows(state, "microsequenceStatements", { courseId, parentField: "microsequenceId", parentId: row.id, statementType: "check", values: microsequence.checks, identityPath: microPath });
    addStatementRows(state, "microsequenceStatements", { courseId, parentField: "microsequenceId", parentId: row.id, statementType: "error", values: microsequence.errors, identityPath: microPath });
    (microsequence.dependsOn || []).forEach((contractKey, dependencyPosition) => state.add("dependencies", `${microPath}/dependency:${dependencyPosition}`, {
      courseId,
      lessonId: lessonRow.id,
      microsequenceId: row.id,
      dependsOnMicrosequenceId: microIds.get(text(contractKey)) || null,
      dependsOnContractKey: text(contractKey),
      position: dependencyPosition
    }));
    requireArray(microsequence, "cards", `${jsonPath}.microsequences[${position}]`).forEach((card, cardIndex) => addCard(state, card, {
      courseId,
      lessonId: lessonRow.id,
      microsequenceId: row.id,
      topicIds,
      identityPath: `${microPath}/card:${text(card.id)}`,
      jsonPath: `${jsonPath}.microsequences[${position}].cards[${cardIndex}]`
    }));
  });
  return lessonRow;
}

function mapDocument(document, options = {}) {
  const validation = validateProjectDocument(document);
  if (!validation.ok) throw validationError(validation);
  assertAllowedFields(document, ROOT_FIELDS, "$");
  const state = createState(options);
  state.add("projectMeta", "project", {
    contract: document.contract,
    version: document.version,
    kind: document.kind,
    scope: hasOwn(document, "scope") ? text(document.scope) : null,
    hasScope: hasOwn(document, "scope")
  });
  document.courses.forEach((course, coursePosition) => {
    assertAllowedFields(course, COURSE_FIELDS, `$.courses[${coursePosition}]`);
    const coursePath = `course:${text(course.id)}`;
    const courseRow = state.add("courses", coursePath, {
      projectId: state.rows.projectMeta[0].id,
      contractKey: text(course.id),
      contractScope: hasOwn(document, "scope") ? text(document.scope) : null,
      position: coursePosition,
      title: text(course.title),
      goal: text(course.goal)
    });
    courseRow.courseId = courseRow.id;
    requireArray(course, "modules", `$.courses[${coursePosition}]`).forEach((moduleValue, modulePosition) => {
      const moduleJsonPath = `$.courses[${coursePosition}].modules[${modulePosition}]`;
      assertAllowedFields(moduleValue, MODULE_FIELDS, moduleJsonPath);
      const modulePath = `${coursePath}/module:${text(moduleValue.id)}`;
      const moduleRow = state.add("modules", modulePath, {
        courseId: courseRow.id,
        contractKey: text(moduleValue.id),
        position: modulePosition,
        title: text(moduleValue.title)
      });
      addGuide(state, { courseId: courseRow.id, ownerType: "module", ownerId: moduleRow.id, guide: moduleValue.guide, identityPath: modulePath, jsonPath: `${moduleJsonPath}.guide` });
      requireArray(moduleValue, "lessons", moduleJsonPath).forEach((lesson, lessonPosition) => addLesson(state, lesson, {
        courseId: courseRow.id,
        moduleId: moduleRow.id,
        position: lessonPosition,
        identityPath: `${modulePath}/lesson:${text(lesson.id)}`,
        jsonPath: `${moduleJsonPath}.lessons[${lessonPosition}]`
      }));
    });
  });
  return state.rows;
}

export function contractToRelationalRows(document, options = {}) {
  return mapDocument(structuredClone(document), options);
}

export function microsequenceFragmentToRelationalRows(fragment, options = {}) {
  const courseContractKey = options.courseContractKey || "fragment-course";
  const moduleContractKey = options.moduleContractKey || "fragment-module";
  const lessonContractKey = options.lessonContractKey || "fragment-lesson";
  const document = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: courseContractKey,
      title: "Fragmento",
      goal: "Transportar uma microssequência relacional.",
      modules: [{
        id: moduleContractKey,
        title: "Fragmento",
        guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: lessonContractKey,
          title: "Fragmento",
          guide: { goal: "Fragmento.", include: [], exclude: [], notation: [], avoid: [] },
          topics: Array.isArray(options.topics) ? options.topics : [],
          microsequences: [structuredClone(fragment)]
        }]
      }]
    }]
  };
  const rows = mapDocument(document, options);
  const generatedCourseId = rows.courses[0].id;
  const generatedLessonId = rows.lessons[0].id;
  const courseId = options.courseId || generatedCourseId;
  const lessonId = options.lessonId || generatedLessonId;
  const keep = new Set([
    "microsequences", "microsequenceStatements", "dependencies", "cards", "cardSources", "cardTopics", "blocks",
    "options", "nodes", "edges", "cells", "matrixItems", "points", "lines", "highlights", "flowNodes", "flowCases",
    "flowPractices", "flowPracticeEntries", "flowPracticeOptions", "flowPracticeVariants", "flowShapeOptions"
  ]);
  Object.entries(rows).forEach(([collection, collectionRows]) => {
    if (!keep.has(collection)) {
      rows[collection] = [];
      return;
    }
    collectionRows.forEach((row) => {
      if (row.courseId === generatedCourseId) row.courseId = courseId;
      if (row.lessonId === generatedLessonId) row.lessonId = lessonId;
    });
  });
  return rows;
}
