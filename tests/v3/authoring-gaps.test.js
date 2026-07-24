import test from "node:test";
import assert from "node:assert/strict";

import {
  AuthoringGapError,
  compileAuthoringCardGaps,
  compileAuthoringFragmentGaps
} from "../../src/core/authoringGaps.js";
import { validateCard } from "../../src/domain/cards.js";

test("notação autoral compila lacunas tipadas e por escolha para o contrato v3", () => {
  const compiled = compileAuthoringCardGaps({
    id: "card-table",
    kind: "exercise",
    exercise: "gap",
    resource: "table",
    rows: [
      ["Operação", "Resultado"],
      ["2 + 2", "{gap:sum}"],
      ["3 × 2", "{gap:product}"]
    ],
    gaps: [
      {
        id: "sum",
        response: "choice",
        answer: "4",
        distractors: ["3", "5"]
      },
      {
        id: "product",
        response: "text",
        answer: "6"
      }
    ]
  });

  assert.equal(compiled.rows[1][1], "[[4::4|3|5]]");
  assert.equal(compiled.rows[2][1], "[[6;;]]");
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
});

test("linguagem autoral só aceita gaps em card de prática compatível", () => {
  for (const shape of [
    { kind: "theory", exercise: "none" },
    { kind: "exercise", exercise: "choice" }
  ]) {
    assert.throws(
      () => compileAuthoringCardGaps({
        ...shape,
        resource: "table",
        rows: [["Operação", "{gap:resultado}"]],
        gaps: [{
          id: "resultado",
          response: "text",
          answer: "4"
        }]
      }),
      (error) =>
        error instanceof AuthoringGapError
        && error.reason === "incompatible_exercise"
    );
  }
});

test("respostas formais são literais de uma linha e sem espaços nas extremidades", () => {
  for (const answer of [" ", " resposta", "resposta ", "duas\nlinhas"]) {
    assert.throws(
      () => compileAuthoringCardGaps({
        kind: "exercise",
        exercise: "gap",
        resource: "paragraph",
        text: "{gap:item}",
        gaps: [{ id: "item", response: "text", answer }]
      }),
      (error) =>
        error instanceof AuthoringGapError
        && error.reason === "invalid_answer"
        && error.path === "card.gaps[0].answer"
    );
  }
});

