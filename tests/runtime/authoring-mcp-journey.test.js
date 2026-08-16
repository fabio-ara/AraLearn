import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  authoringMcpToolDefinition
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";
import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  createEmptyAuthoringWorkspace,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  attachWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  readWorkspaceEntity,
  renameWorkspaceEntity,
  splitWorkspaceMicrosequence
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

const ORIGIN = "https://journey.example";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const PUBLISHED_COURSE_ID = "22222222-2222-4222-8222-222222222222";
const CREATED_AT = "2026-07-29T12:00:00.000Z";

function outputValidator(name) {
  const definition = authoringMcpToolDefinition(name);
  assert.ok(definition, `Ferramenta ${name} deve existir.`);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
  });
  addFormats(ajv);
  return validate(definition.outputSchema);

  function validate(outputSchema) {
    return ajv.compile(outputSchema);
  }
}

async function sourceCourse() {
  return JSON.parse(await readFile(
    new URL("../fixtures/package/project-visual.json", import.meta.url),
    "utf8"
  ));
}

function createJourneyAdapter(source) {
  let workspaceId = null;
  let document = null;
  let revision = 0;
  let title = null;
  let brief = "";
  const publications = [];
  const events = [];
  const mutations = {
    rename_entity: renameWorkspaceEntity,
    move_entity: moveWorkspaceEntity,
    delete_entity: deleteWorkspaceEntity,
    merge_microsequences: mergeWorkspaceMicrosequences,
    split_microsequence: splitWorkspaceMicrosequence,
    promote_module: promoteModuleToCourse,
    demote_course: demoteCourseToModule
  };

  function workspaceControl(idempotent = false) {
    return {
      workspaceId,
      title,
      purpose: "Construir e revisar o curso corrente.",
      workspaceKind: "personal",
      visibility: "private",
      role: "owner",
      capabilities: {
        author: true,
        review: true,
        comment: true,
        publish: true,
        research: true,
        manage: true
      },
      revision,
      currentRevision: revision,
      entityCount: document == null ? 0 : flattenWorkspaceDocument(document).length,
      sourceCourseId: null,
      sourceRevisionHash: null,
      publications: structuredClone(publications),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      idempotent
    };
  }

  function eventEntry(operation) {
    return {
      revision,
      operation,
      summary: {
        operation,
        created: 0,
        updated: operation === "create" ? 0 : 1,
        deleted: 0
      },
      createdAt: CREATED_AT
    };
  }

  function commit(operation, nextDocument) {
    document = nextDocument;
    revision += 1;
    events.unshift(eventEntry(operation));
    return workspaceControl();
  }

  function assertRevision(expectedRevision) {
    assert.equal(expectedRevision, revision);
  }

  return {
    async resolvePrincipal() {
      return {
        actorId: ACTOR_ID,
        oauthClientId: "journey-client",
        authenticationKind: "oauth",
        scopes: ["authoring:private:read", "authoring:private:write"]
      };
    },
    async createWorkspace(command) {
      workspaceId = command.workspaceId;
      title = command.title;
      brief = command.brief ?? "";
      document = createEmptyAuthoringWorkspace();
      revision = 1;
      events.unshift(eventEntry("create"));
      return workspaceControl();
    },
    async importCourseIntoWorkspace(command) {
      assert.equal(command.workspaceId, workspaceId);
      assertRevision(command.expectedRevision);
      const course = structuredClone(source.courses[0]);
      course.id = command.workspaceCourseId;
      return commit(
        "import_course",
        attachWorkspaceEntity(document, {
          entityType: "course",
          parentPath: null,
          entity: course,
          position: command.position
        })
      );
    },
    async getWorkspace(command) {
      assert.equal(command.workspaceId, workspaceId);
      let content;
      if (command.view === "outline") content = buildWorkspaceOutline(document);
      else if (command.view === "microtheories") {
        content = buildMicrotheoryReview(document, command.entityPath);
      } else if (command.view === "entity") {
        content = readWorkspaceEntity(
          document,
          command.entityType,
          command.entityPath,
          { includeDescendants: command.includeDescendants }
        );
      } else content = structuredClone(document);
      return { ...workspaceControl(), brief, view: command.view, content };
    },
    async mutateWorkspace(command) {
      assert.equal(command.workspaceId, workspaceId);
      assertRevision(command.expectedRevision);
      const handler = mutations[command.operation];
      assert.equal(typeof handler, "function");
      return commit(
        command.operation,
        handler(document, command.arguments)
      );
    },
    async getWorkspaceEvents({ beforeRevision = null, limit }) {
      const candidates = events.filter(
        (item) => beforeRevision == null || item.revision < beforeRevision
      );
      return {
        items: candidates.slice(0, limit)
      };
    },
    async publishWorkspaceCourse(command) {
      assertRevision(command.expectedRevision);
      assert.equal(command.target, "private");
      assert.equal(Object.hasOwn(command, "completion"), false);
      assert.ok(document.courses.some((course) => course.id === command.courseId));
      publications.splice(0, publications.length, {
        workspaceCourseId: command.courseId,
        target: "private",
        courseId: PUBLISHED_COURSE_ID,
        contentHash: "f".repeat(64),
        completionState: "partial",
        updatedAt: CREATED_AT
      });
      return {
        workspaceId,
        revision,
        courseId: PUBLISHED_COURSE_ID,
        contentHash: "f".repeat(64),
        completionState: "partial",
        target: "private",
        submissionId: null,
        idempotent: false
      };
    },
    async deleteWorkspace(command) {
      assert.equal(command.workspaceId, workspaceId);
      assert.equal(command.expectedRevision, revision);
      document = null;
      return { workspaceId, deleted: true, idempotent: false };
    }
  };
}

