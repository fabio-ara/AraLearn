function serializePacket(packet) {
  return JSON.stringify(packet, null, 2);
}

function listPromptHints(packet = {}) {
  const tags = Array.isArray(packet?.currentMicrosequence?.tags) ? packet.currentMicrosequence.tags : [];
  const include = Array.isArray(packet?.module?.include) ? packet.module.include : [];
  const localText = [
    packet?.currentMicrosequence?.title,
    packet?.currentMicrosequence?.goal,
    packet?.lesson?.title,
    packet?.lesson?.goal,
    ...tags,
    ...include
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();

  const hints = [];
  if (/(modelagem por grafos|pontes de königsberg|vértices|arestas|grafo completo|grafo bipartido|isomorf)/u.test(localText)) {
    hints.push("O primeiro card deve ser resourceType graph, com content válido em vertices e edges, representando explicitamente o caso local da microssequência.");
    hints.push("Depois do card graph, explique a leitura didática do mesmo caso local sem sair da microssequência.");
  }
  if (/matriz de adjac|dijkstra|sequência de graus|graus/u.test(localText)) {
    hints.push("Se usar table, faça a tabela carregar informação realmente necessária para prova, não apenas paráfrase.");
  }
  return hints;
}

export function buildBottomUpSystemPrompt() {
  return [
    "Você materializa uma única microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Gere somente cards para a microssequência atual.",
    "Não avance para o próximo assunto.",
    "Não viole o campo exclude do módulo.",
    "Use apenas os tipos públicos de recurso solicitados.",
    "Entregue entre 4 e 6 cards.",
    "Para resourceType say, use content como string simples.",
    "Para resourceType table, use content com columns e rows.",
    "Para resourceType code, use content com code e language.",
    "Para resourceType graph, use content com vertices e edges.",
    "Em graph, use vertices com id e, quando útil, label, x e y. Use edges com from e to e, quando útil, weight ou label.",
    "Para resourceType block_gap_fill, use content como string com lacunas no formato [[resposta::opcao1|opcao2]].",
    "Se uma explicação procedural não couber bem em graph, table ou block_gap_fill, prefira say.",
    "Não use [BLANK], steps, flow, tree, objetos de tabela alternativos nem estruturas proprietárias.",
    "Não pressuponha conhecimento fora da microssequência atual, das dependências explícitas e das etapas anteriores resumidas no contexto.",
    "Se houver política de trilha local, siga-a e retorne à trilha planejada depois de esclarecer a lacuna."
  ].join(" ");
}

export function buildBottomUpUserPrompt(packet) {
  const hints = listPromptHints(packet);
  return [
    "Contexto da microssequência:",
    serializePacket(packet),
    "",
    "Crie cards didaticamente progressivos e autossuficientes para a microssequência atual.",
    "Use apenas dependências explícitas, tags e referências locais do contexto.",
    ...(hints.length ? ["", "Exigências locais:", ...hints.map((hint) => `- ${hint}`)] : [])
  ].join("\n");
}
