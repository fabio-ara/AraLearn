import { detectJsonExchangeFormat } from "../storage/jsonExchange.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";

const DEFAULT_EXTERNAL_IMPORT_SOURCE = "Compartilhamento Android";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function describeExternalImportFormat(format) {
  if (format === "contract") {
    return "Projeto AraLearn";
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

function validationMessage(validation) {
  const first = Array.isArray(validation?.errors) ? validation.errors[0] : null;
  if (!first) return "O curso não segue o contrato AraLearn 3.";
  const path = normalizeText(first.path);
  const message = normalizeText(first.message) || "Conteúdo inválido.";
  return path ? `${path}: ${message}` : message;
}

export function prepareSingleCourseImport(rawText, options = {}) {
  const prepared = handleExternalJsonImportText(rawText, options);
  const validation = validateProjectDocument(prepared.parsed);
  if (!validation.ok) {
    throw new Error(validationMessage(validation));
  }
  if (validation.value.courses.length !== 1) {
    throw new Error("Selecione um arquivo com exatamente um curso.");
  }
  return {
    ...prepared,
    parsed: validation.value,
    course: validation.value.courses[0]
  };
}
