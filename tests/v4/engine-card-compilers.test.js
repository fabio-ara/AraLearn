import test from "node:test";
import assert from "node:assert/strict";

import { compileCardFromTemplate } from "../../src/generation/engine/cardCompilers/index.js";
import { parseMatrixRowSlot } from "../../src/generation/engine/cardCompilers/matrixCompiler.js";
import { normalizeQuotedTextValue } from "../../src/generation/engine/templateSemanticValidation.js";
import { parseFlowStepsSlot } from "../../src/generation/engine/cardCompilers/flowCompiler.js";

test("paragraph_gap monta [[...]]", () => {
  const card = compileCardFromTemplate({
    templateId: "paragraph_gap",
    position: 1,
    slots: {
      1: "Complete",
      2: "Complete:",
      3: "matriz",
      4: "grafo",
      5: "vetor",
      6: "Revise a ideia."
    }
  });
  assert.match(card.text, /\[\[matriz::matriz\|grafo\|vetor\]\]/);
});

test("paragraph_gap escapa caracteres reservados da lacuna", () => {
  const card = compileCardFromTemplate({
    templateId: "paragraph_gap",
    position: 1,
    slots: {
      1: "Complete",
      2: "Preencha:",
      3: "case 2:",
      4: "default:",
      5: "case 1:",
      6: "Revise."
    }
  });

  assert.match(card.text, /\[\[case 2\\:::case 2\\:\|default\\:\|case 1\\:\]\]/);
});

test("choice_exercise exige answerIds válido e não cai na primeira opção", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "choice_exercise",
    position: 1,
    slots: {
      1: "Escolha",
      2: "Qual alternativa resolve o caso descrito?",
      3: "primeira possibilidade correta",
      4: "confunde linha com coluna",
      5: "troca o valor pela posição",
      6: "z",
      7: "Depois."
    }
  }), /answerIds inválido/i);
});

test("choice, graph, relation_map, tree, matrix e plane compilam estruturas válidas", () => {
  const choice = compileCardFromTemplate({
    templateId: "choice_exercise",
    position: 1,
    slots: { 1: "Escolha", 2: "Qual alternativa resolve o caso descrito?", 3: "primeira possibilidade correta", 4: "confunde linha com coluna", 5: "troca o valor pela posição", 6: "a", 7: "Depois." }
  });
  assert.deepEqual(choice.answerIds, ["a"]);

  const graph = compileCardFromTemplate({
    templateId: "graph_simple",
    position: 2,
    slots: { 1: "Grafo", 2: "Observe.", 3: "A|B|C", 4: "A>B|B>C", 5: "Qual caminho?", 6: "A-B-C", 7: "A-C", 8: "B-A-C", 9: "a", 10: "Depois." }
  });
  assert.equal(graph.vertices.length, 3);
  assert.equal(graph.edges.length, 2);

  const relationMap = compileCardFromTemplate({
    templateId: "relation_map_simple",
    position: 3,
    slots: { 1: "Relação", 2: "Observe.", 3: "A|B", 4: "1|2", 5: "A>1|B>2", 6: "Qual?", 7: "(A,1)", 8: "(A,2)", 9: "(B,1)", 10: "a", 11: "Depois." }
  });
  assert.equal(relationMap.relations.length, 2);

  const tree = compileCardFromTemplate({
    templateId: "tree_path",
    position: 4,
    slots: { 1: "Árvore", 2: "Observe.", 3: "raiz|pasta|arquivo", 4: "Qual é o filho?", 5: "arquivo", 6: "raiz", 7: "nenhum", 8: "a", 9: "Depois." }
  });
  assert.equal(tree.nodes[2].parentId, "node-2");

  const matrix = compileCardFromTemplate({
    templateId: "matrix_theory",
    position: 5,
    slots: { 1: "Matriz", 2: "Observe.", 3: "A", 4: "[1, 2]", 5: "| 3 | 4 |", 6: "Depois." }
  });
  assert.deepEqual(matrix.values, [["1", "2"], ["3", "4"]]);

  const matrixChoice = compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 6,
    slots: {
      1: "Posição",
      2: "Observe a matriz.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "4",
      10: "9",
      11: "1",
      12: "Primeiro vem a linha."
    }
  });
  assert.deepEqual(matrixChoice.answerIds, ["b"]);

  const plane = compileCardFromTemplate({
    templateId: "plane_vector",
    position: 7,
    slots: { 1: "Plano", 2: "Observe.", 3: "(2,1)", 4: "Qual opção representa corretamente a seta mostrada?", 5: "(2,1)", 6: "(1,2)", 7: "(2,-1)", 8: "a", 9: "Depois." }
  });
  assert.deepEqual(plane.vector, [2, 1]);
});

