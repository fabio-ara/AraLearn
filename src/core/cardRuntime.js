import {
  getContractCardKind,
  listContractAnswerValues,
  normalizeFlowForRuntime
} from "../contract/contractCard.js";
import {
  convertPublicFlowToStructure,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";
import { deriveFlowchartProjectionFromStructure } from "../flowchart/flowchartProjection.js";
import { DIRECTORY_TREE_BASE_NODE_ID } from "./directoryTree.js";
import { getExerciseOptionStableId } from "./exerciseOptions.js";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function clone(value) {
  return structuredClone(value);
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeText(item).trim())
    .filter(Boolean);
}

function resolvePopupText(value) {
  return normalizeText(value).replace(/\[\[([\s\S]*?)\]\]/g, (_, answer) => {
    const text = normalizeText(answer);
    const delimiterIndex = text.indexOf("::");
    return delimiterIndex >= 0 ? text.slice(0, delimiterIndex) : text;
  });
}

function sanitizePopupTableRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) =>
    (Array.isArray(row) ? row : []).map((cell) => ({
      ...(cell && typeof cell === "object" ? clone(cell) : {}),
      value: resolvePopupText(cell?.value),
      blank: false
    }))
  );
}

function stripFlowPracticeFromSequence(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }

    const next = clone(item);
    delete next.practice;
    delete next.blank;
    if (Array.isArray(next.then)) {
      next.then = stripFlowPracticeFromSequence(next.then);
    }
    if (Array.isArray(next.else)) {
      next.else = stripFlowPracticeFromSequence(next.else);
    }
    if (Array.isArray(next.do)) {
      next.do = stripFlowPracticeFromSequence(next.do);
    }
    if (Array.isArray(next.cases)) {
      next.cases = next.cases.map((entry) => ({
        ...(entry && typeof entry === "object" ? clone(entry) : {}),
        items: stripFlowPracticeFromSequence(entry?.items)
      }));
    }
    if (Array.isArray(next.default)) {
      next.default = stripFlowPracticeFromSequence(next.default);
    }
    return next;
  });
}

function sanitizePopupProjection(projection) {
  if (!projection || typeof projection !== "object") {
    return projection;
  }

  const next = clone(projection);
  next.nodes = (Array.isArray(next.nodes) ? next.nodes : []).map((node) => {
    const clean = clone(node);
    delete clean.shapeBlank;
    delete clean.shapeOptions;
    delete clean.textBlank;
    delete clean.textOptions;
    delete clean.textVariants;
    return clean;
  });
  next.links = (Array.isArray(next.links) ? next.links : []).map((link) => {
    const clean = clone(link);
    delete clean.labelBlank;
    delete clean.labelOptions;
    delete clean.labelVariants;
    return clean;
  });
  return next;
}

function sanitizePopupBlock(block) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return null;
  }

  if (block.kind === "heading") {
    return { ...clone(block), value: normalizeText(block.value) };
  }
  if (block.kind === "paragraph") {
    return { ...clone(block), value: resolvePopupText(block.value) };
  }
  if (block.kind === "editor") {
    return { ...clone(block), value: resolvePopupText(block.value) };
  }
  if (block.kind === "table") {
    return {
      ...clone(block),
      title: normalizeText(block.title),
      headers: (Array.isArray(block.headers) ? block.headers : []).map((header) => ({
        ...(header && typeof header === "object" ? clone(header) : {}),
        value: resolvePopupText(header?.value)
      })),
      rows: sanitizePopupTableRows(block.rows)
    };
  }
  if (block.kind === "image") {
    return clone(block);
  }
  if (block.kind === "flowchart") {
    return {
      ...clone(block),
      flow: stripFlowPracticeFromSequence(block.flow),
      projection: sanitizePopupProjection(block.projection)
    };
  }
  if (block.kind === "complete") {
    return {
      kind: "paragraph",
      value: resolvePopupText(block.text)
    };
  }

  return null;
}

export function sanitizePopupBlocks(popupBlocks = []) {
  return (Array.isArray(popupBlocks) ? popupBlocks : [])
    .map((block) => sanitizePopupBlock(block))
    .filter(Boolean);
}

function buildHeadingBlock(title) {
  return {
    kind: "heading",
    value: normalizeText(title).trim() || "Novo card",
    align: "center"
  };
}

