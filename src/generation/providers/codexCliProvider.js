import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";

function withNullType(typeValue) {
  if (Array.isArray(typeValue)) {
    return typeValue.includes("null") ? typeValue : [...typeValue, "null"];
  }
  if (typeof typeValue === "string" && typeValue) {
    return typeValue === "null" ? "null" : [typeValue, "null"];
  }
  return ["null"];
}

function normalizeSchemaForCodex(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  const nextSchema = structuredClone(schema);
  ["anyOf", "allOf", "oneOf"].forEach((key) => {
    if (Array.isArray(nextSchema[key])) {
      nextSchema[key] = nextSchema[key].map((entry) => normalizeSchemaForCodex(entry));
    }
  });
  if (nextSchema.properties && typeof nextSchema.properties === "object" && !Array.isArray(nextSchema.properties)) {
    const propertyEntries = Object.entries(nextSchema.properties).map(([key, value]) => [key, normalizeSchemaForCodex(value)]);
    nextSchema.properties = Object.fromEntries(
      propertyEntries.map(([key, value]) => {
        if (!nextSchema.required?.includes(key)) {
          return [
            key,
            value && typeof value === "object" && !Array.isArray(value)
              ? { ...value, type: withNullType(value.type) }
              : value
          ];
        }
        return [key, value];
      })
    );
    nextSchema.required = Object.keys(nextSchema.properties);
  }
  if (nextSchema.items && typeof nextSchema.items === "object") {
    nextSchema.items = Array.isArray(nextSchema.items)
      ? nextSchema.items.map((item) => normalizeSchemaForCodex(item))
      : normalizeSchemaForCodex(nextSchema.items);
  }
  return nextSchema;
}

function buildCodexPrebuiltPrompt({ system = "", prompt = "", schema = null } = {}) {
  const schemaSection =
    schema && typeof schema === "object"
      ? [
          "Siga exatamente o schema JSON abaixo.",
          "Não omita chaves obrigatórias.",
          "Não adicione campos fora do schema.",
          JSON.stringify(schema, null, 2)
        ].join("\n\n")
      : "";
  return [system, prompt, schemaSection, "Responda somente JSON válido."].filter(Boolean).join("\n\n");
}

export function createCodexCliProvider({ endpoint = "http://127.0.0.1:4183/assist", token = "" } = {}) {
  return {
    id: "codex-cli",
    label: "Codex local",
    capabilities: {
      supportsJsonSchema: false,
      supportsJsonMode: false,
      contextClass: "local"
    },
    async generateStructured(request = {}) {
      const system = text(request.system);
      const prompt = text(request.prompt);
      const normalizedSchema = normalizeSchemaForCodex(request.schema || null);
      const response = await fetch(text(request.endpoint || endpoint) || "http://127.0.0.1:4183/assist", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(text(request.token || token) ? { "x-aralearn-token": text(request.token || token) } : {})
        },
        body: JSON.stringify({
          provider: "codex-cli-local",
          modelId: text(request.modelId) || "codex-cli-local",
          mode: text(request.mode),
          request: {
            system,
            prompt,
            prebuiltPrompt: buildCodexPrebuiltPrompt({
              system,
              prompt,
              schema: normalizedSchema
            }),
            schema: normalizedSchema
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
      return structuredClone(data?.result ?? {});
    }
  };
}
