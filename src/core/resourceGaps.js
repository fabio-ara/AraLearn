import {
  extractTextGapAnswers,
  parseTextGapRenderableParts,
  parseTextGapTokens
} from "./textGaps.js";

function text(value) {
  return typeof value === "string" ? value : "";
}

function resourceKind(value = {}) {
  return text(value?.resource || value?.kind).trim();
}

function field(path, value, label) {
  return {
    path,
    value: text(value),
    label: text(label).trim() || path
  };
}

function listFormulaValueFields(node, path = "expression", result = []) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return result;
  }

  const type = text(node.type).trim();
  if (["number", "identifier", "operator", "text"].includes(type)) {
    result.push(field(`${path}.value`, node.value, "Elemento da fórmula"));
    return result;
  }
  if (type === "row") {
    (Array.isArray(node.children) ? node.children : []).forEach((child, index) => {
      listFormulaValueFields(child, `${path}.children[${index}]`, result);
    });
    return result;
  }
  if (type === "fraction") {
    listFormulaValueFields(node.numerator, `${path}.numerator`, result);
    listFormulaValueFields(node.denominator, `${path}.denominator`, result);
    return result;
  }
  if (type === "root") {
    listFormulaValueFields(node.radicand, `${path}.radicand`, result);
    if (node.index !== undefined) {
      listFormulaValueFields(node.index, `${path}.index`, result);
    }
    return result;
  }
  if (type === "superscript") {
    listFormulaValueFields(node.base, `${path}.base`, result);
    listFormulaValueFields(node.exponent, `${path}.exponent`, result);
    return result;
  }
  if (type === "subscript") {
    listFormulaValueFields(node.base, `${path}.base`, result);
    listFormulaValueFields(node.subscript, `${path}.subscript`, result);
    return result;
  }
  if (type === "subsup") {
    listFormulaValueFields(node.base, `${path}.base`, result);
    listFormulaValueFields(node.subscript, `${path}.subscript`, result);
    listFormulaValueFields(node.superscript, `${path}.superscript`, result);
    return result;
  }
  if (type === "fenced") {
    listFormulaValueFields(node.content, `${path}.content`, result);
  }
  return result;
}

function listTableFields(value, prefix = "") {
  const result = [];
  (Array.isArray(value?.rows) ? value.rows : []).forEach((row, rowIndex) => {
    (Array.isArray(row) ? row : []).forEach((cell, columnIndex) => {
      result.push(field(
        `${prefix}rows[${rowIndex}][${columnIndex}]`,
        cell,
        `Linha ${rowIndex + 1}, coluna ${columnIndex + 1}`
      ));
    });
  });
  return result;
}

function listMatrixFields(value, prefix = "") {
  const result = [];
  const sequence = Array.isArray(value?.sequence) && value.sequence.length
    ? value.sequence
    : [value];
  sequence.forEach((item, itemIndex) => {
    const itemPrefix = Array.isArray(value?.sequence) && value.sequence.length
      ? `${prefix}sequence[${itemIndex}].`
      : prefix;
    (Array.isArray(item?.values) ? item.values : []).forEach((row, rowIndex) => {
      (Array.isArray(row) ? row : []).forEach((cell, columnIndex) => {
        result.push(field(
          `${itemPrefix}values[${rowIndex}][${columnIndex}]`,
          cell,
          `${sequence.length > 1 ? `Matriz ${itemIndex + 1}, ` : ""}linha ${rowIndex + 1}, coluna ${columnIndex + 1}`
        ));
      });
    });
  });
  return result;
}

function listTreeFields(value, prefix = "") {
  return (Array.isArray(value?.nodes) ? value.nodes : []).map((node, index) =>
    field(`${prefix}nodes[${index}].label`, node?.label, `Nó ${text(node?.id).trim() || index + 1}`)
  );
}

function listGraphFields(value, prefix = "") {
  const result = [];
  (Array.isArray(value?.vertices) ? value.vertices : []).forEach((vertex, index) => {
    result.push(field(
      `${prefix}vertices[${index}].label`,
      vertex?.label,
      `Vértice ${text(vertex?.id).trim() || index + 1}`
    ));
  });
  (Array.isArray(value?.edges) ? value.edges : []).forEach((edge, index) => {
    const edgeLabel = `${text(edge?.from).trim() || "?"}–${text(edge?.to).trim() || "?"}`;
    if (edge?.label !== undefined) {
      result.push(field(`${prefix}edges[${index}].label`, edge.label, `Aresta ${edgeLabel}`));
    }
    if (edge?.weight !== undefined) {
      result.push(field(`${prefix}edges[${index}].weight`, edge.weight, `Peso ${edgeLabel}`));
    }
  });
  return result;
}

