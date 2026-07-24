import { buildScopedKey } from "../core/ids.js";
import { normalizeChoiceOption, getChoiceOptionComparableValue } from "../core/choiceOptions.js";
import { hasTextGapSyntax, parseTextGapTokens } from "../core/textGaps.js";
import { finalizeValidation, isPlainObject, pushError } from "../core/validation.js";
import { normalizeFlowchartStructure, validateFlowchartStructureContract } from "../flowchart/flowchartStructure.js";
import {
  CARD_EXERCISE_VALUES,
  isExerciseCardShape,
  isTheoryCardShape
} from "./cardExerciseSupport.js";
import { isSupportedResourceType } from "./resources.js";
import { isFormulaNotation, validateFormulaExpression } from "./formulaExpression.js";

const CARD_KINDS = new Set(["theory", "exercise"]);
const EXERCISE_KINDS = new Set(CARD_EXERCISE_VALUES);
const MATRIX_CONNECTORS = new Set(["=", "+", "-", "×", "*", "·", "→", "->", "⇒"]);
const MATRIX_HIGHLIGHT_PATTERNS = new Set(["mainDiagonal"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function codeText(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
}

function codeLines(value = "") {
  return String(value || "").replace(/\r\n/g, "\n").split("\n");
}

function countIndent(line = "") {
  const match = String(line || "").match(/^[ \t]*/);
  return match ? match[0].length : 0;
}

function isCodeBlockStarter(line = "", language = "") {
  const trimmed = text(line);
  if (!trimmed) {
    return false;
  }
  if (/[{[]\s*$/.test(trimmed)) {
    return true;
  }
  if (/:$/.test(trimmed)) {
    return true;
  }
  const normalizedLanguage = text(language).toLowerCase();
  if (normalizedLanguage === "python" && /(if|elif|else|for|while|def|class|try|except|finally|with|match|case)\b.*:\s*$/.test(trimmed)) {
    return true;
  }
  return false;
}

function codeNeedsIndentation(value = "", language = "") {
  const lines = codeLines(value).filter((line) => text(line));
  if (lines.length < 2) {
    return false;
  }
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index];
    if (!isCodeBlockStarter(current, language)) {
      continue;
    }
    const currentIndent = countIndent(current);
    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (!text(nextLine)) {
        continue;
      }
      const nextIndent = countIndent(nextLine);
      if (text(nextLine).startsWith("}") || /^\s*(elif|else|except|finally)\b/.test(nextLine)) {
        break;
      }
      if (nextIndent <= currentIndent) {
        return true;
      }
      break;
    }
  }
  return false;
}

function uniqueList(values = []) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((item) => text(item))
    .filter((item) => {
      const token = item.toLowerCase();
      if (!item || seen.has(token)) {
        return false;
      }
      seen.add(token);
      return true;
    });
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateObjectFields(value, allowedFields, path, errors, label = "objeto") {
  if (!isPlainObject(value)) {
    pushError(errors, path, `${label} precisa ser objeto.`);
    return false;
  }
  Object.keys(value).forEach((fieldName) => {
    if (!allowedFields.includes(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema: "${fieldName}".`);
    }
  });
  return true;
}

function isRelationalScalar(value) {
  return value === null
    || typeof value === "string"
    || typeof value === "boolean"
    || isFiniteNumber(value);
}

function validateRelationalScalar(value, path, errors, label = "valor") {
  if (!isRelationalScalar(value)) {
    pushError(errors, path, `${label} precisa ser string, número finito, booleano ou null.`);
    return false;
  }
  return true;
}

function validateUniquePrimitiveList(values, path, errors, label) {
  const seen = new Set();
  values.forEach((value, index) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      pushError(errors, `${path}[${index}]`, `${label} não pode repetir valores.`);
    }
    seen.add(key);
  });
}

function validateCoordinatePair(value, path, errors) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => isFiniteNumber(item))) {
    pushError(errors, path, "coordenada precisa ser um par numérico finito [x, y].");
    return false;
  }
  return true;
}

function validateMatrixValues(values, path, errors) {
  if (!Array.isArray(values) || !values.length) {
    pushError(errors, path, "values precisa ter ao menos uma linha.");
    return false;
  }
  if (values.length > 4) {
    pushError(errors, path, "matrix aceita no máximo 4 linhas.");
  }
  let columnCount = null;
  values.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || !row.length) {
      pushError(errors, `${path}[${rowIndex}]`, "cada linha precisa ter ao menos uma célula.");
      return;
    }
    if (row.length > 5) {
      pushError(errors, `${path}[${rowIndex}]`, "matrix aceita no máximo 5 colunas.");
    }
    if (columnCount === null) {
      columnCount = row.length;
    } else if (row.length !== columnCount) {
      pushError(errors, `${path}[${rowIndex}]`, "todas as linhas da matrix precisam ter o mesmo número de colunas.");
    }
    row.forEach((cell, cellIndex) => {
      validateRelationalScalar(cell, `${path}[${rowIndex}][${cellIndex}]`, errors, "célula da matrix");
      if (String(cell ?? "").trim().length > 80) {
        pushError(errors, `${path}[${rowIndex}][${cellIndex}]`, "cada célula da matrix aceita no máximo 80 caracteres.");
      }
    });
  });
  return true;
}

function paragraphGapPartsAreValid(value) {
  const parts = parseTextGapTokens(value);
  if (!parts.length) {
    return false;
  }
  return parts.every(({ answer, options, hasOptions, valid }) => {
    if (!valid) {
      return false;
    }
    if (!answer || answer.length > 40 || answer.split(/\s+/).filter(Boolean).length > 5) {
      return false;
    }
    return !hasOptions || options.filter((item) => item !== answer).length >= 1;
  });
}

function codeGapPartsAreValid(value) {
  const parts = parseTextGapTokens(value);
  if (!parts.length) {
    return false;
  }
  return parts.every(({ answer, options, hasOptions, valid }) => {
    if (!valid || !answer || answer.length > 120 || answer.includes("\n")) {
      return false;
    }
    if (options.some((item) => String(item || "").includes("\n"))) {
      return false;
    }
    return !hasOptions || options.filter((item) => item !== answer).length >= 1;
  });
}

function validateCommon(card, path, errors) {
  const position = Number(card?.position);
  if (!Number.isInteger(position) || position < 1) {
    pushError(errors, `${path}.position`, "position deve ser inteiro positivo.");
  }

  const resource = text(card?.resource);
  if (!isSupportedResourceType(resource)) {
    pushError(errors, `${path}.resource`, `Recurso inválido: "${resource}".`);
  }

  const kind = text(card?.kind);
  if (!CARD_KINDS.has(kind)) {
    pushError(errors, `${path}.kind`, `kind inválido: "${kind}".`);
  }

  const exercise = text(card?.exercise);
  if (!EXERCISE_KINDS.has(exercise)) {
    pushError(errors, `${path}.exercise`, `exercise inválido: "${exercise}".`);
  }

  const title = text(card?.title);
  if (!title) {
    pushError(errors, `${path}.title`, "title é obrigatório.");
  }

  return { position, resource, kind, exercise, title };
}

function validateSources(card, path, errors) {
  if (card?.sources === undefined) {
    return [];
  }
  if (!Array.isArray(card.sources)) {
    pushError(errors, `${path}.sources`, "sources deve ser array.");
    return [];
  }
  const sources = uniqueList(card.sources);
  if (sources.length !== card.sources.length) {
    pushError(errors, `${path}.sources`, "sources não pode repetir itens vazios ou duplicados.");
  }
  return sources;
}

function validateTopics(card, path, errors) {
  if (card?.topics === undefined) {
    return [];
  }
  if (!Array.isArray(card.topics)) {
    pushError(errors, `${path}.topics`, "topics deve ser array.");
    return [];
  }
  const topics = uniqueList(card.topics);
  if (topics.length !== card.topics.length) {
    pushError(errors, `${path}.topics`, "topics não pode repetir itens vazios ou duplicados.");
  }
  return topics;
}

function validateParagraph(card, path, errors) {
  if (text(card?.text) === "") {
    pushError(errors, `${path}.text`, "text é obrigatório em paragraph.");
  }
  if (text(card?.kind) === "theory") {
    if (text(card?.exercise) !== "none") {
      pushError(errors, `${path}.exercise`, 'paragraph teórico deve usar exercise "none".');
    }
    if (hasTextGapSyntax(card?.text)) {
      pushError(errors, `${path}.text`, "paragraph teórico não pode conter lacunas.");
    }
  }
  if (text(card?.kind) === "exercise") {
    if (text(card?.exercise) !== "gap") {
      pushError(errors, `${path}.exercise`, 'paragraph de exercício deve usar exercise "gap".');
    }
    if (!paragraphGapPartsAreValid(card?.text)) {
      pushError(errors, `${path}.text`, "paragraph de exercício precisa ter lacuna digitada ou por opções válida.");
    }
  }
}

function validateChoiceOption(option, path, errors, index = 0) {
  if (!isPlainObject(option)) {
    pushError(errors, path, "Opção inválida.");
    return null;
  }
  const rawKind = text(option.kind);
  if (rawKind && rawKind !== "text" && rawKind !== "code") {
    pushError(errors, `${path}.kind`, 'kind da opção deve ser "text" ou "code".');
  }
  const allowedFields = new Set(["id", "kind", "text", "language", "code"]);
  Object.keys(option).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema da opção: "${fieldName}".`);
    }
  });

  const normalized = normalizeChoiceOption(option, index);
  if (!normalized.id) {
    pushError(errors, `${path}.id`, "id é obrigatório em cada opção.");
    return null;
  }

  if (normalized.kind === "code") {
    if (!text(option?.language)) {
      pushError(errors, `${path}.language`, "language é obrigatório em opção de código.");
    }
    if (!normalized.code.trim()) {
      pushError(errors, `${path}.code`, "code é obrigatório em opção de código.");
    }
    if (codeNeedsIndentation(normalized.code, normalized.language)) {
      pushError(errors, `${path}.code`, "code multilinha da opção precisa usar indentação consistente.");
    }
    return normalized;
  }

  if (!normalized.text) {
    pushError(errors, `${path}.text`, "text é obrigatório em cada opção textual.");
  }
  return normalized;
}

function validateChoiceQuestion(card, path, errors) {
  if (!text(card?.question)) {
    pushError(errors, `${path}.question`, "question é obrigatório em exercício choice.");
  }
  if (!Array.isArray(card?.options) || card.options.length < 3 || card.options.length > 4) {
    pushError(errors, `${path}.options`, "exercise choice deve ter 3 ou 4 opções.");
    return;
  }
  const optionIds = new Set();
  const normalizedOptions = [];
  card.options.forEach((option, index) => {
    const normalized = validateChoiceOption(option, `${path}.options[${index}]`, errors, index);
    if (!normalized) {
      return;
    }
    const id = text(normalized.id);
    if (optionIds.has(id)) {
      pushError(errors, `${path}.options[${index}].id`, `id duplicado: "${id}".`);
    }
    optionIds.add(id);
    normalizedOptions.push(normalized);
  });
  const answer = text(card?.answer);
  if (!answer || !optionIds.has(answer)) {
    pushError(errors, `${path}.answer`, "answer deve apontar para um id existente.");
  }
  const correctOption = normalizedOptions.find((option) => text(option?.id) === answer) || null;
  if (
    correctOption
    && text(card?.question).toLowerCase().includes(getChoiceOptionComparableValue(correctOption).toLowerCase())
  ) {
    pushError(errors, `${path}.question`, "question não pode revelar literalmente a resposta.");
  }
}

function rejectChoiceFields(card, path, errors) {
  ["question", "options", "answer"].forEach((fieldName) => {
    if (card?.[fieldName] !== undefined) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} só é permitido em exercício choice.`);
    }
  });
}

function validateContextualChoiceExercise(card, path, errors) {
  if (text(card?.kind) === "theory") {
    if (!isTheoryCardShape(card)) {
      pushError(errors, `${path}.exercise`, `${text(card?.resource)} teórico deve usar exercise "none".`);
    }
    rejectChoiceFields(card, path, errors);
    return;
  }
  if (!isExerciseCardShape(card)) {
    pushError(errors, `${path}.exercise`, `${text(card?.resource)} de exercício deve usar exercise "choice".`);
    return;
  }
  validateChoiceQuestion(card, path, errors);
}

function validateChoice(card, path, errors) {
  if (!isExerciseCardShape(card)) {
    pushError(errors, `${path}.kind`, 'choice deve usar kind "exercise" e exercise "choice".');
    return;
  }
  validateChoiceQuestion(card, path, errors);
}

function validateCode(card, path, errors) {
  const normalizedCode = codeText(card?.code);
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em code.");
  }
  if (!text(card?.language)) {
    pushError(errors, `${path}.language`, "language é obrigatório em code.");
  }
  if (!normalizedCode.trim()) {
    pushError(errors, `${path}.code`, "code é obrigatório em code.");
  }
  if (codeNeedsIndentation(normalizedCode, card?.language)) {
    pushError(errors, `${path}.code`, "code multilinha precisa usar indentação consistente.");
  }
  if (text(card?.kind) === "theory") {
    if (!isTheoryCardShape(card)) {
      pushError(errors, `${path}.exercise`, 'code teórico deve usar exercise "none".');
    }
    rejectChoiceFields(card, path, errors);
    if (hasTextGapSyntax(normalizedCode)) {
      pushError(errors, `${path}.code`, "code teórico não pode conter lacunas.");
    }
    return;
  }
  if (text(card?.kind) !== "exercise") {
    pushError(errors, `${path}.kind`, 'code deve usar kind "theory" ou "exercise".');
    return;
  }
  if (text(card?.exercise) === "gap") {
    rejectChoiceFields(card, path, errors);
    if (!codeGapPartsAreValid(normalizedCode)) {
      pushError(errors, `${path}.code`, "code gap precisa ter lacuna digitada ou por opções válida.");
    }
    return;
  }
  if (text(card?.exercise) === "choice") {
    if (hasTextGapSyntax(normalizedCode)) {
      pushError(errors, `${path}.code`, "code choice não pode conter lacunas interativas.");
    }
    validateChoiceQuestion(card, path, errors);
    return;
  }
  pushError(errors, `${path}.exercise`, 'code de exercício deve usar exercise "gap" ou "choice".');
}

function validateFormula(card, path, errors) {
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em formula.");
  }
  if (!isFormulaNotation(card?.notation)) {
    pushError(errors, `${path}.notation`, 'notation deve ser "mathematics" ou "chemistry".');
  }
  if (!text(card?.accessibleText)) {
    pushError(errors, `${path}.accessibleText`, "accessibleText é obrigatório em formula.");
  }
  const expressionResult = validateFormulaExpression(card?.expression, `${path}.expression`);
  expressionResult.errors.forEach((entry) => pushError(errors, entry.path, entry.message));
  validateContextualChoiceExercise(card, path, errors);
}

function validateTable(card, path, errors) {
  if (!Array.isArray(card?.columns) || !card.columns.length) {
    pushError(errors, `${path}.columns`, "table precisa de columns.");
  }
  if (!Array.isArray(card?.rows) || !card.rows.length) {
    pushError(errors, `${path}.rows`, "table precisa de rows.");
  } else {
    const expectedColumns = Array.isArray(card?.columns) ? card.columns.length : 0;
    card.rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row) || !row.length) {
        pushError(errors, `${path}.rows[${rowIndex}]`, "cada linha da table precisa ter ao menos uma célula.");
        return;
      }
      if (expectedColumns && row.length !== expectedColumns) {
        pushError(
          errors,
          `${path}.rows[${rowIndex}]`,
          `cada linha da table precisa ter ${expectedColumns} células para acompanhar columns.`
        );
      }
    });
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateFlow(card, path, errors) {
  if (!card?.structure || typeof card.structure !== "object" || Array.isArray(card.structure)) {
    pushError(errors, `${path}.structure`, "flow precisa de structure.");
    validateContextualChoiceExercise(card, path, errors);
    return;
  }

  const contractResult = validateFlowchartStructureContract(card.structure);
  if (!contractResult.valid) {
    contractResult.findings.forEach((finding, index) => {
      pushError(errors, `${path}.structure[${index}]`, `estrutura inválida em flow: ${finding}.`);
    });
  }

  const normalized = normalizeFlowchartStructure(card.structure);
  if (!normalized || normalized.kind !== "sequence") {
    pushError(errors, `${path}.structure`, "flow precisa de uma raiz sequence válida.");
  } else if (!Array.isArray(normalized.items) || !normalized.items.length) {
    pushError(errors, `${path}.structure.items`, "flow precisa de ao menos um item na sequence raiz.");
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateTree(card, path, errors) {
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em tree.");
  }
  if (!Array.isArray(card?.nodes) || !card.nodes.length) {
    pushError(errors, `${path}.nodes`, "tree precisa de nodes.");
    return;
  }
  const nodeIds = new Set();
  const nodesById = new Map();
  let rootCount = 0;
  card.nodes.forEach((node, index) => {
    Object.keys(node || {}).forEach((fieldName) => {
      if (!["id", "label", "type", "parentId"].includes(fieldName)) {
        pushError(errors, `${path}.nodes[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const id = text(node?.id);
    if (!id) {
      pushError(errors, `${path}.nodes[${index}].id`, "id é obrigatório em tree.");
      return;
    }
    if (nodeIds.has(id)) {
      pushError(errors, `${path}.nodes[${index}].id`, `id duplicado em tree: "${id}".`);
    }
    nodeIds.add(id);
    nodesById.set(id, { node, index });
    if (!text(node?.label)) {
      pushError(errors, `${path}.nodes[${index}].label`, "label é obrigatório em tree.");
    }
    if (node?.type !== "folder" && node?.type !== "file") {
      pushError(errors, `${path}.nodes[${index}].type`, 'tree.type deve ser "folder" ou "file".');
    }
    if (node?.parentId !== null && node?.parentId !== undefined && !text(node?.parentId)) {
      pushError(errors, `${path}.nodes[${index}].parentId`, "parentId deve ser string ou null.");
    } else if (node?.parentId === null || node?.parentId === undefined) {
      rootCount += 1;
    }
  });
  card.nodes.forEach((node, index) => {
    const id = text(node?.id);
    const parentId = text(node?.parentId);
    if (!id || !parentId) return;
    if (parentId === id) {
      pushError(errors, `${path}.nodes[${index}].parentId`, "Um nó não pode ser pai de si mesmo.");
      return;
    }
    const parent = nodesById.get(parentId);
    if (!parent) {
      pushError(errors, `${path}.nodes[${index}].parentId`, `Nó pai inexistente: "${parentId}".`);
      return;
    }
    if (parent.node?.type !== "folder") {
      pushError(errors, `${path}.nodes[${index}].parentId`, 'Somente um nó de ramo (type "folder") pode conter filhos.');
    }
  });
  if (rootCount === 0) {
    pushError(errors, `${path}.nodes`, "tree precisa de ao menos um nó raiz.");
  }
  const reportedCycles = new Set();
  for (const [startId, entry] of nodesById) {
    const visited = new Set();
    let currentId = startId;
    while (currentId) {
      if (visited.has(currentId)) {
        const signature = [...visited].sort().join("|");
        if (!reportedCycles.has(signature)) {
          reportedCycles.add(signature);
          pushError(errors, `${path}.nodes[${entry.index}].parentId`, "tree não pode conter ciclo.");
        }
        break;
      }
      visited.add(currentId);
      const current = nodesById.get(currentId)?.node;
      const parentId = text(current?.parentId);
      if (!parentId || !nodesById.has(parentId)) break;
      currentId = parentId;
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateGraph(card, path, errors) {
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em graph.");
  }
  const vertices = Array.isArray(card?.vertices) ? card.vertices : [];
  const edges = Array.isArray(card?.edges) ? card.edges : [];
  if (!vertices.length) {
    pushError(errors, `${path}.vertices`, "graph precisa de vertices.");
    return;
  }
  const vertexIds = new Set();
  vertices.forEach((vertex, index) => {
    Object.keys(vertex || {}).forEach((fieldName) => {
      if (!["id", "label", "x", "y"].includes(fieldName)) {
        pushError(errors, `${path}.vertices[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const id = text(vertex?.id);
    if (!id) {
      pushError(errors, `${path}.vertices[${index}].id`, "id é obrigatório em graph.");
      return;
    }
    if (vertexIds.has(id)) {
      pushError(errors, `${path}.vertices[${index}].id`, `id duplicado em graph: "${id}".`);
    }
    vertexIds.add(id);
    if (!text(vertex?.label)) {
      pushError(errors, `${path}.vertices[${index}].label`, "label é obrigatório em graph.");
    }
    ["x", "y"].forEach((coordinate) => {
      if (vertex?.[coordinate] !== undefined && !Number.isFinite(vertex[coordinate])) {
        pushError(errors, `${path}.vertices[${index}].${coordinate}`, `${coordinate} deve ser número finito.`);
      } else if (Number.isFinite(vertex?.[coordinate]) && (vertex[coordinate] < 0 || vertex[coordinate] > 100)) {
        pushError(errors, `${path}.vertices[${index}].${coordinate}`, `${coordinate} deve ficar entre 0 e 100.`);
      }
    });
  });
  const edgeKeys = new Set();
  edges.forEach((edge, index) => {
    Object.keys(edge || {}).forEach((fieldName) => {
      if (!["from", "to", "label", "weight", "directed"].includes(fieldName)) {
        pushError(errors, `${path}.edges[${index}].${fieldName}`, `Campo fora do schema: "${fieldName}".`);
      }
    });
    const [from, to] = [text(edge?.from), text(edge?.to)];
    if (!from || !to || !vertexIds.has(from) || !vertexIds.has(to)) {
      pushError(errors, `${path}.edges[${index}]`, "Toda aresta precisa ligar vertices existentes.");
    }
    const edgeKey = JSON.stringify([from, to, text(edge?.label), text(edge?.weight), edge?.directed === true]);
    if (edgeKeys.has(edgeKey)) {
      pushError(errors, `${path}.edges[${index}]`, "Aresta duplicada em graph.");
    }
    edgeKeys.add(edgeKey);
    ["label", "weight"].forEach((fieldName) => {
      if (edge?.[fieldName] !== undefined && typeof edge[fieldName] !== "string") {
        pushError(errors, `${path}.edges[${index}].${fieldName}`, `${fieldName} da aresta deve ser texto.`);
      }
    });
    if (edge?.directed !== undefined && typeof edge.directed !== "boolean") {
      pushError(errors, `${path}.edges[${index}].directed`, "directed da aresta deve ser booleano.");
    }
  });
  if (card?.highlight !== undefined) {
    if (validateObjectFields(
      card.highlight,
      ["vertices", "edges"],
      `${path}.highlight`,
      errors,
      "highlight de graph"
    )) {
      if (card.highlight.vertices !== undefined) {
        if (!Array.isArray(card.highlight.vertices) || !card.highlight.vertices.length) {
          pushError(errors, `${path}.highlight.vertices`, "vertices precisa ter ao menos um id destacado.");
        } else {
          card.highlight.vertices.forEach((value, index) => {
            const id = text(value);
            if (!id || !vertexIds.has(id)) {
              pushError(errors, `${path}.highlight.vertices[${index}]`, `Vértice destacado inexistente: "${id}".`);
            }
          });
          validateUniquePrimitiveList(card.highlight.vertices, `${path}.highlight.vertices`, errors, "vertices");
        }
      }
      if (card.highlight.edges !== undefined) {
        if (!Array.isArray(card.highlight.edges) || !card.highlight.edges.length) {
          pushError(errors, `${path}.highlight.edges`, "edges precisa ter ao menos uma aresta destacada.");
        } else {
          const graphConnections = new Set(edges.map((edge) => JSON.stringify([text(edge?.from), text(edge?.to)])));
          const highlightedConnections = [];
          card.highlight.edges.forEach((pair, index) => {
            if (!Array.isArray(pair) || pair.length !== 2) {
              pushError(errors, `${path}.highlight.edges[${index}]`, "aresta destacada precisa usar [from, to].");
              return;
            }
            const key = JSON.stringify([text(pair[0]), text(pair[1])]);
            highlightedConnections.push(key);
            if (!graphConnections.has(key)) {
              pushError(errors, `${path}.highlight.edges[${index}]`, "aresta destacada precisa existir em edges.");
            }
          });
          validateUniquePrimitiveList(highlightedConnections, `${path}.highlight.edges`, errors, "edges");
        }
      }
      if (!["vertices", "edges"].some((fieldName) => card.highlight[fieldName] !== undefined)) {
        pushError(errors, `${path}.highlight`, "highlight de graph precisa indicar vertices ou edges.");
      }
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validateRelationSet(setValue, path, errors) {
  if (!validateObjectFields(setValue, ["label", "items"], path, errors, "conjunto")) {
    return { ids: new Set(), labels: [] };
  }
  const label = text(setValue.label);
  if (!label) {
    pushError(errors, `${path}.label`, "label é obrigatório no conjunto.");
  }
  const items = Array.isArray(setValue.items) ? setValue.items : [];
  if (!items.length) {
    pushError(errors, `${path}.items`, "items precisa ter ao menos um item.");
    return { ids: new Set(), labels: [] };
  }
  const ids = new Set();
  const labels = [];
  items.forEach((item, index) => {
    if (!validateObjectFields(item, ["id", "label"], `${path}.items[${index}]`, errors, "item do conjunto")) {
      return;
    }
    const id = text(item?.id);
    const itemLabel = text(item?.label);
    if (!id) {
      pushError(errors, `${path}.items[${index}].id`, "id é obrigatório em cada item.");
      return;
    }
    if (ids.has(id)) {
      pushError(errors, `${path}.items[${index}].id`, `id duplicado no conjunto: "${id}".`);
    }
    ids.add(id);
    if (!itemLabel) {
      pushError(errors, `${path}.items[${index}].label`, "label é obrigatório em cada item.");
    }
    labels.push(itemLabel);
  });
  return { ids, labels };
}

function validateRelationHighlight(highlight, path, errors, leftIds, rightIds, relationKeys) {
  if (highlight === undefined) return;
  if (!validateObjectFields(
    highlight,
    ["leftItems", "rightItems", "relations"],
    path,
    errors,
    "highlight de relation_map"
  )) {
    return;
  }

  const validateIds = (fieldName, validIds) => {
    if (highlight[fieldName] === undefined) return;
    if (!Array.isArray(highlight[fieldName]) || !highlight[fieldName].length) {
      pushError(errors, `${path}.${fieldName}`, `${fieldName} precisa ter ao menos um id.`);
      return;
    }
    highlight[fieldName].forEach((value, index) => {
      const id = text(value);
      if (!id || !validIds.has(id)) {
        pushError(errors, `${path}.${fieldName}[${index}]`, `Item destacado inexistente: "${id}".`);
      }
    });
    validateUniquePrimitiveList(highlight[fieldName], `${path}.${fieldName}`, errors, fieldName);
  };

  validateIds("leftItems", leftIds);
  validateIds("rightItems", rightIds);
  if (highlight.relations !== undefined) {
    if (!Array.isArray(highlight.relations) || !highlight.relations.length) {
      pushError(errors, `${path}.relations`, "relations precisa ter ao menos um par destacado.");
    } else {
      const highlightedKeys = [];
      highlight.relations.forEach((pair, index) => {
        if (!Array.isArray(pair) || pair.length !== 2) {
          pushError(errors, `${path}.relations[${index}]`, "relação destacada precisa usar [from, to].");
          return;
        }
        const key = JSON.stringify([text(pair[0]), text(pair[1])]);
        highlightedKeys.push(key);
        if (!relationKeys.has(key)) {
          pushError(errors, `${path}.relations[${index}]`, "relação destacada precisa existir em relations.");
        }
      });
      validateUniquePrimitiveList(highlightedKeys, `${path}.relations`, errors, "relations");
    }
  }
  if (!["leftItems", "rightItems", "relations"].some((fieldName) => highlight[fieldName] !== undefined)) {
    pushError(errors, path, "highlight de relation_map precisa indicar ao menos uma seleção.");
  }
}

function validateRelationTable(table, path, errors) {
  if (!validateObjectFields(table, ["columns", "rows"], path, errors, "relationTable")) return;
  const columns = Array.isArray(table.columns) ? table.columns : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];
  if (columns.length !== 2) {
    pushError(errors, `${path}.columns`, "relationTable.columns precisa ter exatamente 2 colunas.");
  }
  columns.forEach((column, index) => {
    if (typeof column !== "string" || !text(column)) {
      pushError(errors, `${path}.columns[${index}]`, "cada coluna de relationTable precisa ser texto não vazio.");
    }
  });
  if (!rows.length) {
    pushError(errors, `${path}.rows`, "relationTable.rows precisa ter ao menos uma linha.");
  }
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== 2) {
      pushError(errors, `${path}.rows[${rowIndex}]`, "cada linha de relationTable precisa ter exatamente 2 células.");
      return;
    }
    row.forEach((cell, columnIndex) => {
      validateRelationalScalar(cell, `${path}.rows[${rowIndex}][${columnIndex}]`, errors, "célula de relationTable");
    });
  });
}

function validateRelationMap(card, path, errors) {
  if (!text(card?.prompt)) {
    pushError(errors, `${path}.prompt`, "prompt é obrigatório em relation_map.");
  }
  const left = validateRelationSet(card?.leftSet, `${path}.leftSet`, errors);
  const right = validateRelationSet(card?.rightSet, `${path}.rightSet`, errors);
  const relations = Array.isArray(card?.relations) ? card.relations : [];
  if (!Array.isArray(card?.relations) || !relations.length) {
    pushError(errors, `${path}.relations`, "relation_map precisa de relations.");
  }
  const relationKeys = new Set();
  relations.forEach((relation, index) => {
    if (!validateObjectFields(
      relation,
      ["from", "to", "label"],
      `${path}.relations[${index}]`,
      errors,
      "relation"
    )) {
      return;
    }
    const from = text(relation?.from);
    const to = text(relation?.to);
    if (!from || !to || !left.ids.has(from) || !right.ids.has(to)) {
      pushError(errors, `${path}.relations[${index}]`, "cada relation precisa ligar itens válidos de leftSet e rightSet.");
    }
    if (relation?.label !== undefined && typeof relation.label !== "string") {
      pushError(errors, `${path}.relations[${index}].label`, "label da relation deve ser texto.");
    }
    const relationKey = JSON.stringify([from, to]);
    if (relationKeys.has(relationKey)) {
      pushError(errors, `${path}.relations[${index}]`, "relation_map não pode repetir a mesma relação.");
    }
    relationKeys.add(relationKey);
  });
  if (card?.pairList !== undefined) {
    if (!Array.isArray(card.pairList)) {
      pushError(errors, `${path}.pairList`, "pairList deve ser array.");
    } else {
      card.pairList.forEach((value, index) => {
        if (typeof value !== "string" || !text(value)) {
          pushError(errors, `${path}.pairList[${index}]`, "cada item de pairList precisa ser texto não vazio.");
        }
      });
    }
  }
  if (card?.relationTable !== undefined) {
    validateRelationTable(card.relationTable, `${path}.relationTable`, errors);
  }
  validateRelationHighlight(card?.highlight, `${path}.highlight`, errors, left.ids, right.ids, relationKeys);
  validateContextualChoiceExercise(card, path, errors);
}

function normalizeGraphVertices(vertices = []) {
  return (Array.isArray(vertices) ? vertices : []).map((vertex, index) => ({
    id: text(vertex?.id) || `V${index + 1}`,
    label: text(vertex?.label) || text(vertex?.id) || `V${index + 1}`,
    ...(vertex?.x !== undefined ? { x: vertex.x } : {}),
    ...(vertex?.y !== undefined ? { y: vertex.y } : {})
  }));
}

function normalizeGraphEdges(edges = []) {
  return (Array.isArray(edges) ? edges : []).map((edge) => ({
    from: text(edge?.from),
    to: text(edge?.to),
    ...(text(edge?.label) ? { label: text(edge.label) } : {}),
    ...(text(edge?.weight) ? { weight: text(edge.weight) } : {}),
    ...(typeof edge?.directed === "boolean" ? { directed: edge.directed } : {})
  }));
}

function normalizeRelationSetOutput(setValue = {}, fallbackPrefix = "item") {
  return {
    label: text(setValue?.label),
    items: (Array.isArray(setValue?.items) ? setValue.items : []).map((item, index) => ({
      id: text(item?.id) || `${fallbackPrefix}${index + 1}`,
      label: text(item?.label) || text(item?.id) || `${fallbackPrefix}${index + 1}`
    }))
  };
}

function allowedCompositeBlockFields(kind = "") {
  const perKind = {
    heading: ["kind", "value"],
    paragraph: ["kind", "value"],
    choice: ["kind", "question", "options", "answer"],
    code: ["kind", "prompt", "language", "code"],
    table: ["kind", "columns", "rows"],
    flow: ["kind", "prompt", "structure"],
    tree: ["kind", "prompt", "nodes"],
    graph: ["kind", "prompt", "vertices", "edges", "highlight"],
    relation_map: ["kind", "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight"],
    matrix: ["kind", "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence"],
    plane: ["kind", "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result"],
    formula: ["kind", "prompt", "notation", "accessibleText", "expression"]
  };
  return new Set(perKind[kind] || ["kind"]);
}

function validateCompositeBlockUnknownFields(block, path, errors, kind = "") {
  const allowed = allowedCompositeBlockFields(kind);
  Object.keys(block || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema do bloco composto: "${fieldName}".`);
    }
  });
}

function normalizeCompositeBlock(block = {}) {
  const kind = text(block?.kind);
  if (kind === "heading" || kind === "paragraph") {
    return {
      kind,
      value: text(block?.value)
    };
  }
  if (kind === "choice") {
    return {
      kind,
      question: text(block?.question),
      options: (Array.isArray(block?.options) ? block.options : []).map((option, index) => normalizeChoiceOption(option, index)),
      answer: text(block?.answer)
    };
  }
  if (kind === "code") {
    return {
      kind,
      prompt: text(block?.prompt),
      language: text(block?.language),
      code: codeText(block?.code)
    };
  }
  if (kind === "table") {
    return {
      kind,
      columns: (Array.isArray(block?.columns) ? block.columns : []).map((item) => text(item)),
      rows: (Array.isArray(block?.rows) ? block.rows : []).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
    };
  }
  if (kind === "flow") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      structure: structuredClone(normalizeFlowchartStructure(block?.structure))
    };
  }
  if (kind === "tree") {
    return {
      kind,
      prompt: text(block?.prompt),
      nodes: structuredClone(Array.isArray(block?.nodes) ? block.nodes : [])
    };
  }
  if (kind === "graph") {
    return {
      kind,
      prompt: text(block?.prompt),
      vertices: normalizeGraphVertices(block?.vertices),
      edges: normalizeGraphEdges(block?.edges),
      ...(block?.highlight && typeof block.highlight === "object" ? { highlight: structuredClone(block.highlight) } : {})
    };
  }
  if (kind === "relation_map") {
    return {
      kind,
      prompt: text(block?.prompt),
      leftSet: normalizeRelationSetOutput(block?.leftSet, "u"),
      rightSet: normalizeRelationSetOutput(block?.rightSet, "v"),
      relations: (Array.isArray(block?.relations) ? block.relations : []).map((relation) => ({
        from: text(relation?.from),
        to: text(relation?.to),
        ...(text(relation?.label) ? { label: text(relation.label) } : {})
      })),
      ...(Array.isArray(block?.pairList) ? { pairList: structuredClone(block.pairList) } : {}),
      ...(block?.relationTable && typeof block.relationTable === "object" ? { relationTable: structuredClone(block.relationTable) } : {}),
      ...(block?.highlight && typeof block.highlight === "object" ? { highlight: structuredClone(block.highlight) } : {})
    };
  }
  if (kind === "matrix") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      ...(text(block?.name) ? { name: text(block.name) } : {}),
      ...(Array.isArray(block?.values) ? { values: structuredClone(block.values) } : {}),
      ...(block?.highlight !== undefined ? { highlight: structuredClone(block.highlight) } : {}),
      ...(block?.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(block.dividerAfterColumn) } : {}),
      ...(Array.isArray(block?.sequence) ? { sequence: structuredClone(block.sequence) } : {})
    };
  }
  if (kind === "plane") {
    return {
      kind,
      ...(text(block?.prompt) ? { prompt: text(block.prompt) } : {}),
      ...(Array.isArray(block?.x) ? { x: structuredClone(block.x) } : {}),
      ...(Array.isArray(block?.y) ? { y: structuredClone(block.y) } : {}),
      ...(Array.isArray(block?.vector) ? { vector: structuredClone(block.vector) } : {}),
      ...(Array.isArray(block?.vectors) ? { vectors: structuredClone(block.vectors) } : {}),
      ...(Array.isArray(block?.sum) ? { sum: structuredClone(block.sum) } : {}),
      ...(block?.scale && typeof block.scale === "object" ? { scale: structuredClone(block.scale) } : {}),
      ...(Array.isArray(block?.distance) ? { distance: structuredClone(block.distance) } : {}),
      ...(Array.isArray(block?.result) || typeof block?.result === "string" ? { result: structuredClone(block.result) } : {})
    };
  }
  if (kind === "formula") {
    return {
      kind,
      prompt: text(block?.prompt),
      notation: text(block?.notation),
      accessibleText: text(block?.accessibleText),
      expression: structuredClone(block?.expression)
    };
  }
  return {
    kind: "paragraph",
    value: text(block?.value)
  };
}

