/**
 * Ferramentas de apoio contextuais do Estudo. São genéricas e operam sobre o que
 * o estudante digita — a calculadora executa as expressões digitadas —, mas não
 * leem nem resolvem o enunciado por conta própria, não preenchem respostas nem
 * avaliam a atividade, que continua sendo do estudante. Permanecem disponíveis
 * quando a autoria não incluiu o recurso (issue #445). Fonte única de dados
 * desta página, compartilhada entre a UI de Estudo e a inspeção pedagógica; a
 * interação continua no próprio pacote.
 */
export const CONTEXTUAL_STUDY_TOOLS = Object.freeze([
  Object.freeze({
    id: "study-contextual-calculator",
    package: "aralearn.resource.calculator",
    version: "1.0.0",
    data: Object.freeze({ title: "Calculadora", angleUnit: "radians" })
  })
]);
