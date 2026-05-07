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
          if (typeof row === "string") {
            const separator = row.includes("|") ? "|" : ":";
            const cells = row.split(separator).map((cell) => normalizeText(cell)).slice(0, columnCount);
            while (cells.length < columnCount) cells.push("");
            return cells;
          }
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

function splitSentences(value) {
  const text = compactSpaces(value);
  if (!text) {
    return [];
  }
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return (matches || [text]).map((item) => item.trim()).filter(Boolean);
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

function extractCommandTopics(promptText) {
  const text = normalizeText(promptText);
  const commands = [];
  const seen = new Set();

  const commandPatterns = [
    /\bgit\s+(init|add|commit|push|status|log|branch|merge|pull|clone|remote)\b/gi,
    /\b(ls|cd|pwd|mkdir|touch|rm|cp|mv|chmod|grep|cat|echo)\b/gi
  ];

  commandPatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const command = compactSpaces(match[0]).toLowerCase();
      if (!seen.has(command)) {
        seen.add(command);
        commands.push(command);
      }
    }
  });

  return commands.slice(0, 4);
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

function buildCardPlans({ subject, recipe, promptText = "" }) {
  const practiceContainer = getSubjectPracticeContainer(subject);
  if (recipe === "explain_commands") {
    const commands = extractCommandTopics(promptText);
    if (commands.length >= 2) {
      const commandPlans = commands.map((command) =>
        makeCardPlan("code_example", "code", command, `Explicar ${command} com um exemplo mínimo e uma frase de uso.`)
      );
      const plans = [
        ...(commands.length >= 4
          ? commandPlans
          : [makeCardPlan("concept", "say", "Antes dos comandos", "Mostrar a ideia mínima do fluxo antes da prática."), ...commandPlans]),
        makeCardPlan("choice_check", "ask", "Verificação", "Checar a função de um comando do fluxo.")
      ];
      return plans.slice(0, 5);
    }

    return [
      makeCardPlan("concept", "say", "Ideia central", "Explicar para que serve o conjunto de comandos."),
      makeCardPlan("code_example", "code", "Comandos em contexto", "Mostrar comandos em uma sequência executável."),
      makeCardPlan("practice_gap", "say", "Recuperação ativa", "Fixar o comando principal em uma lacuna textual."),
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
    cardPlans: buildCardPlans({ subject, recipe, promptText })
  });
}

export function getAssistDraftSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
        maxItems: 4
      },
      cards: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            text: { type: "string" },
            question: { type: "string" },
            answer: { type: "string" },
            wrong: {
              type: "array",
              items: { type: "string" },
              maxItems: 3
            },
            language: { type: "string" },
            code: { type: "string" },
            columns: {
              type: "array",
              items: { type: "string" },
              maxItems: 3
            },
            rows: {
              type: "array",
              items: { type: "string" },
              maxItems: 5
            },
            flowSteps: {
              type: "array",
              items: { type: "string" },
              maxItems: 5
            },
            currentPath: { type: "string" },
            selectedPath: { type: "string" },
            paths: {
              type: "array",
              items: { type: "string" },
              maxItems: 5
            },
            after: { type: "string" }
          },
          required: ["title"],
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
    "Cada card deve ter title e os campos de conteúdo necessários ao seu contêiner.",
    "Escreva para estudante de Tecnologia em Análise e Desenvolvimento de Sistemas.",
    "Use linguagem natural simples, de iniciante para iniciante.",
    "Cada text deve ter no máximo duas frases.",
    "Separe frases em parágrafos usando uma linha em branco.",
    "Use uma ideia por card e uma ideia por frase.",
    "Evite jargão sem explicação.",
    "Não use Markdown. Não explique fora do JSON.",
    "Use [[resposta]] apenas quando o plano pedir prática, revisão ou lacuna.",
    "Para múltipla escolha, preencha question, answer e wrong.",
    "Para tabelas, preencha columns e rows; cada item de rows deve ser uma linha textual separada por |.",
    "Para comandos, use language bash e escreva só o comando do card, sem URL remota e sem sequência longa.",
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

function removeTextGaps(value) {
  return normalizeText(value).replace(/\[\[([^:\]]+)(?:::[^\]]+)?\]\]/g, "$1");
}

