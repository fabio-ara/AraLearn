import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { prepareCourseDocument } from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import { AuthoringWorkspaceEngine } from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import {
  composeWorkspaceDocument,
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";
import { validateWorkspacePublishPayload } from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const PRINCIPAL = {
  actorId: "11111111-1111-4111-8111-111111111111",
  authenticationKind: "oauth"
};
const REVIEWER = {
  actorId: "55555555-5555-4555-8555-555555555555",
  authenticationKind: "oauth"
};
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_COURSE_ID = "33333333-3333-4333-8333-333333333333";
const SUBMISSION_ID = "44444444-4444-4444-8444-444444444444";

async function fixture() {
  return JSON.parse(await readFile(
    new URL("../../docs/examples/aralearn-contract.logic-plane-matrix-course.json", import.meta.url),
    "utf8"
  ));
}

function engineWithRpc(rpc) {
  return new AuthoringWorkspaceEngine({
    rpc,
    supabaseUrl: "https://project.example",
    serverApiKey: "server-secret"
  });
}

function workspaceReference(document, revision = 1) {
  const entities = flattenWorkspaceDocument(document).map((row, index) => ({
    ...row,
    version: index + 1
  }));
  return {
    workspaceId: WORKSPACE_ID,
    title: "Workspace composto",
    revision,
    currentRevision: revision,
    entityCount: entities.length,
    sourceCourseId: null,
    sourceRevisionHash: null,
    publications: [],
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    idempotent: false,
    brief: "",
    entities
  };
}

function assertLeanRows(rows) {
  const forbidden = [
    "courses",
    "modules",
    "lessons",
    "topics",
    "microsequences",
    "cards"
  ];
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(Object.hasOwn(row, "artifact"), false);
    assert.equal(Object.hasOwn(row, "snapshot"), false);
    for (const field of forbidden) {
      assert.equal(
        Object.hasOwn(row.content, field),
        false,
        `${row.entityType}:${row.entityId} não deve incorporar ${field}`
      );
    }
  }
}

test("create recupera replay v5 antes de resolver a origem", async () => {
  const recovered = { workspaceId: WORKSPACE_ID, revision: 4, idempotent: true };
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "replay_authoring_workspace_request_v5") return recovered;
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("a origem não deveria ser lida após replay");
    },
    async putJson() {
      throw new Error("workspace não deve gerar artefato");
    }
  };

  const result = await engine.create({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "create-replay-0001",
    title: "Curso",
    sourceCourseId: SOURCE_COURSE_ID
  });

  assert.deepEqual(result, recovered);
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5"
  ]);
  assert.equal(calls[0].payload.p_operation, "create");
});

test("import recupera replay v5 antes de ler workspace ou curso", async () => {
  const recovered = { workspaceId: WORKSPACE_ID, revision: 7, idempotent: true };
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "replay_authoring_workspace_request_v5") return recovered;
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("curso não deveria ser lido após replay");
    }
  };

  const result = await engine.importCourse({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "import-replay-0001",
    expectedRevision: 6,
    courseId: SOURCE_COURSE_ID,
    workspaceCourseId: "course-imported"
  });

  assert.deepEqual(result, recovered);
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5"
  ]);
  assert.equal(calls[0].payload.p_operation, "import_course");
});

