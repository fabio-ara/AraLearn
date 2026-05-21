const MODEL_CAPABILITIES = Object.freeze({
  "codex-cli-local": freezeModel({
    provider: "codex-cli",
    model: "codex-cli-local",
    family: "codex",
    tier: "local",
    profile: "local-extract-json",
    supportsJsonMode: false,
    supportsJsonSchema: false,
    supportsStrictJsonSchema: false,
    supportsFiles: true,
    supportsPdf: true,
    supportsImages: true,
    supportsThinking: true,
    supportsToolUse: false,
    contextClass: "large",
    recommendedPhases: ["architecture_plan", "architecture_audit", "repair"],
    riskyPhases: [],
    recommendedMaxCards: 6,
    absoluteMaxCards: 10,
    preferShortSchemas: false,
    defaultMode: "standard"
  }),
  "gemini-2.5-pro": freezeModel({
    provider: "google",
    model: "gemini-2.5-pro",
    family: "gemini",
    tier: "strong",
    profile: "strong-structured-json",
    supportsJsonMode: true,
    supportsJsonSchema: true,
    supportsStrictJsonSchema: false,
    supportsFiles: true,
    supportsPdf: true,
    supportsImages: true,
    supportsThinking: true,
    supportsToolUse: false,
    contextClass: "large",
    recommendedPhases: ["architecture_plan", "architecture_audit", "source_adherence_audit"],
    riskyPhases: [],
    recommendedMaxCards: 6,
    absoluteMaxCards: 10,
    preferShortSchemas: true,
    defaultMode: "standard"
  }),
  "gemini-2.5-flash": freezeModel({
    provider: "google",
    model: "gemini-2.5-flash",
    family: "gemini",
    tier: "balanced-cheap",
    profile: "weak-structured-json",
    supportsJsonMode: true,
    supportsJsonSchema: true,
    supportsStrictJsonSchema: false,
    supportsFiles: true,
    supportsPdf: true,
    supportsImages: true,
    supportsThinking: true,
    supportsToolUse: false,
    contextClass: "large",
    recommendedPhases: ["card_build", "microsequence_plan", "repair"],
    riskyPhases: ["architecture_plan", "final_audit"],
    recommendedMaxCards: 5,
    absoluteMaxCards: 8,
    preferShortSchemas: true,
    defaultMode: "weak"
  }),
  "gemini-2.5-flash-lite": freezeModel({
    provider: "google",
    model: "gemini-2.5-flash-lite",
    family: "gemini",
    tier: "cheap",
    profile: "weak-structured-json",
    supportsJsonMode: true,
    supportsJsonSchema: true,
    supportsStrictJsonSchema: false,
    supportsFiles: true,
    supportsPdf: true,
    supportsImages: true,
    supportsThinking: true,
    supportsToolUse: false,
    contextClass: "medium",
    recommendedPhases: ["repair"],
    riskyPhases: ["architecture_plan", "architecture_audit", "final_audit"],
    recommendedMaxCards: 3,
    absoluteMaxCards: 6,
    preferShortSchemas: true,
    defaultMode: "weak"
  }),
  "openai:gpt-5.5": freezeModel({ provider: "openai", model: "openai:gpt-5.5", family: "gpt", tier: "strong", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: true, supportsThinking: true, contextClass: "large" }),
  "openai:gpt-5.5-mini": freezeModel({ provider: "openai", model: "openai:gpt-5.5-mini", family: "gpt", tier: "balanced", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: true, supportsThinking: true, contextClass: "large" }),
  "anthropic:claude-opus": freezeModel({ provider: "anthropic", model: "anthropic:claude-opus", family: "claude", tier: "strong", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "anthropic:claude-sonnet": freezeModel({ provider: "anthropic", model: "anthropic:claude-sonnet", family: "claude", tier: "balanced", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "anthropic:claude-haiku": freezeModel({ provider: "anthropic", model: "anthropic:claude-haiku", family: "claude", tier: "cheap", supportsJsonMode: true, supportsJsonSchema: false, supportsStrictJsonSchema: false, supportsThinking: false, contextClass: "medium" }),
  "deepseek:deepseek-v4-pro": freezeModel({ provider: "deepseek", model: "deepseek:deepseek-v4-pro", family: "deepseek", tier: "strong", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "deepseek:deepseek-v4-flash": freezeModel({ provider: "deepseek", model: "deepseek:deepseek-v4-flash", family: "deepseek", tier: "cheap", supportsJsonMode: true, supportsJsonSchema: false, supportsStrictJsonSchema: false, supportsThinking: false, contextClass: "medium" }),
  "qwen:qwen3-max": freezeModel({ provider: "qwen", model: "qwen:qwen3-max", family: "qwen", tier: "strong", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "qwen:qwen3.5-plus": freezeModel({ provider: "qwen", model: "qwen:qwen3.5-plus", family: "qwen", tier: "balanced", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "qwen:qwen3.5-flash": freezeModel({ provider: "qwen", model: "qwen:qwen3.5-flash", family: "qwen", tier: "cheap", supportsJsonMode: true, supportsJsonSchema: false, supportsStrictJsonSchema: false, supportsThinking: false, contextClass: "medium" }),
  "kimi:kimi-k2.6": freezeModel({ provider: "kimi", model: "kimi:kimi-k2.6", family: "kimi", tier: "balanced", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "zai:glm-5.1": freezeModel({ provider: "zai", model: "zai:glm-5.1", family: "glm", tier: "strong", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "zai:glm-4.5": freezeModel({ provider: "zai", model: "zai:glm-4.5", family: "glm", tier: "balanced", supportsJsonMode: true, supportsJsonSchema: true, supportsStrictJsonSchema: false, supportsThinking: true, contextClass: "large" }),
  "zai:glm-4.5-flash": freezeModel({ provider: "zai", model: "zai:glm-4.5-flash", family: "glm", tier: "cheap", supportsJsonMode: true, supportsJsonSchema: false, supportsStrictJsonSchema: false, supportsThinking: false, contextClass: "medium" }),
  "generic-openai-compatible": freezeModel({ provider: "generic", model: "generic-openai-compatible", family: "generic", tier: "unknown", supportsJsonMode: true, supportsJsonSchema: false, supportsStrictJsonSchema: false, supportsThinking: false, contextClass: "unknown" })
});

function freezeModel(model) {
  return Object.freeze({
    family: "generic",
    tier: "unknown",
    profile: "standard-json",
    supportsJsonMode: true,
    supportsJsonSchema: false,
    supportsStrictJsonSchema: false,
    supportsFiles: false,
    supportsPdf: false,
    supportsImages: false,
    supportsThinking: false,
    supportsToolUse: false,
    contextClass: "unknown",
    recommendedPhases: [],
    riskyPhases: [],
    recommendedMaxCards: 5,
    absoluteMaxCards: 8,
    preferShortSchemas: false,
    defaultMode: "standard",
    cardBudgetSemantics: "technical_per_call",
    ...model,
    jsonMode: model.supportsJsonMode ?? true,
    responseMimeType: "application/json",
    supportsResponseJsonSchema: model.supportsJsonSchema ?? false,
    supportsResponseSchema: model.supportsStrictJsonSchema ?? false,
    supportsJsonSchemaSubset: model.supportsJsonSchema ?? false,
    schemaStrength: model.supportsStrictJsonSchema ? "strict" : model.supportsJsonSchema ? "partial" : "unknown",
    supportsFilesApi: model.supportsFiles ?? false
  });
}

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
    ...freezeModel({
      provider: "generic",
      model: normalizedModelId
    })
  };
}

export function listModelCapabilities() {
  return Object.values(MODEL_CAPABILITIES).map((item) => ({ ...item }));
}
