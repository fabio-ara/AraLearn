import { asAuthoringApiError } from "./errors.js";

const ERROR_ISSUE_LIMIT = 20;

function errorIssues(error) {
  const details = error.details;
  const source = Array.isArray(details?.errors) && details.errors.length
    ? details.errors
    : details?.path || details?.field || details?.reason
      ? [details]
      : [];
  const issues = source.slice(0, ERROR_ISSUE_LIMIT).map((issue) => {
    const path = String(issue?.path || issue?.field || "");
    return {
      path,
      message: String(issue?.message || error.message),
      ...(issue?.reason == null ? {} : { reason: String(issue.reason) }),
      ...(issue?.rule == null ? {} : { rule: String(issue.rule) })
    };
  });
  if (issues.length || !new Set([400, 422]).has(error.status)) return issues;
  return [{
    path: "",
    message: String(error.message),
    ...(details?.reason == null ? {} : { reason: String(details.reason) }),
    ...(details?.rule == null ? {} : { rule: String(details.rule) })
  }];
}

function compactErrorDetails(details) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return details;
  }
  if (!Array.isArray(details.errors)) return details;
  return {
    ...details,
    errors: details.errors.slice(0, ERROR_ISSUE_LIMIT),
    errorCount: details.errors.length,
    truncated: details.errors.length > ERROR_ISSUE_LIMIT
  };
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
        "Releia o Curso e sua versão de estado corrente.",
        "Reaplique somente a intenção ainda pertinente com novo requestId."
      ]
    };
  }
  if (error.status === 409) {
    return {
      strategy: "reread_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Releia o Curso e confirme o estado que causou o conflito.",
        "Repita somente a alteração ainda pertinente com novo requestId."
      ]
    };
  }
  if (error.status === 413) {
    return {
      strategy: "split_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Divida a composição ou a consulta do Curso em um lote menor.",
        "Repita o menor lote com novo requestId."
      ]
    };
  }
  if (error.status === 429 || error.status >= 500) {
    return {
      strategy: "repeat_identical",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "same",
      steps: ["Repita exatamente os mesmos argumentos e requestId."]
    };
  }
  if (error.status === 400 || error.status === 422) {
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Leia todos os caminhos em issues.",
        ...(error.code === "invalid_course_contract"
          ? ["Consulte os contratos dos componentes didáticos usados nas Unidades rejeitadas."]
          : []),
        "Corrija somente os campos rejeitados ou a menor parcela incompatível.",
        "Repita a operação corrigida com novo requestId antes de encerrar a tarefa."
      ]
    };
  }
  return {
    strategy: "stop",
    retryable: false,
    requestIdMode: "none",
    steps: ["Informe o código e a mensagem exatos sem afirmar sucesso."]
  };
}

export function toolErrorData(
  error,
  { requestId = null } = {}
) {
  const normalized = asAuthoringApiError(error);
  const issues = errorIssues(normalized);
  return {
    code: normalized.code,
    message: normalized.message,
    ...(normalized.details === undefined
      ? {}
      : { details: compactErrorDetails(normalized.details) }),
    issues,
    recovery: errorRecovery(normalized, issues, requestId)
  };
}
