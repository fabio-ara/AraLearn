import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ArtifactAuthoringEngine
} from "../../supabase/functions/_shared/aralearn-authoring/artifactAuthoringEngine.js";
import {
  ArtifactStore
} from "../../supabase/functions/_shared/aralearn-authoring/artifactStore.js";
import {
  ArtifactGarbageCollector
} from "../../supabase/functions/_shared/aralearn-authoring/artifactGarbageCollector.js";
import {
  canonicalJsonStringify
} from "../../supabase/functions/_shared/aralearn-authoring/canonicalJson.js";
import {
  createCourseRevisionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/courseRevisionHandler.js";
import {
  LEDGER_CHUNK_BODY_LIMIT,
  MANUAL_IMPORT_BODY_LIMIT,
  PART_FRAGMENT_LIMIT,
  PART_SPECIFICATION_LIMIT,
  PLAN_BODY_LIMIT,
  STANDARD_BODY_LIMIT
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";
import {
  canonicalRevisionHash,
  canonicalRevisionString
} from "../../src/storage/canonicalRevision.js";
import {
  RelationalSyncEngine
} from "../../src/sync/RelationalSyncEngine.js";
import {
  createExampleProjectDocument
} from "../support/exampleProjectDocument.js";

function memoryStorageFetch() {
  const objects = new Map();
  let uploads = 0;
  const fetchImpl = async (url, init = {}) => {
    const key = String(url).replace(/^.*\/storage\/v1\/object\//u, "");
    if (init.method === "POST") {
      uploads += 1;
      if (objects.has(key)) return new Response("Asset Already Exists", { status: 400 });
      objects.set(key, new Uint8Array(init.body));
      return new Response("{}", { status: 200 });
    }
    if (init.method === "HEAD") {
      return new Response(null, { status: objects.has(key) ? 200 : 404 });
    }
    if (init.method === "GET") {
      const body = objects.get(key);
      return body
        ? new Response(body, { status: 200 })
        : new Response(null, { status: 404 });
    }
    throw new Error(`Método inesperado: ${init.method}`);
  };
  return { fetchImpl, objects, get uploads() { return uploads; } };
}

test("transporte e ArtifactStore não impõem tetos locais de volume", async () => {
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    fetchImpl: memoryStorageFetch().fetchImpl
  });
  assert.equal(store.maxArtifactBytes, Number.POSITIVE_INFINITY);
  for (const limit of [
    STANDARD_BODY_LIMIT,
    PLAN_BODY_LIMIT,
    MANUAL_IMPORT_BODY_LIMIT,
    PART_FRAGMENT_LIMIT,
    PART_SPECIFICATION_LIMIT,
    LEDGER_CHUNK_BODY_LIMIT
  ]) {
    assert.equal(limit, Number.POSITIVE_INFINITY);
  }
  const mcpSource = await readFile(
    new URL("../../supabase/functions/_shared/aralearn-authoring/mcpServer.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(mcpSource, /MAX_MCP_BODY_BYTES|payload_too_large/u);
});

test("JSON canônico preserva conteúdo, ordena chaves e rejeita valores ambíguos", () => {
  assert.equal(
    canonicalJsonStringify({ z: [3, { b: true, a: "á" }], a: -0 }),
    '{"a":-0,"z":[3,{"a":"á","b":true}]}'
  );
  assert.throws(
    () => canonicalJsonStringify({ valid: true, absent: undefined }),
    /undefined/u
  );
  assert.throws(() => canonicalJsonStringify({ value: Number.NaN }), /não finito/u);
});

test("Edge e aplicativo calculam os mesmos bytes e o mesmo hash da revisão", async () => {
  const document = createExampleProjectDocument();
  assert.equal(canonicalJsonStringify(document), canonicalRevisionString(document));
  assert.equal(
    await canonicalRevisionHash(document),
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalJsonStringify(document))
    ).then((digest) => [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0")).join(""))
  );
});

test("ArtifactStore grava uma vez, reutiliza por SHA-256 e confere a leitura", async () => {
  const memory = memoryStorageFetch();
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    fetchImpl: memory.fetchImpl
  });
  const first = await store.putJson({ title: "Curso", nested: { value: 1 } }, {
    artifactType: "aralearn.test"
  });
  const second = await store.putJson({ nested: { value: 1 }, title: "Curso" }, {
    artifactType: "aralearn.test"
  });

  assert.equal(first.hash, second.hash);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(memory.objects.size, 1);
  assert.deepEqual(await store.getJson(first), {
    nested: { value: 1 },
    title: "Curso"
  });
});

test("Storage não envia chave sb_secret_ como Bearer", async () => {
  const requests = [];
  const store = new ArtifactStore({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "sb_secret_producao",
    fetchImpl: async (_url, init = {}) => {
      requests.push(init);
      return Response.json({ Key: "artifact" });
    }
  });

  await store.putJson({ title: "Curso" }, { artifactType: "aralearn.test" });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers.apikey, "sb_secret_producao");
  assert.equal(requests[0].headers.Authorization, undefined);
});