test("mutação renomeia uma entidade com um único upsert e sem snapshot", async () => {
  const source = await fixture();
  const reference = workspaceReference(source, 8);
  let committed = null;
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push(name);
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") return reference;
    if (name === "commit_authoring_workspace_changes_v5") {
      committed = payload;
      return { workspaceId: WORKSPACE_ID, revision: 9, idempotent: false };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("workspace composto não deve abrir Storage");
    },
    async putJson() {
      throw new Error("mutação não deve criar artefato");
    }
  };
  const courseId = source.courses[0].id;

  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "rename-composed-0001",
    expectedRevision: 8,
    operation: "rename_entity",
    arguments: {
      entityType: "course",
      entityPath: [courseId],
      title: "Curso lógico revisado"
    }
  });

  assert.deepEqual(calls, [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5",
    "commit_authoring_workspace_changes_v5"
  ]);
  assert.equal(committed.p_operation, "rename_entity");
  assert.deepEqual(committed.p_changes.deletes, []);
  assert.equal(committed.p_changes.upserts.length, 1);
  assert.deepEqual(
    {
      entityType: committed.p_changes.upserts[0].entityType,
      entityId: committed.p_changes.upserts[0].entityId,
      title: committed.p_changes.upserts[0].content.title
    },
    {
      entityType: "course",
      entityId: courseId,
      title: "Curso lógico revisado"
    }
  );
  assert.equal(committed.p_changes.upserts[0].version, 2);
  assertLeanRows(committed.p_changes.upserts);
  assert.deepEqual(committed.p_summary, {
    created: 0,
    updated: 1,
    deleted: 0,
    targetPath: [courseId],
    entityType: "course"
  });
  assert.equal(Object.hasOwn(committed, "p_artifact"), false);
  assert.equal(Object.hasOwn(committed, "p_document"), false);
});

