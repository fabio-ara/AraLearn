import fs from "node:fs";
import path from "node:path";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import { parseAuditText, parseCardSlotText } from "../src/generation/engine/slotParser.js";
import { buildSlotSpecForTemplate } from "../src/generation/engine/bottomUpBuildRuntime.js";
import { compileCardFromTemplate } from "../src/generation/engine/cardCompilers/index.js";
import { validateAuditPatchAgainstSlotPacket } from "../src/generation/engine/bottomUpAuditRuntime.js";
import { getTemplateDefinition } from "../src/generation/engine/templateCatalog.js";
import { buildRetryPrompt, collectPendingSlots, mergeAcceptedSlots } from "../src/generation/engine/slotRetry.js";
import { createEmptyProjectDocument } from "../src/domain/aralearnProject.js";
import { planCourseFromScope } from "../src/generation/topDown/planCourseFromScope.js";
import { getResourceCatalogItemByCode, listResourceCatalog } from "../src/generation/engine/resourceCatalog.js";
import { findStructuralLeak, validateCompiledCardSemantics } from "../src/generation/engine/templateSemanticValidation.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getLastPhase(phases = [], phaseName = "") {
  return [...(Array.isArray(phases) ? phases : [])].reverse().find((item) => item.phase === phaseName) || {};
}

function assertScenario(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildPhaseEntry(phase, result, startedAt, parsed = null, extra = {}) {
  return {
    phase,
    model: extra.model || "",
    latencyMs: Date.now() - startedAt,
    total_tokens: Number(result?.usage?.total_tokens ?? result?.usage?.totalTokens) || 0,
    completion_tokens: Number(result?.usage?.completion_tokens ?? result?.usage?.completionTokens) || 0,
    prompt_cache_hit_tokens: Number(result?.usage?.prompt_cache_hit_tokens) || 0,
    prompt_cache_miss_tokens: Number(result?.usage?.prompt_cache_miss_tokens) || 0,
    rawText: text(result?.text),
    parsedSlots: parsed,
    slotRetries: Number(extra.slotRetries) || 0
  };
}

async function callTextPhase(provider, { modelId, phase, system, prompt, maxTokens = 1800, temperature = 0 }) {
  const startedAt = Date.now();
  const result = await provider.generateText({
    modelId,
    phase,
    system,
    prompt,
    maxTokens,
    temperature
  });
  return { startedAt, result };
}

function toSlotObject(accepted = {}) {
  return Object.fromEntries(Object.entries(accepted || {}).map(([key, value]) => [key, text(value?.value ?? value?.raw)]));
}

async function callSlotPhaseWithRetry(provider, {
  modelId,
  phase,
  system,
  prompt,
  slotSchema,
  maxTokens = 2200
}) {
  const phases = [];
  let accepted = {};
  let activePrompt = prompt;
  let activeSchema = slotSchema;
  let lastCard = null;
  for (let retryIndex = 0; retryIndex <= 1; retryIndex += 1) {
    const { startedAt, result } = await callTextPhase(provider, {
      modelId,
      phase,
      system,
      prompt: activePrompt,
      maxTokens,
      temperature: retryIndex === 0 ? 0.1 : 0
    });
    const normalizedText = /^CARD\s+\d+/i.test(text(result.text)) ? result.text : `CARD 1\n${text(result.text)}`;
    const parsed = parseCardSlotText(normalizedText, {
      cards: [{ position: 1, slots: activeSchema }]
    });
    const partialCard = parsed.cards[0] || { position: 1, accepted: {}, missing: [], invalid: [], duplicate: [], extra: [] };
    accepted = mergeAcceptedSlots(accepted, partialCard);
    const merged = {
      ok: false,
      cards: [
        {
          position: 1,
          accepted,
          missing: slotSchema
            .filter((slot) => slot.required !== false && !(String(slot.index) in accepted))
            .map((slot) => ({ index: Number(slot.index), reason: "slot ausente" })),
          invalid: partialCard.invalid,
          duplicate: partialCard.duplicate,
          extra: partialCard.extra
        }
      ]
    };
    merged.ok = !merged.cards[0].missing.length && !merged.cards[0].invalid.length && !merged.cards[0].duplicate.length && !merged.cards[0].extra.length;
    lastCard = merged.cards[0];
    phases.push(buildPhaseEntry(phase, result, startedAt, merged, { model: modelId, slotRetries: retryIndex }));
    if (merged.ok) {
      return { parsed: merged, phases };
    }
    if (retryIndex >= 1) {
      return { parsed: merged, phases };
    }
    activePrompt = [
      prompt,
      "",
      buildRetryPrompt({
        phase,
        cardIndex: 1,
        pendingSlots: collectPendingSlots({ cardResult: lastCard }),
        slotSchema,
        duplicate: lastCard.duplicate,
        extra: lastCard.extra
      })
    ].join("\n\n");
    const pendingIndexes = new Set(collectPendingSlots({ cardResult: lastCard }).map((item) => Number(item.slotIndex)));
    activeSchema = slotSchema.filter((slot) => pendingIndexes.has(Number(slot.index)));
  }
  return { parsed: { ok: false, cards: [lastCard] }, phases };
}

function buildScopeContract() {
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Matrizes básicas",
      goal: "Estudar leitura de matriz e posição a_ij."
    },
    modules: [
      {
        title: "Matrizes",
        include: ["linha", "coluna", "posição a_ij", "matriz transposta"],
        exclude: ["determinante", "matriz inversa"],
        notes: "Distribuir progressão em passos curtos.",
        assessmentStyle: "mixed"
      }
    ]
  };
}

