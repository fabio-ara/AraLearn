const MODEL_CAPABILITIES = Object.freeze({
  "gemini-2.5-flash": Object.freeze({
    provider: "google",
    model: "gemini-2.5-flash",
    profile: "weak-structured-json",
    jsonMode: true,
    responseMimeType: "application/json",
    supportsResponseJsonSchema: true,
    supportsResponseSchema: false,
    supportsJsonSchemaSubset: true,
    schemaStrength: "partial",
    supportsImages: true,
    supportsPdf: true,
    supportsFilesApi: true,
    recommendedMaxCards: 5,
    absoluteMaxCards: 7,
    preferShortSchemas: true,
    defaultMode: "weak"
  }),
  "gemini-2.5-flash-lite": Object.freeze({
    provider: "google",
    model: "gemini-2.5-flash-lite",
    profile: "weak-structured-json",
    jsonMode: true,
    responseMimeType: "application/json",
    supportsResponseJsonSchema: true,
    supportsResponseSchema: false,
    supportsJsonSchemaSubset: true,
    schemaStrength: "partial",
    supportsImages: true,
    supportsPdf: true,
    supportsFilesApi: true,
    recommendedMaxCards: 3,
    absoluteMaxCards: 5,
    preferShortSchemas: true,
    defaultMode: "weak"
  })
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getModelCapabilities(modelId = "") {
  const normalizedModelId = text(modelId) || "generic";
  const known = MODEL_CAPABILITIES[normalizedModelId];
  if (known) {
    return { ...known };
  }
  return {
    provider: "generic",
    model: normalizedModelId,
    profile: "standard-json",
    jsonMode: true,
    responseMimeType: "application/json",
    supportsResponseJsonSchema: false,
    supportsResponseSchema: false,
    supportsJsonSchemaSubset: false,
    schemaStrength: "unknown",
    supportsImages: false,
    supportsPdf: false,
    supportsFilesApi: false,
    recommendedMaxCards: 5,
    absoluteMaxCards: 7,
    preferShortSchemas: false,
    defaultMode: "standard"
  };
}
