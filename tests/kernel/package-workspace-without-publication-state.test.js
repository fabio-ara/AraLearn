import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attachWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  splitWorkspaceMicrosequence
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

async function fixture() {
  return JSON.parse(await readFile(
    new URL("../fixtures/package/project-visual.json", import.meta.url),
    "utf8"
  ));
}

function selection(document) {
  const course = document.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  return {
    lesson,
    microsequence,
    lessonPath: [course.id, moduleValue.id, lesson.id],
    microsequencePath: [course.id, moduleValue.id, lesson.id, microsequence.id]
  };
}

function assertNoPublicationState(document) {
  document.courses.forEach((course) => course.modules.forEach((moduleValue) =>
    moduleValue.lessons.forEach((lesson) => lesson.microsequences.forEach((microsequence) => {
      assert.equal(Object.hasOwn(microsequence, "status"), false);
      assert.equal(Object.hasOwn(microsequence, "published"), false);
    }))
  ));
}

test("anexar, juntar e dividir não inventam estado de publicação", async () => {
  const original = await fixture();
  const { lesson, microsequence, lessonPath, microsequencePath } = selection(original);
  const extra = structuredClone(microsequence);
  extra.id = "micro-extra";
  extra.title = "Complemento";
  extra.dependsOn = [microsequence.id];
  extra.cards = extra.cards.map((card, index) => ({
    ...card,
    id: `card-extra-${index + 1}`,
    position: index + 1
  }));
  const attached = attachWorkspaceEntity(original, {
    entityType: "microsequence",
    parentPath: lessonPath,
    entity: extra
  });
  const merged = mergeWorkspaceMicrosequences(attached, {
    targetPath: microsequencePath,
    sourcePaths: [[...lessonPath, extra.id]]
  });
  const mergedMicrosequence = selection(merged).microsequence;
  const selectedCardIds = mergedMicrosequence.cards.slice(-2).map(({ id }) => id);
  const divided = splitWorkspaceMicrosequence(merged, {
    sourcePath: microsequencePath,
    newMicrosequence: {
      ...structuredClone(lesson.microsequences[0]),
      id: "micro-dividida",
      title: "Parte dividida",
      cards: []
    },
    cardIds: selectedCardIds
  });

  assertNoPublicationState(attached);
  assertNoPublicationState(merged);
  assertNoPublicationState(divided);
});
