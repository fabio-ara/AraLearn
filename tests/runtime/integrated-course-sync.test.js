import assert from "node:assert/strict";
import test from "node:test";

import {
  courseRemovalWasCommitted,
  deleteIntegratedCourse,
  deleteIntegratedEntity,
  moveIntegratedEntity,
  saveIntegratedEntityMetadata
} from "../../src/assist/integratedCourseSync.js";
import { removeCatalogCourse } from "../../src/assist/courseRemovalCommand.js";

const COURSE_ID = "11111111-1111-4111-8111-111111111111";
const SELECTION_ID = "22222222-2222-4222-8222-222222222222";
const CONTENT_HASH = "a".repeat(64);

function storageForPrivateCourse(calls = []) {
  let selected = true;
  return {
    async flush() { calls.push(["flush"]); },
    async refreshFromReplica() { calls.push(["refresh"]); },
    resolveCourseContractKey(value) { return value; },
    loadCourseSummaries() {
      return selected ? [{
        courseId: COURSE_ID,
        selectionId: SELECTION_ID,
        contentHash: CONTENT_HASH,
        courseOrigin: "private",
        title: "Curso privado"
      }] : [];
    },
    coursePermissions() { return { canDelete: true }; },
    markRemoved() { selected = false; }
  };
}

function editableStorage(calls, { withDraft = false } = {}) {
  return {
    resolveCourseContractKey(value) { return value; },
    loadCourseSummaries() {
      return [{
        courseId: COURSE_ID,
        courseKey: COURSE_ID,
        selectionId: SELECTION_ID,
        contentHash: CONTENT_HASH,
        courseOrigin: "private",
        title: "Curso privado"
      }];
    },
    coursePermissions() { return { canEdit: true }; },
    async getLocalCourseDraft() {
      return withDraft ? { revision: "draft-local-1" } : null;
    },
    async acknowledgeWorkspaceCourseDraft(courseKey, options) {
      calls.push(["acknowledge", courseKey, structuredClone(options)]);
      return { status: "acknowledged" };
    }
  };
}

function workspaceMutationCatalog(calls, action, revision = 4) {
  return {
    async executeApplicationAuthoringAction(name, args) {
      calls.push(["remote", name, structuredClone(args)]);
      if (name === "criarWorkspaceDeAutoria") {
        return { workspaceId: "workspace-private-1", revision: 1 };
      }
      if (name === "lerWorkspaceDeAutoria") {
        return { workspaceId: "workspace-private-1", revision, content: { courses: [] } };
      }
      if (name === action) {
        assert.equal(args.expectedRevision, revision);
        return { workspaceId: "workspace-private-1", revision: revision + 1 };
      }
      throw new Error(`Chamada inesperada: ${name}`);
    }
  };
}

test("edição integrada materializa somente os metadados sem reconhecer o rascunho inteiro", async () => {
  const calls = [];
  let refreshCount = 0;
  const result = await saveIntegratedEntityMetadata({
    remoteCatalog: workspaceMutationCatalog(calls, "atualizarMetadadosDaEntidade"),
    storage: editableStorage(calls, { withDraft: true }),
    refreshTrails: async () => { refreshCount += 1; },
    courseKey: COURSE_ID,
    entityType: "course",
    entityPath: [COURSE_ID],
    metadata: { title: "Título corrigido" },
    title: "Curso privado"
  });

  assert.deepEqual(result, {
    status: "materialized",
    source: "workspace",
    operation: "update_metadata",
    workspaceId: "workspace-private-1",
    revision: 5,
    trailItemId: null,
    courseKey: COURSE_ID,
    sourceCourseId: COURSE_ID
  });
  const mutation = calls.find((entry) =>
    entry[0] === "remote" && entry[1] === "atualizarMetadadosDaEntidade"
  );
  assert.equal(mutation[2].workspaceId, "workspace-private-1");
  assert.equal(mutation[2].expectedRevision, 4);
  assert.equal(mutation[2].title, "Título corrigido");
  assert.equal(calls.some((entry) => entry[0] === "acknowledge"), false);
  assert.equal(calls.some((entry) => entry[1] === "publicarCursoDoWorkspace"), false);
  assert.equal(refreshCount, 1);
});

