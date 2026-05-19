import { normalizeWhitespace } from "../../core/text.js";

export function createFakeProvider({ id = "fake", script = {} } = {}) {
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
      supportsJsonSchema: true,
      supportsJsonMode: true,
      contextClass: "small"
    },
    async generateStructured(request = {}) {
      const mode = normalizeWhitespace(request.mode);
      const step = readStep(mode);
      if (typeof step === "function") {
        return structuredClone(await step(request));
      }
      if (step instanceof Error) {
        throw step;
      }
      return structuredClone(step ?? {});
    }
  };
}
