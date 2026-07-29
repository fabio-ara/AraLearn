import { parseChoiceOptionString } from "../../../core/choiceOptions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileChoiceOptionFromSlot(id = "", value = "") {
  const normalizedId = text(id) || "a";
  return parseChoiceOptionString(value, normalizedId);
}

export function compileChoiceOptionsFromSlots(slots = {}, startIndex = 0, optionIds = ["a", "b", "c"]) {
  return optionIds.map((id, offset) => compileChoiceOptionFromSlot(id, slots[startIndex + offset]));
}

export function compileSingleChoiceFields({
  slots = {},
  optionStartIndex = 0,
  answerIndex = 0,
  optionIds = ["a", "b", "c"]
} = {}) {
  return {
    selectionMode: "single",
    selectionCriterion: "correct",
    options: compileChoiceOptionsFromSlots(slots, optionStartIndex, optionIds),
    answerIds: [text(slots[answerIndex]).toLowerCase()].filter(Boolean)
  };
}
