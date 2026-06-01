export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_BETA_BASE_URL = "https://api.deepseek.com/beta";
export const DEEPSEEK_V4_FLASH = "deepseek-v4-flash";
export const DEEPSEEK_V4_PRO = "deepseek-v4-pro";
export const DEEPSEEK_QUALITY_MODEL = "deepseek-quality";

const DEEPSEEK_PHASE_POLICIES = Object.freeze({
  "scope-inference": Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "enabled" }),
    reasoningEffort: "high",
    maxTokens: 4000
  }),
  "top-down-plan": Object.freeze({
    modelId: DEEPSEEK_V4_PRO,
    thinking: Object.freeze({ type: "enabled" }),
    reasoningEffort: "max",
    maxTokens: 24000
  }),
  "top-down-repair": Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.1,
    maxTokens: 24000
  }),
  "bottom-up-draft": Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.2,
    maxTokens: 8000
  }),
  "bottom-up-compile": Object.freeze({
    modelId: DEEPSEEK_V4_FLASH,
    thinking: Object.freeze({ type: "disabled" }),
    temperature: 0.2,
    maxTokens: 16000
  }),
  "bottom-up-repair": Object.freeze({
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

function uniqueDefined(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => item !== undefined))];
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

export function buildDeepSeekChatPayload(request = {}, policy = null) {
  const systemInstruction = text(request.system) || "Responda somente JSON válido.";
  const payload = {
    model: resolveDeepSeekModelForPhase({
      selectedModelId: request.modelId,
      phase: request.phase
    }),
    response_format: { type: "json_object" },
    max_tokens: Number(policy?.maxTokens) || 4000,
    messages: [
      { role: "system", content: systemInstruction.includes("JSON válido") ? systemInstruction : `${systemInstruction}\nResponda somente JSON válido.` },
      { role: "user", content: text(request.prompt) }
    ]
  };

  payload.thinking = { type: "disabled" };
  payload.temperature = typeof policy?.temperature === "number"
    ? policy.temperature
    : typeof request.temperature === "number"
      ? request.temperature
      : 0.2;
  return payload;
}

export function buildDeepSeekTextPayload(request = {}, policy = null) {
  const systemInstruction = text(request.system) || "Responda exatamente no formato textual solicitado.";
  return {
    model: resolveDeepSeekModelForPhase({
      selectedModelId: request.modelId,
      phase: request.phase
    }),
    max_tokens: Number(policy?.maxTokens) || Number(request.maxTokens) || 4000,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: text(request.prompt) }
    ],
    thinking: { type: "disabled" },
    temperature: typeof policy?.temperature === "number"
      ? policy.temperature
      : typeof request.temperature === "number"
        ? request.temperature
        : 0.2
  };
}

