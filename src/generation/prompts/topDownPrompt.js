export function buildTopDownSystemPrompt() {
  return [
    "Você receberá um contrato JSON.",
    "Devolva somente JSON válido no formato pedido.",
    "Nunca mencione itens de exclude em guide, lessons ou microsequences, nem como contraste negativo.",
    "Copie strings de include e exclude exatamente como aparecem no contrato, sem reescrever, sem acentuar de outro modo e sem criar sinônimos."
  ].join(" ");
}

export function buildTopDownUserPrompt(scopeContract) {
  return JSON.stringify({
    task: "plan_course",
    language: "pt-BR",
    scope: scopeContract,
    rules: [
      "Do not generate cards.",
      "Plan only modules, lessons and microsequences.",
      "Stay strictly inside scope.include.",
      "Do not silently drop include items.",
      "Distribute every include item across lessons and microsequences.",
      "Use exclude only as a hard boundary.",
      "Do not invent new topics, aliases, paraphrases or broader subareas outside include.",
      "Use guide.include and microsequence.covers only with exact strings taken from include.",
      "Copy include and exclude strings exactly as written in scope, character by character.",
      "If one include item needs more than one step, repeat the same include string instead of creating synonyms.",
      "Do not mention exclude items in guide.goal, guide.notation, guide.avoid, titles, goals or covers.",
      "Do not use exclude items as contrast, warning, comparison or preview.",
      "Module guide.goal must describe the module itself, not restate the user's raw request or course-wide prompt.",
      "Keep each lesson local to the allowed include items.",
      "dependsOn is local to each lesson.",
      "Each microsequence may depend only on titles declared earlier inside the same lesson.",
      "Never point dependsOn to titles from another lesson, another module or a future microsequence."
    ]
  });
}
