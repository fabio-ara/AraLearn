import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { buildDeterministicCardPlan } from "./buildDeterministicCardPlan.js";
import { assertUserSelectedResourcesAllowed } from "../policies/weakModelPolicy.js";
import { validatePlanAgainstStudyTrack } from "../policies/studyTrackPolicy.js";

function fail(errors) {
  return { ok: false, errors };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeResourceList(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

function normalizeSourceUsePlan(sourceUsePlan, sourceIds, errors) {
  const normalized = [];
  const seen = new Set();

  (Array.isArray(sourceUsePlan) ? sourceUsePlan : []).forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`sourceUsePlan[${index}] inválido.`);
      return;
    }
    const sourceId = text(item.sourceId);
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
    normalized.push({
      sourceId,
      ...(text(item.usage) ? { usage: text(item.usage) } : {}),
      ...(text(item.note) ? { note: text(item.note) } : {})
    });
  });

  return normalized;
}

export function validateMicrosequencePlan(plan, planningContract) {
  const errors = [];
  const requestedTypeId = text(plan?.typeId);
  const requestedSizeId = text(plan?.sizeId);
  const type = getMicrosequenceType(requestedTypeId);
  const size = getMicrosequenceSize(requestedSizeId);
  const sourceIds = new Set((planningContract?.sources || []).map((item) => item.sourceId));
  const availableTypeIds = new Set((planningContract?.availableTypes || []).map((item) => item.id));
  const availableSizeIds = new Set((planningContract?.availableSizes || []).map((item) => item.id));
  const userFixedTypeId = text(planningContract?.request?.userFixedTypeId);
  const userSelectedExtraResourceTypes = normalizeResourceList(planningContract?.request?.userSelectedExtraResourceTypes);
  const requestedExtraResourceTypes = normalizeResourceList(plan?.selectedExtraResourceTypes);

  if (!type) {
    errors.push("typeId não existe.");
  } else if (!availableTypeIds.has(requestedTypeId)) {
    errors.push("typeId fora dos tipos permitidos pela policy.");
  }
  if (userFixedTypeId && userFixedTypeId !== "assisted" && requestedTypeId !== userFixedTypeId) {
    errors.push("typeId não preserva o Tipo fixado.");
  }
  if (!size) {
    errors.push("sizeId não existe.");
  } else if (!availableSizeIds.has(requestedSizeId)) {
    errors.push("sizeId fora dos tamanhos permitidos pela policy.");
  }

  userSelectedExtraResourceTypes.forEach((resourceType) => {
    if (!requestedExtraResourceTypes.includes(resourceType)) {
      errors.push(`Recurso extra do usuário não preservado: ${resourceType}.`);
    }
  });

  const sourceUsePlan = normalizeSourceUsePlan(plan?.sourceUsePlan, sourceIds, errors);
  const policyCheck = assertUserSelectedResourcesAllowed({
    lessonGuidance: planningContract?.context?.lesson || {},
    lessonSourceGuideStructured: planningContract?.context?.lesson?.sourceGuideStructured || {},
    modelCapabilities: planningContract?.model?.capabilities || {},
    resolvedTypeId: requestedTypeId,
    userSelectedExtraResourceTypes: requestedExtraResourceTypes
  });
  if (!policyCheck.ok) {
    errors.push(...policyCheck.errors);
  }
  errors.push(...validatePlanAgainstStudyTrack(plan, planningContract?.studyTrackPolicy));

  const cardPlan =
    type && size
      ? buildDeterministicCardPlan({
          typeId: requestedTypeId,
          sizeId: requestedSizeId,
          selectedExtraResourceTypes: requestedExtraResourceTypes,
          userSelectedExtraResourceTypes,
          lessonAllowedResourceTypes: planningContract?.context?.lesson?.resourceTags || [],
          lessonGuidance: planningContract?.context?.lesson || {},
          lessonSourceGuideStructured: planningContract?.context?.lesson?.sourceGuideStructured || {},
          modelCapabilities: planningContract?.model?.capabilities || {},
          sourceUsePlan
        })
      : [];

  if (size && cardPlan.length !== size.cardCount) {
    errors.push("cardPlan determinístico não possui a quantidade esperada.");
  }

  if (errors.length) {
    return fail(errors);
  }

  return {
    ok: true,
    plan: {
      typeId: requestedTypeId,
      sizeId: requestedSizeId,
      microsequenceGoal: text(plan?.microsequenceGoal),
      selectedExtraResourceTypes: requestedExtraResourceTypes,
      sourceUsePlan,
      reason: text(plan?.reason),
      cardPlan
    }
  };
}
