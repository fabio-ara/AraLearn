import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { AuthoringWorkspaceEngine } from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import { validateWorkspacePublishPayload } from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const PRINCIPAL = {
  actorId: "11111111-1111-4111-8111-111111111111",
  authenticationKind: "oauth"
};
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_COURSE_ID = "33333333-3333-4333-8333-333333333333";

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

test("create recupera replay antes de resolver curso ou gravar artefato", async () => {
  const recovered = { workspaceId: WORKSPACE_ID, revision: 4, replayed: true };
  const calls = [];
  const engine = engineWithRpc(async (name) => {
    calls.push(name);
    if (name === "replay_authoring_workspace_request_v4") return recovered;
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("artefato não deveria ser lido");
    },
    async putJson() {
      throw new Error("artefato não deveria ser gravado");
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
  assert.deepEqual(calls, ["replay_authoring_workspace_request_v4"]);
});

test("import recupera replay antes de ler workspace ou origem", async () => {
  const recovered = { workspaceId: WORKSPACE_ID, revision: 7, replayed: true };
  const calls = [];
  const engine = engineWithRpc(async (name) => {
    calls.push(name);
    if (name === "replay_authoring_workspace_request_v4") return recovered;
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      throw new Error("artefato não deveria ser lido");
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
  assert.deepEqual(calls, ["replay_authoring_workspace_request_v4"]);
});

test("import registra intenção própria e renomeia somente a raiz importada", async () => {
  const source = await fixture();
  const empty = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: []
  };
  let committed = null;
  const engine = engineWithRpc(async (name, payload) => {
    if (name === "replay_authoring_workspace_request_v4") return null;
    if (name === "get_authoring_workspace_v4") {
      return { workspaceId: WORKSPACE_ID, revision: 2, artifact: { hash: "workspace" } };
    }
    if (name === "get_course_document_artifact_v4") {
      return { artifact: { hash: "source" }, revisionHash: "source-revision" };
    }
    if (name === "commit_authoring_workspace_revision_v4") {
      committed = payload;
      return { workspaceId: WORKSPACE_ID, revision: 3 };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson(descriptor) {
      return descriptor.hash === "workspace" ? empty : source;
    },
    async putJson(document) {
      assert.equal(document.courses[0].id, "course-imported");
      assert.equal(
        document.courses[0].modules[0].id,
        source.courses[0].modules[0].id
      );
      return { hash: "next" };
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
  assert.equal(committed.p_operation, "import_course");
});

test("complete recusa curso estruturalmente vazio; partial continua permitido no contrato", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  const engine = engineWithRpc(async (name) => {
    if (name === "replay_authoring_workspace_request_v4") return null;
    if (name === "get_authoring_workspace_v4") {
      return { workspaceId: WORKSPACE_ID, revision: 1, artifact: { hash: "workspace" } };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      return source;
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
      completion: "complete",
      publicationMode: "create"
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "course_incomplete"
      && error.details.incomplete[0].reason === "course_without_modules"
  );
});

test("partial publica e torna testável um curso ainda sem módulos", async () => {
  const source = await fixture();
  source.courses[0].modules = [];
  let published = null;
  const engine = engineWithRpc(async (name, payload) => {
    if (name === "replay_authoring_workspace_request_v4") return null;
    if (name === "get_authoring_workspace_v4") {
      return {
        workspaceId: WORKSPACE_ID,
        revision: 1,
        artifact: { hash: "workspace", bucket: "workspace", objectKey: "workspace" }
      };
    }
    if (name === "publish_authoring_workspace_course_v4") {
      published = payload;
      return {
        workspaceId: WORKSPACE_ID,
        revision: 1,
        courseId: SOURCE_COURSE_ID,
        completionState: "partial"
      };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson() {
      return source;
    },
    async putJson(document) {
      assert.equal(document.courses[0].modules.length, 0);
      return {
        hash: "a".repeat(64),
        bucket: "aralearn-course-revisions",
        objectKey: "artifact.json"
      };
    }
  };

  const result = await engine.publish({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "publish-partial-0001",
    expectedRevision: 1,
    courseId: source.courses[0].id,
    target: "private",
    completion: "partial",
    publicationMode: "create"
  });
  assert.equal(result.completionState, "partial");
  assert.equal(published.p_completion_state, "partial");
  assert.equal(published.p_target, "private");
});

test("coleção é obrigatória somente para catálogo", () => {
  const base = {
    requestId: "publish-contract-0001",
    expectedRevision: 1,
    courseId: "course-a",
    completion: "complete",
    publicationMode: "create"
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

test("leitura do workspace propaga o prazo até o artefato no Storage", async () => {
  const source = await fixture();
  const deadlineAt = Date.now() + 5_000;
  const engine = engineWithRpc(async (name) => {
    if (name === "get_authoring_workspace_v4") {
      return { workspaceId: WORKSPACE_ID, revision: 1, artifact: { hash: "workspace" } };
    }
    throw new Error(`RPC inesperada: ${name}`);
  });
  engine.artifacts = {
    async getJson(_descriptor, options) {
      assert.equal(options.deadlineAt, deadlineAt);
      return source;
    }
  };

  const result = await engine.get({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    view: "outline",
    deadlineAt
  });
  assert.equal(result.revision, 1);
});
