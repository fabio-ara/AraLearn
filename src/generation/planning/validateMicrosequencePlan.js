import { getMicrosequenceCardCount, getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { buildDeterministicCardPlan } from "./buildDeterministicCardPlan.js";

function fail(errors) {
  return { ok: false, errors };
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
      sourceUsePlan: Array.isArray(plan.sourceUsePlan) ? plan.sourceUsePlan : [],
      reason: String(plan.reason || "").trim()
    }
  };
}
