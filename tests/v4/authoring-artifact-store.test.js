import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactStore,
  MAX_ARTIFACT_BYTES
} from "../../supabase/functions/_shared/aralearn-authoring/artifactStore.js";

const REFERENCE = Object.freeze({
  hash: "a".repeat(64),
  bucket: "aralearn-authoring-artifacts",
  objectKey: `artifacts/sha256/aa/aa/${"a".repeat(64)}.json`,
  sizeBytes: 2
});

test("Storage respeita o prazo do MCP durante o download do corpo", async () => {
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    requestTimeoutMs: 20,
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener("abort", () => controller.error(new Error("abortado")));
      }
    }))
  });

  await assert.rejects(
    () => store.getJson(REFERENCE),
    (error) => error?.code === "artifact_timeout"
  );
});

test("prazo já encerrado falha antes de abrir conexão com o Storage", async () => {
  let fetched = false;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async () => {
      fetched = true;
      return new Response("{}");
    }
  });

  await assert.rejects(
    () => store.getJson(REFERENCE, { deadlineAt: Date.now() - 1 }),
    (error) => error?.code === "artifact_timeout"
  );
  assert.equal(fetched, false);
});

test("referência fora do namespace imutável é recusada sem usar a chave administrativa", async () => {
  let fetched = false;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async () => {
      fetched = true;
      return new Response("{}");
    }
  });
  await assert.rejects(
    () => store.getJson({
      ...REFERENCE,
      objectKey: "outro/arquivo.json"
    }),
    (error) => error?.code === "invalid_artifact_reference"
  );
  assert.equal(fetched, false);
});

test("upload retomável não encaminha credenciais para Location de outra origem", async () => {
  let calls = 0;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async (_url, init) => {
      calls += 1;
      if (init.method === "HEAD") return new Response(null, { status: 404 });
      return new Response(null, {
        status: 201,
        headers: { Location: "https://hostile.example/upload/steal" }
      });
    }
  });
  await assert.rejects(
    () => store.putJson(
      { value: "x".repeat(6 * 1024 * 1024) },
      { artifactType: "aralearn.authoring-workspace" }
    ),
    (error) => error?.code === "invalid_resumable_upload_location"
  );
  assert.equal(calls, 3);
});

test("hash já existente no outro bucket é reutilizado sem duplicar o objeto", async () => {
  const calls = [];
  let registered = null;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      return new Response(null, {
        status: String(url).includes("/aralearn-authoring-artifacts/")
          ? 404
          : 200
      });
    }
  });
  const descriptor = await store.putJson(
    {},
    {
      artifactType: "aralearn.authoring-workspace",
      bucket: "aralearn-authoring-artifacts",
      async registerReference(reference) {
        registered = reference;
      }
    }
  );
  assert.equal(descriptor.bucket, "aralearn-course-revisions");
  assert.equal(descriptor.reused, true);
  assert.equal(registered.bucket, "aralearn-course-revisions");
  assert.equal(registered.hash, descriptor.hash);
  assert.equal(registered.reused, true);
  assert.deepEqual(calls.map(({ method }) => method), ["HEAD", "HEAD"]);
});

test("bucket solicitado vence quando o mesmo hash existe nos dois buckets", async () => {
  const calls = [];
  let registered = null;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      return new Response(null, { status: 200 });
    }
  });

  const descriptor = await store.putJson(
    {},
    {
      artifactType: "aralearn.course-revision",
      bucket: "aralearn-course-revisions",
      async registerReference(reference) {
        registered = reference;
      }
    }
  );

  assert.equal(descriptor.bucket, "aralearn-course-revisions");
  assert.equal(descriptor.reused, true);
  assert.equal(registered.bucket, "aralearn-course-revisions");
  assert.deepEqual(calls.map(({ method }) => method), ["HEAD"]);
});

test("referência é registrada antes de qualquer upload e uma falha não envia o objeto", async () => {
  const events = [];
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async (_url, init) => {
      events.push(init.method);
      if (init.method === "HEAD") return new Response(null, { status: 404 });
      return new Response(null, { status: 201 });
    }
  });

  const descriptor = await store.putJson(
    { title: "Curso" },
    {
      artifactType: "aralearn.course-revision",
      bucket: "aralearn-course-revisions",
      async registerReference(reference) {
        events.push(`REGISTER:${reference.bucket}:${reference.reused}`);
      }
    }
  );
  assert.equal(descriptor.reused, false);
  assert.deepEqual(events, [
    "HEAD",
    "HEAD",
    "REGISTER:aralearn-course-revisions:false",
    "POST"
  ]);

  events.length = 0;
  await assert.rejects(
    () => store.putJson(
      { title: "Outro curso" },
      {
        artifactType: "aralearn.course-revision",
        bucket: "aralearn-course-revisions",
        async registerReference() {
          events.push("REGISTER");
          throw new Error("registro recusado");
        }
      }
    ),
    /registro recusado/u
  );
  assert.deepEqual(events, ["HEAD", "HEAD", "REGISTER"]);
});

test("upload aceita o limite de 32 MiB e recusa o byte seguinte antes da rede", async () => {
  let calls = 0;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async () => {
      calls += 1;
      throw new Error("interrompe depois da guarda de tamanho");
    }
  });

  await assert.rejects(
    () => store.putJson(
      "x".repeat(MAX_ARTIFACT_BYTES - 2),
      { artifactType: "aralearn.authoring-workspace" }
    ),
    (error) => error?.code === "storage_unavailable"
  );
  assert.equal(calls, 1);

  await assert.rejects(
    () => store.putJson(
      "x".repeat(MAX_ARTIFACT_BYTES - 1),
      { artifactType: "aralearn.authoring-workspace" }
    ),
    (error) => error?.code === "artifact_too_large"
      && error?.details?.sizeBytes === MAX_ARTIFACT_BYTES + 1
  );
  assert.equal(calls, 1);
});

test("download recusa 32 MiB + 1 por metadado sem abrir conexão", async () => {
  let fetched = false;
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async () => {
      fetched = true;
      return new Response("{}");
    }
  });
  await assert.rejects(
    () => store.getJson({ ...REFERENCE, sizeBytes: MAX_ARTIFACT_BYTES + 1 }),
    (error) => error?.code === "artifact_too_large"
  );
  assert.equal(fetched, false);
});

test("download confere Content-Length e bytes mesmo com referência dentro do teto", async () => {
  const byHeader = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    fetchImpl: async () => new Response(null, {
      status: 200,
      headers: { "Content-Length": String(MAX_ARTIFACT_BYTES + 1) }
    })
  });
  await assert.rejects(
    () => byHeader.getJson({ ...REFERENCE, sizeBytes: MAX_ARTIFACT_BYTES }),
    (error) => error?.code === "artifact_too_large"
  );

  const byBody = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "server-secret",
    maxArtifactBytes: 2,
    fetchImpl: async () => {
      const response = new Response("123");
      response.headers.delete("content-length");
      return response;
    }
  });
  await assert.rejects(
    () => byBody.getJson(REFERENCE),
    (error) => error?.code === "artifact_too_large"
  );
});
