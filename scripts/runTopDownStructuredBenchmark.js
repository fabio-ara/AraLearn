import fs from "node:fs";
import path from "node:path";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ratio(part, total) {
  if (!total) {
    return 0;
  }
  return Number((part / total).toFixed(4));
}

function average(values = []) {
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length);
}

function getLastPhase(phases = [], phaseName = "") {
  return [...(Array.isArray(phases) ? phases : [])].reverse().find((item) => item.phase === phaseName) || {};
}

function ensureProvider() {
  const apiKey = text(process.env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY ausente. Defina a variável de ambiente para rodar o benchmark top-down.");
  }
  return {
    provider: createOpenAiCompatibleProvider({
      baseUrl: "https://api.deepseek.com",
      apiKey
    }),
    modelId: "deepseek-v4-flash"
  };
}

function analyzeTopDownRaw(rawText = "") {
  const warnings = {
    dependencyErrors: 0,
    futureDependencyErrors: 0,
    circularDependencyErrors: 0,
    scopeLeaks: 0,
    emptyChecks: 0,
    vagueGoals: 0,
    granularityWarnings: 0
  };
  try {
    const parsed = JSON.parse(rawText);
    const modules = parsed?.course?.modules || parsed?.modules || [];
    modules.forEach((moduleValue) => {
      const excluded = Array.isArray(moduleValue?.exclude) ? moduleValue.exclude : [];
      (moduleValue.lessons || []).forEach((lesson) => {
        const seenTitles = [];
        const adjacency = new Map();
        (lesson.microsequences || []).forEach((microsequence) => {
          const title = text(microsequence?.title);
          const deps = Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn.map((item) => text(item)) : [];
          adjacency.set(title, deps);
          if (!Array.isArray(microsequence?.checks) || microsequence.checks.length === 0) {
            warnings.emptyChecks += 1;
          }
          if (text(microsequence?.goal).length < 18) {
            warnings.vagueGoals += 1;
          }
          if ((Array.isArray(microsequence?.covers) ? microsequence.covers.length : 0) > 3) {
            warnings.granularityWarnings += 1;
          }
          excluded.forEach((term) => {
            const source = JSON.stringify(microsequence).toLowerCase();
            if (term && source.includes(String(term).toLowerCase())) {
              warnings.scopeLeaks += 1;
            }
          });
          deps.forEach((dependency) => {
            if (!seenTitles.includes(dependency)) {
              warnings.dependencyErrors += 1;
              warnings.futureDependencyErrors += 1;
            }
          });
          seenTitles.push(title);
        });
        const visiting = new Set();
        const visited = new Set();
        function dfs(node) {
          if (!node || visited.has(node)) {
            return;
          }
          if (visiting.has(node)) {
            warnings.circularDependencyErrors += 1;
            return;
          }
          visiting.add(node);
          (adjacency.get(node) || []).forEach(dfs);
          visiting.delete(node);
          visited.add(node);
        }
        [...adjacency.keys()].forEach(dfs);
      });
    });
  } catch {
    warnings.dependencyErrors += 1;
  }
  return warnings;
}

