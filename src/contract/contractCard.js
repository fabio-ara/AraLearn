import { getChoiceOptionComparableValue } from "../core/choiceOptions.js";
import { parseTextGapTokens } from "../core/textGaps.js";
import { normalizeGeneratedCard } from "../domain/cards.js";

export const CONTRACT_CARD_KINDS = Object.freeze([
  "paragraph",
  "choice",
  "composite",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane"
]);

const CARD_KIND_LABELS = Object.freeze({
  paragraph: "Parágrafo",
  choice: "Escolha",
  composite: "Composto",
  code: "Código",
  table: "Tabela",
  flow: "Fluxo",
  tree: "Árvore",
  graph: "Grafo",
  relation_map: "Mapa de Relações",
  matrix: "Matriz",
  plane: "Plano"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function clone(value) {
  return structuredClone(value);
}

function renumberCard(card, position = 1) {
  return {
    ...card,
    position
  };
}

function parseGapOptions(textValue = "") {
  return parseTextGapTokens(textValue).flatMap((token) => token.options);
}

function buildStarterCard(kind = "paragraph") {
  switch (text(kind)) {
    case "choice":
      return {
        position: 1,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Nova escolha",
        question: "Qual opção está correta?",
        options: [
          { id: "a", text: "Opção correta" },
          { id: "b", text: "Distrator 1" },
          { id: "c", text: "Distrator 2" }
        ],
        answer: "a",
        after: "Revise a diferença entre a alternativa correta e os distratores."
      };
    case "code":
      return {
        position: 1,
        resource: "code",
        kind: "theory",
        exercise: "none",
        title: "Novo código",
        prompt: "Observe o exemplo.",
        language: "text",
        code: "conteudo",
        after: ""
      };
    case "composite":
      return {
        position: 1,
        resource: "composite",
        kind: "exercise",
        exercise: "choice",
        title: "Novo card composto",
        blocks: [
          {
            kind: "paragraph",
            value: "Observe os dois casos e compare a estrutura apresentada."
          },
          {
            kind: "heading",
            value: "G1"
          },
          {
            kind: "graph",
            prompt: "Observe G1.",
            vertices: [
              { id: "A", label: "A" },
              { id: "B", label: "B" }
            ],
            edges: [{ from: "A", to: "B", label: "", weight: "" }]
          },
          {
            kind: "heading",
            value: "G2"
          },
          {
            kind: "graph",
            prompt: "Observe G2.",
            vertices: [
              { id: "1", label: "1" },
              { id: "2", label: "2" }
            ],
            edges: [{ from: "1", to: "2", label: "", weight: "" }]
          },
          {
            kind: "choice",
            question: "Qual aresta de G2 corresponde a AB?",
            options: [
              { id: "a", text: "1-2" },
              { id: "b", text: "1-1" },
              { id: "c", text: "2-2" }
            ],
            answer: "a"
          }
        ],
        after: "Compare sempre as adjacências em cada um dos grafos apresentados."
      };
    case "table":
      return {
        position: 1,
        resource: "table",
        kind: "theory",
        exercise: "none",
        title: "Nova tabela",
        columns: ["Coluna 1", "Coluna 2"],
        rows: [["Valor 1", "Valor 2"]],
        after: ""
      };
    case "flow":
      return {
        position: 1,
        resource: "flow",
        kind: "theory",
        exercise: "none",
        title: "Novo fluxo",
        prompt: "Observe o fluxograma.",
        structure: {
          kind: "sequence",
          items: [
            { kind: "start", text: "Início" },
            { kind: "process", text: "Executar a etapa principal" },
            { kind: "end", text: "Fim" }
          ]
        },
        after: ""
      };
    case "tree":
      return {
        position: 1,
        resource: "tree",
        kind: "theory",
        exercise: "none",
        title: "Nova árvore",
        prompt: "Observe a estrutura.",
        nodes: [{ id: "root", label: "raiz", parentId: null, type: "folder" }],
        after: ""
      };
    case "graph":
      return {
        position: 1,
        resource: "graph",
        kind: "theory",
        exercise: "none",
        title: "Novo grafo",
        prompt: "Observe o grafo.",
        vertices: [
          { id: "A", label: "A" },
          { id: "B", label: "B" }
        ],
        edges: [{ from: "A", to: "B", label: "", weight: "" }],
        highlight: { vertices: ["A"], edges: [["A", "B"]] },
        after: ""
      };
    case "relation_map":
      return {
        position: 1,
        resource: "relation_map",
        kind: "theory",
        exercise: "none",
        title: "Novo mapa de relações",
        prompt: "Observe os conjuntos e as relações.",
        leftSet: {
          label: "U",
          items: [
            { id: "u1", label: "A" },
            { id: "u2", label: "B" }
          ]
        },
        rightSet: {
          label: "V",
          items: [
            { id: "v1", label: "1" },
            { id: "v2", label: "2" }
          ]
        },
        relations: [
          { from: "u1", to: "v1" },
          { from: "u2", to: "v2" }
        ],
        pairList: ["(A, 1)", "(B, 2)"],
        relationTable: {
          columns: ["Elemento de U", "Elemento de V"],
          rows: [["A", "1"], ["B", "2"]]
        },
        highlight: { leftItems: ["u1"], rightItems: ["v1"], relations: [["u1", "v1"]] },
        after: ""
      };
    case "matrix":
      return {
        position: 1,
        resource: "matrix",
        kind: "theory",
        exercise: "none",
        title: "Nova matriz",
        prompt: "Observe a matriz.",
        values: [["1", "0"], ["0", "1"]],
        after: ""
      };
    case "plane":
      return {
        position: 1,
        resource: "plane",
        kind: "theory",
        exercise: "none",
        title: "Novo plano",
        prompt: "Observe o plano.",
        vector: [1, 1],
        after: ""
      };
    case "paragraph":
    default:
      return {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Novo parágrafo",
        text: "Texto objetivo.",
        after: ""
      };
  }
}

export function getContractCardKind(card) {
  return text(typeof card === "string" ? card : card?.resource) || "paragraph";
}

export function getContractCardKindLabel(card) {
  const kind = getContractCardKind(card);
  return CARD_KIND_LABELS[kind] || "Card";
}

export function sanitizeContractCard(input) {
  const starter = buildStarterCard(getContractCardKind(input));
  return normalizeGeneratedCard(renumberCard({
    ...starter,
    ...(input && typeof input === "object" ? clone(input) : {})
  }, Number.isInteger(Number(input?.position)) ? Number(input.position) : 1));
}

export function createStarterContractCard(kind = "paragraph") {
  return sanitizeContractCard(buildStarterCard(kind));
}

export function listContractAnswerValues(card) {
  const normalized = sanitizeContractCard(card);
  if (normalized.resource === "composite") {
    const choiceBlock = (Array.isArray(normalized.blocks) ? normalized.blocks : []).find((block) => block?.kind === "choice");
    if (choiceBlock && Array.isArray(choiceBlock.options)) {
      return choiceBlock.options.map((option, index) => getChoiceOptionComparableValue(option, index));
    }
  }
  if (normalized.exercise === "choice" && Array.isArray(normalized.options)) {
    return normalized.options.map((option, index) => getChoiceOptionComparableValue(option, index));
  }
  if (normalized.exercise === "gap") {
    const gapSource = normalized.resource === "code" ? normalized.code : normalized.text;
    return parseGapOptions(gapSource);
  }
  return [];
}

export function cloneContractCard(card) {
  return clone(sanitizeContractCard(card));
}
