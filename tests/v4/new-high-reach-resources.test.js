import test from "node:test";
import assert from "node:assert/strict";

import { validateCard } from "../../src/domain/cards.js";
import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../../src/resources/registry/index.js";

const cards = [
  {
    id: "chart-1",
    position: 1,
    resource: "chart",
    kind: "theory",
    exercise: "none",
    title: "Concentração mensal",
    prompt: "Compare a evolução.",
    chartType: "line",
    xAxis: { label: "Mês" },
    yAxis: { label: "Concentração", unit: "µg/m³" },
    series: [{
      id: "station-a",
      name: "Estação A",
      values: [["Jan", 18], ["Fev", 22], ["Mar", 31]]
    }],
    highlight: { points: [["station-a", "Mar"]] },
    after: ""
  },
  {
    id: "sequence-1",
    position: 2,
    resource: "sequence",
    kind: "theory",
    exercise: "none",
    title: "Ciclo de investigação",
    prompt: "Observe a progressão.",
    variant: "cycle",
    items: [
      { id: "observe", label: "Observar" },
      { id: "hypothesis", label: "Formular hipótese", detail: "Produzir uma explicação testável." },
      { id: "test", label: "Testar" }
    ],
    highlight: { itemIds: ["hypothesis"] },
    after: ""
  },
  {
    id: "annotated-1",
    position: 3,
    resource: "annotated_text",
    kind: "theory",
    exercise: "none",
    title: "Obrigação legal",
    prompt: "Relacione o trecho à anotação.",
    segments: [
      { id: "s1", text: "O controlador deverá comunicar o incidente." },
      { id: "s2", text: "A comunicação deve ocorrer em prazo razoável." }
    ],
    annotations: [{
      id: "a1",
      targetIds: ["s1"],
      label: "dever jurídico",
      note: "A forma verbal estabelece obrigação."
    }],
    after: ""
  },
  {
    id: "linguistic-1",
    position: 4,
    resource: "linguistic_example",
    kind: "theory",
    exercise: "none",
    title: "Saudação",
    prompt: "Compare forma, leitura e tradução.",
    languageTag: "zh-Hans",
    writingMode: "horizontal",
    alignment: "word",
    units: [{
      id: "u1",
      form: "你好",
      reading: "nǐ hǎo",
      ipa: "ni˨˩˦ xɑʊ̯˨˩˦",
      gloss: "você bom",
      translation: "olá"
    }],
    after: ""
  }
];

function project() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-resources",
      title: "Galeria",
      goal: "Demonstrar recursos de alto alcance.",
      modules: [{
        id: "module-resources",
        title: "Representações",
        guide: { goal: "Comparar representações.", include: [], exclude: [], notation: [], avoid: [] },
        lessons: [{
          id: "lesson-resources",
          title: "Recursos",
          guide: { goal: "Comparar representações.", include: [], exclude: [], notation: [], avoid: [] },
          topics: [],
          microsequences: [{
            id: "micro-resources",
            title: "Galeria",
            goal: "Observar recursos.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards
          }]
        }]
      }]
    }]
  };
}

test("registro inclui os quatro recursos novos de alto alcance", () => {
  assert.deepEqual(
    listResourceIds().slice(-4),
    ["chart", "sequence", "annotated_text", "linguistic_example"]
  );
});

test("novos recursos validam e renderizam sem geometria autoral", () => {
  cards.forEach((card) => {
    const result = validateCard(card);
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    const html = renderCardRuntimeBlocks(result.value);
    assert.match(html, new RegExp(`runtime-${card.resource.replaceAll("_", "-")}`, "u"));
    assert.doesNotMatch(JSON.stringify(card), /"color"|"width"|"height"|"x":|"y":/u);
  });
});

test("novos recursos preservam integralmente o round-trip relacional", () => {
  const document = project();
  const rows = contractToRelationalRows(document);
  const rebuilt = relationalRowsToContract(rows);
  assert.deepEqual(rebuilt, document);
  const semanticRows = rows.blocks.filter((row) =>
    ["chart", "sequence", "annotated_text", "linguistic_example"].includes(row.blockType)
  );
  assert.equal(semanticRows.length, 4);
  assert.equal(semanticRows.every((row) => row.semanticPayload), true);
});

test("referências internas inválidas fecham a validação", () => {
  const invalidChart = structuredClone(cards[0]);
  invalidChart.highlight.points = [["station-a", "Abr"]];
  assert.equal(validateCard(invalidChart).ok, false);

  const invalidAnnotation = structuredClone(cards[2]);
  invalidAnnotation.annotations[0].targetIds = ["missing"];
  assert.equal(validateCard(invalidAnnotation).ok, false);
});

test("novos recursos aceitam lacunas atômicas nos campos semânticos", () => {
  ["chart", "sequence", "annotated_text", "linguistic_example"].forEach((resource, index) => {
    const authored = {
      id: `gap-${resource}`,
      position: index + 1,
      after: "",
      ...getAuthoringResourceContract(resource).example
    };
    const compiled = compileAuthoringCardGaps(authored);
    const validation = validateCard(compiled);
    assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));
    const prefix = `new-resource-gap-${index}`;
    const html = renderCardRuntimeBlocks(compiled, {
      blockKeyPrefix: prefix,
      textGapExerciseStateByBlockKey: {
        [`${prefix}::1`]: { values: [], feedback: null }
      }
    });
    assert.match(html, /runtime-text-gap-blank/u);
    assert.doesNotMatch(html, /\{gap:/u);
  });
});

test("boxplot deriva quartis dos valores sem receber geometria do modelo", () => {
  const boxplot = {
    ...structuredClone(cards[0]),
    chartType: "boxplot",
    series: [{
      id: "station-a",
      name: "Estação A",
      values: [["Centro", 2], ["Centro", 4], ["Centro", 6], ["Centro", 8], ["Centro", 10]]
    }],
    highlight: { points: [["station-a", "Centro"]] }
  };
  const validation = validateCard(boxplot);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));
  const html = renderCardRuntimeBlocks(validation.value);
  assert.match(html, /runtime-chart-box is-highlighted/u);
  assert.match(html, /Q1 4, mediana 6, Q3 8/u);
  assert.doesNotMatch(JSON.stringify(boxplot), /"x":|"y":|"width":|"height":/u);
});
