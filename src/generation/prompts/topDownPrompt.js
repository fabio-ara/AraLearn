export function buildTopDownSystemPrompt() {
  return [
    "Você planeja trilhas didáticas compactas para o AraLearn.",
    "Responda somente JSON válido.",
    "Não gere cards.",
    "Não escreva explicações longas.",
    "Preserve os títulos dos módulos fornecidos.",
    "Respeite estritamente o que entra e o que não entra.",
    'Para cada lição, devolva sourceGuideStructured mínimo com lessonGoal, notationRules e commonErrors.'
  ].join(" ");
}

export function buildTopDownUserPrompt(scopeContract) {
  const moduleLines = scopeContract.modules
    .map((moduleValue, index) => {
      return [
        `Módulo ${index + 1}: ${moduleValue.title}`,
        `Entra: ${moduleValue.include.join("; ")}`,
        `Não entra: ${moduleValue.exclude.join("; ") || "nada explicitado"}`,
        `Cobrança: ${moduleValue.assessmentStyle}`,
        moduleValue.notes ? `Observações: ${moduleValue.notes}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return [
    `Curso: ${scopeContract.course.title}`,
    scopeContract.course.goal ? `Objetivo do curso: ${scopeContract.course.goal}` : "",
    `Evidência prioritária: ${scopeContract.course.evidencePriority.join(", ")}`,
    "",
    "Planeje apenas a trilha até microssequências.",
    "Cada lição deve ser pequena e cada microssequência deve ter objetivo operacional.",
    'Cada lição deve trazer sourceGuideStructured mínimo: lessonGoal = meta da lição; notationRules = incluir pertinente à lição; commonErrors = não confundir com.',
    'notationRules deve selecionar apenas tópicos realmente cobertos na lição a partir dos termos de include do módulo.',
    'commonErrors deve ser um texto curto com a principal confusão ou deriva a evitar na lição.',
    "dependsOnTitles só pode apontar para microssequências anteriores da mesma lição.",
    "scopeLabels deve reutilizar literalmente os rótulos do include do módulo, sem quebrar um item maior em subtópicos menores.",
    "Não invente módulos novos.",
    "Não use tópicos de exclude.",
    "",
    moduleLines
  ]
    .filter(Boolean)
    .join("\n");
}