test("novo card.sources exige declaração explícita no brief corrente", async () => {
  const source = await fixture();
  const course = source.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const card = microsequence.cards[0];
  const cardPath = [
    course.id, moduleValue.id, lesson.id, microsequence.id, card.id
  ];
  const replacement = {
    ...structuredClone(card),
    sources: ["fgv-prova-2024"]
  };
  const rejectedCalls = [];
  const rejectedEngine = engineWithRpc(async (name) => {
    rejectedCalls.push(name);
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 8);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  await assert.rejects(
    () => rejectedEngine.mutate({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      requestId: "source-rejected-0001",
      expectedRevision: 8,
      operation: "save_card",
      arguments: { cardPath, card: replacement }
    }),
    (error) => error?.code === "workspace_source_unauthorized"
      && error.details?.sourceIds?.[0] === "fgv-prova-2024"
      && error.details?.errors?.[0]?.reason === "source_not_declared"
  );
  assert.deepEqual(rejectedCalls, [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5"
  ]);

  const acceptedReference = workspaceReference(source, 8);
  acceptedReference.brief = [
    "Preparação para concurso.",
    "[source:fgv-prova-2024] Prova FGV fornecida pelo usuário."
  ].join("\n");
  let committed = null;
  const acceptedEngine = engineWithRpc(async (name, payload) => {
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") return acceptedReference;
    if (name === "commit_authoring_workspace_changes_v5") {
      committed = payload;
      return { workspaceId: WORKSPACE_ID, revision: 9, idempotent: false };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  await acceptedEngine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "source-accepted-0001",
    expectedRevision: 8,
    operation: "save_card",
    arguments: { cardPath, card: replacement }
  });
  const cardChange = committed.p_changes.upserts.find(
    (change) => change.entityType === "card" && change.entityId === card.id
  );
  assert.deepEqual(
    cardChange.content.sources,
    ["fgv-prova-2024"]
  );
});

test("append confirma no resumo que posições foram normalizadas", async () => {
  const source = await fixture();
  const course = source.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const appendedCard = {
    ...structuredClone(microsequence.cards[0]),
    id: "card-appended-summary",
    position: 1,
    sources: []
  };
  let committed = null;
  const engine = engineWithRpc(async (name, payload) => {
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 8);
    }
    if (name === "commit_authoring_workspace_changes_v5") {
      committed = payload;
      return { workspaceId: WORKSPACE_ID, revision: 9, idempotent: false };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  await engine.mutate({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "append-summary-0001",
    expectedRevision: 8,
    operation: "save_microsequence_cards",
    arguments: {
      microsequencePath: [
        course.id, moduleValue.id, lesson.id, microsequence.id
      ],
      mode: "append",
      status: "generated",
      cards: [appendedCard]
    }
  });

  assert.equal(committed.p_summary.mode, "append");
  assert.equal(committed.p_summary.submittedCardCount, 1);
  assert.equal(committed.p_summary.positionsNormalized, true);
  const cardChange = committed.p_changes.upserts.find(
    (change) => change.entityId === appendedCard.id
  );
  assert.equal(
    cardChange.position,
    microsequence.cards.length + 1
  );
});

test("import registra intenção própria e envia somente rows novas", async () => {
  const source = await fixture();
  const empty = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: []
  };
  let committed = null;
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push(name);
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(empty, 2);
    }
    if (name === "get_course_document_artifact_v4") {
      return {
        artifact: { hash: "source-course" },
        revisionHash: "a".repeat(64)
      };
    }
    if (name === "commit_authoring_workspace_changes_v5") {
      committed = payload;
      return { workspaceId: WORKSPACE_ID, revision: 3, idempotent: false };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson(descriptor) {
      assert.equal(descriptor.hash, "source-course");
      return source;
    },
    async putJson() {
      throw new Error("importação não deve materializar workspace no Storage");
    }
  };

  await engine.importCourse({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "import-course-0001",
    expectedRevision: 2,
    courseId: SOURCE_COURSE_ID,
    workspaceCourseId: "course-imported"
  });

  assert.deepEqual(calls, [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5",
    "get_course_document_artifact_v4",
    "commit_authoring_workspace_changes_v5"
  ]);
  assert.equal(committed.p_operation, "import_course");
  assert.deepEqual(committed.p_changes.deletes, []);
  assertLeanRows(committed.p_changes.upserts);
  const imported = composeWorkspaceDocument([
    ...workspaceReference(empty, 2).entities,
    ...committed.p_changes.upserts
  ]);
  assert.equal(imported.courses[0].id, "course-imported");
  assert.notEqual(
    imported.courses[0].modules[0].id,
    source.courses[0].modules[0].id
  );
  assert.match(imported.courses[0].modules[0].id, /^course-imported--module-/u);
  assert.equal(committed.p_summary.created, committed.p_changes.upserts.length);
  assert.equal(Object.hasOwn(committed, "p_artifact"), false);
});

test("complete recusa curso vazio recomposto de rows", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  const calls = [];
  const engine = engineWithRpc(async (name) => {
    calls.push(name);
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 1);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("workspace não deve ser lido do Storage");
    },
    async putJson() {
      throw new Error("curso inválido não deve ser publicado");
    }
  };

  await assert.rejects(
    () => engine.publish({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      requestId: "publish-empty-0001",
      expectedRevision: 1,
      courseId: source.courses[0].id,
      target: "private",
      completion: "complete"
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "course_incomplete"
      && error.details.incomplete[0].reasons.includes("course_without_modules")
  );
  assert.deepEqual(calls, [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5"
  ]);
});

test("partial materializa somente o curso escolhido e o torna testável", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  source.courses.push({
    id: "course-not-published",
    title: "Outro curso",
    goal: "Permanecer apenas no workspace.",
    modules: []
  });
  let published = null;
  let persistedDocument = null;
  let putCount = 0;
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 1);
    }
    if (name === "register_authoring_artifact_v5") {
      return { hash: payload.p_artifact.hash, registered: true };
    }
    if (name === "publish_authoring_workspace_course_v5") {
      published = payload;
      return {
        workspaceId: WORKSPACE_ID,
        revision: 1,
        courseId: SOURCE_COURSE_ID,
        contentHash: "b".repeat(64),
        completionState: "partial",
        target: "private",
        submissionId: null,
        idempotent: false
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("workspace não deve ser lido do Storage");
    },
    async putJson(document, options) {
      putCount += 1;
      persistedDocument = document;
      assert.equal(options.artifactType, "aralearn.course-revision");
      assert.equal(options.bucket, "aralearn-course-revisions");
      const descriptor = {
        hash: "b".repeat(64),
        bucket: "aralearn-course-revisions",
        objectKey: "revisions/bb/document.json",
        artifactType: "aralearn.course-revision",
        mediaType: "application/json",
        sizeBytes: 2048
      };
      await options.registerReference(descriptor);
      return descriptor;
    }
  };

  const result = await engine.publish({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "publish-partial-0001",
    expectedRevision: 1,
    courseId: source.courses[0].id,
    target: "private",
    completion: "partial"
  });

  assert.equal(result.completionState, "partial");
  assert.equal(putCount, 1);
  assert.deepEqual(
    persistedDocument.courses.map((course) => course.id),
    [source.courses[0].id]
  );
  assert.equal(published.p_completion_state, "partial");
  assert.equal(published.p_target, "private");
  assert.equal(Object.hasOwn(published, "p_publication_mode"), false);
  assert.equal(published.p_artifact.hash, "b".repeat(64));
  assert.equal(Object.hasOwn(published, "p_rows"), false);
  assert.equal(Object.hasOwn(published, "p_changes"), false);
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5",
    "register_authoring_artifact_v5",
    "publish_authoring_workspace_course_v5"
  ]);
  assert.deepEqual(calls[1].payload.p_course_ids, [source.courses[0].id]);
  assert.equal(calls[1].payload.p_include_card_content, true);
  assert.equal(
    calls[2].payload.p_artifact.hash,
    published.p_artifact.hash
  );
});

