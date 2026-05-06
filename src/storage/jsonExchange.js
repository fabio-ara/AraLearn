function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function detectJsonExchangeFormat(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error("JSON inválido: raiz deve ser um objeto.");
  }

  if (parsed.format === "aralearn.storage") {
    return "storage";
  }

  if (parsed.contract === "aralearn.contract" && Array.isArray(parsed.courses)) {
    return "contract";
  }

  throw new Error(
    'JSON inválido para importação. Use um curso com `contract: "aralearn.contract"` ou um backup com `format: "aralearn.storage"`.'
  );
}
