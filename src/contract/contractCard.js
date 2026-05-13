import {
  convertPublicFlowToStructure,
  convertStructureToPublicFlow,
  normalizeFlowchartStructure,
  validateFlowchartStructureContract
} from "../flowchart/flowchartStructure.js";

export const CONTRACT_CARD_KINDS = Object.freeze([
  "say",
  "ask",
  "code",
  "table",
  "tree",
  "flow",
  "plane",
  "matrix"
]);

const COMMON_CARD_FIELDS = new Set([
  "key",
  "title",
  "say",
  "after",
  "sourceRefs",
  "domainRefs",
  "practiceVariantRefs",
  "didacticPurpose"
]);
const FLOW_STEP_FIELDS = new Set([
  "id",
  "start",
  "end",
  "input",
  "output",
  "process",
  "if",
  "then",
  "else",
  "chain",
  "switch",
  "cases",
  "default",
  "while",
  "do_while",
  "for",
  "do",
  "blank"
]);
const PLANE_INTENT_FIELDS = Object.freeze(["vector", "vectors", "sum", "scale", "distance"]);
const PLANE_ALLOWED_FIELDS = new Set([
  "x",
  "y",
  "vector",
  "vectors",
  "sum",
  "scale",
  "distance",
  "result"
]);
const PLANE_SAFE_ALIAS_FIELDS = new Set(["xRange", "yRange", "label", "labels"]);
const MATRIX_ALLOWED_FIELDS = new Set(["name", "values", "highlight", "dividerAfterColumn", "sequence"]);
const MATRIX_SEQUENCE_ITEM_ALLOWED_FIELDS = new Set(["connector", "name", "values", "highlight", "dividerAfterColumn"]);
const DISALLOWED_VISUAL_FIELDS = new Set(["html", "svg", "style", "color", "layout", "width", "height"]);

function fail(message) {
  throw new Error(message);
}

function clone(value) {
  return structuredClone(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, fieldName) {
  return Object.prototype.hasOwnProperty.call(value || {}, fieldName);
}

function normalizeRequiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return value.trim();
}

function normalizeOptionalString(value, fieldName) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }

  return value.trim();
}

function normalizeStringArray(value, fieldName, { required = false, minItems = 1 } = {}) {
  if (value === undefined) {
    if (required) {
      fail(`Campo obrigatório inválido: "${fieldName}".`);
    }
    return [];
  }

  if (!Array.isArray(value) || value.length < minItems) {
    fail(`Campo ${required ? "obrigatório" : "opcional"} inválido: "${fieldName}".`);
  }

  const normalized = value.map((item) => normalizeRequiredString(item, fieldName));
  if (normalized.length < minItems) {
    fail(`Campo ${required ? "obrigatório" : "opcional"} inválido: "${fieldName}".`);
  }

  return normalized;
}

function normalizeAnswer(value) {
  if (typeof value === "string") {
    return normalizeRequiredString(value, "answer");
  }

  const answers = normalizeStringArray(value, "answer", { required: true });
  return answers.length === 1 ? answers[0] : answers;
}

function listAnswerValues(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeTableRows(value) {
  if (!Array.isArray(value) || !value.length) {
    fail('Campo obrigatório inválido: "table.rows".');
  }

  return value.map((row) => {
    if (!Array.isArray(row) || !row.length) {
      fail('Campo obrigatório inválido: "table.rows".');
    }

    return row.map((cell) => normalizeRequiredString(cell, "table.rows"));
  });
}

function normalizePositiveIntegerList(value, fieldName) {
  if (!Array.isArray(value)) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return value.map((item) => {
    const nextValue = normalizeFiniteNumber(item, fieldName, { integer: true });
    if (nextValue < 1) {
      fail(`Campo obrigatório inválido: "${fieldName}".`);
    }
    return nextValue;
  });
}

function normalizeOptionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const nextValue = normalizeFiniteNumber(value, fieldName, { integer: true });
  if (nextValue < 1) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }
  return nextValue;
}

function normalizeOptionalTableFocus(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainObject(value)) {
    fail('Campo obrigatório inválido: "table.focus".');
  }

  assertAllowedFields(value, new Set(["label", "row", "rows", "column", "columns"]), "table.focus");

  const label = normalizeOptionalString(value.label, "table.focus.label");
  const row = normalizeOptionalPositiveInteger(value.row, "table.focus.row");
  const rows = value.rows === undefined ? [] : normalizePositiveIntegerList(value.rows, "table.focus.rows");
  const column = normalizeOptionalPositiveInteger(value.column, "table.focus.column");
  const columns = value.columns === undefined ? [] : normalizePositiveIntegerList(value.columns, "table.focus.columns");

  if (!label && row === null && !rows.length && column === null && !columns.length) {
    return null;
  }

  return {
    ...(label ? { label } : {}),
    ...(row !== null ? { row } : {}),
    ...(rows.length ? { rows } : {}),
    ...(column !== null ? { column } : {}),
    ...(columns.length ? { columns } : {})
  };
}

