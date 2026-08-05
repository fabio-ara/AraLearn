import {
  environmentText,
  runCardAssistanceSmoke
} from "./cardAssistanceSmoke.lib.js";
import { createGeminiProvider } from "../src/generation/providers/geminiProvider.js";

async function main() {
  const apiKey = environmentText("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("Defina GEMINI_API_KEY para rodar o smoke de assistência de card.");
  }
  const modelId = environmentText("GEMINI_MODEL") || "gemini-3.6-flash";
  await runCardAssistanceSmoke({
    provider: createGeminiProvider({ apiKey }),
    providerId: "gemini",
    modelId,
    reportFileName: "gemini-card-assistance.json"
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
