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
    "Itens de exclude são proibidos: não os use em títulos, metas, exemplos, commonErrors ou microssequências, nem como contraste negativo.",
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
    "Cubra cada item de 'Entra' em ao menos uma microssequência; nenhum item do include pode ficar sem scopeLabels correspondentes.",
    "Em cada lição, sourceGuideStructured.notationRules (campo \"Incluir\") deve conter uma lista separada por vírgulas com pelo menos um item copiado literalmente de 'Entra' (include) do módulo; idealmente liste exatamente os itens tratados naquela lição.",
    "expectedEvidence deve listar evidências observáveis de aprendizagem em frases curtas.",
    "Preserve o escopo declarado e não invente módulos novos.",
    "Não mencione itens de 'Não entra' fora do campo outOfScopeRules; não use esses termos nem para dizer que não serão tratados.",
    "Evite empacotar tópicos demais em uma única microssequência.",
    "Indique coverageRole como introduce, explain, practice, review, repair_gap ou extend_practice conforme a função na trilha.",
    "Quando um tópico pedir treino, abra etapas de prática ou consolidação em vez de comprimir tudo numa única exposição.",
    "Quando houver aplicação, distribua prática por etapas em vez de resumir tudo no goal.",
    "sourceGuideStructured deve continuar mínimo, editorial e voltado ao leitor.",
    "",
    moduleLines
  ]
    .filter(Boolean)
    .join("\n");
}
