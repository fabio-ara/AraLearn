import { validateIntentV1Document } from "../contract/validateIntentV1.js";

export function parseProjectDocument(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return null;
  }

  const parsed = JSON.parse(rawValue);
  const result = validateIntentV1Document(parsed);

  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Projeto inválido no armazenamento: ${summary}`);
  }

  return result.value;
}

export function serializeProjectDocument(projectDocument) {
  const result = validateIntentV1Document(projectDocument);

  if (!result.ok) {
    const summary = result.errors.map((error) => `${error.path}: ${error.message}`).join("; ");
    throw new Error(`Projeto inválido: ${summary}`);
  }

  return JSON.stringify(result.value, null, 2);
}
