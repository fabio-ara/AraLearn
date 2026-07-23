import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResourceGapModel,
  extractResourceGapAnswers
} from "../../src/core/resourceGaps.js";
import { stripTextGapSyntax } from "../../src/core/textGaps.js";
import { validateCard } from "../../src/domain/cards.js";
import {
  renderCardRuntimeBlocks,
  renderCardRuntimeBlocksWithDock
} from "../../src/render/renderCardRuntime.js";

function commonCard(resource, title, fields) {
  return {
    id: `card-gap-${resource}`,
    position: 1,
    resource,
    kind: "exercise",
    exercise: "gap",
    title,
    after: "A resposta decorre da representação mostrada no próprio card.",
    ...fields
  };
}

const cards = {
  paragraph: commonCard("paragraph", "Parágrafo interativo", {
    text: "A resposta digitada é [[Termo17]] e a seleção é [[Termo29::Termo29|Termo31]]."
  }),
  table: commonCard("table", "Tabela interativa", {
    columns: ["Entrada", "Saída"],
    rows: [
      ["2", "[[Saida17::Saida17|Saida19]]"],
      ["3", "[[Saida29]]"]
    ]
  }),
  tree: commonCard("tree", "Árvore interativa", {
    prompt: "Complete os nomes dos nós.",
    nodes: [
      { id: "root", label: "[[Diretorio17]]", parentId: null, type: "folder" },
      { id: "leaf", label: "[[Arquivo29::Arquivo29|Atalho31]]", parentId: "root", type: "file" }
    ]
  }),
  graph: commonCard("graph", "Grafo interativo", {
    prompt: "Complete o vértice e o peso.",
    vertices: [
      { id: "a", label: "[[Vertice17]]" },
      { id: "b", label: "Destino" }
    ],
    edges: [
      { from: "a", to: "b", weight: "[[Peso29::Peso29|Peso31]]", directed: true }
    ]
  }),
  relation_map: commonCard("relation_map", "Relações interativas", {
    prompt: "Complete o item e o par ordenado.",
    leftSet: {
      label: "U",
      items: [{ id: "u1", label: "[[Elemento17]]" }]
    },
    rightSet: {
      label: "V",
      items: [{ id: "v1", label: "Imagem" }]
    },
    relations: [{ from: "u1", to: "v1" }],
    pairList: ["[[Par29::Par29|Par31]]"],
    relationTable: {
      columns: ["U", "V"],
      rows: [["Domínio", "Imagem"]]
    }
  }),
  matrix: commonCard("matrix", "Matriz interativa", {
    prompt: "Complete a primeira linha.",
    name: "A",
    values: [
      ["[[Gauss17]]", "[[Euler29::Euler29|Euler31]]"],
      ["4", "5"]
    ]
  }),
  plane: commonCard("plane", "Plano interativo", {
    prompt: "Complete as coordenadas do vetor resultante.",
    x: [-1, 4],
    y: [-1, 5],
    vector: [2, 3],
    result: "([[CoordA17]], [[CoordB29::CoordB29|CoordC31]])"
  }),
  formula: commonCard("formula", "Fórmula interativa", {
    prompt: "Complete a variável e o operador.",
    notation: "mathematics",
    accessibleText: "[[Lambda17]] [[Operador29::Operador29|Alternativa31]] dois",
    expression: {
      type: "row",
      children: [
        { type: "identifier", value: "[[Lambda17]]" },
        { type: "operator", value: "[[Operador29::Operador29|Alternativa31]]" },
        { type: "number", value: "2" }
      ]
    }
  })
};

function blockKey(resource) {
  return `teste-${resource}::1`;
}

function renderState(card, state, options = {}) {
  const key = blockKey(card.resource);
  return renderCardRuntimeBlocks(card, {
    blockKeyPrefix: `teste-${card.resource}`,
    textGapExerciseStateByBlockKey: {
      [key]: state
    },
    ...options
  });
}

function removeGapSyntax(value) {
  if (typeof value === "string") {
    return stripTextGapSyntax(value);
  }
  if (Array.isArray(value)) {
    return value.map(removeGapSyntax);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, removeGapSyntax(nested)])
    );
  }
  return value;
}

function renderedText(html) {
  return String(html || "").replace(/<[^>]+>/gu, "");
}

test("contrato aceita gap digitado e por opções em cada recurso estruturado", () => {
  Object.entries(cards).forEach(([resource, card]) => {
    const validation = validateCard(card);
    assert.equal(
      validation.ok,
      true,
      `${resource}: ${(validation.errors || []).map((entry) => `${entry.path} ${entry.message}`).join("; ")}`
    );
    assert.equal(extractResourceGapAnswers(card).length, 2, resource);
  });
});

test("contrato rejeita exercise gap sem lacuna no campo interativo do recurso", () => {
  Object.entries(cards).forEach(([resource, card]) => {
    const validation = validateCard(removeGapSyntax(card));
    assert.equal(validation.ok, false, resource);
    assert.ok(
      validation.errors.some((entry) =>
        /precisa ter (?:ao menos uma lacuna|lacuna digitada ou por opções)/u.test(entry.message)
      ),
      `${resource}: ${validation.errors.map((entry) => entry.message).join("; ")}`
    );
  });
});

