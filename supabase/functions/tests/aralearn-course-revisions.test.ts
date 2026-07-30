import {
  createCourseRevisionHandler
} from "../_shared/aralearn-authoring/courseRevisionHandler.js";
import { canonicalJsonStringify } from "../_shared/aralearn-authoring/canonicalJson.js";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

const actorId = "20000000-0000-4000-8000-000000000001";
const courseId = "10000000-0000-4000-8000-000000000001";
const document = {
  contract: "aralearn.contract",
  version: 4,
  kind: "project",
  courses: []
};
const bytes = new TextEncoder().encode(canonicalJsonStringify(document));
const digest = await crypto.subtle.digest("SHA-256", bytes);
const hash = [...new Uint8Array(digest)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
const objectKey = `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
const browserOrigin = "https://fabio-ara.github.io";

function handler() {
  return createCourseRevisionHandler({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    publishableKey: "publishable",
    allowedOrigins: new Set([browserOrigin]),
    fetchImpl: async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/auth/v1/user")) return Response.json({ id: actorId });
      if (target.endsWith("/rest/v1/rpc/get_course_revision_artifact_v4")) {
        return Response.json({
          hash,
          bucket: "aralearn-course-revisions",
          objectKey,
          artifactType: "aralearn.contract",
          mediaType: "application/json",
          sizeBytes: bytes.byteLength
        });
      }
      if (target.includes("/storage/v1/object/")) return new Response(bytes);
      throw new Error(`URL inesperada: ${target}`);
    }
  });
}

function cachingHandler(storageReads: { value: number }) {
  return createCourseRevisionHandler({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    publishableKey: "publishable",
    allowedOrigins: new Set([browserOrigin]),
    fetchImpl: async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/auth/v1/user")) return Response.json({ id: actorId });
      if (target.endsWith("/rest/v1/rpc/get_course_revision_artifact_v4")) {
        return Response.json({
          hash,
          bucket: "aralearn-course-revisions",
          objectKey,
          artifactType: "aralearn.contract",
          mediaType: "application/json",
          sizeBytes: bytes.byteLength
        });
      }
      if (target.includes("/storage/v1/object/")) {
        storageReads.value += 1;
        return new Response(bytes);
      }
      throw new Error(`URL inesperada: ${target}`);
    }
  });
}

Deno.test("entrega de revisão exige uma sessão", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`
  ));
  assertEquals(response.status, 401);
});

Deno.test("preflight permite a origem pública e os cabeçalhos do cliente", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    {
      method: "OPTIONS",
      headers: {
        Origin: browserOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "apikey, authorization, if-none-match"
      }
    }
  ));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), browserOrigin);
  assertEquals(response.headers.get("access-control-allow-methods")?.includes("GET"), true);
  assertEquals(response.headers.get("access-control-allow-headers")?.toLowerCase().includes("authorization"), true);
  assertEquals(response.headers.get("access-control-allow-headers")?.toLowerCase().includes("apikey"), true);
  assertEquals(response.headers.get("access-control-allow-headers")?.toLowerCase().includes("if-none-match"), true);
});

Deno.test("preflight rejeita origem que não consta da configuração", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    { method: "OPTIONS", headers: { Origin: "https://hostile.example" } }
  ));
  assertEquals(response.status, 403);
  assertEquals(response.headers.get("access-control-allow-origin"), null);
});

Deno.test("entrega de revisão autoriza e confere o artefato privado", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    { headers: { Authorization: "Bearer user-jwt", Origin: browserOrigin } }
  ));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("access-control-allow-origin"), browserOrigin);
  assertEquals(response.headers.get("x-aralearn-revision-hash"), hash);
  assertEquals(await response.json(), JSON.parse(canonicalJsonStringify(document)));
});

Deno.test("ETag imutável responde 304 sem reler o Storage", async () => {
  const storageReads = { value: 0 };
  const response = await cachingHandler(storageReads)(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    {
      headers: {
        Authorization: "Bearer user-jwt",
        Origin: browserOrigin,
        "If-None-Match": `W/"sha256-${hash}"`
      }
    }
  ));
  assertEquals(response.status, 304);
  assertEquals(response.headers.get("etag"), `"sha256-${hash}"`);
  assertEquals(storageReads.value, 0);
});
