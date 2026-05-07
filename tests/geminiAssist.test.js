import test from "node:test";
import assert from "node:assert/strict";

import { normalizeComposeResult, normalizeEditResult, runGeminiAssist } from "../src/assist/geminiAssist.js";
import { buildDeterministicAssistPlan, normalizeAssistDraftResult } from "../src/assist/assistMicrosequenceEngine.js";

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

test("planeja microssequências localmente para assuntos distintos", () => {
  const gitPlan = buildDeterministicAssistPlan({
    promptText: "explique os comandos git init, git add, git commit e git push"
  });
  const adminPlan = buildDeterministicAssistPlan({
    promptText: "diferencie missão, visão e valores, no contexto de administração de empresas"
  });
  const flowPlan = buildDeterministicAssistPlan({
    promptText: "monte um fluxograma para decidir se um número é par"
  });

  assert.equal(gitPlan.subject, "git_github");
  assert.equal(gitPlan.recipe, "explain_commands");
  assert.ok(gitPlan.cardPlans.some((card) => card.container === "code"));
  assert.equal(adminPlan.subject, "administracao");
  assert.equal(adminPlan.recipe, "compare_concepts");
  assert.ok(adminPlan.cardPlans.some((card) => card.container === "table"));
  assert.equal(flowPlan.subject, "algoritmos_fluxograma");
  assert.ok(flowPlan.cardPlans.some((card) => card.container === "flow"));
});

test("gera microssequência com plano local e chamada estruturada ao Gemini", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const payload = {
      title: "Git básico",
      tags: ["Git"],
      cards: [
        { title: "Ideia central", text: "Git organiza versões." },
        { title: "Comandos em contexto", language: "bash", code: "git [[add]] arquivo.txt" },
        {
          title: "Função de cada comando",
          columns: ["Comando", "Função"],
          rows: ["git add | Prepara arquivos", "git push | Envia commits"]
        },
        {
          title: "Verificação",
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

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /gemini-2\.5-flash:generateContent/);
    assert.ok(calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[0].body.generationConfig.responseSchema);
    const cardSchema = calls[0].body.generationConfig.responseJsonSchema.properties.cards.items;
    assert.ok(!cardSchema.properties.role);
    assert.ok(!cardSchema.properties.container);
    assert.equal(cardSchema.properties.rows.items.type, "string");
    assert.match(calls[0].body.contents[0].parts[0].text, /Plano:/);
    assert.equal(result.cards.length, 4);
    assert.equal(result.cards[2].table.rows[0][0], "git add");
    assert.equal(result.cards[3].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aceita JSON do Gemini envolto em bloco markdown", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const payload = {
      title: "Git básico",
      tags: ["Git"],
      cards: [
        { title: "Ideia central", text: "Git organiza versões." },
        { title: "Comandos em contexto", language: "bash", code: "git add arquivo.txt" },
        {
          title: "Função de cada comando",
          columns: ["Comando", "Função"],
          rows: ["git add | Prepara arquivos", "git push | Envia commits"]
        },
        {
          title: "Verificação",
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
                parts: [{ text: "```json\n" + JSON.stringify(payload) + "\n```" }]
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

    assert.equal(calls.length, 1);
    assert.equal(result.cards.length, 4);
    assert.equal(result.cards[3].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tenta novamente quando o Gemini devolve JSON ilegível", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      calls.length === 1
                        ? "```json\n{\"title\":\"Git básico\",\"cards\":[\n```"
                        : JSON.stringify({
                            title: "Git básico",
                            tags: ["Git"],
                            cards: [
                              { title: "Ideia central", text: "Git organiza versões." },
                              {
                                title: "Comandos em contexto",
                                language: "bash",
                                code: "git add arquivo.txt"
                              },
                              {
                                title: "Função de cada comando",
                                columns: ["Comando", "Função"],
                                rows: ["git add | Prepara arquivos", "git push | Envia commits"]
                              },
                              {
                                title: "Verificação",
                                question: "Qual comando envia commits?",
                                answer: "git push",
                                wrong: ["git add", "git init"]
                              }
                            ]
                          })
                  }
                ]
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
    assert.match(calls[1].body.contents[0].parts[0].text, /tentativa anterior/i);
    assert.equal(result.cards.length, 4);
    assert.equal(result.cards[3].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remove schema na nova tentativa quando o Gemini rejeita a complexidade", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) {
      return {
        ok: false,
        status: 400,
        async json() {
          return {
            error: {
              message: "The specified schema produces a constraint that has too many states for serving."
            }
          };
        }
      };
    }

    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Git básico",
                      tags: ["Git"],
                      cards: [
                        { title: "Ideia central", text: "Git organiza versões." },
                        { title: "Comandos em contexto", language: "bash", code: "git add arquivo.txt" },
                        {
                          title: "Função de cada comando",
                          columns: ["Comando", "Função"],
                          rows: ["git add | Prepara arquivos", "git push | Envia commits"]
                        },
                        {
                          title: "Verificação",
                          question: "Qual comando envia commits?",
                          answer: "git push",
                          wrong: ["git add", "git init"]
                        }
                      ]
                    })
                  }
                ]
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
    assert.ok(calls[0].body.generationConfig.responseJsonSchema);
    assert.ok(!calls[1].body.generationConfig.responseJsonSchema);
    assert.equal(calls[1].body.generationConfig.responseMimeType, "application/json");
    assert.equal(result.cards.length, 4);
    assert.equal(result.cards[3].answer, "git push");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
