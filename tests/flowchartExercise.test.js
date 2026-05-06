import test from "node:test";
import assert from "node:assert/strict";

import {
  createFlowchartExerciseState,
  fillFlowchartExerciseAnswer,
  flowchartProjectionHasPractice,
  listFlowchartLinkLabelOptions,
  listFlowchartNodeShapeOptions,
  listFlowchartNodeTextOptions,
  resetFlowchartExerciseState,
  validateFlowchartExerciseState
} from "../src/flowchart/flowchartExercise.js";

function createProjection() {
  return {
    nodes: [
      {
        id: "decision-1",
        shape: "decision",
        text: "Resposta correta?",
        shapeBlank: true,
        shapeOptions: ["process", "decision"],
        textBlank: true,
        textOptions: [{ id: "text-a", value: "Sim" }, { id: "text-b", value: "Não" }],
        textVariants: [{ id: "variant-1", value: "Resposta correta\\?", regex: true }]
      }
    ],
    links: [
      {
        id: "link-yes",
        label: "Sim",
        labelBlank: true,
        labelOptions: [{ id: "label-a", value: "Sim" }, { id: "label-b", value: "Não" }],
        labelVariants: [{ id: "variant-2", value: "sim", regex: false }]
      }
    ]
  };
}

test("sincroniza e reseta estado de prática do fluxograma", () => {
  const projection = createProjection();
  const state = createFlowchartExerciseState(projection, null);

  assert.equal(flowchartProjectionHasPractice(projection), true);
  assert.deepEqual(state.shapes, { "decision-1": null });
  assert.deepEqual(state.texts, { "decision-1": null });
  assert.deepEqual(state.labels, { "link-yes": null });

  state.shapes["decision-1"] = "decision";
  state.texts["decision-1"] = "Resposta correta?";
  state.labels["link-yes"] = "Sim";

  const reset = resetFlowchartExerciseState(projection, state);
  assert.equal(reset.shapes["decision-1"], null);
  assert.equal(reset.texts["decision-1"], null);
  assert.equal(reset.labels["link-yes"], null);
  assert.equal(reset.feedback, null);
});

test("valida preenchimento e resposta correta do fluxograma", () => {
  const projection = createProjection();
  const initial = createFlowchartExerciseState(projection, null);

  const incomplete = validateFlowchartExerciseState(projection, initial);
  assert.equal(incomplete.status, "incomplete");

  const incorrect = validateFlowchartExerciseState(projection, {
    ...initial,
    shapes: { "decision-1": "process" },
    texts: { "decision-1": "Não" },
    labels: { "link-yes": "Talvez" }
  });
  assert.equal(incorrect.status, "incorrect");

  const answered = fillFlowchartExerciseAnswer(projection, initial);
  const correct = validateFlowchartExerciseState(projection, answered);
  assert.equal(correct.status, "correct");
});

test("lista opções de lacunas sem duplicar o valor correto", () => {
  const projection = createProjection();
  const [node] = projection.nodes;
  const [link] = projection.links;

  assert.deepEqual(
    listFlowchartNodeShapeOptions(node).map((item) => item.value),
    ["decision", "process"]
  );
  assert.deepEqual(
    listFlowchartNodeTextOptions(node).map((item) => item.value),
    ["Resposta correta?", "Sim", "Não"]
  );
  assert.deepEqual(
    listFlowchartLinkLabelOptions(link).map((item) => item.value),
    ["Sim", "Não"]
  );
});
