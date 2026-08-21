import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_LOCAL_ASSIST_LIMITS,
  createAndroidLocalAssistFetch
} from "../../src/assist/androidLocalAssistBridge.js";

function fakeBridge({ replyStatus = 200, replyBody = '{"ok":true}' } = {}) {
  const listeners = new Set();
  const messages = [];
  return {
    messages,
    addEventListener(type, listener) {
      assert.equal(type, "message");
      listeners.add(listener);
    },
    postMessage(source) {
      const message = JSON.parse(source);
      messages.push(message);
      if (message.operation !== "request") return;
      queueMicrotask(() => listeners.forEach((listener) => listener({
        data: JSON.stringify({
          contract: "aralearn.android-local-assist.v1",
          requestId: message.requestId,
          status: replyStatus,
          body: replyBody,
          error: false
        })
      })));
    }
  };
}

function localRequest(signal) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "local", messages: [] }),
    signal
  };
}

test("ponte Android encaminha somente POST JSON ao relay fixo e correlaciona a resposta", async () => {
  const bridge = fakeBridge({ replyBody: '{"value":42}' });
  let fallbackCalls = 0;
  const fetchImpl = createAndroidLocalAssistFetch({
    enabled: true,
    bridge,
    fallbackFetch: async () => { fallbackCalls += 1; }
  });
  const response = await fetchImpl(
    `${ANDROID_LOCAL_ASSIST_LIMITS.endpoint}/v1/chat/completions`,
    localRequest()
  );
  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { value: 42 });
  assert.equal(fallbackCalls, 0);
  assert.equal(bridge.messages.length, 1);
  assert.deepEqual(Object.keys(bridge.messages[0]).sort(), [
    "body", "contract", "operation", "path", "requestId"
  ]);
  assert.equal(bridge.messages[0].path, "/v1/chat/completions");
  assert.doesNotMatch(JSON.stringify(bridge.messages[0]), /authorization|api[_-]?key/iu);
});

test("runtime web desabilitado repassa a requisição intacta ao fetch comum", async () => {
  const url = "http://localhost:4183/v1/chat/completions";
  const init = {
    ...localRequest(),
    headers: {
      "content-type": "application/json",
      authorization: "Bearer credencial-somente-do-runtime-de-desenvolvimento"
    }
  };
  let received;
  const expectedResponse = Object.freeze({ ok: true });
  const fetchImpl = createAndroidLocalAssistFetch({
    enabled: false,
    bridge: null,
    fallbackFetch: async (receivedUrl, receivedInit) => {
      received = { url: receivedUrl, init: receivedInit };
      return expectedResponse;
    }
  });
  assert.equal(await fetchImpl(url, init), expectedResponse);
  assert.equal(received.url, url);
  assert.equal(received.init, init);
});

test("Android falha fechado para host alternativo, credencial e ponte ausente", async () => {
  const bridge = fakeBridge();
  let fallbackCalls = 0;
  const fetchImpl = createAndroidLocalAssistFetch({
    enabled: true,
    bridge,
    fallbackFetch: async () => { fallbackCalls += 1; }
  });
  for (const endpoint of [
    "http://localhost:4183/v1/chat/completions",
    "http://10.0.2.2:4183/v1/chat/completions",
    "https://api.openai.com/v1/responses"
  ]) {
    await assert.rejects(fetchImpl(endpoint, localRequest()), /somente o retransmissor local/u);
  }
  await assert.rejects(fetchImpl(
    `${ANDROID_LOCAL_ASSIST_LIMITS.endpoint}/v1/chat/completions`,
    {
      ...localRequest(),
      headers: { "content-type": "application/json", authorization: "Bearer segredo" }
    }
  ), /sem credencial/u);
  assert.equal(fallbackCalls, 0);
  assert.throws(() => createAndroidLocalAssistFetch({
    enabled: true,
    bridge: null,
    fallbackFetch: async () => {}
  }), /ponte segura/u);
});

test("cancelamento avisa a ponte uma vez e ignora resposta tardia", async () => {
  const listeners = new Set();
  const messages = [];
  const bridge = {
    addEventListener(_type, listener) { listeners.add(listener); },
    postMessage(source) { messages.push(JSON.parse(source)); }
  };
  const controller = new AbortController();
  const fetchImpl = createAndroidLocalAssistFetch({
    enabled: true,
    bridge,
    fallbackFetch: async () => { throw new Error("fallback indevido"); }
  });
  const pending = fetchImpl(
    `${ANDROID_LOCAL_ASSIST_LIMITS.endpoint}/v1/chat/completions`,
    localRequest(controller.signal)
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(messages.filter(({ operation }) => operation === "request").length, 1);
  assert.equal(messages.filter(({ operation }) => operation === "cancel").length, 1);
  const request = messages.find(({ operation }) => operation === "request");
  listeners.forEach((listener) => listener({
    data: JSON.stringify({
      contract: "aralearn.android-local-assist.v1",
      requestId: request.requestId,
      status: 200,
      body: '{"late":true}',
      error: false
    })
  }));
});