test("movimentação integrada aplica CAS e devolve a composição corrente", async () => {
  const calls = [];
  const result = await moveIntegratedEntity({
    remoteCatalog: workspaceMutationCatalog(calls, "reorganizarWorkspace", 8),
    storage: editableStorage(calls),
    courseKey: COURSE_ID,
    entityType: "lesson",
    entityPath: [COURSE_ID, "module-a", "lesson-a"],
    targetParentPath: [COURSE_ID, "module-b"],
    position: 2,
    title: "Curso privado"
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.operation, "move_entity");
  assert.equal(result.revision, 9);
  const mutation = calls.find((entry) => entry[1] === "reorganizarWorkspace")[2];
  assert.equal(mutation.operation, "move_entity");
  assert.deepEqual(mutation.targetParentPath, [COURSE_ID, "module-b"]);
  assert.equal(mutation.position, 2);
  assert.equal(calls.some((entry) => entry[1] === "publicarCursoDoWorkspace"), false);
});

test("exclusão integrada remove apenas a entidade da composição", async () => {
  const calls = [];
  const result = await deleteIntegratedEntity({
    remoteCatalog: workspaceMutationCatalog(calls, "excluirDoWorkspace", 2),
    storage: editableStorage(calls),
    courseKey: COURSE_ID,
    entityType: "microsequence",
    entityPath: [COURSE_ID, "module-a", "lesson-a", "micro-a"],
    title: "Curso privado"
  });

  assert.equal(result.status, "materialized");
  assert.equal(result.operation, "delete_entity");
  assert.equal(result.revision, 3);
  const mutation = calls.find((entry) => entry[1] === "excluirDoWorkspace")[2];
  assert.equal(mutation.operation, "delete_entity");
  assert.deepEqual(mutation.entityPath, [COURSE_ID, "module-a", "lesson-a", "micro-a"]);
  assert.equal(calls.some((entry) => entry[1] === "publicarCursoDoWorkspace"), false);
});

test("exclusão privada usa uma única operação transacional", async () => {
  const calls = [];
  const storage = storageForPrivateCourse(calls);
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      calls.push(["remote", name, args]);
      return {
        status: "removed",
        selectionId: SELECTION_ID,
        courseId: COURSE_ID,
        kind: "personal",
        courseArchived: true,
        idempotent: false
      };
    },
    async listCollections() {
      throw new Error("curso privado não consulta Coleções");
    }
  };

  await deleteIntegratedCourse({
    remoteCatalog,
    storage,
    syncEngine: {
      async confirmSelectedCourseRemoval(courseId) {
        calls.push(["local", courseId]);
        storage.markRemoved();
      }
    },
    synchronizeReplica: async (options) => { calls.push(["sync", options]); },
    courseKey: COURSE_ID
  });

  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0], ["flush"]);
  assert.deepEqual(calls[1], ["sync", { guaranteeFresh: true }]);
  assert.equal(calls[2][0], "remote");
  assert.equal(calls[2][1], "retirarCursoDasTrilhas");
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(calls[2][2]).filter(([field]) => field !== "requestId")
    ),
    {
      selectionId: SELECTION_ID,
      courseId: COURSE_ID,
      expectedContentHash: CONTENT_HASH
    }
  );
  assert.match(calls[2][2].requestId, /^[a-f0-9-]{36}$/u);
  assert.deepEqual(calls[3], ["local", COURSE_ID]);
  assert.deepEqual(calls[4], ["sync", { guaranteeFresh: true }]);
  assert.deepEqual(calls[5], ["refresh"]);
});

