function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildCourseForgePolicyPack() {
  return [
    "Contrato didático AraLearn:",
    "- O aluno vê curso, não mecanismo de autoria: não exponha app, editor, pipeline, prompt, JSON, sourceGuide, domainMap, auditoria, fonte, PDF ou acervo no texto final dos cards.",
    "- A unidade didática é a microssequência: cada uma deve ter função nova, microescopo claro e cadeia microteoria -> exemplo guiado -> prática autossuficiente -> consolidação.",
    "- sourceGuideStructured governa meta, notação e confusões prováveis da lição; o pedido do usuário especializa o recorte, mas não substitui a governança.",
    "- domainMap, domainRefs e practiceVariantRefs são contrato de cobertura, não decoração; itens centrais precisam de explicação, prática, variação e retorno cumulativo.",
    "- Todo card deve ser autossuficiente: contexto crítico, dados, regras, fórmulas, critérios, código, tabela ou convenção necessários ficam no próprio card.",
    "- Explique siglas, termos técnicos, palavras em inglês e notação antes de cobrar uso; em programação, apresente forma técnica, tradução funcional e efeito operacional.",
    "- Em conteúdo operacional, comandos, terminal ou linguagem de programação, a prática deve cobrir reconhecimento, leitura, produção guiada, combinação, sequência, erro frequente e revisão cumulativa.",
    "- Use imagem só quando o conteúdo não couber melhor em container público textual, tabela, fluxograma, montagem, editor de código, plano ou matriz.",
    "- Lacunas devem ser atômicas ou quase atômicas; não peça frase, linha, bloco, comando longo ou condição composta em uma única lacuna.",
    "- Se surgir dúvida local ou reforço bottom-up, responda a dúvida e reconecte explicitamente à trilha didática planejada."
  ].join("\n");
}

export function buildCourseForgePrompt({
  role = "",
  sourcePack = "",
  policyPack = "",
  task = "",
  output = ""
} = {}) {
  return [
    `ROLE:\n${text(role)}`,
    `CONTENT RULE:\nUse somente SOURCE PACK, artefatos anexos da fase e pedido explícito do usuário como base. Não invente conteúdo externo sem marcar como inferência ou lacuna.`,
    `SOURCE PACK:\n${text(sourcePack) || "(sem fontes adicionais)"}`,
    `POLICY PACK:\n${text(policyPack) || buildCourseForgePolicyPack()}`,
    `TASK:\n${text(task)}`,
    `OUTPUT:\n${text(output) || "Responda somente JSON válido."}`
  ].join("\n\n");
}
