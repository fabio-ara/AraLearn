const GEMINI_FLASH_CAPABILITIES = Object.freeze({
  provider: "google",
  model: "gemini-2.5-flash",
  profile: "compact-json",
  supportsNativeJsonSchema: false,
  supportsImages: true,
  supportsPdf: true,
  supportsFilesApi: true,
  recommendedMaxCards: 7,
  preferShortSchemas: true
});

export function getModelCapabilities(modelId = "") {
  if (String(modelId).trim() === "gemini-2.5-flash") {
    return { ...GEMINI_FLASH_CAPABILITIES };
  }
  return {
    provider: "generic",
    model: String(modelId || "").trim() || "generic",
    profile: "standard-json",
    supportsNativeJsonSchema: false,
    supportsImages: false,
    supportsPdf: false,
    supportsFilesApi: false,
    recommendedMaxCards: 7,
    preferShortSchemas: false
  };
}
