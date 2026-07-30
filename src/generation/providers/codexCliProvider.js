import { text } from "../../core/text.js";
import {
  isCodexCardAssistancePhase,
  isCodexBridgeTokenSecure,
  validateJsonSchemaValue
} from "../../assist/codexBridgeShared.js";
import { ProviderHttpError } from "./providerErrors.js";
import {
  parseStructuredJson,
  ProviderStructuredOutputError,
  stripStructuredNulls,
  structuredResult,
  toStrictJsonSchema
} from "./structuredOutput.js";
import {
  fetchProviderJsonResponse,
  resolveProviderTimeoutMs
} from "./providerTransport.js";

function buildCodexPrompt({ system = "", prompt = "", structured = false } = {}) {
  return [
    system,
    prompt,
    structured
      ? "Responda somente com um objeto JSON válido que satisfaça integralmente o contrato canônico fornecido."
      : "Responda exatamente no formato textual solicitado.",
  ].filter(Boolean).join("\n\n");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function bridgeEnvelopeText(value) {
  if (typeof value === "string") return value;
  if (!isPlainObject(value)) return "";
  const envelopeFields = new Set(["content", "output", "response", "text", "usage"]);
  if (Object.keys(value).some((fieldName) => !envelopeFields.has(fieldName))) return "";
  return text(value.text || value.content || value.response || value.output);
}

export function createCodexCliProvider({ endpoint = "http://127.0.0.1:4183/assist", token = "" } = {}) {
  async function sendCodexRequest(request = {}) {
    const system = text(request.system);
    const prompt = text(request.prompt);
    const requestToken = text(request.token) || text(token);
    if (!isCodexBridgeTokenSecure(requestToken)) {
      throw new ProviderHttpError({
        statusCode: 401,
        message: "O token do bridge local é obrigatório e deve ter entre 32 e 512 bytes."
      });
    }
    const mode = text(request.mode || request.phase);
    if (!isCodexCardAssistancePhase(mode)) {
      throw new ProviderHttpError({
        statusCode: 400,
        message: "O Codex local atende somente à assistência atômica de cards."
      });
    }
    const outputSchema = isPlainObject(request.schema) ? request.schema : null;
    const bridgeSchema = outputSchema ? toStrictJsonSchema(outputSchema) : null;
    const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, {
      envName: "ARALEARN_CODEX_PROVIDER_TIMEOUT_MS",
      fallback: 185000
    });
    const { response, data } = await fetchProviderJsonResponse(
      text(request.endpoint || endpoint) || "http://127.0.0.1:4183/assist",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-aralearn-token": requestToken
        },
        body: JSON.stringify({
          provider: "codex-cli-local",
          modelId: text(request.modelId) || "codex-cli-local",
          mode,
          request: {
            system,
            prompt,
            prebuiltPrompt: buildCodexPrompt({
              system,
              prompt,
              structured: Boolean(outputSchema)
            }),
            ...(bridgeSchema
              ? { schema: bridgeSchema }
              : {}),
            ...(outputSchema
              ? { guidanceSchema: outputSchema }
              : {})
          }
        })
      },
      {
        provider: "Bridge local",
        timeoutMs
      }
    );
    if (!response.ok) {
      throw new ProviderHttpError({
        statusCode: response.status,
        message: data?.error || `Falha HTTP ${response.status}.`,
        payload: data
      });
    }
    if (!data || typeof data !== "object") {
      throw new ProviderStructuredOutputError(
        "O bridge local devolveu uma resposta HTTP sem JSON utilizável.",
        "invalid_provider_response"
      );
    }
    if (data.ok === false) {
      throw new ProviderHttpError({
        statusCode: Number(data.statusCode) || (response.status >= 400 ? response.status : 502),
        message: text(data.error?.message || data.error) || "O bridge local recusou a operação.",
        payload: data
      });
    }
    const result = structuredClone(data?.result ?? null);
    return {
      result,
      text: bridgeEnvelopeText(result),
      usage: result?.usage && typeof result.usage === "object" ? result.usage : {},
      raw: data
    };
  }

  return {
    id: "codex-cli",
    label: "Codex local",
    capabilities: {
      supportsStrictJsonSchema: true,
      supportsJsonMode: true,
      supportedSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
      maxContextClass: "local",
      structuredEngine: true
    },
    async generateText(request = {}) {
      return sendCodexRequest(request);
    },
    async generateStructured(request = {}) {
      if (!isPlainObject(request.schema)) {
        throw new ProviderStructuredOutputError(
          "O bridge local exige um schema JSON explícito para saída estruturada.",
          "invalid_structured_output"
        );
      }
      const result = await sendCodexRequest(request);
      const envelopeText = bridgeEnvelopeText(result.result);
      const value = stripStructuredNulls(
        envelopeText ? parseStructuredJson(envelopeText) : result.result,
        request.schema
      );
      const validation = validateJsonSchemaValue(value, request.schema);
      if (!validation.valid) {
        throw new ProviderStructuredOutputError(
          `A saída do bridge local não satisfaz o schema solicitado: ${validation.error}`,
          "invalid_structured_output"
        );
      }
      return structuredResult(value, result.usage, result.raw);
    }
  };
}
