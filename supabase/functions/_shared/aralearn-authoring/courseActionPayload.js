import { AuthoringApiError } from "./errors.js";

// Actions exige menos de 100.000 caracteres, sem definir a unidade Unicode.
// Contar unidades UTF-16 é conservador também para pontos de código. Não é
// uma afirmação sobre a implementação do cliente nem um limite de bytes.
// https://developers.openai.com/api/docs/actions/production
export const ACTION_PAYLOAD_MAX_CHARACTERS = 99_999;
const BODY_BYTE_LIMIT = 512 * 1024; // Proteção de memória local, não limite do cliente.

function payloadTooLarge() {
  return new AuthoringApiError(413, "action_payload_too_large",
    "A tarefa excedeu o limite de transporte. Envie um recorte menor, preservando seu texto.");
}

function invalidJson() {
  return new AuthoringApiError(400, "invalid_json", "O corpo da Action deve formar um objeto JSON em UTF-8 válido.");
}

export async function readActionPayload(request) {
  if (!String(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new AuthoringApiError(415, "unsupported_media_type", "A Action exige application/json.");
  }
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let text = "", bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > BODY_BYTE_LIMIT) throw payloadTooLarge();
      text += decoder.decode(value, { stream: true });
      if (text.length > ACTION_PAYLOAD_MAX_CHARACTERS) throw payloadTooLarge();
    }
    text += decoder.decode();
    if (text.length > ACTION_PAYLOAD_MAX_CHARACTERS) throw payloadTooLarge();
    const body = text ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalidJson();
    return body;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof AuthoringApiError) throw error;
    throw invalidJson();
  } finally {
    reader.releaseLock();
  }
}

export function serializeActionPayload(payload) {
  const serialized = JSON.stringify(payload);
  if (typeof serialized !== "string") throw new AuthoringApiError(502,
    "invalid_human_task_result", "A tarefa devolveu um resultado inválido.");
  if (serialized.length > ACTION_PAYLOAD_MAX_CHARACTERS) {
    throw new AuthoringApiError(413, "action_response_too_large",
      "A resposta excedeu o limite de transporte. Consulte um recorte menor, preservando seu texto.");
  }
  return serialized;
}