test("requisições concorrentes iguais adquirem uma única lease e fazem um upload", async () => {
  const memory = memoryStorageFetch();
  const engine = new ArtifactAuthoringEngine({
    rpc: async () => {
      throw new Error("RPC inesperada");
    },
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    fetchImpl: memory.fetchImpl,
    leaseTokenFactory: () => crypto.randomUUID(),
    logger: () => {}
  });
  let acquired = false;
  let commits = 0;
  engine.control = {
    async beginRequest() {
      if (acquired) {
        return {
          status: "running",
          leaseAcquired: false,
          idempotent: true,
          pollAfterSeconds: 2
        };
      }
      acquired = true;
      return { status: "running", leaseAcquired: true };
    },
    async commitTransition() {
      commits += 1;
      return {
        runId: "10000000-0000-4000-8000-000000000001",
        publicationTarget: "private",
        status: "planning",
        parts: [],
        artifacts: []
      };
    },
    async failRequest() {
      throw new Error("não deveria falhar");
    }
  };
  const command = {
    principal: { actorId: "20000000-0000-4000-8000-000000000001", clientId: null },
    requestId: "request.concurrent.001",
    runId: "10000000-0000-4000-8000-000000000001",
    command: "create_run",
    payload: {
      publicationTarget: "private",
      title: "Curso",
      contractKey: "curso",
      brief: { goal: "Aprender" }
    }
  };
  const results = await Promise.all([
    engine.command(command),
    engine.command(command),
    engine.command(command)
  ]);

  assert.equal(commits, 1);
  assert.equal(memory.uploads, 1);
  assert.equal(results.filter((result) => result.status === "running").length, 2);
});

test("upload do ledger devolve o mesmo recibo na gravação e no replay", async () => {
  const memory = memoryStorageFetch();
  const engine = new ArtifactAuthoringEngine({
    rpc: async () => null,
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    fetchImpl: memory.fetchImpl,
    logger: () => {}
  });
  let persisted;
  let first = true;
  engine.control = {
    async beginRequest() {
      if (first) {
        first = false;
        return { status: "running", leaseAcquired: true };
      }
      return { status: "succeeded", leaseAcquired: false };
    },
    async commitTransition({ artifacts }) {
      persisted = {
        runId: "10000000-0000-4000-8000-000000000001",
        status: "planning",
        parts: [],
        artifacts
      };
      return persisted;
    },
    async getRun() {
      return persisted;
    },
    async failRequest() {
      throw new Error("não deveria falhar");
    }
  };
  const command = {
    principal: { actorId: "20000000-0000-4000-8000-000000000001", clientId: null },
    requestId: "request.ledger.001",
    runId: "10000000-0000-4000-8000-000000000001",
    command: "put_ledger_chunk",
    payload: {
      planHash: "a".repeat(64),
      section: "sources",
      position: 0,
      items: [{ sourceId: "a" }, { sourceId: "b" }]
    }
  };

  const stored = await engine.command(command);
  const replayed = await engine.command(command);

  assert.equal(stored.itemCount, 2);
  assert.match(stored.contentHash, /^[a-f0-9]{64}$/u);
  assert.equal(replayed.itemCount, 2);
  assert.equal(replayed.contentHash, stored.contentHash);
  assert.equal(replayed.idempotent, true);
  assert.equal(memory.uploads, 1);
});

