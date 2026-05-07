import { sanitizeContractCard } from "../contract/contractCard.js";

const SUBJECTS = [
  "programacao",
  "programacao_c",
  "portugol",
  "algoritmos_fluxograma",
  "shell_linux",
  "git_github",
  "engenharia_software",
  "administracao",
  "arquitetura_computadores",
  "logica_proposicional",
  "matrizes_vetores",
  "teoria_grafos",
  "geral"
];

const RECIPES = [
  "explain_concept",
  "compare_concepts",
  "explain_commands",
  "worked_example",
  "practice_sequence",
  "diagnostic_gap"
];

const CARD_ROLES = [
  "concept",
  "comparison",
  "example",
  "code_example",
  "table_summary",
  "flow_steps",
  "tree_context",
  "practice_gap",
  "choice_check",
  "review"
];

const CONTAINERS = ["say", "ask", "code", "table", "flow", "tree"];

const SUBJECT_LABELS = {
  programacao: "Programação",
  programacao_c: "Linguagem C",
  portugol: "Portugol",
  algoritmos_fluxograma: "Fluxogramas",
  shell_linux: "Shell Linux",
  git_github: "Git e GitHub",
  engenharia_software: "Engenharia de software",
  administracao: "Administração",
  arquitetura_computadores: "Arquitetura de computadores",
  logica_proposicional: "Lógica proposicional",
  matrizes_vetores: "Matrizes e vetores",
  teoria_grafos: "Teoria dos grafos",
  geral: "Estudo"
};

const SUBJECT_HINTS = [
  { subject: "git_github", terms: ["git", "github", "commit", "push", "add", "branch", "merge", "repositorio"] },
  { subject: "shell_linux", terms: ["shell", "linux", "bash", "terminal", "mkdir", "chmod", "grep", "ls ", "cd "] },
  { subject: "programacao_c", terms: ["linguagem c", "em c", "ponteiro", "malloc", "printf", "scanf"] },
  { subject: "portugol", terms: ["portugol", "visualg", "algoritmo em portugol"] },
  { subject: "algoritmos_fluxograma", terms: ["fluxograma", "diagrama de fluxo", "algoritmo em fluxograma"] },
  {
    subject: "engenharia_software",
    terms: ["engenharia de software", "incremental", "iterativo", "cascata", "scrum", "requisito", "uml"]
  },
  { subject: "administracao", terms: ["administracao", "missao", "visao", "valores", "empresa", "organizacional"] },
  {
    subject: "arquitetura_computadores",
    terms: ["arquitetura de computadores", "processador", "registrador", "memoria", "barramento", "cpu"]
  },
  { subject: "logica_proposicional", terms: ["logica proposicional", "proposicao", "conectivo", "implicacao", "tabela verdade"] },
  { subject: "matrizes_vetores", terms: ["matriz", "matrizes", "vetor", "vetores", "array"] },
  { subject: "teoria_grafos", terms: ["grafo", "grafos", "vertice", "aresta", "caminho minimo"] },
  { subject: "programacao", terms: ["programacao", "codigo", "funcao", "variavel", "loop", "laco"] }
];

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean).slice(0, limit)
    : [];
}

function normalizeRows(value, columnCount = 2) {
  return Array.isArray(value)
    ? value
        .map((row) => {
          if (!Array.isArray(row)) return null;
          const cells = row.map((cell) => normalizeText(cell)).slice(0, columnCount);
          while (cells.length < columnCount) cells.push("");
          return cells;
        })
        .filter((row) => row && row.some(Boolean))
        .slice(0, 6)
    : [];
}

