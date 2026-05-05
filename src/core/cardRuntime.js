import {
  convertPublicFlowToStructure,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";
import { deriveFlowchartProjectionFromStructure } from "../flowchart/flowchartProjection.js";
import { getExerciseOptionStableId } from "./exerciseOptions.js";

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

function clone(value) {
  return structuredClone(value);
}

function buildHeadingBlock(title) {
  return {
    kind: "heading",
    value: normalizeText(title).trim() || "Novo card",
    align: "center"
  };
}

function buildButtonBlock(popupBlocks = []) {
  const safePopupBlocks = Array.isArray(popupBlocks) ? popupBlocks.map((item) => clone(item)) : [];
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

function buildImageBlock(card) {
  return {
    kind: "image",
    src: normalizeText(card?.src),
    alt: normalizeText(card?.alt)
  };
}

function buildChoiceOptions(card) {
  const correctOptions = Array.isArray(card?.answer) ? card.answer : [];
  const wrongOptions = Array.isArray(card?.wrong) ? card.wrong : [];

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
  return {
    kind: "multiple_choice",
    ask: normalizeText(card?.ask),
    answerState: (Array.isArray(card?.answer) ? card.answer : []).length > 1 ? "multiple" : "single",
    options: buildChoiceOptions(card)
  };
}

function buildCompleteBlock(card) {
  return {
    kind: "complete",
    text: normalizeText(card?.text),
    answer: (Array.isArray(card?.answer) ? card.answer : []).map((item) => normalizeText(item)).filter(Boolean),
    wrong: (Array.isArray(card?.wrong) ? card.wrong : []).map((item) => normalizeText(item)).filter(Boolean)
  };
}

function buildEditorBlock(card) {
  return {
    kind: "editor",
    value: normalizeText(card?.code),
    language: normalizeText(card?.language) || "text"
  };
}

function buildTableTitle(card) {
  return normalizeText(card?.title).trim() || "Tabela";
}

function buildTableHeaders(card) {
  return (Array.isArray(card?.columns) ? card.columns : []).map((column) => ({
    value: normalizeText(column),
    align: "center",
    tone: "default",
    bold: false,
    italic: false
  }));
}

function buildTableRows(card) {
  return (Array.isArray(card?.rows) ? card.rows : []).map((row) => {
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

function buildFlowchartBlock(card) {
  const publicStructure = convertPublicFlowToStructure(card?.flow);
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

function buildCardSpecificBlocks(card) {
  if (!card || typeof card !== "object") {
    return [];
  }

  if (card.type === "choice") {
    return [buildChoiceBlock(card)];
  }
  if (card.type === "complete") {
    return [buildCompleteBlock(card)];
  }
  if (card.type === "editor") {
    return [buildEditorBlock(card)];
  }
  if (card.type === "table") {
    return [buildTableBlock(card)];
  }
  if (card.type === "flow") {
    return [buildFlowchartBlock(card)];
  }
  if (card.type === "image") {
    return [buildImageBlock(card)];
  }

  return [buildParagraphBlock(card.text)];
}

export function readCardText(card) {
  if (!card || typeof card !== "object") {
    return "";
  }

  if (typeof card.text === "string") {
    return card.text;
  }
  if (typeof card.ask === "string") {
    return card.ask;
  }
  if (typeof card.code === "string") {
    return card.code;
  }
  if (Array.isArray(card.rows) && card.rows.length) {
    return card.rows
      .map((row) => (Array.isArray(row) ? row.join(" | ") : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (Array.isArray(card.columns) && card.columns.length) {
    return card.columns.join(" | ");
  }
  if (Array.isArray(card.flow) && card.flow.length) {
    return card.flow
      .map((step) => {
        const [kind] = Object.keys(step || {});
        return kind ? `${kind}: ${step[kind]}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof card.src === "string") {
    return card.src;
  }

  return "";
}

export function buildCardRuntime(card) {
  const title = normalizeText(card?.title).trim() || normalizeText(card?.key).trim() || "Novo card";
  const blocks = [
    buildHeadingBlock(title),
    ...buildCardSpecificBlocks(card),
    buildButtonBlock()
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
