import { getChoiceOptionComparableValue, normalizeChoiceOption } from "./choiceOptions.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function clone(value) {
  return structuredClone(value);
}

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value || {}, fieldName);
}

function inheritTextMetadata(target, source, fallback = null) {
  const result = { ...target };
  ["languageTag", "textDirection"].forEach((fieldName) => {
    if (hasOwn(source, fieldName)) {
      result[fieldName] = source[fieldName];
    } else if (hasOwn(fallback, fieldName)) {
      result[fieldName] = fallback[fieldName];
    }
  });
  return result;
}

function collectFlowStructureText(node, bucket) {
  if (!node || typeof node !== "object") return;
  if (typeof node.text === "string" && node.text.trim()) {
    bucket.push(node.text.trim());
  }
  if (typeof node.condition === "string" && node.condition.trim()) {
    bucket.push(node.condition.trim());
  }
  if (typeof node.expression === "string" && node.expression.trim()) {
    bucket.push(node.expression.trim());
  }
  if (typeof node.init === "string" && node.init.trim()) {
    bucket.push(node.init.trim());
  }
  if (typeof node.update === "string" && node.update.trim()) {
    bucket.push(node.update.trim());
  }
  ["items", "thenBranch", "elseBranch", "body", "defaultBranch"].forEach((fieldName) => {
    const list = node[fieldName];
    if (Array.isArray(list)) {
      list.forEach((item) => collectFlowStructureText(item, bucket));
    }
  });
  if (Array.isArray(node.cases)) {
    node.cases.forEach((caseItem) => {
      if (typeof caseItem?.condition === "string" && caseItem.condition.trim()) {
        bucket.push(caseItem.condition.trim());
      }
      if (typeof caseItem?.match === "string" && caseItem.match.trim()) {
        bucket.push(caseItem.match.trim());
      }
      if (Array.isArray(caseItem?.thenBranch)) {
        caseItem.thenBranch.forEach((item) => collectFlowStructureText(item, bucket));
      }
      if (Array.isArray(caseItem?.body)) {
        caseItem.body.forEach((item) => collectFlowStructureText(item, bucket));
      }
    });
  }
}

function buildHeadingBlock(title) {
  return {
    kind: "heading",
    value: text(title).trim() || "Card"
  };
}

function buildAfterBlock(card = {}) {
  const blocks = [];
  const afterValue = text(card?.after).trim();
  if (afterValue) {
    blocks.push(inheritTextMetadata({ kind: "paragraph", value: afterValue }, card));
  }
  if (Array.isArray(card?.afterBlocks)) {
    blocks.push(...card.afterBlocks.map((block) => inheritTextMetadata(normalizeCompositeBlock(block), block, card)));
  }
  if (!blocks.length) {
    return null;
  }
  return {
    kind: "after",
    blocks
  };
}

function buildParagraphBlock(card) {
  return {
    kind: "paragraph",
    value: text(card.text)
  };
}

function buildChoiceBlock(card) {
  return {
    kind: "choice",
    question: text(card.question),
    options: (Array.isArray(card.options) ? card.options : []).map((option, index) => normalizeChoiceOption(option, index)),
    answer: text(card.answer)
  };
}

function buildCodeBlock(card) {
  return {
    kind: "code",
    prompt: text(card.prompt),
    language: text(card.language) || "text",
    code: text(card.code)
  };
}

function buildTableBlock(card) {
  return {
    kind: "table",
    columns: (Array.isArray(card.columns) ? card.columns : []).map((item) => text(item)),
    rows: (Array.isArray(card.rows) ? card.rows : []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []))
  };
}

function buildFlowBlock(card) {
  return {
    kind: "flow",
    prompt: text(card.prompt),
    structure: card.structure && typeof card.structure === "object" ? clone(card.structure) : null
  };
}

function buildTreeBlock(card) {
  return {
    kind: "tree",
    prompt: text(card.prompt),
    nodes: clone(Array.isArray(card.nodes) ? card.nodes : [])
  };
}

function buildGraphBlock(card) {
  return {
    kind: "graph",
    prompt: text(card.prompt),
    vertices: clone(Array.isArray(card.vertices) ? card.vertices : []),
    edges: clone(Array.isArray(card.edges) ? card.edges : []),
    highlight: card.highlight && typeof card.highlight === "object" ? clone(card.highlight) : null
  };
}