test("commit remoto é informado honestamente quando a réplica não reconcilia", async () => {
  const calls = [];
  const storage = storageForPrivateCourse(calls);
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name) {
      calls.push(["remote", name]);
      return { status: "removed", courseId: COURSE_ID };
    },
    async listCollections() { throw new Error("não deveria consultar Coleções"); }
  };
  let synchronizationCount = 0;

  await assert.rejects(
    () => deleteIntegratedCourse({
      remoteCatalog,
      storage: {
        ...storage,
        async refreshFromReplica() {
          calls.push(["refresh-failed"]);
          throw new Error("IndexedDB closing");
        }
      },
      syncEngine: {
        async confirmSelectedCourseRemoval() {
          calls.push(["local-failed"]);
          throw new Error("IndexedDB closing");
        }
      },
      synchronizeReplica: async (options) => {
        synchronizationCount += 1;
        calls.push(["sync", options]);
        if (synchronizationCount > 1) throw new Error("sync interrompida");
      },
      courseKey: COURSE_ID
    }),
    (error) => courseRemovalWasCommitted(error) && /já foi retirado no servidor/iu.test(error.message)
  );

  assert.equal(calls.filter(([kind]) => kind === "remote").length, 1);
  assert.equal(synchronizationCount, 2);
});

test("conta administrativa retira curso oficial do catálogo e reconcilia a seleção local", async () => {
  const calls = [];
  let selected = true;
  const storage = {
    async flush() { calls.push(["flush"]); },
    async refreshFromReplica() { calls.push(["refresh"]); },
    resolveCourseContractKey(value) { return value; },
    loadCourseSummaries() {
      return selected ? [{
        courseId: COURSE_ID,
        selectionId: SELECTION_ID,
        contentHash: CONTENT_HASH,
        courseOrigin: "catalog",
        title: "Curso oficial"
      }] : [];
    },
    coursePermissions() { return { canDelete: true }; }
  };
  const collectionId = "33333333-3333-4333-8333-333333333333";
  const remoteCatalog = {
    async listCollections() {
      calls.push(["collections"]);
      return [{ collection_id: collectionId, course_id: COURSE_ID }];
    },
    async executeApplicationAuthoringAction(name, args) {
      calls.push(["remote", name, args]);
      if (name === "consultarCatalogo") {
        return {
          items: [{
            courseId: COURSE_ID,
            placementRevision: 7,
            contentHash: CONTENT_HASH
          }]
        };
      }
      return { status: "removed", courseId: COURSE_ID };
    }
  };

  await deleteIntegratedCourse({
    remoteCatalog,
    storage,
    syncEngine: {
      async confirmSelectedCourseRemoval(courseId) {
        calls.push(["local", courseId]);
        selected = false;
      }
    },
    synchronizeReplica: async (options) => { calls.push(["sync", options]); },
    courseKey: COURSE_ID
  });

  const removal = calls.find((entry) => entry[0] === "remote" && entry[1] === "retirarDoCatalogo");
  assert.deepEqual(removal[2], {
    operation: "remove_course",
    requestId: removal[2].requestId,
    courseId: COURSE_ID,
    expectedPlacementRevision: 7,
    expectedContentHash: CONTENT_HASH
  });
  assert.match(removal[2].requestId, /^[a-f0-9-]{36}$/u);
  assert.equal(calls.filter(([kind, name]) => kind === "remote" && name === "retirarDoCatalogo").length, 1);
  assert.deepEqual(calls.slice(-3), [
    ["local", COURSE_ID],
    ["sync", { guaranteeFresh: true }],
    ["refresh"]
  ]);
});

test("resposta perdida repete a exclusão com o mesmo requestId", async () => {
  const calls = [];
  const requestIds = [];
  const storage = storageForPrivateCourse(calls);
  let attempt = 0;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      assert.equal(name, "retirarCursoDasTrilhas");
      requestIds.push(args.requestId);
      attempt += 1;
      if (attempt === 1) {
        const error = new Error("resposta perdida");
        error.status = 0;
        throw error;
      }
      return { status: "removed", courseId: COURSE_ID, idempotent: true };
    }
  };

  await deleteIntegratedCourse({
    remoteCatalog,
    storage,
    syncEngine: {
      async confirmSelectedCourseRemoval() { storage.markRemoved(); }
    },
    synchronizeReplica: async () => {},
    courseKey: COURSE_ID
  });

  assert.equal(requestIds.length, 2);
  assert.equal(requestIds[0], requestIds[1]);
});

