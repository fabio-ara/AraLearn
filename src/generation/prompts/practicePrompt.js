export function buildPracticePrompt(packet, request = "") {
  return [
    "Contexto da microssequência:",
    JSON.stringify(packet, null, 2),
    "",
    request ? `Pedido adicional: ${request}` : "",
    "Amplie a prática do mesmo objetivo.",
    "Mantenha vocabulário, dependências declaradas e escopo local.",
    "Não mencione termos listados em module.exclude, nem como contraste negativo.",
    "Gere variações autossuficientes com enunciado concreto, dados do exercício, resposta esperada curta e critério de conferência no próprio card.",
    "Varie os formatos de prática: classificação, lacuna, verdadeiro/falso corrigido, mini-caso, ordenação simples e explicação em uma frase quando couber.",
    "Não repita o mesmo enunciado, a mesma lacuna ou o mesmo molde de card já existente.",
    "Não escreva instruções internas como 'pedir que o estudante' nem placeholders como 'outro elemento' ou 'um detalhe lateral'.",
    "Aumente aplicação, correção, contraste ou retomada sem abrir assunto novo.",
    "Termine reconectando a prática ao objetivo já planejado."
  ]
    .filter(Boolean)
    .join("\n");
}