function validateCompositeBlock(block, path, errors) {
  if (!isPlainObject(block)) {
    pushError(errors, path, "bloco de composite deve ser objeto.");
    return null;
  }
  const kind = text(block?.kind);
  const allowedKinds = new Set(["heading", "paragraph", "choice", "code", "table", "flow", "tree", "graph", "relation_map", "matrix", "plane", "formula"]);
  if (!allowedKinds.has(kind)) {
    pushError(errors, `${path}.kind`, `kind inválido em composite: "${kind}".`);
    return null;
  }
  validateCompositeBlockUnknownFields(block, path, errors, kind);
  if (kind === "heading" || kind === "paragraph") {
    if (!text(block?.value)) {
      pushError(errors, `${path}.value`, `${kind} em composite precisa de value.`);
    }
  } else if (kind === "choice") {
    validateChoice({
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      question: block?.question,
      options: block?.options,
      answer: block?.answer
    }, path, errors);
  } else if (kind === "code") {
    validateCode({
      resource: "code",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      language: block?.language,
      code: block?.code
    }, path, errors);
  } else if (kind === "table") {
    validateTable({
      resource: "table",
      kind: "theory",
      exercise: "none",
      columns: block?.columns,
      rows: block?.rows
    }, path, errors);
  } else if (kind === "flow") {
    validateFlow({
      resource: "flow",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      structure: block?.structure
    }, path, errors);
  } else if (kind === "tree") {
    validateTree({
      resource: "tree",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      nodes: block?.nodes
    }, path, errors);
  } else if (kind === "graph") {
    validateGraph({
      resource: "graph",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      vertices: block?.vertices,
      edges: block?.edges,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "relation_map") {
    validateRelationMap({
      resource: "relation_map",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      leftSet: block?.leftSet,
      rightSet: block?.rightSet,
      relations: block?.relations,
      pairList: block?.pairList,
      relationTable: block?.relationTable,
      highlight: block?.highlight
    }, path, errors);
  } else if (kind === "matrix") {
    validateMatrix({
      resource: "matrix",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      name: block?.name,
      values: block?.values,
      highlight: block?.highlight,
      dividerAfterColumn: block?.dividerAfterColumn,
      sequence: block?.sequence
    }, path, errors);
  } else if (kind === "plane") {
    validatePlane({
      resource: "plane",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      x: block?.x,
      y: block?.y,
      vector: block?.vector,
      vectors: block?.vectors,
      sum: block?.sum,
      scale: block?.scale,
      distance: block?.distance,
      result: block?.result
    }, path, errors);
  } else if (kind === "formula") {
    validateFormula({
      resource: "formula",
      kind: "theory",
      exercise: "none",
      prompt: block?.prompt,
      notation: block?.notation,
      accessibleText: block?.accessibleText,
      expression: block?.expression
    }, path, errors);
  }
  return normalizeCompositeBlock(block);
}

function validateComposite(card, path, errors) {
  const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
  if (!blocks.length) {
    pushError(errors, `${path}.blocks`, "composite precisa de blocks.");
    return [];
  }
  const normalizedBlocks = blocks.map((block, index) => validateCompositeBlock(block, `${path}.blocks[${index}]`, errors)).filter(Boolean);
  const choiceBlocks = normalizedBlocks.filter((block) => block.kind === "choice");
  if (text(card?.kind) === "theory") {
    if (text(card?.exercise) !== "none") {
      pushError(errors, `${path}.exercise`, 'composite teórico deve usar exercise "none".');
    }
    if (choiceBlocks.length) {
      pushError(errors, `${path}.blocks`, "composite teórico não pode conter bloco choice.");
    }
  }
  if (text(card?.kind) === "exercise") {
    if (text(card?.exercise) !== "choice") {
      pushError(errors, `${path}.exercise`, 'composite de exercício deve usar exercise "choice".');
    }
    if (choiceBlocks.length !== 1) {
      pushError(errors, `${path}.blocks`, "composite de exercício precisa de exatamente um bloco choice.");
    }
  }
  return normalizedBlocks;
}

function validateAfterBlocks(card, path, errors) {
  if (card?.afterBlocks === undefined) {
    return [];
  }
  if (!Array.isArray(card.afterBlocks)) {
    pushError(errors, `${path}.afterBlocks`, "afterBlocks deve ser array.");
    return [];
  }
  if (!card.afterBlocks.length) {
    pushError(errors, `${path}.afterBlocks`, "afterBlocks não pode ser vazio quando informado.");
    return [];
  }
  return card.afterBlocks
    .map((block, index) => {
      const blockPath = `${path}.afterBlocks[${index}]`;
      if (text(block?.kind) === "choice") {
        pushError(errors, `${blockPath}.kind`, "afterBlocks não aceita bloco choice.");
        return null;
      }
      if (text(block?.kind) === "paragraph" && hasTextGapSyntax(block?.value)) {
        pushError(errors, `${blockPath}.value`, "afterBlocks não pode conter lacunas interativas.");
      }
      if (text(block?.kind) === "code" && hasTextGapSyntax(block?.code)) {
        pushError(errors, `${blockPath}.code`, "afterBlocks não pode conter lacunas interativas.");
      }
      return validateCompositeBlock(block, blockPath, errors);
    })
    .filter(Boolean);
}

function validateAfter(card, path, errors) {
  if (card?.after !== undefined && typeof card.after !== "string") {
    pushError(errors, `${path}.after`, "after deve ser texto.");
    return;
  }
  if (hasTextGapSyntax(card?.after)) {
    pushError(errors, `${path}.after`, "after não pode conter lacunas interativas.");
  }
}

function validateMatrixHighlightItemCoordinates(entry, path, errors, rowCount, columnCount) {
  if (!Array.isArray(entry) || entry.length !== 2) {
    pushError(errors, path, "cada célula destacada precisa usar [linha, coluna].");
    return;
  }
  const rowIndex = Number(entry[0]);
  const columnIndex = Number(entry[1]);
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) {
    pushError(errors, path, "cada célula destacada precisa usar índices inteiros.");
    return;
  }
  if (rowIndex < 0 || rowIndex >= rowCount || columnIndex < 0 || columnIndex >= columnCount) {
    pushError(errors, path, "célula destacada fora dos limites da matrix.");
  }
}

function validateMatrixHighlight(highlight, path, errors, rowCount, columnCount) {
  if (highlight === undefined) {
    return;
  }
  if (!isPlainObject(highlight)) {
    pushError(errors, path, "highlight da matrix precisa ser objeto.");
    return;
  }

  const allowedFields = new Set(["pattern", "cells", "rows", "columns"]);
  Object.keys(highlight).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `campo inválido em matrix.highlight: "${fieldName}".`);
    }
  });

  let hasSelection = false;
  if (highlight.pattern !== undefined) {
    const pattern = text(highlight.pattern);
    if (!MATRIX_HIGHLIGHT_PATTERNS.has(pattern)) {
      pushError(errors, `${path}.pattern`, `pattern inválido em matrix.highlight: "${pattern}".`);
    } else {
      hasSelection = true;
    }
  }
  if (highlight.cells !== undefined) {
    if (!Array.isArray(highlight.cells) || !highlight.cells.length) {
      pushError(errors, `${path}.cells`, "cells precisa ter ao menos uma coordenada.");
    } else {
      highlight.cells.forEach((entry, index) => {
        validateMatrixHighlightItemCoordinates(entry, `${path}.cells[${index}]`, errors, rowCount, columnCount);
      });
      validateUniquePrimitiveList(highlight.cells, `${path}.cells`, errors, "cells");
      hasSelection = true;
    }
  }
  if (highlight.rows !== undefined) {
    if (!Array.isArray(highlight.rows) || !highlight.rows.length) {
      pushError(errors, `${path}.rows`, "rows precisa ter ao menos um índice.");
    } else {
      highlight.rows.forEach((rowIndex, index) => {
        const safeRow = Number(rowIndex);
        if (!Number.isInteger(safeRow) || safeRow < 0 || safeRow >= rowCount) {
          pushError(errors, `${path}.rows[${index}]`, "índice de linha destacado fora dos limites da matrix.");
        }
      });
      validateUniquePrimitiveList(highlight.rows, `${path}.rows`, errors, "rows");
      hasSelection = true;
    }
  }
  if (highlight.columns !== undefined) {
    if (!Array.isArray(highlight.columns) || !highlight.columns.length) {
      pushError(errors, `${path}.columns`, "columns precisa ter ao menos um índice.");
    } else {
      highlight.columns.forEach((columnIndex, index) => {
        const safeColumn = Number(columnIndex);
        if (!Number.isInteger(safeColumn) || safeColumn < 0 || safeColumn >= columnCount) {
          pushError(errors, `${path}.columns[${index}]`, "índice de coluna destacado fora dos limites da matrix.");
        }
      });
      validateUniquePrimitiveList(highlight.columns, `${path}.columns`, errors, "columns");
      hasSelection = true;
    }
  }

  if (!hasSelection) {
    pushError(errors, path, "matrix.highlight precisa definir pattern, cells, rows ou columns.");
  }
}

