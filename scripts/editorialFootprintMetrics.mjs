const WORD_PATTERN = /[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu;

// Experimental coefficients used only to compare candidate estimators in the
// editorial benchmark. They are deliberately kept outside the product runtime.
const EXPLORATORY_WORD_EQUIVALENTS = Object.freeze({
  package: 2,
  codeLine: 1.8,
  tableRow: 5,
  tableCell: 0.8,
  chart: 38,
  chartSeries: 4,
  chartPoint: 0.2,
  graph: 32,
  graphVertex: 2,
  graphEdge: 1,
  choice: 12,
  choiceOption: 5,
  ordering: 12,
  orderingTarget: 5
});

export const EDITORIAL_FOOTPRINT_VIEWPORTS = Object.freeze([
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 430, height: 932 })
]);

export const EDITORIAL_FOOTPRINT_THEMES = Object.freeze(["light", "dark"]);

export const REQUIRED_EDITORIAL_FAMILIES = Object.freeze([
  "paragraph",
  "code",
  "table",
  "diagram",
  "multiple-choice",
  "practice",
  "combination"
]);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/gu, " ").trim();
}

export function countEditorialWords(value) {
  return normalizedText(value).match(WORD_PATTERN)?.length || 0;
}

export function countEditorialCharacters(value) {
  return [...normalizedText(value)].length;
}

export function summarizeEditorialStructure(studyUnit) {
  const counts = {
    packages: 0,
    codeLines: 0,
    tableRows: 0,
    tableCells: 0,
    charts: 0,
    chartSeries: 0,
    chartPoints: 0,
    graphs: 0,
    graphVertices: 0,
    graphEdges: 0,
    choices: 0,
    choiceOptions: 0,
    orderings: 0,
    orderingTargets: 0
  };
  const instances = [
    ...list(studyUnit?.content),
    ...(studyUnit?.response ? [studyUnit.response] : []),
    ...list(studyUnit?.feedback)
  ];
  counts.packages = instances.length;
  instances.forEach((instance) => {
    const packageId = String(instance?.package || "");
    const data = instance?.data || {};
    if (packageId === "aralearn.resource.code") {
      counts.codeLines += String(data.code || "").split("\n").length;
    }
    if (packageId === "aralearn.resource.table") {
      const rows = list(data.rows);
      counts.tableRows += rows.length;
      counts.tableCells += list(data.columns).length + rows.reduce(
        (total, row) => total + list(row).length,
        0
      );
    }
    if (packageId === "aralearn.resource.chart") {
      const series = list(data.series);
      counts.charts += 1;
      counts.chartSeries += series.length;
      counts.chartPoints += series.reduce(
        (total, item) => total + list(item?.values).length,
        0
      );
    }
    if (packageId === "aralearn.resource.graph") {
      counts.graphs += 1;
      counts.graphVertices += list(data.vertices).length;
      counts.graphEdges += list(data.edges).length;
    }
    if (packageId === "aralearn.response.choice") {
      counts.choices += 1;
      counts.choiceOptions += list(data.options).length;
    }
    if (packageId === "aralearn.response.ordering") {
      counts.orderings += 1;
      counts.orderingTargets += list(data.targets).length;
    }
  });
  return counts;
}

function weightedEquivalentWords(wordCount, structure) {
  const weights = EXPLORATORY_WORD_EQUIVALENTS;
  return wordCount
    + structure.packages * weights.package
    + structure.codeLines * weights.codeLine
    + structure.tableRows * weights.tableRow
    + structure.tableCells * weights.tableCell
    + structure.charts * weights.chart
    + structure.chartSeries * weights.chartSeries
    + structure.chartPoints * weights.chartPoint
    + structure.graphs * weights.graph
    + structure.graphVertices * weights.graphVertex
    + structure.graphEdges * weights.graphEdge
    + structure.choices * weights.choice
    + structure.choiceOptions * weights.choiceOption
    + structure.orderings * weights.ordering
    + structure.orderingTargets * weights.orderingTarget;
}

function abstractRows(characterCount, structure, viewportWidth) {
  const usableCharactersPerRow = viewportWidth <= 390 ? 40 : 46;
  const lexicalRows = characterCount / usableCharactersPerRow;
  const structuralRows =
    structure.packages * 0.8
    + structure.codeLines * 0.9
    + structure.tableRows * 1.3
    + structure.tableCells * 0.12
    + structure.charts * 13
    + structure.chartSeries * 0.5
    + structure.chartPoints * 0.025
    + structure.graphs * 11
    + structure.graphVertices * 0.18
    + structure.graphEdges * 0.1
    + structure.choices * 2.5
    + structure.choiceOptions * 1.55
    + structure.orderings * 2.5
    + structure.orderingTargets * 1.55;
  return lexicalRows + structuralRows;
}

export function measureEditorialFootprintCandidate({
  accessibleText,
  studyUnit,
  viewportWidth,
  contentClientHeight = 0
}) {
  const words = countEditorialWords(accessibleText);
  const characters = countEditorialCharacters(accessibleText);
  const structure = summarizeEditorialStructure(studyUnit);
  const weightedWords = weightedEquivalentWords(words, structure);
  const rows = abstractRows(characters, structure, viewportWidth);
  const estimatedPixels = Math.round(rows * 24 + Math.max(0, structure.packages - 1) * 8);
  return {
    lexical: { words, characters },
    structure,
    exploratoryWeightedWords: Number(weightedWords.toFixed(2)),
    abstractRows: Number(rows.toFixed(2)),
    estimatedPixels,
    estimatedViewportRatio: contentClientHeight > 0
      ? Number((estimatedPixels / contentClientHeight).toFixed(3))
      : null
  };
}
