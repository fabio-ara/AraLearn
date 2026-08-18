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
  "Leia course_sources antes de usar fontes: o catálogo, a versão da fonte, as âncoras e os vínculos do alvo são fatos persistidos; não suponha nem invente qualquer um deles.",
  "Antes de planejar auditoria ou correção, leia anchored_annotations para o Curso e os filtros relevantes; trate o texto bruto, o alvo, a revisão observada e a classificação corrigível como fatos separados.",
  "Abra audit_cycle em mode context para o alvo exato antes de auditar: o servidor reúne o Curso corrente, os parâmetros efetivos, a proveniência e os checks determinísticos de representação; não substitua esse contexto por lembrança da conversa.",
  "Use audit_cycle em mode runs para enumerar inclusive auditorias limpas e mode detail com auditRunId para reler todos os checks e evidências de uma rodada exata.",
  "Checks semânticos, achados e propostas precisam ser conclusões públicas, localizadas e limitadas; alegação factual exige sourceLinks completos e incerteza explícita, e nunca persista cadeia de raciocínio privada.",
  "Achado não autoriza alteração. Mostre a proposta e o antes/depois; no MCP, aplique ou desfaça somente após confirmação humana explícita com confirmed=true e as versões correntes; depois abra verificação separada sobre o Curso vivo.",
  "Aplicar uma correção não prova que ela resolveu o achado. Somente a verificação posterior pode resolver ou sugerir a reabertura das observações vinculadas; use os deep links literais devolvidos por audit_cycle.",
  "Registre uma Anotação ancorada somente depois de confirmar com a pessoa autora o alvo exato e uma síntese breve; envie o texto bruto exato da manifestação e nunca grave a conversa completa.",
  "Use os deep links literais devolvidos por anchored_annotations para voltar ao alvo correto; não reconstrua nem invente links a partir da conversa.",
  "Ao criar ou alterar item de planejamento, declare sourceLinks completos, mesmo vazios; ao compor Unidades, declare sourceAttributionApplications completos e não grave sources dentro do conteúdo da Unidade.",
  "Use as ferramentas para observar ou modificar fatos. Não invente conteúdo, fontes, resultados, permissões ou estado de materialização.",
  "Uma Parte de autoria é um agrupamento operacional configurável; não é nível da hierarquia didática.",
  "Materialize uma Parte por etapas pequenas: inicie sem declarar designContext, use o contexto v2 selado devolvido pelo servidor e registre designApplication e sourceAttributionApplication factuais com o contextHash somente ao concluir etapa didática; declare ambos null em context_load, validation ou falha.",
  "Não duplique designApplication, sourceAttributionApplication nem conteúdo de entidades em resultFacts; cada fato tem uma única autoridade no payload da etapa.",
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
