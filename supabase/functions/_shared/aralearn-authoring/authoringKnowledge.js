const COMMON_WORKFLOW = Object.freeze([
  "Localize e leia somente a árvore ou entidade necessária.",
  "Prepare o contexto de autoria antes de criar ou reorganizar conteúdo.",
  "Trabalhe em workspace e releia sua revisão antes de cada série de escritas.",
  "Aplique operações atômicas com requestId novo e expectedRevision atual.",
  "Revise as microteorias com o autor e valide a árvore antes de publicar."
]);

export const AUTHORING_SERVER_INSTRUCTIONS = [
  "Antes de criar, ampliar, reparar pedagogicamente ou reorganizar conteúdo, chame prepararAutoriaAraLearn com um resumo do pedido e use o brief devolvido.",
  "Consulte cursos existentes antes de produzir conteúdo semelhante.",
  "Leia a revisão atual antes de cada escrita; use expectedRevision e um requestId novo por intenção.",
  "Consulte consultarRecursoDeCard antes do primeiro uso de cada resource.",
  "No chat, apresente microteorias e quantidades de práticas, não enumere práticas salvo pedido explícito.",
  "Exclusões e publicação no catálogo exigem confirmação do alvo atual."
].join(" ");

const KNOWLEDGE_CHUNKS = Object.freeze([
  Object.freeze({
    id: "operating-contract",
    title: "Contrato operacional",
    group: "workflow",
    intents: ["inspect", "create", "extend", "revise", "restructure", "publish", "study"],
    entities: ["course", "module", "lesson", "microsequence", "card"],
    keywords: ["workspace", "revisao", "curso", "autoria", "editar", "criar"],
    text: "O MCP é a fonte de verdade para cursos acessíveis, workspaces e revisões. Localize conteúdo existente, leia primeiro outline e depois somente a entidade necessária. Cada escrita cria snapshot imutável, exige expectedRevision atual e usa requestId estável apenas em repetição idêntica. Não reescreva o documento inteiro para simular uma operação estrutural disponível."
  }),
  Object.freeze({
    id: "reuse-before-generation",
    title: "Descoberta e reaproveitamento",
    group: "workflow",
    intents: ["inspect", "create", "extend", "restructure", "study"],
    entities: ["course", "module", "lesson", "microsequence"],
    keywords: ["existente", "catalogo", "biblioteca", "reaproveitar", "complementar", "juntar"],
    text: "Antes de criar conteúdo semelhante, pesquise biblioteca e catálogo. Um workspace pode começar de um curso e importar outros. Use entityPath completo para copiar, mover, promover, rebaixar, juntar ou separar partes. Preserve identidades internas quando isso mantém continuidade; escolha uma raiz nova ao importar outro curso."
  }),
  Object.freeze({
    id: "microtheory-design",
    title: "Desenho da microteoria",
    group: "pedagogy",
    intents: ["create", "extend", "revise"],
    entities: ["lesson", "microsequence", "card"],
    keywords: ["microteoria", "conceito", "objetivo", "explicar", "aprendizagem"],
    text: "Cada microssequência delimita uma unidade conceitual ou operacional pequena. goal declara a aprendizagem, covers delimita o conteúdo, checks descreve evidência observável, errors registra equívocos pertinentes e dependsOn aponta apenas bases causais já ensinadas. Introduza fundamento e exemplo suficientes antes de cobrar desempenho."
  }),
  Object.freeze({
    id: "practice-design",
    title: "Prática para consolidação",
    group: "pedagogy",
    intents: ["create", "extend", "revise"],
    entities: ["microsequence", "card"],
    keywords: ["pratica", "exercicio", "consolidar", "feedback", "distrator", "lacuna"],
    text: "As práticas recuperam, aplicam, contrastam e variam a microteoria sem abrir conteúdo novo. Cada atividade é autossuficiente, cobra uma decisão principal, contém dados suficientes, possui resposta verificável e feedback específico. Varie exemplos, apoio e representação; não multiplique alternativas sem distratores funcionais."
  }),
  Object.freeze({
    id: "resource-selection",
    title: "Seleção de resources",
    group: "resources",
    intents: ["create", "extend", "revise"],
    entities: ["microsequence", "card"],
    keywords: ["resource", "representacao", "tabela", "fluxo", "grafo", "formula", "mapa"],
    text: "Escolha o resource pela operação cognitiva e pela estrutura que o estudante precisa ler ou transformar. paragraph e choice não substituem automaticamente representações especializadas. Consulte o contrato do resource antes do primeiro uso e obedeça authoringSchema, regras semânticas, acessibilidade e limites de leitura em celular."
  }),
  Object.freeze({
    id: "continuity",
    title: "Continuidade e linguagem",
    group: "pedagogy",
    intents: ["create", "extend", "revise", "restructure"],
    entities: ["course", "module", "lesson", "microsequence", "card"],
    keywords: ["continuidade", "prerequisito", "termo", "notacao", "idioma", "dependencia"],
    text: "Apresente termos, siglas, convenções, unidades e notações antes de exigi-los. Ao mover ou recombinar partes, confira dependsOn, covers, checks, errors, tópicos e registro terminológico. Preserve idioma, direção de texto e fontes pertinentes; não deduza continuidade apenas pela proximidade de títulos."
  }),
  Object.freeze({
    id: "structural-editing",
    title: "Reorganização estrutural",
    group: "workflow",
    intents: ["restructure", "revise", "extend"],
    entities: ["course", "module", "lesson", "microsequence", "card"],
    keywords: ["mover", "renomear", "excluir", "promover", "rebaixar", "separar", "reorganizar"],
    text: "Use a operação estrutural específica para inserir, substituir, renomear, mover, excluir, juntar, separar, promover ou rebaixar. Confirme origem, destino e entityPath pela leitura atual. Depois de mudanças relacionadas, releia o outline e revise dependências e posições; em conflito, releia e reaplique somente a intenção ainda pertinente."
  }),
  Object.freeze({
    id: "human-review",
    title: "Revisão com o autor",
    group: "workflow",
    intents: ["create", "extend", "revise", "publish"],
    entities: ["course", "module", "lesson", "microsequence"],
    keywords: ["revisar", "chat", "autor", "microteorias", "conceitual"],
    text: "Na conversa, apresente título, objetivo e conteúdo conceitual consolidado de cada microteoria, além da quantidade de práticas. Não despeje JSON, ids, recibos nem enumere práticas por padrão. Leve ao autor apenas dúvidas conceituais ou decisões que alterem de fato o curso."
  }),
  Object.freeze({
    id: "publication",
    title: "Prévia e publicação",
    group: "safety",
    intents: ["publish", "create", "extend"],
    entities: ["course"],
    keywords: ["publicar", "previa", "partial", "complete", "catalogo", "testar"],
    text: "Uma publicação private partial materializa uma prévia imediatamente testável, mesmo incompleta. O catálogo aceita somente complete e exige papel editorial e confirmação explícita imediatamente antes da publicação. Atualização exige existingCourseId e expectedContentHash; divergência nunca produz merge silencioso."
  }),
  Object.freeze({
    id: "consequential-actions",
    title: "Ações consequentes",
    group: "safety",
    intents: ["restructure", "publish", "revise"],
    entities: ["course", "module", "lesson", "microsequence", "card"],
    keywords: ["excluir", "publicar", "irreversivel", "confirmar", "seguranca"],
    text: "Antes de excluir entidade ou workspace e antes de publicar no catálogo, confirme o alvo pela revisão atual e obtenha autorização explícita quando a intenção do usuário não for inequívoca. Não exponha tokens, segredos, URLs privadas de Storage nem detalhes internos do banco."
  }),
  Object.freeze({
    id: "study-access",
    title: "Consulta para estudo",
    group: "workflow",
    intents: ["study", "inspect"],
    entities: ["course", "module", "lesson", "microsequence", "card"],
    keywords: ["estudar", "resumir", "explicar", "consultar", "conteudo", "disponivel"],
    text: "Para responder sobre o que a pessoa pode estudar, consulte a biblioteca pessoal. Leia outline para localizar o recorte e entity somente quando precisar do conteúdo. Diferencie informação publicada, rascunho de workspace e explicação produzida na conversa; nunca invente acesso nem peça captura de tela quando a ferramenta está disponível."
  })
]);

