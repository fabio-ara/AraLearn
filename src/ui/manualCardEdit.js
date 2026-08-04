import { normalizeChoiceOption } from "../core/choiceOptions.js";
import { validateCard } from "../domain/cards.js";
import {
  listCardMainResourceFieldNames,
  listCardResponseFieldNames
} from "../assist/cardAssistanceScope.js";

const SIMPLE_TEXT_FIELDS = Object.freeze([
  ["text", "Texto", "textarea"],
  ["value", "Texto", "textarea"],
  ["prompt", "Enunciado", "textarea"],
  ["question", "Pergunta", "textarea"],
  ["code", "Código", "textarea"],
  ["accessibleText", "Leitura", "textarea"],
  ["after", "Depois", "textarea"]
]);

function text(value) {
  return typeof value === "string" ? value : "";
}

function resolveTarget(card, targetId) {
  const requested = text(targetId).trim();
  if (requested.startsWith("body:")) {
    const id = requested.slice(5);
    const index = (card.blocks || []).findIndex((block) => text(block?.id) === id);
    return index < 0 ? null : {
      value: card.blocks[index],
      collection: "blocks",
      index,
      editableFields: null
    };
  }
  if (requested.startsWith("after:") && requested !== "after:text") {
    const id = requested.slice(6);
    const index = (card.afterBlocks || []).findIndex((block) => text(block?.id) === id);
    return index < 0 ? null : {
      value: card.afterBlocks[index],
      collection: "afterBlocks",
      index,
      editableFields: null
    };
  }
  if (requested === "main") {
    return {
      value: card,
      collection: "main",
      index: -1,
      editableFields: new Set(listCardMainResourceFieldNames(card))
    };
  }
  if (requested === "response") {
    return {
      value: card,
      collection: "response",
      index: -1,
      editableFields: new Set(listCardResponseFieldNames(card))
    };
  }
  if (requested === "after:text") {
    return {
      value: card,
      collection: "afterText",
      index: -1,
      editableFields: new Set(["after"])
    };
  }
  return {
    value: card,
    collection: "card",
    index: -1,
    editableFields: null
  };
}

function fieldIsEditable(resolved, fieldName) {
  return !resolved.editableFields || resolved.editableFields.has(fieldName);
}

function optionText(option) {
  if (typeof option === "string") return option;
  return text(option?.text || option?.code || option?.value || option?.label);
}

function choiceModel(target) {
  const options = Array.isArray(target.options) ? target.options : [];
  const answerIds = new Set(Array.isArray(target.answerIds) ? target.answerIds : []);
  return {
    options: options.map((option, index) => {
      const normalized = normalizeChoiceOption(option, index);
      return {
        index,
        id: normalized.id,
        value: optionText(option),
        correct: answerIds.has(normalized.id)
      };
    })
  };
}

function tableModel(target) {
  return {
    columns: (Array.isArray(target.columns) ? target.columns : []).map(String),
    rows: (Array.isArray(target.rows) ? target.rows : []).map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => String(cell ?? ""))
    )
  };
}

export function buildManualCardEditModel(card = {}, targetId = "card") {
  const resolved = resolveTarget(card, targetId);
  if (!resolved) return null;
  const target = resolved.value;
  const fields = [];
  if (resolved.collection === "card") {
    fields.push({ key: "title", label: "Título", type: "text", value: text(card.title) });
  }
  SIMPLE_TEXT_FIELDS.forEach(([key, label, type]) => {
    if (fieldIsEditable(resolved, key) && Object.hasOwn(target, key)) {
      fields.push({ key, label, type, value: text(target[key]) });
    }
  });
  const editsOptions = fieldIsEditable(resolved, "options") &&
    fieldIsEditable(resolved, "answerIds");
  const editsTable = fieldIsEditable(resolved, "columns") &&
    fieldIsEditable(resolved, "rows");
  return {
    targetId,
    targetKind: text(target.kind || target.resource),
    fields,
    ...(editsOptions && Array.isArray(target.options) ? choiceModel(target) : {}),
    ...(editsTable && Array.isArray(target.columns) && Array.isArray(target.rows)
      ? tableModel(target)
      : {})
  };
}

function applyFields(target, values, resolved) {
  SIMPLE_TEXT_FIELDS.forEach(([key]) => {
    if (
      fieldIsEditable(resolved, key) &&
      Object.hasOwn(values, key) &&
      Object.hasOwn(target, key)
    ) {
      target[key] = String(values[key] ?? "");
    }
  });
  if (
    fieldIsEditable(resolved, "options") &&
    fieldIsEditable(resolved, "answerIds") &&
    Array.isArray(target.options) &&
    Array.isArray(values.optionValues)
  ) {
    target.options = target.options.map((option, index) => {
      const normalized = normalizeChoiceOption(option, index);
      const nextValue = String(values.optionValues[index] ?? optionText(option));
      return normalized.kind === "code"
        ? { ...normalized, code: nextValue }
        : { ...normalized, text: nextValue };
    });
    const correctIndexes = new Set(
      (Array.isArray(values.correctOptionIndexes) ? values.correctOptionIndexes : [])
        .map(Number)
        .filter(Number.isInteger)
    );
    target.answerIds = target.options
      .filter((_, index) => correctIndexes.has(index))
      .map((option) => option.id);
  }
  if (
    fieldIsEditable(resolved, "columns") &&
    Array.isArray(target.columns) &&
    Array.isArray(values.columns)
  ) {
    target.columns = values.columns.map((value) => String(value ?? ""));
  }
  if (
    fieldIsEditable(resolved, "rows") &&
    Array.isArray(target.rows) &&
    Array.isArray(values.rows)
  ) {
    target.rows = values.rows.map((row) =>
      (Array.isArray(row) ? row : []).map((value) => String(value ?? ""))
    );
  }
}

export function applyManualCardEdit(card = {}, targetId = "card", values = {}) {
  const nextCard = structuredClone(card);
  const resolved = resolveTarget(nextCard, targetId);
  if (!resolved) throw new Error("O recurso selecionado deixou de existir.");
  if (resolved.collection === "card" && Object.hasOwn(values, "title")) {
    nextCard.title = String(values.title ?? "").trim();
  }
  applyFields(resolved.value, values, resolved);
  const validation = validateCard(nextCard, "$.manualEdit.card");
  if (!validation.ok) {
    const issue = validation.errors?.[0];
    throw new Error(
      `A edição deixou o card inválido${issue?.path ? ` em ${issue.path}` : ""}.`
    );
  }
  return validation.value;
}
