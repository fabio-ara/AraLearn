import test from "node:test";
import assert from "node:assert/strict";

import { runAssist } from "../src/assist/runAssist.js";

test("runAssist roteia para Codex local quando o modelo é codex-cli-local", async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest = null;
  globalThis.fetch = async (url, options = {}) => {
    capturedRequest = {
      url,
      body: JSON.parse(options.body)
    };
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          result: {
            microsequences: [{ title: "Sequência local", description: "", tags: [] }]
          }
        };
      }
    };
  };

  try {
    const result = await runAssist({
      model: "codex-cli-local",
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo",
      mode: "generate-lesson-microsequences",
      microsequence: {
        lessonTitle: "Lição local"
      },
      promptText: "Gere microssequências."
    });

    assert.equal(capturedRequest.url, "http://127.0.0.1:4183/assist");
    assert.equal(capturedRequest.body.provider, "codex-cli-local");
    assert.equal(capturedRequest.body.context.lessonTitle, "Lição local");
    assert.equal(result.microsequences[0].title, "Sequência local");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runAssist mantém o fluxo Gemini para os demais modelos", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = async (url, options = {}) => {
    capturedUrl = String(url);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
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
                      title: "Escada",
                      steps: [{ title: "Passo 1" }, { title: "Passo 2" }]
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
    const result = await runAssist({
      model: "gemini-2.5-flash",
      apiKey: "chave",
      mode: "plan-microsequence-ladder",
      microsequence: {
        courseTitle: "Curso"
      },
      promptText: "Monte uma escada."
    });

    assert.match(capturedUrl, /generativelanguage\.googleapis\.com/);
    assert.equal(result.steps.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

