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

function findLessonMicrosequenceIndex(document, { courseKey = "", moduleKey = "", lessonKey = "", microsequenceKey = "" } = {}) {
  const course = (Array.isArray(document?.courses) ? document.courses : []).find((entry) => text(entry?.key) === text(courseKey));
  const moduleValue = (Array.isArray(course?.modules) ? course.modules : []).find((entry) => text(entry?.key) === text(moduleKey));
  const lesson = (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).find((entry) => text(entry?.key) === text(lessonKey));
  return (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).findIndex((entry) => text(entry?.key) === text(microsequenceKey));
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
    insert_microsequence_after: 8,
    insert_explanatory_bridge_after: 8,
    insert_contrast_example_after: 8,
    insert_practice_bridge_after: 8,
    update_microsequence: 9,
    add_card: 10,
    update_card: 11,
    delete_card: 12,
    reorder_children: 13,
    mark_status: 14,
    replace_microsequence_cards: 98
    ,
    replace_microsequence_with_contrast: 98,
    replace_microsequence_with_guided_practice: 98
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
    if (["insert_microsequence_after", "insert_explanatory_bridge_after", "insert_contrast_example_after", "insert_practice_bridge_after"].includes(operation.op)) {
      nextDocument = createMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        ...(operation.microsequence || {})
      });
      const anchorIndex = findLessonMicrosequenceIndex(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.anchorMicrosequenceKey
      });
      nextDocument = moveMicrosequence(nextDocument, {
        courseKey: operation.courseKey,
        moduleKey: operation.moduleKey,
        lessonKey: operation.lessonKey,
        microsequenceKey: operation.microsequence?.key,
        targetCourseKey: operation.courseKey,
        targetModuleKey: operation.moduleKey,
        targetLessonKey: operation.lessonKey,
        targetPosition: anchorIndex >= 0 ? anchorIndex + 1 : undefined
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
    if (["replace_microsequence_cards", "replace_microsequence_with_contrast", "replace_microsequence_with_guided_practice"].includes(operation.op)) {
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
