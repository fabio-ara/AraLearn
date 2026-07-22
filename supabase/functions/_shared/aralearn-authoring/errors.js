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
