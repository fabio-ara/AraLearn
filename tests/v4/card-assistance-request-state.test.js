import test from "node:test";
import assert from "node:assert/strict";

import {
  canSubmitCardAssistanceRequest,
  normalizeAssistAttachmentSelection
} from "../../src/ui/lessonEditorApp.js";

test("assistência exige pedido e seleção atômica pronta", () => {
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "Corrija o exemplo.",
    attachmentCount: 0,
    isSubmitting: false,
    selectionReady: true,
    hasPreview: false
  }), true);
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "",
    attachmentCount: 0,
    isSubmitting: false,
    selectionReady: true,
    hasPreview: false
  }), false);
  assert.equal(canSubmitCardAssistanceRequest({
    promptText: "Corrija o exemplo.",
    attachmentCount: 0,
    isSubmitting: false,
    selectionReady: false,
    hasPreview: false
  }), false);
});

test("anexo habilita o pedido, mas submissão e prévia pendentes bloqueiam outra chamada", () => {
  const base = {
    promptText: "",
    attachmentCount: 1,
    selectionReady: true
  };
  assert.equal(canSubmitCardAssistanceRequest({
    ...base,
    isSubmitting: false,
    hasPreview: false
  }), true);
  assert.equal(canSubmitCardAssistanceRequest({
    ...base,
    isSubmitting: true,
    hasPreview: false
  }), false);
  assert.equal(canSubmitCardAssistanceRequest({
    ...base,
    isSubmitting: false,
    hasPreview: true
  }), false);
});

test("seleção de anexos informa formatos recusados, duplicatas e limite de oito", () => {
  const file = (name, type = "text/plain", size = 10) => ({
    name,
    type,
    size,
    lastModified: size,
    async arrayBuffer() {
      return new ArrayBuffer(size);
    }
  });
  const accepted = Array.from({ length: 9 }, (_, index) =>
    file(`fonte-${index + 1}.txt`, "text/plain", index + 1)
  );
  const duplicate = accepted[0];
  const unsupported = file("fonte.pptx", "application/vnd.ms-powerpoint", 20);

  const result = normalizeAssistAttachmentSelection([
    ...accepted,
    duplicate,
    unsupported
  ]);

  assert.equal(result.attachments.length, 8);
  assert.match(result.warnings.join(" "), /limite é de 8 anexos/u);
  assert.match(result.warnings.join(" "), /anexo duplicado não foi adicionado/u);
  assert.match(result.warnings.join(" "), /formato não suportado/u);
});