function formatProse(value, { allowGaps = false, maxSentences = 2 } = {}) {
  const source = allowGaps ? normalizeText(value) : removeTextGaps(value);
  const sentences = splitSentences(source).slice(0, maxSentences);
  return sentences.join("\n\n");
}

function getPlannedCommand(card) {
  const title = normalizeText(card?.title).toLowerCase();
  const match = title.match(/\b(?:git\s+)?(?:init|add|commit|push|status|log|branch|merge|pull|clone|remote|ls|cd|pwd|mkdir|touch|rm|cp|mv|chmod|grep|cat|echo)\b(?:\s+\w+)?/);
  if (!match) {
    return "";
  }
  return compactSpaces(match[0]);
}

function simplifyCode(value, card) {
  const source = normalizeText(value);
  const plannedCommand = getPlannedCommand(card);
  if (plannedCommand) {
    const matchingLine = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().startsWith(plannedCommand));
    return matchingLine || plannedCommand;
  }

  return source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n");
}

function plannedCommandText(title, topic) {
  const command = getPlannedCommand({ title });
  const descriptions = {
    "git init": "Use git init para transformar uma pasta comum em repositório Git.\n\nDepois disso, o Git consegue acompanhar mudanças nessa pasta.",
    "git add": "Use git add para preparar arquivos para o próximo registro.\n\nEle ainda não salva o histórico; só monta o conjunto do próximo commit.",
    "git commit": "Use git commit para registrar as mudanças preparadas.\n\nPense no commit como um ponto salvo da história do projeto.",
    "git push": "Use git push para enviar commits ao repositório remoto.\n\nEle só faz sentido quando já existe um destino remoto configurado.",
    "git status": "Use git status para ver o estado atual do repositório.\n\nEle mostra o que mudou e o que já está preparado.",
    "git log": "Use git log para consultar commits anteriores.\n\nEle ajuda a enxergar a história do projeto.",
    "git branch": "Use git branch para listar ou criar linhas de trabalho.\n\nUma branch separa uma mudança sem mexer diretamente no fluxo principal.",
    "git merge": "Use git merge para juntar uma branch a outra.\n\nAntes de juntar, confira se as mudanças fazem sentido juntas."
  };

  if (descriptions[command]) {
    return descriptions[command];
  }

  return `Observe uma aplicação mínima de ${topic}.\n\nUse o exemplo para reconhecer a ação principal antes de memorizar detalhes.`;
}

function convertAssistCardToContract(card) {
  const container = CONTAINERS.includes(card?.container) ? card.container : "say";
  const title = normalizeText(card?.title) || "Card";
  const allowGaps = ["practice_gap", "review"].includes(card?.role);
  const text = formatProse(card?.text, { allowGaps, maxSentences: container === "table" ? 1 : 2 });
  const after = formatProse(card?.after, { maxSentences: 1 });

  if (container === "ask") {
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      ask: formatProse(card?.question, { maxSentences: 1 }) || text || "Qual alternativa está correta?",
      answer: removeTextGaps(card?.answer) || "Resposta correta",
      wrong: normalizeList(card?.wrong, 4).length ? normalizeList(card?.wrong, 4) : ["Distrator 1", "Distrator 2"],
      ...(after ? { after } : {})
    });
  }

  if (container === "code") {
    return sanitizeContractCard({
      title,
      ...(text ? { say: text } : {}),
      language: normalizeText(card?.language) || "text",
      code: simplifyCode(card?.code, card) || "# complete o exemplo",
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
      text: plannedCommandText(title, topic),
      language: languageBySubject[subject] || "text",
      code: getPlannedCommand({ title }) || codeBySubject[subject] || `Exemplo de ${topic}`
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
  const plannedTitle = normalizeText(cardPlan?.title);
  const sourceTitle = normalizeText(source.title);
  const shouldPreferPlannedTitle = plannedRole === "code_example" && Boolean(getPlannedCommand({ title: plannedTitle }));

  return {
    ...fallback,
    ...source,
    role: plannedRole || (CARD_ROLES.includes(source.role) ? source.role : fallback.role),
    container: plannedContainer || (CONTAINERS.includes(source.container) ? source.container : fallback.container),
    title: shouldPreferPlannedTitle ? plannedTitle : sourceTitle || plannedTitle || fallback.title
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