test("progresso do ledger usa contagens do controle sem baixar chunks", async () => {
  const planHash = "a".repeat(64);
  const engine = new ArtifactAuthoringEngine({
    rpc: async () => null,
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    logger: () => {}
  });
  engine.control = {
    async getRun() {
      return {
        runId: "10000000-0000-4000-8000-000000000001",
        status: "planning",
        planHash,
        parts: [],
        artifacts: [{
          role: "plan",
          hash: planHash
        }, {
          role: "ledger:sources:0",
          hash: "b".repeat(64),
          itemCount: 2
        }, {
          role: "ledger:terms:1",
          hash: "c".repeat(64),
          itemCount: 1
        }]
      };
    }
  };
  let reads = 0;
  engine.artifacts = {
    async getManyJson(references) {
      reads += references.length;
      return references.map(() => ({
        ledgerManifest: {
          sections: {
            sources: { chunkCount: 1, itemCount: 2 },
            claims: { chunkCount: 1, itemCount: 3 },
            terms: { chunkCount: 2, itemCount: 4 }
          }
        },
        parts: []
      }));
    }
  };

  const run = await engine.getNextPart({
    principal: { actorId: "20000000-0000-4000-8000-000000000001" },
    runId: "10000000-0000-4000-8000-000000000001"
  });

  assert.equal(reads, 1);
  assert.deepEqual(run.ledgerProgress, {
    sources: {
      expectedChunks: 1,
      expectedItems: 2,
      receivedChunks: 1,
      receivedItems: 2,
      missingPositions: []
    },
    claims: {
      expectedChunks: 1,
      expectedItems: 3,
      receivedChunks: 0,
      receivedItems: 0,
      missingPositions: [0]
    },
    terms: {
      expectedChunks: 2,
      expectedItems: 4,
      receivedChunks: 1,
      receivedItems: 1,
      missingPositions: [0]
    }
  });
});