function normalizeForMatching(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function compactSpaces(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function limitText(value, maxLength = 80) {
  const text = compactSpaces(value);
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function capitalizeText(value) {
  const text = compactSpaces(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function detectSubject(promptText, dependencyTitles = []) {
  const haystack = normalizeForMatching([promptText, ...dependencyTitles].join(" "));
  const match = SUBJECT_HINTS.find((item) => item.terms.some((term) => haystack.includes(term)));
  return match?.subject || "geral";
}

function detectRecipe(promptText) {
  const text = normalizeForMatching(promptText);
  if (/(diferenc|disting|compare|comparar|comparacao|versus|\bvs\b)/.test(text)) {
    return "compare_concepts";
  }
  if (/(comando|comandos|git |npm |mkdir|chmod|grep|push|commit|init|add)/.test(text)) {
    return "explain_commands";
  }
  if (/(exemplo|resolva|calcule|passo a passo|aplique|demonstre)/.test(text)) {
    return "worked_example";
  }
  if (/(exercicio|exercicios|pratique|treine|questoes|lista)/.test(text)) {
    return "practice_sequence";
  }
  if (/(duvida|nao entendi|lacuna|erro comum|diagnostique)/.test(text)) {
    return "diagnostic_gap";
  }
  return "explain_concept";
}

function inferPlanTitle(promptText, subject, recipe) {
  const cleaned = compactSpaces(promptText)
    .replace(/^(explique|diferencie|compare|descreva|ensine|mostre|apresente|resuma)\s+/i, "")
    .replace(/\s*,?\s*no contexto de\b.*$/i, "")
    .replace(/\s*,?\s*para\b.*$/i, "");

  if (cleaned) {
    return capitalizeText(limitText(cleaned, 72));
  }

  const recipeLabels = {
    compare_concepts: "Comparação",
    explain_commands: "Comandos essenciais",
    worked_example: "Exemplo resolvido",
    practice_sequence: "Prática guiada",
    diagnostic_gap: "Diagnóstico de lacunas",
    explain_concept: "Conceito essencial"
  };
  return `${recipeLabels[recipe] || "Estudo guiado"}: ${SUBJECT_LABELS[subject] || "tema"}`;
}

function buildPlanTags({ subject, dependencyTitles = [], promptText }) {
  const explicitTags = normalizeList(dependencyTitles, 4);
  const subjectLabel = SUBJECT_LABELS[subject] || SUBJECT_LABELS.geral;
  const titleTag = inferPlanTitle(promptText, subject, "explain_concept");
  return Array.from(new Set([...explicitTags, subjectLabel, titleTag].map(capitalizeText).filter(Boolean))).slice(0, 5);
}

function getSubjectPracticeContainer(subject) {
  if (["programacao", "programacao_c", "portugol", "shell_linux", "git_github"].includes(subject)) {
    return "code";
  }
  if (subject === "algoritmos_fluxograma") {
    return "flow";
  }
  if (["administracao", "engenharia_software", "logica_proposicional", "matrizes_vetores", "teoria_grafos"].includes(subject)) {
    return "table";
  }
  return "say";
}

function makeCardPlan(role, container, title, learningGoal) {
  return { role, container, title, learningGoal };
}

function buildCardPlans({ subject, recipe }) {
  const practiceContainer = getSubjectPracticeContainer(subject);
  if (recipe === "explain_commands") {
    return [
      makeCardPlan("concept", "say", "Ideia central", "Explicar para que serve o conjunto de comandos."),
      makeCardPlan("code_example", "code", "Comandos em contexto", "Mostrar comandos em uma sequência executável."),
      makeCardPlan("table_summary", "table", "Função de cada comando", "Distinguir comando, efeito e momento de uso."),
      makeCardPlan("choice_check", "ask", "Verificação", "Testar se o estudante reconhece o comando adequado.")
    ];
  }

  if (recipe === "compare_concepts") {
    return [
      makeCardPlan("concept", "say", "Ponto de partida", "Apresentar os conceitos que serão comparados."),
      makeCardPlan("comparison", "table", "Comparação guiada", "Contrastar critérios relevantes sem transformar tudo em sinônimo."),
      makeCardPlan("example", practiceContainer === "table" ? "say" : practiceContainer, "Exemplo aplicado", "Aplicar a diferença em situação verossímil."),
      makeCardPlan("choice_check", "ask", "Verificação", "Checar se o estudante escolhe a distinção correta."),
      makeCardPlan("review", "say", "Síntese ativa", "Fixar a diferença em uma lacuna textual.")
    ];
  }

  if (recipe === "worked_example") {
    return [
      makeCardPlan("concept", "say", "Ideia mínima", "Apresentar o conceito necessário para acompanhar o exemplo."),
      makeCardPlan("example", practiceContainer, "Exemplo resolvido", "Resolver uma situação pequena e concreta."),
      makeCardPlan("practice_gap", "say", "Complete o raciocínio", "Solicitar recuperação ativa de um passo central."),
      makeCardPlan("choice_check", "ask", "Verificação", "Confirmar a decisão principal do exemplo.")
    ];
  }

  if (recipe === "practice_sequence") {
    return [
      makeCardPlan("concept", "say", "Preparação", "Recordar o mínimo necessário antes da prática."),
      makeCardPlan("example", practiceContainer, "Modelo de resolução", "Mostrar uma referência para a prática."),
      makeCardPlan("practice_gap", "say", "Prática com lacuna", "Exigir preenchimento ativo de uma parte importante."),
      makeCardPlan("choice_check", "ask", "Checagem", "Avaliar uma decisão comum do tópico."),
      makeCardPlan("review", "say", "Retomada", "Fechar a prática com síntese recuperável.")
    ];
  }

  if (recipe === "diagnostic_gap") {
    return [
      makeCardPlan("concept", "say", "O que observar", "Identificar o ponto que costuma causar confusão."),
      makeCardPlan("comparison", "table", "Sinais de distinção", "Separar ideias parecidas por critérios explícitos."),
      makeCardPlan("practice_gap", "say", "Lacuna diagnóstica", "Testar a parte que revela a dificuldade."),
      makeCardPlan("choice_check", "ask", "Erro comum", "Distinguir uma resposta correta de um distrator plausível.")
    ];
  }

  return [
    makeCardPlan("concept", "say", "Ideia central", "Explicar o tópico em linguagem direta."),
    makeCardPlan("example", practiceContainer, "Exemplo aplicado", "Mostrar o conceito em uso."),
    makeCardPlan("practice_gap", "say", "Recuperação ativa", "Transformar parte da explicação em lacuna."),
    makeCardPlan("choice_check", "ask", "Verificação", "Checar a compreensão com alternativas plausíveis.")
  ];
}

export function buildDeterministicAssistPlan({ promptText, microsequence, dependencyTitles = [] }) {
  const subject = detectSubject(promptText, dependencyTitles);
  const recipe = detectRecipe(promptText);
  const title = inferPlanTitle(promptText, subject, recipe);
  const currentTitle = normalizeText(microsequence?.title);
  return normalizeAssistPlan({
    title: currentTitle && !/^gerador$/i.test(currentTitle) ? currentTitle : title,
    subject,
    recipe,
    goal: `Transformar "${title}" em prática revisável no AraLearn.`,
    tags: buildPlanTags({ subject, dependencyTitles, promptText }),
    cardPlans: buildCardPlans({ subject, recipe })
  });
}

function getEnumSchema(values) {
  return {
    type: "string",
    enum: values
  };
}

export function getAssistDraftSchema() {
  return {
    type: "object",
    propertyOrdering: ["title", "tags", "cards"],
    properties: {
      title: { type: "string", description: "Título final da microssequência." },
      tags: {
        type: "array",
        description: "Tags literais de organização.",
        items: { type: "string" },
        maxItems: 5
      },
      cards: {
        type: "array",
        description: "Cards preenchidos na mesma ordem do plano.",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          propertyOrdering: [
            "role",
            "container",
            "title",
            "text",
            "question",
            "answer",
            "wrong",
            "language",
            "code",
            "columns",
            "rows",
            "flowSteps",
            "currentPath",
            "selectedPath",
            "paths",
            "after"
          ],
          properties: {
            role: { ...getEnumSchema(CARD_ROLES), description: "Copie a função didática definida no plano." },
            container: { ...getEnumSchema(CONTAINERS), description: "Copie o contêiner definido no plano." },
            title: { type: "string", description: "Título do card." },
            text: { type: "string", description: "Explicação ou enunciado. Use [[resposta]] para lacunas." },
            question: { type: "string", description: "Pergunta de múltipla escolha, quando o contêiner for ask." },
            answer: { type: "string", description: "Resposta correta." },
            wrong: {
              type: "array",
              description: "Distratores plausíveis, mas incorretos.",
              items: { type: "string" },
              maxItems: 4
            },
            language: { type: "string", description: "Linguagem do bloco de código, como bash, c, portugol ou text." },
            code: { type: "string", description: "Código ou sequência de comandos." },
            columns: {
              type: "array",
              description: "Cabeçalhos da tabela.",
              items: { type: "string" },
              maxItems: 4
            },
            rows: {
              type: "array",
              description: "Linhas da tabela.",
              maxItems: 6,
              items: {
                type: "array",
                items: { type: "string" },
                maxItems: 4
              }
            },
            flowSteps: {
              type: "array",
              description: "Passos simples de um fluxograma linear.",
              items: { type: "string" },
              maxItems: 7
            },
            currentPath: { type: "string", description: "Diretório atual, quando o contêiner for tree." },
            selectedPath: { type: "string", description: "Arquivo ou diretório destacado, quando o contêiner for tree." },
            paths: {
              type: "array",
              description: "Caminhos para montar uma árvore de diretórios.",
              items: { type: "string" },
              maxItems: 8
            },
            after: { type: "string", description: "Comentário de fechamento do card." }
          },
          required: ["role", "container", "title"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "tags", "cards"],
    additionalProperties: false
  };
}

function summarizeCard(card, index) {
  const text =
    normalizeText(card?.say) ||
    normalizeText(card?.ask) ||
    normalizeText(card?.code) ||
    normalizeText(card?.title) ||
    (card?.table ? "tabela" : "") ||
    (card?.flow ? "fluxograma" : "") ||
    (card?.tree ? "árvore" : "") ||
    "card";
  return `${index + 1}. ${text}`;
}

export function summarizeMicrosequenceForAssist(microsequence) {
  if (!microsequence || typeof microsequence !== "object") {
    return "Microssequência atual: vazia.";
  }

  const tags = normalizeList(microsequence.tags, 5).join(", ") || "sem tags";
  const cards = Array.isArray(microsequence.cards) && microsequence.cards.length
    ? microsequence.cards.map(summarizeCard).join(" | ")
    : "sem cards";

  return [
    `Título atual: ${normalizeText(microsequence.title) || "Microssequência"}`,
    `Tags atuais: ${tags}`,
    `Cards atuais: ${cards}`
  ].join("\n");
}

export function buildAssistDraftPrompt({ promptText, plan, microsequence }) {
  const cardCount = Array.isArray(plan?.cardPlans) ? plan.cardPlans.length : 4;
  return [
    "Preencha o conteúdo dos cards seguindo exatamente o plano abaixo.",
    `Devolva exatamente ${cardCount} cards, na mesma ordem do plano.`,
    "Copie role, container e title do plano em cada card.",
    "Escreva para estudante de Tecnologia em Análise e Desenvolvimento de Sistemas.",
    "Use linguagem direta e exemplos verossímeis do domínio pedido.",
    "Não use Markdown. Não explique fora do JSON.",
    "Para lacunas textuais, use [[resposta]] dentro de text.",
    "Para múltipla escolha, preencha question, answer e wrong.",
    "Para comandos, prefira container code com language bash quando fizer sentido.",
    "Para C ou Portugol, prefira container code com language c ou portugol.",
    "Para fluxogramas, use flowSteps como passos textuais simples.",
    "Para diretórios, use paths com caminhos absolutos ou relativos coerentes.",
    "Microssequência atual:",
    summarizeMicrosequenceForAssist(microsequence),
    "Plano:",
    JSON.stringify(plan, null, 2),
    `Pedido original do usuário: ${promptText}`
  ].join("\n");
}

export function normalizeAssistPlan(value) {
  if (!value || typeof value !== "object") {
    fail("O serviço de IA devolveu um plano inválido.");
  }

  const cardPlans = Array.isArray(value.cardPlans) ? value.cardPlans.slice(0, 5) : [];
  if (cardPlans.length < 3) {
    fail("O serviço de IA devolveu um plano com poucos cards.");
  }

  return {
    title: normalizeText(value.title) || "Microssequência",
    subject: SUBJECTS.includes(value.subject) ? value.subject : "geral",
    recipe: RECIPES.includes(value.recipe) ? value.recipe : "explain_concept",
    goal: normalizeText(value.goal) || "Estudar o tópico solicitado.",
    tags: normalizeList(value.tags, 5),
    cardPlans: cardPlans.map((item, index) => ({
      role: CARD_ROLES.includes(item?.role) ? item.role : "concept",
      container: CONTAINERS.includes(item?.container) ? item.container : "say",
      title: normalizeText(item?.title) || `Card ${index + 1}`,
      learningGoal: normalizeText(item?.learningGoal) || "Consolidar uma parte do tópico."
    }))
  };
}

function buildTreeItemsFromPaths(paths) {
  const root = {};
  normalizeList(paths, 8).forEach((path) => {
    const parts = path.split("/").map((item) => item.trim()).filter(Boolean);
    let cursor = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1 && /\.[A-Za-z0-9]+$/.test(part);
      if (isFile) {
        cursor[part] = null;
        return;
      }
      cursor[part] = cursor[part] && typeof cursor[part] === "object" ? cursor[part] : {};
      cursor = cursor[part];
    });
  });
  return root;
}

function convertFlowStepsToContractFlow(steps) {
  const normalizedSteps = normalizeList(steps, 7);
  if (!normalizedSteps.length) {
    return [{ start: "Início" }, { end: "Fim" }];
  }

  return [
    { start: normalizedSteps[0] },
    ...normalizedSteps.slice(1, -1).map((step, index) => ({
      process: index === 0 && normalizedSteps.length > 3 ? `[[${step}]]` : step
    })),
    { end: normalizedSteps.at(-1) || "Fim" }
  ];
}

function convertAssistCardToContract(card) {
  const container = CONTAINERS.includes(card?.container) ? card.container : "say";
  const title = normalizeText(card?.title) || "Card";
  const text = normalizeText(card?.text);
  const after = normalizeText(card?.after);

  if (container === "ask") {
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      ask: normalizeText(card?.question) || text || "Qual alternativa está correta?",
      answer: normalizeText(card?.answer) || "Resposta correta",
      wrong: normalizeList(card?.wrong, 4).length ? normalizeList(card?.wrong, 4) : ["Distrator 1", "Distrator 2"],
      ...(after ? { after } : {})
    });
  }

  if (container === "code") {
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      language: normalizeText(card?.language) || "text",
      code: normalizeText(card?.code) || "# complete o exemplo",
      ...(after ? { after } : {}),
      ...(normalizeList(card?.wrong, 4).length ? { wrong: normalizeList(card?.wrong, 4) } : {})
    });
  }

  if (container === "table") {
    const columns = normalizeList(card?.columns, 4);
    const safeColumns = columns.length ? columns : ["Conceito", "Uso"];
    const rows = normalizeRows(card?.rows, safeColumns.length);
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      table: {
        columns: safeColumns,
        rows: rows.length ? rows : [["Ideia principal", normalizeText(card?.answer) || "Descrição"]]
      },
      ...(after ? { after } : {})
    });
  }

  if (container === "flow") {
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      flow: convertFlowStepsToContractFlow(card?.flowSteps),
      ...(after ? { after } : {})
    });
  }

  if (container === "tree") {
    const paths = normalizeList(card?.paths, 8);
    const current = normalizeText(card?.currentPath) || paths[0] || "/";
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      tree: {
        base: current.startsWith("/") ? "/" : ".",
        current,
        selected: normalizeText(card?.selectedPath) || current,
        items: buildTreeItemsFromPaths(paths.length ? paths : [current])
      },
      ...(after ? { after } : {})
    });
  }

  return sanitizeContractCard({
    title,
    say: text || normalizeText(card?.question) || "Leia este card e avance para a próxima prática.",
    ...(normalizeList(card?.wrong, 4).length ? { wrong: normalizeList(card?.wrong, 4) } : {}),
    ...(after ? { after } : {})
  });
}

