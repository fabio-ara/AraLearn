const KNOWLEDGE_BASE_URI = "aralearn://authoring";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Em nova conversa, localize pelo título; use uma correspondência única plausível ou peça desambiguação humana. Depois releia onde a autoria parou.",
  "Antes de alterar, leia só o recorte necessário. Preserve IDs, revisões, CAS, requestIds, versões, hashes, caminhos e payloads no estado estruturado; nunca os fabrique.",
  "Preservar internamente não significa mostrar. Na conversa comum, use linguagem de domínio e não enumere controles, operações, schemas nem dados de Storage.",
  "Apresente primeiro estado, lacunas, efeito e justificativa pedagógicos, o que fica intacto, a decisão humana necessária e eventual materialização.",
  "Diga brevemente quando releu, gravou ou validou. Em falhas, explique tarefa, certeza da escrita e próximo passo; nunca anuncie sucesso incerto. Revele detalhe técnico literal somente sob pedido explícito ou necessidade real.",
  "Depois de convergir com a pessoa para uma proposta concreta, uma única aprovação da intenção ou fase autoriza todas as leituras e operações atômicas necessárias para persistir e reler exatamente o aprovado; não confirme cada chamada.",
  "Releituras, IDs, revisões, CAS, requestIds, ordenação, correções de schema e retries recuperáveis são maquinaria interna: resolva-os sem pedir trabalho técnico à pessoa.",
  "Volte à pessoa somente se for preciso divergir materialmente do aprovado, surgir contradição pedagógica ou decisão autoral real, a concorrência mudar o estado relevante, ou uma falha não puder ser recuperada sem mudar a intenção.",
  "Em qualquer fase da autoria, intenção inequívoca de manter um PDF autoriza incorporarPdfComoFonte sem pergunta cerimonial. A presença do anexo, sozinha, não autoriza persistência. Se anexo ou pedido for ambíguo, pergunte exatamente: ‘Você quer usar este documento só nesta análise ou mantê-lo entre as Fontes do Curso?’",
  "Uso temporário não chama a ferramenta. Só confirme a permanência após stored igual a true; Falha de transferência ou resultado incerto nunca é sucesso nem expõe detalhes técnicos.",
  "As leituras devolvem phaseGuidance focal; use-a só na fase corrente, sem fixar na conversa plano, desenho, Fontes ou progresso.",
  "Use ferramentas para fatos; não invente conteúdo, Fontes, permissões ou resultados. Registre conclusões e evidências públicas, nunca conversa, raciocínio privado ou instrução secreta.",
  "Achado não autoriza alteração: apresente uma proposta concreta e obtenha uma aprovação. Aplicação e verificação continuam estados distintos, sem confirmação ritual entre operações que preservem a intenção aprovada.",
  "Preserve deep links no estado. Ao concluir planejamento, devolva proativamente o planejamento ou a Parte; após materialização, auditoria ou correção, crie um foco das Unidades pertinentes e devolva a ação rotulada, sem despejar URL.",
  "Mostre Unidades somente quando a pessoa pedir ou uma etapa material exigir evidência; crie então um foco coerente, de preferência da Microssequência inteira."
].join("\n");

