export function buildImprovePrompt(packet, reason = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    reason ? `Motivo da reescrita: ${reason}` : "",
    "Reescreva a microssequência inteira preservando o objetivo e a trilha.",
    "Reduza sobrecarga didática por card.",
    "Distribua melhor explicação, exemplo, prática, correção e fechamento.",
    "Ajuste resourceTypes ao plano didático e mantenha práticas autossuficientes.",
    "Não avance para o próximo assunto."
  ]
    .filter(Boolean)
    .join("\n");
}
