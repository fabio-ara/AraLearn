import fs from "node:fs";
import path from "node:path";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import { getTemplateDefinition } from "../src/generation/engine/templateCatalog.js";
import { buildSlotSpecForTemplate } from "../src/generation/engine/bottomUpBuildRuntime.js";
import { parseCardSlotText, parseAuditText } from "../src/generation/engine/slotParser.js";
import { collectPendingSlots, buildRetryPrompt, mergeAcceptedSlots } from "../src/generation/engine/slotRetry.js";
import { compileCardFromTemplate } from "../src/generation/engine/cardCompilers/index.js";
import { validateAuditPatchAgainstSlotPacket } from "../src/generation/engine/bottomUpAuditRuntime.js";
import { validateCompiledCardSemantics, findStructuralLeak } from "../src/generation/engine/templateSemanticValidation.js";
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

function registerScenarioFailure(report, result = {}) {
  const kind = text(result.failureKind) || "unknown";
  report.failureKinds = report.failureKinds || {};
  report.failureKinds[kind] = Number(report.failureKinds[kind] || 0) + 1;
  if (text(result.error)) {
    report.sampleErrors = report.sampleErrors || [];
    if (!report.sampleErrors.includes(text(result.error)) && report.sampleErrors.length < 5) {
      report.sampleErrors.push(text(result.error));
    }
  }
}

function ensureProvider() {
  const apiKey = text(process.env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY ausente. Defina a variável de ambiente para rodar o benchmark estruturado.");
  }
  return {
    provider: createOpenAiCompatibleProvider({
      baseUrl: "https://api.deepseek.com",
      apiKey
    }),
    modelId: "deepseek-v4-flash"
  };
}

function buildBuildPrompt({ templateId, theme, instructions = [] }) {
  const template = getTemplateDefinition(templateId);
  const slotLines = (template?.slots || []).map((slot) => `${slot.index}: ${text(slot.label)}`);
  return [
    `Fase: bottom_up_card_build`,
    `Tema: ${theme}`,
    `Template: ${templateId}`,
    "Responda apenas com slots textuais.",
    "Escreva cada valor na mesma linha do slot, logo depois de N:.",
    "Não repita o nome do slot como conteúdo.",
    ...instructions,
    "Formato:",
    "CARD 1",
    ...slotLines
  ].join("\n");
}

async function callTextPhase(provider, modelId, phase, prompt, maxTokens = 1800) {
  const startedAt = Date.now();
  const result = await provider.generateText({
    modelId,
    phase,
    system: "Responda somente no formato textual solicitado.",
    prompt,
    temperature: 0,
    maxTokens
  });
  return {
    result,
    latencyMs: Date.now() - startedAt
  };
}

function collectCardLeaks(card = {}) {
  return [card.title, card.prompt, card.text, card.question, card.after]
    .concat(Array.isArray(card.options) ? card.options.map((option) => option?.text) : [])
    .map((value) => ({ value: text(value), leak: findStructuralLeak(value) }))
    .filter((entry) => entry.value && entry.leak)
    .map((entry) => entry.leak.reason);
}