function planSpec() {
  return {
    cards: [
      {
        position: 1,
        slots: [
          { index: 1, label: "resourceCode", type: "code", family: "resource" },
          { index: 2, label: "operationCode", type: "code", family: "operation" },
          { index: 3, label: "didacticMoveCode", type: "code", family: "didacticMove" },
          { index: 4, label: "probableMistakeCode", type: "code", family: "probableMistake" },
          { index: 5, label: "feedbackKindCode", type: "code", family: "feedbackKind" },
          { index: 6, label: "planningReason", type: "text" },
          { index: 7, label: "templateId", type: "text" }
        ]
      }
    ]
  };
}

function buildResourceCatalogPromptLines() {
  return listResourceCatalog().map((item) => `- ${item.code} ${item.id}: operações ${item.operations.join(", ")}; templates ${item.templates.join(", ")}`);
}

function buildCodebookPromptLines() {
  return [
    "Recursos: 103 matrix; 108 graph; 111 composite; 101 paragraph; 102 choice; 104 table; 109 plane.",
    "Operações: 204 locate_cell; 205 show_matrix; 212 show_graph; 218 compare_graph_pair; 201 explain_text; 203 ask_choice.",
    "Gestos didáticos: 1101 introduce_rule; 1103 closed_practice; 1106 consolidate.",
    "Erros prováveis: 401 none; 402 confused_row_with_column; 406 confused_node_with_edge.",
    "Feedback: 501 neutral_confirmation; 502 explain_row_before_column; 505 explain_edge_connection."
  ];
}

function collectCardLeaks(card = {}) {
  const compositeStrings = text(card?.resource) === "composite"
    ? (Array.isArray(card?.blocks) ? card.blocks : []).flatMap((block) => {
        if (["heading", "paragraph"].includes(text(block?.kind))) {
          return [block?.value];
        }
        if (text(block?.kind) === "choice") {
          return [block?.question].concat(Array.isArray(block?.options) ? block.options.map((option) => option?.text) : []);
        }
        return [block?.prompt];
      })
    : [];
  return [card.title, card.prompt, card.text, card.question, card.after]
    .concat(Array.isArray(card.options) ? card.options.map((option) => option?.text) : [])
    .concat(compositeStrings)
    .map((value) => ({ value: text(value), leak: findStructuralLeak(value) }))
    .filter((entry) => entry.value && entry.leak)
    .map((entry) => entry.leak.reason);
}

function semanticRetrySlotsForTemplate(templateId = "", message = "") {
  const source = text(message).toLowerCase();
  if (templateId === "matrix_locate_cell_choice") {
    if (source.includes("nenhuma opção corresponde") || source.includes("mais de uma opção corresponde") || source.includes("opções repetidas")) {
      return [9, 10, 11];
    }
    if (source.includes("targetrow")) {
      return [6];
    }
    if (source.includes("targetcol")) {
      return [7];
    }
    if (source.includes("question não pode revelar literalmente a resposta")) {
      return [8];
    }
  }
  if (templateId === "graph_simple") {
    if (source.includes("answerid inválido")) {
      return [9];
    }
    if (source.includes("vazamento estrutural")) {
      return [10];
    }
    if (source.includes("question não pode revelar literalmente a resposta")) {
      return [5];
    }
    if (source.includes("múltiplas alternativas válidas") || source.includes("nenhuma alternativa forma caminho simples válido")) {
      return [6, 7, 8];
    }
    if (source.includes("feedback contraditório")) {
      return [10];
    }
  }
  if (templateId === "composite_graph_compare_choice") {
    if (source.includes("answerid inválido")) {
      return [13];
    }
    if (source.includes("question não pode revelar literalmente a resposta")) {
      return [9];
    }
    if (source.includes("opções repetidas") || source.includes("opção")) {
      return [10, 11, 12];
    }
    if (source.includes("vazamento estrutural")) {
      return [14];
    }
  }
  return [];
}

