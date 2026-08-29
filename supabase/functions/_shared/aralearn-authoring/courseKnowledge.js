const KNOWLEDGE_BASE_URI = "aralearn://authoring";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Em uma nova conversa, localize Cursos próprios pelo título em linguagem humana. Use uma correspondência única plausível; se houver duas, peça uma desambiguação compreensível sem exigir ID como primeira opção. Depois, releia o estado vivo e identifique onde a autoria parou.",
  "Leia somente o recorte necessário antes de alterar. Preserve IDs, revisões, versões, CAS, requestId, hashes, caminhos, operações e payloads exclusivamente no estado estruturado necessário ao trabalho; nunca os fabrique.",
  "Preservar internamente não significa mostrar à pessoa. Na conversa padrão, não enumere UUIDs, revisions, planVersion, CAS, requestIds, expectedRevision, expectedPlanVersion, hashes, payloads, storage paths, nomes de operações, enums internos, sourceLinks ou schemas.",
  "Apresente primeiro onde o Curso parou, o que existe, o que falta, a mudança pedagógica proposta, sua justificativa, o que permanecerá intacto, a decisão humana necessária e se haverá materialização.",
  "Quando útil, dê transparência operacional leve — por exemplo, que releu o estado atual ou que a alteração foi gravada e validada — sem narrar o protocolo.",
  "Em falhas, explique a tarefa afetada, a certeza sobre qualquer escrita e o próximo passo seguro. Nunca declare sucesso incerto. Revele o detalhe técnico literal somente sob pedido explícito ou quando uma intervenção técnica real for necessária.",
  "Antes de escrever, descreva e confirme os efeitos pedagógicos da proposta, não o payload. Releia silenciosamente os controles correntes quando necessário.",
  "As leituras pertinentes devolvem phaseGuidance focal; use essa orientação internamente na fase corrente, sem fixar plano, desenho, Fontes ou progresso na conversa.",
  "Use as ferramentas para observar ou modificar fatos; não invente conteúdo, Fontes, permissões, resultados nem estado de materialização.",
  "Registre apenas conclusões e evidências públicas, nunca conversa completa, prompt secreto ou raciocínio privado.",
  "Achado não autoriza alteração: proponha, obtenha a confirmação exigida, aplique e verifique separadamente no Curso vivo.",
  "Preserve deep links no estado estruturado. Ofereça um link como ação humana rotulada, por exemplo ‘Abrir planejamento no AraLearn’, apenas quando ele for útil; não despeje a URL na conversa comum.",
  "Não mostre Unidades em toda interação. Ao concluir uma etapa material ou quando a pessoa pedir ou precisar conferir evidência, crie um foco coerente — de preferência a Microssequência afetada inteira — e leia suas Unidades para apresentá-las visualmente no chat."
].join("\n");

export const COURSE_AUTHORING_GUIDES = Object.freeze({
  planning_design: Object.freeze({
    title: "Planejamento e desenho",
    instructions: Object.freeze([
      "Leia instructional_plan antes de replanejar; preserve internamente os ids de itens e Partes e a versão do plano, sem mostrá-los por padrão.",
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
      "Retome pelo estado persistido e não duplique conteúdo ou aplicações em resultFacts.",
      "Na resposta final, não descreva novamente o conteúdo visível dos cards. Escreva uma nota editorial curta: intenção e progressão didática, como os parâmetros efetivos orientaram as escolhas, quais Fontes e Âncoras verificadas sustentaram as decisões, por que os componentes foram escolhidos e que incerteza permanece.",
      "Ao encerrar uma Microssequência, faça uma síntese curta, crie um foco com todas as Unidades dela e leia esse foco uma vez para a inspeção material. Se a etapa abrange muitas Microssequências, apresente apenas o primeiro recorte útil e ofereça os demais sob demanda."
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
      "Inspecione Unidades pela vista paginada no menor escopo curricular pertinente e preserve os deep links internamente; ofereça uma ação rotulada somente quando útil à pessoa.",
      "Para apresentar material no chat, crie inspection_focus com as Unidades escolhidas e depois leia study_units com inspectionFocusId. O componente agrupa o conjunto por Microssequência e fornece referências curtas para comentários na conversa.",
      "Prefira a Microssequência inteira a pedidos sucessivos de uma Unidade, mas aceite uma Unidade ou um conjunto arbitrário quando a pergunta exigir comparação localizada. Não renderize cards em respostas rotineiras sem finalidade de inspeção.",
      "Ao comentar um foco, interprete-o editorialmente à luz do desenho vigente e das Fontes/Âncoras lidas para o alvo; não substitua a inspeção por uma paráfrase das Unidades já visíveis.",
      "Corrija somente a Unidade ou o segmento que mudou; identidades e posições alheias permanecem estáveis.",
      "Um marcador de desenho só volta ao estado verificado depois de prova focal sobre a revisão e a versão correntes."
    ])
  }),
  audit_repair: Object.freeze({
    title: "Auditoria e reparo",
    instructions: Object.freeze([
      "Abra audit_cycle em mode context para o alvo exato; use mode runs para rodadas inclusive limpas e detail para uma rodada, achado ou correção.",
      "Checks, achados e propostas são conclusões públicas, localizadas e limitadas; alegação factual exige sourceLinks e incerteza explícita.",
      "Mostre a proposta e o antes/depois. Aplicação não prova resolução: somente verificação posterior pode resolver ou reabrir pendências vinculadas.",
      "Ao concluir auditoria, reparo ou verificação, apresente seletivamente as Unidades afetadas; use a Microssequência inteira quando a relação entre elas fizer parte do julgamento e não repita o mesmo conjunto sem mudança material."
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