function validateMatrix(card, path, errors) {
  if (card?.prompt !== undefined && typeof card.prompt !== "string") {
    pushError(errors, `${path}.prompt`, "prompt deve ser texto.");
  }
  const hasValues = Array.isArray(card?.values) && card.values.length > 0;
  const hasSequence = Array.isArray(card?.sequence) && card.sequence.length > 0;
  if (card?.values !== undefined && !hasValues) {
    pushError(errors, `${path}.values`, "values precisa ter ao menos uma linha quando informado.");
  }
  if (card?.sequence !== undefined && !hasSequence) {
    pushError(errors, `${path}.sequence`, "sequence precisa ter ao menos 2 itens quando informada.");
  }
  if (!hasValues && !hasSequence) {
    pushError(errors, path, "matrix precisa de values ou sequence.");
  }
  if (!hasValues && card?.name !== undefined) {
    pushError(errors, `${path}.name`, "name no nível do card exige values.");
  }
  if (!hasValues && card?.highlight !== undefined) {
    pushError(errors, `${path}.highlight`, "highlight no nível do card exige values.");
  }
  if (card?.name !== undefined && typeof card.name !== "string") {
    pushError(errors, `${path}.name`, "name deve ser texto.");
  }
  if (hasValues) {
    validateMatrixValues(card.values, `${path}.values`, errors);
    validateMatrixHighlight(card?.highlight, `${path}.highlight`, errors, card.values.length, card.values[0]?.length || 0);
  }
  if (hasSequence) {
    if (card.sequence.length < 2) {
      pushError(errors, `${path}.sequence`, "sequence precisa ter ao menos 2 itens.");
    }
    if (card.sequence.length > 5) {
      pushError(errors, `${path}.sequence`, "sequence aceita no máximo 5 itens.");
    }
    card.sequence.forEach((item, index) => {
      if (!validateObjectFields(
        item,
        ["name", "connector", "values", "highlight"],
        `${path}.sequence[${index}]`,
        errors,
        "item de sequence"
      )) {
        return;
      }
      if (item?.name !== undefined && typeof item.name !== "string") {
        pushError(errors, `${path}.sequence[${index}].name`, "name de sequence deve ser texto.");
      }
      if (item?.connector !== undefined && typeof item.connector !== "string") {
        pushError(errors, `${path}.sequence[${index}].connector`, "connector de sequence deve ser texto.");
      }
      if (!Array.isArray(item?.values) || !item.values.length) {
        pushError(errors, `${path}.sequence[${index}].values`, "cada item de sequence precisa de values.");
        return;
      }
      validateMatrixValues(item.values, `${path}.sequence[${index}].values`, errors);
      if (item?.connector !== undefined && !MATRIX_CONNECTORS.has(text(item.connector))) {
        pushError(errors, `${path}.sequence[${index}].connector`, "connector inválido em sequence.");
      }
      validateMatrixHighlight(
        item?.highlight,
        `${path}.sequence[${index}].highlight`,
        errors,
        item.values.length,
        item.values[0]?.length || 0
      );
    });
  }
  if (card?.dividerAfterColumn !== undefined) {
    const divider = Number(card.dividerAfterColumn);
    if (!Number.isInteger(divider) || divider < 0) {
      pushError(errors, `${path}.dividerAfterColumn`, "dividerAfterColumn deve ser inteiro não negativo.");
    } else {
      const matrices = [
        ...(hasValues ? [card.values] : []),
        ...(hasSequence ? card.sequence.map((item) => item?.values).filter(Array.isArray) : [])
      ];
      matrices.forEach((values, index) => {
        const columnCount = Array.isArray(values?.[0]) ? values[0].length : 0;
        if (columnCount < 2 || divider >= columnCount - 1) {
          pushError(
            errors,
            `${path}.dividerAfterColumn`,
            `dividerAfterColumn fica fora da matriz ${index + 1}.`
          );
        }
      });
    }
  }
  validateContextualChoiceExercise(card, path, errors);
}

