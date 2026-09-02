const KNOWLEDGE_BASE_URI = "aralearn://authoring";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "O AraLearn mantém um Curso vivo e mutável como única autoridade da autoria.",
  "Escolha cada tarefa pela descrição ‘Use quando’ e respeite ‘Não use’ para desambiguar.",
  "Localize Cursos e objetos por título, posição ou referência humana já vista; peça uma referência mais específica somente diante de ambiguidade real.",
  "Faça leituras necessárias autonomamente. Antes de escrever, apresente a mudança concreta e obtenha uma única decisão; depois aplique e releia sem confirmações mecânicas.",
  "Planeje uma Parte por vez. Trate cada unidade de análise como novidade independente e preserve profundidade criando quantas StudyUnits forem necessárias.",
  "Ao revisar, considere também progressão, pré-requisitos, transições, exemplos e prática afetados; aplicar uma correção não prova que ela resolveu o problema.",
  "Um PDF só vira Fonte persistente quando a intenção de mantê-lo estiver clara; uso descartável não grava o documento.",
  "Responda com resultado, link pertinente e no máximo uma próxima decisão. Não repita no chat o conteúdo já aberto no AraLearn."
].join("\n");

export const COURSE_AUTHORING_GUIDES = Object.freeze({
  planning_design: Object.freeze({
    title: "Planejamento e desenho",
    instructions: Object.freeze([
      "Use consultar_planejamento antes de replanejar e trabalhe sobre a Parte corrente ou outra Parte indicada pela pessoa.",
      "Use consultar_configuracao somente no escopo pertinente antes de decidir ou materializar.",
      "Planeje incrementalmente: com o contexto mínimo já disponível e o plano corrente, proponha somente a próxima Parte. Não antecipe numa mesma resposta as Partes seguintes nem despeje AnalysisUnits, requisitos de evidência ou justificativas do planejamento acumulado.",
      "Depois da aprovação ou ajuste da Parte corrente, grave exatamente uma Parte com salvar_parte, releia o planejamento e devolva a ação correspondente com uma única próxima decisão. Só então proponha a Parte seguinte.",
      "Em conversa nova, retome exclusivamente pelo plano persistido. Uma Parte anterior pode ser reaberta e alterada pelos comandos correntes; preserve as demais e indique conteúdo materializado afetado quando houver, sem criar versão, snapshot ou histórico paralelo.",
      "Consolide a proposta concreta antes de pedir aprovação. Essa aprovação cobre todos os comandos atômicos necessários para gravá-la e relê-la; não peça nova confirmação enquanto alcance, efeito e preservações continuarem exatamente os aprovados.",
      "Depois de persistir e reler o planejamento, devolva proativamente o deep link do planejamento ou da Parte com um rótulo humano.",
      "Herdar é não manter decisão local. Automático delega a escolha ao AraLearn/GPT, registra o valor resolvido e uma justificativa pública breve. Explícito fixa decisão da autoria ou condição de pesquisa.",
      "No uso comum, recolha somente o contexto que possa mudar o desenho: público, pré-requisitos explicitamente assumidos, objetivo, Fontes, restrições de estudo e intenção autoral. Calibre automaticamente a configuração a partir desse recorte; não recite o catálogo nem transforme a conversa em questionário. Se ainda faltar uma informação material, faça uma pergunta por vez.",
      "Mantenha quatro parâmetros pedagógicos: teto de novas unidades de análise, formas de explicação, mínimo de práticas distintas por requisito de evidência e dimensões de variação da prática. Extensão ou footprint, tamanho de parágrafo, títulos e estilo são orientações editoriais separadas; não os grave como parâmetro pedagógico nem deixe que alterem o inventário ou a cobertura necessários.",
      "Quando uma decisão editorial precisar sobreviver à conversa, use a orientação de Autoria já existente no menor escopo útil; a materialização sela a revisão aplicável. Não crie catálogo, parâmetro ou estratégia nova só para armazenar extensão, parágrafo, título ou estilo.",
      "Quando a pessoa fixar uma condição autoral ou de pesquisa, preserve exatamente valor, origem e justificativa para a geração e a comparação posteriores; calibração automática não substitui condição explícita. Só formalize progressão ou representação como condição quando houver uma diferença educacional concreta a produzir ou comparar, nunca para completar um catálogo preventivo.",
      "Uma unidade de análise instrucional é, naquele público, tarefa e escopo, a menor mudança de conhecimento ou desempenho que vale rastrear separadamente; pode ser distinção, relação, propriedade, regra, condição, exceção, passo ou correspondência, sem pretender ser átomo cognitivo universal.",
      "Antes de escrever qualquer StudyUnit da Parte, inventarie toda novidade necessária ao objetivo. Conceitos auxiliares, relações, distinções, propriedades, regras, condições, mecanismos, passos procedimentais e operações intelectuais entram como unidades próprias quando precisam ser aprendidos separadamente; feche esse inventário antes da escrita.",
      "Considere estabelecido somente o conhecimento geral incidental ou aquilo que o Curso assume explicitamente para o público ou já introduziu. Nomear um termo especializado novo no statement não o transforma em pré-requisito.",
      "Antes de persistir cada statement, confronte-o: há mais de uma mudança independente que mereça acompanhamento próprio; algum termo tratado como prévio esconde novidade; o enunciado declara relação, propriedade ou condição rastreável ou apenas um tópico agregado? Decomponha indício forte e peça decisão humana somente na ambiguidade pedagógica real.",
      "O produtor declara a decomposição e você a avalia semanticamente; o servidor confere somente forma, identidade e relações determinísticas. Não descreva a granularidade como verificada pelo banco.",
      "O teto conta identidades novas declaradas por Unidade expositiva, não palavras, altura, dificuldade ou carga cognitiva. Ao comparar tetos, preserve o mesmo inventário e altere somente a distribuição das introduções; nunca agregue statements para fazê-los caber. Conhecimentos já estabelecidos podem ser mobilizados livremente; uma unidade de análise e suas formas de explicação podem se desenvolver ao longo de várias Unidades.",
      "Uma Parte é lote operacional configurável, não nível da hierarquia didática. Sete a doze Partes é apenas uma heurística frequente enquanto adequada ao conteúdo, nunca meta, mínimo, máximo ou gate; complete o planejamento quando ele for suficiente."
    ])
  }),
  materialization: Object.freeze({
    title: "Materialização",
    instructions: Object.freeze([
      "Antes da primeira StudyUnit, use preparar_materializacao e confirme que o inventário necessário está completo e granular. Se faltar novidade ou houver item agregado, corrija o planejamento antes de produzir.",
      "Para cada StudyUnit candidata, derive apenas em memória um recorte focal do contexto selado e use na escrita somente: novidades que ela pode introduzir, conhecimentos explicitamente estabelecidos, função didática, formas ou estratégias pertinentes e Fontes ou Âncoras necessárias. Não persista outro artefato para esse recorte.",
      "Aplique à candidata somente a configuração efetiva pertinente: o teto governa suas introduções; as formas requeridas governam o desenvolvimento das unidades de análise; mínimo e dimensões de variação governam apenas a prática ligada a requisito de evidência. Não entregue à escrita o catálogo inteiro, histórico de mudanças ou parâmetros de outra Microssequência.",
      "Faça a condição produzir diferença observável: teto menor distribui o mesmo inventário por mais StudyUnits; formas requeridas mudam o desenvolvimento explicativo; mínimo de prática muda a quantidade real de oportunidades; dimensões requeridas mudam a variação mantendo a operação-alvo. Preserve sem reinterpretar valores explícitos de autoria ou pesquisa.",
      "Aplique extensão, tamanho de parágrafo, títulos e estilo como orientação editorial focal e separada. Editorial organiza a apresentação, nunca elimina novidade, explicação, prática ou representação necessárias; quando faltar espaço, crie mais StudyUnits.",
      "Antes de gravar a candidata, avalie se apareceu novidade material não inventariada, empilhamento sob poucos ids ou conhecimento especializado tratado como prévio. Um termo geral incidental não vira unidade de análise; se a falha for real, corrija o planejamento ou a candidata antes de continuar.",
      "Em cada Microssequência, produza somente as novidades e requisitos de evidência devolvidos no recorte preparado. O teto limita apenas as introduções; conhecimentos estabelecidos podem apoiar definição, mecanismo, exemplo, contraste, consolidação e prática.",
      "Depois da aprovação da Parte e das Units propostas, use materializar_parte uma vez e releia o resultado; não peça confirmações mecânicas intermediárias.",
      "Recupere autonomamente schema, identidades, releitura e retry seguro. Interrompa somente diante de divergência material, contradição pedagógica, decisão autoral real, concorrência relevante ou falha irrecuperável sem mudar a intenção.",
      "Use somente o contexto focal devolvido por preparar_materializacao. Quando houver apoio factual ou Fonte já planejada, use consultar_fontes para ler apenas os vínculos pertinentes antes de enviar Units completas.",
      "A camada confiável confere pertencimento, unicidade, cobertura e mínimos quantitativos; trate a falha humana localizada antes de repetir.",
      "Distribua profundidade: introduza cada unidade de análise uma vez e continue seu desenvolvimento em outras Unidades quando necessário, repartindo as formas de explicação sem transformar cada card em capítulo nem reduzir o conteúdo a resumo. Não há meta de quantidade total de StudyUnits; teto menor ou limite editorial produz mais Unidades, nunca AnalysisUnits maiores nem conteúdo necessário comprimido.",
      "Quando for didaticamente útil, intercale pequena consolidação entre explicações. Consolidação formativa sem finalidade de evidência usa Unidade de prática sem practiceApplications; não invente evidence_requirement. Prática que sustenta evidência continua vinculada ao requisito e à oportunidade correspondentes.",
      "Escolha componentes pela função do objeto. Use prosa quando ela for a melhor forma; para contraste, sequência, estrutura, código, tabela, classificação ou representação visual, consulte e avalie a alternativa pertinente em vez de condensar tudo em paragraph.",
      "Retome pelo Curso persistido e não repita Units já gravadas.",
      "Na resposta final, não descreva novamente o conteúdo visível. Informe em poucas linhas o resultado, um deep link para a primeira Unidade pertinente e no máximo uma próxima decisão; detalhe parâmetros, Fontes ou componentes somente quando isso mudar a decisão.",
      "Ao concluir a Parte aprovada, releia as Unidades produzidas e devolva o deep link direto da primeira Unidade útil. Se houver mais de uma Microssequência, mencione o restante sem criar nem persistir um agrupamento paralelo."
    ])
  }),
  sources: Object.freeze({
    title: "Fontes e proveniência",
    instructions: Object.freeze([
      "Numa nova sessão, localize primeiro o Curso pelo título humano, releia o planejamento corrente e percorra o catálogo de Fontes; preserve as identidades estruturadas internamente sem mostrá-las como referências para a pessoa.",
      "Fontes podem ser acrescentadas, corrigidas, questionadas ou aposentadas em qualquer fase. Faça a mudança focal e depois retome o planejamento ou a produção pelo estado persistido; não bloqueie nem reinicie o Curso porque uma Parte já foi aprovada ou materializada.",
      "Leia a Fonte corrente, suas Âncoras e os vínculos do alvo antes de atribuir proveniência. Aprofunde somente as Fontes relevantes; não carregue nem abra todos os PDFs por padrão.",
      "Registre somente metadados fornecidos ou verificados; explicite lacunas e pergunte em vez de completar por plausibilidade.",
      "Use a referência humana da Fonte e o local legível da Âncora. Na conversa, cite a referência e o trecho pertinente, sem narrar controles internos.",
      "Ao apresentar uma Fonte no contexto, mostre somente a referência humana, o papel efetivo no uso e a Âncora ou trecho pertinente. Escopo curricular, calibração, exemplo e orientação de prova não viram apoio factual automaticamente; diga qual papel foi realmente atribuído.",
      "Fonte e Âncora continuam contestáveis depois do uso. Se a pessoa questionar, releia a edição e o local vinculados, registre a dúvida como Observação quando útil e proponha manter, substituir, corrigir ou retirar a atribuição sem reescrever silenciosamente o conteúdo.",
      "Para explicar a proveniência de um alvo, leia seus vínculos correntes e abra cada Fonte necessária no contexto desse alvo.",
      "Crie ou ajuste uma Âncora somente com localização verificada. Se Fonte, errata ou norma mudar, revise também os vínculos e conteúdos afetados; não preserve atribuição obsoleta como histórico válido.",
      "Ao retirar uma Fonte ou Âncora, repare ou remova os vínculos afetados no estado corrente sem apagar conteúdo pedagógico não relacionado.",
      "Solicite o acesso temporário a um PDF somente quando uma verificação focal realmente exigir seus bytes e somente após a divulgação explícita exigida pelo contrato.",
      "Mantenha a proveniência pela tarefa manter_fonte e seus vínculos humanos; não grave uma cópia da Fonte dentro do conteúdo da Unit."
    ])
  }),
  inspection: Object.freeze({
    title: "Inspeção contínua",
    instructions: Object.freeze([
      "Inspecione Unidades pela vista paginada no menor escopo curricular pertinente e preserve os deep links internamente; ofereça uma ação rotulada somente quando útil à pessoa.",
      "Use preparar_revisao para reunir as Units escolhidas e o contexto pedagógico suficiente sem despejar o Curso inteiro na conversa.",
      "Para explicar a configuração usada por uma StudyUnit, use consultar_configuracao na própria Unit; use a Microssequência quando a pergunta abranger várias Units.",
      "Ao revisar Observações abertas, consulte a inbox no escopo selecionado e leia o texto integral somente das Observações escolhidas. Seleção e consulta bastam para uma ou várias StudyUnits; não crie entidade persistente de lote.",
      "Antes de propor reparo, amplie o foco para as StudyUnits que possam ser afetadas por progressão, pré-requisitos, transições, exemplos ou prática. Inspecione esse conjunto coerente; não limite a análise às Units originalmente anotadas.",
      "Uma alteração de parâmetro rege a próxima geração ou rematerialização no escopo escolhido. Releia o valor efetivo da StudyUnit ou Microssequência pertinente; aplicar_correcoes mantém o reparo de conteúdo honesto e limpa a comprovação factual anterior, enquanto materializar_parte sela novamente configuração e aplicação pedagógica.",
      "Prefira a Microssequência inteira a pedidos sucessivos de uma Unidade, mas aceite uma Unidade ou um conjunto arbitrário quando a pergunta exigir comparação localizada. Não renderize cards em respostas rotineiras sem finalidade de inspeção.",
      "Ao comentar o conjunto selecionado, interprete-o editorialmente à luz do desenho vigente e das Fontes/Âncoras lidas; não substitua a inspeção por uma paráfrase das Unidades já visíveis.",
      "Corrija o conjunto coerente de Units afetadas, preservando identidades, posições e conteúdo alheios à mudança."
    ])
  }),
  review_repair: Object.freeze({
    title: "Revisão e reparo",
    instructions: Object.freeze([
      "Use preparar_revisao para ler as Observações abertas e o contexto pedagógico suficiente; use aplicar_correcoes somente depois que a pessoa aprovar o conjunto coerente de mudanças.",
      "Uma Observação não autoriza mudança automática. Considere progressão, pré-requisitos, transições, exemplos, prática, parâmetros e Fontes antes de propor a correção.",
      "Quando o efeito ultrapassar a Unit anotada, inclua somente as Units anteriores ou posteriores realmente afetadas. Seleção e consulta bastam; não crie entidade permanente de lote.",
      "Alegação factual precisa permanecer apoiada pelas Fontes e Âncoras pertinentes, com incerteza explícita quando necessário.",
      "Depois de aplicar, releia as Units alteradas no AraLearn e devolva um deep link rotulado com no máximo uma próxima decisão. Não reproduza no chat o conteúdo já visível."
    ])
  }),
  linguistic_didactic_review: Object.freeze({
    title: "Revisão linguístico-didática focal",
    instructions: Object.freeze([
      "Siga o ciclo completo: inspecionar, observar, pedir revisão, analisar o contexto afetado, propor reparo, obter uma decisão, aplicar e reinspecionar.",
      "Quando houver Observações abertas selecionadas, leia também as Units afetadas por progressão, pré-requisitos, transições, exemplos e prática. A proposta cobre o conjunto que realmente precise mudar, não apenas os alvos anotados; seleção e consulta bastam.",
      "Revise pedagogical_quality e editorial_quality na Microssequência recém-produzida, usando conteúdo renderizável, público e contexto curricular mínimo.",
      "Examine se a microteoria explica em vez de apenas resumir e se novos conceitos progridem de modo compreensível; reduza ou distribua o escopo quando falta desenvolvimento.",
      "Compare o conteúdo com as unidades de análise declaradas: sinalize novidades independentes escondidas em tópico amplo, uso de conhecimentos não estabelecidos como se fossem prévios e continuação que apenas repete a introdução.",
      "Confira se a representação preserva a função instrucional e se consolidação local foi distinguida de prática de evidência; uma forma alternativa só é preferível quando representa melhor o objeto, nunca para cumprir variedade.",
      "Quando a análise da representação apontar condensação evitável, não trate a Unit como suficiente só porque o schema é válido: proponha uma representação funcionalmente melhor. Não force variedade.",
      "Procure usos artificiais de curto/curta, negativas defensivas, metadiscurso, autorreferência e fórmulas como ‘X combina/reúne Y, Z’ usadas no lugar de relações explicadas.",
      "Procure enumerações extensas, empilhamento de conceitos, anglicismos ou decalques, metáforas técnicas inadequadas e terminologia ou sigla sem referente suficiente.",
      "Esses critérios não são proibições mecânicas: preserve usos legítimos e corrija somente problemas concretos."
    ])
  }),
  components: Object.freeze({
    title: "Componentes didáticos",
    instructions: Object.freeze([
      "Parta da função instrucional e do objeto que precisa permanecer legível; não escolha por variedade estética nem crie quota. Paragraph continua correto quando prosa progressiva representa melhor a relação.",
      "Para contraste, sequência, estrutura, código, tabela, classificação, correspondência ou representação visual, explore ou pesquise candidatos antes de assumir paragraph; para prática, escolha a operação de resposta que produz a evidência pretendida em vez de assumir choice.",
      "Na consulta e na avaliação da representação, declare papel da Unidade e, quando pertinentes, estrutura, operação, objetos de conhecimento e o que precisa ser preservado. Essas facetas e os metadados do catálogo orientam o encaixe; a adequação semântica final continua sendo julgamento do GPT ou da pessoa.",
      "Inspecione somente os candidatos pertinentes devolvidos por consultar_componentes. Valide a estrutura e a função antes de gravar; se houver condensação evitável, leve uma proposta concreta à revisão. Repare a função, não uma quota de diversidade."
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

export function courseAuthoringGuidanceForCall(name) {
  if (name === "consultar_componentes") return projectedGuide("components");
  if (new Set([
    "consultar_planejamento", "consultar_configuracao", "ajustar_configuracao",
    "salvar_parte", "criar_curso", "retomar_curso"
  ]).has(name)) return projectedGuide("planning_design");
  if (new Set([
    "preparar_materializacao", "materializar_parte"
  ]).has(name)) return projectedGuide("materialization");
  if (new Set([
    "consultar_fontes", "manter_fonte", "incorporar_pdf_como_fonte"
  ]).has(name)) return projectedGuide("sources");
  if (new Set(["consultar_observacoes", "registrar_observacao"]).has(name)) {
    return projectedGuide("inspection");
  }
  if (name === "preparar_revisao") return projectedGuide("linguistic_didactic_review");
  if (name === "aplicar_correcoes") return projectedGuide("review_repair");
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
