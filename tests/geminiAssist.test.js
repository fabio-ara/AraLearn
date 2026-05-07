import test from "node:test";
import assert from "node:assert/strict";

import { normalizeComposeResult, normalizeEditResult } from "../src/assist/geminiAssist.js";

test("normaliza composição com intenções semânticas", () => {
  const result = normalizeComposeResult({
    microsequenceTitle: "Modelo cascata",
    tags: ["Processos de software"],
    cards: [
      { title: "Ideia central", say: "Fluxo sequencial." },
      {
        title: "Leitura",
        ask: "Qual estrutura agrupa cards?",
        answer: "Microssequência",
        wrong: ["Curso", "Módulo"]
      }
    ]
  });

  assert.equal(result.microsequenceTitle, "Modelo cascata");
  assert.equal(result.cards[0].say, "Fluxo sequencial.");
  assert.equal(result.cards[1].ask, "Qual estrutura agrupa cards?");
});

test("normaliza revisão no contrato sem type", () => {
  const result = normalizeEditResult(
    {
      title: "Trecho",
      language: "json",
      code: "{ \"ok\": true }"
    }
  );

  assert.equal(result.code, '{ "ok": true }');
});
