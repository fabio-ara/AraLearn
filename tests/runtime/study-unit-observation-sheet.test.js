import assert from "node:assert/strict";
import test from "node:test";

import {
  countObservationBytes,
  countObservationScalars,
  formatObservationTextBudget,
  renderStudyUnitObservationSheet,
  validateStudyUnitObservationText
} from "../../src/ui/renderStudyUnitObservationSheet.js";

test("observação conta Unicode por scalar sem cortar caracteres astrais", () => {
  const exact = "😀".repeat(2_000);
  assert.equal(countObservationScalars(exact), 2_000);
  assert.equal(countObservationBytes(exact), 8_000);
  assert.equal(formatObservationTextBudget("😀a"),
    "2/2.000 caracteres · 5 B/16 KiB");
  assert.equal(validateStudyUnitObservationText(exact), "");
  assert.match(
    validateStudyUnitObservationText(`${exact}😀`),
    /no máximo 2\.000 caracteres/u
  );
});

test("sheet não usa maxlength UTF-16 e preserva o texto bruto", () => {
  const rawText = "  Dúvida 😀 com espaços  ";
  const html = renderStudyUnitObservationSheet({
    draft: { category: "question", rawText }
  });
  assert.doesNotMatch(html, /maxlength=/u);
  assert.match(html, /data-max-scalars="2000"/u);
  assert.match(html, /24\/2\.000 caracteres · 29 B\/16 KiB/u);
  assert.match(html, />[ ]{2}Dúvida 😀 com espaços[ ]{2}<\/textarea>/u);
  assert.match(html, /id="study-observation-title">Observações da Unidade<\/p>/u);
  assert.match(html, /<summary title="Categoria: Dúvida" aria-label="Categoria: Dúvida">[\s\S]*?<\/summary>/u);
  assert.match(html, /placeholder="Observação"/u);
  assert.match(html, /class="open-mini study-observation-submit"[\s\S]*?aria-label="Enviar observação"/u);
  assert.doesNotMatch(html, /Nova observação|observação curta|>Adicionar<|class="study-observation-count"/u);
  assert.doesNotMatch(html, /Nenhuma observação nesta Unidade\./u);
});

test("composer evita rótulo redundante e mantém a descrição acessível", () => {
  const html = renderStudyUnitObservationSheet();
  const textarea = html.match(/<textarea[^>]*>/u)?.[0] || "";
  const counter = html.match(/<span class="study-observation-counter[^>]*>/u)?.[0] || "";

  assert.doesNotMatch(html, /Texto da observação/u);
  assert.match(textarea, /aria-label="Observação"/u);
  assert.match(textarea, /aria-describedby="study-observation-counter"/u);
  assert.match(counter, /class="study-observation-counter visually-hidden"/u);
  assert.match(counter, /id="study-observation-counter"/u);
});

test("sheet nunca renderiza conteúdo nem resposta de observação retirada", () => {
  const html = renderStudyUnitObservationSheet({
    items: [{
      annotationId: "30000000-0000-4000-8000-000000000001",
      state: "withdrawn",
      rawText: "Texto que não pode reaparecer.",
      briefSummary: "Síntese que não pode reaparecer.",
      ownerResponse: { text: "Resposta que não pode reaparecer." },
      category: "question",
      capabilities: { canRevise: false, canWithdraw: false }
    }]
  });
  assert.match(html, /Conteúdo retirado\./u);
  assert.doesNotMatch(html, /não pode reaparecer/u);
  assert.doesNotMatch(html, /Retorno da autoria/u);
});