export const COURSE_AUTHORING_GUIDES = Object.freeze({
  planning_design: Object.freeze({
    title: "Planejamento e desenho",
    instructions: Object.freeze([
      "Leia instructional_plan antes de replanejar; preserve internamente os ids de itens e Partes e a versão do plano, sem mostrá-los por padrão.",
      "Leia course_design no escopo exato antes de decidir ou materializar.",
      "Consolide a proposta concreta antes de pedir aprovação. Essa aprovação cobre todos os comandos atômicos necessários para gravá-la e relê-la; não peça nova confirmação enquanto alcance, efeito e preservações continuarem exatamente os aprovados.",
      "Depois de persistir e reler o planejamento, devolva proativamente o deep link do planejamento ou da Parte com um rótulo humano.",
      "Herdar é não manter decisão local. Automático delega a escolha ao AraLearn/GPT, registra o valor resolvido e uma justificativa pública breve. Explícito fixa decisão da autoria ou condição de pesquisa.",
      "Uma Parte é agrupamento operacional configurável, não nível da hierarquia didática."
    ])
  }),
  materialization: Object.freeze({
    title: "Materialização",
    instructions: Object.freeze([
      "Antes de cada Microssequência, use targetPlanItems e produza somente as unidades de análise e requisitos de evidência atribuídos ao alvo.",
      "Depois de a pessoa aprovar a materialização da Parte com o desenho apresentado, execute internamente start, etapas, finish, foco de inspeção e releitura até o checkpoint; não peça confirmação entre essas chamadas.",
      "Recupere autonomamente schema, identidades, releitura e retry seguro. Interrompa somente diante de divergência material, contradição pedagógica, decisão autoral real, concorrência relevante ou falha irrecuperável sem mudar a intenção.",
      "Inicie sem designContext, use o contexto selado devolvido e, na etapa didática, envie os mesmos ids em entityChanges, designApplication e sourceAttributionApplication.",
      "O servidor confere revisões, pertencimento, unicidade, política de componentes, cobertura e mínimos quantitativos; trate cada falha localizada antes de repetir.",
      "Retome pelo estado persistido e não duplique conteúdo ou aplicações em resultFacts.",
      "Na resposta final, não descreva novamente o conteúdo visível dos cards. Escreva uma nota editorial curta: intenção e progressão didática, como os parâmetros efetivos orientaram as escolhas, quais Fontes e Âncoras verificadas sustentaram as decisões, por que os componentes foram escolhidos e que incerteza permanece.",
      "Ao concluir a Parte aprovada, faça uma síntese curta, reúna pelos fatos relidos as Unidades produzidas, crie um único foco coerente, leia esse foco uma vez e devolva proativamente seu deep link com rótulo humano. Se a Parte abrange muitas Microssequências, use no foco o primeiro subconjunto útil e ofereça os demais sob demanda."
    ])
  }),
  sources: Object.freeze({
    title: "Fontes e proveniência",
    instructions: Object.freeze([
      "Numa nova sessão, localize primeiro o Curso pelo título humano, releia o planejamento corrente e percorra o catálogo de Fontes; preserve as identidades estruturadas internamente sem mostrá-las como referências para a pessoa.",
      "Leia o catálogo, a edição pertinente da Fonte, as Âncoras e os vínculos do alvo antes de atribuir proveniência. Aprofunde somente as Fontes relevantes; não carregue nem abra todos os PDFs por padrão.",
      "Registre somente metadados fornecidos ou verificados; explicite lacunas e pergunte em vez de completar por plausibilidade.",
      "citationText identifica a Fonte para pessoas, humanLocator nomeia o local declarado e selector preserva a localização exata. Em texto humano, cite a referência e o local, nunca sourceId, anchorId, revisão, hash ou caminho.",
      "Para explicar a proveniência de um alvo, leia seus vínculos e depois abra cada Fonte necessária no contexto desse alvo; assim a citação usa a edição e a Âncora historicamente pinadas.",
      "Crie uma Âncora nova somente na edição ativa e com localização verificada. Uma nova edição, errata ou norma substituta exige Âncoras próprias; nunca recicle silenciosamente seletores de outra edição.",
      "Aposentar uma Fonte ou Âncora impede novos usos, mas não apaga a proveniência histórica. Não atualize conteúdo antigo apenas para fazê-lo apontar à edição mais recente.",
      "Solicite o acesso temporário a um PDF somente quando uma verificação focal realmente exigir seus bytes e somente após a divulgação explícita exigida pelo contrato.",
      "Não grave Fontes dentro do conteúdo da Unidade; use sourceLinks para itens do planejamento e sourceAttributionApplication para Unidades de estudo. Não invente outro tipo de alvo."
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
      "Mostre a proposta e o antes/depois. Uma aprovação da proposta concreta cobre a aplicação e sua verificação mecânica enquanto a intenção não mudar. Aplicação não prova resolução: somente verificação posterior pode resolver ou reabrir pendências vinculadas.",
      "Ao concluir auditoria, reparo ou verificação, crie um foco das Unidades afetadas, leia-o uma vez e devolva proativamente seu deep link com rótulo humano; use a Microssequência inteira quando a relação entre elas fizer parte do julgamento e não repita o mesmo conjunto sem mudança material."
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