function buildButtonBlock(after) {
  const popupBlocks = normalizeText(after).trim()
    ? [buildParagraphBlock(after)]
    : [];
  const safePopupBlocks = sanitizePopupBlocks(popupBlocks);
  return {
    kind: "button",
    popupEnabled: safePopupBlocks.length > 0,
    popupBlocks: safePopupBlocks
  };
}

function buildParagraphBlock(value, extra = {}) {
  return {
    kind: "paragraph",
    value: normalizeText(value),
    ...extra
  };
}

function enrichTextGapsWithWrong(value, wrong) {
  const wrongValues = normalizeList(wrong);
  if (!wrongValues.length) {
    return normalizeText(value);
  }

  return normalizeText(value).replace(/\[\[([\s\S]*?)\]\]/g, (_, raw) => {
    const source = normalizeText(raw);
    if (source.includes("::")) {
      return `[[${source}]]`;
    }

    const answer = source.trim();
    const options = Array.from(new Set([answer, ...wrongValues].filter(Boolean)));
    return `[[${answer}::${options.join("|")}]]`;
  });
}

function buildChoiceOptions(card) {
  const correctOptions = listContractAnswerValues(card);
  const wrongOptions = normalizeList(card?.wrong);

  return [
    ...correctOptions.map((value, index) => ({
      id: getExerciseOptionStableId({ id: `choice-correct-${index}` }, index),
      value: normalizeText(value),
      answer: true
    })),
    ...wrongOptions.map((value, index) => ({
      id: getExerciseOptionStableId({ id: `choice-wrong-${index}` }, correctOptions.length + index),
      value: normalizeText(value),
      answer: false
    }))
  ].filter((item) => item.value.trim());
}

function buildChoiceBlock(card) {
  const answerCount = listContractAnswerValues(card).length;
  return {
    kind: "multiple_choice",
    ask: normalizeText(card?.ask),
    answerState: answerCount > 1 ? "multiple" : "single",
    options: buildChoiceOptions(card)
  };
}

function buildEditorBlock(card) {
  return {
    kind: "editor",
    value: enrichTextGapsWithWrong(card?.code, card?.wrong),
    language: normalizeText(card?.language) || "text"
  };
}

function buildTableTitle(card) {
  return normalizeText(card?.table?.title).trim() || normalizeText(card?.title).trim() || "Tabela";
}

function buildTableHeaders(card) {
  return normalizeList(card?.table?.columns).map((column) => ({
    value: column,
    align: "center",
    tone: "default",
    bold: false,
    italic: false
  }));
}

function buildTableRows(card) {
  return (Array.isArray(card?.table?.rows) ? card.table.rows : []).map((row) => {
    return (Array.isArray(row) ? row : []).map((cell) => ({
      value: normalizeText(cell),
      align: "center",
      tone: "default",
      bold: false,
      italic: false,
      blank: false
    }));
  });
}

function buildTableBlock(card) {
  return {
    kind: "table",
    title: buildTableTitle(card),
    titleStyle: {
      align: "center",
      tone: "default",
      bold: false,
      italic: false
    },
    headers: buildTableHeaders(card),
    rows: buildTableRows(card)
  };
}

function normalizeTreeBase(value) {
  const text = normalizeText(value).trim();
  return text || "/";
}

