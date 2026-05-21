export function buildPracticePrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido adicional: ${request}` : "",
    "Amplie a prática do mesmo objetivo.",
    "Mantenha vocabulário, dependências declaradas e escopo local.",
    "Gere variações autossuficientes com o contexto necessário no próprio card.",
    "Aumente aplicação, correção, contraste ou retomada sem abrir assunto novo.",
    "Termine reconectando a prática ao objetivo já planejado."
  ]
    .filter(Boolean)
    .join("\n");
}
