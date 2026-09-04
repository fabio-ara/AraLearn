const INTERNAL_ERROR_LANGUAGE =
  /analysisUnits|evidenceRequirements|missingData|snapshot|schema|contract|contrato|courseRevision|requestId|componentRef|studyUnitRef|authorization_id|\bCAS\b|\bUUID\b|\bIDs?\b|\bcursor\b|\bpaginação\b|\bendpoint\b|\bprovider\b|\bRegistry\b|\bJSON\b|\bSupabase\b|\bHTTP\b|\bRPC\b|\bSQL\b|\bAPI\b|campo desconhecido|formato (?:estruturado|interno|da conversa)/iu;
const NETWORK_ERROR_LANGUAGE =
  /failed(?:[ _-]to)?[ _-]fetch|fetch[ _-]failed|network(?:[ _-]?error)?|load[ _-]failed|connection|offline|socket|timeout/iu;
const TECHNICAL_ERROR_LANGUAGE =
  /\b(?:cannot|failed|forbidden|invalid|unauthorized|unexpected)\b/iu;
const INTERNAL_IDENTIFIER_LANGUAGE =
  /\$\.[A-Za-z]|\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b|\b(?!AraLearn\b)[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;
const UUID_VALUE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const ARTIFICIAL_PUBLIC_CAPITALIZATION =
  /\b(?:[Aa]|[Aa]s|[Dd]a|[Dd]as|[Dd]e|[Dd]o|[Dd]os|[Ee]sta|[Ee]ssa|[Oo]|[Oo]s|[Uu]m|[Uu]ma) (?:Curso|Fonte|Fontes|Âncora|Âncoras|Parte|Tópico|Observação|Unidade de estudo)\b|\be Âncoras\b/u;
const DEFAULT_CONFLICT_MESSAGE = "O conteúdo mudou. Recarregue e tente novamente.";
const DEFAULT_UNAUTHENTICATED_MESSAGE = "Seu acesso expirou. Entre novamente e tente outra vez.";
const DEFAULT_FORBIDDEN_MESSAGE = "Você não tem permissão para concluir esta operação.";

function errorCode(error) {
  return String(error?.code || error?.response?.code || "").trim().toLowerCase();
}

function errorStatus(error) {
  const raw = error?.status ?? error?.response?.status;
  const status = raw == null || raw === "" ? null : Number(raw);
  return Number.isFinite(status) ? status : null;
}

export function publicErrorMessage(error, fallback, { conflict = "", network = "" } = {}) {
  const safeFallback = String(fallback || "Não foi possível concluir esta operação.").trim();
  const message = String(error?.message || (typeof error === "string" ? error : "")).trim();
  const code = errorCode(error);
  const status = errorStatus(error);
  if (status === 409 || ["40001", "conflict", "course_revision_changed",
    "course_version_changed", "revision_conflict"].includes(code)) {
    return String(conflict || DEFAULT_CONFLICT_MESSAGE).trim();
  }
  if (status === 401 || ["401", "bad_jwt", "invalid_jwt", "jwt_expired",
    "not_authenticated", "session_not_found", "unauthorized"].includes(code)) {
    return DEFAULT_UNAUTHENTICATED_MESSAGE;
  }
  if (status === 403 || ["403", "42501", "forbidden", "insufficient_privilege",
    "permission_denied"].includes(code)) {
    return DEFAULT_FORBIDDEN_MESSAGE;
  }
  if (NETWORK_ERROR_LANGUAGE.test(`${code} ${message}`)) {
    return String(network || safeFallback).trim();
  }
  return !message || INTERNAL_ERROR_LANGUAGE.test(message) || TECHNICAL_ERROR_LANGUAGE.test(message) ||
    INTERNAL_IDENTIFIER_LANGUAGE.test(message) || UUID_VALUE.test(message) ||
    ARTIFICIAL_PUBLIC_CAPITALIZATION.test(message) || status !== null && status >= 500
    ? safeFallback
    : message;
}
