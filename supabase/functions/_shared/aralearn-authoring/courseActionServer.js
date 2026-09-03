import { asAuthoringApiError, AuthoringApiError } from "./errors.js";
import { createAuthoringActionOAuthHandler } from "./actionOAuthServer.js";
import {
  COURSE_HUMAN_TASK_CATALOG_HEADER,
  courseHumanTaskDefinition,
  courseHumanTaskIsAllowed,
  executeHumanCourseTask
} from "./courseHumanTasks.js";
import {
  corsHeaders,
  preflightHeaders,
  readAuthoringOAuthAuthorization,
  sha256Hex
} from "./security.js";

const BODY_LIMIT = 512 * 1024;
const RESPONSE_LIMIT = 512 * 1024;
const FILE_TASK = "incorporar_pdf_como_fonte";
const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-AraLearn-Authoring-Contract": COURSE_HUMAN_TASK_CATALOG_HEADER
});

export const ARALEARN_ACTION_CONTRACT_HEADER = COURSE_HUMAN_TASK_CATALOG_HEADER;

function jsonResponse(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function withAuthoringContractHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("X-AraLearn-Authoring-Contract", COURSE_HUMAN_TASK_CATALOG_HEADER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function routeFromPath(pathname) {
  const segments = String(pathname || "")
    .replace(/\/+$/u, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
  const slugIndex = segments.lastIndexOf("aralearn-authoring-action");
  return slugIndex >= 0 ? segments.slice(slugIndex + 1) : segments;
}

async function readBody(request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase()
    .startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "A Action exige application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      throw new AuthoringApiError(413, "action_payload_too_large", "Divida a tarefa em partes menores.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const body = total ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AuthoringApiError(400, "invalid_json", "O corpo da Action deve formar um objeto JSON.");
  }
}

function actionFileReference(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoringApiError(422, "invalid_openai_file", "O PDF anexado não chegou em formato utilizável.");
  }
  const fileId = String(value.id || value.file_id || "").trim();
  const fileName = String(value.name || value.file_name || "").trim();
  const mediaType = String(value.mime_type || "").trim().toLowerCase();
  const downloadLink = String(value.download_link || value.download_url || "").trim();
  let downloadUrl;
  try {
    downloadUrl = new URL(downloadLink);
  } catch {
    downloadUrl = null;
  }
  if (!fileId || mediaType && mediaType !== "application/pdf" ||
      downloadUrl?.protocol !== "https:" ||
      !downloadUrl.hostname.endsWith(".oaiusercontent.com") ||
      downloadUrl.username || downloadUrl.password || downloadUrl.hash ||
      downloadUrl.port && downloadUrl.port !== "443") {
    throw new AuthoringApiError(422, "invalid_openai_file", "A referência precisa apontar para um PDF.");
  }
  return {
    download_url: downloadUrl.href,
    file_id: fileId,
    ...(fileName ? { file_name: fileName } : {}),
    ...(mediaType ? { mime_type: mediaType } : {})
  };
}

function normalizeActionArguments(taskName, rawArguments) {
  if (taskName !== FILE_TASK) return rawArguments;
  if (Object.hasOwn(rawArguments, "pdf")) {
    throw new AuthoringApiError(
      422,
      "invalid_openai_file",
      "O campo do PDF é preenchido pelo transporte do ChatGPT."
    );
  }
  const references = rawArguments.openaiFileIdRefs;
  if (!Array.isArray(references) || references.length !== 1) {
    throw new AuthoringApiError(422, "openai_file_count_invalid", "Escolha um único PDF anexado.");
  }
  const normalized = {
    ...rawArguments,
    pdf: actionFileReference(references[0])
  };
  delete normalized.openaiFileIdRefs;
  return normalized;
}

function normalizedResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.result !== "string" || !value.result.trim() ||
      !(value.deepLink === null || typeof value.deepLink === "string") ||
      !(value.nextDecision === null || typeof value.nextDecision === "string") ||
      Object.keys(value).some((field) => !new Set([
        "result", "deepLink", "nextDecision", "context"
      ]).has(field))) {
    throw new AuthoringApiError(502, "invalid_human_task_result", "A tarefa devolveu um resultado inválido.");
  }
  return value;
}

