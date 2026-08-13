import { asAuthoringApiError } from "./errors.js";

const ERROR_ISSUE_LIMIT = 20;

function cardPackage(rawArguments, path) {
  const normalizedPath = String(path || "")
    .replace(/\[(\d+)\]/gu, ".$1")
    .replace(/\/(\d+)(?=\/|$)/gu, ".$1")
    .replaceAll("/", ".");
  const cardMatch = normalizedPath.match(/(?:^|\.)cards\.(\d+)(?:\.|$)/u)
    || normalizedPath.match(/^\$?\.?([0-9]+)(?:\.|$)/u);
  if (!cardMatch || typeof rawArguments?.cardsJson !== "string") return null;
  try {
    const cards = JSON.parse(rawArguments.cardsJson);
    const card = cards?.[Number(cardMatch[1])];
    if (!card || typeof card !== "object") return null;
    const instanceMatch = normalizedPath.match(
      /(?:^|\.)(content|feedback)\.(\d+)(?:\.|$)/u
    );
    if (instanceMatch) {
      const instance = card?.[instanceMatch[1]]?.[Number(instanceMatch[2])];
      return typeof instance?.package === "string" ? instance.package : null;
    }
    if (/(?:^|\.)response(?:\.|$)/u.test(normalizedPath)) {
      return typeof card.response?.package === "string" ? card.response.package : null;
    }
    return typeof card.content?.[0]?.package === "string"
      ? card.content[0].package
      : typeof card.response?.package === "string"
        ? card.response.package
        : null;
  } catch {
    return null;
  }
}

function errorIssues(error, toolName, rawArguments) {
  const details = error.details;
  const source = Array.isArray(details?.errors) && details.errors.length
    ? details.errors
    : details?.path || details?.field || details?.reason
      ? [details]
      : [];
  const issues = source.slice(0, ERROR_ISSUE_LIMIT).map((issue) => {
    const path = String(issue?.path || issue?.field || "");
    const resource = toolName === "salvarCardsNaMicrossequencia"
      ? cardPackage(rawArguments, path)
      : null;
    return {
      path,
      message: String(issue?.message || error.message),
      ...(issue?.reason == null ? {} : { reason: String(issue.reason) }),
      ...(issue?.rule == null ? {} : { rule: String(issue.rule) }),
      ...(resource ? { resource } : {})
    };
  });
  if (issues.length || !new Set([400, 422]).has(error.status)) return issues;
  return [{
    path: toolName === "salvarCardsNaMicrossequencia" ? "cardsJson" : "",
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
  if (error.code === "stale_workspace_revision") {
    return {
      strategy: "reread_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Releia o alvo e sua revisão corrente.",
        "Reaplique somente a intenção ainda pertinente com novo requestId."
      ]
    };
  }
  if (error.status === 413) {
    return {
      strategy: "split_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Divida a estrutura ou a microssequência em um lote menor.",
        "Repita o menor lote com novo requestId."
      ]
    };
  }
  if (error.code === "workspace_source_unauthorized") {
    return {
      strategy: "declare_source_and_retry",
      retryable: true,
      requestIdMode: "new",
      steps: [
        "Confirme que cada fonte rejeitada foi fornecida ou aprovada pelo usuário.",
        "Atualize o contexto do workspace e declare cada ID como [source:id].",
        "Releia a revisão e repita o menor lote com novo requestId."
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
    const resources = [...new Set(
      issues.map(({ resource }) => resource).filter(Boolean)
    )];
    return {
      strategy: "correct_and_retry",
      retryable: true,
      requestIdMode: requestId == null ? "none" : "new",
      steps: [
        "Leia todos os caminhos em issues.",
        ...(resources.length
          ? [`Consulte novamente o contrato de: ${resources.join(", ")}.`]
          : []),
        "Corrija somente os campos rejeitados no menor lote.",
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
  { toolName = null, rawArguments = null, requestId = null } = {}
) {
  const normalized = asAuthoringApiError(error);
  const issues = errorIssues(normalized, toolName, rawArguments);
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
