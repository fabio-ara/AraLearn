import assert from "node:assert/strict";
import test from "node:test";
import { ACTION_PAYLOAD_MAX_CHARACTERS, readActionPayload, serializeActionPayload } from
  "../../supabase/functions/_shared/aralearn-authoring/courseActionPayload.js";

const encoder = new TextEncoder();
const max = ACTION_PAYLOAD_MAX_CHARACTERS;
function request(bytes) {
  return new Request("https://actions.example/task", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: bytes });
}
function sizedText(character, size) {
  const available = size - JSON.stringify({ text: "" }).length;
  return character.repeat(Math.floor(available / character.length)) + "x".repeat(available % character.length);
}

for (const [label, character] of [["ASCII", "a"], ["CJK multibyte", "漢"],
  ["suplementar UTF-16", "𝄞"], ["grafema com combinante", "a\u0301"]]) {
  test(`#305 Actions mede o JSON completo sem truncar: ${label}`, async () => {
    const exactText = sizedText(character, max);
    const payload = { text: exactText };
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.length, 99_999);
    if (label !== "ASCII") assert.ok(encoder.encode(serialized).length > serialized.length);
    assert.equal(serializeActionPayload(payload), serialized);
    assert.deepEqual(await readActionPayload(request(serialized)), payload);
    const oversized = { text: exactText + "x" };
    assert.equal(JSON.stringify(oversized).length, 100_000);
    assert.throws(() => serializeActionPayload(oversized), { status: 413, code: "action_response_too_large" });
    await assert.rejects(readActionPayload(request(JSON.stringify(oversized))),
      { status: 413, code: "action_payload_too_large" });
    if (label === "suplementar UTF-16") {
      assert.ok([...JSON.stringify(oversized)].length < 100_000,
        "O guard UTF-16 é conservador, sem alegar que o cliente usa essa contagem.");
    }
  });
}

test("#305 Actions conta escapes e espaços do transporte, não apenas strings após parse", async () => {
  const escaped = '{"text":"' + "\\u0061".repeat(16_667) + '"}';
  assert.ok(JSON.parse(escaped).text.length < max);
  await assert.rejects(readActionPayload(request(escaped)), { code: "action_payload_too_large" });
  const object = { text: '"\\\n'.repeat(20_000) };
  assert.ok(object.text.length < max);
  assert.throws(() => serializeActionPayload(object), { code: "action_response_too_large" });
  await assert.rejects(readActionPayload(request("{}" + " ".repeat(max - 1))), { code: "action_payload_too_large" });
});

test("#305 Actions preserva UTF-8 dividido entre chunks e fecha stream excedido", async () => {
  const payload = { text: "漢𝄞a\u0301".repeat(200) };
  const bytes = encoder.encode(JSON.stringify(payload));
  let offset = 0;
  const body = new ReadableStream({ pull(controller) {
    if (offset === bytes.length) { controller.close(); return; }
    controller.enqueue(bytes.subarray(offset, offset + 7)); offset = Math.min(bytes.length, offset + 7);
  } });
  const chunked = new Request("https://actions.example/task", { method: "POST", duplex: "half",
    headers: { "Content-Type": "application/json" }, body });
  assert.deepEqual(await readActionPayload(chunked), payload);
  let cancelled = false;
  const endless = new ReadableStream({ pull(controller) { controller.enqueue(encoder.encode(" ".repeat(50_000))); },
    cancel() { cancelled = true; } });
  await assert.rejects(readActionPayload(new Request("https://actions.example/task", { method: "POST", duplex: "half",
    headers: { "Content-Type": "application/json" }, body: endless })), { code: "action_payload_too_large" });
  assert.equal(cancelled, true);
});

test("#305 Actions rejeita UTF-8 inválido, truncado e corpo não objeto sem publicar entrada", async () => {
  for (const body of [new Uint8Array([123, 34, 116, 34, 58, 34, 0xc3, 0x28, 34, 125]),
    new Uint8Array([123, 34, 116, 34, 58, 34, 0xf0, 0x9d]), "null", "[]", '{"secret":"sentinel-secret"']) {
    await assert.rejects(readActionPayload(request(body)), (error) => {
      assert.equal(error.code, "invalid_json");
      assert.doesNotMatch(error.message, /sentinel-secret|secret|0xc3/u);
      return true;
    });
  }
});
