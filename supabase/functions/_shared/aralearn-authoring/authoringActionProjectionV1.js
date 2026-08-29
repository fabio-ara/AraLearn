export const AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS = Object.freeze([
  Object.freeze({
    path: "/add_plan_item",
    operationId: "add_plan_item",
    canonicalToolName: "alterarCurso",
    operation: "update_instructional_plan",
    commandProperty: "planCommand",
    commandType: "add_plan_item",
    title: "Adicionar item ao plano",
    description:
      "Adiciona um item formal ao plano instrucional. Use os controles estruturados silenciosamente e descreva à pessoa o efeito pedagógico e os vínculos de Fontes."
  }),
  Object.freeze({
    path: "/update_plan_item",
    operationId: "update_plan_item",
    canonicalToolName: "alterarCurso",
    operation: "update_instructional_plan",
    commandProperty: "planCommand",
    commandType: "update_plan_item",
    title: "Atualizar item do plano",
    description:
      "Atualiza um item formal do plano instrucional. Use os controles estruturados silenciosamente e descreva à pessoa o efeito pedagógico e os vínculos de Fontes."
  })
]);

const AUTHORING_ACTION_V1_PROJECTION_BY_OPERATION_ID = new Map(
  AUTHORING_ACTION_V1_DEDICATED_PROJECTIONS.map((projection) => [
    projection.operationId,
    projection
  ])
);

export function authoringActionV1DedicatedProjection(operationId) {
  return AUTHORING_ACTION_V1_PROJECTION_BY_OPERATION_ID.get(operationId) || null;
}
