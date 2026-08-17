export const RESOURCE_SELECTION_POLICY = Object.freeze({
  contract: "aralearn.resource-selection-policy.v1",
  decision: "Escolha ou crie um package especializado somente quando uma representação mais simples perder a estrutura necessária à operação-alvo da tarefa.",
  interpretability: "A forma deve tornar a relação relevante direta e previsível; se a pessoa precisar decifrar a interface ou consultar uma legenda distante, escolha outra representação ou decomponha o conteúdo.",
  theoryDensity: "Em teoria, preserve um foco conceitual identificável e distribua fundamentos, relações e exemplos conforme a progressão necessária; não use um resource para condensar assuntos.",
  practiceContext: "Em prática, mantenha no card todos os dados do caso e somente a complexidade necessária à operação-alvo principal da tarefa, ainda que a representação seja rica.",
  selectionEvidence: Object.freeze([
    "estrutura que precisa ser preservada",
    "operação-alvo exigida pela tarefa",
    "convenção acadêmica pertinente",
    "modalidade de resposta compatível"
  ])
});