async function runBuildAttempt(provider, modelId, scenario) {
  const template = getTemplateDefinition(scenario.templateId);
  const slotSchema = buildSlotSpecForTemplate(template);
  let prompt = buildBuildPrompt(scenario);
  let accepted = {};
  const phaseMetrics = [];
  let parsedCard = null;
  for (let retryIndex = 0; retryIndex <= 1; retryIndex += 1) {
    const { result, latencyMs } = await callTextPhase(provider, modelId, "bottom_up_card_build", prompt, scenario.maxTokens || 1800);
    const normalizedText = /^CARD\s+\d+/i.test(text(result.text)) ? result.text : `CARD 1\n${text(result.text)}`;
    const parsed = parseCardSlotText(normalizedText, {
      cards: [{ position: 1, slots: slotSchema }]
    });
    parsedCard = parsed.cards[0] || { position: 1, accepted: {}, missing: [], invalid: [], duplicate: [], extra: [] };
    accepted = mergeAcceptedSlots(accepted, parsedCard);
    const merged = {
      position: 1,
      accepted,
      missing: slotSchema
        .filter((slot) => slot.required !== false && !(String(slot.index) in accepted))
        .map((slot) => ({ index: Number(slot.index), reason: "slot ausente" })),
      invalid: parsedCard.invalid,
      duplicate: parsedCard.duplicate,
      extra: parsedCard.extra
    };
    phaseMetrics.push({
      phase: "bottom_up_card_build",
      latencyMs,
      totalTokens: Number(result?.usage?.total_tokens ?? result?.usage?.totalTokens) || 0,
      completionTokens: Number(result?.usage?.completion_tokens ?? result?.usage?.completionTokens) || 0,
      promptCacheHitTokens: Number(result?.usage?.prompt_cache_hit_tokens) || 0,
      promptCacheMissTokens: Number(result?.usage?.prompt_cache_miss_tokens) || 0,
      rawText: text(result.text),
      parsedSlots: merged,
      retryIndex
    });
    const pending = collectPendingSlots({ cardResult: merged });
    if (!pending.length && !merged.extra.length && !merged.duplicate.length && !merged.invalid.length) {
      try {
        const slots = Object.fromEntries(Object.entries(accepted).map(([slotIndex, entry]) => [slotIndex, text(entry?.value ?? entry?.raw)]));
        const card = compileCardFromTemplate({
          templateId: scenario.templateId,
          position: 1,
          slots
        });
        const semantic = validateCompiledCardSemantics(card, {
          templateId: scenario.templateId,
          slotPacket: { position: 1, slots }
        });
        return {
          success: true,
          card,
          semantic,
          slotPacket: { position: 1, slots },
          phaseMetrics,
          parse: merged,
          structuralLeaks: collectCardLeaks(card)
        };
      } catch (error) {
        return {
          success: false,
          failClosed: true,
          failureKind: "semantic_validation",
          error: error instanceof Error ? error.message : String(error),
          phaseMetrics,
          parse: merged,
          structuralLeaks: []
        };
      }
    }
    if (retryIndex >= 1) {
      break;
    }
    prompt = [
      buildBuildPrompt(scenario),
      "",
      buildRetryPrompt({
        phase: "bottom_up_card_build",
        cardIndex: 1,
        pendingSlots: collectPendingSlots({ cardResult: merged }),
        slotSchema,
        duplicate: merged.duplicate,
        extra: merged.extra
      })
    ].join("\n\n");
  }
  return {
    success: false,
    failClosed: true,
    failureKind: "parser",
    error: "slots inválidos após retry",
    phaseMetrics,
    parse: parsedCard,
    structuralLeaks: []
  };
}

