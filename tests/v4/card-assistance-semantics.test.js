import test from "node:test";
import assert from "node:assert/strict";

import {
  validateCardAssistanceSemantics
} from "../../src/generation/validation/cardAssistanceSemantics.js";

function card(overrides = {}) {
  return {
    id: "card-a",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Conceito",
    text: "Uma explicação autocontida.",
    after: "",
    ...overrides
  };
}

function context(overrides = {}) {
  return {
    hierarchy: {
      module: {
        guide: {
          exclude: ["abordagem proibida"],
          avoid: ["atalho enganoso"]
        }
      },
      lesson: {
        guide: {
          exclude: [],
          avoid: []
        }
      },
      microsequence: {
        role: "explain"
      }
    },
    cards: {
      previous: null,
      current: {
        sources: ["fonte-existente"]
      },
      next: null
    },
    ...overrides
  };
}

test("sources ficam limitadas às referências dos cards do contexto", () => {
  assert.equal(
    validateCardAssistanceSemantics(
      card({ sources: ["fonte-existente"] }),
      context()
    ).ok,
    true
  );

  const invalid = validateCardAssistanceSemantics(
    card({ sources: ["referencia-fora-do-contexto"] }),
    context()
  );
  assert.equal(invalid.ok, false);
  assert.match(
    invalid.errors.join("\n"),
    /source não autorizado: referencia-fora-do-contexto/u
  );
});

test("guide.exclude e guide.avoid alcançam conteúdo estruturado", () => {
  const excluded = validateCardAssistanceSemantics({
    ...card(),
    resource: "sequence",
    prompt: "Analise as etapas.",
    variant: "ordered_steps",
    items: [
      { id: "a", label: "Início" },
      { id: "b", label: "Abordagem proibída" }
    ]
  }, context());
  assert.equal(excluded.ok, false);
  assert.match(excluded.errors.join("\n"), /excluído pelo guide/u);

  const avoided = validateCardAssistanceSemantics(
    card({ afterBlocks: [{
      id: "apoio",
      kind: "paragraph",
      value: "Não use um atalho enganoso."
    }] }),
    context()
  );
  assert.equal(avoided.ok, false);
  assert.match(avoided.errors.join("\n"), /orienta evitar/u);
});

test("guide truncado mantém exclude e avoid como barreiras estruturadas", () => {
  const truncatedContext = context();
  truncatedContext.hierarchy.module.guide = {
    truncated: true,
    excerpt: "{\"goal\":\"resumo\"}",
    exclude: ["abordagem proibida"],
    avoid: ["atalho enganoso"]
  };
  const excluded = validateCardAssistanceSemantics(
    card({ text: "A abordagem proibida parece simples." }),
    truncatedContext
  );
  const avoided = validateCardAssistanceSemantics(
    card({ text: "Este atalho enganoso deve ser recusado." }),
    truncatedContext
  );

  assert.equal(excluded.ok, false);
  assert.match(excluded.errors.join("\n"), /excluído pelo guide/u);
  assert.equal(avoided.ok, false);
  assert.match(avoided.errors.join("\n"), /orienta evitar/u);
});

test("guide alcança flow, fórmula, plano e sequência de matrizes", () => {
  const cases = [
    {
      ...card(),
      resource: "flow",
      structure: {
        id: "root",
        kind: "sequence",
        items: [{ id: "step", kind: "process", text: "Abordagem proibida" }]
      }
    },
    {
      ...card(),
      resource: "formula",
      accessibleText: "Uma expressão.",
      expression: { type: "identifier", value: "Abordagem proibida" }
    },
    {
      ...card(),
      resource: "plane",
      x: [-1, 1],
      y: [-1, 1],
      result: "Abordagem proibida"
    },
    {
      ...card(),
      resource: "matrix",
      sequence: [{
        name: "Abordagem proibida",
        values: [[1]]
      }, {
        name: "Resultado",
        values: [[2]]
      }]
    },
    {
      ...card(),
      resource: "annotated_text",
      segments: [{ id: "s1", text: "Trecho." }],
      annotations: [{
        id: "a1",
        targetIds: ["s1"],
        label: "Nota",
        note: "Abordagem proibida"
      }]
    },
    {
      ...card(),
      resource: "flow",
      structure: {
        id: "root",
        kind: "sequence",
        items: [{
          id: "decision",
          kind: "if_then",
          condition: "Continuar?",
          practice: {
            labels: {
              yes: {
                blank: true,
                mode: "choice",
                options: ["Abordagem proibida"]
              }
            }
          },
          thenBranch: [{ id: "end", kind: "end", text: "Fim" }]
        }]
      }
    }
  ];

  cases.forEach((candidate) => {
    const result = validateCardAssistanceSemantics(candidate, context());
    assert.equal(result.ok, false, candidate.resource);
    assert.match(result.errors.join("\n"), /excluído pelo guide/u);
  });
});

test("reaction inclui fórmulas e condições visíveis na barreira semântica", () => {
  const baseReaction = {
    ...card(),
    resource: "reaction",
    prompt: "Interprete a reação.",
    reactionType: "forward",
    reactants: [{
      id: "reactant-a",
      formula: "H2",
      name: "hidrogênio",
      coefficient: 2,
      state: "g",
      charge: 0
    }],
    products: [{
      id: "product-a",
      formula: "H2O",
      name: "água",
      coefficient: 2,
      state: "l",
      charge: 0
    }],
    conditions: ["pressão ambiente"]
  };
  const formulaContext = context();
  formulaContext.hierarchy.module.guide.exclude = ["H2O"];
  const formulaResult = validateCardAssistanceSemantics(
    baseReaction,
    formulaContext
  );
  assert.equal(formulaResult.ok, false);
  assert.equal(
    formulaResult.findings.some((finding) =>
      finding.code === "guide_exclude" &&
      finding.path === "$.products[0].formula"
    ),
    true
  );

  const conditionsResult = validateCardAssistanceSemantics(
    {
      ...baseReaction,
      conditions: ["Abordagem proibida"]
    },
    context()
  );
  assert.equal(conditionsResult.ok, false);
  assert.equal(
    conditionsResult.findings.some((finding) =>
      finding.code === "guide_exclude" &&
      finding.path === "$.conditions[0]"
    ),
    true
  );
});

test("guide avoid permanece uma barreira fechada em role canônico", () => {
  const reviewContext = context();
  reviewContext.hierarchy.microsequence.role = "review";
  const result = validateCardAssistanceSemantics(
    card({ text: "O atalho enganoso falha porque ignora uma premissa." }),
    reviewContext
  );

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /orienta evitar/u);
});

test("card não pode delegar dados ao card anterior ou ao PDF", () => {
  for (const value of [
    "Use a tabela acima para responder.",
    "Consulte o card anterior.",
    "A resposta está no PDF anexo."
  ]) {
    const result = validateCardAssistanceSemantics(card({ text: value }), context());
    assert.equal(result.ok, false, value);
    assert.match(result.errors.join("\n"), /referência externa/u);
  }
});