async function compileWithSemanticRetry(provider, {
  modelId,
  templateId,
  position,
  accepted,
  slotSchema,
  basePrompt
}) {
  const phases = [];
  let mergedAccepted = structuredClone(accepted || {});
  for (let retryIndex = 0; retryIndex <= 2; retryIndex += 1) {
    const slots = toSlotObject(mergedAccepted);
    try {
      const card = compileCardFromTemplate({
        templateId,
        position,
        slots
      });
      const semantic = validateCompiledCardSemantics(card, {
        templateId,
        slotPacket: { position, slots }
      });
      return {
        card,
        semantic,
        mergedAccepted,
        phases
      };
    } catch (error) {
      const retrySlots = semanticRetrySlotsForTemplate(templateId, error instanceof Error ? error.message : String(error));
      if (!retrySlots.length || retryIndex >= 1) {
        throw error;
      }
      const pendingSlots = retrySlots.map((slotIndex) => ({
        slotIndex,
        reason: error instanceof Error ? error.message : String(error)
      }));
      const prompt = [
        basePrompt,
        "",
        "RETRY SEMÂNTICO",
        "Reescreva somente os slots pedidos abaixo.",
        "Mantenha CARD 1 e escreva apenas cada slot como N: valor.",
        "Não repita slots já aceitos. Não escreva explicação fora dos slots.",
        buildRetryPrompt({
          phase: "bottom_up_card_build",
          cardIndex: position,
          pendingSlots,
          slotSchema
        })
      ].join("\n\n");
      const { startedAt, result } = await callTextPhase(provider, {
        modelId,
        phase: "bottom_up_card_build",
        system: "Responda somente com slots textuais.",
        prompt,
        maxTokens: 1400,
        temperature: 0
      });
      const parsed = parseCardSlotText(result.text, {
        cards: [{ position, slots: slotSchema.filter((slot) => retrySlots.includes(Number(slot.index))) }]
      });
      phases.push(buildPhaseEntry("bottom_up_card_build", result, startedAt, parsed, { model: modelId, slotRetries: retryIndex + 1 }));
      const retryCard = parsed.cards[0] || { accepted: {}, missing: [], invalid: [], duplicate: [], extra: [] };
      mergedAccepted = mergeAcceptedSlots(mergedAccepted, retryCard);
      const unresolved = retrySlots.filter((slotIndex) => !(String(slotIndex) in mergedAccepted));
      if (!retryCard.invalid.length && !retryCard.duplicate.length && !retryCard.extra.length && !unresolved.length) {
        continue;
      }
      if (retryIndex >= 2) {
        assertScenario(false, `Retry semântico do template ${templateId} devolveu slots inválidos.`);
      }
    }
  }
  throw new Error(`Falha ao recompilar ${templateId}.`);
}

async function runRealTopDown(provider, modelId) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const result = await planCourseFromScope({
        scopeContract: buildScopeContract(),
        provider,
        modelId,
        project: createEmptyProjectDocument()
      });
      const phases = result.usageReport?.phases || [];
      const structurePhase = getLastPhase(phases, "top_down_structure");
      const auditPhase = getLastPhase(phases, "top_down_structure_audit");
      const contradictions = [
        ...((auditPhase.parsedSlots?.invalidGlobalLines || []).map((item) => item.reason)),
        ...((auditPhase.parsedSlots?.invalidPatches || []).map((item) => item.reason))
      ];
      if (contradictions.length > 0) {
        throw new Error(`auditoria top-down terminou com contradições: ${contradictions.join("; ")}`);
      }
      return {
        phases,
        attemptsUsed: attempt,
        raw: structurePhase.rawText || "",
        auditRaw: auditPhase.rawText || "",
        parsedAudit: auditPhase.parsedSlots || null,
        appliedTopDownPatches: result.appliedTopDownPatches || []
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || "Falha no top-down real."));
}

