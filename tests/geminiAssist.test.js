import test from "node:test";
import assert from "node:assert/strict";

import { normalizeComposeResult, normalizeEditResult, runGeminiAssist } from "../src/assist/geminiAssist.js";
import { normalizeAssistDraftResult } from "../src/assist/assistMicrosequenceEngine.js";

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

test("converte rascunho assistido para contrato semântico", () => {
  const result = normalizeAssistDraftResult({
    title: "Comandos básicos de Git",
    tags: ["Git"],
    cards: [
      {
        role: "concept",
        container: "say",
        title: "Fluxo básico",
        text: "Git registra alterações em etapas."
      },
      {
        role: "code_example",
        container: "code",
        title: "Preparação",
        text: "O comando abaixo prepara um arquivo.",
        language: "bash",
        code: "git [[add]] arquivo.txt",
        wrong: ["push", "init"]
      },
      {
        role: "choice_check",
        container: "ask",
        title: "Verificação",
        question: "Qual comando envia commits ao remoto?",
        answer: "git push",
        wrong: ["git add", "git init"]
      }
    ]
  });

  assert.equal(result.microsequenceTitle, "Comandos básicos de Git");
  assert.equal(result.cards[0].say, "Git registra alterações em etapas.");
  assert.equal(result.cards[1].code, "git [[add]] arquivo.txt");
  assert.equal(result.cards[2].ask, "Qual comando envia commits ao remoto?");
});

test("gera microssequência em duas chamadas estruturadas ao Gemini", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const payload =
      calls.length === 1
        ? {
            title: "Git básico",
            subject: "git_github",
            recipe: "explain_commands",
            goal: "Distinguir comandos básicos de Git.",
            tags: ["Git"],
            cardPlans: [
              { role: "concept", container: "say", title: "Ideia central", learningGoal: "Apresentar o fluxo." },
              { role: "code_example", container: "code", title: "Comando", learningGoal: "Mostrar comando." },
              { role: "choice_check", container: "ask", title: "Verificação", learningGoal: "Checar distinção." }
            ]
          }
        : {
            title: "Git básico",
            tags: ["Git"],
            cards: [
              { role: "concept", container: "say", title: "Ideia central", text: "Git organiza versões." },
              { role: "code_example", container: "code", title: "Adicionar", language: "bash", code: "git [[add]] arquivo.txt" },
              {
                role: "choice_check",
                container: "ask",
                title: "Enviar",
                question: "Qual comando envia commits?",
                answer: "git push",
                wrong: ["git add", "git init"]
              }
            ]
          };

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(payload) }]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const result = await runGeminiAssist({
      apiKey: "chave",
      mode: "compose-microsequence",
      microsequence: { title: "Git", tags: [], cards: [] },
      promptText: "explique git add e git push"
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /gemini-2\.5-flash:generateContent/);
    assert.ok(calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[0].body.generationConfig.responseSchema);
    assert.equal(result.cards.length, 3);
    assert.equal(result.cards[2].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