function createFallbackAssistCard(cardPlan, { plan, promptText, index = 0 } = {}) {
  const subject = normalizeText(plan?.subject) || "geral";
  const topic = normalizeText(plan?.title) || limitText(promptText, 72) || "o tópico";
  const title = normalizeText(cardPlan?.title) || `Card ${index + 1}`;
  const role = CARD_ROLES.includes(cardPlan?.role) ? cardPlan.role : "concept";
  const container = CONTAINERS.includes(cardPlan?.container) ? cardPlan.container : "say";

  if (container === "ask") {
    return {
      role,
      container,
      title,
      question: `Qual afirmação descreve melhor ${topic}?`,
      answer: `${topic} exige identificar a ideia central antes da prática.`,
      wrong: [
        "Basta decorar palavras isoladas sem observar o contexto.",
        "A ordem dos passos não interfere na compreensão."
      ]
    };
  }

  if (container === "code") {
    const languageBySubject = {
      git_github: "bash",
      shell_linux: "bash",
      programacao_c: "c",
      portugol: "portugol",
      programacao: "text"
    };
    const codeBySubject = {
      git_github: "git status\ngit add arquivo.txt\ngit commit -m \"Registra avanço\"",
      shell_linux: "pwd\nls\nmkdir estudos",
      programacao_c: "int valor = 0;\nprintf(\"%d\\n\", valor);",
      portugol: "algoritmo \"estudo\"\ninicio\n  escreva(\"praticar\")\nfimalgoritmo"
    };
    return {
      role,
      container,
      title,
      text: `Observe uma aplicação mínima de ${topic}.`,
      language: languageBySubject[subject] || "text",
      code: codeBySubject[subject] || `Exemplo de ${topic}`
    };
  }

  if (container === "table") {
    return {
      role,
      container,
      title,
      text: `Use a tabela para separar critérios de ${topic}.`,
      columns: ["Elemento", "Função"],
      rows: [
        ["Ideia central", `Define o que precisa ser compreendido em ${topic}`],
        ["Exemplo", "Mostra o conceito em uma situação concreta"],
        ["Verificação", "Confirma se a distinção principal foi assimilada"]
      ]
    };
  }

  if (container === "flow") {
    return {
      role,
      container,
      title,
      text: `Fluxo mínimo para estudar ${topic}.`,
      flowSteps: ["Identificar o objetivo", "Separar os passos", "Executar a decisão principal", "Revisar o resultado"]
    };
  }

  if (container === "tree") {
    return {
      role,
      container,
      title,
      text: `Estrutura de arquivos relacionada a ${topic}.`,
      currentPath: "projeto",
      selectedPath: "projeto/README.md",
      paths: ["projeto/README.md", "projeto/src/app.js", "projeto/docs/anotacoes.md"]
    };
  }

  return {
    role,
    container,
    title,
    text:
      role === "practice_gap"
        ? `Para revisar ${topic}, complete a ideia central: [[${topic}]].`
        : `Estude ${topic} observando definição, exemplo e aplicação.`
  };
}

