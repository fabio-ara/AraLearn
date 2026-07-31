import test from "node:test";
import assert from "node:assert/strict";

import {
  assertPublicationReady,
  importPreparedCatalogFixture
} from "../../scripts/publishCatalogFixtures.mjs";
import {
  AuthoringWorkspaceEngine
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";

function courseWithStatus(status) {
  return {
    id: "course-publication-test",
    modules: [{
      id: "module-publication-test",
      lessons: [{
        id: "lesson-publication-test",
        microsequences: [{ id: "micro-publication-test", status, cards: [{ id: "card-publication-test" }] }]
      }]
    }]
  };
}

function canonicalGapCourse() {
  return {
    id: "course-canonical-gap",
    title: "Curso canônico",
    goal: "Validar a importação administrativa canônica.",
    modules: [{
      id: "module-canonical-gap",
      title: "Módulo",
      guide: {
        goal: "Guiar.",
        include: [],
        exclude: [],
        notation: [],
        avoid: []
      },
      lessons: [{
        id: "lesson-canonical-gap",
        title: "Lição",
        guide: {
          goal: "Ensinar.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        topics: [],
        microsequences: [{
          id: "micro-canonical-gap",
          title: "Microssequência",
          goal: "Consolidar.",
          role: "practice",
          status: "ready",
          branchOf: null,
          dependsOn: [],
          covers: ["conteúdo"],
          checks: ["responde"],
          errors: [],
          cards: [{
            id: "card-canonical-gap",
            position: 1,
            resource: "paragraph",
            kind: "exercise",
            exercise: "gap",
            title: "Complete",
            text: "A resposta é [[correta::correta|incorreta]].",
            after: "Revise a explicação."
          }]
        }]
      }]
    }]
  };
}

test("a publicação administrativa aceita somente microssequências ready", () => {
  assert.doesNotThrow(() => assertPublicationReady(courseWithStatus("ready"), "fixture-ready.json"));
  assert.throws(
    () => assertPublicationReady(courseWithStatus("generated"), "fixture-generated.json"),
    /fixture-generated\.json não está pronta para publicação: 1 microssequência\(s\) sem status ready/u
  );
});

test("a via administrativa materializa o documento canônico sem passar pela autoria externa", async () => {
  const calls = [];
  const engine = new AuthoringWorkspaceEngine({
    supabaseUrl: "https://project.supabase.co",
    serverApiKey: `sb_secret_${"a".repeat(40)}`,
    rpc: async (functionName, payload) => {
      calls.push({ functionName, payload });
      if (functionName === "replay_authoring_workspace_request_v5") return [];
      if (functionName === "create_authoring_workspace_v5") {
        return [{
          workspaceId: payload.p_workspace_id,
          revision: 1,
          currentRevision: 1
        }];
      }
      throw new Error(`RPC inesperada: ${functionName}`);
    }
  });
  const course = canonicalGapCourse();
  const document = {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [course]
  };

  await engine.createCanonicalCatalogWorkspace({
    principal: {
      actorId: "10000000-0000-5000-8000-000000000001",
      authenticationKind: "administrative_batch",
      scopes: ["*"]
    },
    workspaceId: "20000000-0000-5000-8000-000000000001",
    requestId: "catalog-workspace:canonical-gap",
    title: "Catálogo: curso canônico",
    brief: "Importação administrativa.",
    document
  });

  assert.deepEqual(calls.map(({ functionName }) => functionName), [
    "replay_authoring_workspace_request_v5",
    "create_authoring_workspace_v5"
  ]);
  const cardRow = calls[1].payload.p_rows.find(
    ({ entityType }) => entityType === "card"
  );
  assert.equal(
    cardRow.content.text,
    "A resposta é [[correta::correta|incorreta]]."
  );
  assert.equal(Object.hasOwn(cardRow.content, "gaps"), false);
  assert.equal(calls[1].payload.p_rows.length, 6);

  await assert.rejects(
    () => engine.createCanonicalCatalogWorkspace({
      principal: {
        actorId: "10000000-0000-5000-8000-000000000001",
        authenticationKind: "oauth",
        scopes: ["authoring:write"]
      },
      workspaceId: "20000000-0000-5000-8000-000000000002",
      requestId: "catalog-workspace:external",
      title: "Tentativa externa",
      document
    }),
    (error) =>
      error?.status === 403
      && error?.code === "catalog_batch_only"
  );
  assert.equal(calls.length, 2);
});

test("a publicação administrativa compacta o curso e remove o workspace temporário", async () => {
  const calls = [];
  const course = canonicalGapCourse();
  const fixture = {
    fileName: "fixture-artifact.json",
    course,
    document: {
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [course]
    },
    hash: "a".repeat(64),
  };
  const engine = {
    async createCanonicalCatalogWorkspace(command) {
      calls.push({ method: "createCanonicalCatalogWorkspace", ...command });
      return { revision: 1, currentRevision: 1 };
    },
    async publish(command) {
      calls.push({ method: "publish", ...command });
      return { status: "published", workspaceId: command.workspaceId };
    },
    async delete(command) {
      calls.push({ method: "delete", ...command });
      return { deleted: true, workspaceId: command.workspaceId };
    }
  };

  const result = await importPreparedCatalogFixture(fixture, {
    publish: true,
    engine,
    publisher: {
      actorId: "10000000-0000-5000-8000-000000000001",
      courseId: "20000000-0000-5000-8000-000000000001",
      currentRevisionHash: "b".repeat(64),
      collectionId: null
    },
    environment: {
      ARALEARN_SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SECRET_KEY: `sb_secret_${"a".repeat(40)}`
    }
  });

  assert.equal(result.status, "published");
  assert.deepEqual(calls.map(({ method }) => method), [
    "createCanonicalCatalogWorkspace",
    "publish",
    "delete"
  ]);
  assert.deepEqual(calls[0].document, fixture.document);
  assert.equal(calls[0].principal.authenticationKind, "administrative_batch");
  assert.deepEqual(calls[0].principal.scopes, ["*"]);
  assert.equal(Object.hasOwn(calls[1], "publicationMode"), false);
  assert.equal(calls[1].existingCourseId, "20000000-0000-5000-8000-000000000001");
  assert.equal(calls[1].expectedContentHash, "b".repeat(64));
  assert.ok(calls.every((call) => call.workspaceId === calls[0].workspaceId));
  assert.match(calls[0].requestId, /^catalog-workspace:/u);
  assert.match(calls[1].requestId, /^catalog-publish:/u);
  assert.match(calls[2].requestId, /^catalog-cleanup:/u);
});
