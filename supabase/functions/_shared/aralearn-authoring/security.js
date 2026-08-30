import { AuthoringApiError } from "./errors.js";

export function parseAllowedOrigins(source) {
  return new Set(
    String(source || "")
      .split(",")
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  );
}

export function corsHeaders(request, allowedOrigins) {
  const origin = String(request.headers.get("origin") || "").trim().replace(/\/+$/, "");
  if (!origin) return { Vary: "Origin" };
  if (!allowedOrigins.has(origin)) {
    throw new AuthoringApiError(403, "origin_not_allowed", "Origem não autorizada.");
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Expose-Headers":
      "ETag, X-AraLearn-Revision-Hash, X-AraLearn-Authoring-Contract, X-AraLearn-Authoring-Projection",
    Vary: "Origin"
  };
}

export function preflightHeaders(request, allowedOrigins) {
  return {
    ...corsHeaders(request, allowedOrigins),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // O cliente web do Supabase envia a publishable key neste cabeçalho. Sem
    // declará-lo no preflight, o navegador bloqueia a consulta antes que a
    // função possa verificar a sessão do usuário.
    "Access-Control-Allow-Headers": "apikey, Authorization, Content-Type, Idempotency-Key, If-None-Match",
    "Access-Control-Max-Age": "600"
  };
}

export function readAuthoringOAuthAuthorization(request) {
  const authorization = String(request.headers.get("authorization") || "").trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!bearer) {
    throw new AuthoringApiError(
      401,
      "authentication_required",
      "Conecte sua conta pelo OAuth 2.1 para usar a autoria."
    );
  }
  return { kind: "oauth", credential: bearer };
}

export function decodeJwtClaims(token) {
  const segments = String(token || "").split(".");
  if (segments.length !== 3 || !segments[1]) {
    throw new AuthoringApiError(401, "invalid_oauth_token", "O access token OAuth é inválido.");
  }
  try {
    const payload = segments[1]
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(segments[1].length / 4) * 4, "=");
    const claims = JSON.parse(atob(payload));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error();
    return claims;
  } catch {
    throw new AuthoringApiError(401, "invalid_oauth_token", "O access token OAuth é inválido.");
  }
}

export async function sha256Hex(value) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function assertScope(principal, scope) {
  const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
  if (scopes.has(scope)) return;
  throw new AuthoringApiError(403, "insufficient_scope", `A operação exige o escopo ${scope}.`);
}
