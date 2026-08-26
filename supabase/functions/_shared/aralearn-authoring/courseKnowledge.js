const KNOWLEDGE_BASE_URI = "aralearn://authoring";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Leia somente o recorte necessário antes de alterar e envie as revisões e versões recebidas.",
  "As leituras pertinentes devolvem phaseGuidance focal; use essa orientação na fase corrente, sem fixar plano, desenho, Fontes ou progresso na conversa.",
  "Use as ferramentas para observar ou modificar fatos; não invente conteúdo, Fontes, permissões, resultados nem estado de materialização.",
  "Registre apenas conclusões e evidências públicas, nunca conversa completa, prompt secreto ou raciocínio privado.",
  "Achado não autoriza alteração: proponha, obtenha a confirmação exigida, aplique e verifique separadamente no Curso vivo.",
  "Preserve os deep links literais devolvidos e informe ao final apenas o que mudou e a incerteza ainda aberta."
].join("\n");

export const COURSE_AUTHORING_GUIDES = Object.freeze({
  planning_design: Object.freeze({
    title: "Planejamento e desenho",
    instructions: Object.freeze([
      "Leia instructional_plan antes de replanejar; preserve ids de itens e Partes e a versão do plano.",
      "Leia course_design no escopo exato antes de decidir ou materializar.",
      "Herdar é não manter decisão local. Automático delega a escolha ao AraLearn/GPT, registra o valor resolvido e uma justificativa pública breve. Explícito fixa decisão da autoria ou condição de pesquisa.",
      "Uma Parte é agrupamento operacional configurável, não nível da hierarquia didática."
    ])
  }),
  materialization: Object.freeze({
    title: "Materialização",
    instructions: Object.freeze([
      "Antes de cada Microssequência, use targetPlanItems e produza somente as unidades de análise e requisitos de evidência atribuídos ao alvo.",
      "Inicie sem designContext, use o contexto selado devolvido e, na etapa didática, envie os mesmos ids em entityChanges, designApplication e sourceAttributionApplication.",
      "O servidor confere revisões, pertencimento, unicidade, política de componentes, cobertura e mínimos quantitativos; trate cada falha localizada antes de repetir.",
      "Retome pelo estado persistido e não duplique conteúdo ou aplicações em resultFacts."
    ])
  }),
  sources: Object.freeze({
    title: "Fontes e proveniência",
    instructions: Object.freeze([
      "Leia o catálogo, a revisão da Fonte, as Âncoras e os vínculos do alvo antes de atribuir proveniência.",
      "Registre somente metadados fornecidos ou verificados; explicite lacunas e pergunte em vez de completar por plausibilidade.",
      "citationText identifica a Fonte para pessoas, humanLocator nomeia o local declarado e selector preserva a localização exata.",
      "Não grave Fontes dentro do conteúdo da Unidade; use sourceLinks e sourceAttributionApplication."
    ])
  }),
  inspection: Object.freeze({
    title: "Inspeção contínua",
    instructions: Object.freeze([
      "Inspecione Unidades pela vista paginada no menor escopo curricular pertinente e preserve os deep links devolvidos.",
      "Corrija somente a Unidade ou o segmento que mudou; identidades e posições alheias permanecem estáveis.",
      "Um marcador de desenho só volta ao estado verificado depois de prova focal sobre a revisão e a versão correntes."
    ])
  }),
  audit_repair: Object.freeze({
    title: "Auditoria e reparo",
    instructions: Object.freeze([
      "Abra audit_cycle em mode context para o alvo exato; use mode runs para rodadas inclusive limpas e detail para uma rodada, achado ou correção.",
      "Checks, achados e propostas são conclusões públicas, localizadas e limitadas; alegação factual exige sourceLinks e incerteza explícita.",
      "Mostre a proposta e o antes/depois. Aplicação não prova resolução: somente verificação posterior pode resolver ou reabrir pendências vinculadas."
    ])
  }),
  linguistic_didactic_review: Object.freeze({
    title: "Revisão linguístico-didática focal",
    instructions: Object.freeze([
      "Revise pedagogical_quality e editorial_quality na Microssequência recém-produzida, usando conteúdo renderizável, público e contexto curricular mínimo.",
      "Examine se a microteoria explica em vez de apenas resumir e se novos conceitos progridem de modo compreensível; reduza ou distribua o escopo quando falta desenvolvimento.",
      "Procure usos artificiais de curto/curta, negativas defensivas, metadiscurso, autorreferência e fórmulas como ‘X combina/reúne Y, Z’ usadas no lugar de relações explicadas.",
      "Procure enumerações extensas, empilhamento de conceitos, anglicismos ou decalques, metáforas técnicas inadequadas e terminologia ou sigla sem referente suficiente.",
      "Esses focos não são proibições mecânicas: preserve usos legítimos, registre achados concretos e use o ciclo canônico de proposta, aplicação e verificação."
    ])
  }),
  components: Object.freeze({
    title: "Componentes didáticos",
    instructions: Object.freeze([
      "Explore ou pesquise primeiro, inspecione candidatos e carregue somente o contrato package@version escolhido.",
      "Valide e visualize a Unidade antes de gravá-la; a política de componentes efetiva continua sendo conferida no servidor."
    ])
  })
});

function guideResource([key, guide]) {
  return Object.freeze({
    uri: `${KNOWLEDGE_BASE_URI}/${key.replaceAll("_", "-")}`,
    name: key,
    title: guide.title,
    description: `Orientação focal para ${guide.title.toLocaleLowerCase("pt-BR")}.`,
    mimeType: "text/markdown",
    text: `# ${guide.title}\n\n${guide.instructions.map((line) => `- ${line}`).join("\n")}\n`
  });
}

const KNOWLEDGE_RESOURCES = Object.freeze(
  Object.entries(COURSE_AUTHORING_GUIDES).map(guideResource)
);

function projectedGuide(key) {
  const guide = COURSE_AUTHORING_GUIDES[key];
  return guide ? structuredClone({
    contract: "aralearn.authoring-guidance.v1",
    phase: key,
    title: guide.title,
    instructions: guide.instructions
  }) : null;
}

export function courseAuthoringGuidanceForCall(name, args = {}) {
  if (name === "consultarComponentesDidaticos") return projectedGuide("components");
  if (name !== "lerCurso" || args.cursor != null) return null;
  if (args.view === "instructional_plan" || args.view === "course_design") {
    return projectedGuide("planning_design");
  }
  if (args.view === "part_materialization") return projectedGuide("materialization");
  if (args.view === "course_sources" || args.view === "course_source_attachment") {
    return projectedGuide("sources");
  }
  if (args.view === "study_units") return projectedGuide("inspection");
  if (args.view === "audit_cycle") {
    const dimensions = new Set(Array.isArray(args.dimensions) ? args.dimensions : []);
    return args.mode === "context" &&
      (dimensions.has("pedagogical_quality") || dimensions.has("editorial_quality"))
      ? projectedGuide("linguistic_didactic_review")
      : projectedGuide("audit_repair");
  }
  if (args.view === "anchored_annotations") return projectedGuide("audit_repair");
  return null;
}

export function listCourseAuthoringKnowledgeResources() {
  return KNOWLEDGE_RESOURCES.map((resource) => {
    const projected = structuredClone(resource);
    delete projected.text;
    return projected;
  });
}

export function readCourseAuthoringKnowledgeResource(uri) {
  const resource = KNOWLEDGE_RESOURCES.find((value) => value.uri === String(uri || ""));
  return resource ? structuredClone(resource) : null;
}
