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

test("referência de arquivo expõe somente campo e regra seguros", () => {
  const signedUrl = "https://unexpected.example.test/private.pdf?signature=segredo";
  const fileId = "file-identidade-que-nao-pode-vazar";
  const projected = toolErrorData(new AuthoringApiError(
    422,
    "invalid_openai_file",
    "A referência temporária do PDF não está em um formato utilizável.",
    {
      path: "pdf.download_url",
      rule: "trusted_openai_file_origin",
      downloadUrl: signedUrl,
      fileId
    }
  ));
  const serialized = JSON.stringify(projected);

  assert.deepEqual(projected.details, {
    path: "pdf.download_url",
    rule: "trusted_openai_file_origin"
  });
  assert.equal(serialized.includes(signedUrl), false);
  assert.equal(serialized.includes(fileId), false);
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

test("erros do transporte de PDF distinguem correção, reanexo, retry e recibo", () => {
  const cases = [
    {
      status: 422,
      code: "openai_file_missing",
      strategy: "correct_and_retry",
      requestIdMode: "new",
      expected: /mesmo anexo|novo anexo/iu
    },
    {
      status: 422,
      code: "openai_file_count_invalid",
      strategy: "correct_and_retry",
      requestIdMode: "new",
      expected: /exatamente um/iu
    },
    {
      status: 422,
      code: "invalid_openai_file",
      strategy: "correct_and_retry",
      requestIdMode: "new",
      expected: /não copie nem fabrique|não peça reenvio/iu
    },
    {
      status: 415,
      code: "unsupported_pdf_media_type",
      strategy: "correct_and_retry",
      requestIdMode: "new",
      expected: /somente PDF/iu
    },
    {
      status: 410,
      code: "openai_file_expired",
      strategy: "correct_and_retry",
      requestIdMode: "new",
      expected: /novo anexo/iu
    },
    {
      status: 502,
      code: "openai_file_unavailable",
      strategy: "repeat_identical",
      requestIdMode: "same",
      expected: /mesma chamada|sem uma resposta de expiração/iu
    },
    {
      status: 408,
      code: "openai_file_timeout",
      strategy: "repeat_identical",
      requestIdMode: "same",
      expected: /mesma chamada|sem uma resposta de expiração/iu
    },
    {
      status: 502,
      code: "course_source_pdf_persistence_unconfirmed",
      strategy: "repeat_identical",
      requestIdMode: "same",
      expected: /recibo|stored igual a true/iu
    }
  ];

  for (const candidate of cases) {
    const projected = toolErrorData(new AuthoringApiError(
      candidate.status,
      candidate.code,
      `Falha sintética: ${candidate.code}.`
    ), { requestId: `request-${candidate.code}-0001` });
    assert.equal(projected.recovery.strategy, candidate.strategy, candidate.code);
    assert.equal(projected.recovery.retryable, true, candidate.code);
    assert.equal(projected.recovery.requestIdMode, candidate.requestIdMode, candidate.code);
    assert.match(projected.recovery.steps.join(" "), candidate.expected, candidate.code);
  }
});

test("confirmação incerta de PDF exige releitura sem nova incorporação", () => {
  const projected = toolErrorData(new AuthoringApiError(
    409,
    "course_source_pdf_write_uncertain",
    "A escrita pode ter sido concluída."
  ), { requestId: "request-pdf-write-uncertain-0001" });

  assert.equal(projected.recovery.strategy, "stop");
  assert.equal(projected.recovery.retryable, false);
  assert.equal(projected.recovery.requestIdMode, "none");
  assert.match(projected.recovery.steps.join(" "), /Releia as Fontes|Não repita/iu);
});
