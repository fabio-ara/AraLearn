import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { buildDeterministicCardPlan } from "./buildDeterministicCardPlan.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function fail(errors) {
  return { ok: false, errors };
}

export function validateMicrosequencePlan(plan, planningContract) {
  const errors = [];
  const requestedType = text(plan?.type);
  const requestedSize = text(plan?.size);
  const type = getMicrosequenceType(requestedType);
  const size = getMicrosequenceSize(requestedSize);
  const availableTypes = new Set((planningContract?.availableTypes || []).map((item) => text(item?.id || item)));
  const availableSizes = new Set((planningContract?.availableSizes || []).map((item) => text(item?.id || item)));
  const availableResources = new Set((planningContract?.availableResources || []).map((item) => text(item?.id || item)));
  const availableSourceIds = new Set((planningContract?.sources || []).map((item) => text(item?.id || item?.sourceId)));
  const selectedExtraResources = unique(plan?.extraResources);
  const selectedSources = unique(plan?.sources);

  if (!type || !availableTypes.has(requestedType)) {
    errors.push(`type inválido: ${requestedType || "vazio"}.`);
  }
  if (!size || !availableSizes.has(requestedSize)) {
    errors.push(`size inválido: ${requestedSize || "vazio"}.`);
  }
  selectedExtraResources.forEach((resourceId) => {
    if (!availableResources.has(resourceId)) {
      errors.push(`resource inexistente no plano: ${resourceId}.`);
    }
  });
  selectedSources.forEach((sourceId) => {
    if (!availableSourceIds.has(sourceId)) {
      errors.push(`Fonte inexistente no plano: ${sourceId}.`);
    }
  });

  const didacticPlan = type && size
    ? buildDeterministicCardPlan({
        type: requestedType,
        size: requestedSize,
        packet: {
          goal: text(plan?.goal),
          userRequest: planningContract?.request?.prompt,
          currentMicrosequence: planningContract?.microsequence || {}
        }
      })
    : [];

  if (size && didacticPlan.length !== size.cardCount) {
    errors.push("didacticPlan determinístico com quantidade incorreta.");
  }

  if (errors.length) {
    return fail(errors);
  }

  return {
    ok: true,
    plan: {
      type: requestedType,
      size: requestedSize,
      goal: text(plan?.goal),
      extraResources: selectedExtraResources,
      sources: selectedSources,
      reason: text(plan?.reason),
      didacticPlan
    }
  };
}