function buildRelationMapBlock(card) {
  return {
    kind: "relation_map",
    prompt: text(card.prompt),
    leftSet: card.leftSet && typeof card.leftSet === "object" ? clone(card.leftSet) : null,
    rightSet: card.rightSet && typeof card.rightSet === "object" ? clone(card.rightSet) : null,
    relations: clone(Array.isArray(card.relations) ? card.relations : []),
    pairList: clone(Array.isArray(card.pairList) ? card.pairList : []),
    relationTable: card.relationTable && typeof card.relationTable === "object" ? clone(card.relationTable) : null,
    highlight: card.highlight && typeof card.highlight === "object" ? clone(card.highlight) : null
  };
}

function buildMatrixBlock(card) {
  return {
    kind: "matrix",
    prompt: text(card.prompt),
    name: text(card.name),
    values: clone(Array.isArray(card.values) ? card.values : []),
    sequence: clone(Array.isArray(card.sequence) ? card.sequence : []),
    highlight: card.highlight !== undefined ? clone(card.highlight) : null,
    dividerAfterColumn: card.dividerAfterColumn ?? null
  };
}

function buildPlaneBlock(card) {
  return {
    kind: "plane",
    prompt: text(card.prompt),
    x: clone(Array.isArray(card.x) ? card.x : []),
    y: clone(Array.isArray(card.y) ? card.y : []),
    vector: clone(Array.isArray(card.vector) ? card.vector : []),
    vectors: clone(Array.isArray(card.vectors) ? card.vectors : []),
    sum: clone(Array.isArray(card.sum) ? card.sum : []),
    scale: card.scale && typeof card.scale === "object" ? clone(card.scale) : null,
    distance: clone(Array.isArray(card.distance) ? card.distance : []),
    result: Array.isArray(card.result) || typeof card.result === "string" ? clone(card.result) : null
  };
}

function buildFormulaBlock(card) {
  return {
    kind: "formula",
    prompt: text(card.prompt),
    notation: text(card.notation),
    accessibleText: text(card.accessibleText),
    expression: card.expression && typeof card.expression === "object" ? clone(card.expression) : null
  };
}

function normalizeCompositeBlock(block = {}) {
  const kind = text(block?.kind);
  const metadata = inheritTextMetadata({}, block);
  if (kind === "heading" || kind === "paragraph") {
    return { kind, value: text(block?.value), ...metadata };
  }
  if (kind === "choice") {
    return {
      kind,
      question: text(block?.question),
      options: (Array.isArray(block?.options) ? block.options : []).map((option, index) => normalizeChoiceOption(option, index)),
      answer: text(block?.answer),
      ...metadata
    };
  }
  if (kind === "code") {
    return {
      kind,
      prompt: text(block?.prompt),
      language: text(block?.language) || "text",
      code: text(block?.code),
      ...metadata
    };
  }
  if (kind === "table") {
    return {
      kind,
      columns: (Array.isArray(block?.columns) ? block.columns : []).map((item) => text(item)),
      rows: (Array.isArray(block?.rows) ? block.rows : []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [])),
      ...metadata
    };
  }
  if (kind === "flow") {
    return {
      kind,
      prompt: text(block?.prompt),
      structure: block?.structure && typeof block.structure === "object" ? clone(block.structure) : null,
      ...metadata
    };
  }
  if (kind === "tree") {
    return {
      kind,
      prompt: text(block?.prompt),
      nodes: clone(Array.isArray(block?.nodes) ? block.nodes : []),
      ...metadata
    };
  }
  if (kind === "graph") {
    return {
      kind,
      prompt: text(block?.prompt),
      vertices: clone(Array.isArray(block?.vertices) ? block.vertices : []),
      edges: clone(Array.isArray(block?.edges) ? block.edges : []),
      highlight: block.highlight && typeof block.highlight === "object" ? clone(block.highlight) : null,
      ...metadata
    };
  }
  if (kind === "relation_map") {
    return {
      kind,
      prompt: text(block?.prompt),
      leftSet: block.leftSet && typeof block.leftSet === "object" ? clone(block.leftSet) : null,
      rightSet: block.rightSet && typeof block.rightSet === "object" ? clone(block.rightSet) : null,
      relations: clone(Array.isArray(block?.relations) ? block.relations : []),
      pairList: clone(Array.isArray(block?.pairList) ? block.pairList : []),
      relationTable: block.relationTable && typeof block.relationTable === "object" ? clone(block.relationTable) : null,
      highlight: block.highlight && typeof block.highlight === "object" ? clone(block.highlight) : null,
      ...metadata
    };
  }
  if (kind === "matrix") {
    return {
      kind,
      prompt: text(block?.prompt),
      name: text(block?.name),
      values: clone(Array.isArray(block?.values) ? block.values : []),
      sequence: clone(Array.isArray(block?.sequence) ? block.sequence : []),
      highlight: block.highlight !== undefined ? clone(block.highlight) : null,
      dividerAfterColumn: block.dividerAfterColumn ?? null,
      ...metadata
    };
  }
  if (kind === "plane") {
    return {
      kind,
      prompt: text(block?.prompt),
      x: clone(Array.isArray(block?.x) ? block.x : []),
      y: clone(Array.isArray(block?.y) ? block.y : []),
      vector: clone(Array.isArray(block?.vector) ? block.vector : []),
      vectors: clone(Array.isArray(block?.vectors) ? block.vectors : []),
      sum: clone(Array.isArray(block?.sum) ? block.sum : []),
      scale: block.scale && typeof block.scale === "object" ? clone(block.scale) : null,
      distance: clone(Array.isArray(block?.distance) ? block.distance : []),
      result: Array.isArray(block.result) || typeof block.result === "string" ? clone(block.result) : null,
      ...metadata
    };
  }
  if (kind === "formula") {
    return { ...buildFormulaBlock(block), ...metadata };
  }
  return {
    kind: "paragraph",
    value: text(block?.value),
    ...metadata
  };
}

