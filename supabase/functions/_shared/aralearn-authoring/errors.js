export class AuthoringApiError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "AuthoringApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export function asAuthoringApiError(error) {
  if (error instanceof AuthoringApiError) return error;
  return new AuthoringApiError(
    500,
    "internal_error",
    "A operação de autoria não pôde ser concluída."
  );
}

const UNCERTAIN_WRITE_CODES = new Set([
  "course_write_uncertain",
  "course_source_pdf_write_uncertain",
  "course_media_write_uncertain"
]);

const TRANSIENT_ERROR_CODES = new Set([
  "temporarily_unavailable",
  "service_timeout",
  "request_timeout",
  "network_error",
  "course_service_unavailable",
  "oauth_verification_unavailable"
]);

// Escrita incerta nunca é repetida às cegas: a orientação é reler o estado salvo.
// `internal_error` é falha inesperada, sem causa classificada, então também fica
// fora da repetição automática; repetir o mesmo pedido não é decisão segura.
export function authoringErrorIsRetryable(error) {
  const code = String(error?.code || "");
  if (UNCERTAIN_WRITE_CODES.has(code)) return false;
  if (code === "internal_error") return false;
  const status = Number(error?.status);
  if (status === 408 || status === 429 || status >= 500) return true;
  return TRANSIENT_ERROR_CODES.has(code);
}

// Separa indisponibilidade transitória, conflito de base, entrada inválida,
// recusa de autorização, escrita incerta e falha interna. A classe orienta o log
// de diagnóstico; não substitui o código estável apresentado ao cliente.
export function authoringErrorClass(error) {
  const code = String(error?.code || "");
  const status = Number(error?.status);
  if (UNCERTAIN_WRITE_CODES.has(code)) return "incerto";
  if (code === "internal_error") return "interno";
  if (authoringErrorIsRetryable(error)) return "transitorio";
  if (status === 409 || status === 412) return "conflito";
  if (status === 401 || status === 403) return "autorizacao";
  if (status === 400 || status === 422) return "entrada";
  return "definitivo";
}
