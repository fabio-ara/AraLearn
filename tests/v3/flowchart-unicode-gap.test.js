import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import { resolveCardRuntime } from "../../src/core/cardRuntime.js";
import {
  createFlowchartExerciseState,
  listFlowchartLinkLabelOptions,
  listFlowchartNodeShapeOptions,
  validateFlowchartExerciseState
} from "../../src/flowchart/flowchartExercise.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import {
  renderCardRuntimeBlocksWithDock,
  resolveRuntimeFlowchartProjection
} from "../../src/render/renderCardRuntime.js";

function structuredShapeCard() {
  return compileAuthoringCardGaps({
    id: "card-flow-shape",
    position: 1,
    title: "Forma da operação",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "A forma process representa uma operação.",
    structure: {
      id: "root-shape",
      kind: "sequence",
      items: [{
        id: "calculate",
        kind: "process",
        text: "Calcular total",
        practice: {
          blankShape: true,
          shapeOptions: ["input_output", "decision"]
        }
      }]
    }
  });
}

function structuredLabelCard() {
  return compileAuthoringCardGaps({
    id: "card-flow-labels",
    position: 2,
    title: "Rótulos da repetição",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "Os rótulos distinguem continuidade e saída.",
    structure: {
      id: "root-labels",
      kind: "sequence",
      items: [{
        id: "repeat",
        kind: "while",
        condition: "Há itens?",
        practice: {
          labels: {
            yes: {
              blank: true,
              mode: "choice",
              options: ["Não"]
            },
            no: {
              blank: true,
              variants: ["Nao"]
            }
          }
        },
        body: [{ id: "consume", kind: "process", text: "Consumir item" }]
      }, {
        id: "finish",
        kind: "end",
        text: "Fim"
      }]
    }
  });
}

test("lacuna textual de fluxo aceita representação Unicode canonicamente equivalente", () => {
  const projection = {
    nodes: [
      {
        id: "node-1",
        shape: "process",
        text: "Ação",
        textBlank: true
      }
    ],
    links: []
  };
  const state = createFlowchartExerciseState(projection);
  state.texts["node-1"] = "Ação";

  assert.equal(validateFlowchartExerciseState(projection, state).status, "correct");
});

test("metacaracteres em variante de fluxo são comparados como texto literal", () => {
  const projection = {
    nodes: [{
      id: "node-literal",
      shape: "process",
      text: "A.*",
      textBlank: true,
      textVariants: [{ id: "variant-literal", value: "B.+" }]
    }],
    links: []
  };
  const state = createFlowchartExerciseState(projection);

  state.texts["node-literal"] = "ABC";
  assert.equal(
    validateFlowchartExerciseState(projection, state).status,
    "incorrect"
  );

  state.texts["node-literal"] = "A.*";
  assert.equal(
    validateFlowchartExerciseState(projection, state).status,
    "correct"
  );

  state.texts["node-literal"] = "B.+";
  assert.equal(
    validateFlowchartExerciseState(projection, state).status,
    "correct"
  );
});

test("fluxograma formal oculta respostas e oferece controles adequados ao teclado móvel", () => {
  const card = compileAuthoringCardGaps({
    id: "card-flow-formal",
    position: 1,
    title: "Complete o processo",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "A entrada antecede a decisão.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [
        {
          id: "read",
          kind: "input",
          text: "{gap:input}"
        },
        {
          id: "decision",
          kind: "if_then",
          condition: "{gap:condition}",
          thenBranch: [{ id: "show", kind: "output", text: "Exibir resultado" }]
        }
      ]
    },
    gaps: [
      {
        id: "input",
        response: "text",
        answer: "Ler ação"
      },
      {
        id: "condition",
        response: "choice",
        answer: "ação ≥ 1",
        distractors: ["ação < 1", "ação = 0"]
      }
    ]
  });
  const runtime = resolveCardRuntime(card);
  const flowIndex = runtime.blocks.findIndex((block) => block?.kind === "flow");
  const flowBlock = runtime.blocks[flowIndex];
  const projection = resolveRuntimeFlowchartProjection(flowBlock);
  const shapeNode = projection.nodes.find((node) => node?.textBlank);
  shapeNode.shapeBlank = true;
  const blockKey = `fluxo-formal::${flowIndex}`;
  const state = createFlowchartExerciseState(projection);

  const rendered = renderCardRuntimeBlocksWithDock(card, {
    blockKeyPrefix: "fluxo-formal",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: {
      [blockKey]: projection
    },
    flowchartExerciseStateByBlockKey: {
      [blockKey]: state
    }
  });

  assert.match(rendered.bodyHtml, /data-flowchart-inline-input="true"/u);
  assert.match(rendered.bodyHtml, /inputmode="text"/u);
  assert.match(rendered.bodyHtml, /enterkeyhint="done"/u);
  assert.match(rendered.bodyHtml, /autocorrect="off"/u);
  assert.match(rendered.bodyHtml, /com texto a preencher/u);
  assert.doesNotMatch(rendered.bodyHtml, /Ler ação/u);
  assert.doesNotMatch(rendered.bodyHtml, /ação ≥ 1/u);
  assert.doesNotMatch(
    rendered.bodyHtml,
    new RegExp(`data-shape="${shapeNode.shape}"`, "u")
  );

  const textNode = projection.nodes.find((node) => node?.textBlank);
  const choiceNode = projection.nodes.find(
    (node) => node?.textBlank && Array.isArray(node?.textOptions) && node.textOptions.length
  );
  assert.ok(textNode);
  assert.ok(choiceNode);
  state.shapes[shapeNode.id] = shapeNode.shape;
  state.texts[textNode.id] = "Ler ação";
  state.texts[choiceNode.id] = "ação ≥ 1";

  assert.equal(validateFlowchartExerciseState(projection, state).status, "correct");
});