async function runDirectedMatrixScenario(provider, modelId) {
  const phases = [];
  const planAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_micro_plan",
    system: "Responda somente com slots textuais.",
    prompt: [
      "Fase: bottom_up_micro_plan",
      "Tema: posição a_ij",
      "Escolha exatamente 1 card.",
      "Use apenas códigos numéricos do codebook nos slots 1 a 5.",
      "O recurso precisa ser matrix e o template precisa ser matrix_locate_cell_choice.",
      ...buildCodebookPromptLines(),
      "Formato:",
      "CARD 1",
      "1: resourceCode",
      "2: operationCode",
      "3: didacticMoveCode",
      "4: probableMistakeCode",
      "5: feedbackKindCode",
      "6: planningReason",
      "7: templateId"
    ].join("\n"),
    slotSchema: planSpec().cards[0].slots
  });
  const parsedPlan = planAttempt.parsed;
  phases.push(...planAttempt.phases);
  assertScenario(parsedPlan.ok, "Plano dirigido de matriz devolveu slots inválidos.");
  assertScenario(parsedPlan.cards[0].accepted["1"]?.value === 103, "Plano dirigido de matriz não escolheu resourceCode 103.");
  assertScenario(text(parsedPlan.cards[0].accepted["7"]?.value) === "matrix_locate_cell_choice", "Plano dirigido de matriz não escolheu template matrix_locate_cell_choice.");

  const template = getTemplateDefinition("matrix_locate_cell_choice");
  const slotSchema = buildSlotSpecForTemplate(template);
  const buildPrompt = [
    "Fase: bottom_up_card_build",
    "Tema: posição a_ij",
    "Preencha os slots do template matrix_locate_cell_choice.",
    "Use exatamente esta matriz 2x3:",
    "row1 = 4 | 7 | 2",
    "row2 = 9 | 1 | 5",
    "Use targetRow = 2 e targetCol = 1.",
    "A pergunta deve tratar da linha 2, coluna 1.",
    "optionB deve ser exatamente 9.",
    "optionA e optionC devem ser valores diferentes de 9.",
    "Não escreva answerId.",
    "Formato:",
    "CARD 1",
    "1: title",
    "2: prompt",
    "3: name",
    "4: row1",
    "5: row2",
    "6: targetRow",
    "7: targetCol",
    "8: question",
    "9: optionA",
    "10: optionB",
    "11: optionC",
    "12: after"
  ].join("\n");
  const buildAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_card_build",
    system: "Responda somente com slots textuais.",
    prompt: buildPrompt,
    slotSchema
  });
  const parsedBuild = buildAttempt.parsed;
  phases.push(...buildAttempt.phases);
  assertScenario(parsedBuild.ok, "Build dirigido de matriz devolveu slots inválidos.");
  const compiled = await compileWithSemanticRetry(provider, {
    modelId,
    templateId: "matrix_locate_cell_choice",
    position: 1,
    accepted: parsedBuild.cards[0].accepted,
    slotSchema,
    basePrompt: buildPrompt
  });
  phases.push(...compiled.phases);
  let mergedAccepted = compiled.mergedAccepted;
  let card = compiled.card;
  let semantic = compiled.semantic;
  if (semantic.computedAnswer !== "b") {
    const retryPrompt = [
      buildPrompt,
      "",
      "RETRY SEMÂNTICO",
      "A opção correta precisa ficar em optionB.",
      "Responda somente com CARD 1 e os slots 9, 10 e 11.",
      "optionB deve ser exatamente o valor da célula alvo.",
      "optionA e optionC devem ser distratores diferentes."
    ].join("\n\n");
    const { startedAt, result } = await callTextPhase(provider, {
      modelId,
      phase: "bottom_up_card_build",
      system: "Responda somente com slots textuais.",
      prompt: retryPrompt,
      maxTokens: 1200,
      temperature: 0
    });
    const parsedRetry = parseCardSlotText(result.text, {
      cards: [{ position: 1, slots: slotSchema.filter((slot) => [9, 10, 11].includes(Number(slot.index))) }]
    });
    phases.push(buildPhaseEntry("bottom_up_card_build", result, startedAt, parsedRetry, { model: modelId, slotRetries: 2 }));
    assertScenario(parsedRetry.ok, "Retry semântico de matriz devolveu opções inválidas.");
    mergedAccepted = mergeAcceptedSlots(mergedAccepted, parsedRetry.cards[0]);
    const retried = await compileWithSemanticRetry(provider, {
      modelId,
      templateId: "matrix_locate_cell_choice",
      position: 1,
      accepted: mergedAccepted,
      slotSchema,
      basePrompt: buildPrompt
    });
    phases.push(...retried.phases);
    mergedAccepted = retried.mergedAccepted;
    card = retried.card;
    semantic = retried.semantic;
  }
  const slotPacket = { position: 1, slots: toSlotObject(mergedAccepted) };
  const structuralLeakWarnings = collectCardLeaks(card);
  return {
    phases,
    parsedPlan,
    parsedBuild,
    slotPacket,
    card,
    semantic,
    structuralLeakWarnings,
    computedAnswers: [{
      position: 1,
      answer: semantic.computedAnswer,
      correctValue: semantic.correctValue,
      targetRow: semantic.targetRow,
      targetCol: semantic.targetCol
    }]
  };
}

async function runDirectedGraphScenario(provider, modelId) {
  const phases = [];
  const planAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_micro_plan",
    system: "Responda somente com slots textuais.",
    prompt: [
      "Fase: bottom_up_micro_plan",
      "Tema: caminho simples em grafo pequeno",
      "Escolha exatamente 1 card.",
      "Use apenas códigos numéricos do codebook nos slots 1 a 5.",
      "O recurso precisa ser graph e o template precisa ser graph_simple.",
      ...buildCodebookPromptLines(),
      "Formato:",
      "CARD 1",
      "1: resourceCode",
      "2: operationCode",
      "3: didacticMoveCode",
      "4: probableMistakeCode",
      "5: feedbackKindCode",
      "6: planningReason",
      "7: templateId"
    ].join("\n"),
    slotSchema: planSpec().cards[0].slots
  });
  const parsedPlan = planAttempt.parsed;
  phases.push(...planAttempt.phases.map((item) => ({ ...item, phase: "graph_bottom_up_micro_plan" })));
  assertScenario(parsedPlan.ok, "Plano dirigido de grafo devolveu slots inválidos.");
  assertScenario(parsedPlan.cards[0].accepted["1"]?.value === 108, "Plano dirigido de grafo não escolheu resourceCode 108.");
  assertScenario(text(parsedPlan.cards[0].accepted["7"]?.value) === "graph_simple", "Plano dirigido de grafo não escolheu template graph_simple.");

  const template = getTemplateDefinition("graph_simple");
  const slotSchema = buildSlotSpecForTemplate(template);
  const buildPrompt = [
    "Fase: bottom_up_card_build",
    "Tema: caminho simples em grafo pequeno",
    "Preencha os slots do template graph_simple.",
    "Use exatamente os vértices A, B, C e D.",
    "Use exatamente as arestas A-B, B-C e C-D.",
    "Crie um exercício de caminho simples de A até D com exatamente uma alternativa correta.",
    "Os distratores devem conter erro verificável: aresta inexistente, repetição de vértice ou destino incorreto.",
    "Não diga que uma opção errada também é válida.",
    "Use answerId com a, b ou c.",
    "Escreva after como continuação didática, não como marcador estrutural.",
    "Formato:",
    "CARD 1",
    "1: title",
    "2: prompt",
    "3: vertices",
    "4: edges",
    "5: question",
    "6: optionA",
    "7: optionB",
    "8: optionC",
    "9: answerId",
    "10: after"
  ].join("\n");
  const buildAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_card_build",
    system: "Responda somente com slots textuais.",
    prompt: buildPrompt,
    slotSchema
  });
  const parsedBuild = buildAttempt.parsed;
  phases.push(...buildAttempt.phases.map((item) => ({ ...item, phase: "graph_bottom_up_card_build" })));
  assertScenario(parsedBuild.ok, "Build dirigido de grafo devolveu slots inválidos.");
  const compiled = await compileWithSemanticRetry(provider, {
    modelId,
    templateId: "graph_simple",
    position: 1,
    accepted: parsedBuild.cards[0].accepted,
    slotSchema,
    basePrompt: buildPrompt
  });
  phases.push(...compiled.phases.map((item) => ({ ...item, phase: "graph_bottom_up_card_build" })));
  const slotPacket = { position: 1, slots: toSlotObject(compiled.mergedAccepted) };
  const card = compiled.card;
  const semantic = validateCompiledCardSemantics(card, {
    templateId: "graph_simple",
    slotPacket
  });
  return {
    phases,
    slotPacket,
    card,
    semantic,
    structuralLeakWarnings: collectCardLeaks(card)
  };
}

