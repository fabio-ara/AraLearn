const OPERATIONS = new Set(["replace_resource", "add_resource", "rewrite_text", "split_card", "remove_resource", "reorder_cards"]);

export function validateMicrosequenceEditPlan(plan, editPlanningContract) {
  const errors = [];
  const cardKeys = new Set((editPlanningContract?.currentVersion?.cardsSummary || []).map((item) => item.key));
  const resourceIds = new Set(
    (editPlanningContract?.representation?.availableResources || editPlanningContract?.availableResources || []).map((item) => item.id)
  );
  const versionIds = new Set((editPlanningContract?.versionHistory || editPlanningContract?.previousVersionsSummary || []).map((item) => item.versionId));
  const selectedCardKeys = new Set(editPlanningContract?.request?.selectedCardKeys || []);

  (plan?.affectedCards || []).forEach((key) => {
    if (!cardKeys.has(key)) errors.push(`Card afetado inexistente: ${key}.`);
  });
  (plan?.requiredResourceTypes || []).forEach((resourceId) => {
    if (!resourceIds.has(resourceId)) errors.push(`Recurso requerido inexistente: ${resourceId}.`);
  });
  (plan?.operations || []).forEach((operation) => {
    if (!OPERATIONS.has(operation?.operation)) errors.push(`Operação desconhecida: ${operation?.operation || ""}.`);
    if (operation?.cardKey && !cardKeys.has(operation.cardKey)) errors.push(`Operação aponta card inexistente: ${operation.cardKey}.`);
  });
  (plan?.previousVersionIdsToLoad || []).forEach((versionId) => {
    if (!versionIds.has(versionId)) errors.push(`Versão anterior inexistente: ${versionId}.`);
  });
  (editPlanningContract?.request?.userSelectedExtraResourceTypes || []).forEach((resourceId) => {
    if (!(plan?.requiredResourceTypes || []).includes(resourceId)) errors.push(`Recurso extra do usuário não preservado: ${resourceId}.`);
  });
  selectedCardKeys.forEach((cardKey) => {
    if (!(plan?.affectedCards || []).includes(cardKey)) {
      errors.push(`Card selecionado pelo usuário não preservado em affectedCards: ${cardKey}.`);
    }
  });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      editScope: ["selected_cards", "current_version", "whole_microsequence"].includes(plan?.editScope) ? plan.editScope : "current_version",
      affectedCards: Array.isArray(plan?.affectedCards) ? plan.affectedCards : [],
      operations: Array.isArray(plan?.operations) ? plan.operations : [],
      requiredResourceTypes: Array.isArray(plan?.requiredResourceTypes) ? plan.requiredResourceTypes : [],
      requiresFullPreviousVersion: plan?.requiresFullPreviousVersion === true,
      previousVersionIdsToLoad: Array.isArray(plan?.previousVersionIdsToLoad) ? plan.previousVersionIdsToLoad : [],
      reason: String(plan?.reason || "").trim()
    }
  };
}
