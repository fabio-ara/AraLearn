function serialize(value) {
  return JSON.stringify(value, null, 2);
}

function listLines(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function formatRolePlan(cardPlan = []) {
  return (Array.isArray(cardPlan) ? cardPlan : [])
    .map((item) => {
      const position = Number(item?.position) || "?";
      const role = typeof item?.role === "string" ? item.role.trim() : "step";
      const resourceType = typeof item?.resourceType === "string" ? item.resourceType.trim() : "say";
      const purpose = typeof item?.purpose === "string" ? item.purpose.trim() : "";
      const evidence = listLines(item?.expectedEvidence);
      return [
        `- posição ${position}: ${role} com ${resourceType}`,
        purpose ? `  propósito: ${purpose}` : "",
        evidence.length ? `  evidências: ${evidence.join("; ")}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function buildBottomUpDraftSystemPrompt() {
  return [
    "Você planeja a didática de uma única microssequência do AraLearn antes da compilação final.",
    "Responda somente JSON válido.",
    "Não gere o JSON final de cards nesta fase.",
    "Planeje uma sequência progressiva e autossuficiente.",
    "Explique antes de cobrar uso quando o conteúdo for novo.",
    "Distribua prática, variação e retomada quando houver evidência de aplicação.",
    "Use apenas dependências declaradas e preserve a trilha planejada.",
    "Escolha resourceType pela função didática de cada etapa, não por disciplina.",
    "Se o conteúdo pedir mais cobertura do que cabe bem em uma única chamada, sinalize continuação em vez de comprimir demais."
  ].join(" ");
}

export function buildBottomUpDraftUserPrompt(packet = {}, options = {}) {
  const fallbackPlan = Array.isArray(options?.fallbackPlan) ? options.fallbackPlan : [];
  return [
    "Pacote da microssequência:",
    serialize(packet),
    "",
    "Planeje um didactic draft com etapas pequenas e função didática clara.",
    "Para cada etapa, informe role, resourceType, purpose, inCardContext, usesDependency e expectedEvidence.",
    "coverageNotes deve registrar lacunas, retomadas, distribuição de prática ou necessidade de continuação.",
    "Se precisar de continuação, informe continuationMode como same_microsequence, support_microsequence ou next_microsequence.",
    "Se não precisar continuar, use continuationMode = none.",
    "continuationPrompt deve trazer um rascunho curto e acionável para a próxima iteração quando continuationNeeded for true.",
    fallbackPlan.length
      ? "Se o contexto estiver incompleto, use este plano-base como referência mínima de progressão:"
      : "",
    fallbackPlan.length ? formatRolePlan(fallbackPlan) : ""
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildBottomUpCompileSystemPrompt() {
  return [
    "Você compila uma única microssequência do AraLearn para o JSON final de cards.",
    "Responda somente JSON válido.",
    "Preserve exatamente o formato final esperado pelo frontend.",
    "Siga o didactic draft e o card plan.",
    "Mantenha cada card com função didática reconhecível.",
    "Coloque no próprio card o contexto necessário para responder às práticas.",
    "Use as dependências declaradas apenas quando o draft disser que elas são necessárias.",
    "Se um recurso planejado não couber, use fallback justificável sem mudar o objetivo didático.",
    "Prefira decomposição e continuidade a concentrar muita carga didática no mesmo card."
  ].join(" ");
}

export function buildBottomUpCompileUserPrompt(packet = {}, draft = {}, options = {}) {
  const cardPlan = Array.isArray(options?.cardPlan) ? options.cardPlan : [];
  const schema = options?.schema || null;
  return [
    "Pacote da microssequência:",
    serialize(packet),
    "",
    "Didactic draft:",
    serialize(draft),
    "",
    "Card plan determinístico:",
    serialize(cardPlan),
    "",
    schema ? "Schema final de saída:" : "",
    schema ? serialize(schema) : "",
    "",
    "Compile o JSON final com summary e cards.",
    "Siga positions e resourceTypes do card plan.",
    "Se a microssequência precisar continuar depois desta chamada, deixe isso claro em summary sem abrir novo escopo."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildBottomUpSystemPrompt() {
  return buildBottomUpCompileSystemPrompt();
}

export function buildBottomUpUserPrompt(packet, options = {}) {
  return buildBottomUpDraftUserPrompt(packet, options);
}
