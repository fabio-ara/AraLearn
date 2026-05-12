import test from "node:test";
import assert from "node:assert/strict";

import { renderEntityEditorOverlay } from "../src/ui/renderEntityEditorOverlay.js";

test("renderiza helper e campo secundário na edição de fonte-guia", () => {
  const html = renderEntityEditorOverlay({
    title: "Fonte-guia da lição",
    helperText: "Defina meta, notação e resultado esperado.",
    fields: [
      {
        name: "lessonGoal",
        label: "Meta da lição",
        iconName: "intent",
        type: "textarea",
        value: "Ler um comando.",
        hint: "Entra na governança estruturada usada pela geração e pela edição assistidas.",
        tone: "primary"
      },
      {
        name: "freeNotes",
        label: "Observações livres",
        iconName: "lesson",
        type: "textarea",
        value: "Notas de apoio.",
        hint: "Campo auxiliar para autoria humana. Não entra no núcleo estruturado enviado ao modelo quando a governança principal já estiver preenchida.",
        tone: "secondary"
      }
    ]
  });

  assert.match(html, /class="editor-helper-text"/);
  assert.match(html, /Defina meta, notação e resultado esperado\./);
  assert.match(html, /class="field-label-content"/);
  assert.match(html, /class="field-label-text">Meta da lição</);
  assert.match(html, /class="field is-secondary"/);
  assert.match(html, /Campo auxiliar para autoria humana/);
});