test("complete devolve motivos de incompletude agrupados por entidade", async () => {
  const source = await fixture();
  const microsequence = source.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.status = "generated";
  const engine = engineWithRpc(async (name) => {
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 1);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  await assert.rejects(
    () => engine.publish({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      requestId: "publish-grouped-incomplete-0001",
      expectedRevision: 1,
      courseId: source.courses[0].id,
      target: "private",
      completion: "complete"
    }),
    (error) => {
      const matching = error?.details?.incomplete?.filter(
        (item) => item.entityPath.at(-1) === microsequence.id
      );
      return error instanceof AuthoringApiError
        && error.code === "course_incomplete"
        && matching.length === 1
        && matching[0].reasons.includes("microsequence_not_ready");
    }
  );
});

test("republicação idêntica não envia artefato nem avança sincronização", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  const courseDocument = {
    ...source,
    courses: [source.courses[0]]
  };
  const { contentHash } = await prepareCourseDocument(courseDocument);
  const reference = workspaceReference(source, 4);
  reference.publications = [{
    workspaceCourseId: source.courses[0].id,
    target: "private",
    courseId: SOURCE_COURSE_ID,
    contentHash,
    completionState: "partial",
    updatedAt: "2026-07-31T12:00:00.000Z"
  }];
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") return reference;
    if (name === "reuse_unchanged_authoring_publication_v5") {
      return {
        workspaceId: WORKSPACE_ID,
        revision: 4,
        courseId: SOURCE_COURSE_ID,
        contentHash,
        completionState: "partial",
        target: "private",
        submissionId: null,
        idempotent: false,
        unchanged: true
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async putJson() {
      throw new Error("publicação idêntica não deve tocar no Storage");
    }
  };

  const result = await engine.publish({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "publish-unchanged-0001",
    expectedRevision: 4,
    courseId: source.courses[0].id,
    target: "private",
    completion: "partial"
  });

  assert.equal(result.unchanged, true);
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5",
    "reuse_unchanged_authoring_publication_v5"
  ]);
  assert.equal(calls[2].payload.p_workspace_course_id, source.courses[0].id);
  assert.equal(calls[2].payload.p_content_hash, contentHash);
  assert.equal(calls[2].payload.p_payload_hash.length, 64);
});

