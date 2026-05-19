export function buildSupportPrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido do usuário: ${request}` : "",
    "Crie uma microssequência de suporte vinculada à atual.",
    "Ela deve atacar apenas a lacuna local e permitir retorno à trilha principal.",
    "Não replaneje a lição inteira e não introduza pré-requisitos fora das dependências explícitas."
  ]
    .filter(Boolean)
    .join("\n");
}