function validatePlane(card, path, errors) {
  if (card?.prompt !== undefined && typeof card.prompt !== "string") {
    pushError(errors, `${path}.prompt`, "prompt deve ser texto.");
  }
  const hasX = card?.x !== undefined;
  const hasY = card?.y !== undefined;
  const visuals = [];
  if (hasX || hasY) {
    if (!hasX || !hasY) {
      pushError(errors, path, "plane exige x e y juntos.");
    } else {
      visuals.push(validateCoordinatePair(card.x, `${path}.x`, errors));
      visuals.push(validateCoordinatePair(card.y, `${path}.y`, errors));
      if (Array.isArray(card.x) && card.x.length === 2 && isFiniteNumber(card.x[0]) && isFiniteNumber(card.x[1]) && card.x[0] >= card.x[1]) {
        pushError(errors, `${path}.x`, "x precisa indicar intervalo crescente [mínimo, máximo].");
      }
      if (Array.isArray(card.y) && card.y.length === 2 && isFiniteNumber(card.y[0]) && isFiniteNumber(card.y[1]) && card.y[0] >= card.y[1]) {
        pushError(errors, `${path}.y`, "y precisa indicar intervalo crescente [mínimo, máximo].");
      }
    }
  }
  if (card?.vector !== undefined) {
    visuals.push(validateCoordinatePair(card.vector, `${path}.vector`, errors));
  }
  if (card?.vectors !== undefined) {
    if (!Array.isArray(card.vectors) || !card.vectors.length) {
      pushError(errors, `${path}.vectors`, "vectors precisa ter ao menos um vetor.");
    } else {
      card.vectors.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.vectors[${index}]`, errors));
      });
    }
  }
  if (card?.sum !== undefined) {
    if (!Array.isArray(card.sum) || card.sum.length !== 2) {
      pushError(errors, `${path}.sum`, "sum precisa ter exatamente dois vetores.");
    } else {
      card.sum.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.sum[${index}]`, errors));
      });
    }
  }
  if (card?.distance !== undefined) {
    if (!Array.isArray(card.distance) || card.distance.length !== 2) {
      pushError(errors, `${path}.distance`, "distance precisa de dois pontos.");
    } else {
      card.distance.forEach((item, index) => {
        visuals.push(validateCoordinatePair(item, `${path}.distance[${index}]`, errors));
      });
    }
  }
  if (card?.scale !== undefined) {
    if (!validateObjectFields(card.scale, ["k", "vector"], `${path}.scale`, errors, "scale")) {
      // A mensagem estrutural já foi registrada.
    } else {
      if (!isFiniteNumber(card.scale.k)) {
        pushError(errors, `${path}.scale.k`, "scale.k precisa ser número finito.");
      }
      visuals.push(validateCoordinatePair(card.scale.vector, `${path}.scale.vector`, errors));
    }
  }
  if (card?.result !== undefined) {
    if (Array.isArray(card.result)) {
      validateCoordinatePair(card.result, `${path}.result`, errors);
    } else if (!text(card.result) || text(card.result).length > 80) {
      pushError(errors, `${path}.result`, "result precisa ser par [x, y] ou texto curto.");
    }
  }
  const primaryModes = ["vector", "vectors", "sum", "scale", "distance"]
    .filter((fieldName) => card?.[fieldName] !== undefined);
  if (primaryModes.length > 1) {
    pushError(errors, path, `plane aceita um único modo visual principal; recebidos: ${primaryModes.join(", ")}.`);
  }
  if (!visuals.some(Boolean)) {
    pushError(errors, path, "plane precisa de ao menos um dado visual.");
  }
  validateContextualChoiceExercise(card, path, errors);
}

