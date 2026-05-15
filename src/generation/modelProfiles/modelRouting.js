const TOP_DOWN_PROFILES = Object.freeze({
  codex_all: Object.freeze({ id: "codex_all", label: "Codex CLI — todas as etapas", defaultModelId: "codex-cli-local" }),
  economic: Object.freeze({ id: "economic", label: "Econômico", defaultModelId: "gemini-2.5-flash-lite" }),
  balanced: Object.freeze({ id: "balanced", label: "Equilibrado", defaultModelId: "gemini-2.5-flash" }),
  rigorous: Object.freeze({ id: "rigorous", label: "Mais rigoroso", defaultModelId: "openai:gpt-5.5" }),
  custom: Object.freeze({ id: "custom", label: "Personalizado", defaultModelId: "" })
});

export function getTopDownModelProfile(profileId = "codex_all") {
  return TOP_DOWN_PROFILES[profileId] || TOP_DOWN_PROFILES.codex_all;
}

export function resolveModelForCourseForgePhase({ selectedTopDownProfileId = "codex_all", phaseId = "", phaseModelOverrides = {} } = {}) {
  const override = phaseModelOverrides?.[phaseId];
  if (override) {
    return override;
  }
  return getTopDownModelProfile(selectedTopDownProfileId).defaultModelId;
}
