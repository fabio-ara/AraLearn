import {
  createCardInMicrosequence,
  createCourse,
  deleteCardInMicrosequence,
  createLesson,
  createMicrosequence,
  createModule,
  moveCardWithinMicrosequence,
  moveLesson,
  moveMicrosequence,
  moveModule,
  replaceMicrosequenceCards,
  updateCardInMicrosequence,
  updateCourse,
  updateLesson,
  updateMicrosequence,
  updateModule
} from "../../editor/contractEditor.js";
import { validateCourseForgePatch } from "./courseForgePatch.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sortOrderOperations(operations = []) {
  const weights = {
    add_course: 1,
    update_course: 2,
    add_module: 3,
    update_module: 4,
    add_lesson: 5,
    update_lesson: 6,
    add_microsequence: 7,
    update_microsequence: 8,
    add_card: 9,
    update_card: 10,
    delete_card: 11,
    reorder_children: 12,
    mark_status: 13,
    replace_microsequence_cards: 98
  };
  return operations.slice().sort((a, b) => (weights[a.op] || 99) - (weights[b.op] || 99));
}

export function applyCourseForgePatch(document, patch, options = {}) {
  const validation = validateCourseForgePatch(patch, options);
  if (!validation.ok) {
    throw new Error(`Patch inválido: ${validation.errors.join(" ")}`);
  }

  let nextDocument = structuredClone(document);
  const operations = sortOrderOperations(validation.patch.operations);

  operations.forEach((operation) => {
    if (operation.op === "add_course") {
      nextDocument = createCourse(nextDocument, operation.course || {});
      return;
    }
    if (operation.op === "update_course") {
      nextDocument = updateCourse(nextDocument, { courseKey: operation.courseKey, ...(operation.course || {}) });
      return;
    }
    if (operation.op === "add_module") {
      nextDocument = createModule(nextDocument, { courseKey: operation.courseKey, ...(operation.module || {}) });
      return;
    }
    if (operation.op === "update_module") {
      nextDocument = updateModule(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        ...(operation.module || {})
      });
      return;
    }
    if (operation.op === "add_lesson") {
      nextDocument = createLesson(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        ...(operation.lesson || {})
      });
      return;
    }
    if (operation.op === "update_lesson") {
      nextDocument = updateLesson(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        ...(operation.lesson || {})
      });
      return;
    }
    if (operation.op === "add_microsequence") {
      nextDocument = createMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        ...(operation.microsequence || {})
      });
      return;
    }
    if (operation.op === "update_microsequence") {
      nextDocument = updateMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        ...(operation.microsequence || {})
      });
      return;
    }
    if (operation.op === "add_card") {
      nextDocument = createCardInMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        ...(operation.card || {})
      });
      return;
    }
    if (operation.op === "update_card") {
      nextDocument = updateCardInMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        cardKey: operation.cardKey,
        ...(operation.card || {})
      });
      return;
    }
    if (operation.op === "delete_card") {
      nextDocument = deleteCardInMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        cardKey: operation.cardKey
      });
      return;
    }
    if (operation.op === "mark_status") {
      nextDocument = updateMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        status: text(operation.status),
        included: operation.included
      });
      return;
    }
    if (operation.op === "reorder_children") {
      const childType = text(operation.childType);
      const order = Array.isArray(operation.order) ? operation.order : [];
      order.forEach((childKey, index) => {
        if (childType === "module") {
          nextDocument = moveModule(nextDocument, { courseKey: operation.courseKey, moduleKey: childKey, toIndex: index });
        } else if (childType === "lesson") {
          nextDocument = moveLesson(nextDocument, {
            courseKey: operation.courseKey,
            moduleKey: operation.moduleKey,
            lessonKey: childKey,
            toIndex: index
          });
        } else if (childType === "microsequence") {
          nextDocument = moveMicrosequence(nextDocument, {
            courseKey: operation.courseKey,
            moduleKey: operation.moduleKey,
            lessonKey: operation.lessonKey,
            microsequenceKey: childKey,
            targetCourseKey: operation.courseKey,
            targetModuleKey: operation.moduleKey,
            targetLessonKey: operation.lessonKey,
            targetPosition: index
          });
        } else if (childType === "card") {
          nextDocument = moveCardWithinMicrosequence(nextDocument, {
            courseKey: operation.courseKey,
            moduleKey: operation.moduleKey,
            lessonKey: operation.lessonKey,
            microsequenceKey: operation.microsequenceKey,
            cardKey: childKey,
            toIndex: index
          });
        }
      });
      return;
    }
    if (operation.op === "replace_microsequence_cards") {
      nextDocument = replaceMicrosequenceCards(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequenceKey,
        ...(operation.microsequence || {})
      });
    }
  });

  return nextDocument;
}
