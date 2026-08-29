import test from "node:test";
import assert from "node:assert/strict";

import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { toolErrorData } from
  "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";

const TARGET_COURSE_ID = "10000000-0000-4000-8000-000000000001";
const SENTINELS = Object.freeze([
  "known.person@example.test",
  "Bearer token-that-must-not-leak",
  "Authorization: Bearer token-that-must-not-leak",
  "raw personal payload from an observation"
]);

test("envelope de erro expõe somente diagnóstico estrutural permitido", () => {
  const error = new AuthoringApiError(
    422,
    "invalid_course_contract",
    "O conteúdo não corresponde ao contrato.",
    {
      field: "content[0].data.text",
      targetCourseId: TARGET_COURSE_ID,
      value: SENTINELS[0],
      reason: SENTINELS[1],
      Authorization: SENTINELS[2],
      rawPayload: SENTINELS[3],
      errors: [{
        path: "studyUnits[0].content[0]",
        rule: "additionalProperties",
        message: SENTINELS[3],
        value: SENTINELS[0],
        reason: SENTINELS[2]
      }]
    }
  );

  const projected = toolErrorData(error, { requestId: "request-error-safe-0001" });
  const serialized = JSON.stringify(projected);

  assert.equal(projected.details.targetCourseId, TARGET_COURSE_ID);
  assert.deepEqual(projected.details.errors, [{
    path: "studyUnits[0].content[0]",
    rule: "additionalProperties"
  }]);
  assert.equal(projected.details.errorCount, 1);
  assert.equal(projected.issues[0].message, error.message);
  for (const sentinel of SENTINELS) assert.equal(serialized.includes(sentinel), false, sentinel);
});

test("campo desconhecido não é refletido no erro público", () => {
  const unknownField = "Authorization";
  const projected = toolErrorData(new AuthoringApiError(
    422,
    "unknown_tool_argument",
    `O argumento ${unknownField} não pertence à ferramenta.`,
    { field: unknownField }
  ));
  const serialized = JSON.stringify(projected);

  assert.equal(projected.message, "O comando contém um campo não reconhecido.");
  assert.equal(Object.hasOwn(projected, "details"), false);
  assert.equal(serialized.includes(unknownField), false);
});

test("limites de PDF recebem recuperação própria sem repetição automática", () => {
  const tooLarge = toolErrorData(new AuthoringApiError(
    413,
    "pdf_too_large",
    "Use um PDF de até 20 MiB."
  ), { requestId: "request-pdf-too-large-0001" });
  assert.equal(tooLarge.recovery.strategy, "correct_and_retry");
  assert.equal(tooLarge.recovery.requestIdMode, "new");
  assert.match(tooLarge.recovery.steps.join(" "), /PDF de até 20 MiB/iu);
  assert.doesNotMatch(tooLarge.recovery.steps.join(" "), /composição|lote menor/iu);

  for (const [code, message] of [
    ["course_source_pdf_quota_exceeded", "O Curso atingiu a cota de PDFs."],
    ["course_source_pdf_attachment_limit", "A revisão atingiu o limite de anexos."]
  ]) {
    const projected = toolErrorData(new AuthoringApiError(413, code, message), {
      requestId: `request-${code}-0001`
    });
    assert.equal(projected.recovery.strategy, "stop");
    assert.equal(projected.recovery.retryable, false);
    assert.equal(projected.recovery.requestIdMode, "none");
    assert.doesNotMatch(projected.recovery.steps.join(" "), /composição|lote menor/iu);
  }
});
