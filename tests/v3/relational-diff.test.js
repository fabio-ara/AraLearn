import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  replaceMicrosequenceCards
} from "../../src/editor/contractEditor.js";
import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import {
  deterministicUuid,
  relationalNaturalKey
} from "../../src/persistence/deterministicUuid.js";
import { ProjectDocumentDiffer } from "../../src/persistence/ProjectDocumentDiffer.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";

function paragraphCard(id, text) {
  return {
    id,
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${id}`,
    text,
    after: ""
  };
}

function buildProject() {
  let project = createEmptyProjectDocument();
  project = createCourse(project, {
    id: "course-a",
    title: "Curso A",
    goal: "Aprender com granularidade."
  });
  project = createModule(project, {
    courseKey: "course-a",
    id: "module-a",
    title: "Módulo A",
    goal: "Organizar a aprendizagem."
  });
  project = createLesson(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    id: "lesson-a",
    title: "Lição A",
    goal: "Estudar duas microssequências."
  });
  for (const [microsequenceKey, cardKey] of [["micro-a", "card-a"], ["micro-b", "card-b"]]) {
    project = createMicrosequence(project, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      id: microsequenceKey,
      title: `Micros ${microsequenceKey}`
    });
    project = replaceMicrosequenceCards(project, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey,
      cards: [paragraphCard(cardKey, `Texto de ${cardKey}.`)]
    });
  }
  return project;
}

function buildProjectWithSecondLesson() {
  let project = buildProject();
  project = createLesson(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    id: "lesson-b",
    title: "Lição B",
    goal: "Preservar atividade granular fora do documento de conclusões."
  });
  project = createMicrosequence(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-b",
    id: "micro-c",
    title: "Micros micro-c"
  });
  return replaceMicrosequenceCards(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-b",
    microsequenceKey: "micro-c",
    cards: [paragraphCard("card-c", "Texto de card-c.")]
  });
}

function cardAt(project, microsequenceIndex = 0) {
  return project.courses[0].modules[0].lessons[0].microsequences[microsequenceIndex].cards[0];
}

function allRows(rows) {
  return Object.values(rows).flat();
}

test("identidades naturais de progresso e comentário são estáveis entre dispositivos", async () => {
  const lessonKey = relationalNaturalKey("lessonProgress", "user-a", "lesson-uuid");
  const cardKey = relationalNaturalKey("cardProgress", "user-a", "card-uuid");
  assert.equal(await deterministicUuid(lessonKey), await deterministicUuid(lessonKey));
  assert.equal(await deterministicUuid(cardKey), await deterministicUuid(cardKey));
  assert.notEqual(await deterministicUuid(lessonKey), await deterministicUuid(cardKey));
  assert.match(await deterministicUuid(lessonKey), /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  await assert.rejects(
    deterministicUuid(lessonKey, null),
    /Web Crypto com SHA-256/u
  );
});

test("alterar texto de um bloco gera somente uma mutação de blocks", () => {
  const previous = buildProject();
  const next = structuredClone(previous);
  cardAt(next).text = "Texto alterado sem regravar o card.";

  const result = new ProjectDocumentDiffer().diff(previous, next);
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].storeName, "blocks");
  assert.equal(result.mutations[0].operation, "upsert");
  assert.deepEqual(result.mutations[0].changedFields, ["value"]);
});

test("renomear o id textual de um card preserva os UUIDs do card e de seus filhos", () => {
  const differ = new ProjectDocumentDiffer();
  const previous = buildProject();
  const previousRows = differ.normalize(previous);
  const previousCard = previousRows.cards.find((row) => row.contractKey === "card-a");
  const previousBlock = previousRows.blocks.find((row) => row.cardId === previousCard.id);
  const next = structuredClone(previous);
  cardAt(next).id = "card-renamed";

  const result = differ.diff(previous, next, { previousRows });
  const nextCard = result.nextRows.cards.find((row) => row.contractKey === "card-renamed");
  const nextBlock = result.nextRows.blocks.find((row) => row.cardId === nextCard.id);

  assert.equal(nextCard.id, previousCard.id);
  assert.equal(nextBlock.id, previousBlock.id);
  assert.deepEqual(
    result.mutations.map((mutation) => [mutation.storeName, mutation.operation]),
    [["cards", "upsert"], ["blocks", "upsert"]]
  );
  assert.equal(differ.identityMap.has(previousCard.identityKey), false);
  assert.equal(differ.identityMap.get(nextCard.identityKey), previousCard.id);
});

test("rename rejeitado por escopo não altera o mapa de identidades", () => {
  const differ = new ProjectDocumentDiffer();
  const previous = buildProject();
  const previousRows = differ.normalize(previous);
  const previousCard = previousRows.cards.find((row) => row.contractKey === "card-a");
  const next = structuredClone(previous);
  cardAt(next).id = "card-renamed";
  next.courses[0].title = "Alteração fora do escopo";

  assert.throws(
    () => differ.replaceMicrosequenceCards(previous, next, "micro-a", { previousRows }),
    /fora da microssequência/u
  );
  assert.equal(differ.identityMap.get(previousCard.identityKey), previousCard.id);
  assert.equal(
    differ.identityMap.has(previousCard.identityKey.replace("card:card-a", "card:card-renamed")),
    false
  );
});

test("renomear o id textual de um módulo preserva os UUIDs de toda a subárvore", () => {
  const differ = new ProjectDocumentDiffer();
  const previous = buildProject();
  const previousRows = differ.normalize(previous);
  const previousPrefix = "course:course-a/module:module-a";
  const previousSubtree = allRows(previousRows).filter(
    (row) => row.identityKey === previousPrefix || row.identityKey.startsWith(`${previousPrefix}/`)
  );
  const next = structuredClone(previous);
  next.courses[0].modules[0].id = "module-renamed";

  const result = differ.diff(previous, next, { previousRows });
  const nextPrefix = "course:course-a/module:module-renamed";
  const nextByIdentityKey = new Map(allRows(result.nextRows).map((row) => [row.identityKey, row]));

  previousSubtree.forEach((previousRow) => {
    const nextIdentityKey = `${nextPrefix}${previousRow.identityKey.slice(previousPrefix.length)}`;
    assert.equal(nextByIdentityKey.get(nextIdentityKey)?.id, previousRow.id);
    assert.equal(differ.identityMap.has(previousRow.identityKey), false);
    assert.equal(differ.identityMap.get(nextIdentityKey), previousRow.id);
  });
  assert.ok(result.mutations.length > 1);
  assert.ok(result.mutations.every((mutation) => mutation.operation === "upsert"));
  assert.deepEqual(
    new Set(result.mutations.map((mutation) => mutation.entityId)),
    new Set(previousSubtree.map((row) => row.id))
  );
});

test("delete e add ambíguos não reutilizam UUIDs entre módulos equivalentes", () => {
  let previous = createEmptyProjectDocument();
  previous = createCourse(previous, {
    id: "course-a",
    title: "Curso A",
    goal: "Testar correspondência ambígua."
  });
  for (const id of ["module-a", "module-b"]) {
    previous = createModule(previous, {
      courseKey: "course-a",
      id,
      title: "Módulo equivalente",
      goal: "Mesmo conteúdo sem identidade estável."
    });
  }
  const differ = new ProjectDocumentDiffer();
  const previousRows = differ.normalize(previous);
  const previousModuleIds = new Set(previousRows.modules.map((row) => row.id));
  const next = structuredClone(previous);
  next.courses[0].modules[0].id = "module-new-a";
  next.courses[0].modules[1].id = "module-new-b";

  const result = differ.diff(previous, next, { previousRows });
  const nextModuleIds = new Set(result.nextRows.modules.map((row) => row.id));

  assert.equal([...nextModuleIds].some((id) => previousModuleIds.has(id)), false);
  assert.deepEqual(
    result.mutations
      .filter((mutation) => mutation.storeName === "modules")
      .map((mutation) => mutation.operation)
      .sort(),
    ["delete", "delete", "upsert", "upsert"]
  );
});

test("metadados físicos do servidor não ampliam o diff após o pull", () => {
  const differ = new ProjectDocumentDiffer();
  const project = buildProject();
  const sourceCourseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sourceHash = "a".repeat(64);
  const baselineHash = "b".repeat(64);
  const pulledRows = Object.fromEntries(
    Object.entries(differ.normalize(project)).map(([storeName, rows]) => [
      storeName,
      rows.map((row) => ({
        ...row,
        createdAt: "2026-07-18T00:00:00.000Z",
        ...(storeName === "courses" ? {
          ownerId: "server-owner",
          kind: "personal",
          status: "active",
          sourceCourseId,
          sourceEntityId: sourceCourseId,
          sourcePublicationSeq: 7,
          sourceContentHash: sourceHash,
          baselineContentHash: baselineHash
        } : {}),
        serverOnlyStatus: "canonical"
      }))
    ])
  );
  pulledRows.courses.forEach((row) => { delete row.projectId; });

  assert.deepEqual(
    differ.diff(project, project, { previousRows: pulledRows }).mutations.map((mutation) => ({
      storeName: mutation.storeName,
      entityId: mutation.entityId,
      changedFields: mutation.changedFields
    })),
    []
  );
  const courseEdited = structuredClone(project);
  courseEdited.courses[0].title = "Curso A editado";
  const courseResult = differ.diff(project, courseEdited, { previousRows: pulledRows });
  assert.equal(courseResult.mutations.length, 1);
  assert.equal(courseResult.mutations[0].storeName, "courses");
  assert.deepEqual(courseResult.mutations[0].changedFields, ["title"]);
  assert.deepEqual(
    Object.fromEntries([
      "ownerId",
      "kind",
      "status",
      "sourceCourseId",
      "sourceEntityId",
      "sourcePublicationSeq",
      "sourceContentHash",
      "baselineContentHash",
      "createdAt",
      "serverOnlyStatus"
    ].map((fieldName) => [fieldName, courseResult.mutations[0].nextRow[fieldName]])),
    Object.fromEntries([
      "ownerId",
      "kind",
      "status",
      "sourceCourseId",
      "sourceEntityId",
      "sourcePublicationSeq",
      "sourceContentHash",
      "baselineContentHash",
      "createdAt",
      "serverOnlyStatus"
    ].map((fieldName) => [fieldName, pulledRows.courses[0][fieldName]]))
  );
  const edited = structuredClone(project);
  edited.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Texto pontual.";
  const result = differ.diff(project, edited, { previousRows: pulledRows });
  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].storeName, "blocks");
  assert.deepEqual(result.mutations[0].changedFields, ["value"]);
});

test("substituição escopada alcança somente cards e filhos da microssequência alvo", () => {
  const previous = buildProject();
  const next = replaceMicrosequenceCards(previous, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cards: [paragraphCard("card-new", "Novo conteúdo.")]
  });

  const result = new ProjectDocumentDiffer().replaceMicrosequenceCards(
    previous,
    next,
    "micro-a"
  );
  assert.deepEqual(new Set(result.mutations.map((mutation) => mutation.storeName)), new Set(["cards", "blocks"]));
  assert.equal(result.mutations.length, 4);
  result.mutations.forEach((mutation) => {
    const identityKey = mutation.previousRow?.identityKey || mutation.nextRow?.identityKey;
    assert.match(identityKey, /\/micro:micro-a\//u);
    assert.doesNotMatch(identityKey, /\/micro:micro-b\//u);
  });
});

test("repositório mantém API síncrona, aplica tombstones e não toca no progresso externo", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  context.after(() => repository.store.close());
  const previous = buildProject();

  assert.deepEqual(repository.loadProject(), createEmptyProjectDocument());
  assert.deepEqual(repository.saveProject(previous), previous);
  assert.deepEqual(repository.loadProject(), previous);
  await repository.flush();
  assert.equal(
    (await repository.store.getAll("outbox")).some((row) => row.entityType === "projectMeta"),
    false
  );
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  repository.saveProgress({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": {
        cursor: 1,
        completedCardKeys: ["card-a", "card-b"],
        updatedAt: "2026-07-18T12:00:00.000Z"
      }
    }
  });
  assert.deepEqual(repository.loadProgress().lessons["course-a::module-a::lesson-a"].completedCardKeys, ["card-a", "card-b"]);
  await repository.flush();
  const lessonProgressBefore = await repository.store.getAll("lessonProgress");
  const cardProgressBefore = await repository.store.getAll("cardProgress");
  const progressOutbox = await repository.store.getAll("outbox");
  assert.deepEqual(
    new Set(progressOutbox.map((row) => row.entityType)),
    new Set(["lessonProgress", "cardProgress"])
  );
  progressOutbox.forEach((row) => {
    assert.equal(Object.prototype.hasOwnProperty.call(row.payload, "completedCardKeys"), false);
  });
  await repository.store.acknowledgeOutbox(
    progressOutbox.map((row) => row.mutationId)
  );

  const next = replaceMicrosequenceCards(previous, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cards: [paragraphCard("card-new", "Conteúdo substituto.")]
  });
  repository.replaceMicrosequenceCards(next, "micro-a");
  assert.equal(cardAt(repository.loadProject()).id, "card-new");
  await repository.flush();

  assert.deepEqual(await repository.store.getAll("lessonProgress"), lessonProgressBefore);
  assert.deepEqual(await repository.store.getAll("cardProgress"), cardProgressBefore);
  const pending = await repository.store.listPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, "microsequenceCardReplacement");
  assert.equal(pending[0].operation, "replace");
  assert.equal(pending[0].payload.fragment.cards.length, 1);
  assert.equal(pending[0].payload.fragment.blocks.length, 1);
  assert.match(pending[0].payload.fragment.cards[0].identityKey, /\/micro:micro-a\//u);

  const oldCard = (await repository.store.getAll("cards")).find(
    (row) => row.contractKey === "card-a"
  );
  const oldBlock = (await repository.store.getAll("blocks")).find(
    (row) => row.identityKey.includes("card:card-a")
  );
  assert.ok(oldCard.deletedAt);
  assert.ok(oldBlock.deletedAt);
  assert.equal(oldCard.revision, 2);
  assert.equal(oldBlock.revision, 2);
});

test("replace de microssequência absorve edições granulares pendentes sem perder a base remota", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  context.after(() => repository.store.close());
  const project = buildProject();
  repository.saveProject(project);
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  const granular = structuredClone(project);
  cardAt(granular).text = "Edição granular ainda não sincronizada.";
  repository.saveProject(granular);
  await repository.flush();
  assert.deepEqual(
    (await repository.store.listPendingOutbox()).map((row) => row.entityType),
    ["blocks"]
  );

  const replacement = structuredClone(granular);
  cardAt(replacement).text = "Versão final do replace composto.";
  repository.replaceMicrosequenceCards(replacement, "micro-a");
  await repository.flush();

  const pending = await repository.store.listPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, "microsequenceCardReplacement");
  const currentBlock = pending[0].payload.fragment.blocks.find(
    (row) => row.region === "primary"
  );
  const previousBlock = pending[0].payload.previousFragment.blocks.find(
    (row) => row.id === currentBlock.id
  );
  assert.equal(currentBlock.value, "Versão final do replace composto.");
  assert.equal(previousBlock.value, "Texto de card-a.");
});

test("replace usa a revisão exclusiva de cards e não conflita com metadados pendentes", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  context.after(() => repository.store.close());
  const project = buildProject();
  repository.saveProject(project);
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const microsequence = (await repository.store.getAll("microsequences"))
    .find((row) => row.contractKey === "micro-a");
  await repository.store.put("microsequences", {
    ...microsequence,
    revision: 11,
    cardsRevision: 7
  });
  await repository.refreshFromReplica();

  const metadataEdit = repository.loadProject();
  metadataEdit.courses[0].modules[0].lessons[0].microsequences[0].title = "Metadado pendente";
  repository.saveProject(metadataEdit);
  await repository.flush();
  const cardEdit = structuredClone(metadataEdit);
  cardAt(cardEdit).text = "Cards substituídos depois do metadado.";
  repository.replaceMicrosequenceCards(cardEdit, "micro-a");
  await repository.flush();

  const pending = await repository.store.listPendingOutbox();
  assert.deepEqual(pending.map((row) => row.entityType), [
    "microsequences",
    "microsequenceCardReplacement"
  ]);
  assert.equal(pending[1].baseRevision, 7);
});

test("renomes e reordenação reconciliam chaves de progresso sem mover comentários", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a",
    clock: () => new Date("2026-07-18T21:00:00.000Z")
  });
  context.after(() => repository.store.close());
  const project = buildProject();
  repository.saveProject(project);
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const originalReference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cardKey: "card-a"
  };
  await repository.recordCardAttempt(originalReference, "correct");
  const comment = await repository.saveCommentForPath(originalReference, "Preservar por UUID.");
  await repository.flush();
  const originalCardId = repository.resolveCardReference(originalReference).cardId;
  const originalProgress = repository.loadCardProgress(originalCardId);
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  let renamed = structuredClone(project);
  renamed.courses[0].id = "course-renamed";
  repository.saveProject(renamed);
  await repository.flush();
  renamed = structuredClone(renamed);
  renamed.courses[0].modules[0].id = "module-renamed";
  repository.saveProject(renamed);
  await repository.flush();
  renamed = structuredClone(renamed);
  renamed.courses[0].modules[0].lessons[0].id = "lesson-renamed";
  repository.saveProject(renamed);
  await repository.flush();
  renamed = structuredClone(renamed);
  renamed.courses[0].modules[0].lessons[0].microsequences[0].cards[0].id = "card-renamed";
  repository.saveProject(renamed);
  await repository.flush();
  renamed = structuredClone(renamed);
  renamed.courses[0].modules[0].lessons[0].microsequences.reverse();
  repository.saveProject(renamed);
  await repository.flush();

  const renamedReference = {
    courseKey: "course-renamed",
    moduleKey: "module-renamed",
    lessonKey: "lesson-renamed",
    microsequenceKey: "micro-a",
    cardKey: "card-renamed"
  };
  assert.equal(repository.resolveCardReference(renamedReference).cardId, originalCardId);
  const reconciledCard = repository.loadCardProgress(originalCardId);
  const reconciledLesson = repository.loadLessonProgress(reconciledCard.lessonId);
  assert.equal(reconciledCard.id, originalProgress.id);
  assert.equal(reconciledCard.cardKey, "card-renamed");
  assert.equal(reconciledCard.pathKey, "course-renamed::module-renamed::lesson-renamed");
  assert.equal(reconciledCard.position, 1);
  assert.equal(reconciledLesson.courseKey, "course-renamed");
  assert.equal(reconciledLesson.moduleKey, "module-renamed");
  assert.equal(reconciledLesson.lessonKey, "lesson-renamed");
  assert.equal(repository.loadCommentForPath(renamedReference).id, comment.id);
  assert.equal((await repository.store.get("comments", comment.id)).revision, comment.revision);
  assert.equal(repository.loadProgress().lessons[reconciledCard.pathKey].completedCardKeys[0], "card-renamed");
});

test("documento inválido falha antes da transação e conserva estado anterior", async (context) => {
  const repository = await RelationalProjectRepository.open({ indexedDb: new IDBFactory() });
  context.after(() => repository.store.close());
  const project = buildProject();
  repository.saveProject(project);
  await repository.flush();
  const beforeRows = await repository.store.readStores();
  const invalid = structuredClone(project);
  invalid.courses[0].title = "";

  assert.throws(() => repository.saveProject(invalid), /Documento AraLearn v3 inválido/u);
  await repository.flush();
  assert.deepEqual(repository.loadProject(), project);
  assert.deepEqual(await repository.store.readStores(), beforeRows);
});

test("repositório preserva coordenadas e variantes de flow sem normalização destrutiva", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  context.after(() => repository.store.close());
  const project = buildProject();
  const cards = project.courses[0].modules[0].lessons[0].microsequences.map(
    (microsequence) => microsequence.cards[0]
  );
  Object.assign(cards[0], {
    resource: "graph",
    kind: "theory",
    exercise: "none",
    prompt: "Observe as posições.",
    vertices: [
      { id: "a", label: "A", x: 10, y: 20 },
      { id: "b", label: "B", x: 30, y: 40 }
    ],
    edges: [{ from: "a", to: "b" }]
  });
  delete cards[0].text;
  Object.assign(cards[1], {
    resource: "flow",
    kind: "theory",
    exercise: "none",
    prompt: "Observe o fluxo.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [
        {
          id: "loop",
          kind: "for",
          iterator: "item",
          iterable: "itens",
          init: "",
          condition: "há item",
          update: "",
          body: []
        },
        {
          id: "chain",
          kind: "if_chain",
          cases: [],
          branches: [{
            id: "positive",
            condition: "item válido",
            items: [{ id: "emit", kind: "output", text: "Emitir" }]
          }],
          elseBranch: []
        }
      ]
    }
  });
  delete cards[1].text;

  repository.saveProject(project);
  await repository.flush();
  const reopenedCards = repository.loadProject().courses[0].modules[0].lessons[0].microsequences.map(
    (microsequence) => microsequence.cards[0]
  );
  assert.deepEqual(reopenedCards[0].vertices, cards[0].vertices);
  assert.equal(reopenedCards[1].structure.items[0].iterator, "item");
  assert.equal(reopenedCards[1].structure.items[0].iterable, "itens");
  assert.deepEqual(reopenedCards[1].structure.items[1].branches, cards[1].structure.items[1].branches);
});

test("substituição de cards rejeita alteração externa ao escopo sem perda silenciosa", async (context) => {
  const repository = await RelationalProjectRepository.open({ indexedDb: new IDBFactory() });
  context.after(() => repository.store.close());
  const previous = buildProject();
  repository.saveProject(previous);
  await repository.flush();
  const changed = replaceMicrosequenceCards(previous, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cards: [paragraphCard("card-new", "Conteúdo substituto.")]
  });
  changed.courses[0].title = "Mudança fora do escopo";

  assert.throws(
    () => repository.replaceMicrosequenceCards(changed, "micro-a"),
    /fora da microssequência/u
  );
  await repository.flush();
  assert.equal(repository.loadProject().courses[0].title, previous.courses[0].title);
  assert.equal(cardAt(repository.loadProject()).id, "card-a");
});

test("conflito de revisão preserva as duas versões sem sobrescrever a linha", async (context) => {
  const repository = await RelationalProjectRepository.open({ indexedDb: new IDBFactory() });
  context.after(() => repository.store.close());
  repository.saveProject(buildProject());
  await repository.flush();
  const block = (await repository.store.getAll("blocks"))[0];
  const mutationService = new DomainMutationService({ store: repository.store });

  const result = await mutationService.applyMutations(
    [{
      storeName: "blocks",
      entityType: "blocks",
      entityId: block.id,
      courseId: block.courseId,
      operation: "upsert",
      baseRevision: block.revision - 1,
      previousRow: block,
      nextRow: { ...block, value: "versão local divergente" },
      changedFields: ["value"]
    }],
    { enforceRevision: true }
  );

  assert.equal(result.appliedRows.length, 0);
  assert.equal(result.outboxEntries.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.equal((await repository.store.get("blocks", block.id)).value, block.value);
  const conflict = (await repository.store.getAll("conflicts"))[0];
  assert.equal(conflict.localRow.value, "versão local divergente");
  assert.equal(conflict.remoteRow.value, block.value);
});

test("comentários são linhas por card e usuário resolvidas a partir do caminho público", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  context.after(() => repository.store.close());
  repository.saveProject(buildProject());
  await repository.flush();
  const reference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-b",
    cardKey: "card-b"
  };
  const resolved = repository.resolveCardReference(reference);
  assert.ok(resolved.cardId);

  const saved = await repository.saveCommentForPath(reference, "Minha observação.");
  assert.equal(saved.cardId, resolved.cardId);
  assert.equal(repository.loadCommentForPath(reference).body, "Minha observação.");
  assert.equal(repository.loadComments({ cardId: resolved.cardId }).length, 1);

  const tombstone = await repository.saveCommentForPath(reference, "   ");
  assert.ok(tombstone.deletedAt);
  assert.equal(repository.loadCommentForPath(reference), null);
  assert.equal(repository.loadComments({ cardId: resolved.cardId, includeDeleted: true }).length, 1);
});

test("visualização e tentativas são granulares e não concluem o card antecipadamente", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a",
    clock: () => new Date("2026-07-18T15:00:00.000Z")
  });
  context.after(() => repository.store.close());
  repository.saveProject(buildProject());
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const reference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cardKey: "card-a"
  };

  await repository.recordCardView(reference);
  await repository.flush();
  let cardRow = repository.loadCardProgress(
    repository.resolveCardReference(reference).cardId
  );
  assert.equal(cardRow.firstViewedAt, "2026-07-18T15:00:00.000Z");
  assert.equal(cardRow.completedAt, null);
  assert.equal(cardRow.attempts, 0);

  await repository.recordCardAttempt(reference, "wrong");
  await repository.flush();
  cardRow = repository.loadCardProgress(repository.resolveCardReference(reference).cardId);
  assert.equal(cardRow.completedAt, null);
  assert.equal(cardRow.attempts, 1);
  assert.equal(cardRow.lastResult, "wrong");

  await repository.recordCardAttempt(reference, "correct");
  await repository.flush();
  cardRow = repository.loadCardProgress(repository.resolveCardReference(reference).cardId);
  assert.equal(cardRow.completedAt, "2026-07-18T15:00:00.000Z");
  assert.equal(cardRow.attempts, 2);
  assert.equal(cardRow.lastResult, "correct");
  let lessonRow = repository.loadLessonProgress(repository.resolveCardReference(reference).lessonId);
  assert.equal(lessonRow.cursor, 0);
  assert.equal(lessonRow.completedAt, null);

  const secondReference = {
    ...reference,
    microsequenceKey: "micro-b",
    cardKey: "card-b"
  };
  await repository.recordCardAttempt(secondReference, "correct");
  await repository.flush();
  lessonRow = repository.loadLessonProgress(repository.resolveCardReference(secondReference).lessonId);
  assert.equal(lessonRow.cursor, 1);
  assert.equal(lessonRow.completedAt, "2026-07-18T15:00:00.000Z");
});

test("salvar conclusões preserva progresso relacional de cards apenas visualizados", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a",
    clock: () => new Date("2026-07-18T15:30:00.000Z")
  });
  context.after(() => repository.store.close());
  repository.saveProject(buildProject());
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  const viewedReference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-b",
    cardKey: "card-b"
  };
  await repository.recordCardView(viewedReference);
  await repository.flush();
  const viewedCardId = repository.resolveCardReference(viewedReference).cardId;
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  repository.saveProgress({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": {
        cursor: 0,
        completedCardKeys: ["card-a"],
        updatedAt: "2026-07-18T15:30:00.000Z"
      }
    }
  });
  await repository.flush();

  const viewedRow = repository.loadCardProgress(viewedCardId);
  assert.equal(viewedRow.deletedAt, null);
  assert.equal(viewedRow.completedAt, null);
  assert.equal(viewedRow.firstViewedAt, "2026-07-18T15:30:00.000Z");
  assert.equal(
    (await repository.store.getAll("outbox")).some(
      (row) => row.entityId === viewedRow.id && row.operation === "delete"
    ),
    false
  );
});

test("salvar outra lição preserva atividade não representável e reset explícito remove só o alvo", async (context) => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a",
    clock: () => new Date("2026-07-18T15:45:00.000Z")
  });
  context.after(() => repository.store.close());
  repository.saveProject(buildProjectWithSecondLesson());
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const secondLessonReference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-b",
    microsequenceKey: "micro-c",
    cardKey: "card-c"
  };
  await repository.recordCardAttempt(secondLessonReference, "wrong");
  await repository.flush();
  const secondCardId = repository.resolveCardReference(secondLessonReference).cardId;
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );

  repository.saveProgress({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": {
        cursor: 0,
        completedCardKeys: ["card-a"],
        updatedAt: "2026-07-18T15:45:00.000Z"
      }
    }
  });
  await repository.flush();

  const secondProgressRow = repository.loadCardProgress(secondCardId);
  assert.equal(secondProgressRow.attempts, 1);
  assert.equal(secondProgressRow.completedAt, null);
  assert.equal(
    (await repository.store.getAll("outbox")).some(
      (row) => row.entityId === secondProgressRow.id && row.operation === "delete"
    ),
    false
  );

  repository.removeProgressEntries([{
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-b"
  }]);
  await repository.flush();
  assert.equal(repository.loadCardProgress(secondCardId), null);
  assert.equal(
    (await repository.store.getAll("outbox")).some(
      (row) => row.entityId === secondProgressRow.id && row.operation === "delete"
    ),
    true
  );
  assert.deepEqual(repository.loadProgress().lessons["course-a::module-a::lesson-a"].completedCardKeys, ["card-a"]);
});

test("montagem reabre projeto e progresso a partir das linhas, sem documento persistido", async () => {
  const indexedDb = new IDBFactory();
  const first = await RelationalProjectRepository.open({ indexedDb, userId: "user-a" });
  const project = buildProject();
  first.saveProject(project);
  first.saveProgress({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": {
        cursor: 0,
        completedCardKeys: ["card-a"],
        updatedAt: "2026-07-18T13:00:00.000Z"
      }
    }
  });
  await first.flush();
  first.store.close();

  const reopened = await RelationalProjectRepository.open({ indexedDb, userId: "user-a" });
  assert.deepEqual(reopened.loadProject(), project);
  assert.deepEqual(
    reopened.loadProgress().lessons["course-a::module-a::lesson-a"].completedCardKeys,
    ["card-a"]
  );
  const projectMeta = (await reopened.store.getAll("projectMeta"))[0];
  assert.equal(Object.prototype.hasOwnProperty.call(projectMeta, "project"), false);
  reopened.store.close();
});

test("reload após refresh prefere a identidade ativa ao tombstone de mesma origem", async () => {
  const indexedDb = new IDBFactory();
  const first = await RelationalProjectRepository.open({ indexedDb, userId: "user-a" });
  const project = buildProject();
  first.saveProject(project);
  await first.flush();
  await first.store.acknowledgeOutbox(
    (await first.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const activeBlock = (await first.store.getAll("blocks")).find(
    (row) => row.deletedAt == null && row.identityKey.endsWith("/card:card-a/block:primary")
  );
  await first.store.put("blocks", {
    ...activeBlock,
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    deletedAt: "2026-07-18T16:00:00.000Z"
  });
  first.store.close();

  const reopened = await RelationalProjectRepository.open({ indexedDb, userId: "user-a" });
  assert.equal(reopened.identityMap.get(activeBlock.identityKey), activeBlock.id);
  const edited = structuredClone(reopened.loadProject());
  edited.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Edição após refresh.";
  reopened.saveProject(edited);
  await reopened.flush();
  const pending = await reopened.store.getAll("outbox");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, "blocks");
  assert.equal(pending[0].entityId, activeBlock.id);
  reopened.store.close();
});

test("refresh da réplica incorpora a revisão canônica sem recarregar o domínio", async () => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  repository.saveProject(buildProject());
  await repository.flush();
  await repository.store.acknowledgeOutbox(
    (await repository.store.getAll("outbox")).map((row) => row.mutationId)
  );
  const block = (await repository.store.getAll("blocks")).find(
    (row) => row.deletedAt == null && row.identityKey.endsWith("/card:card-a/block:primary")
  );
  await repository.store.put("blocks", {
    ...block,
    revision: 9,
    updatedAt: "2026-07-18T17:00:00.000Z"
  });

  const refreshed = await repository.refreshFromReplica();
  assert.equal(refreshed.documentChanged, false);

  const edited = structuredClone(repository.loadProject());
  edited.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text =
    "Texto sincronizado novamente.";
  repository.saveProject(edited);
  await repository.flush();
  const pending = await repository.store.listPendingOutbox();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].entityType, "blocks");
  assert.equal(pending[0].baseRevision, 9);
  repository.store.close();
});

test("tombstone de membership oculta curso compartilhado e nova associação o restaura", async () => {
  const repository = await RelationalProjectRepository.open({
    indexedDb: new IDBFactory(),
    userId: "user-a"
  });
  repository.saveProject(buildProject());
  await repository.flush();
  const course = (await repository.store.getAll("courses"))[0];
  await repository.store.put("memberships", {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    courseId: course.id,
    userId: "user-a",
    role: "learner",
    position: 0,
    revision: 2,
    updatedAt: "2026-07-18T18:00:00.000Z",
    deletedAt: "2026-07-18T18:00:00.000Z"
  });

  let refreshed = await repository.refreshFromReplica();
  assert.equal(refreshed.project.courses.length, 0);

  await repository.store.put("memberships", {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    courseId: course.id,
    userId: "user-a",
    role: "learner",
    position: 0,
    revision: 1,
    updatedAt: "2026-07-18T18:01:00.000Z",
    deletedAt: null
  });
  refreshed = await repository.refreshFromReplica();
  assert.equal(refreshed.project.courses.length, 1);
  repository.store.close();
});