test("continuidade causal é reconstruída somente dos artefatos aprovados", async () => {
  const hash = (character) => character.repeat(64);
  const descriptor = (value, role, partKey = null, attempt = null) => ({
    hash: hash(value),
    bucket: "aralearn-authoring-artifacts",
    objectKey: `artifacts/sha256/${value}${value}/${value}${value}/${hash(value)}.json`,
    artifactType: "aralearn.test",
    mediaType: "application/json",
    sizeBytes: 1,
    role,
    ...(partKey ? { partKey } : {}),
    ...(attempt ? { attempt } : {})
  });
  const artifacts = [
    descriptor("a", "brief"),
    descriptor("b", "plan"),
    descriptor("c", "specification", "parte-a"),
    descriptor("d", "state_delta", "parte-a", 1),
    descriptor("e", "specification", "parte-b")
  ];
  const values = new Map([
    [hash("a"), { goal: "Aprender" }],
    [hash("b"), {
      parts: [
        { key: "parte-a", title: "A" },
        { key: "parte-b", title: "B", dependsOnPartKeys: ["parte-a"] }
      ]
    }],
    [hash("c"), {
      ownership: { microsequenceIds: ["micro-a"] },
      cardPlan: [{
        learningFunction: "foundation",
        microsequenceId: "micro-a",
        operationId: "operacao-a",
        conceptIds: ["conceito-a"],
        retrievedConceptIds: []
      }]
    }],
    [hash("d"), {
      introducedTermIds: ["termo-a"],
      usedClaimIds: ["afirmacao-a"],
      coveredOutcomeIds: ["resultado-a"],
      resolvedErrorIds: [],
      notes: ["aprovado"]
    }],
    [hash("e"), { key: "parte-b", cardPlan: [] }]
  ]);
  const engine = new ArtifactAuthoringEngine({
    rpc: async () => null,
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    logger: () => {}
  });
  engine.control = {
    async getRun() {
      return {
        runId: "10000000-0000-4000-8000-000000000001",
        status: "building",
        currentPartKey: "parte-b",
        parts: [
          {
            partKey: "parte-a",
            position: 0,
            status: "approved",
            attempt: 1,
            dependsOnPartKeys: [],
            fragmentHash: hash("f")
          },
          {
            partKey: "parte-b",
            position: 1,
            status: "building",
            attempt: 1,
            dependsOnPartKeys: ["parte-a"]
          }
        ],
        artifacts
      };
    }
  };
  engine.artifacts = {
    async getManyJson(references) {
      return references.map((reference) => structuredClone(values.get(reference.hash)));
    }
  };

  const run = await engine.getNextPart({
    principal: { actorId: "20000000-0000-4000-8000-000000000001" },
    runId: "10000000-0000-4000-8000-000000000001"
  });
  assert.deepEqual(run.continuity.approvedParts, [{
    partKey: "parte-a",
    fragmentHash: hash("f")
  }]);
  assert.deepEqual(run.continuity.stateDelta.introducedTermIds, ["termo-a"]);
  assert.deepEqual(run.continuity.workedOperations, [{
    operationId: "operacao-a",
    microsequenceId: "micro-a"
  }]);
  assert.deepEqual(run.continuity.introducedConcepts, [{
    conceptId: "conceito-a",
    microsequenceId: "micro-a"
  }]);
  assert.match(run.continuity.stateHash, /^[a-f0-9]{64}$/u);
});

test("reparo relê a submissão e o delta da tentativa persistida anterior", async () => {
  const descriptor = (hash, role) => ({
    hash,
    bucket: "aralearn-authoring-artifacts",
    objectKey: `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`,
    artifactType: "aralearn.test",
    mediaType: "application/json",
    sizeBytes: 1,
    role,
    partKey: "parte-a",
    attempt: 1
  });
  const submission = descriptor("a".repeat(64), "submission");
  const delta = descriptor("b".repeat(64), "state_delta");
  const engine = new ArtifactAuthoringEngine({
    rpc: async () => null,
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    logger: () => {}
  });
  engine.control = {
    async getRun() {
      return {
        parts: [{
          partKey: "parte-a",
          status: "building",
          attempt: 2,
          fragmentHash: "c".repeat(64)
        }],
        artifacts: [submission, delta]
      };
    }
  };
  engine.artifacts = {
    async getManyJson() {
      return [{ fragment: { id: "persistido" } }, { introducedTermIds: ["termo-a"] }];
    }
  };

  const result = await engine.getPartSubmission({
    principal: { actorId: "20000000-0000-4000-8000-000000000001" },
    runId: "10000000-0000-4000-8000-000000000001",
    partKey: "parte-a"
  });
  assert.equal(result.attempt, 1);
  assert.deepEqual(result.stateDelta, { introducedTermIds: ["termo-a"] });
});