test("matrix rows são validadas e normalizadas explicitamente", () => {
  assert.deepEqual(parseMatrixRowSlot("2 | 5 | 8"), ["2", "5", "8"]);
  assert.deepEqual(parseMatrixRowSlot("| 2 | 5 | 8 |"), ["2", "5", "8"]);
  assert.deepEqual(parseMatrixRowSlot("[2, 5, 8]"), ["2", "5", "8"]);
  assert.throws(() => parseMatrixRowSlot("linha solta"), /barras verticais|vírgulas claras/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "matrix_theory",
    position: 1,
    slots: { 1: "Matriz", 2: "Observe.", 3: "A", 4: "1 | 2 | 3", 5: "4 | 5", 6: "Depois." }
  }), /colunas/);
});

test("matrix_locate_cell_choice deriva answerIds e rejeita inconsistências semânticas", () => {
  assert.deepEqual(compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 1,
    slots: {
      1: "Posição",
      2: "Observe.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "4",
      10: "9",
      11: "1",
      12: "Primeiro vem a linha."
    }
  }).answerIds, ["b"]);
  assert.throws(() => compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 2,
    slots: {
      1: "Posição",
      2: "Observe.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "4",
      10: "1",
      11: "5",
      12: "Primeiro vem a linha."
    }
  }), /nenhuma opção/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 3,
    slots: {
      1: "Posição",
      2: "Observe.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "9",
      10: "9",
      11: "1",
      12: "Primeiro vem a linha."
    }
  }), /mais de uma opção|opções repetidas/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 4,
    slots: {
      1: "Posição",
      2: "Observe.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "3",
      7: "1",
      8: "Qual número está na linha 3, coluna 1?",
      9: "4",
      10: "9",
      11: "1",
      12: "Primeiro vem a linha."
    }
  }), /targetRow/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 5,
    slots: {
      1: "Posição",
      2: "Observe.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "4",
      8: "Qual número está na linha 2, coluna 4?",
      9: "4",
      10: "9",
      11: "1",
      12: "Primeiro vem a linha."
    }
  }), /targetCol/);
});

test("placeholders e vocabulário técnico interno não chegam ao card final", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "choice_exercise",
    position: 1,
    slots: { 1: "Escolha", 2: "Qual opção?", 3: "Alternativa A", 4: "outra", 5: "terceira", 6: "a", 7: "Depois." }
  }), /placeholder proibido/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "paragraph_theory",
    position: 2,
    slots: { 1: "Teoria", 2: "Este card explica o schema interno.", 3: "Depois." }
  }), /linguagem técnica interna|vazamento estrutural/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "graph_simple",
    position: 3,
    slots: { 1: "Grafo", 2: "Observe.", 3: "A|B|C", 4: "A>B|B>C", 5: "Qual caminho?", 6: "A-B-C", 7: "A-C", 8: "B-A-C", 9: "a", 10: "CARD 2" }
  }), /vazamento estrutural/);
  assert.throws(() => compileCardFromTemplate({
    templateId: "paragraph_theory",
    position: 4,
    slots: { 1: "Teoria", 2: "Neste flashcard, o usuário deve revisar a leitura curta.", 3: "Depois." }
  }), /artificial|conteúdo proibido|vazamento estrutural/i);
});