function sanitizeDeepSeekStrictSchemaNode(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return node;
  }
  if (Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.allOf)) {
    const branches = [...(node.anyOf || []), ...(node.oneOf || []), ...(node.allOf || [])]
      .map((branch) => sanitizeDeepSeekStrictSchemaNode(branch))
      .filter(Boolean);
    const objectBranches = branches.filter((branch) => branch?.type === "object" && branch.properties && typeof branch.properties === "object");
    if (objectBranches.length) {
      const mergedProperties = {};
      objectBranches.forEach((branch) => {
        Object.entries(branch.properties || {}).forEach(([propertyName, propertySchema]) => {
          if (!(propertyName in mergedProperties)) {
            mergedProperties[propertyName] = propertySchema;
          }
        });
      });
      return {
        type: "object",
        properties: mergedProperties,
        additionalProperties: false
      };
    }
    const arrayBranches = branches.filter((branch) => branch?.type === "array");
    if (arrayBranches.length) {
      return {
        type: "array",
        items: sanitizeDeepSeekStrictSchemaNode(arrayBranches[0]?.items || {})
      };
    }
    const enumValues = uniqueDefined(branches.flatMap((branch) => (Array.isArray(branch?.enum) ? branch.enum : [])));
    if (enumValues.length) {
      return { type: "string", enum: enumValues };
    }
    const primitiveTypes = uniqueDefined(branches.map((branch) => branch?.type).filter((type) => typeof type === "string"));
    if (primitiveTypes.length === 1) {
      return { type: primitiveTypes[0] };
    }
    return { type: "string" };
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "minLength" || key === "maxLength" || key === "minItems" || key === "maxItems") {
      continue;
    }
    if (key === "const" && typeof value === "string") {
      sanitized.enum = [value];
      continue;
    }
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const properties = {};
      for (const [propertyName, propertySchema] of Object.entries(value)) {
        properties[propertyName] = sanitizeDeepSeekStrictSchemaNode(propertySchema);
      }
      sanitized.properties = properties;
      continue;
    }
    if (key === "items") {
      sanitized.items = sanitizeDeepSeekStrictSchemaNode(value);
      continue;
    }
    if (key === "$defs" && value && typeof value === "object" && !Array.isArray(value)) {
      const defs = {};
      for (const [defName, defSchema] of Object.entries(value)) {
        defs[defName] = sanitizeDeepSeekStrictSchemaNode(defSchema);
      }
      sanitized.$defs = defs;
      continue;
    }
    sanitized[key] = Array.isArray(value) ? [...value] : value;
  }

  if (sanitized.type === "object" && sanitized.properties && typeof sanitized.properties === "object") {
    const propertyNames = Object.keys(sanitized.properties);
    if (!propertyNames.length) {
      delete sanitized.properties;
      sanitized.type = "string";
      delete sanitized.required;
      delete sanitized.additionalProperties;
      return sanitized;
    }
    sanitized.required = Array.isArray(sanitized.required)
      ? sanitized.required.filter((item) => propertyNames.includes(item))
      : [];
    sanitized.additionalProperties = false;
  }

  return sanitized;
}

export function sanitizeDeepSeekStrictSchema(schema = {}) {
  return sanitizeDeepSeekStrictSchemaNode(schema);
}

export function buildDeepSeekToolPayload(request = {}, policy = null) {
  const systemInstruction = text(request.system) || "Responda chamando a função com argumentos JSON válidos.";
  const toolName = text(request.toolName) || "emit_structured_response";
  const serializedTargetSchema = JSON.stringify(request.schema || {});
  const payload = {
    model: resolveDeepSeekModelForPhase({
      selectedModelId: request.modelId,
      phase: request.phase
    }),
    max_tokens: Number(policy?.maxTokens) || 4000,
    messages: [
      {
        role: "system",
        content: systemInstruction.includes("função")
          ? `${systemInstruction}\nUse somente a função fornecida.\nDevolva no campo payload_json uma string JSON válida que satisfaça o schema solicitado.`
          : `${systemInstruction}\nUse somente a função fornecida.\nDevolva no campo payload_json uma string JSON válida que satisfaça o schema solicitado.`
      },
      {
        role: "user",
        content: [
          text(request.prompt),
          "",
          "TARGET_JSON_SCHEMA:",
          serializedTargetSchema,
          "",
          "Retorne a resposta final serializada em payload_json."
        ].join("\n")
      }
    ],
    tool_choice: {
      type: "function",
      function: {
        name: toolName
      }
    },
    parallel_tool_calls: false,
    tools: [
      {
        type: "function",
        function: {
          name: toolName,
          strict: true,
          description: text(request.toolDescription) || "Emita a resposta estruturada final do AraLearn.",
          parameters: {
            type: "object",
            properties: {
              payload_json: {
                type: "string",
                description: "String JSON serializada com a resposta final exata."
              }
            },
            required: ["payload_json"],
            additionalProperties: false
          }
        }
      }
    ]
  };

  payload.thinking = { type: "disabled" };
  payload.temperature = typeof policy?.temperature === "number"
    ? policy.temperature
    : typeof request.temperature === "number"
      ? request.temperature
      : 0.2;
  return payload;
}
