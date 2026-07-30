import { getChoiceOptionComparableValue } from "../core/choiceOptions.js";
import { parseTextGapTokens } from "../core/textGaps.js";
import { normalizeGeneratedCard } from "../domain/cards.js";
import { getResourceLabel, RESOURCE_TYPES } from "../domain/resources.js";

export const CONTRACT_CARD_KINDS = Object.freeze([...RESOURCE_TYPES]);

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
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [
          { id: "a", text: "Opção correta" },
          { id: "b", text: "Distrator 1" },
          { id: "c", text: "Distrator 2" }
        ],
        answerIds: ["a"],
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
            id: "intro",
            kind: "paragraph",
            value: "Observe os dois casos e compare a estrutura apresentada."
          },
          {
            id: "graph-1-heading",
            kind: "heading",
            value: "G1"
          },
          {
            layout: "auto",
            id: "graph-1",
            kind: "graph",
            prompt: "Observe G1.",
            vertices: [
              { id: "A", label: "A" },
              { id: "B", label: "B" }
            ],
            edges: [{ id: "edge-1", from: "A", to: "B", label: "", weight: "" }]
          },
          {
            id: "graph-2-heading",
            kind: "heading",
            value: "G2"
          },
          {
            layout: "auto",
            id: "graph-2",
            kind: "graph",
            prompt: "Observe G2.",
            vertices: [
              { id: "1", label: "1" },
              { id: "2", label: "2" }
            ],
            edges: [{ id: "edge-1", from: "1", to: "2", label: "", weight: "" }]
          },
          {
            id: "question",
            kind: "choice",
            question: "Qual aresta de G2 corresponde a AB?",
            selectionMode: "single",
            selectionCriterion: "correct",
            options: [
              { id: "a", text: "1-2" },
              { id: "b", text: "1-1" },
              { id: "c", text: "2-2" }
            ],
            answerIds: ["a"]
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
        variant: "filesystem",
        position: 1,
        resource: "tree",
        kind: "theory",
        exercise: "none",
        title: "Nova árvore",
        prompt: "Observe a estrutura.",
        nodes: [{ id: "root", label: "raiz", parentId: null, entryType: "directory" }],
        after: ""
      };
    case "graph":
      return {
        layout: "auto",
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
        edges: [{ id: "edge-1", from: "A", to: "B", label: "", weight: "" }],
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
    case "formula":
      return {
        position: 1,
        resource: "formula",
        kind: "theory",
        exercise: "none",
        title: "Nova fórmula",
        prompt: "Observe a expressão.",
        notation: "mathematics",
        accessibleText: "x ao quadrado",
        expression: {
          type: "superscript",
          base: { type: "identifier", value: "x" },
          exponent: { type: "number", value: "2" }
        },
        after: ""
      };
    case "chart":
      return {
        position: 1,
        resource: "chart",
        kind: "theory",
        exercise: "none",
        title: "Novo gráfico",
        prompt: "Observe a variação dos dados.",
        chartType: "line",
        xAxis: { label: "Categoria" },
        yAxis: { label: "Valor" },
        series: [{
          id: "serie-1",
          name: "Série 1",
          values: [["A", 1], ["B", 2]]
        }],
        after: ""
      };
    case "sequence":
      return {
        position: 1,
        resource: "sequence",
        kind: "theory",
        exercise: "none",
        title: "Nova sequência",
        prompt: "Observe a ordem das etapas.",
        variant: "ordered_steps",
        items: [
          { id: "etapa-1", label: "Primeira etapa" },
          { id: "etapa-2", label: "Segunda etapa" }
        ],
        after: ""
      };
    case "annotated_text":
      return {
        position: 1,
        resource: "annotated_text",
        kind: "theory",
        exercise: "none",
        title: "Novo texto anotado",
        prompt: "Relacione cada anotação ao trecho indicado.",
        segments: [{ id: "trecho-1", text: "Trecho a ser analisado." }],
        annotations: [{
          id: "anotacao-1",
          targetIds: ["trecho-1"],
          label: "Função",
          note: "Explique a função deste trecho."
        }],
        after: ""
      };
    case "linguistic_example":
      return {
        position: 1,
        resource: "linguistic_example",
        kind: "theory",
        exercise: "none",
        title: "Novo exemplo linguístico",
        prompt: "Compare forma, glosa e tradução.",
        languageTag: "pt-BR",
        writingMode: "horizontal",
        alignment: "word",
        units: [{
          id: "unidade-1",
          form: "exemplo",
          gloss: "N.SG",
          translation: "exemplo"
        }],
        after: ""
      };
    case "system_map":
      return {
        position: 1,
        resource: "system_map",
        kind: "theory",
        exercise: "none",
        title: "Novo mapa de sistema",
        prompt: "Observe os limites, componentes e conexões.",
        groups: [{
          id: "grupo-1",
          label: "Ambiente",
          kind: "boundary",
          parentId: null
        }],
        nodes: [
          {
            id: "cliente",
            label: "Cliente",
            kind: "client",
            groupId: null
          },
          {
            id: "servico",
            label: "Serviço",
            kind: "service",
            groupId: "grupo-1"
          }
        ],
        links: [{
          id: "requisicao",
          from: "cliente",
          to: "servico",
          label: "requisição",
          directed: true
        }],
        after: ""
      };
    case "reaction":
      return {
        position: 1,
        resource: "reaction",
        kind: "theory",
        exercise: "none",
        title: "Nova reação",
        prompt: "Observe reagentes, produtos e coeficientes.",
        reactionType: "forward",
        reactants: [
          {
            id: "hidrogenio",
            formula: "H2",
            name: "hidrogênio",
            coefficient: 2,
            state: "g"
          },
          {
            id: "oxigenio",
            formula: "O2",
            name: "oxigênio",
            coefficient: 1,
            state: "g"
          }
        ],
        products: [{
          id: "agua",
          formula: "H2O",
          name: "água",
          coefficient: 2,
          state: "l"
        }],
        conditions: [],
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
  return getResourceLabel(kind, "Card");
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
