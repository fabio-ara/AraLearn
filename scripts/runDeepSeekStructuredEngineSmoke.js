import fs from "node:fs";
import path from "node:path";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import { runStructuredBottomUp } from "../src/generation/engine/structuredBottomUpRuntime.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";
import { validateCard } from "../src/domain/cards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  const apiKey = text(process.env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    throw new Error("Defina DEEPSEEK_API_KEY para rodar o smoke structured-engine.");
  }
  const modelId = text(process.env.DEEPSEEK_MODEL) || "deepseek-v4-flash";
  const provider = createOpenAiCompatibleProvider({
    baseUrl: text(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com",
    apiKey,
    structuredOutputMode: "json_mode"
  });
  const scopeContract = {
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Leitura de dados", goal: "Interpretar dados tabulares e estatísticos." },
    modules: [{
      title: "Representações",
      include: ["tabela", "gráfico", "tendência"],
      exclude: ["inferência estatística"],
      notes: "Casos mínimos e verificáveis.",
      assessmentStyle: "mixed"
    }]
  };
  const topDown = await planCourseFromScope({
    scopeContract,
    provider,
    modelId,
    project: createEmptyProjectDocument()
  });
  const bottomUp = await runStructuredBottomUp({
    provider,
    modelId,
    generationContract: {
      path: { courseTitle: "Leitura de dados", moduleTitle: "Representações" },
      guide: {
        goal: "Interpretar tabela e gráfico.",
        include: ["tabela", "gráfico", "tendência"],
        exclude: ["inferência estatística"],
        notation: [],
        avoid: []
      },
      microsequence: {
        title: "Da tabela ao gráfico",
        goal: "Relacionar valores tabulares a uma tendência visual."
      },
      request: { operation: "review" },
      didactics: { language: "pt-BR", difficulty: "introductory" },
      sources: [],
      context: { refs: [], currentCards: [] },
      knownErrors: []
    },
    didacticPlan: [
      { position: 1, role: "explain", objective: "Apresentar uma representação adequada." },
      { position: 2, role: "practice", objective: "Verificar a leitura da tendência." }
    ]
  });
  const validations = bottomUp.cards.map((card, index) =>
    validateCard(card, `$.cards[${index}]`)
  );
  const report = {
    contract: "aralearn.structured-engine-smoke.v4",
    createdAt: new Date().toISOString(),
    modelId,
    topDown: {
      moduleCount: topDown.plannedCourse.course.modules.length,
      appliedPatches: topDown.appliedTopDownPatches.length
    },
    bottomUp: {
      cardPlan: bottomUp.cardPlan,
      cardCount: bottomUp.cards.length,
      resources: bottomUp.cards.map((card) => `${card.resource}:${card.exercise}`),
      valid: validations.every((result) => result.ok),
      errors: validations.flatMap((result) => result.errors || [])
    }
  };
  const reportDir = path.join(process.cwd(), "tests", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "deepseek-v4-flash-structured-engine.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (!report.bottomUp.valid) {
    throw new Error(`Smoke estruturado produziu cards inválidos: ${JSON.stringify(report.bottomUp.errors)}`);
  }
  console.log(JSON.stringify({ ok: true, reportPath, ...report.bottomUp }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