function listRelationMapFields(value, prefix = "") {
  const result = [];
  [["leftSet", value?.leftSet], ["rightSet", value?.rightSet]].forEach(([setName, setValue]) => {
    (Array.isArray(setValue?.items) ? setValue.items : []).forEach((item, index) => {
      result.push(field(
        `${prefix}${setName}.items[${index}].label`,
        item?.label,
        `Item ${text(item?.id).trim() || index + 1}`
      ));
    });
  });
  (Array.isArray(value?.relations) ? value.relations : []).forEach((relation, index) => {
    if (relation?.label !== undefined) {
      result.push(field(
        `${prefix}relations[${index}].label`,
        relation.label,
        `Relação ${text(relation?.from).trim() || "?"}–${text(relation?.to).trim() || "?"}`
      ));
    }
  });
  (Array.isArray(value?.pairList) ? value.pairList : []).forEach((item, index) => {
    result.push(field(`${prefix}pairList[${index}]`, item, `Par ${index + 1}`));
  });
  listTableFields(value?.relationTable || {}, `${prefix}relationTable.`).forEach((entry) => result.push(entry));
  return result;
}

function listPlaneFields(value, prefix = "") {
  return typeof value?.result === "string"
    ? [field(`${prefix}result`, value.result, "Resultado")]
    : typeof value?.resultText === "string"
      ? [field(`${prefix}resultText`, value.resultText, "Resultado")]
      : [];
}

function listChartFields(value, prefix = "") {
  const result = [
    field(`${prefix}xAxis.label`, value?.xAxis?.label, "Rótulo do eixo horizontal"),
    field(`${prefix}yAxis.label`, value?.yAxis?.label, "Rótulo do eixo vertical")
  ];
  if (value?.xAxis?.unit !== undefined) {
    result.push(field(`${prefix}xAxis.unit`, value.xAxis.unit, "Unidade do eixo horizontal"));
  }
  if (value?.yAxis?.unit !== undefined) {
    result.push(field(`${prefix}yAxis.unit`, value.yAxis.unit, "Unidade do eixo vertical"));
  }
  (Array.isArray(value?.series) ? value.series : []).forEach((series, index) => {
    result.push(field(
      `${prefix}series[${index}].name`,
      series?.name,
      `Série ${text(series?.id).trim() || index + 1}`
    ));
  });
  return result;
}

function listSequenceFields(value, prefix = "") {
  return (Array.isArray(value?.items) ? value.items : []).flatMap((item, index) => {
    const itemId = text(item?.id).trim() || index + 1;
    return [
      field(`${prefix}items[${index}].label`, item?.label, `Etapa ${itemId}`),
      ...(item?.detail !== undefined
        ? [field(`${prefix}items[${index}].detail`, item.detail, `Detalhe da etapa ${itemId}`)]
        : []),
      ...(item?.code !== undefined
        ? [field(`${prefix}items[${index}].code`, item.code, `Código da etapa ${itemId}`)]
        : [])
    ];
  });
}

function listAnnotatedTextFields(value, prefix = "") {
  const segments = (Array.isArray(value?.segments) ? value.segments : []).map((segment, index) =>
    field(
      `${prefix}segments[${index}].text`,
      segment?.text,
      `Trecho ${text(segment?.id).trim() || index + 1}`
    )
  );
  const annotations = (Array.isArray(value?.annotations) ? value.annotations : []).flatMap((annotation, index) => {
    const annotationId = text(annotation?.id).trim() || index + 1;
    return [
      field(`${prefix}annotations[${index}].label`, annotation?.label, `Rótulo ${annotationId}`),
      field(`${prefix}annotations[${index}].note`, annotation?.note, `Nota ${annotationId}`)
    ];
  });
  return [...segments, ...annotations];
}

