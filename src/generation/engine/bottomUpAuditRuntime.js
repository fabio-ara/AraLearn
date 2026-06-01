import { parseAuditText } from "./slotParser.js";
import { buildStablePromptPrefix } from "./enginePrompting.js";
import { evaluateChoiceOveruse, suggestTheorySplit } from "./progressionGuard.js";
import { getTemplateDefinition } from "./templateCatalog.js";
import { assertCodeFamily } from "./slotCodebook.js";
import { buildSlotSpecForTemplate } from "./bottomUpBuildRuntime.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function listAuditables(template = {}) {
  return (Array.isArray(template?.slots) ? template.slots : []).map((slot) => {
    const label = text(slot.label);
    if (/^row\d+$/i.test(label)) {
      return `${slot.index} ${label}, formato obrigatório: 2 | 5 | 8`;
    }
    if (/answerId/i.test(label)) {
      return `${slot.index} ${label}, valores permitidos: a | b | c`;
    }
    return `${slot.index} ${label}`;
  });
}

function buildAuditPrompt({ generationContract, cards, slotPackets, planItems, choiceStats, denseCards }) {
  const cardSections = (Array.isArray(cards) ? cards : []).map((card) => {
    const planItem = (Array.isArray(planItems) ? planItems : []).find((item) => Number(item.position) === Number(card.position));
    const template = getTemplateDefinition(planItem?.templateId || "");
    const packet = (Array.isArray(slotPackets) ? slotPackets : []).find((item) => Number(item.position) === Number(card.position));
    return [
      `CARD ${card.position}`,
      `templateId: ${text(planItem?.templateId)}`,
      "Slots auditáveis:",
      ...listAuditables(template).map((line) => `- ${line}`),
      "Slots originais:",
      ...Object.entries(packet?.slots || {}).map(([slotIndex, value]) => `${slotIndex}: ${text(value)}`),
      "Card compilado:",
      JSON.stringify(card, null, 2)
    ].join("\n");
  });
  return [
    buildStablePromptPrefix(),
    "Fase: bottom_up_card_audit",
    `Microssequência: ${text(generationContract?.microsequence?.title)}`,
    `ChoiceCount: ${choiceStats.choiceCount}`,
    `NonChoiceExerciseCount: ${choiceStats.nonChoiceExerciseCount}`,
    `DenseTheoryCards: ${denseCards.join(", ") || "none"}`,
    "Corrija somente por slots numéricos do template original.",
    "Não escreva values, options, answer, resource, kind, exercise, nodes, edges, vertices, relations, parentId, leftSet, rightSet, JSON, arrays ou objetos.",
    "Se houver problema em um card, devolva CARD n, action, reason e apenas slots numéricos.",
    "Formato:",
    "AUDIT",
    "status: 1201",
    "ou",
    "AUDIT",
    "CARD 3",
    "action: 1202",
    "reason: motivo objetivo",
    "4: novo valor",
    "5: novo valor",
    cardSections.join("\n\n")
  ].join("\n\n");
}

function hasInvalidAuditPatch(parsed = {}) {
  return (Array.isArray(parsed.invalidGlobalLines) && parsed.invalidGlobalLines.length)
    || (Array.isArray(parsed.cards) && parsed.cards.some((card) => Array.isArray(card.invalidPatches) && card.invalidPatches.length));
}

function clonePacket(packet = {}) {
  return {
    ...structuredClone(packet || {}),
    slots: structuredClone(packet?.slots || {})
  };
}

export function validateAuditPatchAgainstSlotPacket({ patchCard, slotPacket, template }) {
  const errors = [];
  if (!slotPacket) {
    errors.push("CARD inexistente no slotPacket.");
  }
  if (!template) {
    errors.push("template inexistente para auditoria.");
  }
  try {
    assertCodeFamily(Number(patchCard?.action || 1202), "auditAction");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "action de auditoria inválida.");
  }
  const slotSchema = new Map(buildSlotSpecForTemplate(template).map((slot) => [String(slot.index), slot]));
  const validatedPatches = {};
  Object.entries(patchCard?.patches || {}).forEach(([slotIndex, rawValue]) => {
    if (!/^\d+$/u.test(String(slotIndex))) {
      errors.push(`patch não numérico rejeitado: ${slotIndex}.`);
      return;
    }
    const slot = slotSchema.get(String(slotIndex));
    if (!slot) {
      errors.push(`slot de auditoria inexistente no template: ${slotIndex}.`);
      return;
    }
    const validation = typeof slot.validate === "function"
      ? slot.validate(text(rawValue), slot)
      : { ok: true, value: text(rawValue) };
    if (validation !== true && validation?.ok === false) {
      errors.push(`slot ${slotIndex} inválido: ${text(validation.reason) || "valor rejeitado"}.`);
      return;
    }
    if (typeof validation === "string") {
      errors.push(`slot ${slotIndex} inválido: ${validation}.`);
      return;
    }
    validatedPatches[String(slotIndex)] = text(validation?.value ?? rawValue);
  });
  return {
    ok: errors.length === 0,
    errors,
    validatedPatches
  };
}

function applyNumericSlotPatches(slotPacket = {}, patches = {}) {
  const next = clonePacket(slotPacket);
  Object.entries(patches || {}).forEach(([slotIndex, value]) => {
    next.slots[String(slotIndex)] = text(value);
  });
  return next;
}

