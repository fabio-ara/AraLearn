import { getMicrosequenceCardCount, getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { buildDeterministicCardPlan } from "./buildDeterministicCardPlan.js";

function fail(errors) {
  return { ok: false, errors };
}

function normalizeSourceUsePlan(sourceUsePlan, sourceIds, errors) {
  const normalized = [];
  const seen = new Set();

  (Array.isArray(sourceUsePlan) ? sourceUsePlan : []).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`sourceUsePlan[${index}] inválido.`);
      return;
    }
    const sourceId = String(item.sourceId || "").trim();
    if (!sourceId) {
      errors.push(`sourceUsePlan[${index}] sem sourceId.`);
      return;
    }
    if (!sourceIds.has(sourceId)) {
      errors.push(`sourceUsePlan[${index}] usa fonte inexistente: ${sourceId}.`);
      return;
    }
    if (seen.has(sourceId)) {
      errors.push(`sourceUsePlan duplicado para a fonte: ${sourceId}.`);
      return;
    }
    seen.add(sourceId);
    const usage = String(item.usage || item.intent || "").trim();
    const note = String(item.note || item.reason || "").trim();
    normalized.push({
      sourceId,
      ...(usage ? { usage } : {}),
      ...(note ? { note } : {})
    });
  });

  return normalized;
}

export function validateMicrosequencePlan(plan, planningContract) {
  const errors = [];
  const type = getMicrosequenceType(plan?.typeId);
  const size = getMicrosequenceSize(plan?.sizeId);
  const resourceIds = new Set((planningContract?.availableResources || []).map((item) => item.id));
  const sourceIds = new Set((planningContract?.sources || []).map((item) => item.sourceId));
  const fixedTypeId = planningContract?.request?.userFixedTypeId;

  if (!type) errors.push("typeId não existe.");
  if (fixedTypeId && fixedTypeId !== "assisted" && plan?.typeId !== fixedTypeId) errors.push("typeId não preserva o Tipo fixado.");
  if (!size) errors.push("sizeId não existe.");
  if (type && size && !type.availableSizes.includes(size.id)) errors.push("sizeId incompatível com o tipo.");

  const cardCount = getMicrosequenceCardCount(plan?.sizeId);

  const userExtras = planningContract?.request?.userSelectedExtraResourceTypes || [];
  const selectedExtras = new Set(plan?.selectedExtraResourceTypes || []);
  const normalizedSourceUsePlan = normalizeSourceUsePlan(plan?.sourceUsePlan, sourceIds, errors);
  userExtras.forEach((resourceId) => {
    if (!selectedExtras.has(resourceId)) errors.push(`Recurso extra do usuário não preservado: ${resourceId}.`);
  });
  (plan?.selectedExtraResourceTypes || []).forEach((resourceId) => {
    if (!resourceIds.has(resourceId)) errors.push(`selectedExtraResourceTypes inválido: ${resourceId}.`);
  });

  const cardPlan =
    type && size
      ? buildDeterministicCardPlan({
          typeId: plan.typeId,
          sizeId: plan.sizeId,
          selectedExtraResourceTypes: plan?.selectedExtraResourceTypes || [],
          userSelectedExtraResourceTypes: userExtras
        })
      : [];
  if (cardCount && cardPlan.length !== cardCount) errors.push("cardPlan determinístico não possui a quantidade esperada.");
  cardPlan.forEach((item) => {
    if (!resourceIds.has(item?.resourceType)) errors.push(`resourceType determinístico inválido: ${item?.resourceType || ""}.`);
    (item?.sourceRefs || []).forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) errors.push(`Fonte inexistente no plano: ${sourceId}.`);
    });
  });

  if (errors.length) return fail(errors);
  return {
    ok: true,
    plan: {
      typeId: plan.typeId,
      sizeId: plan.sizeId,
      microsequenceGoal: String(plan.microsequenceGoal || "").trim(),
      selectedExtraResourceTypes: Array.from(selectedExtras),
      cardPlan: cardPlan.map((item) => ({
        position: item.position,
        role: String(item.role).trim(),
        resourceType: item.resourceType,
        sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : []
      })),
      sourceUsePlan: normalizedSourceUsePlan,
      reason: String(plan.reason || "").trim()
    }
  };
}
