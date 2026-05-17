import { listPromptPackGuardrails } from "../config/promptPackRegistry.js";
import { buildDidacticProductionPolicy } from "../policies/didacticProductionPolicy.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLessonGuidance(lessonGuidance = {}, lessonSourceGuideStructured = {}) {
  return {
    ...structuredClone(lessonGuidance || {}),
    sourceGuideStructured: structuredClone(lessonSourceGuideStructured || lessonGuidance?.sourceGuideStructured || {})
  };
}

export function buildCourseForgePolicyPack({
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  lessonDomainMap = {},
  studyTrackPolicy = {},
  engineProfile = {}
} = {}) {
  const normalizedLessonGuidance = normalizeLessonGuidance(lessonGuidance, lessonSourceGuideStructured);
  const productionPolicy = buildDidacticProductionPolicy({
    weakModelMode: true,
    lessonGuidance: normalizedLessonGuidance,
    lessonSourceGuideStructured: normalizedLessonGuidance.sourceGuideStructured || {},
    lessonDomainMap,
    studyTrackPolicy,
    engineProfile
  });
  const registryGuardrails = listPromptPackGuardrails("courseForge", engineProfile);

  return [
    "Contrato didático AraLearn:",
    `- Perfil-alvo obrigatório: ${productionPolicy.targetStudentProfile}.`,
    `- Arquitetura de produção: ${productionPolicy.productionArchitecture}; a LLM não decide sozinha o percurso.`,
    "- O aluno vê curso, não mecanismo de autoria: não exponha app, editor, pipeline, prompt, JSON, sourceGuide, domainMap, auditoria, fonte, PDF ou acervo no texto final dos cards.",
    `- A unidade didática é a microssequência: ${productionPolicy.microsequencePrinciple}.`,
    `- A cadeia preferida de produção é ${productionPolicy.exhaustiveCardSequence.steps.join(" -> ")}.`,
    "- sourceGuideStructured governa meta, notação e confusões prováveis da lição; o pedido do usuário especializa o recorte, mas não substitui a governança.",
    "- domainMap, domainRefs e practiceVariantRefs são contrato de cobertura, não decoração; itens centrais precisam de explicação, prática, variação e retorno cumulativo.",
    "- Todo card deve ser autossuficiente: contexto crítico, dados, regras, fórmulas, critérios, código, tabela ou convenção necessários ficam no próprio card.",
    "- Explique siglas, termos técnicos, palavras em inglês e notação antes de cobrar uso; em programação, apresente forma técnica, tradução funcional e efeito operacional.",
    "- Em conteúdo operacional, comandos, terminal ou linguagem de programação, a prática deve cobrir reconhecimento, leitura, produção guiada, combinação, sequência, erro frequente e revisão cumulativa.",
    "- Use imagem só quando o conteúdo não couber melhor em container público textual, tabela, fluxograma, montagem, editor de código, plano ou matriz.",
    "- Lacunas devem ser atômicas ou quase atômicas; não peça frase, linha, bloco, comando longo ou condição composta em uma única lacuna.",
    "- A microssequência não pode depender de pressuposto oculto; o que ela usar já deve ter sido explicitado antes ou no próprio card.",
    "- Se surgir dúvida local ou reforço bottom-up, responda a dúvida e reconecte explicitamente à trilha didática planejada.",
    ...registryGuardrails.map((entry) => `- Registry: ${entry}.`)
  ].join("\n");
}

export function buildCourseForgePrompt({
  role = "",
  sourcePack = "",
  policyPack = "",
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  lessonDomainMap = {},
  studyTrackPolicy = {},
  engineProfile = {},
  task = "",
  output = ""
} = {}) {
  return [
    `ROLE:\n${text(role)}`,
    `CONTENT RULE:\nUse somente SOURCE PACK, artefatos anexos da fase e pedido explícito do usuário como base. Não invente conteúdo externo sem marcar como inferência ou lacuna.`,
    `SOURCE PACK:\n${text(sourcePack) || "(sem fontes adicionais)"}`,
    `POLICY PACK:\n${
      text(policyPack) ||
      buildCourseForgePolicyPack({
        lessonGuidance,
        lessonSourceGuideStructured,
        lessonDomainMap,
        studyTrackPolicy,
        engineProfile
      })
    }`,
    `TASK:\n${text(task)}`,
    `OUTPUT:\n${text(output) || "Responda somente JSON válido."}`
  ].join("\n\n");
}
