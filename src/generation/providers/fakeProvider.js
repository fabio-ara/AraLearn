function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createFakeProvider({ id = "fake", script = {} } = {}) {
  const counters = new Map();

  function nextEntry(phaseId) {
    const entries = Array.isArray(script[phaseId]) ? script[phaseId] : [script[phaseId]];
    const index = counters.get(phaseId) || 0;
    counters.set(phaseId, index + 1);
    return entries[index];
  }

  return {
    id,
    capabilities: {
      provider: "fake",
      model: "fake:model",
      supportsJsonMode: true,
      supportsJsonSchema: true,
      supportsStrictJsonSchema: false,
      contextClass: "test"
    },
    async callJson(input = {}) {
      const phaseId = text(input.phaseId);
      const entry = nextEntry(phaseId);
      if (typeof entry === "function") {
        const result = await entry(input);
        if (result instanceof Error) {
          throw result;
        }
        if (result && typeof result === "object" && ("ok" in result || "value" in result || "rawText" in result)) {
          return result;
        }
        return {
          ok: true,
          value: structuredClone(result ?? {}),
          rawText: JSON.stringify(result ?? {})
        };
      }
      if (entry instanceof Error) {
        throw entry;
      }
      if (entry && entry.throw) {
        throw entry.throw;
      }
      return {
        ok: true,
        value: structuredClone(entry ?? {}),
        rawText: JSON.stringify(entry ?? {})
      };
    }
  };
}