function normalizeFiniteNumber(
  value,
  fieldName,
  {
    integer = false,
    allowNumericString = true
  } = {}
) {
  let nextValue = value;
  if (allowNumericString && typeof nextValue === "string" && nextValue.trim() !== "") {
    nextValue = Number(nextValue.trim());
  }

  if (!Number.isFinite(nextValue) || (integer && !Number.isInteger(nextValue))) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return Number(nextValue);
}

function normalizeCoordinatePair(value, fieldName) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return value.map((item) => normalizeFiniteNumber(item, fieldName)) ;
}

function normalizeCoordinatePairList(
  value,
  fieldName,
  {
    exactItems = null,
    minItems = 1,
    maxItems = Number.POSITIVE_INFINITY,
    allowObjectMap = false
  } = {}
) {
  const source =
    Array.isArray(value)
      ? value
      : allowObjectMap && isPlainObject(value)
        ? Object.values(value)
        : null;

  if (!Array.isArray(source)) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  if ((exactItems !== null && source.length !== exactItems) || source.length < minItems || source.length > maxItems) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return source.map((item) => normalizeCoordinatePair(item, fieldName));
}

function normalizePlaneRange(value, fieldName) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }

  const min = normalizeFiniteNumber(value[0], fieldName, { integer: true });
  const max = normalizeFiniteNumber(value[1], fieldName, { integer: true });
  if (min >= max) {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }

  return [min, max];
}

function isGapText(value) {
  return typeof value === "string" && value.includes("[[") && value.includes("]]");
}

function containsMarkupSyntax(value) {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(String(value || ""));
}

function normalizePlaneResultCoordinate(value, fieldName) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(`Campo opcional inválido: "${fieldName}".`);
    }
    return Number(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      fail(`Campo opcional inválido: "${fieldName}".`);
    }
    if (isGapText(trimmed)) {
      return trimmed;
    }
    const numericValue = Number(trimmed);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  fail(`Campo opcional inválido: "${fieldName}".`);
}

function normalizePlaneResult(value) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail('Campo opcional inválido: "plane.result".');
  }

  return value.map((item) => normalizePlaneResultCoordinate(item, "plane.result"));
}

function pickPlaneIntent(source) {
  return PLANE_INTENT_FIELDS.find((fieldName) => source[fieldName] !== undefined) || "";
}

function normalizePlane(input) {
  if (!isPlainObject(input.plane)) {
    fail('Campo obrigatório inválido: "plane".');
  }

  const source = { ...input.plane };
  if (source.x === undefined && source.xRange !== undefined) {
    source.x = source.xRange;
  }
  if (source.y === undefined && source.yRange !== undefined) {
    source.y = source.yRange;
  }

  [...PLANE_SAFE_ALIAS_FIELDS].forEach((fieldName) => {
    delete source[fieldName];
  });

  const intent = pickPlaneIntent(source);
  if (!intent) {
    fail('Campo obrigatório inválido: "plane".');
  }

  PLANE_INTENT_FIELDS.forEach((fieldName) => {
    if (fieldName !== intent) {
      delete source[fieldName];
    }
  });

  assertDisallowedVisualFields(source, "plane");
  assertAllowedFields(source, PLANE_ALLOWED_FIELDS, "plane");

  const normalized = {};
  if (source.x !== undefined) {
    normalized.x = normalizePlaneRange(source.x, "plane.x");
  }
  if (source.y !== undefined) {
    normalized.y = normalizePlaneRange(source.y, "plane.y");
  }

  if (intent === "vector") {
    normalized.vector = normalizeCoordinatePair(source.vector, "plane.vector");
  }
  if (intent === "vectors") {
    normalized.vectors = normalizeCoordinatePairList(source.vectors, "plane.vectors", {
      minItems: 1,
      maxItems: 4,
      allowObjectMap: true
    });
  }
  if (intent === "sum") {
    normalized.sum = normalizeCoordinatePairList(source.sum, "plane.sum", { exactItems: 2 });
    if (source.result !== undefined) {
      normalized.result = normalizePlaneResult(source.result);
    }
  }
  if (intent === "scale") {
    if (!isPlainObject(source.scale)) {
      fail('Campo obrigatório inválido: "plane.scale".');
    }
    assertAllowedFields(source.scale, new Set(["k", "vector"]), "plane.scale");
    normalized.scale = {
      k: normalizeFiniteNumber(source.scale.k, "plane.scale.k"),
      vector: normalizeCoordinatePair(source.scale.vector, "plane.scale.vector")
    };
  }
  if (intent === "distance") {
    normalized.distance = normalizeCoordinatePairList(source.distance, "plane.distance", { exactItems: 2 });
  }

  if (intent !== "sum" && source.result !== undefined) {
    fail('Campo opcional inválido: "plane.result".');
  }

  return normalized;
}