test("colchetes duplos literais não viram prática fora de exercise gap", () => {
  const theoryTable = {
    id: "card-theory-table-indexing",
    position: 1,
    resource: "table",
    kind: "theory",
    exercise: "none",
    title: "Tabela teórica",
    columns: ["Entrada", "Saída"],
    rows: [["Pandas", "df[[\"nome\", \"idade\"]]"]]
  };
  const choiceTable = {
    ...theoryTable,
    id: "card-choice-table-indexing",
    kind: "exercise",
    exercise: "choice",
    question: "Qual regra foi aplicada?",
    options: [
      { id: "dobro", kind: "text", text: "Dobro" },
      { id: "triplo", kind: "text", text: "Triplo" },
      { id: "quadrado", kind: "text", text: "Quadrado" }
    ],
    answer: "dobro"
  };

  for (const card of [theoryTable, choiceTable]) {
    const validation = validateCard(card);
    assert.equal(
      validation.ok,
      true,
      `${card.id}: ${(validation.errors || []).map((entry) => entry.message).join("; ")}`
    );
  }
});

test("indexação com colchetes duplos permanece válida em código teórico", () => {
  const validation = validateCard({
    id: "card-code-pandas-double-brackets",
    position: 1,
    resource: "code",
    kind: "theory",
    exercise: "none",
    title: "Seleção de colunas",
    prompt: "Selecione duas colunas do DataFrame.",
    language: "python",
    code: "recorte = df[[\"nome\", \"idade\"]]",
    after: "A lista de rótulos preserva o resultado como DataFrame."
  });

  assert.equal(
    validation.ok,
    true,
    (validation.errors || []).map((entry) => entry.message).join("; ")
  );
});

test("composite choice preserva colchetes duplos literais em recurso estruturado", () => {
  const card = {
    id: "card-composite-choice-with-table-indexing",
    position: 1,
    resource: "composite",
    kind: "exercise",
    exercise: "choice",
    title: "Composição inválida",
    blocks: [{
      kind: "table",
      columns: ["Entrada", "Saída"],
      rows: [["Pandas", "df[[\"nome\", \"idade\"]]"]]
    }, {
      kind: "choice",
      question: "Qual regra foi aplicada?",
      options: [
        { id: "dobro", kind: "text", text: "Dobro" },
        { id: "triplo", kind: "text", text: "Triplo" },
        { id: "quadrado", kind: "text", text: "Quadrado" }
      ],
      answer: "dobro"
    }]
  };

  const validation = validateCard(card);
  assert.equal(
    validation.ok,
    true,
    (validation.errors || []).map((entry) => entry.message).join("; ")
  );
});

test("fórmula exige correspondência exata entre AST e leitura acessível", () => {
  const invalid = structuredClone(cards.formula);
  invalid.accessibleText = "[[Lambda17]] [[Alternativa31::Alternativa31|Operador29]] dois";
  const validation = validateCard(invalid);

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((entry) =>
    entry.path.endsWith(".accessibleText")
    && /mesmas lacunas, na mesma ordem/u.test(entry.message)
  ));
});

test("render inicial não expõe respostas digitadas nem respostas de opção", () => {
  Object.entries(cards).forEach(([resource, card]) => {
    const answers = extractResourceGapAnswers(card);
    const html = renderState(card, { values: answers.map(() => ""), feedback: null });

    assert.match(html, /contenteditable="true"/u, `${resource}: falta lacuna digitada`);
    assert.match(
      html,
      /contenteditable="true"[^>]*dir="auto"/u,
      `${resource}: direção digitada não é automática`
    );
    assert.match(
      html,
      /contenteditable="true"[^>]*inputmode="text"/u,
      `${resource}: teclado textual móvel não foi solicitado`
    );
    assert.match(
      html,
      /contenteditable="true"[^>]*enterkeyhint="done"/u,
      `${resource}: ação de conclusão não foi informada ao teclado móvel`
    );
    assert.match(
      html,
      /contenteditable="true"[^>]*autocorrect="off"/u,
      `${resource}: corretor automático pode alterar a resposta`
    );
    assert.match(html, /data-action="text-gap-open-choice"/u, `${resource}: falta lacuna por opções`);
    assert.match(
      html,
      /dir="auto"[^>]*data-text-gap-choice="true"|data-text-gap-choice="true"[^>]*dir="auto"/u,
      `${resource}: direção da escolha não é automática`
    );
    assert.match(html, /data-complete-blank-index="0"/u, `${resource}: índice 0 ausente`);
    assert.match(html, /data-complete-blank-index="1"/u, `${resource}: índice 1 ausente`);
    assert.doesNotMatch(html, /\[\[|\]\]/u, `${resource}: notação interna vazou no HTML`);
    answers.forEach((answer) => {
      assert.doesNotMatch(
        html,
        new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"),
        `${resource}: resposta vazou antes da interação`
      );
    });
  });
});

