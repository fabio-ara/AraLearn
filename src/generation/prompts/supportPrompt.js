export function buildSupportPrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido do usuário: ${request}` : "",
    "Crie uma microssequência de suporte para uma lacuna local.",
    "Explique apenas o pré-requisito necessário para retomar o ponto atual.",
    "Não mencione termos listados em module.exclude, nem para dizer que não serão tratados.",
    "Não replaneje a lição inteira.",
    "Não abra um escopo paralelo.",
    "Devolva obrigatoriamente: title, goal, supportReason, didacticKind, practiceMode, representationNeed, dependencyPolicy, expectedEvidence, summary e cards.",
    "Preencha metadados didáticos com valores concretos, nunca string vazia; expectedEvidence deve ter pelo menos uma evidência observável.",
    "Os cards devem ser autossuficientes e terminar com ponte explícita de retorno ao objetivo original da trilha.",
    "Gere pelo menos 4 cards: abertura, explicação, duas práticas curtas e fechamento.",
    "As práticas devem consolidar a lacuna local com reconhecimento, classificação ou completar frase; não use tarefas de repetir o título ou o objetivo.",
    "O último card deve dizer explicitamente que a próxima ação é voltar à trilha principal ou ao fluxo principal da microssequência original.",
    "Prefira say e block_gap_fill; use table só quando ela realmente simplificar a explicação."
  ]
    .filter(Boolean)
    .join("\n");
}