function normalizeMatrixCellValue(value, fieldName) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      fail(`Campo obrigatório inválido: "${fieldName}".`);
    }
    return Number(value);
  }

  if (typeof value !== "string") {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }
  if (isGapText(trimmed)) {
    return trimmed;
  }

  if (containsMarkupSyntax(trimmed)) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  const numericValue = Number(trimmed);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  if (trimmed.length > 80) {
    fail(`Campo obrigatório inválido: "${fieldName}".`);
  }

  return trimmed;
}

function normalizeMatrixValues(value) {
  if (!Array.isArray(value) || !value.length) {
    fail('Campo obrigatório inválido: "matrix.values".');
  }

  let columnCount = null;
  return value.map((row, rowIndex) => {
    if (!Array.isArray(row) || !row.length) {
      fail('Campo obrigatório inválido: "matrix.values".');
    }

    if (columnCount === null) {
      columnCount = row.length;
    } else if (row.length !== columnCount) {
      fail('Campo obrigatório inválido: "matrix.values".');
    }

    return row.map((cell) => normalizeMatrixCellValue(cell, `matrix.values[${rowIndex}]`));
  });
}

function normalizeMatrixHighlightToken(value) {
  if (typeof value === "string") {
    const token = value.trim();
    if (token) {
      return token;
    }
  }

  if (isPlainObject(value)) {
    if (value.row !== undefined) {
      return `row:${normalizeFiniteNumber(value.row, "matrix.highlight", { integer: true })}`;
    }
    if (value.col !== undefined) {
      return `col:${normalizeFiniteNumber(value.col, "matrix.highlight", { integer: true })}`;
    }
    if (Array.isArray(value.cell) && value.cell.length === 2) {
      return `cell:${normalizeFiniteNumber(value.cell[0], "matrix.highlight", { integer: true })},${normalizeFiniteNumber(value.cell[1], "matrix.highlight", { integer: true })}`;
    }
  }

  fail('Campo opcional inválido: "matrix.highlight".');
}

function validateMatrixHighlightToken(value, rowCount, columnCount) {
  const token = normalizeMatrixHighlightToken(value);
  if (token === "mainDiagonal" || token === "secondaryDiagonal") {
    return token;
  }

  const rowMatch = token.match(/^row:(\d+)$/);
  if (rowMatch) {
    const rowIndex = Number(rowMatch[1]);
    if (rowIndex >= 1 && rowIndex <= rowCount) {
      return token;
    }
    fail('Campo opcional inválido: "matrix.highlight".');
  }

  const colMatch = token.match(/^col:(\d+)$/);
  if (colMatch) {
    const columnIndex = Number(colMatch[1]);
    if (columnIndex >= 1 && columnIndex <= columnCount) {
      return token;
    }
    fail('Campo opcional inválido: "matrix.highlight".');
  }

  const cellMatch = token.match(/^cell:(\d+),(\d+)$/);
  if (cellMatch) {
    const rowIndex = Number(cellMatch[1]);
    const columnIndex = Number(cellMatch[2]);
    if (rowIndex >= 1 && rowIndex <= rowCount && columnIndex >= 1 && columnIndex <= columnCount) {
      return token;
    }
    fail('Campo opcional inválido: "matrix.highlight".');
  }

  fail('Campo opcional inválido: "matrix.highlight".');
}

function normalizeMatrixHighlight(value, rowCount, columnCount) {
  if (value === undefined) {
    return undefined;
  }

  const source = Array.isArray(value) ? value : [value];
  const normalized = Array.from(
    new Set(source.map((item) => validateMatrixHighlightToken(item, rowCount, columnCount)))
  );
  if (!normalized.length) {
    return undefined;
  }

  return Array.isArray(value) ? normalized : normalized[0];
}

function normalizeMatrixConnector(value, fieldName) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    fail(`Campo opcional inválido: "${fieldName}".`);
  }

  const token = value.trim();
  if (!token) {
    return undefined;
  }

  const normalized = {
    "*": "×",
    "x": "×",
    "X": "×",
    "->": "→",
    "=>": "⇒"
  }[token] || token;

  if (["=", "+", "-", "×", "·", "→", "⇒"].includes(normalized)) {
    return normalized;
  }

  fail(`Campo opcional inválido: "${fieldName}".`);
}