test("seleção, digitação e feedback usam o mesmo estado nos recursos estruturados", () => {
  Object.entries(cards).forEach(([resource, card]) => {
    const answers = extractResourceGapAnswers(card);
    const choiceToken = buildResourceGapModel(card).tokens.find((token) => token.hasOptions);
    const key = blockKey(resource);
    const filledHtml = renderState(card, { values: answers, feedback: "correct" });
    answers.forEach((answer) => assert.match(filledHtml, new RegExp(answer, "u"), resource));
    assert.match(filledHtml, /Correto\./u, resource);
    assert.match(
      filledHtml,
      new RegExp(`data-complete-feedback-block-key="${key}"`, "u"),
      resource
    );

    const wrongHtml = renderState(card, {
      values: ["resposta digitada incorreta", "opção incorreta"],
      feedback: "wrong"
    });
    assert.match(wrongHtml, /data-action="complete-view-answer"/u, resource);
    assert.match(wrongHtml, /data-action="complete-try-again"/u, resource);
    assert.match(wrongHtml, new RegExp(`data-complete-block-key="${key}"`, "u"), resource);

    const dock = renderCardRuntimeBlocksWithDock(card, {
      blockKeyPrefix: `teste-${resource}`,
      textGapExerciseStateByBlockKey: {
        [key]: { values: ["", ""], feedback: null }
      },
      activeTextGapPrompt: {
        blockKey: key,
        blankIndex: choiceToken.index
      }
    });
    assert.match(dock.bodyHtml, /data-action="text-gap-open-choice"/u, resource);
    assert.match(dock.dockHtml, /data-action="text-gap-set-choice"/u, resource);
    assert.match(dock.dockHtml, new RegExp(choiceToken.answer, "u"), resource);

    const selectedDock = renderCardRuntimeBlocksWithDock(card, {
      blockKeyPrefix: `teste-${resource}`,
      textGapExerciseStateByBlockKey: {
        [key]: {
          values: answers,
          feedback: null
        }
      },
      activeTextGapPrompt: {
        blockKey: key,
        blankIndex: choiceToken.index
      }
    });
    assert.match(
      selectedDock.dockHtml,
      new RegExp(
        `class="token-option active"[^>]*data-text-gap-value="${choiceToken.answer}"`,
        "u"
      ),
      `${resource}: a alternativa já escolhida precisa permanecer marcada ao reabrir`
    );
  });
});

test("composite mantém lacunas e estados independentes por bloco", () => {
  const card = commonCard("composite", "Composição interativa", {
    blocks: [
      {
        kind: "table",
        columns: ["Conceito", "Valor"],
        rows: [["A", "[[alfa::alfa|beta]]"]]
      },
      {
        kind: "code",
        prompt: "Complete o retorno.",
        language: "python",
        code: "def identidade(valor):\n    return [[valor]]"
      }
    ]
  });
  const validation = validateCard(card);
  assert.equal(
    validation.ok,
    true,
    (validation.errors || []).map((entry) => `${entry.path} ${entry.message}`).join("; ")
  );

  const initial = renderCardRuntimeBlocks(card, {
    blockKeyPrefix: "teste-composite",
    textGapExerciseStateByBlockKey: {
      "teste-composite::1": { values: [""], feedback: null },
      "teste-composite::2": { values: [""], feedback: null }
    }
  });
  assert.match(initial, /data-complete-block-key="teste-composite::1"/u);
  assert.match(initial, /data-complete-block-key="teste-composite::2"/u);
  assert.doesNotMatch(initial, />alfa</u);
  assert.doesNotMatch(initial, />valor</u);

  const answered = renderCardRuntimeBlocks(card, {
    blockKeyPrefix: "teste-composite",
    textGapExerciseStateByBlockKey: {
      "teste-composite::1": { values: ["alfa"], feedback: "correct" },
      "teste-composite::2": { values: ["valor"], feedback: "wrong" }
    }
  });
  assert.match(answered, />alfa</u);
  assert.match(answered, />valor</u);
  assert.match(answered, /Correto\./u);
  assert.match(answered, /data-action="complete-try-again"/u);
});

test("code gap preserva quebras de linha e indentação antes e depois da resposta", () => {
  const card = commonCard("code", "Código interativo", {
    prompt: "Complete o retorno sem alterar a indentação.",
    language: "python",
    code: [
      "def soma(a, b):",
      "    [[return::return|print]] a + [[b]]",
      "",
      "resultado = soma(2, 3)"
    ].join("\n")
  });
  const validation = validateCard(card);
  assert.equal(
    validation.ok,
    true,
    (validation.errors || []).map((entry) => `${entry.path} ${entry.message}`).join("; ")
  );

  const initial = renderState(card, { values: ["", ""], feedback: null });
  assert.match(renderedText(initial), /def soma\(a, b\):\n {5}a \+ /u);
  assert.doesNotMatch(initial, />return</u);

  const answered = renderState(card, {
    values: ["return", "b"],
    feedback: "correct"
  });
  assert.match(renderedText(answered), /def soma\(a, b\):\n {4}return a \+ b/u);
  assert.match(renderedText(answered), /\n\nresultado = soma\(2, 3\)/u);
});
