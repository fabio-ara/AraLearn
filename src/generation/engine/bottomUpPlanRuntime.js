import { parseCardSlotText } from "./slotParser.js";
import { buildRetryPrompt, collectPendingSlots, mergeAcceptedSlots } from "./slotRetry.js";
import { buildStablePromptPrefix } from "./enginePrompting.js";
import { getResourceCatalogItemByCode, listResourceCatalog } from "./resourceCatalog.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCardSpec(position) {
  return {
    position: Number(position),
    slots: [
      { index: 1, label: "resourceCode", type: "code", family: "resource" },
      { index: 2, label: "operationCode", type: "code", family: "operation" },
      { index: 3, label: "didacticMoveCode", type: "code", family: "didacticMove" },
      { index: 4, label: "probableMistakeCode", type: "code", family: "probableMistake" },
      { index: 5, label: "feedbackKindCode", type: "code", family: "feedbackKind" },
      { index: 6, label: "planningReason", type: "text" },
      { index: 7, label: "templateId", type: "text", required: false }
    ]
  };
}

function buildPlanPrompt({ planningContract, validatedPlan, slotPlan }) {
  const resourceLines = listResourceCatalog().map((item) => {
    const templateSuffix = item.templates.length > 1
      ? `templates=${item.templates.join(", ")}`
      : `template único=${item.templates[0]}`;
    return `- ${item.code} ${item.id}: operações ${item.operations.join(", ")}; ${templateSuffix}`;
  });
  return [
    buildStablePromptPrefix(),
    "Fase: bottom_up_micro_plan",
    `Microssequência: ${text(planningContract?.microsequence?.title)}`,
    `Objetivo: ${text(validatedPlan?.plan?.goal || planningContract?.microsequence?.goal)}`,
    `Diretrizes didáticas: ${JSON.stringify(planningContract?.didactics || {})}`,
    "Escolha o recurso, a operação e o template didático mais adequados ao objetivo.",
    "Quando um recurso tiver mais de um template, preencha o slot 7 com o templateId permitido.",
    "Quando houver template único, o slot 7 pode repetir o mesmo template único.",
    "Formato obrigatório:",
    "CARD n",
    "1: resourceCode",
    "2: operationCode",
    "3: didacticMoveCode",
    "4: probableMistakeCode",
    "5: feedbackKindCode",
    "6: planningReason",
    "7: templateId",
    "Recursos e templates permitidos:",
    ...resourceLines,
    "",
    ...slotPlan.map((slot) => `CARD ${Number(slot.position)} role=${slot.role} goal=${text(slot.goal)}`)
  ].join("\n");
}

function validatePlanCard(cardResult = {}, mergedAccepted = null) {
  const accepted = structuredClone(mergedAccepted || cardResult.accepted || {});
  const resourceCode = accepted["1"]?.value;
  const operationCode = accepted["2"]?.value;
  const templateId = text(accepted["7"]?.value || accepted["7"]?.raw);
  const resource = getResourceCatalogItemByCode(resourceCode);
  if (!resource) {
    cardResult.invalid.push({ index: 1, raw: String(resourceCode || ""), reason: "recurso inexistente no catálogo" });
    delete accepted["1"];
    return { accepted };
  }
  if (operationCode && !resource.operations.includes(Number(operationCode))) {
    cardResult.invalid.push({
      index: 2,
      raw: String(operationCode),
      reason: `operação incompatível com ${resource.id}`
    });
    delete accepted["2"];
  }
  if (resource.templates.length === 1 && !templateId) {
    accepted["7"] = {
      raw: resource.templates[0],
      value: resource.templates[0]
    };
  } else if (!templateId) {
    cardResult.missing.push({
      index: 7,
      reason: "template obrigatório para recurso com múltiplos templates"
    });
  } else if (!resource.templates.includes(templateId)) {
    cardResult.invalid.push({
      index: 7,
      raw: templateId,
      reason: `template não permitido para ${resource.id}`
    });
    delete accepted["7"];
  }
  return { accepted };
}

function summarizeTrace(cardResult, pending) {
  return {
    position: Number(cardResult.position),
    accepted: structuredClone(cardResult.accepted),
    missing: structuredClone(cardResult.missing),
    invalid: structuredClone(cardResult.invalid),
    duplicate: structuredClone(cardResult.duplicate),
    extra: structuredClone(cardResult.extra),
    pending: structuredClone(pending)
  };
}

