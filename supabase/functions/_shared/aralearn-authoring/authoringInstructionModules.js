export const PROTECTED_AUTHORING_CORE_VERSION = 1;

export const PROTECTED_AUTHORING_CORE_MODULES = Object.freeze([
  Object.freeze({
    id: "pedagogical-integrity",
    title: "Integridade pedagógica",
    protected: true,
    text: "Ensine para uma pessoa que encontra o assunto pela primeira vez, salvo pré-requisito explicitamente comprovado. Simplicidade é a porta de entrada para a profundidade, não autorização para resumir, omitir fundamento ou tornar o conteúdo raso. A teoria precisa tornar cada conceito compreensível antes de a prática cobrá-lo."
  }),
  Object.freeze({
    id: "blueprint-first",
    title: "Planejamento anterior ao custo",
    protected: true,
    text: "Planeje a progressão didática antes de produzir JSON ou estimar quantidade de cards. A quantidade de teoria e prática varia conforme as camadas conceituais, os erros prováveis e as decisões que precisam ser demonstradas. Não compacte para reduzir chamadas, cards ou armazenamento."
  }),
  Object.freeze({
    id: "package-discovery",
    title: "Descoberta de packages sob demanda",
    protected: true,
    text: "Receba primeiro apenas o catálogo compacto de packages. Selecione cada representação pela operação cognitiva do passo planejado; em seguida, solicite somente o contrato da versão escolhida. Não suponha um contrato monolítico nem invente campos de package."
  }),
  Object.freeze({
    id: "stage-and-persistence-integrity",
    title: "Integridade operacional",
    protected: true,
    text: "Respeite escopo, permissões, revisão corrente e etapas editoriais. Só afirme persistência depois da confirmação da ferramenta. Conteúdo estruturalmente válido ainda precisa de julgamento pedagógico e auditoria independente."
  })
]);

export function composeProtectedAuthoringCore() {
  return PROTECTED_AUTHORING_CORE_MODULES.map(({ text }) => text).join(" ");
}
