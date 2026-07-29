import { normalizeWhitespace } from "../../core/text.js";
import { parseStructuredJson, structuredResult } from "./structuredOutput.js";

export function createFakeProvider({ id = "fake", script = {}, structuredEngine = true } = {}) {
  const counters = new Map();

  function readStep(mode) {
    const queue = Array.isArray(script[mode]) ? script[mode] : [script[mode]];
    const index = counters.get(mode) || 0;
    counters.set(mode, index + 1);
    return queue[index];
  }

  return {
    id,
    label: "Fake",
    capabilities: {
      supportsStrictJsonSchema: true,
      supportsJsonMode: true,
      supportedSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
      maxContextClass: "small",
      structuredEngine
    },
    async generateText(request = {}) {
      const mode = normalizeWhitespace(request.mode || request.phase || "text");
      const step = readStep(mode);
      if (typeof step === "function") {
        const value = await step(request);
        if (typeof value === "string") {
          return { text: value, usage: {}, raw: value };
        }
        return structuredClone(value ?? { text: "", usage: {}, raw: null });
      }
      if (step instanceof Error) {
        throw step;
      }
      if (typeof step === "string") {
        return { text: step, usage: {}, raw: step };
      }
      if (step && typeof step === "object" && typeof step.text === "string") {
        return structuredClone(step);
      }
      return structuredClone(step ?? { text: "", usage: {}, raw: null });
    },
    async generateStructured(request = {}) {
      const result = await this.generateText(request);
      const value = result?.value && typeof result.value === "object"
        ? result.value
        : parseStructuredJson(result?.text);
      return structuredResult(value, result?.usage, result?.raw);
    }
  };
}