function buildAllowedFieldSet(resource) {
  const common = ["id", "position", "resource", "kind", "exercise", "title", "after", "afterBlocks", "sources", "topics"];
  const perResource = {
    paragraph: [...common, "text"],
    choice: [...common, "question", "options", "answer"],
    composite: [...common, "blocks"],
    code: [...common, "prompt", "language", "code", "question", "options", "answer"],
    table: [...common, "columns", "rows", "question", "options", "answer"],
    flow: [...common, "prompt", "structure", "question", "options", "answer"],
    tree: [...common, "prompt", "nodes", "question", "options", "answer"],
    graph: [...common, "prompt", "vertices", "edges", "highlight", "question", "options", "answer"],
    relation_map: [...common, "prompt", "leftSet", "rightSet", "relations", "pairList", "relationTable", "highlight", "question", "options", "answer"],
    matrix: [...common, "prompt", "name", "values", "highlight", "dividerAfterColumn", "sequence", "question", "options", "answer"],
    plane: [...common, "prompt", "x", "y", "vector", "vectors", "sum", "scale", "distance", "result", "question", "options", "answer"],
    formula: [...common, "prompt", "notation", "accessibleText", "expression", "question", "options", "answer"]
  };
  return new Set(perResource[resource] || common);
}

function validateUnknownFields(card, path, errors, resource) {
  const allowed = buildAllowedFieldSet(resource);
  Object.keys(card || {}).forEach((fieldName) => {
    if (!allowed.has(fieldName)) {
      pushError(errors, `${path}.${fieldName}`, `Campo fora do schema: "${fieldName}".`);
    }
  });
}