function buildCardSpecificBlocks(card) {
  switch (card?.resource) {
    case "paragraph":
      return [buildParagraphBlock(card)];
    case "choice":
      return [buildChoiceBlock(card)];
    case "composite":
      return (Array.isArray(card?.blocks) ? card.blocks : []).map((block) => normalizeCompositeBlock(block));
    case "code":
      return [buildCodeBlock(card)];
    case "table":
      return [buildTableBlock(card)];
    case "flow":
      return [buildFlowBlock(card)];
    case "tree":
      return [buildTreeBlock(card)];
    case "graph":
      return [buildGraphBlock(card)];
    case "relation_map":
      return [buildRelationMapBlock(card)];
    case "matrix":
      return [buildMatrixBlock(card)];
    case "plane":
      return [buildPlaneBlock(card)];
    case "formula":
      return [buildFormulaBlock(card)];
    default:
      return [{ kind: "paragraph", value: "" }];
  }
}

export function readCardText(card) {
  if (card?.resource === "composite") {
    return (Array.isArray(card?.blocks) ? card.blocks : [])
      .flatMap((block) => {
        if (block?.kind === "paragraph" || block?.kind === "heading") return [text(block?.value)];
        if (block?.kind === "choice") {
          return [
            text(block?.question),
            ...(Array.isArray(block?.options) ? block.options.map((option, index) => getChoiceOptionComparableValue(option, index)) : [])
          ];
        }
        if (block?.kind === "flow") {
          const flowText = [];
          collectFlowStructureText(block?.structure, flowText);
          return [text(block?.prompt), flowText.join(" ")];
        }
        return [text(block?.prompt), text(block?.code)];
      })
      .filter(Boolean)
      .join(" ");
  }
  if (card?.resource === "paragraph") return text(card.text);
  if (card?.resource === "choice") return text(card.question);
  if (card?.resource === "code") return [text(card.prompt), text(card.code), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "table") return [(card.rows || []).flat().map((cell) => String(cell ?? "")).join(" "), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "tree") return [text(card.prompt), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "graph") return [text(card.prompt), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "relation_map") return [text(card.prompt), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "matrix") return [text(card.prompt), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "plane") return [text(card.prompt), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "formula") return [text(card.prompt), text(card.accessibleText), text(card.question)].filter(Boolean).join(" ");
  if (card?.resource === "flow") {
    const flowText = [];
    collectFlowStructureText(card.structure, flowText);
    return [text(card.prompt), text(card.question), flowText.join(" ")].filter(Boolean).join(" ");
  }
  return "";
}

function buildExerciseResponseBlock(card) {
  if (card?.resource === "choice" || card?.resource === "composite" || text(card?.exercise).trim() !== "choice") {
    return [];
  }
  return [buildChoiceBlock(card)];
}

export function buildCardRuntime(card) {
  const blocks = [
    inheritTextMetadata(buildHeadingBlock(card?.title), card),
    ...buildCardSpecificBlocks(card).map((block) => inheritTextMetadata(block, block, card)),
    ...buildExerciseResponseBlock(card).map((block) => inheritTextMetadata(block, block, card))
  ];
  const afterBlock = buildAfterBlock(card);
  if (afterBlock) {
    blocks.push(afterBlock);
  }
  return {
    title: text(card?.title).trim() || "Card",
    ...inheritTextMetadata({}, card),
    blocks,
    fallbackText: readCardText(card)
  };
}

export function resolveCardRuntime(card) {
  return buildCardRuntime(card);
}