function normalizeMatrixSinglePayload(source, context = "matrix", { allowConnector = false } = {}) {
  const allowed = allowConnector ? MATRIX_SEQUENCE_ITEM_ALLOWED_FIELDS : MATRIX_ALLOWED_FIELDS;
  assertAllowedFields(source, allowed, context);
  const connector = allowConnector ? normalizeMatrixConnector(source.connector, `${context}.connector`) : undefined;

  const values = normalizeMatrixValues(source.values);
  const rowCount = values.length;
  const columnCount = values[0]?.length || 0;
  const name = normalizeOptionalString(source.name, `${context}.name`);
  if (name && name.length > 12) {
    fail(`Campo opcional inválido: "${context}.name".`);
  }
  if (name && containsMarkupSyntax(name)) {
    fail(`Campo opcional inválido: "${context}.name".`);
  }

  const dividerAfterColumn =
    source.dividerAfterColumn === undefined
      ? undefined
      : normalizeFiniteNumber(source.dividerAfterColumn, `${context}.dividerAfterColumn`, { integer: true });

  if (dividerAfterColumn !== undefined && (dividerAfterColumn < 1 || dividerAfterColumn >= columnCount)) {
    fail(`Campo opcional inválido: "${context}.dividerAfterColumn".`);
  }

  return {
    ...(connector !== undefined ? { connector } : {}),
    ...(name ? { name } : {}),
    values,
    ...(source.highlight !== undefined ? { highlight: normalizeMatrixHighlight(source.highlight, rowCount, columnCount) } : {}),
    ...(dividerAfterColumn !== undefined ? { dividerAfterColumn } : {})
  };
}

function normalizeMatrixSequence(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) {
    fail('Campo obrigatório inválido: "matrix.sequence".');
  }

  return value.map((item, index) => {
    if (!isPlainObject(item)) {
      fail('Campo obrigatório inválido: "matrix.sequence".');
    }
    const normalized = normalizeMatrixSinglePayload(item, `matrix.sequence[${index}]`, { allowConnector: true });
    if (index === 0 && normalized.connector !== undefined) {
      fail('Campo opcional inválido: "matrix.sequence[0].connector".');
    }
    if (index > 0 && normalized.connector === undefined) {
      normalized.connector = "=";
    }
    return normalized;
  });
}

function normalizeMatrix(input) {
  if (!isPlainObject(input.matrix)) {
    fail('Campo obrigatório inválido: "matrix".');
  }

  const source = { ...input.matrix };
  if (source.headers !== undefined) {
    fail('Campo não suportado em matrix: "headers". Use "table" para tabelas com cabeçalho.');
  }

  assertDisallowedVisualFields(source, "matrix");
  assertAllowedFields(source, MATRIX_ALLOWED_FIELDS, "matrix");

  if (source.sequence !== undefined) {
    if (source.values !== undefined) {
      fail('Campo obrigatório inválido: "matrix". Use "values" ou "sequence", não ambos.');
    }
    if (source.highlight !== undefined || source.dividerAfterColumn !== undefined) {
      fail('Campo obrigatório inválido: "matrix". Use destaque e divisor dentro de cada item de "sequence".');
    }
    const sequenceName = normalizeOptionalString(source.name, "matrix.name");
    if (sequenceName && (sequenceName.length > 12 || containsMarkupSyntax(sequenceName))) {
      fail('Campo opcional inválido: "matrix.name".');
    }
    return {
      ...(sequenceName ? { name: sequenceName } : {}),
      sequence: normalizeMatrixSequence(source.sequence)
    };
  }

  if (source.values === undefined) {
    fail('Campo obrigatório inválido: "matrix.values".');
  }

  return normalizeMatrixSinglePayload(source);
}

function assertDisallowedVisualFields(source, context) {
  Object.keys(source).forEach((fieldName) => {
    if (DISALLOWED_VISUAL_FIELDS.has(fieldName)) {
      fail(`Campo não suportado em ${context}: "${fieldName}".`);
    }
  });
}

function assertAllowedFields(source, allowedFields, context = "card") {
  Object.keys(source).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      fail(`Campo não suportado em ${context}: "${fieldName}".`);
    }
  });
}

function readCardPrimaryKinds(card) {
  return [
    isPlainObject(card.plane) ? "plane" : "",
    isPlainObject(card.matrix) ? "matrix" : "",
    Array.isArray(card.flow) ? "flow" : "",
    isPlainObject(card.tree) ? "tree" : "",
    isPlainObject(card.table) ? "table" : "",
    typeof card.code === "string" ? "code" : "",
    typeof card.ask === "string" ? "ask" : ""
  ].filter(Boolean);
}

export function getContractCardKind(card) {
  if (!isPlainObject(card)) {
    return "";
  }

  const primaryKinds = readCardPrimaryKinds(card);
  if (primaryKinds.length > 0) {
    return primaryKinds[0];
  }
  if (typeof card.say === "string") {
    return "say";
  }
  return "";
}

