import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";
import { parseStructuredJson, structuredResult } from "./structuredOutput.js";

function buildCodexPrompt({ system = "", prompt = "" } = {}) {
  return [system, prompt, "Responda exatamente no formato textual solicitado."].filter(Boolean).join("\n\n");
}

export function createCodexCliProvider({ endpoint = "http://127.0.0.1:4183/assist", token = "" } = {}) {
  async function sendCodexRequest(request = {}) {
    const system = text(request.system);
    const prompt = text(request.prompt);
    const response = await fetch(text(request.endpoint || endpoint) || "http://127.0.0.1:4183/assist", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(text(request.token || token) ? { "x-aralearn-token": text(request.token || token) } : {})
      },
      body: JSON.stringify({
        provider: "codex-cli-local",
        modelId: text(request.modelId) || "codex-cli-local",
        mode: text(request.mode || request.phase || "text"),
        request: {
          system,
          prompt,
          prebuiltPrompt: buildCodexPrompt({ system, prompt }),
          ...(request.schema && typeof request.schema === "object"
            ? { schema: request.schema }
            : {})
        }
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ProviderHttpError({
        statusCode: response.status,
        message: data?.error || `Falha HTTP ${response.status}.`,
        payload: data
      });
    }
    const result = structuredClone(data?.result ?? {});
    const outputText =
      typeof result === "string"
        ? result
        : text(result?.text || result?.content || result?.response || result?.output);
    return {
      text: outputText,
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
      const result = await sendCodexRequest(request);
      return structuredResult(parseStructuredJson(result.text), result.usage, result.raw);
    }
  };
}
