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
    "Devolva obrigatoriamente: title, goal, supportReason, summary e cards.",
    "Os cards devem ser autossuficientes e terminar com ponte explícita de retorno ao objetivo original da trilha.",
    "Prefira say e block_gap_fill; use table só quando ela realmente simplificar a explicação."
  ]
    .filter(Boolean)
    .join("\n");
}
