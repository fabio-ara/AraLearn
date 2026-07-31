import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { AuthoringWorkspaceEngine } from "../../supabase/functions/_shared/aralearn-authoring/workspaceEngine.js";
import {
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  copyWorkspaceEntity,
  saveWorkspaceCard,
  updateWorkspaceEntityMetadata
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js";
import {
  attachWorkspaceEntity,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  renameWorkspaceEntity,
  splitWorkspaceMicrosequence
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";
import {
  flattenWorkspaceDocument
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceParts.js";
import {
  validateWorkspaceMutationPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const PRINCIPAL = {
  actorId: "11111111-1111-4111-8111-111111111111",
  authenticationKind: "oauth",
  scopes: ["authoring:private:read", "authoring:private:publish"]
};
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

async function fixture() {
  return JSON.parse(await readFile(
    new URL(
      "../../docs/examples/aralearn-contract.logic-plane-matrix-course.json",
      import.meta.url
    ),
    "utf8"
  ));
}

function first(document) {
  const course = document.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const card = microsequence.cards[0];
  const coursePath = [course.id];
  const modulePath = [...coursePath, moduleValue.id];
  const lessonPath = [...modulePath, lesson.id];
  const microsequencePath = [...lessonPath, microsequence.id];
  return {
    course,
    moduleValue,
    lesson,
    microsequence,
    card,
    coursePath,
    modulePath,
    lessonPath,
    microsequencePath,
    cardPath: [...microsequencePath, card.id]
  };
}

function cloneMicrosequence(source, id, {
  status = "ready",
  dependsOn = [],
  branchOf = null
} = {}) {
  const cloned = structuredClone(source);
  cloned.id = id;
  cloned.title = `Microssequência ${id}`;
  cloned.status = status;
  cloned.dependsOn = dependsOn;
  if (branchOf) cloned.branchOf = branchOf;
  else delete cloned.branchOf;
  cloned.cards = cloned.cards.map((card, index) => ({
    ...card,
    id: `${id}-card-${index + 1}`
  }));
  return cloned;
}

function addMicrosequence(document, id, options = {}) {
  const { lessonPath, microsequence } = first(document);
  return attachWorkspaceEntity(document, {
    entityType: "microsequence",
    parentPath: lessonPath,
    entity: cloneMicrosequence(microsequence, id, options)
  });
}

function statuses(document) {
  return document.courses.flatMap((course) =>
    course.modules.flatMap((moduleValue) =>
      moduleValue.lessons.flatMap((lesson) =>
        lesson.microsequences.map((microsequence) => ({
          id: microsequence.id,
          status: microsequence.status
        }))
      )
    )
  );
}

function workspaceReference(document, revision) {
  return {
    workspaceId: WORKSPACE_ID,
    title: "Workspace em revisão",
    revision,
    currentRevision: revision,
    entityCount: flattenWorkspaceDocument(document).length,
    sourceCourseId: null,
    sourceRevisionHash: null,
    publications: [],
    publicationCount: 0,
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    idempotent: false,
    brief: {},
    entities: flattenWorkspaceDocument(document).map((row, index) => ({
      ...row,
      version: index + 1
    }))
  };
}

test("correção, cópia, movimento e exclusão de card invalidam somente os destinos semânticos", async () => {
  const original = await fixture();
  const source = first(original);

  const unchanged = saveWorkspaceCard(original, {
    cardPath: source.cardPath,
    card: structuredClone(source.card)
  });
  assert.equal(first(unchanged).microsequence.status, "ready");
  const unmoved = moveWorkspaceEntity(original, {
    entityType: "card",
    entityPath: source.cardPath,
    targetParentPath: source.microsequencePath,
    position: 0
  });
  assert.equal(first(unmoved).microsequence.status, "ready");

  const saved = saveWorkspaceCard(original, {
    cardPath: source.cardPath,
    card: {
      ...source.card,
      text: `${source.card.text} Formulação revisada.`
    }
  });
  assert.equal(first(saved).microsequence.status, "needs_review");
  assert.equal(first(original).microsequence.status, "ready");

  const deleted = deleteWorkspaceEntity(original, {
    entityType: "card",
    entityPath: source.cardPath
  });
  assert.equal(first(deleted).microsequence.status, "needs_review");

  const withTarget = addMicrosequence(original, "micro-target");
  const targetPath = [...first(withTarget).lessonPath, "micro-target"];
  const copied = copyWorkspaceEntity(withTarget, {
    entityType: "card",
    entityPath: first(withTarget).cardPath,
    targetParentPath: targetPath,
    newRootId: "card-copy"
  });
  assert.deepEqual(
    statuses(copied),
    [
      { id: first(copied).microsequence.id, status: "ready" },
      { id: "micro-target", status: "needs_review" }
    ]
  );

  const moved = moveWorkspaceEntity(withTarget, {
    entityType: "card",
    entityPath: first(withTarget).cardPath,
    targetParentPath: targetPath
  });
  assert.deepEqual(
    statuses(moved),
    [
      { id: first(moved).microsequence.id, status: "needs_review" },
      { id: "micro-target", status: "needs_review" }
    ]
  );
});

test("renomeação é nominal; guia, tópicos e conteúdo conceitual invalidam descendentes ready", async () => {
  const original = addMicrosequence(await fixture(), "micro-second");
  const paths = first(original);

  const renamed = renameWorkspaceEntity(original, {
    entityType: "course",
    entityPath: paths.coursePath,
    title: "Título nominal"
  });
  assert.deepEqual(
    statuses(renamed).map(({ status }) => status),
    ["ready", "ready"]
  );

  const sameGoal = updateWorkspaceEntityMetadata(original, {
    entityType: "lesson",
    entityPath: paths.lessonPath,
    goal: paths.lesson.guide.goal
  });
  assert.deepEqual(
    statuses(sameGoal).map(({ status }) => status),
    ["ready", "ready"]
  );

  const changedGuide = updateWorkspaceEntityMetadata(original, {
    entityType: "lesson",
    entityPath: paths.lessonPath,
    include: [...paths.lesson.guide.include, "responsabilidade compartilhada"]
  });
  assert.deepEqual(
    statuses(changedGuide).map(({ status }) => status),
    ["needs_review", "needs_review"]
  );

  const changedCourseGoal = updateWorkspaceEntityMetadata(original, {
    entityType: "course",
    entityPath: paths.coursePath,
    goal: `${paths.course.goal} Com foco adicional em transferência.`
  });
  assert.deepEqual(
    statuses(changedCourseGoal).map(({ status }) => status),
    ["needs_review", "needs_review"]
  );
});

test("ready explícito pode acompanhar a alteração sem gate conversacional", async () => {
  const original = await fixture();
  const paths = first(original);
  const changed = updateWorkspaceEntityMetadata(original, {
    entityType: "microsequence",
    entityPath: paths.microsequencePath,
    goal: `${paths.microsequence.goal} Com uma checagem adicional.`
  });
  assert.equal(first(changed).microsequence.status, "needs_review");

  const explicitlyAccepted = updateWorkspaceEntityMetadata(changed, {
    entityType: "microsequence",
    entityPath: paths.microsequencePath,
    goal: "Nova formulação.",
    status: "ready"
  });
  assert.equal(first(explicitlyAccepted).microsequence.goal, "Nova formulação.");
  assert.equal(first(explicitlyAccepted).microsequence.status, "ready");

  const approved = updateWorkspaceEntityMetadata(changed, {
    entityType: "microsequence",
    entityPath: paths.microsequencePath,
    status: "ready"
  });
  assert.equal(first(approved).microsequence.status, "ready");
});

test("REST e MCP aceitam ready explícito junto dos metadados", () => {
  const common = {
    entityType: "microsequence",
    entityPath: [
      "course-a", "module-a", "lesson-a", "micro-a"
    ]
  };
  const rest = validateWorkspaceMutationPayload({
    requestId: "review-rest-0001",
    expectedRevision: 3,
    operation: "update_metadata",
    arguments: {
      ...common,
      goal: "Objetivo corrigido.",
      status: "ready"
    }
  });
  assert.deepEqual(rest.arguments, {
    ...common,
    goal: "Objetivo corrigido.",
    status: "ready"
  });
  const combined = mapAuthoringMcpToolCall(
    "atualizarMetadadosDaEntidade",
    {
      requestId: "review-mcp-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 3,
      ...common,
      goal: "Objetivo corrigido.",
      status: "ready"
    }
  );
  const validatedCombined = validateWorkspaceMutationPayload(combined.body);
  assert.deepEqual(validatedCombined.arguments, {
    ...common,
    goal: "Objetivo corrigido.",
    status: "ready"
  });
  const mapped = mapAuthoringMcpToolCall("atualizarMetadadosDaEntidade", {
    requestId: "review-mcp-0002",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 4,
    ...common,
    status: "ready"
  });
  assert.equal(mapped.body.operation, "update_metadata");
  assert.deepEqual(mapped.body.arguments, { ...common, status: "ready" });
});

test("cópia e movimento estrutural invalidam a cópia ou subárvore movida, sem contaminar a origem", async () => {
  const original = await fixture();
  const paths = first(original);

  const copied = copyWorkspaceEntity(original, {
    entityType: "lesson",
    entityPath: paths.lessonPath,
    targetParentPath: paths.modulePath,
    newRootId: "lesson-copy"
  });
  const [sourceLesson, copiedLesson] = copied.courses[0].modules[0].lessons;
  assert.equal(sourceLesson.microsequences[0].status, "ready");
  assert.deepEqual(
    copiedLesson.microsequences.map(({ status }) => status),
    ["needs_review"]
  );

  const targetModule = {
    ...structuredClone(paths.moduleValue),
    id: "module-target",
    title: "Módulo de destino",
    lessons: []
  };
  const withTarget = attachWorkspaceEntity(original, {
    entityType: "module",
    parentPath: paths.coursePath,
    entity: targetModule
  });
  const moved = moveWorkspaceEntity(withTarget, {
    entityType: "lesson",
    entityPath: paths.lessonPath,
    targetParentPath: [...paths.coursePath, targetModule.id]
  });
  assert.equal(
    moved.courses[0].modules[1].lessons[0].microsequences[0].status,
    "needs_review"
  );
});

test("junção invalida alvo e referências realmente remapeadas; divisão invalida as duas partes", async () => {
  const original = await fixture();
  const paths = first(original);
  const withSource = addMicrosequence(original, "micro-source");
  const withDependent = addMicrosequence(withSource, "micro-dependent", {
    dependsOn: ["micro-source"],
    branchOf: "micro-source"
  });
  const prepared = addMicrosequence(withDependent, "micro-unrelated");

  const merged = mergeWorkspaceMicrosequences(prepared, {
    targetPath: paths.microsequencePath,
    sourcePaths: [[...paths.lessonPath, "micro-source"]]
  });
  assert.deepEqual(
    statuses(merged),
    [
      { id: paths.microsequence.id, status: "needs_review" },
      { id: "micro-dependent", status: "needs_review" },
      { id: "micro-unrelated", status: "ready" }
    ]
  );
  const dependent = merged.courses[0].modules[0].lessons[0]
    .microsequences.find(({ id }) => id === "micro-dependent");
  assert.deepEqual(dependent.dependsOn, [paths.microsequence.id]);
  assert.equal(dependent.branchOf, paths.microsequence.id);

  const splitSource = first(original).microsequence;
  const split = splitWorkspaceMicrosequence(original, {
    sourcePath: paths.microsequencePath,
    newMicrosequence: {
      ...cloneMicrosequence(splitSource, "micro-split"),
      cards: []
    },
    cardIds: [splitSource.cards.at(-1).id]
  });
  assert.deepEqual(
    statuses(split),
    [
      { id: paths.microsequence.id, status: "needs_review" },
      { id: "micro-split", status: "needs_review" }
    ]
  );
});

test("promoção e rebaixamento invalidam somente a estrutura resultante", async () => {
  const original = await fixture();
  const paths = first(original);

  const promoted = promoteModuleToCourse(original, {
    modulePath: paths.modulePath,
    courseId: "course-promoted",
    goal: "Estudar o módulo de forma independente.",
    mode: "copy"
  });
  assert.equal(first(promoted).microsequence.status, "ready");
  assert.deepEqual(
    promoted.courses[1].modules[0].lessons[0]
      .microsequences.map(({ status }) => status),
    ["needs_review"]
  );

  const targetCourse = {
    id: "course-target",
    title: "Curso de destino",
    goal: "Receber partes explicitamente copiadas.",
    modules: []
  };
  const withTarget = attachWorkspaceEntity(original, {
    entityType: "course",
    entity: targetCourse
  });
  const demoted = demoteCourseToModule(withTarget, {
    coursePath: paths.coursePath,
    targetCoursePath: [targetCourse.id],
    moduleId: "module-demoted",
    mode: "copy"
  });
  assert.equal(first(demoted).microsequence.status, "ready");
  assert.deepEqual(
    demoted.courses[1].modules[0].lessons[0]
      .microsequences.map(({ status }) => status),
    ["needs_review"]
  );
});

test("publicação complete recusa correção não chancelada e aceita após status-only", async () => {
  const original = await fixture();
  const paths = first(original);
  const changed = saveWorkspaceCard(original, {
    cardPath: paths.cardPath,
    card: {
      ...paths.card,
      text: `${paths.card.text} Texto semanticamente corrigido.`
    }
  });
  const approved = updateWorkspaceEntityMetadata(changed, {
    entityType: "microsequence",
    entityPath: paths.microsequencePath,
    status: "ready"
  });
  const calls = [];
  let current = changed;
  const engine = new AuthoringWorkspaceEngine({
    rpc: async (name, payload) => {
      calls.push({ name, payload });
      if (name === "replay_authoring_workspace_request_v5") return null;
      if (name === "get_authoring_workspace_v5") {
        return workspaceReference(current, current === changed ? 4 : 5);
      }
      if (name === "register_authoring_artifact_v5") {
        return { hash: payload.p_artifact.hash, registered: true };
      }
      if (name === "publish_authoring_workspace_course_v5") {
        return {
          workspaceId: WORKSPACE_ID,
          revision: 5,
          courseId: "33333333-3333-4333-8333-333333333333",
          contentHash: payload.p_artifact.hash,
          completionState: "complete",
          target: "private",
          submissionId: null,
          idempotent: false
        };
      }
      throw new Error(`RPC inesperada: ${name}`);
    },
    supabaseUrl: "https://project.example",
    serverApiKey: "server-secret"
  });
  engine.artifacts = {
    async putJson(_document, options) {
      const descriptor = {
        hash: "a".repeat(64),
        bucket: "aralearn-course-revisions",
        objectKey: `artifacts/sha256/aa/aa/${"a".repeat(64)}.json`,
        artifactType: "aralearn.course-revision",
        mediaType: "application/json",
        sizeBytes: 1024
      };
      await options.registerReference(descriptor);
      return descriptor;
    }
  };

  await assert.rejects(
    () => engine.publish({
      principal: PRINCIPAL,
      workspaceId: WORKSPACE_ID,
      requestId: "publish-before-review-0001",
      expectedRevision: 4,
      courseId: paths.course.id,
      target: "private",
      completion: "complete"
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "course_incomplete"
      && error.details.incomplete.some(
        ({ reasons }) => reasons.includes("microsequence_not_ready")
      )
  );
  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      "replay_authoring_workspace_request_v5",
      "get_authoring_workspace_v5"
    ]
  );
  assert.deepEqual(calls[1].payload.p_course_ids, [paths.course.id]);

  calls.length = 0;
  current = approved;
  const published = await engine.publish({
    principal: PRINCIPAL,
    workspaceId: WORKSPACE_ID,
    requestId: "publish-after-review-0001",
    expectedRevision: 5,
    courseId: paths.course.id,
    target: "private",
    completion: "complete"
  });
  assert.equal(published.completionState, "complete");
  assert.deepEqual(
    calls.map(({ name }) => name),
    [
      "replay_authoring_workspace_request_v5",
      "get_authoring_workspace_v5",
      "register_authoring_artifact_v5",
      "publish_authoring_workspace_course_v5"
    ]
  );
});
