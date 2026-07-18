import { detectJsonExchangeFormat } from "../storage/jsonExchange.js";

const DEFAULT_EXTERNAL_IMPORT_SOURCE = "Compartilhamento Android";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function describeExternalImportFormat(format) {
  if (format === "contract") {
    return "Projeto AraLearn";
  }
  if (format === "storage") {
    return "Backup completo";
  }
  return "Desconhecido";
}

export function handleExternalJsonImportText(rawText, { sourceName = DEFAULT_EXTERNAL_IMPORT_SOURCE } = {}) {
  const normalizedText = normalizeText(rawText);
  if (!normalizedText) {
    throw new Error("O conteúdo compartilhado está vazio.");
  }

  let parsed;
  try {
    parsed = JSON.parse(normalizedText);
  } catch {
    throw new Error("JSON inválido.");
  }

  let detectedFormat;
  try {
    detectedFormat = detectJsonExchangeFormat(parsed);
  } catch {
    throw new Error("O conteúdo compartilhado não parece ser um arquivo AraLearn válido.");
  }

  return {
    rawText: normalizedText,
    parsed,
    detectedFormat,
    formatLabel: describeExternalImportFormat(detectedFormat),
    sourceName: normalizeText(sourceName) || DEFAULT_EXTERNAL_IMPORT_SOURCE
  };
}