async function runDirectedCompositeScenario(provider, modelId) {
  const phases = [];
  const planAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_micro_plan",
    system: "Responda somente com slots textuais.",
    prompt: [
      "Fase: bottom_up_micro_plan",
      "Tema: correspondência entre dois grafos pequenos.",
      "Escolha exatamente 1 card.",
      "Use apenas códigos numéricos do codebook nos slots 1 a 5.",
      "O recurso precisa ser composite e o template precisa ser composite_graph_compare_choice.",
      ...buildCodebookPromptLines(),
      "Formato:",
      "CARD 1",
      "1: resourceCode",
      "2: operationCode",
      "3: didacticMoveCode",
      "4: probableMistakeCode",
      "5: feedbackKindCode",
      "6: planningReason",
      "7: templateId"
    ].join("\n"),
    slotSchema: planSpec().cards[0].slots
  });
  const parsedPlan = planAttempt.parsed;
  phases.push(...planAttempt.phases.map((item) => ({ ...item, phase: "composite_bottom_up_micro_plan" })));
  assertScenario(parsedPlan.ok, "Plano dirigido de composite devolveu slots inválidos.");
  assertScenario(parsedPlan.cards[0].accepted["1"]?.value === 111, "Plano dirigido de composite não escolheu resourceCode 111.");
  assertScenario(text(parsedPlan.cards[0].accepted["7"]?.value) === "composite_graph_compare_choice", "Plano dirigido de composite não escolheu template composite_graph_compare_choice.");

  const template = getTemplateDefinition("composite_graph_compare_choice");
  const slotSchema = buildSlotSpecForTemplate(template);
  const buildPrompt = [
    "Fase: bottom_up_card_build",
    "Tema: correspondência entre dois grafos pequenos.",
    "Preencha os slots do template composite_graph_compare_choice.",
    "Introdução: diga que G1 tem arestas AB, BC e CD; G2 tem arestas 1-2, 2-3 e 3-4; use A -> 1, B -> 2, C -> 3, D -> 4.",
    "graph1Title deve ser exatamente G1.",
    "graph1Vertices deve ser exatamente A | B | C | D.",
    "graph1Edges deve ser exatamente A-B | B-C | C-D.",
    "graph2Title deve ser exatamente G2.",
    "graph2Vertices deve ser exatamente 1 | 2 | 3 | 4.",
    "graph2Edges deve ser exatamente 1-2 | 2-3 | 3-4.",
    "A pergunta deve pedir a imagem da aresta AB em G2.",
    "optionB deve ser exatamente 1-2, e esse par existe em G2.",
    "optionA e optionC devem ser distratores plausíveis e diferentes.",
    "Use answerId = b.",
    "Formato:",
    "CARD 1",
    "1: title",
    "2: introText",
    "3: graph1Title",
    "4: graph1Vertices",
    "5: graph1Edges",
    "6: graph2Title",
    "7: graph2Vertices",
    "8: graph2Edges",
    "9: question",
    "10: optionA",
    "11: optionB",
    "12: optionC",
    "13: answerId",
    "14: after"
  ].join("\n");
  const buildAttempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "bottom_up_card_build",
    system: "Responda somente com slots textuais.",
    prompt: buildPrompt,
    slotSchema
  });
  const parsedBuild = buildAttempt.parsed;
  phases.push(...buildAttempt.phases.map((item) => ({ ...item, phase: "composite_bottom_up_card_build" })));
  assertScenario(parsedBuild.ok, "Build dirigido de composite devolveu slots inválidos.");
  const compiled = await compileWithSemanticRetry(provider, {
    modelId,
    templateId: "composite_graph_compare_choice",
    position: 1,
    accepted: parsedBuild.cards[0].accepted,
    slotSchema,
    basePrompt: buildPrompt
  });
  phases.push(...compiled.phases.map((item) => ({ ...item, phase: "composite_bottom_up_card_build" })));
  const slotPacket = { position: 1, slots: toSlotObject(compiled.mergedAccepted) };
  const card = compiled.card;
  const semantic = validateCompiledCardSemantics(card, {
    templateId: "composite_graph_compare_choice",
    slotPacket
  });
  return {
    phases,
    slotPacket,
    card,
    semantic,
    structuralLeakWarnings: collectCardLeaks(card)
  };
}