export function getContractCardKindLabel(card) {
  const kind = typeof card === "string" ? card : getContractCardKind(card);
  const labels = {
    say: "say",
    ask: "ask",
    code: "code",
    table: "table",
    tree: "tree",
    flow: "flow",
    plane: "plane",
    matrix: "matrix"
  };
  return labels[kind] || "say";
}

function buildBaseCard(input) {
  const key = normalizeOptionalString(input.key, "key");
  const title = normalizeOptionalString(input.title, "title");
  const say = normalizeOptionalString(input.say, "say");
  const after = normalizeOptionalString(input.after, "after");
  const sourceRefs = normalizeStringArray(input.sourceRefs, "sourceRefs");
  const domainRefs = normalizeStringArray(input.domainRefs, "domainRefs");
  const practiceVariantRefs = normalizeStringArray(input.practiceVariantRefs, "practiceVariantRefs");
  const didacticPurpose = normalizeOptionalString(input.didacticPurpose, "didacticPurpose");

  return {
    ...(key ? { key } : {}),
    ...(title ? { title } : {}),
    ...(say ? { say } : {}),
    ...(after ? { after } : {}),
    ...(sourceRefs.length ? { sourceRefs } : {}),
    ...(domainRefs.length ? { domainRefs } : {}),
    ...(practiceVariantRefs.length ? { practiceVariantRefs } : {}),
    ...(didacticPurpose ? { didacticPurpose } : {})
  };
}

function normalizeWrongList(input, { required = false } = {}) {
  return normalizeStringArray(input.wrong, "wrong", { required });
}

function normalizeSayCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "wrong"]);
  assertAllowedFields(input, allowed);

  const baseCard = buildBaseCard(input);
  const say = normalizeRequiredString(input.say, "say");
  const wrong = normalizeWrongList(input);

  return {
    ...baseCard,
    say,
    ...(wrong.length ? { wrong } : {})
  };
}

function normalizeAskCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "ask", "answer", "wrong"]);
  assertAllowedFields(input, allowed);

  const baseCard = buildBaseCard(input);

  return {
    ...baseCard,
    ask: normalizeRequiredString(input.ask, "ask"),
    answer: normalizeAnswer(input.answer),
    wrong: normalizeWrongList(input, { required: true })
  };
}

function normalizeCodeCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "code", "language", "wrong"]);
  assertAllowedFields(input, allowed);

  const baseCard = buildBaseCard(input);
  const language = normalizeOptionalString(input.language, "language");
  const wrong = normalizeWrongList(input);

  return {
    ...baseCard,
    code: normalizeRequiredString(input.code, "code"),
    ...(language ? { language } : {}),
    ...(wrong.length ? { wrong } : {})
  };
}

function normalizeTable(input) {
  if (!isPlainObject(input.table)) {
    fail('Campo obrigatório inválido: "table".');
  }
  assertAllowedFields(input.table, new Set(["title", "columns", "rows", "focus"]), "table");

  const title = normalizeOptionalString(input.table.title, "table.title");
  const columns = normalizeStringArray(input.table.columns, "table.columns", { required: true });
  const rows = normalizeTableRows(input.table.rows);
  const focus = normalizeOptionalTableFocus(input.table.focus);

  return {
    ...(title ? { title } : {}),
    columns,
    rows,
    ...(focus ? { focus } : {})
  };
}

function normalizeTableCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "table"]);
  assertAllowedFields(input, allowed);

  return {
    ...buildBaseCard(input),
    table: normalizeTable(input)
  };
}

function normalizeTreeItems(value, path = "tree.items") {
  if (!isPlainObject(value)) {
    fail(`Campo obrigatório inválido: "${path}".`);
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, child]) => {
      const safeName = normalizeRequiredString(name, path);
      if (child === null) {
        return [safeName, null];
      }
      if (isPlainObject(child)) {
        return [safeName, normalizeTreeItems(child, `${path}.${safeName}`)];
      }
      fail(`Valor inválido em "${path}.${safeName}". Use null para arquivo ou objeto para pasta.`);
    })
  );
}

function normalizeTree(input) {
  if (!isPlainObject(input.tree)) {
    fail('Campo obrigatório inválido: "tree".');
  }
  assertAllowedFields(input.tree, new Set(["base", "current", "selected", "closed", "items"]), "tree");

  const base = normalizeOptionalString(input.tree.base, "tree.base");
  const current = normalizeOptionalString(input.tree.current, "tree.current");
  const selected = normalizeOptionalString(input.tree.selected, "tree.selected");
  const closed = normalizeStringArray(input.tree.closed, "tree.closed");

  return {
    ...(base ? { base } : {}),
    ...(current ? { current } : {}),
    ...(selected ? { selected } : {}),
    ...(closed.length ? { closed } : {}),
    items: normalizeTreeItems(input.tree.items)
  };
}

function normalizeTreeCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "tree"]);
  assertAllowedFields(input, allowed);

  return {
    ...buildBaseCard(input),
    tree: normalizeTree(input)
  };
}

function normalizeOptionObjects(list, prefix) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      if (isPlainObject(item)) {
        const value = normalizeOptionalString(item.value, `${prefix}.value`);
        return value
          ? {
              id: normalizeOptionalString(item.id, `${prefix}.id`) || `${prefix}-${index}`,
              value,
              ...(item.enabled === false ? { enabled: false } : {})
            }
          : null;
      }

      const value = typeof item === "string" ? item.trim() : "";
      return value
        ? {
            id: `${prefix}-${index}`,
            value
          }
        : null;
    })
    .filter(Boolean);
}

function normalizeVariantObjects(list, prefix) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => {
      const source = isPlainObject(item) ? item : { value: item };
      const value = normalizeOptionalString(source.value, `${prefix}.value`);
      return value
        ? {
            id: normalizeOptionalString(source.id, `${prefix}.id`) || `${prefix}-${index}`,
            value,
            ...(source.regex === true ? { regex: true } : {})
          }
        : null;
    })
    .filter(Boolean);
}

function normalizeBlankEntry(value, prefix) {
  if (value === true) {
    return { blank: true };
  }
  if (Array.isArray(value)) {
    const options = normalizeOptionObjects(value, prefix);
    return options.length ? { blank: true, mode: "choice", options } : { blank: true };
  }
  if (isPlainObject(value)) {
    const options = normalizeOptionObjects(value.options || value.wrong, prefix);
    const variants = normalizeVariantObjects(value.variants || value.also, `${prefix}-variant`);
    return {
      blank: true,
      ...(value.mode === "choice" || options.length ? { mode: "choice" } : {}),
      ...(options.length ? { options } : {}),
      ...(variants.length ? { variants } : {})
    };
  }

  return null;
}

function applyBlankPart(practice, part) {
  const normalizedPart = String(part || "").trim().toLowerCase();
  if (normalizedPart === "shape" || normalizedPart === "symbol") {
    practice.blankShape = true;
    return;
  }
  if (normalizedPart === "label" || normalizedPart === "labels") {
    practice.labels = {
      ...(practice.labels || {}),
      default: { blank: true }
    };
    return;
  }
  if (!practice.text) {
    practice.text = { blank: true };
  }
}

function blankSpecToPractice(blank) {
  if (blank === undefined) {
    return null;
  }

  const practice = {};
  if (blank === true) {
    practice.text = { blank: true };
  } else if (typeof blank === "string") {
    applyBlankPart(practice, blank);
  } else if (Array.isArray(blank)) {
    const parts = blank.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
    const structuralParts = new Set(["text", "shape", "symbol", "label", "labels"]);
    if (parts.length && parts.every((part) => structuralParts.has(part))) {
      parts.forEach((part) => applyBlankPart(practice, part));
    } else {
      practice.text = normalizeBlankEntry(blank, "flow-text-option") || { blank: true };
    }
  } else if (isPlainObject(blank)) {
    if (typeof blank.target === "string") {
      const target = blank.target.trim().toLowerCase();
      const optionsSource = blank.options || blank.wrong;
      const entry = normalizeBlankEntry(
        Array.isArray(optionsSource) ? optionsSource : true,
        `flow-${target}-option`
      ) || { blank: true };

      if (target === "shape" || target === "symbol") {
        practice.blankShape = true;
        if (Array.isArray(optionsSource) && optionsSource.length) {
          practice.shapeOptions = normalizeStringArray(optionsSource, "flow.blank.options");
        }
      } else if (target === "label" || target === "labels") {
        practice.labels = {
          ...(practice.labels || {}),
          [normalizeOptionalString(blank.key, "flow.blank.key") || "default"]: entry
        };
      } else {
        practice.text = entry;
      }
    }

    const shape = blank.shape ?? blank.symbol;
    if (shape === true) {
      practice.blankShape = true;
    } else if (Array.isArray(shape)) {
      const shapeOptions = normalizeStringArray(shape, "flow.blank.shape");
      practice.blankShape = true;
      practice.shapeOptions = shapeOptions;
    }

    const textEntry = normalizeBlankEntry(blank.text, "flow-text-option");
    if (textEntry) {
      practice.text = textEntry;
    }

    const labelEntry = normalizeBlankEntry(blank.label, "flow-label-option");
    if (labelEntry) {
      practice.labels = {
        ...(practice.labels || {}),
        default: labelEntry
      };
    }

    if (blank.labels === true) {
      practice.labels = {
        ...(practice.labels || {}),
        default: { blank: true }
      };
    } else if (isPlainObject(blank.labels)) {
      const labels = {};
      Object.keys(blank.labels).forEach((labelKey) => {
        const entry = normalizeBlankEntry(blank.labels[labelKey], `flow-label-${labelKey}-option`);
        if (entry) {
          labels[labelKey] = entry;
        }
      });
      if (Object.keys(labels).length) {
        practice.labels = {
          ...(practice.labels || {}),
          ...labels
        };
      }
    }
  }

  return Object.keys(practice).length ? practice : null;
}

