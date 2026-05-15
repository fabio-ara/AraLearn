import { resolveCodexLocalEndpoint } from "../../assist/codexLocalAssist.js";
import { ProviderHttpError } from "./providerErrors.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createCodexCliProvider({ endpoint, token = "", modelId = "codex-cli-local" } = {}) {
  const target = resolveCodexLocalEndpoint(endpoint);
  return {
    id: "codex-cli",
    capabilities: {
      provider: "codex-cli",
      model: modelId,
      supportsJsonMode: false,
      supportsJsonSchema: false,
      supportsStrictJsonSchema: false,
      contextClass: "local"
    },
    async callJson(input = {}) {
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-aralearn-token": token } : {})
        },
        body: JSON.stringify({
          provider: modelId,
          mode: text(input.phaseId) || "courseforge-phase",
          promptText: "",
          context: {},
          request: {
            prebuiltPrompt: text(input.prompt),
            artifacts: Array.isArray(input.artifacts) ? input.artifacts : []
          }
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ProviderHttpError({ statusCode: response.status, message: data?.error || `Falha HTTP ${response.status}.`, payload: data });
      }
      return {
        ok: true,
        value: data?.result,
        rawText: JSON.stringify(data?.result || {})
      };
    }
  };
}
