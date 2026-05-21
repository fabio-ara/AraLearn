function listMetadatas() {
  return [
    "didacticKind",
    "practiceMode",
    "representationNeed",
    "dependencyPolicy",
    "coverageRole",
    "expectedEvidence"
  ].join(", ");
}

export function buildTopDownSystemPrompt() {
  return [
    "Você planeja trilhas didáticas progressivas para o AraLearn.",
    "Responda somente JSON válido.",
    "Planeje apenas até microssequências. Não gere cards.",
    "Preserve os módulos recebidos.",
    "Preserve o escopo declarado por include e exclude.",
    "Declare dependências apenas para microssequências anteriores da mesma lição.",
    "Distribua explicação, prática, revisão e suporte por etapas quando o objetivo exigir aplicação.",
    "Use metadados didáticos genéricos por microssequência:",
    listMetadatas() + ".",
    "Evite compressão excessiva. Quando o conteúdo for amplo, decomponha em mais microssequências."
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
    "Planeje uma trilha progressiva até microssequências.",
    "Cada lição deve ter progressão coerente e cada microssequência deve ter função didática clara.",
    "Cada microssequência deve trazer goal, dependsOnTitles, scopeLabels e, quando útil, os metadados didáticos genéricos.",
    "expectedEvidence deve listar evidências observáveis de aprendizagem em frases curtas.",
    "Preserve o escopo declarado e não invente módulos novos.",
    "Evite empacotar tópicos demais em uma única microssequência.",
    "Indique coverageRole como introduce, explain, practice, review, repair_gap ou extend_practice conforme a função na trilha.",
    "Quando houver aplicação, distribua prática por etapas em vez de resumir tudo no goal.",
    "sourceGuideStructured deve continuar mínimo, editorial e voltado ao leitor.",
    "",
    moduleLines
  ]
    .filter(Boolean)
    .join("\n");
}
