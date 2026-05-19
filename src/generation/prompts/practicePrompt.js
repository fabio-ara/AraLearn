export function buildPracticePrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido adicional: ${request}` : "",
    "Adicione prática dentro da mesma microssequência.",
    "Não introduza o próximo assunto.",
    "Varie reconhecimento, aplicação, contraste, lacuna e consolidação.",
    "Não cobre nada além do que já foi explicitado nesta microssequência ou em suas dependências."
  ]
    .filter(Boolean)
    .join("\n");
}
