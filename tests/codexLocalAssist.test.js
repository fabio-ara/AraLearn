import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT,
  checkCodexLocalHealth,
  isCodexLocalModel,
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