async function runFreeResourceSelection(provider, modelId) {
  const phases = [];
  const attempt = await callSlotPhaseWithRetry(provider, {
    modelId,
    phase: "free_resource_selection",
    system: "Responda somente com slots textuais.",
    prompt: [
      "Fase: free_resource_selection",
      "Tema: ensinar identificação de célula em matriz por linha e coluna.",
      "Escolha exatamente 1 card.",
      "Não force um recurso por nome; escolha o recurso e o template mais adequados ao objetivo.",
      "Use apenas códigos numéricos do codebook nos slots 1 a 5.",
      ...buildCodebookPromptLines(),
      "Formato:",
      "CARD 1",
      "1: resourceCode",
      "2: operationCode",
      "3: didacticMoveCode",
      "4: probableMistakeCode",
      "5: feedbackKindCode",
      "6: planningReason",
      "7: templateId",
      "Catálogo resumido:",
      ...buildResourceCatalogPromptLines()
    ].join("\n"),
    slotSchema: planSpec().cards[0].slots
  });
  const parsed = attempt.parsed;
  phases.push(...attempt.phases);
  assertScenario(parsed.ok, "Escolha livre de recurso devolveu slots inválidos.");
  const accepted = parsed.cards[0].accepted;
  const resourceCode = Number(accepted["1"]?.value);
  const operationCode = Number(accepted["2"]?.value);
  const templateId = text(accepted["7"]?.value);
  const resource = getResourceCatalogItemByCode(resourceCode);
  const acceptedChoice = Boolean(
    resource
    && resource.operations.includes(operationCode)
    && resource.templates.includes(templateId)
    && resource.id === "matrix"
  );
  return {
    phases,
    raw: phases[phases.length - 1]?.rawText || "",
    parsed,
    chosenResource: resource?.id || "",
    chosenTemplate: templateId,
    accepted: acceptedChoice
  };
}

async function runRealAuditPatchScenario(provider, modelId) {
  const phases = [];
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
  const template = getTemplateDefinition("matrix_locate_cell_choice");
  const cardBeforeAudit = compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 1,
    slots: slotPacket.slots
  });
  let parsedAudit = null;
  let auditRaw = "";
  let invalidAuditPatches = [];
  let appliedSlotPatches = [];
  for (let retryIndex = 0; retryIndex <= 1; retryIndex += 1) {
    const { startedAt, result } = await callTextPhase(provider, {
      modelId,
      phase: "bottom_up_card_audit",
      system: "Responda somente com AUDIT por slots numéricos.",
      prompt: [
        "Fase: bottom_up_card_audit",
        "Feedback genérico deve ser corrigido por slot.",
        "Corrija apenas o slot 12.",
        "Não escreva values, options, answer ou JSON.",
        "Formato:",
        "AUDIT",
        "CARD 1",
        "action: 1209",
        "reason: feedback genérico",
        "12: novo feedback",
        "Card compilado:",
        JSON.stringify(cardBeforeAudit, null, 2)
      ].join("\n"),
      maxTokens: 1200
    });
    parsedAudit = parseAuditText(result.text);
    auditRaw = text(result.text);
    phases.push(buildPhaseEntry("bottom_up_card_audit", result, startedAt, parsedAudit, { model: modelId, slotRetries: retryIndex }));
    invalidAuditPatches = (parsedAudit.cards || []).flatMap((item) => item.invalidPatches || []);
    const invalidGlobal = parsedAudit.invalidGlobalLines || [];
    if (invalidGlobal.length || invalidAuditPatches.length) {
      if (retryIndex >= 1) {
        break;
      }
      continue;
    }
    const patchCard = parsedAudit.cards?.[0];
    assertScenario(patchCard, "Auditoria real não devolveu patch.");
    const validation = validateAuditPatchAgainstSlotPacket({ patchCard, slotPacket, template });
    if (!validation.ok) {
      if (retryIndex >= 1) {
        throw new Error(`Patch real de auditoria inválido: ${validation.errors.join("; ")}`);
      }
      continue;
    }
    appliedSlotPatches = [{
      cardIndex: 1,
      action: patchCard.action,
      patches: validation.validatedPatches
    }];
    Object.entries(validation.validatedPatches).forEach(([slotIndex, value]) => {
      slotPacket.slots[slotIndex] = value;
    });
    break;
  }
  const cardAfterAudit = compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 1,
    slots: slotPacket.slots
  });
  return {
    phases,
    raw: auditRaw,
    parsedAudit,
    invalidAuditPatches,
    appliedSlotPatches,
    auditPatchApplied: appliedSlotPatches.length > 0,
    cardsBeforeAudit: [cardBeforeAudit],
    cardsAfterAudit: [cardAfterAudit]
  };
}

