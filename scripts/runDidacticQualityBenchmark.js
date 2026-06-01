import fs from "node:fs";
import path from "node:path";

import { evaluateDidacticQuality } from "../src/generation/engine/didacticQualityMetrics.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ratio(part, total) {
  if (!total) {
    return 0;
  }
  return Number((part / total).toFixed(4));
}

function buildProject({ title = "Posição a_ij", goal = "Ler posição em matriz.", covers = ["linha", "coluna", "posição a_ij"] } = {}) {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-benchmark",
        title: "Curso benchmark",
        goal: "Avaliar qualidade didática",
        modules: [
          {
            id: "module-benchmark",
            title: "Módulo benchmark",
            guide: {
              goal: "Trabalhar leitura local sem abrir outro tópico.",
              include: covers,
              exclude: ["determinante"],
              notation: [],
              avoid: []
            },
            lessons: [
              {
                id: "lesson-benchmark",
                title: "Lição benchmark",
                guide: {
                  goal: "Trabalhar leitura local sem abrir outro tópico.",
                  include: covers,
                  exclude: ["determinante"],
                  notation: [],
                  avoid: []
                },
                topics: [],
                microsequences: [
                  {
                    id: "micro-benchmark",
                    title,
                    goal,
                    role: "explain",
                    status: "planned",
                    dependsOn: [],
                    covers,
                    checks: covers.map((item) => `o aluno reconhece ${item}`),
                    versions: [],
                    activeVersion: null
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

function buildEvaluationContext({
  title = "Posição a_ij",
  goal = "Ler posição em matriz.",
  covers = ["linha", "coluna", "posição a_ij"],
  templateId = "matrix_locate_cell_choice",
  guideGoal = "Trabalhar leitura local sem abrir outro tópico."
} = {}) {
  const project = buildProject({ title, goal, covers });
  const lesson = project.courses[0].modules[0].lessons[0];
  const microsequence = lesson.microsequences[0];
  return {
    lesson,
    microsequence,
    planItems: [{ position: 1, templateId }],
    dependencyMicrosequences: []
  };
}

function evaluateScenarioQuality(result = {}) {
  const usageReport = result?.usageReport || {};
  const cardsBeforeAudit = Array.isArray(usageReport.cardsBeforeAudit) ? usageReport.cardsBeforeAudit : [];
  const cardsAfterAudit = Array.isArray(usageReport.cardsAfterAudit) ? usageReport.cardsAfterAudit : [];
  const lesson = result?.project?.courses?.[0]?.modules?.[0]?.lessons?.[0] || result?.projectDocument?.courses?.[0]?.modules?.[0]?.lessons?.[0];
  const microsequence = lesson?.microsequences?.[0];
  const dependencyMicrosequences = [];
  const before = evaluateDidacticQuality({
    cards: cardsBeforeAudit,
    planItems: Array.isArray(result?.plan?.cardPlan) ? result.plan.cardPlan : [],
    guide: lesson?.guide,
    microsequence,
    lesson,
    dependencyMicrosequences
  });
  const after = evaluateDidacticQuality({
    cards: cardsAfterAudit,
    planItems: Array.isArray(result?.plan?.cardPlan) ? result.plan.cardPlan : [],
    guide: lesson?.guide,
    microsequence,
    lesson,
    dependencyMicrosequences
  });
  return { before, after };
}

function buildMarkdown(report = {}) {
  return [
    "# Structured Engine Didactic Quality",
    "",
    `- Data: ${report.createdAt || ""}`,
    `- theoryDensityWarningsBefore: ${report.summary?.theoryDensityWarningsBefore ?? 0}`,
    `- theoryDensityWarningsAfter: ${report.summary?.theoryDensityWarningsAfter ?? 0}`,
    `- choiceOveruseWarningsBefore: ${report.summary?.choiceOveruseWarningsBefore ?? 0}`,
    `- choiceOveruseWarningsAfter: ${report.summary?.choiceOveruseWarningsAfter ?? 0}`,
    `- feedbackGenericWarningsBefore: ${report.summary?.feedbackGenericWarningsBefore ?? 0}`,
    `- feedbackGenericWarningsAfter: ${report.summary?.feedbackGenericWarningsAfter ?? 0}`,
    "",
    "## Cenários",
    ...(report.scenarios || []).map((scenario) => `- ${scenario.id}: scoreAntes=${scenario.before.score}; scoreDepois=${scenario.after.score}; patch=${scenario.auditPatchApplied ? "sim" : "não"}`)
  ].join("\n");
}

async function main() {
  const smokeReportPath = path.join(process.cwd(), "tests", "reports", "deepseek-v4-flash-structured-engine.json");
  if (!fs.existsSync(smokeReportPath)) {
    throw new Error("Relatório do smoke estruturado ausente. Rode npm run smoke:deepseek:structured antes do benchmark didático.");
  }
  const smokeReport = JSON.parse(fs.readFileSync(smokeReportPath, "utf8"));
  const realContext = buildEvaluationContext();
  const realScenario = {
    projectDocument: buildProject(),
    plan: { cardPlan: realContext.planItems },
    usageReport: {
      cardsBeforeAudit: smokeReport.auditPatchScenario?.cardsBeforeAudit || [],
      cardsAfterAudit: smokeReport.auditPatchScenario?.cardsAfterAudit || [],
      audit: {
        appliedSlotPatches: smokeReport.auditPatchScenario?.appliedSlotPatches || []
      }
    }
  };
  const syntheticContext = buildEvaluationContext({
    title: "Caminho em árvore",
    goal: "Reconhecer caminho hierárquico sem abrir outro tópico.",
    covers: ["árvore", "caminho hierárquico"],
    templateId: "tree_path",
    guideGoal: "Introduzir leitura hierárquica com explicação e prática."
  });
  const syntheticBefore = {
    cards: [
      {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        title: "Caminho em árvore",
        text: "Uma árvore organiza níveis e relações; além disso, cada nó pode levar a outro; por fim, o caminho precisa preservar a ordem da raiz até a folha; e também convém observar cada passo antes de decidir a resposta.",
        after: "Revise o conteúdo."
      },
      {
        position: 2,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Caminho",
        question: "Qual caminho chega até arquivo.txt?",
        options: [
          { id: "a", text: "pasta > arquivo.txt" },
          { id: "b", text: "arquivo.txt" },
          { id: "c", text: "raiz > pasta > arquivo.txt" }
        ],
        answer: "c",
        after: "Correto."
      }
    ]
  };
  const syntheticAfter = {
    cards: [
      {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        title: "Caminho em árvore",
        text: "Em uma árvore, leia o caminho da raiz até o item final. Cada passo mostra um nível da hierarquia.",
        after: "Observe a ordem dos níveis antes de escolher."
      },
      {
        position: 2,
        resource: "tree",
        kind: "exercise",
        exercise: "choice",
        title: "Caminho",
        question: "Qual caminho sai de raiz e chega até arquivo.txt?",
        options: [
          { id: "a", text: "raiz > pasta > arquivo.txt" },
          { id: "b", text: "pasta > arquivo.txt" },
          { id: "c", text: "raiz > arquivo.txt" }
        ],
        answer: "a",
        after: "A alternativa correta passa por raiz, depois pasta e só então chega a arquivo.txt."
      }
    ]
  };
  const syntheticScenario = {
    id: "sintetico-densidade-e-feedback",
    auditPatchApplied: true,
    before: evaluateDidacticQuality({
      cards: syntheticBefore.cards,
      planItems: syntheticContext.planItems,
      guide: syntheticContext.lesson.guide,
      microsequence: syntheticContext.microsequence,
      lesson: syntheticContext.lesson,
      dependencyMicrosequences: syntheticContext.dependencyMicrosequences
    }),
    after: evaluateDidacticQuality({
      cards: syntheticAfter.cards,
      planItems: syntheticContext.planItems,
      guide: syntheticContext.lesson.guide,
      microsequence: syntheticContext.microsequence,
      lesson: syntheticContext.lesson,
      dependencyMicrosequences: syntheticContext.dependencyMicrosequences
    })
  };

  const scenarios = [
    {
      id: "deepseek-real",
      auditPatchApplied: realScenario.usageReport?.audit?.appliedSlotPatches?.length > 0,
      ...evaluateScenarioQuality(realScenario)
    },
    syntheticScenario
  ];

  const summary = scenarios.reduce((accumulator, scenario) => ({
    theoryDensityWarningsBefore: accumulator.theoryDensityWarningsBefore + scenario.before.metrics.theoryDensity.warnings.length,
    theoryDensityWarningsAfter: accumulator.theoryDensityWarningsAfter + scenario.after.metrics.theoryDensity.warnings.length,
    choiceOveruseWarningsBefore: accumulator.choiceOveruseWarningsBefore + scenario.before.metrics.choiceOveruse.warnings.length,
    choiceOveruseWarningsAfter: accumulator.choiceOveruseWarningsAfter + scenario.after.metrics.choiceOveruse.warnings.length,
    feedbackGenericWarningsBefore: accumulator.feedbackGenericWarningsBefore + scenario.before.metrics.feedbackSpecificity.warnings.length,
    feedbackGenericWarningsAfter: accumulator.feedbackGenericWarningsAfter + scenario.after.metrics.feedbackSpecificity.warnings.length
  }), {
    theoryDensityWarningsBefore: 0,
    theoryDensityWarningsAfter: 0,
    choiceOveruseWarningsBefore: 0,
    choiceOveruseWarningsAfter: 0,
    feedbackGenericWarningsBefore: 0,
    feedbackGenericWarningsAfter: 0
  });

  const report = {
    createdAt: new Date().toISOString(),
    scenarios,
    summary
  };

  const reportPathJson = path.join(process.cwd(), "tests", "reports", "structured-engine-didactic-quality.json");
  const reportPathMd = path.join(process.cwd(), "tests", "reports", "structured-engine-didactic-quality.md");
  fs.mkdirSync(path.dirname(reportPathJson), { recursive: true });
  fs.writeFileSync(reportPathJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPathMd, buildMarkdown(report));
  if (summary.theoryDensityWarningsAfter > summary.theoryDensityWarningsBefore) {
    throw new Error("Benchmark didático terminou com piora de densidade teórica.");
  }
  if (summary.feedbackGenericWarningsAfter > summary.feedbackGenericWarningsBefore) {
    throw new Error("Benchmark didático terminou com piora de feedback genérico.");
  }
  console.log(JSON.stringify({
    reportPathJson,
    reportPathMd,
    qualityImproved: ratio(summary.feedbackGenericWarningsAfter + summary.theoryDensityWarningsAfter, Math.max(1, summary.feedbackGenericWarningsBefore + summary.theoryDensityWarningsBefore))
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
