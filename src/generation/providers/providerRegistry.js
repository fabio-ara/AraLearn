import { createCodexCliProvider } from "./codexCliProvider.js";
import { isCodexBridgeTokenSecure } from "../../assist/codexBridgeShared.js";
import {
  CODEX_LOCAL_MODEL_ID,
  resolveCodexLocalEndpoint
} from "./codexCliConfig.js";
import {
  DEEPSEEK_BASE_URL,
  isDeepSeekModelId
} from "./deepSeekPolicy.js";
import { createGeminiProvider } from "./geminiProvider.js";
import { createOpenAiCompatibleProvider } from "./openAiCompatibleProvider.js";
import { protectProviderSecrets } from "./providerErrors.js";

export const CUSTOM_PROVIDER_MODEL_ID = "provider-custom";
export const PROVIDER_PROTOCOL = Object.freeze({
  OPENAI_COMPATIBLE: "openai-compatible",
  GEMINI: "gemini",
  LOCAL_BRIDGE: "local-bridge"
});

export const PROVIDER_PROTOCOL_OPTIONS = Object.freeze([
  Object.freeze({ value: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE, label: "Compatível com OpenAI" }),
  Object.freeze({ value: PROVIDER_PROTOCOL.GEMINI, label: "Gemini" }),
  Object.freeze({ value: PROVIDER_PROTOCOL.LOCAL_BRIDGE, label: "Bridge local" })
]);

export class ProviderConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderConfigurationError";
    this.category = "provider_configuration";
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireModelId(modelId) {
  const normalized = text(modelId);
  if (!normalized) {
    throw new ProviderConfigurationError("Informe o identificador do modelo.");
  }
  const hasControlCharacter = [...normalized].some((character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127;
  });
  if (normalized.length > 200 || hasControlCharacter) {
    throw new ProviderConfigurationError("O identificador do modelo é inválido.");
  }
  return normalized;
}

function requireSecret(secret, label = "chave da API") {
  const normalized = text(secret);
  if (!normalized) {
    throw new ProviderConfigurationError(`Informe a ${label}.`);
  }
  return normalized;
}

function requireLocalBridgeToken(secret) {
  const normalized = text(secret);
  if (!isCodexBridgeTokenSecure(normalized)) {
    throw new ProviderConfigurationError(
      "Informe um token do bridge local entre 32 e 512 bytes."
    );
  }
  return normalized;
}

function parseUrl(value, label) {
  try {
    return new URL(text(value));
  } catch {
    throw new ProviderConfigurationError(`${label} inválido.`);
  }
}

function assertCleanUrl(url, label) {
  if (url.username || url.password) {
    throw new ProviderConfigurationError(`${label} não pode conter credenciais.`);
  }
  if (url.search || url.hash) {
    throw new ProviderConfigurationError(`${label} não pode conter consulta nem fragmento.`);
  }
}

function runtimeAssistOrigins(source = globalThis.__ARALEARN_ENV__) {
  return Array.isArray(source?.assistAllowedOrigins)
    ? source.assistAllowedOrigins.map((origin) => text(origin)).filter(Boolean)
    : null;
}

export function assertProviderOriginAllowed(endpoint, source = globalThis.__ARALEARN_ENV__) {
  const allowedOrigins = runtimeAssistOrigins(source);
  if (allowedOrigins === null) return;
  const origin = parseUrl(endpoint, "Endpoint").origin;
  if (!allowedOrigins.includes(origin)) {
    throw new ProviderConfigurationError(
      `A origem ${origin} não está autorizada nesta instalação. Configure-a antes de usar o serviço.`
    );
  }
}

export function normalizeHttpsProviderUrl(value, { label = "Endpoint", allowRootPath = true } = {}) {
  const url = parseUrl(value, label);
  assertCleanUrl(url, label);
  if (url.protocol !== "https:") {
    throw new ProviderConfigurationError(`${label} deve usar HTTPS.`);
  }
  if (!allowRootPath && (!url.pathname || url.pathname === "/")) {
    throw new ProviderConfigurationError(`${label} deve indicar o caminho completo da operação.`);
  }
  url.pathname = url.pathname.replace(/\/{2,}/gu, "/").replace(/\/+$/u, "") || "/";
  return url.toString().replace(/\/$/u, "");
}

