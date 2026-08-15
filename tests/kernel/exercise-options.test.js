import assert from "node:assert/strict";
import test from "node:test";

import { shuffleExerciseOptions } from "../../src/core/exerciseOptions.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const POSITION_SAMPLE_SIZE = 16_384;
const POSITION_TOLERANCE = 0.08;

function choiceInstance(optionCount, selectionMode, selectionCriterion = "correct") {
  const options = Array.from({ length: optionCount }, (_, index) => ({
    id: `option-${index + 1}`,
    text: `Opção ${index + 1}`
  }));
  const answerIds = selectionMode === "multiple" && optionCount > 2
    ? [options[0].id, options.at(-1).id]
    : [options.at(-1).id];
  return {
    id: `choice-${selectionMode}-${selectionCriterion}-${optionCount}`,
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: "Quais alternativas pertencem ao conjunto esperado?",
      selectionMode,
      selectionCriterion,
      options,
      answerIds
    }
  };
}

function renderedOptionIds(instance, seed) {
  const html = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "response", {
    blockKey: instance.id,
    exerciseShuffleSeed: seed,
    responseState: { selected: instance.data.answerIds, feedback: null }
  });
  return [...html.matchAll(/data-choice-option-id="([^"]+)"/gu)].map((match) => match[1]);
}

test("Fisher–Yates seeded admite as duas ordens binárias sem alterar a origem", () => {
  const source = Object.freeze(["A", "B"]);
  const outcomes = new Set();

  for (let index = 0; index < 64; index += 1) {
    outcomes.add(JSON.stringify(shuffleExerciseOptions(source, `binary-${index}`)));
  }

  assert.deepEqual(source, ["A", "B"]);
  assert.ok(outcomes.has(JSON.stringify(["A", "B"])), "a ordem original precisa continuar possível");
  assert.ok(outcomes.has(JSON.stringify(["B", "A"])), "a inversão precisa continuar possível");
});

test("Fisher–Yates seeded distribui cada item entre as posições de listas com 2 a 8 opções", () => {
  for (let optionCount = 2; optionCount <= 8; optionCount += 1) {
    const source = Array.from({ length: optionCount }, (_, index) => `option-${index + 1}`);
    const original = source.slice();
    const visits = new Map(source.map((id) => [id, Array(optionCount).fill(0)]));

    for (let sample = 0; sample < POSITION_SAMPLE_SIZE; sample += 1) {
      const seed = `positions-${optionCount}-${sample}`;
      const shuffled = shuffleExerciseOptions(source, seed);
      assert.deepEqual(shuffleExerciseOptions(source, seed), shuffled, `seed instável com ${optionCount} opções`);
      assert.deepEqual(new Set(shuffled), new Set(source), `permutação inválida com ${optionCount} opções`);
      shuffled.forEach((id, position) => { visits.get(id)[position] += 1; });
    }

    assert.deepEqual(source, original, `a origem foi alterada com ${optionCount} opções`);
    const expectedVisits = POSITION_SAMPLE_SIZE / optionCount;
    visits.forEach((positions, id) => {
      positions.forEach((count, position) => {
        const deviation = Math.abs(count - expectedVisits) / expectedVisits;
        assert.ok(
          deviation < POSITION_TOLERANCE,
          `${id} ficou enviesada na posição ${position} com ${optionCount} opções: ${count}/${POSITION_SAMPLE_SIZE}`
        );
      });
    });
  }
});

test("choice avalia por ids, não pela posição exibida, entre 2 e 8 opções", () => {
  const configurations = [
    ["single", "correct"],
    ["single", "best"],
    ["multiple", "correct"]
  ];

  for (let optionCount = 2; optionCount <= 8; optionCount += 1) {
    configurations.forEach(([selectionMode, selectionCriterion]) => {
      const authored = choiceInstance(optionCount, selectionMode, selectionCriterion);
      const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance(authored, "response");
      const expectedIds = instance.data.answerIds;
      const incorrectId = instance.data.options.find(({ id }) => !expectedIds.includes(id)).id;

      assert.equal(
        RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
          selectedIds: expectedIds.slice().reverse()
        }).correct,
        true,
        `${instance.id}: o conjunto correto precisa independer da ordem de seleção`
      );
      assert.equal(
        RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
          selectedIds: expectedIds.slice(0, -1)
        }).correct,
        false,
        `${instance.id}: conjunto incompleto não pode ser aceito`
      );
      assert.equal(
        RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
          selectedIds: [...expectedIds, incorrectId]
        }).correct,
        false,
        `${instance.id}: conjunto com alternativa incorreta não pode ser aceito`
      );

      ["render-a", "render-b", "render-c"].forEach((seed) => {
        const displayedIds = renderedOptionIds(instance, seed);
        assert.equal(displayedIds.length, optionCount, `${instance.id}: quantidade renderizada incorreta`);
        assert.deepEqual(
          new Set(displayedIds),
          new Set(instance.data.options.map(({ id }) => id)),
          `${instance.id}: o embaralhamento alterou as identidades`
        );
      });
    });
  }
});

test("choice multiple aceita exatamente três corretas entre cinco alternativas", () => {
  const authored = choiceInstance(5, "multiple", "correct");
  authored.data.answerIds = ["option-1", "option-3", "option-5"];
  const instance = RESOURCE_PACKAGE_REGISTRY.normalizeInstance(authored, "response");

  assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(instance, "response").valid, true);
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
      selectedIds: ["option-5", "option-1", "option-3"]
    }).correct,
    true
  );
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
      selectedIds: ["option-1", "option-3"]
    }).correct,
    false
  );
  assert.equal(
    RESOURCE_PACKAGE_REGISTRY.evaluateResponse(instance, {
      selectedIds: ["option-1", "option-2", "option-3", "option-5"]
    }).correct,
    false
  );
});

test("choice limita o conjunto autoral a 2–8 opções", () => {
  const tooShort = choiceInstance(1, "single");
  const tooLong = choiceInstance(9, "single");

  assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(tooShort, "response").valid, false);
  assert.equal(RESOURCE_PACKAGE_REGISTRY.validateInstance(tooLong, "response").valid, false);
});
