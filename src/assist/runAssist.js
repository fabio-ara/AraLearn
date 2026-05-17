import { runAssistWithResolvedProvider } from "./assistProviderRegistry.js";

export function runAssist(request = {}) {
  return runAssistWithResolvedProvider(request);
}