test("autoria rejeita lacuna interna sem declaração formal", () => {
  assert.throws(
    () => compileAuthoringCardGaps({
      id: "card-internal-gap",
      kind: "exercise",
      exercise: "gap",
      resource: "paragraph",
      text: "Complete [[resposta]]."
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "formal_gaps_required"
      && error.path === "card.gaps"
  );
});

test("autoria rejeita tipos incorretos e excesso de definições sem perder campos", () => {
  const base = {
    kind: "exercise",
    exercise: "gap",
    resource: "paragraph",
    text: "{gap:item}"
  };
  for (const invalidDefinition of [
    {
      id: "item",
      response: "text",
      answer: "A",
      acceptedAnswers: "B"
    },
    {
      id: "item",
      response: "text",
      answer: "A",
      distractors: "B"
    },
    {
      id: "item",
      response: "choice",
      answer: "A",
      distractors: ["B"],
      acceptedAnswers: "C"
    }
  ]) {
    assert.throws(
      () => compileAuthoringCardGaps({
        ...base,
        gaps: [invalidDefinition]
      }),
      (error) =>
        error instanceof AuthoringGapError
        && error.reason === "wrong_type"
    );
  }

  assert.throws(
    () => compileAuthoringCardGaps({
      ...base,
      text: Array.from({ length: 121 }, (_, index) => `{gap:g${index}}`).join(" "),
      gaps: Array.from({ length: 121 }, (_, index) => ({
        id: `g${index}`,
        response: "text",
        answer: String(index)
      }))
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "invalid_count"
      && error.path === "card.gaps"
  );
});

test("notação autoral preserva a indentação do código", () => {
  const compiled = compileAuthoringCardGaps({
    kind: "exercise",
    exercise: "gap",
    resource: "code",
    code: "if (ativo) {\n  {gap:statement};\n}",
    gaps: [{
      id: "statement",
      response: "text",
      answer: "executar()"
    }]
  });

  assert.equal(compiled.code, "if (ativo) {\n  [[executar();;]];\n}");
});

test("listas com colchetes duplos permanecem código literal", () => {
  const compiled = compileAuthoringCardGaps({
    id: "card-pandas-selection",
    position: 1,
    title: "Seleção de colunas",
    kind: "exercise",
    exercise: "gap",
    resource: "code",
    prompt: "Complete a seleção.",
    language: "python",
    code: "colunas = df[[\"nome\", \"idade\"]]\nresultado = {gap:selection}",
    gaps: [{
      id: "selection",
      response: "text",
      answer: "colunas"
    }]
  });

  assert.equal(
    compiled.code,
    "colunas = df[[\"nome\", \"idade\"]]\nresultado = [[colunas;;]]"
  );
  const validation = validateCard(compiled, "$.card");
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test("notação autoral compila respostas digitadas equivalentes sem inferência", () => {
  const compiled = compileAuthoringCardGaps({
    kind: "exercise",
    exercise: "gap",
    resource: "code",
    code: "cidade = \"{gap:city}\"",
    gaps: [{
      id: "city",
      response: "text",
      answer: "São Paulo",
      acceptedAnswers: ["S. Paulo", "sao paulo"]
    }]
  });

  assert.equal(
    compiled.code,
    "cidade = \"[[São Paulo;;S. Paulo|sao paulo]]\""
  );

  for (const invalidGap of [
    {
      id: "city",
      response: "choice",
      answer: "São Paulo",
      distractors: ["Rio de Janeiro"],
      acceptedAnswers: ["S. Paulo"]
    },
    {
      id: "city",
      response: "text",
      answer: "São Paulo",
      acceptedAnswers: ["SÃO PAULO"]
    },
    {
      id: "city",
      response: "choice",
      answer: "São Paulo",
      distractors: ["são paulo"]
    }
  ]) {
    assert.throws(
      () => compileAuthoringCardGaps({
        kind: "exercise",
        exercise: "gap",
        resource: "code",
        code: "cidade = \"{gap:city}\"",
        gaps: [invalidGap]
      }),
      AuthoringGapError
    );
  }
});

test("notação autoral compila lacuna textual e por escolha em nós de flow", () => {
  const compiled = compileAuthoringCardGaps({
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
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
          thenBranch: [{ id: "show", kind: "output", text: "Exibir aprovado" }]
        }
      ]
    },
    gaps: [
      {
        id: "input",
        response: "text",
        answer: "Ler nota",
        acceptedAnswers: ["Obter nota"]
      },
      {
        id: "condition",
        response: "choice",
        answer: "nota >= 6",
        distractors: ["nota < 6", "nota = 0"]
      }
    ]
  });

  assert.equal(compiled.structure.items[0].text, "Ler nota");
  assert.deepEqual(compiled.structure.items[0].practice, {
    text: {
      blank: true,
      variants: [{
        id: "gap-input-accepted-1",
        value: "Obter nota"
      }]
    }
  });
  assert.equal(compiled.structure.items[1].condition, "nota >= 6");
  assert.deepEqual(
    compiled.structure.items[1].practice.text.options.map((option) => option.value),
    ["nota >= 6", "nota < 6", "nota = 0"]
  );
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
});

test("lacuna autoral de flow ocupa um campo textual completo", () => {
  assert.throws(
    () => compileAuthoringCardGaps({
      kind: "exercise",
      exercise: "gap",
      resource: "flow",
      structure: {
        id: "root",
        kind: "sequence",
        items: [{ id: "read", kind: "input", text: "Etapa: {gap:input}" }]
      },
      gaps: [{
        id: "input",
        response: "text",
        answer: "Ler nota"
      }]
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "flow_marker_must_fill_field"
  );
});

test("flow aceita lacuna formal de forma sem marcador textual", () => {
  const source = {
    id: "card-flow-shape",
    position: 1,
    title: "Forma da operação",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "A forma process representa uma operação.",
    structure: {
      id: "root",
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
  };

  const compiled = compileAuthoringCardGaps(source);

  assert.notEqual(compiled, source);
  assert.deepEqual(compiled, source);
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
});

test("flow aceita lacunas formais de rótulo por escolha e digitação", () => {
  const source = {
    id: "card-flow-labels",
    position: 1,
    title: "Rótulos da decisão",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "Os ramos distinguem a continuidade da saída.",
    structure: {
      id: "root",
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
      }]
    }
  };

  assert.deepEqual(compileAuthoringCardGaps(source), source);
});

test("flow combina marcador textual com prática estruturada sem perder alvos", () => {
  const compiled = compileAuthoringCardGaps({
    id: "card-flow-mixed",
    position: 1,
    title: "Condição, forma e ramo",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "A condição controla os ramos.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "decision",
        kind: "if_then_else",
        condition: "{gap:condition}",
        practice: {
          blankShape: true,
          shapeOptions: ["process"],
          labels: {
            yes: { blank: true, mode: "choice", options: ["Não"] },
            no: { blank: true, variants: ["Nao"] }
          }
        },
        thenBranch: [{ id: "accept", kind: "output", text: "Aceitar" }],
        elseBranch: [{ id: "reject", kind: "output", text: "Rejeitar" }]
      }]
    },
    gaps: [{
      id: "condition",
      response: "choice",
      answer: "nota >= 6",
      distractors: ["nota < 6"]
    }]
  });

  const decision = compiled.structure.items[0];
  assert.equal(decision.condition, "nota >= 6");
  assert.equal(decision.practice.blankShape, true);
  assert.deepEqual(decision.practice.shapeOptions, ["process"]);
  assert.equal(decision.practice.labels.yes.blank, true);
  assert.equal(decision.practice.labels.no.blank, true);
  assert.equal(decision.practice.text.blank, true);
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
});

test("flow não aceita marcador sem definição mesmo quando há prática estruturada", () => {
  assert.throws(
    () => compileAuthoringCardGaps({
      kind: "exercise",
      exercise: "gap",
      resource: "flow",
      structure: {
        id: "root",
        kind: "sequence",
        items: [{
          id: "decision",
          kind: "while",
          condition: "{gap:condition}",
          practice: { blankShape: true },
          body: []
        }]
      }
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "formal_gaps_required"
      && error.path === "card.gaps"
  );
});

test("composite preserva prática estruturada de flow sem exigir marcador artificial", () => {
  const source = {
    id: "card-composite-flow-shape",
    position: 1,
    title: "Fluxo comentado",
    kind: "exercise",
    exercise: "gap",
    resource: "composite",
    after: "A forma corresponde à operação representada.",
    blocks: [{
      kind: "paragraph",
      value: "Observe a etapa do processo."
    }, {
      kind: "flow",
      structure: {
        id: "root",
        kind: "sequence",
        items: [{
          id: "step",
          kind: "process",
          text: "Calcular",
          practice: {
            blankShape: true,
            shapeOptions: ["decision"]
          }
        }]
      }
    }]
  };

  assert.deepEqual(compileAuthoringCardGaps(source), source);
});

test("fórmula exige espelho acessível com a mesma ordem", () => {
  const card = {
    kind: "exercise",
    exercise: "gap",
    resource: "formula",
    accessibleText: "x {gap:operator} y",
    expression: {
      type: "row",
      children: [
        { type: "identifier", value: "x" },
        { type: "operator", value: "{gap:operator}" },
        { type: "identifier", value: "y" }
      ]
    },
    gaps: [{
      id: "operator",
      response: "choice",
      answer: "+",
      distractors: ["−"]
    }]
  };

  const compiled = compileAuthoringCardGaps(card);
  assert.equal(compiled.expression.children[1].value, "[[+::+|−]]");
  assert.equal(compiled.accessibleText, "x [[+::+|−]] y");

  assert.throws(
    () => compileAuthoringCardGaps({ ...card, accessibleText: "x mais y" }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "accessibility_mirror_mismatch"
  );
});

test("compilador rejeita marcador ausente, repetido, órfão e mistura de notações", () => {
  const base = {
    kind: "exercise",
    exercise: "gap",
    resource: "tree",
    nodes: [{ id: "root", label: "{gap:root}" }]
  };
  assert.throws(
    () => compileAuthoringCardGaps({
      ...base,
      nodes: [{ id: "root", label: "raiz" }],
      gaps: [{
        id: "root",
        response: "text",
        answer: "raiz"
      }]
    }),
    (error) => error instanceof AuthoringGapError && error.reason === "marker_missing"
  );
  assert.throws(
    () => compileAuthoringCardGaps({
      ...base,
      nodes: [
        { id: "root", label: "{gap:root}" },
        { id: "leaf", label: "{gap:root}" }
      ],
      gaps: [{
        id: "root",
        response: "text",
        answer: "raiz"
      }]
    }),
    (error) => error instanceof AuthoringGapError && error.reason === "marker_repeated"
  );
  assert.throws(
    () => compileAuthoringCardGaps({
      ...base,
      nodes: [{ id: "root", label: "{gap:outro}" }],
      gaps: [{
        id: "root",
        response: "text",
        answer: "raiz"
      }]
    }),
    (error) => error instanceof AuthoringGapError && error.reason === "undeclared_marker"
  );
  assert.throws(
    () => compileAuthoringCardGaps({
      ...base,
      nodes: [{ id: "root", label: "[[raiz]] {gap:root}" }],
      gaps: [{
        id: "root",
        response: "text",
        answer: "raiz"
      }]
    }),
    (error) => error instanceof AuthoringGapError && error.reason === "mixed_notation"
  );
});

test("compilador rejeita notação de gap malformada e opções Unicode equivalentes", () => {
  assert.throws(
    () => compileAuthoringCardGaps({
      kind: "exercise",
      exercise: "gap",
      resource: "paragraph",
      text: "{gap:correto} e {gap:identificador inválido}",
      gaps: [{
        id: "correto",
        response: "text",
        answer: "resultado"
      }]
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "malformed_marker"
  );

  assert.throws(
    () => compileAuthoringCardGaps({
      kind: "exercise",
      exercise: "gap",
      resource: "paragraph",
      text: "{gap:acao}",
      gaps: [{
        id: "acao",
        response: "choice",
        answer: "ação",
        distractors: ["ac\u0327a\u0303o"]
      }]
    }),
    (error) =>
      error instanceof AuthoringGapError
      && error.reason === "duplicate_option"
  );
});

test("composite compila flow e espelho acessível de formula com uma lista única de gaps", () => {
  const compiled = compileAuthoringCardGaps({
    id: "card-composite-formal",
    position: 1,
    kind: "exercise",
    exercise: "gap",
    resource: "composite",
    title: "Fluxo e fórmula",
    blocks: [
      {
        kind: "flow",
        structure: {
          id: "root",
          kind: "sequence",
          items: [{
            id: "input",
            kind: "input",
            text: "{gap:step}"
          }]
        }
      },
      {
        kind: "formula",
        prompt: "Complete o operador.",
        notation: "mathematics",
        accessibleText: "x {gap:operator} y",
        expression: {
          type: "row",
          children: [
            { type: "identifier", value: "x" },
            { type: "operator", value: "{gap:operator}" },
            { type: "identifier", value: "y" }
          ]
        }
      }
    ],
    after: "A etapa antecede o cálculo.",
    gaps: [
      {
        id: "step",
        response: "text",
        answer: "Ler x"
      },
      {
        id: "operator",
        response: "choice",
        answer: "+",
        distractors: ["−"]
      }
    ]
  });

  assert.equal(compiled.blocks[0].structure.items[0].text, "Ler x");
  assert.deepEqual(compiled.blocks[0].structure.items[0].practice, {
    text: { blank: true }
  });
  assert.equal(compiled.blocks[1].expression.children[1].value, "[[+::+|−]]");
  assert.equal(compiled.blocks[1].accessibleText, "x [[+::+|−]] y");
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
  const validation = validateCard(compiled, "$.card");
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test("fragmento inteiro é compilado sem alterar identidade ou contorno", () => {
  const source = {
    courseId: "course-1",
    moduleId: "module-1",
    lessonId: "lesson-1",
    microsequences: [{
      id: "micro-1",
      cards: [{
        id: "card-1",
        kind: "exercise",
        exercise: "gap",
        resource: "plane",
        result: "{gap:coordinate}",
        gaps: [{
          id: "coordinate",
          response: "choice",
          answer: "(2, 1)",
          distractors: ["(1, 2)"]
        }]
      }]
    }]
  };
  const compiled = compileAuthoringFragmentGaps(source);
  assert.equal(compiled.courseId, source.courseId);
  assert.equal(compiled.microsequences[0].cards[0].result, "[[(2, 1)::(2, 1)|(1, 2)]]");
  assert.equal(source.microsequences[0].cards[0].result, "{gap:coordinate}");
});
