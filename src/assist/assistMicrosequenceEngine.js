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

function getEnumSchema(values) {
  return {
    type: "string",
    enum: values
  };
}

export function getAssistPlanSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      subject: getEnumSchema(SUBJECTS),
      recipe: getEnumSchema(RECIPES),
      goal: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
        maxItems: 5
      },
      cardPlans: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            role: getEnumSchema(CARD_ROLES),
            container: getEnumSchema(CONTAINERS),
            title: { type: "string" },
            learningGoal: { type: "string" }
          },
          required: ["role", "container", "title", "learningGoal"],
          additionalProperties: false
        }
      }
    },
    required: ["title", "subject", "recipe", "goal", "tags", "cardPlans"],
    additionalProperties: false
  };
}

export function getAssistDraftSchema() {
  return {
    type: "object",
    properties: {
      title: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
        maxItems: 5
      },
      cards: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            role: getEnumSchema(CARD_ROLES),
            container: getEnumSchema(CONTAINERS),
            title: { type: "string" },
            text: { type: "string" },
            question: { type: "string" },
            answer: { type: "string" },
            wrong: {
              type: "array",
              items: { type: "string" },
              maxItems: 4
            },
            language: { type: "string" },
            code: { type: "string" },
            columns: {
              type: "array",
              items: { type: "string" },
              maxItems: 4
            },
            rows: {
              type: "array",
              maxItems: 6,
              items: {
                type: "array",
                items: { type: "string" },
                maxItems: 4
              }
            },
            flowSteps: {
              type: "array",
              items: { type: "string" },
              maxItems: 7
            },
            currentPath: { type: "string" },
            selectedPath: { type: "string" },
            paths: {
              type: "array",
              items: { type: "string" },
              maxItems: 8
            },
            after: { type: "string" }
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

export function buildAssistPlanPrompt({ promptText, microsequence, dependencyTitles = [], priorMicrosequences = [] }) {
  const tags = dependencyTitles.length ? dependencyTitles.join(", ") : "sem tags explícitas";
  const prior = priorMicrosequences.length
    ? priorMicrosequences
        .map((item, index) => `Versão ${index + 1}: ${summarizeMicrosequenceForAssist(item)}`)
        .join("\n")
    : "nenhuma";

  return [
    "Crie um plano didático pequeno para o AraLearn.",
    "Escolha uma receita e entre 3 e 5 cards.",
    "Use apenas os enums do schema.",
    "Prefira sequência fixa e previsível para modelos pequenos.",
    `Tags explícitas do usuário: ${tags}`,
    "Microssequência atual:",
    summarizeMicrosequenceForAssist(microsequence),
    "Versões anteriores:",
    prior,
    `Pedido do usuário: ${promptText}`
  ].join("\n");
}

export function buildAssistDraftPrompt({ promptText, plan, microsequence }) {
  return [
    "Preencha o conteúdo dos cards seguindo exatamente o plano abaixo.",
    "Escreva para estudante de Tecnologia em Análise e Desenvolvimento de Sistemas.",
    "Use linguagem direta e exemplos verossímeis do domínio pedido.",
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

export function normalizeAssistDraftResult(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.cards)) {
    fail("O serviço de IA devolveu uma microssequência inválida.");
  }

  const cards = value.cards.slice(0, 5).map(convertAssistCardToContract);
  if (cards.length < 3) {
    fail("O serviço de IA devolveu poucos cards.");
  }

  return {
    microsequenceTitle: normalizeText(value.title) || "Microssequência",
    tags: normalizeList(value.tags, 5),
    cards
  };
}
