import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDidacticQuality } from "../../src/generation/engine/didacticQualityMetrics.js";

function sampleLesson(cards = []) {
  return {
    guide: {
      goal: "Ler posição em matriz.",
      include: ["linha", "coluna", "posição a_ij"],
      exclude: ["determinante"],
      notation: [],
      avoid: []
    },
    microsequences: [
      {
        id: "micro-1",
        title: "Posição a_ij",
        goal: "Ler posição em matriz.",
        role: "explain",
        covers: ["linha", "coluna", "posição a_ij"],
        checks: ["o aluno reconhece posição a_ij"],
        dependsOn: []
      }
    ],
    cards
  };
}

test("métricas didáticas detectam teoria densa e feedback genérico", () => {
  const cards = [
    {
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Teoria",
      text: "A matriz organiza números em linhas e colunas; além disso, cada posição usa dois índices; por fim, a leitura precisa respeitar a ordem entre linha e coluna para localizar cada elemento sem confundir posição, valor e notação em uma única explicação longa.",
      after: ""
    },
    {
      position: 2,
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Prática",
      question: "Qual valor está em a_21?",
      options: [
        { id: "a", text: "9" },
        { id: "b", text: "7" },
        { id: "c", text: "1" }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: "Correto."
    }
  ];
  const result = evaluateDidacticQuality({
    cards,
    planItems: [
      { position: 1, resource: "paragraph" },
      { position: 2, resource: "choice" }
    ],
    guide: sampleLesson(cards).guide,
    microsequence: sampleLesson(cards).microsequences[0],
    lesson: sampleLesson(cards)
  });
  assert.equal(result.metrics.theoryDensity.warnings.length > 0, true);
  assert.equal(result.metrics.feedbackSpecificity.warnings.length > 0, true);
});

test("métricas didáticas reconhecem melhora após auditoria", () => {
  const beforeCards = [
    {
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Base",
      text: "A matriz usa linha e coluna.",
      after: ""
    },
    {
      position: 2,
      resource: "matrix",
      kind: "exercise",
      exercise: "choice",
      title: "Prática",
      prompt: "Observe a matriz.",
      values: [["4", "7"], ["9", "1"]],
      question: "Qual número está na linha 2, coluna 1?",
      options: [
        { id: "a", text: "4" },
        { id: "b", text: "9" },
        { id: "c", text: "1" }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["b"],
      after: "Correto."
    }
  ];
  const afterCards = [
    {
      ...beforeCards[0]
    },
    {
      ...beforeCards[1],
      after: "Primeiro vem a linha e depois a coluna; por isso a_21 aponta para o valor 9."
    }
  ];
  const before = evaluateDidacticQuality({
    cards: beforeCards,
    planItems: [
      { position: 1, resource: "paragraph" },
      { position: 2, resource: "matrix" }
    ],
    guide: sampleLesson(beforeCards).guide,
    microsequence: sampleLesson(beforeCards).microsequences[0],
    lesson: sampleLesson(beforeCards)
  });
  const after = evaluateDidacticQuality({
    cards: afterCards,
    planItems: [
      { position: 1, resource: "paragraph" },
      { position: 2, resource: "matrix" }
    ],
    guide: sampleLesson(afterCards).guide,
    microsequence: sampleLesson(afterCards).microsequences[0],
    lesson: sampleLesson(afterCards)
  });
  assert.equal(before.metrics.feedbackSpecificity.warnings.length > after.metrics.feedbackSpecificity.warnings.length, true);
});