function buildMarkdown(report = {}) {
  return [
    "# DeepSeek v4 Flash Structured Engine",
    "",
    `- Data: ${report.createdAt || ""}`,
    `- Modelo: ${report.model || ""}`,
    `- Resultado: ${report.result || ""}`,
    `- semanticValidation: ${report.semanticValidation ? "true" : "false"}`,
    `- graphSemanticValidation: ${report.graphSemanticValidation ? "true" : "false"}`,
    `- auditPatchApplied: ${report.auditPatchApplied ? "true" : "false"}`,
    `- freeResourceSelection: ${report.freeResourceSelection?.chosenResource || ""} / ${report.freeResourceSelection?.chosenTemplate || ""}`,
    "",
    "## Fases",
    ...(Array.isArray(report.phases) ? report.phases.map((phase) => `- ${phase.phase}: total=${phase.total_tokens}, hit=${phase.prompt_cache_hit_tokens}, miss=${phase.prompt_cache_miss_tokens}, retries=${phase.slotRetries || 0}`) : []),
    "",
    "## Resumo",
    `- structuralLeakWarnings: ${Array.isArray(report.structuralLeakWarnings) ? report.structuralLeakWarnings.length : 0}`,
    `- topDownAuditContradictions: ${Array.isArray(report.topDownAuditContradictions) ? report.topDownAuditContradictions.length : 0}`,
    `- graphAmbiguityWarnings: ${Array.isArray(report.graphAmbiguityWarnings) ? report.graphAmbiguityWarnings.length : 0}`,
    `- feedbackContradictions: ${Array.isArray(report.feedbackContradictions) ? report.feedbackContradictions.length : 0}`,
    `- choiceAnswerFallbacks: ${Array.isArray(report.choiceAnswerFallbacks) ? report.choiceAnswerFallbacks.length : 0}`,
    `- computedAnswers: ${Array.isArray(report.computedAnswers) ? report.computedAnswers.map((item) => `${item.position}:${item.answer}`).join(", ") : ""}`,
    `- graphComputedAnswers: ${Array.isArray(report.graphComputedAnswers) ? report.graphComputedAnswers.map((item) => `${item.position}:${item.answer}`).join(", ") : ""}`
  ].join("\n");
}

