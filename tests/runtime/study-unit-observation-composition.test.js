import assert from "node:assert/strict";
import test from "node:test";
import { renderStudyUnitObservationSheet, renderStudyUnitObservationComposer, revealStudyObservationControl } from
  "../../src/ui/renderStudyUnitObservationSheet.js";

test("consulta vazia distingue ausência confirmada de carregamento e falha", () => {
  const loading = renderStudyUnitObservationSheet({ showComposer: false, loading: true });
  assert.match(loading, /Atualizando observações/);
  assert.doesNotMatch(loading, /study-observation-empty|study-observation-list/);
  const failed = renderStudyUnitObservationSheet({ showComposer: false, error: "Serviço indisponível." });
  assert.match(failed, /role="alert">Serviço indisponível/);
  assert.doesNotMatch(failed, /study-observation-empty|study-observation-list/);
  const empty = renderStudyUnitObservationSheet({ showComposer: false });
  assert.match(empty, /study-observation-empty/);
});

test("composição vazia e em lote não reservam lista e conservam contexto e envio", () => {
  const html = renderStudyUnitObservationSheet({ title: "Observação em 3 unidades",
    contextMessage: "O mesmo texto será registrado separadamente em cada unidade selecionada." });
  assert.doesNotMatch(html, /study-observation-list|study-observation-empty/);
  assert.match(html, /Observação em 3 unidades/);
  assert.match(html, /registrado separadamente/);
  assert.match(html, /data-field="study-unit-observation-category"/);
  assert.match(html, /aria-label="Enviar observação"/);
});

test("ação secundária conserva rota, chave de retorno e nome acessível da revisão", () => {
  const html = renderStudyUnitObservationSheet({ actionHref: "#/authoring/courses/synthetic?section=review&studyUnitId=unit-1",
    actionLabel: "Revisar observações abertas desta unidade", actionControlKey: "observations:unit-1" });
  assert.match(html, /<a class="study-observation-review-action" href="[^"]*&amp;studyUnitId=unit-1"/);
  assert.match(html, /data-inspection-route data-inspection-control-key="observations:unit-1"/);
  assert.match(html, /<span>Revisar observações abertas desta unidade<\/span><\/a>/);
});

test("erro identifica campo e mantém texto, categoria e cancelamento da edição", () => {
  const html = renderStudyUnitObservationComposer({ draft: { rawText: "  Texto <preservado> 😀  ", category: "question" },
    editingId: "annotation-1", error: "Não foi possível salvar." });
  assert.match(html, /aria-describedby="study-observation-counter study-observation-error" aria-invalid="true"/);
  assert.match(html, /id="study-observation-error" role="alert">Não foi possível salvar/);
  assert.match(html, /> {2}Texto &lt;preservado&gt; 😀 {2}<\/textarea>/);
  assert.match(html, /value="question" checked/);
  assert.match(html, /data-observation-action="cancel-edit"/);
});

test("lista longa mantém texto completo e composição; envio em andamento preserva controles desabilitados", () => {
  const rawText = "Observação longa com contexto completo. ".repeat(40);
  const html = renderStudyUnitObservationSheet({ items: [{ annotationId: "annotation-1", state: "open", rawText,
    capabilities: { canRevise: true, canWithdraw: true } }], saving: true,
    draft: { rawText: "Rascunho em envio", category: "suggestion" } });
  assert.ok(html.includes(rawText));
  assert.match(html, /data-observation-id="annotation-1"/);
  assert.match(html, /aria-label="Salvando observação" disabled aria-disabled="true"/);
  assert.match(html, /disabled>Rascunho em envio<\/textarea>/);
  assert.match(html, /data-observation-action="withdraw"[^>]*disabled/);
});

test("foco revela grupo que cabe rolando somente a folha, inclusive com ampliação", () => {
  const body = { scrollTop: 0, clientHeight: 200,
    getBoundingClientRect: () => ({ top: 200, bottom: 600, height: 400 }) };
  const composer = { getBoundingClientRect: () => ({ top: 700, bottom: 1000, height: 300 }) };
  const control = {
    closest(selector) { return selector === ".study-observation-body" ? body : composer; },
    getBoundingClientRect: () => ({ top: 760, bottom: 920, height: 160 }),
    scrollIntoView() { assert.fail("Não deve rolar os ancestrais nem a página."); }
  };
  revealStudyObservationControl(control);
  assert.equal(body.scrollTop, 202);
});

test("grupo maior que área visível revela campo e não move controle já visível", () => {
  const body = { scrollTop: 0, clientHeight: 200,
    getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200 }) };
  const composer = { getBoundingClientRect: () => ({ top: 200, bottom: 600, height: 400 }) };
  let rect = { top: 400, bottom: 480, height: 80 };
  const control = { closest(selector) { return selector === ".study-observation-body" ? body : composer; },
    getBoundingClientRect: () => rect };
  revealStudyObservationControl(control);
  assert.equal(body.scrollTop, 184);
  rect = { top: 140, bottom: 220, height: 80 };
  revealStudyObservationControl(control);
  assert.equal(body.scrollTop, 184);
});