function analyzePlannedCourse(plannedCourse = {}) {
  const warnings = {
    dependencyErrors: 0,
    futureDependencyErrors: 0,
    circularDependencyErrors: 0,
    scopeLeaks: 0,
    emptyChecks: 0,
    vagueGoals: 0,
    granularityWarnings: 0
  };
  const modules = plannedCourse?.course?.modules || [];
  modules.forEach((moduleValue) => {
    const excluded = Array.isArray(moduleValue?.guide?.exclude) ? moduleValue.guide.exclude : [];
    (moduleValue.lessons || []).forEach((lesson) => {
      const seenTitles = [];
      const adjacency = new Map();
      (lesson.microsequences || []).forEach((microsequence) => {
        const title = text(microsequence?.title);
        const deps = Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn.map((item) => text(item)) : [];
        adjacency.set(title, deps);
        if (!Array.isArray(microsequence?.checks) || microsequence.checks.length === 0) {
          warnings.emptyChecks += 1;
        }
        if (text(microsequence?.goal).length < 18) {
          warnings.vagueGoals += 1;
        }
        if ((Array.isArray(microsequence?.covers) ? microsequence.covers.length : 0) > 3) {
          warnings.granularityWarnings += 1;
        }
        excluded.forEach((term) => {
          const source = JSON.stringify(microsequence).toLowerCase();
          if (term && source.includes(String(term).toLowerCase())) {
            warnings.scopeLeaks += 1;
          }
        });
        deps.forEach((dependency) => {
          if (!seenTitles.includes(dependency)) {
            warnings.dependencyErrors += 1;
            warnings.futureDependencyErrors += 1;
          }
        });
        seenTitles.push(title);
      });
      const visiting = new Set();
      const visited = new Set();
      function dfs(node) {
        if (!node || visited.has(node)) {
          return;
        }
        if (visiting.has(node)) {
          warnings.circularDependencyErrors += 1;
          return;
        }
        visiting.add(node);
        (adjacency.get(node) || []).forEach(dfs);
        visiting.delete(node);
        visited.add(node);
      }
      [...adjacency.keys()].forEach(dfs);
    });
  });
  return warnings;
}

function buildMarkdown(report = {}) {
  return [
    "# Top-down Structured Benchmark",
    "",
    `- Data: ${report.createdAt || ""}`,
    `- Modelo: ${report.model || ""}`,
    `- topDownStructureParseSuccess: ${report.summary?.topDownStructureParseSuccess ?? 0}`,
    `- topDownAuditPatchRate: ${report.summary?.topDownAuditPatchRate ?? 0}`,
    `- dependencyErrorRateBeforeAudit: ${report.summary?.dependencyErrorRateBeforeAudit ?? 0}`,
    `- dependencyErrorRateAfterAudit: ${report.summary?.dependencyErrorRateAfterAudit ?? 0}`,
    `- scopeLeakRate: ${report.summary?.scopeLeakRate ?? 0}`,
    `- circularDependencyRate: ${report.summary?.circularDependencyRate ?? 0}`,
    `- futureDependencyRate: ${report.summary?.futureDependencyRate ?? 0}`,
    `- emptyChecksRate: ${report.summary?.emptyChecksRate ?? 0}`,
    `- vagueGoalRate: ${report.summary?.vagueGoalRate ?? 0}`,
    `- microsequenceGranularityWarnings: ${report.summary?.microsequenceGranularityWarnings ?? 0}`,
    "",
    "## Cenários",
    ...(report.scenarios || []).map((scenario) => `- ${scenario.id}: success=${scenario.success ? "sim" : "não"}; patches=${scenario.appliedPatches}; antes=${scenario.dependencyErrorsBeforeAudit}; depois=${scenario.dependencyErrorsAfterAudit}`)
  ].join("\n");
}

