export function buildSupportPrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido do usuário: ${request}` : "",
    "Crie uma microssequência de suporte para uma lacuna local.",
    "Explique apenas o pré-requisito necessário para retomar o ponto atual.",
    "Não replaneje a lição inteira.",
    "Não abra um escopo paralelo.",
    "Termine com ponte explícita de retorno ao objetivo original da trilha."
  ]
    .filter(Boolean)
    .join("\n");
}
