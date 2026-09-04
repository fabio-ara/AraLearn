const KNOWLEDGE_BASE_URI = "aralearn://authoring";

export const COURSE_AUTHORING_SERVER_INSTRUCTIONS = [
  "Use objetivo, público, pré-requisitos, escopo e fontes. Primeiro proponha o mapa completo de módulos, lições e microssequências; síntese no chat, detalhe no AraLearn.",
  "Só o mapa mostrado é aprovado. Parte é lote operacional, não currículo.",
  "Se aprovar mapa e pedir lote juntos, registre o mapa; proponha a progressão e só salve o lote após confirmação.",
  "No estado default, calibre por microssequência ou unidade segundo assunto e mapa, em silêncio; condições fixadas pelo pesquisador prevalecem. Só mostre parâmetros, contagens, formas e alvos a pedido.",
  "Ensine dependências antes do uso.",
  "Mapa mostra conteúdo, não contagens. Não narre tentativas nem causas (conexão, escrita, confirmação, validação, ferramenta ou mecanismo). Retome em silêncio; se não puder, diga só o impacto e o próximo passo. Distinga pessoa autora de público. Use curso, parte, fonte e unidade em minúsculas no meio da frase.",
  "Após produzir: resultado, link e próxima etapa; devolva o endereço exato em Markdown."
].join("\n");

export const COURSE_AUTHORING_GUIDES = Object.freeze({
  planning_design: Object.freeze({
    title: "Planejamento e desenho",
    instructions: Object.freeze([
      "Leia o estado corrente. Antes de qualquer conteúdo, proponha o mapa curricular completo com módulos, lições, microssequências, dependências relevantes e cobertura do escopo; uma síntese fica no chat e o detalhe fica inspecionável no AraLearn.",
      "A aprovação do mapa não aprova decisões futuras. Se aprovação e pedido do lote vierem juntos, registre primeiro o mapa; apresente uma parte operacional por vez e só a salve após a pessoa confirmar sua progressão. Redefinir o lote não altera o mapa.",
      "Recolha apenas contexto que possa mudar o desenho: objetivo, público, pré-requisitos, escopo, profundidade, restrições e fontes. No estado default, calibre a configuração para cada microssequência ou unidade conforme assunto e planejamento; uma condição fixada pelo pesquisador prevalece. Preserve decisões anteriores e pergunte só quando uma alternativa mudar materialmente o curso.",
      "Uma unidade de análise é uma ideia, distinção, relação, regra ou operação necessária ao percurso. Se houver dois conceitos novos e a relação essencial entre eles, acompanhe as três unidades de análise; conceitos fundamentais ainda não estabelecidos também pertencem ao repertório.",
      "Não use tópico agregado para esconder novidades: decomponha quando necessário. O teto conta ideias semanticamente novas, não palavras, altura, dificuldade ou carga cognitiva. Conhecimentos já estabelecidos podem ser mobilizados livremente. O produtor declara o julgamento semântico; o servidor confere somente propriedades determinísticas."
    ])
  }),
  materialization: Object.freeze({
    title: "Materialização",
    instructions: Object.freeze([
      "Antes de produzir, consulte a parte, a configuração focal e o repertório acumulado. No estado default, calibre cada unidade nova no próprio pedido de materialização, sem etapa persistente separada nem narração no chat. Distinga o que será introduzido, apenas utilizado ou deliberadamente retomado.",
      "Ensine cada dependência antes do uso. Mesmo quando fundamental para alicerçar outra novidade, uma ideia ainda não estabelecida precisa de preparação suficiente.",
      "Crie experiências focalizadas e conectadas: divida uma unidade densa e funda fragmentos que não cumprem função didática sozinhos. A quantidade deve emergir do conteúdo.",
      "Distribua prática e consolidação perto do menor bloco de novidades e pré-requisitos que já as torne compreensíveis; não deixe toda a prática para depois de uma longa sequência teórica.",
      "Prática de consolidação pode existir sem avaliação formal; não invente requisito de evidência para justificá-la.",
      "Escolha cada componente pela função: relações espaciais pedem diagrama, estado pode pedir tabela, mudança temporal pode pedir sequência, comparação pode pedir lado a lado e raciocínio pode pedir resposta aberta.",
      "Faça leitura sequencial como estudante antes de concluir: procure saltos, densidade, fragmentação, repetição, prática prematura e falta de integração; mova, divida, funda ou reescreva quando necessário."
    ])
  }),
  sources: Object.freeze({
    title: "Fontes e proveniência",
    instructions: Object.freeze([
      "Fontes podem entrar em qualquer fase. Mostre a referência humana, o papel efetivo e a âncora ou trecho pertinente sem narrar controles internos.",
      "Separe os papéis: documento curricular define escopo; fonte de aplicação ou avaliação calibra o contexto; fonte técnica sustenta explicações e não redefine o currículo por si só.",
      "Dados bibliográficos fornecidos não significam conferência. Só atribua confirmação à autoria após declaração explícita dela. Leitura direta pode sustentar uma localização, mas não essa confirmação; sem localização observada, mantenha a verificação pendente e nunca invente capítulo, página ou trecho.",
      "Fonte e âncora continuam contestáveis. Ao corrigir ou retirar uma atribuição, repare apenas conteúdo e vínculos realmente afetados."
    ])
  }),
  inspection: Object.freeze({
    title: "Inspeção contínua",
    instructions: Object.freeze([
      "Use a vista focal para inspecionar conteúdo e a caixa de observações abertas; seleção e consulta bastam, portanto não crie entidade persistente de lote.",
      "Antes de propor reparo, considere unidades afetadas por progressão, pré-requisitos, transições, exemplos ou prática, mesmo que não tenham sido anotadas.",
      "Apresente o problema pedagógico concreto e uma proposta curta. Depois de aplicar, reinspecione a sequência e ofereça o link útil."
    ])
  }),
  review_repair: Object.freeze({
    title: "Revisão e reparo",
    instructions: Object.freeze([
      "Leia observações e o contexto afetado, proponha o conjunto coerente de correções e só então aplique o que a pessoa aprovou.",
      "Releia a sequência corrigida; aplicar uma mudança não demonstra, por si só, que o problema foi resolvido."
    ])
  }),
  linguistic_didactic_review: Object.freeze({
    title: "Revisão linguístico-didática focal",
    instructions: Object.freeze([
      "Siga o ciclo inspecionar, observar, pedir revisão, analisar o contexto afetado, propor reparo, decidir, aplicar e reinspecionar; considere o percurso, não apenas os alvos anotados.",
      "Verifique se o texto explica em vez de apenas resumir. Procure enumerações extensas, empilhamento de conceitos, anglicismos ou decalques, metáforas técnicas inadequadas e terminologia ou sigla sem contexto.",
      "Corrija usos artificiais de curto/curta, negativas defensivas, metadiscurso e fórmulas como combina/reúne quando substituírem relações explicadas. Esses critérios não são proibições mecânicas."
    ])
  }),
  components: Object.freeze({
    title: "Componentes didáticos",
    instructions: Object.freeze([
      "Na consulta, descreva a função e informe papel e lugar; quando forem conhecidos, acrescente estrutura e operação.",
      "Escolha pela função representacional, não por variedade estética nem coincidência lexical. Inspecione o contrato antes de gravar.",
      "Se houver condensação evitável, leve uma proposta concreta à revisão e repare a função, não uma quota de diversidade."
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
    "salvar_mapa_curricular", "salvar_parte", "criar_curso", "retomar_curso"
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
