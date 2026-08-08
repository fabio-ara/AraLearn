import assert from "node:assert/strict";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  replaceMicrosequenceCards
} from "../../src/editor/contractEditor.js";
import { ProjectDocumentDiffer } from "../../src/persistence/ProjectDocumentDiffer.js";
import {
  minimalProjectFixture,
  openSelectedCourseRepository
} from "./helpers/leanRelationalFixture.js";

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
  for (const [microsequenceKey, cardKey] of [
    ["micro-a", "card-a"],
    ["micro-b", "card-b"]
  ]) {
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

function cardAt(project, microsequenceIndex = 0) {
  return project.courses[0].modules[0].lessons[0]
    .microsequences[microsequenceIndex].cards[0];
}

test("alterar um texto gera somente uma mutação granular do bloco", () => {
  const previous = buildProject();
  const next = structuredClone(previous);
  cardAt(next).text = "Texto alterado sem regravar o card.";

  const result = new ProjectDocumentDiffer().diff(previous, next);

  assert.equal(result.mutations.length, 1);
  assert.equal(result.mutations[0].storeName, "blocks");
  assert.equal(result.mutations[0].operation, "upsert");
  assert.deepEqual(result.mutations[0].changedFields, ["value"]);
});

test("renomear a chave pública de um card preserva sua identidade e filhos", () => {
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
});

test("substituição escopada alcança somente a microssequência alvo", () => {
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

  assert.deepEqual(
    new Set(result.mutations.map((mutation) => mutation.storeName)),
    new Set(["cards", "blocks"])
  );
  result.mutations.forEach((mutation) => {
    const identityKey = mutation.previousRow?.identityKey || mutation.nextRow?.identityKey;
    assert.match(identityKey, /\/micro:micro-a\//u);
    assert.doesNotMatch(identityKey, /\/micro:micro-b\//u);
  });
});

test("repositório monta somente cursos oficiais selecionados", async (context) => {
  const { repository, store, selection } = await openSelectedCourseRepository(
    new IDBFactory()
  );
  context.after(() => store.close());

  assert.deepEqual(repository.loadProject(), minimalProjectFixture);
  await store.delete("courseSelections", selection.id);
  assert.equal((await repository.refreshFromReplica()).documentChanged, true);
  assert.deepEqual(repository.loadProject(), createEmptyProjectDocument());

  await store.put("courseSelections", selection);
  assert.equal((await repository.refreshFromReplica()).documentChanged, true);
  assert.deepEqual(repository.loadProject(), minimalProjectFixture);
});
