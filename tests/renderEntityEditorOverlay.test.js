import test from "node:test";
import assert from "node:assert/strict";

import { renderEntityEditorOverlay } from "../src/ui/renderEntityEditorOverlay.js";

test("renderiza helper e campo secundário na edição de fonte-guia", () => {
  const html = renderEntityEditorOverlay({
    title: "Fonte-guia da lição",
    helperText: "Defina meta da lição, incluir e não confundir com.",
    fields: [
      {
        name: "lessonGoal",
        label: "Meta da lição",
        iconName: "intent",
        type: "textarea",
        value: "Ler um comando.\nExplicar o efeito local.",
        hint: "Entra na governança estruturada usada pela geração e pela edição assistidas.",
        tone: "primary"
      },
      {
        name: "notationRules",
        label: "Incluir",
        iconName: "lesson",
        type: "tokenlist",
        value: ["comando", "efeito local"],
        tone: "secondary"
      }
    ]
  });

  assert.match(html, /class="editor-helper-text"/);
  assert.match(html, /Defina meta da lição, incluir e não confundir com\./);
  assert.match(html, /class="field-label-content"/);
  assert.match(html, /class="field-label-text">Meta da lição</);
  assert.match(html, /<textarea data-field="lessonGoal"/);
  assert.match(html, /class="entity-tag-combobox"/);
  assert.match(html, /data-allow-custom="true"/);
  assert.match(html, /data-action="remove-entity-tag"/);
  assert.match(html, /class="field is-secondary"/);
  assert.match(html, /entity-tag-combobox-entry[\s\S]*entity-tag-chip-row/);
});