function retryableError(error) {
  if (error.code === "course_source_pdf_write_uncertain") return false;
  if (error.status === 408 || error.status === 429 || error.status >= 500) return true;
  return new Set([
    "course_service_unavailable", "request_timeout", "network_error"
  ]).has(error.code);
}

function nextDecisionForError(error, retryable) {
  if (error.code === "ambiguous_human_reference") {
    return "Informe um título mais específico ou a posição humana do objeto.";
  }
  if (error.code === "human_reference_not_found") {
    return "Confira o título ou a posição e tente novamente.";
  }
  if (error.code === "human_task_result_too_large") {
    return "Escolha um Curso, Parte, Microssequência ou Unidade mais específica.";
  }
  if (error.code === "action_payload_too_large") {
    return "Divida a tarefa em um conjunto menor de Units ou correções.";
  }
  if (error.code === "course_source_pdf_write_uncertain") {
    return "Releia as Fontes antes de decidir se ainda precisa incorporar o PDF.";
  }
  if (retryable) return "Tente novamente sem mudar a intenção da tarefa.";
  return null;
}

function publicError(error, { completedWrite = false } = {}) {
  if (completedWrite && error.code === "action_response_too_large") {
    return {
      error: {
        code: error.code,
        message: "A escrita pode ter sido concluída, mas a resposta excedeu o limite.",
        retryable: false
      },
      nextDecision: "Releia o Curso antes de decidir se ainda falta alguma mudança."
    };
  }
  const retryable = retryableError(error);
  return {
    error: {
      code: String(error.code || "human_task_failed"),
      message: String(error.message || "A tarefa não pôde ser concluída.").slice(0, 1000),
      retryable
    },
    nextDecision: nextDecisionForError(error, retryable)
  };
}

export function createAuthoringActionHandler({
  adapter,
  allowedOrigins = new Set(),
  actionBaseUrl,
  publicAppUrl
}) {
  if (!adapter) throw new TypeError("A Action exige um adaptador de Curso.");
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A Action exige origens exatas.");
  }
  const handleOAuth = createAuthoringActionOAuthHandler({ adapter, actionBaseUrl, publicAppUrl });

  return async function handleAction(request) {
    let cors = { Vary: "Origin" };
    let completedWrite = false;
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            ...preflightHeaders(request, allowedOrigins),
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "X-AraLearn-Authoring-Contract": COURSE_HUMAN_TASK_CATALOG_HEADER
          }
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      const route = routeFromPath(new URL(request.url).pathname);
      if (route[0] === "oauth") {
        return withAuthoringContractHeader(await handleOAuth(request, route, cors));
      }
      if (request.method !== "POST") {
        throw new AuthoringApiError(405, "method_not_allowed", "A Action aceita somente POST.");
      }
      const taskName = route.length === 1 ? route[0] : "";
      const task = courseHumanTaskDefinition(taskName);
      if (!task) throw new AuthoringApiError(404, "unknown_human_task", "Tarefa de autoria inexistente.");
      const authentication = readAuthoringOAuthAuthorization(request);
      const deadlineAt = Date.now() + 40_000;
      const principal = await adapter.resolveActionPrincipal(
        await sha256Hex(authentication.credential),
        { deadlineAt }
      );
      if (!courseHumanTaskIsAllowed(taskName, principal)) {
        throw new AuthoringApiError(403, "insufficient_scope", "A conta conectada não permite esta tarefa.");
      }
      const rawArguments = normalizeActionArguments(taskName, await readBody(request));
      const result = normalizedResult(await executeHumanCourseTask({
        adapter,
        principal,
        name: taskName,
        rawArguments,
        deadlineAt,
        projectionRecipient: "connected_actions_gpt"
      }));
      completedWrite = task.annotations?.readOnlyHint !== true;
      if (new TextEncoder().encode(JSON.stringify(result)).byteLength >= RESPONSE_LIMIT) {
        throw new AuthoringApiError(413, "action_response_too_large", "A resposta excedeu o limite.");
      }
      return jsonResponse(200, result, cors);
    } catch (error) {
      const normalized = asAuthoringApiError(error);
      const headers = { ...cors };
      if (normalized.status === 401) headers["WWW-Authenticate"] = "Bearer";
      if (normalized.status === 429) headers["Retry-After"] = "60";
      if (normalized.status === 405) headers.Allow = "POST, OPTIONS";
      return jsonResponse(
        normalized.status,
        publicError(normalized, { completedWrite }),
        headers
      );
    }
  };
}