function mergeAssistCardWithPlan(card, cardPlan, context) {
  const fallback = createFallbackAssistCard(cardPlan, context);
  const source = card && typeof card === "object" ? card : {};
  const plannedContainer = CONTAINERS.includes(cardPlan?.container) ? cardPlan.container : null;
  const plannedRole = CARD_ROLES.includes(cardPlan?.role) ? cardPlan.role : null;

  return {
    ...fallback,
    ...source,
    role: plannedRole || (CARD_ROLES.includes(source.role) ? source.role : fallback.role),
    container: plannedContainer || (CONTAINERS.includes(source.container) ? source.container : fallback.container),
    title: normalizeText(source.title) || normalizeText(cardPlan?.title) || fallback.title
  };
}

export function normalizeAssistDraftResult(value, options = {}) {
  const plan = options?.plan && typeof options.plan === "object" ? options.plan : null;
  if (!value || typeof value !== "object" || (!Array.isArray(value.cards) && !plan)) {
    fail("O serviço de IA devolveu uma microssequência inválida.");
  }

  const rawCards = Array.isArray(value.cards) ? value.cards.slice(0, 5) : [];
  const plannedCards = Array.isArray(plan?.cardPlans) ? plan.cardPlans.slice(0, 5) : [];
  const cardCount = Math.min(Math.max(rawCards.length, plannedCards.length, 3), 5);
  const assistCards = Array.from({ length: cardCount }, (_, index) =>
    mergeAssistCardWithPlan(rawCards[index], plannedCards[index], {
      plan,
      promptText: options?.promptText,
      index
    })
  );
  const cards = assistCards.map(convertAssistCardToContract);
  if (cards.length < 3) {
    fail("O serviço de IA devolveu poucos cards.");
  }

  return {
    microsequenceTitle: normalizeText(value.title) || normalizeText(plan?.title) || "Microssequência",
    tags: normalizeList(value.tags, 5).length ? normalizeList(value.tags, 5) : normalizeList(plan?.tags, 5),
    cards
  };
}