async function main() {
  const { provider, modelId } = ensureProvider();
  const scenarios = [
    {
      id: "matrizes",
      scopeContract: {
        schemaVersion: "aralearn.scope.v1",
        course: { title: "Matrizes básicas", goal: "Introduzir leitura de matrizes sem pressupor conhecimento prévio." },
        modules: [
          { title: "Leitura de matrizes", include: ["matriz", "linha", "coluna"], exclude: ["determinante"], notes: "Começar pelo concreto, com microssequências curtas e dependências locais.", assessmentStyle: "mixed" },
          { title: "Posição e transposta", include: ["posição a_ij", "matriz transposta"], exclude: ["matriz inversa"], notes: "Fechar com prática sem abrir operações avançadas.", assessmentStyle: "mixed" }
        ]
      }
    },
    {
      id: "grafos",
      scopeContract: {
        schemaVersion: "aralearn.scope.v1",
        course: { title: "Grafos básicos", goal: "Introduzir vértices, arestas e caminho simples." },
        modules: [
          { title: "Estrutura do grafo", include: ["vértice", "aresta"], exclude: ["árvore geradora mínima"], notes: "Sem atalhos.", assessmentStyle: "mixed" },
          { title: "Caminho e leitura", include: ["caminho simples", "adjacência"], exclude: ["Dijkstra"], notes: "Progredir com prática.", assessmentStyle: "mixed" }
        ]
      }
    },
    {
      id: "git-basico",
      scopeContract: {
        schemaVersion: "aralearn.scope.v1",
        course: { title: "Git básico", goal: "Explicar fluxo mínimo de versionamento local." },
        modules: [
          { title: "Repositório local", include: ["repositório", "commit"], exclude: ["rebase"], notes: "Sem pressupor terminal avançado.", assessmentStyle: "mixed" },
          { title: "Sincronização", include: ["branch", "push"], exclude: ["submódulos"], notes: "Fechar com prática curta.", assessmentStyle: "mixed" }
        ]
      }
    },
    {
      id: "shell-linux",
      scopeContract: {
        schemaVersion: "aralearn.scope.v1",
        course: { title: "Shell Linux básico", goal: "Ensinar navegação e comandos simples." },
        modules: [
          { title: "Navegação", include: ["pwd", "ls"], exclude: ["awk"], notes: "Começar pelo básico.", assessmentStyle: "mixed" },
          { title: "Arquivos", include: ["cat", "mkdir"], exclude: ["sed"], notes: "Prática objetiva.", assessmentStyle: "mixed" }
        ]
      }
    },
    {
      id: "logica-proposicional",
      scopeContract: {
        schemaVersion: "aralearn.scope.v1",
        course: { title: "Lógica proposicional", goal: "Introduzir conectivos e tabela-verdade." },
        modules: [
          { title: "Conectivos", include: ["negação", "conjunção"], exclude: ["quantificadores"], notes: "Do símbolo ao caso.", assessmentStyle: "mixed" },
          { title: "Tabelas", include: ["disjunção", "tabela-verdade"], exclude: ["predicados"], notes: "Consolidar por prática.", assessmentStyle: "mixed" }
        ]
      }
    }
  ];

  const report = {
    createdAt: new Date().toISOString(),
    model: modelId,
    scenarios: [],
    rejectedTopDownPatches: [],
    benchmarkStatus: "pass",
    criticalFailures: []
  };
  const promptTokens = [];
  const completionTokens = [];
  const latencies = [];
  let topDownStructureParseSuccess = 0;
  let topDownAuditPatchRate = 0;
  let dependencyErrorRateBeforeAudit = 0;
  let dependencyErrorRateAfterAudit = 0;
  let scopeLeakRate = 0;
  let circularDependencyRate = 0;
  let futureDependencyRate = 0;
  let emptyChecksRate = 0;
  let vagueGoalRate = 0;
  let microsequenceGranularityWarnings = 0;

  for (const scenario of scenarios) {
    let success = false;
    let lastError = "";
    let scenarioCriticalFailure = "";
    for (let attempt = 0; attempt < 5 && !success; attempt += 1) {
      try {
        const result = await planCourseFromScope({
          scopeContract: scenario.scopeContract,
          provider,
          modelId,
          project: createEmptyProjectDocument()
        });
        const phases = result.usageReport?.phases || [];
        const structurePhase = getLastPhase(phases, "top_down_structure");
        const auditPhase = getLastPhase(phases, "top_down_structure_audit");
        const before = {
          ...analyzeTopDownRaw(structurePhase.rawText || ""),
          dependencyErrors: Number(result.dependencyErrorsBeforeAudit || 0)
        };
        const after = analyzePlannedCourse(result.plannedCourse || {});
        after.dependencyErrors = Number(result.dependencyErrorsAfterAudit || 0);
        const contradictions = (auditPhase.parsedSlots?.invalidGlobalLines || []).length + (auditPhase.parsedSlots?.invalidPatches || []).length;
        if (contradictions > 0) {
          throw new Error("A auditoria top-down terminou com contradições não resolvidas.");
        }
        if (after.dependencyErrors > before.dependencyErrors) {
          scenarioCriticalFailure = `Cenário ${scenario.id}: dependências pioraram de ${before.dependencyErrors} para ${after.dependencyErrors}.`;
          throw new Error("A auditoria top-down piorou as dependências.");
        }
        topDownStructureParseSuccess += structurePhase.rawText ? 1 : 0;
        topDownAuditPatchRate += Array.isArray(result.appliedTopDownPatches) && result.appliedTopDownPatches.length ? 1 : 0;
        dependencyErrorRateBeforeAudit += before.dependencyErrors;
        dependencyErrorRateAfterAudit += after.dependencyErrors;
        scopeLeakRate += after.scopeLeaks;
        circularDependencyRate += after.circularDependencyErrors;
        futureDependencyRate += after.futureDependencyErrors;
        emptyChecksRate += after.emptyChecks;
        vagueGoalRate += after.vagueGoals;
        microsequenceGranularityWarnings += after.granularityWarnings;
        phases.forEach((phase) => {
          promptTokens.push(Number(phase.total_tokens || 0) - Number(phase.completion_tokens || 0));
          completionTokens.push(Number(phase.completion_tokens || 0));
          latencies.push(Number(phase.latencyMs || 0));
        });
        report.scenarios.push({
          id: scenario.id,
          success: true,
          attemptsUsed: attempt + 1,
          appliedPatches: Array.isArray(result.appliedTopDownPatches) ? result.appliedTopDownPatches.length : 0,
          dependencyErrorsBeforeAudit: before.dependencyErrors,
          dependencyErrorsAfterAudit: after.dependencyErrors,
          topDownAuditContradictions: contradictions
        });
        (result.rejectedTopDownPatches || []).forEach((item) => {
          report.rejectedTopDownPatches.push({
            scenario: scenario.id,
            ...item
          });
        });
        success = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!success) {
      if (scenarioCriticalFailure) {
        report.criticalFailures.push(scenarioCriticalFailure);
      }
      report.scenarios.push({
        id: scenario.id,
        success: false,
        attemptsUsed: 5,
        appliedPatches: 0,
        dependencyErrorsBeforeAudit: 0,
        dependencyErrorsAfterAudit: 0,
        topDownAuditContradictions: 0,
        error: lastError
      });
    }
  }

  report.summary = {
    topDownStructureParseSuccess: ratio(topDownStructureParseSuccess, scenarios.length),
    topDownAuditPatchRate: ratio(topDownAuditPatchRate, scenarios.length),
    dependencyErrorRateBeforeAudit: ratio(dependencyErrorRateBeforeAudit, scenarios.length),
    dependencyErrorRateAfterAudit: ratio(dependencyErrorRateAfterAudit, scenarios.length),
    scopeLeakRate: ratio(scopeLeakRate, scenarios.length),
    circularDependencyRate: ratio(circularDependencyRate, scenarios.length),
    futureDependencyRate: ratio(futureDependencyRate, scenarios.length),
    emptyChecksRate: ratio(emptyChecksRate, scenarios.length),
    vagueGoalRate: ratio(vagueGoalRate, scenarios.length),
    microsequenceGranularityWarnings: ratio(microsequenceGranularityWarnings, scenarios.length),
    averagePromptTokens: average(promptTokens),
    averageCompletionTokens: average(completionTokens),
    latencyMs: average(latencies)
  };

  const reportPathJson = path.join(process.cwd(), "tests", "reports", "topdown-structured-benchmark.json");
  const reportPathMd = path.join(process.cwd(), "tests", "reports", "topdown-structured-benchmark.md");
  fs.mkdirSync(path.dirname(reportPathJson), { recursive: true });
  if (report.criticalFailures.length) {
    report.benchmarkStatus = "fail";
  } else if (report.scenarios.some((scenario) => scenario.success !== true)) {
    report.benchmarkStatus = "needs_work";
  }
  fs.writeFileSync(reportPathJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPathMd, buildMarkdown(report));
  if (report.criticalFailures.length) {
    throw new Error("Nem todos os cenários top-down concluíram com sucesso no benchmark.");
  }
  console.log(JSON.stringify({ reportPathJson, reportPathMd }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
