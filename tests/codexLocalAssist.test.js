import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT,
  checkCodexLocalHealth,
  isCodexLocalModel,
  runCodexLocalAssist,
  resolveCodexLocalEndpoint,
  resolveCodexLocalHealthEndpoint
} from "../src/assist/codexLocalAssist.js";

test("isCodexLocalModel reconhece apenas o model id local", () => {
  assert.equal(isCodexLocalModel("codex-cli-local"), true);
  assert.equal(isCodexLocalModel("gemini-2.5-flash"), false);
});

test("resolveCodexLocalEndpoint usa o default e converte /health para /assist", () => {
  assert.equal(resolveCodexLocalEndpoint(""), DEFAULT_CODEX_LOCAL_ENDPOINT);
  assert.equal(resolveCodexLocalEndpoint("http://127.0.0.1:4183/health"), DEFAULT_CODEX_LOCAL_ENDPOINT);
  assert.equal(resolveCodexLocalEndpoint("http://127.0.0.1:4183/"), DEFAULT_CODEX_LOCAL_ENDPOINT);
});

test("resolveCodexLocalHealthEndpoint deriva /health do endpoint /assist", () => {
  assert.equal(resolveCodexLocalHealthEndpoint(""), DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT);
  assert.equal(
    resolveCodexLocalHealthEndpoint("http://127.0.0.1:4183/assist"),
    DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT
  );
});

test("checkCodexLocalHealth devolve ok true quando o bridge responde saudável", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    assert.equal(url, DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT);
    assert.equal(options.headers["x-aralearn-token"], "abc");
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, service: "aralearn-codex-bridge" };
      }
    };
  };

  try {
    assert.deepEqual(await checkCodexLocalHealth({ token: "abc" }), {
      ok: true,
      data: { ok: true, service: "aralearn-codex-bridge" }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("checkCodexLocalHealth devolve ok false em falha de conexão sem lançar", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("connect ECONNREFUSED");
  };

  try {
    const result = await checkCodexLocalHealth();
    assert.equal(result.ok, false);
    assert.match(result.error, /ECONNREFUSED/);
    assert.equal(result.status, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCodexLocalAssist serializa anexos textuais e normaliza compose-microsequence", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          result: {
            title: "Sequência local",
            tags: ["Git"],
            cards: [{}, {}, {}]
          }
        };
      }
    };
  };

  try {
    const result = await runCodexLocalAssist({
      endpoint: DEFAULT_CODEX_LOCAL_ENDPOINT,
      mode: "compose-microsequence",
      context: {
        courseTitle: "Programação",
        moduleTitle: "Git",
        lessonTitle: "Comandos básicos",
        title: "Fluxo Git",
        cards: []
      },
      promptText: "Explique git add e git push.",
      attachments: [
        {
          name: "referencia.md",
          type: "text/markdown",
          size: 20,
          async text() {
            return "# Referência\nUse git add antes de git push.";
          }
        }
      ]
    });

    assert.equal(capturedBody.request.attachments[0].name, "referencia.md");
    assert.match(capturedBody.request.attachments[0].textContent, /git add/);
    assert.equal(Array.isArray(result.cards), true);
    assert.equal(result.cards.length >= 3, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCodexLocalAssist reaproveita prompt pré-montado e normaliza edit-card", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  globalThis.fetch = async (_url, options = {}) => {
    capturedBody = JSON.parse(options.body);
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          result: {
            title: "Card revisado",
            say: "Conteúdo mais direto."
          }
        };
      }
    };
  };

  try {
    const result = await runCodexLocalAssist({
      endpoint: DEFAULT_CODEX_LOCAL_ENDPOINT,
      mode: "edit-card",
      context: {
        courseTitle: "Programação",
        moduleTitle: "Git",
        lessonTitle: "Commits",
        title: "Sequência de commits"
      },
      card: {
        key: "card-1",
        title: "Card atual",
        say: "Texto antigo"
      },
      promptText: "Deixe o texto mais direto."
    });

    assert.match(capturedBody.request.prebuiltPrompt, /Microssequência: Sequência de commits/);
    assert.equal(result.title, "Card revisado");
    assert.equal(result.say, "Conteúdo mais direto.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
