import { asAuthoringApiError } from "./errors.js";

const ERROR_ISSUE_LIMIT = 20;
const UNKNOWN_FIELD_MESSAGE = /campo desconhecido|não pertence (?:ao comando|à ferramenta)/iu;
const DIAGNOSTIC_PATH = /^[A-Za-z][A-Za-z0-9_.[\]/*-]{0,159}$/u;
const DIAGNOSTIC_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAFE_NUMERIC_DETAIL_KEYS = new Set([
  "expectedRevision", "actualRevision", "currentRevision"
]);

function publicErrorMessage(error) {
  if (UNKNOWN_FIELD_MESSAGE.test(String(error.message || ""))) {
    return "O pedido contém uma informação não reconhecida.";
  }
  return String(error.message);
}

function projectedDiagnostic(value, key) {
  if (typeof value === "number" && SAFE_NUMERIC_DETAIL_KEYS.has(key) &&
      Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string") return undefined;
  if (key === "targetCourseId") return UUID.test(value) ? value.toLowerCase() : undefined;
  if (new Set(["field", "path", "rule"]).has(key)) {
    return DIAGNOSTIC_PATH.test(value) ? value : undefined;
  }
  if (new Set(["parameterId", "studyUnitId"]).has(key)) {
    return DIAGNOSTIC_ID.test(value) ? value : undefined;
  }
  return undefined;
}

function projectDiagnosticObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const projected = {};
  for (const key of [
    "field", "path", "rule", "parameterId", "studyUnitId", "targetCourseId",
    ...SAFE_NUMERIC_DETAIL_KEYS
  ]) {
    const normalized = projectedDiagnostic(value[key], key);
    if (normalized !== undefined) projected[key] = normalized;
  }
  return Object.keys(projected).length ? projected : undefined;
}

function errorIssues(error, details, message) {
  const source = Array.isArray(details?.errors) && details.errors.length
    ? details.errors
    : details?.path || details?.field
      ? [details]
      : [];
  const issues = source.slice(0, ERROR_ISSUE_LIMIT).map((issue) => {
    const path = String(issue?.path || issue?.field || "");
    return {
      path,
      message,
      ...(issue?.rule == null ? {} : { rule: String(issue.rule) })
    };
  });
  if (issues.length || !new Set([400, 422]).has(error.status)) return issues;
  return [{
    path: "",
    message,
    ...(details?.rule == null ? {} : { rule: String(details.rule) })
  }];
}

function compactErrorDetails(details, message) {
  if (UNKNOWN_FIELD_MESSAGE.test(message)) return undefined;
  const projected = projectDiagnosticObject(details) || {};
  if (Array.isArray(details?.errors)) {
    const errors = details.errors
      .slice(0, ERROR_ISSUE_LIMIT)
      .map(projectDiagnosticObject)
      .filter(Boolean);
    if (errors.length) projected.errors = errors;
    projected.errorCount = details.errors.length;
    projected.truncated = details.errors.length > ERROR_ISSUE_LIMIT;
  }
  return Object.keys(projected).length ? projected : undefined;
}

function errorRecovery(error, issues, requestId) {
  if (error.status === 401) {
    return {
      strategy: "reconnect",
      retryable: true,
      requestIdMode: "same",
      steps: ["Conecte novamente a conta AraLearn.", "Repita a chamada idêntica."]
    };
  }
  if (error.status === 403) {
    return {
      strategy: "stop",
      retryable: false,
      requestIdMode: "none",
      steps: ["Explique a capacidade ausente sem simular a operação."]
    };
  }
  if (error.code === "stale_course_state") {
    return {
      strategy: "reread_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Releia o curso e seu estado atual.",
        "Refaça somente a alteração que ainda for pertinente."
      ]
    };
  }
  if (error.code === "course_source_pdf_write_uncertain") {
    return {
      strategy: "stop",
      retryable: false,
      requestIdMode: "none",
      steps: [
        "Releia as fontes antes de decidir se ainda precisa incorporar o PDF.",
        "Não repita a incorporação enquanto o resultado corrente não for conhecido."
      ]
    };
  }
  if (error.status === 409) {
    return {
      strategy: "reread_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Releia o curso e confirme o estado que causou o conflito.",
        "Repita somente a alteração que ainda for pertinente."
      ]
    };
  }
  if (error.code === "openai_file_missing") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Use exatamente um PDF já anexado à conversa.",
        "Se o anexo ainda estiver disponível, refaça a chamada sem pedir reenvio.",
        "Só peça um novo anexo se nenhum PDF continuar disponível."
      ]
    };
  }
  if (error.code === "openai_file_count_invalid") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Escolha exatamente um dos PDFs anexados.",
        "Refaça a chamada somente para esse documento."
      ]
    };
  }
  if (error.code === "invalid_openai_file") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Reconstrua a chamada a partir do PDF já anexado.",
        "Não copie nem fabrique dados técnicos do arquivo.",
        "Não peça reenvio enquanto o anexo continuar disponível."
      ]
    };
  }
  if (error.code === "unsupported_pdf_media_type") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Informe que a incorporação aceita somente PDF.",
        "Use um único arquivo PDF em uma nova tentativa."
      ]
    };
  }
  if (error.code === "openai_file_expired") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Informe que o acesso temporário ao documento expirou.",
        "Peça um novo anexo do mesmo PDF e refaça a chamada."
      ]
    };
  }
  if (error.code === "openai_file_unavailable" ||
      error.code === "openai_file_timeout") {
    return {
      strategy: "repeat_identical",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "same",
      steps: [
        "Repita exatamente a mesma operação.",
        "Não peça um novo anexo sem uma resposta de expiração."
      ]
    };
  }
  if (error.code === "course_source_pdf_persistence_unconfirmed") {
    return {
      strategy: "repeat_identical",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "same",
      steps: [
        "Repita exatamente a mesma operação para recuperar o resultado.",
        "Não declare sucesso até o resultado confirmar que o documento foi armazenado."
      ]
    };
  }
  if (error.code === "pdf_too_large") {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Envie um único PDF de até 20 MiB.",
        "Repita a operação com o novo arquivo."
      ]
    };
  }
  if (error.code === "course_source_pdf_quota_exceeded") {
    return {
      strategy: "stop",
      retryable: false,
      requestIdMode: "none",
      steps: [
        "Informe que o curso atingiu a cota de PDFs mantidos entre as fontes.",
        "Peça à pessoa que revise quais documentos precisam permanecer antes de uma nova tentativa."
      ]
    };
  }
  if (error.code === "course_source_pdf_attachment_limit") {
    return {
      strategy: "stop",
      retryable: false,
      requestIdMode: "none",
      steps: [
        "Informe que esta fonte já atingiu o limite de anexos.",
        "Peça à pessoa que decida se deve atualizar a fonte ou usar outra fonte."
      ]
    };
  }
  if (error.status === 413) {
    return {
      strategy: "split_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Divida a composição ou a consulta do curso em um lote menor.",
        "Repita somente o lote menor."
      ]
    };
  }
  if (error.status === 429 || error.status >= 500) {
    return {
      strategy: "repeat_identical",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "same",
      steps: ["Repita exatamente a mesma operação."]
    };
  }
  if (error.status === 400 || error.status === 422) {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Considere todas as informações de correção devolvidas.",
        ...(error.code === "invalid_course_contract"
          ? ["Consulte os detalhes dos componentes didáticos usados nas unidades de estudo rejeitadas."]
          : []),
        "Corrija somente a menor parcela incompatível.",
        "Repita a operação corrigida antes de encerrar a tarefa."
      ]
    };
  }
  return {
    strategy: "stop",
    retryable: false,
    requestIdMode: "none",
    steps: ["Informe que não foi possível concluir e não afirme sucesso."]
  };
}

export function toolErrorData(
  error,
  { requestId = null } = {}
) {
  const normalized = asAuthoringApiError(error);
  const message = publicErrorMessage(normalized);
  const details = compactErrorDetails(normalized.details, normalized.message);
  const issues = errorIssues(normalized, details, message);
  return {
    code: normalized.code,
    message,
    ...(details === undefined ? {} : { details }),
    issues,
    recovery: errorRecovery(normalized, issues, requestId)
  };
}
