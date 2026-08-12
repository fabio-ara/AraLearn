import test from "node:test";
import assert from "node:assert/strict";

import { canSubmitCardAssistanceRequest } from "../../src/ui/lessonEditorApp.js";

test("assistência exige pedido, seleção pronta e nenhuma submissão corrente", () => {
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "Corrija o exemplo.",
    isSubmitting: false,
    selectionReady: true
  }), true);
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "",
    isSubmitting: false,
    selectionReady: true
  }), false);
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "Corrija o exemplo.",
    isSubmitting: false,
    selectionReady: false
  }), false);
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "Corrija o exemplo.",
    isSubmitting: true,
    selectionReady: true
  }), false);
});