test("normalizeQuotedTextValue remove apenas aspas externas", () => {
  assert.equal(normalizeQuotedTextValue("\"Correto.\""), "Correto.");
  assert.equal(normalizeQuotedTextValue("'Correto.'"), "Correto.");
  assert.equal(normalizeQuotedTextValue("Ele disse \"correto\" no exemplo."), "Ele disse \"correto\" no exemplo.");
  assert.equal(normalizeQuotedTextValue("\"Ele disse \\\"correto\\\".\""), "Ele disse \"correto\".");
});

test("compile normaliza aspas externas em slots textuais", () => {
  const card = compileCardFromTemplate({
    templateId: "matrix_locate_cell_choice",
    position: 7,
    slots: {
      1: "\"Posição\"",
      2: "Observe a matriz.",
      3: "A",
      4: "4 | 7 | 2",
      5: "9 | 1 | 5",
      6: "2",
      7: "1",
      8: "Qual número está na linha 2, coluna 1?",
      9: "4",
      10: "9",
      11: "1",
      12: "\"Ele disse \\\"correto\\\".\""
    }
  });
  assert.equal(card.title, "Posição");
  assert.equal(card.after, "Ele disse \"correto\".");
});

test("graph_simple calcula caminho único válido e corrige answerIds inconsistente", () => {
  const card = compileCardFromTemplate({
    templateId: "graph_simple",
    position: 1,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|A>D",
      5: "Qual caminho simples vai de A até C?",
      6: "A, B, C",
      7: "A, D, C",
      8: "A, B, D, C",
      9: "c",
      10: "A opção correta usa apenas arestas existentes."
    }
  });
  assert.deepEqual(card.answerIds, ["a"]);
});

test("graph_simple rejeita múltiplas alternativas válidas", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "graph_simple",
    position: 2,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|C>D|A>D|D>C",
      5: "Qual caminho simples vai de A até C?",
      6: "A, B, C",
      7: "A, D, C",
      8: "A, B, D, C",
      9: "a",
      10: "A resposta correta é a primeira."
    }
  }), /ambiguidade.*graph_simple|múltiplas alternativas válidas/i);
});

test("graph_simple rejeita quando nenhuma alternativa forma caminho válido", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "graph_simple",
    position: 3,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|C>D",
      5: "Qual caminho simples vai de A até D?",
      6: "A, C, D",
      7: "A, B, B, D",
      8: "A, E, D",
      9: "a",
      10: "Confira as ligações."
    }
  }), /nenhuma alternativa forma caminho simples válido/i);
});

test("graph_simple aceita distratores ruins quando resta uma única correta", () => {
  const card = compileCardFromTemplate({
    templateId: "graph_simple",
    position: 4,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|C>D",
      5: "Qual caminho simples vai de A até C?",
      6: "A, B, C",
      7: "A, E, C",
      8: "A, B, B, C",
      9: "b",
      10: "A correta usa só vértices existentes."
    }
  });
  assert.deepEqual(card.answerIds, ["a"]);
});

test("graph_simple rejeita feedback contraditório", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "graph_simple",
    position: 5,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|A>D",
      5: "Qual caminho simples vai de A até C?",
      6: "A, B, C",
      7: "A, D, C",
      8: "A, B, D, C",
      9: "a",
      10: "A opção B também é válida."
    }
  }), /feedback contraditório/i);
});

test("graph_simple aceita feedback que explica o erro do distrator", () => {
  const card = compileCardFromTemplate({
    templateId: "graph_simple",
    position: 6,
    slots: {
      1: "Caminho simples",
      2: "Observe o grafo.",
      3: "A|B|C|D",
      4: "A>B|B>C|A>D",
      5: "Qual caminho simples vai de A até C?",
      6: "A, B, C",
      7: "A, D, C",
      8: "A, B, D, C",
      9: "a",
      10: "A opção B falha porque não há aresta de D até C."
    }
  });
  assert.deepEqual(card.answerIds, ["a"]);
});

