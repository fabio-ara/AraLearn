import assert from "node:assert/strict";
import test from "node:test";
import { createStudySynchronizationPreference } from "../../src/ui/studySynchronizationPreference.js";
import { renderRuntimeStatusControl } from "../../src/ui/renderHomeScreen.js";

test("sincronização é preferência do dispositivo e mudanças de outra aba chegam sem trocar conta", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const events = new EventTarget();
  const first = createStudySynchronizationPreference({ storage, eventTarget: events });
  assert.equal(first.get(), "automatic");
  first.set("manual");
  const second = createStudySynchronizationPreference({ storage, eventTarget: events });
  assert.equal(second.get(), "manual");
  const observed = [];
  second.subscribe((value) => observed.push(value));
  first.set("automatic");
  events.dispatchEvent(Object.assign(new Event("storage"), { key: "aralearn.ui.study-synchronization" }));
  assert.equal(second.get(), "automatic");
  assert.deepEqual(observed, ["automatic"]);
  first.destroy();
  second.destroy();
});

test("preferência que não pôde persistir não aparenta estar salva e leitura indisponível pausa o fundo", () => {
  const events = new EventTarget();
  const unavailable = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const preference = createStudySynchronizationPreference({ storage: unavailable, eventTarget: events });
  assert.equal(preference.get(), "manual");
  assert.throws(() => preference.set("automatic"));
  assert.equal(preference.get(), "manual");
  assert.throws(() => preference.set("invalid"), TypeError);
  preference.destroy();
});

test("nuvem distingue manual, pendência, erro e adiamento sem chamar conteúdo antigo de sincronizado", () => {
  const manual = renderRuntimeStatusControl({ synchronizationMode: "manual" });
  assert.match(manual, /aria-label="Sincronização manual"/u);
  assert.match(manual, /data-action="synchronize-study"/u);
  assert.match(renderRuntimeStatusControl({ pending: true }), /aria-label="Sincronização pendente"/u);
  assert.match(renderRuntimeStatusControl({ synchronizing: true }), /aria-busy="true"/u);
  assert.match(renderRuntimeStatusControl({ deferred: true }), /salvar ou descartar o rascunho/u);
  const failed = renderRuntimeStatusControl({ syncError: '<script>"erro"</script>' });
  assert.match(failed, /aria-label="Falha na sincronização"/u);
  assert.doesNotMatch(failed, /<script>/u);
  assert.match(renderRuntimeStatusControl({ stale: true }), /aria-label="Atualização pendente"/u);
  const guest = renderRuntimeStatusControl({ visitor: true, pending: true });
  assert.match(guest, /aria-label="Neste dispositivo"/u);
  assert.doesNotMatch(guest, /data-action="synchronize-study"/u);
});
