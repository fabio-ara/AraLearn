import test from "node:test";
import assert from "node:assert/strict";

import { validateGeneratedCards } from "../../src/generation/validation/validateGeneratedCards.js";
import { validateGeneratedCardsStructural } from "../../src/generation/validation/validateGeneratedCardsStructural.js";

function contractFor(card) {
  return {
    plan: [
      {
        position: 1,
        role: card.kind === "exercise" ? "practice" : "explain",
        resource: card.resource,
        kind: card.kind,
        exercise: card.exercise,
        goal: "",
        checks: []
      }
    ],
    output: { cardCount: 1 }
  };
}

function structural(card) {
  return validateGeneratedCardsStructural({ cards: [card] }, contractFor(card));
}

test("campos fora do schema falham", () => {
  [
    "algumCampo",
    "campoExtra",
    "foraDoContrato",
    "xInterno",
    "naoPrevisto"
  ].forEach((fieldName) => {
    const result = validateGeneratedCardsStructural({
      cards: [
        {
          position: 1,
          resource: "paragraph",
          kind: "theory",
          exercise: "none",
          title: "Teste",
          text: "Texto.",
          after: "",
          [fieldName]: "x"
        }
      ]
    }, contractFor({
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none"
    }));
    assert.equal(result.ok, false, fieldName);
    assert.match(result.structuralErrors.join("\n"), new RegExp(`campo fora do schema: ${fieldName}\\.`));
  });
});

test("exercício textual sem lacuna falha com mensagem clara", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Exercício",
    text: "Explique a regra da conjunção.",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /lacuna digitada ou por opções válida/);
});

test("exercício textual aceita resposta digitada sem lista de opções", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Complete",
    text: "A derivada de x ao quadrado é [[2x]].",
    after: "A regra da potência reduz o expoente em uma unidade."
  });
  assert.equal(result.ok, true);
});

test("code gap aceita resposta digitada preservando a sintaxe da linguagem", () => {
  const result = structural({
    position: 1,
    resource: "code",
    kind: "exercise",
    exercise: "gap",
    title: "Complete a consulta",
    prompt: "Digite a cláusula que filtra linhas.",
    language: "sql",
    code: "SELECT nome FROM pessoas [[WHERE ativo = TRUE]];",
    after: "WHERE aplica uma condição antes de formar o resultado."
  });
  assert.equal(result.ok, true);
});

test("exercício textual com lacuna passa", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Complete",
    text: "A conjunção é verdadeira quando [[P e Q são verdadeiras::P e Q são verdadeiras|só P é verdadeira|só Q é verdadeira]].",
    after: "As duas partes precisam ser verdadeiras."
  });
  assert.equal(result.ok, true);
});

test("code gap com resposta terminada em dois-pontos, operador lógico e colchete final passa", () => {
  const result = structural({
    position: 1,
    resource: "code",
    kind: "exercise",
    exercise: "gap",
    title: "Complete",
    prompt: "Preencha a lacuna.",
    language: "c",
    code: [
      "switch (opcao)",
      "{",
      "    [[case 2\\:::case 2\\:|default\\:|nota < 0 \\|\\| nota > 10|v[5\\]]]",
      "}"
    ].join("\n"),
    after: ""
  });

  assert.equal(result.ok, true);
});

test("choice com answer inválido falha", () => {
  const result = structural({
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha",
    question: "Qual opção está correta?",
    options: [
      { id: "a", text: "Opção A" },
      { id: "b", text: "Opção B" },
      { id: "c", text: "Opção C" }
    ],
    answer: "z",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /answer deve apontar para um id existente/);
});

test("choice rejeita kind e campos de opção fora do contrato", () => {
  const card = {
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha",
    question: "Qual opção está correta?",
    options: [
      { id: "a", kind: "bogus", text: "A", color: "red" },
      { id: "b", text: "B" },
      { id: "c", text: "C" }
    ],
    answer: "a",
    after: ""
  };
  const result = structural(card);
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /kind da opção deve ser/);
  assert.match(result.structuralErrors.join("\n"), /Campo fora do schema da opção/);
});

test("graph rejeita coordenadas não finitas", () => {
  const result = structural({
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Grafo",
    prompt: "Observe.",
    vertices: [{ id: "a", label: "A", x: "abc", y: 1 }],
    edges: [],
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /x deve ser número finito/);
});

test("flow rejeita escalares internos que não sejam strings", () => {
  const result = structural({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Fluxo",
    prompt: "Observe.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{ id: "step", kind: "process", text: 123 }]
    },
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /expected_string/);
});

test("choice correto passa", () => {
  const result = structural({
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha",
    question: "Qual comando mostra o diretório atual?",
    options: [
      { id: "a", text: "pwd" },
      { id: "b", text: "mkdir" },
      { id: "c", text: "touch" }
    ],
    answer: "a",
    after: ""
  });
  assert.equal(result.ok, true);
});

test("paragraph teórico com text vazio falha na validação completa", () => {
  const result = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Teoria",
        text: "",
        after: ""
      }
    ]
  }, contractFor({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none"
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /text é obrigatório em paragraph/);
});

test("choice com question vazio falha na validação completa", () => {
  const result = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Escolha",
        question: "",
        options: [
          { id: "a", text: "Opção A" },
          { id: "b", text: "Opção B" },
          { id: "c", text: "Opção C" }
        ],
        answer: "a",
        after: ""
      }
    ]
  }, contractFor({
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice"
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /question é obrigatório em exercício choice/);
});