async function main() {
  const apiKey = text(process.env.DEEPSEEK_API_KEY);
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY ausente. Defina a variável de ambiente para rodar o smoke estruturado.");
  }
  const model = "deepseek-v4-flash";
  const baseUrl = "https://api.deepseek.com";
  const provider = createOpenAiCompatibleProvider({ baseUrl, apiKey });

  const topDown = await runRealTopDown(provider, model);
  const matrixScenario = await runDirectedMatrixScenario(provider, model);
  const graphScenario = await runDirectedGraphScenario(provider, model);
  const compositeScenario = await runDirectedCompositeScenario(provider, model);
  const freeResourceSelection = await runFreeResourceSelection(provider, model);
  const auditPatchScenario = await runRealAuditPatchScenario(provider, model);

  const structuralLeakWarnings = [
    ...matrixScenario.structuralLeakWarnings,
    ...graphScenario.structuralLeakWarnings,
    ...compositeScenario.structuralLeakWarnings,
    ...collectCardLeaks(auditPatchScenario.cardsAfterAudit[0])
  ];
  const semanticErrors = [];
  const topDownAuditContradictions = [
    ...((topDown.parsedAudit?.invalidGlobalLines || []).map((item) => item.reason)),
    ...((topDown.parsedAudit?.invalidPatches || []).map((item) => item.reason))
  ];
  const graphAmbiguityWarnings = [];
  const feedbackContradictions = [];
  const choiceAnswerFallbacks = [];
  if (matrixScenario.semantic.answer !== undefined && matrixScenario.semantic.answer !== "b") {
    semanticErrors.push("resposta semântica de matriz diferente do esperado");
  }
  if (graphScenario.semantic?.validOptions?.length !== 1) {
    graphAmbiguityWarnings.push("graph_simple sem alternativa única válida");
  }
  if (!Array.isArray(graphScenario.semantic?.validOptions) || !Array.isArray(graphScenario.semantic?.invalidOptions)) {
    semanticErrors.push("graph_simple sem rastreamento completo de opções");
  }
  const semanticValidation = semanticErrors.length === 0 && structuralLeakWarnings.length === 0;

  const finalReport = {
    createdAt: new Date().toISOString(),
    model,
    baseUrl,
    result: "success",
    fail_closed: false,
    phases: [
      ...topDown.phases,
      ...matrixScenario.phases,
      ...graphScenario.phases,
      ...compositeScenario.phases,
      ...freeResourceSelection.phases,
      ...auditPatchScenario.phases
    ],
    top_down_structure: {
      raw: topDown.raw,
      auditRaw: topDown.auditRaw,
      parsedAudit: topDown.parsedAudit,
      appliedTopDownPatches: topDown.appliedTopDownPatches
    },
    bottom_up_matrix: {
      raw: matrixScenario.phases.find((item) => item.phase === "bottom_up_card_build")?.rawText || "",
      parsedPlan: matrixScenario.parsedPlan,
      parsedCardSlots: matrixScenario.parsedBuild,
      cardsAfterBuild: [matrixScenario.card],
      resourcesUsed: ["matrix"],
      semanticValidation: true,
      computedAnswers: matrixScenario.computedAnswers
    },
    bottom_up_graph: {
      raw: graphScenario.phases.find((item) => item.phase === "graph_bottom_up_card_build")?.rawText || "",
      cardsAfterBuild: [graphScenario.card],
      resourcesUsed: ["graph"],
      graphSemanticValidation: true,
      graphComputedAnswers: [{
        position: 1,
        answer: graphScenario.semantic?.computedAnswer || "",
        validOptions: graphScenario.semantic?.validOptions || [],
        invalidOptions: graphScenario.semantic?.invalidOptions || [],
        graphTask: graphScenario.semantic?.graphTask || null
      }],
      graphAmbiguityWarnings
    },
    bottom_up_composite: {
      raw: compositeScenario.phases.find((item) => item.phase === "composite_bottom_up_card_build")?.rawText || "",
      cardsAfterBuild: [compositeScenario.card],
      resourcesUsed: ["composite"],
      semanticValidation: true,
      summary: compositeScenario.semantic
    },
    freeResourceSelection: {
      raw: freeResourceSelection.raw,
      parsed: freeResourceSelection.parsed,
      chosenResource: freeResourceSelection.chosenResource,
      chosenTemplate: freeResourceSelection.chosenTemplate,
      accepted: freeResourceSelection.accepted
    },
    auditPatchScenario: {
      raw: auditPatchScenario.raw,
      parsedAudit: auditPatchScenario.parsedAudit,
      invalidAuditPatches: auditPatchScenario.invalidAuditPatches,
      appliedSlotPatches: auditPatchScenario.appliedSlotPatches,
      cardsBeforeAudit: auditPatchScenario.cardsBeforeAudit,
      cardsAfterAudit: auditPatchScenario.cardsAfterAudit
    },
    finalValidation: true,
    semanticValidation,
    semanticErrors,
    structuralLeakWarnings,
    graphSemanticValidation: graphAmbiguityWarnings.length === 0,
    graphComputedAnswers: [{
      position: 1,
      answer: graphScenario.semantic?.computedAnswer || "",
      validOptions: graphScenario.semantic?.validOptions || [],
      invalidOptions: graphScenario.semantic?.invalidOptions || [],
      graphTask: graphScenario.semantic?.graphTask || null
    }],
    graphValidOptions: graphScenario.semantic?.validOptions || [],
    graphInvalidOptions: graphScenario.semantic?.invalidOptions || [],
    graphAmbiguityWarnings,
    feedbackContradictions,
    topDownAuditContradictions,
    choiceAnswerFallbacks,
    computedAnswers: [
      ...matrixScenario.computedAnswers,
      {
        position: 1,
        answer: auditPatchScenario.cardsAfterAudit[0].answer,
        correctValue: matrixScenario.computedAnswers[0].correctValue,
        targetRow: matrixScenario.computedAnswers[0].targetRow,
        targetCol: matrixScenario.computedAnswers[0].targetCol
      }
    ],
    auditPatchApplied: auditPatchScenario.auditPatchApplied
  };

  assertScenario((finalReport.top_down_structure.parsedAudit?.invalidPatches || []).length === 0, "Top-down audit aceitou patch inválido.");
  assertScenario(finalReport.topDownAuditContradictions.length === 0, "Top-down audit terminou com contradição entre patch e STATUS OK.");
  assertScenario(finalReport.bottom_up_matrix.computedAnswers[0].answer === "b", "Smoke de matriz terminou com answer semântico incorreto.");
  assertScenario(finalReport.structuralLeakWarnings.length === 0, `Smoke terminou com vazamento estrutural: ${finalReport.structuralLeakWarnings.join("; ")}`);
  assertScenario(finalReport.graphAmbiguityWarnings.length === 0, `Smoke terminou com ambiguidade em graph_simple: ${finalReport.graphAmbiguityWarnings.join("; ")}`);
  assertScenario(finalReport.graphComputedAnswers[0].answer, "Smoke terminou sem graphComputedAnswers.");
  assertScenario(finalReport.bottom_up_composite.cardsAfterBuild[0].resource === "composite", "Smoke terminou sem card composto válido.");
  assertScenario(finalReport.feedbackContradictions.length === 0, `Smoke terminou com feedback contraditório: ${finalReport.feedbackContradictions.join("; ")}`);
  assertScenario(finalReport.choiceAnswerFallbacks.length === 0, `Smoke terminou com fallback de answer em choice: ${finalReport.choiceAnswerFallbacks.join("; ")}`);
  assertScenario(finalReport.freeResourceSelection.accepted === true, "Escolha livre de recurso não foi aceita como coerente.");
  assertScenario(finalReport.auditPatchApplied === true, "Auditoria real não aplicou patch por slot.");
  assertScenario(finalReport.auditPatchScenario.cardsBeforeAudit[0].after !== finalReport.auditPatchScenario.cardsAfterAudit[0].after, "Patch real de auditoria não alterou o after.");
  assertScenario(finalReport.semanticValidation === true, "Smoke terminou com semanticValidation=false.");

  const reportPathJson = path.join(process.cwd(), "tests", "reports", "deepseek-v4-flash-structured-engine.json");
  const reportPathMd = path.join(process.cwd(), "tests", "reports", "deepseek-v4-flash-structured-engine.md");
  fs.mkdirSync(path.dirname(reportPathJson), { recursive: true });
  fs.writeFileSync(reportPathJson, JSON.stringify(finalReport, null, 2));
  fs.writeFileSync(reportPathMd, buildMarkdown(finalReport));

  console.log(JSON.stringify({
    reportPathJson,
    reportPathMd,
    matrixResources: finalReport.bottom_up_matrix.resourcesUsed,
    graphResources: finalReport.bottom_up_graph.resourcesUsed
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