function mergeCardState(existing = {}, parsedCard = {}, normalizedAccepted = {}) {
  const nextAccepted = mergeAcceptedSlots(existing.accepted, {
    accepted: normalizedAccepted
  });
  return {
    position: Number(parsedCard.position),
    accepted: nextAccepted,
    missing: buildCardSpec(parsedCard.position).slots
      .filter((slot) => !(String(slot.index) in nextAccepted))
      .map((slot) => ({ index: Number(slot.index), reason: "slot ausente" })),
    invalid: parsedCard.invalid,
    duplicate: parsedCard.duplicate,
    extra: parsedCard.extra
  };
}

export async function runBottomUpMicroPlan({
  provider,
  modelId,
  planningContract,
  validatedPlan,
  logger
} = {}) {
  if (!provider?.generateText) {
    throw new Error("Provider sem canal textual para o plano fino.");
  }
  const slotPlan = Array.isArray(validatedPlan?.plan?.slotPlan) ? validatedPlan.plan.slotPlan : [];
  const promptBase = buildPlanPrompt({ planningContract, validatedPlan, slotPlan });
  const states = new Map(slotPlan.map((slot) => [Number(slot.position), { position: Number(slot.position), accepted: {}, missing: [], invalid: [], duplicate: [], extra: [] }]));

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const retryBlocks = slotPlan.flatMap((slot) => {
      const state = states.get(Number(slot.position));
      const pending = collectPendingSlots({ cardResult: state });
      if (attempt === 0 || !pending.length) {
        return [];
      }
      return [
        "",
        buildRetryPrompt({
          phase: "bottom_up_micro_plan",
          cardIndex: slot.position,
          pendingSlots: pending,
          slotSchema: buildCardSpec(slot.position).slots,
          duplicate: state.duplicate,
          extra: state.extra
        })
      ];
    });
    const prompt = attempt === 0 ? promptBase : `${promptBase}\n${retryBlocks.join("\n")}`;
    const startedAt = Date.now();
    const result = await provider.generateText({
      modelId,
      phase: "bottom_up_micro_plan",
      system: "Responda somente no formato CARD/slots solicitado.",
      prompt,
      temperature: attempt === 0 ? 0.1 : 0,
      maxTokens: 2400,
      engineContext: {
        planningContract,
        validatedPlan,
        attempt
      }
    });
    const parsed = parseCardSlotText(result.text, {
      cards: slotPlan.map((slot) => {
        const state = states.get(Number(slot.position));
        const pending = attempt === 0 ? null : collectPendingSlots({ cardResult: state }).map((item) => Number(item.slotIndex));
        const slotSpec = buildCardSpec(slot.position).slots.filter((item) => !pending || pending.includes(Number(item.index)));
        return { position: slot.position, slots: slotSpec };
      })
    });
    const traces = [];
    parsed.cards.forEach((cardResult) => {
      const validatedCard = structuredClone(cardResult);
      const preMergedAccepted = mergeAcceptedSlots(states.get(Number(cardResult.position))?.accepted, validatedCard);
      const normalized = validatePlanCard(validatedCard, preMergedAccepted).accepted;
      const merged = mergeCardState(states.get(Number(cardResult.position)), validatedCard, normalized);
      states.set(Number(cardResult.position), merged);
      traces.push(summarizeTrace(merged, collectPendingSlots({ cardResult: merged })));
    });
    logger?.log({
      phase: "bottom_up_micro_plan",
      model: modelId,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      slotRetries: attempt,
      slotErrors: traces,
      rawText: result.text,
      parsedSlots: traces
    });
    const allResolved = [...states.values()].every((state) => !collectPendingSlots({ cardResult: state }).length && !state.extra.length);
    if (allResolved) {
      return slotPlan.map((slot) => {
        const state = states.get(Number(slot.position));
        const accepted = state.accepted;
        return {
          position: Number(slot.position),
          role: slot.role,
          resourceCode: Number(accepted["1"]?.value),
          operationCode: Number(accepted["2"]?.value),
          didacticMoveCode: Number(accepted["3"]?.value),
          probableMistakeCode: Number(accepted["4"]?.value),
          feedbackKindCode: Number(accepted["5"]?.value),
          planningReason: text(accepted["6"]?.value || accepted["6"]?.raw),
          templateId: text(accepted["7"]?.value || accepted["7"]?.raw)
        };
      });
    }
  }

  const unresolved = [...states.values()].map((state) => summarizeTrace(state, collectPendingSlots({ cardResult: state })));
  throw new Error(`fail_closed no plano fino: ${JSON.stringify(unresolved)}`);
}

export { buildRetryPrompt };