export async function runBottomUpCardAudit({
  provider,
  modelId,
  generationContract,
  cards,
  slotPackets,
  planItems,
  logger
} = {}) {
  const choiceStats = evaluateChoiceOveruse(cards);
  const denseCards = suggestTheorySplit(cards);
  if (!provider?.generateText) {
    throw new Error("Provider sem canal textual para auditoria.");
  }
  const basePrompt = buildAuditPrompt({
    generationContract,
    cards,
    slotPackets,
    planItems,
    choiceStats,
    denseCards
  });

  async function requestAudit(prompt, retryIndex) {
    const startedAt = Date.now();
    const result = await provider.generateText({
      modelId,
      phase: "bottom_up_card_audit",
      system: "Responda somente no formato AUDIT por slots.",
      prompt,
      temperature: 0,
      maxTokens: 1800
    });
    const parsed = parseAuditText(result.text);
    logger?.log({
      phase: "bottom_up_card_audit",
      model: modelId,
      usage: result.usage,
      latencyMs: Date.now() - startedAt,
      choiceCount: choiceStats.choiceCount,
      nonChoiceExerciseCount: choiceStats.nonChoiceExerciseCount,
      theoryDensityWarnings: denseCards,
      auditPatches: Array.isArray(parsed.cards) ? parsed.cards.length : 0,
      slotErrors: parsed.cards,
      rawText: result.text,
      parsedSlots: parsed,
      slotRetries: retryIndex
    });
    return { result, parsed };
  }

  let retryIndex = 0;
  let prompt = basePrompt;
  let lastParsed = null;
  while (retryIndex <= 1) {
    const { parsed } = await requestAudit(prompt, retryIndex);
    lastParsed = parsed;
    const invalidPatchLines = [];
    if (hasInvalidAuditPatch(parsed)) {
      if (Array.isArray(parsed.invalidGlobalLines)) {
        parsed.invalidGlobalLines.forEach((item) => invalidPatchLines.push(`${item.raw}: ${item.reason}`));
      }
      (parsed.cards || []).forEach((card) => {
        (card.invalidPatches || []).forEach((item) => {
          invalidPatchLines.push(`CARD ${card.cardIndex} ${item.key || "linha"}: ${item.reason}`);
        });
      });
      retryIndex += 1;
      if (retryIndex > 1) {
        return {
          ...parsed,
          appliedSlotPackets: Array.isArray(slotPackets) ? structuredClone(slotPackets) : [],
          failClosed: true,
          invalidAuditPatches: invalidPatchLines,
          appliedSlotPatches: []
        };
      }
      prompt = [
        basePrompt,
        "",
        "RETRY AUDIT",
        "Sua resposta anterior foi rejeitada.",
        ...invalidPatchLines.map((item) => `- ${item}`),
        "Corrija somente por slots numéricos válidos."
      ].join("\n");
      continue;
    }

    const appliedSlotPackets = Array.isArray(slotPackets) ? structuredClone(slotPackets) : [];
    const appliedSlotPatches = [];
    let failClosed = parsed.status === 1206;
    let invalidSemanticPatches = [];
    (parsed.cards || []).forEach((patchCard) => {
      const packetIndex = appliedSlotPackets.findIndex((item) => Number(item.position) === Number(patchCard.cardIndex));
      const slotPacket = packetIndex >= 0 ? appliedSlotPackets[packetIndex] : null;
      const planItem = (Array.isArray(planItems) ? planItems : []).find((item) => Number(item.position) === Number(patchCard.cardIndex));
      const template = getTemplateDefinition(planItem?.templateId || "");
      const validation = validateAuditPatchAgainstSlotPacket({ patchCard, slotPacket, template });
      if (!validation.ok) {
        invalidSemanticPatches.push(...validation.errors.map((item) => `CARD ${patchCard.cardIndex}: ${item}`));
        return;
      }
      if (Object.keys(validation.validatedPatches).length === 0 && Number(patchCard.action) !== 1201) {
        invalidSemanticPatches.push(`CARD ${patchCard.cardIndex}: auditoria indicou ação sem patch aplicável.`);
        return;
      }
      if (slotPacket) {
        appliedSlotPackets[packetIndex] = applyNumericSlotPatches(slotPacket, validation.validatedPatches);
        appliedSlotPatches.push({
          cardIndex: Number(patchCard.cardIndex),
          action: Number(patchCard.action || 1202),
          reason: text(patchCard.reason),
          patches: structuredClone(validation.validatedPatches)
        });
      }
    });
    if (invalidSemanticPatches.length) {
      retryIndex += 1;
      if (retryIndex > 1) {
        return {
          ...parsed,
          appliedSlotPackets: Array.isArray(slotPackets) ? structuredClone(slotPackets) : [],
          failClosed: true,
          invalidAuditPatches: invalidSemanticPatches,
          appliedSlotPatches: []
        };
      }
      prompt = [
        basePrompt,
        "",
        "RETRY AUDIT",
        "Sua resposta anterior foi rejeitada.",
        ...invalidSemanticPatches.map((item) => `- ${item}`),
        "Corrija somente por slots numéricos válidos do template original."
      ].join("\n");
      continue;
    }
    if ((parsed.status && parsed.status !== 1201) && !appliedSlotPatches.length && !failClosed) {
      failClosed = true;
    }
    return {
      ...parsed,
      appliedSlotPackets,
      failClosed,
      invalidAuditPatches: [],
      appliedSlotPatches
    };
  }

  return {
    ...lastParsed,
    appliedSlotPackets: Array.isArray(slotPackets) ? structuredClone(slotPackets) : [],
    failClosed: true,
    invalidAuditPatches: ["auditoria inválida após retry"],
    appliedSlotPatches: []
  };
}
