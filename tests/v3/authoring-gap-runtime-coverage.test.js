import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  AuthoringGapError,
  compileAuthoringCardGaps
} from "../../src/core/authoringGaps.js";
import { getAuthoringResourceContract } from "../../src/core/authoringResourceContract.js";
import { buildResourceGapModel } from "../../src/core/resourceGaps.js";
import { resolveCardRuntime } from "../../src/core/cardRuntime.js";
import { textGapResponseMatches } from "../../src/core/textGaps.js";
import { validateCard } from "../../src/domain/cards.js";
import {
  createFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../../src/flowchart/flowchartExercise.js";
import {
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock,
  resolveRuntimeFlowchartProjection
} from "../../src/render/renderCardRuntime.js";
import { standaloneAuthoringCardSchema } from "../../scripts/generateAuthoringCardSchema.mjs";

function exerciseCard(resource, id, fields) {
  return {
    id,
    position: 1,
    resource,
    kind: "exercise",
    exercise: "gap",
    title: "Prática formal",
    after: "A resposta pode ser conferida na própria representação.",
    ...fields
  };
}

function compileAndValidate(card) {
  const compiled = compileAuthoringCardGaps(card);
  const validation = validateCard(compiled);
  assert.equal(
    validation.ok,
    true,
    (validation.errors || []).map((entry) => `${entry.path} ${entry.message}`).join("; ")
  );
  return compiled;
}

function renderStructuredCard(card, prefix, values) {
  return renderCardRuntimeBlocks(card, {
    blockKeyPrefix: prefix,
    textGapExerciseStateByBlockKey: {
      [`${prefix}::1`]: {
        values,
        feedback: values.some((value) => value) ? "correct" : null
      }
    }
  });
}

test("autoria, contrato público e runtime de flow rejeitam variantes regex", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  const validateAuthoringCard = ajv.compile(standaloneAuthoringCardSchema());
  const literal = exerciseCard("flow", "card-flow-literal-variant", {
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "step",
        kind: "process",
        text: "Calcular total",
        practice: {
          text: {
            blank: true,
            variants: [{ id: "alternative", value: "Somar valores" }]
          }
        }
      }]
    }
  });
  const withRegex = structuredClone(literal);
  withRegex.structure.items[0].practice.text.variants[0].regex = true;

  assert.deepEqual(
    getAuthoringResourceContract("flow")
      .shape.variants.practice.textOrLabelEntry.variant,
    ["id", "value"]
  );
  assert.equal(
    validateAuthoringCard(literal),
    true,
    ajv.errorsText(validateAuthoringCard.errors)
  );
  assert.equal(validateAuthoringCard(withRegex), false);
  assert.throws(
    () => compileAuthoringCardGaps(withRegex),
    (error) => error instanceof AuthoringGapError
      && error.reason === "unsupported_regex"
      && error.path.endsWith(".variants[0].regex")
  );

  const publicContractValidation = validateCard(withRegex);
  assert.equal(
    publicContractValidation.ok,
    false,
    "O contrato público não pode conservar o antigo modo regex."
  );
  assert.ok(
    publicContractValidation.errors.some(
      (error) => error.message.includes(
        "practice.text.variants[0].regex:unknown_field"
      )
    ),
    "A rejeição pública precisa identificar o campo retirado."
  );
});

test("gap em conteúdo RTL conserva idioma, direção e resposta literal", () => {
  const card = compileAndValidate(exerciseCard("paragraph", "card-gap-arabic", {
    languageTag: "ar",
    textDirection: "rtl",
    text: "عاصمة مصر هي {gap:city}.",
    gaps: [{
      id: "city",
      response: "text",
      answer: "القاهرة"
    }]
  }));
  const model = buildResourceGapModel(card);
  const initial = renderStructuredCard(card, "rtl-gap", [""]);

  assert.equal(model.tokens.length, 1);
  assert.equal(textGapResponseMatches(model.tokens[0], "القاهرة"), true);
  assert.match(initial, /lang="ar" dir="rtl"/u);
  assert.match(initial, /contenteditable="true"[^>]*dir="auto"/u);
  assert.doesNotMatch(initial, /القاهرة/u);

  const answered = renderStructuredCard(card, "rtl-gap", ["القاهرة"]);
  assert.match(answered, /القاهرة/u);
});