const RESOURCE_GROUPS = Object.freeze({
  workflow: Object.freeze({
    uri: "aralearn://knowledge/workflow",
    name: "fluxo-de-autoria",
    title: "Fluxo de autoria AraLearn",
    description: "Leitura, workspace, operações atômicas e revisão com o autor."
  }),
  pedagogy: Object.freeze({
    uri: "aralearn://knowledge/pedagogy",
    name: "desenho-pedagogico",
    title: "Desenho pedagógico AraLearn",
    description: "Microteorias, práticas, continuidade e evidências de aprendizagem."
  }),
  resources: Object.freeze({
    uri: "aralearn://knowledge/resources",
    name: "resources-didaticos",
    title: "Resources didáticos AraLearn",
    description: "Critérios para selecionar e consultar resources."
  }),
  safety: Object.freeze({
    uri: "aralearn://knowledge/safety",
    name: "seguranca-e-publicacao",
    title: "Segurança e publicação AraLearn",
    description: "Confirmações, prévias privadas e publicação no catálogo."
  })
});

const INTENT_TO_TOOLS = Object.freeze({
  inspect: ["listarCursosDaBibliotecaPessoal", "listarColecoesDoCatalogo", "lerConteudoDoCurso"],
  create: ["listarCursosDaBibliotecaPessoal", "criarWorkspaceDeAutoria", "inserirEntidadeNoWorkspace"],
  extend: ["lerConteudoDoCurso", "criarWorkspaceDeAutoria", "inserirEntidadeNoWorkspace"],
  revise: ["lerWorkspaceDeAutoria", "substituirEntidadeNoWorkspace", "revisarMicroteoriasDoWorkspace"],
  restructure: ["lerWorkspaceDeAutoria", "moverEntidadeNoWorkspace", "revisarMicroteoriasDoWorkspace"],
  publish: ["lerWorkspaceDeAutoria", "revisarMicroteoriasDoWorkspace", "publicarCursoDoWorkspace"],
  study: ["listarCursosDaBibliotecaPessoal", "lerConteudoDoCurso"]
});