test("flow teórico sem prompt curto falha na validação completa", () => {
  const result = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "flow",
        kind: "theory",
        exercise: "none",
        title: "Fluxo",
        structure: {
          kind: "sequence",
          items: [
            { kind: "start", text: "A" },
            { kind: "end", text: "B" }
          ]
        },
        after: ""
      }
    ]
  }, contractFor({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none"
  }));
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /card teórico visual precisa ter prompt curto/);
});

test("flow sem structure válida falha", () => {
  const result = structural({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Fluxo ambíguo",
    prompt: "Observe o fluxograma.",
    structure: {
      kind: "if_then_else",
      condition: "Verificar condição",
      thenBranch: [{ kind: "end", text: "Saída A" }],
      elseBranch: [{ kind: "end", text: "Saída B" }]
    },
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /flow precisa de uma raiz sequence válida/);
});

test("flow estrutural com sequence raiz passa", () => {
  const result = structural({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Fluxo válido",
    prompt: "Observe o fluxograma.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", text: "Ler condição" },
        {
          kind: "if_then_else",
          condition: "A condição vale?",
          thenBranch: [{ kind: "end", text: "Executar A" }],
          elseBranch: [{ kind: "end", text: "Executar B" }]
        }
      ]
    },
    after: ""
  });
  assert.equal(result.ok, true);
});

test("table de exercício com choice passa", () => {
  const result = structural({
    position: 1,
    resource: "table",
    kind: "exercise",
    exercise: "choice",
    title: "Leitura da tabela",
    columns: ["Caso", "Valor"],
    rows: [["VV", "V"], ["VF", "F"]],
    question: "Qual linha mostra o caso verdadeiro da conjunção?",
    options: [
      { id: "a", text: "VV" },
      { id: "b", text: "VF" },
      { id: "c", text: "FF" }
    ],
    answer: "a",
    after: "A conjunção só fica verdadeira em VV."
  });
  assert.equal(result.ok, true);
});

test("table gap sem lacuna no próprio recurso falha", () => {
  const result = structural({
    position: 1,
    resource: "table",
    kind: "exercise",
    exercise: "gap",
    title: "Leitura da tabela",
    columns: ["Caso", "Valor"],
    rows: [["VV", "V"]],
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /table gap precisa ter ao menos uma lacuna/);
});

test("table com linhas vazias ou desalinhadas falha", () => {
  const emptyRowResult = structural({
    position: 1,
    resource: "table",
    kind: "theory",
    exercise: "none",
    title: "Tabela inválida",
    columns: ["Coluna A", "Coluna B"],
    rows: [[]],
    after: ""
  });
  const unevenRowResult = structural({
    position: 1,
    resource: "table",
    kind: "theory",
    exercise: "none",
    title: "Tabela inválida",
    columns: ["Coluna A", "Coluna B"],
    rows: [["A"]],
    after: ""
  });

  assert.equal(emptyRowResult.ok, false);
  assert.match(emptyRowResult.structuralErrors.join("\n"), /cada linha da table precisa ter ao menos uma célula/);
  assert.equal(unevenRowResult.ok, false);
  assert.match(unevenRowResult.structuralErrors.join("\n"), /precisa ter 2 células/);
});

test("relation_map teórico válido passa", () => {
  const result = structural({
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Relação",
    prompt: "Observe a relação.",
    leftSet: {
      label: "U",
      items: [
        { id: "u1", label: "A" },
        { id: "u2", label: "B" }
      ]
    },
    rightSet: {
      label: "V",
      items: [
        { id: "v1", label: "1" },
        { id: "v2", label: "2" }
      ]
    },
    relations: [
      { from: "u1", to: "v1" },
      { from: "u2", to: "v2" }
    ],
    pairList: ["(A,1)", "(B,2)"],
    relationTable: {
      columns: ["U", "V"],
      rows: [["A", "1"], ["B", "2"]]
    },
    after: ""
  });
  assert.equal(result.ok, true);
});

test("relation_map com relação inválida falha", () => {
  const result = structural({
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Relação",
    prompt: "Observe a relação.",
    leftSet: {
      label: "U",
      items: [{ id: "u1", label: "A" }]
    },
    rightSet: {
      label: "V",
      items: [{ id: "v1", label: "1" }]
    },
    relations: [{ from: "u1", to: "v9" }],
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /leftSet e rightSet/);
});

test("kind=theory com lacuna falha", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Teoria",
    text: "Use [[x::x|y|z]].",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /não pode conter lacunas/);
});

test("after com lacuna falha", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Feedback inválido",
    text: "Texto estático.",
    after: "Revise [[setor::setor|valor]]."
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /after não pode conter lacunas interativas/);
});

test("paragraph + kind=exercise + exercise=none falha", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "none",
    title: "Exercício",
    text: "Complete [[x::x|y|z]].",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /paragraph de exercício deve usar exercise "gap"/);
});

test("paragraph + kind=exercise + exercise=choice falha", () => {
  const result = structural({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "choice",
    title: "Exercício",
    text: "Complete [[x::x|y|z]].",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /paragraph de exercício deve usar exercise "gap"/);
});

test("resource=choice + kind=theory falha", () => {
  const result = structural({
    position: 1,
    resource: "choice",
    kind: "theory",
    exercise: "none",
    title: "Teoria",
    question: "Qual opção está correta?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
      { id: "c", text: "C" }
    ],
    answer: "a",
    after: ""
  });
  assert.equal(result.ok, false);
  assert.match(result.structuralErrors.join("\n"), /choice deve usar kind "exercise"/);
});
