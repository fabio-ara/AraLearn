import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { corsHeaders, preflightHeaders, readAuthoringOAuthAuthorization } from "./security.js";
import {
  authoringApplicationToolDefinition,
  authoringApplicationToolIsAllowed
} from "./courseMcpTools.js";
import { executeCourseTool } from "./courseToolExecutor.js";
import { toolErrorData } from "./toolErrorEnvelope.js";

const BODY_LIMIT = 512 * 1024;
const PDF_BODY_LIMIT = 20 * 1024 * 1024;
const PDF_MULTIPART_LIMIT = PDF_BODY_LIMIT + 64 * 1024;
const PDF_BODY_TIMEOUT_MS = 100_000;
const PDF_INGESTION_TIMEOUT_MS = 40_000;
const PDF_REQUEST_TIMEOUT_MS = 140_000;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
const ACCOUNT_DELETION_ACTION = "excluirMinhaConta";
const PDF_INGESTION_ACTION = "ingerirPdfDaFonte";
const ACCOUNT_DELETION_CONFIRMATION = "EXCLUIR MINHA CONTA";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const encoder = new TextEncoder();
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
});

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function actionNameFromPath(pathname) {
  const segments = String(pathname || "")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const slugIndex = segments.lastIndexOf("aralearn-course-api");
  const route = slugIndex >= 0 ? segments.slice(slugIndex + 1) : segments;
  if (route.length !== 2 || route[0] !== "app") {
    throw new AuthoringApiError(404, "not_found", "Endpoint do aplicativo inexistente.");
  }
  return route[1];
}

async function readBody(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "A operação exige application/json.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) {
    throw new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
  const decoder = new TextDecoder();
  let source = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
    }
    source += decoder.decode(value, { stream: true });
  }
  source += decoder.decode();
  try {
    const body = source ? JSON.parse(source) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo não contém objeto JSON válido.");
  }
}

function requiredFormText(form, name, message) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string" || !values[0]) {
    throw new AuthoringApiError(422, "invalid_pdf_ingestion", message);
  }
  return values[0];
}

function positiveIntegerText(source, message) {
  if (!/^[1-9][0-9]*$/u.test(source)) {
    throw new AuthoringApiError(422, "invalid_pdf_ingestion", message);
  }
  const value = Number(source);
  if (!Number.isSafeInteger(value)) {
    throw new AuthoringApiError(422, "invalid_pdf_ingestion", message);
  }
  return value;
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint >= 0x7f && codePoint <= 0x9f;
  });
}

function readPdfIngestionMetadata(form) {
  const requestId = requiredFormText(
    form,
    "requestId",
    "A identidade da ingestão do PDF é inválida."
  );
  const courseId = requiredFormText(
    form,
    "courseId",
    "A identidade do Curso é inválida."
  ).toLowerCase();
  const sourceId = requiredFormText(
    form,
    "sourceId",
    "A identidade da Fonte é inválida."
  );
  if (!REQUEST_ID_PATTERN.test(requestId) || requestId !== requestId.trim() ||
      !UUID_PATTERN.test(courseId) ||
      sourceId.length > 4_096 || [...sourceId].length > 2_048 ||
      encoder.encode(sourceId).byteLength > 8_192 || hasControlCharacter(sourceId)) {
    throw new AuthoringApiError(
      422,
      "invalid_pdf_ingestion",
      "Os metadados da ingestão do PDF são inválidos."
    );
  }
  return {
    requestId,
    courseId,
    expectedCourseRevision: positiveIntegerText(
      requiredFormText(form, "expectedRevision", "A revisão do Curso é inválida."),
      "A revisão do Curso é inválida."
    ),
    sourceId,
    sourceRevision: positiveIntegerText(
      requiredFormText(form, "sourceRevision", "A revisão da Fonte é inválida."),
      "A revisão da Fonte é inválida."
    )
  };
}

async function readPdfChunk(reader, deadlineAt) {
  const remaining = deadlineAt - Date.now();
  if (remaining <= 0) {
    await reader.cancel().catch(() => undefined);
    throw new AuthoringApiError(408, "request_timeout", "O envio do PDF expirou.");
  }
  let timer = null;
  try {
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          void reader.cancel().catch(() => undefined);
          reject(new AuthoringApiError(408, "request_timeout", "O envio do PDF expirou."));
        }, remaining);
      })
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

async function readPdfMultipart(request, { deadlineAt }) {
  const contentType = String(request.headers.get("content-type") || "");
  if (!/^multipart\/form-data\s*;/iu.test(contentType) ||
      !/;\s*boundary=(?:"[^"]+"|[^;\s]+)/iu.test(contentType)) {
    throw new AuthoringApiError(
      415,
      "unsupported_media_type",
      "A ingestão exige multipart/form-data."
    );
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/u.test(contentLength)) {
      throw new AuthoringApiError(400, "invalid_content_length", "O tamanho do PDF é inválido.");
    }
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength > PDF_MULTIPART_LIMIT) {
      throw new AuthoringApiError(413, "payload_too_large", "O envio do PDF excede o limite aceito.");
    }
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new AuthoringApiError(400, "invalid_pdf", "O corpo não contém um PDF.");
  }
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await readPdfChunk(reader, deadlineAt);
    if (done) break;
    total += value.byteLength;
    if (total > PDF_MULTIPART_LIMIT) {
      await reader.cancel().catch(() => undefined);
      throw new AuthoringApiError(413, "payload_too_large", "O envio do PDF excede o limite aceito.");
    }
    chunks.push(value);
  }
  if (total < 1) {
    throw new AuthoringApiError(400, "invalid_multipart", "O corpo não contém o envio do PDF.");
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let form;
  try {
    form = await new Request("https://aralearn.invalid/pdf", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes
    }).formData();
  } catch {
    throw new AuthoringApiError(400, "invalid_multipart", "O envio do PDF é inválido.");
  }
  const expectedFields = new Set([
    "requestId", "courseId", "expectedRevision", "sourceId", "sourceRevision", "file"
  ]);
  const entries = [...form.entries()];
  if (entries.length !== expectedFields.size ||
      entries.some(([name]) => !expectedFields.has(name)) ||
      new Set(entries.map(([name]) => name)).size !== expectedFields.size) {
    throw new AuthoringApiError(
      422,
      "invalid_pdf_ingestion",
      "O envio do PDF contém campos inválidos."
    );
  }
  const files = form.getAll("file");
  const file = files.length === 1 ? files[0] : null;
  if (!(file instanceof Blob) || file.type.toLowerCase() !== "application/pdf" ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > PDF_BODY_LIMIT) {
    throw new AuthoringApiError(422, "invalid_pdf", "Use um PDF de até 20 MiB.");
  }
  return {
    metadata: readPdfIngestionMetadata(form),
    bytes: new Uint8Array(await file.arrayBuffer())
  };
}

