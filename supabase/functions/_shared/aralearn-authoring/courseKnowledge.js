const INVARIANTS_URI = "aralearn://authoring/invariants";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Leia o Curso antes de alterá-lo e envie sempre a versão de estado recebida.",
  "Leia o plano instrucional persistido antes de replanejar; preserve os ids dos itens e das Partes e envie também a versão do plano.",
  "Inspecione Unidades de estudo pela vista paginada study_units, no escopo curricular ou de Parte necessário; use os links exatos e não carregue a composição inteira para revisar conteúdo.",
  "Plano instrucional, itens, Partes, vínculos e materializações pertencem ao estado persistido do Curso; não os fixe no prompt.",
  "Leia course_design no escopo exato antes de decidir ou materializar: valores locais, herdados, origem, orientação e regra de componentes são fatos persistidos e versionados.",
  "Antes de materializar uma Microssequência, leia targetPlanItems e desenvolva somente as unidades de análise e os requisitos de evidência atribuídos ao alvo; altere essa atribuição explicitamente quando o plano exigir outro recorte.",
  "A orientação original nunca é substituída por interpretação automática: grave a interpretação estruturada na revisão corrente e preserve divergências e perguntas.",
  "Limpar parâmetro, orientação ou regra remove somente a decisão local e restaura a herança explícita; não copie o valor herdado como novo valor local.",
  "Fontes, observações e configuração de pesquisa só existem quando uma ferramenta corrente os expõe como fatos persistidos; não os suponha nem os invente.",
  "Use as ferramentas para observar ou modificar fatos. Não invente conteúdo, fontes, resultados, permissões ou estado de materialização.",
  "Uma Parte de autoria é um agrupamento operacional configurável; não é nível da hierarquia didática.",
  "Materialize uma Parte por etapas pequenas: inicie sem declarar designContext, use o contexto selado devolvido pelo servidor e registre designApplication factual com o contextHash somente ao concluir etapa didática; declare null em context_load, validation ou falha.",
  "Uma tentativa interrompida é retomada pelo estado persistido; não reconstrua progresso pela conversa nem anuncie conteúdo que não foi gravado.",
  "Ao corrigir conteúdo, altere somente a Unidade de estudo ou o segmento delimitado que realmente mudou e preserve identidades e posições não afetadas.",
  "Use consultarComponentesDidaticos progressivamente: explore ou pesquise, inspecione candidatos e carregue apenas o contrato necessário.",
  "Ao concluir uma operação, informe brevemente o que mudou, qual conteúdo foi afetado e que incerteza ainda exige decisão humana."
].join("\n");

const INVARIANTS = Object.freeze({
  uri: INVARIANTS_URI,
  name: "Invariantes da autoria",
  title: "Invariantes da autoria do AraLearn",
  description: "Regras estáveis para operar sobre o Curso vivo e suas ferramentas.",
  mimeType: "text/markdown",
  text: `# Invariantes da autoria\n\n${COURSE_AUTHORING_SERVER_INSTRUCTIONS}\n`
});

export function listCourseAuthoringKnowledgeResources() {
  return [structuredClone({
    uri: INVARIANTS.uri,
    name: INVARIANTS.name,
    title: INVARIANTS.title,
    description: INVARIANTS.description,
    mimeType: INVARIANTS.mimeType
  })];
}

export function readCourseAuthoringKnowledgeResource(uri) {
  return String(uri || "") === INVARIANTS_URI
    ? structuredClone(INVARIANTS)
    : null;
}