test("matrix sequence aplica gap na matriz e na posição declaradas", () => {
  const card = compileAndValidate(exerciseCard("matrix", "card-gap-matrix-sequence", {
    prompt: "Complete a transformação.",
    sequence: [{
      name: "A",
      values: [["1", "0"], ["0", "1"]]
    }, {
      connector: "=",
      values: [["1", "{gap:cell}"], ["0", "1"]]
    }],
    gaps: [{
      id: "cell",
      response: "choice",
      answer: "0",
      distractors: ["1", "-1"]
    }]
  }));
  const model = buildResourceGapModel(card);

  assert.deepEqual(
    model.tokens.map((token) => token.path),
    ["sequence[1].values[0][1]"]
  );
  const initial = renderStructuredCard(card, "matrix-sequence-gap", [""]);
  assert.match(initial, /data-complete-blank-index="0"/u);
  assert.doesNotMatch(initial, />0<\/span>/u);
  assert.match(renderStructuredCard(card, "matrix-sequence-gap", ["0"]), />0<\/span>/u);
});

test("graph aplica gap ao rótulo de uma aresta", () => {
  const card = compileAndValidate(exerciseCard("graph", "card-gap-graph-edge-label", {
    prompt: "Complete o rótulo da aresta.",
    vertices: [
      { id: "a", label: "Origem" },
      { id: "b", label: "Destino" }
    ],
    edges: [{
      from: "a",
      to: "b",
      label: "{gap:edge-label}",
      directed: true
    }],
    gaps: [{
      id: "edge-label",
      response: "text",
      answer: "depende de"
    }]
  }));
  const model = buildResourceGapModel(card);

  assert.deepEqual(model.tokens.map((token) => token.path), ["edges[0].label"]);
  const initial = renderStructuredCard(card, "graph-edge-gap", [""]);
  assert.match(initial, /Aresta a–b/u);
  assert.doesNotMatch(initial, /depende de/u);
  assert.match(renderStructuredCard(card, "graph-edge-gap", ["depende de"]), /depende de/u);
});

test("relation_map aplica gaps ao rótulo e à tabela suplementar", () => {
  const card = compileAndValidate(exerciseCard(
    "relation_map",
    "card-gap-relation-label-table",
    {
      prompt: "Complete a relação e sua tabela.",
      leftSet: {
        label: "A",
        items: [{ id: "a1", label: "1" }]
      },
      rightSet: {
        label: "B",
        items: [{ id: "b1", label: "2" }]
      },
      relations: [{
        from: "a1",
        to: "b1",
        label: "{gap:relation-label}"
      }],
      relationTable: {
        columns: ["Origem", "Imagem"],
        rows: [["1", "{gap:table-value}"]]
      },
      gaps: [{
        id: "relation-label",
        response: "text",
        answer: "dobra"
      }, {
        id: "table-value",
        response: "choice",
        answer: "2",
        distractors: ["1", "3"]
      }]
    }
  ));
  const model = buildResourceGapModel(card);

  assert.deepEqual(
    model.tokens.map((token) => token.path),
    ["relations[0].label", "relationTable.rows[0][1]"]
  );
  const initial = renderStructuredCard(card, "relation-map-gap", ["", ""]);
  assert.doesNotMatch(initial, /dobra/u);
  assert.match(initial, /data-complete-blank-index="0"/u);
  assert.match(initial, /data-complete-blank-index="1"/u);

  const answered = renderStructuredCard(card, "relation-map-gap", ["dobra", "2"]);
  assert.match(answered, /dobra/u);
  assert.match(answered, />2<\/span>/u);
});