function listLinguisticExampleFields(value, prefix = "") {
  const supportedFields = [
    ["form", "Forma"],
    ["traditional", "Forma tradicional"],
    ["simplified", "Forma simplificada"],
    ["reading", "Leitura"],
    ["ipa", "IPA"],
    ["gloss", "Glosa"],
    ["translation", "Tradução"]
  ];
  return (Array.isArray(value?.units) ? value.units : []).flatMap((unit, index) => {
    const unitId = text(unit?.id).trim() || index + 1;
    return supportedFields.flatMap(([fieldName, label]) =>
      unit?.[fieldName] !== undefined
        ? [field(`${prefix}units[${index}].${fieldName}`, unit[fieldName], `${label} ${unitId}`)]
        : []
    );
  });
}

function listSingleResourceFields(value, prefix = "") {
  const resource = resourceKind(value);
  if (resource === "paragraph") {
    return [field(`${prefix}${value?.text !== undefined ? "text" : "value"}`, value?.text ?? value?.value, "Texto")];
  }
  if (resource === "code") {
    return [field(`${prefix}code`, value?.code, "Código")];
  }
  if (resource === "table") {
    return listTableFields(value, prefix);
  }
  if (resource === "tree") {
    return listTreeFields(value, prefix);
  }
  if (resource === "graph") {
    return listGraphFields(value, prefix);
  }
  if (resource === "relation_map") {
    return listRelationMapFields(value, prefix);
  }
  if (resource === "matrix") {
    return listMatrixFields(value, prefix);
  }
  if (resource === "plane") {
    return listPlaneFields(value, prefix);
  }
  if (resource === "formula") {
    return listFormulaValueFields(value?.expression, `${prefix}expression`);
  }
  if (resource === "chart") {
    return listChartFields(value, prefix);
  }
  if (resource === "sequence") {
    return listSequenceFields(value, prefix);
  }
  if (resource === "annotated_text") {
    return listAnnotatedTextFields(value, prefix);
  }
  if (resource === "linguistic_example") {
    return listLinguisticExampleFields(value, prefix);
  }
  return [];
}

export const RESOURCE_GAP_CAPABILITIES = Object.freeze({
  paragraph: Object.freeze(["text"]),
  code: Object.freeze(["code"]),
  table: Object.freeze(["rows"]),
  flow: Object.freeze([
    "structure.*.text",
    "structure.*.condition",
    "structure.*.cases[].condition"
  ]),
  tree: Object.freeze(["nodes.label"]),
  graph: Object.freeze(["vertices.label", "edges.label", "edges.weight"]),
  relation_map: Object.freeze([
    "leftSet.items.label",
    "rightSet.items.label",
    "relations.label",
    "pairList",
    "relationTable.rows"
  ]),
  matrix: Object.freeze(["values", "sequence.values"]),
  plane: Object.freeze(["result"]),
  formula: Object.freeze(["expression.*.value"]),
  chart: Object.freeze(["xAxis.label", "xAxis.unit", "yAxis.label", "yAxis.unit", "series.name"]),
  sequence: Object.freeze(["items.label", "items.detail", "items.code"]),
  annotated_text: Object.freeze(["segments.text", "annotations.label", "annotations.note"]),
  linguistic_example: Object.freeze([
    "units.form", "units.traditional", "units.simplified", "units.reading",
    "units.ipa", "units.gloss", "units.translation"
  ]),
  composite: Object.freeze(["blocks"])
});

export const FLOW_STRUCTURED_PRACTICE_TARGETS = Object.freeze({
  shape: Object.freeze({
    target: "structure.*.practice",
    response: "choice",
    fields: Object.freeze(["blankShape", "shapeOptions"]),
    expectedValue: "derived_from_node_kind",
    rule: "blankShape deve ser true; shapeOptions declara somente alternativas de forma."
  }),
  text: Object.freeze({
    target: "structure.*.practice.text",
    response: Object.freeze(["choice", "text"]),
    fields: Object.freeze(["blank", "mode", "options", "variants"]),
    expectedValue: "derived_from_node_text_or_condition",
    rule: "blank deve ser true; options ou variants declaram somente alternativas aceitas."
  }),
  edgeLabel: Object.freeze({
    target: "structure.*.practice.labels.<labelKey>",
    response: Object.freeze(["choice", "text"]),
    labelKeys: Object.freeze(["yes", "no", "match", "default"]),
    fields: Object.freeze(["blank", "mode", "options", "variants"]),
    expectedValue: "derived_from_projected_edge_label",
    rule: "blank deve ser true; a chave identifica a aresta e options ou variants declaram somente alternativas."
  })
});

