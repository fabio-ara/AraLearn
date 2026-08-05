export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_BETA_BASE_URL = "https://api.deepseek.com/beta";
export const DEEPSEEK_V4_FLASH = "deepseek-v4-flash";
export const DEEPSEEK_V4_PRO = "deepseek-v4-pro";
export const DEEPSEEK_QUALITY_MODEL = "deepseek-quality";

const DEEPSEEK_PHASE_POLICIES = Object.freeze({
  card_assistance_representation: Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0,
    maxTokens: 4000
  }),
  card_assistance_build: Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.1,
    maxTokens: 16000
  }),
  card_assistance_resource_repair: Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.1,
    maxTokens: 16000
  }),
  smoke: Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.2,
    maxTokens: 1000
  })
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(baseUrl = "") {
  return text(baseUrl).replace(/\/+$/, "").toLowerCase();
}

export function isDeepSeekBaseUrl(baseUrl = "") {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized === DEEPSEEK_BASE_URL || normalized.startsWith(`${DEEPSEEK_BASE_URL.toLowerCase()}/`);
}

export function resolveDeepSeekBaseUrl(baseUrl = "", { useBeta = false } = {}) {
  const normalized = text(baseUrl).replace(/\/+$/, "");
  if (!useBeta) {
    return normalized || DEEPSEEK_BASE_URL;
  }
  if (!normalized || isDeepSeekBaseUrl(normalized)) {
    return DEEPSEEK_BETA_BASE_URL;
  }
  return normalized;
}

export function isDeepSeekModelId(modelId = "") {
  const normalized = text(modelId).toLowerCase();
  return normalized === DEEPSEEK_QUALITY_MODEL
    || normalized === DEEPSEEK_V4_FLASH
    || normalized === DEEPSEEK_V4_PRO
    || normalized === `deepseek:${DEEPSEEK_V4_FLASH}`
    || normalized === `deepseek:${DEEPSEEK_V4_PRO}`;
}

export function isDeepSeekRequest({ modelId = "", baseUrl = "", providerId = "" } = {}) {
  return isDeepSeekModelId(modelId) || isDeepSeekBaseUrl(baseUrl) || text(providerId).toLowerCase() === "deepseek";
}

export function stripDeepSeekModelPrefix(modelId = "") {
  const normalized = text(modelId);
  return normalized.startsWith("deepseek:") ? normalized.slice("deepseek:".length) : normalized;
}

export function resolveDeepSeekPhasePolicy({ phase = "" } = {}) {
  return DEEPSEEK_PHASE_POLICIES[text(phase)] || null;
}

export function resolveDeepSeekModelForPhase({ selectedModelId = "", phase = "" } = {}) {
  const normalizedModelId = stripDeepSeekModelPrefix(selectedModelId);
  if (normalizedModelId === DEEPSEEK_QUALITY_MODEL) {
    return resolveDeepSeekPhasePolicy({ phase })?.modelId || DEEPSEEK_V4_FLASH;
  }
  if (normalizedModelId === DEEPSEEK_V4_FLASH || normalizedModelId === DEEPSEEK_V4_PRO) {
    return normalizedModelId;
  }
  return normalizedModelId || DEEPSEEK_V4_FLASH;
}

export function buildDeepSeekTextPayload(request = {}, policy = null) {
  const systemInstruction = text(request.system) || "Responda exatamente no formato textual solicitado.";
  const model = resolveDeepSeekModelForPhase({
    selectedModelId: request.modelId,
    phase: request.phase
  });
  return {
    model,
    max_tokens: Number(request.maxTokens) || Number(policy?.maxTokens) || 4000,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: text(request.prompt) }
    ],
    ...(model === DEEPSEEK_V4_FLASH || model === DEEPSEEK_V4_PRO
      ? { thinking: { type: "disabled" } }
      : {}),
    temperature: typeof policy?.temperature === "number"
      ? policy.temperature
    : typeof request.temperature === "number"
      ? request.temperature
      : 0.2
  };
}
