const INTERNAL_ERROR_LANGUAGE =
  /StudyUnits?|AnalysisUnits?|analysisUnits|evidenceRequirements|missingData|snapshot|schema|contract|contrato|courseRevision|requestId|componentRef|studyUnitRef|authorization_id|\bCAS\b|\bUUID\b|\bIDs?\b|\bcursor\b|\bpaginação\b|\bendpoint\b|\bprovider\b|\bRegistry\b|\bJSON\b|\bSupabase\b|\bHTTP\b|\bRPC\b|\bSQL\b|\bAPI\b|campo desconhecido|formato (?:estruturado|interno|da conversa)/iu;
const INTERNAL_IDENTIFIER_LANGUAGE =
  /\$\.[A-Za-z]|\b[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/u;
const UUID_VALUE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu;
const ARTIFICIAL_PUBLIC_CAPITALIZATION =
  /\b(?:[Aa]|[Aa]s|[Dd]a|[Dd]as|[Dd]e|[Dd]o|[Dd]os|[Ee]sta|[Ee]ssa|[Oo]|[Oo]s|[Uu]m|[Uu]ma) (?:Curso|Fonte|Fontes|Âncora|Âncoras|Parte|Tópico|Observação|Unidade de estudo)\b|\be Âncoras\b/u;

export function publicErrorMessage(error, fallback) {
  const safeFallback = String(fallback || "Não foi possível concluir esta operação.").trim();
  const message = String(error?.message || (typeof error === "string" ? error : "")).trim();
  return !message || INTERNAL_ERROR_LANGUAGE.test(message) ||
    INTERNAL_IDENTIFIER_LANGUAGE.test(message) || UUID_VALUE.test(message) ||
    ARTIFICIAL_PUBLIC_CAPITALIZATION.test(message)
    ? safeFallback
    : message;
}
