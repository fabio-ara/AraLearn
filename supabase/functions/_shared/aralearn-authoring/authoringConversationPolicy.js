const FOCAL_MATERIALIZATION_TASKS = new Set([
  "preparar_materializacao",
  "materializar_parte"
]);

export function normalizeNaturalAuthoringArguments(taskName, rawArguments) {
  if (!FOCAL_MATERIALIZATION_TASKS.has(taskName) ||
      rawArguments?.concluir !== undefined) return rawArguments;
  return { ...rawArguments, concluir: false };
}

export function materializationConversationProjection(error, preflight = null) {
  if (!preflight && error?.code !== "human_materialization_contextual_calibration_required") {
    return null;
  }
  return {
    message: "Ainda há uma dependência a resolver antes de produzir este conteúdo.",
    nextDecision: "Resolva autonomamente tudo que já estiver determinado pelo curso. Só peça ajuda se faltar uma decisão pedagógica ou autoral genuína; nesse caso, consolide pendências equivalentes, explique o que depende dessa escolha e por que ela importa para a aprendizagem, e faça uma única pergunta compreensível."
  };
}
