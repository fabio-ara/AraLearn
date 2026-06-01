function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeListItems(values = []) {
  return values.map((item) => text(item)).filter(Boolean);
}

export function parseMatrixRowSlot(value = "", { strict = true } = {}) {
  const source = text(value);
  if (!source) {
    throw new Error("linha da matriz vazia");
  }
  let items = [];
  if (source.includes("|")) {
    items = normalizeListItems(source.split("|"));
  } else {
    const bracketMatch = source.match(/^\[\s*([\s\S]*?)\s*\]$/u);
    const csvSource = bracketMatch ? bracketMatch[1] : source;
    if (csvSource.includes(",")) {
      items = normalizeListItems(csvSource.split(","));
    }
  }
  if (!items.length) {
    if (strict) {
      throw new Error("linha da matriz precisa usar barras verticais ou vírgulas claras");
    }
    return [source];
  }
  if (items.some((item) => !item)) {
    throw new Error("linha da matriz contém célula vazia");
  }
  if (items.length < 2) {
    throw new Error("linha da matriz precisa de ao menos duas colunas");
  }
  if (items.length > 5) {
    throw new Error("linha da matriz aceita no máximo cinco colunas");
  }
  return items;
}

function buildMatrixRows(slots = {}) {
  const rows = [parseMatrixRowSlot(slots[4], { strict: true }), parseMatrixRowSlot(slots[5], { strict: true })];
  const columnCount = rows[0].length;
  rows.forEach((row, index) => {
    if (row.length !== columnCount) {
      throw new Error(`linha ${index + 1} da matriz tem quantidade diferente de colunas`);
    }
  });
  return rows;
}

export function compileMatrixCard({ slots = {}, templateId = "", position = 0 }) {
  const values = buildMatrixRows(slots);
  const base = {
    position,
    resource: "matrix",
    title: text(slots[1]),
    prompt: text(slots[2]),
    name: text(slots[3]),
    values
  };
  if (templateId === "matrix_theory") {
    return {
      ...base,
      kind: "theory",
      exercise: "none",
      after: text(slots[6])
    };
  }
  return {
    ...base,
    kind: "exercise",
    exercise: "choice",
    question: text(slots[8]),
    options: [
      { id: "a", text: text(slots[9]) },
      { id: "b", text: text(slots[10]) },
      { id: "c", text: text(slots[11]) }
    ],
    answer: "",
    after: text(slots[12])
  };
}
