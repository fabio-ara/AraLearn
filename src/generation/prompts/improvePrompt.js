export function buildImprovePrompt(packet, reason) {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    `Motivo da melhoria: ${reason}`,
    "Reescreva a microssequência inteira, sem mudar o tópico nem avançar a trilha.",
    "Entregue uma versão melhor, com progressão mais clara.",
    "Não pressuponha conhecimento fora das dependências explícitas e preserve a aderência à trilha planejada."
  ].join("\n");
}
