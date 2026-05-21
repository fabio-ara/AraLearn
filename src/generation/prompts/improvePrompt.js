export function buildImprovePrompt(packet, reason = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    reason ? `Motivo da reescrita: ${reason}` : "",
    "Reescreva a microssequência inteira preservando o objetivo e a trilha.",
    "Substitua integralmente cards fallback, genéricos ou com placeholders por material final pronto para o aluno.",
    "Não mantenha trechos como 'outro elemento', 'um detalhe lateral', 'Nesta etapa, Explicar que' ou 'Pedir que o estudante'.",
    "Respeite module.exclude como limite rígido e remova qualquer menção a termos excluídos.",
    "Reduza sobrecarga didática por card.",
    "Distribua melhor explicação, exemplo, prática, correção e fechamento.",
    "Ajuste resourceTypes ao plano didático e mantenha práticas autossuficientes com enunciado, dados, resposta esperada curta e critério de conferência.",
    "Não avance para o próximo assunto."
  ]
    .filter(Boolean)
    .join("\n");
}
