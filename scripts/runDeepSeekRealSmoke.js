import fs from "node:fs";
import path from "node:path";

import { executeMicrosequenceGeneration } from "../src/generation/runtime/interventionRuntime.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function projectWithSinglePlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-vetores-matrizes",
        title: "Vetores e Matrizes",
        goal: "Ler vetores e matrizes em casos curtos.",
        modules: [
          {
            id: "module-base-visual",
            title: "Base Visual",
            guide: {
              goal: "Trabalhar leitura visual de vetor e matriz sem sair do escopo.",
              include: ["vetor 2D", "matriz 2x2"],
              exclude: ["determinante"],
              notation: ["Use pares ordenados e linhas/colunas."],
              avoid: ["Não abrir álgebra avançada."]
            },
            lessons: [
              {
                id: "lesson-casos-visuais",
                title: "Casos visuais",
                guide: {
                  goal: "Trabalhar leitura visual de vetor e matriz sem sair do escopo.",
                  include: ["vetor 2D", "matriz 2x2"],
                  exclude: ["determinante"],
                  notation: ["Use pares ordenados e linhas/colunas."],
                  avoid: ["Não abrir álgebra avançada."]
                },
                topics: [
                  {
                    id: "topic-vetor-2d",
                    label: "vetor 2D",
                    kind: "concept",
                    checks: ["o aluno lê coordenadas no plano"],
                    errors: []
                  },
                  {
                    id: "topic-matriz-2x2",
                    label: "matriz 2x2",
                    kind: "concept",
                    checks: ["o aluno localiza valores por linha e coluna"],
                    errors: []
                  }
                ],
                microsequences: [
                  {
                    id: "micro-visual-base",
                    title: "Leitura de vetor e matriz em casos mínimos",
                    goal: "Reconhecer coordenadas de um vetor 2D e localizar valores em uma matriz 2x2.",
                    role: "explain",
                    status: "planned",
                    dependsOn: [],
                    covers: ["vetor 2D", "matriz 2x2"],
                    checks: ["o aluno lê coordenadas no plano", "o aluno localiza valores por linha e coluna"],
                    cards: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildMarkdownReport(report = {}) {
  const feedbackLines = Array.isArray(report.feedback) ? report.feedback : [];
  const resources = Array.isArray(report.summary?.resources) ? report.summary.resources.join(", ") : "";
  const validationIssues = Array.isArray(report.summary?.validationIssues) ? report.summary.validationIssues : [];
  const errorLines = report.error
    ? [
        `- nome: ${report.error.name || ""}`,
        `- mensagem: ${report.error.message || ""}`,
        `- categoria: ${report.error.category || ""}`,
        `- statusCode: ${report.error.statusCode || ""}`
      ]
    : ["- nenhuma"];

  return [
    "# DeepSeek v4 Flash Smoke",
    "",
    `- Data: ${report.date || ""}`,
    `- Comando: \`${report.command || ""}\``,
    `- Provider: \`${report.provider || ""}\``,
    `- Modelo: \`${report.model || ""}\``,
    `- Base URL: \`${report.baseUrl || ""}\``,
    `- Cenário: ${report.scenario || ""}`,
    `- Chamada real: ${report.realApiCall ? "sim" : "não"}`,
    `- Resultado: ${report.result || ""}`,
    "",
    "## Resumo",
    "",
    `- Status: ${report.summary?.resultStatus || ""}`,
    `- Quantidade de cards: ${report.summary?.cardCount ?? ""}`,
    `- Recursos usados: ${resources}`,
    `- Validação ok: ${report.summary?.validationOk === true ? "sim" : "não"}`,
    `- Retomada: ${report.summary?.resumeFrom || "nenhuma"}`,
    "",
    "## Falhas estruturais ou didáticas",
    "",
    ...(validationIssues.length ? validationIssues.map((item) => `- ${item}`) : ["- nenhuma"]),
    "",
    "## Erro",
    "",
    ...errorLines,
    "",
    "## Feedback do runtime",
    "",
    ...(feedbackLines.length
      ? feedbackLines.map((item) => `- [${item.status || "?"}] ${item.message || ""}`)
      : ["- sem linhas de feedback"]),
    ""
  ].join("\n");
}

async function main() {
  const startedAt = new Date().toISOString();
  const model = text(process.env.DEEPSEEK_MODEL) || "deepseek-v4-flash";
  const provider = "openai-compatible";
  const baseUrl = text(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com";
  const apiKey = text(process.env.DEEPSEEK_API_KEY);
  const scenario = "generate_current visual-plane-matrix";
  const commandLabel = "npm run smoke:deepseek:real";
  const reportDir = path.join(process.cwd(), "tests", "reports");
  const jsonPath = path.join(reportDir, "deepseek-v4-flash-smoke.json");
  const mdPath = path.join(reportDir, "deepseek-v4-flash-smoke.md");

  if (!apiKey) {
    throw new Error("Defina DEEPSEEK_API_KEY para rodar o smoke real do DeepSeek.");
  }

  const feedback = [];
  let summary = null;
  let status;
  let errorInfo = null;

  try {
    const result = await executeMicrosequenceGeneration({
      selection: {
        courseKey: "course-vetores-matrizes",
        moduleKey: "module-base-visual",
        lessonKey: "lesson-casos-visuais",
        microsequenceKey: "micro-visual-base"
      },
      draft: {
        actionIntent: "generate_current",
        interventionTargetMode: "current",
        operationMode: "reinforce",
        promptText: "Abra com representação didaticamente adequada e pratique leitura visual sem sair do escopo de vetor 2D e matriz 2x2."
      },
      assistConfig: {
        model,
        apiKey,
        baseUrl
      },
      selectedRefIds: [],
      preferredContainerId: "",
      preferredContainerLabel: "",
      lessonContext: {
        currentMicrosequenceTitle: "Leitura de vetor e matriz em casos mínimos",
        microsequenceKeys: ["micro-visual-base"],
        reusableMicrosequenceCount: 1
      },
      projectDocument: projectWithSinglePlannedMicrosequence(),
      ingestAttachments: async () => ({
        attachments: [],
        warnings: [],
        extractedCount: 0
      }),
      onFeedback: (item) => feedback.push(item)
    });

    status = result.status;
    const generationResult = result.generationResult || {};
    const run = generationResult.interventionFeedback?.run || result.interventionFeedback?.run || null;
    const microsequence = generationResult.projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0]?.microsequences?.[0] || null;
    const cards = Array.isArray(microsequence?.cards) ? microsequence.cards : [];
    summary = {
      resultStatus: result.status,
      cardCount: cards.length,
      resources: [...new Set(cards.map((card) => card.resource))],
      validationOk: result.status === "success",
      validationIssues: [],
      resumeFrom: run?.resumeFrom || null,
      feedbackLines: Array.isArray(run?.steps) ? run.steps.length : feedback.length
    };
  } catch (error) {
    status = "error";
    errorInfo = {
      name: error?.name || "Error",
      message: error?.message || String(error),
      category: error?.category || null,
      statusCode: error?.statusCode || null
    };
  }

  const report = {
    date: startedAt,
    command: commandLabel,
    provider,
    model,
    baseUrl,
    scenario,
    realApiCall: true,
    usedEnvironmentVariable: true,
    result: status,
    summary,
    error: errorInfo,
    feedback: feedback.map((item) => ({
      stage: item.stage || item.phase || null,
      status: item.status || null,
      message: item.message || null,
      resumeFrom: item.resumeFrom || null
    }))
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, buildMarkdownReport(report));
  console.log(JSON.stringify({ jsonPath, mdPath, result: report.result, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
