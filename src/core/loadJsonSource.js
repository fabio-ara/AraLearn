function makeError(message) {
  const error = new Error(message);
  error.name = "JsonLoadError";
  return error;
}

export function loadJsonSource(source) {
  if (typeof source === "string") {
    try {
      return JSON.parse(source);
    } catch (error) {
      throw makeError(`JSON inválido: ${error.message}`);
    }
  }

  if (source !== null && typeof source === "object" && !Array.isArray(source)) {
    return structuredClone(source);
  }

  throw makeError("Fonte inválida. Use uma string JSON ou um objeto.");
}