function practiceEntryToBlank(entry) {
  if (!isPlainObject(entry)) {
    return true;
  }

  const options = Array.isArray(entry.options) ? entry.options.map((item) => item.value).filter(Boolean) : [];
  const variants = Array.isArray(entry.variants) ? entry.variants : [];
  if (!options.length && !variants.length) {
    return true;
  }

  return {
    ...(options.length ? { options } : {}),
    ...(variants.length ? { also: variants } : {})
  };
}

function practiceToBlankSpec(practice) {
  if (!isPlainObject(practice)) {
    return null;
  }

  const blank = {};
  if (practice.blankShape) {
    blank.shape = Array.isArray(practice.shapeOptions) && practice.shapeOptions.length
      ? practice.shapeOptions
      : true;
  }
  if (practice.text) {
    blank.text = practiceEntryToBlank(practice.text);
  }
  if (isPlainObject(practice.labels)) {
    blank.labels = Object.fromEntries(
      Object.entries(practice.labels).map(([key, entry]) => [key, practiceEntryToBlank(entry)])
    );
  }

  return Object.keys(blank).length ? blank : null;
}

function normalizeFlowStepAliases(item, path = "flow") {
  if (!isPlainObject(item)) {
    return item;
  }

  assertAllowedFields(item, FLOW_STEP_FIELDS, "flow");

  const next = { ...item };
  if (!normalizeOptionalString(next.id, "flow.id")) {
    next.id = path;
  }
  const practice = blankSpecToPractice(next.blank);
  delete next.blank;
  if (practice) {
    next.practice = practice;
  }

  if (Array.isArray(next.then)) {
    next.then = next.then.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-then-${index + 1}`));
  }
  if (Array.isArray(next.else)) {
    next.else = next.else.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-else-${index + 1}`));
  }
  if (Array.isArray(next.do)) {
    next.do = next.do.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-do-${index + 1}`));
  }
  if (Array.isArray(next.default)) {
    next.default = next.default.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-default-${index + 1}`));
  }
  if (Array.isArray(next.chain)) {
    next.chain = next.chain.map((entry, index) => normalizeFlowCaseAliases(entry, "chain", `${path}-chain-${index + 1}`));
  }
  if (Array.isArray(next.cases)) {
    next.cases = next.cases.map((entry, index) => normalizeFlowCaseAliases(entry, "cases", `${path}-case-${index + 1}`));
  }

  return next;
}