async function runAuditAttempt(provider, modelId) {
  const template = getTemplateDefinition("matrix_locate_cell_choice");
  const slotPacket = {
    position: 1,
    slots: {
      1: "Posição a_ij",
      2: "Observe a matriz.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "4",
      10: "9",
      11: "1",
      12: "Correto."
    }
  };
  const cardBefore = compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 1,
    slots: slotPacket.slots
  });
  const promptBase = [
    "Fase: bottom_up_card_audit",
    "Corrija somente o feedback do slot 12.",
    "O feedback não pode ser genérico.",
    "No novo feedback, não cite prompt, slot, campo, JSON, options ou answer.",
    "Não escreva JSON, values, answer ou options.",
    "Formato:",
    "AUDIT",
    "CARD 1",
    "action: 1209",
    "reason: feedback genérico",
    "12: novo feedback",
    "Card compilado:",
    JSON.stringify(cardBefore, null, 2)
  ].join("\n");
  const phaseMetrics = [];
  let retryPrompt = promptBase;
  for (let retryIndex = 0; retryIndex <= 1; retryIndex += 1) {
    const { result, latencyMs } = await callTextPhase(provider, modelId, "bottom_up_card_audit", retryPrompt, 1200);
    const parsed = parseAuditText(result.text);
    phaseMetrics.push({
      phase: "bottom_up_card_audit",
      latencyMs,
      totalTokens: Number(result?.usage?.total_tokens ?? result?.usage?.totalTokens) || 0,
      completionTokens: Number(result?.usage?.completion_tokens ?? result?.usage?.completionTokens) || 0,
      promptCacheHitTokens: Number(result?.usage?.prompt_cache_hit_tokens) || 0,
      promptCacheMissTokens: Number(result?.usage?.prompt_cache_miss_tokens) || 0,
      rawText: text(result.text),
      parsedSlots: parsed,
      retryIndex
    });
    const patchCard = parsed.cards?.[0] || null;
    const validation = patchCard ? validateAuditPatchAgainstSlotPacket({ patchCard, slotPacket, template }) : { ok: false, errors: ["patch ausente"], validatedPatches: {} };
    const auditPatchApplied = validation.ok && Object.keys(validation.validatedPatches).length > 0;
    if (auditPatchApplied) {
      Object.entries(validation.validatedPatches).forEach(([slotIndex, value]) => {
        slotPacket.slots[slotIndex] = value;
      });
      const cardAfter = compileCardFromTemplate({
        templateId: "matrix_locate_cell_choice",
        position: 1,
        slots: slotPacket.slots
      });
      return {
        success: true,
        failClosed: false,
        failureKind: "",
        auditPatchApplied: true,
        phaseMetrics,
        cardBefore,
        cardAfter,
        parsed,
        invalidAuditPatches: parsed.cards?.flatMap((card) => card.invalidPatches || []).length || 0
      };
    }
    if (retryIndex >= 1) {
      return {
        success: false,
        failClosed: true,
        failureKind: validation.errors.some((item) => /prompt|slot|campo|json|options|answer/i.test(item)) ? "avoidable_audit" : "invalid_audit",
        auditPatchApplied: false,
        phaseMetrics,
        cardBefore,
        cardAfter: cardBefore,
        parsed,
        invalidAuditPatches: parsed.cards?.flatMap((card) => card.invalidPatches || []).length || 0,
        error: validation.errors.join("; ")
      };
    }
    retryPrompt = [
      promptBase,
      "",
      "RETRY AUDIT",
      "Sua resposta anterior foi rejeitada.",
      ...validation.errors.map((item) => `- ${item}`),
      "Corrija apenas o slot 12 com um feedback didático final, sem citar nomes de campo."
    ].join("\n");
  }
  return {
    success: false,
    failClosed: true,
    failureKind: "invalid_audit",
    auditPatchApplied: false,
    phaseMetrics,
    cardBefore,
    cardAfter: cardBefore,
    parsed: { cards: [], invalidGlobalLines: [] },
    invalidAuditPatches: 0,
    error: "auditoria sem patch aplicável"
  };
}

function assessTopDownDependencies(rawText = "") {
  let dependencyErrors = 0;
  try {
    const parsed = JSON.parse(rawText);
    const lessons = (parsed?.course?.modules || parsed?.modules || []).flatMap((moduleValue) => moduleValue.lessons || []);
    lessons.forEach((lesson) => {
      const seenTitles = [];
      (lesson.microsequences || []).forEach((microsequence) => {
        const deps = Array.isArray(microsequence?.dependsOn) ? microsequence.dependsOn : [];
        deps.forEach((dependency) => {
          if (!seenTitles.includes(text(dependency))) {
            dependencyErrors += 1;
          }
        });
        seenTitles.push(text(microsequence?.title));
      });
    });
  } catch {
    dependencyErrors += 1;
  }
  return dependencyErrors;
}

