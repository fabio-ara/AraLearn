export const CARD_ASSISTANCE_OPERATIONS = Object.freeze({
  EDIT_TEXT: "edit_text",
  RECOMPOSE_CARD: "recompose_card",
  RESTORE_VERSION: "restore_version"
});

export const CARD_ASSISTANCE_OPERATION_VALUES = Object.freeze(
  Object.values(CARD_ASSISTANCE_OPERATIONS)
);

export function normalizeCardAssistanceOperation(value) {
  const operation = typeof value === "string" ? value.trim() : "";
  return CARD_ASSISTANCE_OPERATION_VALUES.includes(operation) ? operation : "";
}