test("prática formal de forma deriva a resposta do kind e executa sem revelar a forma", () => {
  const card = structuredShapeCard();
  const runtime = resolveCardRuntime(card);
  const flowIndex = runtime.blocks.findIndex((block) => block?.kind === "flow");
  const projection = resolveRuntimeFlowchartProjection(runtime.blocks[flowIndex]);
  const target = projection.nodes.find((node) => node.id === "calculate");

  assert.equal(target.shape, "process");
  assert.equal(target.shapeBlank, true);
  assert.deepEqual(
    listFlowchartNodeShapeOptions(target).map((option) => option.value),
    ["process", "input_output", "decision"]
  );

  const blockKey = `flow-shape::${flowIndex}`;
  const state = createFlowchartExerciseState(projection);
  const rendered = renderCardRuntimeBlocksWithDock(card, {
    blockKeyPrefix: "flow-shape",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: { [blockKey]: projection },
    flowchartExerciseStateByBlockKey: { [blockKey]: state }
  });
  assert.match(rendered.bodyHtml, /data-action="flowchart-open-shape"/u);
  assert.doesNotMatch(rendered.bodyHtml, /data-shape="process"/u);

  state.shapes[target.id] = "process";
  assert.equal(validateFlowchartExerciseState(projection, state).status, "correct");
  state.shapes[target.id] = "decision";
  assert.equal(validateFlowchartExerciseState(projection, state).status, "incorrect");
});

test("prática formal de rótulo deriva a resposta da aresta e executa choice e text", () => {
  const card = structuredLabelCard();
  const runtime = resolveCardRuntime(card);
  const flowIndex = runtime.blocks.findIndex((block) => block?.kind === "flow");
  const projection = resolveRuntimeFlowchartProjection(runtime.blocks[flowIndex]);
  const labelTargets = projection.links.filter((link) => link.labelBlank);
  const yesTarget = labelTargets.find((link) => link.label === "Sim");
  const noTarget = labelTargets.find((link) => link.label === "Não");

  assert.ok(yesTarget);
  assert.ok(noTarget);
  assert.deepEqual(
    listFlowchartLinkLabelOptions(yesTarget).map((option) => option.value),
    ["Sim", "Não"]
  );
  assert.deepEqual(noTarget.labelVariants.map((variant) => variant.value), ["Nao"]);

  const blockKey = `flow-labels::${flowIndex}`;
  const state = createFlowchartExerciseState(projection);
  const rendered = renderCardRuntimeBlocksWithDock(card, {
    blockKeyPrefix: "flow-labels",
    enableFlowchartPractice: true,
    flowchartProjectionByBlockKey: { [blockKey]: projection },
    flowchartExerciseStateByBlockKey: { [blockKey]: state }
  });
  assert.match(rendered.bodyHtml, /data-action="flowchart-open-label"/u);
  assert.doesNotMatch(rendered.bodyHtml, />Sim<\/text>/u);
  assert.doesNotMatch(rendered.bodyHtml, />Não<\/text>/u);

  state.labels[yesTarget.id] = "Sim";
  state.labels[noTarget.id] = "Nao";
  assert.equal(validateFlowchartExerciseState(projection, state).status, "correct");
  state.labels[yesTarget.id] = "Não";
  assert.equal(validateFlowchartExerciseState(projection, state).status, "incorrect");
});

test("forma e rótulo formais preservam o round-trip relacional", async () => {
  const fixtureUrl = new URL("../fixtures/v3/project-visual.json", import.meta.url);
  const project = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const microsequence =
    project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards = [structuredShapeCard(), structuredLabelCard()];

  const incompatible = structuredClone(project);
  incompatible.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[1].structure.items[0].practice.labels.no.variants = [{
      id: "old-pattern",
      value: "N(a|ã)o",
      regex: true
  }];
  assert.throws(
    () => contractToRelationalRows(incompatible),
    (error) => error?.details?.some(
      (detail) => detail.message.includes("regex:unknown_field")
    ) === true
  );

  const rows = contractToRelationalRows(project);
  assert.ok(rows.flowPracticeVariants.length > 0);
  assert.ok(rows.flowPracticeVariants.every(
    (row) => !Object.hasOwn(row, "regex") && !Object.hasOwn(row, "hasRegex")
  ));

  const rebuilt = relationalRowsToContract(rows);

  assert.deepEqual(rebuilt, project);
  const rebuiltCards =
    rebuilt.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.equal(rebuiltCards[0].structure.items[0].practice.blankShape, true);
  assert.equal(rebuiltCards[1].structure.items[0].practice.labels.yes.blank, true);
  assert.equal(rebuiltCards[1].structure.items[0].practice.labels.no.blank, true);
});
