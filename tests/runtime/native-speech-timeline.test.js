import assert from "node:assert/strict";
import test from "node:test";
import { createNativeSpeechTimeline } from "../../src/resources/packages/audio/nativeTimeline.js";

for (const unitsPerSecond of [1, 1000]) {
  test(`fala nativa em ${unitsPerSecond === 1 ? "segundos" : "milissegundos"} exclui carga e pausa`, () => {
    const timeline = createNativeSpeechTimeline();
    const event = seconds => ({ elapsedTime: seconds * unitsPerSecond, timeStamp: seconds * 1000 + 500 });
    assert.equal(timeline.update(event(1), "start"), 0);
    assert.equal(timeline.update(event(2.5)), 1.5);
    assert.equal(timeline.update(event(3), "pause"), 2);
    assert.equal(timeline.update(event(4)), 2); // fronteira atrasada durante pausa
    assert.equal(timeline.update(event(13), "resume"), 2);
    assert.equal(timeline.update(event(14.5)), 3.5);
    assert.equal(timeline.update(event(14)), null); // marca fora de ordem
    assert.equal(timeline.update(event(15), "end"), 4);
  });
}

test("não inventa tempo quando o motor omite eventos ou fornece unidade incoerente", () => {
  const timeline = createNativeSpeechTimeline();
  assert.equal(timeline.update({ elapsedTime: 2, timeStamp: 2000 }), null);
  timeline.update({ elapsedTime: 0, timeStamp: 0 }, "start");
  assert.equal(timeline.update({ elapsedTime: 0, timeStamp: 2000 }), null);
  assert.equal(timeline.update({ elapsedTime: 30, timeStamp: 2000 }), null);
  assert.equal(timeline.update({}, "end"), null);
  assert.equal(timeline.update({ elapsedTime: 3, timeStamp: 3000 }), 3);
  assert.equal(timeline.update({ elapsedTime: 30000, timeStamp: 4000 }, "end"), null);
});