test("falha anterior ao commit conserva o curso e a tentativa posterior mantém a identidade", async () => {
  const requestIds = [];
  const storage = storageForPrivateCourse();
  let available = false;
  const remoteCatalog = {
    async executeApplicationAuthoringAction(name, args) {
      assert.equal(name, "retirarCursoDasTrilhas");
      requestIds.push(args.requestId);
      if (!available) {
        const error = new Error("sem conexão");
        error.status = 0;
        throw error;
      }
      return { status: "removed", courseId: COURSE_ID, idempotent: false };
    }
  };
  const options = {
    remoteCatalog,
    storage,
    syncEngine: {
      async confirmSelectedCourseRemoval() { storage.markRemoved(); }
    },
    synchronizeReplica: async () => {},
    courseKey: COURSE_ID
  };

  await assert.rejects(() => deleteIntegratedCourse(options), /sem conexão/u);
  assert.equal(storage.loadCourseSummaries().length, 1);
  available = true;
  await deleteIntegratedCourse(options);

  assert.equal(new Set(requestIds).size, 1);
  assert.equal(storage.loadCourseSummaries().length, 0);
});

test("erro de contrato não é repetido como falha ambígua", async () => {
  const storage = storageForPrivateCourse();
  let attempts = 0;
  const error = new Error("Revisão do curso desatualizada.");
  error.status = 409;
  await assert.rejects(
    () => deleteIntegratedCourse({
      remoteCatalog: {
        async executeApplicationAuthoringAction() {
          attempts += 1;
          throw error;
        }
      },
      storage,
      syncEngine: {},
      synchronizeReplica: async () => {},
      courseKey: COURSE_ID
    }),
    /desatualizada/u
  );
  assert.equal(attempts, 1);
  assert.equal(storage.loadCourseSummaries().length, 1);
});

test("exclusão oficial encontra a classificação além da primeira página", async () => {
  const collectionId = "33333333-3333-4333-8333-333333333333";
  const calls = [];
  const remoteCatalog = {
    async listCollections() {
      return [{ collection_id: collectionId, course_id: COURSE_ID }];
    },
    async executeApplicationAuthoringAction(name, args) {
      calls.push([name, structuredClone(args)]);
      if (name === "consultarCatalogo" && !args.afterId) {
        return {
          items: Array.from({ length: 100 }, (_, index) => ({
            courseId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
          })),
          hasMore: true,
          nextCursor: {
            afterId: "44444444-4444-4444-8444-444444444444"
          }
        };
      }
      if (name === "consultarCatalogo") {
        return {
          items: [{
            courseId: COURSE_ID,
            placementRevision: 12,
            contentHash: CONTENT_HASH
          }],
          hasMore: false,
          nextCursor: null
        };
      }
      return { status: "removed", courseId: COURSE_ID };
    }
  };

  await removeCatalogCourse({ remoteCatalog, courseId: COURSE_ID });

  const reads = calls.filter(([name]) => name === "consultarCatalogo");
  assert.equal(reads.length, 2);
  assert.deepEqual(reads[1][1], {
    operation: "list_collection_courses",
    collectionId,
    limit: 100,
    afterId: "44444444-4444-4444-8444-444444444444"
  });
  const removal = calls.find(([name]) => name === "retirarDoCatalogo");
  assert.deepEqual(removal[1], {
    operation: "remove_course",
    requestId: removal[1].requestId,
    courseId: COURSE_ID,
    expectedPlacementRevision: 12,
    expectedContentHash: CONTENT_HASH
  });
});