test("falha de CAS ocorre depois do pré-registro e deixa a referência coletável", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  const calls = [];
  const descriptor = {
    hash: "e".repeat(64),
    bucket: "aralearn-course-revisions",
    objectKey: `artifacts/sha256/ee/ee/${"e".repeat(64)}.json`,
    artifactType: "aralearn.course-revision",
    mediaType: "application/json",
    sizeBytes: 1024,
    reused: false
  };
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 2);
    }
    if (name === "register_authoring_artifact_v5") {
      return { hash: payload.p_artifact.hash, registered: true };
    }
    if (name === "publish_authoring_workspace_course_v5") {
      throw new AuthoringApiError(
        409,
        "stale_course_revision",
        "A publicação concorrente venceu."
      );
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async putJson(_document, options) {
      await options.registerReference(descriptor);
      calls.push({ name: "storage_upload", payload: descriptor });
      return descriptor;
    }
  };

  await assert.rejects(
    () => engine.publish({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      requestId: "publish-cas-0001",
      expectedRevision: 2,
      courseId: source.courses[0].id,
      target: "private",
      completion: "partial",
      existingCourseId: SOURCE_COURSE_ID,
      expectedContentHash: "f".repeat(64)
    }),
    (error) => error?.code === "stale_course_revision"
  );
  assert.deepEqual(calls.map(({ name }) => name), [
    "replay_authoring_workspace_request_v5",
    "get_authoring_workspace_v5",
    "register_authoring_artifact_v5",
    "storage_upload",
    "publish_authoring_workspace_course_v5"
  ]);
  assert.equal(calls[2].payload.p_artifact.hash, descriptor.hash);
});

test("coleção é obrigatória somente para catálogo", () => {
  const base = {
    requestId: "publish-contract-0001",
    expectedRevision: 1,
    courseId: "course-a",
    completion: "complete"
  };
  assert.throws(
    () => validateWorkspacePublishPayload({ ...base, target: "catalog" }),
    (error) => error instanceof AuthoringApiError
      && error.code === "catalog_collection_required"
  );
  assert.equal(
    validateWorkspacePublishPayload({
      ...base,
      target: "private",
      completion: "partial"
    }).collectionId,
    null
  );
});

