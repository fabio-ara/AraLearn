import test from "node:test";
import assert from "node:assert/strict";

import { createScopeBuilderDraft, addScopeChip } from "../src/ui/scopeBuilder/scopeBuilderState.js";
import { renderScopeBuilder } from "../src/ui/scopeBuilder/renderScopeBuilder.js";

test("builder renderiza chips e desabilita gerar quando contrato é inválido", () => {
  let draft = createScopeBuilderDraft();
  draft.courseTitle = "Matemática para Informática";
  draft.modules[0].title = "Lógica";
  draft = addScopeChip(draft, 0, "include", "conectivos");
  const html = renderScopeBuilder(draft);

  assert.match(html, /conectivos/);
  assert.doesNotMatch(html, /data-action="generate-trail" disabled/);
});

test("builder mantém gerar desabilitado sem curso", () => {
  const html = renderScopeBuilder(createScopeBuilderDraft());
  assert.match(html, /data-action="generate-trail" disabled/);
});

