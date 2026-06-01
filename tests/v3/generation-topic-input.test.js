import test from "node:test";
import assert from "node:assert/strict";

import { mergeGenerationTopics, splitGenerationTopics } from "../../src/ui/generationTopicInput.js";

test("splitGenerationTopics separa colagem multilinha em tópicos individuais", () => {
  const topics = splitGenerationTopics("definição de grafo\nvértices e arestas\n\ngrau de vértice\n");

  assert.deepEqual(topics, ["definição de grafo", "vértices e arestas", "grau de vértice"]);
});

test("mergeGenerationTopics adiciona múltiplos tópicos e remove duplicatas do lado oposto", () => {
  const result = mergeGenerationTopics(
    ["definição de grafo"],
    ["grafo completo", "grafo regular"],
    "grafo completo\ngrafo bipartido\ndefinição de grafo"
  );

  assert.deepEqual(result, {
    nextTopics: ["definição de grafo", "grafo completo", "grafo bipartido"],
    filteredOppositeTopics: ["grafo regular"]
  });
});

