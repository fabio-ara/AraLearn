import { ArtifactStore } from "./artifactStore.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError, asAuthoringApiError } from "./errors.js";
import { corsHeaders, preflightHeaders } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

function jsonError(error, cors = { Vary: "Origin" }) {
  const normalized = asAuthoringApiError(error);
  return new Response(JSON.stringify({
    ok: false,
    error: { code: normalized.code, message: normalized.message }
  }), {
    status: normalized.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...cors
    }
  });
}

async function parseJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function revisionHeaders(revisionHash, cors) {
  return {
    "Cache-Control": "private, max-age=31536000, immutable",
    ETag: `"sha256-${revisionHash}"`,
    "X-AraLearn-Revision-Hash": revisionHash,
    "X-Content-Type-Options": "nosniff",
    ...cors
  };
}

function etagMatches(request, etag) {
  return String(request.headers.get("if-none-match") || "")
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag || value === `W/${etag}`);
}

export function createCourseRevisionHandler({
  supabaseUrl,
  serverApiKey,
  publishableKey,
  allowedOrigins = new Set(),
  fetchImpl = globalThis.fetch
}) {
  if (!(allowedOrigins instanceof Set) || allowedOrigins.size === 0 || allowedOrigins.has("*")) {
    throw new TypeError("A entrega de revisões exige origens CORS explícitas.");
  }
  const artifacts = new ArtifactStore({ supabaseUrl, serverApiKey, fetchImpl });
  return async function handleCourseRevision(request) {
    let cors = { Vary: "Origin" };
    try {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: preflightHeaders(request, allowedOrigins)
        });
      }
      cors = corsHeaders(request, allowedOrigins);
      if (request.method !== "GET") {
        throw new AuthoringApiError(405, "method_not_allowed", "Use GET.");
      }
      const authorization = String(request.headers.get("authorization") || "");
      if (!authorization.startsWith("Bearer ")) {
        throw new AuthoringApiError(401, "authentication_required", "Sessão obrigatória.");
      }
      const userResponse = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: authorization }
      });
      const user = await parseJson(userResponse);
      if (!userResponse.ok || !UUID.test(String(user?.id || ""))) {
        throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
      }
      const segments = new URL(request.url).pathname.split("/").filter(Boolean);
      const revisionHash = String(segments.at(-1) || "").toLowerCase();
      const courseId = String(segments.at(-2) || "").toLowerCase();
      if (!UUID.test(courseId) || !SHA256.test(revisionHash)) {
        throw new AuthoringApiError(404, "revision_not_found", "Revisão não encontrada.");
      }
      const descriptorResponse = await fetchImpl(
        `${supabaseUrl}/rest/v1/rpc/get_course_revision_artifact_v4`,
        {
          method: "POST",
          headers: supabaseServerHeaders(serverApiKey),
          body: JSON.stringify({
            p_actor_id: user.id,
            p_course_id: courseId,
            p_revision_hash: revisionHash
          })
        }
      );
      const descriptor = await parseJson(descriptorResponse);
      if (!descriptorResponse.ok) {
        throw new AuthoringApiError(
          descriptorResponse.status === 403 ? 403 : 503,
          descriptorResponse.status === 403 ? "not_authorized" : "service_unavailable",
          descriptorResponse.status === 403
            ? "Revisão não autorizada."
            : "O plano de controle não respondeu."
        );
      }
      if (!descriptor) {
        throw new AuthoringApiError(404, "revision_not_found", "Revisão não encontrada.");
      }
      const immutableHeaders = revisionHeaders(revisionHash, cors);
      if (etagMatches(request, immutableHeaders.ETag)) {
        return new Response(null, { status: 304, headers: immutableHeaders });
      }
      const document = await artifacts.getJson(descriptor);
      const body = canonicalJsonStringify(document);
      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          ...immutableHeaders
        }
      });
    } catch (error) {
      return jsonError(error, cors);
    }
  };
}