async function runTopDownAttempt(provider, modelId) {
  const scopeContract = {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Fundamentos de estrutura",
      goal: "Planejar um curso curto com dois módulos e prática progressiva."
    },
    modules: [
      {
        title: "Módulo 1",
        include: ["conceito inicial", "primeiro exemplo"],
        exclude: ["assunto externo"],
        notes: "Do simples ao composto.",
        assessmentStyle: "mixed"
      },
      {
        title: "Módulo 2",
        include: ["segunda operação", "consolidação"],
        exclude: ["assunto externo"],
        notes: "Fechar progressão.",
        assessmentStyle: "mixed"
      }
    ]
  };
  const result = await planCourseFromScope({
    scopeContract,
    provider,
    modelId,
    project: createEmptyProjectDocument()
  });
  const phases = result.usageReport?.phases || [];
  const raw = phases.find((item) => item.phase === "top_down_structure")?.rawText || "";
  const parsedAudit = phases.find((item) => item.phase === "top_down_structure_audit")?.parsedSlots || { invalidGlobalLines: [], invalidPatches: [] };
  return {
    success: true,
    phases,
    dependencyErrorsBeforeAudit: Number(result.dependencyErrorsBeforeAudit || assessTopDownDependencies(raw)),
    dependencyErrorsAfterAudit: Number(result.dependencyErrorsAfterAudit || 0),
    parsedAudit,
    appliedPatches: result.appliedTopDownPatches || []
  };
}

function buildMarkdown(report = {}) {
  return [
    "# Structured Engine Benchmark",
    "",
    `- Data: ${report.createdAt || ""}`,
    `- Modelo: ${report.model || ""}`,
    `- Tentativas por cenário: ${report.attemptsPerScenario || 0}`,
    `- formatSuccessRate: ${report.summary?.formatSuccessRate ?? 0}`,
    `- parseErrorRate: ${report.summary?.parseErrorRate ?? 0}`,
    `- retryCount: ${report.summary?.retryCount ?? 0}`,
    `- failClosedCount: ${report.summary?.failClosedCount ?? 0}`,
    `- semanticValidationRate: ${report.summary?.semanticValidationRate ?? 0}`,
    `- structuralLeakRate: ${report.summary?.structuralLeakRate ?? 0}`,
    `- auditPatchRate: ${report.summary?.auditPatchRate ?? 0}`,
    `- topDownDependencyErrorRate: ${report.summary?.topDownDependencyErrorRate ?? 0}`,
    "",
    "## Cenários",
    ...(report.scenarios || []).map((scenario) => `- ${scenario.id}: success=${scenario.successCount}/${scenario.attempts}; retries=${scenario.retryCount}; failClosed=${scenario.failClosedCount}; resources=${scenario.resourcesUsed.join(", ") || "nenhum"}`),
    "",
    "## Recursos escolhidos",
    ...(report.resourceUsage || []).map(([resource, count]) => `- ${resource}: ${count}`)
  ].join("\n");
}