function resolveCustomProvider({ protocol, modelId, endpoint, secret }) {
  const normalizedProtocol = text(protocol);
  const normalizedModelId = requireModelId(modelId);

  if (normalizedProtocol === PROVIDER_PROTOCOL.OPENAI_COMPATIBLE) {
    const normalizedSecret = requireSecret(secret);
    const normalizedEndpoint = normalizeHttpsProviderUrl(endpoint, {
      label: "Endpoint compatível com OpenAI",
      allowRootPath: false
    });
    assertProviderOriginAllowed(normalizedEndpoint);
    return {
      protocol: normalizedProtocol,
      modelId: normalizedModelId,
      endpoint: normalizedEndpoint,
      provider: protectProviderSecrets(
        createOpenAiCompatibleProvider({
          endpoint: normalizedEndpoint,
          apiKey: normalizedSecret,
          useDeepSeekPolicy: false
        }),
        [normalizedSecret]
      )
    };
  }

  if (normalizedProtocol === PROVIDER_PROTOCOL.GEMINI) {
    const normalizedSecret = requireSecret(secret);
    const normalizedEndpoint = "https://generativelanguage.googleapis.com/v1beta";
    assertProviderOriginAllowed(normalizedEndpoint);
    return {
      protocol: normalizedProtocol,
      modelId: normalizedModelId,
      endpoint: normalizedEndpoint,
      provider: protectProviderSecrets(createGeminiProvider({ apiKey: normalizedSecret }), [normalizedSecret])
    };
  }

  if (normalizedProtocol === PROVIDER_PROTOCOL.LOCAL_BRIDGE) {
    const normalizedEndpoint = resolveCodexLocalEndpoint(endpoint);
    assertProviderOriginAllowed(normalizedEndpoint);
    const normalizedSecret = requireLocalBridgeToken(secret);
    return {
      protocol: normalizedProtocol,
      modelId: normalizedModelId,
      endpoint: normalizedEndpoint,
      provider: protectProviderSecrets(
        createCodexCliProvider({ endpoint: normalizedEndpoint, token: normalizedSecret }),
        [normalizedSecret]
      )
    };
  }

  throw new ProviderConfigurationError("Escolha o protocolo do serviço de linguagem.");
}

export function isCustomProviderSelection(selectedModel = "") {
  return text(selectedModel) === CUSTOM_PROVIDER_MODEL_ID;
}

export function isLocalProviderSelection({ selectedModel = "", providerProtocol = "" } = {}) {
  return text(selectedModel) === CODEX_LOCAL_MODEL_ID ||
    (isCustomProviderSelection(selectedModel) && text(providerProtocol) === PROVIDER_PROTOCOL.LOCAL_BRIDGE);
}

export function resolveConfiguredModelId({ selectedModel = "", customModelId = "" } = {}) {
  return isCustomProviderSelection(selectedModel)
    ? text(customModelId)
    : text(selectedModel);
}

export function createRegisteredProvider({
  selectedModel = "",
  apiKey = "",
  baseUrl = "",
  codexEndpoint = "",
  codexToken = "",
  providerProtocol = "",
  customModelId = "",
  providerEndpoint = "",
  providerSecret = ""
} = {}) {
  const modelId = text(selectedModel);

  if (isCustomProviderSelection(modelId)) {
    return resolveCustomProvider({
      protocol: providerProtocol,
      modelId: customModelId,
      endpoint: providerEndpoint,
      secret: providerSecret
    });
  }

  if (modelId === CODEX_LOCAL_MODEL_ID) {
    const endpoint = resolveCodexLocalEndpoint(codexEndpoint);
    assertProviderOriginAllowed(endpoint);
    const secret = requireLocalBridgeToken(codexToken);
    return {
      protocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
      modelId,
      endpoint,
      provider: protectProviderSecrets(createCodexCliProvider({ endpoint, token: secret }), [secret])
    };
  }

  if (isDeepSeekModelId(modelId)) {
    const secret = requireSecret(apiKey);
    const endpoint = normalizeHttpsProviderUrl(text(baseUrl) || DEEPSEEK_BASE_URL, {
      label: "Base URL do DeepSeek"
    });
    assertProviderOriginAllowed(endpoint);
    return {
      protocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
      modelId,
      endpoint,
      provider: protectProviderSecrets(
        createOpenAiCompatibleProvider({ baseUrl: endpoint, apiKey: secret, useDeepSeekPolicy: true }),
        [secret]
      )
    };
  }

  if (modelId.startsWith("gemini-")) {
    const secret = requireSecret(apiKey);
    const endpoint = "https://generativelanguage.googleapis.com/v1beta";
    assertProviderOriginAllowed(endpoint);
    return {
      protocol: PROVIDER_PROTOCOL.GEMINI,
      modelId,
      endpoint,
      provider: protectProviderSecrets(createGeminiProvider({ apiKey: secret }), [secret])
    };
  }

  throw new ProviderConfigurationError(`Modelo de geração não suportado: "${modelId}".`);
}

export function validateRegisteredProviderConfiguration(config = {}) {
  const registered = createRegisteredProvider(config);
  return {
    protocol: registered.protocol,
    modelId: registered.modelId,
    endpoint: registered.endpoint
  };
}