test("garbage collector restaura metadados quando o objeto ainda existe", async () => {
  const calls = [];
  const artifact = {
    hash: "a".repeat(64),
    bucket: "aralearn-authoring-artifacts",
    objectKey: `artifacts/sha256/aa/aa/${"a".repeat(64)}.json`,
    sizeBytes: 10
  };
  const collector = new ArtifactGarbageCollector({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "release_expired_authoring_artifact_links_v3") {
        return { releasedLinks: 3 };
      }
      return name === "claim_unreferenced_artifacts_v3" ? [artifact] : { completed: true };
    },
    fetchImpl: async (_url, init) => new Response(null, {
      status: init.method === "DELETE" ? 503 : 200
    })
  });
  const result = await collector.collect();

  assert.deepEqual(result, {
    status: "completed",
    releasedLinks: 3,
    claimed: 1,
    deleted: 0
  });
  assert.equal(calls[0].name, "release_expired_authoring_artifact_links_v3");
  assert.equal(calls.at(-1).name, "complete_artifact_gc_v3");
  assert.equal(calls.at(-1).payload.p_object_absent, false);
});

test("migration v3 mantém corpos JSON fora do plano de controle", async () => {
  const sql = await readFile(
    new URL("../../supabase/migrations/20260728010000_storage_artifact_control_plane.sql", import.meta.url),
    "utf8"
  );
  const runTable = sql.match(
    /create table private\.authoring_runs \(([\s\S]*?)\n\);/u
  )?.[1] || "";
  const partTable = sql.match(
    /create table private\.authoring_parts \(([\s\S]*?)\n\);/u
  )?.[1] || "";

  assert.doesNotMatch(runTable, /\b(plan|assembled_document|validation_report|brief)\s+jsonb/iu);
  assert.doesNotMatch(partTable, /\b(specification|fragment|submission|audit)\s+jsonb/iu);
  assert.match(sql, /create table private\.artifact_refs/u);
  assert.match(sql, /create table private\.authoring_requests/u);
  assert.doesNotMatch(sql, /authoring_requests_one_running_owner_v3_idx/u);
  assert.match(sql, /authoring_requests_one_running_run_v3_idx/u);
  assert.match(sql, /aralearn-course-revisions/u);
  assert.match(sql, /drop constraint if exists lesson_progress_lesson_fk/iu);
  assert.match(sql, /drop constraint if exists card_progress_card_fk/iu);
  assert.match(sql, /drop constraint if exists card_comments_card_fk/iu);
  assert.doesNotMatch(sql, /contract_to_relational|jsonb_to_recordset/iu);
  assert.doesNotMatch(sql, /public\.course_kind|public\.course_memberships/iu);
  assert.match(sql, /insert into public\.user_course_selections/iu);
  assert.match(
    sql,
    /\(v_run\.target = 'private' and owner_id = v_run\.owner_id\)[\s\S]+v_run\.target = 'catalog' and owner_id is null/iu
  );
  const revisionLookup = sql.match(
    /create or replace function public\.get_course_revision_artifact_v3\([\s\S]*?\n\$\$;/iu
  )?.[0] || "";
  assert.doesNotMatch(revisionLookup, /current_revision_hash\s*=\s*p_revision_hash/iu);
  assert.match(revisionLookup, /revision\.published_at is not null/iu);
});

test("corte final remove a árvore pedagógica e os fluxos relacionais de autoria", async () => {
  const sql = await readFile(
    new URL("../../supabase/migrations/20260728020000_remove_relational_course_legacy.sql", import.meta.url),
    "utf8"
  );
  for (const table of [
    "modules",
    "lessons",
    "cards",
    "card_blocks",
    "flow_nodes",
    "learning_components"
  ]) {
    assert.match(sql, new RegExp(`drop table if exists public\\.${table} cascade`, "u"));
  }
  for (const table of [
    "catalog_course_submissions",
    "course_content_revisions",
    "official_catalog_imports"
  ]) {
    assert.match(sql, new RegExp(`drop table if exists private\\.${table} cascade`, "u"));
  }
  assert.match(sql, /course\.module_count/u);
  assert.match(sql, /course\.lesson_count/u);
  assert.doesNotMatch(
    sql.match(/create or replace function public\.apply_sync_batch[\s\S]*?\n\$\$;/u)?.[0] || "",
    /modules|lessons|cards|card_blocks|flow_nodes/iu
  );
});

test("endpoint de revisão autentica, autoriza e relê o objeto privado pelo hash", async () => {
  const document = createExampleProjectDocument();
  const source = canonicalJsonStringify(document);
  const bytes = new TextEncoder().encode(source);
  const hash = await canonicalRevisionHash(document);
  const courseId = "10000000-0000-4000-8000-000000000001";
  const objectKey = `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
  const descriptor = {
    hash,
    bucket: "aralearn-course-revisions",
    objectKey,
    artifactType: "aralearn.contract",
    mediaType: "application/json",
    sizeBytes: bytes.byteLength
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.endsWith("/auth/v1/user")) {
      return Response.json({ id: "20000000-0000-4000-8000-000000000001" });
    }
    if (target.endsWith("/rest/v1/rpc/get_course_revision_artifact_v3")) {
      return Response.json(descriptor);
    }
    if (target.includes("/storage/v1/object/")) return new Response(bytes);
    throw new Error(`URL inesperada: ${target}`);
  };
  const handler = createCourseRevisionHandler({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: "service-role",
    publishableKey: "publishable",
    fetchImpl
  });
  const response = await handler(new Request(
    `https://project.supabase.co/functions/v1/aralearn-course-revisions/${courseId}/${hash}`,
    { headers: { Authorization: "Bearer user-jwt" } }
  ));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-aralearn-revision-hash"), hash);
  assert.deepEqual(await response.json(), document);
});

