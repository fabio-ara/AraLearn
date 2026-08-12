import test from "node:test";
import assert from "node:assert/strict";

import { validateCardAssistanceSemantics } from "../../src/generation/validation/cardAssistanceSemantics.js";

function card(text, sources = []) {
  return {
    id: "card-a",
    position: 1,
    title: "Conceito",
    role: "theory",
    content: [{
      id: "content-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources
  };
}

function context() {
  return {
    hierarchy: {
      module: { guide: { exclude: ["abordagem proibida"], avoid: ["atalho enganoso"] } }
    },
    cards: { previous: null, current: { sources: ["fonte-existente"] }, next: null }
  };
}

test("sources ficam limitadas às referências do contexto", () => {
  assert.equal(validateCardAssistanceSemantics(card("Explicação.", ["fonte-existente"]), context()).ok, true);
  assert.match(
    validateCardAssistanceSemantics(card("Explicação.", ["fora"]), context()).errors.join(" "),
    /source não autorizado/u
  );
});

test("barreiras pedagógicas alcançam o texto acessível dos packages", () => {
  assert.equal(validateCardAssistanceSemantics(card("Uma abordagem proibida."), context()).ok, false);
  assert.equal(validateCardAssistanceSemantics(card("Um atalho enganoso."), context()).ok, false);
});

test("card precisa situar referências externas implícitas", () => {
  assert.equal(validateCardAssistanceSemantics(card("Use o card anterior."), context()).ok, false);
  assert.equal(validateCardAssistanceSemantics(card("A regra é explicada neste card."), context()).ok, true);
});
