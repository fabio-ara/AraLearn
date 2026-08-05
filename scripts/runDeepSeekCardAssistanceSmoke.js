import {
  environmentText,
  runCardAssistanceSmoke
} from "./cardAssistanceSmoke.lib.js";
import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";

async function main() {
  const apiKey = environmentText("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("Defina DEEPSEEK_API_KEY para rodar o smoke de assistência de card.");
  }
  const modelId = environmentText("DEEPSEEK_MODEL") || "deepseek-v4-flash";
  const originalFetch = globalThis.fetch;
  let paidCalls = 0;
  globalThis.fetch = (...args) => {
    paidCalls += 1;
    if (paidCalls > 1) {
      throw new Error("O smoke pago limita a execução a uma única chamada HTTP.");
    }
    return originalFetch(...args);
  };
  try {
    await runCardAssistanceSmoke({
      provider: createOpenAiCompatibleProvider({
        baseUrl: environmentText("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
        apiKey,
        useDeepSeekPolicy: true
      }),
      providerId: "deepseek",
      modelId,
      reportFileName: "deepseek-card-assistance.json",
      readTransportCallCount: () => paidCalls
    });
    if (paidCalls !== 1) {
      throw new Error("O smoke pago não realizou exatamente uma chamada HTTP.");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
