import fs from "node:fs";
import path from "node:path";

import {
  createTransportCallLimiter,
  DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS,
  runDeepSeekBottomUpRealHarness
} from "./deepSeekBottomUpRealHarness.lib.js";
import { environmentText } from "./cardAssistanceSmoke.lib.js";
import {
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_PRO
} from "../src/generation/providers/deepSeekPolicy.js";
import {
  createOpenAiCompatibleProvider
} from "../src/generation/providers/openAiCompatibleProvider.js";

async function main() {
  const apiKey = environmentText("DEEPSEEK_API_KEY");
  if (!apiKey) {
    throw new Error("Defina DEEPSEEK_API_KEY para rodar a bateria real do bottom-up.");
  }
  const modelId = environmentText("DEEPSEEK_MODEL") || DEEPSEEK_V4_FLASH;
  const scenarioId = environmentText("DEEPSEEK_SMOKE_SCENARIO");
  if (![DEEPSEEK_V4_FLASH, DEEPSEEK_V4_PRO].includes(modelId)) {
    throw new Error(
      `DEEPSEEK_MODEL deve ser ${DEEPSEEK_V4_FLASH} ou ${DEEPSEEK_V4_PRO}.`
    );
  }

  const originalFetch = globalThis.fetch;
  const transport = createTransportCallLimiter({
    fetchImpl: originalFetch,
    maxCalls: DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS
  });
  globalThis.fetch = transport.fetch;
  try {
    const report = await runDeepSeekBottomUpRealHarness({
      provider: createOpenAiCompatibleProvider({
        baseUrl: environmentText("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
        apiKey,
        useDeepSeekPolicy: true
      }),
      modelId,
      scenarioId,
      readTransportCallCount: transport.readCallCount,
      transportCallLimit: DEEPSEEK_REAL_SMOKE_MAX_TRANSPORT_CALLS
    });
    const reportDir = path.join(process.cwd(), "tests", "reports");
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, "deepseek-bottom-up-real.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ok: true, reportPath, ...report }, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