function flowPracticeEntryIsActive(value) {
  if (value === true) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (
    value.blank === true
    || (Array.isArray(value.options) && value.options.length > 0)
    || (Array.isArray(value.variants) && value.variants.length > 0)
  );
}

function flowPracticeIsActive(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    value.blankShape === true
    || value.blankText === true
    || value.blankLabel === true
    || (Array.isArray(value.shapeOptions) && value.shapeOptions.length > 0)
    || flowPracticeEntryIsActive(value.text)
  ) {
    return true;
  }
  if (!value.labels || typeof value.labels !== "object" || Array.isArray(value.labels)) {
    return false;
  }
  return Object.values(value.labels).some(flowPracticeEntryIsActive);
}

function flowNodeHasStructuredPractice(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  if (flowPracticeIsActive(node.practice)) return true;

  const nestedLists = [
    node.items,
    node.thenBranch,
    node.elseBranch,
    node.body,
    node.defaultBranch
  ];
  if (nestedLists.some((list) =>
    (Array.isArray(list) ? list : []).some(flowNodeHasStructuredPractice)
  )) {
    return true;
  }

  const cases = Array.isArray(node.cases) ? node.cases : [];
  if (cases.some((item) =>
    flowPracticeIsActive(item?.practice)
    || (Array.isArray(item?.thenBranch) ? item.thenBranch : [])
      .some(flowNodeHasStructuredPractice)
    || (Array.isArray(item?.body) ? item.body : [])
      .some(flowNodeHasStructuredPractice)
  )) {
    return true;
  }

  return (Array.isArray(node.branches) ? node.branches : []).some((item) =>
    flowPracticeIsActive(item?.practice)
    || (Array.isArray(item?.items) ? item.items : [])
      .some(flowNodeHasStructuredPractice)
  );
}

export function flowHasStructuredPractice(value = {}) {
  return flowNodeHasStructuredPractice(value?.structure || value);
}

export function resourceSupportsGap(resource = "") {
  return Object.hasOwn(RESOURCE_GAP_CAPABILITIES, text(resource).trim());
}

export function listResourceGapFields(value = {}) {
  if (resourceKind(value) === "composite") {
    return (Array.isArray(value?.blocks) ? value.blocks : []).flatMap((block, index) =>
      listSingleResourceFields(block, `blocks[${index}].`)
    );
  }
  return listSingleResourceFields(value);
}

export function buildResourceGapModel(value = {}) {
  let blankOffset = 0;
  const fields = listResourceGapFields(value).map((entry) => {
    const localParts = parseTextGapRenderableParts(entry.value);
    const parts = localParts.map((part) => part.kind === "blank"
      ? { ...part, index: part.index + blankOffset }
      : part
    );
    const answers = extractTextGapAnswers(entry.value);
    const tokens = parseTextGapTokens(entry.value);
    const startIndex = blankOffset;
    blankOffset += answers.length;
    return {
      ...entry,
      startIndex,
      count: answers.length,
      answers,
      tokens,
      parts
    };
  });
  return {
    fields,
    fieldByPath: new Map(fields.map((entry) => [entry.path, entry])),
    answers: fields.flatMap((entry) => entry.answers),
    tokens: fields.flatMap((entry) => entry.tokens.map((token) => ({
      ...token,
      path: entry.path,
      index: entry.startIndex + token.index
    }))),
    gapCount: blankOffset
  };
}

export function extractResourceGapAnswers(value = {}) {
  return buildResourceGapModel(value).answers;
}

export function resourceHasGap(value = {}) {
  return buildResourceGapModel(value).gapCount > 0;
}

export function resolveResourceGapText(fieldValue, values = [], startIndex = 0, placeholder = "…") {
  const parts = parseTextGapRenderableParts(fieldValue);
  return parts.map((part) => {
    if (part.kind === "text") {
      return part.value;
    }
    const answer = text(values[startIndex + part.index]).trim();
    return answer || placeholder;
  }).join("");
}