export function validateCard(card, path = "$.card") {
  const errors = [];
  if (!isPlainObject(card)) {
    return { ok: false, errors: [{ path, message: "Card deve ser um objeto." }] };
  }

  const common = validateCommon(card, path, errors);
  validateUnknownFields(card, path, errors, common.resource);
  const sources = validateSources(card, path, errors);
  const topics = validateTopics(card, path, errors);
  validateAfter(card, path, errors);
  const afterBlocks = validateAfterBlocks(card, path, errors);

  if (common.resource === "paragraph") validateParagraph(card, path, errors);
  if (common.resource === "choice") validateChoice(card, path, errors);
  const compositeBlocks = common.resource === "composite" ? validateComposite(card, path, errors) : [];
  if (common.resource === "code") validateCode(card, path, errors);
  if (common.resource === "table") validateTable(card, path, errors);
  if (common.resource === "flow") validateFlow(card, path, errors);
  if (common.resource === "tree") validateTree(card, path, errors);
  if (common.resource === "graph") validateGraph(card, path, errors);
  if (common.resource === "relation_map") validateRelationMap(card, path, errors);
  if (common.resource === "matrix") validateMatrix(card, path, errors);
  if (common.resource === "plane") validatePlane(card, path, errors);
  if (common.resource === "formula") validateFormula(card, path, errors);

  return finalizeValidation(errors, {
    id: text(card?.id) || buildScopedKey("card", common.title || common.resource || "item"),
    position: common.position,
    resource: common.resource,
    kind: common.kind,
    exercise: common.exercise,
    title: common.title,
    ...(text(card?.text) ? { text: text(card.text) } : {}),
    ...(text(card?.question) ? { question: text(card.question) } : {}),
    ...(common.resource === "composite" ? { blocks: compositeBlocks } : {}),
    ...(Array.isArray(card?.options)
      ? {
          options: card.options.map((option, index) => normalizeChoiceOption(option, index))
        }
      : {}),
    ...(text(card?.answer) ? { answer: text(card.answer) } : {}),
    ...(text(card?.prompt) ? { prompt: text(card.prompt) } : {}),
    ...(text(card?.language) ? { language: text(card.language) } : {}),
    ...(codeText(card?.code).trim() ? { code: codeText(card.code) } : {}),
    ...(Array.isArray(card?.columns) ? { columns: card.columns.map((item) => text(item)) } : {}),
    ...(Array.isArray(card?.rows)
      ? { rows: card.rows.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : [])) }
      : {}),
    ...(card?.structure && typeof card.structure === "object" ? { structure: structuredClone(normalizeFlowchartStructure(card.structure)) } : {}),
    ...(Array.isArray(card?.nodes) ? { nodes: structuredClone(card.nodes) } : {}),
    ...(Array.isArray(card?.edges)
      ? { edges: common.resource === "graph" ? normalizeGraphEdges(card.edges) : structuredClone(card.edges) }
      : {}),
    ...(Array.isArray(card?.vertices) ? { vertices: normalizeGraphVertices(card.vertices) } : {}),
    ...(card?.leftSet && typeof card.leftSet === "object" ? { leftSet: normalizeRelationSetOutput(card.leftSet, "u") } : {}),
    ...(card?.rightSet && typeof card.rightSet === "object" ? { rightSet: normalizeRelationSetOutput(card.rightSet, "v") } : {}),
    ...(Array.isArray(card?.relations)
      ? {
          relations: card.relations.map((relation) => ({
            from: text(relation?.from),
            to: text(relation?.to),
            ...(text(relation?.label) ? { label: text(relation.label) } : {})
          }))
        }
      : {}),
    ...(Array.isArray(card?.pairList) ? { pairList: structuredClone(card.pairList) } : {}),
    ...(card?.relationTable && typeof card.relationTable === "object" ? { relationTable: structuredClone(card.relationTable) } : {}),
    ...(card?.highlight && typeof card.highlight === "object" ? { highlight: structuredClone(card.highlight) } : {}),
    ...(text(card?.name) ? { name: text(card.name) } : {}),
    ...(Array.isArray(card?.values) ? { values: structuredClone(card.values) } : {}),
    ...(card?.dividerAfterColumn !== undefined ? { dividerAfterColumn: Number(card.dividerAfterColumn) } : {}),
    ...(Array.isArray(card?.sequence) ? { sequence: structuredClone(card.sequence) } : {}),
    ...(Array.isArray(card?.x) ? { x: structuredClone(card.x) } : {}),
    ...(Array.isArray(card?.y) ? { y: structuredClone(card.y) } : {}),
    ...(Array.isArray(card?.vector) ? { vector: structuredClone(card.vector) } : {}),
    ...(Array.isArray(card?.vectors) ? { vectors: structuredClone(card.vectors) } : {}),
    ...(Array.isArray(card?.sum) ? { sum: structuredClone(card.sum) } : {}),
    ...(card?.scale && typeof card.scale === "object" ? { scale: structuredClone(card.scale) } : {}),
    ...(Array.isArray(card?.distance) ? { distance: structuredClone(card.distance) } : {}),
    ...(Array.isArray(card?.result) || typeof card?.result === "string" ? { result: structuredClone(card.result) } : {}),
    ...(text(card?.notation) ? { notation: text(card.notation) } : {}),
    ...(text(card?.accessibleText) ? { accessibleText: text(card.accessibleText) } : {}),
    ...(card?.expression && typeof card.expression === "object" ? { expression: structuredClone(card.expression) } : {}),
    after: text(card?.after),
    ...(afterBlocks.length ? { afterBlocks } : {}),
    ...(sources.length ? { sources } : {}),
    ...(topics.length ? { topics } : {})
  });
}

export function normalizeGeneratedCard(card, path = "$.card") {
  const result = validateCard(card, path);
  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join("; "));
  }
  return result.value;
}