function splitTreePath(value, base = "/") {
  const safeBase = normalizeTreeBase(base);
  let text = normalizeText(value).trim().replace(/\\/g, "/");
  if (!text) {
    return [];
  }
  if (safeBase !== "/" && text.startsWith(safeBase)) {
    text = text.slice(safeBase.length);
  }
  return text
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildTreeNodeId(pathParts) {
  const slug = slugify(pathParts.join("-"));
  return slug ? `node-${slug}` : DIRECTORY_TREE_BASE_NODE_ID;
}

function buildTreeNodes(items, parentPath = []) {
  return Object.entries(items && typeof items === "object" ? items : {}).map(([name, child]) => {
    const pathParts = parentPath.concat(String(name || "item"));
    const isFile = child === null;
    return {
      id: buildTreeNodeId(pathParts),
      type: isFile ? "file" : "folder",
      name: String(name || (isFile ? "arquivo" : "pasta")),
      ...(isFile ? {} : { children: buildTreeNodes(child, pathParts) })
    };
  });
}

function buildDirectoryTreeBlock(card) {
  const base = normalizeTreeBase(card?.tree?.base);
  const currentPath = splitTreePath(card?.tree?.current, base);
  const selectedPath = splitTreePath(card?.tree?.selected || card?.tree?.current, base);
  const closed = normalizeList(card?.tree?.closed).map((entry) => buildTreeNodeId(splitTreePath(entry, base)));

  return {
    kind: "directory_tree",
    base,
    currentNodeId: currentPath.length ? buildTreeNodeId(currentPath) : DIRECTORY_TREE_BASE_NODE_ID,
    selectedNodeId: selectedPath.length ? buildTreeNodeId(selectedPath) : DIRECTORY_TREE_BASE_NODE_ID,
    collapsedNodeIds: closed,
    nodes: buildTreeNodes(card?.tree?.items)
  };
}

function buildFlowchartBlock(card) {
  const runtimeFlow = normalizeFlowForRuntime(card?.flow);
  const publicStructure = convertPublicFlowToStructure(runtimeFlow);
  const normalizedStructure = normalizeFlowchartStructure(publicStructure);
  const validation = validateFlowchartStructureContract(normalizedStructure);
  const projection = validation.valid ? deriveFlowchartProjectionFromStructure(normalizedStructure) : null;

  return {
    kind: "flowchart",
    flow: Array.isArray(card?.flow) ? clone(card.flow) : [],
    structureVersion: 1,
    structure: normalizedStructure,
    structureValid: validation.valid,
    structureValidation: validation,
    projectionVersion: projection ? 1 : 0,
    projection,
    projectionValid: !!projection
  };
}

function appendIntroParagraph(blocks, card) {
  const say = enrichTextGapsWithWrong(card?.say, card?.wrong).trim();
  if (say) {
    blocks.push(buildParagraphBlock(say));
  }
}

function buildCardSpecificBlocks(card) {
  if (!card || typeof card !== "object") {
    return [];
  }

  const kind = getContractCardKind(card);
  const blocks = [];

  if (kind === "ask") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildChoiceBlock(card));
    return blocks;
  }
  if (kind === "code") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildEditorBlock(card));
    return blocks;
  }
  if (kind === "table") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildTableBlock(card));
    return blocks;
  }
  if (kind === "tree") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildDirectoryTreeBlock(card));
    return blocks;
  }
  if (kind === "flow") {
    appendIntroParagraph(blocks, card);
    blocks.push(buildFlowchartBlock(card));
    return blocks;
  }

  blocks.push(buildParagraphBlock(enrichTextGapsWithWrong(card?.say, card?.wrong)));
  return blocks;
}

export function readCardText(card) {
  if (!card || typeof card !== "object") {
    return "";
  }

  if (typeof card.say === "string") {
    return card.say;
  }
  if (typeof card.ask === "string") {
    return card.ask;
  }
  if (typeof card.code === "string") {
    return card.code;
  }
  if (Array.isArray(card?.table?.rows) && card.table.rows.length) {
    return card.table.rows
      .map((row) => (Array.isArray(row) ? row.join(" | ") : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(card?.table?.columns) && card.table.columns.length) {
    return card.table.columns.join(" | ");
  }
  if (card.tree && typeof card.tree === "object") {
    return normalizeText(card.tree.current) || normalizeText(card.tree.base) || "tree";
  }
  if (Array.isArray(card.flow) && card.flow.length) {
    return card.flow
      .map((step) => {
        const [kind] = Object.keys(step || {}).filter((key) => key !== "id" && key !== "blank");
        return kind ? `${kind}: ${step[kind]}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

export function buildCardRuntime(card) {
  const title = normalizeText(card?.title).trim() || normalizeText(card?.key).trim() || "Novo card";
  const blocks = [
    buildHeadingBlock(title),
    ...buildCardSpecificBlocks(card),
    buildButtonBlock(card?.after)
  ];

  return {
    title,
    blocks,
    fallbackText: readCardText(card)
  };
}

export function resolveCardRuntime(card) {
  if (card?.runtime?.blocks && Array.isArray(card.runtime.blocks)) {
    return clone(card.runtime);
  }

  return buildCardRuntime(card);
}
