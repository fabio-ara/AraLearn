import test from "node:test";
import assert from "node:assert/strict";

import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import { validateCard } from "../../src/domain/cards.js";
import {
  validateCardAssistanceSemantics
} from "../../src/generation/validation/cardAssistanceSemantics.js";
import {
  generateCardAssistanceChangeSet
} from "../../src/generation/runtime/cardAssistanceRuntime.js";

function context({
  role = "practice",
  avoid = [],
  exclude = []
} = {}) {
  return {
    hierarchy: {
      module: {
        guide: {
          exclude,
          avoid
        }
      },
      lesson: {
        guide: {
          exclude: [],
          avoid: []
        }
      },
      microsequence: {
        role
      }
    },
    cards: {
      previous: null,
      current: null,
      next: null
    },
    authorizedSources: []
  };
}

function compileValid(card) {
  const compiled = compileAuthoringCardGaps(card, "$.card");
  const validation = validateCard(compiled, "$.card");
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));
  assert.equal(Object.hasOwn(compiled, "gaps"), false);
  return compiled;
}

function paragraphGap({
  answer = "clorofila",
  text = "Complete: a organela contém {gap:answer}.",
  title = "Complete a afirmação",
  after = ""
} = {}) {
  return compileValid({
    id: "card-paragraph-gap",
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title,
    text,
    after,
    gaps: [{
      id: "answer",
      response: "text",
      answer
    }]
  });
}

function projectFixture(card) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Biologia",
      goal: "Compreender processos celulares.",
      modules: [{
        id: "module-a",
        title: "Célula",
        guide: {
          goal: "Compreender a célula.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Organelas",
          guide: {
            goal: "Distinguir organelas.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Consolidação",
            goal: "Reconhecer a função de uma organela.",
            role: "practice",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: [card]
          }]
        }]
      }]
    }]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-paragraph-gap"
};

