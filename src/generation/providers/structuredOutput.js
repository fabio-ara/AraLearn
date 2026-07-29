export class ProviderCapabilityError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderCapabilityError";
    this.category = "provider_capability";
  }
}

export class ProviderStructuredOutputError extends Error {
  constructor(message, category = "invalid_structured_output") {
    super(message);
    this.name = "ProviderStructuredOutputError";
    this.category = category;
  }
}

export function parseStructuredJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new ProviderStructuredOutputError(
      "O provider não devolveu conteúdo estruturado.",
      "empty_structured_output"
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderStructuredOutputError(
      "O provider devolveu JSON inválido.",
      "invalid_structured_json"
    );
  }
}

export function structuredResult(value, usage = {}, raw = null) {
  if (!value || typeof value !== "object") {
    throw new ProviderStructuredOutputError("A saída estruturada precisa ser um objeto JSON.");
  }
  return {
    value: structuredClone(value),
    usage: structuredClone(usage || {}),
    raw
  };
}