function normalizedTokens(value) {
  return new Set(
    String(value || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}_-]{3,}/gu) || []
  );
}

function chunkScore(chunk, { intent, targetEntity, contextTokens, resourceIds }) {
  let score = chunk.id === "operating-contract" ? 100 : 0;
  if (chunk.intents.includes(intent)) score += 12;
  if (targetEntity && chunk.entities.includes(targetEntity)) score += 7;
  const chunkTokens = normalizedTokens([...chunk.keywords, chunk.title].join(" "));
  contextTokens.forEach((token) => {
    if (chunkTokens.has(token)) score += 3;
  });
  if (resourceIds.length && chunk.group === "resources") score += 20;
  return score;
}

export function prepareAuthoringContext({
  intent,
  targetEntity = null,
  context = "",
  resourceIds = []
}) {
  const contextTokens = normalizedTokens(context);
  const ranked = KNOWLEDGE_CHUNKS
    .map((chunk) => ({
      chunk,
      score: chunkScore(chunk, { intent, targetEntity, contextTokens, resourceIds })
    }))
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id));
  const selected = [];
  for (const entry of ranked) {
    if (selected.length >= 6) break;
    if (entry.score <= 0) continue;
    selected.push(entry.chunk);
  }
  return {
    briefVersion: 1,
    intent,
    targetEntity,
    workflow: [...COMMON_WORKFLOW],
    recommendedTools: [...(INTENT_TO_TOOLS[intent] || [])],
    guidance: selected.map(({ id, title, text }) => ({ id, title, text })),
    resourceContracts: resourceIds.map((resource) => ({
      resource,
      tool: "consultarRecursoDeCard"
    }))
  };
}

export function listAuthoringKnowledgeResources() {
  return Object.values(RESOURCE_GROUPS).map((resource) => ({
    ...resource,
    mimeType: "text/markdown"
  }));
}

export function readAuthoringKnowledgeResource(uri) {
  const group = Object.entries(RESOURCE_GROUPS)
    .find(([, resource]) => resource.uri === uri)?.[0];
  if (!group) return null;
  const resource = RESOURCE_GROUPS[group];
  const chunks = KNOWLEDGE_CHUNKS.filter((chunk) => chunk.group === group);
  return {
    uri: resource.uri,
    mimeType: "text/markdown",
    text: [
      `# ${resource.title}`,
      "",
      ...chunks.flatMap((chunk) => [`## ${chunk.title}`, "", chunk.text, ""])
    ].join("\n").trim()
  };
}
