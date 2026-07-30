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
  const resources = listResourceIds();
  ["chart", "sequence", "annotated_text", "linguistic_example"].forEach(
    (resource) => assert.equal(resources.includes(resource), true, resource)
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

test("scatter usa escala numérica real, ticks em y e unidades dos dois eixos", () => {
  const scatter = {
    ...structuredClone(cards[0]),
    chartType: "scatter",
    xAxis: { label: "Tempo", unit: "s" },
    series: [{
      id: "station-a",
      name: "Medições",
      values: [[0, 1], [1, 2], [100, 3]]
    }],
    highlight: { points: [["station-a", 100]] }
  };
  const validation = validateCard(scatter);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));

  const html = renderCardRuntimeBlocks(validation.value);
  const xCoordinates = [...html.matchAll(/runtime-chart-point[^>]*\scx="([^"]+)"/gu)]
    .map((match) => Number(match[1]));

  assert.equal(xCoordinates.length, 3);
  assert.ok(xCoordinates[1] - xCoordinates[0] < 10);
  assert.ok(xCoordinates[2] - xCoordinates[1] > 500);
  assert.equal((html.match(/runtime-chart-grid/gu) || []).length, 5);
  assert.match(html, /Tempo \(s\) · Concentração \(µg\/m³\)/u);
  assert.match(html, /Eixo horizontal: Tempo \(s\)\./u);
});

test("plano com lacuna não desenha o resultado derivado antes do feedback", () => {
  const compiled = compileAuthoringCardGaps(
    structuredClone(getAuthoringResourceContract("plane").example)
  );
  const validation = validateCard(compiled);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));

  const render = (values, feedback = null) => renderCardRuntimeBlocks(
    validation.value,
    {
      blockKeyPrefix: "plane-result",
      textGapExerciseStateByBlockKey: {
        "plane-result::1": { values, feedback }
      }
    }
  );
  const unconfirmed = render(["(3, 3)"]);
  const unconfirmedVisual = /<svg class="runtime-plane-svg"[\s\S]*?<\/svg>[\s\S]*?<div class="runtime-plane-legend"[\s\S]*?<\/div>/u
    .exec(unconfirmed)?.[0] || "";

  assert.match(unconfirmed, /data-plane-result-revealed="false"/u);
  assert.doesNotMatch(unconfirmedVisual, /v\+w|w deslocado|\(3, 3\)/u);
  assert.match(unconfirmed, /runtime-plane-gap-blank/u);

  const evaluated = render(["(2, 2)"], "incorrect");
  const evaluatedVisual = /<svg class="runtime-plane-svg"[\s\S]*?<\/svg>[\s\S]*?<div class="runtime-plane-legend"[\s\S]*?<\/div>/u
    .exec(evaluated)?.[0] || "";

  assert.match(evaluated, /data-plane-result-revealed="true"/u);
  assert.match(evaluatedVisual, /v\+w/u);
  assert.match(evaluatedVisual, /\(3, 3\)/u);
});

test("sequence cycle explicita o retorno visual e acessível", () => {
  const validation = validateCard(cards[1]);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));

  const html = renderCardRuntimeBlocks(validation.value);
  assert.match(html, /runtime-sequence-cycle-return/u);
  assert.match(html, /Retorna à primeira etapa: <strong>Observar<\/strong>\./u);
  assert.match(
    html,
    /aria-label="Ciclo com 3 etapas\. Após Testar, retorna a Observar\."/u
  );
});