/**
 * @param {{
 *   adapter?: import("./courseSupabaseAdapter.js").CourseSupabaseAdapter,
 *   allowedOrigins?: Set<string>
 * }} [options]
 */
export function createCourseApiHandler({ adapter, allowedOrigins = new Set() } = {}) {
  if (!adapter) throw new TypeError("A borda do aplicativo exige um adaptador de Curso.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A borda do aplicativo exige origens exatas.");
  }
  return async function handleCourseAction(request) {
    const requestStartedAt = Date.now();
    let cors = { Vary: "Origin" };
    let requestId = null;
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: preflightHeaders(request, allowedOrigins)
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      if (request.method !== "POST") {
        return jsonResponse(405, {
          ok: false,
          requestId: null,
          error: { code: "method_not_allowed", message: "A operação aceita somente POST." }
        }, { ...cors, Allow: "POST, OPTIONS" });
      }
      const actionName = actionNameFromPath(new URL(request.url).pathname);
      const accountDeletion = actionName === ACCOUNT_DELETION_ACTION;
      const pdfIngestion = actionName === PDF_INGESTION_ACTION;
      if (!accountDeletion && !pdfIngestion && !authoringApplicationToolDefinition(actionName)) {
        throw new AuthoringApiError(404, "unknown_action", "Operação de Curso inexistente.");
      }
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = requestStartedAt + 40_000;
      let result;
      if (accountDeletion) {
        const rawArguments = await readBody(request);
        if (Object.keys(rawArguments).length !== 1 ||
            rawArguments.confirmation !== ACCOUNT_DELETION_CONFIRMATION) {
          throw new AuthoringApiError(
            422,
            "invalid_account_deletion",
            "A confirmação de exclusão da conta é inválida."
          );
        }
        result = {
          requestId: null,
          data: await adapter.deleteMyAccount({
            accessToken: authentication.credential,
            confirmation: rawArguments.confirmation,
            deadlineAt
          })
        };
      } else {
        const principal = await adapter.resolveApplicationPrincipal(
          authentication.credential,
          { deadlineAt }
        );
        const allowed = pdfIngestion
          ? principal?.actorId && new Set(
              Array.isArray(principal.scopes) ? principal.scopes : []
            ).has("authoring:write")
          : authoringApplicationToolIsAllowed(actionName, principal);
        if (!allowed) {
          throw new AuthoringApiError(
            403,
            "insufficient_scope",
            "A sessão não permite esta operação."
          );
        }
        if (pdfIngestion) {
          const { metadata, bytes } = await readPdfMultipart(request, {
            deadlineAt: requestStartedAt + PDF_BODY_TIMEOUT_MS
          });
          requestId = metadata.requestId;
          const ingestionDeadlineAt = Math.min(
            requestStartedAt + PDF_REQUEST_TIMEOUT_MS,
            Date.now() + PDF_INGESTION_TIMEOUT_MS
          );
          result = {
            requestId,
            data: await adapter.ingestCourseSourcePdf({
              principal,
              courseId: metadata.courseId,
              expectedCourseRevision: metadata.expectedCourseRevision,
              requestId,
              sourceIntent: {
                mode: "existing",
                sourceId: metadata.sourceId,
                sourceRevision: metadata.sourceRevision
              },
              bytes,
              mediaType: "application/pdf",
              deadlineAt: ingestionDeadlineAt
            })
          };
        } else {
          const rawArguments = await readBody(request);
          result = await executeCourseTool({
            adapter,
            principal,
            name: actionName,
            rawArguments,
            deadlineAt,
            surface: "application",
            applicationInspectionVersion:
              request.headers.get("accept") ===
                "application/vnd.aralearn.course-study-unit-inspection.v2+json"
                ? 2
                : 1,
            onRequestIdValidated(value) {
              requestId = value;
            }
          });
        }
      }
      const payload = { ok: true, requestId: result.requestId, data: result.data ?? null };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > RESPONSE_LIMIT) {
        throw new AuthoringApiError(413, "response_too_large", "Leia uma parcela menor do Curso.");
      }
      return jsonResponse(200, payload, cors);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const headers = { ...cors };
      if (normalized.status === 401) headers["WWW-Authenticate"] = "Bearer";
      if (normalized.status === 429) headers["Retry-After"] = "60";
      return jsonResponse(normalized.status, {
        ok: false,
        requestId,
        error: toolErrorData(normalized, { requestId })
      }, headers);
    }
  };
}
