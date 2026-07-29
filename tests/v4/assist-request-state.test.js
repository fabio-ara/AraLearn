import test from "node:test";
import assert from "node:assert/strict";

import { canSubmitAssistRequestFromState } from "../../src/ui/lessonEditorApp.js";

test("generate_current planejada e vazia pode submeter sem prompt", () => {
  const ready = canSubmitAssistRequestFromState({
    promptText: "",
    actionIntent: "generate_current",
    attachmentCount: 0,
    isSubmitting: false,
    allowPromptlessSubmit: true
  });

  assert.equal(ready, true);
});

test("generate_current fora da primeira materialização continua exigindo prompt ou anexo", () => {
  const ready = canSubmitAssistRequestFromState({
    promptText: "",
    actionIntent: "generate_current",
    attachmentCount: 0,
    isSubmitting: false,
    allowPromptlessSubmit: false
  });

  assert.equal(ready, false);
});