test("leitura do workspace compõe rows e não abre Storage", async () => {
  const source = await fixture();
  const deadlineAt = Date.now() + 5_000;
  let receivedOptions = null;
  let receivedPayload = null;
  const engine = engineWithRpc(async (name, payload, options) => {
    if (name === "get_authoring_workspace_v5") {
      receivedOptions = options;
      receivedPayload = payload;
      return workspaceReference(source, 3);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("leitura do workspace composto não usa Storage");
    }
  };

  const result = await engine.get({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    view: "outline",
    deadlineAt
  });

  assert.equal(result.revision, 3);
  assert.equal(result.entityCount, flattenWorkspaceDocument(source).length);
  assert.deepEqual(
    result.content.courses.map((course) => course.id),
    [source.courses[0].id]
  );
  assert.equal(receivedOptions.deadlineAt, deadlineAt);
  assert.deepEqual(receivedPayload, {
    p_owner_id: PRINCIPAL.actorId,
    p_workspace_id: WORKSPACE_ID,
    p_course_ids: null,
    p_include_card_content: false
  });
  assert.equal(Object.hasOwn(result, "entities"), false);
  assert.equal(Object.hasOwn(result, "artifact"), false);
});

test("leitura de entidade solicita somente o curso que contém o alvo", async () => {
  const source = await fixture();
  let receivedPayload = null;
  const engine = engineWithRpc(async (name, payload) => {
    if (name === "get_authoring_workspace_v5") {
      receivedPayload = payload;
      return workspaceReference(source, 3);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  const course = source.courses[0];
  const moduleValue = course.modules[0];

  const result = await engine.get({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    view: "entity",
    entityType: "module",
    entityPath: [course.id, moduleValue.id],
    includeDescendants: false
  });

  assert.equal(result.content.id, moduleValue.id);
  assert.deepEqual(receivedPayload.p_course_ids, [course.id]);
  assert.equal(receivedPayload.p_include_card_content, true);
});

test("revisão de microteorias exige o recorte de uma lição ou microssequência", async () => {
  const source = await fixture();
  const engine = engineWithRpc(async (name) => {
    if (name === "get_authoring_workspace_v5") {
      return workspaceReference(source, 3);
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  await assert.rejects(
    engine.get({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      view: "microtheories",
      entityPath: [source.courses[0].id]
    }),
    (error) => error instanceof AuthoringApiError
      && error.status === 422
      && error.code === "microtheory_scope_required"
  );
});

test("submissão, fila e decisão editorial usam RPCs v5 pequenas", async () => {
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "submit_private_course_for_catalog_review_v5") {
      return {
        submissionId: SUBMISSION_ID,
        courseId: SOURCE_COURSE_ID,
        status: "submitted",
        completionState: "partial",
        idempotent: false
      };
    }
    if (name === "list_catalog_reviews_v5") {
      return {
        view: "queue",
        items: [{ submissionId: SUBMISSION_ID }],
        hasMore: false,
        nextCursor: null
      };
    }
    if (name === "decide_catalog_review_v5") {
      return {
        submissionId: SUBMISSION_ID,
        status: "changes_requested",
        idempotent: false
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });

  await engine.submitForReview({
    principal: PRINCIPAL,
    submissionId: SUBMISSION_ID,
    courseId: SOURCE_COURSE_ID,
    expectedContentHash: "c".repeat(64),
    note: "Curso parcial pronto para avaliação."
  });
  const queue = await engine.listReviews({
    principal: REVIEWER,
    view: "queue",
    limit: 25,
    beforeSubmittedAt: "2026-07-30T12:00:00.000Z",
    beforeId: SUBMISSION_ID
  });
  const decision = await engine.decideReview({
    principal: REVIEWER,
    submissionId: SUBMISSION_ID,
    decision: "request_changes",
    note: "Rever a formulação da microteoria."
  });

  assert.equal(queue.items[0].submissionId, SUBMISSION_ID);
  assert.equal(decision.status, "changes_requested");
  assert.deepEqual(calls.map(({ name }) => name), [
    "submit_private_course_for_catalog_review_v5",
    "list_catalog_reviews_v5",
    "decide_catalog_review_v5"
  ]);
  assert.deepEqual(calls[0].payload, {
    p_actor_id: PRINCIPAL.actorId,
    p_submission_id: SUBMISSION_ID,
    p_course_id: SOURCE_COURSE_ID,
    p_expected_content_hash: "c".repeat(64),
    p_note: "Curso parcial pronto para avaliação."
  });
  assert.equal(calls[1].payload.p_view, "queue");
  assert.deepEqual(calls[1].payload, {
    p_actor_id: REVIEWER.actorId,
    p_view: "queue",
    p_limit: 25,
    p_before_submitted_at: "2026-07-30T12:00:00.000Z",
    p_before_id: SUBMISSION_ID
  });
  assert.equal(calls[2].payload.p_decision, "request_changes");
});

test("workspace editorial nasce da revisão imutável como rows e é vinculado", async () => {
  const source = await fixture();
  const reviewArtifact = {
    hash: "d".repeat(64),
    bucket: "aralearn-course-revisions",
    objectKey: "revisions/dd/document.json"
  };
  const calls = [];
  let created = null;
  const engine = engineWithRpc(async (name, payload) => {
    calls.push(name);
    if (name === "claim_catalog_review_v5") {
      return { submissionId: SUBMISSION_ID, status: "in_review" };
    }
    if (name === "replay_authoring_workspace_request_v5") return null;
    if (name === "get_catalog_review_artifact_v5") {
      return {
        submissionId: SUBMISSION_ID,
        courseId: SOURCE_COURSE_ID,
        title: "Curso submetido",
        sourceRevisionHash: "d".repeat(64),
        artifact: reviewArtifact
      };
    }
    if (name === "create_authoring_workspace_v5") {
      created = payload;
      return {
        workspaceId: WORKSPACE_ID,
        revision: 1,
        currentRevision: 1,
        entityCount: payload.p_rows.length,
        idempotent: false
      };
    }
    if (name === "link_catalog_review_workspace_v5") {
      return {
        submissionId: SUBMISSION_ID,
        workspaceId: WORKSPACE_ID,
        status: "in_review"
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson(descriptor) {
      assert.deepEqual(descriptor, reviewArtifact);
      return source;
    },
    async putJson() {
      throw new Error("workspace editorial não deve criar snapshot");
    }
  };

  const result = await engine.createReviewWorkspace({
    principal: REVIEWER,
    submissionId: SUBMISSION_ID,
    workspaceId: WORKSPACE_ID,
    requestId: "review-workspace-0001",
    title: "Revisão do curso"
  });

  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.deepEqual(calls, [
    "claim_catalog_review_v5",
    "replay_authoring_workspace_request_v5",
    "get_catalog_review_artifact_v5",
    "create_authoring_workspace_v5",
    "link_catalog_review_workspace_v5"
  ]);
  assert.equal(created.p_source_submission_id, SUBMISSION_ID);
  assert.equal(created.p_source_course_id, SOURCE_COURSE_ID);
  assert.equal(created.p_source_revision_hash, "d".repeat(64));
  assertLeanRows(created.p_rows);
  assert.equal(Object.hasOwn(created, "p_artifact"), false);
});

test("mesmo revisor retoma workspace editorial vinculado sem criar cópia", async () => {
  const source = await fixture();
  const reference = {
    ...workspaceReference(source, 3),
    sourceCourseId: SOURCE_COURSE_ID,
    sourceRevisionHash: "d".repeat(64),
    sourceSubmissionId: SUBMISSION_ID,
    brief: "Revisar o curso submetido."
  };
  const calls = [];
  const engine = engineWithRpc(async (name, payload) => {
    calls.push({ name, payload });
    if (name === "claim_catalog_review_v5") {
      return {
        submissionId: SUBMISSION_ID,
        status: "in_review",
        reviewerId: REVIEWER.actorId,
        reviewWorkspaceId: WORKSPACE_ID,
        leaseExpiresAt: "2026-07-30T12:30:00.000Z",
        idempotent: true
      };
    }
    if (name === "link_catalog_review_workspace_v5") {
      return {
        submissionId: SUBMISSION_ID,
        workspaceId: WORKSPACE_ID,
        status: "in_review",
        leaseExpiresAt: "2026-07-30T13:00:00.000Z"
      };
    }
    if (name === "get_authoring_workspace_v5") return reference;
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("retomada não deve baixar novamente o artefato");
    },
    async putJson() {
      throw new Error("retomada não deve criar artefato");
    }
  };

  const result = await engine.createReviewWorkspace({
    principal: REVIEWER,
    submissionId: SUBMISSION_ID,
    workspaceId: "66666666-6666-4666-8666-666666666666",
    requestId: "review-workspace-resume-0001",
    title: "Outro título não cria outro workspace"
  });

  assert.equal(result.workspaceId, WORKSPACE_ID);
  assert.equal(result.revision, 3);
  assert.equal(result.idempotent, true);
  assert.equal(Object.hasOwn(result, "brief"), false);
  assert.deepEqual(calls.map(({ name }) => name), [
    "claim_catalog_review_v5",
    "link_catalog_review_workspace_v5",
    "get_authoring_workspace_v5"
  ]);
  assert.equal(
    calls[1].payload.p_workspace_id,
    WORKSPACE_ID
  );
});