test("sincronização baixa revisão ausente, valida o hash e só então substitui IndexedDB", async () => {
  const document = createExampleProjectDocument();
  const hash = await canonicalRevisionHash(document);
  const courseId = "30000000-0000-4000-8000-000000000001";
  let downloads = 0;
  let storedState = null;
  const store = {
    async listPendingOutbox() { return []; },
    async applyRemotePage() {},
    async pruneOfficialCourseReplicas() {},
    async get(storeName) {
      return storeName === "courses" && storedState ? { id: courseId } : null;
    },
    async getOfficialCourseReplicaState() {
      return storedState;
    },
    async replaceOfficialCourseReplica(id, graph, metadata) {
      assert.equal(id, courseId);
      assert.ok(graph.cards.length > 0);
      assert.equal(metadata.contentHash, hash);
      storedState = metadata;
    }
  };
  const transport = {
    async applySyncBatch() { return { results: [] }; },
    async pullSyncChanges() { return { changes: [] }; },
    async downloadCourseRevision() {
      downloads += 1;
      return structuredClone(document);
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: crypto.randomUUID() });
  const manifest = [{ courseId, publicationSeq: 1, contentHash: hash }];

  assert.equal(await engine.reconcileSelectedCourseReplicas(manifest), 1);
  assert.equal(await engine.reconcileSelectedCourseReplicas(manifest), 0);
  assert.equal(downloads, 1);
});

test("revisão imutável ausente não recorre à árvore relacional remota", async () => {
  const document = createExampleProjectDocument();
  const hash = await canonicalRevisionHash(document);
  const store = {
    async listPendingOutbox() { return []; },
    async applyRemotePage() {},
    async pruneOfficialCourseReplicas() {},
    async get() { return null; },
    async getOfficialCourseReplicaState() { return null; }
  };
  const transport = {
    async applySyncBatch() { return { results: [] }; },
    async pullSyncChanges() { return { changes: [] }; },
    async downloadCourseRevision() {
      throw Object.assign(new Error("Revisão ausente"), {
        status: 404,
        code: "revision_not_found"
      });
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: crypto.randomUUID() });

  await assert.rejects(
    engine.reconcileSelectedCourseReplicas([{
      courseId: "30000000-0000-4000-8000-000000000001",
      publicationSeq: 1,
      contentHash: hash
    }])
  );
});