test("cada variante de sequence comunica uma semântica visual e acessível própria", () => {
  const expectations = {
    ordered_steps: {
      description: "Procedimento com 3 etapas ordenadas.",
      marker: ">1<",
      role: "etapa"
    },
    timeline: {
      description: "Linha do tempo com 3 marcos em ordem cronológica.",
      marker: ">M1<",
      role: "marco"
    },
    lifecycle: {
      description: "Ciclo de vida com 3 fases sucessivas.",
      marker: ">F1<",
      role: "fase"
    },
    cycle: {
      description: "Ciclo com 3 etapas. Após Testar, retorna a Observar.",
      marker: ">1<",
      role: "etapa do ciclo"
    },
    code_blocks: {
      description: "Sequência com 3 blocos de código ordenados.",
      marker: ">#1<",
      role: "bloco"
    }
  };

  Object.entries(expectations).forEach(([variant, expected]) => {
    const card = {
      ...structuredClone(cards[1]),
      variant,
      items: cards[1].items.map((item, index) => ({
        ...item,
        ...(variant === "code_blocks"
          ? { code: `etapa${index + 1}();`, language: "javascript" }
          : {})
      }))
    };
    const validation = validateCard(card);
    assert.equal(validation.ok, true, `${variant}: ${JSON.stringify(validation.errors)}`);
    const html = renderCardRuntimeBlocks(validation.value);

    assert.match(html, new RegExp(`data-sequence-variant="${variant}"`, "u"));
    assert.match(html, new RegExp(`aria-label="${expected.description.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}"`, "u"));
    assert.match(html, new RegExp(expected.marker.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    assert.match(html, new RegExp(`data-sequence-item-role="${expected.role}"`, "u"));
  });
});

test("fechamento do ciclo não revela respostas de lacunas", () => {
  const gapCycle = {
    ...structuredClone(cards[1]),
    id: "sequence-gap-cycle",
    kind: "exercise",
    exercise: "gap",
    items: [
      { id: "prepare", label: "[[Preparar::Preparar|Pular]]" },
      { id: "review", label: "Revisar" },
      { id: "repeat", label: "[[Repetir::Repetir|Encerrar]]" }
    ],
    highlight: { itemIds: ["review"] }
  };
  const validation = validateCard(gapCycle);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));

  const render = (values) => renderCardRuntimeBlocks(validation.value, {
    blockKeyPrefix: "cycle-gap",
    textGapExerciseStateByBlockKey: {
      "cycle-gap::1": { values, feedback: null }
    }
  });
  const emptyHtml = render([]);
  const emptyAria = /<ol aria-label="([^"]+)"/u.exec(emptyHtml)?.[1] || "";
  const emptyReturn = /<p class="runtime-sequence-cycle-return">([\s\S]*?)<\/p>/u
    .exec(emptyHtml)?.[1] || "";

  assert.match(emptyAria, /Após …, retorna a …\./u);
  assert.doesNotMatch(emptyAria + emptyReturn, /Preparar|Pular|Repetir|Encerrar|\[\[/u);

  const answeredHtml = render(["Pular", "Encerrar"]);
  const answeredAria = /<ol aria-label="([^"]+)"/u.exec(answeredHtml)?.[1] || "";
  const answeredReturn = /<p class="runtime-sequence-cycle-return">([\s\S]*?)<\/p>/u
    .exec(answeredHtml)?.[1] || "";

  assert.match(answeredAria, /Após Encerrar, retorna a Pular\./u);
  assert.match(answeredReturn, /<strong>Pular<\/strong>/u);
  assert.doesNotMatch(answeredAria + answeredReturn, /\[\[/u);
});

test("linguistic_example exige idioma explícito", () => {
  const missingLanguage = structuredClone(cards[3]);
  delete missingLanguage.languageTag;
  const validation = validateCard(missingLanguage);

  assert.equal(validation.ok, false);
  assert.match(
    validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /languageTag/u
  );
});

test("linguistic_example aplica alinhamento, escrita vertical e direção RTL à fonte", () => {
  const linguistic = {
    ...structuredClone(cards[3]),
    languageTag: "ar",
    textDirection: "rtl",
    writingMode: "vertical",
    alignment: "morpheme",
    units: [
      {
        id: "u1",
        form: "ال",
        gloss: "DEF",
        translation: "o"
      },
      {
        id: "u2",
        form: "كتاب",
        reading: "kitāb",
        gloss: "livro",
        translation: "livro"
      }
    ]
  };
  const validation = validateCard(linguistic);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));

  const html = renderCardRuntimeBlocks(validation.value);
  assert.match(
    html,
    /data-alignment="morpheme" data-writing-mode="vertical"/u
  );
  assert.match(
    html,
    /aria-label="Exemplo linguístico em ar, alinhado por morfema, escrita vertical, 2 unidades\."/u
  );
  assert.match(html, /runtime-linguistic-units" dir="rtl"/u);
  assert.match(html, /runtime-linguistic-source" lang="ar" dir="rtl"/u);
  assert.match(html, /data-alignment-unit="morfema"/u);
  assert.match(html, /runtime-linguistic-translation" dir="auto"/u);
});

test("contrato de card exige after explícito, ainda que vazio", () => {
  const missingAfter = structuredClone(cards[0]);
  delete missingAfter.after;
  const validation = validateCard(missingAfter);

  assert.equal(validation.ok, false);
  assert.match(
    validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"),
    /after é obrigatório/u
  );
});
