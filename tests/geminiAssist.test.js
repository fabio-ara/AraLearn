import test from "node:test";
import assert from "node:assert/strict";

import { normalizeComposeResult, normalizeEditResult } from "../src/llm/geminiAssist.js";

test("normaliza composição com tipos explícitos", () => {
  const result = normalizeComposeResult({
    microsequenceTitle: "Modelo cascata",
    tags: ["Processos de software"],
    cards: [
      { type: "text", title: "Ideia central", text: "Fluxo sequencial." },
      {
        type: "choice",
        title: "Leitura",
        ask: "Qual estrutura agrupa cards?",
        answer: ["Microssequência"],
        wrong: ["Curso", "Módulo"]
      }
    ]
  });

  assert.equal(result.microsequenceTitle, "Modelo cascata");
  assert.equal(result.cards[0].type, "text");
  assert.equal(result.cards[1].type, "choice");
});

test("normaliza revisão preservando o tipo do card", () => {
  const result = normalizeEditResult(
    {
      type: "editor",
      title: "Trecho",
      language: "json",
      code: "{ \"ok\": true }"
    },
    "editor"
  );

  assert.equal(result.type, "editor");
  assert.equal(result.code, '{ "ok": true }');
});