function normalizeFlowCaseAliases(item, context, path) {
  if (!isPlainObject(item)) {
    fail(`Item inválido em flow.${context}.`);
  }

  const next = { ...item };
  if (!normalizeOptionalString(next.id, "flow.id")) {
    next.id = path;
  }
  const practice = blankSpecToPractice(next.blank);
  delete next.blank;
  if (practice) {
    next.practice = practice;
  }
  if (Array.isArray(next.then)) {
    next.then = next.then.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-then-${index + 1}`));
  }
  if (Array.isArray(next.do)) {
    next.do = next.do.map((entry, index) => normalizeFlowStepAliases(entry, `${path}-do-${index + 1}`));
  }
  return next;
}

function restoreFlowStepBlankAliases(item) {
  if (!isPlainObject(item)) {
    return item;
  }

  const next = { ...item };
  const blank = practiceToBlankSpec(next.practice);
  delete next.practice;
  if (blank) {
    next.blank = blank;
  }

  if (Array.isArray(next.then)) {
    next.then = next.then.map((entry) => restoreFlowStepBlankAliases(entry));
  }
  if (Array.isArray(next.else)) {
    next.else = next.else.map((entry) => restoreFlowStepBlankAliases(entry));
  }
  if (Array.isArray(next.do)) {
    next.do = next.do.map((entry) => restoreFlowStepBlankAliases(entry));
  }
  if (Array.isArray(next.default)) {
    next.default = next.default.map((entry) => restoreFlowStepBlankAliases(entry));
  }
  if (Array.isArray(next.chain)) {
    next.chain = next.chain.map((entry) => restoreFlowStepBlankAliases(entry));
  }
  if (Array.isArray(next.cases)) {
    next.cases = next.cases.map((entry) => restoreFlowStepBlankAliases(entry));
  }

  return next;
}

export function normalizeFlowForRuntime(flow) {
  if (!Array.isArray(flow)) {
    return [];
  }
  return flow.map((item, index) => normalizeFlowStepAliases(item, `flow-${index + 1}`));
}

function normalizeFlow(value) {
  if (!Array.isArray(value) || !value.length) {
    fail('Campo obrigatório inválido: "flow".');
  }

  const runtimeFlow = normalizeFlowForRuntime(value);
  const structure = normalizeFlowchartStructure(convertPublicFlowToStructure(runtimeFlow));
  const validation = validateFlowchartStructureContract(structure);
  if (!validation.valid) {
    fail('Campo obrigatório inválido: "flow".');
  }

  return convertStructureToPublicFlow(structure).map((item) => restoreFlowStepBlankAliases(item));
}

function normalizeFlowCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "flow"]);
  assertAllowedFields(input, allowed);

  return {
    ...buildBaseCard(input),
    flow: normalizeFlow(input.flow)
  };
}

function normalizePlaneCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "plane"]);
  assertAllowedFields(input, allowed);

  return {
    ...buildBaseCard(input),
    plane: normalizePlane(input)
  };
}

function normalizeMatrixCard(input) {
  const allowed = new Set([...COMMON_CARD_FIELDS, "matrix"]);
  assertAllowedFields(input, allowed);

  return {
    ...buildBaseCard(input),
    matrix: normalizeMatrix(input)
  };
}

export function sanitizeContractCard(input) {
  if (!isPlainObject(input)) {
    fail("Card inválido.");
  }

  if (hasOwn(input, "type")) {
    fail('Campo não suportado em card: "type".');
  }
  if (hasOwn(input, "runtime")) {
    fail('Campo não suportado em card: "runtime".');
  }

  const primaryKinds = readCardPrimaryKinds(input);
  if (primaryKinds.length > 1) {
    fail(`Card deve declarar uma intenção principal única: ${primaryKinds.join(", ")}.`);
  }

  const kind = primaryKinds[0] || (typeof input.say === "string" ? "say" : "");
  if (kind === "ask") {
    return normalizeAskCard(input);
  }
  if (kind === "code") {
    return normalizeCodeCard(input);
  }
  if (kind === "table") {
    return normalizeTableCard(input);
  }
  if (kind === "tree") {
    return normalizeTreeCard(input);
  }
  if (kind === "flow") {
    return normalizeFlowCard(input);
  }
  if (kind === "plane") {
    return normalizePlaneCard(input);
  }
  if (kind === "matrix") {
    return normalizeMatrixCard(input);
  }
  if (kind === "say") {
    return normalizeSayCard(input);
  }

  fail('Card deve declarar pelo menos um campo de intenção: "say", "ask", "code", "table", "tree", "flow", "plane" ou "matrix".');
}

export function createStarterContractCard(kind = "say") {
  const safeKind = CONTRACT_CARD_KINDS.includes(kind) ? kind : "say";

  if (safeKind === "ask") {
    return {
      title: "Nova pergunta",
      ask: "Qual alternativa é a mais adequada?",
      answer: "Alternativa correta",
      wrong: ["Distrator 1", "Distrator 2"]
    };
  }

  if (safeKind === "code") {
    return {
      title: "Trecho de código",
      say: "Observe o trecho abaixo.",
      language: "text",
      code: "console.log('AraLearn');"
    };
  }

  if (safeKind === "table") {
    return {
      title: "Tabela",
      table: {
        columns: ["Coluna A", "Coluna B"],
        rows: [["Valor 1", "Valor 2"]],
        focus: {
          column: 2,
          label: "Compare a segunda coluna"
        }
      }
    };
  }

  if (safeKind === "tree") {
    return {
      title: "Árvore",
      say: "Observe a estrutura de diretórios.",
      tree: {
        base: "/",
        current: "/home/aluno",
        items: {
          home: {
            aluno: {
              projetos: {},
              "README.txt": null
            }
          }
        }
      }
    };
  }

  if (safeKind === "flow") {
    return {
      title: "Fluxo",
      flow: [
        { start: "Início" },
        { process: "Etapa principal" },
        { end: "Fim" }
      ]
    };
  }

  if (safeKind === "plane") {
    return {
      title: "Plano cartesiano",
      say: "Observe o vetor no plano.",
      plane: {
        vector: [3, 2]
      }
    };
  }

  if (safeKind === "matrix") {
    return {
      title: "Matriz",
      say: "Observe a matriz A.",
      matrix: {
        name: "A",
        values: [
          [1, 2],
          [3, 4]
        ]
      }
    };
  }

  return {
    title: "Novo card",
    say: "Descreva a ideia central desta microssequência."
  };
}

export function listContractAnswerValues(card) {
  return listAnswerValues(card?.answer);
}

export function cloneContractCard(card) {
  return clone(sanitizeContractCard(card));
}