test("relation_map_simple normaliza listas e calcula alternativa correta", () => {
  const card = compileCardFromTemplate({
    templateId: "relation_map_simple",
    position: 8,
    slots: {
      1: "Frutas e cores",
      2: "Observe os conjuntos e a relação.",
      3: "Maçã, Banana, Uva",
      4: "Vermelho, Amarelo, Roxo",
      5: "Maçã - Vermelho, Banana - Amarelo, Uva - Roxo",
      6: "Qual é a cor da Banana?",
      7: "Vermelho",
      8: "Amarelo",
      9: "Roxo",
      10: "c",
      11: "A relação associa Banana a Amarelo."
    }
  });
  assert.deepEqual(card.answerIds, ["b"]);
  assert.equal(card.leftSet.items.length, 3);
  assert.equal(card.relations.length, 3);
});

test("relation_map_simple rejeita ausência de alternativa correta", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "relation_map_simple",
    position: 9,
    slots: {
      1: "Frutas e cores",
      2: "Observe os conjuntos e a relação.",
      3: "Maçã | Banana | Uva",
      4: "Vermelho | Amarelo | Roxo",
      5: "Maçã-Vermelho | Banana-Amarelo | Uva-Roxo",
      6: "Qual é a cor da Banana?",
      7: "Verde",
      8: "Azul",
      9: "Laranja",
      10: "a",
      11: "Confira a relação."
    }
  }), /nenhuma alternativa corresponde à relação pedida/i);
});

test("flow_linear normaliza lista numerada e calcula alternativa correta", () => {
  assert.deepEqual(parseFlowStepsSlot("1. Ferver água. 2. Colocar o pó no filtro. 3. Despejar água quente."), [
    "Ferver água.",
    "Colocar o pó no filtro.",
    "Despejar água quente."
  ]);
  const card = compileCardFromTemplate({
    templateId: "flow_linear",
    position: 10,
    slots: {
      1: "Café",
      2: "Observe a sequência.",
      3: "1. Ferver água. 2. Colocar o pó no filtro. 3. Despejar água quente. 4. Servir.",
      4: "Qual passo vem imediatamente após \"Colocar o pó no filtro.\"?",
      5: "Ferver água.",
      6: "Despejar água quente.",
      7: "Servir.",
      8: "a",
      9: "Depois de colocar o pó, vem a água quente."
    }
  });
  assert.deepEqual(card.answerIds, ["b"]);
  assert.equal(card.structure.items.length, 4);
});

test("flow_linear aceita sequência equivalente com rótulos resumidos", () => {
  const card = compileCardFromTemplate({
    templateId: "flow_linear",
    position: 12,
    slots: {
      1: "Preparo de café",
      2: "Observe o fluxo.",
      3: "1. Ferver a água | 2. Moer os grãos de café | 3. Colocar o filtro no suporte | 4. Umedecer o filtro | 5. Adicionar o pó de café | 6. Despejar a água quente lentamente | 7. Aguardar a extração | 8. Servir o café",
      4: "Qual é a sequência correta das etapas para preparar café filtrado?",
      5: "1. Moer os grãos | 2. Ferver a água | 3. Colocar o filtro | 4. Umedecer o filtro | 5. Adicionar o pó | 6. Despejar a água | 7. Aguardar | 8. Servir",
      6: "1. Ferver a água | 2. Moer os grãos | 3. Colocar o filtro | 4. Umedecer o filtro | 5. Adicionar o pó | 6. Despejar a água | 7. Aguardar | 8. Servir",
      7: "1. Ferver a água | 2. Colocar o filtro | 3. Umedecer o filtro | 4. Moer os grãos | 5. Adicionar o pó | 6. Despejar a água | 7. Aguardar | 8. Servir",
      8: "a",
      9: "A sequência correta respeita a ordem do fluxo."
    }
  });
  assert.deepEqual(card.answerIds, ["b"]);
});

test("flow_linear rejeita ausência de alternativa correta", () => {
  assert.throws(() => compileCardFromTemplate({
    templateId: "flow_linear",
    position: 11,
    slots: {
      1: "Café",
      2: "Observe a sequência.",
      3: "início | meio | fim",
      4: "Qual passo vem imediatamente após \"meio\"?",
      5: "início",
      6: "meio",
      7: "desvio",
      8: "a",
      9: "Confira a ordem."
    }
  }), /nenhuma alternativa corresponde ao fluxo correto/i);
});