function request(message) {
  return new Request(RESOURCE_URL, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
      Authorization: "Bearer header.oauth-payload.signature"
    },
    body: JSON.stringify(message)
  });
}

async function runJourneyTool(handler, name, argumentsValue, id, successfulCalls) {
  const response = await handler(request({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: argumentsValue }
  }));
  const envelope = await response.json();
  assert.equal(response.status, 200, JSON.stringify(envelope));
  assert.equal(envelope.result.isError, false, JSON.stringify(envelope.result));
  successfulCalls.push({
    name,
    structuredContent: envelope.result.structuredContent
  });
  return envelope.result.structuredContent.data;
}

test("jornada GPT+MCP percorre importação, revisão, transformações e atualização em Trilhas", async (t) => {
  const source = await sourceCourse();
  const adapter = createJourneyAdapter(source);
  const handler = createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
  let id = 0;
  const successfulCalls = [];
  const tool = (name, argumentsValue) =>
    runJourneyTool(handler, name, argumentsValue, ++id, successfulCalls);

  const created = await tool("criarWorkspaceDeAutoria", {
    requestId: "journey-create-0001",
    title: "Jornada integrada"
  });
  const workspaceId = created.workspaceId;
  let revision = created.revision;

  const importedCourseId = "course-journey";
  revision = (await tool("importarCursoNoWorkspace", {
    requestId: "journey-import-0001",
    workspaceId,
    expectedRevision: revision,
    courseId: "33333333-3333-4333-8333-333333333333",
    workspaceCourseId: importedCourseId
  })).revision;

  let outline = await tool("lerWorkspaceDeAutoria", {
    workspaceId,
    view: "outline"
  });
  const course = outline.content.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  assert.equal(course.id, importedCourseId);

  const review = await tool("revisarMicroteoriasDoWorkspace", {
    workspaceId,
    entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id]
  });
  const conceptual = review.content.courses[0].modules[0]
    .lessons[0].microtheories[0];
  assert.equal(typeof conceptual.content, "string");
  assert.ok(conceptual.content.length > 0);
  assert.equal(Object.hasOwn(conceptual, "theoryCards"), false);

  revision = (await tool("reorganizarWorkspace", {
    operation: "rename_entity",
    requestId: "journey-rename-0001",
    workspaceId,
    expectedRevision: revision,
    entityType: "course",
    entityPath: [course.id],
    title: "Curso revisto pelo autor"
  })).revision;

  const sourceEntity = await tool("lerWorkspaceDeAutoria", {
    workspaceId,
    view: "entity",
    entityType: "microsequence",
    entityPath: [course.id, moduleValue.id, lesson.id, microsequence.id]
  });
  const cardId = sourceEntity.content.cards.at(-1).id;
  const splitEntity = {
    ...structuredClone(sourceEntity.content),
    id: "micro-journey-split",
    title: "Recorte para revisão",
    cards: []
  };
  revision = (await tool("reorganizarWorkspace", {
    operation: "split_microsequence",
    requestId: "journey-split-0001",
    workspaceId,
    expectedRevision: revision,
    sourcePath: [course.id, moduleValue.id, lesson.id, microsequence.id],
    newId: splitEntity.id,
    title: splitEntity.title,
    goal: splitEntity.goal,
    role: splitEntity.role,
    covers: splitEntity.covers,
    checks: splitEntity.checks,
    errors: splitEntity.errors,
    cardIds: [cardId]
  })).revision;

  revision = (await tool("reorganizarWorkspace", {
    operation: "merge_microsequences",
    requestId: "journey-merge-0001",
    workspaceId,
    expectedRevision: revision,
    targetPath: [course.id, moduleValue.id, lesson.id, microsequence.id],
    sourcePaths: [[course.id, moduleValue.id, lesson.id, splitEntity.id]]
  })).revision;

  revision = (await tool("reorganizarWorkspace", {
    operation: "promote_module",
    requestId: "journey-promote-0001",
    workspaceId,
    expectedRevision: revision,
    modulePath: [course.id, moduleValue.id],
    courseId: "course-journey-promoted",
    goal: "Estudar o módulo como curso independente.",
    mode: "copy"
  })).revision;

  revision = (await tool("reorganizarWorkspace", {
    operation: "demote_course",
    requestId: "journey-demote-0001",
    workspaceId,
    expectedRevision: revision,
    coursePath: ["course-journey-promoted"],
    targetCoursePath: [course.id],
    moduleId: "module-journey-demoted",
    mode: "move"
  })).revision;

  revision = (await tool("excluirDoWorkspace", {
    operation: "delete_entity",
    requestId: "journey-delete-entity-0001",
    workspaceId,
    expectedRevision: revision,
    entityType: "module",
    entityPath: [course.id, "module-journey-demoted"]
  })).revision;

  const published = await tool("publicarCursoDoWorkspace", {
    requestId: "journey-publish-0001",
    workspaceId,
    expectedRevision: revision,
    courseId: course.id,
    target: "private"
  });
  assert.equal(published.target, "private");
  assert.equal(Object.hasOwn(published, "completionState"), false);

  const history = await tool("listarAlteracoesRecentesDoWorkspace", {
    workspaceId,
    limit: 3,
    beforeRevision: revision + 1
  });
  assert.equal(history.items.length, 3);
  assert.ok(history.items.every((item) => item.summary.operation === item.operation));

  outline = await tool("lerWorkspaceDeAutoria", {
    workspaceId,
    view: "outline"
  });
  assert.equal(outline.content.courses[0].title, "Curso revisto pelo autor");
  assert.equal(
    outline.content.courses[0].modules.some(
      (moduleItem) => moduleItem.id === "module-journey-demoted"
    ),
    false
  );

  const deleted = await tool("excluirDoWorkspace", {
    operation: "delete_workspace",
    requestId: "journey-delete-workspace-0001",
    workspaceId,
    expectedRevision: revision
  });
  assert.equal(deleted.deleted, true);

  for (const [index, call] of successfulCalls.entries()) {
    await t.test(
      `${String(index + 1).padStart(2, "0")} ${call.name} valida o outputSchema anunciado`,
      () => {
        const validate = outputValidator(call.name);
        assert.equal(
          validate(call.structuredContent),
          true,
          `${call.name}: ${JSON.stringify(validate.errors, null, 2)}`
        );
      }
    );
  }
});
