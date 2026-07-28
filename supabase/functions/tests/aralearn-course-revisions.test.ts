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
  version: 3,
  courses: []
};
const bytes = new TextEncoder().encode(canonicalJsonStringify(document));
const digest = await crypto.subtle.digest("SHA-256", bytes);
const hash = [...new Uint8Array(digest)]
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");
const objectKey = `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;

function handler() {
  return createCourseRevisionHandler({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    publishableKey: "publishable",
    fetchImpl: async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith("/auth/v1/user")) return Response.json({ id: actorId });
      if (target.endsWith("/rest/v1/rpc/get_course_revision_artifact_v3")) {
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

Deno.test("entrega de revisão exige uma sessão", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`
  ));
  assertEquals(response.status, 401);
});

Deno.test("entrega de revisão autoriza e confere o artefato privado", async () => {
  const response = await handler()(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    { headers: { Authorization: "Bearer user-jwt" } }
  ));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("x-aralearn-revision-hash"), hash);
  assertEquals(await response.json(), JSON.parse(canonicalJsonStringify(document)));
});