async function main() {
  const { provider, modelId } = ensureProvider();
  const attemptsPerScenario = 5;
  const buildScenarios = [
    {
      id: "matrix-aij",
      templateId: "matrix_locate_cell_choice",
      theme: "Ensinar posição a_ij por linha e coluna.",
      instructions: [
        "Use uma matriz 2x3.",
        "Preencha targetRow e targetCol.",
        "Uma opção deve ser exatamente o valor da célula alvo."
      ]
    },
    {
      id: "graph-path",
      templateId: "graph_simple",
      theme: "Ensinar caminho simples em grafo pequeno.",
      instructions: [
        "Crie exatamente uma alternativa correta.",
        "Os distratores devem quebrar uma aresta, repetir vértice ou terminar no destino errado."
      ]
    },
    {
      id: "relation-map",
      templateId: "relation_map_simple",
      theme: "Praticar pares entre dois conjuntos pequenos.",
      instructions: [
        "Mostre dois conjuntos pequenos e uma relação simples.",
        "Use leftSet e rightSet separados por |.",
        "Use relations no formato item-esquerdo-item-direito, separados por |.",
        "Crie uma pergunta fechada em que exatamente uma alternativa correta responda à relação pedida."
      ]
    },
    {
      id: "tree-path",
      templateId: "tree_path",
      theme: "Reconhecer caminho hierárquico simples.",
      instructions: [
        "Use três nós em hierarquia simples."
      ]
    },
    {
      id: "flow-linear",
      templateId: "flow_linear",
      theme: "Reconhecer a sequência linear de preparo de café filtrado.",
      instructions: [
        "Use passos curtos em ordem explícita, separados por | ou lista numerada.",
        "A pergunta deve cobrar o passo imediatamente posterior ou a ordem correta.",
        "Prefira perguntar qual passo vem imediatamente depois de um passo específico.",
        "Use um processo cotidiano curto e verificável, como preparar café filtrado.",
        "Crie exatamente uma alternativa correta."
      ]
    },
    {
      id: "code-output",
      templateId: "code_choice",
      theme: "Rastrear a saída de um código simples.",
      instructions: [
        "Use um trecho curto e três alternativas plausíveis."
      ]
    },
    {
      id: "table-choice",
      templateId: "table_choice",
      theme: "Ler uma tabela simples e responder uma pergunta fechada.",
      instructions: [
        "Use duas linhas de dados e três alternativas."
      ]
    },
    {
      id: "paragraph-gap",
      templateId: "paragraph_gap",
      theme: "Completar um conceito local com lacuna fechada.",
      instructions: [
        "A resposta deve ser curta e os distratores plausíveis."
      ]
    }
  ];

  const scenarioReports = [];
  const resourceUsage = new Map();
  const templateFailures = new Map();
  let totalAttempts = 0;
  let totalParseErrors = 0;
  let totalMissing = 0;
  let totalInvalid = 0;
  let totalDuplicate = 0;
  let totalExtra = 0;
  let totalRetries = 0;
  let totalFailClosed = 0;
  let totalSemanticSuccess = 0;
  let totalStructuralLeaks = 0;
  let totalAuditPatch = 0;
  let correctFailClosedCount = 0;
  let avoidableFailureCount = 0;
  const promptTokens = [];
  const completionTokens = [];
  const promptCacheHitTokens = [];
  const promptCacheMissTokens = [];
  const latencies = [];
  const criticalFailures = [];

  for (const scenario of buildScenarios) {
    const report = {
      id: scenario.id,
      type: "build",
      attempts: attemptsPerScenario,
      successCount: 0,
      retryCount: 0,
      failClosedCount: 0,
      resourcesUsed: [],
      templatesFailed: [],
      failureKinds: {},
      sampleErrors: []
    };
    for (let attempt = 0; attempt < attemptsPerScenario; attempt += 1) {
      totalAttempts += 1;
      const result = await runBuildAttempt(provider, modelId, scenario);
      result.phaseMetrics.forEach((phase) => {
        promptTokens.push(phase.totalTokens - phase.completionTokens);
        completionTokens.push(phase.completionTokens);
        promptCacheHitTokens.push(phase.promptCacheHitTokens);
        promptCacheMissTokens.push(phase.promptCacheMissTokens);
        latencies.push(phase.latencyMs);
        totalRetries += Number(phase.retryIndex || 0);
      });
      const parse = result.parse || {};
      totalMissing += (parse.missing || []).length;
      totalInvalid += (parse.invalid || []).length;
      totalDuplicate += (parse.duplicate || []).length;
      totalExtra += (parse.extra || []).length;
      if ((parse.missing || []).length || (parse.invalid || []).length || (parse.duplicate || []).length || (parse.extra || []).length) {
        totalParseErrors += 1;
      }
      if (!result.success) {
        totalFailClosed += 1;
        if (result.failureKind === "semantic_validation") {
          correctFailClosedCount += 1;
        } else {
          avoidableFailureCount += 1;
        }
        report.failClosedCount += 1;
        report.templatesFailed.push(scenario.templateId);
        registerScenarioFailure(report, result);
        templateFailures.set(scenario.templateId, (templateFailures.get(scenario.templateId) || 0) + 1);
        continue;
      }
      totalSemanticSuccess += 1;
      totalStructuralLeaks += result.structuralLeaks.length ? 1 : 0;
      report.successCount += 1;
      report.retryCount += result.phaseMetrics.filter((phase) => phase.retryIndex > 0).length;
      report.resourcesUsed.push(text(result.card?.resource));
      resourceUsage.set(text(result.card?.resource), (resourceUsage.get(text(result.card?.resource)) || 0) + 1);
    }
    scenarioReports.push(report);
  }

  const auditReport = {
    id: "audit-feedback-correction",
    type: "audit",
    attempts: attemptsPerScenario,
    successCount: 0,
    retryCount: 0,
    failClosedCount: 0,
    resourcesUsed: ["matrix"],
    templatesFailed: [],
    failureKinds: {},
    sampleErrors: []
  };
  for (let attempt = 0; attempt < attemptsPerScenario; attempt += 1) {
    totalAttempts += 1;
    const result = await runAuditAttempt(provider, modelId);
    result.phaseMetrics.forEach((phase) => {
      promptTokens.push(phase.totalTokens - phase.completionTokens);
      completionTokens.push(phase.completionTokens);
      promptCacheHitTokens.push(phase.promptCacheHitTokens);
      promptCacheMissTokens.push(phase.promptCacheMissTokens);
      latencies.push(phase.latencyMs);
    });
    if (!result.success) {
      totalFailClosed += 1;
      avoidableFailureCount += 1;
      auditReport.failClosedCount += 1;
      registerScenarioFailure(auditReport, result);
      if (attempt === attemptsPerScenario - 1) {
        criticalFailures.push(`audit-feedback-correction: ${result.error || result.failureKind || "sem patch aplicável"}`);
      }
      continue;
    }
    totalAuditPatch += 1;
    auditReport.successCount += 1;
  }
  scenarioReports.push(auditReport);

  const topDownReport = {
    id: "top-down-course",
    type: "top_down",
    attempts: attemptsPerScenario,
    successCount: 0,
    retryCount: 0,
    failClosedCount: 0,
    resourcesUsed: [],
    templatesFailed: [],
    failureKinds: {},
    sampleErrors: [],
    dependencyErrorsBeforeAudit: 0,
    dependencyErrorsAfterAudit: 0
  };
  for (let attempt = 0; attempt < attemptsPerScenario; attempt += 1) {
    totalAttempts += 1;
    try {
      const result = await runTopDownAttempt(provider, modelId);
      result.phases.forEach((phase) => {
        promptTokens.push(Number(phase.total_tokens || 0) - Number(phase.completion_tokens || 0));
        completionTokens.push(Number(phase.completion_tokens || 0));
        promptCacheHitTokens.push(Number(phase.prompt_cache_hit_tokens || 0));
        promptCacheMissTokens.push(Number(phase.prompt_cache_miss_tokens || 0));
        latencies.push(Number(phase.latencyMs || 0));
      });
      topDownReport.successCount += 1;
      topDownReport.retryCount += (result.phases || []).filter((phase) => Number(phase.slotRetries || 0) > 0).length;
      topDownReport.dependencyErrorsBeforeAudit += result.dependencyErrorsBeforeAudit;
      topDownReport.dependencyErrorsAfterAudit += result.dependencyErrorsAfterAudit;
      if (result.dependencyErrorsAfterAudit > result.dependencyErrorsBeforeAudit) {
        criticalFailures.push(`top-down-course: dependências pioraram de ${result.dependencyErrorsBeforeAudit} para ${result.dependencyErrorsAfterAudit}`);
      }
      if ((result.parsedAudit?.invalidGlobalLines || []).length || (result.parsedAudit?.invalidPatches || []).length) {
        totalParseErrors += 1;
      }
    } catch (error) {
      totalFailClosed += 1;
      correctFailClosedCount += 1;
      topDownReport.failClosedCount += 1;
      registerScenarioFailure(topDownReport, {
        failureKind: "top_down_fail_closed",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  scenarioReports.push(topDownReport);

  const relationScenario = scenarioReports.find((item) => item.id === "relation-map");
  const flowScenario = scenarioReports.find((item) => item.id === "flow-linear");
  const auditScenario = scenarioReports.find((item) => item.id === "audit-feedback-correction");
  const templatePriorityList = scenarioReports
    .filter((item) => item.type === "build")
    .map((item) => ({
      id: item.id,
      templateId: buildScenarios.find((scenario) => scenario.id === item.id)?.templateId || "",
      successRate: ratio(item.successCount, item.attempts),
      failClosedCount: item.failClosedCount
    }))
    .sort((left, right) => left.successRate - right.successRate || right.failClosedCount - left.failClosedCount);
  let benchmarkStatus = "pass";
  if (
    auditScenario?.successCount === 0
    || criticalFailures.length
  ) {
    benchmarkStatus = "fail";
  } else if (
    (relationScenario && relationScenario.successCount === 0)
    || (flowScenario && flowScenario.successCount === 0)
    || topDownReport.successCount === 0
  ) {
    benchmarkStatus = "needs_work";
  }

  const report = {
    createdAt: new Date().toISOString(),
    model: modelId,
    attemptsPerScenario,
    scenarios: scenarioReports,
    resourceUsage: [...resourceUsage.entries()].sort((left, right) => right[1] - left[1]),
    templatesFailedMost: [...templateFailures.entries()].sort((left, right) => right[1] - left[1]),
    benchmarkStatus,
    criticalFailures,
    templatePriorityList,
    summary: {
      formatSuccessRate: ratio(totalSemanticSuccess + totalAuditPatch + topDownReport.successCount, totalAttempts),
      parseErrorRate: ratio(totalParseErrors, totalAttempts),
      missingSlotRate: ratio(totalMissing, totalAttempts),
      invalidSlotRate: ratio(totalInvalid, totalAttempts),
      duplicateSlotRate: ratio(totalDuplicate, totalAttempts),
      extraSlotRate: ratio(totalExtra, totalAttempts),
      retryCount: totalRetries,
      failClosedCount: totalFailClosed,
      avoidableFailureCount,
      correctFailClosedCount,
      semanticValidationRate: ratio(totalSemanticSuccess, buildScenarios.length * attemptsPerScenario),
      structuralLeakRate: ratio(totalStructuralLeaks, buildScenarios.length * attemptsPerScenario),
      auditPatchRate: ratio(totalAuditPatch, attemptsPerScenario),
      topDownDependencyErrorRate: ratio(topDownReport.dependencyErrorsBeforeAudit, attemptsPerScenario),
      averagePromptTokens: average(promptTokens),
      averageCompletionTokens: average(completionTokens),
      promptCacheHitTokens: promptCacheHitTokens.reduce((sum, value) => sum + value, 0),
      promptCacheMissTokens: promptCacheMissTokens.reduce((sum, value) => sum + value, 0),
      latencyMs: average(latencies),
      finalValidationRate: ratio(totalSemanticSuccess + totalAuditPatch + topDownReport.successCount, totalAttempts)
    }
  };

  const reportPathJson = path.join(process.cwd(), "tests", "reports", "structured-engine-benchmark.json");
  const reportPathMd = path.join(process.cwd(), "tests", "reports", "structured-engine-benchmark.md");
  fs.mkdirSync(path.dirname(reportPathJson), { recursive: true });
  fs.writeFileSync(reportPathJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportPathMd, buildMarkdown(report));
  if (benchmarkStatus === "fail") {
    throw new Error("Benchmark estruturado encontrou regressão crítica.");
  }
  console.log(JSON.stringify({ reportPathJson, reportPathMd }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