test("resposta no próprio token compilado não é tratada como vazamento", () => {
  const card = paragraphGap();
  assert.match(card.text, /\[\[clorofila;;\]\]/u);

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, true, JSON.stringify(result.errors));
});
test("paragraph rejeita resposta significativa exposta em metadado visível", () => {
  const card = paragraphGap({
    title: "Resposta correta: clorofila"
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /resposta da lacuna "clorofila".*exposta.*\.title/iu
  );
});

test("feedback posterior pode explicar a resposta depois da tentativa", () => {
  const card = paragraphGap({
    after: "A resposta correta é clorofila.",
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("composite mascara o bloco interativo e rejeita a resposta em outro recurso", () => {
  const card = compileValid({
    id: "card-composite-gap",
    position: 1,
    resource: "composite",
    kind: "exercise",
    exercise: "gap",
    title: "Respiração celular",
    blocks: [
      {
        id: "question",
        kind: "paragraph",
        value: "A produção principal de ATP ocorre na {gap:organelle}."
      },
      {
        id: "leak",
        kind: "paragraph",
        value: "A mitocôndria é a resposta deste caso."
      }
    ],
    after: "",
    gaps: [{
      id: "organelle",
      response: "choice",
      answer: "mitocôndria",
      distractors: ["membrana plasmática", "parede celular"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /resposta da lacuna "mitocôndria".*blocks\[1\]\.value/iu
  );
});

test("reaction detecta respostas expostas em fórmula e condição visíveis", () => {
  const card = compileValid({
    id: "card-reaction-gap",
    position: 1,
    resource: "reaction",
    kind: "exercise",
    exercise: "gap",
    title: "Complete a reação",
    prompt: "Complete produto e condição.",
    reactionType: "forward",
    reactants: [{
      id: "reactant-a",
      formula: "H2O",
      name: "água",
      coefficient: 1,
      state: "l",
      charge: 0
    }],
    products: [{
      id: "product-a",
      formula: "{gap:productFormula}",
      name: "produto",
      coefficient: 1,
      state: "l",
      charge: 0
    }],
    conditions: [
      "{gap:condition}",
      "alta pressão"
    ],
    after: "",
    gaps: [{
      id: "productFormula",
      response: "text",
      answer: "H2O"
    }, {
      id: "condition",
      response: "text",
      answer: "alta pressão"
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /"H2O".*\.reactants\[0\]\.formula/iu);
  assert.match(result.errors.join("\n"), /"alta pressão".*\.conditions\[1\]/iu);
});

test("plane rejeita coordenada já revelada pela geometria derivada", () => {
  const card = compileValid({
    id: "card-plane-gap",
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    title: "Coordenadas do vetor",
    prompt: "Informe a extremidade do vetor.",
    x: [-1, 4],
    y: [-1, 4],
    vector: [2, 1],
    result: "{gap:coordinate}",
    after: "",
    gaps: [{
      id: "coordinate",
      response: "choice",
      answer: "(2, 1)",
      distractors: ["(1, 2)", "(2, -1)"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /resposta da lacuna "\(2, 1\)".*geometry\.vector/iu
  );
});

test("plane aceita resposta que não está materializada na geometria", () => {
  const card = compileValid({
    id: "card-plane-gap-safe",
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    title: "Leitura do plano",
    prompt: "Escolha a coordenada solicitada.",
    x: [-1, 5],
    y: [-1, 5],
    vector: [2, 1],
    result: "{gap:interpretation}",
    after: "",
    gaps: [{
      id: "interpretation",
      response: "choice",
      answer: "(3, 4)",
      distractors: ["(4, 3)"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("plane preserva sinal ao comparar resposta com a geometria", () => {
  const card = compileValid({
    id: "card-plane-signed-gap",
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    title: "Sinal da coordenada",
    prompt: "Escolha a coordenada solicitada.",
    x: [-4, 4],
    y: [-2, 4],
    vector: [2, 1],
    result: "{gap:coordinate}",
    after: "",
    gaps: [{
      id: "coordinate",
      response: "choice",
      answer: "(-2, 1)",
      distractors: ["(2, 1)"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("prompt visual não pode antecipar a resposta da lacuna", () => {
  const card = compileValid({
    id: "card-plane-prompt-leak",
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    title: "Sinal da coordenada",
    prompt: "A resposta correta é (-2, 1).",
    x: [-4, 4],
    y: [-2, 4],
    vector: [2, 1],
    result: "{gap:coordinate}",
    after: "",
    gaps: [{
      id: "coordinate",
      response: "choice",
      answer: "(-2, 1)",
      distractors: ["(2, 1)"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /resposta da lacuna "\(-2, 1\)".*\.prompt/iu
  );
});

test("plane não trata soma derivável mas ocultada pelo gap como vazamento", () => {
  const card = compileValid({
    id: "card-plane-sum-gap",
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "gap",
    title: "Soma vetorial",
    prompt: "Calcule a soma dos vetores.",
    x: [-1, 5],
    y: [-1, 5],
    sum: [[1, 1], [2, 2]],
    result: "{gap:sum}",
    after: "",
    gaps: [{
      id: "sum",
      response: "choice",
      answer: "(3, 3)",
      distractors: ["(2, 3)"]
    }]
  });

  const result = validateCardAssistanceSemantics(card, context());

  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test("respostas curtas ou inevitáveis não causam falsos positivos", () => {
  const incidentalTitles = new Map([
    ["A", "Compare as alternativas A e B"],
    ["7", "Exercício 7"],
    ["true", "Compare true e false"],
    ["+", "Uso do operador +"],
    ["não", "O papel linguístico de não"]
  ]);
  for (const [answer, title] of incidentalTitles) {
    const card = paragraphGap({
      answer,
      text: "Preencha o token: {gap:answer}.",
      title
    });
    const result = validateCardAssistanceSemantics(card, context());
    assert.equal(result.ok, true, `${answer}: ${JSON.stringify(result.errors)}`);
  }

  const substring = paragraphGap({
    answer: "art",
    title: "O plano cartesiano serve como contexto"
  });
  const substringResult = validateCardAssistanceSemantics(substring, context());
  assert.equal(substringResult.ok, true, JSON.stringify(substringResult.errors));
});

test("moldura inequívoca ainda bloqueia número, booleano e token curto", () => {
  for (const answer of ["7", "true", "C++", "+"]) {
    const card = paragraphGap({
      answer,
      text: "Preencha o token: {gap:answer}.",
      title: `Resposta correta: ${answer}`
    });
    const result = validateCardAssistanceSemantics(card, context());
    assert.equal(result.ok, false, answer);
    assert.match(result.errors.join("\n"), /resposta da lacuna.*exposta/iu);
  }
});

test("guide avoid não é relaxado por roles fora do contrato nem por enquadramento textual", () => {
  const framed = validateCardAssistanceSemantics(
    {
      id: "card-fix-error",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Diagnóstico",
      text: "O atalho enganoso falha porque ignora uma premissa.",
      after: ""
    },
    context({ role: "review", avoid: ["atalho enganoso"] })
  );
  assert.equal(framed.ok, false);
  assert.match(framed.errors.join("\n"), /orienta evitar/u);

  const unframed = validateCardAssistanceSemantics(
    {
      id: "card-fix-error-unframed",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Exemplo",
      text: "Aplique o atalho enganoso nesta questão.",
      after: ""
    },
    context({ role: "review", avoid: ["atalho enganoso"] })
  );
  assert.equal(unframed.ok, false);
  assert.match(unframed.errors.join("\n"), /orienta evitar/u);

  const merelyAdjectival = validateCardAssistanceSemantics(
    {
      id: "card-fix-error-adjective",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Exemplo",
      text: "Aplique a estratégia incorreta nesta questão.",
      after: ""
    },
    context({ role: "review", avoid: ["estratégia incorreta"] })
  );
  assert.equal(merelyAdjectival.ok, false);
  assert.match(merelyAdjectival.errors.join("\n"), /orienta evitar/u);

  const leaked = paragraphGap({
    answer: "atalho enganoso",
    text: "Identifique a estratégia problemática: {gap:answer}.",
    title: "Erro conhecido: atalho enganoso"
  });
  const leakedResult = validateCardAssistanceSemantics(
    leaked,
    context({ role: "review", avoid: ["atalho enganoso"] })
  );
  assert.equal(leakedResult.ok, false);
  assert.match(leakedResult.errors.join("\n"), /resposta da lacuna.*exposta/iu);
  assert.match(leakedResult.errors.join("\n"), /orienta evitar/u);
});

test("pipeline ativo reconstrói e rejeita reparo que revela a resposta", async () => {
  const projectDocument = projectFixture(paragraphGap());
  const original = structuredClone(projectDocument);
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      return {
        value: {
          replacements: [{
            targetId: "main",
            value: {
              text: "Complete: a organela contém {gap:answer}. A resposta é clorofila."
            },
            gaps: [{
              id: "answer",
              response: "text",
              answer: "clorofila"
            }]
          }]
        }
      };
    }
  };

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument,
      selection,
      request: {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds: ["main"],
        promptText: "Reescreva o enunciado da lacuna."
      },
      provider,
      modelId: "fake:model"
    }),
    /resposta da lacuna "clorofila".*exposta/iu
  );

  assert.equal(requests.length, 2);
  assert.equal(requests[0].phase, "card_assistance_resource_repair");
  assert.equal(requests[0].engineContext.validationFeedback.length, 0);
  assert.match(
    requests[1].engineContext.validationFeedback.join("\n"),
    /resposta da lacuna "clorofila".*exposta/iu
  );
  assert.deepEqual(projectDocument, original);
});
