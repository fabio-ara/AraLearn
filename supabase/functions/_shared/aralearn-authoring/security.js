import { AuthoringApiError } from "./errors.js";

const API_KEY_PATTERN = /^arl_[A-Za-z0-9_-]{24,192}$/;
const RECEIPT_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RECEIPT_PURPOSE = "aralearn.authoring.submission-read.v1";
const RECEIPT_KEY_DOMAIN = "aralearn.authoring.hmac-key.submission-read.v1";
const PRIVATE_INTEGRATION_KEY_DOMAIN = "aralearn.authoring.private-integration.v1";
const DEFAULT_RECEIPT_TTL_SECONDS = 5 * 60;
const MAX_RECEIPT_TTL_SECONDS = 10 * 60;
const CLOCK_SKEW_SECONDS = 30;
const encoder = new TextEncoder();

function base64UrlEncode(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value) {
  if (!value || !RECEIPT_SEGMENT_PATTERN.test(value)) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
}

function receiptSecretBytes(secret) {
  const normalized = String(secret || "");
  if (normalized.length < 32) {
    throw new AuthoringApiError(
      503,
      "submission_receipt_unavailable",
      "A emissão de comprovantes de releitura não está configurada."
    );
  }
  return encoder.encode(normalized);
}

async function deriveReceiptKey(secret) {
  const masterKey = await globalThis.crypto.subtle.importKey(
    "raw",
    receiptSecretBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const derivedMaterial = await globalThis.crypto.subtle.sign(
    "HMAC",
    masterKey,
    encoder.encode(RECEIPT_KEY_DOMAIN)
  );
  return globalThis.crypto.subtle.importKey(
    "raw",
    derivedMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function principalReceiptIdentity(principal) {
  const actorUserId = String(principal?.actorId || "").trim();
  if (!actorUserId) {
    throw new AuthoringApiError(401, "authentication_required", "Autenticação obrigatória.");
  }
  return {
    actorUserId,
    apiClientId: principal?.clientId == null ? null : String(principal.clientId).trim()
  };
}

function receiptClaims({ principal, runId, partKey, attempt, submissionSha256, nowMs, ttlSeconds }) {
  const issuedAt = Math.floor(nowMs / 1000);
  const identity = principalReceiptIdentity(principal);
  return {
    version: 1,
    purpose: RECEIPT_PURPOSE,
    runId: String(runId),
    partKey: String(partKey),
    attempt,
    submissionSha256: String(submissionSha256),
    actorUserId: identity.actorUserId,
    apiClientId: identity.apiClientId,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds
  };
}

export async function issueSubmissionReadReceipt({
  secret,
  principal,
  runId,
  partKey,
  attempt,
  submissionSha256,
  nowMs = Date.now(),
  ttlSeconds = DEFAULT_RECEIPT_TTL_SECONDS
}) {
  if (!String(runId || "").trim() || !String(partKey || "").trim()
      || !SHA256_PATTERN.test(String(submissionSha256 || ""))
      || !Number.isInteger(attempt) || attempt < 1
      || !Number.isInteger(ttlSeconds) || ttlSeconds < 1
      || ttlSeconds > MAX_RECEIPT_TTL_SECONDS) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "Não foi possível emitir o comprovante de releitura.");
  }
  const claims = receiptClaims({
    principal, runId, partKey, attempt, submissionSha256, nowMs, ttlSeconds
  });
  const payload = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const key = await deriveReceiptKey(secret);
  const signature = new Uint8Array(await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  ));
  return `${payload}.${base64UrlEncode(signature)}`;
}