test("formula aninhada conserva a ordem dos gaps na AST e no texto acessível", () => {
  const card = compileAndValidate(exerciseCard("formula", "card-gap-nested-formula", {
    prompt: "Complete o radicando e o índice.",
    notation: "mathematics",
    accessibleText: "raiz quadrada de {gap:radicand} sobre x índice {gap:index} elevado a três",
    expression: {
      type: "fraction",
      numerator: {
        type: "root",
        radicand: { type: "identifier", value: "{gap:radicand}" },
        index: { type: "number", value: "2" }
      },
      denominator: {
        type: "subsup",
        base: { type: "identifier", value: "x" },
        subscript: { type: "identifier", value: "{gap:index}" },
        superscript: { type: "number", value: "3" }
      }
    },
    gaps: [{
      id: "radicand",
      response: "text",
      answer: "a"
    }, {
      id: "index",
      response: "choice",
      answer: "i",
      distractors: ["j", "k"]
    }]
  }));
  const model = buildResourceGapModel(card);

  assert.deepEqual(
    model.tokens.map((token) => token.path),
    [
      "expression.numerator.radicand.value",
      "expression.denominator.subscript.value"
    ]
  );
  const initial = renderStructuredCard(card, "nested-formula-gap", ["", ""]);
  assert.match(initial, /<mfrac>/u);
  assert.match(initial, /<mroot>/u);
  assert.match(initial, /<msubsup>/u);
  assert.doesNotMatch(initial, />a<\/m/u);
  assert.doesNotMatch(initial, />i<\/m/u);

  const answered = renderStructuredCard(card, "nested-formula-gap", ["a", "i"]);
  assert.match(answered, />a<\/span>/u);
  assert.match(answered, />i<\/span>/u);
});

test("composite executa flow e formula com estados independentes", () => {
  const card = compileAndValidate(exerciseCard(
    "composite",
    "card-gap-composite-flow-formula",
    {
      blocks: [{
        kind: "flow",
        prompt: "Complete a etapa.",
        structure: {
          id: "root",
          kind: "sequence",
          items: [{
            id: "read",
            kind: "input",
            text: "{gap:flow-step}"
          }]
        }
      }, {
        kind: "formula",
        prompt: "Complete o termo.",
        notation: "mathematics",
        accessibleText: "{gap:formula-term} mais um",
        expression: {
          type: "row",
          children: [
            { type: "identifier", value: "{gap:formula-term}" },
            { type: "operator", value: "+" },
            { type: "number", value: "1" }
          ]
        }
      }],
      gaps: [{
        id: "flow-step",
        response: "text",
        answer: "Ler valor"
      }, {
        id: "formula-term",
        response: "choice",
        answer: "x",
        distractors: ["y", "z"]
      }]
    }
  ));
  const runtime = resolveCardRuntime(card);
  const flowIndex = runtime.blocks.findIndex((block) => block?.kind === "flow");
  const formulaIndex = runtime.blocks.findIndex((block) => block?.kind === "formula");
  const flowBlockKey = `composite-flow-formula::${flowIndex}`;
  const formulaBlockKey = `composite-flow-formula::${formulaIndex}`;
  const projection = resolveRuntimeFlowchartProjection(runtime.blocks[flowIndex]);
  const flowState = createFlowchartExerciseState(projection);
  const formulaModel = buildResourceGapModel(runtime.blocks[formulaIndex]);

  const initial = renderCardRuntimeBlocksWithDock(card, {
    blockKeyPrefix: "composite-flow-formula",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: { [flowBlockKey]: projection },
    flowchartExerciseStateByBlockKey: { [flowBlockKey]: flowState },
    textGapExerciseStateByBlockKey: {
      [formulaBlockKey]: { values: [""], feedback: null }
    }
  });
  assert.match(initial.bodyHtml, /data-flowchart-inline-input="true"/u);
  assert.match(initial.bodyHtml, /data-action="text-gap-open-choice"/u);
  assert.doesNotMatch(initial.bodyHtml, /Ler valor/u);

  const flowTarget = projection.nodes.find((node) => node.textBlank);
  flowState.texts[flowTarget.id] = "Ler valor";
  assert.equal(validateFlowchartExerciseState(projection, flowState).status, "correct");
  assert.equal(textGapResponseMatches(formulaModel.tokens[0], "x"), true);
});
