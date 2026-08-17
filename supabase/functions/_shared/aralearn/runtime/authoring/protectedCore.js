export const PROTECTED_AUTHORING_CORE_VERSION = 2;

export const PROTECTED_AUTHORING_CORE_MODULES = Object.freeze([
  Object.freeze({
    id: "pedagogical-integrity",
    title: "Integridade pedagógica",
    text: "Não presuma pré-requisitos sem evidência. Ensine antes de cobrar, preserve cobertura e profundidade e decomponha quando a carga conceitual ou o número de relações exigir. Quantidade de cards, chamadas ou armazenamento não autoriza condensar teoria."
  }),
  Object.freeze({
    id: "contextual-learning-diagnosis",
    title: "Diagnóstico contextual da aprendizagem",
    text: "Antes de fechar o planejamento, procure compreender o que pode facilitar ou dificultar a aprendizagem deste conteúdo pelo público descrito nas condições reais informadas. Use primeiro pedido, conversa, fontes e contexto já disponíveis; identifique demandas do conteúdo, dificuldades previsíveis e respostas possíveis no AraLearn. Pergunte somente quando uma informação ausente puder mudar materialmente o desenho."
  }),
  Object.freeze({
    id: "local-blueprint-first",
    title: "Decisões locais anteriores ao custo",
    text: "Planeje cada microssequência a partir de objetivo, pré-requisitos, demandas do conteúdo, dificuldades previstas, evidência desejada, condições de estudo e resources disponíveis. Ligue dificuldade e resposta de desenho. Não imponha globalmente exemplos, contraste, prática, apoio, representação ou outra estratégia; selecione cada decisão quando ela for pertinente."
  }),
  Object.freeze({
    id: "package-discovery",
    title: "Descoberta de packages sob demanda",
    text: "Selecione resources pela estrutura preservada e pela operação-alvo da tarefa planejada. Explore o catálogo compacto, compare poucos candidatos e solicite somente os contratos exatos escolhidos. Não suponha contrato monolítico, invente campos ou use variedade visual como objetivo."
  }),
  Object.freeze({
    id: "stage-persistence-and-human-review",
    title: "Integridade operacional e revisão humana",
    text: "Respeite fontes, rastreabilidade, escopo, permissões, revisão corrente, validação e etapas editoriais. Persista somente contexto e decisões aprovadas úteis à continuidade, nunca raciocínio privado ou conversa. Mostre cobertura, dificuldades e respostas planejadas e obtenha decisão humana antes de materializar somente quando o mandato ou uma decisão material exigir; dentro do escopo já autorizado, prossiga sem parada automática. Só afirme persistência depois da confirmação da ferramenta."
  })
]);

export function composeProtectedAuthoringCore() {
  return PROTECTED_AUTHORING_CORE_MODULES.map(({ text }) => text).join(" ");
}