export async function verifySubmissionReadReceipt(token, {
  secret,
  principal,
  runId,
  partKey,
  attempt,
  submissionSha256,
  nowMs = Date.now()
}) {
  const normalized = String(token || "").trim();
  if (normalized.length > 4096) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  const segments = normalized.split(".");
  if (segments.length !== 2) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  const [payload, signatureSegment] = segments;
  const signature = base64UrlDecode(signatureSegment);
  const key = await deriveReceiptKey(secret);
  const validSignature = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(payload)
  );
  if (!validSignature) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  let claims;
  try {
    claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
  } catch (error) {
    if (error instanceof AuthoringApiError) throw error;
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  const expectedIdentity = principalReceiptIdentity(principal);
  const expectedFields = [
    "version", "purpose", "runId", "partKey", "attempt", "submissionSha256",
    "actorUserId", "apiClientId", "issuedAt", "expiresAt"
  ];
  if (!claims || typeof claims !== "object" || Array.isArray(claims)
      || Object.keys(claims).length !== expectedFields.length
      || expectedFields.some((field) => !Object.hasOwn(claims, field))
      || claims.version !== 1
      || claims.purpose !== RECEIPT_PURPOSE
      || claims.runId !== runId
      || claims.partKey !== partKey
      || claims.attempt !== attempt
      || claims.submissionSha256 !== submissionSha256
      || claims.actorUserId !== expectedIdentity.actorUserId
      || claims.apiClientId !== expectedIdentity.apiClientId
      || !Number.isInteger(claims.issuedAt)
      || !Number.isInteger(claims.expiresAt)
      || claims.expiresAt <= claims.issuedAt
      || claims.expiresAt - claims.issuedAt > MAX_RECEIPT_TTL_SECONDS) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante não corresponde à entrega e à identidade atuais.");
  }
  const currentTime = Math.floor(nowMs / 1000);
  if (claims.issuedAt > currentTime + CLOCK_SKEW_SECONDS) {
    throw new AuthoringApiError(422, "invalid_submission_read_receipt", "O comprovante de releitura é inválido.");
  }
  if (claims.expiresAt <= currentTime) {
    throw new AuthoringApiError(
      409,
      "submission_read_receipt_expired",
      "O comprovante expirou. Leia novamente a entrega antes de auditar."
    );
  }
  return claims;
}

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
    Vary: "Origin"
  };
}

export function preflightHeaders(request, allowedOrigins) {
  return {
    ...corsHeaders(request, allowedOrigins),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    // O cliente web do Supabase envia a publishable key neste cabeçalho. Sem
    // declará-lo no preflight, o navegador bloqueia a consulta antes que a
    // função possa verificar a sessão do usuário.
    "Access-Control-Allow-Headers": "apikey, Authorization, Content-Type, Idempotency-Key, X-AraLearn-API-Key",
    "Access-Control-Max-Age": "600"
  };
}

export function readAuthorization(request) {
  const explicit = String(request.headers.get("x-aralearn-api-key") || "").trim();
  const authorization = String(request.headers.get("authorization") || "").trim();
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (explicit && bearer) {
    throw new AuthoringApiError(
      400,
      "ambiguous_authentication",
      "Envie somente uma credencial de autenticação."
    );
  }
  const credential = explicit || bearer;
  if (!credential) {
    throw new AuthoringApiError(401, "authentication_required", "Autenticação obrigatória.");
  }
  if (credential.startsWith("arl_")) {
    if (!API_KEY_PATTERN.test(credential)) {
      throw new AuthoringApiError(401, "invalid_api_key", "Chave de autoria inválida.");
    }
    return { kind: "api_key", credential };
  }
  if (explicit) {
    throw new AuthoringApiError(401, "invalid_api_key", "Chave de autoria inválida.");
  }
  return { kind: "jwt", credential };
}

export async function sha256Hex(value) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function derivePrivateIntegrationApiKey(masterSecret, actorId, requestId) {
  const secret = String(masterSecret || "");
  const actor = String(actorId || "").trim();
  const request = String(requestId || "").trim();
  if (secret.length < 32 || !actor || !request) {
    throw new AuthoringApiError(
      503,
      "integration_key_unavailable",
      "A emissão de integrações pessoais não está configurada."
    );
  }
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${PRIVATE_INTEGRATION_KEY_DOMAIN}\n${actor}\n${request}`)
  );
  return `arl_${base64UrlEncode(new Uint8Array(signature))}`;
}

export function assertScope(principal, scope) {
  const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
  if (scopes.has("*") || scopes.has(scope)) return;
  throw new AuthoringApiError(403, "insufficient_scope", `A operação exige o escopo ${scope}.`);
}
